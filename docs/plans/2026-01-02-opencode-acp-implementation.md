# OpenCode ACP Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenCode as the second ACP-compatible agent in Happy CLI, enabling remote control from the Happy mobile app.

**Architecture:** Factory pattern matching existing Gemini implementation - `createOpenCodeBackend()` creates an `AcpSdkBackend` that spawns `opencode acp`, with MCP server merging from both Happy and OpenCode configs.

**Tech Stack:** TypeScript, ACP SDK (@agentclientprotocol/sdk), Commander.js for CLI

---

## Task 1: OpenCode Constants

**Files:**
- Create: `src/opencode/constants.ts`

**Step 1: Create constants file**

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors related to constants.ts

**Step 3: Commit**

```bash
git add src/opencode/constants.ts
git commit -m "feat(opencode): add constants for OpenCode integration"
```

---

## Task 2: OpenCode Config Utilities

**Files:**
- Create: `src/opencode/utils/config.ts`

**Step 1: Create config utilities**

```typescript
/**
 * OpenCode configuration utilities
 *
 * Reads OpenCode's native config from ~/.config/opencode/config.json
 * and provides MCP server merging with Happy's config.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';
import { OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE } from '../constants';
import type { McpServerConfig } from '@/agent/AgentBackend';

/**
 * OpenCode config.json structure (partial - only what we need)
 */
export interface OpenCodeConfig {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

/**
 * Read OpenCode's native config file
 *
 * @returns Parsed config or empty object if not found/invalid
 */
export async function readOpenCodeConfig(): Promise<OpenCodeConfig> {
  const configPath = join(homedir(), OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE);

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as OpenCodeConfig;
    logger.debug('[OpenCode] Read config from:', configPath);
    return config;
  } catch (error) {
    // Config not found or invalid - return empty
    logger.debug('[OpenCode] No config found at:', configPath);
    return {};
  }
}

/**
 * Convert OpenCode MCP server format to Happy's format
 */
export function convertOpenCodeMcpServers(
  openCodeServers: OpenCodeConfig['mcpServers']
): Record<string, McpServerConfig> {
  if (!openCodeServers) return {};

  const result: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(openCodeServers)) {
    result[name] = {
      command: config.command,
      args: config.args,
      env: config.env,
    };
  }

  return result;
}

/**
 * Get merged MCP servers from OpenCode config and Happy config
 *
 * OpenCode's servers are loaded first, then Happy's overlay on top.
 * If both define the same server name, Happy's version wins.
 *
 * @param happyServers - MCP servers from Happy's configuration
 * @returns Merged MCP server configuration
 */
export async function getMergedMcpServers(
  happyServers?: Record<string, McpServerConfig>
): Promise<Record<string, McpServerConfig>> {
  const openCodeConfig = await readOpenCodeConfig();
  const openCodeServers = convertOpenCodeMcpServers(openCodeConfig.mcpServers);

  const merged = {
    ...openCodeServers,
    ...(happyServers ?? {}), // Happy takes precedence
  };

  logger.debug('[OpenCode] Merged MCP servers:', {
    fromOpenCode: Object.keys(openCodeServers),
    fromHappy: Object.keys(happyServers ?? {}),
    merged: Object.keys(merged),
  });

  return merged;
}
```

**Step 2: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/opencode/utils/config.ts
git commit -m "feat(opencode): add config utilities for MCP server merging"
```

---

## Task 3: OpenCode Backend Factory

**Files:**
- Create: `src/agent/acp/opencode.ts`
- Modify: `src/agent/acp/index.ts`

**Step 1: Create OpenCode backend factory**

```typescript
/**
 * OpenCode ACP Backend - OpenCode agent via ACP
 *
 * This module provides a factory function for creating an OpenCode backend
 * that communicates using the Agent Client Protocol (ACP).
 *
 * OpenCode supports ACP natively via the `opencode acp` command.
 */

import { AcpSdkBackend, type AcpSdkBackendOptions, type AcpPermissionHandler } from './AcpSdkBackend';
import type { AgentBackend, McpServerConfig } from '../AgentBackend';
import { agentRegistry, type AgentFactoryOptions } from '../AgentRegistry';
import { logger } from '@/ui/logger';

/**
 * Options for creating an OpenCode ACP backend
 */
export interface OpenCodeBackendOptions extends AgentFactoryOptions {
  /** Model to use (passed via --model flag) */
  model?: string;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;
}

