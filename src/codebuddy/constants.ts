/**
 * CodeBuddy Constants
 * 
 * Centralized constants for CodeBuddy Code integration including environment variable names,
 * default values, and directory/file path patterns.
 */

import { trimIdent } from '@/utils/trimIdent';

/** Environment variable name for CodeBuddy API key */
export const CODEBUDDY_API_KEY_ENV = 'CODEBUDDY_API_KEY';

/** Environment variable name for CodeBuddy model selection */
export const CODEBUDDY_MODEL_ENV = 'CODEBUDDY_MODEL';

/** Default CodeBuddy model */
export const DEFAULT_CODEBUDDY_MODEL = 'claude-sonnet-4-20250514';

/** CodeBuddy CLI command */
export const CODEBUDDY_CLI_COMMAND = 'codebuddy';

/**
 * Directory names for CodeBuddy configuration
 * Based on CodeBuddy Code documentation
 */
export const CODEBUDDY_DIR = '.codebuddy';

/** User-level CodeBuddy directory */
export const CODEBUDDY_USER_DIR = '~/.codebuddy';

/** Memory file name */
export const CODEBUDDY_MEMORY_FILE = 'CODEBUDDY.md';

/** Local memory file name (not committed to git) */
export const CODEBUDDY_LOCAL_MEMORY_FILE = 'CODEBUDDY.local.md';

/** Settings file name */
export const CODEBUDDY_SETTINGS_FILE = 'settings.json';

/** Local settings file name */
export const CODEBUDDY_LOCAL_SETTINGS_FILE = 'settings.local.json';

/** Rules directory name */
export const CODEBUDDY_RULES_DIR = 'rules';

/** Agents directory name */
export const CODEBUDDY_AGENTS_DIR = 'agents';

/**
 * Instruction for changing chat title
 * Used in system prompts to instruct agents to call change_title function
 */
export const CHANGE_TITLE_INSTRUCTION = trimIdent(
  `Based on this message, call functions.happy__change_title to change chat session title that would represent the current task. If chat idea would change dramatically - call this function again to update the title.`
);

/**
 * Available CodeBuddy models
 */
export const AVAILABLE_CODEBUDDY_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514', 
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
] as const;

export type CodebuddyModel = typeof AVAILABLE_CODEBUDDY_MODELS[number];
