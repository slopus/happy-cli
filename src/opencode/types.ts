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
}

/**
 * Codex-compatible message payload for mobile app communication
 */
export interface CodexMessagePayload {
  type: 'message';
  message: string;
  id: string;
  options?: Array<{
    optionId: string;
    name: string;
  }>;
}
