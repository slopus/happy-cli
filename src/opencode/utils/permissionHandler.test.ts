/**
 * OpenCode Permission Handler tests
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OpenCodePermissionHandler } from './permissionHandler';
import type { PermissionMode } from '../types';
import { ApiSessionClient } from '@/api/apiSession';

// Mock ApiSessionClient
vi.mock('@/api/apiSession', () => ({
  ApiSessionClient: vi.fn(),
}));

describe('OpenCodePermissionHandler', () => {
  let handler: OpenCodePermissionHandler;
  let mockSession: ApiSessionClient;

  beforeEach(() => {
    // Create mock session
    mockSession = {
      sendCodexMessage: vi.fn(),
    } as unknown as ApiSessionClient;

    handler = new OpenCodePermissionHandler(mockSession);
    vi.clearAllMocks();
  });

  describe('permission mode management', () => {
    it('should have default permission mode', () => {
      expect(handler.getPermissionMode()).toBe('default');
    });

    it('should set permission mode', () => {
      handler.setPermissionMode('yolo');
      expect(handler.getPermissionMode()).toBe('yolo');
    });

    it('should support all permission modes', () => {
      const modes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];

      for (const mode of modes) {
        handler.setPermissionMode(mode);
        expect(handler.getPermissionMode()).toBe(mode);
      }
    });
  });

  describe('handleToolCall in yolo mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('yolo');
    });

    it('should auto-approve all tools', async () => {
      const result = await handler.handleToolCall('call-1', 'write_file', { path: '/tmp/test' });

      expect(result.decision).toBe('approved_for_session');
    });

    it('should not send permission request to mobile', async () => {
      await handler.handleToolCall('call-1', 'any_tool', {});

      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleToolCall in safe-yolo mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('safe-yolo');
    });

    it('should auto-approve all tools', async () => {
      const result = await handler.handleToolCall('call-1', 'write_file', { path: '/tmp/test' });

      expect(result.decision).toBe('approved_for_session');
    });

    it('should not send permission request to mobile', async () => {
      await handler.handleToolCall('call-1', 'any_tool', {});

      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleToolCall in read-only mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('read-only');
    });

    it('should approve read-only tools', async () => {
      const readTools = [
        'read_file',
        'list_directory',
        'search',
        'codebase_search',
        'diagnostics',
        'completions',
        'definition',
        'hover',
        'codebase_investigator',
      ];

      for (const toolName of readTools) {
        const result = await handler.handleToolCall('call-1', toolName, {});
        expect(result.decision).toBe('approved');
      }
    });

    it('should deny write tools', async () => {
      const writeTools = [
        'write_file',
        'edit_file',
        'delete_file',
        'run_command',
        'bash',
        'execute',
      ];

      for (const toolName of writeTools) {
        const result = await handler.handleToolCall('call-1', toolName, {});
        expect(result.decision).toBe('denied');
      }
    });

    it('should not send permission requests in read-only mode', async () => {
      await handler.handleToolCall('call-1', 'read_file', { path: '/tmp/test' });

      expect(mockSession.sendCodexMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleToolCall in default mode', () => {
    beforeEach(() => {
      handler.setPermissionMode('default');
    });

    it('should send permission request to mobile for tool approval', async () => {
      const promise = handler.handleToolCall('call-1', 'write_file', { path: '/tmp/test' });

      // Should have sent codex message
      expect(mockSession.sendCodexMessage).toHaveBeenCalledWith({
        type: 'permission-request',
        permissionId: 'call-1',
        reason: 'Tool "write_file" requires approval',
        payload: { path: '/tmp/test' },
        id: 'call-1',
      });

      // Should be pending
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should return approved when mobile approves', async () => {
      const promise = handler.handleToolCall('call-1', 'write_file', {});

      // Simulate mobile approval
      handler.handlePermissionResponse('call-1', 'approved');

      const result = await promise;
      expect(result.decision).toBe('approved');
    });

    it('should return denied when mobile denies', async () => {
      const promise = handler.handleToolCall('call-1', 'write_file', {});

      // Simulate mobile denial
      handler.handlePermissionResponse('call-1', 'denied');

      const result = await promise;
      expect(result.decision).toBe('denied');
    });

    it('should return abort when mobile aborts', async () => {
      const promise = handler.handleToolCall('call-1', 'write_file', {});

      // Simulate mobile abort
      handler.handlePermissionResponse('call-1', 'abort');

      const result = await promise;
      expect(result.decision).toBe('abort');
    });

    it('should handle multiple concurrent permission requests', async () => {
      const promise1 = handler.handleToolCall('call-1', 'write_file', {});
      const promise2 = handler.handleToolCall('call-2', 'read_file', {});
      const promise3 = handler.handleToolCall('call-3', 'bash', {});

      // Approve in reverse order
      handler.handlePermissionResponse('call-3', 'approved');
      handler.handlePermissionResponse('call-2', 'denied');
      handler.handlePermissionResponse('call-1', 'approved');

      const result1 = await promise1;
      const result2 = await promise2;
      const result3 = await promise3;

      expect(result1.decision).toBe('approved');
      expect(result2.decision).toBe('denied');
      expect(result3.decision).toBe('approved');
    });
  });

  describe('handlePermissionResponse', () => {
    beforeEach(() => {
      handler.setPermissionMode('default');
    });

    it('should resolve pending approval when response received', async () => {
      const promise = handler.handleToolCall('call-1', 'write_file', {});

      handler.handlePermissionResponse('call-1', 'approved');

      const result = await promise;
      expect(result.decision).toBe('approved');
    });

    it('should do nothing when no pending approval exists', () => {
      // Should not throw
      expect(() => {
        handler.handlePermissionResponse('nonexistent', 'approved');
      }).not.toThrow();
    });

    it('should remove pending approval after response', async () => {
      const promise1 = handler.handleToolCall('call-1', 'write_file', {});

      handler.handlePermissionResponse('call-1', 'approved');
      await promise1;

      // Second response should be ignored
      expect(() => {
        handler.handlePermissionResponse('call-1', 'denied');
      }).not.toThrow();
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      handler.setPermissionMode('default');
    });

    it('should abort all pending approvals', async () => {
      const promise1 = handler.handleToolCall('call-1', 'write_file', {});
      const promise2 = handler.handleToolCall('call-2', 'read_file', {});
      const promise3 = handler.handleToolCall('call-3', 'bash', {});

      handler.reset();

      const result1 = await promise1;
      const result2 = await promise2;
      const result3 = await promise3;

      expect(result1.decision).toBe('abort');
      expect(result2.decision).toBe('abort');
      expect(result3.decision).toBe('abort');
    });

    it('should clear pending approvals map', async () => {
      handler.handleToolCall('call-1', 'write_file', {});
      handler.handleToolCall('call-2', 'read_file', {});

      handler.reset();

      // After reset, responses should be no-ops
      expect(() => {
        handler.handlePermissionResponse('call-1', 'approved');
        handler.handlePermissionResponse('call-2', 'denied');
      }).not.toThrow();
    });
  });

  describe('isWriteTool (private method behavior)', () => {
    beforeEach(() => {
      handler.setPermissionMode('read-only');
    });

    it('should identify read tools correctly', async () => {
      const readTools = [
        'read_file',
        'list_directory',
        'search',
        'codebase_search',
        'diagnostics',
        'completions',
        'definition',
        'hover',
        'codebase_investigator',
      ];

      for (const toolName of readTools) {
        const result = await handler.handleToolCall('call-1', toolName, {});
        expect(result.decision).toBe('approved');
      }
    });

    it('should identify write tools correctly', async () => {
      const writeTools = [
        'write_file',
        'edit_file',
        'delete_file',
        'create_file',
        'move_file',
        'copy_file',
        'run_command',
        'bash',
        'execute',
        'shell',
      ];

      for (const toolName of writeTools) {
        const result = await handler.handleToolCall('call-1', toolName, {});
        expect(result.decision).toBe('denied');
      }
    });

    it('should handle tools with partial name matches', async () => {
      // Tools containing read tool names should be approved
      const result1 = await handler.handleToolCall('call-1', 'enhanced_read_file', {});
      expect(result1.decision).toBe('approved');

      // Tools not containing read tool names should be denied
      const result2 = await handler.handleToolCall('call-2', 'custom_tool', {});
      expect(result2.decision).toBe('denied');
    });
  });
});
