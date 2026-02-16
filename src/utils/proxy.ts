/**
 * HTTP proxy configuration utilities
 *
 * Reads proxy settings from:
 * 1. Environment variables (http_proxy, https_proxy, HTTP_PROXY, HTTPS_PROXY)
 * 2. Agent-specific config files:
 *    - Claude: ~/.claude/settings.json (env field)
 *    - Gemini: TODO - add support
 *    - Codex: TODO - add support
 */

import { HttpsProxyAgent } from 'https-proxy-agent';

type AgentType = 'claude' | 'gemini' | 'codex' | null;
let currentAgentType: AgentType = null;
let claudeProxyCache: { url: string | undefined; loaded: boolean } = { url: undefined, loaded: false };

/**
 * Set the current agent type (call this at startup)
 */
export function setAgentType(type: AgentType): void {
    currentAgentType = type;
}

/**
 * Read proxy URL from Claude Code settings
 * Only used when agent type is 'claude'
 */
function getClaudeProxyUrl(): string | undefined {
    if (currentAgentType !== 'claude') return undefined;
    if (claudeProxyCache.loaded) return claudeProxyCache.url;
    claudeProxyCache.loaded = true;

    try {
        // Lazy import to avoid circular dependency
        const { readClaudeSettings } = require('@/claude/utils/claudeSettings');
        const settings = readClaudeSettings();
        claudeProxyCache.url = settings?.env?.HTTPS_PROXY || settings?.env?.HTTP_PROXY ||
                              settings?.env?.https_proxy || settings?.env?.http_proxy;
        return claudeProxyCache.url;
    } catch {
        return undefined;
    }
}

/**
 * Get proxy URL from environment variables or Claude Code settings
 * Priority: env vars > Claude Code settings (only for claude agent)
 */
export function getProxyUrl(): string | undefined {
    return process.env.https_proxy || process.env.HTTPS_PROXY ||
           process.env.http_proxy || process.env.HTTP_PROXY ||
           getClaudeProxyUrl();
}

/**
 * Create an HttpsProxyAgent if proxy is configured
 */
export function createProxyAgent(): HttpsProxyAgent<string> | undefined {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) return undefined;
    return new HttpsProxyAgent(proxyUrl);
}
