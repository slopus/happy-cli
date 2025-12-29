/**
 * Gemini Remote Mode Launcher
 *
 * Handles Gemini's remote mode with ACP backend and Ink UI.
 * Extracted from runGemini.ts for better separation between local and remote modes.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

import { ApiSessionClient } from '@/api/apiSession';
import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { projectPath } from '@/projectPath';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';

import { createGeminiBackend } from '@/agent/acp/gemini';
import type { AgentBackend, AgentMessage } from '@/agent/AgentBackend';
import { GeminiDisplay } from '@/ui/ink/GeminiDisplay';
import { GeminiPermissionHandler } from '@/gemini/utils/permissionHandler';
import { GeminiReasoningProcessor } from '@/gemini/utils/reasoningProcessor';
import { GeminiDiffProcessor } from '@/gemini/utils/diffProcessor';
import type { PermissionMode, GeminiMode } from '@/gemini/types';
import { GEMINI_MODEL_ENV, DEFAULT_GEMINI_MODEL, CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import {
  readGeminiLocalConfig,
  determineGeminiModel,
  saveGeminiModelToConfig,
  getInitialGeminiModel
} from '@/gemini/utils/config';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from '@/gemini/utils/optionsParser';

export async function geminiRemoteLauncher(opts: {
    session: ApiSessionClient;
    api: ApiClient;
    messageQueue: MessageQueue2<GeminiMode>;
    model?: string;
    approvalMode?: string;
    allowedTools?: string[];
    cloudToken?: string;
    sessionId?: string | null;
    onSessionFound?: (sessionId: string) => void;
}): Promise<'switch' | 'exit'> {
    logger.debug('[geminiRemoteLauncher] Starting remote mode');

    const { session, api, messageQueue, cloudToken } = opts;

    // Track current overrides to apply per message (remote mode only)
    let currentPermissionMode: PermissionMode | undefined = undefined;
    let currentModel: string | undefined = opts.model;

    // Track if this is the first message to include system prompt only once
    let isFirstMessage = true;

    session.onUserMessage((message) => {
        // Resolve permission mode (validate) - same as Codex
        let messagePermissionMode = currentPermissionMode;
        if (message.meta?.permissionMode) {
            const validModes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
            if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
                messagePermissionMode = message.meta.permissionMode as PermissionMode;
                currentPermissionMode = messagePermissionMode;
                // Update permission handler with new mode
                updatePermissionMode(messagePermissionMode);
                logger.debug(`[Gemini] Permission mode updated from user message to: ${currentPermissionMode}`);
            } else {
                logger.debug(`[Gemini] Invalid permission mode received: ${message.meta.permissionMode}`);
            }
        } else {
            logger.debug(`[Gemini] User message received with no permission mode override, using current: ${currentPermissionMode ?? 'default (effective)'}`);
        }

        // Initialize permission mode if not set yet
        if (currentPermissionMode === undefined) {
            currentPermissionMode = 'default';
            updatePermissionMode('default');
        }

        // Resolve model; explicit null resets to default (undefined)
        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            if (message.meta.model === null) {
                messageModel = undefined;
                currentModel = undefined;
            } else if (message.meta.model) {
                messageModel = message.meta.model;
                currentModel = messageModel;
                updateDisplayedModel(messageModel, true);
                messageBuffer.addMessage(`Model changed to: ${messageModel}`, 'system');
            }
        }

        // Build the full prompt with appendSystemPrompt if provided
        const originalUserMessage = message.content.text;
        let fullPrompt = originalUserMessage;
        if (isFirstMessage && message.meta?.appendSystemPrompt) {
            fullPrompt = message.meta.appendSystemPrompt + '\n\n' + originalUserMessage + '\n\n' + CHANGE_TITLE_INSTRUCTION;
            isFirstMessage = false;
        }

        const mode: GeminiMode = {
            permissionMode: messagePermissionMode || 'default',
            model: messageModel,
            originalUserMessage,
        };
        messageQueue.push(fullPrompt, mode);
    });

    let thinking = false;
    session.keepAlive(thinking, 'remote');
    const keepAliveInterval = setInterval(() => {
        session.keepAlive(thinking, 'remote');
    }, 2000);

    const sendReady = () => {
        session.sendSessionEvent({ type: 'ready' });
        try {
            api.push().sendToAllDevices(
                "It's ready!",
                'Gemini is waiting for your command',
                { sessionId: session.sessionId }
            );
        } catch (pushError) {
            logger.debug('[Gemini] Failed to send ready push', pushError);
        }
    };

    const emitReadyIfIdle = (): boolean => {
        if (shouldExit) return false;
        if (thinking) return false;
        if (isResponseInProgress) return false;
        if (messageQueue.size() > 0) return false;

        sendReady();
        return true;
    };

    //
    // Abort handling
    //

    let abortController = new AbortController();
    let shouldExit = false;
    let switchToLocal = false;
    let geminiBackend: AgentBackend | null = null;
    let acpSessionId: string | null = opts.sessionId || null;  // Start with provided session ID, will be updated when backend creates session
    let wasSessionCreated = false;

    async function handleAbort() {
        logger.debug('[Gemini] Abort requested - stopping current task');

        session.sendGeminiMessage({
            type: 'message',
            message: 'Turn aborted',
            id: randomUUID(),
        });

        reasoningProcessor.abort();
        diffProcessor.reset();

        try {
            abortController.abort();
            messageQueue.reset();
            if (geminiBackend && acpSessionId) {
                await geminiBackend.cancel(acpSessionId);
            }
            logger.debug('[Gemini] Abort completed - session remains active');
        } catch (error) {
            logger.debug('[Gemini] Error during abort:', error);
        } finally {
            abortController = new AbortController();
        }
    }

    const handleKillSession = async () => {
        logger.debug('[Gemini] Kill session requested - terminating process');
        await handleAbort();
        shouldExit = true;
    };

    async function doSwitch() {
        console.error('[geminiRemoteLauncher] Switch to local mode requested');
        logger.debug('[geminiRemoteLauncher] Switch to local mode requested');
        logger.debug(`[geminiRemoteLauncher] Current state - switchToLocal: ${switchToLocal}, shouldExit: ${shouldExit}`);
        console.error(`[geminiRemoteLauncher] Setting flags - switchToLocal=true, shouldExit=true`);
        switchToLocal = true;
        shouldExit = true;
        logger.debug('[geminiRemoteLauncher] State updated - switchToLocal: true, shouldExit: true');
        console.error('[geminiRemoteLauncher] Calling handleAbort()...');
        logger.debug('[geminiRemoteLauncher] Calling handleAbort()...');
        await handleAbort();
        console.error('[geminiRemoteLauncher] handleAbort() completed');
        logger.debug('[geminiRemoteLauncher] handleAbort() completed');
    }

    // Register RPC handlers for abort and mode switching
    session.rpcHandlerManager.registerHandler('abort', handleAbort);
    registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);
    session.rpcHandlerManager.registerHandler('switch', doSwitch); // When user wants to switch to local mode

    //
    // Initialize Ink UI
    //

    const messageBuffer = new MessageBuffer();
    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
    let inkInstance: ReturnType<typeof render> | null = null;

    let displayedModel: string | undefined = opts.model || getInitialGeminiModel();

    const localConfig = readGeminiLocalConfig();
    logger.debug(`[gemini] Initial model setup: env[GEMINI_MODEL_ENV]=${process.env[GEMINI_MODEL_ENV] || 'not set'}, localConfig=${localConfig.model || 'not set'}, displayedModel=${displayedModel}`);

    const updateDisplayedModel = (model: string | undefined, saveToConfig: boolean = false) => {
        if (model === undefined) {
            logger.debug(`[gemini] updateDisplayedModel called with undefined, skipping update`);
            return;
        }

        const oldModel = displayedModel;
        displayedModel = model;
        logger.debug(`[gemini] updateDisplayedModel called: oldModel=${oldModel}, newModel=${model}, saveToConfig=${saveToConfig}`);

        if (saveToConfig) {
            saveGeminiModelToConfig(model);
        }

        if (hasTTY && oldModel !== model) {
            logger.debug(`[gemini] Adding model update message to buffer: [MODEL:${model}]`);
            messageBuffer.addMessage(`[MODEL:${model}]`, 'system');
        } else if (hasTTY) {
            logger.debug(`[gemini] Model unchanged, skipping update message`);
        }
    };

    if (hasTTY) {
        console.clear();

        const switchCallback = () => {
            logger.debug('[gemini]: Switching to local mode via spacebar');
            doSwitch();
        };

        const exitCallback = async () => {
            logger.debug('[gemini]: Exiting agent via Ctrl-C');
            shouldExit = true;
            await handleAbort();
        };

        inkInstance = render(React.createElement(GeminiDisplay, {
            messageBuffer,
            logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
            currentModel: displayedModel || 'gemini-2.5-pro',
            onExit: exitCallback,
            onSwitchToLocal: switchCallback
        }), {
            exitOnCtrlC: false,
            patchConsole: false
        });

        const initialModelName = displayedModel || 'gemini-2.5-pro';
        logger.debug(`[gemini] Sending initial model to UI: ${initialModelName}`);
        messageBuffer.addMessage(`[MODEL:${initialModelName}]`, 'system');
    }

    if (hasTTY) {
        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding('utf8');
    }

    //
    // Start Happy MCP server and create Gemini backend
    //

    const happyServer = await startHappyServer(session);
    const bridgeCommand = join(projectPath(), 'bin', 'happy-mcp.mjs');
    const mcpServers = {
        happy: {
            command: bridgeCommand,
            args: ['--url', happyServer.url]
        }
    };

    const permissionHandler = new GeminiPermissionHandler(session);
    const reasoningProcessor = new GeminiReasoningProcessor((message) => {
        session.sendGeminiMessage(message);
    });
    const diffProcessor = new GeminiDiffProcessor((message) => {
        session.sendGeminiMessage(message);
    });

    const updatePermissionMode = (mode: PermissionMode) => {
        permissionHandler.setPermissionMode(mode);
    };

    let accumulatedResponse = '';
    let isResponseInProgress = false;
    let currentResponseMessageId: string | null = null;

    function setupGeminiMessageHandler(backend: AgentBackend): void {
        backend.onMessage((msg: AgentMessage) => {

        switch (msg.type) {
            case 'model-output':
                if (msg.textDelta) {
                    if (!isResponseInProgress) {
                        messageBuffer.removeLastMessage('system');
                        messageBuffer.addMessage(msg.textDelta, 'assistant');
                        isResponseInProgress = true;
                        logger.debug(`[gemini] Started new response, first chunk length: ${msg.textDelta.length}`);
                    } else {
                        messageBuffer.updateLastMessage(msg.textDelta, 'assistant');
                        logger.debug(`[gemini] Updated response, chunk length: ${msg.textDelta.length}, total accumulated: ${accumulatedResponse.length + msg.textDelta.length}`);
                    }
                    accumulatedResponse += msg.textDelta;
                }
                break;

            case 'status':
                logger.debug(`[gemini] Status changed: ${msg.status}${msg.detail ? ` - ${msg.detail}` : ''}`);

                if (msg.status === 'error') {
                    logger.debug(`[gemini] ⚠️ Error status received: ${msg.detail || 'Unknown error'}`);
                    session.sendGeminiMessage({
                        type: 'status',
                        status: 'error',
                        id: randomUUID(),
                    });
                }

                if (msg.status === 'running') {
                    thinking = true;
                    session.keepAlive(thinking, 'remote');
                    session.sendGeminiMessage({
                        type: 'status',
                        status: 'running',
                        id: randomUUID(),
                    });
                    messageBuffer.addMessage('Thinking...', 'system');
                } else if (msg.status === 'idle' || msg.status === 'stopped') {
                    if (thinking) {
                        thinking = false;
                    }
                    thinking = false;
                    session.keepAlive(thinking, 'remote');

                    const reasoningCompleted = reasoningProcessor.complete();

                    if (reasoningCompleted || isResponseInProgress) {
                        session.sendGeminiMessage({
                            type: 'status',
                            status: 'idle',
                            id: randomUUID(),
                        });
                    }

                    if (isResponseInProgress && accumulatedResponse.trim()) {
                        const { text: messageText, options } = parseOptionsFromText(accumulatedResponse);

                        let finalMessageText = messageText;
                        if (options.length > 0) {
                            const optionsXml = formatOptionsXml(options);
                            finalMessageText = messageText + optionsXml;
                            logger.debug(`[gemini] Found ${options.length} options in response:`, options);
                            logger.debug(`[gemini] Keeping options in message text for mobile app parsing`);
                        } else if (hasIncompleteOptions(accumulatedResponse)) {
                            logger.debug(`[gemini] Warning: Incomplete options block detected but sending message anyway`);
                        }

                        const messageId = randomUUID();

                        logger.debug(`[gemini] Sending complete message to mobile (length: ${finalMessageText.length}): ${finalMessageText.substring(0, 100)}...`);
                        session.sendGeminiMessage({
                            type: 'model-output',
                            textDelta: finalMessageText,
                            id: messageId,
                        });
                        accumulatedResponse = '';
                        isResponseInProgress = false;
                    }
                } else if (msg.status === 'error') {
                    thinking = false;
                    session.keepAlive(thinking, 'remote');
                    accumulatedResponse = '';
                    isResponseInProgress = false;
                    currentResponseMessageId = null;

                    const errorMessage = msg.detail || 'Unknown error';
                    messageBuffer.addMessage(`Error: ${errorMessage}`, 'status');

                    session.sendGeminiMessage({
                        type: 'message',
                        message: `Error: ${errorMessage}`,
                        id: randomUUID(),
                    });
                }
                break;

            case 'tool-call':
                const toolArgs = msg.args ? JSON.stringify(msg.args).substring(0, 100) : '';
                const isInvestigationTool = msg.toolName === 'codebase_investigator' ||
                                            (typeof msg.toolName === 'string' && msg.toolName.includes('investigator'));

                logger.debug(`[gemini] 🔧 Tool call received: ${msg.toolName} (${msg.callId})${isInvestigationTool ? ' [INVESTIGATION]' : ''}`);
                if (isInvestigationTool && msg.args && typeof msg.args === 'object' && 'objective' in msg.args) {
                    logger.debug(`[gemini] 🔍 Investigation objective: ${String(msg.args.objective).substring(0, 150)}...`);
                }

                messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}${toolArgs.length >= 100 ? '...' : ''}` : ''}`, 'tool');
                session.sendGeminiMessage({
                    type: 'tool-call',
                    toolName: msg.toolName,
                    args: msg.args,
                    callId: msg.callId,
                    id: randomUUID(),
                });
                break;

            case 'tool-result':
                const isError = msg.result && typeof msg.result === 'object' && 'error' in msg.result;
                const resultText = typeof msg.result === 'string'
                    ? msg.result.substring(0, 200)
                    : JSON.stringify(msg.result).substring(0, 200);
                const truncatedResult = resultText + (typeof msg.result === 'string' && msg.result.length > 200 ? '...' : '');

                const resultSize = typeof msg.result === 'string'
                    ? msg.result.length
                    : JSON.stringify(msg.result).length;

                logger.debug(`[gemini] ${isError ? '❌' : '✅'} Tool result received: ${msg.toolName} (${msg.callId}) - Size: ${resultSize} bytes${isError ? ' [ERROR]' : ''}`);

                if (!isError) {
                    diffProcessor.processToolResult(msg.toolName, msg.result, msg.callId);
                }

                if (isError) {
                    const errorMsg = (msg.result as any).error || 'Tool call failed';
                    logger.debug(`[gemini] ❌ Tool call error: ${errorMsg.substring(0, 300)}`);
                    messageBuffer.addMessage(`Error: ${errorMsg}`, 'status');
                } else {
                    if (resultSize > 1000) {
                        logger.debug(`[gemini] ✅ Large tool result (${resultSize} bytes) - first 200 chars: ${truncatedResult}`);
                    }
                    messageBuffer.addMessage(`Result: ${truncatedResult}`, 'result');
                }

                session.sendGeminiMessage({
                    type: 'tool-result',
                    toolName: msg.toolName,
                    result: msg.result,
                    callId: msg.callId,
                    isError: isError,
                    id: randomUUID(),
                });
                break;

            case 'fs-edit':
                messageBuffer.addMessage(`File edit: ${msg.description}`, 'tool');
                diffProcessor.processFsEdit(msg.path || '', msg.description, msg.diff);

                session.sendGeminiMessage({
                    type: 'file-edit',
                    description: msg.description,
                    diff: msg.diff,
                    path: msg.path,
                    id: randomUUID(),
                });
                break;

            case 'terminal-output':
                messageBuffer.addMessage(msg.data, 'result');
                session.sendGeminiMessage({
                    type: 'terminal-output',
                    data: msg.data,
                    id: randomUUID(),
                });
                break;

            case 'permission-request':
                session.sendGeminiMessage({
                    type: 'permission-request',
                    permissionId: msg.id,
                    reason: msg.reason,
                    payload: msg.payload,
                    id: randomUUID(),
                });
                break;

            case 'exec-approval-request':
                const execApprovalMsg = msg as any;
                const callId = execApprovalMsg.call_id || execApprovalMsg.callId || randomUUID();
                const { call_id, type, ...inputs } = execApprovalMsg;

                logger.debug(`[gemini] Exec approval request received: ${callId}`);
                messageBuffer.addMessage(`Exec approval requested: ${callId}`, 'tool');

                session.sendGeminiMessage({
                    type: 'tool-call',
                    toolName: 'GeminiBash',
                    args: inputs,
                    callId: callId,
                    id: randomUUID(),
                });
                break;

            case 'patch-apply-begin':
                const patchBeginMsg = msg as any;
                const patchCallId = patchBeginMsg.call_id || patchBeginMsg.callId || randomUUID();
                const { call_id: patchCallIdVar, type: patchType, auto_approved, changes } = patchBeginMsg;

                const changeCount = changes ? Object.keys(changes).length : 0;
                const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
                messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');
                logger.debug(`[gemini] Patch apply begin: ${patchCallId}, files: ${changeCount}`);

                session.sendGeminiMessage({
                    type: 'tool-call',
                    toolName: 'GeminiPatch',
                    args: {
                        auto_approved,
                        changes
                    },
                    callId: patchCallId,
                    id: randomUUID(),
                });
                break;

            case 'patch-apply-end':
                const patchEndMsg = msg as any;
                const patchEndCallId = patchEndMsg.call_id || patchEndMsg.callId || randomUUID();
                const { call_id: patchEndCallIdVar, type: patchEndType, stdout, stderr, success } = patchEndMsg;

                if (success) {
                    const message = stdout || 'Files modified successfully';
                    messageBuffer.addMessage(message.substring(0, 200), 'result');
                } else {
                    const errorMsg = stderr || 'Failed to modify files';
                    messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
                }
                logger.debug(`[gemini] Patch apply end: ${patchEndCallId}, success: ${success}`);

                session.sendGeminiMessage({
                    type: 'tool-result',
                    toolName: 'GeminiPatch',
                    result: {
                        stdout,
                        stderr,
                        success
                    },
                    callId: patchEndCallId,
                    isError: !success,
                    id: randomUUID(),
                });
                break;

            case 'event':
                if (msg.name === 'session-created') {
                    // Capture the ACP session ID for future resumption
                    const sessionPayload = msg.payload as { sessionId?: string } | undefined;
                    if (sessionPayload && sessionPayload.sessionId) {
                        acpSessionId = sessionPayload.sessionId;
                        logger.debug(`[gemini] Session created/captured: ${acpSessionId}`);

                        // Notify the loop so it can update the GeminiSession object
                        if (opts.onSessionFound) {
                            opts.onSessionFound(acpSessionId);
                        }
                    }
                } else if (msg.name === 'thinking') {
                    const thinkingPayload = msg.payload as { text?: string } | undefined;
                    const thinkingText = (thinkingPayload && typeof thinkingPayload === 'object' && 'text' in thinkingPayload)
                        ? String(thinkingPayload.text || '')
                        : '';
                    if (thinkingText) {
                        reasoningProcessor.processChunk(thinkingText);
                        logger.debug(`[gemini] 💭 Thinking chunk received: ${thinkingText.length} chars - Preview: ${thinkingText.substring(0, 100)}...`);

                        if (!thinkingText.startsWith('**')) {
                            const thinkingPreview = thinkingText.substring(0, 100);
                            messageBuffer.updateLastMessage(`[Thinking] ${thinkingPreview}...`, 'system');
                        }
                    }
                    session.sendGeminiMessage({
                        type: 'thinking',
                        text: thinkingText,
                        id: randomUUID(),
                    });
                }
                break;

            default:
                if ((msg as any).type === 'token-count') {
                    const tokenMsg = msg as any;
                    session.sendGeminiMessage({
                        type: 'token-count',
                        inputTokens: tokenMsg.inputTokens || 0,
                        outputTokens: tokenMsg.outputTokens || 0,
                        totalTokens: tokenMsg.totalTokens,
                        id: randomUUID(),
                    });
                }
                break;
        }
        });
    }

    let first = true;

    try {
        let currentModeHash: string | null = null;
        let pending: { message: string; mode: GeminiMode; isolate: boolean; hash: string } | null = null;

        while (!shouldExit) {
            logger.debug(`[gemini] Main loop iteration - shouldExit: ${shouldExit}, switchToLocal: ${switchToLocal}`);
            let message: { message: string; mode: GeminiMode; isolate: boolean; hash: string } | null = pending;
            pending = null;

            if (!message) {
                logger.debug('[gemini] Main loop: waiting for messages from queue...');
                const waitSignal = abortController.signal;
                const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
                if (!batch) {
                    if (waitSignal.aborted && !shouldExit) {
                        logger.debug('[gemini] Main loop: wait aborted but shouldExit is false, continuing...');
                        continue;
                    }
                    logger.debug(`[gemini] Main loop: no batch received (aborted: ${waitSignal.aborted}, shouldExit: ${shouldExit}), breaking...`);
                    break;
                }
                logger.debug(`[gemini] Main loop: received message from queue (length: ${batch.message.length})`);
                message = batch;
            }

            if (!message) {
                break;
            }

            // Handle mode change
            if (wasSessionCreated && currentModeHash && message.hash !== currentModeHash) {
                logger.debug('[Gemini] Mode changed – restarting Gemini session');
                messageBuffer.addMessage('═'.repeat(40), 'status');
                messageBuffer.addMessage('Starting new Gemini session (mode changed)...', 'status');

                permissionHandler.reset();
                reasoningProcessor.abort();

                if (geminiBackend) {
                    await geminiBackend.dispose();
                    geminiBackend = null;
                }

                const modelToUse = message.mode?.model === undefined ? undefined : (message.mode.model || null);
                geminiBackend = createGeminiBackend({
                    cwd: process.cwd(),
                    mcpServers,
                    permissionHandler,
                    cloudToken,
                    model: modelToUse,
                    sessionId: acpSessionId,  // Use captured session ID
                });

                setupGeminiMessageHandler(geminiBackend);

                const localConfigForModel = readGeminiLocalConfig();
                const actualModel = determineGeminiModel(modelToUse, localConfigForModel);
                logger.debug(`[gemini] Model change - modelToUse=${modelToUse}, actualModel=${actualModel}`);

                logger.debug('[gemini] Starting new ACP session with model:', actualModel);
                const { sessionId } = await geminiBackend.startSession();
                acpSessionId = sessionId;
                logger.debug(`[gemini] New ACP session started: ${acpSessionId}`);

                logger.debug(`[gemini] Calling updateDisplayedModel with: ${actualModel}`);
                updateDisplayedModel(actualModel, false);

                updatePermissionMode(message.mode.permissionMode);

                wasSessionCreated = true;
                currentModeHash = message.hash;
                first = false;
            }

            currentModeHash = message.hash;
            const userMessageToShow = message.mode?.originalUserMessage || message.message;
            messageBuffer.addMessage(userMessageToShow, 'user');

            try {
                if (first || !wasSessionCreated) {
                    if (!geminiBackend) {
                        const modelToUse = message.mode?.model === undefined ? undefined : (message.mode.model || null);
                        geminiBackend = createGeminiBackend({
                            cwd: process.cwd(),
                            mcpServers,
                            permissionHandler,
                            cloudToken,
                            model: modelToUse,
                            sessionId: acpSessionId,  // Use captured session ID
                        });

                        setupGeminiMessageHandler(geminiBackend);

                        const localConfigForModel = readGeminiLocalConfig();
                        const actualModel = determineGeminiModel(modelToUse, localConfigForModel);

                        const modelSource = modelToUse !== undefined
                            ? 'message'
                            : process.env[GEMINI_MODEL_ENV]
                                ? 'env-var'
                                : localConfigForModel.model
                                    ? 'local-config'
                                    : 'default';

                        logger.debug(`[gemini] Backend created, model will be: ${actualModel} (from ${modelSource})`);
                        logger.debug(`[gemini] Calling updateDisplayedModel with: ${actualModel}`);
                        updateDisplayedModel(actualModel, false);
                    }

                    if (!acpSessionId) {
                        logger.debug('[gemini] Starting ACP session...');
                        updatePermissionMode(message.mode.permissionMode);
                        const { sessionId } = await geminiBackend.startSession();
                        acpSessionId = sessionId;
                        logger.debug(`[gemini] ACP session started: ${acpSessionId}`);
                        wasSessionCreated = true;
                        currentModeHash = message.hash;

                        logger.debug(`[gemini] Displaying model in UI: ${displayedModel || 'gemini-2.5-pro'}, displayedModel: ${displayedModel}`);
                    }
                }

                if (!acpSessionId) {
                    throw new Error('ACP session not started');
                }

                accumulatedResponse = '';
                isResponseInProgress = false;

                if (!geminiBackend || !acpSessionId) {
                    throw new Error('Gemini backend or session not initialized');
                }

                const promptToSend = message.message;

                logger.debug(`[gemini] Sending prompt to Gemini (length: ${promptToSend.length}): ${promptToSend.substring(0, 100)}...`);
                logger.debug(`[gemini] Full prompt: ${promptToSend}`);
                await geminiBackend.sendPrompt(acpSessionId, promptToSend);
                logger.debug('[gemini] Prompt sent successfully');

                if (first) {
                    first = false;
                }
            } catch (error) {
                logger.debug('[gemini] Error in gemini session:', error);
                const isAbortError = error instanceof Error && error.name === 'AbortError';

                if (isAbortError) {
                    messageBuffer.addMessage('Aborted by user', 'status');
                    session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                } else {
                    let errorMsg = 'Process error occurred';

                    if (typeof error === 'object' && error !== null) {
                        const errObj = error as any;

                        const errorDetails = errObj.data?.details || errObj.details || '';
                        const errorCode = errObj.code || errObj.status || (errObj.response?.status);
                        const errorMessage = errObj.message || errObj.error?.message || '';
                        const errorString = String(error);

                        if (errorCode === 404 || errorDetails.includes('notFound') || errorDetails.includes('404') ||
                            errorMessage.includes('not found') || errorMessage.includes('404')) {
                            const currentModel = displayedModel || 'gemini-2.5-pro';
                            errorMsg = `Model "${currentModel}" not found. Available models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite`;
                        }
                        else if (errorCode === 429 ||
                                 errorDetails.includes('429') || errorMessage.includes('429') || errorString.includes('429') ||
                                 errorDetails.includes('rateLimitExceeded') || errorDetails.includes('RESOURCE_EXHAUSTED') ||
                                 errorMessage.includes('Rate limit exceeded') || errorMessage.includes('Resource exhausted') ||
                                 errorString.includes('rateLimitExceeded') || errorString.includes('RESOURCE_EXHAUSTED')) {
                            errorMsg = 'Gemini API rate limit exceeded. Please wait a moment and try again. The API will retry automatically.';
                        }
                        else if (errorDetails.includes('quota') || errorMessage.includes('quota') || errorString.includes('quota')) {
                            errorMsg = 'Gemini API daily quota exceeded. Please wait until quota resets or use a paid API key.';
                        }
                        else if (Object.keys(error).length === 0) {
                            errorMsg = 'Failed to start Gemini. Is "gemini" CLI installed? Run: npm install -g @google/gemini-cli';
                        }
                        else if (errObj.message || errorMessage) {
                            errorMsg = errorDetails || errorMessage || errObj.message;
                        }
                    } else if (error instanceof Error) {
                        errorMsg = error.message;
                    }

                    messageBuffer.addMessage(errorMsg, 'status');
                    session.sendGeminiMessage({
                        type: 'message',
                        message: errorMsg,
                        id: randomUUID(),
                    });
                }
            } finally {
                permissionHandler.reset();
                reasoningProcessor.abort();
                diffProcessor.reset();

                thinking = false;
                session.keepAlive(thinking, 'remote');

                emitReadyIfIdle();

                logger.debug(`[gemini] Main loop: turn completed, continuing to next iteration (queue size: ${messageQueue.size()})`);
            }
        }

    } finally {
        // Clean up resources
        logger.debug('[geminiRemoteLauncher]: Cleanup start');

        // Note: RPC handlers are not unregistered as RpcHandlerManager doesn't provide unregisterHandler
        // They will be cleaned up when the session is closed in runGemini.ts

        if (geminiBackend) {
            await geminiBackend.dispose();
        }

        happyServer.stop();

        // Clean up stdin with proper order (from bug fix)
        if (inkInstance) {
            inkInstance.unmount();
        }

        // Remove stdin listeners and reset terminal mode BEFORE clearing screen
        // This ensures stdin is fully released before local mode starts
        logger.debug('[geminiRemoteLauncher]: Starting stdin cleanup');

        // Remove all stdin listeners (the old code with off() didn't work)
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('keypress');

        const listenersRemaining = process.stdin.listeners('data').length + process.stdin.listeners('keypress').length;
        logger.debug(`[geminiRemoteLauncher]: Stdin listeners removed. Remaining: ${listenersRemaining}`);

        // Reset terminal mode
        if (process.stdin.isTTY) {
            try {
                process.stdin.setRawMode(false);
                logger.debug('[geminiRemoteLauncher]: Stdin raw mode disabled');
            } catch (e) {
                logger.debug('[geminiRemoteLauncher]: Failed to disable raw mode:', e);
            }
        }

        if (hasTTY) {
            try {
                process.stdin.pause();
                logger.debug('[geminiRemoteLauncher]: Stdin paused');
            } catch (e) {
                logger.debug('[geminiRemoteLauncher]: Failed to pause stdin:', e);
            }
        }

        // Clear screen when switching to local mode (AFTER stdin cleanup)
        if (switchToLocal && hasTTY) {
            console.clear();
            logger.debug('[geminiRemoteLauncher]: Screen cleared for local mode');
        }

        clearInterval(keepAliveInterval);
        messageBuffer.clear();

        logger.debug('[geminiRemoteLauncher]: Cleanup completed');
    }

    const returnValue = switchToLocal ? 'switch' : 'exit';
    logger.debug(`[geminiRemoteLauncher]: Returning '${returnValue}' to geminiLoop`);
    return returnValue;
}
