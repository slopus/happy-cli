# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.0] - TBD

### Changed - BREAKING

- **SDK Migration**: Migrated from `@anthropic-ai/claude-code@2.0.14` to `@anthropic-ai/claude-agent-sdk@^0.1.0`
- **System Prompt API Unified**: Replaced dual system prompt options (`customSystemPrompt` + `appendSystemPrompt`) with single `systemPrompt` field
  - **Migration**: Concatenate multiple prompts with newlines: `systemPrompt: prompt1 + '\n\n' + prompt2`
  - **Affected interfaces**: `QueryOptions`, `EnhancedMode`, `MessageMeta`
  - **Affected files**: `src/claude/sdk/types.ts`, `src/claude/loop.ts`, `src/api/types.ts`, `src/claude/sdk/query.ts`, `src/claude/claudeRemote.ts`, `src/claude/runClaude.ts`

### Updated

- Package dependencies: `@anthropic-ai/claude-agent-sdk@^0.1.0` (replacing `@anthropic-ai/claude-code`)
- Launcher scripts to import from new SDK package
- All SDK message type imports updated
- CLI argument building to use `--system-prompt` flag
- Test suites updated for new API

### Fixed

- Build succeeds with no TypeScript errors
- All tests pass (105 tests)

## [0.11.2] - 2025-01-XX

### Previous Version

See git history for changes before v0.12.0.
