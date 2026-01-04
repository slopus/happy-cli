# Full ACP Server Feature Implementation Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all missing ACP server features from OpenCode into Happy CLI's AcpSdkBackend, enabling full feature parity and advanced mobile/desktop UX.

**Architecture:** Extend existing `AcpSdkBackend` to implement ACP client-side features (permission modes, session modes, terminal commands) and server-side feature handling (edit/diff, todos).

**Tech Stack:** TypeScript, @agentclientprotocol/sdk, Happy CLI session management

---

## Overview

Currently, Happy CLI's `AcpSdkBackend` (~750 lines) is a **thin wrapper** that:
- Spawns `opencode acp` process
- Forwards messages between Happy and OpenCode
- Basic permission handling and session management

OpenCode's native ACP implementation (~1,050 lines) provides:
- **Session Modes:** default, yolo, safe - fewer permission prompts
- **Permission Modes:** once, always, reject - granular control
- **Terminal Commands:** compact, summarize, list, edit - desktop management
- **Edit/Diff Support:** Track file changes with oldText/newText diffs
- **Todo Integration:** Parse `todowrite` output and send plan entries
- **Session Summarization:** Condense conversation history

This design implements **all** missing features from OpenCode's ACP implementation into Happy CLI.

---

## Section 1: ACP Protocol Capability Analysis

### Current Capabilities Supported

From OpenCode's `agent.ts` initialize response:

```typescript
{
  protocolVersion: 1,
  agentCapabilities: {
    loadSession: true,              // ✅ Happy supports
    mcpCapabilities: {
      http: true,                      // ✅ Happy supports
      sse: true,                        // ✅ Happy supports
    },
    promptCapabilities: {
      embeddedContext: true,         // ✅ Happy supports
      image: true,                   // ✅ Happy supports
    },
  },
  authMethods: [...],
  agentInfo: {
    name: "OpenCode",
    version: "1.0.0",
  },
}
```

### What Happy CLI Currently Uses

```typescript
// Happy sends these requests via ClientSideConnection:
- connection.initialize()           // ✅
- connection.newSession()          // ✅
- connection.loadSession()          // ✅ (just added)
- connection.prompt()              // ✅
- connection.cancel()             // ✅
- connection.requestPermission()     // ✅
```

### What Happy CLI Needs to Add

```typescript
// Server-side requests to receive and handle:
connection.sessionUpdate({          // ✅ Already receives partially
  update: {
    tool_call,                   // ✅ Happy handles
    tool_call_update,             // ✅ Happy handles
    plan,                        // ❌ NEED TO ADD
    agent_message_chunk,          // ✅ Happy handles
    agent_thought_chunk,          // ✅ Happy handles
    user_message_chunk,            // ❌ NEED TO ADD
    available_commands_update,     // ❌ NEED TO ADD
    available_models_update,        // ❌ NEED TO ADD
  }
})

connection.sessionUpdate({          // ❌ NEED TO ADD
  update: {
    available_modes_update,      // ❌ NEED TO ADD
  }
})
```

---

## Section 2: Session Mode Management

### Requirements

OpenCode's session mode system allows users to set behavior:
- **Default mode:** Prompt for all tool calls (current behavior)
- **Yolo mode:** Automatically approve all tools (fewer prompts)
- **Safe mode:** Auto-approve only safe tools (read-only, search)

### Implementation

#### 2.1 Extend AcpSdkBackendOptions

```typescript
export interface AcpSdkBackendOptions {
  agentName: string;
  cwd: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  mcpServers?: Record<string, McpServerConfig>;
  permissionHandler?: AcpPermissionHandler;
  resumeSessionId?: string;
  // NEW: Session mode for this Happy session
  sessionMode?: 'default' | 'yolo' | 'safe';
}
```

#### 2.2 Update createOpenCodeBackend

```typescript
// src/agent/acp/opencode.ts
export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  const backendOptions: AcpSdkBackendOptions = {
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
    resumeSessionId: options.resumeSessionId,
    sessionMode: options.sessionMode,  // NEW
  };

  return new AcpSdkBackend(backendOptions);
}
```

#### 2.3 Update runOpenCode Options

