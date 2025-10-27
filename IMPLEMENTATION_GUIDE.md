# Resource Exposure API - Implementation Guide

## Quick Start

This guide provides step-by-step implementation instructions for each component of the Resource Exposure API.

---

## File Structure

```
happy-cli/
├── src/daemon/resource-api/
│   ├── types.ts              ✓ Created (type definitions)
│   ├── commands.ts           → Command discovery
│   ├── skills.ts             → Skill enumeration
│   ├── mcp-servers.ts        → MCP introspection
│   ├── executor.ts           → Execution engine
│   ├── security.ts           → Security validation
│   ├── rate-limit.ts         → Rate tracking
│   └── streaming.ts          → Output streaming
├── src/daemon/controlServer.ts  → Add RPC endpoints
└── API_SPECIFICATION.md      ✓ Created

happy-server/
├── sources/app/resources/
│   ├── types.ts              → Export daemon types
│   ├── list-commands.ts      → Relay endpoint
│   ├── list-skills.ts        → Relay endpoint
│   ├── list-mcp-servers.ts   → Relay endpoint
│   ├── execute-command.ts    → Relay with auth
│   ├── invoke-skill.ts       → Relay with auth
│   ├── query-execution.ts    → Status query
│   ├── cancel-execution.ts   → Cancellation
│   ├── stream-output.ts      → WebSocket proxy
│   └── rate-limit.ts         → User rate limiting
└── sources/index.ts          → Register routes
```

---

## Implementation Steps

### Step 1: Command Discovery (happy-cli)

**File:** `src/daemon/resource-api/commands.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CommandMetadata, ListCommandsRequest, ListCommandsResponse } from './types';

/**
 * Parse command markdown file for metadata
 */
async function parseCommandFile(filePath: string): Promise<CommandMetadata | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract frontmatter (YAML between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter: Record<string, any> = {};

    if (frontmatterMatch) {
      const lines = frontmatterMatch[1].split('\n');
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
          const value = valueParts.join(':').trim();
          frontmatter[key.trim()] = parseYamlValue(value);
        }
      }
    }

    // Extract description from markdown content
    const descriptionMatch = content.match(/^# (.+)$/m);
    const description = descriptionMatch?.[1] || frontmatter.description || '';

    // Extract examples
    const examplesMatch = content.match(/##? Examples?\n([\s\S]*?)(?=\n##|$)/i);
    const examples: string[] = [];
    if (examplesMatch) {
      const exampleLines = examplesMatch[1].match(/`([^`]+)`/g);
      if (exampleLines) {
        examples.push(...exampleLines.map(e => e.slice(1, -1)));
      }
    }

    const fileName = path.basename(filePath, '.md');

    return {
      name: frontmatter.command?.replace(/^\//, '') || fileName,
      path: path.basename(filePath),
      category: frontmatter.category || 'Uncategorized',
      description,
      purpose: frontmatter.purpose,
      waveEnabled: frontmatter['wave-enabled'] === true,
      performanceProfile: frontmatter['performance-profile'],
      arguments: parseArguments(content),
      flags: parseFlags(content),
      examples
    };
  } catch (error) {
    console.error(`Failed to parse command file ${filePath}:`, error);
    return null;
  }
}

function parseYamlValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value);
  return value.replace(/^["']|["']$/g, '');
}

function parseArguments(content: string): any[] {
  // Look for Arguments section in markdown
  const argsMatch = content.match(/##? Arguments?\n([\s\S]*?)(?=\n##|$)/i);
  if (!argsMatch) return [];

  const args: any[] = [];
  const argLines = argsMatch[1].match(/- `\[?(\w+)\]?`:? (.+)/g);

  if (argLines) {
    for (const line of argLines) {
      const match = line.match(/- `\[?(\w+)\]?`:? (.+)/);
      if (match) {
        args.push({
          name: match[1],
          required: !line.includes('[') || !line.includes(']'),
          description: match[2]
        });
      }
    }
  }

  return args;
}

function parseFlags(content: string): any[] {
  // Look for Flags section in markdown
  const flagsMatch = content.match(/##? Flags?\n([\s\S]*?)(?=\n##|$)/i);
  if (!flagsMatch) return [];

  const flags: any[] = [];
  const flagLines = flagsMatch[1].match(/- `--(\w+)`:? (.+)/g);

  if (flagLines) {
    for (const line of flagLines) {
      const match = line.match(/- `--(\w+)`:? (.+)/);
      if (match) {
        flags.push({
          name: `--${match[1]}`,
          description: match[2],
          type: 'boolean' // Default, could be enhanced
        });
      }
    }
  }

  return flags;
}

/**
 * List all available commands
 */
export async function listCommands(request: ListCommandsRequest): Promise<ListCommandsResponse> {
  const commandsDir = path.join(os.homedir(), '.claude', 'commands');

  try {
    const files = await fs.readdir(commandsDir);
    const commandFiles = files.filter(f => f.endsWith('.md'));

    // Parse all command files
    const allCommands = await Promise.all(
      commandFiles.map(f => parseCommandFile(path.join(commandsDir, f)))
    );

    // Filter out nulls and apply filters
    let commands = allCommands.filter((c): c is CommandMetadata => c !== null);

    // Apply filters
    if (request.filter) {
      if (request.filter.category) {
        commands = commands.filter(c => c.category === request.filter!.category);
      }
      if (request.filter.search) {
        const search = request.filter.search.toLowerCase();
        commands = commands.filter(c =>
          c.name.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search)
        );
      }
      if (request.filter.waveEnabled !== undefined) {
        commands = commands.filter(c => c.waveEnabled === request.filter!.waveEnabled);
      }
    }

    // Sort
    if (request.sortBy === 'name') {
      commands.sort((a, b) => a.name.localeCompare(b.name));
    } else if (request.sortBy === 'category') {
      commands.sort((a, b) => a.category.localeCompare(b.category));
    }

    // Paginate
    const offset = request.offset || 0;
    const limit = request.limit || 100;
    const total = commands.length;
    const paginatedCommands = commands.slice(offset, offset + limit);

    return {
      commands: paginatedCommands,
      total,
      hasMore: offset + limit < total
    };
  } catch (error) {
    console.error('Failed to list commands:', error);
    throw new Error('Failed to list commands');
  }
}

/**
 * Get single command by name
 */
export async function getCommand(name: string): Promise<CommandMetadata | null> {
  const commandsDir = path.join(os.homedir(), '.claude', 'commands');
  const filePath = path.join(commandsDir, `${name}.md`);

  try {
    await fs.access(filePath);
    return await parseCommandFile(filePath);
  } catch {
    return null;
  }
}
```

---

### Step 2: Security Validation (happy-cli)

**File:** `src/daemon/resource-api/security.ts`

```typescript
import { SecurityConfig, ApiErrorCode } from './types';

export class SecurityValidator {
  constructor(private config: SecurityConfig) {}

  /**
   * Validate command is allowed to execute
   */
  validateCommand(command: string, userId: string): void {
    // Check blacklist first
    if (this.config.blacklist?.enabled) {
      if (this.config.blacklist.commands.includes(command)) {
        throw new SecurityError(
          ApiErrorCode.COMMAND_BLACKLISTED,
          `Command '${command}' is blacklisted`,
          { command }
        );
      }
    }

    // Check whitelist (if enabled, only listed commands allowed)
    if (this.config.whitelist?.enabled) {
      if (!this.config.whitelist.commands.includes(command)) {
        throw new SecurityError(
          ApiErrorCode.PERMISSION_DENIED,
          `Command '${command}' is not in whitelist`,
          { command, whitelist: this.config.whitelist.commands }
        );
      }
    }

    // Check if requires approval
    if (this.config.requireApproval?.enabled) {
      if (this.config.requireApproval.commands.includes(command)) {
        throw new SecurityError(
          ApiErrorCode.REQUIRES_APPROVAL,
          `Command '${command}' requires user approval`,
          { command }
        );
      }
    }
  }

  /**
   * Validate execution limits
   */
  validateExecutionLimits(currentExecutions: number): void {
    const max = this.config.maxConcurrentExecutions || 5;
    if (currentExecutions >= max) {
      throw new SecurityError(
        ApiErrorCode.RATE_LIMIT_EXCEEDED,
        `Maximum concurrent executions (${max}) reached`,
        { current: currentExecutions, max }
      );
    }
  }

  /**
   * Sanitize command arguments to prevent injection
   */
  sanitizeArguments(args: string[]): string[] {
    return args.map(arg => {
      // Remove potentially dangerous characters
      const sanitized = arg.replace(/[;&|`$()]/g, '');

      // Validate no path traversal attempts
      if (arg.includes('../') || arg.includes('..\\')) {
        throw new SecurityError(
          ApiErrorCode.INVALID_REQUEST,
          'Path traversal attempt detected in arguments',
          { argument: arg }
        );
      }

      return sanitized;
    });
  }
}

export class SecurityError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}
```

---

### Step 3: Execution Engine (happy-cli)

**File:** `src/daemon/resource-api/executor.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  ExecutionStatus,
  ExecutionRecord,
  ApiErrorCode
} from './types';
import { SecurityValidator } from './security';
import { v4 as uuidv4 } from 'uuid';

export class ExecutionEngine extends EventEmitter {
  private executions = new Map<string, ExecutionRecord>();
  private securityValidator: SecurityValidator;

  constructor(securityValidator: SecurityValidator) {
    super();
    this.securityValidator = securityValidator;
  }

  /**
   * Execute a command
   */
  async executeCommand(
    request: ExecuteCommandRequest,
    userId: string
  ): Promise<ExecuteCommandResponse> {
    const executionId = uuidv4();

    // Security validation
    this.securityValidator.validateCommand(request.command, userId);
    this.securityValidator.validateExecutionLimits(this.getActiveExecutionCount());

    // Sanitize arguments
    const sanitizedArgs = request.args
      ? this.securityValidator.sanitizeArguments(request.args)
      : [];

    // Create execution record
    const record: ExecutionRecord = {
      executionId,
      userId,
      type: 'command',
      resource: request.command,
      sessionId: request.sessionId,
      startedAt: Date.now(),
      timeout: request.timeout || 300000,
      stream: request.streamOutput,
      status: 'queued',
      logs: []
    };

    this.executions.set(executionId, record);

    // Start execution asynchronously
    this.startExecution(record, request, sanitizedArgs).catch(error => {
      record.status = 'failed';
      record.error = error.message;
      record.completedAt = Date.now();
    });

    return {
      executionId,
      status: 'started',
      sessionId: record.sessionId,
      startedAt: record.startedAt
    };
  }

  private async startExecution(
    record: ExecutionRecord,
    request: ExecuteCommandRequest,
    args: string[]
  ): Promise<void> {
    record.status = 'running';
    this.emit('status', { executionId: record.executionId, status: 'running' });

    // Build command to execute
    // In real implementation, this would spawn Claude session with command
    const commandPath = this.resolveCommandPath(request.command);

    // For now, simulate with direct execution
    const process = spawn('claude', ['run-command', commandPath, ...args], {
      cwd: request.directory,
      timeout: record.timeout,
      stdio: record.stream ? ['ignore', 'pipe', 'pipe'] : 'ignore'
    });

    let output = '';
    let error = '';

    if (record.stream && process.stdout && process.stderr) {
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        this.emit('stdout', { executionId: record.executionId, data: chunk });
      });

      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        error += chunk;
        this.emit('stderr', { executionId: record.executionId, data: chunk });
      });
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        process.kill();
        record.status = 'timeout';
        record.completedAt = Date.now();
        this.emit('complete', { executionId: record.executionId, status: 'timeout' });
        reject(new Error('Execution timeout'));
      }, record.timeout);

      process.on('exit', (code) => {
        clearTimeout(timeoutHandle);

        record.exitCode = code || 0;
        record.output = output;
        record.error = error;
        record.status = code === 0 ? 'completed' : 'failed';
        record.completedAt = Date.now();

        this.emit('complete', {
          executionId: record.executionId,
          status: record.status,
          exitCode: code
        });

        resolve();
      });

      process.on('error', (err) => {
        clearTimeout(timeoutHandle);

        record.status = 'failed';
        record.error = err.message;
        record.completedAt = Date.now();

        this.emit('error', { executionId: record.executionId, error: err.message });
        reject(err);
      });
    });
  }

  /**
   * Query execution status
   */
  getExecution(executionId: string): ExecutionRecord | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string, force: boolean = false): boolean {
    const record = this.executions.get(executionId);
    if (!record) return false;

    if (record.status === 'completed' || record.status === 'failed') {
      return false; // Already finished
    }

    record.status = 'cancelled';
    record.completedAt = Date.now();
    this.emit('cancelled', { executionId });

    // In real implementation, kill the process
    // process.kill(force ? 'SIGKILL' : 'SIGTERM');

    return true;
  }

  private getActiveExecutionCount(): number {
    let count = 0;
    for (const record of this.executions.values()) {
      if (record.status === 'running' || record.status === 'queued') {
        count++;
      }
    }
    return count;
  }

  private resolveCommandPath(command: string): string {
    // Resolve command name to file path
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), '.claude', 'commands', `${command}.md`);
  }

  /**
   * Cleanup old executions
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [id, record] of this.executions.entries()) {
      if (record.completedAt && now - record.completedAt > maxAge) {
        this.executions.delete(id);
      }
    }
  }
}
```

---

### Step 4: Add Endpoints to Daemon (happy-cli)

**File:** `src/daemon/controlServer.ts` (modifications)

```typescript
import { listCommands, getCommand } from './resource-api/commands';
import { listSkills } from './resource-api/skills';
import { listMcpServers } from './resource-api/mcp-servers';
import { ExecutionEngine } from './resource-api/executor';
import { SecurityValidator } from './resource-api/security';
import {
  ListCommandsRequest,
  ExecuteCommandRequest,
  SecurityConfig
} from './resource-api/types';

// Add to startDaemonControlServer function:

// Initialize security and execution engine
const securityConfig: SecurityConfig = {
  blacklist: { enabled: true, commands: ['rm', 'sudo'] },
  maxConcurrentExecutions: 5,
  maxExecutionTime: 600000
};

const securityValidator = new SecurityValidator(securityConfig);
const executionEngine = new ExecutionEngine(securityValidator);

// Resource API: List commands
typed.post('/resource-api/commands/list', {
  schema: {
    body: z.object({
      filter: z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        waveEnabled: z.boolean().optional()
      }).optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      sortBy: z.enum(['name', 'category', 'recent']).optional()
    }),
    response: {
      200: z.object({
        commands: z.array(z.any()),
        total: z.number(),
        hasMore: z.boolean()
      })
    }
  }
}, async (request) => {
  const result = await listCommands(request.body as ListCommandsRequest);
  return result;
});

// Resource API: Execute command
typed.post('/resource-api/execute', {
  schema: {
    body: z.object({
      userId: z.string(),
      command: z.string(),
      args: z.array(z.string()).optional(),
      flags: z.record(z.any()).optional(),
      directory: z.string().optional(),
      timeout: z.number().optional(),
      sessionId: z.string().optional(),
      streamOutput: z.boolean().optional()
    }),
    response: {
      200: z.object({
        executionId: z.string(),
        status: z.string(),
        sessionId: z.string().optional(),
        startedAt: z.number()
      }),
      403: z.object({
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z.any().optional()
        })
      })
    }
  }
}, async (request, reply) => {
  try {
    const result = await executionEngine.executeCommand(
      request.body as ExecuteCommandRequest,
      request.body.userId
    );
    return result;
  } catch (error: any) {
    reply.code(403);
    return {
      error: {
        code: error.code || 'EXECUTION_FAILED',
        message: error.message,
        details: error.details
      }
    };
  }
});

// Resource API: Query execution
typed.post('/resource-api/execution/query', {
  schema: {
    body: z.object({
      executionId: z.string()
    }),
    response: {
      200: z.object({
        executionId: z.string(),
        status: z.string(),
        output: z.string().optional(),
        error: z.string().optional(),
        exitCode: z.number().optional(),
        startedAt: z.number(),
        completedAt: z.number().optional()
      }),
      404: z.object({
        error: z.object({
          code: z.string(),
          message: z.string()
        })
      })
    }
  }
}, async (request, reply) => {
  const record = executionEngine.getExecution(request.body.executionId);
  if (!record) {
    reply.code(404);
    return {
      error: {
        code: 'EXECUTION_NOT_FOUND',
        message: 'Execution not found'
      }
    };
  }

  return {
    executionId: record.executionId,
    status: record.status,
    output: record.output,
    error: record.error,
    exitCode: record.exitCode,
    startedAt: record.startedAt,
    completedAt: record.completedAt
  };
});
```

---

### Step 5: Server Relay Implementation (happy-server)

**File:** `sources/app/resources/list-commands.ts`

```typescript
import axios from 'axios';
import { auth } from '../auth/auth';

interface ListCommandsRequest {
  filter?: {
    category?: string;
    search?: string;
    waveEnabled?: boolean;
  };
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'category' | 'recent';
}

export async function listCommands(req: any, res: any) {
  try {
    // Extract and verify token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
          timestamp: Date.now()
        }
      });
    }

    const token = authHeader.slice(7);
    const verified = await auth.verifyToken(token);

    if (!verified) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token',
          timestamp: Date.now()
        }
      });
    }

    // Get daemon port from environment
    const daemonPort = process.env.DAEMON_PORT || '62000';
    const daemonUrl = `http://127.0.0.1:${daemonPort}`;

    // Forward request to daemon
    const response = await axios.post(
      `${daemonUrl}/resource-api/commands/list`,
      req.body as ListCommandsRequest,
      { timeout: 5000 }
    );

    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('Failed to list commands:', error);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to communicate with daemon',
        timestamp: Date.now()
      }
    });
  }
}
```

**File:** `sources/app/resources/execute-command.ts`

```typescript
import axios from 'axios';
import { auth } from '../auth/auth';
import { rateLimitCheck } from './rate-limit';

export async function executeCommand(req: any, res: any) {
  try {
    // Auth
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing token' }
      });
    }

    const token = authHeader.slice(7);
    const verified = await auth.verifyToken(token);
    if (!verified) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
      });
    }

    // Rate limiting
    const rateLimitResult = await rateLimitCheck(verified.userId, 'execution');
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Execution rate limit exceeded',
          timestamp: Date.now()
        }
      });
    }

    // Forward to daemon with userId
    const daemonPort = process.env.DAEMON_PORT || '62000';
    const response = await axios.post(
      `http://127.0.0.1:${daemonPort}/resource-api/execute`,
      {
        ...req.body,
        userId: verified.userId
      },
      { timeout: 10000 }
    );

    // Audit log
    await logAudit({
      timestamp: Date.now(),
      userId: verified.userId,
      action: 'execute-command',
      resource: req.body.command,
      success: true,
      metadata: { executionId: response.data.executionId }
    });

    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error('Failed to execute command:', error);

    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
}

