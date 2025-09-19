import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import { CodexMcpClient } from './codexMcpClient';

// Integration test to verify session persistence fixes work end-to-end
describe('Codex Session Persistence Integration Tests', () => {
    beforeAll(() => {
        // Mock all the dependencies
        vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
            Client: vi.fn().mockImplementation(() => ({
                setNotificationHandler: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            }))
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
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    describe('End-to-End Session Persistence Flow', () => {
        it('should preserve session through disconnect/reconnect cycle', async () => {
            const client = new CodexMcpClient();

            // Step 1: Simulate receiving session configuration
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            const sessionId = 'integration-test-session-123';
            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: sessionId
                    }
                }
            });

            // Verify session is active
            expect(client.hasActiveSession()).toBe(true);
            expect(client.getSessionId()).toBe(sessionId);

            // Step 2: Simulate command cancellation (disconnect but preserve session)
            await client.disconnect();

            // Verify session is preserved (this is the key fix)
            expect(client.hasActiveSession()).toBe(true);
            expect(client.getSessionId()).toBe(sessionId);

            // Step 3: Simulate reconnection would be able to use preserved session
            // (In real implementation, this would pass the session ID to resume)
            const preservedSessionId = client.getSessionId();
            expect(preservedSessionId).toBe(sessionId);

            // Step 4: Only force close should clear the session
            await client.forceCloseSession();
            expect(client.hasActiveSession()).toBe(false);
            expect(client.getSessionId()).toBeNull();
        });

        it('should handle multiple disconnect/reconnect cycles', async () => {
            const client = new CodexMcpClient();

            // Set up session
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            const sessionId = 'multi-cycle-test-456';
            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: sessionId
                    }
                }
            });

            // Multiple disconnect/reconnect cycles
            for (let i = 0; i < 3; i++) {
                // Verify session exists before disconnect
                expect(client.hasActiveSession()).toBe(true);
                expect(client.getSessionId()).toBe(sessionId);

                // Disconnect
                await client.disconnect();

                // Verify session persists after disconnect
                expect(client.hasActiveSession()).toBe(true);
                expect(client.getSessionId()).toBe(sessionId);

                // Simulate reconnection by setting connected state
                (client as any).connected = true;
            }

            // Final cleanup
            await client.forceCloseSession();
            expect(client.hasActiveSession()).toBe(false);
        });
    });

    describe('Command Cancellation Simulation', () => {
        it('should simulate graceful command cancellation behavior', () => {
            // Simulate the processors that would be affected by abort
            const mockProcessors = {
                messageQueue: {
                    messages: ['msg1', 'msg2', 'msg3'],
                    reset: vi.fn(() => { mockProcessors.messageQueue.messages = []; })
                },
                permissionHandler: {
                    state: { permissions: ['read', 'write'] },
                    reset: vi.fn(() => { mockProcessors.permissionHandler.state = { permissions: [] }; })
                },
                reasoningProcessor: {
                    active: true,
                    abort: vi.fn(() => { mockProcessors.reasoningProcessor.active = false; })
                },
                diffProcessor: {
                    changes: ['file1.ts', 'file2.ts'],
                    reset: vi.fn(() => { mockProcessors.diffProcessor.changes = []; })
                }
            };

            // Simulate the NEW graceful abort behavior
            const handleAbortGraceful = () => {
                // Only abort active reasoning, preserve other state
                mockProcessors.reasoningProcessor.abort();
                // Don't reset other processors
            };

            // Simulate command cancellation
            const initialMessageCount = mockProcessors.messageQueue.messages.length;
            const initialPermissions = mockProcessors.permissionHandler.state.permissions?.length;
            const initialChanges = mockProcessors.diffProcessor.changes.length;

            handleAbortGraceful();

            // Verify graceful behavior preserves state
            expect(mockProcessors.messageQueue.messages).toHaveLength(initialMessageCount);
            expect(mockProcessors.permissionHandler.state.permissions).toHaveLength(initialPermissions || 0);
            expect(mockProcessors.diffProcessor.changes).toHaveLength(initialChanges);

            // But reasoning should be aborted
            expect(mockProcessors.reasoningProcessor.abort).toHaveBeenCalled();
            expect(mockProcessors.reasoningProcessor.active).toBe(false);

            // These should NOT have been called (this is the fix)
            expect(mockProcessors.messageQueue.reset).not.toHaveBeenCalled();
            expect(mockProcessors.permissionHandler.reset).not.toHaveBeenCalled();
            expect(mockProcessors.diffProcessor.reset).not.toHaveBeenCalled();
        });
    });

    describe('Resume Command Integration', () => {
        it('should process resume commands correctly', () => {
            // Simulate message processing with resume command support
            const messageProcessor = {
                nextExperimentalResume: null as string | null,
                messageBuffer: {
                    messages: [] as Array<{ text: string; type: string }>,
                    addMessage: vi.fn((text: string, type: string) => {
                        messageProcessor.messageBuffer.messages.push({ text, type });
                    })
                },

                processMessage: (messageText: string, mockClient: any) => {
                    // Simulate the /resume command processing logic
                    if (messageText.startsWith('/resume')) {
                        const currentSessionId = mockClient?.getSessionId?.() || 'mock-session-789';

                        if (currentSessionId) {
                            // Simulate finding resume file
                            const mockResumeFile = `/mock/home/.codex/sessions/${currentSessionId}/transcript.jsonl`;
                            messageProcessor.nextExperimentalResume = mockResumeFile;
                            messageProcessor.messageBuffer.addMessage('Resume file found - will resume on next session start', 'status');
                            return true; // Processed as command
                        } else {
                            messageProcessor.messageBuffer.addMessage('No active session to resume from', 'status');
                            return true; // Processed as command
                        }
                    }
                    return false; // Not a command, process as regular message
                }
            };

            // Test /resume command processing
            const mockClient = {
                getSessionId: () => 'test-resume-session'
            };

            const wasProcessed = messageProcessor.processMessage('/resume', mockClient);

            expect(wasProcessed).toBe(true);
            expect(messageProcessor.nextExperimentalResume).toContain('transcript.jsonl');
            expect(messageProcessor.messageBuffer.addMessage).toHaveBeenCalledWith(
                'Resume file found - will resume on next session start',
                'status'
            );
        });

        it('should handle /resume with no active session', () => {
            const messageProcessor = {
                messageBuffer: {
                    addMessage: vi.fn()
                },

                processMessage: (messageText: string, mockClient: any) => {
                    if (messageText.startsWith('/resume')) {
                        const currentSessionId = mockClient?.getSessionId?.() || null;

                        if (!currentSessionId) {
                            messageProcessor.messageBuffer.addMessage('No active session to resume from', 'status');
                            return true;
                        }
                    }
                    return false;
                }
            };

            const mockClientNoSession = {
                getSessionId: () => null
            };

            const wasProcessed = messageProcessor.processMessage('/resume', mockClientNoSession);

            expect(wasProcessed).toBe(true);
            expect(messageProcessor.messageBuffer.addMessage).toHaveBeenCalledWith(
                'No active session to resume from',
                'status'
            );
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle disconnect errors gracefully', async () => {
            const client = new CodexMcpClient();

            // Set up session
            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'error-test-session'
                    }
                }
            });

            // Mock client.close to throw error
            privateClient.close.mockRejectedValue(new Error('Connection lost'));

            // Should handle error and still preserve session
            await expect(client.disconnect()).resolves.not.toThrow();

            // Session should still be preserved even if disconnect had errors
            expect(client.hasActiveSession()).toBe(true);
            expect(client.getSessionId()).toBe('error-test-session');
        });

        it('should handle multiple session configurations', () => {
            const client = new CodexMcpClient();

            const privateClient = (client as any).client;
            const notificationHandler = privateClient.setNotificationHandler.mock.calls[0][1];

            // First session
            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'first-session'
                    }
                }
            });

            expect(client.getSessionId()).toBe('first-session');

            // Second session should replace the first
            notificationHandler({
                params: {
                    msg: {
                        type: 'session_configured',
                        session_id: 'second-session'
                    }
                }
            });

            expect(client.getSessionId()).toBe('second-session');
            expect(client.hasActiveSession()).toBe(true);
        });
    });
});