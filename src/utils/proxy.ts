/**
 * HTTP proxy configuration utilities
 * Reads proxy settings from environment variables (http_proxy, https_proxy, HTTP_PROXY, HTTPS_PROXY)
 */

import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Get proxy URL from environment variables
 * Checks: https_proxy, HTTPS_PROXY, http_proxy, HTTP_PROXY (in order)
 */
export function getProxyUrl(): string | undefined {
    return process.env.https_proxy || process.env.HTTPS_PROXY ||
           process.env.http_proxy || process.env.HTTP_PROXY;
}

/**
 * Create an HttpsProxyAgent if proxy is configured
 */
export function createProxyAgent(): HttpsProxyAgent<string> | undefined {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) return undefined;
    return new HttpsProxyAgent(proxyUrl);
}