async function logAudit(log: any) {
  // Append to audit log file
  const fs = require('fs').promises;
  const path = require('path');
  const logPath = path.join('.logs', 'resource-api-audit.log');
  await fs.appendFile(logPath, JSON.stringify(log) + '\n');
}
```

---

### Step 6: Rate Limiting (happy-server)

**File:** `sources/app/resources/rate-limit.ts`

```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
  discovery: { windowMs: 60000, maxRequests: 100 },
  execution: { windowMs: 60000, maxRequests: 10 }
};

export async function rateLimitCheck(
  userId: string,
  type: 'discovery' | 'execution'
): Promise<{ allowed: boolean; resetIn?: number }> {
  const config = RATE_LIMITS[type];
  const key = `${userId}:${type}`;
  const now = Date.now();

  let entry = rateLimits.get(key);

  // Reset if window expired
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs
    };
    rateLimits.set(key, entry);
  }

  // Check limit
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      resetIn: Math.ceil((entry.resetAt - now) / 1000)
    };
  }

  // Increment counter
  entry.count++;

  return { allowed: true };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (now >= entry.resetAt + 60000) {
      rateLimits.delete(key);
    }
  }
}, 60000);
```

---

## Testing

### Unit Test Example

```typescript
// commands.test.ts
import { listCommands } from '../src/daemon/resource-api/commands';

