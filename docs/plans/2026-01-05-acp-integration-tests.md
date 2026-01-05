# ACP Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add integration-style tests covering ACP session modes, commands, todowrite plan events, and edit diffs without spawning the real `opencode` binary.

**Architecture:** Add a new ACP integration test file that uses `createOpenCodeBackend` with mocked `@agentclientprotocol/sdk` and `child_process.spawn` to simulate ACP behavior. Use `handleSessionUpdate` to emit updates and verify downstream events, and use `/command` prompt flow to exercise command execution.

**Tech Stack:** TypeScript, Vitest, @agentclientprotocol/sdk (mocked), Happy CLI ACP backend

---

### Task 1: Create ACP integration test harness

**Files:**
- Create: `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOpenCodeBackend } from '@/agent/acp/opencode';
import type { AgentBackend } from '@/agent/AgentBackend';

describe('ACP Integration Tests', () => {
  let backend: AgentBackend;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes /compact via session command', async () => {
    backend = createOpenCodeBackend({
      cwd: '/tmp/test',
      mcpServers: {},
      permissionHandler: null as any,
      model: 'gpt-4',
    });

    await backend.startSession();
    await backend.sendPrompt('sess-1', '/compact');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts`
Expected: FAIL with spawn errors (real `opencode` not found / EPIPE).

**Step 3: Write minimal implementation (test harness mocks)**

```ts
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const mockInitialize = vi.fn();
const mockNewSession = vi.fn();
const mockPrompt = vi.fn();
const mockExtMethod = vi.fn();

const createMockProcess = () => {
  const process = new EventEmitter() as any;
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = vi.fn(() => true);
  return process;
};

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawn: vi.fn(() => createMockProcess()) };
});

vi.mock('@agentclientprotocol/sdk', () => {
  class ClientSideConnection {
    initialize = mockInitialize;
    newSession = mockNewSession;
    prompt = mockPrompt;
    extMethod = mockExtMethod;
    constructor(_clientFactory: unknown, _stream: unknown) {}
  }

  return {
    ClientSideConnection,
    ndJsonStream: vi.fn(() => ({})),
  };
});
```

Set default mock responses in `beforeEach`:

```ts
mockInitialize.mockResolvedValue({
  protocolVersion: 1,
  agentCapabilities: {},
  authMethods: [],
  agentInfo: { name: 'MockACP', version: '0.0.0' },
});
mockNewSession.mockResolvedValue({ sessionId: 'acp_session_1' });
mockPrompt.mockResolvedValue({ content: 'ok', complete: true });
mockExtMethod.mockResolvedValue({});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/__tests__/integration/acp/acpFeatures.test.ts
git commit -m "test(acp): add integration harness for ACP backend"
```

---

### Task 2: Add integration coverage for session modes and commands

**Files:**
- Modify: `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`

**Step 1: Write the failing test**

```ts
it('runs /compact via extMethod when command is available', async () => {
  backend = createOpenCodeBackend({
    cwd: '/tmp/test',
    mcpServers: {},
    permissionHandler: null as any,
    model: 'gpt-4',
  });

  await backend.startSession();

  (backend as any).handleSessionUpdate({
    sessionId: 'sess_1',
    update: {
      sessionUpdate: 'available_commands_update',
      availableCommands: [{ name: 'compact', description: 'Compact' }],
    },
  });

  await backend.sendPrompt('sess_1', '/compact');

  expect(mockExtMethod).toHaveBeenCalledWith('session/command', {
    command: 'compact',
    arguments: [],
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "runs /compact"`
Expected: FAIL until mocks and handlers are wired.

**Step 3: Write minimal implementation**

- Ensure `available_commands_update` is handled via `handleSessionUpdate` in the test setup before calling `sendPrompt`.
- Ensure `mockExtMethod` is in scope and reset per test in `beforeEach`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "runs /compact"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/__tests__/integration/acp/acpFeatures.test.ts
git commit -m "test(acp): cover session commands integration"
```

---

### Task 3: Add integration coverage for todowrite and edit updates

**Files:**
- Modify: `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`

**Step 1: Write the failing tests**

```ts
it('emits plan event from todowrite update', async () => {
  backend = createOpenCodeBackend({
    cwd: '/tmp/test',
    mcpServers: {},
    permissionHandler: null as any,
    model: 'gpt-4',
  });

  const messages: any[] = [];
  backend.onMessage((msg) => messages.push(msg));

  (backend as any).handleSessionUpdate({
    sessionId: 'sess_1',
    update: {
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'tc1',
      kind: 'todowrite',
      content: '[{"content":"Do the thing","status":"pending"}]',
    },
  });

  const plan = messages.find((m) => m.type === 'event' && m.name === 'plan');
  expect(plan).toBeDefined();
  expect(plan.payload.entries[0].content).toBe('Do the thing');
});

it('emits fs-edit event from edit update', async () => {
  backend = createOpenCodeBackend({
    cwd: '/tmp/test',
    mcpServers: {},
    permissionHandler: null as any,
    model: 'gpt-4',
  });

  const messages: any[] = [];
  backend.onMessage((msg) => messages.push(msg));

  (backend as any).handleSessionUpdate({
    sessionId: 'sess_1',
    update: {
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'tc2',
      kind: 'edit',
      content: [{ type: 'diff', path: 'README.md', oldText: 'Hello', newText: 'Goodbye' }],
    },
  });

  const edit = messages.find((m) => m.type === 'fs-edit');
  expect(edit).toBeDefined();
  expect(edit.path).toBe('README.md');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "todowrite|fs-edit"`
Expected: FAIL until the integration harness is in place.

**Step 3: Write minimal implementation**

- Reuse the integration harness from Task 1.
- Ensure `handleSessionUpdate` is accessible in test via `(backend as any)`.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "todowrite|fs-edit"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/__tests__/integration/acp/acpFeatures.test.ts
git commit -m "test(acp): cover todowrite and edit updates"
```

---

### Task 4: Add integration coverage for session mode decisions

**Files:**
- Modify: `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`

**Step 1: Write the failing test**

```ts
it('auto-approves tools in yolo mode via permission decision', async () => {
  backend = createOpenCodeBackend({
    cwd: '/tmp/test',
    mcpServers: {},
    permissionHandler: null as any,
    model: 'gpt-4',
    sessionMode: 'yolo',
  });

  const decision = await (backend as any).makePermissionDecision('tc3', 'bash', {});
  expect(decision.decision).toBe('approved');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "yolo mode"`
Expected: FAIL until test harness is in place.

**Step 3: Write minimal implementation**

- Reuse existing mocks and create the backend with `sessionMode: 'yolo'`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts -t "yolo mode"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/opencode/__tests__/integration/acp/acpFeatures.test.ts
git commit -m "test(acp): cover session mode decisions"
```

---

### Task 5: Run full ACP integration suite

**Files:**
- Test: `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`

**Step 1: Run integration tests**

Run: `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts`
Expected: PASS

**Step 2: Commit (if any final fixes)**

```bash
git add src/opencode/__tests__/integration/acp/acpFeatures.test.ts
git commit -m "test(acp): finalize ACP integration coverage"
```

---

Plan complete and saved to `docs/plans/2026-01-05-acp-integration-tests.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
