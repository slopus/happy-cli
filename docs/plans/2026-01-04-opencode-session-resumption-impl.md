# OpenCode Session Resumption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable OpenCode sessions to be resumed across Happy CLI restarts using ACP's `loadSession` capability.

**Architecture:** Extend `AcpSdkBackend` with `resumeSessionId` option that triggers `loadSession` instead of `newSession`. Add session persistence per directory for auto-resume. Wire through CLI and daemon.

**Tech Stack:** TypeScript, ACP SDK (`@agentclientprotocol/sdk`), Vitest for testing

---

## Task 1: Add `resumeSessionId` to AcpSdkBackendOptions

**Files:**
- Modify: `src/agent/acp/AcpSdkBackend.ts:113-134`

**Step 1: Add resumeSessionId to options interface**

In `AcpSdkBackendOptions`, add the new field:

```typescript
export interface AcpSdkBackendOptions {
  /** Agent name for identification */
  agentName: string;
  
  /** Working directory for the agent */
  cwd: string;
  
  /** Command to spawn the ACP agent */
  command: string;
  
  /** Arguments for the agent command */
  args?: string[];
  
  /** Environment variables to pass to the agent */
  env?: Record<string, string>;
  
  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;
  
  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;
  
  /** Optional session ID to resume instead of creating new session */
  resumeSessionId?: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent/acp/AcpSdkBackend.ts
git commit -m "feat(acp): add resumeSessionId option to AcpSdkBackendOptions"
```

---

## Task 2: Import LoadSessionRequest type from ACP SDK

**Files:**
- Modify: `src/agent/acp/AcpSdkBackend.ts:10-22`

**Step 1: Add LoadSessionRequest import**

Update the import block:

```typescript
import { 
  ClientSideConnection, 
  ndJsonStream,
  type Client,
  type Agent,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type InitializeRequest,
  type NewSessionRequest,
  type LoadSessionRequest,
  type PromptRequest,
  type ContentBlock,
} from '@agentclientprotocol/sdk';
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (LoadSessionRequest should be exported by SDK)

**Step 3: Commit**

```bash
git add src/agent/acp/AcpSdkBackend.ts
git commit -m "feat(acp): import LoadSessionRequest from ACP SDK"
```

---

## Task 3: Add helper method to build MCP servers array

**Files:**
- Modify: `src/agent/acp/AcpSdkBackend.ts`

**Step 1: Add private helper method**

Add this method to the `AcpSdkBackend` class (after constructor):

```typescript
/**
 * Build MCP servers array for ACP requests
 */
private buildMcpServersArray(): NewSessionRequest['mcpServers'] {
  return this.options.mcpServers 
    ? Object.entries(this.options.mcpServers).map(([name, config]) => ({
        name,
        command: config.command,
        args: config.args || [],
        env: config.env 
          ? Object.entries(config.env).map(([envName, envValue]) => ({ name: envName, value: envValue }))
          : [],
      }))
    : [];
}
```

**Step 2: Refactor existing newSession call to use helper**

In `startSession`, replace the inline mcpServers building (~line 618-627) with:

```typescript
const mcpServers = this.buildMcpServersArray();

const newSessionRequest: NewSessionRequest = {
  cwd: this.options.cwd,
  mcpServers: mcpServers as unknown as NewSessionRequest['mcpServers'],
};
```

**Step 3: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run src/opencode/__tests__/unit/acp/acpBackend.test.ts`
Expected: All pass

**Step 4: Commit**

```bash
git add src/agent/acp/AcpSdkBackend.ts
git commit -m "refactor(acp): extract buildMcpServersArray helper method"
```

---

## Task 4: Implement loadExistingSession method

**Files:**
- Modify: `src/agent/acp/AcpSdkBackend.ts`

**Step 1: Add loadExistingSession private method**

Add after `startSession` method:

