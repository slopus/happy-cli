/**
 * OpenCode Types
 *
 * Type definitions for OpenCode agent integration
 */

/**
 * Permission modes for OpenCode tool approval
 */
export type PermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo';

/**
 * OpenCode mode configuration for message queue
 */
export interface OpenCodeMode {
  /** Permission mode for tool approval */
  permissionMode?: PermissionMode;

  /** Model to use (e.g., 'anthropic/claude-sonnet-4-20250514') */
  model?: string;

  /** Session mode for ACP permission management */
  sessionMode?: 'default' | 'yolo' | 'safe';
}

/**
 * Codex-compatible message payload for mobile app communication
 *
 * Note: options is a simple string array to match mobile app expectations
 * and be consistent with Gemini/Claude implementations.
 */
export interface CodexMessagePayload {
  type: 'message';
  message: string;
  id: string;
  options?: string[];
}
