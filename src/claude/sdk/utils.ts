/**
 * Utility functions for Claude Code SDK integration
 * Provides helper functions for path resolution and logging
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { logger } from '@/ui/logger'

/**
 * Path segments within node_modules/@anthropic-ai/claude-code/
 *
 * NOTE: Intentionally duplicated from scripts/claude_code_paths.cjs
 * The duplication is acceptable because:
 * - scripts/ contains standalone launcher scripts (CJS, executed directly)
 * - src/ contains bundled application code (ESM, bundled by pkgroll)
 * - They execute in different contexts but must agree on paths to try
 * - If Claude Code changes directory structure, update both locations
 */
const PATH_SEGMENTS = [
  'cli.js',       // Standard location
  'bin/cli.js',   // Alternative bin location
  'dist/cli.js'   // Build output location
] as const

/**
 * Get the directory path of the current module
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

/**
 * Get default path to Claude Code executable
 */
export function getDefaultClaudeCodePath(): string {
    const base = join(__dirname, '..', '..', '..')
    const nodeModulesBase = join(base, 'node_modules', '@anthropic-ai', 'claude-code')

    // Build candidates from shared PATH_SEGMENTS
    const candidates = (PATH_SEGMENTS as readonly string[]).map(segment => join(nodeModulesBase, segment))

    for (const p of candidates) {
        if (existsSync(p)) return p
    }
    return candidates[0]
}

/**
 * Log debug message
 */
export function logDebug(message: string): void {
    if (process.env.DEBUG) {
        logger.debug(message)
        console.log(message)
    }
}

/**
 * Stream async messages to stdin
 */
export async function streamToStdin(
    stream: AsyncIterable<unknown>,
    stdin: NodeJS.WritableStream,
    abort?: AbortSignal
): Promise<void> {
    for await (const message of stream) {
        if (abort?.aborted) break
        stdin.write(JSON.stringify(message) + '\n')
    }
    stdin.end()
}