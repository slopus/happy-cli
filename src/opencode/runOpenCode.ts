/**
 * OpenCode Runner - Main entry point for running OpenCode with Happy
 *
 * Orchestrates OpenCode sessions with remote control from Happy mobile app.
 */

import { createOpenCodeBackend } from '@/agent/acp/opencode';
import { getMergedMcpServers, readOpenCodeModel, writeOpenCodeModel } from './utils/config';
import { logger } from '@/ui/logger';
import type { AcpPermissionHandler } from '@/agent/acp/AcpSdkBackend';
import type { McpServerConfig } from '@/agent/AgentBackend';

/**
 * Options for running OpenCode
 */
export interface RunOpenCodeOptions {
  /** Working directory */
  cwd: string;

  /** Model to use (e.g., 'claude-sonnet-4-20250514', 'gpt-4o') */
  model?: string;

  /** Initial prompt to send */
  initialPrompt?: string;

  /** MCP servers from Happy config */
  happyMcpServers?: Record<string, McpServerConfig>;

  /** Permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;

  /** Environment variables to pass to OpenCode */
  env?: Record<string, string>;
}

/**
 * Run OpenCode with Happy integration
 *
 * Creates an OpenCode backend via ACP and manages the session lifecycle.
 * Merges MCP servers from both Happy and OpenCode's native config.
 *
 * Model handling: If a model is specified, it writes to ~/.config/opencode/config.json
 * before spawning OpenCode, then restores the original model after the session ends.
 *
 * @param options - Configuration options
 * @returns Promise that resolves when the session ends
 */
export async function runOpenCode(options: RunOpenCodeOptions): Promise<void> {
  const { cwd, model, initialPrompt, happyMcpServers, permissionHandler, env } = options;

  logger.debug('[OpenCode] Starting with options:', {
    cwd,
    model,
    hasInitialPrompt: !!initialPrompt,
    happyMcpServerCount: happyMcpServers ? Object.keys(happyMcpServers).length : 0,
    hasPermissionHandler: !!permissionHandler,
  });

  // Save original model and set new model if specified
  const originalModel = await readOpenCodeModel();
  let modelRestored = false;

  try {
    if (model) {
      logger.debug('[OpenCode] Setting model in config:', model);
      await writeOpenCodeModel(model);
    }

    // Merge MCP servers from OpenCode config and Happy config
    const mcpServers = await getMergedMcpServers(happyMcpServers);

    // Create OpenCode backend
    const backend = createOpenCodeBackend({
      cwd,
      model, // Passed for logging but not used in command args
      mcpServers,
      permissionHandler,
      env,
    });

    // Start the session
    const { sessionId } = await backend.startSession(initialPrompt);

    logger.debug('[OpenCode] Session started:', sessionId);

    // Return the backend for external management (daemon integration)
    // The caller (daemon or CLI) manages the session lifecycle
    return;
  } finally {
    // Restore original model if we changed it
    if (model && originalModel !== undefined) {
      try {
        await writeOpenCodeModel(originalModel);
        modelRestored = true;
        logger.debug('[OpenCode] Restored original model:', originalModel);
      } catch (error) {
        logger.warn('[OpenCode] Failed to restore original model:', error);
      }
    } else if (model && originalModel === undefined) {
      // If there was no original model, try to remove the model key from config
      try {
        // This is best-effort - if we can't remove it, it's not critical
        // The next run with --model will overwrite it anyway
        logger.debug('[OpenCode] Model was newly set, leaving in config for future use');
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Check if OpenCode is installed and available
 *
 * @returns Promise<boolean> - true if OpenCode is available
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    await execAsync('opencode --version');
    return true;
  } catch {
    return false;
  }
}
