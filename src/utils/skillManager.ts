/**
 * Skill management utilities for Claude Code skills
 * Handles skill discovery, reading, and metadata extraction
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { logger } from '@/ui/logger';

export interface SkillMetadata {
  name: string;
  description?: string;
  license?: string;
  path: string;
  hasSkillMd: boolean;
  templates?: string[];
}

export interface SkillContent {
  metadata: SkillMetadata;
  skillMd?: string;
  templates: Record<string, string>;
}

/**
 * Get the Claude skills directory path
 */
export function getSkillsDirectory(): string {
  return path.join(os.homedir(), '.claude', 'skills');
}

/**
 * Check if a skill exists
 */
export async function skillExists(skillName: string): Promise<boolean> {
  try {
    const skillPath = path.join(getSkillsDirectory(), skillName);
    const stat = await fs.stat(skillPath);
    return stat.isDirectory() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * List all available skills
 */
export async function listSkills(): Promise<SkillMetadata[]> {
  const skillsDir = getSkillsDirectory();

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills: SkillMetadata[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const skillMeta = await getSkillMetadata(entry.name);
        if (skillMeta) {
          skills.push(skillMeta);
        }
      }
    }

    return skills;
  } catch (error) {
    logger.debug('[SKILL MANAGER] Failed to list skills:', error);
    return [];
  }
}

/**
 * Get metadata for a specific skill
 */
export async function getSkillMetadata(skillName: string): Promise<SkillMetadata | null> {
  const skillPath = path.join(getSkillsDirectory(), skillName);

  try {
    // Resolve symlinks
    const realPath = await fs.realpath(skillPath);
    const stat = await fs.stat(realPath);

    if (!stat.isDirectory()) {
      return null;
    }

    // Check for SKILL.md
    const skillMdPath = path.join(realPath, 'SKILL.md');
    let hasSkillMd = false;
    let description: string | undefined;
    let license: string | undefined;

    try {
      await fs.access(skillMdPath);
      hasSkillMd = true;

      // Try to extract metadata from SKILL.md frontmatter
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const descMatch = frontmatter.match(/description:\s*(.+)/);
        const licenseMatch = frontmatter.match(/license:\s*(.+)/);

        if (descMatch) description = descMatch[1].trim();
        if (licenseMatch) license = licenseMatch[1].trim();
      }
    } catch {
      // SKILL.md doesn't exist or can't be read
    }

    // List templates directory if it exists
    let templates: string[] = [];
    const templatesPath = path.join(realPath, 'templates');
    try {
      const templateEntries = await fs.readdir(templatesPath);
      templates = templateEntries;
    } catch {
      // No templates directory
    }

    return {
      name: skillName,
      description,
      license,
      path: realPath,
      hasSkillMd,
      templates
    };
  } catch (error) {
    logger.debug(`[SKILL MANAGER] Failed to get metadata for ${skillName}:`, error);
    return null;
  }
}

/**
 * Read full skill content including SKILL.md and templates
 */
export async function readSkillContent(skillName: string): Promise<SkillContent | null> {
  const metadata = await getSkillMetadata(skillName);

  if (!metadata) {
    return null;
  }

  const content: SkillContent = {
    metadata,
    templates: {}
  };

  // Read SKILL.md if it exists
  if (metadata.hasSkillMd) {
    try {
      const skillMdPath = path.join(metadata.path, 'SKILL.md');
      content.skillMd = await fs.readFile(skillMdPath, 'utf-8');
    } catch (error) {
      logger.debug(`[SKILL MANAGER] Failed to read SKILL.md for ${skillName}:`, error);
    }
  }

  // Read template files
  if (metadata.templates && metadata.templates.length > 0) {
    const templatesPath = path.join(metadata.path, 'templates');

    for (const templateFile of metadata.templates) {
      try {
        const templatePath = path.join(templatesPath, templateFile);
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        content.templates[templateFile] = templateContent;
      } catch (error) {
        logger.debug(`[SKILL MANAGER] Failed to read template ${templateFile}:`, error);
      }
    }
  }

  return content;
}

/**
 * Validate skill structure
 */
export async function validateSkill(skillName: string): Promise<{ valid: boolean; error?: string }> {
  if (!await skillExists(skillName)) {
    return { valid: false, error: 'Skill directory does not exist' };
  }

  const metadata = await getSkillMetadata(skillName);

  if (!metadata) {
    return { valid: false, error: 'Failed to read skill metadata' };
  }

  if (!metadata.hasSkillMd) {
    return { valid: false, error: 'Skill is missing SKILL.md file' };
  }

  return { valid: true };
}
