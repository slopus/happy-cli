/**
 * CodeBuddy ACP Backend - CodeBuddy Code agent via ACP
 * 
 * This module provides a factory function for creating a CodeBuddy backend
 * that communicates using the Agent Client Protocol (ACP).
 * 
 * CodeBuddy Code supports ACP for external tool integration and communication.
 */

import { AcpSdkBackend, type AcpSdkBackendOptions, type AcpPermissionHandler } from './AcpSdkBackend';
import type { AgentBackend, McpServerConfig } from '../AgentBackend';
import { agentRegistry, type AgentFactoryOptions } from '../AgentRegistry';
import { logger } from '@/ui/logger';
import { 
  CODEBUDDY_API_KEY_ENV, 
  CODEBUDDY_MODEL_ENV, 
  DEFAULT_CODEBUDDY_MODEL,
  CODEBUDDY_CLI_COMMAND
} from '@/codebuddy/constants';
import { 
  readCodebuddyLocalConfig, 
  determineCodebuddyModel,
  getCodebuddyModelSource
} from '@/codebuddy/utils/config';

/**
 * Options for creating a CodeBuddy ACP backend
 */
export interface CodebuddyBackendOptions extends AgentFactoryOptions {
  /** API key for CodeBuddy (defaults to CODEBUDDY_API_KEY env var) */
  apiKey?: string;
  
  /** OAuth token from Happy cloud - highest priority */
  cloudToken?: string;
  
  /** Model to use. If undefined, will use local config, env var, or default.
   *  If explicitly set to null, will use default (skip local config).
   *  (defaults to CODEBUDDY_MODEL env var or 'claude-sonnet-4-20250514') */
  model?: string | null;
  
  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;
  
  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;
}

/**
 * Create a CodeBuddy backend using ACP (official SDK).
 * 
 * The CodeBuddy CLI must be installed and available in PATH.
 * Uses ACP mode for communication.
 * 
 * @param options - Configuration options
 * @returns AgentBackend instance for CodeBuddy
 */
export function createCodebuddyBackend(options: CodebuddyBackendOptions): AgentBackend {

  // Resolve API key from multiple sources (in priority order):
  // 1. Happy cloud OAuth token
  // 2. Local CodeBuddy config files (~/.codebuddy/)
  // 3. CODEBUDDY_API_KEY environment variable
  // 4. Explicit apiKey option
  
  // Try reading from local CodeBuddy config (token and model)
  const localConfig = readCodebuddyLocalConfig();
  
  let apiKey = options.cloudToken       // 1. Happy cloud token (passed from runCodebuddy)
    || localConfig.token                // 2. Local config (~/.codebuddy/)
    || process.env[CODEBUDDY_API_KEY_ENV]  // 3. CODEBUDDY_API_KEY env var
    || options.apiKey;                  // 4. Explicit apiKey option (fallback)

  if (!apiKey) {
    logger.warn(`[CodeBuddy] No API key found. Set ${CODEBUDDY_API_KEY_ENV} environment variable or configure authentication.`);
  }

  // Command to run codebuddy
  const codebuddyCommand = CODEBUDDY_CLI_COMMAND;
  
  // Get model from options, local config, system environment, or use default
  const model = determineCodebuddyModel(options.model, localConfig);

  // Build args - use ACP mode flag
  // Note: The actual flag might need to be adjusted based on CodeBuddy CLI implementation
  const codebuddyArgs = ['--acp'];

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'codebuddy',
    cwd: options.cwd,
    command: codebuddyCommand,
    args: codebuddyArgs,
    env: {
      ...options.env,
      ...(apiKey ? { [CODEBUDDY_API_KEY_ENV]: apiKey } : {}),
      // Pass model via env var
      [CODEBUDDY_MODEL_ENV]: model,
      // Suppress debug output to avoid stdout pollution
      NODE_ENV: 'production',
      DEBUG: '',
    },
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
  };

  // Determine model source for logging
  const modelSource = getCodebuddyModelSource(options.model, localConfig);
  
  logger.debug('[CodeBuddy] Creating ACP SDK backend with options:', {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    hasApiKey: !!apiKey,
    model: model,
    modelSource: modelSource,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
  });

  return new AcpSdkBackend(backendOptions);
}

/**
 * Register CodeBuddy backend with the global agent registry.
 * 
 * This function should be called during application initialization
 * to make the CodeBuddy agent available for use.
 */
export function registerCodebuddyAgent(): void {
  agentRegistry.register('codebuddy', (opts) => createCodebuddyBackend(opts));
  logger.debug('[CodeBuddy] Registered with agent registry');
}
