/**
 * Coordinator types for auto-pilot task management.
 * The Coordinator feeds tasks to Claude when it becomes idle.
 */

export interface CoordinatorTask {
    /** Unique task ID (UUID) */
    id: string;
    /** The prompt/instruction to send to Claude */
    prompt: string;
    /** Task status */
    status: 'pending' | 'running' | 'completed' | 'failed';
    /** When the task was created */
    createdAt: number;
    /** When the task started running */
    startedAt?: number;
    /** When the task completed */
    completedAt?: number;
    /** Optional label for display in the app */
    label?: string;
}

export interface CoordinatorState {
    /** Whether the coordinator is active */
    enabled: boolean;
    /** The task queue */
    tasks: CoordinatorTask[];
}

export interface CoordinatorConfig {
    /** Auto-send next task when Claude is idle */
    autoAdvance: boolean;
    /** Optional system prompt prefix for coordinator tasks */
    taskPrefix?: string;
}
