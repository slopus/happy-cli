/**
 * OpenCode ACP Backend - OpenCode agent via ACP
 *
 * This module provides a factory function for creating an OpenCode backend
 * that communicates using the Agent Client Protocol (ACP).
 *
 * OpenCode supports ACP natively via the `opencode acp` command.
 */

import { AcpSdkBackend, type AcpSdkBackendOptions, type AcpPermissionHandler } from './AcpSdkBackend';
import type { AgentBackend, McpServerConfig } from '../AgentBackend';
import { agentRegistry, type AgentFactoryOptions } from '../AgentRegistry';
import { logger } from '@/ui/logger';

/**
 * Options for creating an OpenCode ACP backend
 */
export interface OpenCodeBackendOptions extends AgentFactoryOptions {
  /** Model to use (written to config.json before spawning) */
  model?: string;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;

  /** Optional session ID to resume an existing session */
  resumeSessionId?: string;

  /** Session mode for this Happy session */
  sessionMode?: 'default' | 'yolo' | 'safe';
}

/**
 * Create an OpenCode backend using ACP.
 *
 * OpenCode must be installed and available in PATH.
 * Uses the `opencode acp` command to enable ACP mode.
 *
 * Note: Model is set via ~/.config/opencode/config.json, not via command line.
 * The `opencode acp` command does not support --model flag.
 *
 * @param options - Configuration options
 * @returns AgentBackend instance for OpenCode
 */
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  // Note: We don't pass --model flag because `opencode acp` doesn't support it.
  // Model should be set via ~/.config/opencode/config.json before spawning.
  // The model option is kept for API compatibility but handling is done by the caller.

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
    resumeSessionId: options.resumeSessionId,
    sessionMode: options.sessionMode,
  };

  logger.debug('[OpenCode] Creating ACP SDK backend with options:', {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    model: options.model,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
  });

  return new AcpSdkBackend(backendOptions);
}

/**
 * Register OpenCode backend with the global agent registry.
 *
 * This function should be called during application initialization
 * to make the OpenCode agent available for use.
 */
export function registerOpenCodeAgent(): void {
  agentRegistry.register('opencode', (opts) => createOpenCodeBackend(opts));
  logger.debug('[OpenCode] Registered with agent registry');
}
