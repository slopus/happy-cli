# SessionScanner Architecture Analysis
**Date**: 2025-10-26
**Analyst**: Claude Code
**Project**: happy-cli session detection enhancement

## Executive Summary

The sessionScanner is a robust detection system that monitors Claude Code session activity through filesystem watching and UUID matching. Currently, it successfully detects sessions initiated by the `happy` command but has limitations detecting sessions started directly with the `claude` command.

## 1. Current Architecture

### 1.1 Core Components

**File**: `/Users/nick/Documents/happy-cli/src/claude/utils/sessionScanner.ts`

#### createSessionScanner Function (Lines 9-110)
```typescript
export async function createSessionScanner(opts: {
    sessionId: string | null,
    workingDirectory: string
    onMessage: (message: RawJSONLines) => void
})
```

**Key Parameters**:
- `sessionId`: Optional UUID of existing session to resume
- `workingDirectory`: Current working directory (used to compute project path)
- `onMessage`: Callback for processing new messages

**Internal State**:
- `finishedSessions`: Set<string> - Completed session IDs
- `pendingSessions`: Set<string> - Sessions pending finalization
- `currentSessionId`: string | null - Active session being tracked
- `watchers`: Map<string, () => void> - File watchers per session
- `processedMessageKeys`: Set<string> - Deduplication tracker

### 1.2 Session Detection Mechanism

**Detection Algorithm** (Lines 28-56):

#### Phase 1: Filesystem Watching
```typescript
// Line 16
const projectDir = getProjectPath(opts.workingDirectory);
// Result: ~/.claude/projects/<hashed-cwd>/
```

**Project Path Generation** (`src/claude/utils/path.ts:4-8`):
```typescript
export function getProjectPath(workingDirectory: string) {
    const projectId = resolve(workingDirectory).replace(/[\\\/\.:]/g, '-');
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(claudeConfigDir, 'projects', projectId);
}
```

**Example**:
- Working Directory: `/Users/nick/Documents/happy-cli`
- Project Path: `~/.claude/projects/-Users-nick-Documents-happy-cli/`
- Session File: `~/.claude/projects/-Users-nick-Documents-happy-cli/<uuid>.jsonl`

#### Phase 2: UUID Matching (claudeLocal.ts:28-55)

The `claudeLocal.ts` file implements a two-stage detection system:

```typescript
// Line 33-34: Two detection sets
const detectedIdsRandomUUID = new Set<string>(); // From fd3 pipe
const detectedIdsFileSystem = new Set<string>(); // From file watcher

// Lines 35-54: File watcher detects .jsonl files
watcher.on('change', (event, filename) => {
    if (typeof filename === 'string' && filename.toLowerCase().endsWith('.jsonl')) {
        const sessionId = filename.replace('.jsonl', '');
        detectedIdsFileSystem.add(sessionId);
        
        // Match with UUID from fd3 pipe
        if (detectedIdsRandomUUID.has(sessionId)) {
            resolvedSessionId = sessionId;
            opts.onSessionFound(sessionId);
        }
    }
});

// Lines 132-140: UUID from fd3 pipe (custom file descriptor)
case 'uuid':
    detectedIdsRandomUUID.add(message.value);
    
    if (!resolvedSessionId && detectedIdsFileSystem.has(message.value)) {
        resolvedSessionId = message.value;
        opts.onSessionFound(message.value);
    }
    break;
```

**Detection Flow**:
1. File watcher monitors `~/.claude/projects/<project-id>/` directory
2. Custom fd3 pipe receives UUID messages from Claude launcher
3. Session confirmed when UUID appears in BOTH sets
4. `onSessionFound()` callback triggers metadata update

### 1.3 Message Processing

**Reading Session Logs** (Lines 133-163):
```typescript
async function readSessionLog(projectDir: string, sessionId: string): Promise<RawJSONLines[]> {
    const expectedSessionFile = join(projectDir, `${sessionId}.jsonl`);
    let file = await readFile(expectedSessionFile, 'utf-8');
    // Parse each line as JSON
    // Validate with RawJSONLinesSchema
    // Return deduplicated messages
}
```

