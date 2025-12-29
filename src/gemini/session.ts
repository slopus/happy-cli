/**
 * Gemini Session Management
 *
 * Manages session state for Gemini local/remote modes,
 * similar to Claude's Session class.
 */

import { ApiSessionClient } from '@/api/apiSession';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { logger } from '@/ui/logger';
import type { GeminiMode } from './types';

export class GeminiSession {
    public sessionId: string | null;
    public transcriptPath: string | null = null;
    public readonly client: ApiSessionClient;
    public readonly path: string;
    public readonly logPath: string;
    public readonly queue: MessageQueue2<GeminiMode>;
    public readonly onThinkingChange?: (thinking: boolean) => void;

    // Session found callbacks
    private sessionFoundCallbacks: Array<(sessionId: string) => void> = [];

    // Transcript path callbacks
    private transcriptPathCallbacks: Array<(path: string) => void> = [];

    constructor(opts: {
        client: ApiSessionClient;
        path: string;
        sessionId: string | null;
        logPath: string;
        queue: MessageQueue2<GeminiMode>;
        onThinkingChange?: (thinking: boolean) => void;
    }) {
        this.client = opts.client;
        this.path = opts.path;
        this.sessionId = opts.sessionId;
        this.logPath = opts.logPath;
        this.queue = opts.queue;
        this.onThinkingChange = opts.onThinkingChange;
    }

    /**
     * Called when a session ID is discovered (from SessionStart hook)
     */
    onSessionFound(sessionId: string): void {
        logger.debug(`[GeminiSession] Session found: ${sessionId}`);

        if (this.sessionId !== sessionId) {
            this.sessionId = sessionId;

            // Notify all callbacks
            for (const callback of this.sessionFoundCallbacks) {
                try {
                    callback(sessionId);
                } catch (error) {
                    logger.debug('[GeminiSession] Session found callback error:', error);
                }
            }
        }
    }

    /**
     * Called when transcript path is discovered (from SessionStart hook)
     */
    onTranscriptPathFound(transcriptPath: string): void {
        logger.debug(`[GeminiSession] Transcript path found: ${transcriptPath}`);

        if (this.transcriptPath !== transcriptPath) {
            this.transcriptPath = transcriptPath;

            // Notify all callbacks
            for (const callback of this.transcriptPathCallbacks) {
                try {
                    callback(transcriptPath);
                } catch (error) {
                    logger.debug('[GeminiSession] Transcript path callback error:', error);
                }
            }
        }
    }

    /**
     * Register a callback for when session ID is found
     */
    addSessionFoundCallback(callback: (sessionId: string) => void): void {
        this.sessionFoundCallbacks.push(callback);
    }

    /**
     * Remove a session found callback
     */
    removeSessionFoundCallback(callback: (sessionId: string) => void): void {
        const index = this.sessionFoundCallbacks.indexOf(callback);
        if (index !== -1) {
            this.sessionFoundCallbacks.splice(index, 1);
        }
    }

    /**
     * Register a callback for when transcript path is found
     */
    addTranscriptPathCallback(callback: (path: string) => void): void {
        this.transcriptPathCallbacks.push(callback);
    }

    /**
     * Remove a transcript path callback
     */
    removeTranscriptPathCallback(callback: (path: string) => void): void {
        const index = this.transcriptPathCallbacks.indexOf(callback);
        if (index !== -1) {
            this.transcriptPathCallbacks.splice(index, 1);
        }
    }
}