```typescript
// src/opencode/runOpenCode.ts
interface OpenCodeMode extends EnhancedMode {
  permissionMode: PermissionMode;
  model?: string;
  sessionMode?: 'default' | 'yolo' | 'safe';  // NEW
}

export async function runOpenCode(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  resumeSessionId?: string;
  forceNewSession?: boolean;
  sessionMode?: 'default' | 'yolo' | 'safe';  // NEW
}): Promise<void> {
  // ... existing code

  const messageMode: OpenCodeMode = {
    permissionMode: getPermissionMode(),
    model: opts.model,
    sessionMode: opts.sessionMode ?? 'default',  // NEW
  };
}
```

#### 2.4 Track Session Mode in Message Queue

```typescript
// Update hash function to include session mode
const messageQueue = new MessageQueue2<OpenCodeMode>(mode => hashObject({
  isPlan: mode.permissionMode === 'plan',
  model: mode.model,
  sessionMode: mode.sessionMode,  // NEW
}));
```

#### 2.5 Send Session Mode to OpenCode

When sending a prompt, include session mode in mode ID or as parameter:

```typescript
// In startSession() or sendPrompt():
const modeMapping = {
  'default': 'default',      // OpenCode expects 'default'
  'yolo': 'yolo',            // Maps to 'allow_always' mode
  'safe': 'safe',              // Maps to 'safe' mode
};

const opencodeMode = modeMapping[sessionMode] ?? 'default';

// Check if OpenCode supports mode setting - if not, default to 'default'
// This requires OpenCode to support setSessionMode request
```

#### 2.6 Handle Mode Changes

Monitor for mode updates from server:

```typescript
// In handleSessionUpdate():
if (update.sessionUpdate === 'available_modes_update') {
  // Server reports available modes
  logger.debug(`[AcpSdkBackend] Available modes: ${JSON.stringify(update.availableModes)}`);
}
```

### Data Flow

```
┌─────────────┐
│ Happy CLI  │
│             │
│ sessionMode: │──────────────┐
│ 'yolo'      │              │
└─────────────┘              │
                             │
                    ┌─────────────────────┐
                    │   AcpSdkBackend    │
                    │                     │
                    │  Check mode on     │
                    │  every prompt/tool    │
                    │                     │
                    └─────────────────────┘
                             │
                    ┌─────────────────────┐
                    │  opencode acp     │
                    │ (OpenCode)          │
                    │                     │
                    │ Apply mode to      │
                    │ permission decisions  │
                    └─────────────────────┘
```

---

## Section 3: Permission Mode Enhancements

### Requirements

OpenCode's permission modes provide granular control:
- **Once:** Approve this specific tool call, then deny future calls
- **Always:** Approve this specific tool call and all future calls of this type
- **Reject:** Reject this specific tool call

### Implementation

#### 3.1 Extend Permission Handler

```typescript
// src/agent/acp/AcpSdkBackend.ts
export interface AcpPermissionHandler {
  handleToolCall(
    toolCallId: string,
    toolName: string,
    input: unknown,
    sessionMode: 'default' | 'yolo' | 'safe'  // NEW parameter
  ): Promise<{ decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }>;
}
```

#### 3.2 Permission Mode State

```typescript
// Add to AcpSdkBackend class:
class AcpSdkBackend {
  // ... existing fields

  /** Track permission mode per tool type */
  private permissionModes = new Map<string, {
    mode: 'once' | 'always' | 'reject';
    setAt: number;
  }>();

  /** Session mode affects permission decisions */
  private sessionMode?: 'default' | 'yolo' | 'safe';

  constructor(private options: AcpSdkBackendOptions) {
    this.sessionMode = options.sessionMode;
  }
}
```

#### 3.3 Permission Decision Logic

```typescript
async handleToolCallInternal(
  toolCallId: string,
  toolName: string,
  input: unknown
): Promise<{ decision: 'approved' | 'approved_for_session' | 'denied' | 'abort' }> {
  // Check explicit mode for this tool type
  const storedMode = this.permissionModes.get(toolName);
  if (storedMode) {
    return {
      decision: mapPermissionModeToDecision(storedMode.mode),
    };
  }

  // Check session-level mode
  if (this.sessionMode === 'yolo') {
    return { decision: 'approved' };
  }

  if (this.sessionMode === 'safe') {
    const isSafeTool = isSafeTool(toolName);
    return {
      decision: isSafeTool ? 'approved' : 'denied',
    };
  }

  // Default mode - prompt user via permissionHandler
  return await this.options.permissionHandler?.handleToolCall(
    toolCallId,
    toolName,
    input,
    this.sessionMode
  ) ?? { decision: 'denied' };
}
```