**Message Types** (from `src/claude/types.ts:18-52`):
- `user`: User messages (validated by uuid and content)
- `assistant`: Claude responses (with usage tracking)
- `summary`: Session summaries (leafUuid + summary text)
- `system`: System messages (validated by uuid)

**Deduplication** (Lines 119-131):
```typescript
function messageKey(message: RawJSONLines): string {
    if (message.type === 'user') return message.uuid;
    if (message.type === 'assistant') return message.uuid;
    if (message.type === 'summary') return 'summary: ' + message.leafUuid + ': ' + message.summary;
    if (message.type === 'system') return message.uuid;
}
```

### 1.4 File Watching & Sync

**Continuous Monitoring** (Lines 34-76):
```typescript
const sync = new InvalidateSync(async () => {
    // Collect all active sessions
    let sessions: string[] = [];
    for (let p of pendingSessions) sessions.push(p);
    if (currentSessionId) sessions.push(currentSessionId);
    
    // Read and process messages from each session
    for (let session of sessions) {
        for (let file of await readSessionLog(projectDir, session)) {
            let key = messageKey(file);
            if (!processedMessageKeys.has(key)) {
                processedMessageKeys.add(key);
                opts.onMessage(file);
            }
        }
    }
    
    // Update file watchers
    for (let p of sessions) {
        if (!watchers.has(p)) {
            watchers.set(p, startFileWatcher(join(projectDir, `${p}.jsonl`), () => sync.invalidate()));
        }
    }
});

// Line 76: Periodic sync every 3 seconds
const intervalId = setInterval(() => sync.invalidate(), 3000);
```

**File Watcher Implementation** (`src/modules/watcher/startFileWatcher.ts`):
- Uses `fs.watch()` for filesystem events
- Triggers sync invalidation on file changes
- Auto-cleanup on session end

### 1.5 Session Lifecycle Management

**onNewSession Handler** (Lines 89-108):
```typescript
onNewSession: (sessionId: string) => {
    if (currentSessionId === sessionId) return; // Skip duplicate
    if (finishedSessions.has(sessionId)) return; // Skip finished
    if (pendingSessions.has(sessionId)) return; // Skip pending
    
    if (currentSessionId) {
        pendingSessions.add(currentSessionId); // Move current to pending
    }
    currentSessionId = sessionId;
    sync.invalidate(); // Trigger immediate sync
}
```

**State Transitions**:
1. `null` → `currentSessionId` (first session)
2. `currentSessionId` → `pendingSessions` (session switch)
3. `pendingSessions` → `finishedSessions` (completion)

## 2. Session Metadata Flow

### 2.1 Metadata Structure

**File**: `src/api/types.ts:289-316`
```typescript
export type Metadata = {
  path: string,                    // Working directory (key field!)
  host: string,                    // Machine hostname
  version?: string,                // happy-cli version
  claudeSessionId?: string,        // Claude Code session ID
  startedBy?: 'daemon' | 'terminal', // Origin
  startedFromDaemon?: boolean,
  hostPid?: number,
  // ... other fields
}
```

### 2.2 Metadata Creation

**File**: `src/claude/runClaude.ts:73-90`
```typescript
let metadata: Metadata = {
    path: workingDirectory,  // Line 74 - process.cwd()
    host: os.hostname(),
    version: packageJson.version,
    os: os.platform(),
    machineId: machineId,
    homeDir: os.homedir(),
    happyHomeDir: configuration.happyHomeDir,
    happyLibDir: projectPath(),
    happyToolsDir: resolve(projectPath(), 'tools', 'unpacked'),
    startedFromDaemon: options.startedBy === 'daemon',
    hostPid: process.pid,
    startedBy: options.startedBy || 'terminal',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    flavor: 'claude'
};
```

