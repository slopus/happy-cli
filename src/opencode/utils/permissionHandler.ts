import { logger } from '@/ui/logger';
import type { OpenCodePermissionRequest, OpenCodePermissionReply } from '../types';
import type { OpenCodeClient } from '../openCodeClient';
import type { ApiSessionClient } from '@/api/apiSession';

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

interface PendingPermission {
    request: OpenCodePermissionRequest;
    resolver: (reply: OpenCodePermissionReply) => void;
}

export class OpenCodePermissionHandler {
    private client: OpenCodeClient;
    private session: ApiSessionClient;
    private mode: PermissionMode = 'default';
    private pendingPermissions: Map<string, PendingPermission> = new Map();
    private sessionPermissions: Map<string, OpenCodePermissionReply> = new Map();

    constructor(client: OpenCodeClient, session: ApiSessionClient) {
        this.client = client;
        this.session = session;
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.client.on('permission:request', (request) => {
            this.handlePermissionRequest(request);
        });

        this.session.rpcHandlerManager.registerHandler('permissionResponse', 
            async (params: { permissionId: string; response: string }) => {
                await this.handleUserResponse(params.permissionId, params.response as OpenCodePermissionReply);
            }
        );
    }

    setMode(mode: PermissionMode): void {
        this.mode = mode;
        logger.debug(`[PermissionHandler] Mode set to: ${mode}`);
    }

    private async handlePermissionRequest(request: OpenCodePermissionRequest): Promise<void> {
        logger.debug(`[PermissionHandler] Permission request: ${request.id}`, request.metadata);

        const cachedReply = this.sessionPermissions.get(this.getPermissionKey(request));
        if (cachedReply) {
            logger.debug(`[PermissionHandler] Using cached reply: ${cachedReply}`);
            await this.client.replyPermission(request.id, cachedReply);
            return;
        }

        if (this.mode === 'bypassPermissions') {
            logger.debug('[PermissionHandler] Bypassing permission (bypassPermissions mode)');
            await this.client.replyPermission(request.id, 'allowForever');
            return;
        }

        if (this.mode === 'acceptEdits' && this.isEditPermission(request)) {
            logger.debug('[PermissionHandler] Auto-accepting edit (acceptEdits mode)');
            await this.client.replyPermission(request.id, 'allowSession');
            this.sessionPermissions.set(this.getPermissionKey(request), 'allowSession');
            return;
        }

        this.sendPermissionToMobile(request);
        
        const reply = await this.waitForUserResponse(request);
        
        await this.client.replyPermission(request.id, reply);
        
        if (reply === 'allowSession' || reply === 'denySession') {
            this.sessionPermissions.set(this.getPermissionKey(request), reply);
        }
    }

    private isEditPermission(request: OpenCodePermissionRequest): boolean {
        const editTools = ['edit', 'write', 'Edit', 'Write', 'MultiEdit', 'patch'];
        return editTools.some(tool => 
            request.metadata.toolName.toLowerCase().includes(tool.toLowerCase())
        );
    }

    private getPermissionKey(request: OpenCodePermissionRequest): string {
        return `${request.metadata.toolName}:${JSON.stringify(request.metadata.args || {})}`;
    }

    private sendPermissionToMobile(request: OpenCodePermissionRequest): void {
        this.session.sendAgentMessage('opencode', {
            type: 'permission-request',
            id: request.id,
            sessionId: request.sessionID,
            toolName: request.metadata.toolName,
            title: request.metadata.title,
            description: request.metadata.description,
            args: request.metadata.args,
            options: [
                { value: 'allow', label: 'Allow Once' },
                { value: 'allowSession', label: 'Allow for Session' },
                { value: 'allowForever', label: 'Always Allow' },
                { value: 'deny', label: 'Deny Once' },
                { value: 'denySession', label: 'Deny for Session' },
                { value: 'denyForever', label: 'Always Deny' }
            ]
        });
    }

    private waitForUserResponse(request: OpenCodePermissionRequest): Promise<OpenCodePermissionReply> {
        return new Promise((resolve) => {
            this.pendingPermissions.set(request.id, {
                request,
                resolver: resolve
            });

            setTimeout(() => {
                if (this.pendingPermissions.has(request.id)) {
                    logger.debug(`[PermissionHandler] Permission timeout, denying: ${request.id}`);
                    this.pendingPermissions.delete(request.id);
                    resolve('deny');
                }
            }, 300000);
        });
    }

    private async handleUserResponse(permissionId: string, response: OpenCodePermissionReply): Promise<void> {
        const pending = this.pendingPermissions.get(permissionId);
        if (!pending) {
            logger.debug(`[PermissionHandler] No pending permission for: ${permissionId}`);
            return;
        }

        this.pendingPermissions.delete(permissionId);
        pending.resolver(response);
    }

    reset(): void {
        this.pendingPermissions.clear();
        this.sessionPermissions.clear();
        logger.debug('[PermissionHandler] Reset');
    }

    clearSessionPermissions(): void {
        this.sessionPermissions.clear();
    }
}