#### 3.4 Handle Permission Options

```typescript
// In handleSessionUpdate():
if (update.sessionUpdate === 'permission.asked') {
  const permission = event.properties;
  const options = update.options;  // PermissionOption[]

  // User selected option: { optionId, name, kind }
  const selectedOption = options.find(opt =>
    opt.outcome?.outcome === 'selected'
  );

  if (selectedOption) {
    const { optionId, name, kind } = selectedOption;
    const mode = mapOptionToMode(optionId);  // 'once', 'always', 'reject'

    // Store mode for this tool type
    this.permissionModes.set(permission.tool, {
      mode,
      setAt: Date.now(),
    });

    logger.debug(`[AcpSdkBackend] Permission mode set: ${permission.tool} -> ${mode}`);
  }
}

function mapOptionToMode(optionId: string): 'once' | 'always' | 'reject' {
  const mapping = {
    'once': 'once',
    'always': 'always',
    'reject': 'reject',
  };
  return mapping[optionId];
}
```

### Data Flow

```
┌──────────────┐
│  User sets   │
│  "once" mode  │
│  for "bash"  │
└──────────────┘
        │
        │
┌────────────────────────────────┐
│  AcpSdkBackend            │
│                          │
│ 1. Permission requested    │
│    from OpenCode           │
│                          │
│ 2. Check session mode     │
│    - yolo: auto-approve    │
│    - safe: check safe list │
│    - default: call handler   │
│                          │
│ 3. If session mode is    │
│    default, store user's   │
│    explicit choice (once/     │
│    always/reject)            │
│                          │
│ 4. Use stored mode on     │
│    future requests           │
└────────────────────────────────┘
```

---

## Section 4: Terminal Commands

### Requirements

OpenCode's terminal commands allow direct control:
- **compact:** Condense session history
- **summarize:** Generate session summary
- **list:** List sessions
- **edit:** Edit files
- Plus many other commands

### Implementation

#### 4.1 Command Parser

```typescript
// src/agent/acp/AcpSdkBackend.ts

export interface AcpSdkBackendOptions {
  // ... existing fields
  sessionMode?: 'default' | 'yolo' | 'safe';
  initialCommand?: string;  // NEW: Initial command to execute
}

export class AcpSdkBackend {
  /** Parse commands from user input */
  private parseCommand(input: string): { name: string; args: string[] } | null {
    const trimmed = input.trim();

    // Not a command if doesn't start with /
    if (!trimmed.startsWith('/')) {
      return null;
    }

    const [name, ...rest] = trimmed.slice(1).split(/\s+/);
    const args = rest.join(' ').trim();

    return { name, args: args ? args.split(/\s+/) : [] };
  }

  /** Execute a command */
  private async executeCommand(
    name: string,
    args: string[]
  ): Promise<void> {
    const sessionId = this.acpSessionId!;

    switch (name) {
      case 'compact':
        // Call OpenCode's compact via session command
        await this.connection?.sessionCommand({
          sessionId,
          command: 'compact',
          arguments: [],
        });
        break;

      case 'summarize':
        await this.connection?.sessionCommand({
          sessionId,
          command: 'summarize',
          arguments: [],
        });
        break;

      // Add more commands as needed
      default:
        logger.debug(`[AcpSdkBackend] Unknown command: ${name}`);
    }
  }
}
```

#### 4.2 Integrate with Prompt Flow

```typescript
// In sendPrompt():
async sendPrompt(sessionId: SessionId, prompt: string): Promise<void> {
  const parsed = this.parseCommand(prompt);

  if (parsed) {
    // Execute command
    await this.executeCommand(parsed.name, parsed.args);

    // Don't send prompt to OpenCode
    return;
  }

  // Regular prompt - send to OpenCode
  const parts: PromptRequest['prompt'] = [
    { type: 'text', text: prompt },
  ];

  await this.connection!.prompt({
    sessionId,
    parts,
    // Include command mode info
    agent: this.sessionAgent ?? null,  // This will need to be tracked
  });
}
```

#### 4.3 Available Commands

Monitor for available commands from OpenCode:

