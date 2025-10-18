# Happy CLI - Codebase Structure

## Root Directory Structure
```
happy-cli-dev/
├── src/              # Main source code
├── bin/              # Executable scripts (happy.mjs, happy-mcp.mjs)
├── scripts/          # Build and launcher scripts
├── tools/            # Additional tools and utilities
├── .taskmaster/      # Task Master AI project management
├── .claude/          # Claude Code configuration
├── .serena/          # Serena MCP server data
├── demo-project/     # Example/demo project
├── package.json      # NPM package configuration
├── tsconfig.json     # TypeScript configuration
├── vitest.config.ts  # Test configuration
└── CLAUDE.md         # Project instructions for Claude
```

## Source Code Organization (`src/`)

### API Module (`src/api/`)
**Purpose:** Server communication and encryption
- `api.ts` - Main API client class for session management
- `apiSession.ts` - WebSocket-based real-time session client with RPC
- `auth.ts` - Authentication flow using TweetNaCl signatures
- `encryption.ts` - End-to-end encryption utilities
- `types.ts` - Zod schemas for type-safe API communication

**Key Features:**
- End-to-end encryption for all communications
- Socket.IO for real-time messaging
- Optimistic concurrency control for state updates
- RPC handler registration

### Claude Integration (`src/claude/`)
**Purpose:** Core Claude Code integration layer

**Main Files:**
- `loop.ts` - Main control loop managing interactive/remote modes
- `types.ts` - Claude message type definitions with parsers
- `session.ts` - Session management
- `claudeLocal.ts` - Local interactive mode (PTY-based)
- `claudeRemote.ts` - Remote mode (mobile control via SDK)
- `claudeLocalLauncher.ts` - Local mode launcher
- `claudeRemoteLauncher.ts` - Remote mode launcher
- `runClaude.ts` - Claude execution orchestration
- `registerKillSessionHandler.ts` - Session cleanup

**SDK Subdirectory (`src/claude/sdk/`):**
- `index.ts` - Public SDK exports
- `query.ts` - Main query implementation (CLI spawning)
- `types.ts` - Type definitions for SDK messages
- `stream.ts` - Stream utilities
- `utils.ts` - Helper functions
- `prompts.ts` - Prompt management
- `metadataExtractor.ts` - Extract metadata from messages

**Utils Subdirectory (`src/claude/utils/`):**
- `claudeSettings.ts` - Settings management
- `claudeCheckSession.ts` - Session validation
- `permissionHandler.ts` - Permission handling
- `sessionScanner.ts` - Session file scanning
- `sdkToLogConverter.ts` - Convert SDK messages to logs
- `systemPrompt.ts` - System prompt management
- `getToolDescriptor.ts` - Tool metadata
- `getToolName.ts` - Tool name extraction
- `path.ts` - Path utilities
- `OutgoingMessageQueue.ts` - Message queue for outgoing messages
- `startHappyServer.ts` - Start embedded server

**Key Features:**
- Dual mode operation (local/remote)
- Session persistence and resumption
- Real-time message streaming
- Permission intercepting via MCP

### UI Module (`src/ui/`)
**Purpose:** User interface components
- `logger.ts` - Centralized logging system with file output
- `qrcode.ts` - QR code generation for mobile auth
- `start.ts` - Main application startup and orchestration

**Key Features:**
- Clean console UI with chalk styling
- QR code display for easy mobile connection
- Graceful mode switching

### Utilities (`src/utils/`)
- `MessageQueue.ts` - Async iterable message queue
- `MessageQueue2.ts` - Enhanced message queue with modes
- `PushableAsyncIterable.ts` - Async iterable implementation
- `time.ts` - Exponential backoff utilities

### Codex Module (`src/codex/`)
**Purpose:** Codex-specific functionality
- `happyMcpStdioBridge.ts` - MCP stdio bridge for Codex

### Core Files (`src/`)
- `index.ts` - CLI entry point with argument parsing
- `persistence.ts` - Local storage for settings and keys
- `lib.ts` - Library exports
- `projectPath.ts` - Project path resolution

## Scripts Directory (`scripts/`)
- `claude_local_launcher.cjs` - Local mode Claude launcher
- `claude_remote_launcher.cjs` - Remote mode Claude launcher
- `unpack-tools.cjs` - Tool unpacking script

## Binary Files (`bin/`)
- `happy.mjs` - Main CLI executable
- `happy-mcp.mjs` - MCP executable

## Configuration Files
- `.mcp.json` - MCP server configuration
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Vitest test configuration
- `.release-it.json` - Release-it configuration
- `package.json` - NPM package manifest

## Data Flow

### Local Mode Flow
```
User Input → PTY → Claude → File Watcher → Server → Mobile App
```

### Remote Mode Flow
```
Mobile App → Server → SDK Query → Claude → Server → Mobile App
```

## Key Design Patterns

1. **File-based logging** - Prevents interference with Claude's terminal UI
2. **Dual Claude integration** - Process spawning for interactive, SDK for remote
3. **End-to-end encryption** - All data encrypted before leaving device
4. **Session persistence** - Allows resuming sessions across restarts
5. **Optimistic concurrency** - Handles distributed state updates gracefully
6. **Message queuing** - Async message handling with backpressure
