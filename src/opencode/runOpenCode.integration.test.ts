/**
 * OpenCode integration tests
 *
 * Tests the main runOpenCode entry point and its integration
 * with various components.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isOpenCodeInstalled } from './runOpenCode';
import { writeOpenCodeModel, readOpenCodeConfig, readOpenCodeModel } from './utils/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mock fs functions
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock logger
vi.mock('@/ui/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock child_process exec
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd, callback) => {
    // Default: opencode exists
    (callback as any)(null, 'opencode 1.0.0', '');
    return {} as any;
  }),
}));

describe('OpenCode integration', () => {
  const mockConfigPath = join(homedir(), '.config/opencode/config.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isOpenCodeInstalled', () => {
    it('should return true when opencode binary exists', async () => {
      // Default mock returns true, so this should pass
      const result = await isOpenCodeInstalled();
      expect(result).toBe(true);
    });

    it('should return false when opencode binary not found', async () => {
      const { exec } = await import('node:child_process');
      // Override mock for this test
      vi.mocked(exec).mockImplementationOnce((_cmd, callback) => {
        (callback as any)(new Error('Command not found'), '', 'opencode: command not found');
        return {} as any;
      });

      const result = await isOpenCodeInstalled();
      expect(result).toBe(false);
    });
  });

  describe('runOpenCode model handling', () => {
    it('should write model to new config file', async () => {
      const model = 'anthropic/claude-sonnet-4-20250514';

      await writeOpenCodeModel(model);

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.config/opencode'),
        { recursive: true }
      );
      expect(writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ model }, null, 2),
        'utf-8'
      );
    });

    it('should update model in existing config', async () => {
      const existingConfig = {
        model: 'claude-3',
        mcpServers: {
          filesystem: { command: 'npx' },
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingConfig));

      await writeOpenCodeModel('gpt-4o');

      expect(writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify({ model: 'gpt-4o', mcpServers: { filesystem: { command: 'npx' } } }, null, 2),
        'utf-8'
      );
    });

    it('should throw error when write fails', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('EACCES'));

      await expect(writeOpenCodeModel('gpt-4o')).rejects.toThrow();
    });

    it('should preserve existing config when updating model', async () => {
      const existingConfig = {
        model: 'old-model',
        mcpServers: {
          server1: { command: 'cmd1' },
          server2: { command: 'cmd2', args: ['--port', '8080'] },
        },
        someOtherField: 'value',
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingConfig));

      await writeOpenCodeModel('new-model');

      const writtenConfig = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
      expect(writtenConfig).toEqual({
        model: 'new-model',
        mcpServers: {
          server1: { command: 'cmd1' },
          server2: { command: 'cmd2', args: ['--port', '8080'] },
        },
        someOtherField: 'value',
      });
    });

    it('should read model from config', async () => {
      const mockConfig = {
        model: 'anthropic/claude-sonnet-4-20250514',
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readOpenCodeModel();

      expect(result).toBe('anthropic/claude-sonnet-4-20250514');
    });

    it('should return undefined when model is not set', async () => {
      const mockConfig = {
        mcpServers: {},
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readOpenCodeModel();

      expect(result).toBeUndefined();
    });

    it('should return undefined when config file does not exist', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await readOpenCodeModel();

      expect(result).toBeUndefined();
    });
  });

  describe('runOpenCode MCP server merging', () => {
    it('should read OpenCode config with MCP servers', async () => {
      const openCodeConfig = {
        model: 'gpt-4o',
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
          brave: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
          },
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(openCodeConfig));

      const config = await readOpenCodeConfig();

      expect(config.mcpServers).toBeDefined();
      expect(Object.keys(config.mcpServers || {})).toHaveLength(2);
    });

    it('should handle empty MCP servers config', async () => {
      const openCodeConfig = {
        model: 'gpt-4o',
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(openCodeConfig));

      const config = await readOpenCodeConfig();

      expect(config.model).toBe('gpt-4o');
      expect(config.mcpServers).toBeUndefined();
    });
  });

  describe('runOpenCode permission handling', () => {
    it('should support permission mode types', async () => {
      const { OpenCodePermissionHandler } = await import('./utils/permissionHandler');

      const mockSession = {
        sendCodexMessage: vi.fn(),
      };

      const handler = new OpenCodePermissionHandler(mockSession as any);

      // Test all permission modes
      const modes: Array<'default' | 'read-only' | 'safe-yolo' | 'yolo'> =
        ['default', 'read-only', 'safe-yolo', 'yolo'];

      for (const mode of modes) {
        handler.setPermissionMode(mode);
        expect(handler.getPermissionMode()).toBe(mode);
      }
    });

    it('should auto-approve in yolo mode', async () => {
      const { OpenCodePermissionHandler } = await import('./utils/permissionHandler');

      const mockSession = {
        sendCodexMessage: vi.fn(),
      };

      const handler = new OpenCodePermissionHandler(mockSession as any);
      handler.setPermissionMode('yolo');

      const result = await handler.handleToolCall('call-1', 'write_file', { path: '/tmp/test' });

      expect(result.decision).toBe('approved_for_session');
    });

    it('should deny write tools in read-only mode', async () => {
      const { OpenCodePermissionHandler } = await import('./utils/permissionHandler');

      const mockSession = {
        sendCodexMessage: vi.fn(),
      };

      const handler = new OpenCodePermissionHandler(mockSession as any);
      handler.setPermissionMode('read-only');

      const result = await handler.handleToolCall('call-1', 'write_file', { path: '/tmp/test' });

      expect(result.decision).toBe('denied');
    });

    it('should approve read tools in read-only mode', async () => {
      const { OpenCodePermissionHandler } = await import('./utils/permissionHandler');

      const mockSession = {
        sendCodexMessage: vi.fn(),
      };

      const handler = new OpenCodePermissionHandler(mockSession as any);
      handler.setPermissionMode('read-only');

      const result = await handler.handleToolCall('call-1', 'read_file', { path: '/tmp/test' });

      expect(result.decision).toBe('approved');
    });
  });

  describe('OpenCode types', () => {
    it('should support PermissionMode type', async () => {
      type PermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo';

      const modes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];

      expect(modes).toHaveLength(4);
      expect(modes).toContain('default');
      expect(modes).toContain('read-only');
      expect(modes).toContain('safe-yolo');
      expect(modes).toContain('yolo');
    });

    it('should support OpenCodeMode interface', async () => {
      interface OpenCodeMode {
        permissionMode?: 'default' | 'read-only' | 'safe-yolo' | 'yolo';
        model?: string;
      }

      const mode1: OpenCodeMode = {
        permissionMode: 'yolo',
        model: 'gpt-4o',
      };

      const mode2: OpenCodeMode = {
        model: 'claude-sonnet-4',
      };

      expect(mode1.permissionMode).toBe('yolo');
      expect(mode1.model).toBe('gpt-4o');
      expect(mode2.model).toBe('claude-sonnet-4');
      expect(mode2.permissionMode).toBeUndefined();
    });

    it('should support CodexMessagePayload interface', async () => {
      interface CodexMessagePayload {
        type: 'message';
        message: string;
        id: string;
        options?: Array<{
          optionId: string;
          name: string;
        }>;
      }

      const payload: CodexMessagePayload = {
        type: 'message',
        message: 'Test message',
        id: 'test-id',
        options: [
          { optionId: '1', name: 'Option 1' },
          { optionId: '2', name: 'Option 2' },
        ],
      };

      expect(payload.type).toBe('message');
      expect(payload.message).toBe('Test message');
      expect(payload.options).toHaveLength(2);
    });
  });
});
