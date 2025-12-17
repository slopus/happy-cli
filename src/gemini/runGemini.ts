/**
 * Main entry point for the Gemini command with remote control support
 * Adapted from runCodex.ts for Gemini CLI integration
 */

import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { join, resolve } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { AgentState, Metadata } from '@/api/types';
import packageJson from '../../package.json';
import { configuration } from '@/configuration';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { initialMachineMetadata } from '@/daemon/run';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { projectPath } from '@/projectPath';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { stopCaffeinate, startCaffeinate } from '@/utils/caffeinate';
import { delay } from '@/utils/time';

import { geminiQuery } from './sdk/query';
import { isGeminiInstalled } from './sdk/utils';
import type { GeminiEnhancedMode, GeminiPermissionMode, GeminiSDKMessage } from './types';

export interface GeminiStartOptions {
    credentials: Credentials;
    startedBy?: 'daemon' | 'terminal';
    model?: string;
    permissionMode?: GeminiPermissionMode;
}

/**
 * Main entry point for Gemini command
 */
export async function runGemini(opts: GeminiStartOptions): Promise<void> {
    // Check if Gemini CLI is installed
    const geminiInstalled = await isGeminiInstalled();
    if (!geminiInstalled) {
        console.error('❌ Gemini CLI is not installed.');
        console.error('');
        console.error('To install Gemini CLI, run:');
        console.error('  npm install -g @google/gemini-cli');
        console.error('');
        console.error('Then authenticate with your Google account:');
        console.error('  gemini');
        console.error('');
        process.exit(1);
    }

    //
    // Define session
    //

    const sessionTag = randomUUID();
    const api = await ApiClient.create(opts.credentials);

    logger.debug(`[gemini] Starting with options: startedBy=${opts.startedBy || 'terminal'}`);

    //
    // Machine setup
    //

    const settings = await readSettings();
    let machineId = settings?.machineId;
    if (!machineId) {
        console.error(`[START] No machine ID found in settings. Please run 'happy auth login' first.`);
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);
    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    //
    // Create session
    //

    let state: AgentState = {
        controlledByUser: false,
    };
    let metadata: Metadata = {
        path: process.cwd(),
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: machineId,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir: projectPath(),
        happyToolsDir: resolve(projectPath(), 'tools', 'unpacked'),
        startedFromDaemon: opts.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: opts.startedBy || 'terminal',
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: 'gemini' // Mark as Gemini session
    };
    const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
    const session = api.sessionSyncClient(response);

    // Report to daemon
    try {
        logger.debug(`[START] Reporting session ${response.id} to daemon`);
        const result = await notifyDaemonSessionStarted(response.id, metadata);
        if (result.error) {
            logger.debug(`[START] Failed to report to daemon:`, result.error);
        }
    } catch (error) {
        logger.debug('[START] Failed to report to daemon:', error);
    }

    // Message queue for remote messages
    const messageQueue = new MessageQueue2<GeminiEnhancedMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
    }));

    // Track current settings
    let currentPermissionMode: GeminiPermissionMode = opts.permissionMode || 'default';
    let currentModel: string | undefined = opts.model;

    // Handle incoming user messages from mobile app
    session.onUserMessage((message) => {
        // Update permission mode if provided
        if (message.meta?.permissionMode) {
            const validModes: GeminiPermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
            if (validModes.includes(message.meta.permissionMode as GeminiPermissionMode)) {
                currentPermissionMode = message.meta.permissionMode as GeminiPermissionMode;
                logger.debug(`[Gemini] Permission mode updated to: ${currentPermissionMode}`);
            }
        }

        // Update model if provided
        if (message.meta?.hasOwnProperty('model')) {
            currentModel = message.meta.model || undefined;
            logger.debug(`[Gemini] Model updated to: ${currentModel || 'default'}`);
        }

        const enhancedMode: GeminiEnhancedMode = {
            permissionMode: currentPermissionMode,
            model: currentModel,
        };
        messageQueue.push(message.content.text, enhancedMode);
    });

    // Keep-alive handling
    let thinking = false;
    session.keepAlive(thinking, 'remote');
    const keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
        try {
            api.push().sendToAllDevices(
                "Ready!",
                'Gemini is waiting for your command',
                { sessionId: session.sessionId }
            );
        } catch (pushError) {
            logger.debug('[Gemini] Failed to send ready push', pushError);
        }
    };

    //
    // Abort handling
    //

    let abortController = new AbortController();
    let shouldExit = false;

    async function handleAbort() {
        logger.debug('[Gemini] Abort requested');
        try {
            abortController.abort();
            messageQueue.reset();
        } catch (error) {
            logger.debug('[Gemini] Error during abort:', error);
        } finally {
            abortController = new AbortController();
        }
    }

    const handleKillSession = async () => {
        logger.debug('[Gemini] Kill session requested');
        await handleAbort();

        try {
            session.updateMetadata((currentMetadata) => ({
                ...currentMetadata,
                lifecycleState: 'archived',
                lifecycleStateSince: Date.now(),
                archivedBy: 'cli',
                archiveReason: 'User terminated'
            }));

            session.sendSessionDeath();
            await session.flush();
            await session.close();

            stopCaffeinate();
            happyServer.stop();

            logger.debug('[Gemini] Session termination complete');
            process.exit(0);
        } catch (error) {
            logger.debug('[Gemini] Error during termination:', error);
            process.exit(1);
        }
    };

    // Register handlers
    session.rpcHandlerManager.registerHandler('abort', handleAbort);
    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

    // Start Happy MCP server for tool integration
    const happyServer = await startHappyServer(session);
    logger.debug(`[Gemini] Happy MCP server started at ${happyServer.url}`);

    // Start caffeinate to prevent sleep
    startCaffeinate();

    // Console output
    console.log('');
    console.log('🤖 Gemini CLI is ready for remote control!');
    console.log('📱 Use your Happy mobile app to send commands.');
    console.log('');
    if (process.env.DEBUG) {
        console.log(`📝 Logs: ${logger.getLogPath()}`);
    }

    // Send initial ready event
    sendReady();

    //
    // Main loop
    //

    try {
        while (!shouldExit) {
            // Wait for messages from mobile app
            const waitSignal = abortController.signal;
            const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);

            if (!batch) {
                if (waitSignal.aborted && !shouldExit) {
                    logger.debug('[Gemini] Wait aborted while idle');
                    continue;
                }
                break;
            }

            const { message, mode } = batch;
            logger.debug(`[Gemini] Processing message: ${message.substring(0, 100)}...`);

            // Set thinking state
            thinking = true;
            session.keepAlive(thinking, 'remote');

            try {
                // Create Gemini query
                const query = geminiQuery({
                    prompt: message,
                    options: {
                        cwd: process.cwd(),
                        model: mode.model,
                        abort: abortController.signal,
                        autoAccept: mode.permissionMode === 'yolo' || mode.permissionMode === 'safe-yolo',
                        canCallTool: async (toolName, input, { signal }) => {
                            // Forward permission request to mobile app via session
                            logger.debug(`[Gemini] Permission request for tool: ${toolName}`);

                            // For now, auto-approve based on permission mode
                            // TODO: Implement proper permission forwarding to mobile app
                            if (mode.permissionMode === 'yolo') {
                                return { behavior: 'allow' };
                            }
                            if (mode.permissionMode === 'read-only') {
                                // Only allow read operations
                                const readOnlyTools = ['read_file', 'list_files', 'search', 'web_search'];
                                if (readOnlyTools.some(t => toolName.toLowerCase().includes(t))) {
                                    return { behavior: 'allow' };
                                }
                                return { behavior: 'deny', message: 'Read-only mode: write operations not allowed' };
                            }

                            // Default: allow
                            return { behavior: 'allow' };
                        }
                    }
                });

                // Process messages from Gemini
                for await (const msg of query) {
                    await processGeminiMessage(msg, session);
                }

            } catch (error) {
                const isAbortError = error instanceof Error && error.name === 'AbortError';
                if (isAbortError) {
                    session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                } else {
                    logger.warn('[Gemini] Error:', error);
                    session.sendSessionEvent({
                        type: 'message',
                        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                    });
                }
            } finally {
                thinking = false;
                session.keepAlive(thinking, 'remote');
                sendReady();
            }
        }

    } finally {
        // Cleanup
        logger.debug('[Gemini] Cleaning up...');
        clearInterval(keepAliveInterval);

        try {
            session.sendSessionDeath();
            await session.flush();
            await session.close();
        } catch (e) {
            logger.debug('[Gemini] Error closing session:', e);
        }

        happyServer.stop();
        stopCaffeinate();

        logger.debug('[Gemini] Cleanup complete');
    }
}

