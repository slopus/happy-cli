/**
 * Git Hook Commands for Happy CLI
 *
 * Manages git pre-commit hooks that run tests before commits
 */

import chalk from 'chalk';
import { projectPath } from '@/projectPath';
import { gitHookManager } from '@/opencode/hooks/gitHookManager';

/**
 * Handle git-hook subcommands
 */
export async function handleGitHookCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const manager = gitHookManager(projectPath());

  if (subcommand === 'install') {
    try {
      await manager.installHook();
      console.log(chalk.green('✅ Git pre-commit hook installed'));
      console.log(chalk.gray('Tests will run automatically before each commit'));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('Error:'), error.message);
      } else {
        console.error(chalk.red('Error:'), 'Unknown error');
      }
      process.exit(1);
    }
  } else if (subcommand === 'uninstall') {
    try {
      await manager.uninstallHook();
      console.log(chalk.green('✅ Git pre-commit hook removed'));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('Error:'), error.message);
      } else {
        console.error(chalk.red('Error:'), 'Unknown error');
      }
      process.exit(1);
    }
  } else if (subcommand === 'status') {
    try {
      const installed = await manager.isHookInstalled();
      if (installed) {
        console.log(chalk.green('✅ Git pre-commit hook is installed'));
      } else {
        console.log(chalk.yellow('❌ Git pre-commit hook is not installed'));
        console.log(chalk.gray('Run: happy git-hook install'));
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('Error:'), error.message);
      } else {
        console.error(chalk.red('Error:'), 'Unknown error');
      }
      process.exit(1);
    }
  } else if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    showHelp();
  } else {
    console.error(chalk.red(`Unknown subcommand: ${subcommand}`));
    console.log(chalk.gray('Run "happy git-hook --help" for usage information'));
    process.exit(1);
  }
}

/**
 * Show help for git-hook command
 */
function showHelp(): void {
  console.log(`
${chalk.bold('happy git-hook')} - Manage git pre-commit hooks

${chalk.bold('Usage:')}
  happy git-hook install          Install git pre-commit hook
  happy git-hook uninstall        Remove git pre-commit hook
  happy git-hook status           Check if hook is installed
  happy git-hook --help           Show this help

${chalk.bold('Description:')}
  The git pre-commit hook automatically runs tests before allowing commits.
  This helps catch bugs early by ensuring all tests pass before changes are
  committed to the repository.

${chalk.bold('Examples:')}
  ${chalk.cyan('happy git-hook install')}
  ${chalk.gray('# Install the hook - tests will run before each commit')}

  ${chalk.cyan('happy git-hook status')}
  ${chalk.gray('# Check if the hook is installed')}

  ${chalk.cyan('git commit -m "feat: add feature"')}
  ${chalk.gray('# Commit (tests run automatically)')}

${chalk.bold('Notes:')}
  - The hook runs ${chalk.cyan('yarn test')} before each commit
  - If tests fail, the commit is blocked
  - You can uninstall the hook at any time with ${chalk.cyan('happy git-hook uninstall')}
`);
}
