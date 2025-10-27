# Model Selection Flow Analysis

## Complete Data Flow Path

### 1. Entry Point: StartOptions (runClaude.ts)
```typescript
export interface StartOptions {
    model?: string  // Line 27
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    // ...
}
```

### 2. State Management (runClaude.ts)
```typescript
// Line 160: Track current model state
let currentModel = options.model;

// Line 184-192: Model can be updated from user messages
if (message.meta?.hasOwnProperty('model')) {
    messageModel = message.meta.model || undefined;
    currentModel = messageModel;
    logger.debug(`[loop] Model updated from user message: ${messageModel || 'reset to default'}`);
}
```

### 3. EnhancedMode Creation (runClaude.ts)
```typescript
// Line 280-288: Enhanced mode with all options
const enhancedMode: EnhancedMode = {
    permissionMode: messagePermissionMode || 'default',
    model: messageModel,  // ← Model flows here
    fallbackModel: messageFallbackModel,
    customSystemPrompt: messageCustomSystemPrompt,
    appendSystemPrompt: messageAppendSystemPrompt,
    allowedTools: messageAllowedTools,
    disallowedTools: messageDisallowedTools
};
```

### 4. SDK Options Preparation (claudeRemote.ts)
```typescript
// Line 110-127: SDK options creation
const sdkOptions: Options = {
    cwd: opts.path,
    resume: startFrom ?? undefined,
    mcpServers: opts.mcpServers,
    permissionMode: initial.mode.permissionMode === 'plan' ? 'plan' : 'default',
    model: initial.mode.model,  // ← Model passed to SDK
    fallbackModel: initial.mode.fallbackModel,  // ← Fallback also supported
    // ... other options
}
```

### 5. SDK Query Call (claudeRemote.ts)
```typescript
// Line 152-155: Final SDK invocation
const response = query({
    prompt: messages,
    options: sdkOptions,  // ← Contains model selection
});
```

## Critical Findings

### Model Selection is Fully Abstracted
✓ happy-cli does NOT hardcode any model identifiers
✓ Model selection flows through from user input to SDK
✓ Dynamic model switching supported via message metadata
✓ Fallback model also supported

### Integration Implications
1. **NO CODE CHANGES needed for model selection logic**
2. **SDK v2 should work** if it maintains the same interface
3. **Breaking changes** will be in SDK internals, not model selection
4. **New models** automatically available once SDK updated

### Potential Breaking Change Areas
Based on SDK usage pattern analysis:
1. Query function signature (unlikely to break)
2. QueryOptions interface fields (possible additions/removals)
3. SDKMessage type structure (possible schema changes)
4. Control request/response protocol (possible changes)
5. Permission handling interface (possible changes)

### Files Using SDK Directly
1. `/src/claude/claudeRemote.ts` - Primary SDK usage
2. `/src/claude/sdk/query.ts` - SDK wrapper implementation  
3. `/src/claude/sdk/types.ts` - Type definitions
4. All files in `/src/claude/sdk/` directory

## Migration Risk Assessment
**Risk Level**: MEDIUM (was HIGH, now downgraded)

**Rationale**:
- Model selection abstraction means no hardcoded changes needed
- Main risk is SDK interface breaking changes
- happy-cli SDK wrapper may need updates
- Existing code structure is well-architected for changes

## Next Analysis Steps
1. Analyze SDK v2 changelog for exact breaking changes
2. Map breaking changes to happy-cli SDK wrapper code
3. Identify required updates to SDK wrapper
4. Plan migration with minimal disruption