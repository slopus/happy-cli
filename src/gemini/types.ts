/**
 * Type definitions for Gemini CLI integration
 * Based on the stream-json output format from Gemini CLI
 */

// ====================
// Gemini Message Types
// ====================

/**
 * Init event - signifies the start of a session
 */
export interface GeminiInitMessage {
    type: 'init';
    session_id: string;
    model: string;
    timestamp?: number;
}

/**
 * Message event - user prompts and assistant responses
 */
export interface GeminiTextMessage {
    type: 'message';
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}

/**
 * Tool use event - tool call requests with parameters
 */
export interface GeminiToolUseMessage {
    type: 'tool_use';
    tool_name: string;
    tool_id: string;
    arguments: Record<string, unknown>;
    timestamp?: number;
}

/**
 * Tool result event - outcome of tool execution
 */
export interface GeminiToolResultMessage {
    type: 'tool_result';
    tool_id: string;
    success: boolean;
    output?: string;
    error?: string;
    timestamp?: number;
}

/**
 * Error event - non-fatal errors and warnings
 */
export interface GeminiErrorMessage {
    type: 'error';
    error: string;
    code?: string;
    timestamp?: number;
}

/**
 * Result event - final session outcome with statistics
 */
export interface GeminiResultMessage {
    type: 'result';
    success: boolean;
    response?: string;
    statistics?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        duration_ms?: number;
    };
    timestamp?: number;
}

/**
 * Reasoning/thinking event (if available)
 */
export interface GeminiReasoningMessage {
    type: 'reasoning';
    content: string;
    timestamp?: number;
}

/**
 * Permission/approval request for tool execution
 */
export interface GeminiApprovalRequest {
    type: 'approval_request';
    request_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
    description?: string;
    timestamp?: number;
}

/**
 * Union type for all Gemini SDK messages
 */
export type GeminiSDKMessage =
    | GeminiInitMessage
    | GeminiTextMessage
    | GeminiToolUseMessage
    | GeminiToolResultMessage
    | GeminiErrorMessage
    | GeminiResultMessage
    | GeminiReasoningMessage
    | GeminiApprovalRequest;

// ====================
// Control Request/Response Types
// ====================

/**
 * Control request for tool approval
 */
export interface GeminiControlRequest {
    type: 'control_request';
    request_id: string;
    request: {
        subtype: 'can_use_tool';
        tool_name: string;
        input: Record<string, unknown>;
    };
}

/**
 * Control response for tool approval
 */
export interface GeminiControlResponse {
    type: 'control_response';
    response: {
        subtype: 'success' | 'error';
        request_id: string;
        response?: {
            behavior: 'allow' | 'deny';
            message?: string;
        };
        error?: string;
    };
}

/**
 * Permission result type
 */
export interface GeminiPermissionResult {
    behavior: 'allow' | 'deny';
    message?: string;
}

/**
 * Callback type for tool permission handling
 */
export type GeminiCanCallToolCallback = (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal?: AbortSignal }
) => Promise<GeminiPermissionResult>;

// ====================
// Query Options
// ====================

/**
 * Options for Gemini query
 */
export interface GeminiQueryOptions {
    /** Working directory */
    cwd?: string;
    /** Model to use (e.g., 'gemini-2.5-pro', 'gemini-2.5-flash') */
    model?: string;
    /** Custom system prompt */
    systemPrompt?: string;
    /** Additional directories to include */
    includeDirectories?: string[];
    /** Abort signal */
    abort?: AbortSignal;
    /** Path to Gemini CLI executable */
    pathToGeminiExecutable?: string;
    /** Tool permission callback */
    canCallTool?: GeminiCanCallToolCallback;
    /** Enable sandbox mode */
    sandbox?: 'read-only' | 'workspace-write' | 'full-access';
    /** Auto-accept safe tool calls */
    autoAccept?: boolean;
}

/**
 * Query prompt type - can be a string or async iterable for streaming
 */
export type GeminiQueryPrompt = string | AsyncIterable<{ type: 'user_message'; content: string }>;

// ====================
// Session Configuration
// ====================

/**
 * Gemini session configuration
 */
export interface GeminiSessionConfig {
    prompt: string;
    sandbox?: 'read-only' | 'workspace-write' | 'full-access';
    model?: string;
    config?: {
        mcp_servers?: Record<string, {
            command: string;
            args?: string[];
        }>;
    };
}

// ====================
// Permission Modes
// ====================

export type GeminiPermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo';

/**
 * Enhanced mode with permission and model settings
 */
export interface GeminiEnhancedMode {
    permissionMode: GeminiPermissionMode;
    model?: string;
}

// ====================
// Error Types
// ====================

/**
 * Custom abort error
 */
export class GeminiAbortError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AbortError';
    }
}
