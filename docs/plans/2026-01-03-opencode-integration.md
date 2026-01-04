# OpenCode Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate OpenCode as a first-class AI agent backend in Happy CLI, enabling mobile app control of OpenCode sessions with full feature parity to Claude Code integration.

**Architecture:** Happy CLI manages `opencode serve` HTTP server (localhost:4096), communicates via auto-generated TypeScript client from OpenAPI spec, subscribes to SSE events for real-time updates, and bridges OpenCode messages to Happy's existing AgentBackend interface.

**Tech Stack:** TypeScript, Node.js child_process, fetch API, Server-Sent Events (SSE), Vitest, OpenAPI 3.1 spec, @stablelib (crypto), existing Happy infrastructure (AgentBackend, ApiSession, WebSocket)

---

## Table of Contents

1. [Phase 1: Foundation - Server Management](#phase-1-foundation---server-management)
2. [Phase 2: HTTP Client & OpenAPI Integration](#phase-2-http-client--openapi-integration)
3. [Phase 3: Agent Backend Implementation](#phase-3-agent-backend-implementation)
4. [Phase 4: CLI Command Integration](#phase-4-cli-command-integration)
5. [Phase 5: Testing & Polish](#phase-5-testing--polish)

---

## Phase 1: Foundation - Server Management

### Task 1.1: Create OpenCode Directory Structure

**Files:**
- Create: `src/opencode/index.ts` (export barrel)
- Create: `src/opencode/types.ts`
- Create: `src/opencode/constants.ts`
- Create: `src/opencode/server.ts`
- Create: `src/opencode/__tests__/server.test.ts`

**Step 1: Write the failing test**

Create file: `src/opencode/__tests__/server.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeServerManager } from '../server';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const STATE_FILE = join(homedir(), '.happy-dev', 'opencode-server.json');

describe('OpenCodeServerManager', () => {
  beforeEach(() => {
    // Clean up state file before each test
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  });

  afterEach(() => {
    // Clean up state file after each test
    if (existsSync(STATE_FILE)) {
      unlinkSync(STATE_FILE);
    }
  });

  it('should detect if opencode binary exists', async () => {
    const manager = new OpenCodeServerManager();
    const hasBinary = await manager.checkOpenCodeBinary();
    expect(typeof hasBinary).toBe('boolean');
  });

  it('should get default server URL', () => {
    const manager = new OpenCodeServerManager();
    const url = manager.getServerUrl();
    expect(url.toString()).toBe('http://127.0.0.1:4096');
  });

  it('should read empty state when no state file exists', async () => {
    const manager = new OpenCodeServerManager();
    const state = await manager.readState();
    expect(state).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: FAIL with "Cannot find module '../server'"

**Step 3: Create type definitions**

Create file: `src/opencode/types.ts`

```typescript
/** OpenCode server state persisted to disk */
export interface OpenCodeServerState {
  /** Process ID of the running opencode serve process */
  pid: number;
  /** Port the server is listening on */
  port: number;
  /** Hostname the server is bound to */
  hostname: string;
  /** ISO timestamp when server was started */
  startedAt: string;
  /** ISO timestamp of last successful health check */
  lastHealthCheck: string;
  /** Current server status */
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  /** Error message if status is 'error' */
  error?: string;
}

/** Configuration for OpenCode server manager */
export interface OpenCodeServerConfig {
  /** Port to run server on (default: 4096) */
  port?: number;
  /** Hostname to bind to (default: 127.0.0.1) */
  hostname?: string;
  /** Path to opencode binary (default: 'opencode' from PATH) */
  binaryPath?: string;
  /** Health check timeout in milliseconds (default: 30000) */
  healthCheckTimeout?: number;
  /** Whether to disable mDNS (default: true for local integration) */
  disableMdns?: boolean;
}

/** Health check response from OpenCode server */
export interface OpenCodeHealthResponse {
  healthy: true;
  version: string;
}
```

**Step 4: Create constants**

Create file: `src/opencode/constants.ts`

```typescript
import { join } from 'path';
import { homedir } from 'os';

/** Default OpenCode server port */
export const DEFAULT_PORT = 4096;

/** Default OpenCode server hostname */
export const DEFAULT_HOSTNAME = '127.0.0.1';

/** Default opencode binary name */
export const DEFAULT_BINARY = 'opencode';

/** Default health check timeout (ms) */
export const DEFAULT_HEALTH_CHECK_TIMEOUT = 30000;

/** State file directory */
export const HAPPY_DEV_DIR = join(homedir(), '.happy-dev');

/** Server state file path */
export const SERVER_STATE_FILE = join(HAPPY_DEV_DIR, 'opencode-server.json');

/** Health check endpoint */
export const HEALTH_ENDPOINT = '/global/health';

/** Time to wait for server startup before failing (ms) */
export const SERVER_STARTUP_TIMEOUT = 60000;

/** Time to wait for graceful shutdown (ms) */
export const SERVER_SHUTDOWN_TIMEOUT = 5000;

/** Health check interval (ms) */
export const HEALTH_CHECK_INTERVAL = 30000;

/** Max restart retries */
export const MAX_RESTART_RETRIES = 3;
```

**Step 5: Implement minimal server manager skeleton**

Create file: `src/opencode/server.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '@/ui/logger';
import type {
  OpenCodeServerState,
  OpenCodeServerConfig,
  OpenCodeHealthResponse
} from './types';
import {
  SERVER_STATE_FILE,
  DEFAULT_PORT,
  DEFAULT_HOSTNAME,
  DEFAULT_BINARY,
  DEFAULT_HEALTH_CHECK_TIMEOUT,
  HEALTH_ENDPOINT,
  SERVER_STARTUP_TIMEOUT,
  SERVER_SHUTDOWN_TIMEOUT,
  HAPPY_DEV_DIR,
  MAX_RESTART_RETRIES
} from './constants';

export class OpenCodeServerManager {
  private config: Required<OpenCodeServerConfig>;
  private serverProcess: ChildProcess | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private restartCount = 0;

  constructor(config: OpenCodeServerConfig = {}) {
    this.config = {
      port: config.port ?? DEFAULT_PORT,
      hostname: config.hostname ?? DEFAULT_HOSTNAME,
      binaryPath: config.binaryPath ?? DEFAULT_BINARY,
      healthCheckTimeout: config.healthCheckTimeout ?? DEFAULT_HEALTH_CHECK_TIMEOUT,
      disableMdns: config.disableMdns ?? true,
    };
  }

  /**
   * Check if opencode binary exists in PATH
   */
  async checkOpenCodeBinary(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      return new Promise((resolve) => {
        const proc = spawn(this.config.binaryPath, ['--version'], {
          stdio: 'ignore',
          timeout: 5000,
        });
        proc.on('error', () => resolve(false));
        proc.on('exit', (code) => resolve(code === 0));
      });
    } catch {
      return false;
    }
  }

  /**
   * Get the server URL
   */
  getServerUrl(): URL {
    return new URL(`http://${this.config.hostname}:${this.config.port}`);
  }

  /**
   * Read server state from disk
   */
  async readState(): Promise<OpenCodeServerState | null> {
    try {
      if (!existsSync(SERVER_STATE_FILE)) {
        return null;
      }
      const content = readFileSync(SERVER_STATE_FILE, 'utf-8');
      return JSON.parse(content) as OpenCodeServerState;
    } catch (error) {
      logger.debug('[OpenCodeServer] Failed to read state file', { error });
      return null;
    }
  }

  /**
   * Write server state to disk
   */
  private async writeState(state: OpenCodeServerState): Promise<void> {
    try {
      const dir = join(homedir(), '.happy-dev');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(SERVER_STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
      logger.debug('[OpenCodeServer] Failed to write state file', { error });
    }
  }
}

// Export types
export type { OpenCodeServerState, OpenCodeServerConfig, OpenCodeHealthResponse };
```

**Step 6: Run tests to verify they pass**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: PASS

**Step 7: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): add server manager skeleton with types and tests"
```

---

### Task 1.2: Implement Server Health Check

**Files:**
- Modify: `src/opencode/server.ts`
- Test: `src/opencode/__tests__/server.test.ts`

**Step 1: Write the failing test**

Add to `src/opencode/__tests__/server.test.ts`:

```typescript
  it('should perform health check on running server', async () => {
    // This test requires opencode to be installed and running
    const manager = new OpenCodeServerManager();

    // Mock fetch to simulate server response
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ healthy: true, version: '0.0.3' }),
      } as Response)
    );

    const health = await manager.healthCheck();
    expect(health).toEqual({ healthy: true, version: '0.0.3' });

    vi.restoreAllMocks();
  });

  it('should return null when health check fails', async () => {
    const manager = new OpenCodeServerManager();

    // Mock fetch to simulate connection failure
    global.fetch = vi.fn(() =>
      Promise.reject(new Error('ECONNREFUSED'))
    );

    const health = await manager.healthCheck();
    expect(health).toBeNull();

    vi.restoreAllMocks();
  });
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: FAIL with "manager.healthCheck is not a function"

**Step 3: Implement health check method**

Add to `src/opencode/server.ts` in the `OpenCodeServerManager` class:

```typescript
  /**
   * Perform health check on OpenCode server
   */
  async healthCheck(): Promise<OpenCodeHealthResponse | null> {
    try {
      const url = new URL(HEALTH_ENDPOINT, this.getServerUrl());
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.healthCheckTimeout
      );

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.debug('[OpenCodeServer] Health check failed', {
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as OpenCodeHealthResponse;
      return data;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.debug('[OpenCodeServer] Health check timeout');
      } else {
        logger.debug('[OpenCodeServer] Health check error', { error });
      }
      return null;
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): add server health check method"
```

---

### Task 1.3: Implement Server Start

**Files:**
- Modify: `src/opencode/server.ts`
- Test: `src/opencode/__tests__/server.test.ts`

**Step 1: Write the failing test**

Add to `src/opencode/__tests__/server.test.ts`:

```typescript
  it('should start opencode serve process', async () => {
    const manager = new OpenCodeServerManager({ binaryPath: 'echo' }); // Use echo for testing

    const startPromise = manager.start();

    // Since we're using echo, it will exit immediately
    // The important thing is that it was spawned with correct args
    await startPromise;

    const state = await manager.readState();
    expect(state?.status).toBe('error'); // echo exits immediately
  }, 10000);
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: FAIL with "manager.start is not a function"

**Step 3: Implement start method**

Add to `src/opencode/server.ts`:

```typescript
  /**
   * Start the OpenCode server
   */
  async start(): Promise<void> {
    // Check if binary exists
    const hasBinary = await this.checkOpenCodeBinary();
    if (!hasBinary) {
      throw new Error(
        `OpenCode binary not found. Install from https://opencode.ai`
      );
    }

    // Check if already running
    const existingState = await this.readState();
    if (existingState) {
      const health = await this.healthCheck();
      if (health) {
        logger.debug('[OpenCodeServer] Server already running');
        return;
      }
      // Clean up stale state
      await this.cleanup();
    }

    // Build command arguments
    const args = ['serve'];
    args.push('--hostname', this.config.hostname);
    args.push('--port', this.config.port.toString());
    if (this.config.disableMdns) {
      args.push('--no-mdns');
    }

    logger.debug('[OpenCodeServer] Starting server', {
      binary: this.config.binaryPath,
      args,
    });

    // Spawn process
    this.serverProcess = spawn(this.config.binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    const pid = this.serverProcess.pid!;
    const startedAt = new Date().toISOString();

    // Write initial state
    await this.writeState({
      pid,
      port: this.config.port,
      hostname: this.config.hostname,
      startedAt,
      lastHealthCheck: startedAt,
      status: 'starting',
    });

    // Wait for health check
    await this.waitForHealthy();

    // Update state to running
    await this.writeState({
      pid,
      port: this.config.port,
      hostname: this.config.hostname,
      startedAt,
      lastHealthCheck: new Date().toISOString(),
      status: 'running',
    });

    // Start health check timer
    this.startHealthCheckTimer();

    logger.debug('[OpenCodeServer] Server started successfully', {
      pid,
      url: this.getServerUrl().toString(),
    });
  }

  /**
   * Wait for server to become healthy
   */
  private async waitForHealthy(): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT) {
      const health = await this.healthCheck();
      if (health) {
        logger.debug('[OpenCodeServer] Health check passed', { health });
        return;
      }

      // Check if process exited
      if (this.serverProcess && this.serverProcess.exitCode !== null) {
        throw new Error(
          `OpenCode server exited with code ${this.serverProcess.exitCode}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error('OpenCode server failed to start within timeout');
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.healthCheck();
      const state = await this.readState();

      if (!health && state?.status === 'running') {
        logger.debug('[OpenCodeServer] Health check failed, attempting restart');
        if (this.restartCount < MAX_RESTART_RETRIES) {
          this.restartCount++;
          await this.restart();
        } else {
          logger.error('[OpenCodeServer] Max restart retries exceeded');
          await this.stop();
        }
      } else if (health) {
        // Update health check timestamp
        if (state) {
          await this.writeState({
            ...state,
            lastHealthCheck: new Date().toISOString(),
          });
        }
        this.restartCount = 0; // Reset on successful health check
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Restart the server
   */
  private async restart(): Promise<void> {
    logger.debug('[OpenCodeServer] Restarting server');
    await this.cleanup();
    await this.start();
  }

  /**
   * Clean up server process and state
   */
  private async cleanup(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: PASS (with some warnings about echo exiting)

**Step 5: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): implement server start with health check and restart"
```

---

### Task 1.4: Implement Server Stop

**Files:**
- Modify: `src/opencode/server.ts`
- Test: `src/opencode/__tests__/server.test.ts`

**Step 1: Write the failing test**

Add to `src/opencode/__tests__/server.test.ts`:

```typescript
  it('should stop running server', async () => {
    const manager = new OpenCodeServerManager();

    // Manually create a mock state
    await manager['writeState']({
      pid: 12345, // Fake PID
      port: 4096,
      hostname: '127.0.0.1',
      startedAt: new Date().toISOString(),
      lastHealthCheck: new Date().toISOString(),
      status: 'running',
    });

    await manager.stop();

    const state = await manager.readState();
    expect(state).toBeNull();
  });
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: FAIL with "manager.stop is not a function"

**Step 3: Implement stop method**

Add to `src/opencode/server.ts`:

```typescript
  /**
   * Stop the OpenCode server
   */
  async stop(): Promise<void> {
    const state = await this.readState();
    if (!state) {
      logger.debug('[OpenCodeServer] No server state, nothing to stop');
      return;
    }

    logger.debug('[OpenCodeServer] Stopping server', { pid: state.pid });

    // Stop health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Try graceful shutdown via HTTP API first
    try {
      const url = new URL('/global/dispose', this.getServerUrl());
      await fetch(url.toString(), { method: 'POST' });

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.debug('[OpenCodeServer] Graceful shutdown failed', { error });
    }

    // Kill process if still running
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if still running
          if (this.serverProcess && this.serverProcess.exitCode === null) {
            this.serverProcess.kill('SIGKILL');
          }
          resolve();
        }, SERVER_SHUTDOWN_TIMEOUT);

        this.serverProcess!.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.serverProcess = null;
    }

    // Clean up state file
    try {
      if (existsSync(SERVER_STATE_FILE)) {
        unlinkSync(SERVER_STATE_FILE);
      }
    } catch (error) {
      logger.debug('[OpenCodeServer] Failed to delete state file', { error });
    }

    logger.debug('[OpenCodeServer] Server stopped');
  }

  /**
   * Ensure server is running, start if not
   */
  async ensureRunning(): Promise<void> {
    const state = await this.readState();
    if (state) {
      const health = await this.healthCheck();
      if (health) {
        return; // Already running
      }
      // Stale state, clean up
      await this.cleanup();
    }
    await this.start();
  }
```

**Step 4: Run tests to verify they pass**

Run: `yarn build && vitest run src/opencode/__tests__/server.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): implement server stop and ensureRunning methods"
```

---

### Task 1.5: Export and Barrel File

**Files:**
- Modify: `src/opencode/index.ts`

**Step 1: Create export barrel**

Create file: `src/opencode/index.ts`

```typescript
export { OpenCodeServerManager } from './server';
export type {
  OpenCodeServerState,
  OpenCodeServerConfig,
  OpenCodeHealthResponse
} from './types';
export * from './constants';
```

**Step 2: Commit**

```bash
git add src/opencode/index.ts
git commit -m "feat(opencode): add public API exports"
```

---

## Phase 2: HTTP Client & OpenAPI Integration

### Task 2.1: Generate OpenAPI Client

**Files:**
- Create: `scripts/generate-opencode-client.ts`
- Modify: `package.json`

**Step 1: Check OpenCode OpenAPI spec**

Run: `opencode serve --help` to verify the command exists.

Expected: Command help text showing serve options.

**Step 2: Start OpenCode server temporarily**

Run in separate terminal:
```bash
opencode serve --port 4096 &
sleep 3
curl http://localhost:4096/doc -o /tmp/opencode-openapi.json
```

**Step 3: Create generation script**

Create file: `scripts/generate-opencode-client.ts`

```typescript
#!/usr/bin/env tsx

import { writeFile } from 'fs/promises';
import { join } from 'path';

const OPENAPI_SPEC_URL = 'http://localhost:4096/doc';
const OUTPUT_DIR = join(__dirname, '../src/opencode/client/generated');

async function generateClient() {
  console.log('[Generate] Fetching OpenAPI spec from', OPENAPI_SPEC_URL);

  const response = await fetch(OPENAPI_SPEC_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
  }

  const spec = await response.json();
  console.log('[Generate] OpenAPI spec fetched');

  // For now, just save the spec
  // TODO: Use Stainless SDK or similar to generate TypeScript client
  const specPath = join(OUTPUT_DIR, 'openapi.json');
  await writeFile(specPath, JSON.stringify(spec, null, 2));

  console.log('[Generate] OpenAPI spec saved to', specPath);
  console.log('[Generate] Note: Full client generation requires Stainless SDK setup');
  console.log('[Generate] For now, we will implement typed client manually');
}

generateClient().catch(console.error);
```

**Step 4: Add to package.json scripts**

Add to `package.json` scripts section:
```json
"generate-opencode-client": "tsx scripts/generate-opencode-client.ts"
```

**Step 5: Commit**

```bash
git add scripts/ package.json
git commit -m "feat(opencode): add OpenAPI client generation script"
```

---

### Task 2.2: Implement OpenCode HTTP Client

**Files:**
- Create: `src/opencode/client/`
- Create: `src/opencode/client/index.ts`
- Create: `src/opencode/client/types.ts`
- Create: `src/opencode/client/httpClient.ts`
- Create: `src/opencode/client/__tests__/httpClient.test.ts`

**Step 1: Define client types**

Create file: `src/opencode/client/types.ts`

```typescript
/** OpenCode session information */
export interface OpenCodeSession {
  /** Unique session identifier */
  id: string;
  /** Working directory for this session */
  cwd: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActive: string;
}

/** Request to create a new session */
export interface CreateSessionRequest {
  /** Working directory */
  directory: string;
}

/** Request to send a prompt */
export interface SendPromptRequest {
  /** Session ID */
  sessionId: string;
  /** Prompt text */
  prompt: string;
}

/** Response from sending a prompt */
export interface SendPromptResponse {
  /** Message ID */
  messageId: string;
  /** Session ID */
  sessionId: string;
}

/** Permission request from OpenCode */
export interface OpenCodePermissionRequest {
  /** Permission request ID */
  id: string;
  /** Session ID */
  sessionID: string;
  /** Type of permission requested */
  permission: string;
  /** Tool call information */
  tool?: {
    /** Tool call ID */
    callID: string;
    /** Tool name */
    tool: string;
  };
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/** Permission reply options */
export type PermissionReply = 'once' | 'always' | 'reject';

/** OpenCode event types from SSE */
export type OpenCodeEvent =
  | { type: 'permission.asked'; properties: OpenCodePermissionRequest }
  | { type: 'message.part.updated'; properties: MessagePartUpdated }
  | { type: string; properties: Record<string, unknown> };

/** Message part updated event */
export interface MessagePartUpdated {
  /** Session ID */
  sessionID: string;
  /** Message ID */
  messageID: string;
  /** Part information */
  part: {
    /** Part ID */
    id: string;
    /** Part type */
    type: 'text' | 'tool' | 'image';
    /** Tool name if type is 'tool' */
    tool?: string;
    /** Call ID if tool call */
    callID?: string;
    /** Part state */
    state: {
      /** Status */
      status: 'pending' | 'running' | 'completed' | 'failed';
      /** Tool input */
      input?: Record<string, unknown>;
      /** Tool output */
      output?: string;
    };
  };
}

/** List sessions response */
export interface ListSessionsResponse {
  /** Array of sessions */
  sessions: OpenCodeSession[];
}
```

**Step 2: Implement HTTP client**

Create file: `src/opencode/client/httpClient.ts`

```typescript
import { logger } from '@/ui/logger';
import type {
  OpenCodeSession,
  CreateSessionRequest,
  SendPromptRequest,
  SendPromptResponse,
  ListSessionsResponse,
  OpenCodePermissionRequest,
  PermissionReply
} from './types';

export class OpenCodeClient {
  private baseUrl: URL;

  constructor(baseUrl: URL | string) {
    this.baseUrl = typeof baseUrl === 'string' ? new URL(baseUrl) : baseUrl;
  }

  /**
   * Get server health
   */
  async health(): Promise<{ healthy: true; version: string } | null> {
    try {
      const response = await fetch(new URL('/global/health', this.baseUrl));
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  /**
   * Create a new session
   */
  async createSession(request: CreateSessionRequest): Promise<OpenCodeSession> {
    const url = new URL('/session', this.baseUrl);
    url.searchParams.set('directory', request.directory);

    logger.debug('[OpenCodeClient] Creating session', { directory: request.directory });

    const response = await fetch(url.toString(), { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send a prompt to a session
   */
  async sendPrompt(request: SendPromptRequest): Promise<SendPromptResponse> {
    const url = new URL('/session/prompt', this.baseUrl);

    logger.debug('[OpenCodeClient] Sending prompt', {
      sessionId: request.sessionId
    });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: request.sessionId,
        prompt: request.prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send prompt: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List all sessions
   */
  async listSessions(directory?: string): Promise<ListSessionsResponse> {
    const url = new URL('/sessions', this.baseUrl);
    if (directory) {
      url.searchParams.set('directory', directory);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Reply to a permission request
   */
  async replyToPermission(
    permId: string,
    reply: PermissionReply
  ): Promise<void> {
    const url = new URL(`/permission/${permId}/reply`, this.baseUrl);

    logger.debug('[OpenCodeClient] Replying to permission', { permId, reply });

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reply to permission: ${response.statusText}`);
    }
  }
}
```

**Step 3: Write tests**

Create file: `src/opencode/client/__tests__/httpClient.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeClient } from '../httpClient';

describe('OpenCodeClient', () => {
  let client: OpenCodeClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new OpenCodeClient('http://localhost:4096');
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should check server health', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ healthy: true, version: '0.0.3' }),
    });

    const health = await client.health();
    expect(health).toEqual({ healthy: true, version: '0.0.3' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4096/global/health'
    );
  });

  it('should return null when health check fails', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const health = await client.health();
    expect(health).toBeNull();
  });

  it('should create a session', async () => {
    const mockSession = {
      id: 'session-123',
      cwd: '/test/dir',
      createdAt: '2025-01-03T00:00:00Z',
      lastActive: '2025-01-03T00:00:00Z',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockSession,
    });

    const session = await client.createSession({ directory: '/test/dir' });
    expect(session).toEqual(mockSession);
  });

  it('should send a prompt', async () => {
    const mockResponse = {
      messageId: 'msg-123',
      sessionId: 'session-123',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const response = await client.sendPrompt({
      sessionId: 'session-123',
      prompt: 'Hello',
    });

    expect(response).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4096/session/prompt',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Hello'),
      })
    );
  });
});
```

**Step 4: Run tests**

Run: `yarn build && vitest run src/opencode/client/__tests__/httpClient.test.ts`

Expected: PASS

**Step 5: Create client exports**

Create file: `src/opencode/client/index.ts`

```typescript
export { OpenCodeClient } from './httpClient';
export type * from './types';
```

**Step 6: Update main barrel**

Modify: `src/opencode/index.ts`

```typescript
export { OpenCodeServerManager } from './server';
export { OpenCodeClient } from './client';
export type {
  OpenCodeServerState,
  OpenCodeServerConfig,
  OpenCodeHealthResponse
} from './types';
export * from './constants';
export type * from './client/types';
```

**Step 7: Commit**

```bash
git add src/opencode/client/
git commit -m "feat(opencode): implement HTTP client with typed API"
```

---

### Task 2.3: Implement SSE Event Stream Parser

**Files:**
- Create: `src/opencode/client/sseParser.ts`
- Create: `src/opencode/client/__tests__/sseParser.test.ts`

**Step 1: Write the failing test**

Create file: `src/opencode/client/__tests__/sseParser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { EventStreamParser } from '../sseParser';

describe('EventStreamParser', () => {
  it('should parse SSE events', async () => {
    const parser = new EventStreamParser();

    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"type":"test","value":123}\n\n'));
        controller.close();
      },
    });

    const events: unknown[] = [];
    for await (const event of parser.parse(mockStream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'test', value: 123 });
  });

  it('should handle multiple events', async () => {
    const parser = new EventStreamParser();

    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"type":"event1"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"event2"}\n\n'));
        controller.close();
      },
    });

    const events: unknown[] = [];
    for await (const event of parser.parse(mockStream)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
  });

  it('should ignore keep-alive comments', async () => {
    const parser = new EventStreamParser();

    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"real"}\n\n'));
        controller.close();
      },
    });

    const events: unknown[] = [];
    for await (const event of parser.parse(mockStream)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'real' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/client/__tests__/sseParser.test.ts`

Expected: FAIL with "Cannot find module '../sseParser'"

**Step 3: Implement SSE parser**

Create file: `src/opencode/client/sseParser.ts`

```typescript
/**
 * Parser for Server-Sent Events (SSE) streams
 */
export class EventStreamParser {
  /**
   * Parse an SSE stream and yield parsed JSON objects
   */
  async*parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep incomplete data in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          // Skip comments (keep-alive)
          if (line.startsWith(':')) continue;

          // Parse data: lines
          const match = line.match(/^data:\s*(.+)$/);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              yield data as Record<string, unknown>;
            } catch (error) {
              // Skip malformed JSON
              console.error('[SSE Parser] Failed to parse JSON:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `yarn build && vitest run src/opencode/client/__tests__/sseParser.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/client/sseParser.ts
git commit -m "feat(opencode): add SSE event stream parser"
```

---

### Task 2.4: Implement Event Subscription

**Files:**
- Modify: `src/opencode/client/httpClient.ts`
- Test: `src/opencode/client/__tests__/httpClient.test.ts`

**Step 1: Add subscribe method to client**

Add to `src/opencode/client/httpClient.ts`:

```typescript
import type { OpenCodeEvent } from './types';
import { EventStreamParser } from './sseParser';

// In OpenCodeClient class, add:

  /**
   * Subscribe to server events via SSE
   */
  async *subscribeToEvents(
    directory?: string
  ): AsyncGenerator<OpenCodeEvent> {
    const url = new URL('/event', this.baseUrl);
    if (directory) {
      url.searchParams.set('directory', directory);
    }

    logger.debug('[OpenCodeClient] Subscribing to events', { directory });

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to subscribe to events: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const parser = new EventStreamParser();
    for await (const event of parser.parse(response.body)) {
      // Wrap in OpenCodeEvent format
      yield {
        type: event.type as string,
        properties: event,
      } as OpenCodeEvent;
    }
  }
```

**Step 2: Write test**

Add to `src/opencode/client/__tests__/httpClient.test.ts`:

```typescript
  it('should subscribe to events', async () => {
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"test","value":1}\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const events: unknown[] = [];
    for await (const event of client.subscribeToEvents()) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'test',
      properties: { type: 'test', value: 1 },
    });
  });
```

**Step 3: Run tests**

Run: `yarn build && vitest run src/opencode/client/__tests__/httpClient.test.ts`

Expected: PASS

**Step 4: Commit**

```bash
git add src/opencode/client/
git commit -m "feat(opencode): add SSE event subscription"
```

---

## Phase 3: Agent Backend Implementation

### Task 3.1: Implement OpenCode Backend

**Files:**
- Create: `src/opencode/OpenCodeBackend.ts`
- Create: `src/opencode/__tests__/OpenCodeBackend.test.ts`

**Step 1: Write the failing test**

Create file: `src/opencode/__tests__/OpenCodeBackend.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeBackend } from '../OpenCodeBackend';
import { OpenCodeClient } from '../client/httpClient';
import { OpenCodeServerManager } from '../server';

// Mock dependencies
vi.mock('../client/httpClient');
vi.mock('../server');

describe('OpenCodeBackend', () => {
  let backend: OpenCodeBackend;
  let mockClient: OpenCodeClient;
  let mockServer: OpenCodeServerManager;

  beforeEach(() => {
    mockClient = {
      createSession: vi.fn(),
      sendPrompt: vi.fn(),
      subscribeToEvents: vi.fn(),
      replyToPermission: vi.fn(),
    } as unknown as OpenCodeClient;

    mockServer = {
      ensureRunning: vi.fn(),
      getServerUrl: vi.fn(() => new URL('http://localhost:4096')),
    } as unknown as OpenCodeServerManager;

    backend = new OpenCodeBackend('/test/dir', mockClient, mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start a new session', async () => {
    vi.mocked(mockClient.createSession).mockResolvedValue({
      id: 'session-123',
      cwd: '/test/dir',
      createdAt: '2025-01-03T00:00:00Z',
      lastActive: '2025-01-03T00:00:00Z',
    });

    const result = await backend.startSession('Hello world');

    expect(result.sessionId).toBe('session-123');
    expect(mockServer.ensureRunning).toHaveBeenCalled();
    expect(mockClient.createSession).toHaveBeenCalledWith({
      directory: '/test/dir',
    });
  });

  it('should send prompt to existing session', async () => {
    vi.mocked(mockClient.sendPrompt).mockResolvedValue({
      messageId: 'msg-123',
      sessionId: 'session-123',
    });

    await backend.sendPrompt('session-123', 'Test prompt');

    expect(mockClient.sendPrompt).toHaveBeenCalledWith({
      sessionId: 'session-123',
      prompt: 'Test prompt',
    });
  });

  it('should emit messages via onMessage handler', async () => {
    const messages: unknown[] = [];
    backend.onMessage((msg) => messages.push(msg));

    // Simulate emitting a message
    backend['emitMessage']({
      type: 'model-output',
      fullText: 'Hello',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: 'model-output',
      fullText: 'Hello',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn build && vitest run src/opencode/__tests__/OpenCodeBackend.test.ts`

Expected: FAIL with "Cannot find module '../OpenCodeBackend'"

**Step 3: Implement backend**

Create file: `src/opencode/OpenCodeBackend.ts`

```typescript
import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { AgentBackend, AgentMessageHandler, StartSessionResult, SessionId } from '@/agent/AgentBackend';
import type { OpenCodeEvent } from './client/types';
import { OpenCodeClient } from './client';
import { OpenCodeServerManager } from './server';

export class OpenCodeBackend implements AgentBackend {
  private client: OpenCodeClient;
  private serverManager: OpenCodeServerManager;
  private cwd: string;
  private messageHandlers: AgentMessageHandler[] = [];
  private eventController: AbortController | null = null;
  private openCodeSessionId: string | null = null;

  constructor(
    cwd: string,
    client?: OpenCodeClient,
    serverManager?: OpenCodeServerManager
  ) {
    this.cwd = cwd;
    this.client = client ?? new OpenCodeClient('http://127.0.0.1:4096');
    this.serverManager = serverManager ?? new OpenCodeServerManager();
  }

  /**
   * Start a new OpenCode session
   */
  async startSession(initialPrompt?: string): Promise<StartSessionResult> {
    logger.debug('[OpenCodeBackend] Starting session', { cwd: this.cwd });

    // Ensure server is running
    await this.serverManager.ensureRunning();

    // Create OpenCode session
    const session = await this.client.createSession({
      directory: this.cwd,
    });

    this.openCodeSessionId = session.id;

    // Start event subscription
    this.startEventSubscription();

    // Send initial prompt if provided
    if (initialPrompt) {
      await this.sendPrompt(session.id, initialPrompt);
    }

    return {
      sessionId: session.id,
    };
  }

  /**
   * Send a prompt to an existing session
   */
  async sendPrompt(sessionId: SessionId, prompt: string): Promise<void> {
    logger.debug('[OpenCodeBackend] Sending prompt', { sessionId });

    await this.client.sendPrompt({
      sessionId,
      prompt,
    });
  }

  /**
   * Cancel the current operation
   */
  async cancel(sessionId: SessionId): Promise<void> {
    logger.debug('[OpenCodeBackend] Cancelling session', { sessionId });
    // TODO: Implement cancel via OpenCode API if available
  }

  /**
   * Register a message handler
   */
  onMessage(handler: AgentMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Remove a message handler
   */
  offMessage(handler: AgentMessageHandler): void {
    const index = this.messageHandlers.indexOf(handler);
    if (index > -1) {
      this.messageHandlers.splice(index, 1);
    }
  }

  /**
   * Respond to a permission request
   */
  async respondToPermission(requestId: string, approved: boolean): Promise<void> {
    await this.client.replyToPermission(
      requestId,
      approved ? 'once' : 'reject'
    );
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    logger.debug('[OpenCodeBackend] Disposing');

    // Stop event subscription
    if (this.eventController) {
      this.eventController.abort();
      this.eventController = null;
    }

    this.messageHandlers = [];
  }

  /**
   * Start SSE event subscription
   */
  private startEventSubscription(): void {
    this.eventController = new AbortController();

    (async () => {
      try {
        for await (const event of this.client.subscribeToEvents(this.cwd)) {
          await this.handleEvent(event);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          logger.debug('[OpenCodeBackend] Event subscription aborted');
        } else {
          logger.error('[OpenCodeBackend] Event subscription error', { error });
        }
      }
    })();
  }

  /**
   * Handle incoming OpenCode event
   */
  private async handleEvent(event: OpenCodeEvent): Promise<void> {
    logger.debug('[OpenCodeBackend] Received event', { type: event.type });

    const agentMessage = this.convertEventToAgentMessage(event);
    if (agentMessage) {
      this.emitMessage(agentMessage);
    }
  }

  /**
   * Convert OpenCode event to AgentMessage
   */
  private convertEventToAgentMessage(event: OpenCodeEvent): AgentMessage | null {
    switch (event.type) {
      case 'message.part.updated':
        return this.handleMessagePartUpdated(event.properties as any);

      case 'permission.asked':
        return this.handlePermissionAsked(event.properties as any);

      default:
        return null;
    }
  }

  /**
   * Handle message.part.updated event
   */
  private handleMessagePartUpdated(props: {
    part: { type: string; tool?: string; state: { status: string; output?: string } };
  }): AgentMessage | null {
    const { part } = props;

    if (part.type === 'text') {
      return {
        type: 'model-output',
        fullText: part.state.output || '',
      };
    }

    if (part.type === 'tool') {
      if (part.state.status === 'pending') {
        return {
          type: 'tool-call',
          toolName: part.tool || 'unknown',
          args: {},
          callId: randomUUID(),
        };
      }

      if (part.state.status === 'completed') {
        return {
          type: 'tool-result',
          toolName: part.tool || 'unknown',
          result: part.state.output,
          callId: randomUUID(),
        };
      }
    }

    return null;
  }

  /**
   * Handle permission.asked event
   */
  private handlePermissionAsked(props: {
    id: string;
    permission: string;
    tool?: { callID: string; tool: string };
  }): AgentMessage {
    return {
      type: 'permission-request',
      id: props.id,
      reason: props.permission,
      payload: props.tool || {},
    };
  }

  /**
   * Emit message to all handlers
   */
  private emitMessage(message: AgentMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        logger.error('[OpenCodeBackend] Handler error', { error });
      }
    }
  }
}
```

**Step 4: Run tests**

Run: `yarn build && vitest run src/opencode/__tests__/OpenCodeBackend.test.ts`

Expected: PASS (may need some adjustments to mock setup)

**Step 5: Update exports**

Modify: `src/opencode/index.ts`

```typescript
export { OpenCodeServerManager } from './server';
export { OpenCodeClient } from './client';
export { OpenCodeBackend } from './OpenCodeBackend';
export type {
  OpenCodeServerState,
  OpenCodeServerConfig,
  OpenCodeHealthResponse
} from './types';
export * from './constants';
export type * from './client/types';
```

**Step 6: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): implement AgentBackend interface"
```

---

## Phase 4: CLI Command Integration

### Task 4.1: Add OpenCode Command to CLI

**Files:**
- Modify: `src/index.ts`
- Create: `src/opencode/runOpenCode.ts`

**Step 1: Implement runOpenCode function**

Create file: `src/opencode/runOpenCode.ts`

```typescript
import { render } from 'ink';
import React from 'react';
import { ApiClient } from '@/api/api';
import { OpenCodeBackend } from './OpenCodeBackend';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { AgentState, Metadata } from '@/api/types';
import { initialMachineMetadata } from '@/daemon/run';
import { randomUUID } from 'node:crypto';
import { ApiSessionClient } from '@/api/apiSession';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import packageJson from '../../package.json';
import { startHappyServer } from '@/claude/utils/startHappyServer';

interface RunOpenCodeOptions {
  credentials: Credentials;
  cwd?: string;
  startedBy?: 'daemon' | 'terminal';
}

/**
 * Main entry point for the opencode command
 */
export async function runOpenCode(opts: RunOpenCodeOptions): Promise<void> {
  const { credentials, cwd = process.cwd(), startedBy = 'terminal' } = opts;

  logger.debug('[opencode] Starting with options', { cwd, startedBy });

  // Create API client
  const api = await ApiClient.create(credentials);

  // Get or create machine
  const settings = await readSettings();
  const machineId = settings?.machineId;

  if (!machineId) {
    console.error('[START] No machine ID found. Please run: happy auth');
    process.exit(1);
  }

  await api.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata,
  });

  // Create session
  const sessionTag = randomUUID();
  const { session, metadata, agentState } = await api.createSession({
    agentName: 'opencode',
    agentType: 'opencode',
    path: cwd,
    sessionTag,
    startedBy,
    happyVersion: packageJson.version,
  });

  logger.debug('[opencode] Session created', { sessionId: session.id });

  // Create API session client for server communication
  const apiSession = new ApiSessionClient(credentials.token, session);

  // Create OpenCode backend
  const backend = new OpenCodeBackend(cwd);

  // Register kill handler
  registerKillSessionHandler(session.id, apiSession, async () => {
    await backend.dispose();
  });

  // Notify daemon that session has started
  await notifyDaemonSessionStarted(session.id);

  // Wire backend messages to API session
  backend.onMessage((msg) => {
    apiSession.sendAgentMessage('opencode', msg);
  });

  // Start the session
  await backend.startSession();

  logger.debug('[opencode] Backend started');

  // Keep process alive
  await new Promise(() => {});
}
```

**Step 2: Add CLI command handler**

Modify: `src/index.ts` - add after the `gemini` command block:

```typescript
  } else if (subcommand === 'opencode') {
    // Handle opencode command
    try {
      const { runOpenCode } = await import('@/opencode/runOpenCode');

      const {
        credentials
      } = await authAndSetupMachineIfNeeded();

      await runOpenCode({ credentials, startedBy: 'terminal' });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
```

**Step 3: Test manually**

Run: `yarn build && node ./bin/happy.mjs opencode --help`

Expected: Should attempt to start OpenCode (may fail if not installed, which is OK for now)

**Step 4: Commit**

```bash
git add src/opencode/runOpenCode.ts src/index.ts
git commit -m "feat(opencode): add CLI command integration"
```

---

### Task 4.2: Add Session List and Switch Commands

**Files:**
- Create: `src/commands/opencode.ts`
- Modify: `src/index.ts`

**Step 1: Create opencode command handler**

Create file: `src/commands/opencode.ts`

```typescript
import { OpenCodeClient } from '@/opencode/client';
import { OpenCodeServerManager } from '@/opencode/server';
import { logger } from '@/ui/logger';
import chalk from 'chalk';

export async function handleOpenCodeCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'list') {
    await listSessions();
  } else if (subcommand === 'status') {
    await showStatus();
  } else if (subcommand === 'stop') {
    await stopServer();
  } else {
    console.error(chalk.red('Unknown opencode subcommand:', subcommand));
    console.log('Available: list, status, stop');
    process.exit(1);
  }
}

async function listSessions(): Promise<void> {
  const serverManager = new OpenCodeServerManager();
  await serverManager.ensureRunning();

  const client = new OpenCodeClient(serverManager.getServerUrl());
  const { sessions } = await client.listSessions();

  if (sessions.length === 0) {
    console.log('No active sessions');
    return;
  }

  console.log(chalk.bold('Active OpenCode sessions:'));
  for (const session of sessions) {
    console.log(`  ${session.id}`);
    console.log(`    Directory: ${session.cwd}`);
    console.log(`    Last active: ${session.lastActive}`);
  }
}

async function showStatus(): Promise<void> {
  const serverManager = new OpenCodeServerManager();
  const state = await serverManager.readState();

  if (!state) {
    console.log('Server: Not running');
    return;
  }

  console.log(chalk.bold('OpenCode Server Status:'));
  console.log(`  Status: ${state.status}`);
  console.log(`  URL: http://${state.hostname}:${state.port}`);
  console.log(`  PID: ${state.pid}`);
  console.log(`  Started: ${state.startedAt}`);
  console.log(`  Last health check: ${state.lastHealthCheck}`);

  const health = await serverManager.healthCheck();
  console.log(`  Health: ${health ? 'OK' : 'FAIL'}`);
}

async function stopServer(): Promise<void> {
  const serverManager = new OpenCodeServerManager();
  await serverManager.stop();
  console.log('OpenCode server stopped');
}
```

**Step 2: Add command to CLI**

Modify: `src/index.ts` - update the opencode block:

```typescript
  } else if (subcommand === 'opencode') {
    // Handle opencode subcommands
    const opencodeSubcommand = args[1];

    if (opencodeSubcommand === 'list' || opencodeSubcommand === 'status' || opencodeSubcommand === 'stop') {
      try {
        const { handleOpenCodeCommand } = await import('@/commands/opencode');
        await handleOpenCodeCommand(args.slice(1));
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
        if (process.env.DEBUG) {
          console.error(error);
        }
        process.exit(1);
      }
      return;
    }

    // Default: run opencode session
    try {
      const { runOpenCode } = await import('@/opencode/runOpenCode');

      const {
        credentials
      } = await authAndSetupMachineIfNeeded();

      await runOpenCode({ credentials, startedBy: 'terminal' });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
```

**Step 3: Test commands**

```bash
yarn build
node ./bin/happy.mjs opencode status
node ./bin/happy.mjs opencode list
```

**Step 4: Commit**

```bash
git add src/commands/opencode.ts src/index.ts
git commit -m "feat(opencode): add session list and status commands"
```

---

## Phase 5: Testing & Polish

### Task 5.1: Add Integration Tests

**Files:**
- Create: `src/opencode/__tests__/integration.test.ts`

**Step 1: Create integration test**

Create file: `src/opencode/__tests__/integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OpenCodeServerManager } from '../server';
import { OpenCodeClient } from '../client';
import { OpenCodeBackend } from '../OpenCodeBackend';
import { tmpdir } from 'os';
import { join } from 'path';

describe.runIf(process.env.INTEGRATION_TEST)('OpenCode Integration', () => {
  let serverManager: OpenCodeServerManager;
  let client: OpenCodeClient;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `happy-opencode-test-${Date.now()}`);

    serverManager = new OpenCodeServerManager();
    await serverManager.start();

    client = new OpenCodeClient(serverManager.getServerUrl());
  }, 30000);

  afterAll(async () => {
    await serverManager.stop();
  });

  it('should start server and pass health check', async () => {
    const health = await client.health();
    expect(health).toEqual({ healthy: true, version: expect.any(String) });
  });

  it('should create a session', async () => {
    const session = await client.createSession({ directory: testDir });
    expect(session.id).toBeDefined();
    expect(session.cwd).toBe(testDir);
  });

  it('should list sessions', async () => {
    await client.createSession({ directory: testDir });

    const { sessions } = await client.listSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some(s => s.cwd === testDir)).toBe(true);
  });

  it('should subscribe to events', async () => {
    const events: unknown[] = [];

    setTimeout(() => {
      // Stop collecting events after 2 seconds
      events.push('DONE');
    }, 2000);

    for await (const event of client.subscribeToEvents(testDir)) {
      if (events.length > 0 && events[events.length - 1] === 'DONE') break;
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(1); // At least the DONE marker
  }, 10000);
});
```

**Step 2: Update package.json**

Add to `package.json` scripts:
```json
"test:integration:opencode": "INTEGRATION_TEST=true vitest run src/opencode/__tests__/integration.test.ts"
```

**Step 3: Run integration test manually**

Note: This requires OpenCode to be installed

Run: `yarn test:integration:opencode`

**Step 4: Commit**

```bash
git add src/opencode/__tests__/integration.test.ts package.json
git commit -m "test(opencode): add integration tests"
```

---

### Task 5.2: Add Error Handling Edge Cases

**Files:**
- Modify: `src/opencode/server.ts`
- Modify: `src/opencode/OpenCodeBackend.ts`
- Test: `src/opencode/__tests__/server.test.ts`
- Test: `src/opencode/__tests__/OpenCodeBackend.test.ts`

**Step 1: Add server not found error handling**

Add test to `src/opencode/__tests__/server.test.ts`:

```typescript
  it('should throw helpful error when opencode not found', async () => {
    const manager = new OpenCodeServerManager({ binaryPath: 'nonexistent-binary-xyz' });

    await expect(manager.start()).rejects.toThrow('OpenCode binary not found');
  });
```

**Step 2: Add port conflict handling**

Add test to `src/opencode/__tests__/server.test.ts`:

```typescript
  it('should handle port already in use', async () => {
    const manager1 = new OpenCodeServerManager({ port: 9999 });
    const manager2 = new OpenCodeServerManager({ port: 9999 });

    // First server should start
    // Note: This test requires actual opencode binary
    try {
      await manager1.start();

      // Second server should detect existing server
      const health = await manager2.healthCheck();
      expect(health).toBeTruthy();
    } finally {
      await manager1.stop();
    }
  }, 15000);
```

**Step 3: Add permission timeout handling**

Add to `src/opencode/OpenCodeBackend.ts`:

```typescript
  private permissionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Handle permission.asked event with timeout
   */
  private handlePermissionAsked(props: {
    id: string;
    permission: string;
    tool?: { callID: string; tool: string };
  }): AgentMessage {
    const message: AgentMessage = {
      type: 'permission-request',
      id: props.id,
      reason: props.permission,
      payload: props.tool || {},
    };

    // Set timeout for auto-reject
    const timeout = setTimeout(() => {
      logger.debug('[OpenCodeBackend] Permission timeout, auto-rejecting', {
        permId: props.id,
      });
      this.respondToPermission(props.id, false).catch((error) => {
        logger.error('[OpenCodeBackend] Failed to auto-reject permission', { error });
      });
    }, 30000); // 30 second timeout

    this.permissionTimeouts.set(props.id, timeout);

    return message;
  }

  // Clear timeout when responding
  async respondToPermission(requestId: string, approved: boolean): Promise<void> {
    const timeout = this.permissionTimeouts.get(requestId);
    if (timeout) {
      clearTimeout(timeout);
      this.permissionTimeouts.delete(requestId);
    }

    await this.client.replyToPermission(
      requestId,
      approved ? 'once' : 'reject'
    );
  }
```

**Step 4: Commit**

```bash
git add src/opencode/
git commit -m "feat(opencode): add error handling for edge cases"
```

---

### Task 5.3: Add Documentation

**Files:**
- Create: `docs/opencode.md`
- Modify: `README.md`

**Step 1: Create OpenCode documentation**

Create file: `docs/opencode.md`

```markdown
# OpenCode Integration

Happy CLI supports OpenCode as an AI agent backend, enabling mobile app control of OpenCode sessions.

## Installation

First, install OpenCode:

```bash
npm install -g opencode
```

Or from source: https://github.com/sst/opencode

## Usage

### Start an OpenCode Session

```bash
happy opencode
```

### Manage Server

```bash
# Check server status
happy opencode status

# List active sessions
happy opencode list

# Stop the server
happy opencode stop
```

## Features

- ✅ Full agent control from mobile app
- ✅ File editing and reading
- ✅ Terminal/bash command execution
- ✅ Permission requests on mobile
- ✅ Real-time response streaming
- ✅ Session persistence
- ✅ Multi-session support

## Architecture

Happy manages the `opencode serve` HTTP server and communicates via:
- HTTP client for commands (create session, send prompt)
- Server-Sent Events (SSE) for real-time updates
- OpenAPI 3.1 spec for type safety

## Configuration

Environment variables:

- `HAPPY_OPENCODE_PORT` - Server port (default: 4096)
- `HAPPY_OPENCODE_HOSTNAME` - Bind address (default: 127.0.0.1)
- `HAPPY_OPENCODE_PATH` - Path to binary (default: 'opencode')

## Troubleshooting

**Server not starting:**
```bash
# Check if opencode is installed
opencode --version

# Check server status
happy opencode status
```

**Port already in use:**
```bash
# Use a different port
HAPPY_OPENCODE_PORT=4097 happy opencode
```

## Implementation Details

See `docs/plans/2026-01-03-opencode-integration.md` for the complete implementation plan.
```

**Step 2: Update README**

Add to main README.md:

```markdown
## AI Agent Backends

Happy supports multiple AI agent backends:

- **Claude Code** - `happy` (default)
- **OpenAI Codex** - `happy codex`
- **Google Gemini** - `happy gemini`
- **OpenCode** - `happy opencode` (requires [OpenCode](https://opencode.ai))

See [docs/opencode.md](docs/opencode.md) for OpenCode-specific documentation.
```

**Step 3: Commit**

```bash
git add docs/
git commit -m "docs(opencode): add usage documentation"
```

---

## Summary

This implementation plan provides:

1. ✅ **Server Management** - Auto-start/stop OpenCode serve process
2. ✅ **HTTP Client** - Type-safe API with OpenAPI spec
3. ✅ **SSE Events** - Real-time event streaming
4. ✅ **Agent Backend** - Full AgentBackend interface implementation
5. ✅ **CLI Integration** - `happy opencode` command with subcommands
6. ✅ **Testing** - Unit, integration, and manual tests
7. ✅ **Error Handling** - Edge cases and timeouts
8. ✅ **Documentation** - User-facing and technical docs

### File Structure

```
src/opencode/
├── __tests__/
│   ├── server.test.ts
│   ├── OpenCodeBackend.test.ts
│   └── integration.test.ts
├── client/
│   ├── __tests__/
│   │   ├── httpClient.test.ts
│   │   └── sseParser.test.ts
│   ├── generated/
│   │   └── openapi.json (future)
│   ├── httpClient.ts
│   ├── sseParser.ts
│   ├── types.ts
│   └── index.ts
├── constants.ts
├── types.ts
├── server.ts
├── OpenCodeBackend.ts
├── runOpenCode.ts
└── index.ts

src/commands/
└── opencode.ts

scripts/
└── generate-opencode-client.ts

docs/
├── opencode.md
└── plans/
    └── 2026-01-03-opencode-integration.md
```

### Next Steps

1. Run: `yarn build && yarn test` to verify all tests pass
2. Manually test with real OpenCode installation
3. Test mobile app integration
4. Beta testing with users
5. Iterate based on feedback
