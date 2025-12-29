/**
 * Gemini Local Mode - Spawn Gemini CLI Process
 *
 * This module spawns the Gemini CLI as a child process with inherited stdio,
 * allowing the user to interact directly with Gemini's native interface.
 *
 * Similar to claudeLocal.ts but adapted for Gemini CLI's API.
 */

import { spawn } from 'node:child_process';
import { logger } from '@/ui/logger';

export async function geminiLocal(opts: {
    abort: AbortSignal,
    sessionId: string | null,
    path: string,
    onSessionFound: (id: string) => void,
    model?: string,
    approvalMode?: string,
    allowedTools?: string[],
}): Promise<string | null> {
    logger.debug(`[GeminiLocal] Starting Gemini CLI in local mode`);
    logger.debug(`[GeminiLocal] Working directory: ${opts.path}`);
    logger.debug(`[GeminiLocal] Session ID: ${opts.sessionId || 'new'}`);

    // Build Gemini CLI arguments
    const args: string[] = [];

    // Session management
    if (opts.sessionId) {
        args.push('--resume', opts.sessionId);
        logger.debug(`[GeminiLocal] Resuming session: ${opts.sessionId}`);
    } else {
        logger.debug(`[GeminiLocal] Starting fresh session`);
    }

    // Model selection
    if (opts.model) {
        args.push('--model', opts.model);
        logger.debug(`[GeminiLocal] Using model: ${opts.model}`);
    }

    // Permission/approval mode
    if (opts.approvalMode) {
        args.push('--approval-mode', opts.approvalMode);
        logger.debug(`[GeminiLocal] Approval mode: ${opts.approvalMode}`);
    }

    // Allowed tools (pre-approved tools that don't need confirmation)
    if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push('--allowed-tools', ...opts.allowedTools);
        logger.debug(`[GeminiLocal] Allowed tools: ${opts.allowedTools.join(', ')}`);
    }

    logger.debug(`[GeminiLocal] Spawning: gemini ${args.join(' ')}`);

    // Spawn the Gemini CLI process
    try {
        await new Promise<void>((resolve, reject) => {
            const child = spawn('gemini', args, {
                stdio: ['inherit', 'inherit', 'inherit'],
                signal: opts.abort,
                cwd: opts.path,
                env: {
                    ...process.env,
                    // Gemini CLI environment variables
                    GEMINI_PROJECT_DIR: opts.path,
                }
            });

            child.on('error', (error) => {
                logger.debug('[GeminiLocal] Process error:', error);
                reject(error);
            });

            child.on('exit', (code, signal) => {
                if (signal === 'SIGTERM' && opts.abort.aborted) {
                    // Normal termination due to abort signal
                    logger.debug('[GeminiLocal] Process aborted by signal');
                    resolve();
                } else if (signal) {
                    logger.debug(`[GeminiLocal] Process terminated with signal: ${signal}`);
                    reject(new Error(`Gemini terminated with signal: ${signal}`));
                } else {
                    logger.debug(`[GeminiLocal] Process exited with code: ${code}`);
                    resolve();
                }
            });
        });
    } catch (error: any) {
        logger.debug('[GeminiLocal] Spawn failed:', error);
        if (error.code === 'ENOENT') {
            throw new Error('Gemini CLI not found. Please install it with: npm install -g @google/gemini-cli');
        }
        throw error;
    } finally {
        logger.debug('[GeminiLocal] Cleanup complete');
    }

    return opts.sessionId;
}
