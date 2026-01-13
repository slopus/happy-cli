/**
 * CodeBuddy Reasoning Processor
 *
 * Handles agent_thought_chunk events for CodeBuddy ACP.
 * Extends BaseReasoningProcessor with CodeBuddy-specific configuration.
 */

import {
    BaseReasoningProcessor,
    ReasoningToolCall,
    ReasoningToolResult,
    ReasoningMessage,
    ReasoningOutput
} from '@/utils/BaseReasoningProcessor';

// Re-export types for backwards compatibility
export type { ReasoningToolCall, ReasoningToolResult, ReasoningMessage, ReasoningOutput };

/**
 * CodeBuddy-specific reasoning processor.
 */
export class CodebuddyReasoningProcessor extends BaseReasoningProcessor {
    protected getToolName(): string {
        return 'CodebuddyReasoning';
    }

    protected getLogPrefix(): string {
        return '[CodebuddyReasoningProcessor]';
    }

    /**
     * Process a reasoning chunk from agent_thought_chunk.
     * CodeBuddy sends reasoning as chunks, we accumulate them similar to Codex/Gemini.
     */
    processChunk(chunk: string): void {
        this.processInput(chunk);
    }

    /**
     * Complete the reasoning section.
     * Called when reasoning is complete (e.g., when status changes to idle).
     * Returns true if reasoning was actually completed, false if there was nothing to complete.
     */
    complete(): boolean {
        return this.completeReasoning();
    }
}
