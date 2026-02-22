/**
 * Coordinator manages a task queue and auto-feeds tasks to Claude sessions.
 * Tasks are added via RPC from the mobile app and executed sequentially.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { CoordinatorTask, CoordinatorState, CoordinatorConfig } from './types';

export class Coordinator {
    private tasks: CoordinatorTask[] = [];
    private enabled = false;
    private config: CoordinatorConfig;
    private onTaskReady?: (prompt: string) => void;
    private onStateChange?: (state: CoordinatorState) => void;

    constructor(config?: Partial<CoordinatorConfig>) {
        this.config = {
            autoAdvance: true,
            ...config,
        };
    }

    /** Register callback for when a task should be sent to Claude */
    onNextTask(handler: (prompt: string) => void) {
        this.onTaskReady = handler;
    }

    /** Register callback for state changes */
    onStateChanged(handler: (state: CoordinatorState) => void) {
        this.onStateChange = handler;
    }

    private emitStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    /** Add a task to the queue */
    addTask(prompt: string, label?: string): CoordinatorTask {
        const task: CoordinatorTask = {
            id: randomUUID(),
            prompt,
            status: 'pending',
            createdAt: Date.now(),
            label,
        };
        this.tasks.push(task);
        logger.debug(`[coordinator] Task added: ${task.id} "${label || prompt.slice(0, 50)}"`);
        this.emitStateChange();
        return task;
    }

    /** Add multiple tasks at once */
    addTasks(tasks: Array<{ prompt: string; label?: string }>): CoordinatorTask[] {
        return tasks.map(t => this.addTask(t.prompt, t.label));
    }

    /** Remove a task by ID */
    removeTask(id: string): boolean {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx === -1) return false;
        const task = this.tasks[idx];
        if (task.status === 'running') return false;
        this.tasks.splice(idx, 1);
        logger.debug(`[coordinator] Task removed: ${id}`);
        this.emitStateChange();
        return true;
    }

    /** Clear all pending tasks */
    clearPending() {
        this.tasks = this.tasks.filter(t => t.status === 'running' || t.status === 'completed');
        logger.debug('[coordinator] Pending tasks cleared');
        this.emitStateChange();
    }

    /** Enable the coordinator */
    enable() {
        this.enabled = true;
        logger.debug('[coordinator] Enabled');
        this.emitStateChange();
    }

    /** Disable the coordinator */
    disable() {
        this.enabled = false;
        logger.debug('[coordinator] Disabled');
        this.emitStateChange();
    }

    /** Get current state for the mobile app */
    getState(): CoordinatorState {
        return {
            enabled: this.enabled,
            tasks: [...this.tasks],
        };
    }

    /**
     * Called when Claude becomes idle (onReady + empty queue).
     * If enabled and tasks are pending, fires the next task.
     * Returns true if a task was dispatched.
     */
    onClaudeIdle(): boolean {
        if (!this.enabled || !this.config.autoAdvance) return false;

        // Mark current running task as completed
        const running = this.tasks.find(t => t.status === 'running');
        if (running) {
            running.status = 'completed';
            running.completedAt = Date.now();
            logger.debug(`[coordinator] Task completed: ${running.id}`);
        }

        // Find next pending task
        const next = this.tasks.find(t => t.status === 'pending');
        if (!next) {
            logger.debug('[coordinator] No more pending tasks');
            this.emitStateChange();
            return false;
        }

        // Dispatch it
        next.status = 'running';
        next.startedAt = Date.now();
        const prompt = this.config.taskPrefix
            ? `${this.config.taskPrefix}\n\n${next.prompt}`
            : next.prompt;

        logger.debug(`[coordinator] Dispatching task: ${next.id} "${next.label || next.prompt.slice(0, 50)}"`);

        this.emitStateChange();

        if (this.onTaskReady) {
            this.onTaskReady(prompt);
        }

        return true;
    }

    /**
     * Manually dispatch the next pending task, bypassing enabled/autoAdvance checks.
     * Won't dispatch if a task is already running.
     * Returns true if a task was dispatched.
     */
    dispatchNext(): boolean {
        // Don't dispatch if a task is already running
        if (this.tasks.some(t => t.status === 'running')) {
            logger.debug('[coordinator] Cannot dispatch — a task is already running');
            return false;
        }

        const next = this.tasks.find(t => t.status === 'pending');
        if (!next) {
            logger.debug('[coordinator] No pending tasks to dispatch');
            return false;
        }

        next.status = 'running';
        next.startedAt = Date.now();
        const prompt = this.config.taskPrefix
            ? `${this.config.taskPrefix}\n\n${next.prompt}`
            : next.prompt;

        logger.debug(`[coordinator] Manual dispatch: ${next.id} "${next.label || next.prompt.slice(0, 50)}"`);
        this.emitStateChange();

        if (this.onTaskReady) {
            this.onTaskReady(prompt);
        }

        return true;
    }

    /**
     * Mark the currently running task as failed.
     * Called when Claude exits with an error or the session crashes.
     */
    markCurrentFailed(error?: string): void {
        const running = this.tasks.find(t => t.status === 'running');
        if (!running) return;

        running.status = 'failed';
        running.completedAt = Date.now();
        logger.debug(`[coordinator] Task failed: ${running.id} ${error ? `— ${error}` : ''}`);
        this.emitStateChange();
    }

    /** Check if coordinator has pending work */
    hasPendingTasks(): boolean {
        return this.tasks.some(t => t.status === 'pending');
    }

    /** Get count of pending tasks */
    pendingCount(): number {
        return this.tasks.filter(t => t.status === 'pending').length;
    }
}