```typescript
// In handleSessionUpdate():
if (update.sessionUpdate === 'available_commands_update') {
  const availableCommands = update.availableCommands;  // Array of { name, description }

  // Cache available commands for help
  this.availableCommands = availableCommands;

  logger.debug(`[AcpSdkBackend] Available commands:`,
    availableCommands.map(cmd => cmd.name).join(', ')
  );
}
```

#### 4.4 Help Command

```typescript
private async showHelp(): Promise<void> {
  const commands = this.availableCommands || [];

  this.emit({
    type: 'terminal-output',
    data: `Available commands:\n${
      commands.map(cmd => `  /${cmd.name.padEnd(15)} ${cmd.description || ''}`).join('\n')
    }`,
  });
}
```

### Data Flow

```
┌──────────────┐
│  User types    │
│  "/compact"     │
└──────────────┘
        │
        │
┌────────────────────────────────┐
│  AcpSdkBackend            │
│                          │
│  1. Parse command      │
│    - Detect "/" prefix    │
│    - Extract name/args    │
│                          │
│  2. Check if command    │
│    is known (compact,    │
│    summarize, list, etc.)  │
│                          │
│  3. If command:         │
│    - Execute via          │
│    sessionCommand()        │
│  4. Else: send as      │
│    regular prompt         │
└────────────────────────────────┘
        │
        │
┌────────────────────────────────┐
│  opencode acp (OpenCode)  │
│                          │
│  Execute command or process  │
│  prompt                 │
└────────────────────────────────┘
```

---

## Section 5: Edit/Diff Support

### Requirements

OpenCode's edit support sends diffs when tools modify files:
- Detect `kind: "edit"` tool calls
- Extract `oldText` and `newText` from tool input
- Emit diffs for mobile app

### Implementation

#### 5.1 Diff Extraction

```typescript
// In handleSessionUpdate():
case "tool_call_update":
  if (update.status === "completed") {
    const kind = toToolKind(part.tool);
    const content: update.content || [];

    // Look for diff content
    const diffContent = content.find(c =>
      c.type === "diff" && "path" in c && "oldText" in c && "newText" in c
    );

    if (diffContent && kind === "edit") {
      this.emit({
        type: 'fs-edit',
        description: `Edit: ${diffContent.path}`,
        diff: formatDiff(diffContent.oldText, diffContent.newText),
        path: diffContent.path,
      });
    }
  }
```

#### 5.2 Diff Formatting

```typescript
function formatDiff(oldText: string, newText: string): string {
  // Simple line-by-line diff
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const changes: string[] = [];

  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    const oldLine = oldLines[i] || '';
    const newLine = newLines[i] || '';

    if (oldLine !== newLine) {
      const marker = i < oldLines.length ? '-' : '+';
      changes.push(`${marker} ${newLine}`);
    }
  }

  return changes.join('\n');
}
```

#### 5.3 Track Active Edits

```typescript
// In AcpSdkBackend class:
private activeEdits = new Map<string, {
  path: string;
  oldText: string;
  newText: string;
  timestamp: number;
}>();
```

### Data Flow

```
┌──────────────┐
│  Tool completes  │
│  (edit file)    │
└──────────────┘
        │
        │
┌────────────────────────────────┐
│  AcpSdkBackend            │
│                          │
│  1. Extract diff from    │
│    completed tool call    │
│                          │
│  2. Format as unified    │
│    diff                   │
│                          │
│  3. Emit fs-edit event │
│    for mobile app        │
└────────────────────────────────┘
        │
        │
┌────────────────────────────────┐
│  Mobile App              │
│                          │
│  Display diff view        │
│    with old/new text     │
└────────────────────────────────┘
```

---

## Section 6: Todo Integration

### Requirements

OpenCode's todo support allows task management:
- Parse `todowrite` tool output
- Convert to plan entries
- Emit plan events for mobile app

### Implementation

#### 6.1 Todo Parsing

