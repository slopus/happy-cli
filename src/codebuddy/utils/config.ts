/**
 * CodeBuddy Configuration Utilities
 * 
 * Utilities for reading and writing CodeBuddy Code configuration files,
 * including settings, memory files, and model settings.
 * 
 * Configuration hierarchy (from CodeBuddy Code docs):
 * 1. User settings: ~/.codebuddy/settings.json
 * 2. Project shared: .codebuddy/settings.json
 * 3. Project local: .codebuddy/settings.local.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '@/ui/logger';
import { 
  CODEBUDDY_MODEL_ENV, 
  DEFAULT_CODEBUDDY_MODEL,
  CODEBUDDY_DIR,
  CODEBUDDY_MEMORY_FILE,
  CODEBUDDY_LOCAL_MEMORY_FILE,
  CODEBUDDY_SETTINGS_FILE,
  CODEBUDDY_LOCAL_SETTINGS_FILE,
  CODEBUDDY_RULES_DIR
} from '../constants';
import type { CodebuddyLocalConfig, CodebuddySettings, CodebuddyMemory, CodebuddyRule } from '../types';

/**
 * Get user-level CodeBuddy directory path
 */
export function getUserCodebuddyDir(): string {
  return join(homedir(), CODEBUDDY_DIR);
}

/**
 * Get project-level CodeBuddy directory path
 */
export function getProjectCodebuddyDir(cwd: string = process.cwd()): string {
  return join(cwd, CODEBUDDY_DIR);
}

/**
 * Read CodeBuddy local configuration (token and model)
 */
export function readCodebuddyLocalConfig(): CodebuddyLocalConfig {
  let token: string | null = null;
  let model: string | null = null;
  
  // Try common CodeBuddy config locations
  const possiblePaths = [
    join(getUserCodebuddyDir(), 'config.json'),
    join(getUserCodebuddyDir(), 'auth.json'),
    join(getUserCodebuddyDir(), CODEBUDDY_SETTINGS_FILE),
  ];

  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        
        // Try different possible token field names
        if (!token) {
          const foundToken = config.access_token || config.token || config.apiKey || config.CODEBUDDY_API_KEY;
          if (foundToken && typeof foundToken === 'string') {
            token = foundToken;
            logger.debug(`[CodeBuddy] Found token in ${configPath}`);
          }
        }
        
        // Try to read model from config
        if (!model) {
          const foundModel = config.model || config.CODEBUDDY_MODEL;
          if (foundModel && typeof foundModel === 'string') {
            model = foundModel;
            logger.debug(`[CodeBuddy] Found model in ${configPath}: ${model}`);
          }
        }
      } catch (error) {
        logger.debug(`[CodeBuddy] Failed to read config from ${configPath}:`, error);
      }
    }
  }

  return { token, model };
}

/**
 * Read CodeBuddy settings from .codebuddy/settings.json
 * Merges user, project shared, and project local settings
 */
export function readCodebuddySettings(cwd: string = process.cwd()): CodebuddySettings {
  const settings: CodebuddySettings = {};
  
  // Order of loading (later overrides earlier):
  // 1. User settings
  // 2. Project shared settings
  // 3. Project local settings
  const settingsPaths = [
    join(getUserCodebuddyDir(), CODEBUDDY_SETTINGS_FILE),
    join(getProjectCodebuddyDir(cwd), CODEBUDDY_SETTINGS_FILE),
    join(getProjectCodebuddyDir(cwd), CODEBUDDY_LOCAL_SETTINGS_FILE),
  ];

  for (const settingsPath of settingsPaths) {
    if (existsSync(settingsPath)) {
      try {
        const fileSettings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        // Deep merge settings
        Object.assign(settings, fileSettings);
        logger.debug(`[CodeBuddy] Loaded settings from ${settingsPath}`);
      } catch (error) {
        logger.debug(`[CodeBuddy] Failed to read settings from ${settingsPath}:`, error);
      }
    }
  }

  return settings;
}

/**
 * Read CODEBUDDY.md memory file
 * Searches in multiple locations as per CodeBuddy Code documentation
 */
