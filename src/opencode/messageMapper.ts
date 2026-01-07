import { randomUUID } from 'node:crypto';
import type {
    OpenCodeMessageInfo,
    OpenCodeMessagePart,
    OpenCodeMessage,
    OpenCodeTodo
} from './types';

export interface HappyMessage {
    type: string;
    id: string;
    [key: string]: unknown;
}

export interface HappyToolCall extends HappyMessage {
    type: 'tool-call';
    name: string;
    callId: string;
    input: Record<string, unknown>;
}

export interface HappyToolResult extends HappyMessage {
    type: 'tool-call-result';
    callId: string;
    output: unknown;
}

export interface HappyTextMessage extends HappyMessage {
    type: 'message';
    message: string;
}

export interface HappyReasoningMessage extends HappyMessage {
    type: 'reasoning';
    text: string;
}

export interface HappyTodoMessage extends HappyMessage {
    type: 'todo';
    todos: Array<{
        id: string;
        content: string;
        status: string;
        priority?: string;
    }>;
}

export function mapOpenCodePartToHappyMessage(part: OpenCodeMessagePart): HappyMessage | null {
    switch (part.type) {
        case 'text':
            if (!part.text) return null;
            return {
                type: 'message',
                id: part.id,
                message: part.text
            } as HappyTextMessage;

        case 'tool-invocation':
            if (!part.toolInvocation) return null;
            const inv = part.toolInvocation;
            
            if (inv.state === 'pending' || inv.state === 'running') {
                return {
                    type: 'tool-call',
                    id: part.id,
                    name: inv.toolName,
                    callId: inv.toolCallID,
                    input: inv.args || {},
                    metadata: inv.metadata
                } as HappyToolCall;
            }
            
            if (inv.state === 'completed' || inv.state === 'failed') {
                return {
                    type: 'tool-call-result',
                    id: part.id,
                    callId: inv.toolCallID,
                    output: inv.error ? { error: inv.error } : inv.result,
                    success: inv.state === 'completed'
                } as HappyToolResult;
            }
            return null;

        case 'reasoning':
            if (!part.text) return null;
            return {
                type: 'reasoning',
                id: part.id,
                text: part.text
            } as HappyReasoningMessage;

        case 'step-start':
            return {
                type: 'step-start',
                id: part.id,
                text: part.text || ''
            };

        case 'file':
            if (!part.file) return null;
            return {
                type: 'file',
                id: part.id,
                path: part.file.path,
                content: part.file.content
            };

        default:
            return null;
    }
}

export function mapOpenCodeTodosToHappyMessage(todos: OpenCodeTodo[]): HappyTodoMessage {
    return {
        type: 'todo',
        id: randomUUID(),
        todos: todos.map(t => ({
            id: t.id,
            content: t.content,
            status: t.status,
            priority: t.priority
        }))
    };
}

export function mapOpenCodeMessageInfoToStatus(info: OpenCodeMessageInfo): HappyMessage {
    const hasError = !!info.error;
    const isComplete = !!info.time.completed;
    
    return {
        type: 'message-status',
        id: info.id,
        messageId: info.id,
        sessionId: info.sessionID,
        role: info.role,
        status: hasError ? 'error' : (isComplete ? 'complete' : 'in-progress'),
        error: info.error,
        tokens: info.tokens,
        cost: info.cost,
        model: info.modelID,
        provider: info.providerID
    };
}

export function createHappyEventFromOpenCodePart(
    part: OpenCodeMessagePart,
    info?: OpenCodeMessageInfo
): HappyMessage | null {
    const message = mapOpenCodePartToHappyMessage(part);
    if (!message) return null;
    
    if (info) {
        message.role = info.role;
        message.model = info.modelID;
        message.provider = info.providerID;
    }
    
    return message;
}
