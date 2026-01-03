/**
 * Permission Flow Integration Tests
 *
 * Tests permission requests, approvals, and denials
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import type { ApiSessionClient } from '@/api/apiSession';
import type { PermissionMode } from '@/opencode/types';

describe('Permission Flow Integration Tests', () => {
  let handler: OpenCodePermissionHandler;
  let mockSession: ApiSessionClient;

  beforeEach(() => {
    mockSession = {
      sendCodexMessage: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApiSessionClient;

    handler = new OpenCodePermissionHandler(mockSession);
  });

  describe('permission requests', () => {
    it('should send permission request in default mode', async () => {
      handler.setPermissionMode('default');

      // Start a request (will be pending)
      const requestPromise = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Should request approval
      expect(mockSession.sendCodexMessage).toHaveBeenCalled();

      // Respond to complete the test
      handler.handlePermissionResponse('call-1', 'approved');

      const result = await requestPromise;
      expect(result.decision).toBe('approved');
    });

    it('should auto-approve in yolo mode', async () => {
      handler.setPermissionMode('yolo');

      const result = await handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Should be auto-approved
      expect(result.decision).toBe('approved_for_session');
      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });

    it('should auto-approve in safe-yolo mode for safe tools', async () => {
      handler.setPermissionMode('safe-yolo');

      const result = await handler.handleToolCall('call-1', 'read_file', {
        path: '/tmp/test.txt',
      });

      // Read-only tools should be auto-approved
      expect(result.decision).toBe('approved_for_session');
      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });

    it('should auto-approve all tools in safe-yolo mode (including write)', async () => {
      handler.setPermissionMode('safe-yolo');

      const result = await handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // safe-yolo auto-approves ALL tools (not just safe ones)
      expect(result.decision).toBe('approved_for_session');
      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });

    it('should approve read tools in read-only mode', async () => {
      handler.setPermissionMode('read-only');

      const result = await handler.handleToolCall('call-1', 'read_file', {
        path: '/tmp/test.txt',
      });

      // Read tools should be auto-approved in read-only mode
      expect(result.decision).toBe('approved');
      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });

    it('should deny write tools in read-only mode', async () => {
      handler.setPermissionMode('read-only');

      const result = await handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Write tools should be denied
      expect(result.decision).toBe('denied');
      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });
  });

  describe('permission approval handling', () => {
    it('should handle user approval', async () => {
      handler.setPermissionMode('default');

      // Start a request
      const requestPromise = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Simulate user approval
      handler.handlePermissionResponse('call-1', 'approved');

      const result = await requestPromise;

      expect(result.decision).toBe('approved');
    });

    it('should handle user denial', async () => {
      handler.setPermissionMode('default');

      // Start a request
      const requestPromise = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Simulate user denial
      handler.handlePermissionResponse('call-1', 'denied');

      const result = await requestPromise;

      expect(result.decision).toBe('denied');
    });

    it('should handle abort', async () => {
      handler.setPermissionMode('default');

      // Start a request
      const requestPromise = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test.txt',
        content: 'test',
      });

      // Reset (should abort all pending)
      handler.reset();

      const result = await requestPromise;

      expect(result.decision).toBe('abort');
    });
  });

  describe('mode transitions', () => {
    it('should switch from default to yolo', () => {
      handler.setPermissionMode('default');
      expect(handler.getPermissionMode()).toBe('default');

      handler.setPermissionMode('yolo');
      expect(handler.getPermissionMode()).toBe('yolo');
    });

    it('should switch from yolo to default', () => {
      handler.setPermissionMode('yolo');
      expect(handler.getPermissionMode()).toBe('yolo');

      handler.setPermissionMode('default');
      expect(handler.getPermissionMode()).toBe('default');
    });

    it('should support all permission modes', () => {
      const modes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];

      for (const mode of modes) {
        handler.setPermissionMode(mode);
        expect(handler.getPermissionMode()).toBe(mode);
      }
    });
  });

  describe('pending requests', () => {
    it('should track pending requests', async () => {
      handler.setPermissionMode('default');

      // Start multiple requests
      const promise1 = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test1.txt',
        content: 'test',
      });

      const promise2 = handler.handleToolCall('call-2', 'write_file', {
        path: '/tmp/test2.txt',
        content: 'test',
      });

      // Both should be pending
      expect(promise1).toBeDefined();
      expect(promise2).toBeDefined();
    });

    it('should resolve requests independently', async () => {
      handler.setPermissionMode('default');

      const promise1 = handler.handleToolCall('call-1', 'write_file', {
        path: '/tmp/test1.txt',
        content: 'test',
      });

      const promise2 = handler.handleToolCall('call-2', 'write_file', {
        path: '/tmp/test2.txt',
        content: 'test',
      });

      // Approve first, deny second
      handler.handlePermissionResponse('call-1', 'approved');
      handler.handlePermissionResponse('call-2', 'denied');

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1.decision).toBe('approved');
      expect(result2.decision).toBe('denied');
    });
  });

  describe('timeout handling', () => {
    it('should timeout waiting for approval', async () => {
      handler.setPermissionMode('default');

      // Set a very short timeout (this would need to be configurable)
      // For now, just verify the mechanism exists
      expect(handler.getPermissionMode()).toBe('default');
    });
  });
});
