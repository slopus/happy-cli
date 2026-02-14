/**
 * Base Permission Handler
 *
 * Abstract base class for permission handlers that manage tool approval requests.
 * Shared by Codex and Gemini permission handlers.
 *
 * @module BasePermissionHandler
 */

import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { AgentState } from "@/api/types";

/**
 * Permission response from the mobile app.
 */
export interface PermissionResponse {
    id: string;
    approved: boolean;
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

/**
 * Pending permission request stored while awaiting user response.
 */
export interface PendingRequest {
    resolve: (value: PermissionResult) => void;
    reject: (error: Error) => void;
    toolName: string;
    input: unknown;
}

/**
 * Result of a permission request.
 */
export interface PermissionResult {
    decision: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

/**
 * Abstract base class for permission handlers.
 *
 * Subclasses must implement:
 * - `getLogPrefix()` - returns the log prefix (e.g., '[Codex]')
 */
export abstract class BasePermissionHandler {
    protected pendingRequests = new Map<string, PendingRequest>();
    protected session: ApiSessionClient;
    private isResetting = false;
    private messageListener: ((msg: unknown) => void) | null = null;
    private messageListenerSession: ApiSessionClient | null = null;

    /**
     * Returns the log prefix for this handler.
     */
    protected abstract getLogPrefix(): string;

    constructor(session: ApiSessionClient) {
        this.session = session;
        this.setupRpcHandler();
    }

    /**
     * Update the session reference (used after offline reconnection swaps sessions).
     * This is critical for avoiding stale session references after onSessionSwap.
     */
    updateSession(newSession: ApiSessionClient): void {
        logger.debug(`${this.getLogPrefix()} Session reference updated`);
        this.session = newSession;
        // Re-setup RPC handler with new session
        this.setupRpcHandler();
    }

    private normalizePermissionResponse(raw: unknown): PermissionResponse | null {
        if (!raw || typeof raw !== 'object') return null;
        const record = raw as Record<string, unknown>;

        const id = (record.id ?? record.permissionId) as unknown;
        const approved = (record.approved ?? record.permissionApproved) as unknown;
        const decision = record.decision as unknown;

        if (typeof id !== 'string') return null;
        if (typeof approved !== 'boolean') return null;

        const normalized: PermissionResponse = { id, approved };
        if (decision === 'approved' || decision === 'approved_for_session' || decision === 'denied' || decision === 'abort') {
            normalized.decision = decision;
        }

        return normalized;
    }

    private async handlePermissionResponse(raw: unknown): Promise<void> {
        const response = this.normalizePermissionResponse(raw);
        if (!response) return;

        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            logger.debug(`${this.getLogPrefix()} Permission request not found or already resolved`, { id: response.id });
            return;
        }

        // Remove from pending
        this.pendingRequests.delete(response.id);

        // Resolve the permission request
        const result: PermissionResult = response.approved
            ? { decision: response.decision === 'approved_for_session' ? 'approved_for_session' : 'approved' }
            : { decision: response.decision === 'denied' ? 'denied' : 'abort' };

        pending.resolve(result);

        // Move request to completed in agent state
        this.session.updateAgentState((currentState) => {
            const request = currentState.requests?.[response.id];
            if (!request) return currentState;

            const { [response.id]: _, ...remainingRequests } = currentState.requests || {};

            let res = {
                ...currentState,
                requests: remainingRequests,
                completedRequests: {
                    ...currentState.completedRequests,
                    [response.id]: {
                        ...request,
                        completedAt: Date.now(),
                        status: response.approved ? 'approved' : 'denied',
                        decision: result.decision
                    }
                }
            } satisfies AgentState;
            return res;
        });

        logger.debug(`${this.getLogPrefix()} Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`);
    }

    /**
     * Setup RPC handler for permission responses.
     */
    protected setupRpcHandler(): void {
        // Remove previous listener when swapping sessions to avoid leaks / duplicate resolution.
        if (this.messageListener && this.messageListenerSession) {
            this.messageListenerSession.off('message', this.messageListener);
            this.messageListener = null;
            this.messageListenerSession = null;
        }

        this.session.rpcHandlerManager.registerHandler<PermissionResponse, void>(
            'permission',
            async (response) => {
                await this.handlePermissionResponse(response);
            }
        );

        // Compatibility path: some clients may deliver permission responses as normal session messages
        // rather than RPC calls. Handle those too to avoid deadlocking tool elicitation.
        this.messageListener = async (msg: unknown) => {
            // Intentionally quiet unless it looks like a permission response.
            await this.handlePermissionResponse(msg);
        };
        this.session.on('message', this.messageListener);
        this.messageListenerSession = this.session;
    }

    /**
     * Add a pending request to the agent state.
     */
    protected addPendingRequestToState(toolCallId: string, toolName: string, input: unknown): void {
        this.session.updateAgentState((currentState) => ({
            ...currentState,
            requests: {
                ...currentState.requests,
                [toolCallId]: {
                    tool: toolName,
                    arguments: input,
                    createdAt: Date.now()
                }
            }
        }));
    }

    /**
     * Reset state for new sessions.
     * This method is idempotent - safe to call multiple times.
     */
    reset(): void {
        // Guard against re-entrant/concurrent resets
        if (this.isResetting) {
            logger.debug(`${this.getLogPrefix()} Reset already in progress, skipping`);
            return;
        }
        this.isResetting = true;

        try {
            // Snapshot pending requests to avoid Map mutation during iteration
            const pendingSnapshot = Array.from(this.pendingRequests.entries());
            this.pendingRequests.clear(); // Clear immediately to prevent new entries being processed

            // Reject all pending requests from snapshot
            for (const [id, pending] of pendingSnapshot) {
                try {
                    pending.reject(new Error('Session reset'));
                } catch (err) {
                    logger.debug(`${this.getLogPrefix()} Error rejecting pending request ${id}:`, err);
                }
            }

            // Clear requests in agent state
            this.session.updateAgentState((currentState) => {
                const pendingRequests = currentState.requests || {};
                const completedRequests = { ...currentState.completedRequests };

                // Move all pending to completed as canceled
                for (const [id, request] of Object.entries(pendingRequests)) {
                    completedRequests[id] = {
                        ...request,
                        completedAt: Date.now(),
                        status: 'canceled',
                        reason: 'Session reset'
                    };
                }

                return {
                    ...currentState,
                    requests: {},
                    completedRequests
                };
            });

            logger.debug(`${this.getLogPrefix()} Permission handler reset`);
        } finally {
            this.isResetting = false;
        }
    }
}