### 2.3 Session Update on Detection

**File**: `src/claude/session.ts:65-74`
```typescript
onSessionFound = (sessionId: string) => {
    this.sessionId = sessionId;
    
    // Update metadata with Claude Code session ID
    this.client.updateMetadata((metadata) => ({
        ...metadata,
        claudeSessionId: sessionId
    }));
    logger.debug(`[Session] Claude Code session ID ${sessionId} added to metadata`);
}
```

**Update Flow**:
1. sessionScanner detects new UUID → calls `onSessionFound()`
2. Session object updates `claudeSessionId` in metadata
3. Metadata synced to backend via WebSocket
4. Backend can now correlate Happy session with Claude session

## 3. Current Limitations

### 3.1 Claude Command Detection Gap

**Problem**: Sessions started with `claude` command are NOT detected

**Root Cause Analysis**:

#### Limitation 1: No Direct CLI.jsonl Access
- **Expected Location**: `~/.claude/state/cli.jsonl` (per earlier documentation)
- **Actual Status**: Directory does not exist on test system
- **Impact**: Cannot directly watch official Claude session state file

**Evidence**:
```bash
$ ls -la ~/.claude/state/
# Result: Directory does not exist
```

#### Limitation 2: UUID Pipe Dependency
The current detection relies on the custom `fd3` pipe in `claudeLocal.ts`:

```typescript
// Lines 117-140: Requires custom fd3 pipe
if (child.stdio[3]) {
    const rl = createInterface({
        input: child.stdio[3] as any,
    });
    
    rl.on('line', (line) => {
        const message = JSON.parse(line);
        switch (message.type) {
            case 'uuid':
                detectedIdsRandomUUID.add(message.value);
                // ... detection logic
        }
    });
}
```

**Issue**: The `claude` command doesn't use the custom launcher (`scripts/claude_local_launcher.cjs`) with fd3 pipe

#### Limitation 3: Project Path Mismatch
When running `claude` directly vs `happy`:
- `happy` command: Uses `process.cwd()` from happy process
- `claude` command: Uses `process.cwd()` from claude process (may differ)
- Different working directories → different project paths → different `.jsonl` locations

### 3.2 Session State Tracking

**Current State Machine**:
```
null → currentSessionId → pendingSessions → finishedSessions
```

**Gaps**:
1. No cross-command session correlation
2. No global session registry
3. No shared state file between `happy` and `claude`

### 3.3 Metadata Correlation

**Current Flow**:
```
happy session (with metadata.path) 
    ↓ (sessionScanner detects UUID)
metadata.claudeSessionId = <uuid>
    ↓ (backend correlation)
Can find Happy session for Claude session
```

**Gap**: If Claude session starts first, no Happy session exists to update

## 4. Detection Algorithm Deep Dive

### 4.1 Session File Format

**File**: `~/.claude/projects/<project-id>/<session-uuid>.jsonl`

**Structure**: JSONL (JSON Lines) format, one message per line

**Example Line** (from fixtures):
```json
{
  "parentUuid": null,
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/nick/Documents/happy-cli",
  "sessionId": "b91d4412-e6c4-4e51-bb1b-585bcd78aca4",
  "version": "1.0.51",
  "type": "user",
  "message": {"role": "user", "content": "Say lol"},
  "uuid": "a42c6511-ddee-43d7-94e8-8618167115c9",
  "timestamp": "2025-07-19T23:58:30.133Z"
}
```

**Critical Fields**:
- `sessionId`: UUID of Claude Code session
- `cwd`: Working directory (for project path calculation)
- `uuid`: Message UUID (for deduplication)
- `type`: Message type (user/assistant/summary/system)

### 4.2 UUID Matching Algorithm

**Two-Stage Detection** (`claudeLocal.ts:28-55`):

