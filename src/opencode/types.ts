export interface OpenCodeSession {
    id: string;
    version: string;
    projectID: string;
    directory: string;
    title: string;
    parentID?: string;
    share?: {
        id: string;
        time: number;
    };
    time: {
        created: number;
        updated: number;
        archived?: number;
    };
    summary?: {
        additions: number;
        deletions: number;
        files: number;
    };
}

export interface OpenCodeMessageInfo {
    id: string;
    sessionID: string;
    role: 'user' | 'assistant';
    time: {
        created: number;
        completed?: number;
    };
    error?: {
        name: string;
        data: Record<string, unknown>;
    };
    parentID?: string;
    modelID?: string;
    providerID?: string;
    mode?: string;
    agent?: string;
    path?: {
        cwd: string;
        root: string;
    };
    cost?: number;
    tokens?: {
        input: number;
        output: number;
        reasoning: number;
        cache: {
            read: number;
            write: number;
        };
    };
}

export interface OpenCodeMessagePart {
    id: string;
    sessionID: string;
    messageID: string;
    type: 'text' | 'tool-invocation' | 'tool-result' | 'step-start' | 'reasoning' | 'file' | 'source-url';
    time: {
        created: number;
        updated: number;
    };
    text?: string;
    toolInvocation?: {
        state: 'pending' | 'running' | 'completed' | 'failed';
        toolCallID: string;
        toolName: string;
        args?: Record<string, unknown>;
        result?: unknown;
        error?: string;
        time?: {
            start: number;
            end?: number;
        };
        metadata?: {
            title?: string;
            description?: string;
        };
    };
    file?: {
        path: string;
        content?: string;
    };
}

export interface OpenCodeMessage {
    info: OpenCodeMessageInfo;
    parts: OpenCodeMessagePart[];
}

export interface OpenCodePermissionRequest {
    id: string;
    sessionID: string;
    messageID: string;
    partID: string;
    time: {
        created: number;
    };
    metadata: {
        title: string;
        description?: string;
        toolName: string;
        args?: Record<string, unknown>;
    };
}

export type OpenCodePermissionReply = 
    | 'allow'
    | 'allowSession'
    | 'allowForever'
    | 'deny'
    | 'denySession'
    | 'denyForever';

export interface OpenCodeEvent {
    directory?: string;
    payload: {
        type: string;
        properties: Record<string, unknown>;
    };
}

export interface OpenCodeSessionStatus {
    status: 'idle' | 'running' | 'waiting';
    time: {
        started?: number;
    };
    tokens?: {
        input: number;
        output: number;
    };
}

export interface OpenCodeHealthResponse {
    healthy: boolean;
    version: string;
}

export interface OpenCodePromptInput {
    parts: Array<{
        type: 'text';
        text: string;
    }>;
    providerID?: string;
    modelID?: string;
    agent?: string;
}

export interface OpenCodeTodo {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority?: 'high' | 'medium' | 'low';
}

export interface OpenCodeModel {
    id: string;
    providerID: string;
    name: string;
    family?: string;
    status: string;
    cost?: {
        input: number;
        output: number;
        cache?: {
            read: number;
            write: number;
        };
    };
    limit?: {
        context: number;
        output: number;
    };
    capabilities?: {
        temperature: boolean;
        reasoning: boolean;
        attachment: boolean;
        toolcall: boolean;
        input: {
            text: boolean;
            audio: boolean;
            image: boolean;
            video: boolean;
            pdf: boolean;
        };
        output: {
            text: boolean;
            audio: boolean;
            image: boolean;
            video: boolean;
            pdf: boolean;
        };
    };
}

export interface OpenCodeProvider {
    id: string;
    name: string;
    source?: string;
    env?: string[];
    models: Record<string, OpenCodeModel>;
}
