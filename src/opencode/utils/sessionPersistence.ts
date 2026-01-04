/**
 * Session Persistence for OpenCode
 *
 * Stores and retrieves OpenCode session IDs per directory for auto-resume.
 * Sessions are stored in ~/.happy-dev/opencode-sessions.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '@/ui/logger';

/** Number of days after which sessions expire for auto-resume */
export const SESSION_EXPIRY_DAYS = 7;

/**
 * Entry for a directory's last session
 */
export interface DirectorySessionEntry {
  /** OpenCode session ID (format: ses_xxx) */
  opencodeSessionId: string;
  /** Timestamp when session was last used */
  updatedAt: number;
  /** Optional session title */
  title?: string;
}

/**
 * Map of directory paths to their last session
 */
interface DirectorySessionMap {
  [directory: string]: DirectorySessionEntry;
}

const SESSIONS_FILE = 'opencode-sessions.json';

/**
 * Get the path to the sessions file
 */
function getSessionsFilePath(): string {
  const happyHomeDir = process.env.HAPPY_HOME_DIR || join(process.env.HOME || '', '.happy-dev');
  return join(happyHomeDir, SESSIONS_FILE);
}

/**
 * Get the last session for a directory (if not expired)
 *
 * @param directory - Absolute path to the project directory
 * @returns Session entry if exists and not expired, null otherwise
 */
export async function getLastSessionForDirectory(
  directory: string
): Promise<DirectorySessionEntry | null> {
  const filePath = getSessionsFilePath();

  try {
    const data = await readFile(filePath, 'utf-8');
    const sessions: DirectorySessionMap = JSON.parse(data);
    const entry = sessions[directory];

    if (!entry) {
      return null;
    }

    // Check if expired
    const expiryTime = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const isExpired = Date.now() - entry.updatedAt > expiryTime;

    if (isExpired) {
      logger.debug(`[SessionPersistence] Session for ${directory} expired (${SESSION_EXPIRY_DAYS} days)`);
      return null;
    }

    return entry;
  } catch (error) {
    // File doesn't exist or is invalid
    logger.debug(`[SessionPersistence] No sessions file found or error reading:`, error);
    return null;
  }
}

/**
 * Save a session for a directory
 *
 * @param directory - Absolute path to the project directory
 * @param entry - Session entry to save
 */
export async function saveSessionForDirectory(
  directory: string,
  entry: DirectorySessionEntry
): Promise<void> {
  const filePath = getSessionsFilePath();
  let sessions: DirectorySessionMap = {};

  try {
    const data = await readFile(filePath, 'utf-8');
    sessions = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }

  sessions[directory] = entry;

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });

  await writeFile(filePath, JSON.stringify(sessions, null, 2));
  logger.debug(`[SessionPersistence] Saved session ${entry.opencodeSessionId} for ${directory}`);
}
