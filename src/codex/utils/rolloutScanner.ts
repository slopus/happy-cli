import os from 'node:os';
import { join, resolve } from 'node:path';
import { readdir, readFile, stat, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { logger } from '@/ui/logger';
import { InvalidateSync } from '@/utils/sync';
import { startFileWatcher } from '@/modules/watcher/startFileWatcher';
import { sanitizeInkText } from '@/utils/inkSanitize';

interface RolloutScannerOptions {
    workingDirectory: string;
    onCodexMessage: (message: any) => void;
    allowAll?: boolean;
    resumeSessionId?: string;
    onActiveSessionFile?: (file: string, sessionId: string | undefined) => void;
}

export interface CodexResumeEntry {
    id: string;
    preview: string;
    updatedAt?: Date;
    cwd?: string;
    gitBranch?: string;
    path: string;
}

interface FileState {
    offset: number;
    buffer: string;
    cwd?: string;
    sessionId?: string;
    accepted: boolean;
}

export async function createCodexRolloutScanner(opts: RolloutScannerOptions) {
    const codexHomeDir = process.env.CODEX_HOME || join(os.homedir(), '.codex');
    const sessionsDir = join(codexHomeDir, 'sessions');
    const normalizedCwd = resolve(opts.workingDirectory);
    const startTimeMs = Date.now();

    const fileStates = new Map<string, FileState>();
    const watchers = new Map<string, () => void>();

    const sync = new InvalidateSync(async () => {
        const files = await listJsonlFiles(sessionsDir);

        for (const file of files) {
            if (!fileStates.has(file)) {
                await initializeFile(file);
            }
        }

        for (const [file] of fileStates) {
            await processFileUpdates(file);
        }

        for (const file of files) {
            if (!watchers.has(file)) {
                watchers.set(file, startFileWatcher(file, () => sync.invalidate()));
            }
        }
    });

    await sync.invalidateAndAwait();
    const intervalId = setInterval(() => sync.invalidate(), 3000);

    return {
        cleanup: async () => {
            clearInterval(intervalId);
            for (const stop of watchers.values()) {
                stop();
            }
            watchers.clear();
            await sync.invalidateAndAwait();
            sync.stop();
        },
    };

    async function initializeFile(file: string) {
        let state: FileState = {
            offset: 0,
            buffer: '',
            accepted: false,
        };

        const contents = await readFileSafe(file);
        if (contents === null) {
            return;
        }

        const { lines, trailing } = splitLines(contents);
        state.buffer = trailing;

        for (const line of lines) {
            handleLine(file, state, line, true);
        }

        const fileStat = await statSafe(file);
        if (fileStat) {
            state.offset = fileStat.size;
        }

        fileStates.set(file, state);
    }

    async function processFileUpdates(file: string) {
        const state = fileStates.get(file);
        if (!state) return;

        const fileStat = await statSafe(file);
        if (!fileStat) return;

        if (fileStat.size <= state.offset) {
            return;
        }

        const chunk = await readFromOffset(file, state.offset);
        if (!chunk) return;

        state.offset = fileStat.size;

        const combined = state.buffer + chunk;
        const { lines, trailing } = splitLines(combined);
        state.buffer = trailing;

        for (const line of lines) {
            handleLine(file, state, line, false);
        }
    }

    function handleLine(file: string, state: FileState, line: string, initial: boolean) {
        if (!line.trim()) return;

        let record: any;
        try {
            record = JSON.parse(line);
        } catch {
            return;
        }

        if (record?.type === 'session_meta') {
            const cwd = record?.payload?.cwd ?? record?.payload?.meta?.cwd;
            const sessionId = record?.payload?.id ?? record?.payload?.meta?.id;
            if (cwd) {
                state.cwd = cwd;
            }
            if (sessionId) {
                state.sessionId = sessionId;
            }

            const matchesCwd = opts.allowAll || (state.cwd && resolve(state.cwd) === normalizedCwd);
            const matchesResume = opts.resumeSessionId && sessionId && sessionId === opts.resumeSessionId;
            const isRecent = !opts.resumeSessionId && isRecentTimestamp(record?.timestamp ?? record?.payload?.timestamp);

            if (matchesResume || (matchesCwd && isRecent)) {
                state.accepted = true;
                logger.debug(`[codex-rollout] Tracking session ${state.sessionId ?? 'unknown'} at ${file}`);
                opts.onActiveSessionFile?.(file, state.sessionId);
            } else if (state.cwd) {
                state.accepted = false;
            }
            return;
        }

        if (!state.accepted) {
            const matchesCwd = opts.allowAll || (state.cwd && resolve(state.cwd) === normalizedCwd);
            if (matchesCwd && shouldEmitRecord(record)) {
                state.accepted = true;
                logger.debug(`[codex-rollout] Tracking session ${state.sessionId ?? 'unknown'} at ${file}`);
                opts.onActiveSessionFile?.(file, state.sessionId);
            } else {
                return;
            }
        }

        if (initial && !shouldEmitRecord(record)) {
            return;
        }

        emitFromRecord(record);
    }

    function shouldEmitRecord(record: any): boolean {
        const timestamp = record?.timestamp;
        if (!timestamp) return false;
        const ts = Date.parse(timestamp);
        if (Number.isNaN(ts)) return false;
        return ts >= startTimeMs - 1000;
    }

    function isRecentTimestamp(timestamp: string | undefined): boolean {
        if (!timestamp) return false;
        const ts = Date.parse(timestamp);
        if (Number.isNaN(ts)) return false;
        return ts >= startTimeMs - 1000;
    }

    function emitFromRecord(record: any) {
        if (!record || typeof record !== 'object') return;

        switch (record.type) {
            case 'response_item':
                handleResponseItem(record.payload);
                return;
            case 'event_msg':
                handleEventMsg(record.payload);
                return;
            default:
                return;
        }
    }

    function handleEventMsg(event: any) {
        if (!event || typeof event !== 'object') return;
        if (event.type === 'token_count') {
            opts.onCodexMessage({ ...event, id: randomUUID() });
        }
    }

    function handleResponseItem(item: any) {
        if (!item || typeof item !== 'object') return;

        switch (item.type) {
            case 'message': {
                if (item.role !== 'assistant' || !Array.isArray(item.content)) {
                    return;
                }
                const text = extractText(item.content, true);
                if (!text) return;
                opts.onCodexMessage({
                    type: 'message',
                    message: text,
                    id: randomUUID(),
                });
                return;
            }
            case 'function_call': {
                const callId = item.call_id;
                if (!callId) return;
                const input = parseJsonInput(item.arguments);
                opts.onCodexMessage({
                    type: 'tool-call',
                    name: item.name,
                    callId,
                    input,
                    id: randomUUID(),
                });
                return;
            }
            case 'function_call_output': {
                const callId = item.call_id;
                if (!callId) return;
                opts.onCodexMessage({
                    type: 'tool-call-result',
                    callId,
                    output: item.output,
                    id: randomUUID(),
                });
                return;
            }
            case 'custom_tool_call': {
                const callId = item.call_id;
                if (!callId) return;
                const input = parseJsonInput(item.input);
                opts.onCodexMessage({
                    type: 'tool-call',
                    name: item.name,
                    callId,
                    input,
                    id: randomUUID(),
                });
                return;
            }
            case 'custom_tool_call_output': {
                const callId = item.call_id;
                if (!callId) return;
                opts.onCodexMessage({
                    type: 'tool-call-result',
                    callId,
                    output: item.output,
                    id: randomUUID(),
                });
                return;
            }
            case 'local_shell_call': {
                const callId = item.call_id ?? randomUUID();
                const action = item.action;
                if (action?.type !== 'exec') return;
                opts.onCodexMessage({
                    type: 'tool-call',
                    name: 'CodexBash',
                    callId,
                    input: {
                        command: action.command,
                        cwd: action.working_directory,
                        timeout_ms: action.timeout_ms,
                        env: action.env,
                        user: action.user,
                    },
                    id: randomUUID(),
                });
                return;
            }
            case 'web_search_call': {
                opts.onCodexMessage({
                    type: 'tool-call',
                    name: 'web_search',
                    callId: randomUUID(),
                    input: item.action,
                    id: randomUUID(),
                });
                return;
            }
            default:
                return;
        }
    }
}

export async function findLatestCodexRolloutForCwd(
    workingDirectory: string,
    allowAll: boolean,
    opts?: { preferMtime?: boolean }
): Promise<string | null> {
    const codexHomeDir = process.env.CODEX_HOME || join(os.homedir(), '.codex');
    const sessionsDir = join(codexHomeDir, 'sessions');
    const normalizedCwd = resolve(workingDirectory);
    const files = await listJsonlFiles(sessionsDir);

    let best: { file: string; ts: number } | null = null;

    for (const file of files) {
        const meta = await readSessionMeta(file);
        if (!meta) continue;
        if (!allowAll && meta.cwd && resolve(meta.cwd) !== normalizedCwd) {
            continue;
        }
        const ts = opts?.preferMtime
            ? (await statSafe(file))?.mtimeMs ?? 0
            : parseRolloutTimestamp(file) ?? (await statSafe(file))?.mtimeMs ?? 0;
        if (!best || ts > best.ts) {
            best = { file, ts };
        }
    }

    return best?.file ?? null;
}

export async function findSessionFileById(sessionId: string): Promise<string | null> {
    const codexHomeDir = process.env.CODEX_HOME || join(os.homedir(), '.codex');
    const sessionsDir = join(codexHomeDir, 'sessions');
    const files = await listJsonlFiles(sessionsDir);

    for (const file of files) {
        const meta = await readSessionMeta(file);
        if (meta?.id === sessionId) {
            return file;
        }
    }

    return null;
}

export async function listCodexResumeSessions(opts: {
    workingDirectory: string;
    allowAll?: boolean;
    limit?: number;
}): Promise<CodexResumeEntry[]> {
    const codexHomeDir = process.env.CODEX_HOME || join(os.homedir(), '.codex');
    const sessionsDir = join(codexHomeDir, 'sessions');
    const normalizedCwd = resolve(opts.workingDirectory);
    const files = await listJsonlFiles(sessionsDir);

    const scored = await Promise.all(
        files.map(async (file) => {
            const stats = await statSafe(file);
            const parsedTs = parseRolloutTimestamp(file);
            const ts = parsedTs ?? stats?.mtimeMs ?? 0;
            return { file, ts, mtimeMs: stats?.mtimeMs ?? null };
        })
    );

    scored.sort((a, b) => b.ts - a.ts);

    const limit = opts.limit ?? 200;
    const entries: CodexResumeEntry[] = [];

    for (const candidate of scored) {
        if (entries.length >= limit) break;
        const summary = await readSessionSummary(candidate.file);
        if (!summary?.id) continue;
        // Match Codex's `list_threads`: only include sessions that have
        // session metadata AND a user event within the head-record scan window.
        if (!summary.sawSessionMeta || !summary.sawUserEvent) continue;
        if (!opts.allowAll) {
            if (!summary.cwd) continue;
            if (resolve(summary.cwd) !== normalizedCwd) continue;
        }
        const updatedAt = summary.updatedAt
            ?? (candidate.mtimeMs ? new Date(candidate.mtimeMs) : undefined)
            ?? (candidate.ts ? new Date(candidate.ts) : undefined);
        const preview = normalizePreview(summary.preview);
        entries.push({
            id: summary.id,
            preview: preview || '(no message yet)',
            updatedAt,
            cwd: summary.cwd,
            gitBranch: summary.gitBranch,
            path: candidate.file,
        });
    }

    return entries;
}

export async function readSessionMeta(file: string): Promise<{ id?: string; cwd?: string } | null> {
    return readSessionMetaInternal(file);
}

export async function buildRolloutHistoryPrompt(opts: {
    file: string;
    maxChars?: number;
    maxMessages?: number;
}): Promise<string | null> {
    const maxChars = opts.maxChars ?? 8000;
    const maxMessages = opts.maxMessages ?? 24;
    const contents = await readFileSafe(opts.file);
    if (!contents) return null;

    const { lines } = splitLines(contents);
    const messages: { role: 'user' | 'assistant'; text: string }[] = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        let record: any;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }
        const itemType = record?.type;
        if (itemType === 'response_item') {
            const payload = record.payload;
            if (payload?.type === 'message' && Array.isArray(payload.content)) {
                const role = payload.role === 'user' ? 'user' : 'assistant';
                const text = extractText(payload.content, role === 'assistant');
                if (text) {
                    messages.push({ role, text });
                }
            } else if (payload?.type === 'compacted' && payload.message) {
                messages.push({ role: 'assistant', text: payload.message });
            }
        } else if (itemType === 'event_msg') {
            const payload = record.payload;
            if (payload?.type === 'user_message' && payload.message) {
                messages.push({ role: 'user', text: payload.message });
            } else if (payload?.type === 'agent_message' && payload.message) {
                messages.push({ role: 'assistant', text: payload.message });
            }
        }
    }

    if (messages.length === 0) return null;

    const trimmed = messages.slice(-maxMessages);
    let body = '';
    for (const message of trimmed) {
        const label = message.role === 'user' ? 'User' : 'Assistant';
        body += `${label}: ${message.text.trim()}\n`;
        if (body.length > maxChars) {
            body = body.slice(-maxChars);
            break;
        }
    }

    if (!body.trim()) return null;

    return `Conversation so far:\\n${body.trim()}\\n\\nNew user message:\\n`;
}

