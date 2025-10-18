/**
 * Directory watcher that monitors a directory and its subdirectories for file changes
 * Uses Node.js built-in fs/promises watch API with recursive support
 */

import { logger } from "@/ui/logger";
import { delay } from "@/utils/time";
import { watch } from "fs/promises";

export interface DirectoryWatcherOptions {
    /**
     * Whether to watch subdirectories recursively
     * @default true
     */
    recursive?: boolean;

    /**
     * Debounce delay in milliseconds to batch rapid changes
     * @default 100
     */
    debounceMs?: number;
}

/**
 * Start watching a directory for file changes
 * @param directory Directory path to watch
 * @param onChange Callback fired when files change (debounced)
 * @param options Watcher configuration options
 * @returns Cleanup function to stop watching
 */
export function startDirectoryWatcher(
    directory: string,
    onChange: (directory: string) => void,
    options: DirectoryWatcherOptions = {}
): () => void {
    const { recursive = true, debounceMs = 100 } = options;
    const abortController = new AbortController();

    let debounceTimer: NodeJS.Timeout | null = null;

    const triggerChange = () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            logger.debug(`[DIR_WATCHER] Directory changed: ${directory}`);
            onChange(directory);
            debounceTimer = null;
        }, debounceMs);
    };

    void (async () => {
        while (true) {
            try {
                logger.debug(`[DIR_WATCHER] Starting watcher for ${directory} (recursive: ${recursive})`);
                const watcher = watch(directory, {
                    persistent: true,
                    recursive,
                    signal: abortController.signal
                });

                for await (const event of watcher) {
                    if (abortController.signal.aborted) {
                        if (debounceTimer) {
                            clearTimeout(debounceTimer);
                        }
                        return;
                    }

                    logger.debug(`[DIR_WATCHER] Event: ${event.eventType}, filename: ${event.filename}`);
                    triggerChange();
                }
            } catch (e: any) {
                if (abortController.signal.aborted) {
                    if (debounceTimer) {
                        clearTimeout(debounceTimer);
                    }
                    return;
                }
                logger.debug(`[DIR_WATCHER] Watch error: ${e.message}, restarting watcher in a second`);
                await delay(1000);
            }
        }
    })();

    return () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        abortController.abort();
    };
}