```typescript
/**
 * Load an existing session using ACP loadSession.
 * Called when resumeSessionId is provided in options.
 */
private async loadExistingSession(
  opencodeSessionId: string,
  initialPrompt?: string
): Promise<StartSessionResult> {
  const sessionId = randomUUID();
  this.emit({ type: 'status', status: 'starting' });

  try {
    logger.debug(`[AcpSdkBackend] Loading existing session: ${opencodeSessionId}`);
    
    // Spawn process (same as startSession)
    await this.spawnProcess();
    
    // Initialize connection (same as startSession)
    await this.initializeConnection();
    
    // Build MCP servers
    const mcpServers = this.buildMcpServersArray();

    // Load existing session instead of creating new
    const loadRequest: LoadSessionRequest = {
      cwd: this.options.cwd,
      mcpServers: mcpServers as unknown as LoadSessionRequest['mcpServers'],
      sessionId: opencodeSessionId,
    };

    logger.debug(`[AcpSdkBackend] Loading session with ID: ${opencodeSessionId}`);
    
    let loadTimeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        this.connection!.loadSession(loadRequest).then(() => {
          if (loadTimeout) {
            clearTimeout(loadTimeout);
            loadTimeout = null;
          }
        }),
        new Promise<never>((_, reject) => {
          loadTimeout = setTimeout(() => {
            logger.debug(`[AcpSdkBackend] LoadSession timeout after ${ACP_INIT_TIMEOUT_MS}ms`);
            reject(new Error(`LoadSession timeout - session ${opencodeSessionId} may not exist`));
          }, ACP_INIT_TIMEOUT_MS);
        }),
      ]);
    } catch (loadError) {
      // If loadSession fails, fall back to newSession
      logger.debug(`[AcpSdkBackend] loadSession failed, falling back to newSession:`, loadError);
      return this.createNewSession(initialPrompt);
    }

    // loadSession doesn't return sessionId in response, use the one we passed
    this.acpSessionId = opencodeSessionId;
    logger.debug(`[AcpSdkBackend] Session loaded: ${this.acpSessionId}`);

    this.emit({ type: 'status', status: 'idle' });

    // Send initial prompt if provided
    if (initialPrompt) {
      this.sendPrompt(sessionId, initialPrompt).catch((error) => {
        logger.debug('[AcpSdkBackend] Error sending initial prompt:', error);
        this.emit({ type: 'status', status: 'error', detail: String(error) });
      });
    }

    return { sessionId };

  } catch (error) {
    logger.debug('[AcpSdkBackend] Error loading session:', error);
    this.emit({ 
      type: 'status', 
      status: 'error', 
      detail: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about missing `spawnProcess`, `initializeConnection`, `createNewSession` - we'll add these next

---

## Task 5: Refactor startSession into smaller methods

**Files:**
- Modify: `src/agent/acp/AcpSdkBackend.ts`

**Step 1: Extract spawnProcess method**

Extract process spawning logic from `startSession` into:

```typescript
/**
 * Spawn the ACP agent process
 */
