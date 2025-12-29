/**
 * Gemini Session Scanner
 *
 * Watches Gemini's transcript JSONL file for new messages and forwards them
 * to Happy's session sync system.
 *
 * Similar to Claude's session scanner but adapted for Gemini's transcript format.
 */

import { watch, FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { logger } from '@/ui/logger';

/**
 * Message from Gemini's transcript
 * This is a simplified interface - adjust based on actual Gemini format
 */
export interface GeminiTranscriptMessage {
    sessionId?: string;
    messageId?: number;
    type?: string;
    message?: string;
    timestamp?: string;
    [key: string]: any;
}

export interface GeminiSessionScanner {
    cleanup: () => void;
    onNewSession: (transcriptPath: string) => void;
}

/**
 * Create a scanner that watches Gemini's transcript JSONL file
 *
 * @param opts.transcriptPath - Path to the JSONL transcript file from SessionStart hook
 * @param opts.onMessage - Callback when a new message is detected
 */
export async function createGeminiSessionScanner(opts: {
    transcriptPath: string | null;
    onMessage: (message: GeminiTranscriptMessage) => void;
}): Promise<GeminiSessionScanner> {
    let currentTranscriptPath: string | null = opts.transcriptPath;
    let watcher: FSWatcher | null = null;
    let processedLines = new Set<string>();
    let lastFileSize = 0;

    /**
     * Read and process new lines from the transcript file
     */
    async function processTranscript() {
        if (!currentTranscriptPath) {
            return;
        }

        if (!existsSync(currentTranscriptPath)) {
            logger.debug(`[GeminiScanner] Transcript file doesn't exist yet: ${currentTranscriptPath}`);
            return;
        }

        try {
            const content = await readFile(currentTranscriptPath, 'utf-8');
            const currentSize = content.length;

            // Only process if file has grown
            if (currentSize <= lastFileSize) {
                return;
            }

            lastFileSize = currentSize;

            const lines = content.split('\n');
            let newMessages = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || processedLines.has(trimmed)) {
                    continue;
                }

                try {
                    const message: GeminiTranscriptMessage = JSON.parse(trimmed);
                    processedLines.add(trimmed);
                    opts.onMessage(message);
                    newMessages++;
                    logger.debug(`[GeminiScanner] New message: type=${message.type}, messageId=${message.messageId}`);
                } catch (parseError) {
                    logger.debug(`[GeminiScanner] Failed to parse line as JSON:`, parseError);
                    // Skip invalid JSON lines
                }
            }

            if (newMessages > 0) {
                logger.debug(`[GeminiScanner] Processed ${newMessages} new messages`);
            }
        } catch (error) {
            logger.debug(`[GeminiScanner] Error reading transcript:`, error);
        }
    }

    /**
     * Start watching the transcript file
     */
    function startWatching() {
        if (!currentTranscriptPath) {
            logger.debug(`[GeminiScanner] No transcript path, skipping watch`);
            return;
        }

        // Stop existing watcher if any
        if (watcher) {
            watcher.close();
            watcher = null;
        }

        logger.debug(`[GeminiScanner] Starting watch on: ${currentTranscriptPath}`);

        // Initial scan
        processTranscript().catch((error) => {
            logger.debug(`[GeminiScanner] Initial scan error:`, error);
        });

        // Watch for changes
        try {
            watcher = watch(currentTranscriptPath, { persistent: false }, (eventType) => {
                if (eventType === 'change') {
                    processTranscript().catch((error) => {
                        logger.debug(`[GeminiScanner] Watch callback error:`, error);
                    });
                }
            });

            watcher.on('error', (error) => {
                logger.debug(`[GeminiScanner] Watcher error:`, error);
            });
        } catch (error) {
            logger.debug(`[GeminiScanner] Failed to start watch:`, error);
        }
    }

    // Start watching if we have a path
    if (currentTranscriptPath) {
        startWatching();
    }

    return {
        /**
         * Update to a new transcript path (when session changes)
         */
        onNewSession: (newTranscriptPath: string) => {
            logger.debug(`[GeminiScanner] Switching to new transcript: ${newTranscriptPath}`);
            currentTranscriptPath = newTranscriptPath;
            processedLines.clear();
            lastFileSize = 0;
            startWatching();
        },

        /**
         * Stop watching and cleanup
         */
        cleanup: () => {
            logger.debug(`[GeminiScanner] Cleanup`);
            if (watcher) {
                watcher.close();
                watcher = null;
            }
            processedLines.clear();
            lastFileSize = 0;
        }
    };
}
