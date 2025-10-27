# SDK Integration Analysis

## File Structure Discovery
- SDK integration in `/src/claude/sdk/` directory
- Key files:
  - `index.ts` - Main exports
  - `types.ts` - Type definitions (196 lines)
  - `query.ts` - Core query implementation (401 lines)

## Model Configuration Findings

### Current Model Support (from query.ts)
```typescript
// Line 273: model parameter in QueryOptions
model?: string

// Line 291: Model passed to Claude Code CLI
if (model) args.push('--model', model)

// Line 274: Fallback model support
fallbackModel?: string

// Line 312: Fallback model argument
args.push('--fallback-model', fallbackModel)
```

### Critical Discovery
**The SDK wrapper does NOT handle model identifiers directly**. It passes the `--model` flag to the underlying `@anthropic-ai/claude-code` executable. This means:

1. Model support is determined by the Claude Code package version
2. happy-cli SDK wrapper is model-agnostic (good!)
3. Integration requires checking/updating `@anthropic-ai/claude-code` dependency

### QueryOptions Interface (types.ts lines 157-176)
```typescript
export interface QueryOptions {
    abort?: AbortSignal
    allowedTools?: string[]
    appendSystemPrompt?: string
    customSystemPrompt?: string
    cwd?: string
    disallowedTools?: string[]
    executable?: string
    executableArgs?: string[]
    maxTurns?: number
    mcpServers?: Record<string, unknown>
    pathToClaudeCodeExecutable?: string
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
    continue?: boolean
    resume?: string
    model?: string            // ← Model selection
    fallbackModel?: string    // ← Fallback model
    strictMcpConfig?: boolean
    canCallTool?: CanCallToolCallback
}
```

## Next Steps
1. Check package.json for @anthropic-ai/claude-code version
2. Verify if SDK version supports Sonnet 4.5 and Code 2.0.1+
3. If not, update SDK dependency
4. Test model selection with new identifiers