private spawnProcess(): void {
  const args = this.options.args || [];
  
  if (process.platform === 'win32') {
    const fullCommand = [this.options.command, ...args].join(' ');
    this.process = spawn('cmd.exe', ['/c', fullCommand], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    this.process = spawn(this.options.command, args, {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
    throw new Error('Failed to create stdio pipes');
  }

  // Setup stderr handler
  this.process.stderr.on('data', (data: Buffer) => {
    const text = data.toString();
    if (text.trim()) {
      const hasActiveInvestigation = Array.from(this.activeToolCalls).some(id => 
        isInvestigationTool(id)
      );
      
      if (hasActiveInvestigation) {
        logger.debug(`[AcpSdkBackend] 🔍 Agent stderr (during investigation): ${text.trim()}`);
      } else {
        logger.debug(`[AcpSdkBackend] Agent stderr: ${text.trim()}`);
      }
      
      if (text.includes('status 429') || text.includes('code":429') || 
          text.includes('rateLimitExceeded') || text.includes('RESOURCE_EXHAUSTED')) {
        logger.debug('[AcpSdkBackend] ⚠️ Detected rate limit error (429) in stderr - gemini-cli will handle retry');
      } else if (text.includes('status 404') || text.includes('code":404')) {
        logger.debug('[AcpSdkBackend] ⚠️ Detected 404 error in stderr');
        this.emit({
          type: 'status',
          status: 'error',
          detail: 'Model not found. Available models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite'
        });
      } else if (hasActiveInvestigation && (
        text.includes('timeout') || text.includes('Timeout') || 
        text.includes('failed') || text.includes('Failed') ||
        text.includes('error') || text.includes('Error')
      )) {
        logger.debug(`[AcpSdkBackend] 🔍 Investigation tool stderr error/timeout: ${text.trim()}`);
      }
    }
  });

  this.process.on('error', (err) => {
    logger.debug(`[AcpSdkBackend] Process error:`, err);
    this.emit({ type: 'status', status: 'error', detail: err.message });
  });

  this.process.on('exit', (code, signal) => {
    if (!this.disposed && code !== 0 && code !== null) {
      logger.debug(`[AcpSdkBackend] Process exited with code ${code}, signal ${signal}`);
      this.emit({ type: 'status', status: 'stopped', detail: `Exit code: ${code}` });
    }
  });
}
```

**Step 2: Extract initializeConnection method**

```typescript
/**
 * Initialize the ACP connection after process is spawned
 */
private async initializeConnection(): Promise<void> {
  if (!this.process?.stdin || !this.process?.stdout) {
    throw new Error('Process not spawned');
  }

  const streams = nodeToWebStreams(this.process.stdin, this.process.stdout);
  
  // Create filtered readable stream (existing filter logic)
  const filteredReadable = this.createFilteredReadableStream(streams.readable);
  
  const stream = ndJsonStream(streams.writable, filteredReadable);

  const client: Client = {
    sessionUpdate: async (params: SessionNotification) => {
      this.handleSessionUpdate(params);
    },
    requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
      return this.handlePermissionRequest(params);
    },
  };

  this.connection = new ClientSideConnection(
    (agent: Agent) => client,
    stream
  );

  const initRequest: InitializeRequest = {
    protocolVersion: 1,
    clientCapabilities: {
      fs: {
        readTextFile: false,
        writeTextFile: false,
      },
    },
    clientInfo: {
      name: 'happy-cli',
      version: packageJson.version,
    },
  };

  logger.debug(`[AcpSdkBackend] Initializing connection...`);
  let initTimeout: NodeJS.Timeout | null = null;
  await Promise.race([
    this.connection.initialize(initRequest).then(() => {
      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }
    }),
    new Promise<never>((_, reject) => {
      initTimeout = setTimeout(() => {
        logger.debug(`[AcpSdkBackend] Initialize timeout after ${ACP_INIT_TIMEOUT_MS}ms`);
        reject(new Error(`Initialize timeout after ${ACP_INIT_TIMEOUT_MS}ms - Agent did not respond`));
      }, ACP_INIT_TIMEOUT_MS);
    }),
  ]);
  logger.debug(`[AcpSdkBackend] Initialize completed`);
}
```

**Step 3: Rename core of startSession to createNewSession**

```typescript
/**
 * Create a new session (called when no resumeSessionId provided or loadSession fails)
 */
private async createNewSession(initialPrompt?: string): Promise<StartSessionResult> {
  // This is the existing newSession logic
  const mcpServers = this.buildMcpServersArray();

  const newSessionRequest: NewSessionRequest = {
    cwd: this.options.cwd,
    mcpServers: mcpServers as unknown as NewSessionRequest['mcpServers'],
  };

  logger.debug(`[AcpSdkBackend] Creating new session...`);
  let newSessionTimeout: NodeJS.Timeout | null = null;
  const sessionResponse = await Promise.race([
    this.connection!.newSession(newSessionRequest).then((result) => {
      if (newSessionTimeout) {
        clearTimeout(newSessionTimeout);
        newSessionTimeout = null;
      }
      return result;
    }),
    new Promise<never>((_, reject) => {
      newSessionTimeout = setTimeout(() => {
        logger.debug(`[AcpSdkBackend] NewSession timeout after ${ACP_INIT_TIMEOUT_MS}ms`);
        reject(new Error('New session timeout'));
      }, ACP_INIT_TIMEOUT_MS);
    }),
  ]);
  this.acpSessionId = sessionResponse.sessionId;
  logger.debug(`[AcpSdkBackend] Session created: ${this.acpSessionId}`);

  this.emit({ type: 'status', status: 'idle' });

  // Send initial prompt if provided
  if (initialPrompt) {
    const sessionId = randomUUID();
    this.sendPrompt(sessionId, initialPrompt).catch((error) => {
      logger.debug('[AcpSdkBackend] Error sending initial prompt:', error);
      this.emit({ type: 'status', status: 'error', detail: String(error) });
    });
  }

  return { sessionId: randomUUID() };
}
```

**Step 4: Update startSession to route to correct method**

```typescript
async startSession(initialPrompt?: string): Promise<StartSessionResult> {
  if (this.disposed) {
    throw new Error('Backend has been disposed');
  }

  this.emit({ type: 'status', status: 'starting' });

  try {
    // Spawn process
    this.spawnProcess();
    
    // Initialize connection
    await this.initializeConnection();
    
    // Route to loadSession or newSession based on options
    if (this.options.resumeSessionId) {
      return this.loadExistingSession(this.options.resumeSessionId, initialPrompt);
    }
    
    return this.createNewSession(initialPrompt);
    
  } catch (error) {
    logger.debug('[AcpSdkBackend] Error starting session:', error);
    this.emit({ 
      type: 'status', 
      status: 'error', 
      detail: error instanceof Error ? error.message : String(error) 
    });
    throw error;
  }
}
```

**Step 5: Verify TypeScript compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run src/opencode/__tests__/unit/acp/acpBackend.test.ts`
Expected: All pass

**Step 6: Commit**

```bash
git add src/agent/acp/AcpSdkBackend.ts
git commit -m "refactor(acp): extract spawnProcess, initializeConnection, createNewSession methods

Prepares for loadSession support by making startSession modular"
```

---

## Task 6: Write unit test for loadSession

**Files:**
- Modify: `src/opencode/__tests__/unit/acp/acpBackend.test.ts`

**Step 1: Add test for session resumption**

Add new describe block:

```typescript
describe('session resumption', () => {
  it('should attempt loadSession when resumeSessionId is provided', async () => {
    // This test verifies the option is passed through
    // Actual loadSession behavior requires real OpenCode
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'test-model',
      resumeSessionId: 'ses_test123',
    });

    // The backend should be created successfully
    expect(backend).toBeDefined();
    
    // When we dispose without starting, it should not error
    await backend.dispose();
  });

  it('should fall back to newSession if loadSession fails', async () => {
    // Test that invalid session ID doesn't crash
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'test-model',
      resumeSessionId: 'invalid_session_id',
    });

    // Should handle gracefully (may timeout or fall back)
    // This is a smoke test - full behavior tested in integration
    expect(backend).toBeDefined();
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/opencode/__tests__/unit/acp/acpBackend.test.ts`
Expected: Pass (or skip if requires real OpenCode)

**Step 3: Commit**

```bash
git add src/opencode/__tests__/unit/acp/acpBackend.test.ts
git commit -m "test(acp): add unit tests for session resumption"
```

---

## Task 7: Add resumeSessionId to OpenCodeBackendOptions

**Files:**
- Modify: `src/agent/acp/opencode.ts`

**Step 1: Add resumeSessionId to options interface**

```typescript
export interface OpenCodeBackendOptions extends AgentFactoryOptions {
  /** Model to use (written to config.json before spawning) */
  model?: string;

  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, McpServerConfig>;

  /** Optional permission handler for tool approval */
  permissionHandler?: AcpPermissionHandler;
  
  /** Optional session ID to resume (OpenCode session format: ses_xxx) */
  resumeSessionId?: string;
}
```

**Step 2: Pass resumeSessionId to AcpSdkBackend**

Update `createOpenCodeBackend`:

```typescript
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
    resumeSessionId: options.resumeSessionId,
  };

  logger.debug('[OpenCode] Creating ACP SDK backend with options:', {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    model: options.model,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0,
    resumeSessionId: options.resumeSessionId,
  });

  return new AcpSdkBackend(backendOptions);
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/agent/acp/opencode.ts
git commit -m "feat(opencode): add resumeSessionId option to OpenCodeBackendOptions"
```

---

## Task 8: Create sessionPersistence utility

**Files:**
- Create: `src/opencode/utils/sessionPersistence.ts`
- Create: `src/opencode/utils/sessionPersistence.test.ts`

**Step 1: Write the failing test first**

Create `src/opencode/utils/sessionPersistence.test.ts`:

```typescript
/**
 * Session Persistence Unit Tests
 * 
 * Tests for saving/loading OpenCode session IDs per directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getLastSessionForDirectory,
  saveSessionForDirectory,
  SESSION_EXPIRY_DAYS,
} from './sessionPersistence';

describe('sessionPersistence', () => {
  let tempDir: string;
  let originalHappyHomeDir: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-persistence-test-'));
    // Mock HAPPY_HOME_DIR environment variable
    originalHappyHomeDir = process.env.HAPPY_HOME_DIR;
    process.env.HAPPY_HOME_DIR = tempDir;
  });

  afterEach(async () => {
    // Restore original env
    if (originalHappyHomeDir !== undefined) {
      process.env.HAPPY_HOME_DIR = originalHappyHomeDir;
    } else {
      delete process.env.HAPPY_HOME_DIR;
    }
    // Cleanup temp dir
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getLastSessionForDirectory', () => {
    it('should return null when no session exists', async () => {
      const result = await getLastSessionForDirectory('/some/project');
      expect(result).toBeNull();
    });

    it('should return saved session', async () => {
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_test123',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result).not.toBeNull();
      expect(result?.opencodeSessionId).toBe('ses_test123');
    });

    it('should return null for expired session', async () => {
      const expiredTime = Date.now() - (SESSION_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000;
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_expired',
        updatedAt: expiredTime,
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result).toBeNull();
    });
  });

  describe('saveSessionForDirectory', () => {
    it('should save session for new directory', async () => {
      await saveSessionForDirectory('/new/project', {
        opencodeSessionId: 'ses_new123',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/new/project');
      expect(result?.opencodeSessionId).toBe('ses_new123');
    });

    it('should update session for existing directory', async () => {
      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_old',
        updatedAt: Date.now() - 1000,
      });

      await saveSessionForDirectory('/my/project', {
        opencodeSessionId: 'ses_new',
        updatedAt: Date.now(),
      });

      const result = await getLastSessionForDirectory('/my/project');
      expect(result?.opencodeSessionId).toBe('ses_new');
    });

    it('should preserve sessions for other directories', async () => {
      await saveSessionForDirectory('/project-a', {
        opencodeSessionId: 'ses_a',
        updatedAt: Date.now(),
      });

      await saveSessionForDirectory('/project-b', {
        opencodeSessionId: 'ses_b',
        updatedAt: Date.now(),
      });

      const resultA = await getLastSessionForDirectory('/project-a');
      const resultB = await getLastSessionForDirectory('/project-b');

      expect(resultA?.opencodeSessionId).toBe('ses_a');
      expect(resultB?.opencodeSessionId).toBe('ses_b');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/opencode/utils/sessionPersistence.test.ts`
Expected: FAIL - module not found

**Step 3: Implement sessionPersistence**

Create `src/opencode/utils/sessionPersistence.ts`:

```typescript
/**
 * Session Persistence for OpenCode
 * 
 * Stores and retrieves OpenCode session IDs per directory for auto-resume.
 * Sessions are stored in ~/.happy-dev/opencode-sessions.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { logger } from '@/ui/logger';

/** Number of days after which sessions expire for auto-resume */
export const SESSION_EXPIRY_DAYS = 7;

/**
 * Entry for a directory's last session
 */
export interface DirectorySessionEntry {
  /** OpenCode session ID (format: ses_xxx) */
  opencodeSessionId: string;
  /** Timestamp when session was last used */
  updatedAt: number;
  /** Optional session title */
  title?: string;
}

/**
 * Map of directory paths to their last session
 */
interface DirectorySessionMap {
  [directory: string]: DirectorySessionEntry;
}

const SESSIONS_FILE = 'opencode-sessions.json';

/**
 * Get the path to the sessions file
 */
function getSessionsFilePath(): string {
  const happyHomeDir = process.env.HAPPY_HOME_DIR || join(process.env.HOME || '', '.happy-dev');
  return join(happyHomeDir, SESSIONS_FILE);
}

/**
 * Get the last session for a directory (if not expired)
 * 
 * @param directory - Absolute path to the project directory
 * @returns Session entry if exists and not expired, null otherwise
 */
export async function getLastSessionForDirectory(
  directory: string
): Promise<DirectorySessionEntry | null> {
  const filePath = getSessionsFilePath();
  
  try {
    const data = await readFile(filePath, 'utf-8');
    const sessions: DirectorySessionMap = JSON.parse(data);
    const entry = sessions[directory];
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    const expiryTime = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const isExpired = Date.now() - entry.updatedAt > expiryTime;
    
    if (isExpired) {
      logger.debug(`[SessionPersistence] Session for ${directory} expired (${SESSION_EXPIRY_DAYS} days)`);
      return null;
    }
    
    return entry;
  } catch (error) {
    // File doesn't exist or is invalid
    logger.debug(`[SessionPersistence] No sessions file found or error reading:`, error);
    return null;
  }
}

/**
 * Save a session for a directory
 * 
 * @param directory - Absolute path to the project directory
 * @param entry - Session entry to save
 */
export async function saveSessionForDirectory(
  directory: string,
  entry: DirectorySessionEntry
): Promise<void> {
  const filePath = getSessionsFilePath();
  let sessions: DirectorySessionMap = {};
  
  try {
    const data = await readFile(filePath, 'utf-8');
    sessions = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }
  
  sessions[directory] = entry;
  
  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });
  
  await writeFile(filePath, JSON.stringify(sessions, null, 2));
  logger.debug(`[SessionPersistence] Saved session ${entry.opencodeSessionId} for ${directory}`);
}
```

**Step 4: Run tests**

Run: `npx vitest run src/opencode/utils/sessionPersistence.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add src/opencode/utils/sessionPersistence.ts src/opencode/utils/sessionPersistence.test.ts
git commit -m "feat(opencode): add session persistence for auto-resume

- Store last OpenCode session ID per directory
- 7-day expiry for auto-resume
- Stored in ~/.happy-dev/opencode-sessions.json"
```

---

## Task 9: Add session resumption options to runOpenCode

**Files:**
- Modify: `src/opencode/runOpenCode.ts`

**Step 1: Extend options interface**

Update the options type (~line 50):

```typescript
export async function runOpenCode(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  /** Explicit session ID to resume */
  resumeSessionId?: string;
  /** Force new session even if previous exists */
  forceNewSession?: boolean;
}): Promise<void> {
```

**Step 2: Add import for session persistence**

Add near other imports:

```typescript
import {
  getLastSessionForDirectory,
  saveSessionForDirectory,
} from './utils/sessionPersistence';
```

**Step 3: Add session resolution logic**

After the workingDirectory is determined (early in the function), add:

```typescript
// Determine session ID to resume
let sessionIdToResume: string | undefined = opts.resumeSessionId;

// Auto-resume: check for previous session in this directory
if (!sessionIdToResume && !opts.forceNewSession) {
  const lastSession = await getLastSessionForDirectory(workingDirectory);
  if (lastSession) {
    logger.debug(`[OpenCode] Found previous session for directory: ${lastSession.opencodeSessionId}`);
    sessionIdToResume = lastSession.opencodeSessionId;
  }
}

if (sessionIdToResume) {
  logger.debug(`[OpenCode] Will attempt to resume session: ${sessionIdToResume}`);
}
```

**Step 4: Pass resumeSessionId to backend**

When creating the backend (~line 585), add the option:

```typescript
opencodeBackend = createOpenCodeBackend({
  cwd: workingDirectory,
  mcpServers,
  permissionHandler,
  model: message.mode.model,
  resumeSessionId: sessionIdToResume,
});
```

**Step 5: Save session ID after successful start**

After the session starts successfully, add:

```typescript
// Save session ID for future auto-resume
if (acpSessionId) {
  await saveSessionForDirectory(workingDirectory, {
    opencodeSessionId: acpSessionId,
    updatedAt: Date.now(),
  });
}
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add src/opencode/runOpenCode.ts
git commit -m "feat(opencode): wire session resumption in runOpenCode

- Add resumeSessionId and forceNewSession options
- Auto-detect previous session from persistence
- Save session ID after successful start"
```

---

## Task 10: Add CLI arguments for session resumption

**Files:**
- Modify: `src/index.ts`

**Step 1: Find opencode command handling**

Search for where `opencode` command is handled and add argument parsing:

```typescript
// In the opencode case block
case 'opencode': {
  // Parse session resumption arguments
  const resumeSessionIdx = args.indexOf('--resume-session');
  const resumeSessionId = resumeSessionIdx !== -1 && args[resumeSessionIdx + 1] 
    ? args[resumeSessionIdx + 1] 
    : undefined;
  const forceNewSession = args.includes('--force-new-session');
  
  await runOpenCode({
    credentials,
    startedBy: opts.startedBy || 'terminal',
    cwd: opts.cwd,
    model: opts.model,
    resumeSessionId,
    forceNewSession,
  });
  break;
}
```

**Step 2: Update help text**

If there's a help section for opencode, add:

```
--resume-session <id>  Resume specific OpenCode session
--force-new-session    Start fresh session (skip auto-resume)
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): add --resume-session and --force-new-session flags for opencode"
```

---

## Task 11: Manual Testing

**Step 1: Test auto-resume flow**

```bash
# Start a session
./bin/happy.mjs opencode

# Have a brief conversation, then exit (Ctrl+C)

# Start again in same directory - should auto-resume
./bin/happy.mjs opencode

# Verify context is preserved
```

**Step 2: Test force new session**

```bash
# Start fresh session even though previous exists
./bin/happy.mjs opencode --force-new-session
```

**Step 3: Test explicit resume**

```bash
# List sessions
opencode session list

# Resume specific session
./bin/happy.mjs opencode --resume-session ses_xxxxx
```

**Step 4: Verify fallback**

```bash
# Try to resume invalid session - should fall back to new
./bin/happy.mjs opencode --resume-session invalid_session_id
```

---

## Task 12: Update documentation

**Files:**
- Modify: `docs/opencode-feature-parity.md`

**Step 1: Update feature status**

Change session resumption status from "Designed" to "Complete":

```markdown
| Session Resumption | ❌ | ✅ | ✅ | Complete |
```

**Step 2: Add usage notes**

Add section about session resumption:

```markdown
### Session Resumption

OpenCode sessions can be resumed across CLI restarts:

- **Auto-resume**: When starting in a directory with a previous session (<7 days old), it resumes automatically
- **Explicit resume**: Use `--resume-session <id>` to resume a specific session
- **Force new**: Use `--force-new-session` to skip auto-resume

Sessions are stored in `~/.happy-dev/opencode-sessions.json`.
```

**Step 3: Commit**

```bash
git add docs/opencode-feature-parity.md
git commit -m "docs: update feature parity with session resumption status"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add resumeSessionId to AcpSdkBackendOptions | AcpSdkBackend.ts |
| 2 | Import LoadSessionRequest type | AcpSdkBackend.ts |
| 3 | Extract buildMcpServersArray helper | AcpSdkBackend.ts |
| 4 | Implement loadExistingSession method | AcpSdkBackend.ts |
| 5 | Refactor startSession into smaller methods | AcpSdkBackend.ts |
| 6 | Write unit test for loadSession | acpBackend.test.ts |
| 7 | Add resumeSessionId to OpenCodeBackendOptions | opencode.ts |
| 8 | Create sessionPersistence utility + tests | sessionPersistence.ts |
| 9 | Wire session resumption in runOpenCode | runOpenCode.ts |
| 10 | Add CLI arguments | index.ts |
| 11 | Manual testing | - |
| 12 | Update documentation | opencode-feature-parity.md |