async function listJsonlFiles(root: string): Promise<string[]> {
    let entries: string[] = [];
    let dirents: import('node:fs').Dirent[];
    try {
        dirents = await readdir(root, { withFileTypes: true }) as import('node:fs').Dirent[];
    } catch {
        return entries;
    }

    for (const dirent of dirents) {
        const full = join(root, dirent.name);
        if (dirent.isDirectory()) {
            entries = entries.concat(await listJsonlFiles(full));
        } else if (dirent.isFile() && full.endsWith('.jsonl')) {
            entries.push(full);
        }
    }

    return entries;
}

function splitLines(text: string): { lines: string[]; trailing: string } {
    const parts = text.split('\n');
    let trailing = '';
    if (!text.endsWith('\n')) {
        trailing = parts.pop() ?? '';
    } else if (parts.length && parts[parts.length - 1] === '') {
        parts.pop();
    }
    return { lines: parts, trailing };
}

function extractText(content: any[], preferOutput: boolean): string {
    const texts: string[] = [];
    for (const item of content) {
        if (!item || typeof item !== 'object') continue;
        if (preferOutput && item.type === 'output_text' && item.text) {
            texts.push(item.text);
        } else if (!preferOutput && item.type === 'input_text' && item.text) {
            texts.push(item.text);
        }
    }
    if (texts.length === 0 && preferOutput) {
        for (const item of content) {
            if (item?.text) {
                texts.push(item.text);
            }
        }
    }
    return texts.join('');
}

