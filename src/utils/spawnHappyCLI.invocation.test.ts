import { describe, it, expect } from 'vitest';

describe('happy-cli subprocess invocation', () => {
    const originalRuntimeOverride = process.env.HAPPY_CLI_SUBPROCESS_RUNTIME;

    it('builds a bun invocation when HAPPY_CLI_SUBPROCESS_RUNTIME=bun', async () => {
        process.env.HAPPY_CLI_SUBPROCESS_RUNTIME = 'bun';
        try {
            const mod = await import('./spawnHappyCLI');
            const buildInvocation = (mod as any).buildHappyCliSubprocessInvocation as
                | ((args: string[]) => { runtime: string; argv: string[] })
                | undefined;

            expect(typeof buildInvocation).toBe('function');

            const inv = buildInvocation!(['--version']);
            expect(inv.runtime).toBe('bun');
            expect(inv.argv).toEqual(expect.arrayContaining([expect.stringMatching(/dist\/index\.mjs$/), '--version']));
            expect(inv.argv).not.toContain('--no-warnings');
            expect(inv.argv).not.toContain('--no-deprecation');
        } finally {
            if (originalRuntimeOverride === undefined) {
                delete process.env.HAPPY_CLI_SUBPROCESS_RUNTIME;
            } else {
                process.env.HAPPY_CLI_SUBPROCESS_RUNTIME = originalRuntimeOverride;
            }
        }
    });
});

