/**
 * OpenCode constants - environment variables and defaults
 */

/** OpenCode config directory (standard XDG location) */
export const OPENCODE_CONFIG_DIR = '.config/opencode';

/** OpenCode config filename */
export const OPENCODE_CONFIG_FILE = 'config.json';

/** Common API key environment variables that OpenCode supports */
export const OPENCODE_API_KEY_ENVS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
] as const;