```typescript
// In handleSessionUpdate():
case "tool_call_update":
  if (update.status === "completed") {
    if (part.tool === "todowrite") {
      const parsedTodos = this.parseTodoOutput(part.state.output);

      if (parsedTodos) {
        this.emit({
          type: 'event',
          name: 'plan',
          payload: {
            entries: parsedTodos,
          },
        });
      }
    }
  }
}

private parseTodoOutput(output: string): PlanEntry[] | null {
  try {
    const data = JSON.parse(output);
    const todos = z.array(Todo.Info).safeParse(data);

    if (!todos.success) {
      logger.debug(`[AcpSdkBackend] Failed to parse todos:`, todos.error);
      return null;
    }

    return todos.data.map(todo => ({
      status: todo.status === 'cancelled' ? 'completed' : (todo.status as PlanEntry['status']),
      content: todo.content,
    }));
  } catch (error) {
    logger.debug('[AcpSdkBackend] Error parsing todo output:', error);
    return null;
  }
}
```

#### 6.2 Todo Schema

```typescript
interface PlanEntry {
  status: 'completed' | 'pending' | 'in-progress';
  content: string;
}

// This matches Happy CLI's existing plan format
```

### Data Flow

```
┌──────────────┐
│  Tool call     │
│  (todowrite)  │
└──────────────┘
        │
        │
┌────────────────────────────────┐
│  AcpSdkBackend            │
│                          │
│  1. Parse JSON output │
│    from tool result     │
│                          │
│  2. Extract todos      │
│    with status/content    │
│                          │
│  3. Emit plan event   │
│    for mobile app        │
└────────────────────────────────┘
```

---

## Section 7: Update Handler Extensions

### Requirements

Handle new ACP server notification types:
- `user_message_chunk` - User message streaming
- `available_commands_update` - Command list updates
- `available_modes_update` - Mode list updates
- `available_models_update` - Model list updates

### Implementation

#### 7.1 Extend handleSessionUpdate

```typescript
private handleSessionUpdate(notification: SessionNotification): void {
  const update = notification.update;
  if (!update) return;

  switch (update.sessionUpdate) {
    case 'tool_call':
      // Existing handling
      this.handleToolCall(update);
      break;

    case 'tool_call_update':
      // Existing handling
      this.handleToolCallUpdate(update);
      break;

    case 'agent_message_chunk':
    case 'agent_thought_chunk':
      // Existing handling
      this.handleContentChunk(update);
      break;

    // NEW: User message chunks
    case 'user_message_chunk':
      const delta = update.delta;
      if (delta) {
        this.emit({
          type: 'model-output',
          textDelta: delta,
        });
      }
      break;

    // NEW: Available commands
    case 'available_commands_update':
      this.availableCommands = update.availableCommands;
      logger.debug(`[AcpSdkBackend] Available commands updated:`,
        this.availableCommands?.map(c => c.name).join(', ')
      );
      break;

    // NEW: Available modes
    case 'available_modes_update':
      logger.debug(`[AcpSdkBackend] Available modes: ${JSON.stringify(update.availableModes)}`);
      break;

    // NEW: Available models
    case 'available_models_update':
      logger.debug(`[AcpSdkBackend] Available models: ${JSON.stringify(update.availableModels)}`);
      break;

    default:
      logger.debug('[AcpSdkBackend] Unknown session update type:', update.sessionUpdate);
  }
}
```

### Data Flow

```
┌──────────────┐
│  OpenCode     │
│  sends update │
└──────────────┘
        │
        │
┌────────────────────────────────┐
│  AcpSdkBackend            │
│                          │
│  1. Parse notification │
│    type (switch)         │
│                          │
│  2. Handle accordingly │
│    - Emit events        │
│    - Cache commands       │
└────────────────────────────────┘
```

---

## Section 8: Error Handling and Edge Cases

### 8.1 Command Not Supported

```typescript
private async executeCommand(name: string, args: string[]): Promise<void> {
  const available = this.availableCommands || [];

  if (!available.find(c => c.name === name)) {
    this.emit({
      type: 'terminal-output',
      data: `Unknown command: /${name}. Type /help for available commands.`,
    });
    return;
  }

  // Execute command
  // ...
}
```

### 8.2 Permission Mode Invalid

```typescript
if (storedMode && !isValidPermissionMode(storedMode.mode)) {
  // Reset to default
  this.permissionModes.delete(toolName);
  logger.debug(`[AcpSdkBackend] Invalid permission mode reset: ${toolName}`);
}
```

### 8.3 Session Mode Not Supported

```typescript
if (sessionMode && !['default', 'yolo', 'safe'].includes(sessionMode)) {
  logger.warn(`[AcpSdkBackend] Unsupported session mode: ${sessionMode}, defaulting to 'default'`);
  this.sessionMode = 'default';
}
```

