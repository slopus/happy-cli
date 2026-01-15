import { describe, it, expect } from 'vitest';

describe('daemon tmux env building', () => {
    it('merges daemon process env and profile env for tmux windows', async () => {
        const runModule = await import('./run');
        const buildTmuxWindowEnv = (runModule as any).buildTmuxWindowEnv as
            | ((daemonEnv: NodeJS.ProcessEnv, extraEnv: Record<string, string>) => Record<string, string>)
            | undefined;

        expect(typeof buildTmuxWindowEnv).toBe('function');

        const merged = buildTmuxWindowEnv!(
            { PATH: '/bin', HOME: '/home/user', UNDEFINED: undefined },
            { HOME: '/override', CUSTOM: 'x' }
        );

        expect(merged.PATH).toBe('/bin');
        expect(merged.HOME).toBe('/override');
        expect(merged.CUSTOM).toBe('x');
        expect('UNDEFINED' in merged).toBe(false);
    });
});

