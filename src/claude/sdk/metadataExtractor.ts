/**
 * SDK Metadata Extractor
 * Captures available tools and slash commands from Claude SDK and file system
 */

import { query } from './query'
import type { SDKSystemMessage } from './types'
import { logger } from '@/ui/logger'
import { readdir } from 'node:fs/promises'
import { join, relative, parse } from 'node:path'

export interface SDKMetadata {
    tools?: string[]
    slashCommands?: string[]
}

/**
 * Recursively scan directory for .md files and convert to slash command names
 */
async function scanSlashCommands(dir: string, baseDir: string = dir): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const commands: string[] = []

        for (const entry of entries) {
            const fullPath = join(dir, entry.name)

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subCommands = await scanSlashCommands(fullPath, baseDir)
                commands.push(...subCommands)
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                // Convert file path to slash command name
                const relativePath = relative(baseDir, fullPath)
                const parsed = parse(relativePath)
                // Remove .md extension and convert to slash command format
                const commandName = '/' + parsed.dir.split('/').filter(p => p).concat(parsed.name).join('/')
                commands.push(commandName)
            }
        }

        return commands
    } catch (error) {
        logger.debug('[metadataExtractor] Error scanning slash commands:', error)
        return []
    }
}

/**
 * Read slash commands from .claude/commands directory
 */
async function extractSlashCommandsFromFileSystem(cwd: string = process.cwd()): Promise<string[]> {
    const commandsDir = join(cwd, '.claude', 'commands')

    try {
        const commands = await scanSlashCommands(commandsDir)
        logger.debug('[metadataExtractor] Found slash commands from file system:', commands)
        return commands
    } catch (error) {
        logger.debug('[metadataExtractor] No slash commands directory found or error reading:', error)
        return []
    }
}

/**
 * Extract SDK metadata by running a minimal query and capturing the init message
 * Falls back to file system scanning for slash commands if SDK doesn't provide them
 * @returns SDK metadata containing tools and slash commands
 */
export async function extractSDKMetadata(cwd?: string): Promise<SDKMetadata> {
    const abortController = new AbortController()

    try {
        logger.debug('[metadataExtractor] Starting SDK metadata extraction')

        // Run SDK with minimal tools allowed
        const sdkQuery = query({
            prompt: 'hello',
            options: {
                allowedTools: ['Bash(echo)'],
                maxTurns: 1,
                abort: abortController.signal,
                cwd
            }
        })

        // Wait for the first system message which contains tools and slash commands
        for await (const message of sdkQuery) {
            if (message.type === 'system' && message.subtype === 'init') {
                const systemMessage = message as SDKSystemMessage

                const metadata: SDKMetadata = {
                    tools: systemMessage.tools,
                    slashCommands: systemMessage.slash_commands
                }

                logger.debug('[metadataExtractor] Captured SDK metadata:', metadata)

                // Abort the query since we got what we need
                abortController.abort()

                return metadata
            }
        }

        logger.debug('[metadataExtractor] No init message received from SDK, falling back to file system scan')

    } catch (error) {
        // Check if it's an abort error (expected)
        if (error instanceof Error && error.name === 'AbortError') {
            logger.debug('[metadataExtractor] SDK query aborted after capturing metadata')
            return {}
        }
        logger.debug('[metadataExtractor] Error extracting SDK metadata:', error)
    }

    // Fallback: Read slash commands from file system
    const slashCommands = await extractSlashCommandsFromFileSystem(cwd)

    return {
        slashCommands: slashCommands.length > 0 ? slashCommands : undefined
    }
}

/**
 * Extract SDK metadata asynchronously without blocking
 * Fires the extraction and updates metadata when complete
 */
export function extractSDKMetadataAsync(onComplete: (metadata: SDKMetadata) => void, cwd?: string): void {
    extractSDKMetadata(cwd)
        .then(metadata => {
            if (metadata.tools || metadata.slashCommands) {
                onComplete(metadata)
            }
        })
        .catch(error => {
            logger.debug('[metadataExtractor] Async extraction failed:', error)
        })
}
