import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { AgentState, Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import { projectPath } from '@/projectPath';
import { resolve } from 'node:path';
import { initialMachineMetadata } from '@/daemon/run';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import packageJson from '../../package.json';

import { OpenCodeClient } from './openCodeClient';
import { OpenCodePermissionHandler, PermissionMode } from './utils/permissionHandler';
import { 
    mapOpenCodePartToHappyMessage, 
    mapOpenCodeTodosToHappyMessage,
    mapOpenCodeMessageInfoToStatus 
} from './messageMapper';
import type { OpenCodeMessageInfo, OpenCodeMessagePart, OpenCodeSessionStatus } from './types';

export interface OpenCodeStartOptions {
    model?: string;
    provider?: string;
    permissionMode?: PermissionMode;
    startedBy?: 'daemon' | 'terminal';
    baseUrl?: string;
}

interface EnhancedMode {
    permissionMode: PermissionMode;
    model?: string;
    provider?: string;
}

export async function runOpenCode(
    credentials: Credentials, 
    options: OpenCodeStartOptions = {}
): Promise<void> {
    logger.debug('[OpenCode] ===== OPENCODE MODE STARTING =====');
    
    const workingDirectory = process.cwd();
    const sessionTag = randomUUID();

    const api = await ApiClient.create(credentials);

    const settings = await readSettings();
    let machineId = settings?.machineId;
    if (!machineId) {
        console.error('[OpenCode] No machine ID found. Please run happy auth first.');
        process.exit(1);
    }

    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    const metadata: Metadata = {
        path: workingDirectory,
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir: projectPath(),
        happyToolsDir: resolve(projectPath(), 'tools', 'unpacked'),
        startedFromDaemon: options.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: options.startedBy || 'terminal',
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: 'opencode'
    };

    const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state: {} });
    logger.debug(`[OpenCode] Session created: ${response.id}`);

    try {
        const result = await notifyDaemonSessionStarted(response.id, metadata);
        if (result.error) {
            logger.debug(`[OpenCode] Failed to report to daemon:`, result.error);
        }
    } catch (error) {
        logger.debug('[OpenCode] Daemon notification failed:', error);
    }

    const session = api.sessionSyncClient(response);
    
    const happyServer = await startHappyServer(session);
    logger.debug(`[OpenCode] Happy MCP server started at ${happyServer.url}`);

    const client = new OpenCodeClient({
        baseUrl: options.baseUrl || 'http://localhost:4096'
    });

    const permissionHandler = new OpenCodePermissionHandler(client, session);
    if (options.permissionMode) {
        permissionHandler.setMode(options.permissionMode);
    }

    let thinking = false;
    let shouldExit = false;
    let currentMessageInfo: OpenCodeMessageInfo | null = null;

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
        try {
            api.push().sendToAllDevices(
                "Ready!",
                'OpenCode is waiting for your command',
                { sessionId: session.sessionId }
            );
        } catch (pushError) {
            logger.debug('[OpenCode] Failed to send ready push', pushError);
        }
    };

    client.on('session:status', (status: OpenCodeSessionStatus) => {
        const wasThinking = thinking;
        thinking = status.status === 'running';
        
        if (wasThinking !== thinking) {
            session.keepAlive(thinking, 'remote');
        }

        if (status.status === 'idle' && wasThinking) {
            sendReady();
        }
    });

    client.on('message:info', (info: OpenCodeMessageInfo) => {
        currentMessageInfo = info;
        
        const statusMsg = mapOpenCodeMessageInfoToStatus(info);
        session.sendAgentMessage('opencode', statusMsg);

        if (info.role === 'assistant' && info.time.completed) {
            logger.debug('[OpenCode] Assistant message completed');
        }
    });

    client.on('message:part', (part: OpenCodeMessagePart) => {
        const happyMsg = mapOpenCodePartToHappyMessage(part);
        if (happyMsg) {
            if (currentMessageInfo) {
                happyMsg.role = currentMessageInfo.role;
                happyMsg.model = currentMessageInfo.modelID;
            }
            session.sendAgentMessage('opencode', happyMsg);
        }
    });

    client.on('todo:updated', (todos) => {
        const todoMsg = mapOpenCodeTodosToHappyMessage(todos);
        session.sendAgentMessage('opencode', todoMsg);
    });

    client.on('error', (error) => {
        logger.warn('[OpenCode] Client error:', error);
        session.sendSessionEvent({ type: 'message', message: `Error: ${error.message}` });
    });

    const messageQueue = new MessageQueue2<EnhancedMode>(mode => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        provider: mode.provider
    }));

    let currentPermissionMode = options.permissionMode || 'default';
    let currentModel = options.model;
    let currentProvider = options.provider;

    session.onUserMessage((message) => {
        let messagePermissionMode = currentPermissionMode;
        if (message.meta?.permissionMode) {
            const validModes: PermissionMode[] = ['default', 'acceptEdits', 'bypassPermissions'];
            if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
                messagePermissionMode = message.meta.permissionMode as PermissionMode;
                currentPermissionMode = messagePermissionMode;
            }
        }

        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            messageModel = message.meta.model || undefined;
            currentModel = messageModel;
        }

        let messageProvider = currentProvider;
        if (message.meta?.hasOwnProperty('provider')) {
            messageProvider = (message.meta as { provider?: string }).provider || undefined;
            currentProvider = messageProvider;
        }

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode,
            model: messageModel,
            provider: messageProvider
        };
        messageQueue.push(message.content.text, enhancedMode);
    });

    session.keepAlive(thinking, 'remote');
    const keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);

    const handleAbort = async () => {
        logger.debug('[OpenCode] Abort requested');
        try {
            if (client.hasActiveSession()) {
                await client.abort();
            }
            messageQueue.reset();
            permissionHandler.reset();
        } catch (error) {
            logger.debug('[OpenCode] Error during abort:', error);
        }
    };

    const handleKillSession = async () => {
        logger.debug('[OpenCode] Kill session requested');
        shouldExit = true;
        await handleAbort();

        try {
            session.updateMetadata((current) => ({
                ...current,
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
            clearInterval(keepAliveInterval);
            await client.disconnect();

            process.exit(0);
        } catch (error) {
            logger.debug('[OpenCode] Error during session termination:', error);
            process.exit(1);
        }
    };

    session.rpcHandlerManager.registerHandler('abort', handleAbort);
    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
        logger.infoDeveloper('Sleep prevention enabled (macOS)');
    }

    logger.infoDeveloper(`Session: ${response.id}`);
    logger.infoDeveloper(`Logs: ${logger.logFilePath}`);

    try {
        await client.connect();
        logger.debug('[OpenCode] Connected to OpenCode server');

        const openCodeSession = await client.getOrCreateSession(workingDirectory);
        logger.debug(`[OpenCode] Using OpenCode session: ${openCodeSession.id}`);

        session.updateMetadata((current) => ({
            ...current,
            openCodeSessionId: openCodeSession.id
        }));

        sendReady();

        while (!shouldExit) {
            const batch = await messageQueue.waitForMessagesAndGetAsString();
            if (!batch) {
                logger.debug('[OpenCode] Message queue closed');
                break;
            }

            const { message, mode } = batch;

            permissionHandler.setMode(mode.permissionMode);

            try {
                thinking = true;
                session.keepAlive(thinking, 'remote');

                await client.sendMessage(message, {
                    modelID: mode.model,
                    providerID: mode.provider
                });

                await client.waitForIdle();

            } catch (error) {
                logger.warn('[OpenCode] Error processing message:', error);
                session.sendSessionEvent({ 
                    type: 'message', 
                    message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
                });
            } finally {
                thinking = false;
                session.keepAlive(thinking, 'remote');
                permissionHandler.clearSessionPermissions();
            }
        }

    } finally {
        logger.debug('[OpenCode] Cleanup starting');
        
        clearInterval(keepAliveInterval);
        
        session.sendSessionDeath();
        await session.flush();
        await session.close();
        
        await client.disconnect();
        happyServer.stop();
        stopCaffeinate();
        
        logger.debug('[OpenCode] Cleanup complete');
    }
}
