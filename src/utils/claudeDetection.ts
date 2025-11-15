import { execSync } from 'child_process'
import chalk from 'chalk'

/**
 * Finds the Claude CLI binary installed via Homebrew
 * Checks common Homebrew paths and system PATH
 * @returns Path to claude binary or null if not found
 */
export function findClaudeCli(): string | null {
  const possiblePaths = [
    '/opt/homebrew/bin/claude',  // Apple Silicon Mac
    '/usr/local/bin/claude',      // Intel Mac
    'claude'                       // System PATH
  ]

  for (const path of possiblePaths) {
    try {
      // Try to run claude --version to verify it works
      execSync(`${path} --version`, { stdio: 'ignore' })
      return path
    } catch (e) {
      continue
    }
  }

  return null
}

/**
 * Verifies Claude installation and returns version info
 * @returns Claude version string or null if not installed
 */
export function verifyClaudeInstallation(): string | null {
  const claudePath = findClaudeCli()

  if (!claudePath) {
    return null
  }

  try {
    const version = execSync(`${claudePath} --version`, { encoding: 'utf8' })
    return version.trim()
  } catch (e) {
    return null
  }
}

/**
 * Displays helpful error message when Claude is not found
 */
export function showClaudeNotFoundError(): void {
  console.error(chalk.red(`
❌ Claude Code is not installed or not found in PATH.

To install Claude Code:
  ${chalk.cyan('brew install anthropic/claude/claude-code')}

Or visit: ${chalk.cyan('https://docs.anthropic.com/en/docs/claude-code')}

After installation, verify with: ${chalk.cyan('claude --version')}
`))
}

/**
 * Gets the Claude CLI path, throwing an error if not found
 * @returns Path to claude binary
 * @throws Error if Claude is not installed
 */
export function getClaudeCli(): string {
  const claudePath = findClaudeCli()

  if (!claudePath) {
    showClaudeNotFoundError()
    process.exit(1)
  }

  return claudePath
}
