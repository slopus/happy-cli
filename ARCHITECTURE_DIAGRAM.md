# Resource Exposure API - Architecture Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MOBILE APP                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Discovery   │  │  Execution   │  │   Stream     │         │
│  │     UI       │  │   Monitor    │  │   Output     │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                 │
│                            │                                    │
│                  ┌─────────▼──────────┐                         │
│                  │   HappyClient SDK  │                         │
│                  │  - Auth            │                         │
│                  │  - Rate Limit      │                         │
│                  │  - WebSocket       │                         │
│                  └─────────┬──────────┘                         │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                    HTTPS (Bearer Token)
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                      HAPPY-SERVER (Relay)                        │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Auth           │  │ Rate Limiting  │  │ Audit Logging  │    │
│  │ Middleware     │  │ (per user)     │  │                │    │
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘    │
│           │                   │                   │             │
│           └───────────────────┴───────────────────┘             │
│                              │                                  │
│  ┌───────────────────────────▼───────────────────────────┐     │
│  │            Resource API Endpoints                     │     │
│  │  /commands/list  /skills/list  /mcp-servers/list     │     │
│  │  /command/execute  /skill/invoke  /stream/:id        │     │
│  └───────────────────────────┬───────────────────────────┘     │
└────────────────────────────────┼──────────────────────────────────┘
                                 │
                      HTTP (127.0.0.1 only)
                                 │
┌────────────────────────────────▼──────────────────────────────────┐
│                     HAPPY-CLI DAEMON                              │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Control Server (Port: Dynamic)             │    │
│  │                                                          │    │
│  │  /resource-api/commands/list                            │    │
│  │  /resource-api/skills/list                              │    │
│  │  /resource-api/mcp-servers/list                         │    │
│  │  /resource-api/execute                                  │    │
│  │  /resource-api/execution/query                          │    │
│  │  /resource-api/execution/cancel                         │    │
│  └─────────────────┬───────────────────────────────────────┘    │
│                    │                                             │
│  ┌─────────────────▼───────────────────────────────────────┐    │
│  │            Resource API Components                      │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │    │
│  │  │Commands  │  │ Skills   │  │   MCP    │             │    │
│  │  │Discovery │  │Enumeration│  │Servers   │             │    │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘             │    │
│  │       │             │             │                     │    │
│  │  ┌────▼─────────────▼─────────────▼─────┐             │    │
│  │  │       Execution Engine               │             │    │
│  │  │  - Timeout handling                  │             │    │
│  │  │  - Output streaming                  │             │    │
│  │  │  - Cancellation support              │             │    │
│  │  └────┬─────────────────────────────────┘             │    │
│  │       │                                                │    │
│  │  ┌────▼─────────────────────────────────┐             │    │
│  │  │       Security Validator             │             │    │
│  │  │  - Whitelist/Blacklist               │             │    │
│  │  │  - Argument sanitization             │             │    │
│  │  │  - Concurrent execution limits       │             │    │
│  │  └──────────────────────────────────────┘             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              File System Access                          │    │
│  │                                                          │    │
│  │  ~/.claude/commands/  ~/.claude/skills/                 │    │
│  │  ~/.config/claude/mcp_settings.json                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Command Execution

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │ 1. POST /api/v1/resources/command/execute
       │    Authorization: Bearer <token>
       │    { command: "build", args: ["production"] }
       ▼
┌─────────────────┐
│  happy-server   │
│                 │
│  ┌───────────┐  │
│  │Auth Check │  │ 2. Verify Bearer token
│  └─────┬─────┘  │    → auth.verifyToken(token)
│        ▼        │
│  ┌───────────┐  │
│  │Rate Limit │  │ 3. Check execution rate (10/min)
│  └─────┬─────┘  │    → rateLimitCheck(userId)
│        ▼        │
│  ┌───────────┐  │
│  │Forward to │  │ 4. POST http://127.0.0.1:<port>/resource-api/execute
│  │  Daemon   │  │    { ...request, userId }
│  └─────┬─────┘  │
└────────┼────────┘
         │
         ▼
