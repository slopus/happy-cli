# Product Requirements Document: Claude Agent SDK Migration

## Project Overview

**Project Name:** Migrate from @anthropic-ai/claude-code to @anthropic-ai/claude-agent-sdk
**Version:** 0.12.0 (Breaking Changes)
**Priority:** High
**Status:** Planning

## Executive Summary

Happy CLI currently uses `@anthropic-ai/claude-code` SDK v2.0.14. Anthropic has renamed and updated this to `@anthropic-ai/claude-agent-sdk` with breaking changes and improved capabilities. This migration is necessary to stay current with Anthropic's official SDK and unlock new features.

## Background

The Claude Code SDK was renamed to Claude Agent SDK in September 2025. The new SDK includes:
- Breaking API changes around system prompts
- New default behaviors (no filesystem settings by default)
- Improved programmatic API options
- Better TypeScript type safety
- Enhanced agent capabilities beyond just coding

Our current implementation:
- Spawns Claude Code CLI as child process
- Custom SDK wrapper in `src/claude/sdk/`
- Uses both `customSystemPrompt` and `appendSystemPrompt`
- Integrates with Happy mobile app for remote control
- Supports both local (interactive) and remote (SDK) modes

## Goals & Objectives

### Primary Goals
1. Migrate to `@anthropic-ai/claude-agent-sdk` v0.1.0+
2. Adopt unified `systemPrompt` API (breaking change)
3. Explore programmatic API to reduce CLI spawning overhead
4. Maintain backward compatibility where reasonable
5. Keep all existing features working (local, remote, MCP, permissions)

### Success Criteria
- All tests pass with new SDK
- Local and remote modes work identically to current
- MCP server integration unaffected
- Permission handling flow preserved
- Documentation updated with migration guide
- No performance regression

## Technical Requirements

### Dependency Updates

**Package Changes:**
- Remove: `@anthropic-ai/claude-code: 2.0.14`
- Add: `@anthropic-ai/claude-agent-sdk: ^0.1.0`
- Verify: `@anthropic-ai/sdk: 0.65.0` compatibility

**Import Updates Required:**
- `src/utils/MessageQueue.ts` - Import from new package
- `scripts/claude_remote_launcher.cjs` - Update CLI import
- `scripts/claude_local_launcher.cjs` - Update CLI import
- `src/claude/sdk/*.ts` - All SDK type imports

### Breaking API Changes

#### 1. System Prompt Unification

**Current API (Deprecated):**
```typescript
interface QueryOptions {
  customSystemPrompt?: string  // Replace entire system prompt
  appendSystemPrompt?: string  // Append to default system prompt
}
```

**New API:**
```typescript
interface QueryOptions {
  systemPrompt?: string | { type: 'preset', preset: 'claude_code' }
}
```

**Migration Strategy:**
- Remove `appendSystemPrompt` entirely (BREAKING)
- Rename `customSystemPrompt` to `systemPrompt`
- Update all call sites to use new option
- Default behavior: empty system prompt (user chose new defaults)

**Files Requiring Changes:**
1. `src/claude/sdk/types.ts` - Update `QueryOptions` interface
2. `src/claude/loop.ts` - Update `EnhancedMode` interface
3. `src/api/types.ts` - Update Zod schemas for API communication
4. `src/claude/sdk/query.ts` - Update CLI arg building (lines 261-262, 288-289)
5. `src/claude/claudeRemote.ts` - Update system prompt handling (lines 117-118)
6. `src/claude/runClaude.ts` - Update all system prompt logic (lines 152-154, 194-220, 253-254, etc.)
7. `src/utils/MessageQueue2.test.ts` - Update test types
8. All integration tests

#### 2. Filesystem Settings Behavior

**Change:** SDK no longer reads CLAUDE.md, settings.json by default

**Decision:** Accept new defaults (no filesystem settings)

**Impact:**
- Users must explicitly enable if needed
- Document this breaking change
- No code changes required for this decision
- Future: Add opt-in `settingSources: ['user', 'project', 'local']` if requested

### Programmatic API Exploration

#### Current Architecture
```
happy-cli → spawn claude CLI → stdout/stdin IPC → parse JSON
```

