import { EventEmitter } from 'node:events';
import { logger } from '@/ui/logger';
import type {
    OpenCodeSession,
    OpenCodeMessage,
    OpenCodeMessageInfo,
    OpenCodeMessagePart,
    OpenCodePermissionRequest,
    OpenCodePermissionReply,
    OpenCodeEvent,
    OpenCodeSessionStatus,
    OpenCodeHealthResponse,
    OpenCodePromptInput,
    OpenCodeModel,
    OpenCodeProvider,
    OpenCodeTodo
} from './types';

export interface OpenCodeClientOptions {
    baseUrl?: string;
    timeout?: number;
}

export interface OpenCodeClientEvents {
    'session:created': (session: OpenCodeSession) => void;
    'session:updated': (session: OpenCodeSession) => void;
    'session:status': (status: OpenCodeSessionStatus) => void;
    'message:info': (info: OpenCodeMessageInfo) => void;
    'message:part': (part: OpenCodeMessagePart) => void;
    'message:complete': (message: OpenCodeMessage) => void;
    'permission:request': (request: OpenCodePermissionRequest) => void;
    'todo:updated': (todos: OpenCodeTodo[]) => void;
    'error': (error: Error) => void;
    'connected': () => void;
    'disconnected': () => void;
}

/**
 * OpenCode HTTP/SSE Client
 * 
 * Communicates with OpenCode's native HTTP API (port 4096).
 * Unlike Claude/Codex which use PTY spawning, OpenCode provides a clean REST API.
 */
export class OpenCodeClient extends EventEmitter {
    private baseUrl: string;
    private timeout: number;
    private eventSource: EventSource | null = null;
    private abortController: AbortController | null = null;
    private currentSessionId: string | null = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 1000;

    constructor(options: OpenCodeClientOptions = {}) {
        super();
        this.baseUrl = options.baseUrl || 'http://localhost:4096';
        this.timeout = options.timeout || 30000;
    }

    // ========== Health & Connection ==========

    /**
     * Check if OpenCode server is healthy
     */
    async checkHealth(): Promise<OpenCodeHealthResponse> {
        const response = await this.fetch('/global/health');
        return response.json() as Promise<OpenCodeHealthResponse>;
    }

    /**
     * Connect to OpenCode SSE event stream
     */
    async connect(): Promise<void> {
        if (this.isConnected) {
            logger.debug('[OpenCodeClient] Already connected');
            return;
        }

        try {
            // Verify server health first
            const health = await this.checkHealth();
            if (!health.healthy) {
                throw new Error('OpenCode server is not healthy');
            }
            logger.debug(`[OpenCodeClient] Server healthy, version: ${health.version}`);

            // Start SSE connection
            await this.connectSSE();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
            logger.debug('[OpenCodeClient] Connected to OpenCode');
        } catch (error) {
            logger.warn('[OpenCodeClient] Connection failed:', error);
            throw error;
        }
    }

    /**
     * Disconnect from OpenCode
     */
    async disconnect(): Promise<void> {
        this.isConnected = false;
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.emit('disconnected');
        logger.debug('[OpenCodeClient] Disconnected from OpenCode');
    }

