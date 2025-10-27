# Package.json Dependency Analysis

## Current Versions
- **Package Name**: happy-coder
- **Current Version**: 0.10.1
- **Repository**: slopus/happy-cli

## Critical Dependencies
```json
"@anthropic-ai/claude-code": "1.0.120"
"@anthropic-ai/sdk": "0.56.0"
```

## Version Bump Plan
**From**: 0.10.1
**To**: 0.11.0 (minor version bump for new model features)

**Rationale**: Adding Claude Sonnet 4.5 and Code 2.0.1+ support constitutes new functionality without breaking changes, following semantic versioning.

## SDK Update Strategy
1. Check npm registry for latest @anthropic-ai/claude-code version
2. Verify changelog includes Sonnet 4.5 and Code 2.0.1+ models
3. Update dependency in package.json
4. Test compatibility with existing happy-cli code
5. Verify 1M context window support

## Related Files to Update
- `package.json` (line 3): version field
- `package.json` (line 71): @anthropic-ai/claude-code dependency

## Commit Strategy
Separate commits for:
1. "chore: update @anthropic-ai/claude-code to support new models"
2. "feat: add Claude Sonnet 4.5 model support"
3. "feat: add Claude Code 2.0.1+ model support"
4. "feat: implement 1M token context window support"
5. "chore: bump version to 0.11.0"