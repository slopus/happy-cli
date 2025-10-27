# Resource Exposure API Design

## Overview
Mobile app needs to discover and invoke CLI commands, skills, and MCP servers on host machine through relay server architecture.

## Architecture
```
Mobile App ←→ happy-server (relay) ←→ happy-cli daemon (host)
```

## Security Model
- Reuse existing Bearer token auth from happy-server
- Rate limiting: 10 requests/min for execution endpoints
- Command whitelist/blacklist configuration
- Audit logging for all executions
- No privilege escalation allowed

## RPC Methods Specification

### 1. list-commands
Enumerates available CLI commands from ~/.claude/commands/

**Request Schema:**
```typescript
interface ListCommandsRequest {
  filter?: {
    category?: string;    // e.g., "Development", "Quality"
    search?: string;      // Search in command names/descriptions
  };
  limit?: number;         // Default: 100
  offset?: number;        // For pagination
}
```

**Response Schema:**
```typescript
interface CommandMetadata {
  name: string;              // e.g., "build"
  path: string;              // Relative path from commands dir
  category: string;          // From markdown frontmatter
  description: string;       // From file content
  purpose?: string;          // From frontmatter
  waveEnabled?: boolean;     // From frontmatter
  arguments?: {
    name: string;
    required: boolean;
    description?: string;
  }[];
  flags?: {
    name: string;
    description?: string;
    type: 'boolean' | 'string' | 'number';
  }[];
}

interface ListCommandsResponse {
  commands: CommandMetadata[];
  total: number;
  hasMore: boolean;
}
```

### 2. list-skills
Enumerates installed Claude Skills from ~/.claude/skills/

**Request Schema:**
```typescript
interface ListSkillsRequest {
  filter?: {
    location?: 'user' | 'project' | 'plugin';
    search?: string;
  };
  limit?: number;
  offset?: number;
}
```

**Response Schema:**
```typescript
interface SkillMetadata {
  name: string;              // e.g., "cloudflare-d1"
  description: string;       // From markdown
  location: 'user' | 'project' | 'plugin';
  path: string;              // Full path to skill file
  triggers?: string[];       // When to activate
  capabilities?: string[];   // What it can do
  gitignored?: boolean;      // From location marker
}

interface ListSkillsResponse {
  skills: SkillMetadata[];
  total: number;
  hasMore: boolean;
}
```

### 3. list-mcp-servers
Enumerates MCP servers with their available tools

**Request Schema:**
```typescript
interface ListMcpServersRequest {
  includeTools?: boolean;    // Default: true
  filter?: {
    enabled?: boolean;
    search?: string;
  };
}
```

**Response Schema:**
```typescript
interface McpServerMetadata {
  name: string;              // e.g., "filesystem", "sequential-thinking"
  enabled: boolean;
  transport: {
    type: 'stdio' | 'sse';
    command?: string;        // For stdio
    args?: string[];
    url?: string;            // For sse
  };
  tools?: {
    name: string;
    description: string;
    inputSchema: any;        // JSON Schema
  }[];
  resources?: {
    uri: string;
    name: string;
    description?: string;
  }[];
}

interface ListMcpServersResponse {
  servers: McpServerMetadata[];
  total: number;
}
```

### 4. execute-command
Executes a CLI command with arguments

**Request Schema:**
```typescript
interface ExecuteCommandRequest {
  command: string;           // Command name
  args?: string[];           // Command arguments
  flags?: Record<string, any>;
  directory?: string;        // Working directory
  timeout?: number;          // Max execution time (ms)
  sessionId?: string;        // Reuse existing session
}
```

**Response Schema:**
```typescript
interface ExecuteCommandResponse {
  executionId: string;       // Unique ID for this execution
  status: 'started' | 'completed' | 'failed' | 'timeout';
  sessionId?: string;        // Claude session ID if spawned
  output?: string;           // Command output (if completed)
  error?: string;            // Error message (if failed)
  exitCode?: number;
  startedAt: number;         // Unix timestamp
  completedAt?: number;
}
```

### 5. invoke-skill
Invokes a Claude Skill with context

**Request Schema:**
```typescript
interface InvokeSkillRequest {
  skill: string;             // Skill name
  context?: {
    files?: string[];        // Files to include in context
    message?: string;        // User message to skill
  };
  sessionId?: string;        // Reuse existing Claude session
}
```

**Response Schema:**
```typescript
interface InvokeSkillResponse {
  executionId: string;
  status: 'started' | 'completed' | 'failed';
  sessionId: string;         // Claude session ID
  output?: string;           // Skill output
  error?: string;
  startedAt: number;
  completedAt?: number;
}
```

### 6. stream-output
Real-time command/skill output streaming via WebSocket or SSE

**WebSocket Message Schema:**
```typescript
interface StreamMessage {
  executionId: string;
  type: 'stdout' | 'stderr' | 'status' | 'error' | 'complete';
  data: string | {
    status: 'running' | 'completed' | 'failed';
    exitCode?: number;
    error?: string;
  };
  timestamp: number;
}
```

## Error Codes and Handling