describe('Command Discovery', () => {
  test('lists all commands', async () => {
    const result = await listCommands({});
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.total).toBe(result.commands.length);
  });

  test('filters by category', async () => {
    const result = await listCommands({
      filter: { category: 'Development' }
    });
    expect(result.commands.every(c => c.category === 'Development')).toBe(true);
  });

  test('paginates results', async () => {
    const page1 = await listCommands({ limit: 10, offset: 0 });
    const page2 = await listCommands({ limit: 10, offset: 10 });
    expect(page1.commands[0].name).not.toBe(page2.commands[0].name);
  });
});
```

### Integration Test Example

```typescript
// e2e.test.ts
import axios from 'axios';

describe('End-to-End Flow', () => {
  const API_BASE = 'http://localhost:3000/api/v1/resources';
  let token: string;

  beforeAll(async () => {
    // Get auth token
    const authRes = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'test',
      password: 'test'
    });
    token = authRes.data.token;
  });

  test('full execution flow', async () => {
    // 1. List commands
    const listRes = await axios.post(
      `${API_BASE}/commands/list`,
      {},
      { headers: { Authorization: `Bearer ${token}` }}
    );
    expect(listRes.status).toBe(200);
    expect(listRes.data.commands.length).toBeGreaterThan(0);

    // 2. Execute command
    const execRes = await axios.post(
      `${API_BASE}/command/execute`,
      { command: 'test', args: [] },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    expect(execRes.status).toBe(200);
    expect(execRes.data.executionId).toBeDefined();

    // 3. Query status
    const queryRes = await axios.post(
      `${API_BASE}/execution/query`,
      { executionId: execRes.data.executionId },
      { headers: { Authorization: `Bearer ${token}` }}
    );
    expect(queryRes.status).toBe(200);
    expect(['running', 'completed']).toContain(queryRes.data.status);
  });
});
```

---

## Deployment

### 1. Build

```bash
cd happy-cli
npm run build

cd happy-server
npm run build
```

### 2. Configure

Create `daemon-config.json`:
```json
{
  "resourceApi": {
    "enabled": true,
    "security": {
      "blacklist": { "enabled": true, "commands": ["rm", "sudo"] }
    }
  }
}
```

### 3. Start Services

```bash
# Start daemon
happy-cli daemon start

# Start server
cd happy-server
npm start
```

### 4. Verify

```bash
# Health check
curl http://localhost:3000/health

# Test command list (with auth token)
curl -X POST http://localhost:3000/api/v1/resources/commands/list \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Next Steps

1. Implement remaining discovery endpoints (skills, MCPs)
2. Add WebSocket streaming support
3. Create OpenAPI specification
4. Build mobile SDK
5. Deploy to production

---

**Questions?** See API_SPECIFICATION.md for complete details.
