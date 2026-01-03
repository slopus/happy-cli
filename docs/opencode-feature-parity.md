# OpenCode Feature Parity Analysis

This document compares the OpenCode integration with Claude Code and Codex implementations to identify gaps and feature parity.

## Summary

OpenCode support is **~80% complete** compared to Claude/Codex implementations. The core functionality is in place, but some advanced features are missing.

## Feature Comparison Matrix

| Feature Category | Claude | Codex | OpenCode | Status |
|-----------------|--------|-------|----------|--------|
| **Core Integration** |
| ACP Backend Support | ✅ | ✅ | ✅ | Complete |
| Session Management | ✅ | ✅ | ✅ | Complete |
| Message Queue | ✅ | ✅ | ✅ | Complete |
| Model Selection | ✅ | ✅ | ✅ | Complete (via config) |
| MCP Server Merging | ✅ | ✅ | ✅ | Complete |
| **UI Components** |
| Ink Display | ✅ | ✅ | ✅ | Complete |
| Message Buffer | ✅ | ✅ | ✅ | Complete |
| Terminal Output | ✅ | ✅ | ✅ | Complete |
| Ctrl-C Handling | ✅ | ✅ | ✅ | Complete |
| **Permission Handling** |
| Permission Modes | ✅ | ✅ | ✅ | Complete |
| Yolo Mode | ✅ | ✅ | ✅ | Complete |
| Safe-Yolo Mode | ✅ | ✅ | ✅ | Complete |
| Read-Only Mode | ✅ | ✅ | ✅ | Complete |
| Default Mode (Mobile) | ✅ | ✅ | ✅ | Complete |
| Write Tool Detection | ✅ | ✅ | ✅ | Complete |
| **Lifecycle Management** |
| Session Initialization | ✅ | ✅ | ✅ | Complete |
| Abort Handling | ✅ | ✅ | ✅ | Complete |
| Kill Session Handler | ✅ | ✅ | ✅ | Complete |
| Cleanup on Exit | ✅ | ✅ | ✅ | Complete |
| Daemon Reporting | ✅ | ✅ | ✅ | Complete |
| Keep-Alive | ✅ | ✅ | ✅ | Complete |
| **Mobile Integration** |
| User Message Handler | ✅ | ✅ | ✅ | Complete |
| Codex Messages | ✅ | ✅ | ✅ | Complete |
| Session Events | ✅ | ✅ | ✅ | Complete |
| Ready Event | ✅ | ✅ | ✅ | Complete |
| Push Notifications | ✅ | ✅ | ✅ | Complete |
| **Advanced Features** |
| Reasoning Processor | ❌ | ✅ | ❌ | **MISSING** |
| Diff Processor | ❌ | ✅ | ❌ | **MISSING** |
| Special Commands | ✅ | ❌ | ❌ | **MISSING** |
| Hook Server | ✅ | ❌ | ❌ | **MISSING** |
| Caffeinate (prevent sleep) | ✅ | ✅ | Partial | **MISSING startCaffeinate** |
| **Message Processing** |
| Text Delta Streaming | ✅ | ✅ | ✅ | Complete |
| Tool Call Display | ✅ | ✅ | ✅ | Complete |
| Tool Result Display | ✅ | ✅ | ✅ | Complete |
| Status Changes | ✅ | ✅ | ✅ | Complete |
| Error Handling | ✅ | ✅ | ✅ | Complete |
| **Configuration** |
| Model via Config | ✅ | ✅ | ✅ | Complete |
| MCP Servers | ✅ | ✅ | ✅ | Complete |
| Custom Env Vars | ✅ | ❌ | ❌ | **MISSING** |
| Custom Args | ✅ | ❌ | ❌ | **MISSING** |
| **Testing** |
| Unit Tests | ✅ | ✅ | ✅ | Complete |
| Integration Tests | ✅ | ✅ | ✅ | Complete |
| Permission Tests | ✅ | ✅ | ✅ | Complete |
| Config Tests | ✅ | ✅ | ✅ | Complete |

## Missing Features Detail

### 1. Reasoning Processor
**Status:** NOT IMPLEMENTED

**What it does:**
- Processes streaming reasoning deltas
- Identifies reasoning sections with `**[Title]**` format
- Sends `CodexReasoning` tool calls for titled reasoning
- Handles reasoning completion and abort

**Impact:** Medium - Users won't see structured reasoning output in the mobile app

**Implementation complexity:** Medium
- File: `src/codex/utils/reasoningProcessor.ts` (~260 lines)
- Integration point: In message handler, process `agent_reasoning_delta` events

