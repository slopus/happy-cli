/**
 * Unit tests for GitHookManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHookManager } from './gitHookManager';
import { copyFile, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { spawnSync } from 'child_process';

// Mock fs module - preserve all other functions
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    copyFile: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(),
    chmodSync: vi.fn(),
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('GitHookManager', () => {
  const projectRoot = '/test/project';
  const hookScriptPath = '/test/project/scripts/git_pre_commit_hook.cjs';
  const hookTargetPath = '/test/project/.git/hooks/pre-commit';

  let manager: GitHookManager;

  beforeEach(() => {
    manager = new GitHookManager(projectRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('installHook', () => {
    it('should install hook when not already installed', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (path === hookScriptPath) return true;
        if (path === hookTargetPath) return false;
        return false;
      });

      await manager.installHook();

      expect(copyFile).toHaveBeenCalledWith(
        hookScriptPath,
        hookTargetPath,
        expect.any(Function)
      );
      expect(chmodSync).toHaveBeenCalledWith(hookTargetPath, 0o755);
    });

    it('should not reinstall if already installed', async () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        if (path === hookScriptPath) return true;
        if (path === hookTargetPath) return true;
        return false;
      });

      await manager.installHook();

      expect(copyFile).not.toHaveBeenCalled();
      expect(chmodSync).not.toHaveBeenCalled();
    });

    it('should throw error if hook script does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(manager.installHook()).rejects.toThrow('Hook script not found');
    });
  });

  describe('uninstallHook', () => {
    it('should remove hook if installed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await manager.uninstallHook();

      expect(unlinkSync).toHaveBeenCalledWith(hookTargetPath);
    });

    it('should do nothing if hook not installed', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await manager.uninstallHook();

      expect(unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('isHookInstalled', () => {
    it('should return true when hook is installed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await manager.isHookInstalled();

      expect(result).toBe(true);
      expect(existsSync).toHaveBeenCalledWith(hookTargetPath);
    });

    it('should return false when hook is not installed', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await manager.isHookInstalled();

      expect(result).toBe(false);
    });
  });

  describe('verifyTestsPass', () => {
    it('should return passed when tests succeed', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('Tests passed'),
        stderr: Buffer.from(''),
        pid: 12345,
        output: [null, Buffer.from('Tests passed'), Buffer.from('')],
        signal: null,
      } as any);

      const result = manager.verifyTestsPass();

      expect(result).toEqual({ passed: true });
      expect(spawnSync).toHaveBeenCalledWith('yarn', ['test'], {
        stdio: 'pipe',
        shell: true,
      });
    });

    it('should return failed with error when tests fail', () => {
      const errorOutput = 'Test failed: Expected 1, got 2';
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from(errorOutput),
        pid: 12345,
        output: [null, Buffer.from(''), Buffer.from(errorOutput)],
        signal: null,
      } as any);

      const result = manager.verifyTestsPass();

      expect(result).toEqual({
        passed: false,
        error: errorOutput,
      });
    });

    it('should use stdout if stderr is empty', () => {
      const errorOutput = 'Test failed';
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(errorOutput),
        stderr: Buffer.from(''),
        pid: 12345,
        output: [null, Buffer.from(errorOutput), Buffer.from('')],
        signal: null,
      } as any);

      const result = manager.verifyTestsPass();

      expect(result).toEqual({
        passed: false,
        error: errorOutput,
      });
    });

    it('should return generic error if both stdout and stderr are empty', () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        pid: 12345,
        output: [null, Buffer.from(''), Buffer.from('')],
        signal: null,
      } as any);

      const result = manager.verifyTestsPass();

      expect(result).toEqual({
        passed: false,
        error: 'Tests failed',
      });
    });
  });
});
