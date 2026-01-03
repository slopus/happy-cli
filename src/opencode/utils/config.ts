/**
 * OpenCode configuration utilities
 *
 * Reads OpenCode's native config from ~/.config/opencode/config.json
 * and provides MCP server merging with Happy's config.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';
import { OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE } from '../constants';
import type { McpServerConfig } from '@/agent/AgentBackend';

/**
 * OpenCode config.json structure (partial - only what we need)
 */
export interface OpenCodeConfig {
  model?: string;
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

/**
 * Read the current model from OpenCode config
 *
 * @returns Current model or undefined if not set
 */
export async function readOpenCodeModel(): Promise<string | undefined> {
  const config = await readOpenCodeConfig();
  return config.model;
}

/**
 * Write model to OpenCode config
 * Creates config directory and file if they don't exist
 *
 * @param model - Model to set (e.g., 'anthropic/claude-sonnet-4-20250514')
 */
export async function writeOpenCodeModel(model: string): Promise<void> {
  const configDir = join(homedir(), OPENCODE_CONFIG_DIR);
  const configPath = join(configDir, OPENCODE_CONFIG_FILE);

  try {
    // Ensure config directory exists
    await mkdir(configDir, { recursive: true });

    // Read existing config or create new
    let config: OpenCodeConfig = {};
    try {
      const content = await readFile(configPath, 'utf-8');
      config = JSON.parse(content) as OpenCodeConfig;
    } catch {
      // Config doesn't exist or is invalid, start fresh
    }

    // Update model
    config.model = model;

    // Write back
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.debug('[OpenCode] Wrote model to config:', { model, configPath });
  } catch (error) {
    logger.warn('[OpenCode] Failed to write model to config:', error);
    throw error;
  }
}