```
Stage 1: File Watcher
  ├─ Monitors ~/.claude/projects/<project-id>/
  ├─ Detects *.jsonl file creation
  └─ Extracts UUID from filename → detectedIdsFileSystem

Stage 2: UUID Pipe
  ├─ Custom fd3 pipe from Claude launcher
  ├─ Receives {"type": "uuid", "value": "<uuid>"}
  └─ Adds to detectedIdsRandomUUID

Match Condition:
  UUID ∈ detectedIdsFileSystem ∧ UUID ∈ detectedIdsRandomUUID
    → Session confirmed
    → Trigger onSessionFound()
```

**Why Two Stages?**
1. **File watcher alone**: Too broad, could catch old sessions
2. **UUID pipe alone**: Doesn't confirm file creation
3. **Combined**: Guarantees active session with valid file

### 4.3 Project Path Hashing

**Algorithm** (`src/claude/utils/path.ts:4-8`):
```typescript
const projectId = resolve(workingDirectory).replace(/[\\\/\.:]/g, '-');
```

**Examples**:
```
Input:  /Users/nick/Documents/happy-cli
Output: -Users-nick-Documents-happy-cli

Input:  C:\Users\Nick\Projects\app
Output: C--Users-Nick-Projects-app

Input:  /home/user/my.project/src
Output: -home-user-my-project-src
```

**Collision Risk**: Low (full absolute path preserved)

## 5. Integration Points

### 5.1 Session Object

**File**: `src/claude/session.ts:6-118`

**Key Integration**:
```typescript
class Session {
    sessionId: string | null;  // Claude session UUID
    
    onSessionFound = (sessionId: string) => {
        this.sessionId = sessionId;
        this.client.updateMetadata((metadata) => ({
            ...metadata,
            claudeSessionId: sessionId
        }));
    }
    
    clearSessionId = (): void => {
        this.sessionId = null;
    }
}
```

### 5.2 API Session Client

**File**: `src/api/apiSession.ts:14-392`

**Integration Points**:
- `updateMetadata()`: Syncs metadata to backend (Lines 322-341)
- `sendClaudeSessionMessage()`: Forwards messages to backend (Lines 166-222)
- WebSocket connection for real-time updates

### 5.3 Claude Launchers

**Local Launcher** (`src/claude/claudeLocalLauncher.ts:7-97`):
```typescript
export async function claudeLocalLauncher(session: Session) {
    const scanner = await createSessionScanner({
        sessionId: session.sessionId,
        workingDirectory: session.path,
        onMessage: (message) => {
            if (message.type !== 'summary') {
                session.client.sendClaudeSessionMessage(message)
            }
        }
    });
    
    const handleSessionStart = (sessionId: string) => {
        session.onSessionFound(sessionId);
        scanner.onNewSession(sessionId);
    };
    
    // ... spawn Claude process
}
```

**Remote Launcher** (`src/claude/claudeRemote.ts:17-200`):
- Similar pattern but for remote mode
- Watches for `session_id` from system init message
- Awaits file creation before continuing

## 6. Enhancement Opportunities

### 6.1 Universal Detection Strategy

**Approach 1: Watch ~/.claude/projects/ Globally**
```typescript
// Watch ALL project directories
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const projectsDir = join(claudeConfigDir, 'projects');

// For each project directory, scan for new .jsonl files
// Match against metadata.path to find relevant Happy sessions
```

**Pros**:
- Detects any Claude session, regardless of origin
- No launcher modifications needed
- Works with native `claude` command

**Cons**:
- Performance: Watching many directories
- Correlation: Need to match by working directory

**Approach 2: Shared State File**
```typescript
// Write global session registry
~/.claude/happy-sessions.jsonl
[
  {
    happySessionId: "abc-123",
    claudeSessionId: "def-456",
    workingDirectory: "/Users/nick/project",
    startedBy: "happy",
    timestamp: 1234567890
  }
]
```

**Pros**:
- Explicit correlation
- Fast lookups
- Supports both commands

**Cons**:
- Requires coordination between processes
- File locking complexity
- Stale data cleanup needed

