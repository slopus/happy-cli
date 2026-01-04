# ACP Protocol Architecture Analysis

> **Goal:** Document architectural differences between Happy CLI's ACP implementation and OpenCode's native ACP implementation to guide future decisions.

**Date:** 2026-01-04

## Overview

This analysis compares two implementations of the Agent Client Protocol (ACP):

1. **Happy CLI's `AcpSdkBackend`** (`my-happy-cli/src/agent/acp/AcpSdkBackend.ts`)
   - Spawns `opencode acp` command as child process
   - Uses `ClientSideConnection` from `@agentclientprotocol/sdk`
   - Acts as **client** to OpenCode's server

2. **OpenCode's native implementation** (`opencode/packages/opencode/src/cli/cmd/acp.ts`)
   - Implements full ACP **server** using `AgentSideConnection`
   - Sophisticated session management, tool lifecycle
   - Native OpenCode features (summarize, compact, etc.)

---

## Architectural Comparison

### Role in ACP Communication

| Aspect | Happy CLI | OpenCode |
|---------|-----------|------------|
| **ACP Role** | **Client** - spawns OpenCode process | **Server** - accepts client connections |
| **Connection** | Connects to `opencode acp` process via stdin/stdout | Listens for connections, creates `AgentSideConnection` |
| **Control Flow** | Happy → OpenCode (send requests) | Client → OpenCode (send requests) |
| **SDK Usage** | `ClientSideConnection` from `@agentclientprotocol/sdk` | `AgentSideConnection` from `@agentclientprotocol/sdk` |

### Session Management

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Session Storage** | Single `acpSessionId: string` | Full `ACPSessionManager` class |
| **Session State** | Minimal (ID only) | Complex: models, modes, creation time |
| **Session Modes** | None | `setSessionMode` - change modes mid-session |
| **Session History** | None | Full message replay on `loadSession` |
| **Session Persistence** | External (`~/.happy-dev/opencode-sessions.json`) | Internal to OpenCode's session storage |
| **Default Model** | Reads from env/config | Complex provider/model resolution |

### Permission Handling

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Approach** | Basic handler function | Permission modes: once, always, reject |
| **Options** | Basic approve/deny | Three modes stored in `PermissionOption` array |
| **Timeout** | Configurable per-tool timeout | No timeout handling |
| **User Interaction** | Mobile app sends response | Terminal-based auth prompts |
| **Persistence** | None (mobile-driven) | Terminal authentication (`opencode auth login`) |

### Tool Call Support

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Lifecycle** | Basic (call → result) | Full: pending → in_progress → completed/error |
| **Status Updates** | Basic tool calls | Detailed: status, location tracking, metadata |
| **Edit/Diff** | None (via file watching) | Native: `oldText`/`newText` with diffs |
| **Locations** | Basic path extraction | Sophisticated: `toLocations` function |
| **Todo Integration** | None | Parses `todowrite` output, sends plan |

### Terminal Commands

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Command Parsing** | None | Full parser (name + args) |
| **Built-in Commands** | None | `compact`, `summarize`, `list` |
| **Command Discovery** | None | Lists available commands, adds `compact` |
| **Integration** | None | Executes commands via SDK |

### Session Features

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Summarize** | None | `summarize` condenses conversation history |
| **Compact** | None | `compact` removes old messages |
| **List Sessions** | None | Lists all sessions via SDK |
| **Delete Sessions** | None | Delete sessions via SDK |
| **History Replay** | None | Full message replay on session load |

### MCP Server Management

| Feature | Happy CLI | OpenCode |
|---------|-----------|------------|
| **Server Types** | Local only | Both local (command) and remote (URL) |
| **Connection Types** | Local only | HTTP + SSE support |
| **Environment** | Passes env vars to process | Full environment variable support |
| **Headers** | None | HTTP headers for remote MCPs |
| **Startup** | Pass to `opencode acp` args | Dynamic loading via API |

---

## Code Complexity Comparison

### Lines of Code

| Component | Happy CLI | OpenCode |
|-----------|-----------|------------|
| ACP Implementation | ~750 lines | ~1,050 lines |
| Session Management | ~50 lines | ~200+ lines |
| Permission Handling | ~100 lines | ~150+ lines |
| Tool Processing | ~150 lines | ~400+ lines |

### Dependencies

| Dependency | Happy CLI | OpenCode |
|-----------|-----------|------------|
| ACP SDK | `@agentclientprotocol/sdk` (client) | `@agentclientprotocol/sdk` (server) |
| OpenCode SDK | `@opencode-ai/sdk/v2` | Built-in (self) |
| Session Store | Simple JSON file | Full database/storage |
| Configuration | Minimal | Complex provider/mode system |

---

## Trade-offs: Why Happy CLI Uses Thin Wrapper

### Advantages

1. **Simplicity**
   - Clear separation between Happy CLI and OpenCode
   - Happy CLI manages its session, OpenCode manages its own
   - No cross-cutting concerns

