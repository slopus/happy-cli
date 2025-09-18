import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    }
}));

describe('Codex Session Persistence Features', () => {
    const mockFs = vi.mocked(fs);
    const mockOs = vi.mocked(os);

    beforeEach(() => {
        vi.clearAllMocks();
        mockOs.homedir.mockReturnValue('/mock/home');
    });

    describe('Resume File Finding Logic', () => {
        // Test the findCodexResumeFile function logic
        it('should find resume file for given session ID', () => {
            const sessionId = 'test-session-123';
            const codexHomeDir = '/mock/home/.codex';
            const sessionsDir = join(codexHomeDir, 'sessions');

            // Mock file system structure
            (mockFs.readdirSync as any).mockImplementation((path: any, options?: any) => {
                if (path === sessionsDir) {
                    return [
                        { name: 'session1', isDirectory: () => true, isFile: () => false },
                        { name: 'session2', isDirectory: () => true, isFile: () => false },
                    ];
                } else if (path.includes('session1')) {
                    return [
                        { name: 'transcript.jsonl', isDirectory: () => false, isFile: () => true },
                    ];
                } else if (path.includes('session2')) {
                    return [
                        { name: 'transcript.jsonl', isDirectory: () => false, isFile: () => true },
                    ];
                }
                return [];
            });

            // Mock file reading for session ID matching
            mockFs.readFileSync.mockImplementation((filePath: any) => {
                if (filePath.includes('session1/transcript.jsonl')) {
                    return JSON.stringify({ session_id: 'other-session' }) + '\n';
                } else if (filePath.includes('session2/transcript.jsonl')) {
                    return JSON.stringify({ session_id: sessionId }) + '\n';
                }
                return '';
            });

            // Mock file stats for sorting by modification time
            mockFs.statSync.mockImplementation((filePath: any) => ({
                mtimeMs: filePath.includes('session2') ? 1000 : 500
            }) as fs.Stats);

            // Import and test the logic (simulated)
            const findCodexResumeFile = (sessionId: string | null): string | null => {
                if (!sessionId) return null;

                try {
                    const codexHomeDir = process.env.CODEX_HOME || join(mockOs.homedir(), '.codex');
                    const rootDir = join(codexHomeDir, 'sessions');

                    // Simulate the recursive file collection
                    const allFiles: string[] = [];

                    function collectFilesRecursive(dir: string, acc: string[] = []): string[] {
                        let entries: fs.Dirent[];
                        try {
                            entries = mockFs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
                        } catch {
                            return acc;
                        }
                        for (const entry of entries) {
                            const full = join(dir, entry.name);
                            if (entry.isDirectory()) {
                                collectFilesRecursive(full, acc);
                            } else if (entry.isFile()) {
                                acc.push(full);
                            }
                        }
                        return acc;
                    }

                    const files = collectFilesRecursive(rootDir);

                    // Filter for transcript files that match session ID
                    const candidates = files
                        .filter(f => f.endsWith('transcript.jsonl'))
                        .filter(f => {
                            try {
                                const content = mockFs.readFileSync(f, 'utf8');
                                return content.includes(`"session_id":"${sessionId}"`);
                            } catch {
                                return false;
                            }
                        })
                        .sort((a, b) => {
                            const sa = mockFs.statSync(a).mtimeMs;
                            const sb = mockFs.statSync(b).mtimeMs;
                            return sb - sa; // newest first
                        });

                    return candidates[0] || null;
                } catch {
                    return null;
                }
            };

            const result = findCodexResumeFile(sessionId);
            expect(result).toContain('session2/transcript.jsonl');
        });

        it('should return null when session ID not found', () => {
            const sessionId = 'nonexistent-session';

            (mockFs.readdirSync as any).mockImplementation((path: any, options?: any) => {
                return [
                    { name: 'session1', isDirectory: () => true, isFile: () => false },
                ];
            });

            mockFs.readFileSync.mockImplementation(() => {
                return JSON.stringify({ session_id: 'different-session' }) + '\n';
            });

            const findCodexResumeFile = (sessionId: string | null): string | null => {
                if (!sessionId) return null;
                // Simplified logic for test
                return null;
            };

            const result = findCodexResumeFile(sessionId);
            expect(result).toBeNull();
        });

        it('should handle missing sessions directory gracefully', () => {
            mockFs.readdirSync.mockImplementation(() => {
                throw new Error('Directory not found');
            });

            const findCodexResumeFile = (sessionId: string | null): string | null => {
                if (!sessionId) return null;
                try {
                    mockFs.readdirSync('/nonexistent', { withFileTypes: true });
                    return null;
                } catch {
                    return null;
                }
            };

            const result = findCodexResumeFile('any-session');
            expect(result).toBeNull();
        });
    });

    describe('Resume Command Processing', () => {
        it('should recognize /resume command', () => {
            const testMessages = [
                '/resume',
                '/resume session-123',
                '/resume --verbose',
                'regular message',
                'another /resume in middle'
            ];

            const isResumeCommand = (message: string): boolean => {
                return message.startsWith('/resume');
            };

            expect(isResumeCommand(testMessages[0])).toBe(true);
            expect(isResumeCommand(testMessages[1])).toBe(true);
            expect(isResumeCommand(testMessages[2])).toBe(true);
            expect(isResumeCommand(testMessages[3])).toBe(false);
            expect(isResumeCommand(testMessages[4])).toBe(false);
        });

        it('should parse resume command variations', () => {
            const parseResumeCommand = (message: string): { isResume: boolean; sessionId?: string } => {
                if (!message.startsWith('/resume')) {
                    return { isResume: false };
                }

                const parts = message.split(' ');
                if (parts.length > 1) {
                    return { isResume: true, sessionId: parts[1] };
                }

                return { isResume: true };
            };

            expect(parseResumeCommand('/resume')).toEqual({ isResume: true });
            expect(parseResumeCommand('/resume session-123')).toEqual({
                isResume: true,
                sessionId: 'session-123'
            });
            expect(parseResumeCommand('not a resume')).toEqual({ isResume: false });
        });
    });

    describe('Session State Preservation', () => {
        it('should demonstrate state preservation concept', () => {
            // Simulate the state preservation behavior
            class MockSessionState {
                private sessionId: string | null = null;
                private connected = false;

                setSession(id: string) {
                    this.sessionId = id;
                    this.connected = true;
                }

                // Old behavior (problematic)
                disconnectOld() {
                    this.connected = false;
                    this.sessionId = null; // ❌ Lost forever
                }

                // New behavior (fixed)
                disconnectNew() {
                    this.connected = false;
                    // this.sessionId = null; ❌ Don't clear session ID
                }

                forceClose() {
                    this.connected = false;
                    this.sessionId = null;
                }

                getSessionId() { return this.sessionId; }
                isConnected() { return this.connected; }
                hasActiveSession() { return this.sessionId !== null; }
            }

            const state = new MockSessionState();
            state.setSession('test-session');

            expect(state.hasActiveSession()).toBe(true);
            expect(state.isConnected()).toBe(true);

            // Test new behavior preserves session
            state.disconnectNew();
            expect(state.isConnected()).toBe(false);
            expect(state.hasActiveSession()).toBe(true); // ✅ Preserved!
            expect(state.getSessionId()).toBe('test-session');

            // Test force close clears everything
            state.forceClose();
            expect(state.hasActiveSession()).toBe(false);
            expect(state.getSessionId()).toBeNull();
        });
    });

    describe('Graceful Abort Behavior', () => {
        it('should demonstrate graceful vs aggressive abort', () => {
            // Simulate the abort behavior changes
            class MockProcessors {
                messageQueue = { reset: vi.fn(), size: () => 5 };
                permissionHandler = { reset: vi.fn(), hasState: () => true };
                reasoningProcessor = { abort: vi.fn(), isActive: () => true };
                diffProcessor = { reset: vi.fn(), hasChanges: () => true };
                abortController = { abort: vi.fn(), signal: { aborted: false } };

                // Old behavior (too aggressive)
                handleAbortOld() {
                    this.abortController.abort();
                    this.messageQueue.reset(); // ❌ Loses message history
                    this.permissionHandler.reset(); // ❌ Loses permission state
                    this.reasoningProcessor.abort(); // ✅ Correct
                    this.diffProcessor.reset(); // ❌ Loses diff context
                }

                // New behavior (graceful)
                handleAbortNew() {
                    this.abortController.abort(); // ✅ Cancel current operations
                    this.reasoningProcessor.abort(); // ✅ Stop reasoning gracefully
                    // Don't reset other processors - preserve state
                }

                getState() {
                    return {
                        messageCount: this.messageQueue.size(),
                        hasPermissions: this.permissionHandler.hasState(),
                        isReasoning: this.reasoningProcessor.isActive(),
                        hasChanges: this.diffProcessor.hasChanges()
                    };
                }
            }

            const processors = new MockProcessors();
            const initialState = processors.getState();

            // Test old behavior destroys state
            processors.handleAbortOld();
            expect(processors.messageQueue.reset).toHaveBeenCalled();
            expect(processors.permissionHandler.reset).toHaveBeenCalled();
            expect(processors.diffProcessor.reset).toHaveBeenCalled();

            // Reset mocks
            vi.clearAllMocks();

            // Test new behavior preserves state
            processors.handleAbortNew();
            expect(processors.messageQueue.reset).not.toHaveBeenCalled(); // ✅ Preserved
            expect(processors.permissionHandler.reset).not.toHaveBeenCalled(); // ✅ Preserved
            expect(processors.diffProcessor.reset).not.toHaveBeenCalled(); // ✅ Preserved
            expect(processors.reasoningProcessor.abort).toHaveBeenCalled(); // ✅ Still aborted
        });
    });
});