# OpenCode ACP Message Format Migration

## Summary

Convert all OpenCode ACP outbound events from `sendCodexMessage()` to `sendClaudeSessionMessage()` with Claude output format to match CloudCode behavior in Happy UI mobile app.

## Problem

OpenCode ACP currently sends all outbound events (tool-call, tool-result, status, thinking, permission, error) via `session.sendCodexMessage()`, which wraps raw JSON as `content.type: 'codex'`. The mobile Happy UI displays this raw JSON instead of formatted text. CloudCode sends messages via `session.sendClaudeSessionMessage()` which formats them as Claude RawJSONLines with `content.type: 'output'`, resulting in proper UI rendering.

## Solution

Migrate all outbound OpenCode messages to use `session.sendClaudeSessionMessage()` and format them as Claude-style assistant text messages. Create or import `formatToolResult()` utility to convert tool results to human-readable summaries.

## Architecture

### Components

1. **formatToolResult utility** (`src/opencode/utils/toolResultFormatter.ts`)
   - Converts raw tool result data to human-readable summary
   - Truncates to 1000 characters with ellipsis for large results
   - Returns `{ summary: string }` structure

2. **Message handler changes** (`src/opencode/runOpenCode.ts`)
   - Replace all `session.sendCodexMessage()` calls with `session.sendClaudeSessionMessage()`
   - Format each event type as assistant text message

### Data Flow

```
OpenCode ACP → AgentBackend.onMessage() → setupOpenCodeMessageHandler()
    → Event processing (tool-call/tool-result/status/permission/event)
        → formatToolResult() for tool results
            → session.sendClaudeSessionMessage({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '...' }] })
                → Happy UI mobile (renders formatted text)
```

## Implementation Changes

### 1. Import formatToolResult

Add import in `src/opencode/runOpenCode.ts`:
```typescript
import { formatToolResult } from './utils/toolResultFormatter';
```

### 2. Replace sendCodexMessage with sendClaudeSessionMessage

Replace all `session.sendCodexMessage()` calls:

**Tool calls:**
```typescript
session.sendClaudeSessionMessage({
  type: 'assistant',
  message: {
    id: randomUUID(),
    parentUuid: undefined,
    role: 'assistant',
    content: [{
      type: 'text',
      text: `Tool call: ${msg.toolName}${msg.args ? ` ${JSON.stringify(msg.args).substring(0, 100)}...` : ''}`
    }]
  }
});
```

**Tool results:**
```typescript
const formatted = formatToolResult(msg.toolName, msg.result);
session.sendClaudeSessionMessage({
  type: 'assistant',
  message: {
    id: randomUUID(),
    parentUuid: undefined,
    role: 'assistant',
    content: [{
      type: 'text',
      text: `Tool result: ${msg.toolName} — ${formatted.summary}`
    }]
  }
});
```

**Status messages (task_started, turn_aborted, error):**
```typescript
session.sendClaudeSessionMessage({
  type: 'assistant',
  message: {
    id: randomUUID(),
    parentUuid: undefined,
    role: 'assistant',
    content: [{
      type: 'text',
      text: msg.type === 'task_started' ? 'Task started' : 'Turn aborted'
    }]
  }
});
```

**Permission requests:**
```typescript
session.sendClaudeSessionMessage({
  type: 'assistant',
  message: {
    id: randomUUID(),
    parentUuid: undefined,
    role: 'assistant',
    content: [{
      type: 'text',
      text: `Permission requested: Tool "${msg.toolName}" - ${msg.reason || 'Requires approval'}`
    }]
  }
});
```

**Thinking events:**
```typescript
session.sendClaudeSessionMessage({
  type: 'assistant',
  message: {
    id: randomUUID(),
    parentUuid: undefined,
    role: 'assistant',
    content: [{
      type: 'text',
      text: thinkingText
    }]
  }
});
```

**User messages:** remain unchanged - already using `sendClaudeSessionMessage()` via API layer

### 3. Remove sendCodexMessage usage from OpenCode

After migration, search for and remove any remaining `sendCodexMessage()` calls in OpenCode files to ensure consistency.

## Error Handling

- Continue to handle errors gracefully with formatted text messages
- Log formatting errors before crashing
- Maintain UUID chaining for UI threading (set `parentUuid` from accumulated state)

## Testing

1. Verify all event types are properly formatted as assistant text messages
2. Test large tool result truncation (1000 chars + ellipsis)
3. Verify mobile UI displays formatted text instead of raw JSON
4. Ensure UUID chaining is preserved for conversation threading

## Files Modified

- `src/opencode/runOpenCode.ts` - Replace all `sendCodexMessage()` with `sendClaudeSessionMessage()`
- `src/opencode/utils/permissionHandler.ts` - Update to use `sendClaudeSessionMessage()`
- `src/opencode/utils/toolResultFormatter.ts` - Copy from main repo (already exists)
