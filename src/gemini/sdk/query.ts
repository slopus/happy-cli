/**
 * Main query implementation for Gemini CLI SDK
 * Handles spawning Gemini process and managing message streams
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Stream } from './stream';
import {
    type GeminiQueryOptions,
    type GeminiQueryPrompt,
    type GeminiSDKMessage,
    type GeminiControlRequest,
    type GeminiControlResponse,
    type GeminiCanCallToolCallback,
    type GeminiPermissionResult,
    GeminiAbortError
} from '../types';
import { getDefaultGeminiPath, getCleanEnv, logDebug, streamToStdin, getPermissionArgs } from './utils';
import type { Writable } from 'node:stream';
import { logger } from '@/ui/logger';

/**
 * Query class manages Gemini CLI process interaction
 */
export class GeminiQuery implements AsyncIterableIterator<GeminiSDKMessage> {
    private pendingControlResponses = new Map<string, (response: any) => void>();
    private cancelControllers = new Map<string, AbortController>();
    private sdkMessages: AsyncIterableIterator<GeminiSDKMessage>;
    private inputStream = new Stream<GeminiSDKMessage>();
    private canCallTool?: GeminiCanCallToolCallback;

    constructor(
        private childStdin: Writable | null,
        private childStdout: NodeJS.ReadableStream,
        private processExitPromise: Promise<void>,
        canCallTool?: GeminiCanCallToolCallback
    ) {
        this.canCallTool = canCallTool;
        this.readMessages();
        this.sdkMessages = this.readSdkMessages();
    }

    /**
     * Set an error on the stream
     */
    setError(error: Error): void {
        this.inputStream.error(error);
    }

    /**
     * AsyncIterableIterator implementation
     */
    next(...args: [] | [undefined]): Promise<IteratorResult<GeminiSDKMessage>> {
        return this.sdkMessages.next(...args);
    }

    return(value?: any): Promise<IteratorResult<GeminiSDKMessage>> {
        if (this.sdkMessages.return) {
            return this.sdkMessages.return(value);
        }
        return Promise.resolve({ done: true, value: undefined });
    }

    throw(e: any): Promise<IteratorResult<GeminiSDKMessage>> {
        if (this.sdkMessages.throw) {
            return this.sdkMessages.throw(e);
        }
        return Promise.reject(e);
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<GeminiSDKMessage> {
        return this.sdkMessages;
    }

    /**
     * Read messages from Gemini process stdout
     */
    private async readMessages(): Promise<void> {
        const rl = createInterface({ input: this.childStdout });

        try {
            for await (const line of rl) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line);

                        // Handle control responses
                        if (message.type === 'control_response') {
                            const handler = this.pendingControlResponses.get(message.response?.request_id);
                            if (handler) {
                                handler(message.response);
                            }
                            continue;
                        }

                        // Handle control requests (permission prompts)
                        if (message.type === 'control_request' || message.type === 'approval_request') {
                            await this.handleControlRequest(message);
                            continue;
                        }

                        // Handle control cancel requests
                        if (message.type === 'control_cancel_request') {
                            this.handleControlCancelRequest(message);
                            continue;
                        }

                        // Enqueue regular messages
                        this.inputStream.enqueue(message as GeminiSDKMessage);
                    } catch (e) {
                        // Log unparseable lines for debugging
                        logger.debug('[gemini] Unparseable line:', line);
                    }
                }
            }
            await this.processExitPromise;
        } catch (error) {
            this.inputStream.error(error as Error);
        } finally {
            this.inputStream.done();
            this.cleanupControllers();
            rl.close();
        }
    }

    /**
     * Async generator for SDK messages
     */
    private async *readSdkMessages(): AsyncIterableIterator<GeminiSDKMessage> {
        for await (const message of this.inputStream) {
            yield message;
        }
    }

    /**
     * Send interrupt request to Gemini
     */
    async interrupt(): Promise<void> {
        if (!this.childStdin) {
            throw new Error('Interrupt requires stream-json input format');
        }

        const interruptRequest = {
            type: 'control_request',
            request: { subtype: 'interrupt' }
        };
        this.childStdin.write(JSON.stringify(interruptRequest) + '\n');
    }

    /**
     * Handle incoming control requests for tool permissions
     */
    private async handleControlRequest(request: GeminiControlRequest | any): Promise<void> {
        if (!this.childStdin) {
            logDebug('Cannot handle control request - no stdin available');
            return;
        }

        const requestId = request.request_id || request.request?.request_id;
        if (!requestId) {
            logDebug('Control request missing request_id');
            return;
        }

        const controller = new AbortController();
        this.cancelControllers.set(requestId, controller);

        try {
            let response: GeminiPermissionResult;

            if (this.canCallTool) {
                const toolName = request.tool_name || request.request?.tool_name;
                const input = request.arguments || request.request?.input || {};
                response = await this.canCallTool(toolName, input, { signal: controller.signal });
            } else {
                // Default: allow
                response = { behavior: 'allow' };
            }

            const controlResponse: GeminiControlResponse = {
                type: 'control_response',
                response: {
                    subtype: 'success',
                    request_id: requestId,
                    response
                }
            };
            this.childStdin.write(JSON.stringify(controlResponse) + '\n');
        } catch (error) {
            const controlErrorResponse: GeminiControlResponse = {
                type: 'control_response',
                response: {
                    subtype: 'error',
                    request_id: requestId,
                    error: error instanceof Error ? error.message : String(error)
                }
            };
            this.childStdin.write(JSON.stringify(controlErrorResponse) + '\n');
        } finally {
            this.cancelControllers.delete(requestId);
        }
    }

    /**
     * Handle control cancel requests
     */
    private handleControlCancelRequest(request: any): void {
        const requestId = request.request_id;
        const controller = this.cancelControllers.get(requestId);
        if (controller) {
            controller.abort();
            this.cancelControllers.delete(requestId);
        }
    }

    /**
     * Cleanup method to abort all pending control requests
     */
    private cleanupControllers(): void {
        for (const [requestId, controller] of this.cancelControllers.entries()) {
            controller.abort();
            this.cancelControllers.delete(requestId);
        }
    }
}