    /**
     * Connect to SSE event stream using fetch (Node.js compatible)
     */
    private async connectSSE(): Promise<void> {
        const sseUrl = `${this.baseUrl}/global/event`;
        logger.debug(`[OpenCodeClient] Connecting to SSE: ${sseUrl}`);

        this.abortController = new AbortController();

        try {
            const response = await fetch(sseUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                },
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`SSE connection failed: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('SSE response has no body');
            }

            // Process SSE stream
            this.processSSEStream(response.body);
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                logger.warn('[OpenCodeClient] SSE connection error:', error);
                this.handleReconnect();
            }
        }
    }

    /**
     * Process SSE stream
     */
    private async processSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (this.isConnected) {
                const { done, value } = await reader.read();
                
                if (done) {
                    logger.debug('[OpenCodeClient] SSE stream ended');
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                
                // Process complete SSE messages
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                let eventType = 'message';
                let eventData = '';

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventType = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        eventData = line.slice(5).trim();
                    } else if (line === '' && eventData) {
                        // Empty line marks end of event
                        this.handleSSEEvent(eventType, eventData);
                        eventType = 'message';
                        eventData = '';
                    }
                }
            }
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                logger.warn('[OpenCodeClient] SSE stream error:', error);
                this.handleReconnect();
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Handle SSE event
     */
    private handleSSEEvent(eventType: string, data: string): void {
        try {
            const parsed: OpenCodeEvent = JSON.parse(data);
            const payload = parsed.payload;
            
            logger.debug(`[OpenCodeClient] SSE event: ${payload.type}`, payload.properties);

            switch (payload.type) {
                case 'session.created':
                case 'session.updated':
                    this.emit('session:updated', payload.properties as unknown as OpenCodeSession);
                    break;
                
                case 'session.status':
                    this.emit('session:status', payload.properties as unknown as OpenCodeSessionStatus);
                    break;

                case 'message.info.created':
                case 'message.info.updated':
                    this.emit('message:info', payload.properties as unknown as OpenCodeMessageInfo);
                    break;

                case 'message.part.created':
                case 'message.part.updated':
                    this.emit('message:part', payload.properties as unknown as OpenCodeMessagePart);
                    break;

                case 'permission.created':
                    this.emit('permission:request', payload.properties as unknown as OpenCodePermissionRequest);
                    break;

                case 'todo.updated':
                    this.emit('todo:updated', payload.properties as unknown as OpenCodeTodo[]);
                    break;

                default:
                    logger.debug(`[OpenCodeClient] Unhandled event type: ${payload.type}`);
            }
        } catch (error) {
            logger.warn('[OpenCodeClient] Failed to parse SSE event:', error, data);
        }
    }

    /**
     * Handle reconnection logic
     */
    private handleReconnect(): void {
        if (!this.isConnected || this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.warn('[OpenCodeClient] Max reconnect attempts reached');
            this.emit('error', new Error('Max reconnect attempts reached'));
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        logger.debug(`[OpenCodeClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (this.isConnected) {
                this.connectSSE();
            }
        }, delay);
    }

    // ========== Session Management ==========

    /**
     * List all sessions
     */
    async listSessions(): Promise<OpenCodeSession[]> {
        const response = await this.fetch('/session');
        return response.json() as Promise<OpenCodeSession[]>;
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId: string): Promise<OpenCodeSession> {
        const response = await this.fetch(`/session/${sessionId}`);
        return response.json() as Promise<OpenCodeSession>;
    }

