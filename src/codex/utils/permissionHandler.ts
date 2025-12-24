/**
 * Permission Handler for Codex tool approval integration
 * 
 * Handles tool permission requests and responses for Codex sessions.
 * Simpler than Claude's permission handler since we get tool IDs directly.
 */

import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { AgentState } from "@/api/types";

type PermissionDecision =
    | 'approved'
    | 'approved_for_session'
    | 'approved_execpolicy_amendment'
    | 'denied'
    | 'abort';

interface ExecPolicyAmendment {
    command: string[];
}

interface PermissionResponse {
    id: string;
    approved: boolean;
    decision?: PermissionDecision;
    execPolicyAmendment?: ExecPolicyAmendment;
}

interface PendingRequest {
    resolve: (value: PermissionResult) => void;
    reject: (error: Error) => void;
    toolName: string;
    input: unknown;
}

interface PermissionResult {
    decision: PermissionDecision;
    execPolicyAmendment?: ExecPolicyAmendment;
}

export class CodexPermissionHandler {
    private pendingRequests = new Map<string, PendingRequest>();
    private session: ApiSessionClient;

    constructor(session: ApiSessionClient) {
        this.session = session;
        this.setupRpcHandler();
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
            // Store the pending request
            this.pendingRequests.set(toolCallId, {
                resolve,
                reject,
                toolName,
                input
            });

            // Send push notification
            // this.session.api.push().sendToAllDevices(
            //     'Permission Request',
            //     `Codex wants to use ${toolName}`,
            //     {
            //         sessionId: this.session.sessionId,
            //         requestId: toolCallId,
            //         tool: toolName,
            //         type: 'permission_request'
            //     }
            // );

            // Update agent state with pending request
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

            logger.debug(`[Codex] Permission request sent for tool: ${toolName} (${toolCallId})`);
        });
    }

    /**
     * Setup RPC handler for permission responses
     */
    private setupRpcHandler(): void {
        this.session.rpcHandlerManager.registerHandler<PermissionResponse, void>(
            'permission',
            async (response) => {
                console.log(`[Codex] Permission response received:`, response);

                const pending = this.pendingRequests.get(response.id);
                if (!pending) {
                    logger.debug('[Codex] Permission request not found or already resolved', {
                        responseId: response.id,
                        pendingIds: Array.from(this.pendingRequests.keys())
                    });
                    return;
                }

                // Remove from pending
                this.pendingRequests.delete(response.id);

                // Determine the permission decision
                let decision: PermissionDecision;
                let result: PermissionResult;

                if (response.approved) {
                    const wantsExecpolicyAmendment = response.decision === 'approved_execpolicy_amendment'
                        && Boolean(response.execPolicyAmendment?.command?.length);

                    if (wantsExecpolicyAmendment) {
                        decision = 'approved_execpolicy_amendment';
                        result = { decision, execPolicyAmendment: response.execPolicyAmendment };
                    } else if (response.decision === 'approved_for_session') {
                        decision = 'approved_for_session';
                        result = { decision };
                    } else {
                        decision = 'approved';
                        result = { decision };
                    }
                } else {
                    decision = response.decision === 'denied' ? 'denied' : 'abort';
                    result = { decision };
                }

                pending.resolve(result);

                // Move request to completed in agent state
                this.session.updateAgentState((currentState) => {
                    const request = currentState.requests?.[response.id];
                    if (!request) return currentState;

                    // console.log(`[Codex] Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`);

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
                    // console.log(`[Codex] Updated agent state:`, res);
                    return res;
                });

                logger.debug(`[Codex] Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`, {
                    toolCallId: response.id,
                    decision: result.decision
                });
            }
        );
    }

    /**
     * Reset state for new sessions
     */
    reset(): void {
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('Session reset'));
        }
        this.pendingRequests.clear();

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

        logger.debug('[Codex] Permission handler reset');
    }
}