/**
 * Main query function to interact with Gemini CLI
 */
export function geminiQuery(config: {
    prompt: GeminiQueryPrompt;
    options?: GeminiQueryOptions;
}): GeminiQuery {
    const {
        prompt,
        options: {
            cwd,
            model,
            systemPrompt,
            includeDirectories,
            abort,
            pathToGeminiExecutable = getDefaultGeminiPath(),
            canCallTool,
            sandbox,
            autoAccept
        } = {}
    } = config;

    // Build command arguments
    const args: string[] = ['--output-format', 'stream-json'];

    // Add model if specified
    if (model) {
        args.push('-m', model);
    }

    // Add system prompt if specified
    if (systemPrompt) {
        args.push('--system-prompt', systemPrompt);
    }

    // Add include directories
    if (includeDirectories && includeDirectories.length > 0) {
        args.push('--include-directories', includeDirectories.join(','));
    }

    // Add sandbox mode
    if (sandbox) {
        args.push('--sandbox', sandbox);
    }

    // Add auto-accept for safe tools
    if (autoAccept) {
        args.push('--auto-accept');
    }

    // Handle prompt input
    const isStreamingPrompt = typeof prompt !== 'string';

    if (typeof prompt === 'string') {
        args.push('-p', prompt.trim());
    } else {
        args.push('--input-format', 'stream-json');
    }

    // Determine spawn configuration
    const isCommandOnly = pathToGeminiExecutable === 'gemini';
    const spawnEnv = isCommandOnly ? getCleanEnv() : process.env;

    logDebug(`Spawning Gemini CLI: ${pathToGeminiExecutable} ${args.join(' ')}`);

    const child = spawn(pathToGeminiExecutable, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: abort,
        env: spawnEnv,
        shell: process.platform === 'win32'
    }) as ChildProcessWithoutNullStreams;

    // Handle stdin
    let childStdin: Writable | null = null;
    if (typeof prompt === 'string') {
        child.stdin.end();
    } else {
        streamToStdin(prompt, child.stdin, abort);
        childStdin = child.stdin;
    }

    // Handle stderr in debug mode
    if (process.env.DEBUG) {
        child.stderr.on('data', (data) => {
            logger.debug('[gemini] stderr:', data.toString());
        });
    }

    // Setup cleanup
    const cleanup = () => {
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    };

    abort?.addEventListener('abort', cleanup);
    process.on('exit', cleanup);

    // Handle process exit
    const processExitPromise = new Promise<void>((resolve) => {
        child.on('close', (code) => {
            if (abort?.aborted) {
                query.setError(new GeminiAbortError('Gemini CLI process aborted by user'));
            }
            if (code !== 0 && code !== null) {
                query.setError(new Error(`Gemini CLI process exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });

    // Create query instance
    const query = new GeminiQuery(childStdin, child.stdout, processExitPromise, canCallTool);

    // Handle process errors
    child.on('error', (error) => {
        if (abort?.aborted) {
            query.setError(new GeminiAbortError('Gemini CLI process aborted by user'));
        } else {
            query.setError(new Error(`Failed to spawn Gemini CLI process: ${error.message}`));
        }
    });

    // Cleanup on exit
    processExitPromise.finally(() => {
        cleanup();
        abort?.removeEventListener('abort', cleanup);
    });

    return query;
}
