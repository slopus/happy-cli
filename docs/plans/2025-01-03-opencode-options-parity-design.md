# OpenCode Options/Suggestion Buttons Feature Parity Design

**Date:** 2025-01-03
**Status:** Design Complete
**Estimated Effort:** 2 hours

## Overview

Add support for suggestion buttons (clickable options) in OpenCode mobile app UI, achieving feature parity with Claude and Gemini agents.

## What Are Options?

Agents can present clickable action buttons to users in the mobile app by including XML in their responses:

```xml
Here are some suggested actions:
<options>
    <option>Implement the fix</option>
    <option>Show me alternatives</option>
    <option>Explain in more detail</option>
</options>
```

The mobile app parses this XML and displays each `<option>` as a clickable button, allowing users to respond quickly without typing.

## Current State

| Agent | Options Support | Status |
|-------|----------------|--------|
| Claude | ✅ Full | Implemented and working |
| Gemini | ✅ Full | Implemented and working |
| OpenCode | ❌ None | Type exists but not integrated |

## Implementation Approach

**Decision:** Port from Gemini (Approach 1)

### Why This Approach?

1. ✅ Proven, tested implementation (~70 lines)
2. ✅ Consistent with existing agents
3. ✅ Fastest to implement (~1 hour)
4. ✅ Low risk (doesn't touch working code)
5. ✅ Same mobile app parsing logic

### Alternative Considered

Extract to shared utility module - rejected due to:
- Requires refactoring working code
- Higher risk
- More testing required
- Small file size = minimal duplication cost

## Type System Changes

### Problem: Type Mismatch

OpenCode's current `CodexMessagePayload` type doesn't match what the mobile app expects:

```typescript
// OpenCode (current) - WRONG
export interface CodexMessagePayload {
  options?: Array<{
    optionId: string;  // ❌ Mobile app doesn't expect this
    name: string;      // ❌ Mobile app doesn't expect this
  }>;
}

// Gemini (working) - CORRECT
export interface CodexMessagePayload {
  options?: string[];  // ✅ Simple string array
}
```

### Solution

Update OpenCode types to match Gemini:

```typescript
// src/opencode/types.ts - UPDATED
export interface CodexMessagePayload {
  type: 'message';
  message: string;
  id: string;
  options?: string[];  // Changed from Array<{optionId, name}>
}
```

## Data Flow

```
┌─────────────────┐
│  OpenCode Agent │
│  (ACP Process)  │
└────────┬────────┘
         │ Generates response with XML
         ▼
┌─────────────────────────────────┐
│     runOpenCode.ts              │
│  Message Handler                │
└────────┬────────────────────────┘
         │
         │ 1. Parse options from text
         │    parseOptionsFromText(responseText)
         ▼
┌─────────────────────────────────┐
│  optionsParser.ts               │
│  - Extract XML <options> block  │
│  - Return { text, options[] }   │
└────────┬────────────────────────┘
         │
         │ 2. Send to mobile app
         ▼
┌─────────────────────────────────┐
│     Mobile App                  │
│  - Displays message text        │
│  - Shows buttons for options    │
└─────────────────────────────────┘
```

## Integration Point

### Location: `runOpenCode.ts` Message Handler

The options parsing needs to be added where text deltas are accumulated and sent to mobile:

```typescript
// In message handler for 'text-delta' events:
case 'text-delta':
  accumulatedResponse += delta.text;
  messageBuffer.addMessage(delta.text, 'text-delta');
  break;

// When response completes (status === 'idle'):
case 'status':
  if (msg.status === 'idle' && accumulatedResponse.trim()) {
    // Parse options from response
    const { text, options } = parseOptionsFromText(accumulatedResponse);

    // Send with options array for mobile UI
    session.sendCodexMessage({
      type: 'message',
      message: text + formatOptionsXml(options),
      options: options,
      id: randomUUID()
    });

    accumulatedResponse = '';
  }
```

## Error Handling

### Edge Cases

| Case | Behavior |
|------|----------|
| Incomplete XML (`<options>` without closing) | Still send message, mobile app handles gracefully |
| Empty options (`<options></options>`) | Returns empty array, no buttons shown |
| No options block | Returns `{text, options:[]}`, normal message flow |
| Malformed XML | Regex extracts valid options, skips malformed ones |
| Special characters | Passed through as-is, mobile app handles encoding |

### Fallback Strategy

```typescript
try {
  const { text, options } = parseOptionsFromText(accumulatedResponse);
  session.sendCodexMessage({
    type: 'message',
    message: text + formatOptionsXml(options),
    options: options,
    id: randomUUID()
  });
} catch (error) {
  logger.warn('[OpenCode] Failed to parse options, sending plain message:', error);
  // Fallback: send message without options
  session.sendCodexMessage({
    type: 'message',
    message: accumulatedResponse,
    id: randomUUID()
  });
}
```

## Files to Create/Modify

### New Files (2)

1. **`src/opencode/utils/optionsParser.ts`** (~70 lines)
   - Port from `src/gemini/utils/optionsParser.ts`
   - Functions: `parseOptionsFromText()`, `hasIncompleteOptions()`, `formatOptionsXml()`

2. **`src/opencode/utils/optionsParser.test.ts`** (~100 lines)
   - Unit tests for parser functions

### Modified Files (3)

3. **`src/opencode/types.ts`**
   - Update `CodexMessagePayload.options` type from `Array<{optionId, name}>` to `string[]`

4. **`src/opencode/runOpenCode.ts`**
   - Import parser functions
   - Add options parsing in message handler
   - Update `sendCodexMessage` calls to include `options` array

5. **`src/opencode/runOpenCode.integration.test.ts`**
   - Add integration test for options flow

## Testing Strategy

### Unit Tests

```typescript
describe('parseOptionsFromText', () => {
  it('should parse options from valid XML');
  it('should return empty options when no XML present');
  it('should handle incomplete options block');
  it('should handle empty options block');
  it('should trim whitespace from options');
});

describe('formatOptionsXml', () => {
  it('should format options array as XML');
  it('should return empty string for empty array');
});
```

### Integration Test

```typescript
describe('Options parsing integration', () => {
  it('should send codex message with parsed options');
});
```

### Manual Testing

1. Start OpenCode session: `./bin/happy.mjs opencode`
2. Send prompt that generates options
3. Verify buttons appear in mobile app
4. Click buttons and verify responses

## Success Criteria

- ✅ OpenCode responses with `<options>` XML display as buttons in mobile app
- ✅ All tests pass (unit + integration)
- ✅ No regression in existing OpenCode functionality
- ✅ Consistent behavior with Gemini/Claude agents

## Next Steps

After completing this feature:

1. **Phase 2:** Reasoning & Diff Processors (~4 hours)
   - Add `OpenCodeReasoningProcessor` for structured reasoning
   - Add `OpenCodeDiffProcessor` for diff tracking
   - Enhanced mobile app UX

2. **Phase 3:** Remaining Gaps
   - Caffeinate fix (5 min) - prevent system sleep
   - Special commands (1 hour) - `/help`, `/status`, `/model`
   - Hook server (2 hours, optional) - git hooks integration

## Implementation Checklist

- [ ] Create `src/opencode/utils/optionsParser.ts`
- [ ] Update `src/opencode/types.ts` (CodexMessagePayload)
- [ ] Update `src/opencode/runOpenCode.ts` (message handler)
- [ ] Create `src/opencode/utils/optionsParser.test.ts`
- [ ] Update `src/opencode/runOpenCode.integration.test.ts`
- [ ] Run tests: `yarn test`
- [ ] Manual testing with mobile app
- [ ] Update `docs/opencode-feature-parity.md`
