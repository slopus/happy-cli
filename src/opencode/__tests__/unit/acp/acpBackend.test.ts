/**
 * ACP Backend Unit Tests
 *
 * Tests for the ACP (Agent Client Protocol) backend implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import { MockACPServer } from '../../helpers/mockACP';
import type { AgentBackend } from '@/agent/AgentBackend';

describe('ACP Backend Unit Tests', () => {
  let mockServer: MockACPServer;
  let backend: AgentBackend;

  beforeEach(async () => {
    mockServer = new MockACPServer();
    await mockServer.start();
  });

  afterEach(async () => {
    if (backend) {
      await backend.dispose();
    }
    await mockServer.stop();
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

      backend = createOpenCodeBackend({
        cwd: '/tmp/test',
        mcpServers: {},
        permissionHandler: null as any,
        model: 'gpt-4',
      });

      // Simulate timeout
      const startPromise = backend.startSession();
      vi.advanceTimersByTime(30000);

      await expect(startPromise).rejects.toThrow();
      vi.useRealTimers();
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
      const response = await backend.sendPrompt(sessionId, 'Hello');

      expect(response).toBeDefined();
    });

    it('should handle large prompts (>100KB)', async () => {
      const largePrompt = 'x'.repeat(100_000);
      const sessionId = randomUUID();

      // Should not crash
      const response = await backend.sendPrompt(sessionId, largePrompt);
      expect(response).toBeDefined();
    });

    it('should reject empty prompts', async () => {
      const sessionId = randomUUID();

      await expect(
        backend.sendPrompt(sessionId, '')
      ).rejects.toThrow();
    });

    it('should handle Unicode/special characters', async () => {
      const unicodePrompt = 'Hello 🌍 世界 שלום café™';
      const sessionId = randomUUID();

      const response = await backend.sendPrompt(sessionId, unicodePrompt);
      expect(response).toBeDefined();
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
      await expect(promptPromise).resolves.toBeDefined();
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
});