**Approach 3: Poll ~/.claude/projects/ Periodically**
```typescript
// Every 5 seconds, scan all project directories
setInterval(async () => {
    for (const projectDir of getAllProjectDirs()) {
        const sessions = await findNewSessions(projectDir);
        for (const session of sessions) {
            const happySession = findHappySessionByWorkingDir(session.cwd);
            if (happySession) {
                correlate(happySession, session);
            }
        }
    }
}, 5000);
```

**Pros**:
- Simple implementation
- No complex file watching
- Handles delayed starts

**Cons**:
- 5-second lag
- Repeated filesystem operations
- CPU overhead

### 6.2 Working Directory Correlation

**Challenge**: Match Claude session `cwd` field to Happy session `metadata.path`

**Solution**:
```typescript
async function findHappySessionForClaudeSession(claudeSessionFile: string): Promise<string | null> {
    // 1. Read first message from .jsonl file
    const firstLine = await readFirstLine(claudeSessionFile);
    const message = JSON.parse(firstLine);
    const cwd = message.cwd;
    
    // 2. Query backend for Happy session with matching path
    const happySessions = await api.findSessionsByWorkingDir(cwd);
    
    // 3. Return most recent session
    return happySessions[0]?.id || null;
}
```

### 6.3 Metadata Enhancement

**Current**: `metadata.claudeSessionId` (single string)

**Proposed**: 
```typescript
type Metadata = {
    // ... existing fields
    claudeSessionId?: string,
    claudeSessions?: Array<{
        sessionId: string,
        startedAt: number,
        endedAt?: number,
        startedBy: 'happy' | 'claude-direct',
        projectPath: string
    }>
}
```

**Benefits**:
- Track multiple Claude sessions per Happy session
- Record session lifecycle
- Distinguish session origins

### 6.4 CLI.jsonl Integration

**Expected File**: `~/.claude/state/cli.jsonl`

**If Available**:
```typescript
// Watch official Claude state file
const cliStateFile = join(homedir(), '.claude', 'state', 'cli.jsonl');

if (existsSync(cliStateFile)) {
    const watcher = startFileWatcher(cliStateFile, async () => {
        const latestSession = await readLatestSession(cliStateFile);
        if (latestSession) {
            correlateWithHappySession(latestSession);
        }
    });
}
```

**Benefits**:
- Authoritative source for Claude sessions
- Simpler detection logic
- No custom launcher needed

**Investigation Needed**:
- Determine if file exists in production
- Document file format
- Handle multiple concurrent sessions

## 7. Proposed Solution

### 7.1 Hybrid Detection Approach

**Strategy**: Combine multiple detection methods for maximum coverage

```typescript
class UniversalSessionScanner {
    // Method 1: Existing UUID pipe detection (for 'happy' command)
    private uuidPipeDetection: SessionScanner;
    
    // Method 2: Global project directory polling
    private globalPolling: NodeJS.Timer;
    
    // Method 3: CLI state file watching (if available)
    private cliStateWatcher?: FSWatcher;
    
    async detectSessions(): Promise<DetectedSession[]> {
        const sessions = new Map<string, DetectedSession>();
        
        // Collect from all methods
        sessions.merge(await this.uuidPipeDetection.getSessions());
        sessions.merge(await this.globalPolling.getSessions());
        if (this.cliStateWatcher) {
            sessions.merge(await this.cliStateWatcher.getSessions());
        }
        
        return Array.from(sessions.values());
    }
}
```

### 7.2 Implementation Plan

**Phase 1: Global Project Scanning**
1. Create `GlobalSessionScanner` class
2. Scan `~/.claude/projects/` every 5 seconds
3. Read session metadata from .jsonl files
4. Correlate with Happy sessions by `cwd` field

**Phase 2: CLI State Integration**
1. Investigate `~/.claude/state/cli.jsonl` availability
2. Implement file format parser
3. Add watcher if file exists
4. Fallback to polling if not available

