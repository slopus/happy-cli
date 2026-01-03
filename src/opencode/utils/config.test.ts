/**
 * OpenCode config utilities tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  readOpenCodeConfig,
  convertOpenCodeMcpServers,
  getMergedMcpServers,
  readOpenCodeModel,
  writeOpenCodeModel,
} from './config';
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

describe('OpenCode config utilities', () => {
  const mockConfigPath = join(homedir(), '.config/opencode/config.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readOpenCodeConfig', () => {
    it('should read and parse valid config', async () => {
      const mockConfig = {
        model: 'anthropic/claude-sonnet-4-20250514',
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
          },
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readOpenCodeConfig();

      expect(readFile).toHaveBeenCalledWith(mockConfigPath, 'utf-8');
      expect(result).toEqual(mockConfig);
    });

    it('should return empty object when config file not found', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await readOpenCodeConfig();

      expect(result).toEqual({});
    });

    it('should return empty object when config is invalid JSON', async () => {
      vi.mocked(readFile).mockResolvedValue('invalid json{');

      const result = await readOpenCodeConfig();

      expect(result).toEqual({});
    });
  });

  describe('convertOpenCodeMcpServers', () => {
    it('should convert OpenCode MCP server format to Happy format', () => {
      const openCodeServers = {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
        brave: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-brave-search'],
          env: { BRAVE_API_KEY: 'test-key' },
        },
      };

      const result = convertOpenCodeMcpServers(openCodeServers);

      expect(result).toEqual({
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
        brave: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-brave-search'],
          env: { BRAVE_API_KEY: 'test-key' },
        },
      });
    });

    it('should return empty object when no servers provided', () => {
      const result = convertOpenCodeMcpServers(undefined);
      expect(result).toEqual({});
    });

    it('should return empty object when servers is null', () => {
      const result = convertOpenCodeMcpServers(null as any);
      expect(result).toEqual({});
    });

    it('should handle servers without args or env', () => {
      const openCodeServers = {
        minimal: {
          command: 'node',
          args: ['server.js'],
        },
      };

      const result = convertOpenCodeMcpServers(openCodeServers);

      expect(result).toEqual({
        minimal: {
          command: 'node',
          args: ['server.js'],
        },
      });
    });
  });

  describe('getMergedMcpServers', () => {
    it('should merge OpenCode and Happy servers with Happy taking precedence', async () => {
      const mockOpenCodeConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
          server2: { command: 'cmd2' },
        },
      };

      const happyServers = {
        server2: { command: 'happy-cmd2' }, // Should override OpenCode's server2
        server3: { command: 'cmd3' },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockOpenCodeConfig));

      const result = await getMergedMcpServers(happyServers);

      expect(result).toEqual({
        server1: { command: 'cmd1' }, // From OpenCode
        server2: { command: 'happy-cmd2' }, // From Happy (override)
        server3: { command: 'cmd3' }, // From Happy
      });
    });

    it('should return only Happy servers when OpenCode config is empty', async () => {
      const happyServers = {
        server1: { command: 'cmd1' },
      };

      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getMergedMcpServers(happyServers);

      expect(result).toEqual({
        server1: { command: 'cmd1' },
      });
    });

    it('should return only OpenCode servers when Happy servers is undefined', async () => {
      const mockOpenCodeConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
        },
      };

      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockOpenCodeConfig));

      const result = await getMergedMcpServers(undefined);

      expect(result).toEqual({
        server1: { command: 'cmd1' },
      });
    });

    it('should return empty object when both sources are empty', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await getMergedMcpServers(undefined);

      expect(result).toEqual({});
    });
  });

  describe('readOpenCodeModel', () => {
    it('should return model from config', async () => {
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

  describe('writeOpenCodeModel', () => {
    it('should write model to new config file', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await writeOpenCodeModel('gpt-4o');

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.config/opencode'), { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        JSON.stringify({ model: 'gpt-4o' }, null, 2),
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

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingConfig));
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await writeOpenCodeModel('gpt-4o');

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('config.json'),
        JSON.stringify({ model: 'gpt-4o', mcpServers: { filesystem: { command: 'npx' } } }, null, 2),
        'utf-8'
      );
    });

    it('should throw error when write fails', async () => {
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
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

      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(existingConfig));
      vi.mocked(writeFile).mockResolvedValue(undefined);

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
  });
});
