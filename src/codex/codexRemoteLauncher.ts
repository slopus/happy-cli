import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import type { UUID } from 'node:crypto';

import { ApiClient } from '@/api/api';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { logger } from '@/ui/logger';
import { CodexMcpClient } from './codexMcpClient';
import { CodexPermissionHandler } from './utils/permissionHandler';
import { ReasoningProcessor } from './utils/reasoningProcessor';
import { DiffProcessor } from './utils/diffProcessor';
import type { CodexMode } from './mode';
import { emitReadyIfIdle } from './utils/ready';
import { findSessionFileById, readSessionMeta } from './utils/rolloutScanner';
import { CodexSessionConfig } from './types';
import { CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import { RemoteModeDisplay } from '@/ui/ink/RemoteModeDisplay';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { ensureHappySessionTagForCodexSession } from './utils/codexSessionMap';
import type { SessionController } from './sessionController';
import { codexMessageToAcp, type CodexMessage } from './utils/codexAcp';

export async function codexRemoteLauncher(opts: {
    sessionController: SessionController;
    api: ApiClient;
    messageQueue: MessageQueue2<CodexMode>;
    mcpServers: Record<string, any>;
    onThinkingChange: (thinking: boolean) => void;
    resumeFile?: string;
    resumeSessionId?: string;
    sessionTag?: UUID;
}): Promise<{ reason: 'switch' | 'exit'; resumeArgs?: string[] }> {
    logger.debug('[codex-remote] Starting remote launcher');

    const { api, messageQueue, mcpServers, onThinkingChange } = opts;
    const { getSession, onSessionSwap } = opts.sessionController;
    let session = getSession();

    // Configure terminal
    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
    let messageBuffer = new MessageBuffer();
    let inkInstance: any = null;

    let exitReason: 'switch' | 'exit' | null = null;
    let activeRolloutFile: string | null = opts.resumeFile ?? null;
    const resumeSessionId = opts.resumeSessionId;

    if (!activeRolloutFile && resumeSessionId) {
        activeRolloutFile = await findSessionFileById(resumeSessionId);
    }

    if (hasTTY) {
        console.clear();
        inkInstance = render(React.createElement(RemoteModeDisplay, {
            messageBuffer,
            logPath: process.env.DEBUG ? logger.logFilePath : undefined,
            onExit: async () => {
                logger.debug('[codex-remote] Exiting client via Ctrl-C');
                if (!exitReason) {
                    exitReason = 'exit';
                }
                shouldExit = true;
                await doAbort();
            },
            onSwitchToLocal: () => {
                logger.debug('[codex-remote] Switching to local mode');
                void doSwitch();
            },
            title: 'Codex',
        }), { exitOnCtrlC: false, patchConsole: false });
    }

    if (hasTTY) {
        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding('utf8');
    }

    const client = new CodexMcpClient();
    const permissionHandler = new CodexPermissionHandler(session);
    const sendCodexMessage = (message: CodexMessage) => {
        const activeSession = getSession();
        activeSession.sendCodexMessage(message);
        if (process.env.HAPPY_CODEX_ACP === '1') {
            const acpMessage = codexMessageToAcp(message);
            if (acpMessage) {
                activeSession.sendAgentMessage('codex', acpMessage);
            }
        }
    };
    const reasoningProcessor = new ReasoningProcessor((message) => {
        sendCodexMessage(message);
    });
    const diffProcessor = new DiffProcessor((message) => {
        sendCodexMessage(message);
    });

    client.setPermissionHandler(permissionHandler);

    let thinking = false;
    let shouldExit = false;
    let wasCreated = false;
    let currentModeHash: string | null = null;
    let first = true;
    let turnAbortController = new AbortController();
    let mappedSessionId: string | null = null;

    const maybeStoreSessionId = (sessionId?: string | null) => {
        if (!sessionId || !opts.sessionTag) {
            return;
        }
        if (mappedSessionId === sessionId) {
            return;
        }
        mappedSessionId = sessionId;
        void ensureHappySessionTagForCodexSession(sessionId, opts.sessionTag).catch((error) => {
            logger.debug('[codex-remote] Failed to store session tag mapping', error);
        });
    };

    const sendReady = () => {
        const activeSession = getSession();
        activeSession.sendSessionEvent({ type: 'ready' });
        try {
            api.push().sendToAllDevices("It's ready!", 'Codex is waiting for your command', { sessionId: activeSession.sessionId });
        } catch (pushError) {
            logger.debug('[Codex] Failed to send ready push', pushError);
        }
    };

    const handleAbort = async () => {
        logger.debug('[codex-remote] Abort requested - stopping current task');
        try {
            turnAbortController.abort();
            messageQueue.reset();
            permissionHandler.reset();
            reasoningProcessor.abort();
            diffProcessor.reset();
            thinking = false;
            onThinkingChange(false);
        } finally {
            turnAbortController = new AbortController();
        }
    };

    const doAbort = async () => {
        await handleAbort();
    };

    const doSwitch = async () => {
        if (!exitReason) {
            exitReason = 'switch';
        }
        shouldExit = true;
        await handleAbort();
    };

    const bindSession = (nextSession: typeof session) => {
        session = nextSession;
        permissionHandler.updateSession(nextSession);
        nextSession.rpcHandlerManager.registerHandler('abort', doAbort);
        nextSession.rpcHandlerManager.registerHandler('switch', doSwitch);
    };

    bindSession(session);
    const unsubscribe = onSessionSwap((nextSession) => {
        bindSession(nextSession);
    });

    client.setHandler((msg) => {
        logger.debug(`[Codex] MCP message: ${JSON.stringify(msg)}`);

        if (msg.type === 'agent_message') {
            messageBuffer.addMessage(msg.message, 'assistant');
        } else if (msg.type === 'agent_reasoning_delta') {
            // Skip reasoning deltas in the UI to reduce noise
        } else if (msg.type === 'agent_reasoning') {
            messageBuffer.addMessage(`[Thinking] ${msg.text.substring(0, 100)}...`, 'system');
        } else if (msg.type === 'exec_command_begin') {
            messageBuffer.addMessage(`Executing: ${msg.command}`, 'tool');
        } else if (msg.type === 'exec_command_end') {
            const output = msg.output || msg.error || 'Command completed';
            const truncatedOutput = output.substring(0, 200);
            messageBuffer.addMessage(
                `Result: ${truncatedOutput}${output.length > 200 ? '...' : ''}`,
                'result'
            );
        } else if (msg.type === 'task_started') {
            messageBuffer.addMessage('Starting task...', 'status');
        } else if (msg.type === 'task_complete') {
            messageBuffer.addMessage('Task completed', 'status');
            sendReady();
        } else if (msg.type === 'turn_aborted') {
            messageBuffer.addMessage('Turn aborted', 'status');
            sendReady();
        }

        if (msg.type === 'task_started') {
            if (!thinking) {
                thinking = true;
                onThinkingChange(true);
            }
        }
        if (msg.type === 'task_complete' || msg.type === 'turn_aborted') {
            if (thinking) {
                thinking = false;
                onThinkingChange(false);
            }
            diffProcessor.reset();
        }
        if (msg.type === 'agent_reasoning_section_break') {
            reasoningProcessor.handleSectionBreak();
        }
        if (msg.type === 'agent_reasoning_delta') {
            reasoningProcessor.processDelta(msg.delta);
        }
        if (msg.type === 'agent_reasoning') {
            reasoningProcessor.complete(msg.text);
        }
        if (msg.type === 'agent_message') {
            sendCodexMessage({
                type: 'message',
                message: msg.message,
                id: randomUUID(),
            });
        }
        if (msg.type === 'exec_command_begin' || msg.type === 'exec_approval_request') {
            let { call_id, type, ...inputs } = msg;
            sendCodexMessage({
                type: 'tool-call',
                name: 'CodexBash',
                callId: call_id,
                input: inputs,
                id: randomUUID(),
            });
        }
        if (msg.type === 'exec_command_end') {
            let { call_id, type, ...output } = msg;
            sendCodexMessage({
                type: 'tool-call-result',
                callId: call_id,
                output: output,
                id: randomUUID(),
            });
        }
        if (msg.type === 'token_count') {
            sendCodexMessage({
                ...msg,
                id: randomUUID(),
            });
        }
        if (msg.type === 'patch_apply_begin') {
            let { call_id, auto_approved, changes } = msg;
            const changeCount = Object.keys(changes).length;
            const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
            messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');
            sendCodexMessage({
                type: 'tool-call',
                name: 'CodexPatch',
                callId: call_id,
                input: {
                    auto_approved,
                    changes,
                },
                id: randomUUID(),
            });
        }
        if (msg.type === 'patch_apply_end') {
            let { call_id, stdout, stderr, success } = msg;
            if (success) {
                const message = stdout || 'Files modified successfully';
                messageBuffer.addMessage(message.substring(0, 200), 'result');
            } else {
                const errorMsg = stderr || 'Failed to modify files';
                messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
            }
            sendCodexMessage({
                type: 'tool-call-result',
                callId: call_id,
                output: {
                    stdout,
                    stderr,
                    success,
                },
                id: randomUUID(),
            });
        }
        if (msg.type === 'turn_diff') {
            if (msg.unified_diff) {
                diffProcessor.processDiff(msg.unified_diff);
            }
        }

        if (!activeRolloutFile) {
            const sessionId = client.getSessionId();
            if (sessionId) {
                maybeStoreSessionId(sessionId);
                void findSessionFileById(sessionId).then((file) => {
                    if (file) {
                        activeRolloutFile = file;
                    }
                });
            }
        }
    });

    try {
        await client.connect();

        while (!shouldExit) {
            const waitSignal = turnAbortController.signal;
            const message = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
            if (!message) {
                if (waitSignal.aborted && !shouldExit) {
                    logger.debug('[codex-remote] Wait aborted while idle; continuing');
                    continue;
                }
                break;
            }

            if (wasCreated && currentModeHash && message.hash !== currentModeHash) {
                logger.debug('[codex-remote] Mode changed - restarting codex session');
                client.clearSession();
                wasCreated = false;
                currentModeHash = null;
            }

            messageBuffer.addMessage(message.message, 'user');
            currentModeHash = message.hash;

            try {
                const approvalPolicy = (() => {
                    switch (message.mode.permissionMode) {
                        case 'default': return 'untrusted' as const;
                        case 'read-only': return 'never' as const;
                        case 'safe-yolo': return 'on-failure' as const;
                        case 'yolo': return 'on-failure' as const;
                        default: return 'untrusted' as const;
                    }
                })();
                const sandbox = (() => {
                    switch (message.mode.permissionMode) {
                        case 'default': return 'workspace-write' as const;
                        case 'read-only': return 'read-only' as const;
                        case 'safe-yolo': return 'workspace-write' as const;
                        case 'yolo': return 'danger-full-access' as const;
                        default: return 'workspace-write' as const;
                    }
                })();

                if (!wasCreated) {
                    const shouldChangeTitle = !opts.resumeFile && !opts.resumeSessionId;
                    const startConfig: CodexSessionConfig = {
                        prompt: first && shouldChangeTitle
                            ? message.message + '\n\n' + CHANGE_TITLE_INSTRUCTION
                            : message.message,
                        sandbox,
                        'approval-policy': approvalPolicy,
                        config: { mcp_servers: mcpServers },
                        cwd: process.cwd(),
                    };
                    if (message.mode.model) {
                        startConfig.model = message.mode.model;
                    }
                    if (opts.resumeFile) {
                        startConfig['resume-path'] = opts.resumeFile;
                        logger.debug('[codex-remote] Resuming from rollout:', opts.resumeFile);
                    }

                    await client.startSession(startConfig, { signal: turnAbortController.signal });
                    if (!activeRolloutFile) {
                        const sessionId = client.getSessionId();
                        if (sessionId) {
                            maybeStoreSessionId(sessionId);
                            activeRolloutFile = await findSessionFileById(sessionId);
                        }
                    }
                    wasCreated = true;
                    first = false;
                } else {
                    await client.continueSession(message.message, { signal: turnAbortController.signal });
                }
            } catch (error) {
                const isAbortError = error instanceof Error && error.name === 'AbortError';
                if (isAbortError) {
                    messageBuffer.addMessage('Aborted by user', 'status');
                    getSession().sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                    wasCreated = false;
                    currentModeHash = null;
                } else {
                    messageBuffer.addMessage('Process exited unexpectedly', 'status');
                    getSession().sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                }
            } finally {
                permissionHandler.reset();
                reasoningProcessor.abort();
                diffProcessor.reset();
                thinking = false;
                onThinkingChange(false);
                emitReadyIfIdle({
                    pending: null,
                    queueSize: () => messageQueue.size(),
                    shouldExit,
                    sendReady,
                });
            }
        }
    } finally {
        const activeSession = getSession();
        activeSession.rpcHandlerManager.registerHandler('abort', async () => { });
        activeSession.rpcHandlerManager.registerHandler('switch', async () => { });

        if (hasTTY && process.stdin.isTTY) {
            try { process.stdin.setRawMode(false); } catch { }
        }
        if (hasTTY) {
            try { process.stdin.pause(); } catch { }
        }
        inkInstance?.unmount?.();
        await client.disconnect();
        unsubscribe();
    }

    const reason: 'switch' | 'exit' = exitReason === 'switch' ? 'switch' : 'exit';
    let resumeArgs: string[] | undefined;
    if (exitReason === 'switch') {
        let sessionId = resumeSessionId ?? client.getSessionId() ?? undefined;
        if (!resumeSessionId && activeRolloutFile) {
            const meta = await readSessionMeta(activeRolloutFile);
            if (meta?.id) {
                sessionId = meta.id;
            }
        }
        if (sessionId) {
            maybeStoreSessionId(sessionId);
            resumeArgs = ['resume', sessionId];
        } else {
            resumeArgs = ['resume', '--last'];
        }
    }
    return { reason, resumeArgs };
}
