import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { ApiClient } from '@/api/api';
import type { ApiSessionClient } from '@/api/apiSession';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { initialMachineMetadata } from '@/daemon/run';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { projectPath } from '@/projectPath';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { connectionState } from '@/utils/serverConnectionErrors';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import { codexLoop } from './loop';
import type { CodexMode, PermissionMode } from './mode';
import { extractResumeSessionId } from './utils/resume';
import { ensureHappySessionTagForCodexSession, getHappySessionTagForCodexSession } from './utils/codexSessionMap';
import type { SessionController } from './sessionController';
export { emitReadyIfIdle } from './utils/ready';
export type { CodexMode, PermissionMode } from './mode';

export async function runCodex(opts: {
    credentials: Credentials;
    startedBy?: 'daemon' | 'terminal';
    resumeArgs?: string[];
    startingMode?: 'local' | 'remote';
}): Promise<void> {
    logger.debug(`[CODEX] ===== CODEX MODE STARTING =====`);

    const workingDirectory = process.cwd();
    const sessionTagFallback = randomUUID();

    // Set backend for offline warnings (before any API calls)
    connectionState.setBackend('Codex');

    const api = await ApiClient.create(opts.credentials);

    // Resolve initial mode
    let mode: 'local' | 'remote' = opts.startingMode ?? (opts.startedBy === 'daemon' ? 'remote' : 'local');
    const resumeSessionId = extractResumeSessionId(opts.resumeArgs);
    let sessionTag = sessionTagFallback;
    if (resumeSessionId) {
        const existingTag = await getHappySessionTagForCodexSession(resumeSessionId);
        if (existingTag) {
            sessionTag = existingTag;
        }
        sessionTag = await ensureHappySessionTagForCodexSession(resumeSessionId, sessionTag);
    }

    // Validate daemon spawn requirements
    if (opts.startedBy === 'daemon' && mode === 'local') {
        logger.debug('Daemon spawn requested with local mode - forcing remote mode');
        mode = 'remote';
    }

    // Get machine ID from settings
    const settings = await readSettings();
    const machineId = settings?.machineId;
    if (!machineId) {
        console.error(
            `[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/slopus/happy-cli/issues`
        );
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);

    // Create machine if it doesn't exist
    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata,
    });

    const { state: baseState, metadata } = createSessionMetadata({
        flavor: 'codex',
        machineId,
        startedBy: opts.startedBy,
    });

    const state = {
        ...baseState,
        controlledByUser: mode === 'local',
    };

    const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
    logger.debug(`Session created: ${response?.id ?? 'offline'}`);

    let session: ApiSessionClient;
    const sessionSwapListeners = new Set<(nextSession: ApiSessionClient) => void>();
    const sessionController: SessionController = {
        getSession: () => session,
        onSessionSwap: (listener) => {
            sessionSwapListeners.add(listener);
            return () => {
                sessionSwapListeners.delete(listener);
            };
        },
    };

    const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
        api,
        sessionTag,
        metadata,
        state,
        response,
        onSessionSwap: (newSession) => {
            session = newSession;
            for (const listener of sessionSwapListeners) {
                listener(newSession);
            }
        },
    });
    session = initialSession;

    // Always report to daemon if it exists (skip if offline)
    if (response) {
        try {
            logger.debug(`[START] Reporting session ${response.id} to daemon`);
            const result = await notifyDaemonSessionStarted(response.id, metadata);
            if (result.error) {
                logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
            } else {
                logger.debug(`[START] Reported session ${response.id} to daemon`);
            }
        } catch (error) {
            logger.debug('[START] Failed to report to daemon (may not be running):', error);
        }
    }

    // Start Happy MCP server
    const happyServer = await startHappyServer(session);
    logger.debug(`[START] Happy MCP server started at ${happyServer.url}`);

    // Build MCP servers for Codex
    const bridgeCommand = join(projectPath(), 'bin', 'happy-mcp.mjs');
    const mcpServers = {
        happy: {
            command: bridgeCommand,
            args: ['--url', happyServer.url],
        },
    } as const;

    // Start caffeinate to prevent sleep on macOS
    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
        logger.infoDeveloper('Sleep prevention enabled (macOS)');
    }

    // Message queue for remote prompts
    const messageQueue = new MessageQueue2<CodexMode>((mode) =>
        hashObject({
            permissionMode: mode.permissionMode,
            model: mode.model,
        })
    );

    // Forward messages to queue
    let currentPermissionMode: PermissionMode | undefined = undefined;
    let currentModel: string | undefined = undefined;
    const attachMessageHandler = (currentSession: ApiSessionClient) => {
        currentSession.onUserMessage((message) => {
            let messagePermissionMode = currentPermissionMode;
            if (message.meta?.permissionMode) {
                const validModes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
                if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
                    messagePermissionMode = message.meta.permissionMode as PermissionMode;
                    currentPermissionMode = messagePermissionMode;
                    logger.debug(`[Codex] Permission mode updated from user message to: ${currentPermissionMode}`);
                } else {
                    logger.debug(`[Codex] Invalid permission mode received: ${message.meta.permissionMode}`);
                }
            } else {
                logger.debug(`[Codex] User message received with no permission mode override, using current: ${currentPermissionMode ?? 'default (effective)'}`);
            }

            let messageModel = currentModel;
            if (message.meta?.hasOwnProperty('model')) {
                messageModel = message.meta.model || undefined;
                currentModel = messageModel;
                logger.debug(`[Codex] Model updated from user message: ${messageModel || 'reset to default'}`);
            } else {
                logger.debug(`[Codex] User message received with no model override, using current: ${currentModel || 'default'}`);
            }

            const enhancedMode: CodexMode = {
                permissionMode: messagePermissionMode || 'default',
                model: messageModel,
            };
            messageQueue.push(message.content.text, enhancedMode);
        });
    };

    attachMessageHandler(session);
    sessionController.onSessionSwap((nextSession) => {
        attachMessageHandler(nextSession);
    });

    // Keep-alive tracking
    let thinking = false;
    const sendKeepAlive = () => sessionController.getSession().keepAlive(thinking, mode);
    sendKeepAlive();
    const keepAliveInterval = setInterval(() => sendKeepAlive(), 2000);

    const onModeChange = (newMode: 'local' | 'remote') => {
        mode = newMode;
        const activeSession = sessionController.getSession();
        activeSession.sendSessionEvent({ type: 'switch', mode: newMode });
        activeSession.updateAgentState((currentState) => ({
            ...currentState,
            controlledByUser: newMode === 'local',
        }));
        sendKeepAlive();
    };

    const onThinkingChange = (isThinking: boolean) => {
        thinking = isThinking;
        sendKeepAlive();
    };

    let shuttingDown = false;
    const cleanup = async () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        const forceExitTimer = setTimeout(() => {
            logger.debug('[CODEX] Force exit after shutdown timeout');
            process.exit(0);
        }, 2000);
        try {
            const activeSession = sessionController.getSession();
            activeSession.sendSessionDeath();
            await activeSession.flush();
            await activeSession.close();
        } catch (error) {
            logger.debug('[CODEX] Error during cleanup:', error);
        }

        if (reconnectionHandle) {
            reconnectionHandle.cancel();
        }
        stopCaffeinate();
        happyServer.stop();
        clearInterval(keepAliveInterval);

        logger.debug('[CODEX] Cleanup complete, exiting');
        clearTimeout(forceExitTimer);
        process.exit(0);
    };

    // Handle termination signals
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    process.on('uncaughtException', (error) => {
        logger.debug('[CODEX] Uncaught exception:', error);
        cleanup();
    });

    process.on('unhandledRejection', (reason) => {
        logger.debug('[CODEX] Unhandled rejection:', reason);
        cleanup();
    });

    const attachKillHandler = (currentSession: ApiSessionClient) => {
        registerKillSessionHandler(currentSession.rpcHandlerManager, cleanup);
    };
    attachKillHandler(session);
    sessionController.onSessionSwap((nextSession) => {
        attachKillHandler(nextSession);
    });

    // Start codex loop
    await codexLoop({
        path: workingDirectory,
        startingMode: mode,
        resumeArgs: opts.resumeArgs,
        resumeSessionId: resumeSessionId ?? undefined,
        sessionTag,
        sessionController,
        api,
        mcpServers,
        messageQueue,
        onModeChange,
        onThinkingChange,
    });

    await cleanup();
}