```typescript
enum ApiErrorCode {
  // Validation errors (400)
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_COMMAND = 'INVALID_COMMAND',
  INVALID_SKILL = 'INVALID_SKILL',
  MISSING_REQUIRED_ARG = 'MISSING_REQUIRED_ARG',
  
  // Auth errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  
  // Permission errors (403)
  COMMAND_BLACKLISTED = 'COMMAND_BLACKLISTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Resource errors (404)
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  MCP_SERVER_NOT_FOUND = 'MCP_SERVER_NOT_FOUND',
  
  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Execution errors (500)
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: any;
  timestamp: number;
}
```

## Security and Rate Limiting

### Authentication
```typescript
// Reuse existing Bearer token from happy-server
interface AuthMiddleware {
  verifyToken(token: string): Promise<{ userId: string } | null>;
  invalidateToken(token: string): void;
}
```

### Rate Limiting Strategy
```typescript
interface RateLimitConfig {
  discovery: {
    windowMs: 60000;        // 1 minute
    maxRequests: 100;       // 100 requests per minute
  };
  execution: {
    windowMs: 60000;
    maxRequests: 10;        // 10 executions per minute
  };
  streaming: {
    concurrent: 5;          // Max 5 concurrent streams
  };
}
```

### Command Whitelist/Blacklist
```typescript
interface SecurityConfig {
  whitelist?: {
    enabled: boolean;
    commands: string[];     // Only these commands allowed
  };
  blacklist?: {
    enabled: boolean;
    commands: string[];     // These commands forbidden
  };
  requireApproval?: {
    enabled: boolean;
    commands: string[];     // Commands needing user approval
  };
}
```

### Audit Logging
```typescript
interface AuditLog {
  timestamp: number;
  userId: string;
  action: 'list-commands' | 'list-skills' | 'execute-command' | 'invoke-skill';
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

## Implementation Plan

### Phase 1: happy-cli daemon extension
**Files to create:**
- `src/daemon/resource-api/commands.ts` - Command discovery
- `src/daemon/resource-api/skills.ts` - Skill discovery  
- `src/daemon/resource-api/mcp-servers.ts` - MCP enumeration
- `src/daemon/resource-api/executor.ts` - Execution engine
- `src/daemon/resource-api/types.ts` - Shared types
- `src/daemon/resource-api/security.ts` - Security layer

**Files to modify:**
- `src/daemon/controlServer.ts` - Add new RPC endpoints

### Phase 2: happy-server relay implementation
**Files to create:**
- `sources/app/resources/list-commands.ts`
- `sources/app/resources/list-skills.ts`
- `sources/app/resources/list-mcp-servers.ts`
- `sources/app/resources/execute-command.ts`
- `sources/app/resources/invoke-skill.ts`
- `sources/app/resources/stream-output.ts`
- `sources/app/resources/types.ts`
- `sources/app/resources/rate-limit.ts`

**Files to modify:**
- `sources/app/auth/auth.ts` - Already has token verification

### Phase 3: Mobile integration
**API Endpoints (happy-server):**
```
POST /api/resources/commands/list
POST /api/resources/skills/list
POST /api/resources/mcp-servers/list
POST /api/resources/command/execute
POST /api/resources/skill/invoke
WS   /api/resources/stream/:executionId
```

## Data Flow Example

### Execute Command Flow
```
1. Mobile App → POST /api/resources/command/execute
   Headers: { Authorization: "Bearer <token>" }
   Body: { command: "build", args: ["--target", "production"] }

2. happy-server validates:
   - Token authentication
   - Rate limiting
   - Command whitelist

3. happy-server → happy-cli daemon:
   POST http://localhost:<daemon-port>/resource-api/execute
   Body: { command: "build", args: [...], userId: "user123" }

4. happy-cli daemon:
   - Validates command exists
   - Spawns Claude session
   - Executes command
   - Returns execution ID

5. happy-server → Mobile App:
   { executionId: "exec_123", status: "started", sessionId: "sess_456" }

6. Mobile App → WS /api/resources/stream/exec_123
   - Receives real-time output
```

## Configuration Files

### daemon-config.json (happy-cli)
```json
{
  "resourceApi": {
    "enabled": true,
    "commandsDir": "~/.claude/commands",
    "skillsDir": "~/.claude/skills",
    "security": {
      "whitelist": {
        "enabled": false,
        "commands": []
      },
      "blacklist": {
        "enabled": true,
        "commands": ["rm", "sudo"]
      }
    },
    "execution": {
      "timeout": 300000,
      "maxConcurrent": 5
    }
  }
}
```

### server-config.json (happy-server)
```json
{
  "resourceApi": {
    "enabled": true,
    "rateLimit": {
      "discovery": { "windowMs": 60000, "maxRequests": 100 },
      "execution": { "windowMs": 60000, "maxRequests": 10 }
    },
    "audit": {
      "enabled": true,
      "logPath": ".logs/resource-api-audit.log"
    }
  }
}
```

## Testing Strategy

### Unit Tests
- Command/skill/MCP discovery logic
- Security validation
- Rate limiting
- Error handling

### Integration Tests
- End-to-end command execution
- WebSocket streaming
- Token authentication
- Error scenarios

### Load Tests
- Rate limit enforcement
- Concurrent execution limits
- Memory usage under load

## Deployment Considerations

1. **Backward Compatibility**: All endpoints versioned (`/api/v1/resources/...`)
2. **Graceful Degradation**: If daemon unavailable, return cached metadata
3. **Monitoring**: Track execution times, error rates, resource usage
4. **Documentation**: OpenAPI spec for mobile team integration