/**
 * Create an OpenCode backend using ACP.
 *
 * OpenCode must be installed and available in PATH.
 * Uses the `opencode acp` command to enable ACP mode.
 *
 * @param options - Configuration options
 * @returns AgentBackend instance for OpenCode
 */
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  // Add model flag if specified
  if (options.model) {
    args.push('--model', options.model);
  }

  // Add working directory
  if (options.cwd) {
    args.push('--cwd', options.cwd);
  }

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
  };

  logger.debug('[OpenCode] Creating ACP SDK backend with options:', {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    model: options.model,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
  });

  return new AcpSdkBackend(backendOptions);
}

/**
 * Register OpenCode backend with the global agent registry.
 *
 * This function should be called during application initialization
 * to make the OpenCode agent available for use.
 */
export function registerOpenCodeAgent(): void {
  agentRegistry.register('opencode', (opts) => createOpenCodeBackend(opts));
  logger.debug('[OpenCode] Registered with agent registry');
}
```

**Step 2: Update ACP index exports**

Modify `src/agent/acp/index.ts`:

```typescript
/**
 * ACP Module - Agent Client Protocol implementations
 *
 * This module exports all ACP-related functionality including
 * the base AcpSdkBackend and agent-specific implementations.
 *
 * Uses the official @agentclientprotocol/sdk from Zed Industries.
 */

export { AcpSdkBackend, type AcpSdkBackendOptions } from './AcpSdkBackend';
export { createGeminiBackend, registerGeminiAgent, type GeminiBackendOptions } from './gemini';
export { createOpenCodeBackend, registerOpenCodeAgent, type OpenCodeBackendOptions } from './opencode';
```

**Step 3: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agent/acp/opencode.ts src/agent/acp/index.ts
git commit -m "feat(opencode): add OpenCode ACP backend factory"
```

---

## Task 4: Run OpenCode Entry Point

**Files:**
- Create: `src/opencode/runOpenCode.ts`
- Create: `src/opencode/index.ts`

**Step 1: Create runOpenCode entry point**

Look at `src/gemini/runGemini.ts` for reference patterns, then create:

```typescript
/**
 * OpenCode Runner - Main entry point for running OpenCode with Happy
 *
 * Orchestrates OpenCode sessions with remote control from Happy mobile app.
 */

import { createOpenCodeBackend } from '@/agent/acp/opencode';
import { getMergedMcpServers } from './utils/config';
import { logger } from '@/ui/logger';
import type { AcpPermissionHandler } from '@/agent/acp/AcpSdkBackend';
import type { McpServerConfig } from '@/agent/AgentBackend';

/**
 * Options for running OpenCode
 */
export interface RunOpenCodeOptions {
  /** Working directory */
  cwd: string;

  /** Model to use (e.g., 'claude-sonnet-4-20250514', 'gpt-4o') */
  model?: string;

  /** Initial prompt to send */
  initialPrompt?: string;

  /** MCP servers from Happy config */
  happyMcpServers?: Record<string, McpServerConfig>;

  /** Permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;

  /** Environment variables to pass to OpenCode */
  env?: Record<string, string>;
}

/**
 * Run OpenCode with Happy integration
 *
 * Creates an OpenCode backend via ACP and manages the session lifecycle.
 * Merges MCP servers from both Happy and OpenCode's native config.
 *
 * @param options - Configuration options
 * @returns Promise that resolves when the session ends
 */
export async function runOpenCode(options: RunOpenCodeOptions): Promise<void> {
  const { cwd, model, initialPrompt, happyMcpServers, permissionHandler, env } = options;

  logger.debug('[OpenCode] Starting with options:', {
    cwd,
    model,
    hasInitialPrompt: !!initialPrompt,
    happyMcpServerCount: happyMcpServers ? Object.keys(happyMcpServers).length : 0,
    hasPermissionHandler: !!permissionHandler,
  });

  // Merge MCP servers from OpenCode config and Happy config
  const mcpServers = await getMergedMcpServers(happyMcpServers);

  // Create OpenCode backend
  const backend = createOpenCodeBackend({
    cwd,
    model,
    mcpServers,
    permissionHandler,
    env,
  });

  // Start the session
  const { sessionId } = await backend.startSession(initialPrompt);

  logger.debug('[OpenCode] Session started:', sessionId);

  // Return the backend for external management (daemon integration)
  // The caller (daemon or CLI) manages the session lifecycle
  return;
}

/**
 * Check if OpenCode is installed and available
 *
 * @returns Promise<boolean> - true if OpenCode is available
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    await execAsync('opencode --version');
    return true;
  } catch {
    return false;
  }
}
```

**Step 2: Create index export**

```typescript
/**
 * OpenCode module - OpenCode integration for Happy CLI
 */

export { runOpenCode, isOpenCodeInstalled, type RunOpenCodeOptions } from './runOpenCode';
export { readOpenCodeConfig, getMergedMcpServers } from './utils/config';
export { OPENCODE_API_KEY_ENVS, OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_FILE } from './constants';
```

