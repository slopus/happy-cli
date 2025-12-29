/**
 * Gemini path utilities
 *
 * Helper functions for Gemini-specific file paths
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Get the Gemini config directory for a project
 *
 * @param projectPath - The project working directory
 * @returns Path to .gemini directory
 */
export function getGeminiProjectConfigDir(projectPath: string): string {
    return join(projectPath, '.gemini');
}

/**
 * Get the Gemini global config directory
 *
 * @returns Path to ~/.gemini
 */
export function getGeminiGlobalConfigDir(): string {
    return join(homedir(), '.gemini');
}

/**
 * Get the Gemini settings file path for a project
 *
 * @param projectPath - The project working directory
 * @returns Path to .gemini/settings.json
 */
export function getGeminiSettingsPath(projectPath: string): string {
    return join(getGeminiProjectConfigDir(projectPath), 'settings.json');
}
