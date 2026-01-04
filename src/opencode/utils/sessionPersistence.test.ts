/**
 * Session Persistence Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getLastSessionForDirectory,
  saveSessionForDirectory,
  SESSION_EXPIRY_DAYS,
} from './sessionPersistence';

describe('sessionPersistence', () => {
  let tempDir: string;
  let originalHappyHomeDir: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-persistence-test-'));
    originalHappyHomeDir = process.env.HAPPY_HOME_DIR;
    process.env.HAPPY_HOME_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalHappyHomeDir !== undefined) {
      process.env.HAPPY_HOME_DIR = originalHappyHomeDir;
    } else {
      delete process.env.HAPPY_HOME_DIR;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getLastSessionForDirectory', () => {
    it('should return null when no session exists', async () => {
      const result = await getLastSessionForDirectory('/some/project');
      expect(result).toBeNull();
    });

    it('should return saved session', async () => {
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_test123',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result).not.toBeNull();
      expect(result?.opencodeSessionId).toBe('ses_test123');
    });

    it('should return null for expired session', async () => {
      const expiredTime = Date.now() - (SESSION_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000;
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_expired',
        updatedAt: expiredTime,
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result).toBeNull();
    });
  });

  describe('saveSessionForDirectory', () => {
    it('should save session for new directory', async () => {
      await saveSessionForDirectory('/new/project', {
        opencodeSessionId: 'ses_new123',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/new/project');
      expect(result?.opencodeSessionId).toBe('ses_new123');
    });

    it('should update session for existing directory', async () => {
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_old',
        updatedAt: Date.now() - 1000,
      });

      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_new',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result?.opencodeSessionId).toBe('ses_new');
    });

    it('should preserve sessions for other directories', async () => {
      await saveSessionForDirectory('/project-a', {
        opencodeSessionId: 'ses_a',
        updatedAt: Date.now(),
      });

      await saveSessionForDirectory('/project-b', {
        opencodeSessionId: 'ses_b',
        updatedAt: Date.now(),
      });

      const resultA = await getLastSessionForDirectory('/project-a');
      const resultB = await getLastSessionForDirectory('/project-b');

      expect(resultA?.opencodeSessionId).toBe('ses_a');
      expect(resultB?.opencodeSessionId).toBe('ses_b');
    });
  });
});