2. **Isolation**
   - Happy CLI changes don't break OpenCode's internal flows
   - OpenCode updates don't affect Happy CLI's architecture
   - Independent development cycles

3. **Maintainability**
   - Smaller codebase to understand
   - Clear responsibility boundaries
   - Easier to test in isolation

4. **Focus on Happy-Specific Features**
   - Mobile app integration (Socket.IO, encryption, push notifications)
   - Permission UI (mobile approval, not terminal)
   - Session resumption (Happy-level persistence)
   - Caffeinate (sleep prevention)

### Disadvantages

1. **Missing OpenCode Features**
   - Session modes (yolo, safe, etc.)
   - Terminal commands (`compact`, `summarize`, `list`)
   - Advanced edit/diff support
   - Todo integration
   - Model switching mid-session

2. **Limited Direct Control**
   - Must work through OpenCode's public API
   - Can't access internal OpenCode state
   - Dependent on OpenCode's interface design

3. **Duplication**
   - Some features implemented in both places
   - Session persistence (Happy + OpenCode)
   - Permission handling (Happy + OpenCode)

---

## Design Decision: Keep Thin Wrapper

### Rationale

**Happy CLI's primary use case** is controlling agents through the mobile app and providing Happy CLI's own session management. The features we implement (mobile UX, permissions, session resumption) are **Happy-specific**, not OpenCode-specific.

OpenCode's advanced features (session modes, terminal commands, summarize) are **OpenCode-specific** and are better handled by:
- **Direct OpenCode usage** - Users can run `opencode` directly for these features
- **Future OpenCode mobile app** - If OpenCode adds mobile support, it will include these features

**Conclusion:** Our thin wrapper approach is appropriate for Happy CLI's role and goals.

---

## Potential Enhancements (If Needed)

### 1. Add Basic Terminal Command Support

**Goal:** Allow Happy CLI to send special commands to OpenCode

**Implementation:**
```typescript
interface AcpSdkBackendOptions {
  // ... existing fields
  initialCommand?: string;  // e.g., "compact", "summarize"
}
```

**Complexity:** Low - parse commands from user input, send via `prompt()`

### 2. Add Session Mode Support

**Goal:** Allow mobile app to set "yolo" mode for fewer permission prompts

**Implementation:**
```typescript
// Extend Happy session metadata to track mode
interface SessionMetadata {
  opencodeMode?: 'default' | 'yolo' | 'safe';
  // ... existing fields
}
```

**Complexity:** Medium - requires session state management in Happy

### 3. Add Edit/Diff Tracking

**Goal:** Track file edits for mobile app display

**Implementation:**
- Parse `tool_call_update` events with `kind: "edit"`
- Extract `oldText` and `newText` from content
- Emit `AgentMessage` with type `fs-edit`

**Complexity:** Medium - requires parsing OpenCode's diff format

### 4. Add Todo Support

**Goal:** Display todos from OpenCode in mobile app

**Implementation:**
- Detect `tool_call_update` events with `toolName: "todowrite"`
- Parse JSON output for todos
- Emit `AgentMessage` with plan entries

**Complexity:** Medium - requires JSON parsing and plan formatting

---

## Recommendations

### Short Term

1. **Keep Current Architecture** - Thin wrapper is sufficient for current needs
2. **Document Missing Features** - Add to OpenCode feature parity doc
3. **Monitor OpenCode Evolution** - Watch for ACP protocol updates

### Long Term

1. **Evaluate ACP Evolution** - If protocol gains capabilities, consider adopting
2. **Cross-Agent Patterns** - If adding support for other ACP agents, extract shared code
3. **Mobile App Features** - Coordinate with mobile team on session mode/terminal command support

---

## OpenCode Features Not in Happy (Priority Order)

| Priority | Feature | Benefit | Effort |
|---------|---------|-----------|--------|
| Low | Terminal Commands | Direct control without mobile | Medium |
| Low | Summarize | Condense conversations | Medium |
| Low | Session Modes | Fewer permission prompts | High |
| Medium | Edit/Diff | Better mobile UX | Medium |
| Medium | Todo Support | Task management | Medium |
| Low | Session List | Manage sessions | Low |

---

## Conclusion

Happy CLI's ACP implementation follows a **client-server pattern** where:
- **Happy CLI** = Client that spawns and controls OpenCode
- **OpenCode** = Server with full ACP capabilities

This architectural separation is **intentional** and provides:
- Simplicity and maintainability
- Clear responsibility boundaries
- Focus on Happy-specific features (mobile integration, permissions)

OpenCode's implementation serves as a **reference** for what's possible with ACP. Any future enhancements should consider:
- Whether the feature is Happy-specific or OpenCode-specific
- The complexity trade-offs of adopting OpenCode's patterns
- Coordination with OpenCode's roadmap

**Recommendation:** Keep thin wrapper, document architectural decisions, add features incrementally based on user demand.