    /**
     * Create a new session
     */
    async createSession(directory?: string): Promise<OpenCodeSession> {
        const body = directory ? { directory } : {};
        const response = await this.fetch('/session', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        const session = await response.json() as OpenCodeSession;
        this.currentSessionId = session.id;
        this.emit('session:created', session);
        return session;
    }

    /**
     * Get or create session for current directory
     */
    async getOrCreateSession(directory?: string): Promise<OpenCodeSession> {
        // Try to find existing session for this directory
        const sessions = await this.listSessions();
        const dir = directory || process.cwd();
        
        const existing = sessions.find(s => s.directory === dir);
        if (existing) {
            this.currentSessionId = existing.id;
            return existing;
        }

        return this.createSession(dir);
    }

    /**
     * Get current session ID
     */
    getSessionId(): string | null {
        return this.currentSessionId;
    }

    /**
     * Check if there's an active session
     */
    hasActiveSession(): boolean {
        return this.currentSessionId !== null;
    }

    /**
     * Clear current session
     */
    clearSession(): void {
        this.currentSessionId = null;
    }

    // ========== Message Operations ==========

    /**
     * Get messages for a session
     */
    async getMessages(sessionId?: string): Promise<OpenCodeMessage[]> {
        const sid = sessionId || this.currentSessionId;
        if (!sid) throw new Error('No session ID provided');
        
        const response = await this.fetch(`/session/${sid}/message`);
        return response.json() as Promise<OpenCodeMessage[]>;
    }

    /**
     * Send a message to the session
     */
    async sendMessage(
        text: string, 
        options: {
            sessionId?: string;
            providerID?: string;
            modelID?: string;
            agent?: string;
        } = {}
    ): Promise<void> {
        const sid = options.sessionId || this.currentSessionId;
        if (!sid) throw new Error('No session ID provided');

        const input: OpenCodePromptInput = {
            parts: [{ type: 'text', text }],
        };

        if (options.providerID) input.providerID = options.providerID;
        if (options.modelID) input.modelID = options.modelID;
        if (options.agent) input.agent = options.agent;

        await this.fetch(`/session/${sid}/message`, {
            method: 'POST',
            body: JSON.stringify(input),
        });
    }

    /**
     * Abort current operation
     */
    async abort(sessionId?: string): Promise<void> {
        const sid = sessionId || this.currentSessionId;
        if (!sid) throw new Error('No session ID provided');

        await this.fetch(`/session/${sid}/abort`, {
            method: 'POST',
        });
        logger.debug(`[OpenCodeClient] Aborted session: ${sid}`);
    }

    // ========== Permission Operations ==========

    /**
     * Get pending permission requests
     */
    async getPermissions(): Promise<OpenCodePermissionRequest[]> {
        const response = await this.fetch('/permission');
        return response.json() as Promise<OpenCodePermissionRequest[]>;
    }

    /**
     * Reply to a permission request
     */
    async replyPermission(permissionId: string, reply: OpenCodePermissionReply): Promise<void> {
        await this.fetch(`/permission/${permissionId}/reply`, {
            method: 'POST',
            body: JSON.stringify({ reply }),
        });
        logger.debug(`[OpenCodeClient] Permission ${permissionId} replied: ${reply}`);
    }

    // ========== Model & Provider Operations ==========

    /**
     * Get available providers and models
     */
    async getProviders(): Promise<OpenCodeProvider[]> {
        const response = await this.fetch('/provider');
        return response.json() as Promise<OpenCodeProvider[]>;
    }

    /**
     * Get models for a specific provider
     */
    async getModels(providerID?: string): Promise<OpenCodeModel[]> {
        const providers = await this.getProviders();
        const models: OpenCodeModel[] = [];
        
        for (const provider of providers) {
            if (providerID && provider.id !== providerID) continue;
            models.push(...Object.values(provider.models));
        }
        
        return models;
    }

    // ========== Session Status ==========

    /**
     * Get session status (idle, running, waiting)
     */
    async getSessionStatus(sessionId?: string): Promise<OpenCodeSessionStatus> {
        const sid = sessionId || this.currentSessionId;
        if (!sid) throw new Error('No session ID provided');

        const response = await this.fetch(`/session/${sid}/status`);
        return response.json() as Promise<OpenCodeSessionStatus>;
    }

    /**
     * Wait for session to become idle
     */
    async waitForIdle(sessionId?: string, pollInterval: number = 500): Promise<void> {
        const sid = sessionId || this.currentSessionId;
        if (!sid) throw new Error('No session ID provided');

        while (true) {
            const status = await this.getSessionStatus(sid);
            if (status.status === 'idle') {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    // ========== File Operations ==========

    /**
     * Get file content
     */
    async getFile(path: string): Promise<string> {
        const response = await this.fetch(`/file?path=${encodeURIComponent(path)}`);
        const data = await response.json() as { content: string };
        return data.content;
    }

    // ========== Utility Methods ==========

    /**
     * Internal fetch wrapper
     */
    private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            signal: options.signal || AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
            const error = await response.text().catch(() => 'Unknown error');
            throw new Error(`OpenCode API error: ${response.status} - ${error}`);
        }

        return response;
    }

    // ========== Type-safe Event Emitter ==========

    on<K extends keyof OpenCodeClientEvents>(
        event: K, 
        listener: OpenCodeClientEvents[K]
    ): this {
        return super.on(event, listener);
    }

    emit<K extends keyof OpenCodeClientEvents>(
        event: K, 
        ...args: Parameters<OpenCodeClientEvents[K]>
    ): boolean {
        return super.emit(event, ...args);
    }
}
