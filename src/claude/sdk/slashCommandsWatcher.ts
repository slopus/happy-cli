/**
 * Slash Commands Watcher
 * Monitors .claude/commands directory for changes and updates session metadata
 */

import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { logger } from '@/ui/logger';
import { startDirectoryWatcher } from '@/modules/watcher/startDirectoryWatcher';
import { extractSDKMetadata, SDKMetadata } from './metadataExtractor';

export interface SlashCommandsWatcherOptions {
    /**
     * Working directory containing .claude/commands
     */
    cwd: string;

    /**
     * Callback fired when slash commands change
     */
    onSlashCommandsChange: (slashCommands: string[]) => void;

    /**
     * Debounce delay in milliseconds
     * @default 300
     */
    debounceMs?: number;
}

/**
 * Check if .claude/commands directory exists
 */
async function commandsDirectoryExists(cwd: string): Promise<boolean> {
    try {
        const commandsDir = join(cwd, '.claude', 'commands');
        const stats = await stat(commandsDir);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Start watching .claude/commands directory for changes
 * @returns Cleanup function to stop watching
 */
export function startSlashCommandsWatcher(
    options: SlashCommandsWatcherOptions
): () => void {
    const { cwd, onSlashCommandsChange, debounceMs = 300 } = options;
    const commandsDir = join(cwd, '.claude', 'commands');

    let stopWatcher: (() => void) | null = null;

    const handleDirectoryChange = async () => {
        logger.debug('[slashCommandsWatcher] Detecting changes, re-scanning slash commands...');

        try {
            // Re-extract metadata to get updated slash commands
            const metadata = await extractSDKMetadata(cwd);

            if (metadata.slashCommands && metadata.slashCommands.length > 0) {
                logger.debug(
                    `[slashCommandsWatcher] Found ${metadata.slashCommands.length} slash commands:`,
                    metadata.slashCommands
                );
                onSlashCommandsChange(metadata.slashCommands);
            } else {
                logger.debug('[slashCommandsWatcher] No slash commands found after change');
                onSlashCommandsChange([]);
            }
        } catch (error) {
            logger.debug('[slashCommandsWatcher] Error re-scanning slash commands:', error);
        }
    };

    // Initialize watcher async
    void (async () => {
        // Check if directory exists before starting watcher
        const exists = await commandsDirectoryExists(cwd);

        if (!exists) {
            logger.debug(`[slashCommandsWatcher] Commands directory does not exist: ${commandsDir}`);
            logger.debug('[slashCommandsWatcher] Skipping watcher initialization');
            return;
        }

        logger.debug(`[slashCommandsWatcher] Starting watcher for: ${commandsDir}`);

        stopWatcher = startDirectoryWatcher(
            commandsDir,
            handleDirectoryChange,
            {
                recursive: true,
                debounceMs
            }
        );
    })();

    return () => {
        if (stopWatcher) {
            logger.debug('[slashCommandsWatcher] Stopping watcher');
            stopWatcher();
            stopWatcher = null;
        }
    };
}
