# OpenCode Git Hooks and Session Tracking Design

**Date:** 2025-01-03
**Status:** Design Approved, Ready for Implementation
**Estimated Time:** 2.5 hours

## Overview

Implement git hooks (pre-commit test running) and session tracking for OpenCode agent to achieve feature parity with Claude agent.

### Goals

1. **Git Hooks:** Automatically run tests before commits to catch bugs early
2. **Session Tracking:** Capture OpenCode session IDs for better debugging and tracking

### Key Constraints

- OpenCode ACP does **NOT** have Claude-style hook system (no SessionStart hooks)
- OpenCode ACP only provides session ID via `newSession` response
- No fork/resume session detection possible (ACP limitation)
- Design must handle OpenCode's limitations gracefully

---

## Architecture

### Git Hooks Component

```
git commit → .git/hooks/pre-commit → happy git-hook → yarn test → pass/fail
```

**Components:**
- `scripts/git_pre_commit_hook.cjs` - Executable hook script
- `src/opencode/hooks/gitHookManager.ts` - Hook installation/management
- `src/commands/gitHook.ts` - CLI commands

### Session Tracking Component

```
runOpenCode → newSession() → capture sessionId → update session metadata → notify daemon
```

**Components:**
- `src/opencode/hooks/sessionTracker.ts` - Session ID capture and tracking
- Integrated into `src/opencode/runOpenCode.ts`

