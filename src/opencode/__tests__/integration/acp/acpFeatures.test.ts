import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import type { AgentBackend } from '@/agent/AgentBackend';

const {
  mockSpawn,
  mockInitialize,
  mockNewSession,
  mockLoadSession,
  mockPrompt,
  mockExtMethod,
  mockNdJsonStream,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockInitialize: vi.fn(),
  mockNewSession: vi.fn(),
  mockLoadSession: vi.fn(),
  mockPrompt: vi.fn(),
  mockExtMethod: vi.fn(),
  mockNdJsonStream: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('@agentclientprotocol/sdk', () => {
  class MockClientSideConnection {
    initialize = mockInitialize;
    newSession = mockNewSession;
    loadSession = mockLoadSession;
    prompt = mockPrompt;
    extMethod = mockExtMethod;
    cancel = vi.fn();
    dispose = vi.fn();

    constructor(_clientFactory: unknown, _stream: unknown) {}
  }

  return {
    ClientSideConnection: MockClientSideConnection,
    ndJsonStream: mockNdJsonStream,
  };
});

describe('ACP Integration Tests', () => {
  let backend: AgentBackend;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSpawn.mockImplementation(() => {
      const proc = new EventEmitter() as any;
      proc.stdin = new PassThrough();
      proc.stdout = new PassThrough();
      proc.stderr = new PassThrough();
      proc.kill = vi.fn();
      return proc;
    });

    mockNdJsonStream.mockReturnValue({
      send: vi.fn(),
      close: vi.fn(),
    });

    mockInitialize.mockResolvedValue({});
    mockNewSession.mockResolvedValue({ sessionId: 'acp-session' });
    mockLoadSession.mockResolvedValue({ sessionId: 'acp-session' });
    mockPrompt.mockResolvedValue(undefined);
    mockExtMethod.mockResolvedValue(undefined);
  });

  it('executes /compact via session command', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
    });

    const { sessionId } = await backend.startSession();
    await backend.sendPrompt(sessionId, '/compact');
  });

  it('runs /compact via extMethod when command is available', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
    });

    const { sessionId } = await backend.startSession();

    (backend as any).handleSessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'compact', description: 'Compact' }],
      },
    });

    await backend.sendPrompt(sessionId, '/compact');

    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockExtMethod).toHaveBeenCalledWith('session/command', {
      command: 'compact',
      arguments: [],
    });
  });

  it('auto-approves tools in yolo mode via permission decision', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
      sessionMode: 'yolo',
    });

    const decision = await (backend as any).makePermissionDecision('tc3', 'bash', {});
    expect(decision.decision).toBe('approved');
  });

  it('emits plan event from todowrite update', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
    });

    const messages: any[] = [];
    backend.onMessage((msg) => messages.push(msg));

    (backend as any).handleSessionUpdate({
      sessionId: 'acp-session',
      update: {
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'tc1',
        kind: 'todowrite',
        content: '[{"content":"Do the thing","status":"pending"}]',
      },
    });

    const plan = messages.find((m) => m.type === 'event' && m.name === 'plan');
    expect(plan).toBeDefined();
    expect(plan.payload.entries[0].content).toBe('Do the thing');
  });

  it('emits fs-edit event from edit update', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
    });

    const messages: any[] = [];
    backend.onMessage((msg) => messages.push(msg));

    (backend as any).handleSessionUpdate({
      sessionId: 'acp-session',
      update: {
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'tc2',
        kind: 'edit',
        content: [{ type: 'diff', path: 'README.md', oldText: 'Hello', newText: 'Goodbye' }],
      },
    });

    const edit = messages.find((m) => m.type === 'fs-edit');
    expect(edit).toBeDefined();
    expect(edit.path).toBe('README.md');
  });
});
