import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    ElicitRequestSchema: {},
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    const instances: any[] = [];

    class StdioClientTransport {
        public command: string;
        public args: string[];
        public env: Record<string, string>;

        constructor(opts: { command: string; args: string[]; env: Record<string, string> }) {
            this.command = opts.command;
            this.args = opts.args;
            this.env = opts.env;
            instances.push(this);
        }
    }

    return { StdioClientTransport, __transportInstances: instances };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    class Client {
        setNotificationHandler() { }
        setRequestHandler() { }
        async connect() { }
        async close() { }
    }

    return { Client };
});

describe('CodexMcpClient elicitation handling', () => {
    it('does not print elicitation payloads to stdout', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        try {
            const mod = await import('./codexMcpClient');
            consoleSpy.mockClear();
            const createHandler = (mod as any).createCodexElicitationRequestHandler as
                | ((permissionHandler: any) => (request: any) => Promise<any>)
                | undefined;

            expect(typeof createHandler).toBe('function');

            const permissionHandler = {
                handleToolCall: vi.fn().mockResolvedValue({ decision: 'approved' }),
            };

            const handler = createHandler!(permissionHandler);
            await handler({
                params: {
                    codex_call_id: 'call-1',
                    codex_command: ['echo', 'hi'],
                    codex_cwd: '/tmp',
                },
            });

            expect(consoleSpy).not.toHaveBeenCalled();
        } finally {
            consoleSpy.mockRestore();
        }
    });
});

describe('CodexMcpClient command detection', () => {
    it('does not treat "codex <version>" output as "not installed"', async () => {
        vi.resetModules();

        const { execSync } = await import('child_process');
        (execSync as any).mockReturnValue('codex 0.43.0-alpha.5\n');

        const stdioModule = (await import('@modelcontextprotocol/sdk/client/stdio.js')) as any;
        const __transportInstances = stdioModule.__transportInstances as any[];
        __transportInstances.splice(0);

        const mod = await import('./codexMcpClient');

        const client = new (mod as any).CodexMcpClient();
        await expect(client.connect()).resolves.toBeUndefined();

        expect(__transportInstances.length).toBe(1);
        expect(__transportInstances[0].command).toBe('codex');
        expect(__transportInstances[0].args).toEqual(['mcp-server']);
    });
});