#### Investigate New Architecture
```
happy-cli → import SDK → direct function calls → streaming responses
```

**Research Questions:**
1. Can we use `query()` function directly without CLI spawning?
2. Does programmatic API support all features we need?
   - MCP server integration
   - Permission callbacks (`canCallTool`)
   - Session resumption
   - Message streaming
   - Abort/interrupt signals
3. What are performance implications?
4. Does it simplify or complicate our codebase?

**Implementation Strategy:**
- Phase 1: Minimal migration (update imports, fix breaking changes)
- Phase 2: Create experimental programmatic implementation
- Phase 3: Compare both approaches
- Phase 4: Choose best path forward

**Deliverables:**
1. POC implementation in `src/claude/sdk/experimental/programmatic.ts`
2. Comparison document: CLI spawning vs programmatic
3. Decision document with recommendation
4. If programmatic wins: Migration plan for full adoption

### Feature Preservation Requirements

**Must Work Identically:**
1. Local Mode (interactive PTY sessions)
2. Remote Mode (mobile app control via SDK)
3. Session Creation & Resumption
4. Permission Handling System
   - `canCallTool` callback integration
   - Mobile app permission prompts
   - Tool allowlist/denylist
5. Special Commands
   - `/clear` - Reset context
   - `/compact` - Compress context
6. MCP Server Integration
   - Custom MCP servers in config
   - Permission server for tool calls
7. Message Streaming
   - Real-time message delivery to mobile
   - Thinking state tracking
8. Abort/Interrupt Handling
   - Clean cancellation of operations
   - Tool call abortion

### Testing Requirements

#### Unit Tests
- Update all SDK type tests
- Test system prompt migration logic
- Test backward compatibility layers (if any)
- Mock new SDK responses

#### Integration Tests
- Test with actual Claude Agent SDK
- Verify local mode spawning
- Verify remote mode SDK calls
- Test session resumption
- Test MCP server connection
- Test permission flow end-to-end

#### End-to-End Tests
- Complete happy-cli daemon workflow
- Mobile app integration test
- Multiple concurrent sessions
- Session persistence across restarts
- Error handling and recovery

#### Performance Tests
- Measure CLI spawning overhead before/after
- Measure memory usage
- Measure response latency
- Compare programmatic API performance

### Documentation Requirements

#### User-Facing Documentation

**README.md Updates:**
- Update installation instructions
- Note minimum SDK version
- Add migration section for v0.11.x → v0.12.0
- Update examples if syntax changed

**CLAUDE.md Updates:**
- Document breaking changes
- Update system prompt examples
- Add migration guide
- Note filesystem settings behavior change

**CHANGELOG.md:**
```markdown
## v0.12.0 - BREAKING CHANGES

### Changed
- Migrated to @anthropic-ai/claude-agent-sdk
- BREAKING: Replaced customSystemPrompt/appendSystemPrompt with unified systemPrompt
- BREAKING: SDK no longer reads CLAUDE.md/settings.json by default

### Migration Guide
1. Update package: yarn add @anthropic-ai/claude-agent-sdk
2. Replace customSystemPrompt → systemPrompt in your code
3. Remove appendSystemPrompt usage (breaking change)
4. Test your integration thoroughly
```

#### Developer Documentation

**Technical Migration Guide:**
- API mapping: old SDK → new SDK
- Code examples for each breaking change
- Common migration patterns
- Troubleshooting guide

**Architecture Decision Records:**
- ADR: CLI Spawning vs Programmatic API
- ADR: System Prompt API Design
- ADR: Default Behavior Changes

### Release Strategy

#### Version Bump
- Current: v0.11.2
- Target: v0.12.0 (breaking changes)
- Semantic versioning: MAJOR.MINOR.PATCH

#### Release Phases

**Phase 1: Alpha Release (Internal)**
- Complete basic migration
- Update imports and types
- Fix obvious breakages
- Internal testing only

**Phase 2: Beta Release**
- Feature-complete migration
- All tests passing
- Beta tag on npm: `v0.12.0-beta.1`
- Solicit feedback from beta testers
- Document known issues

