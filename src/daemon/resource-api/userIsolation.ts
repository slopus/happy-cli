/**
 * User Isolation Utilities
 *
 * Enforces per-user resource isolation for security.
 * Prevents cross-user access to files, commands, and resources.
 */

import { homedir } from 'os';
import { resolve, normalize } from 'path';
import { logger } from '@/ui/logger';

/**
 * Path restrictions for user isolation
 */
interface PathRestrictions {
  allowedPaths: string[];    // Paths user can access
  deniedPaths: string[];     // Paths user cannot access
}

/**
 * Get allowed and denied paths for a specific user
 */
export function getUserPathRestrictions(userId: string): PathRestrictions {
  const userHome = homedir();

  return {
    // Allow access to:
    // - User's Documents directory
    // - User's temp directory
    // - Current working directory (if within allowed paths)
    allowedPaths: [
      normalize(`${userHome}/Documents`),
      normalize(`/tmp/user-${userId}`),
      normalize(`${userHome}/.claude`), // For skills and commands
    ],

    // Deny access to:
    // - System directories
    // - Other users' home directories
    // - Root system paths
    deniedPaths: [
      normalize('/System'),
      normalize('/Library'),
      normalize('/private'),
      normalize('/usr'),
      normalize('/bin'),
      normalize('/sbin'),
      normalize('/etc'),
      normalize('/var'),
      // Deny other users' home directories (simplified check)
      normalize('/Users'), // Will need per-path validation
    ]
  };
}

/**
 * Validate if a path is accessible by the user
 *
 * @param path - Path to validate
 * @param userId - User identifier
 * @returns true if path is allowed, false otherwise
 */
export function isPathAllowedForUser(path: string, userId: string): boolean {
  try {
    // Normalize and resolve to absolute path
    const normalizedPath = normalize(resolve(path));
    const restrictions = getUserPathRestrictions(userId);
    const userHome = homedir();

    // Check denied paths first (deny takes precedence)
    for (const deniedPath of restrictions.deniedPaths) {
      if (normalizedPath.startsWith(deniedPath)) {
        // Special case: /Users - check if it's specifically another user's home
        if (deniedPath === normalize('/Users')) {
          // Allow access to current user's home directory
          if (normalizedPath.startsWith(normalize(userHome))) {
            continue; // This path is allowed
          }
        }

        logger.debug(`[USER ISOLATION] Path ${normalizedPath} denied for user ${userId}: matches denied path ${deniedPath}`);
        return false;
      }
    }

    // Check allowed paths
    for (const allowedPath of restrictions.allowedPaths) {
      if (normalizedPath.startsWith(allowedPath)) {
        logger.debug(`[USER ISOLATION] Path ${normalizedPath} allowed for user ${userId}`);
        return true;
      }
    }

    // If path doesn't match any allowed paths, deny access
    logger.debug(`[USER ISOLATION] Path ${normalizedPath} denied for user ${userId}: not in allowed paths`);
    return false;

  } catch (error) {
    // If path resolution fails, deny access
    logger.debug(`[USER ISOLATION] Path validation error for user ${userId}:`, error);
    return false;
  }
}

/**
 * Validate if a command execution is allowed for the user
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param cwd - Working directory
 * @param userId - User identifier
 * @returns Validation result with error message if invalid
 */
export function validateCommandForUser(
  command: string,
  args: string[],
  cwd: string | undefined,
  userId: string
): { valid: boolean; error?: string } {

  // Validate working directory if provided
  if (cwd) {
    if (!isPathAllowedForUser(cwd, userId)) {
      return {
        valid: false,
        error: `Working directory '${cwd}' is not accessible for user ${userId}`
      };
    }
  }

  // Validate command arguments don't reference restricted paths
  for (const arg of args) {
    // Check if argument looks like a file path
    if (arg.includes('/') || arg.includes('\\')) {
      try {
        const argPath = resolve(cwd || process.cwd(), arg);
        if (!isPathAllowedForUser(argPath, userId)) {
          return {
            valid: false,
            error: `Argument path '${arg}' is not accessible for user ${userId}`
          };
        }
      } catch (error) {
        // If path resolution fails, continue (might not be a path)
        continue;
      }
    }
  }

  return { valid: true };
}

/**
 * Validate if a skill is accessible by the user
 *
 * @param skillName - Name of the skill
 * @param userId - User identifier
 * @returns true if skill is accessible, false otherwise
 */
export function isSkillAllowedForUser(skillName: string, userId: string): boolean {
  // For now, all skills in ~/.claude/skills are accessible to all users
  // Future enhancement: implement per-user skill directories

  // Validate skill name doesn't contain path traversal
  if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
    logger.debug(`[USER ISOLATION] Skill '${skillName}' denied for user ${userId}: invalid name`);
    return false;
  }

  return true;
}

/**
 * Validate if a command is accessible by the user
 *
 * @param commandName - Name of the command
 * @param userId - User identifier
 * @returns true if command is accessible, false otherwise
 */
export function isCommandAllowedForUser(commandName: string, userId: string): boolean {
  // For now, all commands in ~/.claude/commands are accessible to all users
  // Future enhancement: implement per-user command permissions

  // Validate command name doesn't contain path traversal
  if (commandName.includes('..') || commandName.includes('/') || commandName.includes('\\')) {
    logger.debug(`[USER ISOLATION] Command '${commandName}' denied for user ${userId}: invalid name`);
    return false;
  }

  return true;
}

/**
 * Create user-specific audit log entry
 */
export interface UserAuditLog {
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Log user action for security audit
 */
export function logUserAction(log: UserAuditLog): void {
  logger.debug('[USER AUDIT]', {
    timestamp: new Date(log.timestamp).toISOString(),
    userId: log.userId,
    action: log.action,
    resource: log.resource,
    success: log.success,
    error: log.error,
    metadata: log.metadata
  });

  // Future enhancement: write to persistent audit log file
}
