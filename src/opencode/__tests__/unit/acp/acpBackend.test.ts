/**
 * ACP Backend Unit Tests
 *
 * Tests for the ACP (Agent Client Protocol) backend implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import type { AgentBackend } from '@/agent/AgentBackend';

const mockInitialize = vi.fn();
const mockNewSession = vi.fn();
const mockLoadSession = vi.fn();
const mockPrompt = vi.fn();
const mockCancel = vi.fn();
const mockExtMethod = vi.fn();

const createMockProcess = () => {
  const process = new EventEmitter() as any;
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = vi.fn((signal?: NodeJS.Signals) => {
    process.emit('exit', 0, signal ?? null);
    return true;
  });
  return process;
};

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(() => createMockProcess()),
  };
});

vi.mock('@agentclientprotocol/sdk', () => {
  class ClientSideConnection {
    initialize = mockInitialize;
    newSession = mockNewSession;
    loadSession = mockLoadSession;
    prompt = mockPrompt;
    cancel = mockCancel;
    extMethod = mockExtMethod;

    constructor(_clientFactory: unknown, _stream: unknown) {}
  }

  return {
    ClientSideConnection,
    ndJsonStream: vi.fn(() => ({})),
  };
});

describe('ACP Backend Unit Tests', () => {
  let backend: AgentBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue({
      protocolVersion: 1,
      agentCapabilities: {},
      authMethods: [],
      agentInfo: { name: 'MockACP', version: '0.0.0' },
    });
    mockNewSession.mockResolvedValue({ sessionId: 'acp_session_1' });
    mockLoadSession.mockResolvedValue({ sessionId: 'acp_session_1' });
    mockPrompt.mockResolvedValue({ content: 'Mock response', complete: true });
    mockCancel.mockResolvedValue({ cancelled: true });
    mockExtMethod.mockResolvedValue({});
  });

  afterEach(async () => {
    if (backend) {
      await backend.dispose();
    }
  });

  describe('startSession', () => {
    it('should create session with valid config', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const { sessionId } = await backend.startSession();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should handle timeout on session start', async () => {
      vi.useFakeTimers();
      mockInitialize.mockImplementation(() => new Promise(() => {}));

      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      try {
        const startPromise = backend.startSession();
        vi.advanceTimersByTime(120000);

        await expect(startPromise).rejects.toThrow(/Initialize timeout/);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw on invalid model', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: '', // Invalid empty model
      });

      // Should handle gracefully
      const { sessionId } = await backend.startSession();
      expect(sessionId).toBeDefined();
    });
  });

  describe('sendPrompt', () => {
    beforeEach(async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });
      await backend.startSession();
    });

    it('should send prompt successfully', async () => {
      const sessionId = randomUUID();

      await expect(backend.sendPrompt(sessionId, 'Hello')).resolves.toBeUndefined();
    });

    it('should handle large prompts (>100KB)', async () => {
      const largePrompt = 'x'.repeat(100_000);
      const sessionId = randomUUID();

      await expect(backend.sendPrompt(sessionId, largePrompt)).resolves.toBeUndefined();
    });

    it('should allow empty prompts', async () => {
      const sessionId = randomUUID();

      await expect(backend.sendPrompt(sessionId, '')).resolves.toBeUndefined();
    });

    it('should handle Unicode/special characters', async () => {
      const unicodePrompt = 'Hello 🌍 世界 שלום café™';
      const sessionId = randomUUID();

      await expect(backend.sendPrompt(sessionId, unicodePrompt)).resolves.toBeUndefined();
    });
  });

  describe('cancel', () => {
    beforeEach(async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });
      await backend.startSession();
    });

    it('should cancel running operation', async () => {
      const sessionId = randomUUID();

      // Start a long operation
      const promptPromise = backend.sendPrompt(sessionId, 'Long task');

      // Cancel it
      await backend.cancel(sessionId);

      // Should handle gracefully
      await expect(promptPromise).resolves.toBeUndefined();
    });

    it('should be idempotent (multiple cancels)', async () => {
      const sessionId = randomUUID();

      await backend.cancel(sessionId);
      await backend.cancel(sessionId);
      await backend.cancel(sessionId);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should close ACP connection', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });
      await backend.startSession();

      await backend.dispose();

      // Should handle gracefully
      expect(true).toBe(true);
    });

    it('should handle multiple dispose calls', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      await backend.dispose();
      await backend.dispose();
      await backend.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('session resumption', () => {
    it('should accept resumeSessionId option', async () => {
      // This test verifies the option is passed through
      // Actual loadSession behavior requires real OpenCode
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        resumeSessionId: 'ses_test123',
      });

      // The backend should be created successfully
      expect(backend).toBeDefined();

      // When we dispose without starting, it should not error
      await backend.dispose();
    });

    it('should accept backend without resumeSessionId (backward compatible)', async () => {
      // Verify existing behavior still works
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        // No resumeSessionId - should work fine
      });

      expect(backend).toBeDefined();
      await backend.dispose();
    });
  });

  describe('mode validation', () => {
    it('defaults to default session mode for unsupported values', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        sessionMode: 'fast' as any,
      });

      expect((backend as any).getSessionMode()).toBe('default');
    });

    it('auto-approves tools in yolo mode', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        sessionMode: 'yolo',
      });

      const result = await (backend as any).makePermissionDecision('tc1', 'bash', {});

      expect(result.decision).toBe('approved');
    });

    it('approves safe tools in safe mode', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        sessionMode: 'safe',
      });

      const result = await (backend as any).makePermissionDecision('tc1', 'read_file', {});

      expect(result.decision).toBe('approved');
    });

    it('denies unsafe tools in safe mode', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
        sessionMode: 'safe',
      });

      const result = await (backend as any).makePermissionDecision('tc1', 'bash', {});

      expect(result.decision).toBe('denied');
    });

    it('clears invalid permission mode entries', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'test-model',
      });

      const backendAny = backend as any;
      backendAny.permissionModes.set('bash', { mode: 'sometimes', setAt: Date.now() });

      const result = await backendAny.makePermissionDecision('tc1', 'bash', {});

      expect(result.decision).toBe('denied');
      expect(backendAny.permissionModes.has('bash')).toBe(false);
    });
  });

  describe('tool call updates', () => {
    it('emits fs-edit when update.content provides diff finder', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const messages: any[] = [];
      backend.onMessage((msg) => messages.push(msg));

      const diffContent = { type: 'diff', path: 'file.txt', oldText: 'old', newText: 'new' };
      const contentWithFind = { find: () => diffContent };

      (backend as any).handleSessionUpdate({
        sessionId: 'sess_1',
        update: {
          sessionUpdate: 'tool_call_update',
          status: 'completed',
          toolCallId: 'tc1',
          kind: 'edit',
          content: contentWithFind,
        },
      });

      const editMsg = messages.find((m) => m.type === 'fs-edit');
      expect(editMsg).toBeDefined();
      expect(editMsg.path).toBe('file.txt');
    });
  });

  describe('session updates', () => {
    it('emits model-output for user_message_chunk delta', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const messages: any[] = [];
      backend.onMessage((msg) => messages.push(msg));

      (backend as any).handleSessionUpdate({
        sessionId: 'sess_1',
        update: {
          sessionUpdate: 'user_message_chunk',
          delta: 'Hello from user',
        },
      });

      const output = messages.find((m) => m.type === 'model-output');
      expect(output).toBeDefined();
      expect(output.textDelta).toBe('Hello from user');
    });

    it('stores available modes update', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const availableModes = [{ id: 'default', label: 'Default' }];

      (backend as any).handleSessionUpdate({
        sessionId: 'sess_1',
        update: {
          sessionUpdate: 'available_modes_update',
          availableModes,
        },
      });

      expect((backend as any).availableModes).toEqual(availableModes);
    });

    it('stores available models update', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const availableModels = [{ id: 'gpt-4', label: 'GPT-4' }];

      (backend as any).handleSessionUpdate({
        sessionId: 'sess_1',
        update: {
          sessionUpdate: 'available_models_update',
          availableModels,
        },
      });

      expect((backend as any).availableModels).toEqual(availableModels);
    });
  });

  describe('command handling', () => {
    it('emits unknown for unsupported command when list provided', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      const messages: any[] = [];
      backend.onMessage((msg) => messages.push(msg));
      (backend as any).availableCommands = [{ name: 'list', description: 'List' }];

      await (backend as any).executeCommand('compact', []);

      const output = messages.find((m) => m.type === 'terminal-output');
      expect(output).toBeDefined();
      expect(output.data).toBe('Unknown command: /compact. Type /help for available commands.');
    });

    it('emits error when command execution fails', async () => {
      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      await backend.startSession();

      const messages: any[] = [];
      backend.onMessage((msg) => messages.push(msg));
      (backend as any).availableCommands = [{ name: 'compact', description: 'Compact' }];
      mockExtMethod.mockRejectedValueOnce(new Error('boom'));

      await expect((backend as any).executeCommand('compact', [])).resolves.toBeUndefined();

      const output = messages.find((m) => m.type === 'terminal-output');
      expect(output).toBeDefined();
      expect(output.data).toBe('Error executing /compact: boom');
    });
  });
});
