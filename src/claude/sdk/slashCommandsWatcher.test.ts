/**
 * Tests for slash commands watcher
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startSlashCommandsWatcher } from './slashCommandsWatcher';

describe('slashCommandsWatcher', () => {
    let testDir: string;
    let commandsDir: string;
    let stopWatcher: (() => void) | undefined;

    beforeEach(async () => {
        // Create temporary test directory
        testDir = await mkdtemp(join(tmpdir(), 'slash-commands-test-'));
        commandsDir = join(testDir, '.claude', 'commands');
        await mkdir(commandsDir, { recursive: true });
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

    it('should detect when a new slash command is added', async () => {
        let changeDetected = false;
        let capturedCommands: string[] = [];

        // Start watcher
        stopWatcher = startSlashCommandsWatcher({
            cwd: testDir,
            onSlashCommandsChange: (commands) => {
                changeDetected = true;
                capturedCommands = commands;
            },
            debounceMs: 100
        });

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 200));

        // Add a new command file
        await writeFile(join(commandsDir, 'test-command.md'), '# Test Command\nDo something');

        // Wait for debounce + processing
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(changeDetected).toBe(true);
        expect(capturedCommands).toContain('/test-command');
    });

    it('should detect when a slash command is removed', async () => {
        // Create initial command
        await writeFile(join(commandsDir, 'remove-me.md'), '# Remove Me\nTest');

        let changeCount = 0;
        let capturedCommands: string[] = [];

        // Start watcher
        stopWatcher = startSlashCommandsWatcher({
            cwd: testDir,
            onSlashCommandsChange: (commands) => {
                changeCount++;
                capturedCommands = commands;
            },
            debounceMs: 100
        });

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 200));

        // Remove the command file
        await unlink(join(commandsDir, 'remove-me.md'));

        // Wait for debounce + processing
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(changeCount).toBeGreaterThan(0);
        expect(capturedCommands).not.toContain('/remove-me');
    });

    it('should handle nested directory structures', async () => {
        let capturedCommands: string[] = [];

        // Create nested directory
        const nestedDir = join(commandsDir, 'nested', 'deep');
        await mkdir(nestedDir, { recursive: true });

        // Start watcher
        stopWatcher = startSlashCommandsWatcher({
            cwd: testDir,
            onSlashCommandsChange: (commands) => {
                capturedCommands = commands;
            },
            debounceMs: 100
        });

        // Wait for watcher to initialize
        await new Promise(resolve => setTimeout(resolve, 200));

        // Add nested command
        await writeFile(join(nestedDir, 'nested-command.md'), '# Nested\nTest');

        // Wait for debounce + processing
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(capturedCommands).toContain('/nested/deep/nested-command');
    });

    it('should gracefully handle non-existent commands directory', async () => {
        // Remove the commands directory
        await rm(commandsDir, { recursive: true, force: true });

        let wasCalledWithEmptyArray = false;

        // Start watcher - should not crash
        stopWatcher = startSlashCommandsWatcher({
            cwd: testDir,
            onSlashCommandsChange: (commands) => {
                if (commands.length === 0) {
                    wasCalledWithEmptyArray = true;
                }
            },
            debounceMs: 100
        });

        // Wait a bit to ensure it doesn't crash
        await new Promise(resolve => setTimeout(resolve, 300));

        // The watcher should handle the missing directory gracefully
        expect(stopWatcher).toBeDefined();
    });
});