**Phase 3: Release Candidate**
- Address beta feedback
- Complete documentation
- Final testing pass
- RC tag: `v0.12.0-rc.1`

**Phase 4: Production Release**
- Final verification
- Publish v0.12.0 to npm
- Announce breaking changes
- Monitor for issues
- Hot-fix releases if needed: v0.12.1, v0.12.2

### Risk Assessment & Mitigation

#### Risk 1: CLI Path Changed
**Severity:** High
**Likelihood:** Medium
**Impact:** Complete breakage of local/remote modes
**Mitigation:**
- Verify CLI location immediately after SDK install
- Add explicit path checking in tests
- Fallback error messages with troubleshooting steps

#### Risk 2: MCP Integration Breaks
**Severity:** High
**Likelihood:** Low
**Impact:** Permission system fails, custom MCP servers don't work
**Mitigation:**
- Test MCP connection in alpha phase
- Have rollback plan ready
- Document any MCP-specific changes

#### Risk 3: Permission System Incompatible
**Severity:** Critical
**Likelihood:** Low
**Impact:** Mobile app can't control permissions, security issue
**Mitigation:**
- Keep CLI spawning approach as fallback
- Test permission flow extensively
- Add integration test for permission callbacks

#### Risk 4: Performance Regression
**Severity:** Medium
**Likelihood:** Low
**Impact:** Slower response times, higher memory usage
**Mitigation:**
- Benchmark before/after migration
- Compare CLI vs programmatic performance
- Optimize hot paths if needed

#### Risk 5: Mobile App Compatibility
**Severity:** Critical
**Likelihood:** Low
**Impact:** Happy mobile app stops working
**Mitigation:**
- Test with mobile app early
- Ensure API contract unchanged
- Coordinate release with mobile app updates

#### Risk 6: User Adoption Issues
**Severity:** Medium
**Likelihood:** Medium
**Impact:** Users don't upgrade due to breaking changes
**Mitigation:**
- Clear migration guide
- Automated migration script if possible
- Support both v0.11.x and v0.12.x for transition period

### Implementation Phases

#### Phase 1: Foundation (Package & Imports)
**Goal:** Get project compiling with new SDK
- Update package.json dependencies
- Run yarn install
- Update all import statements
- Fix TypeScript compilation errors
- Verify project builds

**Validation:** `yarn build` succeeds

#### Phase 2: API Migration (Breaking Changes)
**Goal:** Adopt new API patterns
- Update system prompt interfaces
- Migrate `customSystemPrompt` → `systemPrompt`
- Remove `appendSystemPrompt` support
- Update all call sites
- Update SDK query argument building
- Fix all TypeScript type errors

**Validation:** All TypeScript errors resolved

#### Phase 3: Testing & Validation
**Goal:** Ensure feature parity
- Update unit tests
- Run integration tests
- Test local mode (interactive)
- Test remote mode (SDK)
- Test MCP integration
- Test permission flow
- Test session resumption
- Fix all failing tests

**Validation:** `yarn test` passes 100%

#### Phase 4: Programmatic API Research
**Goal:** Explore better integration options
- Create experimental implementation
- Test programmatic `query()` function
- Compare performance: CLI vs programmatic
- Evaluate maintainability
- Document findings
- Make recommendation

**Validation:** Decision document with clear recommendation

#### Phase 5: Documentation
**Goal:** Update all documentation
- Update README.md
- Update CLAUDE.md
- Create migration guide
- Write CHANGELOG
- Update JSDoc comments
- Create ADRs

**Validation:** Documentation review complete

#### Phase 6: Release
**Goal:** Ship to production
- Create release branch
- Tag alpha release
- Internal testing
- Tag beta release
- Gather feedback
- Tag RC release
- Final testing
- Production release v0.12.0

**Validation:** Published to npm, no critical issues

### Out of Scope

The following are explicitly NOT included in this migration:
- New features beyond SDK migration
- UI/UX changes
- Mobile app changes (unless API contract breaks)
- Server-side changes
- Performance optimizations (unless fixing regressions)
- Additional MCP servers
- New permission modes

## Success Metrics

