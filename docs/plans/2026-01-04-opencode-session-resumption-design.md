# OpenCode Session Resumption Design

## Overview

Enable OpenCode sessions to be resumed across Happy CLI restarts, allowing users to continue conversations where they left off. This uses the ACP `loadSession` capability that OpenCode advertises.

## Goals

1. **Automatic Resume**: When spawning a session in a directory with a previous OpenCode session, resume it automatically
2. **Explicit Resume**: Mobile app can explicitly request resuming a specific session ID
3. **Force New Session**: Option to start fresh even if a previous session exists
4. **Session History**: Conversation history streams back to mobile app on resume

## Non-Goals

- Session resumption for Claude Code (already works via `--resume` flag)
- Cross-directory session resumption
- Session merging or branching

## Research Findings

### OpenCode ACP Capabilities

```typescript
// OpenCode advertises these capabilities on initialize:
{
  loadSession: true,
  mcpCapabilities: { http: true, sse: true },
  promptCapabilities: { embeddedContext: true, image: true }
}
```

### ACP LoadSession Request

```typescript
interface LoadSessionRequest {
  cwd: string;
  mcpServers: McpServer[];
  sessionId: string;  // OpenCode session ID (e.g., "ses_4777d0d57ffedr6yYNEcPjejkV")
}
```

### OpenCode Session IDs

- Format: `ses_<base62id>` (e.g., `ses_4777d0d57ffedr6yYNEcPjejkV`)
- Listed via: `opencode session list`
- Stored locally by OpenCode

## Architecture

### Data Flow

```
┌─────────────┐     spawn-happy-session      ┌─────────────┐
│  Mobile App │ ──────────────────────────▶  │   Daemon    │
└─────────────┘   { resumeSessionId? }       └─────────────┘
                                                    │
                                                    ▼
                                             ┌─────────────┐
                                             │ runOpenCode │
                                             └─────────────┘
                                                    │
                         ┌──────────────────────────┼──────────────────────────┐
                         │                          │                          │
                         ▼                          ▼                          ▼
                  resumeSessionId?           Auto-detect from           forceNewSession?
                         │                    metadata/dir                     │
                         │                          │                          │
                         └──────────────────────────┼──────────────────────────┘
                                                    │
                                                    ▼
                                    ┌───────────────────────────────┐
                                    │ sessionId to resume exists?   │
                                    └───────────────────────────────┘
                                           │              │
                                          YES            NO
                                           │              │
                                           ▼              ▼
                                    loadSession()    newSession()
```

### Session ID Storage

OpenCode session IDs are stored in Happy session metadata:

```typescript
// In Metadata type (src/api/types.ts)
{
  // ... existing fields
  opencodeSessionId?: string;  // Already exists!
}
```

For auto-resume, we also need to track the last session per directory:

```typescript
// In persistence.ts - new storage
interface DirectorySessionMap {
  [directory: string]: {
    opencodeSessionId: string;
    updatedAt: number;
  }
}
```

## Implementation Plan

### Phase 1: Extend AcpSdkBackend

**File: `src/agent/acp/AcpSdkBackend.ts`**

Add `loadSession` method alongside `startSession`:

```typescript
interface AcpSdkBackendOptions {
  // ... existing fields
  resumeSessionId?: string;  // If set, use loadSession instead of newSession
}

class AcpSdkBackend {
  async startSession(initialPrompt?: string): Promise<StartSessionResult> {
    // If resumeSessionId is set, use loadSession
    if (this.options.resumeSessionId) {
      return this.loadExistingSession(this.options.resumeSessionId, initialPrompt);
    }
    // Otherwise, create new session (existing code)
    return this.createNewSession(initialPrompt);
  }

  private async loadExistingSession(
    sessionId: string, 
    initialPrompt?: string
  ): Promise<StartSessionResult> {
    // Use connection.loadSession()
    const loadRequest: LoadSessionRequest = {
      cwd: this.options.cwd,
      mcpServers: this.getMcpServers(),
      sessionId,
    };
    
    const response = await this.connection.loadSession(loadRequest);
    this.acpSessionId = response.sessionId;
    
    // Session history will stream via sessionUpdate notifications
    // These are already handled by handleSessionUpdate()
    
    return { sessionId: this.acpSessionId };
  }
}
```

### Phase 2: Extend runOpenCode Options

**File: `src/opencode/runOpenCode.ts`**

```typescript
interface RunOpenCodeOptions {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  // New session resumption options
  resumeSessionId?: string;    // Explicit session to resume
  forceNewSession?: boolean;   // Skip auto-resume, always start fresh
}
```

### Phase 3: Add Auto-Resume Logic

**File: `src/opencode/utils/sessionPersistence.ts`** (new file)

```typescript
import { configuration } from '@/configuration';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

interface DirectorySessionEntry {
  opencodeSessionId: string;
  updatedAt: number;
  title?: string;
}

interface DirectorySessionMap {
  [directory: string]: DirectorySessionEntry;
}

const SESSIONS_FILE = 'opencode-sessions.json';

export async function getLastSessionForDirectory(
  directory: string
): Promise<DirectorySessionEntry | null> {
  const filePath = join(configuration.happyHomeDir, SESSIONS_FILE);
  try {
    const data = await readFile(filePath, 'utf-8');
    const sessions: DirectorySessionMap = JSON.parse(data);
    return sessions[directory] || null;
  } catch {
    return null;
  }
}

export async function saveSessionForDirectory(
  directory: string,
  entry: DirectorySessionEntry
): Promise<void> {
  const filePath = join(configuration.happyHomeDir, SESSIONS_FILE);
  let sessions: DirectorySessionMap = {};
  
  try {
    const data = await readFile(filePath, 'utf-8');
    sessions = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }
  
  sessions[directory] = entry;
  await writeFile(filePath, JSON.stringify(sessions, null, 2));
}
```

