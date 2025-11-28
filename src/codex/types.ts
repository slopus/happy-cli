/**
 * Type definitions for Codex MCP integration
 */

export interface CodexSessionConfig {
    prompt: string;
    'approval-policy'?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
    'base-instructions'?: string;
    config?: Record<string, any>;
    cwd?: string;
    'include-plan-tool'?: boolean;
    model?: string;
    'reasoning-effort'?: 'low' | 'medium' | 'high' | 'xhigh';
    profile?: string;
    sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
}

/**
 * Map app model mode to Codex model name and reasoning effort
 * GPT-5.1-Codex-Max supports xhigh (extra high) reasoning effort
 */
export function mapModelMode(modelMode: string | undefined): { model?: string; reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' } {
    switch (modelMode) {
        // GPT-5.1-Codex-Max with different reasoning efforts
        case 'gpt-5.1-codex-max-xhigh':
            return { model: 'gpt-5.1-codex-max', reasoningEffort: 'xhigh' };
        case 'gpt-5.1-codex-max-high':
            return { model: 'gpt-5.1-codex-max', reasoningEffort: 'high' };
        case 'gpt-5.1-codex-max-medium':
            return { model: 'gpt-5.1-codex-max', reasoningEffort: 'medium' };

        // GPT-5.1-Codex with different reasoning efforts
        case 'gpt-5.1-codex-high':
            return { model: 'gpt-5.1-codex', reasoningEffort: 'high' };
        case 'gpt-5.1-codex-medium':
            return { model: 'gpt-5.1-codex', reasoningEffort: 'medium' };
        case 'gpt-5.1-codex-low':
            return { model: 'gpt-5.1-codex', reasoningEffort: 'low' };

        // GPT-5.1-Codex-Mini (cost-effective variant)
        case 'gpt-5.1-codex-mini':
            return { model: 'gpt-5.1-codex-mini' };

        // Default - let Codex use its default model
        default:
            return {};
    }
}

export interface CodexToolResponse {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: any;
        mimeType?: string;
    }>;
    isError?: boolean;
}
