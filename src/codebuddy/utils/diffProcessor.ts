/**
 * Diff Processor for CodeBuddy - Handles file edit events and tracks unified_diff changes
 * 
 * This processor tracks changes from fs-edit events and tool_call results that contain
 * file modification information, converting them to CodebuddyDiff tool calls similar to Codex.
 * 
 * Note: CodeBuddy ACP may track file changes through fs-edit events and tool results.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';

export interface DiffToolCall {
    type: 'tool-call';
    name: 'CodebuddyDiff';
    callId: string;
    input: {
        unified_diff?: string;
        path?: string;
        description?: string;
    };
    id: string;
}

export interface DiffToolResult {
    type: 'tool-call-result';
    callId: string;
    output: {
        status: 'completed';
    };
    id: string;
}

export class CodebuddyDiffProcessor {
    private previousDiffs = new Map<string, string>(); // Track diffs per file path
    private onMessage: ((message: any) => void) | null = null;

    constructor(onMessage?: (message: any) => void) {
        this.onMessage = onMessage || null;
    }

    /**
     * Process an fs-edit event and check if it contains diff information
     */
    processFsEdit(path: string, description?: string, diff?: string): void {
        logger.debug(`[CodebuddyDiffProcessor] Processing fs-edit for path: ${path}`);
        
        // If we have a diff, process it
        if (diff) {
            this.processDiff(path, diff, description);
        } else {
            // Even without diff, we can track that a file was edited
            // Generate a simple diff representation
            const simpleDiff = `File edited: ${path}${description ? ` - ${description}` : ''}`;
            this.processDiff(path, simpleDiff, description);
        }
    }

    /**
     * Process a tool result that may contain diff information
     */
    processToolResult(toolName: string, result: any, callId: string): void {
        // Check if result contains diff information
        if (result && typeof result === 'object') {
            // Look for common diff fields
            const diff = result.diff || result.unified_diff || result.patch;
            const path = result.path || result.file;
            
            if (diff && path) {
                logger.debug(`[CodebuddyDiffProcessor] Found diff in tool result: ${toolName} (${callId})`);
                this.processDiff(path, diff, result.description);
            } else if (result.changes && typeof result.changes === 'object') {
                // Handle multiple file changes (like patch operations)
                for (const [filePath, change] of Object.entries(result.changes)) {
                    const changeDiff = (change as any).diff || (change as any).unified_diff || 
                                     JSON.stringify(change);
                    this.processDiff(filePath, changeDiff, (change as any).description);
                }
            }
        }
    }

    /**
     * Process a unified diff and check if it has changed from the previous value
     */
    private processDiff(path: string, unifiedDiff: string, description?: string): void {
        const previousDiff = this.previousDiffs.get(path);
        
        // Check if the diff has changed from the previous value
        if (previousDiff !== unifiedDiff) {
            logger.debug(`[CodebuddyDiffProcessor] Unified diff changed for ${path}, sending CodebuddyDiff tool call`);
            
            // Generate a unique call ID for this diff
            const callId = randomUUID();
            
            // Send tool call for the diff change
            const toolCall: DiffToolCall = {
                type: 'tool-call',
                name: 'CodebuddyDiff',
                callId: callId,
                input: {
                    unified_diff: unifiedDiff,
                    path: path,
                    description: description
                },
                id: randomUUID()
            };
            
            this.onMessage?.(toolCall);
            
            // Immediately send the tool result to mark it as completed
            const toolResult: DiffToolResult = {
                type: 'tool-call-result',
                callId: callId,
                output: {
                    status: 'completed'
                },
                id: randomUUID()
            };
            
            this.onMessage?.(toolResult);
        }
        
        // Update the stored diff value
        this.previousDiffs.set(path, unifiedDiff);
        logger.debug(`[CodebuddyDiffProcessor] Updated stored diff for ${path}`);
    }

    /**
     * Reset the processor state (called on task_complete or turn_aborted)
     */
    reset(): void {
        logger.debug('[CodebuddyDiffProcessor] Resetting diff state');
        this.previousDiffs.clear();
    }

    /**
     * Set the message callback for sending messages directly
     */
    setMessageCallback(callback: (message: any) => void): void {
        this.onMessage = callback;
    }

    /**
     * Get the current diff value for a specific path
     */
    getCurrentDiff(path: string): string | null {
        return this.previousDiffs.get(path) || null;
    }

    /**
     * Get all tracked diffs
     */
    getAllDiffs(): Map<string, string> {
        return new Map(this.previousDiffs);
    }
}
