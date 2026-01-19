# Happy CLI Exit Code 1 Investigation

**Status:** ROOT CAUSE IDENTIFIED
**First observed:** 2026-01-13
**Last updated:** 2026-01-13

## Summary

Happy CLI crashes with exit code 1 when resuming sessions in stream-json mode. The crash is caused by Claude Code's **"only prompt commands are supported in streaming mode"** error.

**Root Cause:** GitHub issue [#16712](https://github.com/anthropics/claude-code/issues/16712) - When resuming with `--input-format stream-json`, Claude Code injects a synthetic "No response requested" message BEFORE reading stdin, breaking the message chain.

---

## CONFIRMED: Root Cause

### Error Message (found in logs)
```
"only prompt commands are supported in streaming mode"
```

This error appears **27 times** in a single session log, confirming it's the primary issue.

### Mechanism
1. Happy starts session, Claude responds, session ends with pending state
2. Happy resumes with `--resume <session-id> --input-format stream-json`
3. **Claude Code injects:** `[assistant] "No response requested."` (synthetic)
4. Happy sends user message via stdin
5. **Claude Code rejects:** "only prompt commands are supported in streaming mode"
6. Claude Code exits with code 1

### Why This Happens
Claude Code's stream-json resume behavior expects ONLY prompt commands (new user prompts). When Happy sends a continuation message after the synthetic injection, Claude Code rejects it.

This is a **known Claude Code limitation**, not a Happy bug.

---

## Crash Pattern

### Timing
```
[11:12:12.835] [claudeRemote] Message result
[11:12:12.836] [claudeRemote] Thinking state changed to: false
[11:12:12.837] [claudeRemote] Result received, exiting claudeRemote
[11:12:12.838] [PUSH] sendToAllDevices called
[11:12:12.839] [MessageQueue2] Waiting for messages...
[11:12:13.232] [Claude SDK] Process exit: code=1, stderr=43 bytes, stdout=5000 bytes
```

**Key observation:** ~395ms between "Waiting for messages" and crash.

### stderr Content
Only contains version banner (43 bytes):
```
[90mUsing Claude Code v2.1.3 from npm[0m
```

No actual error message - Claude Code exits without explaining why.

---

## What We Ruled Out

### 1. Claude Code Bug
Created `scripts/reproduce-crash.mjs` with identical flags:
- `--input-format stream-json`
- `--output-format stream-json`
- `--permission-prompt-tool stdio`
- `--mcp-config` (with Happy MCP server)
- `--resume` (with valid session ID)
- `DEBUG=true` environment

**Result:** Process stayed alive 30+ seconds. No crash.

### 2. stdin Closure
Checked `streamToStdin` logs - no `stdin.end()` called before crash.
stdin pipe was still open and waiting.

### 3. MCP Transport Timeout
GitHub issue #11701 describes MCP transport timeout closing stdin.
Our crash pattern differs - stdin stays open.

### 4. Synthetic Message Injection
GitHub issue #16712 describes resume injecting "No response requested".
**UPDATE:** This IS the cause. The error "only prompt commands are supported in streaming mode" appears 27 times in logs.

---

## SUPERSEDED: Previous Hypothesis (Race Condition)

**Note:** The race condition hypothesis is now superseded by the confirmed root cause above. Keeping for historical reference.

### Concurrent Operations During Idle
When Happy waits for next user message, multiple systems are active:
1. **Push notifications** - `sendToAllDevices` sends to mobile
2. **Socket updates** - Broadcasts ready state to clients
3. **Mode hash checks** - Monitors for mode changes
4. **Keep-alive messages** - Periodic socket heartbeats

### Possible Race Scenarios
1. **Mode hash change detection** triggers process restart while stdin write in progress
2. **Socket update** causes state change that affects Claude Code process
3. **Push notification callback** interferes with message queue
4. **Multiple concurrent awaits** on shared state

### Why Options Correlate
Options (AskUserQuestion or `<options>` XML) create longer idle time while user thinks.
More idle time = more opportunity for race condition to trigger.

---

## Key Files to Investigate

### claudeRemote.ts
```typescript
// Lines 190-213: After result, waits for next message
if (message.type === 'result') {
    updateThinking(false);
    logger.debug('[claudeRemote] Result received, exiting claudeRemote');
    opts.onReady();  // <-- Triggers push notifications, socket updates
    const next = await opts.nextMessage();  // <-- Blocks here during crash
    // ...
}
```

### claudeRemoteLauncher.ts
```typescript
// Lines 349-353: Mode hash check
if ((modeHash && msg.hash !== modeHash) || msg.isolate) {
    logger.debug('[remote]: mode has changed, pending message');
    pending = msg;
    return null;  // <-- Could this race with other operations?
}
```

### query.ts
```typescript
// Lines 371-376: stderr capture (DEBUG enabled)
child.stderr.on('data', (data) => {
    const text = data.toString()
    stderrBuffer += text
    if (process.env.DEBUG) {
        console.error('Claude Code stderr:', text)
    }
})
```

---

## Debugging Steps

### 1. Add Granular Logging (TODO)
In `claudeRemote.ts`, add logging:
```typescript
// Before nextMessage()
logger.debug('[claudeRemote] About to wait for next message');

// In nextMessage callback
logger.debug('[claudeRemote] nextMessage resolved/rejected');
```

### 2. Instrument Concurrent Operations (TODO)
Log timestamps for:
- Push notification start/complete
- Socket update start/complete
- Mode hash check timing
- Any async operation during idle

### 3. Monitor with DEBUG (DONE)
`spawnHappyCLI.ts` already modified to set `DEBUG=true`.
Next crash will capture full stderr.

### 4. Check for Shared State Mutations (TODO)
Review all operations that modify:
- `mode` variable in claudeRemote
- `modeHash` in claudeRemoteLauncher
- `messages` PushableAsyncIterable state
- Any global/shared state

---

## Reproduction Script

Location: `scripts/reproduce-crash.mjs`

```bash
# Basic test (no resume)
node scripts/reproduce-crash.mjs

# With resume (needs valid session)
cd /Users/craigvanheerden/Repos
node infrastructure/happy-cli/scripts/reproduce-crash.mjs <session-id>
```

Configuration flags at top of file:
- `USE_MCP` - Toggle MCP config
- `MCP_URL` - MCP server URL
- `USE_RESUME` - Toggle resume flag
- `SESSION_ID` - From command line arg

---

## Related GitHub Issues

| Issue | Title | Relevance |
|-------|-------|-----------|
| [#11701](https://github.com/anthropics/claude-code/issues/11701) | VS Code extension exit code 1 | MCP transport timeout pattern |
| [#16712](https://github.com/anthropics/claude-code/issues/16712) | tool_result via stdin on resume | Synthetic message injection |
| [#3187](https://github.com/anthropics/claude-code/issues/3187) | stream-json input hang | Second message hang pattern |
| [#5034](https://github.com/anthropics/claude-code/issues/5034) | Duplicate session entries | stream-json quirks |

---

## Log Locations

- Session logs: `~/.happy/logs/2026-01-13-HH-MM-SS-pid-XXXXX.log`
- Daemon logs: `~/.happy/logs/2026-01-13-HH-MM-SS-pid-XXXXX-daemon.log`
- Claude Code sessions: `~/.claude/projects/-Users-craigvanheerden-Repos/*.jsonl`

### Useful grep commands
```bash
# Find crashes
grep "Process exit: code=1" ~/.happy/logs/*.log

# Find DEBUG stderr output
grep "Claude Code stderr" ~/.happy/logs/*-daemon.log

# Find timing around crash
grep -B10 "Process exit: code=1" ~/.happy/logs/*.log
```

---

## Next Actions

1. [x] ~~Wait for next crash with DEBUG enabled~~ - Done, found root cause
2. [x] ~~Analyze stderr output for actual error~~ - Found "only prompt commands are supported in streaming mode"
3. [ ] **Monitor GitHub issue #16712** for Claude Code fix
4. [ ] **Potential workaround:** Don't use `--resume` with `--input-format stream-json` together
5. [ ] **Alternative:** Start fresh session instead of resuming when in stream-json mode

---

## Potential Workarounds

### Option 1: Avoid --resume with stream-json
Instead of resuming, start a fresh session each time. Loses conversation context but avoids the bug.

### Option 2: Use --continue instead of --resume
May behave differently - needs testing.

### Option 3: Wait for Claude Code fix
GitHub issue #16712 is open. Anthropic may fix this in a future release.

### Option 4: Write tool_result to session file directly
The workaround mentioned in issue #16712 - fragile but works:
1. Write tool_result directly to `~/.claude/projects/.../<session>.jsonl`
2. Resume with a text prompt

---

## References

- [GitHub Issue #16712](https://github.com/anthropics/claude-code/issues/16712) - Feature request to fix this behavior
- [Claude Code Headless Docs](https://code.claude.com/docs/en/headless) - Official documentation
- [Claude Agent SDK Spec](https://gist.github.com/SamSaffron/603648958a8c18ceae34939a8951d417) - Message format specification
