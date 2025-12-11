import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPath } from './path';
import { claudeCheckSession } from './claudeCheckSession';

/**
 * Finds the most recently modified VALID session in the project directory.
 * A valid session must contain at least one message with a uuid field.
 * Returns the session ID (filename without .jsonl extension) or null if no valid sessions found.
 */
export function claudeFindLastSession(workingDirectory: string): string | null {
    try {
        const projectDir = getProjectPath(workingDirectory);
        const files = readdirSync(projectDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => {
                const sessionId = f.replace('.jsonl', '');
                // Check if this is a valid session
                if (claudeCheckSession(sessionId, workingDirectory)) {
                    return {
                        name: f,
                        sessionId: sessionId,
                        mtime: statSync(join(projectDir, f)).mtime.getTime()
                    };
                }
                return null;
            })
            .filter(f => f !== null)
            .sort((a, b) => b.mtime - a.mtime); // Most recent valid session first

        return files.length > 0 ? files[0].sessionId : null;
    } catch {
        return null;
    }
}