### 8.4 Connection Errors

```typescript
// Enhanced error handling for session commands
try {
  await this.connection?.sessionCommand({
    sessionId,
    command: name,
    arguments: args,
  });
} catch (error) {
  logger.debug(`[AcpSdkBackend] Failed to execute command: ${name}`, error);
  this.emit({
    type: 'terminal-output',
    data: `Error executing /${name}: ${error.message}`,
  });
}
```

---

## Section 9: Testing Strategy

### 9.1 Unit Tests

```typescript
// src/agent/acp/__tests__/AcpSdkBackend.enhanced.test.ts

describe('session mode management', () => {
  it('should pass sessionMode to backend options', async () => {
    const backend = createAcpSdkBackend({
      sessionMode: 'yolo',
    });
    expect(backend.getSessionMode()).toBe('yolo');
  });

  it('should auto-approve in yolo mode', async () => {
    const backend = createAcpSdkBackend({ sessionMode: 'yolo' });
    // Send tool call request
    const result = await backend.handlePermission('bash', { command: 'ls' });
    expect(result.decision).toBe('approved');
  });

  it('should auto-deny unsafe tools in safe mode', async () => {
    const backend = createAcpSdkBackend({ sessionMode: 'safe' });
    const result = await backend.handlePermission('bash', { command: 'rm -rf /' });
    expect(result.decision).toBe('denied');
  });
});

describe('terminal commands', () => {
  it('should parse and execute /compact command', async () => {
    const backend = createAcpSdkBackend();
    await backend.sendPrompt(sessionId, '/compact');
    // Verify sessionCommand was called
  });

  it('should show help for /help command', async () => {
    const backend = createAcpSdkBackend();
    const output = [];
    backend.onMessage(msg => output.push(msg));
    await backend.sendPrompt(sessionId, '/help');
    expect(output.some(msg =>
      msg.type === 'terminal-output' && msg.data?.includes('Available commands')
    )).toBe(true);
  });
});

describe('edit/diff support', () => {
  it('should extract and format diffs from edit tools', async () => {
    const backend = createAcpSdkBackend();
    const edits = [];
    backend.onMessage(msg => {
      if (msg.type === 'fs-edit') edits.push(msg);
    });

    // Simulate edit tool completion
    // ... emit sessionUpdate with edit content

    expect(edits.length).toBe(1);
    expect(edits[0].diff).toBeDefined();
  });
});

describe('todo integration', () => {
  it('should parse todo output and emit plan events', async () => {
    const backend = createAcpSdkBackend();
    const plans = [];
    backend.onMessage(msg => {
      if (msg.type === 'event' && msg.name === 'plan') {
        plans.push(msg.payload);
      }
    });

    // Simulate todowrite tool completion
    // ... emit sessionUpdate with todo JSON

    expect(plans.length).toBe(1);
    expect(plans[0].payload.entries).toBeDefined();
  });
});
```

### 9.2 Integration Tests

```typescript
// src/opencode/__tests__/integration/enhanced-features.test.ts

describe('session mode integration', () => {
  it('should set and apply yolo mode', async () => {
    const { backend, session } = await createOpenCodeTestSession({
      sessionMode: 'yolo',
    });

    // Prompt with tool that requires permission
    await session.prompt('Use bash to list files');

    // Verify no permission request was sent (auto-approved in yolo)
    expect(session.getPermissionRequests()).toHaveLength(0);
  });
});

describe('terminal commands integration', () => {
  it('should execute compact command via OpenCode', async () => {
    const { backend, session } = await createOpenCodeTestSession();

    // Send compact command
    await session.prompt('/compact');

    // Wait for compact to complete
    await waitForIdle(session);

    // Verify session was compacted (fewer messages)
    // This requires OpenCode to support compact command
  });
});

describe('edit/diff tracking integration', () => {
  it('should track and emit file edits', async () => {
    const { backend, session } = await createOpenCodeTestSession();

    // Prompt to edit a file
    await session.prompt('Edit README.md, change Hello to Goodbye');

    // Wait for tool completion
    await waitForToolComplete(session, 'edit');

    // Verify fs-edit event was emitted
    const edits = getSessionEdits();
    expect(edits.some(e =>
      e.path === 'README.md' &&
      e.diff.includes('Hello') &&
      e.diff.includes('Goodbye')
    )).toBe(true);
  });
});

describe('todo integration', () => {
  it('should parse and emit todos from todowrite', async () => {
    const { backend, session } = await createOpenCodeTestSession();

    // Prompt with todowrite
    await session.prompt('Add a todo to fix the bug');

    // Wait for tool completion
    await waitForToolComplete(session, 'todowrite');

    // Verify plan event was emitted
    const plans = getEmittedPlans();
    expect(plans.some(p =>
      p.payload.entries?.some(e =>
        e.content.includes('Add a todo') && e.content.includes('fix the bug')
      )
    )).toBe(true);
  });
});
```

