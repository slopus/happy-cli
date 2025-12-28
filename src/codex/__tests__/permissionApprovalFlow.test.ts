import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodexPermissionHandler } from '../utils/permissionHandler';
import type { ApiSessionClient } from '@/api/apiSession';

// Mock ApiSessionClient
const createMockSession = (): ApiSessionClient => {
    const rpcHandlers = new Map<string, (data: any) => Promise<any>>();
    
    return {
        sessionId: 'test-session-id',
        updateAgentState: vi.fn((updater: any) => {
            const currentState = { requests: {}, completedRequests: {} };
            const newState = updater(currentState);
            return newState;
        }),
        rpcHandlerManager: {
            registerHandler: vi.fn((method: string, handler: (data: any) => Promise<any>) => {
                rpcHandlers.set(method, handler);
            }),
            call: vi.fn(),
        },
        sendCodexMessage: vi.fn(),
        sendSessionEvent: vi.fn(),
        onUserMessage: vi.fn(),
        keepAlive: vi.fn(),
        flush: vi.fn(),
        close: vi.fn(),
        sendSessionDeath: vi.fn(),
    } as unknown as ApiSessionClient;
};

describe('Codex Permission Approval Flow', () => {
    let session: ApiSessionClient;
    let permissionHandler: CodexPermissionHandler;

    beforeEach(() => {
        session = createMockSession();
        permissionHandler = new CodexPermissionHandler(session);
    });

    it('should register permission request with correct ID and resolve when permission response matches', async () => {
        const toolCallId = 'test-call-id-123';
        const toolName = 'CodexBash';
        const input = { command: ['ls'], cwd: '/tmp' };

        // Register permission request
        const permissionPromise = permissionHandler.handleToolCall(toolCallId, toolName, input);

        // Simulate permission response from mobile app
        const rpcHandler = (session.rpcHandlerManager.registerHandler as any).mock.calls[0][1];
        
        // Wait a bit to ensure the request is registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Send permission response with matching ID
        await rpcHandler({
            id: toolCallId,
            approved: true,
            decision: 'approved' as const
        });

        // Wait for permission to be resolved
        const result = await permissionPromise;

        expect(result.decision).toBe('approved');
        expect(session.updateAgentState).toHaveBeenCalled();
    });

    it('should not resolve permission request when response ID does not match', async () => {
        const toolCallId = 'test-call-id-123';
        const wrongId = 'wrong-call-id-456';
        const toolName = 'CodexBash';
        const input = { command: ['ls'], cwd: '/tmp' };

        // Register permission request
        const permissionPromise = permissionHandler.handleToolCall(toolCallId, toolName, input);

        // Simulate permission response from mobile app with wrong ID
        const rpcHandler = (session.rpcHandlerManager.registerHandler as any).mock.calls[0][1];
        
        // Wait a bit to ensure the request is registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Send permission response with non-matching ID
        await rpcHandler({
            id: wrongId,
            approved: true,
            decision: 'approved' as const
        });

        // Permission should not be resolved (still pending)
        // Use a timeout to verify it doesn't resolve
        let resolved = false;
        permissionPromise.then(() => {
            resolved = true;
        });

        await new Promise(resolve => setTimeout(resolve, 100));
        
        // The permission should still be pending since IDs don't match
        expect(resolved).toBe(false);
    });

    it('should handle permission denial correctly', async () => {
        const toolCallId = 'test-call-id-123';
        const toolName = 'CodexBash';
        const input = { command: ['rm', '-rf', '/'], cwd: '/' };

        // Register permission request
        const permissionPromise = permissionHandler.handleToolCall(toolCallId, toolName, input);

        // Simulate permission response denying the request
        const rpcHandler = (session.rpcHandlerManager.registerHandler as any).mock.calls[0][1];
        
        // Wait a bit to ensure the request is registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Send permission response denying
        await rpcHandler({
            id: toolCallId,
            approved: false,
            decision: 'denied' as const
        });

        // Wait for permission to be resolved
        const result = await permissionPromise;

        expect(result.decision).toBe('denied');
    });

    it('should handle multiple permission requests with different IDs', async () => {
        const toolCallId1 = 'test-call-id-123';
        const toolCallId2 = 'test-call-id-456';
        const toolName = 'CodexBash';
        const input1 = { command: ['ls'], cwd: '/tmp' };
        const input2 = { command: ['pwd'], cwd: '/tmp' };

        // Register two permission requests
        const permissionPromise1 = permissionHandler.handleToolCall(toolCallId1, toolName, input1);
        const permissionPromise2 = permissionHandler.handleToolCall(toolCallId2, toolName, input2);

        // Simulate permission responses
        const rpcHandler = (session.rpcHandlerManager.registerHandler as any).mock.calls[0][1];
        
        // Wait a bit to ensure requests are registered
        await new Promise(resolve => setTimeout(resolve, 10));

        // Send permission response for first request
        await rpcHandler({
            id: toolCallId1,
            approved: true,
            decision: 'approved' as const
        });

        // Send permission response for second request
        await rpcHandler({
            id: toolCallId2,
            approved: true,
            decision: 'approved' as const
        });

        // Both permissions should be resolved
        const result1 = await permissionPromise1;
        const result2 = await permissionPromise2;

        expect(result1.decision).toBe('approved');
        expect(result2.decision).toBe('approved');
    });
});

