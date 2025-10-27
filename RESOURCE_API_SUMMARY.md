# Resource Exposure API - Design Summary

**Project:** happy-cli (daemon) + happy-server (relay)
**Purpose:** Enable mobile app to discover and invoke CLI commands, skills, and MCP servers
**Status:** ✅ Design Complete - Ready for Implementation

---

## 📋 What Was Delivered

### 1. Complete Type System
**File:** `src/daemon/resource-api/types.ts` ✓ Created

Comprehensive TypeScript type definitions including:
- Command, skill, and MCP metadata types
- Request/response schemas for all endpoints
- Execution lifecycle types
- Security and error types
- Audit logging types
- Configuration types

**Key Types:**
- `CommandMetadata` - Full command information with args/flags
- `SkillMetadata` - Skill discovery and capabilities
- `McpServerMetadata` - MCP server tools and resources
- `ExecutionRecord` - Execution tracking and status
- `ApiError` - Standardized error handling

---

### 2. API Specification Document
**File:** `API_SPECIFICATION.md` ✓ Created

Production-ready API specification with:

#### **RPC Methods:**
1. **list-commands** - Enumerate CLI commands with filtering
2. **list-skills** - Enumerate Claude Code skills
3. **list-mcp-servers** - Enumerate MCP servers with tools
4. **execute-command** - Run commands with real-time streaming
5. **invoke-skill** - Invoke skills with context
6. **query-execution** - Check execution status
7. **cancel-execution** - Cancel running executions
8. **stream-output** - WebSocket streaming

#### **Security Model:**
- Bearer token authentication (reuses existing system)
- Rate limiting: 100/min discovery, 10/min execution
- Command whitelist/blacklist support
- Execution approval workflow
- Comprehensive audit logging

#### **Error Handling:**
- 15 standardized error codes
- Detailed error responses with context
- HTTP status code mapping
- Recovery strategies documented

---

### 3. Implementation Guide
**File:** `IMPLEMENTATION_GUIDE.md` ✓ Created

Step-by-step implementation with code examples:

#### **Daemon Components (happy-cli):**
```
src/daemon/resource-api/
├── types.ts              ✓ Created
├── commands.ts           → Command discovery implementation
├── skills.ts             → Skill enumeration
├── mcp-servers.ts        → MCP introspection
├── executor.ts           → Execution engine with timeout/cancellation
├── security.ts           → Security validation layer
├── rate-limit.ts         → Local rate tracking
└── streaming.ts          → Output streaming
```

#### **Server Components (happy-server):**
```
sources/app/resources/
├── types.ts              → Export daemon types
├── list-commands.ts      → Relay with auth
├── list-skills.ts        → Relay with auth
├── execute-command.ts    → Relay with rate limiting
├── query-execution.ts    → Status queries
├── stream-output.ts      → WebSocket proxy
└── rate-limit.ts         → User rate limiting
```

#### **Code Examples Provided:**
- ✓ Command parsing from markdown
- ✓ Security validation with whitelist/blacklist
- ✓ Execution engine with timeout handling
- ✓ Daemon control server endpoints
- ✓ Server relay with authentication
- ✓ Rate limiting implementation
- ✓ Unit and integration test examples

---

### 4. Memory Storage
**Serena Memory:** `enhancement_c_api_design` ✓ Saved

Complete design documentation stored for future reference including:
- Architecture overview
- All RPC method specifications
- Security model details
- Error handling strategies
- Implementation plan with timelines
- Testing strategies
- Deployment considerations

---

## 🏗️ Architecture Overview

```
┌─────────────────┐
│   Mobile App    │
│                 │
│ - Discover      │
│ - Execute       │
│ - Stream        │
└────────┬────────┘
         │ HTTPS
         │ Bearer Token
         ▼
┌─────────────────┐
│  happy-server   │
│    (relay)      │
│                 │
│ - Auth          │
│ - Rate Limit    │
│ - Audit Log     │
└────────┬────────┘
         │ HTTP
         │ 127.0.0.1
         ▼
┌─────────────────┐
│  happy-cli      │
│   daemon        │
│                 │
│ - Discovery     │
│ - Execution     │
│ - Security      │
└─────────────────┘
```

---

## 🔒 Security Highlights

### Authentication Flow
1. Mobile app includes `Authorization: Bearer <token>` header
2. happy-server validates token via existing `auth.verifyToken()`
3. If valid, forwards request to daemon with `userId`
4. Daemon validates user permissions
5. Execution proceeds if authorized

