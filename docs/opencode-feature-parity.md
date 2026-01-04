# OpenCode Feature Parity Analysis

This document compares the OpenCode integration with Claude Code and Codex implementations to identify gaps and feature parity.

## Summary

OpenCode support is **~90% complete** compared to Claude/Codex implementations. The core functionality and mobile UX enrichment (reasoning processor) are in place, with only minor advanced features missing.

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
| Reasoning Processor | ❌ | ✅ | ✅ | Complete |
| Diff Processor | ❌ | ✅ | ❌ | **MISSING** (ACP may not emit diff events) |
| Special Commands | ✅ | ❌ | ❌ | **MISSING** |
| Hook Server | ✅ | ❌ | ❌ | **MISSING** |
| Caffeinate (prevent sleep) | ✅ | ✅ | ✅ | Complete |
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
**Status:** COMPLETE ✅

**What it does:**
- Processes streaming thinking events from ACP
- Identifies reasoning sections with `**[Title]**` format
- Sends `CodexReasoning` tool calls for titled reasoning
- Handles reasoning completion and abort
- Forwards thinking events to mobile app
- Shows thinking preview in terminal UI

**Implementation:**
- File: `src/opencode/utils/reasoningProcessor.ts` (~280 lines)
- Integration: In `runOpenCode.ts` message handler, processes `event` type with `name === 'thinking'`
- Tests: 16 unit tests + 6 integration tests

### 2. Diff Processor
**Status:** NOT IMPLEMENTED (May not be feasible)

**What it does:**
- Tracks `unified_diff` field in `turn_diff` messages
- Sends `CodexDiff` tool calls when diff changes
- Marks diffs as completed

**Impact:** Low-Medium - Mobile app won't see structured diff information

**Note:** OpenCode via ACP doesn't emit `turn_diff` events like Codex MCP does. Options:
1. Skip (files still work, just no mobile diff view)
2. Track file writes via tool-result events and synthesize diffs (complex)
3. Add file watcher (overkill)

**Implementation complexity:** Low if events exist, High otherwise
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
**Status:** COMPLETE ✅

**What it does:**
- `startCaffeinate()` called at startup to prevent system sleep
- `stopCaffeinate()` called on cleanup

**Implementation:**
- Added `startCaffeinate()` call after keepAlive setup in `runOpenCode.ts`

## Recommendations

### Priority 1: Completed

1. ~~**Add startCaffeinate()**~~ ✅ Done
   - Prevents system sleep during long tasks

### Priority 2: Low Impact

2. **Add Special Commands**
   - Nice to have for CLI users

3. **Add Custom Env Vars/Args**
   - Advanced users only

4. **Add Hook Server**
   - Git workflow integration

### Completed

- ✅ **Reasoning Processor** - Shows structured reasoning in mobile app
  - Implemented in `src/opencode/utils/reasoningProcessor.ts`
  - Wired into `runOpenCode.ts` message handler
  - 22 tests (16 unit + 6 integration)

## Implementation Order

1. **Quick Win (5 minutes):**
   - Add `startCaffeinate()` call in `runOpenCode.ts`

2. **Optional Enhancements:**
   - Special commands parsing
   - Custom env vars/args
   - Hook server support
   - Diff processor (if ACP adds `turn_diff` events)

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
    ├── runOpenCode.ts            ✅ Core complete with reasoning
    ├── utils/
    │   ├── permissionHandler.ts  ✅ Complete
    │   ├── reasoningProcessor.ts ✅ Complete (ported from Codex)
    │   └── config.ts             ✅ Complete
    └── types.ts                  ✅ Complete
```

## Code Statistics

| Agent | Main File | Utils Files | Total Lines | Test Coverage |
|-------|-----------|-------------|-------------|---------------|
| Claude | ~400 | ~2000 | ~2400 | ✅ Yes |
| Codex | ~600 | ~400 | ~1000 | ✅ Yes |
| OpenCode | ~700 | ~500 | ~1200 | ✅ Yes (81 tests) |

## Conclusion

OpenCode integration is **functionally complete** for core use cases with enhanced mobile app experience. The remaining gaps are:
1. System sleep prevention (easy fix - add `startCaffeinate()`)
2. Diff processor (blocked on ACP not emitting `turn_diff` events)
3. Advanced workflow integration (hooks, special commands)

The implementation follows the same patterns as Codex, making it straightforward to add missing features when needed.
