/**
 * Utility functions for Gemini SDK
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';

/**
 * Get the default path to Gemini CLI executable
 */
export function getDefaultGeminiPath(): string {
    // First, try to find gemini in common locations
    const possiblePaths = [
        // Global npm installation
        join(homedir(), '.npm', 'bin', 'gemini'),
        // Homebrew on macOS
        '/opt/homebrew/bin/gemini',
        '/usr/local/bin/gemini',
        // Linux global
        '/usr/bin/gemini',
    ];

    for (const p of possiblePaths) {
        if (existsSync(p)) {
            return p;
        }
    }

    // Default to just 'gemini' and let the system find it
    return 'gemini';
}

/**
 * Get clean environment for spawning Gemini
 * Removes node_modules/.bin from PATH to avoid conflicts
 */
export function getCleanEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (env.PATH) {
        // Remove local node_modules/.bin paths
        const pathSeparator = process.platform === 'win32' ? ';' : ':';
        const paths = env.PATH.split(pathSeparator);
        const cleanPaths = paths.filter(p => !p.includes('node_modules/.bin'));
        env.PATH = cleanPaths.join(pathSeparator);
    }

    return env;
}

/**
 * Log debug message if DEBUG env is set
 */
export function logDebug(message: string, ...args: unknown[]): void {
    if (process.env.DEBUG) {
        logger.debug(`[gemini-sdk] ${message}`, ...args);
    }
}

/**
 * Stream prompt messages to stdin
 */
export async function streamToStdin(
    prompt: AsyncIterable<{ type: string; content: string }>,
    stdin: NodeJS.WritableStream,
    abort?: AbortSignal
): Promise<void> {
    try {
        for await (const message of prompt) {
            if (abort?.aborted) {
                break;
            }
            stdin.write(JSON.stringify(message) + '\n');
        }
    } catch (error) {
        logDebug('Error streaming to stdin:', error);
    } finally {
        stdin.end();
    }
}

/**
 * Convert Gemini permission mode to CLI arguments
 */
export function getPermissionArgs(mode: string): string[] {
    switch (mode) {
        case 'yolo':
            return ['--yolo']; // Auto-accept all tool calls
        case 'safe-yolo':
            return ['--auto-accept']; // Auto-accept safe tool calls
        case 'read-only':
            return ['--sandbox', 'read-only'];
        case 'default':
        default:
            return [];
    }
}

/**
 * Parse Gemini CLI version from output
 */
export function parseGeminiVersion(output: string): string | null {
    const match = output.match(/gemini[- ]cli[- ]v?(\d+\.\d+\.\d+)/i);
    return match ? match[1] : null;
}

/**
 * Check if Gemini CLI is installed
 */
export async function isGeminiInstalled(): Promise<boolean> {
    const { spawn } = await import('node:child_process');

    return new Promise((resolve) => {
        const child = spawn('gemini', ['--version'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });

        let output = '';
        child.stdout?.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            resolve(code === 0);
        });

        child.on('error', () => {
            resolve(false);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
            child.kill();
            resolve(false);
        }, 5000);
    });
}
