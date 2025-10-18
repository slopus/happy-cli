/**
 * Tests for directory watcher
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDirectoryWatcher } from './startDirectoryWatcher';

describe('startDirectoryWatcher', () => {
    let testDir: string;
    let stopWatcher: (() => void) | undefined;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = await mkdtemp(join(tmpdir(), 'dir-watcher-test-'));
    });

    afterEach(async () => {
        // Stop watcher if it's running
        if (stopWatcher) {
            stopWatcher();
            stopWatcher = undefined;
        }

        // Clean up test directory
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should detect file creation', async () => {
        let changeDetected = false;

        stopWatcher = startDirectoryWatcher(
            testDir,
            () => {
                changeDetected = true;
            },
            { debounceMs: 50 }
        );

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create a file
        await writeFile(join(testDir, 'test.txt'), 'content');

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(changeDetected).toBe(true);
    });

    it('should debounce multiple rapid changes', async () => {
        let changeCount = 0;

        stopWatcher = startDirectoryWatcher(
            testDir,
            () => {
                changeCount++;
            },
            { debounceMs: 200 }
        );

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create multiple files rapidly
        await writeFile(join(testDir, 'file1.txt'), 'content1');
        await writeFile(join(testDir, 'file2.txt'), 'content2');
        await writeFile(join(testDir, 'file3.txt'), 'content3');

        // Wait for debounce period
        await new Promise(resolve => setTimeout(resolve, 300));

        // Should only trigger once due to debouncing
        expect(changeCount).toBe(1);
    });

    it('should watch nested directories when recursive is true', async () => {
        let changeDetected = false;

        stopWatcher = startDirectoryWatcher(
            testDir,
            () => {
                changeDetected = true;
            },
            { recursive: true, debounceMs: 50 }
        );

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create nested directory and file
        const nestedDir = join(testDir, 'nested');
        await mkdir(nestedDir);
        await writeFile(join(nestedDir, 'nested.txt'), 'content');

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 150));

        expect(changeDetected).toBe(true);
    });

    it('should stop watching when cleanup function is called', async () => {
        let changeCount = 0;

        stopWatcher = startDirectoryWatcher(
            testDir,
            () => {
                changeCount++;
            },
            { debounceMs: 50 }
        );

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create a file to trigger change
        await writeFile(join(testDir, 'before-stop.txt'), 'content');

        // Wait for debounce
        await new Promise(resolve => setTimeout(resolve, 150));

        const countBeforeStop = changeCount;

        // Stop the watcher
        stopWatcher();
        stopWatcher = undefined;

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create another file - should not trigger change
        await writeFile(join(testDir, 'after-stop.txt'), 'content');

        // Wait for debounce period
        await new Promise(resolve => setTimeout(resolve, 150));

        // Count should not have increased
        expect(changeCount).toBe(countBeforeStop);
    });
});
