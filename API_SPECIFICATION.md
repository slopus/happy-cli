# Resource Exposure API Specification

**Version:** 1.0.0
**Status:** Design Phase
**Architecture:** Mobile App ← happy-server (relay) ← happy-cli daemon

---

## Table of Contents
1. [Overview](#overview)
2. [Security Model](#security-model)
3. [API Endpoints](#api-endpoints)
4. [Data Schemas](#data-schemas)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Implementation Plan](#implementation-plan)
8. [Testing Strategy](#testing-strategy)

---

## Overview

The Resource Exposure API enables mobile clients to discover and invoke CLI commands, Claude Code skills, and MCP servers running on the host machine. The architecture uses a relay pattern for security and flexibility.

### Architecture Flow

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  Mobile App │ ←─────→ │ happy-server │ ←─────→ │  happy-cli   │
│             │  HTTPS  │   (relay)    │  HTTP   │   daemon     │
└─────────────┘         └──────────────┘         └──────────────┘
                             │                          │
                             │                          │
                        Bearer Token              Local Socket
                        Authentication           127.0.0.1 only
```

### Key Features

- **Discovery**: Enumerate available commands, skills, and MCP servers
- **Execution**: Run commands and invoke skills with real-time streaming
- **Security**: Token-based auth, rate limiting, command whitelisting
- **Monitoring**: Audit logging and execution tracking

---

## Security Model

### Authentication

Reuses existing Bearer token system from `happy-server`:

```typescript
Authorization: Bearer <token>
```

Token verification flow:
1. Mobile app includes token in request header
2. happy-server validates token via `auth.verifyToken()`
3. If valid, request forwarded to daemon with `userId`
4. Daemon validates user permissions and executes

### Rate Limiting

**Per User Limits:**
- Discovery endpoints: 100 requests/minute
- Execution endpoints: 10 requests/minute
- Concurrent streams: 5 simultaneous

**Implementation:**
```typescript
interface RateLimitConfig {
  discovery: { windowMs: 60000, maxRequests: 100 },
  execution: { windowMs: 60000, maxRequests: 10 },
  streaming: { concurrent: 5 }
}
```

### Command Security

**Whitelist/Blacklist:**
```json
{
  "security": {
    "whitelist": {
      "enabled": false,
      "commands": ["build", "test", "analyze"]
    },
    "blacklist": {
      "enabled": true,
      "commands": ["rm", "sudo", "chmod"]
    },
    "requireApproval": {
      "enabled": true,
      "commands": ["deploy", "publish"]
    }
  }
}
```

**Validation Steps:**
1. Check if command exists
2. Verify not in blacklist
3. If whitelist enabled, verify in whitelist
4. Check if requires approval (return 403 with approval flow)
5. Validate arguments and flags

### Audit Logging

All execution attempts logged:

```typescript
interface AuditLog {
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  success: boolean;
  error?: string;
  metadata?: {
    executionId?: string;
    duration?: number;
    exitCode?: number;
  };
}
```

Log location: `.logs/resource-api-audit.log`

---

## API Endpoints

### 1. List Commands

**Endpoint:** `POST /api/v1/resources/commands/list`

**Purpose:** Enumerate available CLI commands from `~/.claude/commands/`

**Request:**
```json
{
  "filter": {
    "category": "Development",
    "search": "build",
    "waveEnabled": true
  },
  "limit": 50,
  "offset": 0,
  "sortBy": "name"
}
```

**Response (200 OK):**
```json
{
  "commands": [
    {
      "name": "build",
      "path": "build.md",
      "category": "Development & Deployment",
      "description": "Project builder with framework detection",
      "purpose": "Build project with auto-detection",
      "waveEnabled": true,
      "performanceProfile": "optimization",
      "arguments": [
        {
          "name": "target",
          "required": false,
          "description": "Build target",
          "type": "string"
        }
      ],
      "flags": [
        {
          "name": "--production",
          "description": "Production build",
          "type": "boolean",
          "default": false
        }
      ],
      "examples": [
        "/build",
        "/build production --optimize"
      ]
    }
  ],
  "total": 42,
  "hasMore": false
}
```

**Errors:**
- `401 UNAUTHORIZED`: Invalid token
- `429 RATE_LIMIT_EXCEEDED`: Too many requests
- `500 INTERNAL_ERROR`: Server error

---

### 2. List Skills

**Endpoint:** `POST /api/v1/resources/skills/list`

**Purpose:** Enumerate installed Claude Code skills

**Request:**
```json
{
  "filter": {
    "location": "user",
    "search": "cloudflare"
  },
  "limit": 50,
  "offset": 0
}
```

**Response (200 OK):**
```json
{
  "skills": [
    {
      "name": "cloudflare-d1",
      "description": "Cloudflare D1 database operations",
      "location": "user",
      "path": "/Users/user/.claude/skills/cloudflare-d1.md",
      "triggers": ["database", "d1", "cloudflare"],
      "capabilities": ["schema", "migrations", "queries"],
      "gitignored": true
    }
  ],
  "total": 15,
  "hasMore": false
}
```

---

### 3. List MCP Servers

**Endpoint:** `POST /api/v1/resources/mcp-servers/list`

**Purpose:** Enumerate MCP servers with tools and resources

**Request:**
```json
{
  "includeTools": true,
  "includeResources": false,
  "includePrompts": false,
  "filter": {
    "enabled": true,
    "hasTools": true
  }
}
```

**Response (200 OK):**
```json
{
  "servers": [
    {
      "name": "filesystem",
      "enabled": true,
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
      },
      "tools": [
        {
          "name": "read_file",
          "description": "Read complete file contents",
          "inputSchema": {
            "type": "object",
            "properties": {
              "path": { "type": "string" }
            },
            "required": ["path"]
          }
        }
      ],
      "capabilities": {
        "tools": true,
        "resources": true,
        "prompts": false
      }
    }
  ],
  "total": 8
}
```

---

### 4. Execute Command

**Endpoint:** `POST /api/v1/resources/command/execute`

**Purpose:** Execute a CLI command with arguments

**Request:**
```json
{
  "command": "build",
  "args": ["production"],
  "flags": {
    "optimize": true,
    "target": "web"
  },
  "directory": "/projects/myapp",
  "timeout": 300000,
  "sessionId": "existing-session-123",
  "streamOutput": true
}
```

**Response (200 OK - Async):**
```json
{
  "executionId": "exec_abc123",
  "status": "started",
  "sessionId": "sess_xyz789",
  "startedAt": 1698765432000,
  "estimatedDuration": 60000
}
```

**Response (200 OK - Sync, if completed quickly):**
```json
{
  "executionId": "exec_abc123",
  "status": "completed",
  "sessionId": "sess_xyz789",
  "output": "Build completed successfully\n✓ All tests passed\n",
  "exitCode": 0,
  "startedAt": 1698765432000,
  "completedAt": 1698765492000
}
```

**Errors:**
- `400 INVALID_COMMAND`: Command doesn't exist
- `400 MISSING_REQUIRED_ARG`: Required argument missing
- `403 COMMAND_BLACKLISTED`: Command not allowed
- `403 REQUIRES_APPROVAL`: Needs user approval
- `404 COMMAND_NOT_FOUND`: Command file not found
- `429 RATE_LIMIT_EXCEEDED`: Execution limit reached
- `500 SESSION_SPAWN_FAILED`: Failed to create Claude session

---

### 5. Invoke Skill

**Endpoint:** `POST /api/v1/resources/skill/invoke`

**Purpose:** Invoke a Claude Code skill

**Request:**
```json
{
  "skill": "cloudflare-d1",
  "context": {
    "files": ["schema.sql", "migrations/001_init.sql"],
    "message": "Create a migration for user authentication",
    "variables": {
      "database": "production",
      "environment": "staging"
    }
  },
  "sessionId": "sess_xyz789",
  "streamOutput": true
}
```

**Response (200 OK):**
```json
{
  "executionId": "exec_def456",
  "status": "started",
  "sessionId": "sess_xyz789",
  "startedAt": 1698765500000
}
```

**Errors:**
- `404 SKILL_NOT_FOUND`: Skill doesn't exist
- `500 EXECUTION_FAILED`: Skill invocation failed

---

### 6. Query Execution Status

**Endpoint:** `POST /api/v1/resources/execution/query`

**Purpose:** Check execution status and retrieve results

**Request:**
```json
{
  "executionId": "exec_abc123"
}
```

**Response (200 OK):**
```json
{
  "executionId": "exec_abc123",
  "status": "running",
  "output": "Partial output so far...",
  "startedAt": 1698765432000,
  "progress": {
    "percentage": 65,
    "currentStep": "Running tests"
  }
}
```

---

### 7. Cancel Execution

**Endpoint:** `POST /api/v1/resources/execution/cancel`

**Purpose:** Cancel a running execution

**Request:**
```json
{
  "executionId": "exec_abc123",
  "force": false
}
```

**Response (200 OK):**
```json
{
  "executionId": "exec_abc123",
  "cancelled": true
}
```

**Errors:**
- `404 EXECUTION_NOT_FOUND`: Execution ID invalid
- `400 INVALID_REQUEST`: Execution already completed

---

### 8. Stream Output (WebSocket)

**Endpoint:** `WS /api/v1/resources/stream/:executionId`

**Purpose:** Real-time streaming of command/skill output

**Connection:**
```
ws://server/api/v1/resources/stream/exec_abc123
Authorization: Bearer <token>
```

**Message Format:**
```json
{
  "executionId": "exec_abc123",
  "type": "stdout",
  "data": "Building project...\n",
  "timestamp": 1698765433000,
  "sequence": 1
}
```

**Message Types:**
- `stdout`: Standard output
- `stderr`: Error output
- `status`: Status change
- `progress`: Progress update
- `complete`: Execution finished
- `error`: Error occurred

**Complete Message:**
```json
{
  "executionId": "exec_abc123",
  "type": "complete",
  "data": {
    "status": "completed",
    "exitCode": 0
  },
  "timestamp": 1698765492000,
  "sequence": 42
}
```

---

## Data Schemas

See `src/daemon/resource-api/types.ts` for complete TypeScript definitions.

### Key Schemas

**CommandMetadata:**
- Full command information including arguments, flags, examples
- Category and description from markdown frontmatter
- Wave support and performance profile indicators

**SkillMetadata:**
- Skill location (user/project/plugin)
- Triggers and capabilities
- Dependencies and version info

**McpServerMetadata:**
- Transport configuration (stdio/SSE)
- Available tools with JSON schemas
- Resources and prompts

**ExecutionRecord:**
- Execution lifecycle tracking
- Output/error capture
- Timing and status information

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "COMMAND_NOT_FOUND",
    "message": "Command 'xyz' does not exist",
    "details": {
      "command": "xyz",
      "availableCommands": ["build", "test", "deploy"]
    },
    "timestamp": 1698765432000
  }
}
```

### Error Codes

**Client Errors (4xx):**
- `INVALID_REQUEST` (400): Malformed request
- `INVALID_COMMAND` (400): Invalid command syntax
- `MISSING_REQUIRED_ARG` (400): Required argument missing
- `UNAUTHORIZED` (401): Invalid or missing token
- `TOKEN_EXPIRED` (401): Token expired
- `COMMAND_BLACKLISTED` (403): Command forbidden
- `PERMISSION_DENIED` (403): User lacks permission
- `REQUIRES_APPROVAL` (403): Approval needed
- `COMMAND_NOT_FOUND` (404): Command doesn't exist
- `SKILL_NOT_FOUND` (404): Skill doesn't exist
- `EXECUTION_NOT_FOUND` (404): Execution ID invalid
- `RATE_LIMIT_EXCEEDED` (429): Too many requests

**Server Errors (5xx):**
- `EXECUTION_FAILED` (500): Command execution error
- `EXECUTION_TIMEOUT` (500): Execution timed out
- `SESSION_SPAWN_FAILED` (500): Failed to create session
- `MCP_CONNECTION_FAILED` (500): MCP server unavailable
- `INTERNAL_ERROR` (500): Unexpected server error

### Error Recovery

**Retry Strategy:**
- `RATE_LIMIT_EXCEEDED`: Wait 60 seconds, retry
- `EXECUTION_TIMEOUT`: Increase timeout, retry
- `SESSION_SPAWN_FAILED`: Wait 5 seconds, retry once
- `INTERNAL_ERROR`: Don't retry, report to user

**User Feedback:**
- Clear error messages in mobile UI
- Actionable suggestions when possible
- Link to documentation for common errors

---

## Rate Limiting

### Per-User Limits

**Discovery Endpoints:**
- Window: 60 seconds
- Max: 100 requests
- HTTP 429 response when exceeded
- `Retry-After` header with seconds to wait

**Execution Endpoints:**
- Window: 60 seconds
- Max: 10 executions
- Applies to both commands and skills
- Queued executions don't count until started

**Streaming:**
- Max concurrent: 5 streams per user
- New stream requests rejected if limit reached
- Completed streams immediately free slot

### Implementation

```typescript
// happy-server rate limiter
import rateLimit from 'express-rate-limit';

const discoveryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.userId,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        timestamp: Date.now()
      }
    });
  }
});

const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.userId
});
```

---

## Implementation Plan

### Phase 1: Daemon Extension (happy-cli)

**Timeline:** Week 1-2

**New Files:**
```
src/daemon/resource-api/
├── types.ts              ✓ Created
├── commands.ts           → Command discovery and parsing
├── skills.ts             → Skill enumeration
├── mcp-servers.ts        → MCP server introspection
├── executor.ts           → Execution engine
├── security.ts           → Security validation
├── rate-limit.ts         → Rate limiting (local tracking)
└── streaming.ts          → WebSocket streaming support
```

**Modified Files:**
```
src/daemon/controlServer.ts  → Add RPC endpoints
src/daemon/types.ts          → Add execution tracking
```

**Key Tasks:**
1. Parse command markdown files for metadata extraction
2. Scan skills directory and parse skill definitions
3. Read MCP config and introspect server capabilities
4. Build execution engine with timeout/cancellation
5. Implement security validation layer
6. Add streaming output handler

**Deliverables:**
- All endpoints functional locally
- Unit tests for each module
- Integration tests for execution flow

---

### Phase 2: Server Relay (happy-server)

**Timeline:** Week 3-4

**New Files:**
```
sources/app/resources/
├── types.ts              → Re-export from daemon types
├── list-commands.ts      → Relay to daemon
├── list-skills.ts        → Relay to daemon
├── list-mcp-servers.ts   → Relay to daemon
├── execute-command.ts    → Relay with auth
├── invoke-skill.ts       → Relay with auth
├── query-execution.ts    → Relay to daemon
├── cancel-execution.ts   → Relay to daemon
├── stream-output.ts      → WebSocket proxy
└── rate-limit.ts         → User rate limiting
```

**Modified Files:**
```
sources/app/auth/auth.ts      → Already has token verification
sources/index.ts              → Register new routes
```

**Key Tasks:**
1. Create Fastify routes with Zod validation
2. Implement auth middleware (reuse existing)
3. Add rate limiting per user
4. Proxy requests to daemon with user context
5. Setup WebSocket proxy for streaming
6. Implement audit logging

**Deliverables:**
- All API endpoints documented with OpenAPI
- Postman collection for testing
- End-to-end integration tests
- Deployment documentation

---

### Phase 3: Mobile Integration

**Timeline:** Week 5-6

**Tasks:**
1. Generate TypeScript SDK from OpenAPI spec
2. Implement authentication flow in mobile app
3. Build command/skill discovery UI
4. Add execution monitoring UI
5. Implement WebSocket streaming
6. Add error handling and retry logic
7. User acceptance testing

**Deliverables:**
- Mobile SDK package
- UI mockups and implementation
- User guide documentation
- Beta testing with users

---

## Testing Strategy

### Unit Tests

**Daemon (happy-cli):**
```typescript
// commands.test.ts
describe('Command Discovery', () => {
  test('parses command metadata correctly', async () => {
    const metadata = await parseCommandFile('build.md');
    expect(metadata.name).toBe('build');
    expect(metadata.category).toBe('Development');
    expect(metadata.waveEnabled).toBe(true);
  });

  test('handles malformed markdown gracefully', async () => {
    const metadata = await parseCommandFile('broken.md');
    expect(metadata).toHaveProperty('error');
  });
});

// security.test.ts
describe('Security Validation', () => {
  test('rejects blacklisted commands', () => {
    const config = { blacklist: { enabled: true, commands: ['rm'] }};
    expect(() => validateCommand('rm', config)).toThrow('COMMAND_BLACKLISTED');
  });

  test('allows whitelisted commands', () => {
    const config = { whitelist: { enabled: true, commands: ['build'] }};
    expect(() => validateCommand('build', config)).not.toThrow();
  });
});

// executor.test.ts
describe('Execution Engine', () => {
  test('executes command and captures output', async () => {
    const result = await executeCommand({
      command: 'test',
      timeout: 5000
    });
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
  });

  test('handles timeout correctly', async () => {
    const result = await executeCommand({
      command: 'slow-task',
      timeout: 100
    });
    expect(result.status).toBe('timeout');
  });
});
```

**Server (happy-server):**
```typescript
// list-commands.test.ts
describe('POST /api/v1/resources/commands/list', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/v1/resources/commands/list');
    expect(res.status).toBe(401);
  });

  test('returns command list for valid token', async () => {
    const token = await createToken('user123');
    const res = await request(app)
      .post('/api/v1/resources/commands/list')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.commands).toBeInstanceOf(Array);
  });

  test('enforces rate limiting', async () => {
    const token = await createToken('user123');
    const requests = Array(101).fill(null).map(() =>
      request(app)
        .post('/api/v1/resources/commands/list')
        .set('Authorization', `Bearer ${token}`)
    );
    const results = await Promise.all(requests);
    const rateLimited = results.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
// end-to-end.test.ts
describe('Command Execution Flow', () => {
  test('full flow: discovery → execution → streaming → completion', async () => {
    // 1. List commands
    const listRes = await api.listCommands({ filter: { category: 'Development' }});
    expect(listRes.commands.length).toBeGreaterThan(0);

    // 2. Execute command
    const execRes = await api.executeCommand({
      command: 'build',
      args: ['production']
    });
    expect(execRes.executionId).toBeDefined();

    // 3. Stream output
    const messages = [];
    await api.streamExecution(execRes.executionId, (msg) => {
      messages.push(msg);
    });

    // 4. Verify completion
    const completeMsg = messages.find(m => m.type === 'complete');
    expect(completeMsg).toBeDefined();
    expect(completeMsg.data.status).toBe('completed');
  });
});
```

### Load Tests

```typescript
// load.test.ts
describe('Performance Under Load', () => {
  test('handles 100 concurrent discovery requests', async () => {
    const requests = Array(100).fill(null).map(() =>
      api.listCommands()
    );
    const results = await Promise.all(requests);
    const succeeded = results.filter(r => r.commands).length;
    expect(succeeded).toBeGreaterThanOrEqual(95); // 95% success rate
  });

  test('handles 10 concurrent executions', async () => {
    const executions = Array(10).fill(null).map(() =>
      api.executeCommand({ command: 'test' })
    );
    const results = await Promise.all(executions);
    const succeeded = results.filter(r => r.executionId).length;
    expect(succeeded).toBe(10);
  });
});
```

### Security Tests

```typescript
// security.test.ts
describe('Security Controls', () => {
  test('prevents command injection', async () => {
    const res = await api.executeCommand({
      command: 'build; rm -rf /',
      args: []
    });
    expect(res.error?.code).toBe('INVALID_COMMAND');
  });

  test('validates token before execution', async () => {
    api.setToken('invalid-token');
    const res = await api.executeCommand({ command: 'build' });
    expect(res.error?.code).toBe('UNAUTHORIZED');
  });

  test('enforces command blacklist', async () => {
    const res = await api.executeCommand({ command: 'rm' });
    expect(res.error?.code).toBe('COMMAND_BLACKLISTED');
  });
});
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All unit tests passing (>95% coverage)
- [ ] Integration tests passing
- [ ] Load tests completed successfully
- [ ] Security audit completed
- [ ] API documentation finalized
- [ ] OpenAPI spec generated
- [ ] Mobile SDK built and tested
- [ ] Rate limiting tested and tuned
- [ ] Audit logging verified
- [ ] Error handling comprehensive

### Configuration

- [ ] `daemon-config.json` created with production values
- [ ] `server-config.json` updated with API settings
- [ ] Environment variables documented
- [ ] Security whitelist/blacklist configured
- [ ] Rate limits tuned for production load
- [ ] Timeout values optimized

### Monitoring

- [ ] Execution metrics tracked (duration, success rate)
- [ ] Error rate monitoring enabled
- [ ] Resource usage monitoring (CPU, memory)
- [ ] Audit log rotation configured
- [ ] Alerting setup for critical errors

### Documentation

- [ ] API reference published
- [ ] Mobile integration guide complete
- [ ] Troubleshooting guide created
- [ ] Security best practices documented
- [ ] Rate limiting explained to users

---

## Future Enhancements

### Phase 4: Advanced Features

**Priority 1:**
- Command history and favorites
- Execution templates (saved configurations)
- Batch command execution
- Scheduled executions

**Priority 2:**
- Command composition (chains)
- Custom command creation from mobile
- Execution analytics and insights
- Collaborative execution (share results)

**Priority 3:**
- Voice command support
- AI-powered command suggestions
- Execution optimization recommendations
- Resource usage predictions

---

## Appendix

### Configuration Examples

**daemon-config.json:**
```json
{
  "resourceApi": {
    "enabled": true,
    "commandsDir": "~/.claude/commands",
    "skillsDir": "~/.claude/skills",
    "mcpConfigPath": "~/.config/claude/mcp_settings.json",
    "security": {
      "whitelist": {
        "enabled": false,
        "commands": []
      },
      "blacklist": {
        "enabled": true,
        "commands": ["rm", "sudo", "chmod", "chown"]
      },
      "requireApproval": {
        "enabled": true,
        "commands": ["deploy", "publish", "delete"]
      },
      "maxConcurrentExecutions": 5,
      "maxExecutionTime": 600000
    },
    "execution": {
      "timeout": 300000,
      "maxConcurrent": 5,
      "retainLogs": true,
      "logRetentionDays": 7
    },
    "audit": {
      "enabled": true,
      "logPath": ".logs/resource-api-audit.log"
    }
  }
}
```

**server-config.json:**
```json
{
  "resourceApi": {
    "enabled": true,
    "daemonUrl": "http://127.0.0.1:${DAEMON_PORT}",
    "rateLimit": {
      "discovery": {
        "windowMs": 60000,
        "maxRequests": 100
      },
      "execution": {
        "windowMs": 60000,
        "maxRequests": 10
      },
      "streaming": {
        "concurrent": 5
      }
    },
    "audit": {
      "enabled": true,
      "logPath": ".logs/resource-api-audit.log"
    }
  }
}
```

### OpenAPI Specification

See separate file: `openapi.yaml` (to be generated)

### Mobile SDK Reference

See separate repository: `happy-mobile-sdk` (to be created)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-26
**Authors:** Backend Architecture Team
**Status:** Ready for Implementation