### 9.3 Manual Testing

```bash
# Test session modes
./bin/happy.mjs opencode --session-mode yolo
./bin/happy.mjs opencode --session-mode safe

# Test terminal commands
./bin/happy.mjs opencode
> /compact
> /summarize
> /help

# Test permission modes
# Set once mode for bash tool
# (via mobile app or CLI flag)

# Verify edit/diff tracking
./bin/happy.mjs opencode
# Edit a file
# Check mobile app shows diff

# Verify todo integration
./bin/happy.mjs opencode
# Add todos
# Check mobile app shows plan
```

---

## Section 10: Rollout Plan

### Phase 1: Session Modes (Week 1)
**Files:**
- `src/agent/acp/AcpSdkBackend.ts` - ~150 lines added
- `src/agent/acp/opencode.ts` - ~10 lines modified
- `src/opencode/runOpenCode.ts` - ~20 lines modified
- `src/daemon/run.ts` - ~30 lines modified (sessionMode parsing)

**Tests:**
- Unit tests: ~100 lines
- Integration tests: ~150 lines

**Complexity:** Medium
- Requires coordination with OpenCode on session mode support
- May need ACP protocol clarification

### Phase 2: Permission Modes (Week 2)
**Files:**
- `src/agent/acp/AcpSdkBackend.ts` - ~100 lines added
- Permission mode state management

**Tests:**
- Unit tests: ~80 lines
- Integration tests: ~100 lines

**Complexity:** Low-Medium
- Logic is straightforward
- Requires permission mode mapping

### Phase 3: Terminal Commands (Week 3)
**Files:**
- `src/agent/acp/AcpSdkBackend.ts` - ~120 lines added
- Command parser and executor

**Tests:**
- Unit tests: ~120 lines
- Integration tests: ~150 lines

**Complexity:** Low-Medium
- Requires OpenCode to support `sessionCommand` requests
- May need ACP protocol clarification

### Phase 4: Edit/Diff Support (Week 4)
**Files:**
- `src/agent/acp/AcpSdkBackend.ts` - ~80 lines added

**Tests:**
- Unit tests: ~50 lines
- Integration tests: ~100 lines

**Complexity:** Low-Medium
- Diff parsing logic
- Mobile app integration

### Phase 5: Todo Integration (Week 5)
**Files:**
- `src/agent/acp/AcpSdkBackend.ts` - ~60 lines added

**Tests:**
- Unit tests: ~50 lines
- Integration tests: ~50 lines

**Complexity:** Low
- Todo JSON parsing
- Zod schema validation

### Total Estimates

| Metric | Estimate |
|--------|---------|
| **New Code** | ~510 lines |
| **Modified Code** | ~60 lines |
| **New Tests** | ~400 lines |
| **Development Time** | 5 weeks |
| **Testing Time** | 2 weeks |

---

## Section 11: Open Questions and Dependencies

### 11.1 OpenCode ACP Protocol Questions

1. **Session Mode Support:**
   - Does OpenCode's `setSessionMode` expect specific mode IDs?
   - How does OpenCode's "yolo" mode map to `default`/`yolo`/`safe`?

2. **Terminal Commands:**
   - Does OpenCode support `sessionCommand` for all commands?
   - What's the command structure (name + arguments)?
   - Are there commands Happy shouldn't expose?

3. **Edit/Diff Format:**
   - What's the exact format of diff content in tool updates?
   - Should we compute unified diff or trust OpenCode's format?

4. **Todo Format:**
   - Is the todo output format stable?
   - Can we rely on Zod parsing?

### 11.2 ACP SDK Questions