┌─────────────────┐
│  happy-cli      │
│    daemon       │
│                 │
│  ┌───────────┐  │
│  │ Security  │  │ 5. Validate command
│  │Validation │  │    - Not in blacklist
│  └─────┬─────┘  │    - Sanitize arguments
│        ▼        │
│  ┌───────────┐  │
│  │Command    │  │ 6. Check command exists
│  │Discovery  │  │    → getCommand('build')
│  └─────┬─────┘  │
│        ▼        │
│  ┌───────────┐  │
│  │Execution  │  │ 7. Spawn Claude session
│  │  Engine   │  │    - Create execution record
│  │           │  │    - Start async execution
│  └─────┬─────┘  │    - Return execution ID
│        │        │
│        ▼        │ 8. Return { executionId, status: "started" }
└────────┼────────┘
         │
         ▼
┌─────────────────┐
│  happy-server   │
│                 │
│  ┌───────────┐  │
│  │Audit Log  │  │ 9. Log execution attempt
│  └─────┬─────┘  │    → .logs/audit.log
│        ▼        │
│  ┌───────────┐  │
│  │Return to  │  │ 10. Forward response
│  │  Client   │  │     { executionId: "exec_123" }
│  └─────┬─────┘  │
└────────┼────────┘
         │
         ▼
┌─────────────┐
│ Mobile App  │  11. Display "Execution started"
│             │      Open WebSocket stream
└─────────────┘
```

---

## Data Flow: Real-time Streaming

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │ 1. WS /api/v1/resources/stream/exec_123
       │    Authorization: Bearer <token>
       ▼
┌─────────────────┐
│  happy-server   │
│   (WebSocket    │
│     Proxy)      │
│                 │
│  ┌───────────┐  │
│  │Auth Check │  │ 2. Verify token on connect
│  └─────┬─────┘  │
│        ▼        │
│  ┌───────────┐  │
│  │Connect to │  │ 3. Establish WebSocket to daemon
│  │  Daemon   │  │    ws://127.0.0.1:<port>/stream/exec_123
│  └─────┬─────┘  │
└────────┼────────┘
         │
         ▼
┌─────────────────┐
│  happy-cli      │
│    daemon       │
│                 │
│  ┌───────────┐  │
│  │Execution  │  │ 4. Running command process
│  │  Engine   │  │    - Capture stdout/stderr
│  │           │  │    - Track status changes
│  │  ┌─────┐  │  │
│  │  │Build│  │  │ 5. Send output chunks
│  │  │ ... │  │  │    → WebSocket messages
│  │  └──┬──┘  │  │    { type: "stdout", data: "..." }
│  └─────┼─────┘  │
│        │        │
│        │        │ 6. Send status updates
│        ▼        │    { type: "status", status: "running" }
└────────┼────────┘
         │
         ▼
┌─────────────────┐
│  happy-server   │
│   (Proxy)       │
│                 │
│  ┌───────────┐  │
│  │Forward    │  │ 7. Relay messages to client
│  │Messages   │  │    (no modification)
│  └─────┬─────┘  │
└────────┼────────┘
         │
         ▼
┌─────────────┐
│ Mobile App  │  8. Display output in real-time
│             │     Update progress UI
│             │
│  ┌───────┐  │  9. Command completes
│  │ Build │  │     { type: "complete", exitCode: 0 }
│  │  ✓    │  │
│  └───────┘  │  10. Close WebSocket
└─────────────┘      Show completion status
```

---

## Security Flow: Authentication & Authorization

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │ Request with Bearer token
       │ Authorization: Bearer eyJhbG...
       ▼
