/**
 * CodeBuddy Types
 *
 * Centralized type definitions for CodeBuddy Code integration.
 * Based on CodeBuddy Code documentation and ACP protocol.
 */

import type { PermissionMode } from '@/api/types';

/**
 * Mode configuration for CodeBuddy messages
 */
export interface CodebuddyMode {
  permissionMode: PermissionMode;
  model?: string;
  originalUserMessage?: string; // Original user message without system prompt
}

/**
 * Codex message payload for sending messages to mobile app
 * (Compatible with existing mobile app protocol)
 */
export interface CodexMessagePayload {
  type: 'message';
  message: string;
  id: string;
  options?: string[];
}

/**
 * CodeBuddy local configuration structure
 */
export interface CodebuddyLocalConfig {
  token: string | null;
  model: string | null;
}

/**
 * CodeBuddy settings configuration (from .codebuddy/settings.json)
 */
export interface CodebuddySettings {
  permissions?: {
    allow?: string[];
    ask?: string[];
    deny?: string[];
    additionalDirectories?: string[];
    defaultMode?: string;
  };
  env?: Record<string, string>;
  model?: string;
  cleanupPeriodDays?: number;
  includeCoAuthoredBy?: boolean;
  hooks?: Record<string, unknown>;
}

/**
 * CodeBuddy memory file structure
 */
export interface CodebuddyMemory {
  /** Raw content of CODEBUDDY.md */
  content: string;
  /** Parsed sections */
  sections?: {
    title: string;
    items: string[];
  }[];
}

/**
 * Rule file with YAML frontmatter
 */
export interface CodebuddyRule {
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Whether to always apply this rule */
  alwaysApply: boolean;
  /** Glob pattern for triggering the rule */
  paths?: string;
  /** Rule content (markdown) */
  content: string;
  /** File path of the rule */
  filePath: string;
}
