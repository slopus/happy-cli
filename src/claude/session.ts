import { RestApiClient, SessionApiClient } from "happy-api-client";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { EnhancedMode } from "./loop";
import { logger } from "@/ui/logger";
import { PushNotificationClient } from "@/api/pushNotifications";

export class Session {
    readonly path: string;
    readonly logPath: string;
    readonly api: RestApiClient;
    readonly pushClient: PushNotificationClient;
    readonly client: SessionApiClient;
    readonly queue: MessageQueue2<EnhancedMode>;
    readonly claudeEnvVars?: Record<string, string>;
    claudeArgs: string[]; // Mutable local Claude args that can be modified during the session
    readonly mcpServers: Record<string, any>;
    readonly _onModeChange: (mode: 'local' | 'remote') => void;

    sessionId: string | null;
    mode: 'local' | 'remote' = 'local';
    thinking: boolean = false;

    constructor(opts: {
        api: RestApiClient,
        pushClient: PushNotificationClient,
        client: SessionApiClient,
        path: string,
        logPath: string,
        sessionId: string | null,
        claudeEnvVars?: Record<string, string>,
        claudeArgs?: string[],
        mcpServers: Record<string, any>,
        messageQueue: MessageQueue2<EnhancedMode>,
        onModeChange: (mode: 'local' | 'remote') => void,
    }) {
        this.path = opts.path;
        this.api = opts.api;
        this.pushClient = opts.pushClient;
        this.client = opts.client;
        this.logPath = opts.logPath;
        this.sessionId = opts.sessionId;
        this.queue = opts.messageQueue;
        this.claudeEnvVars = opts.claudeEnvVars;
        this.claudeArgs = [...(opts.claudeArgs || [])]; // Make a copy to allow modification
        this.mcpServers = opts.mcpServers;
        this._onModeChange = opts.onModeChange;

        // Start keep alive
        this.client.keepAlive(this.thinking, this.mode);
        setInterval(() => {
            this.client.keepAlive(this.thinking, this.mode);
        }, 2000);
    }

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking;
        this.client.keepAlive(thinking, this.mode);
    }

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.client.keepAlive(this.thinking, mode);
        this._onModeChange(mode);
    }

    onSessionFound = (sessionId: string) => {
        this.sessionId = sessionId;
    }

    /**
     * Clear the current session ID (used by /clear command)
     */
    clearSessionId = (): void => {
        this.sessionId = null;
        logger.debug('[Session] Session ID cleared');
    }

    /**
     * Clear one-time Claude flags after first use
     * This includes --resume and --continue which should only be used once
     */
    clearOneTimeClaudeArgsLikeResume = (): void => {
        const oneTimeFlags = ['--resume', '--continue'];
        const newArgs: string[] = [];

        let skipNext = false;
        for (let i = 0; i < this.claudeArgs.length; i++) {
            if (skipNext) {
                skipNext = false;
                continue;
            }

            const arg = this.claudeArgs[i];

            // Check if this is a one-time flag
            if (oneTimeFlags.includes(arg)) {
                // Skip this flag and its value if it has one
                if (arg === '--resume' && i + 1 < this.claudeArgs.length) {
                    skipNext = true; // Skip the session ID value
                }
                logger.debug(`[Session] Cleared one-time flag: ${arg}`);
                continue;
            }

            newArgs.push(arg);
        }

        this.claudeArgs = newArgs;
    }
}