**Note:** No hook server needed (OpenCode ACP doesn't support hooks like Claude)

---

## File Structure

```
src/opencode/
├── hooks/
│   ├── gitHookManager.ts           # Git hook installation/management
│   ├── gitHookManager.test.ts      # Unit tests
│   ├── gitHook.integration.test.ts # Integration tests
│   ├── sessionTracker.ts           # Session ID capture and tracking
│   └── sessionTracker.test.ts      # Unit tests
├── runOpenCode.ts                  # Integrate session tracker
└── runOpenCode.integration.test.ts # Update tests

src/commands/
└── gitHook.ts                      # CLI commands

scripts/
└── git_pre_commit_hook.cjs         # Git pre-commit hook script
```

---

## Git Hooks Implementation

### Hook Script

**File:** `scripts/git_pre_commit_hook.cjs`

```javascript
#!/usr/bin/env node
/**
 * Git pre-commit hook for Happy CLI
 * Runs yarn test before allowing commits
 */
const { spawnSync } = require('child_process');
const fs = require('fs');

// Check if we're in a git repository
if (!fs.existsSync('.git')) {
  console.error('❌ Not in a git repository');
  process.exit(1);
}

// Check if package.json exists
if (!fs.existsSync('package.json')) {
  console.log('⚠️  No package.json found, skipping tests');
  process.exit(0);
}

// Run tests
console.log('🧪 Running tests...');
const result = spawnSync('yarn', ['test'], {
  stdio: 'inherit',
  shell: true
});

if (result.status !== 0) {
  console.error('\n❌ Pre-commit hook failed: Tests must pass before committing\n');
  process.exit(1);
}

console.log('✅ All tests passed');
```

### Git Hook Manager

**File:** `src/opencode/hooks/gitHookManager.ts`

```typescript
import { copyFile, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'child_process';
import { logger } from '@/ui/logger';

export class GitHookManager {
  private hookScriptPath: string;
  private hookTargetPath: string;

  constructor(projectRoot: string) {
    this.hookScriptPath = resolve(projectRoot, 'scripts', 'git_pre_commit_hook.cjs');
    this.hookTargetPath = resolve(projectRoot, '.git', 'hooks', 'pre-commit');
  }

  async installHook(): Promise<void> {
    // Check if already installed
    if (await this.isHookInstalled()) {
      logger.info('Git pre-commit hook already installed');
      return;
    }

    // Copy hook script to .git/hooks/pre-commit
    await copyFile(this.hookScriptPath, this.hookTargetPath);

    // Make executable
    spawnSync('chmod', ['+x', this.hookTargetPath]);

    logger.info('✅ Git pre-commit hook installed');
  }

  async uninstallHook(): Promise<void> {
    if (!await this.isHookInstalled()) {
      logger.info('Git pre-commit hook not installed');
      return;
    }

    unlinkSync(this.hookTargetPath);
    logger.info('✅ Git pre-commit hook removed');
  }

  async isHookInstalled(): Promise<boolean> {
    return existsSync(this.hookTargetPath);
  }

  verifyTestsPass(): { passed: boolean; error?: string } {
    const result = spawnSync('yarn', ['test'], {
      stdio: 'pipe',
      shell: true
    });

    if (result.status !== 0) {
      return {
        passed: false,
        error: result.stderr?.toString() || 'Tests failed'
      };
    }

    return { passed: true };
  }
}
```

### CLI Commands

**File:** `src/commands/gitHook.ts`

```typescript
import { Command } from 'commander';
import { GitHookManager } from '@/opencode/hooks/gitHookManager';
import { projectPath } from '@/projectPath';

export const gitHookCommand = new Command('git-hook');

gitHookCommand
  .command('install')
  .description('Install git pre-commit hook to run tests before commits')
  .action(async () => {
    const manager = new GitHookManager(projectPath());
    await manager.installHook();
    console.log('✅ Git pre-commit hook installed');
    console.log('Tests will run automatically before each commit');
  });

gitHookCommand
  .command('uninstall')
  .description('Remove git pre-commit hook')
  .action(async () => {
    const manager = new GitHookManager(projectPath());
    await manager.uninstallHook();
    console.log('✅ Git pre-commit hook removed');
  });

gitHookCommand
  .command('status')
  .description('Check if git pre-commit hook is installed')
  .action(async () => {
    const manager = new GitHookManager(projectPath());
    const installed = await manager.isHookInstalled();
    if (installed) {
      console.log('✅ Git pre-commit hook is installed');
    } else {
      console.log('❌ Git pre-commit hook is not installed');
      console.log('Run: happy git-hook install');
    }
  });
```

---

## Session Tracking Implementation

### Session Tracker

**File:** `src/opencode/hooks/sessionTracker.ts`

```typescript
import { logger } from '@/ui/logger';

export interface SessionTrackerOptions {
  onSessionId: (sessionId: string) => void;
}

export class SessionTracker {
  private sessionId?: string;
  private options: SessionTrackerOptions;

  constructor(options: SessionTrackerOptions) {
    this.options = options;
  }

  captureSessionId(sessionId: string): void {
    // Only emit if session ID changed
    if (this.sessionId !== sessionId) {
      const previousId = this.sessionId;
      this.sessionId = sessionId;

      logger.debug(`[opencode] Session ID: ${previousId} → ${sessionId}`);
      this.options.onSessionId(sessionId);
    }
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }
}
```

### Integration in runOpenCode

**File:** `src/opencode/runOpenCode.ts`

```typescript
import { SessionTracker } from './hooks/sessionTracker';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';

// In startSession():
const sessionTracker = new SessionTracker({
  onSessionId: (sessionId) => {
    // Notify daemon via AgentMessage
    session.sendEvent({
      type: 'event',
      event: 'session_found',
      data: { sessionId }
    });

    // Update Happy session metadata
    notifyDaemonSessionStarted(sessionId);
  }
});

// Capture session ID from ACP response
const response = await acpBackend.startSession();
if (response.sessionId) {
  sessionTracker.captureSessionId(response.sessionId);
} else {
  logger.debug('[opencode] No session ID in response, session tracking unavailable');
}
```

---

## CLI Usage

### Git Hooks

```bash
# Install pre-commit hook
happy git-hook install

# Check hook status
happy git-hook status

# Uninstall hook
happy git-hook uninstall

# Commit (tests run automatically)
git commit -m "feat: add feature"
# Output:
# 🧪 Running tests...
# ✅ All tests passed
# [commit succeeds]
```

### Session Tracking

```bash
# View session info (including OpenCode session ID)
happy --status

# Output:
# Agent: OpenCode
# Session ID: abc-123-def-456
# Model: gpt-4
# ...
```

---

## Error Handling

### Git Hooks

| Scenario | Behavior |
|----------|----------|
| Tests fail | Commit blocked, show test output, exit with code 1 |
| Yarn not installed | Show error: "❌ Yarn not found. Install from https://yarnpkg.com" |
| No tests in project | Show warning but allow commit (skip hook gracefully) |
| Hook script permission denied | Show error during install, guide user to fix |
| Git repository not found | Show error, guide user to run from git repo root |
| No package.json | Log warning, skip tests, allow commit |

### Session Tracking

| Scenario | Behavior |
|----------|----------|
| ACP returns no sessionId | Log warning, continue without session tracking |
| Session ID already captured | Skip update (no-op) |
| Daemon notification fails | Log error, continue (session ID still stored locally) |
| ACP connection fails | Session tracker remains unset, handle in main error flow |

---

## Testing Strategy

### Unit Tests

1. **Git Hook Manager** (`src/opencode/hooks/gitHookManager.test.ts`)
   - `installHook()` - Copies script to `.git/hooks/pre-commit`
   - `uninstallHook()` - Removes hook file
   - `isHookInstalled()` - Checks if hook exists
   - `verifyTestsPass()` - Mocks yarn test execution
   - Edge cases: No git repo, permission errors, missing package.json

2. **Session Tracker** (`src/opencode/hooks/sessionTracker.test.ts`)
   - `captureSessionId()` - Stores and emits session ID
   - `getSessionId()` - Retrieves stored session ID
   - Duplicate session ID handling (no-op if same)
   - Session ID change detection (emits on change)

### Integration Tests

3. **Git Hook Integration** (`src/opencode/hooks/gitHook.integration.test.ts`)
   - Install hook → Verify file exists
   - Run hook script → Verify tests execute
   - Test failure → Verify commit blocked
   - Test success → Verify commit allowed

4. **Session Tracking Integration** (`src/opencode/runOpenCode.integration.test.ts`)
   - Start OpenCode session → Verify session ID captured
   - Mock ACP `newSession` response → Verify emitted to daemon
   - Multiple sessions → Verify only unique IDs trigger updates

---

## Implementation Plan

### Phase 1: Git Hooks (~1.5 hours)

- [ ] Create `scripts/git_pre_commit_hook.cjs`
- [ ] Create `src/opencode/hooks/gitHookManager.ts`
- [ ] Create `src/opencode/hooks/gitHookManager.test.ts`
- [ ] Create `src/opencode/hooks/gitHook.integration.test.ts`
- [ ] Create `src/commands/gitHook.ts`
- [ ] Register command in `src/index.ts`

### Phase 2: Session Tracking (~45 min)

- [ ] Create `src/opencode/hooks/sessionTracker.ts`
- [ ] Create `src/opencode/hooks/sessionTracker.test.ts`
- [ ] Integrate into `src/opencode/runOpenCode.ts`
- [ ] Update `src/opencode/runOpenCode.integration.test.ts`

### Phase 3: Documentation (~15 min)

- [ ] Update `docs/opencode-feature-parity.md` - Mark hooks as complete
- [ ] Create this design document
- [ ] Update README with git hook usage

---

## Limitations

### OpenCode ACP Constraints

1. **No Session Fork Detection** - OpenCode ACP doesn't support session forking
2. **No Resume Detection** - No hook system to detect session resume/continue
3. **Single Session per Connection** - Only tracks initial session ID
4. **No Session Change Events** - Can't detect when session ID changes during runtime

### Comparison with Claude

| Feature | Claude | OpenCode |
|---------|--------|----------|
| Pre-commit git hooks | ✅ Yes | ✅ Yes (this implementation) |
| Session ID tracking | ✅ Full (via hooks) | ⚠️ Basic (initial only) |
| Fork detection | ✅ Yes | ❌ No (ACP limitation) |
| Resume detection | ✅ Yes | ❌ No (ACP limitation) |
| Hook server | ✅ Yes | ❌ No (not supported) |

---

## Success Criteria

- [ ] `happy git-hook install` installs pre-commit hook
- [ ] Failing tests block git commits
- [ ] Passing tests allow git commits
- [ ] `happy git-hook status` shows correct installation state
- [ ] OpenCode session ID captured on session start
- [ ] Session ID visible in `happy --status` output
- [ ] All unit and integration tests pass
- [ ] Documentation updated

---

## Next Steps

1. **Implement Phase 1** - Git hooks functionality
2. **Implement Phase 2** - Session tracking
3. **Test** - Run all tests, manual verification
4. **Document** - Update docs and README
5. **Release** - Deploy via EAS Update
