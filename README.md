# Happy

Code on the go controlling AI coding assistants from your mobile device.

Free. Open source. Code anywhere.

## Supported AI Assistants

- **Claude Code** (Anthropic) - `happy` or `happy claude`
- **Codex** (OpenAI) - `happy codex`
- **Gemini CLI** (Google) - `happy gemini` ✨ NEW

## Installation

```bash
npm install -g happy-coder
```

## Usage

### Claude Code (Default)
```bash
happy
```

### OpenAI Codex
```bash
happy codex
```

### Google Gemini CLI
```bash
happy gemini
```

This will:
1. Start an AI coding session
2. Display a QR code to connect from your mobile device
3. Allow real-time session sharing between the AI and your mobile app

## Commands

- `happy auth` – Manage authentication
- `happy codex` – Start Codex mode (OpenAI)
- `happy gemini` – Start Gemini mode (Google)
- `happy connect` – Store AI vendor API keys in Happy cloud
- `happy notify` – Send a push notification to your devices
- `happy daemon` – Manage background service
- `happy doctor` – System diagnostics & troubleshooting

## Options

- `-h, --help` - Show help
- `-v, --version` - Show version
- `-m, --model <model>` - Model to use (e.g., sonnet, gemini-2.5-pro)
- `-p, --permission-mode <mode>` - Permission mode: auto, default, or plan
- `--claude-env KEY=VALUE` - Set environment variable for Claude Code (e.g., for [claude-code-router](https://github.com/musistudio/claude-code-router))
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
- For Claude: Claude CLI installed & logged in (`claude` command available in PATH)
- For Codex: OpenAI Codex CLI installed
- For Gemini: Gemini CLI installed (`npm install -g @google/gemini-cli`) & authenticated with Google account

## License

MIT