export function readCodebuddyMemory(cwd: string = process.cwd()): CodebuddyMemory | null {
  // Search order:
  // 1. User level: ~/.codebuddy/CODEBUDDY.md
  // 2. Project root: ./CODEBUDDY.md
  // 3. Project .codebuddy: ./.codebuddy/CODEBUDDY.md
  // Also check for local variants (CODEBUDDY.local.md)
  
  const memoryPaths = [
    join(getUserCodebuddyDir(), CODEBUDDY_MEMORY_FILE),
    join(cwd, CODEBUDDY_MEMORY_FILE),
    join(getProjectCodebuddyDir(cwd), CODEBUDDY_MEMORY_FILE),
  ];

  const localMemoryPaths = [
    join(cwd, CODEBUDDY_LOCAL_MEMORY_FILE),
    join(getProjectCodebuddyDir(cwd), CODEBUDDY_LOCAL_MEMORY_FILE),
  ];

  let combinedContent = '';

  // Read main memory files
  for (const memoryPath of memoryPaths) {
    if (existsSync(memoryPath)) {
      try {
        const content = readFileSync(memoryPath, 'utf-8');
        if (content.trim()) {
          combinedContent += content + '\n\n';
          logger.debug(`[CodeBuddy] Loaded memory from ${memoryPath}`);
        }
      } catch (error) {
        logger.debug(`[CodeBuddy] Failed to read memory from ${memoryPath}:`, error);
      }
    }
  }

  // Read local memory files
  for (const localPath of localMemoryPaths) {
    if (existsSync(localPath)) {
      try {
        const content = readFileSync(localPath, 'utf-8');
        if (content.trim()) {
          combinedContent += content + '\n\n';
          logger.debug(`[CodeBuddy] Loaded local memory from ${localPath}`);
        }
      } catch (error) {
        logger.debug(`[CodeBuddy] Failed to read local memory from ${localPath}:`, error);
      }
    }
  }

  if (!combinedContent.trim()) {
    return null;
  }

  return {
    content: combinedContent.trim(),
    sections: parseMemorySections(combinedContent),
  };
}

/**
 * Parse memory content into sections
 */
function parseMemorySections(content: string): { title: string; items: string[] }[] {
  const sections: { title: string; items: string[] }[] = [];
  const lines = content.split('\n');
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of lines) {
    // Check for markdown headers (## or ###)
    const headerMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { title: headerMatch[1], items: [] };
    } else if (currentSection) {
      // Check for list items (- or *)
      const itemMatch = line.match(/^[-*]\s+(.+)$/);
      if (itemMatch) {
        currentSection.items.push(itemMatch[1]);
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Read rules from .codebuddy/rules/ directory
 */
export function readCodebuddyRules(cwd: string = process.cwd()): CodebuddyRule[] {
  const rules: CodebuddyRule[] = [];
  
  // Check both user and project rules directories
  const rulesDirs = [
    join(getUserCodebuddyDir(), CODEBUDDY_RULES_DIR),
    join(getProjectCodebuddyDir(cwd), CODEBUDDY_RULES_DIR),
  ];

  for (const rulesDir of rulesDirs) {
    if (!existsSync(rulesDir)) {
      continue;
    }

    try {
      const { readdirSync, statSync } = require('fs');
      const files = readdirSync(rulesDir);
      
      for (const file of files) {
        const filePath = join(rulesDir, file);
        const stat = statSync(filePath);
        
        if (stat.isFile() && file.endsWith('.md')) {
          const rule = parseRuleFile(filePath);
          if (rule) {
            rules.push(rule);
          }
        } else if (stat.isDirectory()) {
          // Recursively read rules from subdirectories
          const subRules = readRulesFromDir(filePath);
          rules.push(...subRules);
        }
      }
    } catch (error) {
      logger.debug(`[CodeBuddy] Failed to read rules from ${rulesDir}:`, error);
    }
  }

  return rules;
}

/**
 * Read rules from a directory recursively
 */
function readRulesFromDir(dir: string): CodebuddyRule[] {
  const rules: CodebuddyRule[] = [];
  
  try {
    const { readdirSync, statSync } = require('fs');
    const files = readdirSync(dir);
    
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isFile() && file.endsWith('.md')) {
        const rule = parseRuleFile(filePath);
        if (rule) {
          rules.push(rule);
        }
      } else if (stat.isDirectory()) {
        const subRules = readRulesFromDir(filePath);
        rules.push(...subRules);
      }
    }
  } catch (error) {
    logger.debug(`[CodeBuddy] Failed to read rules from ${dir}:`, error);
  }

  return rules;
}

/**
 * Parse a rule file with YAML frontmatter
 */