### Phase 4: Wire Up in runOpenCode

**File: `src/opencode/runOpenCode.ts`**

```typescript
export async function runOpenCode(opts: RunOpenCodeOptions): Promise<void> {
  const workingDirectory = opts.cwd || process.cwd();
  
  // Determine which session ID to use
  let sessionIdToResume: string | undefined = opts.resumeSessionId;
  
  // Auto-resume: check for previous session in this directory
  if (!sessionIdToResume && !opts.forceNewSession) {
    const lastSession = await getLastSessionForDirectory(workingDirectory);
    if (lastSession) {
      logger.debug(`[OpenCode] Found previous session for directory: ${lastSession.opencodeSessionId}`);
      sessionIdToResume = lastSession.opencodeSessionId;
    }
  }
  
  // Create backend with resume option
  opencodeBackend = createOpenCodeBackend({
    cwd: workingDirectory,
    mcpServers,
    permissionHandler,
    model: message.mode.model,
    resumeSessionId: sessionIdToResume,  // Pass to backend
  });
  
  // ... rest of existing code
  
  // After session starts, save session ID for future auto-resume
  if (acpSessionId) {
    await saveSessionForDirectory(workingDirectory, {
      opencodeSessionId: acpSessionId,
      updatedAt: Date.now(),
    });
  }
}
```

### Phase 5: Extend Daemon Spawn RPC

**File: `src/daemon/run.ts`**

```typescript
interface SpawnSessionOptions {
  directory: string;
  sessionId?: string;         // Happy session ID (unused currently)
  resumeSessionId?: string;   // NEW: OpenCode/agent session to resume
  forceNewSession?: boolean;  // NEW: Skip auto-resume
  agent?: 'claude' | 'codex' | 'gemini' | 'opencode';
  // ... other existing fields
}

const spawnSession = async (options: SpawnSessionOptions) => {
  // ... existing code
  
  const args = [
    agentCommand,
    '--happy-starting-mode', 'remote',
    '--started-by', 'daemon'
  ];
  
  // Pass resume options for OpenCode
  if (options.resumeSessionId) {
    args.push('--resume-session', options.resumeSessionId);
  }
  if (options.forceNewSession) {
    args.push('--force-new-session');
  }
  
  // ... spawn process
};
```

### Phase 6: Add CLI Arguments

**File: `src/index.ts`**

```typescript
// Add new CLI arguments for opencode command
case 'opencode': {
  const resumeSession = args.includes('--resume-session') 
    ? args[args.indexOf('--resume-session') + 1] 
    : undefined;
  const forceNewSession = args.includes('--force-new-session');
  
  await runOpenCode({
    credentials,
    startedBy: 'terminal',
    resumeSessionId: resumeSession,
    forceNewSession,
  });
}
```

## Session History Handling

When `loadSession` is called, OpenCode streams the conversation history via `sessionUpdate` notifications. These are already handled by `handleSessionUpdate()` in `AcpSdkBackend.ts`.

The history appears as a series of:
- `agent_message_chunk` updates (previous assistant responses)
- `tool_call` / `tool_call_update` (previous tool calls)

We need to:
1. Emit these to mobile app (already happens via `onMessage` handler)
2. Optionally mark them as "historical" so UI can style differently

```typescript
// Add to AgentMessage type
| { type: 'history-start' }
| { type: 'history-end' }

// In AcpSdkBackend.loadExistingSession():
this.emit({ type: 'history-start' });
// ... loadSession call, history streams via notifications
// After history complete:
this.emit({ type: 'history-end' });
```

## Mobile App Changes

The mobile app needs to:

1. **Session List**: Show previous sessions with option to resume
2. **Spawn RPC**: Pass `resumeSessionId` when user wants to continue
3. **History Display**: Handle `history-start`/`history-end` events to show historical messages differently

```typescript
// Mobile calls spawn with resume
rpc.call('spawn-happy-session', {
  directory: '/path/to/project',
  agent: 'opencode',
  resumeSessionId: 'ses_4777d0d57ffedr6yYNEcPjejkV',  // NEW
});
```

## Testing Strategy

### Unit Tests

1. `sessionPersistence.test.ts` - Save/load session mappings
2. `AcpSdkBackend.test.ts` - Mock loadSession behavior

### Integration Tests

1. Start session, save ID, restart, verify auto-resume
2. Explicit resume with valid session ID
3. Resume with invalid session ID (should create new)
4. Force new session even when previous exists

### Manual Testing

1. Run `opencode` in a directory, have conversation
2. Exit, run again - verify conversation continues
3. Run with `--force-new-session` - verify fresh start

## Rollout Plan

1. **Phase 1**: Backend support (`AcpSdkBackend.loadSession`)
2. **Phase 2**: CLI support (`--resume-session`, `--force-new-session`)
3. **Phase 3**: Auto-resume (session persistence per directory)
4. **Phase 4**: Daemon/RPC support
5. **Phase 5**: Mobile app UI (separate mobile app update)

## Open Questions

1. **Session Expiry**: Should we auto-resume sessions older than X days?
   - Recommendation: Yes, 7 day expiry for auto-resume

2. **Session Validation**: What if the session was deleted in OpenCode?
   - Recommendation: Catch error, fall back to new session

3. **Multiple Sessions**: What if user has multiple sessions in same directory?
   - Recommendation: Auto-resume uses most recent; explicit resume can pick any

4. **History Size**: Large histories could slow down resume
   - Recommendation: Let OpenCode handle this; it may summarize

## Success Metrics

- Users can continue conversations after CLI restart
- Mobile app shows session history on resume
- No regression in new session creation time
- Error handling gracefully falls back to new session
