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
  /** Model to use (passed via --model flag) */
  model?: string;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;
}

/**
 * Create an OpenCode backend using ACP.
 *
 * OpenCode must be installed and available in PATH.
 * Uses the `opencode acp` command to enable ACP mode.
 *
 * @param options - Configuration options
 * @returns AgentBackend instance for OpenCode
 */
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  // Add model flag if specified
  if (options.model) {
    args.push('--model', options.model);
  }

  // Add working directory
  if (options.cwd) {
    args.push('--cwd', options.cwd);
  }

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
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