### Rate Limiting (Per User)
- **Discovery:** 100 requests/minute
- **Execution:** 10 requests/minute
- **Streaming:** 5 concurrent connections
- Returns HTTP 429 when exceeded

### Command Security
```json
{
  "whitelist": { "enabled": false, "commands": [] },
  "blacklist": { "enabled": true, "commands": ["rm", "sudo"] },
  "requireApproval": { "enabled": true, "commands": ["deploy"] }
}
```

### Audit Logging
All executions logged with:
- Timestamp, userId, action, resource
- Success/failure status
- Execution ID, duration, exit code
- Location: `.logs/resource-api-audit.log`

---

## 📊 Request/Response Examples

### List Commands
**Request:**
```json
POST /api/v1/resources/commands/list
Authorization: Bearer <token>

{
  "filter": { "category": "Development" },
  "limit": 50
}
```

**Response:**
```json
{
  "commands": [
    {
      "name": "build",
      "category": "Development",
      "description": "Project builder",
      "waveEnabled": true,
      "arguments": [...],
      "flags": [...]
    }
  ],
  "total": 42,
  "hasMore": false
}
```

### Execute Command
**Request:**
```json
POST /api/v1/resources/command/execute
Authorization: Bearer <token>

{
  "command": "build",
  "args": ["production"],
  "flags": { "optimize": true },
  "streamOutput": true
}
```

**Response:**
```json
{
  "executionId": "exec_abc123",
  "status": "started",
  "sessionId": "sess_xyz789",
  "startedAt": 1698765432000
}
```

### Stream Output (WebSocket)
```
WS /api/v1/resources/stream/exec_abc123
Authorization: Bearer <token>

Messages:
{
  "type": "stdout",
  "data": "Building...\n",
  "timestamp": 1698765433000
}

{
  "type": "complete",
  "data": { "status": "completed", "exitCode": 0 },
  "timestamp": 1698765492000
}
```

---

## ⚠️ Error Handling

### Error Response Format
```json
{
  "error": {
    "code": "COMMAND_NOT_FOUND",
    "message": "Command 'xyz' does not exist",
    "details": { "command": "xyz" },
    "timestamp": 1698765432000
  }
}
```

### Error Codes (15 total)
**Client Errors (4xx):**
- `INVALID_REQUEST` (400)
- `UNAUTHORIZED` (401)
- `COMMAND_BLACKLISTED` (403)
- `COMMAND_NOT_FOUND` (404)
- `RATE_LIMIT_EXCEEDED` (429)

**Server Errors (5xx):**
- `EXECUTION_FAILED` (500)
- `EXECUTION_TIMEOUT` (500)
- `SESSION_SPAWN_FAILED` (500)
- `INTERNAL_ERROR` (500)

---

## 📅 Implementation Plan

### Phase 1: Daemon Extension (Week 1-2)
**Location:** happy-cli/src/daemon/resource-api/

**Tasks:**
- [x] Create type definitions (`types.ts`)
- [ ] Implement command discovery (`commands.ts`)
- [ ] Implement skill enumeration (`skills.ts`)
- [ ] Implement MCP introspection (`mcp-servers.ts`)
- [ ] Build execution engine (`executor.ts`)
- [ ] Add security validation (`security.ts`)
- [ ] Add streaming support (`streaming.ts`)
- [ ] Extend control server with RPC endpoints
- [ ] Write unit tests (>95% coverage)

**Deliverables:**
- All endpoints functional locally
- Comprehensive unit tests
- Integration tests for execution flow

---

### Phase 2: Server Relay (Week 3-4)
**Location:** happy-server/sources/app/resources/

**Tasks:**
- [ ] Create relay endpoints for all RPC methods
- [ ] Implement rate limiting per user
- [ ] Add WebSocket proxy for streaming
- [ ] Integrate with existing auth system
- [ ] Implement audit logging
- [ ] Generate OpenAPI specification
- [ ] Create Postman collection
- [ ] Write integration tests

**Deliverables:**
- Production-ready API endpoints
- Complete API documentation
- End-to-end test suite
- Deployment guide

---

### Phase 3: Mobile Integration (Week 5-6)
**Tasks:**
- [ ] Generate TypeScript SDK from OpenAPI
- [ ] Implement discovery UI
- [ ] Build execution monitoring UI
- [ ] Add WebSocket streaming client
- [ ] Implement error handling and retry logic
- [ ] User acceptance testing

**Deliverables:**
- Mobile SDK package
- UI implementation
- User guide
- Beta testing results

---

## 🧪 Testing Strategy

### Unit Tests
- Command/skill/MCP parsing
- Security validation logic
- Rate limiting behavior
- Error handling

