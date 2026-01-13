/**
 * CodeBuddy Module
 * 
 * Main entry point for CodeBuddy Code integration.
 * Exports all public types, constants, and utilities.
 */

// Types
export type { 
  CodebuddyMode, 
  CodexMessagePayload,
  CodebuddyLocalConfig,
  CodebuddySettings,
  CodebuddyMemory,
  CodebuddyRule
} from './types';

// Constants
export {
  CODEBUDDY_API_KEY_ENV,
  CODEBUDDY_MODEL_ENV,
  DEFAULT_CODEBUDDY_MODEL,
  CODEBUDDY_CLI_COMMAND,
  CODEBUDDY_DIR,
  CODEBUDDY_USER_DIR,
  CODEBUDDY_MEMORY_FILE,
  CODEBUDDY_LOCAL_MEMORY_FILE,
  CODEBUDDY_SETTINGS_FILE,
  CODEBUDDY_LOCAL_SETTINGS_FILE,
  CODEBUDDY_RULES_DIR,
  CODEBUDDY_AGENTS_DIR,
  CHANGE_TITLE_INSTRUCTION,
  AVAILABLE_CODEBUDDY_MODELS,
  type CodebuddyModel
} from './constants';

// Configuration utilities
export {
  getUserCodebuddyDir,
  getProjectCodebuddyDir,
  readCodebuddyLocalConfig,
  readCodebuddySettings,
  readCodebuddyMemory,
  readCodebuddyRules,
  determineCodebuddyModel,
  saveCodebuddyModelToConfig,
  getInitialCodebuddyModel,
  getCodebuddyModelSource,
  buildSystemPrompt
} from './utils/config';

// Permission handler
export { CodebuddyPermissionHandler } from './utils/permissionHandler';
export type { PermissionResult, PendingRequest } from './utils/permissionHandler';

// Reasoning processor
export { CodebuddyReasoningProcessor } from './utils/reasoningProcessor';
export type { 
  ReasoningToolCall, 
  ReasoningToolResult, 
  ReasoningMessage, 
  ReasoningOutput 
} from './utils/reasoningProcessor';

// Diff processor
export { CodebuddyDiffProcessor } from './utils/diffProcessor';
export type { DiffToolCall, DiffToolResult } from './utils/diffProcessor';

// Options parser
export {
  hasIncompleteOptions,
  parseOptionsFromText,
  formatOptionsXml
} from './utils/optionsParser';

// Main entry point
export { runCodebuddy } from './runCodebuddy';
