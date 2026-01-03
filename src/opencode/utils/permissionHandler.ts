/**
 * OpenCode Permission Handler
 *
 * Handles tool permission requests for OpenCode agent.
 * Based on GeminiPermissionHandler.
 */

import { ApiSessionClient } from '@/api/apiSession';
import type { PermissionMode } from '../types';

export class OpenCodePermissionHandler {
  private permissionMode: PermissionMode = 'default';
  private pendingApprovals = new Map<string, {
    resolve: (value: { decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }) => void;
    toolName: string;
    input: unknown;
  }>();

  constructor(private session: ApiSessionClient) {}

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /**
   * Handle a tool permission request
   */
  async handleToolCall(
    toolCallId: string,
    toolName: string,
    input: unknown
  ): Promise<{ decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }> {
    // Determine approval based on permission mode
    switch (this.permissionMode) {
      case 'yolo':
      case 'safe-yolo':
        // Auto-approve all in yolo mode
        return { decision: 'approved_for_session' };

      case 'read-only':
        // Deny any tool that modifies state
        if (this.isWriteTool(toolName)) {
          return { decision: 'denied' };
        }
        return { decision: 'approved' };

      case 'default':
      default:
        // Wait for mobile approval
        return new Promise((resolve) => {
          this.pendingApprovals.set(toolCallId, {
            resolve,
            toolName,
            input,
          });

          // Send permission request to mobile
          this.session.sendCodexMessage({
            type: 'permission-request',
            permissionId: toolCallId,
            reason: `Tool "${toolName}" requires approval`,
            payload: input,
            id: toolCallId,
          });
        });
    }
  }

  /**
   * Handle permission response from mobile
   */
  handlePermissionResponse(
    toolCallId: string,
    decision: 'approved' | 'denied' | 'abort'
  ): void {
    const pending = this.pendingApprovals.get(toolCallId);
    if (pending) {
      this.pendingApprovals.delete(toolCallId);
      pending.resolve({ decision });
    }
  }

  /**
   * Reset pending approvals (e.g., after abort)
   */
  reset(): void {
    // Reject all pending approvals
    for (const [toolCallId, pending] of this.pendingApprovals) {
      pending.resolve({ decision: 'abort' });
    }
    this.pendingApprovals.clear();
  }

  /**
   * Check if a tool is a "write" tool (modifies state)
   */
  private isWriteTool(toolName: string): boolean {
    const readTools = [
      'read_file',
      'list_directory',
      'search',
      'codebase_search',
      'diagnostics',
      'completions',
      'definition',
      'hover',
      'codebase_investigator',
    ];

    return !readTools.some(rt => toolName.includes(rt) || rt.includes(toolName));
  }
}