### 2. Diff Processor
**Status:** NOT IMPLEMENTED

**What it does:**
- Tracks `unified_diff` field in `turn_diff` messages
- Sends `CodexDiff` tool calls when diff changes
- Marks diffs as completed

**Impact:** Low-Medium - Mobile app won't see structured diff information

**Implementation complexity:** Low
- File: `src/codex/utils/diffProcessor.ts` (~100 lines)
- Integration point: In message handler, process `turn_diff` events

### 3. Special Commands
**Status:** NOT IMPLEMENTED

**What it does:**
- Parses special commands like `/help`, `/status`, `/model`
- Allows runtime configuration changes

**Impact:** Low - Users can still configure via mobile app

**Implementation complexity:** Low
- File: `src/parsers/specialCommands.ts`
- Integration point: In message queue processing

### 4. Hook Server
**Status:** NOT IMPLEMENTED

**What it does:**
- Starts a local HTTP server for git/hooks integration
- Allows Claude to modify git hooks

**Impact:** Low - Only needed for git hook modifications

**Implementation complexity:** Medium
- File: `src/claude/utils/startHookServer.ts`
- Files: `src/claude/utils/generateHookSettings.ts`

### 5. Custom Environment Variables & Arguments
**Status:** NOT IMPLEMENTED

**What it does:**
- Allows passing custom env vars to the agent
- Allows passing custom CLI arguments

**Impact:** Low - OpenCode uses its native config

**Implementation complexity:** Low
- Add to `runOpenCode` options
- Pass to `createOpenCodeBackend`

### 6. Caffeinate (prevent sleep)
**Status:** PARTIAL

**What it does:**
- `stopCaffeinate()` is called
- `startCaffeinate()` is NOT called at startup

**Impact:** Low - System might sleep during long-running tasks

**Implementation complexity:** Very Low
- Add `startCaffeinate()` call at startup

## Recommendations

### Priority 1: High Impact, Low Complexity

1. **Add startCaffeinate()**
   - 1 line change
   - Prevents system sleep during long tasks

2. **Add Diff Processor**
   - ~100 lines
   - Better mobile app experience

### Priority 2: Medium Impact, Medium Complexity

3. **Add Reasoning Processor**
   - ~260 lines
   - Shows reasoning in mobile app

### Priority 3: Low Impact

4. **Add Special Commands**
   - Nice to have for CLI users

5. **Add Custom Env Vars/Args**
   - Advanced users only

6. **Add Hook Server**
   - Git workflow integration

## Implementation Order

1. **Quick Win (5 minutes):**
   - Add `startCaffeinate()` call in `runOpenCode.ts`

2. **Short Task (1-2 hours):**
   - Port `DiffProcessor` from Codex
   - Integrate into message handler

3. **Medium Task (2-4 hours):**
   - Port `ReasoningProcessor` from Codex
   - Integrate into message handler

4. **Optional Enhancements:**
   - Special commands parsing
   - Custom env vars/args
   - Hook server support

## File Structure Comparison

```
src/
├── claude/
│   ├── runClaude.ts              ✅ Full featured
│   ├── loop.ts                   ✅ Complex logic
│   ├── utils/
│   │   ├── startHookServer.ts    ❌ OpenCode missing
│   │   └── ...
│   └── sdk/
│       └── ...
├── codex/
│   ├── runCodex.ts               ✅ Full featured
│   └── utils/
│       ├── reasoningProcessor.ts ❌ OpenCode missing
│       └── diffProcessor.ts      ❌ OpenCode missing
└── opencode/
    ├── runOpenCode.ts            ✅ Core complete, missing extras
    ├── utils/
    │   ├── permissionHandler.ts  ✅ Complete
    │   └── config.ts             ✅ Complete
    └── types.ts                  ✅ Complete
```

## Code Statistics

| Agent | Main File | Utils Files | Total Lines | Test Coverage |
|-------|-----------|-------------|-------------|---------------|
| Claude | ~400 | ~2000 | ~2400 | ✅ Yes |
| Codex | ~600 | ~400 | ~1000 | ✅ Yes |
| OpenCode | ~650 | ~200 | ~850 | ✅ Yes (59 tests) |

## Conclusion

OpenCode integration is **functionally complete** for core use cases. The missing features are primarily:
1. Enhanced mobile app experience (reasoning/diff processors)
2. Advanced workflow integration (hooks, special commands)
3. System sleep prevention (easy fix)

The implementation follows the same patterns as Codex, making it straightforward to add missing features when needed.
