// Intercept setTimeout for the Claude Code SDK
const originalSetTimeout = global.setTimeout;

global.setTimeout = function(callback, delay, ...args) {
    // Just wrap and call the original setTimeout
    return originalSetTimeout(callback, delay, ...args);
};

// Preserve setTimeout properties
Object.defineProperty(global.setTimeout, 'name', { value: 'setTimeout' });
Object.defineProperty(global.setTimeout, 'length', { value: originalSetTimeout.length });

// Get the claude binary path from environment variable
const claudeCliPath = process.env.CLAUDE_CLI_PATH || 'claude';

// Since we're now using the Homebrew-installed binary, spawn it directly
const { spawn } = require('child_process');

// Pass through all arguments and stdio
const args = process.argv.slice(2);
const child = spawn(claudeCliPath, args, {
    stdio: 'inherit',
    env: process.env
});

// Exit with the same code as the child process
child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
    } else {
        process.exit(code || 0);
    }
});

child.on('error', (err) => {
    console.error('Failed to start claude:', err);
    process.exit(1);
});