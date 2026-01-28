import { describe, expect, it } from 'vitest';

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { listCodexResumeSessions } from '../utils/rolloutScanner';

describe('rolloutScanner preview sanitization', () => {
    it('strips ANSI escape codes and control characters from resume previews', async () => {
        const originalCodexHome = process.env.CODEX_HOME;

        const tmpRoot = await mkdtemp(join(os.tmpdir(), 'happy-cli-codex-preview-'));
        try {
            const projectDir = join(tmpRoot, 'project');
            const sessionsDir = join(tmpRoot, 'sessions');
            await mkdir(projectDir, { recursive: true });
            await mkdir(sessionsDir, { recursive: true });

            process.env.CODEX_HOME = tmpRoot;

            const sessionId = '019bbb78-fd0a-7be1-b731-684e43c306cf';
            const rawMessage = [
                'Hello',
                '\u001b[31mRED\u001b[0m',
                '\u001b]0;title\u0007',
                '\u0000null',
                'world',
            ].join(' ');

            const rolloutFile = join(
                sessionsDir,
                'rollout-2026-01-15T00-00-00-00000000-0000-0000-0000-000000000000.jsonl'
            );

            await writeFile(
                rolloutFile,
                [
                    JSON.stringify({
                        type: 'session_meta',
                        payload: {
                            meta: {
                                id: sessionId,
                                cwd: projectDir,
                                git: { branch: 'master' },
                            },
                        },
                    }),
                    JSON.stringify({
                        type: 'event_msg',
                        payload: { type: 'user_message', message: rawMessage },
                    }),
                ].join('\n') + '\n'
            );

            const entries = await listCodexResumeSessions({ workingDirectory: projectDir });
            expect(entries).toHaveLength(1);

            const preview = entries[0]?.preview ?? '';
            expect(preview).toContain('Hello RED');
            expect(preview).toContain('world');
            expect(preview).not.toMatch(/[\u001B\u009B]/);
            expect(preview).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/);
        } finally {
            process.env.CODEX_HOME = originalCodexHome;
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it('uses the first meaningful user message (not injected AGENTS.md)', async () => {
        const originalCodexHome = process.env.CODEX_HOME;

        const tmpRoot = await mkdtemp(join(os.tmpdir(), 'happy-cli-codex-preview-latest-'));
        try {
            const projectDir = join(tmpRoot, 'project');
            const sessionsDir = join(tmpRoot, 'sessions');
            await mkdir(projectDir, { recursive: true });
            await mkdir(sessionsDir, { recursive: true });

            process.env.CODEX_HOME = tmpRoot;

            const sessionId = '019bbb78-fd0a-7be1-b731-684e43c306cf';
            const injectedAgents = '# AGENTS.md instructions for /path\n<INSTRUCTIONS>\nfoo\n</INSTRUCTIONS>';
            const realPrompt = 'Please perform the same cleanup for undated-46740309.';

            const rolloutFile = join(
                sessionsDir,
                'rollout-2026-01-15T00-00-00-00000000-0000-0000-0000-000000000000.jsonl'
            );

            await writeFile(
                rolloutFile,
                [
                    JSON.stringify({
                        type: 'session_meta',
                        payload: {
                            meta: {
                                id: sessionId,
                                cwd: projectDir,
                                git: { branch: 'master' },
                            },
                        },
                    }),
                    JSON.stringify({
                        type: 'event_msg',
                        payload: { type: 'user_message', message: injectedAgents },
                    }),
                    JSON.stringify({
                        type: 'event_msg',
                        payload: { type: 'user_message', message: realPrompt },
                    }),
                ].join('\n') + '\n'
            );

            const entries = await listCodexResumeSessions({ workingDirectory: projectDir });
            expect(entries).toHaveLength(1);
            expect(entries[0]?.preview).toContain('Please perform the same cleanup');
        } finally {
            process.env.CODEX_HOME = originalCodexHome;
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it('keeps the preview stable even when later lines include huge tool output', async () => {
        const originalCodexHome = process.env.CODEX_HOME;

        const tmpRoot = await mkdtemp(join(os.tmpdir(), 'happy-cli-codex-preview-head-fallback-'));
        try {
            const projectDir = join(tmpRoot, 'project');
            const sessionsDir = join(tmpRoot, 'sessions');
            await mkdir(projectDir, { recursive: true });
            await mkdir(sessionsDir, { recursive: true });

            process.env.CODEX_HOME = tmpRoot;

            const sessionId = '019bbb78-fd0a-7be1-b731-684e43c306cf';
            const injectedAgents = '# AGENTS.md instructions for /path\n<INSTRUCTIONS>\nfoo\n</INSTRUCTIONS>';
            const realPrompt = 'Codex please form a commit on this repo and push to origin.';

            // Make the file large by adding a big tool output after the user's prompt.
            const bigOutput = 'X'.repeat(1200 * 1024);

            const rolloutFile = join(
                sessionsDir,
                'rollout-2026-01-15T00-00-00-00000000-0000-0000-0000-000000000000.jsonl'
            );

            await writeFile(
                rolloutFile,
                [
                    JSON.stringify({
                        type: 'session_meta',
                        payload: {
                            meta: {
                                id: sessionId,
                                cwd: projectDir,
                                git: { branch: 'master' },
                            },
                        },
                    }),
                    JSON.stringify({
                        type: 'event_msg',
                        payload: { type: 'user_message', message: injectedAgents },
                    }),
                    JSON.stringify({
                        type: 'event_msg',
                        payload: { type: 'user_message', message: realPrompt },
                    }),
                    JSON.stringify({
                        type: 'response_item',
                        payload: {
                            type: 'function_call_output',
                            call_id: 'call_big',
                            output: bigOutput,
                        },
                    }),
                    JSON.stringify({
                        type: 'response_item',
                        payload: {
                            type: 'message',
                            role: 'assistant',
                            content: [{ type: 'output_text', text: 'ok' }],
                        },
                    }),
                ].join('\n') + '\n'
            );

            const entries = await listCodexResumeSessions({ workingDirectory: projectDir });
            expect(entries).toHaveLength(1);
            expect(entries[0]?.preview).toContain('Codex please form a commit');
        } finally {
            process.env.CODEX_HOME = originalCodexHome;
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it('matches Codex filtering: excludes rollouts without a user event in the head scan window', async () => {
        const originalCodexHome = process.env.CODEX_HOME;

        const tmpRoot = await mkdtemp(join(os.tmpdir(), 'happy-cli-codex-preview-head-filter-'));
        try {
            const projectDir = join(tmpRoot, 'project');
            const sessionsDir = join(tmpRoot, 'sessions');
            await mkdir(projectDir, { recursive: true });
            await mkdir(sessionsDir, { recursive: true });

            process.env.CODEX_HOME = tmpRoot;

            const sessionId = '019bbb78-fd0a-7be1-b731-684e43c306cf';

            const rolloutFile = join(
                sessionsDir,
                'rollout-2026-01-15T00-00-00-00000000-0000-0000-0000-000000000000.jsonl'
            );

            // 11 records total:
            // - session_meta + 9 assistant messages => first 10 records contain NO user event
            // - user message appears only at record 11, so Codex would exclude this rollout
            const records: string[] = [
                JSON.stringify({
                    type: 'session_meta',
                    payload: {
                        meta: {
                            id: sessionId,
                            cwd: projectDir,
                            git: { branch: 'master' },
                        },
                    },
                }),
            ];

            for (let i = 0; i < 9; i++) {
                records.push(
                    JSON.stringify({
                        type: 'response_item',
                        payload: {
                            type: 'message',
                            role: 'assistant',
                            content: [{ type: 'output_text', text: `assistant-${i}` }],
                        },
                    })
                );
            }

            records.push(
                JSON.stringify({
                    type: 'event_msg',
                    payload: { type: 'user_message', message: 'this is too late' },
                })
            );

            await writeFile(rolloutFile, records.join('\n') + '\n');

            const entries = await listCodexResumeSessions({ workingDirectory: projectDir });
            expect(entries).toHaveLength(0);
        } finally {
            process.env.CODEX_HOME = originalCodexHome;
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });

    it('matches Codex filtering: excludes rollouts that only have response_item user messages (no user_message event)', async () => {
        const originalCodexHome = process.env.CODEX_HOME;

        const tmpRoot = await mkdtemp(join(os.tmpdir(), 'happy-cli-codex-preview-event-msg-only-'));
        try {
            const projectDir = join(tmpRoot, 'project');
            const sessionsDir = join(tmpRoot, 'sessions');
            await mkdir(projectDir, { recursive: true });
            await mkdir(sessionsDir, { recursive: true });

            process.env.CODEX_HOME = tmpRoot;

            const sessionId = '019bbb78-fd0a-7be1-b731-684e43c306cf';

            const rolloutFile = join(
                sessionsDir,
                'rollout-2026-01-15T00-00-00-00000000-0000-0000-0000-000000000000.jsonl'
            );

            // First 10 records include a user message as a response_item, but there is NO event_msg:user_message.
            // Codex excludes these from its resume list.
            const records: string[] = [
                JSON.stringify({
                    type: 'session_meta',
                    payload: {
                        meta: {
                            id: sessionId,
                            cwd: projectDir,
                            git: { branch: 'master' },
                        },
                    },
                }),
                JSON.stringify({
                    type: 'response_item',
                    payload: {
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text: 'hello from response_item' }],
                    },
                }),
            ];

            // Pad to 10 total records with assistant messages
            while (records.length < 10) {
                records.push(
                    JSON.stringify({
                        type: 'response_item',
                        payload: {
                            type: 'message',
                            role: 'assistant',
                            content: [{ type: 'output_text', text: 'ok' }],
                        },
                    })
                );
            }

            await writeFile(rolloutFile, records.join('\n') + '\n');

            const entries = await listCodexResumeSessions({ workingDirectory: projectDir });
            expect(entries).toHaveLength(0);
        } finally {
            process.env.CODEX_HOME = originalCodexHome;
            await rm(tmpRoot, { recursive: true, force: true });
        }
    });
});