**Phase 3: Backend Correlation API**
1. Add endpoint: `GET /sessions/by-working-dir/:path`
2. Add endpoint: `POST /sessions/:id/link-claude-session`
3. Update metadata schema for multiple Claude sessions

**Phase 4: Testing**
1. Test with `happy` command (existing flow)
2. Test with `claude` command (new detection)
3. Test with concurrent sessions
4. Test with resumed sessions

### 7.3 File Modification Checklist

#### New Files to Create:
- `src/claude/utils/globalSessionScanner.ts` (global polling logic)
- `src/claude/utils/cliStateWatcher.ts` (CLI state file watcher)
- `src/claude/utils/universalSessionScanner.ts` (hybrid orchestration)
- `src/api/sessionCorrelation.ts` (backend correlation logic)

#### Files to Modify:
- `src/claude/utils/sessionScanner.ts` (add correlation hooks)
- `src/claude/session.ts` (support multiple Claude sessions)
- `src/api/types.ts` (update Metadata type)
- `src/claude/claudeLocalLauncher.ts` (integrate universal scanner)
- `src/claude/runClaude.ts` (initialize universal scanner)
- `src/daemon/run.ts` (track Claude sessions in daemon)

#### Test Files to Create:
- `src/claude/utils/globalSessionScanner.test.ts`
- `src/claude/utils/universalSessionScanner.test.ts`
- Integration tests for cross-command scenarios

## 8. Key Findings Summary

### 8.1 Current Strengths
✅ Robust deduplication with message keys
✅ Efficient file watching with sync invalidation
✅ Clean session lifecycle management
✅ Good separation of concerns (scanner, session, API client)
✅ Comprehensive test coverage (sessionScanner.test.ts)

### 8.2 Current Limitations
❌ Only detects sessions from `happy` command
❌ Relies on custom fd3 pipe (not available for `claude` command)
❌ No global session registry
❌ Cannot correlate after-the-fact (if Claude starts first)
❌ Single Claude session per Happy session

### 8.3 Architecture Insights

**Well-Designed Patterns**:
1. **InvalidateSync Pattern**: Efficient batching of file operations
2. **Two-Stage Detection**: Prevents false positives
3. **Message Deduplication**: Prevents duplicate processing
4. **State Machine**: Clear session lifecycle

**Improvement Areas**:
1. **Detection Scope**: Too narrow (only Happy-launched sessions)
2. **Correlation Timing**: Only forward-looking (no retrospective)
3. **State Sharing**: No cross-process coordination
4. **Session Multiplicity**: Assumes 1:1 Happy:Claude mapping

## 9. References

### Source Files Analyzed:
- `/Users/nick/Documents/happy-cli/src/claude/utils/sessionScanner.ts` (163 lines)
- `/Users/nick/Documents/happy-cli/src/claude/utils/path.ts` (8 lines)
- `/Users/nick/Documents/happy-cli/src/claude/types.ts` (55 lines)
- `/Users/nick/Documents/happy-cli/src/claude/session.ts` (118 lines)
- `/Users/nick/Documents/happy-cli/src/claude/claudeLocal.ts` (225 lines)
- `/Users/nick/Documents/happy-cli/src/claude/claudeLocalLauncher.ts` (97 lines)
- `/Users/nick/Documents/happy-cli/src/claude/runClaude.ts` (99 lines for metadata)
- `/Users/nick/Documents/happy-cli/src/api/apiSession.ts` (392 lines)
- `/Users/nick/Documents/happy-cli/src/api/types.ts` (316 lines)

### Test Coverage:
- `/Users/nick/Documents/happy-cli/src/claude/utils/sessionScanner.test.ts`
- Test fixtures: `0-say-lol-session.jsonl`, `1-continue-run-ls-tool.jsonl`

### Related Documentation:
- `.serena/memories/comprehensive_ecosystem_analysis_oct_2025.md` (reference to .claude/state/cli.jsonl)

---
**End of Analysis**
