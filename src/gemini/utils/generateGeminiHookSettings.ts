/**
 * Generate Gemini hook settings for session tracking
 *
 * Unlike Claude which uses a temporary settings file passed via --settings flag,
 * Gemini reads settings from .gemini/settings.json in the project directory.
 *
 * This module manages adding/removing the SessionStart hook to that file.
 */

import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';
import { resolve } from 'node:path';

/**
 * Add SessionStart hook to project's .gemini/settings.json
 *
 * @param port - The port where Happy's hook server is listening
 * @param projectDir - The project directory (cwd)
 * @returns Path to the settings file
 */
export function addGeminiHookToProject(port: number, projectDir: string): string {
    const geminiDir = join(projectDir, '.gemini');
    const settingsPath = join(geminiDir, 'settings.json');

    // Ensure .gemini directory exists
    mkdirSync(geminiDir, { recursive: true });

    // Path to the hook forwarder script (reuse Claude's!)
    const forwarderScript = resolve(projectPath(), 'scripts', 'session_hook_forwarder.cjs');
    const hookCommand = `node "${forwarderScript}" ${port}`;

    // Read existing settings or create new
    let settings: any = {};
    if (existsSync(settingsPath)) {
        try {
            const content = readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
            logger.debug(`[generateGeminiHookSettings] Read existing settings from ${settingsPath}`);
        } catch (error) {
            logger.debug(`[generateGeminiHookSettings] Failed to parse existing settings, starting fresh:`, error);
            settings = {};
        }
    }

    // Preserve existing hooks, add our SessionStart hook
    if (!settings.hooks) {
        settings.hooks = {};
    }

    // Add SessionStart hook (will replace if exists)
    // Match on "startup" and "resume" events
    settings.hooks.SessionStart = [
        {
            matcher: "startup|resume",
            hooks: [
                {
                    name: "happy-session-tracker",
                    type: "command",
                    command: hookCommand,
                    description: "Happy CLI session tracking hook",
                    timeout: 5000
                }
            ]
        }
    ];

    // Write back to file
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    logger.debug(`[generateGeminiHookSettings] Wrote hook settings to ${settingsPath}`);

    return settingsPath;
}

/**
 * Remove Happy's SessionStart hook from project's .gemini/settings.json
 *
 * @param projectDir - The project directory (cwd)
 */
export function removeGeminiHookFromProject(projectDir: string): void {
    const geminiDir = join(projectDir, '.gemini');
    const settingsPath = join(geminiDir, 'settings.json');

    if (!existsSync(settingsPath)) {
        logger.debug(`[generateGeminiHookSettings] No settings file to clean up`);
        return;
    }

    try {
        const content = readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content);

        if (settings.hooks && settings.hooks.SessionStart) {
            // Filter out our hook (by name)
            const filtered = settings.hooks.SessionStart.map((matcher: any) => {
                if (matcher.hooks) {
                    matcher.hooks = matcher.hooks.filter((hook: any) =>
                        hook.name !== 'happy-session-tracker'
                    );
                }
                return matcher;
            }).filter((matcher: any) => matcher.hooks && matcher.hooks.length > 0);

            if (filtered.length > 0) {
                settings.hooks.SessionStart = filtered;
            } else {
                delete settings.hooks.SessionStart;
            }

            // If no hooks left, remove hooks object
            if (Object.keys(settings.hooks).length === 0) {
                delete settings.hooks;
            }

            writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            logger.debug(`[generateGeminiHookSettings] Removed hook from ${settingsPath}`);
        }
    } catch (error) {
        logger.debug(`[generateGeminiHookSettings] Failed to cleanup hook:`, error);
    }
}

/**
 * Get the path to Gemini's project directory
 *
 * Gemini uses a hash of the project path for organization,
 * but we don't need to compute that - we just write hooks to
 * the project's .gemini/ directory and Gemini will find it.
 */
export function getGeminiProjectDir(projectPath: string): string {
    return projectPath;
}
