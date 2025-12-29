/**
 * Gemini Mode Switching Loop
 *
 * Manages switching between local and remote modes for Gemini,
 * similar to Claude's loop.ts
 */

import { ApiSessionClient } from "@/api/apiSession";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { logger } from "@/ui/logger";
import { GeminiSession } from "./session";
import { geminiLocalLauncher } from "./geminiLocalLauncher";
import { ApiClient } from "@/lib";
import type { GeminiMode } from "./types";

interface GeminiLoopOptions {
    path: string;
    model?: string;
    approvalMode?: string;
    startingMode?: 'local' | 'remote';
    onModeChange: (mode: 'local' | 'remote') => void;
    session: ApiSessionClient;
    api: ApiClient;
    messageQueue: MessageQueue2<GeminiMode>;
    allowedTools?: string[];
    cloudToken?: string;
    onSessionReady?: (session: GeminiSession) => void;
}

export async function geminiLoop(opts: GeminiLoopOptions) {
    // Get log path for debug display
    const logPath = logger.logFilePath;

    // Create Gemini session
    let session = new GeminiSession({
        client: opts.session,
        path: opts.path,
        sessionId: null,
        logPath: logPath,
        queue: opts.messageQueue,
    });

    // Notify that session is ready
    if (opts.onSessionReady) {
        opts.onSessionReady(session);
    }

    let mode: 'local' | 'remote' = opts.startingMode ?? 'remote';

    while (true) {
        logger.debug(`[geminiLoop] Iteration with mode: ${mode}`);

        // Run local mode
        if (mode === 'local') {
            let reason = await geminiLocalLauncher(session, {
                model: opts.model,
                approvalMode: opts.approvalMode,
                allowedTools: opts.allowedTools,
            });

            if (reason === 'exit') {
                // Normal exit - Exit loop
                return;
            }

            // Non "exit" reason means we need to switch to remote mode
            mode = 'remote';
            if (opts.onModeChange) {
                opts.onModeChange(mode);
            }
            continue;
        }

        // Run remote mode
        if (mode === 'remote') {
            const { geminiRemoteLauncher } = await import('./geminiRemoteLauncher');

            let reason = await geminiRemoteLauncher({
                session: opts.session,
                api: opts.api,
                messageQueue: opts.messageQueue,
                model: opts.model,
                approvalMode: opts.approvalMode,
                allowedTools: opts.allowedTools,
                cloudToken: opts.cloudToken,
                sessionId: session.sessionId,
                onSessionFound: (sessionId: string) => {
                    logger.debug(`[geminiLoop] Session found in remote mode: ${sessionId}`);
                    session.onSessionFound(sessionId);
                },
            });

            if (reason === 'exit') {
                // Normal exit - Exit loop
                return;
            }

            // Non "exit" reason means we need to switch to local mode
            mode = 'local';
            if (opts.onModeChange) {
                opts.onModeChange(mode);
            }

            // Small delay to ensure remote mode stdin cleanup fully completes
            // before local mode spawns child (prevents stdin listener competition)
            await new Promise(resolve => setTimeout(resolve, 50));

            continue;
        }
    }
}
