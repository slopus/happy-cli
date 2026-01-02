# OpenCode ACP Support Design

## Overview

Add OpenCode as a second ACP-compatible agent in Happy CLI, following the existing Gemini integration pattern.

## Decisions

| Decision | Choice |
|----------|--------|
| Authentication | API key passthrough - user provides OPENAI_API_KEY, ANTHROPIC_API_KEY, etc. |
| Model selection | Passthrough only - user specifies via `--model` flag or env vars |
| Command structure | `happy opencode` - dedicated top-level command |
| MCP servers | Merge Happy + OpenCode configs, Happy takes precedence on conflicts |
| Permissions | Route to mobile via existing permission handler |
| Implementation | Minimal Gemini clone - proven pattern, avoid premature abstraction |

## File Structure

```
src/
├── agent/
│   └── acp/
│       ├── index.ts          # Add: export opencode
│       ├── opencode.ts       # NEW: OpenCode backend factory
│       └── ...
├── commands/
│   └── opencode.ts           # NEW: CLI command handler
├── opencode/
│   ├── runOpenCode.ts        # NEW: Main entry point
│   ├── constants.ts          # NEW: Env var names, defaults
│   └── utils/
│       └── config.ts         # NEW: Config detection utilities
└── index.ts                  # Add: opencode command registration
```

## Component Details

### OpenCode Backend Factory

`src/agent/acp/opencode.ts`:

```typescript
export interface OpenCodeBackendOptions extends AgentFactoryOptions {
  model?: string;
  mcpServers?: Record<string, McpServerConfig>;
  permissionHandler?: AcpPermissionHandler;
}

export function createOpenCodeBackend(options: OpenCodeBackendOptions): AgentBackend {
  const command = 'opencode';
  const args = ['acp'];

  if (options.model) {
    args.push('--model', options.model);
  }

  return new AcpSdkBackend({
    agentName: 'opencode',
    cwd: options.cwd,
    command,
    args,
    env: options.env,
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
  });
}

export function registerOpenCodeAgent(): void {
  agentRegistry.register('opencode', (opts) => createOpenCodeBackend(opts));
}
```

### Run Entry Point

`src/opencode/runOpenCode.ts`:

```typescript
export interface RunOpenCodeOptions {
  cwd: string;
  model?: string;
  initialPrompt?: string;
}

export async function runOpenCode(options: RunOpenCodeOptions): Promise<void> {
  const { cwd, model, initialPrompt } = options;

  // 1. Create permission handler (routes to mobile via Happy server)
  const permissionHandler = createRemotePermissionHandler();

  // 2. Get MCP servers (merge Happy + OpenCode native configs)
  const mcpServers = await getMergedMcpServers(cwd);

  // 3. Create backend
  const backend = createOpenCodeBackend({
    cwd,
    model,
    mcpServers,
    permissionHandler,
  });

  // 4. Connect to Happy server for remote control
  const session = await connectToHappyServer(backend, 'opencode');

  // 5. Start agent session
  await backend.startSession(initialPrompt);

  // 6. Run control loop
  await runAgentLoop(backend, session);
}
```

### MCP Server Merging

`src/opencode/utils/config.ts`:

```typescript
export async function readOpenCodeConfig(): Promise<OpenCodeConfig> {
  const configPath = join(homedir(), '.config', 'opencode', 'config.json');
  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function getMergedMcpServers(cwd: string): Promise<Record<string, McpServerConfig>> {
  const openCodeConfig = await readOpenCodeConfig();
  const openCodeServers = openCodeConfig.mcpServers ?? {};
  const happyServers = await getHappyMcpServers(cwd);

  return {
    ...openCodeServers,
    ...happyServers,  // Happy takes precedence
  };
}
```

### CLI Command

`src/commands/opencode.ts`:

```typescript
export function createOpenCodeCommand(): Command {
  return new Command('opencode')
    .description('Run OpenCode agent with Happy remote control')
    .option('-m, --model <model>', 'Model to use')
    .option('-c, --cwd <dir>', 'Working directory', process.cwd())
    .option('-p, --prompt <prompt>', 'Initial prompt')
    .action(async (options) => {
      await runOpenCode({
        cwd: options.cwd,
        model: options.model,
        initialPrompt: options.prompt,
      });
    });
}
```

## Usage

```bash
# Basic - uses OpenCode's default model
happy opencode

# With specific model
happy opencode --model gpt-4o

# With initial prompt
happy opencode -p "fix the build errors"

# In specific directory
happy opencode -c /path/to/project
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| OpenCode not installed | Clear error with install command |
| No API keys set | Let OpenCode handle (shows its own error) |
| ACP init timeout | Existing 2-minute timeout in AcpSdkBackend |
| Permission denied | Routes to mobile for approval |
| OpenCode crashes | Exit handler emits `status: stopped` |

## Reused Components

- `AcpSdkBackend` - Unchanged, handles ACP protocol
- Permission handler infrastructure - Routes to mobile
- Session management - Happy server integration
- UI components - Status display, QR codes
