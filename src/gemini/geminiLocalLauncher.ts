/**
 * Gemini Local Mode Launcher
 *
 * Orchestrates local mode: spawns Gemini CLI, monitors session via hooks,
 * and handles mode switching.
 *
 * Adapted from claudeLocalLauncher.ts for Gemini CLI.
 */

import { logger } from '@/ui/logger';
import { geminiLocal } from './geminiLocal';
import { GeminiSession } from './session';
import { Future } from '@/utils/future';
import { createGeminiSessionScanner } from './utils/sessionScanner';

export async function geminiLocalLauncher(session: GeminiSession, opts: {
    model?: string;
    approvalMode?: string;
    allowedTools?: string[];
}): Promise<'switch' | 'exit'> {
    logger.debug('[geminiLocalLauncher] Starting local launcher');

    // Create scanner if we have a transcript path
    let scanner: Awaited<ReturnType<typeof createGeminiSessionScanner>> | null = null;

    if (session.transcriptPath) {
        scanner = await createGeminiSessionScanner({
            transcriptPath: session.transcriptPath,
            onMessage: (message) => {
                // Forward messages to Happy server
                // TODO: Convert Gemini message format to Happy format
                logger.debug(`[geminiLocalLauncher] Received message:`, message);
                // session.client.sendGeminiSessionMessage(message);
            }
        });
    }

    // Register callbacks for when session/transcript are found via hook
    const scannerSessionCallback = (transcriptPath: string) => {
        logger.debug(`[geminiLocalLauncher] Transcript path callback: ${transcriptPath}`);
        if (scanner) {
            scanner.onNewSession(transcriptPath);
        }
    };

    if (!session.transcriptPath) {
        session.addTranscriptPathCallback(scannerSessionCallback);
    }

    // Handle abort
    let exitReason: 'switch' | 'exit' | null = null;
    const processAbortController = new AbortController();
    let exitFuture = new Future<void>();

    try {
        async function abort() {
            // Send abort signal
            if (!processAbortController.signal.aborted) {
                processAbortController.abort();
            }

            // Await full exit
            await exitFuture.promise;
        }

        async function doAbort() {
            logger.debug('[geminiLocal]: doAbort');

            // Switching to remote mode
            if (!exitReason) {
                exitReason = 'switch';
            }

            // Reset sent messages
            session.queue.reset();

            // Abort
            await abort();
        }

        async function doSwitch() {
            logger.debug('[geminiLocal]: doSwitch');

            // Switching to remote mode
            if (!exitReason) {
                exitReason = 'switch';
            }

            // Abort
            await abort();
        }

        // Register RPC handlers for mode switching
        session.client.rpcHandlerManager.registerHandler('abort', doAbort);
        session.client.rpcHandlerManager.registerHandler('switch', doSwitch);

        // When any message is received, switch to remote mode
        session.queue.setOnMessage((message: string, mode) => {
            doSwitch();
        });

        // If there are already messages in the queue, switch immediately
        if (session.queue.size() > 0) {
            logger.debug('[geminiLocal]: Messages in queue, switching to remote');
            return 'switch';
        }

        // Handle session start from hook
        const handleSessionStart = (sessionId: string) => {
            session.onSessionFound(sessionId);
        };

        // Run local mode
        while (true) {
            // If we already have an exit reason, return it
            if (exitReason) {
                return exitReason;
            }

            // Launch Gemini CLI
            logger.debug('[geminiLocal]: Launching Gemini CLI');
            try {
                await geminiLocal({
                    path: session.path,
                    sessionId: session.sessionId,
                    onSessionFound: handleSessionStart,
                    abort: processAbortController.signal,
                    model: opts.model,
                    approvalMode: opts.approvalMode,
                    allowedTools: opts.allowedTools,
                });

                // Normal exit
                if (!exitReason) {
                    exitReason = 'exit';
                    break;
                }
            } catch (e) {
                logger.debug('[geminiLocal]: Launch error', e);
                if (!exitReason) {
                    session.client.sendSessionEvent({
                        type: 'message',
                        message: 'Gemini process exited unexpectedly'
                    });
                    continue;
                } else {
                    break;
                }
            }
            logger.debug('[geminiLocal]: Launch done');
        }
    } finally {
        // Resolve future
        exitFuture.resolve(undefined);

        // Set handlers to no-op
        session.client.rpcHandlerManager.registerHandler('abort', async () => {});
        session.client.rpcHandlerManager.registerHandler('switch', async () => {});
        session.queue.setOnMessage(null);

        // Remove callbacks
        if (!session.transcriptPath) {
            session.removeTranscriptPathCallback(scannerSessionCallback);
        }

        // Cleanup scanner
        if (scanner) {
            await scanner.cleanup();
        }
    }

    // Return
    return exitReason || 'exit';
}