function parseRuleFile(filePath: string): CodebuddyRule | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Default values
    let enabled = true;
    let alwaysApply = true;
    let paths: string | undefined;
    let ruleContent = content;

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      ruleContent = frontmatterMatch[2];

      // Parse simple YAML frontmatter
      const enabledMatch = frontmatter.match(/enabled:\s*(true|false)/);
      if (enabledMatch) {
        enabled = enabledMatch[1] === 'true';
      }

      const alwaysApplyMatch = frontmatter.match(/alwaysApply:\s*(true|false)/);
      if (alwaysApplyMatch) {
        alwaysApply = alwaysApplyMatch[1] === 'true';
      }

      const pathsMatch = frontmatter.match(/paths:\s*(.+)/);
      if (pathsMatch) {
        paths = pathsMatch[1].trim();
      }
    }

    return {
      enabled,
      alwaysApply,
      paths,
      content: ruleContent.trim(),
      filePath,
    };
  } catch (error) {
    logger.debug(`[CodeBuddy] Failed to parse rule file ${filePath}:`, error);
    return null;
  }
}

/**
 * Determine the model to use based on priority:
 * 1. Explicit model parameter (if provided)
 * 2. Environment variable (CODEBUDDY_MODEL)
 * 3. Local config file
 * 4. Default model
 */
export function determineCodebuddyModel(
  explicitModel: string | null | undefined,
  localConfig: CodebuddyLocalConfig
): string {
  if (explicitModel !== undefined) {
    if (explicitModel === null) {
      // Explicitly null - use env or default, skip local config
      return process.env[CODEBUDDY_MODEL_ENV] || DEFAULT_CODEBUDDY_MODEL;
    } else {
      // Model explicitly provided - use it
      return explicitModel;
    }
  } else {
    // No explicit model - check env var first, then local config, then default
    const envModel = process.env[CODEBUDDY_MODEL_ENV];
    logger.debug(`[CodeBuddy] Model selection: env[CODEBUDDY_MODEL]=${envModel}, localConfig.model=${localConfig.model}, DEFAULT=${DEFAULT_CODEBUDDY_MODEL}`);
    const model = envModel || localConfig.model || DEFAULT_CODEBUDDY_MODEL;
    logger.debug(`[CodeBuddy] Selected model: ${model}`);
    return model;
  }
}

/**
 * Save model to CodeBuddy config file
 */
export function saveCodebuddyModelToConfig(model: string): void {
  try {
    const configDir = getUserCodebuddyDir();
    const configPath = join(configDir, 'config.json');
    
    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    // Read existing config or create new one
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch (error) {
        logger.debug(`[CodeBuddy] Failed to read existing config, creating new one`);
        config = {};
      }
    }
    
    // Update model in config
    config.model = model;
    
    // Write config back
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.debug(`[CodeBuddy] Saved model "${model}" to ${configPath}`);
  } catch (error) {
    logger.debug(`[CodeBuddy] Failed to save model to config:`, error);
  }
}

/**
 * Get the initial model value for UI display
 */
export function getInitialCodebuddyModel(): string {
  const localConfig = readCodebuddyLocalConfig();
  return process.env[CODEBUDDY_MODEL_ENV] || localConfig.model || DEFAULT_CODEBUDDY_MODEL;
}

/**
 * Determine the source of the model for logging purposes
 */
export function getCodebuddyModelSource(
  explicitModel: string | null | undefined,
  localConfig: CodebuddyLocalConfig
): 'explicit' | 'env-var' | 'local-config' | 'default' {
  if (explicitModel !== undefined && explicitModel !== null) {
    return 'explicit';
  } else if (process.env[CODEBUDDY_MODEL_ENV]) {
    return 'env-var';
  } else if (localConfig.model) {
    return 'local-config';
  } else {
    return 'default';
  }
}

/**
 * Build system prompt from memory and rules
 */
export function buildSystemPrompt(cwd: string = process.cwd()): string {
  const parts: string[] = [];

  // Add memory content
  const memory = readCodebuddyMemory(cwd);
  if (memory?.content) {
    parts.push('# Project Context from CODEBUDDY.md\n\n' + memory.content);
  }

  // Add always-applied rules
  const rules = readCodebuddyRules(cwd);
  const alwaysApplyRules = rules.filter(r => r.enabled && r.alwaysApply);
  
  if (alwaysApplyRules.length > 0) {
    parts.push('# Project Rules\n\n' + alwaysApplyRules.map(r => r.content).join('\n\n---\n\n'));
  }

  return parts.join('\n\n---\n\n');
}