┌─────────────────────────────────────┐
│        happy-server                 │
│                                     │
│  ┌─────────────────────────────┐   │
│  │   Auth Middleware           │   │
│  │                             │   │
│  │  1. Extract token           │   │
│  │     from header             │   │
│  │                             │   │
│  │  2. auth.verifyToken()      │   │
│  │     ┌─────────────────┐     │   │
│  │     │ Token Cache     │     │   │
│  │     │ Check           │     │   │
│  │     └────┬────────────┘     │   │
│  │          │                  │   │
│  │          ▼                  │   │
│  │     ┌─────────────────┐     │   │
│  │     │ Valid?          │     │   │
│  │     └────┬────┬───────┘     │   │
│  │          │    │             │   │
│  │        Yes    No            │   │
│  │          │    │             │   │
│  │          │    └──► 401 UNAUTHORIZED
│  │          │                  │   │
│  │          ▼                  │   │
│  │  3. Extract userId          │   │
│  │     from token payload      │   │
│  │                             │   │
│  └────────┬────────────────────┘   │
│           │                        │
│           ▼                        │
│  ┌─────────────────────────────┐   │
│  │   Rate Limiter              │   │
│  │                             │   │
│  │  1. Check limit for userId  │   │
│  │     key: "user123:execution"│   │
│  │                             │   │
│  │  2. Limit exceeded?         │   │
│  │     ┌────────────────┐      │   │
│  │     │ No  │  Yes     │      │   │
│  │     │     │          │      │   │
│  │     ▼     └──► 429 RATE_LIMIT
│  │                             │   │
│  │  3. Increment counter       │   │
│  │                             │   │
│  └────────┬────────────────────┘   │
│           │                        │
│           ▼                        │
│  ┌─────────────────────────────┐   │
│  │   Forward to Daemon         │   │
│  │   with userId context       │   │
│  └────────┬────────────────────┘   │
└───────────┼─────────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│        happy-cli daemon           │
│                                   │
│  ┌─────────────────────────────┐  │
│  │   Security Validator        │  │
│  │                             │  │
│  │  1. Check blacklist         │  │
│  │     command in blacklist?   │  │
│  │     ┌───────────────┐       │  │
│  │     │ No  │  Yes    │       │  │
│  │     │     │         │       │  │
│  │     ▼     └──► 403 BLACKLISTED
│  │                             │  │
│  │  2. Check whitelist         │  │
│  │     (if enabled)            │  │
│  │                             │  │
│  │  3. Check approval needed   │  │
│  │     command needs approval? │  │
│  │     ┌───────────────┐       │  │
│  │     │ No  │  Yes    │       │  │
│  │     │     │         │       │  │
│  │     ▼     └──► 403 REQUIRES_APPROVAL
│  │                             │  │
│  │  4. Sanitize arguments      │  │
│  │     - Remove dangerous chars│  │
│  │     - Prevent injection     │  │
│  │                             │  │
│  │  5. Check execution limits  │  │
│  │     concurrent < max?       │  │
│  │     ┌───────────────┐       │  │
│  │     │ Yes │  No     │       │  │
│  │     │     │         │       │  │
│  │     ▼     └──► 429 RATE_LIMIT
│  │                             │  │
│  └────────┬────────────────────┘  │
│           │                       │
│           ▼                       │
│  ┌─────────────────────────────┐  │
│  │   Execute Command           │  │
│  │   (Authorized)              │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## Component Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    happy-cli daemon                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              resource-api/commands.ts                │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ parseCommandFile()                           │    │  │
│  │  │ - Read ~/.claude/commands/*.md               │    │  │
│  │  │ - Parse YAML frontmatter                     │    │  │
│  │  │ - Extract arguments/flags                    │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ listCommands()                               │    │  │
│  │  │ - Filter, sort, paginate                     │    │  │
│  │  │ - Return CommandMetadata[]                   │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │              resource-api/executor.ts                │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ ExecutionEngine                              │    │  │
│  │  │                                              │    │  │
│  │  │ Dependencies:                                │    │  │
│  │  │ - SecurityValidator (validation)             │    │  │
│  │  │ - Commands (command resolution)              │    │  │
│  │  │ - EventEmitter (streaming)                   │    │  │
│  │  │                                              │    │  │
│  │  │ executeCommand() ──────┐                     │    │  │
│  │  │                        │                     │    │  │
│  │  │ getExecution() ────────┤                     │    │  │
│  │  │                        │                     │    │  │
│  │  │ cancelExecution() ─────┤                     │    │  │
│  │  │                        │                     │    │  │
│  │  │ cleanup() ─────────────┘                     │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │              resource-api/security.ts                │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ SecurityValidator                            │    │  │
│  │  │                                              │    │  │
│  │  │ validateCommand() ──────┐                    │    │  │
│  │  │                         │                    │    │  │
│  │  │ validateExecutionLimits()                    │    │  │
│  │  │                         │                    │    │  │
│  │  │ sanitizeArguments() ────┘                    │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │              daemon/controlServer.ts                 │  │
│  │                                                      │  │
│  │  RPC Endpoints:                                      │  │
│  │  POST /resource-api/commands/list                    │  │
│  │  POST /resource-api/execute                          │  │
│  │  POST /resource-api/execution/query                  │  │
│  │  POST /resource-api/execution/cancel                 │  │
│  │  WS   /resource-api/stream/:id                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    happy-server                             │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              app/auth/auth.ts                        │  │
│  │  (Existing authentication system)                    │  │
│  │                                                      │  │
│  │  verifyToken() ────────► Used by all endpoints       │  │
│  │  createToken() ────────► Token generation            │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │              app/resources/rate-limit.ts             │  │
│  │                                                      │  │
│  │  rateLimitCheck() ─────► Used by execution endpoints │  │
│  └──────────────────┬───────────────────────────────────┘  │
│                     │                                      │
│  ┌──────────────────▼───────────────────────────────────┐  │
│  │              app/resources/*.ts                      │  │
│  │  (Relay endpoints)                                   │  │
│  │                                                      │  │
│  │  Dependencies:                                       │  │
│  │  - auth (token verification)                         │  │
│  │  - rate-limit (execution throttling)                 │  │
│  │  - axios (daemon communication)                      │  │
│  │                                                      │  │
│  │  list-commands.ts ────┐                              │  │
│  │  list-skills.ts ──────┤                              │  │
│  │  list-mcp-servers.ts ─┤─► Forward to daemon          │  │
│  │  execute-command.ts ──┤                              │  │
│  │  stream-output.ts ────┘                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## File System Structure

```
~/.claude/
├── commands/
│   ├── build.md          ─┐
│   ├── test.md           ─┤─► Discovered by
│   ├── deploy.md         ─┤   commands.ts
│   ├── analyze.md        ─┤
│   └── ...               ─┘
│
├── skills/
│   ├── cloudflare-d1.md  ─┐
│   ├── openai-api.md     ─┤─► Discovered by
│   ├── react-hooks.md    ─┤   skills.ts
│   └── ...               ─┘
│
└── CLAUDE.md

~/.config/claude/
└── mcp_settings.json     ──► Discovered by
                              mcp-servers.ts

/Users/nick/Documents/happy-cli/
├── src/daemon/
│   ├── controlServer.ts  ──► HTTP server
│   └── resource-api/
│       ├── types.ts      ──► Type definitions
│       ├── commands.ts   ──► Command discovery
│       ├── skills.ts     ──► Skill enumeration
│       ├── mcp-servers.ts──► MCP introspection
│       ├── executor.ts   ──► Execution engine
│       ├── security.ts   ──► Security validation
│       └── streaming.ts  ──► WebSocket streaming

/Users/nick/Documents/happy-server/
├── sources/app/
│   ├── auth/
│   │   └── auth.ts       ──► Token verification
│   └── resources/
│       ├── types.ts      ──► Type exports
│       ├── rate-limit.ts ──► User rate limiting
│       ├── list-commands.ts
│       ├── list-skills.ts
│       ├── list-mcp-servers.ts
│       ├── execute-command.ts
│       ├── invoke-skill.ts
│       └── stream-output.ts
│
└── .logs/
    └── resource-api-audit.log  ──► Audit trail
```

---

## Execution State Machine

```
                   ┌─────────┐
                   │ Created │
                   └────┬────┘
                        │
                        │ executeCommand()
                        ▼
                   ┌─────────┐
                   │  Queued │
                   └────┬────┘
                        │
                        │ startExecution()
                        ▼
                   ┌─────────┐
                   │ Running │
                   └────┬────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         │ Success      │ Failure      │ Timeout
         ▼              ▼              ▼
    ┌──────────┐   ┌─────────┐   ┌─────────┐
    │Completed │   │ Failed  │   │ Timeout │
    └──────────┘   └─────────┘   └─────────┘
         │              │              │
         └──────────────┴──────────────┘
                        │
                        │ cleanup()
                        ▼
                   ┌─────────┐
                   │ Deleted │
                   └─────────┘

State Transitions:
- created → queued: Execution request accepted
- queued → running: Process spawned
- running → completed: Exit code 0
- running → failed: Exit code != 0 or error
- running → timeout: Exceeded timeout limit
- any → cancelled: User cancellation
- any final state → deleted: After retention period
```

---

## Rate Limiting Windows

```
Time: ──────────────────────────────────────────────►

User: user123
Type: execution (10 req/min)

Window 1: [0s ─────────── 60s]
Requests: ████████░░ (8/10)
          │││││││││
          └─┴─┴─┴─┴─┴─┴─┴─ Request timestamps

Window 2: [60s ────────── 120s]
Requests: ██░░░░░░░░ (2/10)  ← Reset at 60s
          ││
          └─┴─ New window

Window 3: [120s ───────── 180s]
Requests: ███████████ (11/10) ← 11th request BLOCKED
          ││││││││││X
          └─┴─┴─┴─┴─┴─┴─┴─┴─┴─ 11th → 429 RATE_LIMIT_EXCEEDED

Result: Request fails with error
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "resetIn": 45  ← Seconds until window reset
  }
}
```

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-26
**Status:** Design Complete
