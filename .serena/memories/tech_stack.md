# Happy CLI - Tech Stack

## Language & Runtime
- **TypeScript** - Primary language (strict typing enforced)
- **Node.js** >= 20.0.0 (required by dependencies)
- **ESM** modules (type: "module" in package.json)

## Core Dependencies

### Claude Integration
- `@anthropic-ai/claude-code@2.0.14` - Claude Code SDK (TO BE MIGRATED to claude-agent-sdk)
- `@anthropic-ai/sdk@0.65.0` - Anthropic SDK for API calls

### Communication & Networking
- `socket.io-client@^4.8.1` - Real-time WebSocket communication with server
- `axios@^1.10.0` - HTTP client for API calls
- `http-proxy@^1.18.1` - Proxy support
- `http-proxy-middleware@^3.0.5` - Proxy middleware

### Cryptography & Security
- `tweetnacl@^1.0.3` - End-to-end encryption (TweetNaCl)
- `@stablelib/base64@^2.0.1` - Base64 encoding
- `@stablelib/hex@^2.0.1` - Hex encoding

### MCP Integration
- `@modelcontextprotocol/sdk@^1.15.1` - Model Context Protocol for tool integration

### Terminal & UI
- `ink@^6.1.0` - React-based terminal UI components
- `react@^19.1.1` - UI framework for terminal
- `chalk@^5.4.1` - Terminal string styling
- `qrcode-terminal@^0.12.0` - QR code display for mobile auth

### Process Management
- `cross-spawn@^7.0.6` - Cross-platform child process spawning
- `ps-list@^8.1.1` - Process listing utilities

### Utilities
- `zod@^3.23.8` - Schema validation and type safety
- `tmp@^0.2.5` - Temporary file management
- `tar@^7.4.3` - Archive handling
- `expo-server-sdk@^3.15.0` - Push notifications to mobile

### Development Tools
- `vitest@^3.2.4` - Unit testing framework
- `pkgroll@^2.14.2` - Build tool for packaging
- `tsx@^4.20.3` - TypeScript execution
- `typescript@^5` - TypeScript compiler
- `eslint@^9` - Linting
- `release-it@^19.0.4` - Release automation

## Build System
- **pkgroll** for bundling
- **TypeScript** compiler for type checking
- **ESM** and **CommonJS** dual exports
- Multiple entry points: CLI, lib, MCP bridge
