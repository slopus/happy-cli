import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const { spawnMock, getLastSpawnOptions } = vi.hoisted(() => {
    let lastSpawnOptions: any = null;

    const spawnMock = vi.fn((_command: string, _args: string[], options: any) => {
        lastSpawnOptions = options;

        const child = new EventEmitter() as any;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();

        queueMicrotask(() => {
            child.emit('close', 0);
        });

        return child;
    });

    return {
        spawnMock,
        getLastSpawnOptions: () => lastSpawnOptions,
    };
});

vi.mock('child_process', () => ({
    spawn: spawnMock,
}));

describe('TmuxUtilities tmux subprocess environment', () => {
    beforeEach(() => {
        spawnMock.mockClear();
    });

    it('passes TMUX_TMPDIR to tmux subprocess env when provided', async () => {
        vi.resetModules();
        const { TmuxUtilities } = await import('./tmux');

        const utils = new (TmuxUtilities as any)('happy', { TMUX_TMPDIR: '/custom/tmux' });

        await utils.executeTmuxCommand(['list-sessions']);

        const options = getLastSpawnOptions();
        expect(options?.env?.TMUX_TMPDIR).toBe('/custom/tmux');
    });
});

