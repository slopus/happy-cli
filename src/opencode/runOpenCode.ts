/**
 * OpenCode Runner - Main entry point for running OpenCode with Happy
 *
 * Orchestrates OpenCode sessions with remote control from Happy mobile app.
 */

import { createOpenCodeBackend } from '@/agent/acp/opencode';
import { getMergedMcpServers } from './utils/config';
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

  // Merge MCP servers from OpenCode config and Happy config
  const mcpServers = await getMergedMcpServers(happyMcpServers);

  // Create OpenCode backend
  const backend = createOpenCodeBackend({
    cwd,
    model,
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
