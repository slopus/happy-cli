import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tests for Claude Code SDK utilities
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PATH_SEGMENTS synchronization', () => {
    it('should match between CJS (scripts/claude_code_paths.cjs) and TS (src/claude/sdk/utils.ts)', async () => {
        // Import the CJS module to get its PATH_SEGMENTS
        const cjsModulePath = join(__dirname, '../../../scripts/claude_code_paths.cjs');
        const cjsModule = await import(cjsModulePath);
        const cjsPathSegments = cjsModule.PATH_SEGMENTS;

        // Define the TS PATH_SEGMENTS (duplicated from src/claude/sdk/utils.ts)
        const tsPathSegments = [
            'cli.js',       // Standard location
            'bin/cli.js',   // Alternative bin location
            'dist/cli.js'   // Build output location
        ];

        // Verify they match
        expect(cjsPathSegments).toEqual(tsPathSegments);
        expect(cjsPathSegments.length).toBe(tsPathSegments.length);

        // Also verify individual elements for better error messages
        for (let i = 0; i < tsPathSegments.length; i++) {
            expect(cjsPathSegments[i]).toBe(tsPathSegments[i]);
        }
    });

    it('PATH_SEGMENTS should have expected structure', async () => {
        const cjsModulePath = join(__dirname, '../../../scripts/claude_code_paths.cjs');
        const cjsModule = await import(cjsModulePath);
        const pathSegments = cjsModule.PATH_SEGMENTS;

        // Verify it's an array with at least one entry
        expect(Array.isArray(pathSegments)).toBe(true);
        expect(pathSegments.length).toBeGreaterThan(0);

        // Verify all entries are strings
        pathSegments.forEach((segment: unknown) => {
            expect(typeof segment).toBe('string');
        });

        // Verify all entries end with .js
        pathSegments.forEach((segment: string) => {
            expect(segment.endsWith('.js')).toBe(true);
        });
    });
});