/**
 * Process a Gemini SDK message and forward to session
 */
async function processGeminiMessage(msg: GeminiSDKMessage, session: any): Promise<void> {
    logger.debug(`[Gemini] Message type: ${msg.type}`);

    switch (msg.type) {
        case 'init':
            session.sendSessionEvent({
                type: 'message',
                message: `Session started with model: ${msg.model}`
            });
            break;

        case 'message':
            if (msg.role === 'assistant') {
                // Send assistant message to mobile app
                session.sendCodexMessage({
                    type: 'message',
                    message: msg.content,
                    id: randomUUID()
                });
            }
            break;

        case 'tool_use':
            session.sendCodexMessage({
                type: 'tool-call',
                name: msg.tool_name,
                callId: msg.tool_id,
                input: msg.arguments,
                id: randomUUID()
            });
            break;

        case 'tool_result':
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId: msg.tool_id,
                output: msg.success ? { output: msg.output } : { error: msg.error },
                id: randomUUID()
            });
            break;

        case 'error':
            session.sendSessionEvent({
                type: 'message',
                message: `Error: ${msg.error}`
            });
            break;

        case 'result':
            if (msg.statistics) {
                session.sendCodexMessage({
                    type: 'token_count',
                    input_tokens: msg.statistics.input_tokens,
                    output_tokens: msg.statistics.output_tokens,
                    total_tokens: msg.statistics.total_tokens,
                    id: randomUUID()
                });
            }
            break;

        case 'reasoning':
            // Send reasoning/thinking to mobile app
            session.sendCodexMessage({
                type: 'reasoning',
                content: msg.content,
                id: randomUUID()
            });
            break;
    }
}
