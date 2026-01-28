import type { UUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';

type CodexSessionTagMap = Record<string, UUID>;

const mapFile = join(configuration.happyHomeDir, 'codex-session-map.json');
const tmpFile = `${mapFile}.tmp`;

async function readMap(): Promise<CodexSessionTagMap> {
    if (!existsSync(mapFile)) return {};

    try {
        const raw = await readFile(mapFile, 'utf8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return {};
        return normalizeMap(data as Record<string, unknown>);
    } catch (error) {
        logger.debug('[codex-session-map] Failed to read map, starting fresh', error);
        return {};
    }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidTag(value: unknown): value is UUID {
    return typeof value === 'string' && uuidPattern.test(value);
}

function normalizeMap(data: Record<string, unknown>): CodexSessionTagMap {
    const map: CodexSessionTagMap = {};
    for (const [key, value] of Object.entries(data)) {
        if (isValidTag(value)) {
            map[key] = value;
        }
    }
    return map;
}

async function writeMap(map: CodexSessionTagMap): Promise<void> {
    await mkdir(configuration.happyHomeDir, { recursive: true });
    await writeFile(tmpFile, JSON.stringify(map, null, 2));
    await rename(tmpFile, mapFile);
}

export async function getHappySessionTagForCodexSession(sessionId: string): Promise<UUID | null> {
    const map = await readMap();
    return map[sessionId] ?? null;
}

export async function ensureHappySessionTagForCodexSession(sessionId: string, tag: UUID): Promise<UUID> {
    const map = await readMap();
    const existing = map[sessionId];

    if (existing) {
        if (existing !== tag) {
            logger.debug('[codex-session-map] Existing tag differs; keeping stored tag', {
                sessionId,
                existing,
                attempted: tag,
            });
        }
        return existing;
    }

    map[sessionId] = tag;
    await writeMap(map);
    logger.debug('[codex-session-map] Stored session tag mapping', { sessionId, tag });
    return tag;
}
