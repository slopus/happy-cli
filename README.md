# Happy

Code on the go controlling claude code from your mobile device.

Free. Open source. Code anywhere.

## Installation

```bash
npm install -g happy-coder
```

## Usage

```bash
happy
```

This will:
1. Start a Claude Code session
2. Display a QR code to connect from your mobile device
3. Allow real-time session sharing between Claude Code and your mobile app

## Commands

- `happy auth` – Manage authentication
- `happy codex` – Start Codex mode
- `happy connect` – Store AI vendor API keys in Happy cloud
- `happy notify` – Send a push notification to your devices
- `happy daemon` – Manage background service
- `happy doctor` – System diagnostics & troubleshooting

## Options

- `-h, --help` - Show help
- `-v, --version` - Show version
- `-m, --model <model>` - Claude model to use (default: sonnet)
- `-p, --permission-mode <mode>` - Permission mode: auto, default, or plan
- `--claude-env KEY=VALUE` - Set environment variable for Claude Code
- `--claude-arg ARG` - Pass additional argument to Claude CLI

## Environment Variables

- `HAPPY_SERVER_URL` - Custom server URL (default: https://api.cluster-fluster.com)
- `HAPPY_WEBAPP_URL` - Custom web app URL (default: https://app.happy.engineering)
- `HAPPY_HOME_DIR` - Custom home directory for Happy data (default: ~/.happy)
- `HAPPY_DISABLE_CAFFEINATE` - Disable macOS sleep prevention (set to `true`, `1`, or `yes`)
- `HAPPY_EXPERIMENTAL` - Enable experimental features (set to `true`, `1`, or `yes`)

## Requirements

- Node.js >= 20.0.0
  - Required by `eventsource-parser@3.0.5`, which is required by
  `@modelcontextprotocol/sdk`, which we used to implement permission forwarding
  to mobile app
- Claude CLI installed & logged in (`claude` command available in PATH)

## Migration from v0.11.x to v0.12.0

**Version 0.12.0 includes breaking changes** due to the migration from `@anthropic-ai/claude-code` to `@anthropic-ai/claude-agent-sdk`.

### Breaking Changes

The system prompt API has been unified:
- **Removed**: `customSystemPrompt` and `appendSystemPrompt`
- **Added**: Single unified `systemPrompt` option

### Migration Guide

If you're using Happy CLI programmatically or extending it, update your code:

**Before (v0.11.x):**
```typescript
{
  customSystemPrompt: "You are a helpful assistant",
  appendSystemPrompt: "Additional instructions"
}
```

**After (v0.12.0):**
```typescript
{
  systemPrompt: "You are a helpful assistant\n\nAdditional instructions"
}
```

**CLI Usage**: No changes required - the CLI interface remains the same.

## License

MIT
