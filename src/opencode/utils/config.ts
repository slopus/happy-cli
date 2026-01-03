/**
 * OpenCode configuration utilities
 *
 * Reads OpenCode's native config from ~/.config/opencode/config.json
 * and provides MCP server merging with Happy's config.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';
import { OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE } from '../constants';
import type { McpServerConfig } from '@/agent/AgentBackend';

/**
 * OpenCode config.json structure (partial - only what we need)
 */
export interface OpenCodeConfig {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Read OpenCode's native config file
 *
 * @returns Parsed config or empty object if not found/invalid
 */
export async function readOpenCodeConfig(): Promise<OpenCodeConfig> {
  const configPath = join(homedir(), OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE);

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as OpenCodeConfig;
    logger.debug('[OpenCode] Read config from:', configPath);
    return config;
  } catch {
    // Config not found or invalid - return empty
    logger.debug('[OpenCode] No config found at:', configPath);
    return {};
  }
}

/**
 * Convert OpenCode MCP server format to Happy's format
 */
export function convertOpenCodeMcpServers(
  openCodeServers: OpenCodeConfig['mcpServers']
): Record<string, McpServerConfig> {
  if (!openCodeServers) return {};

  const result: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(openCodeServers)) {
    result[name] = {
      command: config.command,
      args: config.args,
      env: config.env,
    };
  }

  return result;
}

/**
 * Get merged MCP servers from OpenCode config and Happy config
 *
 * OpenCode's servers are loaded first, then Happy's overlay on top.
 * If both define the same server name, Happy's version wins.
 *
 * @param happyServers - MCP servers from Happy's configuration
 * @returns Merged MCP server configuration
 */
export async function getMergedMcpServers(
  happyServers?: Record<string, McpServerConfig>
): Promise<Record<string, McpServerConfig>> {
  const openCodeConfig = await readOpenCodeConfig();
  const openCodeServers = convertOpenCodeMcpServers(openCodeConfig.mcpServers);

  const merged = {
    ...openCodeServers,
    ...(happyServers ?? {}), // Happy takes precedence
  };

  logger.debug('[OpenCode] Merged MCP servers:', {
    fromOpenCode: Object.keys(openCodeServers),
    fromHappy: Object.keys(happyServers ?? {}),
    merged: Object.keys(merged),
  });

  return merged;
}