### Functional Metrics
- [ ] All tests pass (100%)
- [ ] Local mode works identically
- [ ] Remote mode works identically
- [ ] MCP integration works
- [ ] Permission flow works
- [ ] Session resumption works
- [ ] Mobile app integration works

### Performance Metrics
- Response latency: No regression (within 5%)
- Memory usage: No regression (within 10%)
- Startup time: No regression (within 5%)

### Quality Metrics
- TypeScript compilation: 0 errors
- Lint errors: 0
- Test coverage: Maintained or improved
- Documentation coverage: 100% of API changes

### Adoption Metrics
- Migration guide completion rate: Track user feedback
- Issue reports: < 5 critical bugs in first week
- User satisfaction: Positive feedback from beta testers

## Acceptance Criteria

### Must Have
- [ ] Package migrated to @anthropic-ai/claude-agent-sdk
- [ ] System prompt API updated to unified pattern
- [ ] All imports updated
- [ ] All tests passing
- [ ] Local mode working
- [ ] Remote mode working
- [ ] MCP integration working
- [ ] Permission system working
- [ ] Documentation updated
- [ ] Migration guide published
- [ ] CHANGELOG updated
- [ ] Version bumped to v0.12.0

### Should Have
- [ ] Programmatic API POC complete
- [ ] Performance comparison documented
- [ ] Decision on CLI vs programmatic made
- [ ] Beta testing feedback incorporated
- [ ] Known issues documented

### Nice to Have
- [ ] Automated migration script
- [ ] Video tutorial for migration
- [ ] Blog post announcing changes
- [ ] Improved error messages
- [ ] Better TypeScript types

## Stakeholders

- **Primary Developer:** (Implementation)
- **Mobile App Team:** (Compatibility testing)
- **Beta Testers:** (Feedback & validation)
- **End Users:** (Migration execution)

## Open Questions

1. Should we maintain backward compatibility shim for `appendSystemPrompt`?
   - **Decision:** No, clean break with v0.12.0

2. Should we enable filesystem settings by default?
   - **Decision:** No, adopt new SDK defaults

3. CLI spawning vs programmatic API?
   - **Decision:** TBD after Phase 4 research

4. Support both v0.11.x and v0.12.x in parallel?
   - **Decision:** TBD based on user feedback

## Appendix

### Current Architecture Overview

```
┌─────────────────┐
│   Happy CLI     │
│   (Node.js)     │
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
┌───▼────┐ ┌──▼─────────┐
│ Local  │ │  Remote    │
│ Mode   │ │  Mode      │
│ (PTY)  │ │  (SDK)     │
└───┬────┘ └──┬─────────┘
    │         │
    │    ┌────▼────────────┐
    │    │ query() spawns  │
    │    │ claude CLI      │
    │    │ child process   │
    │    └────┬────────────┘
    │         │
    └─────────▼─────────────┐
          │ Claude Code SDK  │
          │ (CLI Interface)  │
          └──────────────────┘
```

### Key Files Inventory

**Core SDK Integration:**
- `src/claude/sdk/index.ts` - Public SDK exports
- `src/claude/sdk/query.ts` - Main query implementation (CLI spawning)
- `src/claude/sdk/types.ts` - Type definitions
- `src/claude/sdk/stream.ts` - Stream utilities
- `src/claude/sdk/utils.ts` - Helper functions

**Mode Implementations:**
- `src/claude/claudeLocal.ts` - Local interactive mode
- `src/claude/claudeRemote.ts` - Remote SDK mode
- `src/claude/loop.ts` - Mode switching logic

**Launchers:**
- `scripts/claude_local_launcher.cjs` - Local mode launcher
- `scripts/claude_remote_launcher.cjs` - Remote mode launcher

**Type Dependencies:**
- `src/utils/MessageQueue.ts` - Imports SDK types
- `src/claude/utils/*.ts` - Various utilities using SDK types

### Reference Links

- [Claude Agent SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Migration Guide](https://docs.claude.com/en/docs/claude-code/sdk/migration-guide)
- [API Reference](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Anthropic Blog Post](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-18
**Status:** Ready for Task Parsing
