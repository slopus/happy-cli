import { describe, it, expect, vi } from 'vitest';
import { Coordinator } from './Coordinator';

describe('Coordinator', () => {
    it('adds tasks and returns them in getState', () => {
        const c = new Coordinator();
        const task = c.addTask('Build the login page', 'Login');
        expect(task.status).toBe('pending');
        expect(c.getState().tasks).toHaveLength(1);
        expect(c.getState().tasks[0].label).toBe('Login');
    });

    it('dispatches next pending task on idle when enabled', () => {
        const c = new Coordinator();
        const handler = vi.fn();
        c.onNextTask(handler);
        c.enable();

        c.addTask('Task 1');
        c.addTask('Task 2');

        const dispatched = c.onClaudeIdle();
        expect(dispatched).toBe(true);
        expect(handler).toHaveBeenCalledWith('Task 1');
        expect(c.getState().tasks[0].status).toBe('running');
    });

    it('does not dispatch when disabled', () => {
        const c = new Coordinator();
        const handler = vi.fn();
        c.onNextTask(handler);

        c.addTask('Task 1');
        const dispatched = c.onClaudeIdle();
        expect(dispatched).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it('marks running task as completed on next idle', () => {
        const c = new Coordinator();
        const handler = vi.fn();
        c.onNextTask(handler);
        c.enable();

        c.addTask('Task 1');
        c.addTask('Task 2');

        c.onClaudeIdle(); // Dispatches Task 1
        c.onClaudeIdle(); // Completes Task 1, dispatches Task 2

        const tasks = c.getState().tasks;
        expect(tasks[0].status).toBe('completed');
        expect(tasks[1].status).toBe('running');
    });

    it('returns false when no pending tasks remain', () => {
        const c = new Coordinator();
        c.onNextTask(vi.fn());
        c.enable();

        c.addTask('Only task');
        c.onClaudeIdle(); // Dispatches
        c.onClaudeIdle(); // Completes, nothing next

        expect(c.onClaudeIdle()).toBe(false);
    });

    it('removes pending tasks but not running ones', () => {
        const c = new Coordinator();
        c.onNextTask(vi.fn());
        c.enable();

        const t1 = c.addTask('Task 1');
        const t2 = c.addTask('Task 2');

        c.onClaudeIdle(); // t1 is running
        expect(c.removeTask(t1.id)).toBe(false);
        expect(c.removeTask(t2.id)).toBe(true);
    });

    it('prepends taskPrefix to prompts when configured', () => {
        const c = new Coordinator({ taskPrefix: 'You are an expert developer.' });
        const handler = vi.fn();
        c.onNextTask(handler);
        c.enable();

        c.addTask('Build X');
        c.onClaudeIdle();

        expect(handler).toHaveBeenCalledWith('You are an expert developer.\n\nBuild X');
    });

    it('clearPending removes only pending tasks', () => {
        const c = new Coordinator();
        c.onNextTask(vi.fn());
        c.enable();

        c.addTask('Task 1');
        c.addTask('Task 2');
        c.addTask('Task 3');

        c.onClaudeIdle(); // Task 1 running
        c.clearPending(); // Remove Task 2 and 3

        expect(c.getState().tasks).toHaveLength(1);
        expect(c.pendingCount()).toBe(0);
    });

    it('addTasks adds multiple tasks at once', () => {
        const c = new Coordinator();
        const tasks = c.addTasks([
            { prompt: 'Task A', label: 'A' },
            { prompt: 'Task B', label: 'B' },
        ]);
        expect(tasks).toHaveLength(2);
        expect(c.getState().tasks).toHaveLength(2);
    });

    it('hasPendingTasks returns correct value', () => {
        const c = new Coordinator();
        expect(c.hasPendingTasks()).toBe(false);
        c.addTask('Something');
        expect(c.hasPendingTasks()).toBe(true);
    });
});
