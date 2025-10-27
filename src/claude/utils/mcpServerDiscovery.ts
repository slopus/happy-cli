/**
 * Utilities for discovering and enumerating MCP servers
 *
 * Reads MCP server configuration from Claude's settings.json and provides
 * structured information about configured servers and their capabilities.
 */

import { readClaudeSettings } from './claudeSettings';
import { logger } from '@/ui/logger';

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: 'stdio' | 'http';
  [key: string]: any;
}

export interface MCPServerInfo {
  name: string;
  config: MCPServerConfig;
  status: 'configured' | 'unknown';
  tools?: string[];
  resources?: string[];
  prompts?: string[];
}

/**
 * Read MCP server configurations from Claude's settings.json
 *
 * @returns Record of server name to configuration, or empty object if not found
 */
export function readMCPServerConfigs(): Record<string, MCPServerConfig> {
  try {
    const settings = readClaudeSettings();

    if (!settings) {
      logger.debug('[MCPDiscovery] No Claude settings found');
      return {};
    }

    // MCP servers are stored under the 'mcpServers' key in Claude settings
    const mcpServers = settings.mcpServers || settings.mcp_servers;

    if (!mcpServers || typeof mcpServers !== 'object') {
      logger.debug('[MCPDiscovery] No mcpServers configuration found in Claude settings');
      return {};
    }

    logger.debug(`[MCPDiscovery] Found ${Object.keys(mcpServers).length} MCP server(s) configured`);
    return mcpServers as Record<string, MCPServerConfig>;

  } catch (error) {
    logger.debug(`[MCPDiscovery] Error reading MCP server configurations: ${error}`);
    return {};
  }
}

/**
 * Enumerate all configured MCP servers and return structured information
 *
 * Note: This currently only reads configuration without querying live servers
 * for their capabilities. Future enhancement could query servers via MCP protocol.
 *
 * @returns Array of MCP server information objects
 */
export function listConfiguredMCPServers(): MCPServerInfo[] {
  const configs = readMCPServerConfigs();

  return Object.entries(configs).map(([name, config]) => ({
    name,
    config,
    status: 'configured' as const,
    // Note: tools, resources, and prompts would require querying the live server
    // This is a future enhancement opportunity
  }));
}

/**
 * Get information about a specific MCP server by name
 *
 * @param serverName The name of the MCP server to query
 * @returns Server information if found, null otherwise
 */
export function getMCPServerInfo(serverName: string): MCPServerInfo | null {
  const configs = readMCPServerConfigs();
  const config = configs[serverName];

  if (!config) {
    logger.debug(`[MCPDiscovery] MCP server '${serverName}' not found in configuration`);
    return null;
  }

  return {
    name: serverName,
    config,
    status: 'configured' as const
  };
}

/**
 * Check if a specific MCP server is configured
 *
 * @param serverName The name of the MCP server to check
 * @returns true if the server is configured, false otherwise
 */
export function isMCPServerConfigured(serverName: string): boolean {
  const configs = readMCPServerConfigs();
  return serverName in configs;
}
