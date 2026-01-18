/**
 * Z.AI/GLM CLI Entry Point
 *
 * This module provides the main entry point for running Claude with GLM's API
 * (z.ai / BigModel.cn). It acts as a thin wrapper that sets the appropriate
 * environment variables to redirect Claude's API calls to GLM's endpoint.
 *
 * GLM is Anthropic-compatible, so we just need to override:
 * - ANTHROPIC_BASE_URL → https://open.bigmodel.cn/api/anthropic
 * - ANTHROPIC_AUTH_TOKEN → GLM API key
 * - ANTHROPIC_MODEL → glm-4.7 (or other GLM model)
 */

import { runClaude, StartOptions } from '@/claude/runClaude';
import { logger } from '@/ui/logger';
import { Credentials } from '@/persistence';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Default GLM configuration
export const DEFAULT_ZAI_BASE_URL = 'https://open.bigmodel.cn/api/anthropic';
export const DEFAULT_ZAI_MODEL = 'glm-4.7';

// Available GLM models (for validation)
export const VALID_ZAI_MODELS = [
    'glm-4.7',
    'glm-4-plus',
    'glm-4-flash',
    'glm-4-air',
    'glm-4-flashx',
];

export interface ZaiConfig {
    /** GLM API key (can also use ZAI_AUTH_TOKEN env var) */
    authToken?: string;
    /** GLM API base URL (defaults to https://open.bigmodel.cn/api/anthropic) */
    baseUrl?: string;
    /** Model to use (defaults to glm-4.7) */
    model?: string;
}

/**
 * Read Z.AI configuration from ~/.zai/config.json
 */
export function readZaiConfig(): ZaiConfig {
    const configDir = join(homedir(), '.zai');
    const configPath = join(configDir, 'config.json');

    if (!existsSync(configPath)) {
        return {};
    }

    try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return config;
    } catch (error) {
        logger.warn(`[zai] Failed to parse config file: ${error}`);
        return {};
    }
}

/**
 * Write Z.AI configuration to ~/.zai/config.json
 */
export function writeZaiConfig(config: ZaiConfig): void {
    const configDir = join(homedir(), '.zai');
    const configPath = join(configDir, 'config.json');

    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get the effective Z.AI configuration by merging:
 * 1. ~/.zai/config.json
 * 2. Environment variables (ZAI_AUTH_TOKEN, ZAI_BASE_URL, ZAI_MODEL)
 */
export function getEffectiveZaiConfig(): {
    baseUrl: string;
    authToken: string;
    model: string;
    source: 'config' | 'env' | 'default';
} {
    const fileConfig = readZaiConfig();
    const envToken = process.env.ZAI_AUTH_TOKEN;
    const envBaseUrl = process.env.ZAI_BASE_URL;
    const envModel = process.env.ZAI_MODEL;

    const authToken = envToken || fileConfig.authToken || '';
    const baseUrl = envBaseUrl || fileConfig.baseUrl || DEFAULT_ZAI_BASE_URL;
    const model = envModel || fileConfig.model || DEFAULT_ZAI_MODEL;

    // Determine source for logging
    let source: 'config' | 'env' | 'default' = 'default';
    if (envToken || envBaseUrl || envModel) {
        source = 'env';
    } else if (fileConfig.authToken || fileConfig.baseUrl || fileConfig.model) {
        source = 'config';
    }

    return { baseUrl, authToken, model, source };
}

/**
 * Validate GLM model name
 */
export function isValidZaiModel(model: string): boolean {
    return VALID_ZAI_MODELS.includes(model);
}

/**
 * Main entry point for the zai command
 *
 * This reads the configuration from ~/.zai/config.json (or environment variables),
 * builds the appropriate environment variables, and launches Claude with those
 * variables set to redirect API calls to GLM's endpoint.
 */
export async function runZai(opts: {
    credentials: Credentials;
    startedBy?: 'daemon' | 'terminal';
    claudeArgs?: string[];
}): Promise<void> {
    logger.debug('[zai] ===== Z.AI MODE STARTING =====');
    logger.debug('[zai] This is Claude with GLM API (z.ai / BigModel.cn)');

    const config = getEffectiveZaiConfig();

    // Validate that we have an auth token
    if (!config.authToken) {
        console.error('Error: No GLM API key found.');
        console.error('');
        console.error('Please set your API key using one of these methods:');
        console.error('  1. Set environment variable: export ZAI_AUTH_TOKEN="your-key"');
        console.error('  2. Save to config file: happy zai token set <your-key>');
        console.error('');
        console.error('Get your API key at: https://open.bigmodel.cn/');
        process.exit(1);
    }

    // Validate model
    if (!isValidZaiModel(config.model)) {
        console.warn(`Warning: Unknown model "${config.model}"`);
        console.warn(`Valid models: ${VALID_ZAI_MODELS.join(', ')}`);
        console.warn(`Using "${config.model}" anyway...`);
    }

    // Build options with GLM environment variables
    const claudeOptions: StartOptions = {
        startedBy: opts.startedBy,
        claudeEnvVars: {
            ANTHROPIC_BASE_URL: config.baseUrl,
            ANTHROPIC_AUTH_TOKEN: config.authToken,
            ANTHROPIC_MODEL: config.model,
        },
        claudeArgs: opts.claudeArgs
    };

    logger.debug('[zai] Configuration:', {
        baseUrl: config.baseUrl,
        model: config.model,
        source: config.source,
        hasToken: !!config.authToken,
        claudeArgs: opts.claudeArgs,
    });

    console.log(`Using GLM API (${config.model})`);

    // Run Claude with custom environment variables
    await runClaude(opts.credentials, claudeOptions);
}