function parseJsonInput(value: string): unknown {
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

async function readFileSafe(file: string): Promise<string | null> {
    try {
        return await readFile(file, 'utf8');
    } catch {
        return null;
    }
}

async function statSafe(file: string) {
    try {
        return await stat(file);
    } catch {
        return null;
    }
}

async function readFromOffset(file: string, offset: number): Promise<string | null> {
    let handle;
    try {
        handle = await open(file, 'r');
        const { size } = await handle.stat();
        if (size <= offset) {
            return '';
        }
        const length = size - offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        return buffer.toString('utf8');
    } catch {
        return null;
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

async function readSessionMetaInternal(file: string): Promise<{ id?: string; cwd?: string } | null> {
    const contents = await readFileSafe(file);
    if (!contents) return null;
    const { lines } = splitLines(contents);
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const record = JSON.parse(line);
            if (record?.type === 'session_meta') {
                const payload = record?.payload ?? {};
                return {
                    id: payload?.id ?? payload?.meta?.id,
                    cwd: payload?.cwd ?? payload?.meta?.cwd,
                };
            }
        } catch {
            continue;
        }
    }
    return null;
}

async function readSessionSummary(file: string): Promise<{
    id?: string;
    cwd?: string;
    gitBranch?: string;
    preview?: string;
    updatedAt?: Date;
    sawSessionMeta: boolean;
    sawUserEvent: boolean;
}> {
    const head = await readHeadBytes(file, 1024 * 1024);
    if (!head) return { sawSessionMeta: false, sawUserEvent: false };
    const { lines } = splitLines(head);
    let id: string | undefined;
    let cwd: string | undefined;
    let gitBranch: string | undefined;
    let preview: string | undefined;
    let sawSessionMeta = false;
    let sawUserEvent = false;

    // Mirror Codex's head scan behavior: only consider the first N JSONL records.
    // Codex uses this to decide which rollouts are "real" resumable threads.
    const headRecords = parseHeadRecords(lines, 10);

    for (const record of headRecords) {
        if (record?.type === 'session_meta') {
            const payload = record?.payload ?? {};
            const meta = payload?.meta ?? {};
            id = payload?.id ?? meta?.id ?? id;
            cwd = payload?.cwd ?? meta?.cwd ?? cwd;
            gitBranch = payload?.git?.branch ?? meta?.git?.branch ?? gitBranch;
            sawSessionMeta = true;
            continue;
        }

        // Codex considers a rollout valid if it sees a user event in the head scan.
        // Codex's `list_threads` uses the presence of a `user_message` event (not a `response_item`).
        if (record?.type === 'event_msg' && record?.payload?.type === 'user_message') {
            sawUserEvent = true;
        }
    }

    // Match Codex's picker: use the first meaningful user input as the preview.
    // Skip AGENTS.md bootstrap and other non-user prompts like <environment_context>.
    preview = readHeadPreviewMessageFromRecords(headRecords);

    return { id, cwd, gitBranch, preview, sawSessionMeta, sawUserEvent };
}

function parseRolloutTimestamp(file: string): number | null {
    const match = file.match(/rollout-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-/);
    if (!match) return null;
    const raw = match[1];
    const iso = raw.replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
    const date = new Date(`${iso}Z`);
    const ts = date.getTime();
    return Number.isNaN(ts) ? null : ts;
}

async function readHeadBytes(file: string, maxBytes: number): Promise<string | null> {
    let handle;
    try {
        handle = await open(file, 'r');
        const stats = await handle.stat();
        if (stats.size <= 0) return '';
        const length = Math.min(stats.size, maxBytes);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, 0);
        return buffer.toString('utf8');
    } catch {
        return null;
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

async function readTailBytes(file: string, maxBytes: number): Promise<string | null> {
    let handle;
    try {
        handle = await open(file, 'r');
        const stats = await handle.stat();
        if (stats.size <= 0) return '';
        const length = Math.min(stats.size, maxBytes);
        const offset = Math.max(0, stats.size - length);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        return buffer.toString('utf8');
    } catch {
        return null;
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

function looksLikeAgentsBootstrap(text: string): boolean {
    const trimmed = text.trimStart();
    return (
        trimmed.startsWith('# AGENTS.md instructions') ||
        trimmed.startsWith('AGENTS.md instructions') ||
        trimmed.includes('<INSTRUCTIONS>')
    );
}

function looksLikeEnvironmentBootstrap(text: string): boolean {
    const trimmed = text.trimStart();
    return trimmed.startsWith('<environment_context>');
}

function readHeadPreviewMessage(lines: string[]): string | undefined {
    for (const line of lines) {
        if (!line.trim()) continue;
        let record: any;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }

        const itemType = record?.type;
        if (itemType === 'response_item') {
            const payload = record?.payload;
            if (payload?.type === 'message' && payload?.role === 'user' && Array.isArray(payload?.content)) {
                const raw = extractText(payload.content, false);
                const normalized = normalizePreview(raw);
                if (!normalized) continue;
                if (looksLikeAgentsBootstrap(normalized)) continue;
                if (looksLikeEnvironmentBootstrap(normalized)) continue;
                return normalized;
            }
        } else if (itemType === 'event_msg') {
            const payload = record?.payload;
            if (payload?.type === 'user_message' && typeof payload?.message === 'string') {
                const normalized = normalizePreview(payload.message);
                if (!normalized) continue;
                if (looksLikeAgentsBootstrap(normalized)) continue;
                if (looksLikeEnvironmentBootstrap(normalized)) continue;
                return normalized;
            }
        }
    }

    return undefined;
}

function parseHeadRecords(lines: string[], maxRecords: number): any[] {
    const records: any[] = [];
    for (const line of lines) {
        if (records.length >= maxRecords) break;
        if (!line.trim()) continue;
        try {
            records.push(JSON.parse(line));
        } catch {
            continue;
        }
    }
    return records;
}

function readHeadPreviewMessageFromRecords(records: any[]): string | undefined {
    for (const record of records) {
        const itemType = record?.type;
        if (itemType === 'response_item') {
            const payload = record?.payload;
            if (payload?.type === 'message' && payload?.role === 'user' && Array.isArray(payload?.content)) {
                const raw = extractText(payload.content, false);
                const normalized = normalizePreview(raw);
                if (!normalized) continue;
                if (looksLikeAgentsBootstrap(normalized)) continue;
                if (looksLikeEnvironmentBootstrap(normalized)) continue;
                return normalized;
            }
        } else if (itemType === 'event_msg') {
            const payload = record?.payload;
            if (payload?.type === 'user_message' && typeof payload?.message === 'string') {
                const normalized = normalizePreview(payload.message);
                if (!normalized) continue;
                if (looksLikeAgentsBootstrap(normalized)) continue;
                if (looksLikeEnvironmentBootstrap(normalized)) continue;
                return normalized;
            }
        }
    }

    return undefined;
}

function normalizePreview(text?: string): string | undefined {
    if (!text) return undefined;
    const sanitized = sanitizeInkText(text);
    return sanitized || undefined;
}

// stripAnsiAndControls replaced by sanitizeInkText
