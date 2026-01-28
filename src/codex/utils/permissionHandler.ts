/**
 * Codex Permission Handler
 *
 * Handles tool permission requests and responses for Codex sessions.
 * Extends BasePermissionHandler with Codex-specific configuration.
 */

import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import {
    BasePermissionHandler,
    PermissionResult,
    PendingRequest
} from '@/utils/BasePermissionHandler';

// Re-export types for backwards compatibility
export type { PermissionResult, PendingRequest };

/**
 * Codex-specific permission handler.
 */
export class CodexPermissionHandler extends BasePermissionHandler {
    constructor(session: ApiSessionClient) {
        super(session);
    }

    protected getLogPrefix(): string {
        return '[Codex]';
    }

    /**
     * Handle a tool permission request
     * @param toolCallId - The unique ID of the tool call
     * @param toolName - The name of the tool being called
     * @param input - The input parameters for the tool
     * @returns Promise resolving to permission result
     */
    async handleToolCall(
        toolCallId: string,
        toolName: string,
        input: unknown
    ): Promise<PermissionResult> {
        return new Promise<PermissionResult>((resolve, reject) => {
            const timeoutMs = Number(process.env.HAPPY_PERMISSION_TIMEOUT_MS ?? 120_000);
            const startedAt = Date.now();

            // Store the pending request
            this.pendingRequests.set(toolCallId, {
                resolve,
                reject,
                toolName,
                input
            });

            // Update agent state with pending request
            this.addPendingRequestToState(toolCallId, toolName, input);

            logger.debug(`${this.getLogPrefix()} Permission request sent for tool: ${toolName} (${toolCallId})`);

            // Avoid deadlocks if the client-side permission response never arrives (e.g. mobile dialog bug).
            if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
                setTimeout(() => {
                    const pending = this.pendingRequests.get(toolCallId);
                    if (!pending) return;

                    this.pendingRequests.delete(toolCallId);

                    const result: PermissionResult = { decision: 'abort' };
                    pending.resolve(result);

                    this.session.updateAgentState((currentState) => {
                        const request = currentState.requests?.[toolCallId];
                        if (!request) return currentState;

                        const { [toolCallId]: _, ...remainingRequests } = currentState.requests || {};
                        return {
                            ...currentState,
                            requests: remainingRequests,
                            completedRequests: {
                                ...currentState.completedRequests,
                                [toolCallId]: {
                                    ...request,
                                    completedAt: Date.now(),
                                    status: 'canceled',
                                    reason: `Permission timed out after ${Math.max(0, Date.now() - startedAt)}ms`,
                                },
                            },
                        };
                    });

                    logger.debug(`${this.getLogPrefix()} Permission timed out for ${toolName} (${toolCallId})`);
                }, timeoutMs).unref?.();
            }
        });
    }
}
