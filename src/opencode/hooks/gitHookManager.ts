/**
 * Git Hook Manager for OpenCode
 *
 * Manages installation and removal of git pre-commit hooks
 * that run tests before allowing commits.
 */

import { copyFile, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'child_process';
import { logger } from '@/ui/logger';

export class GitHookManager {
  private hookScriptPath: string;
  private hookTargetPath: string;

  constructor(projectRoot: string) {
    this.hookScriptPath = resolve(projectRoot, 'scripts', 'git_pre_commit_hook.cjs');
    this.hookTargetPath = resolve(projectRoot, '.git', 'hooks', 'pre-commit');
  }

  /**
   * Install the git pre-commit hook
   * Copies the hook script to .git/hooks/pre-commit and makes it executable
   */
  async installHook(): Promise<void> {
    // Check if hook script exists
    if (!existsSync(this.hookScriptPath)) {
      throw new Error(`Hook script not found: ${this.hookScriptPath}`);
    }

    // Check if already installed
    if (await this.isHookInstalled()) {
      logger.info('Git pre-commit hook already installed');
      return;
    }

    // Copy hook script to .git/hooks/pre-commit
    copyFile(this.hookScriptPath, this.hookTargetPath, (err) => {
      if (err) {
        throw new Error(`Failed to copy hook script: ${err.message}`);
      }
    });

    // Make executable
    chmodSync(this.hookTargetPath, 0o755);

    logger.info('✅ Git pre-commit hook installed');
  }

  /**
   * Uninstall the git pre-commit hook
   * Removes the hook file from .git/hooks/
   */
  async uninstallHook(): Promise<void> {
    if (!await this.isHookInstalled()) {
      logger.info('Git pre-commit hook not installed');
      return;
    }

    unlinkSync(this.hookTargetPath);
    logger.info('✅ Git pre-commit hook removed');
  }

  /**
   * Check if the git pre-commit hook is currently installed
   */
  async isHookInstalled(): Promise<boolean> {
    return existsSync(this.hookTargetPath);
  }

  /**
   * Run tests and return result
   * Used to verify tests pass before allowing commit
   */
  verifyTestsPass(): { passed: boolean; error?: string } {
    const result = spawnSync('yarn', ['test'], {
      stdio: 'pipe',
      shell: true
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      const stdout = result.stdout?.toString() || '';
      return {
        passed: false,
        error: stderr || stdout || 'Tests failed'
      };
    }

    return { passed: true };
  }
}

/**
 * Create a GitHookManager instance for the given project root
 */
export function gitHookManager(projectRoot: string): GitHookManager {
  return new GitHookManager(projectRoot);
}
