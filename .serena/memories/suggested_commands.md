# Happy CLI - Suggested Commands

## Development Commands

### Building
```bash
yarn build          # Clean build with type checking
yarn typecheck      # Type check only (no build)
```

### Testing
```bash
yarn test           # Run all tests (builds first, then runs vitest)
```

### Running
```bash
yarn start          # Build and run the CLI
yarn dev            # Run with tsx (no build, faster for development)
yarn dev:local-server         # Dev with local server env
yarn dev:integration-test-env # Dev with integration test env
```

### Release
```bash
yarn release        # Create a new release (runs build + test + release-it)
```

## Happy CLI Commands

### Main Command
```bash
happy               # Start Happy CLI (interactive mode with QR code)
```

### Daemon Commands
```bash
happy daemon start  # Start background daemon
happy daemon stop   # Stop background daemon
happy daemon status # Check daemon status

# With custom server (for local development):
HAPPY_SERVER_URL=http://localhost:3005 happy daemon start
```

### Authentication & Setup
```bash
happy auth          # Manage authentication
happy connect       # Store AI vendor API keys in Happy cloud
```

### Other Commands
```bash
happy codex         # Start Codex mode
happy notify        # Send push notification to devices
happy doctor        # System diagnostics & troubleshooting
```

### CLI Options
```bash
happy -h, --help                        # Show help
happy -v, --version                     # Show version
happy -m, --model <model>               # Claude model (default: sonnet)
happy -p, --permission-mode <mode>      # Permission mode: auto, default, plan
happy --claude-env KEY=VALUE            # Set env var for Claude Code
happy --claude-arg ARG                  # Pass arg to Claude CLI
```

## Environment Variables

```bash
# Server Configuration
HAPPY_SERVER_URL=https://api.cluster-fluster.com    # Custom server URL
HAPPY_WEBAPP_URL=https://app.happy.engineering      # Custom web app URL

# Local Configuration
HAPPY_HOME_DIR=~/.happy                             # Custom home directory

# Feature Flags
HAPPY_DISABLE_CAFFEINATE=true                       # Disable macOS sleep prevention
HAPPY_EXPERIMENTAL=true                             # Enable experimental features
```

## Git Commands (macOS/Darwin)
```bash
git status              # Check repository status
git add .               # Stage all changes
git commit -m "msg"     # Commit with message
git push                # Push to remote
git pull                # Pull from remote
git branch              # List branches
git checkout -b name    # Create new branch
```

## System Commands (macOS/Darwin)
```bash
ls -la                  # List files with details
cd path                 # Change directory
pwd                     # Print working directory
find . -name "*.ts"     # Find TypeScript files
grep -r "pattern" .     # Search for pattern recursively
cat file.txt            # Display file contents
tail -f logfile         # Follow log file in real-time
ps aux | grep happy     # List Happy processes
kill -9 PID             # Force kill process
```

## Package Management
```bash
yarn install            # Install dependencies
yarn add package        # Add dependency
yarn add -D package     # Add dev dependency
yarn remove package     # Remove dependency
yarn upgrade            # Upgrade dependencies
```

## Useful Development Workflows

### Start Development Session
```bash
yarn dev                # Start Happy in dev mode
# In another terminal:
tail -f ~/.happy-dev/logs/$(ls -t ~/.happy-dev/logs/ | head -1)  # Watch logs
```

### Run Tests After Changes
```bash
yarn build && yarn test  # Full test suite
```

### Release New Version
```bash
yarn release             # Interactive release process
```

### Debug with Custom Server
```bash
HAPPY_SERVER_URL=http://localhost:3005 yarn dev
```
