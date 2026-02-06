import { logger } from "@/ui/logger";
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { getProjectPath } from "./path";

const CHECK_SESSION_BYTES = 16384; // 16KB is enough to find one valid message

export function claudeCheckSession(sessionId: string, path: string) {
    const projectDir = getProjectPath(path);

    // Check if session id is in the project dir
    const sessionFile = join(projectDir, `${sessionId}.jsonl`);
    const sessionExists = existsSync(sessionFile);
    if (!sessionExists) {
        logger.debug(`[claudeCheckSession] Path ${sessionFile} does not exist`);
        return false;
    }

    // Only read the first 16KB to check for a valid message.
    // Session files can be hundreds of MB for long conversations;
    // reading the entire file causes OOM crashes (see #526).
    const fd = openSync(sessionFile, 'r');
    const buf = Buffer.alloc(CHECK_SESSION_BYTES);
    const bytesRead = readSync(fd, buf, 0, CHECK_SESSION_BYTES, 0);
    closeSync(fd);
    const chunk = buf.toString('utf-8', 0, bytesRead);
    const lines = chunk.split('\n');

    const hasGoodMessage = !!lines.find((v, index) => {
        if (!v.trim()) return false;  // Skip empty lines silently (not errors)

        try {
            const parsed = JSON.parse(v);
            // Accept sessions with any of these ID fields (different Claude Code versions)
            // Check for non-empty strings to handle edge cases robustly
            return (typeof parsed.uuid === 'string' && parsed.uuid.length > 0) ||        // Claude Code 2.1.x
                   (typeof parsed.messageId === 'string' && parsed.messageId.length > 0) ||   // Older Claude Code
                   (typeof parsed.leafUuid === 'string' && parsed.leafUuid.length > 0);      // Summary lines
        } catch (e) {
            // Log parse errors for debugging (following project convention)
            logger.debug(`[claudeCheckSession] Malformed JSON at line ${index + 1}:`, e);
            return false;
        }
    });

    // Log final validation result for observability
    logger.debug(`[claudeCheckSession] Session ${sessionId}: ${hasGoodMessage ? 'valid' : 'invalid'}`);

    return hasGoodMessage;
}