1. **SessionCommand Type:**
   - Does `@agentclientprotocol/sdk` define `sessionCommand` request type?
   - If not, is it experimental or part of different protocol?

2. **Notification Types:**
   - Are `user_message_chunk` and `available_*_update` standard ACP types?
   - Where are they documented?

3. **Best Practices:**
   - How to handle protocol version mismatches?
   - Graceful degradation when features aren't supported?

### 11.3 Mobile App Coordination

1. **UI Impact:**
   - How should mobile app display permission modes?
   - Design for command history/completion?

2. **Feature Flags:**
   - Should we add feature flags for experimental features?
   - Gradual rollout strategy?

---

## Success Criteria

Implementation is complete when:

1. ✅ Session modes (default, yolo, safe) are implemented
2. ✅ Permission modes (once, always, reject) are working
3. ✅ Terminal commands (/compact, /summarize, /list, /help) work
4. ✅ Edit/diff tracking emits `fs-edit` events
5. ✅ Todo integration emits `plan` events
6. ✅ Unit tests cover all new features (passing)
7. ✅ Integration tests verify end-to-end flows
8. ✅ Documentation updated with usage examples
9. ✅ Mobile app UI updated for new events
10. ✅ No regression in existing functionality

---

## Risk Assessment

### Technical Risks

1. **Protocol Mismatch:**
   - **Risk:** OpenCode's ACP implementation may not match standard exactly
   - **Mitigation:** Graceful degradation, feature detection

2. **OpenCode Changes:**
   - **Risk:** OpenCode may add/remove ACP features
   - **Mitigation:** Version checking, feature detection

3. **Complexity:**
   - **Risk:** Adding 500+ lines of new code
   - **Mitigation:** Phased rollout, extensive testing

4. **Testing:**
   - **Risk:** Hard to test real OpenCode integration
   - **Mitigation:** Mock responses, test against multiple OpenCode versions

### Dependencies on OpenCode

- This implementation **requires coordination** with OpenCode team
- ACP protocol changes need validation from OpenCode maintainers
- Some features may not be available in all OpenCode versions
- **Fallback behavior** needed for unsupported features

---

## Alternative Approaches Considered

### Alternative 1: Reimplement as Full ACP Server

**Description:** Replace thin wrapper with full ACP server implementation

**Pros:**
- Complete control over all ACP features
- No dependency on OpenCode's internal architecture
- Can add custom features

**Cons:**
- **Major refactoring** (rewrite AcpSdkBackend)
- **Complex session management** (replicate OpenCode's 1000+ lines)
- **Duplicated logic** (session management in both places)
- **High maintenance burden** (must track OpenCode changes)
- **Testing complexity** (need to test full ACP server behavior)

**Verdict:** Rejected - Too complex for value

### Alternative 2: Minimal Implementation

**Description:** Only add session modes and skip other features

**Pros:**
- Smallest scope (100-150 lines)
- Low risk
- Quick to implement

**Cons:**
- Still missing valuable features (terminal commands, edit/diff, todos)
- Users may not see expected feature parity
- Need to revisit later

**Verdict:** Rejected - User wants "whole support"

### Alternative 3: Phased Full Implementation (Selected)

**Description:** Implement all features in 5 phases over 5 weeks

**Pros:**
- Achieves feature parity with OpenCode
- Manages complexity with phased approach
- Each phase can be tested independently
- Risk mitigation through rollout

**Cons:**
- Still requires significant effort (5 weeks)
- Dependent on OpenCode's ACP protocol stability
- Need coordination with OpenCode team

**Verdict:** Selected - Matches user's "whole support" requirement

---

## References

**Design:**
- OpenCode ACP implementation: `opencode/packages/opencode/src/acp/agent.ts` (~1050 lines)
- ACP architecture analysis: `docs/plans/2026-01-04-acp-architecture-analysis.md`
- Happy CLI AcpSdkBackend: `src/agent/acp/AcpSdkBackend.ts` (~750 lines)
- OpenCode parity document: `docs/opencode-feature-parity.md`

**Protocols:**
- ACP SDK: `@agentclientprotocol/sdk`
- OpenCode SDK: `@opencode-ai/sdk/v2`

**Related Features:**
- ReasoningProcessor: `src/opencode/utils/reasoningProcessor.ts` (~280 lines)
- Session resumption: `src/opencode/utils/sessionPersistence.ts` (~110 lines)
