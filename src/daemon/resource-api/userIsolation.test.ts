/**
 * Tests for User Isolation Security
 *
 * Validates that users cannot access each other's resources
 */

import { describe, it, expect } from 'vitest';
import {
  isPathAllowedForUser,
  validateCommandForUser,
  isSkillAllowedForUser,
  isCommandAllowedForUser
} from './userIsolation';

describe('User Isolation', () => {
  const userA = 'user-alice';
  const userB = 'user-bob';

  describe('Path Isolation', () => {
    it('should allow access to user Documents directory', () => {
      const userDocsPath = `${process.env.HOME}/Documents/project`;
      expect(isPathAllowedForUser(userDocsPath, userA)).toBe(true);
    });

    it('should allow access to user temp directory', () => {
      const userTempPath = `/tmp/user-${userA}/work`;
      expect(isPathAllowedForUser(userTempPath, userA)).toBe(true);
    });

    it('should deny access to system directories', () => {
      expect(isPathAllowedForUser('/System/Library', userA)).toBe(false);
      expect(isPathAllowedForUser('/Library/Preferences', userA)).toBe(false);
      expect(isPathAllowedForUser('/usr/bin', userA)).toBe(false);
      expect(isPathAllowedForUser('/etc/passwd', userA)).toBe(false);
    });

    it('should deny access to other user temp directories', () => {
      const otherUserTemp = `/tmp/user-${userB}/secret`;
      expect(isPathAllowedForUser(otherUserTemp, userA)).toBe(false);
    });

    it('should deny path traversal attempts', () => {
      const traversalPath = `${process.env.HOME}/Documents/../../../etc/passwd`;
      expect(isPathAllowedForUser(traversalPath, userA)).toBe(false);
    });

    it('should allow access to .claude directory', () => {
      const claudePath = `${process.env.HOME}/.claude/skills`;
      expect(isPathAllowedForUser(claudePath, userA)).toBe(true);
    });
  });

  describe('Command Validation', () => {
    it('should allow commands with safe paths', () => {
      const result = validateCommandForUser(
        'ls',
        ['-la'],
        `${process.env.HOME}/Documents`,
        userA
      );
      expect(result.valid).toBe(true);
    });

    it('should deny commands with restricted working directory', () => {
      const result = validateCommandForUser(
        'ls',
        [],
        '/System/Library',
        userA
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not accessible');
    });

    it('should deny commands with restricted path arguments', () => {
      const result = validateCommandForUser(
        'ls',
        ['/etc/passwd'],
        undefined,
        userA
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not accessible');
    });

    it('should allow commands with relative paths in allowed directory', () => {
      const result = validateCommandForUser(
        'ls',
        ['./subdirectory'],
        `${process.env.HOME}/Documents`,
        userA
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Skill Access Control', () => {
    it('should allow access to valid skill names', () => {
      expect(isSkillAllowedForUser('my-skill', userA)).toBe(true);
      expect(isSkillAllowedForUser('cloudflare-d1', userA)).toBe(true);
    });

    it('should deny access to skills with path traversal', () => {
      expect(isSkillAllowedForUser('../../../etc/passwd', userA)).toBe(false);
      expect(isSkillAllowedForUser('../../skill', userA)).toBe(false);
    });

    it('should deny access to skills with slashes', () => {
      expect(isSkillAllowedForUser('path/to/skill', userA)).toBe(false);
      expect(isSkillAllowedForUser('/absolute/path', userA)).toBe(false);
    });
  });

  describe('Command Access Control', () => {
    it('should allow access to valid command names', () => {
      expect(isCommandAllowedForUser('build', userA)).toBe(true);
      expect(isCommandAllowedForUser('analyze', userA)).toBe(true);
    });

    it('should deny access to commands with path traversal', () => {
      expect(isCommandAllowedForUser('../../../etc/passwd', userA)).toBe(false);
    });

    it('should deny access to commands with slashes', () => {
      expect(isCommandAllowedForUser('path/to/command', userA)).toBe(false);
    });
  });

  describe('Cross-User Isolation', () => {
    it('should prevent user A from accessing user B temp directory', () => {
      const userBTemp = `/tmp/user-${userB}/data`;
      expect(isPathAllowedForUser(userBTemp, userA)).toBe(false);
    });

    it('should allow both users to access their own temp directories', () => {
      const userATemp = `/tmp/user-${userA}/data`;
      const userBTemp = `/tmp/user-${userB}/data`;

      expect(isPathAllowedForUser(userATemp, userA)).toBe(true);
      expect(isPathAllowedForUser(userBTemp, userB)).toBe(true);
    });

    it('should prevent cross-user temp directory access', () => {
      const userATemp = `/tmp/user-${userA}/secret`;
      const userBTemp = `/tmp/user-${userB}/secret`;

      // User A cannot access User B's temp
      expect(isPathAllowedForUser(userBTemp, userA)).toBe(false);

      // User B cannot access User A's temp
      expect(isPathAllowedForUser(userATemp, userB)).toBe(false);
    });
  });
});
