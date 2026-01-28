import { spawn } from 'node:child_process';
import type { UUID } from 'node:crypto';

import { logger } from '@/ui/logger';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { CodexMode } from './mode';
import { createCodexRolloutScanner, findLatestCodexRolloutForCwd, findSessionFileById } from './utils/rolloutScanner';
import { extractResumeSessionId } from './utils/resume';
import { ensureHappySessionTagForCodexSession } from './utils/codexSessionMap';
import type { SessionController } from './sessionController';
import { codexMessageToAcp, type CodexMessage } from './utils/codexAcp';

export type CodexLocalReason = 'switch' | 'exit';

export interface CodexLocalResult {
    reason: CodexLocalReason;
    resumeFile?: string | null;
}

export interface CodexLocalOptions {
    sessionController: SessionController;
    path: string;
    resumeArgs?: string[];
    resumeSessionId?: string;
    sessionTag?: UUID;
    messageQueue: MessageQueue2<CodexMode>;
}

export async function codexLocalLauncher(opts: CodexLocalOptions): Promise<CodexLocalResult> {
    logger.debug('[codex-local] Starting local launcher');

    const { getSession, onSessionSwap } = opts.sessionController;
    let session = getSession();
    let lastRolloutFile: string | null = null;
    const resumeSessionId = opts.resumeSessionId ?? extractResumeSessionId(opts.resumeArgs);

    if (resumeSessionId) {
        lastRolloutFile = await findSessionFileById(resumeSessionId);
    }

    const sendCodexMessage = (message: CodexMessage) => {
        session.sendCodexMessage(message);
        if (process.env.HAPPY_CODEX_ACP === '1') {
            const acpMessage = codexMessageToAcp(message);
            if (acpMessage) {
                session.sendAgentMessage('codex', acpMessage);
            }
        }
    };

    const scanner = await createCodexRolloutScanner({
        workingDirectory: opts.path,
        allowAll: opts.resumeArgs?.includes('--all') ?? false,
        resumeSessionId: resumeSessionId ?? undefined,
        onActiveSessionFile: (file, sessionId) => {
            lastRolloutFile = file;
            if (sessionId && opts.sessionTag) {
                void ensureHappySessionTagForCodexSession(sessionId, opts.sessionTag).catch((error) => {
                    logger.debug('[codex-local] Failed to store session tag mapping', error);
                });
            }
        },
        onCodexMessage: (message) => {
            sendCodexMessage(message);
        },
    });

    let exitReason: CodexLocalReason | null = null;
    const processAbortController = new AbortController();
    let childExit: Promise<void> | null = null;

    async function abortProcess() {
        if (!processAbortController.signal.aborted) {
            processAbortController.abort();
        }
        if (childExit) {
            await childExit;
        }
    }

    async function doSwitch() {
        logger.debug('[codex-local] Switching to remote mode');
        if (!exitReason) {
            exitReason = 'switch';
        }
        await abortProcess();
    }

    async function doAbort() {
        logger.debug('[codex-local] Abort requested');
        if (!exitReason) {
            exitReason = 'switch';
        }
        opts.messageQueue.reset();
        await abortProcess();
    }

    // Switch to remote when messages arrive
    opts.messageQueue.setOnMessage(() => {
        void doSwitch();
    });

    const bindSession = (nextSession: typeof session) => {
        session = nextSession;
        session.rpcHandlerManager.registerHandler('abort', doAbort);
        session.rpcHandlerManager.registerHandler('switch', doSwitch);
    };

    bindSession(session);
    const unsubscribe = onSessionSwap((nextSession) => {
        bindSession(nextSession);
    });

    if (opts.messageQueue.size() > 0 && !exitReason) {
        exitReason = 'switch';
    }

    try {
        let nextArgs = opts.resumeArgs;
        while (true) {
            if (exitReason) {
                break;
            }

            const args = nextArgs ?? [];
            nextArgs = undefined;
            logger.debug('[codex-local] Spawning codex', args);

            const env = { ...process.env };
            if (env.NO_COLOR) {
                delete env.NO_COLOR;
                logger.debug('[codex-local] Clearing NO_COLOR for local codex');
            }
            if (process.stdout.isTTY && !env.FORCE_COLOR) {
                env.FORCE_COLOR = '1';
            }

            if (process.stdin.isTTY) {
                try { process.stdin.setRawMode(false); } catch { }
            }
            if (process.stdout.isTTY) {
                process.stdout.write('\x1b[0m\x1b[?25h\x1b[39m\x1b[49m');
            }

            childExit = new Promise<void>((resolve) => {
                const child = spawn('codex', args, {
                    stdio: 'inherit',
                    cwd: opts.path,
                    env,
                });

                const abortHandler = () => {
                    if (!child.killed) {
                        child.kill('SIGTERM');
                    }
                };

                processAbortController.signal.addEventListener('abort', abortHandler);

                child.on('exit', () => {
                    processAbortController.signal.removeEventListener('abort', abortHandler);
                    resolve();
                });
                child.on('error', () => {
                    processAbortController.signal.removeEventListener('abort', abortHandler);
                    resolve();
                });
            });

            await childExit;

            if (!exitReason) {
                exitReason = 'exit';
            }
        }
    } finally {
        childExit = null;
        opts.messageQueue.setOnMessage(null);
        session.rpcHandlerManager.registerHandler('abort', async () => { });
        session.rpcHandlerManager.registerHandler('switch', async () => { });
        unsubscribe();
        await scanner.cleanup();
    }

    if (!lastRolloutFile) {
        const shouldPreferMtime = opts.resumeArgs?.includes('resume') || opts.resumeArgs?.includes('--resume');
        lastRolloutFile = await findLatestCodexRolloutForCwd(
            opts.path,
            opts.resumeArgs?.includes('--all') ?? false,
            { preferMtime: shouldPreferMtime }
        );
    }

    return { reason: exitReason || 'exit', resumeFile: lastRolloutFile };
}