**Step 3: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/opencode/runOpenCode.ts src/opencode/index.ts
git commit -m "feat(opencode): add runOpenCode entry point"
```

---

## Task 5: CLI Command

**Files:**
- Create: `src/commands/opencode.ts`

**Step 1: Look at existing command structure**

Check `src/commands/gemini.ts` or `src/commands/connect.ts` for patterns.

**Step 2: Create OpenCode command**

```typescript
/**
 * OpenCode CLI Command
 *
 * Provides the `happy opencode` command for running OpenCode
 * with Happy remote control integration.
 */

import { Command } from 'commander';
import { runOpenCode, isOpenCodeInstalled } from '@/opencode';
import { logger } from '@/ui/logger';
import chalk from 'chalk';

/**
 * Create the opencode command
 */
export function createOpenCodeCommand(): Command {
  return new Command('opencode')
    .description('Run OpenCode agent with Happy remote control')
    .option('-m, --model <model>', 'Model to use (e.g., claude-sonnet-4-20250514, gpt-4o)')
    .option('-c, --cwd <dir>', 'Working directory', process.cwd())
    .option('-p, --prompt <prompt>', 'Initial prompt to send')
    .action(async (options: { model?: string; cwd: string; prompt?: string }) => {
      // Check if OpenCode is installed
      const installed = await isOpenCodeInstalled();
      if (!installed) {
        console.error(chalk.red('Error: OpenCode is not installed or not in PATH.'));
        console.error(chalk.yellow('Install with: curl -fsSL https://opencode.ai/install | bash'));
        process.exit(1);
      }

      logger.debug('[CLI] Running opencode command with options:', options);

      try {
        await runOpenCode({
          cwd: options.cwd,
          model: options.model,
          initialPrompt: options.prompt,
        });
      } catch (error) {
        logger.error('[CLI] OpenCode error:', error);
        console.error(chalk.red('Error running OpenCode:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
```

**Step 3: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/commands/opencode.ts
git commit -m "feat(opencode): add CLI command"
```

---

## Task 6: Register Command in Main Entry Point

**Files:**
- Modify: `src/index.ts`

**Step 1: Find where commands are registered**

Look for pattern like `program.addCommand(...)` or similar in `src/index.ts`.

**Step 2: Add OpenCode command registration**

Add import at top:
```typescript
import { createOpenCodeCommand } from '@/commands/opencode';
```

Add command registration (near other commands):
```typescript
program.addCommand(createOpenCodeCommand());
```

**Step 3: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 4: Test command appears in help**

Run: `./bin/happy.mjs --help`
Expected: Should show `opencode` in command list

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(opencode): register opencode command in CLI"
```

---

## Task 7: Register Agent in Daemon

**Files:**
- Modify: `src/daemon/run.ts` or wherever agents are registered

**Step 1: Find where Gemini agent is registered**

Search for `registerGeminiAgent` in the codebase to find the pattern.

**Step 2: Add OpenCode registration**

Add import:
```typescript
import { registerOpenCodeAgent } from '@/agent/acp/opencode';
```

Add registration call near `registerGeminiAgent()`:
```typescript
registerOpenCodeAgent();
```

**Step 3: Verify TypeScript compiles**

Run: `yarn build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/daemon/run.ts
git commit -m "feat(opencode): register OpenCode agent in daemon"
```

---

## Task 8: Integration Test

**Files:**
- Test manually (no new test file needed)

**Step 1: Build the project**

Run: `yarn build`
Expected: No errors

**Step 2: Test CLI help**

Run: `./bin/happy.mjs opencode --help`
Expected: Shows opencode command help with -m, -c, -p options

**Step 3: Test without OpenCode installed (error case)**

If OpenCode is NOT installed:
Run: `./bin/happy.mjs opencode`
Expected: Error message with install instructions

**Step 4: Test with OpenCode installed (if available)**

If OpenCode IS installed:
Run: `./bin/happy.mjs opencode --model gpt-4o -p "hello"`
Expected: OpenCode starts in ACP mode, processes prompt

**Step 5: Final commit if needed**

```bash
git add -A
git commit -m "feat(opencode): complete OpenCode ACP integration"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Constants | `src/opencode/constants.ts` |
| 2 | Config utilities | `src/opencode/utils/config.ts` |
| 3 | Backend factory | `src/agent/acp/opencode.ts`, `src/agent/acp/index.ts` |
| 4 | Run entry point | `src/opencode/runOpenCode.ts`, `src/opencode/index.ts` |
| 5 | CLI command | `src/commands/opencode.ts` |
| 6 | Register in main | `src/index.ts` |
| 7 | Register in daemon | `src/daemon/run.ts` |
| 8 | Integration test | Manual testing |