### Integration Tests
- End-to-end command execution
- WebSocket streaming
- Authentication flow
- Rate limit enforcement

### Load Tests
- 100 concurrent discovery requests
- 10 concurrent executions
- Sustained load over 5 minutes

### Security Tests
- Command injection prevention
- Token validation
- Blacklist enforcement
- Privilege escalation prevention

---

## 📦 Configuration Files

### daemon-config.json (happy-cli)
```json
{
  "resourceApi": {
    "enabled": true,
    "commandsDir": "~/.claude/commands",
    "skillsDir": "~/.claude/skills",
    "security": {
      "blacklist": {
        "enabled": true,
        "commands": ["rm", "sudo", "chmod"]
      },
      "maxConcurrentExecutions": 5
    },
    "execution": {
      "timeout": 300000,
      "retainLogs": true
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

---

## 🚀 Quick Start

### For Developers (happy-cli)
```bash
cd /Users/nick/Documents/happy-cli

# Review type definitions
cat src/daemon/resource-api/types.ts

# Implement command discovery
# See IMPLEMENTATION_GUIDE.md for full code

# Run tests
npm test

# Start daemon with resource API
npm run dev
```

### For Developers (happy-server)
```bash
cd /Users/nick/Documents/happy-server

# Create resource endpoints
# See IMPLEMENTATION_GUIDE.md for examples

# Run tests
npm test

# Start server
npm start
```

### For Mobile Developers
```bash
# After API is deployed:

# 1. Install SDK
npm install happy-mobile-sdk

# 2. Initialize client
import { HappyClient } from 'happy-mobile-sdk';
const client = new HappyClient({
  baseUrl: 'https://api.happy.dev',
  token: '<auth-token>'
});

# 3. List commands
const { commands } = await client.listCommands({
  filter: { category: 'Development' }
});

# 4. Execute command
const { executionId } = await client.executeCommand({
  command: 'build',
  args: ['production']
});

# 5. Stream output
await client.streamExecution(executionId, (msg) => {
  console.log(msg.data);
});
```

---

## 📚 Documentation Files

1. **types.ts** - Complete type definitions ✓
2. **API_SPECIFICATION.md** - Full API documentation ✓
3. **IMPLEMENTATION_GUIDE.md** - Step-by-step code examples ✓
4. **RESOURCE_API_SUMMARY.md** - This file ✓
5. **Serena Memory** - `enhancement_c_api_design` ✓

**All files located in:** `/Users/nick/Documents/happy-cli/`

---

## ✅ Design Completeness Checklist

### Core Requirements
- [x] RPC method specifications (8 methods)
- [x] Complete TypeScript type system
- [x] Security model (auth, rate limiting, validation)
- [x] Error handling (15 error codes with recovery)
- [x] Data schemas for all requests/responses
- [x] Audit logging specification

### Implementation Guidance
- [x] File structure defined
- [x] Code examples for key components
- [x] Daemon integration points
- [x] Server relay implementation
- [x] Testing strategy with examples
- [x] Configuration examples

### Documentation
- [x] API endpoint specifications
- [x] Request/response examples
- [x] Error handling patterns
- [x] Security best practices
- [x] Integration plan (daemon → server → mobile)
- [x] Deployment checklist

---

## 🎯 Next Steps

### Immediate Actions
1. **Review** design documents with team
2. **Validate** type definitions align with requirements
3. **Approve** security model and rate limits
4. **Plan** sprint allocation (3 sprints recommended)

### Implementation Priority
1. **Week 1-2:** Implement daemon components
2. **Week 3-4:** Implement server relay
3. **Week 5-6:** Mobile integration
4. **Week 7:** Beta testing and refinement
5. **Week 8:** Production deployment

### Success Criteria
- ✓ All 8 RPC methods functional
- ✓ >95% test coverage
- ✓ <100ms p95 latency for discovery
- ✓ <5s p95 for command execution
- ✓ Zero security vulnerabilities
- ✓ 99.9% uptime in production

---

## 📞 Questions or Feedback?

**Design Documents:**
- Type definitions: `src/daemon/resource-api/types.ts`
- API spec: `API_SPECIFICATION.md`
- Implementation guide: `IMPLEMENTATION_GUIDE.md`
- Memory: Serena `enhancement_c_api_design`

**Ready for Implementation:** ✅
**Status:** Design Phase Complete
**Date:** 2025-10-26

---

*This design provides a production-ready foundation for exposing CLI commands, skills, and MCPs to mobile applications through a secure, scalable relay architecture.*
