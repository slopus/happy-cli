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

## Options

- `-h, --help` - Show help
- `-v, --version` - Show version
- `-m, --model <model>` - Claude model to use (default: sonnet)
- `-p, --permission-mode <mode>` - Permission mode: auto, default, or plan
- `--claude-env KEY=VALUE` - Set environment variable for Claude Code
- `--claude-arg ARG` - Pass additional argument to Claude CLI

## Requirements

- Node.js >= 20.0.0
  - Required by `eventsource-parser@3.0.5`, which is required by
  `@modelcontextprotocol/sdk`, which we used to implement permission forwarding
  to mobile app
- Claude CLI installed & logged in (`claude` command available in PATH)

## License

MIT

## SuperClaude Integration

This project is automatically integrated with the SuperClaude framework, which provides enhanced features for Claude Code.

### How it Works

During the installation of `happy-cli` (e.g., via `npm install -g happy-coder`), a `postinstall` script runs automatically. This script attempts to install the SuperClaude framework using `pip` or `pipx`.

The SuperClaude framework integrates with the underlying `claude` command-line tool by modifying the configuration files in the `~/.claude` directory. The `happy-cli` tool is a wrapper around the `claude` command, so it will automatically pick up and use the SuperClaude framework.

**Requirements for SuperClaude:**
- Python and `pip` or `pipx` must be installed on your system for the automatic installation of SuperClaude to succeed.
- The `claude` command-line tool requires its own authentication with the Anthropic API. Please ensure you have logged in with `claude` before using it through `happy-cli`.
