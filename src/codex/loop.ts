import { ApiClient } from '@/api/api';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { logger } from '@/ui/logger';
import { codexLocalLauncher } from './codexLocalLauncher';
import { codexRemoteLauncher } from './codexRemoteLauncher';
import type { CodexMode } from './mode';
import type { UUID } from 'node:crypto';
import type { SessionController } from './sessionController';

export type ControlMode = 'local' | 'remote';

export interface CodexLoopOptions {
    path: string;
    startingMode?: ControlMode;
    resumeArgs?: string[];
    resumeSessionId?: string;
    sessionTag?: UUID;
    sessionController: SessionController;
    api: ApiClient;
    mcpServers: Record<string, any>;
    messageQueue: MessageQueue2<CodexMode>;
    onModeChange: (mode: ControlMode) => void;
    onThinkingChange: (thinking: boolean) => void;
}

export async function codexLoop(opts: CodexLoopOptions) {
    let mode: ControlMode = opts.startingMode ?? 'local';
    let resumeArgs: string[] | undefined = opts.resumeArgs;
    let resumeFile: string | undefined;
    const resumeSessionId = opts.resumeSessionId;

    while (true) {
        logger.debug(`[codex-loop] Iteration with mode: ${mode}`);

        if (mode === 'local') {
            const result = await codexLocalLauncher({
                sessionController: opts.sessionController,
                path: opts.path,
                resumeArgs,
                resumeSessionId,
                sessionTag: opts.sessionTag,
                messageQueue: opts.messageQueue,
            });

            // Consume resume args after first local spawn
            resumeArgs = undefined;

            if (result.reason === 'exit') {
                return;
            }

            resumeFile = result.resumeFile ?? resumeFile;
            mode = 'remote';
            opts.onModeChange(mode);
            continue;
        }

        if (mode === 'remote') {
            const remoteResult = await codexRemoteLauncher({
                sessionController: opts.sessionController,
                api: opts.api,
                messageQueue: opts.messageQueue,
                mcpServers: opts.mcpServers,
                onThinkingChange: opts.onThinkingChange,
                resumeFile,
                resumeSessionId,
                sessionTag: opts.sessionTag,
            });

            resumeFile = undefined;

            if (remoteResult.reason === 'exit') {
                return;
            }

            mode = 'local';
            opts.onModeChange(mode);
            resumeArgs = remoteResult.resumeArgs;
            continue;
        }
    }
}
