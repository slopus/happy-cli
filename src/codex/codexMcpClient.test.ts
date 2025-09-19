import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodexMcpClient } from './codexMcpClient';

// Mock dependencies with proper spy functions
let notificationHandlerSpy: ReturnType<typeof vi.fn>;
let clientCloseSpy: ReturnType<typeof vi.fn>;

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: vi.fn().mockImplementation(() => {
        notificationHandlerSpy = vi.fn();
        clientCloseSpy = vi.fn();
        return {
            setNotificationHandler: notificationHandlerSpy,
            close: clientCloseSpy,
        };
    })
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: vi.fn()
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));

describe('CodexMcpClient Session Persistence', () => {
    let client: CodexMcpClient;

    beforeEach(() => {
        client = new CodexMcpClient();
        vi.clearAllMocks();
    });

    describe('Session State Management', () => {
        it('should initialize with no active session', () => {
            expect(client.hasActiveSession()).toBe(false);
            expect(client.getSessionId()).toBe(null);
        });

        it('should track session ID when session_configured event is received', () => {
            const mockHandler = vi.fn();
            client.setHandler(mockHandler);

            // Simulate session configured event through notification handler
            const sessionConfiguredMsg = {
                type: 'session_configured',
                session_id: 'test-session-123'
            };

            // Get the notification handler that was registered
            expect(notificationHandlerSpy).toHaveBeenCalled();
            const notificationHandler = notificationHandlerSpy.mock.calls[0][1];

            notificationHandler({
                params: { msg: sessionConfiguredMsg }
            });

            expect(client.hasActiveSession()).toBe(true);
            expect(client.getSessionId()).toBe('test-session-123');
            expect(mockHandler).toHaveBeenCalledWith(sessionConfiguredMsg);
        });

        it('should preserve session ID after disconnect', async () => {
            // Set up a session
            const notificationHandler = notificationHandlerSpy.mock.calls[0][1];

            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'test-session-456'
                    }
                }
            });

            expect(client.getSessionId()).toBe('test-session-456');

            // Mock successful disconnect
            clientCloseSpy.mockResolvedValue(undefined);

            // Disconnect should preserve session ID
            await client.disconnect();

            expect(client.getSessionId()).toBe('test-session-456');
            expect(client.hasActiveSession()).toBe(true);
        });

        it('should clear session ID only with clearSession method', () => {
            // Set up a session
            const notificationHandler = notificationHandlerSpy.mock.calls[0][1];

            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'test-session-789'
                    }
                }
            });

            expect(client.getSessionId()).toBe('test-session-789');

            // Only clearSession should remove the session ID
            client.clearSession();

            expect(client.getSessionId()).toBe(null);
            expect(client.hasActiveSession()).toBe(false);
        });

        it('should force close session and clear all state', async () => {
            // Set up a session
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'test-session-force'
                    }
                }
            });

            expect(client.getSessionId()).toBe('test-session-force');

            // Mock successful disconnect
            privateClient.close.mockResolvedValue(undefined);

            // Force close should disconnect AND clear session
            await client.forceCloseSession();

            expect(client.getSessionId()).toBe(null);
            expect(client.hasActiveSession()).toBe(false);
        });
    });

    describe('Connection State Management', () => {
        it('should track connection state separately from session state', async () => {
            // Initially not connected
            expect((client as any).connected).toBe(false);

            // Set up a session ID without connecting
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'test-connection-state'
                    }
                }
            });

            // Should have session but not be connected
            expect(client.hasActiveSession()).toBe(true);
            expect((client as any).connected).toBe(false);

            // Mock connection
            (client as any).connected = true;
            expect((client as any).connected).toBe(true);

            // Mock successful disconnect
            privateClient.close.mockResolvedValue(undefined);

            // Disconnect should set connected to false but preserve session
            await client.disconnect();

            expect((client as any).connected).toBe(false);
            expect(client.hasActiveSession()).toBe(true);
            expect(client.getSessionId()).toBe('test-connection-state');
        });
    });

    describe('Handler Management', () => {
        it('should properly set and call message handlers', () => {
            const mockHandler = vi.fn();
            client.setHandler(mockHandler);

            // Trigger notification handler
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            const testMessage = { type: 'test_message', data: 'test' };
            notificationHandler({
                params: { msg: testMessage }
            });

            expect(mockHandler).toHaveBeenCalledWith(testMessage);
        });

        it('should handle null handlers gracefully', () => {
            client.setHandler(null);

            // Should not throw when triggering notification with null handler
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            expect(() => {
                notificationHandler({
                    params: { msg: { type: 'test_message' } }
                });
            }).not.toThrow();
        });
    });
});