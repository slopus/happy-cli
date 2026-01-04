# OpenCode Mobile Experience Parity Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ReasoningProcessor and DiffProcessor to OpenCode integration so mobile app displays structured reasoning sections and file diffs like Codex does.

**Approach:** Direct port from Codex/Gemini implementations, adapted for ACP backend event types.

**Estimated effort:** 2-3 hours

---

## Table of Contents

1. [Background](#background)
2. [Current State Analysis](#current-state-analysis)
3. [Implementation Plan](#implementation-plan)
4. [Testing Strategy](#testing-strategy)

---

## Background

### What These Processors Do

**ReasoningProcessor** (`src/codex/utils/reasoningProcessor.ts`):
- Accumulates `agent_reasoning_delta` events
- Identifies sections starting with `**[Title]**` pattern
- Converts titled reasoning into `CodexReasoning` tool calls for mobile app
- Sends untitled reasoning as `reasoning` messages

**DiffProcessor** (`src/codex/utils/diffProcessor.ts`):
- Tracks `turn_diff.unified_diff` field changes
- Sends `CodexDiff` tool calls when diff content changes
- Resets on task completion or abort

### Mobile App Benefit

Without these processors, OpenCode streams raw text. With them:
- Reasoning sections appear as collapsible tool-call blocks
- File diffs display in structured diff viewer
- Better UX parity with Codex sessions

---

## Current State Analysis

### ACP Backend Event Types

The `AcpSdkBackend` emits these relevant events:

| Event | Source | Currently Handled in runOpenCode? |
|-------|--------|-----------------------------------|
| `thinking` (via `agent_thought_chunk`) | ACP session updates | No - ignored |
| `thinking` (via `update.thinking`) | ACP session updates | No - ignored |
| `model-output` with `**Title**` pattern | Message chunks | No - passed through raw |

### Codex vs OpenCode Event Mapping

| Codex MCP Event | ACP Equivalent | Notes |
|-----------------|----------------|-------|
| `agent_reasoning_delta` | `thinking` event payload | Text chunks |
| `agent_reasoning` | `thinking` complete | Full text |
| `agent_reasoning_section_break` | No direct equivalent | Infer from new `**` pattern |
| `turn_diff` | No direct equivalent | May need file watcher or skip |

### Key Finding

OpenCode via ACP doesn't emit `turn_diff` events like Codex MCP does. Options:
1. Skip DiffProcessor for now (files still work, just no mobile diff view)
2. Track file writes via tool-result events and synthesize diffs
3. Add file watcher (complex, overkill)

**Recommendation:** Skip DiffProcessor initially, focus on ReasoningProcessor which has clear event mapping.

---

## Implementation Plan

### Phase 1: Copy ReasoningProcessor to OpenCode

**Task 1.1: Create OpenCode ReasoningProcessor**

Copy `src/codex/utils/reasoningProcessor.ts` to `src/opencode/utils/reasoningProcessor.ts`.

Modifications needed:
- Rename class to `OpenCodeReasoningProcessor`
- Update logger prefix from `[ReasoningProcessor]` to `[OpenCodeReasoningProcessor]`
- Tool call name stays `CodexReasoning` (mobile app expects this)

**Task 1.2: Wire Processor into runOpenCode.ts**

In `src/opencode/runOpenCode.ts`:

1. Import processor:
```typescript
import { OpenCodeReasoningProcessor } from './utils/reasoningProcessor';
```

2. Create instance after permission handler:
```typescript
const reasoningProcessor = new OpenCodeReasoningProcessor((message) => {
  session.sendCodexMessage(message);
});
```

3. Handle `event` messages in `setupOpenCodeMessageHandler`:
```typescript
case 'event':
  if (msg.name === 'thinking' && msg.payload?.text) {
    reasoningProcessor.processChunk(msg.payload.text);
  }
  break;
```

4. Complete reasoning on status idle:
```typescript
if (msg.status === 'idle' || msg.status === 'stopped') {
  reasoningProcessor.complete();
  // ... existing code
}
```

5. Abort reasoning on abort/error:
```typescript
async function handleAbort() {
  // ... existing code
  reasoningProcessor.abort();
}
```

6. Reset on turn end:
```typescript
} finally {
  permissionHandler.reset();
  reasoningProcessor.abort();
  // ... existing code
}
```

### Phase 2: Add Tests

**Task 2.1: Unit Tests for OpenCodeReasoningProcessor**

Create `src/opencode/utils/reasoningProcessor.test.ts`:
- Test title detection (`**Title**` pattern)
- Test tool call emission
- Test abort behavior
- Test section break handling

**Task 2.2: Integration Test**

Add test case to `src/opencode/__tests__/integration/session/messageFlow.test.ts`:
- Verify reasoning events produce tool calls
- Verify reasoning completes on idle

### Phase 3: Optional - DiffProcessor

**Task 3.1: Evaluate Diff Event Availability**

Run OpenCode session and log all ACP events to determine if any contain diff information.

If diff info available:
- Copy `DiffProcessor` from Codex
- Wire similarly to ReasoningProcessor

If not available:
- Document gap in `opencode-feature-parity.md`
- Consider future enhancement via tool-result file tracking

---

## Testing Strategy

### Manual Testing

1. Start OpenCode session: `./bin/happy.mjs opencode`
2. Send prompt that triggers reasoning: "Explain how the permission system works"
3. Verify mobile app shows:
   - Collapsible reasoning blocks (if titled)
   - Reasoning messages (if untitled)

### Automated Testing

Run existing test suite plus new tests:
```bash
yarn test src/opencode/__tests__
```

### Verification Checklist

- [ ] ReasoningProcessor copied and renamed
- [ ] Processor wired into runOpenCode.ts message handler
- [ ] Reasoning completes on idle status
- [ ] Reasoning aborts on abort/error
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual test shows reasoning in mobile app

---

## Files to Modify

| File | Action |
|------|--------|
| `src/opencode/utils/reasoningProcessor.ts` | Create (copy from codex) |
| `src/opencode/utils/reasoningProcessor.test.ts` | Create |
| `src/opencode/runOpenCode.ts` | Modify (wire processor) |
| `src/opencode/index.ts` | Modify (export processor) |
| `docs/opencode-feature-parity.md` | Update (mark reasoning complete) |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ACP doesn't emit thinking events | Low | Already confirmed in AcpSdkBackend |
| Mobile app doesn't recognize tool calls | Low | Using same `CodexReasoning` name |
| Performance impact from processing | Very Low | Processor is lightweight |

---

## Success Criteria

1. OpenCode sessions show structured reasoning in mobile app
2. All existing tests continue to pass
3. New unit/integration tests for reasoning processor pass
4. No performance regression in streaming
