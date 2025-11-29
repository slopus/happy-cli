// Intercept setTimeout for the Claude Code SDK
const originalSetTimeout = global.setTimeout;

global.setTimeout = function(callback, delay, ...args) {
    // Just wrap and call the original setTimeout
    return originalSetTimeout(callback, delay, ...args);
};

// Preserve setTimeout properties
Object.defineProperty(global.setTimeout, 'name', { value: 'setTimeout' });
Object.defineProperty(global.setTimeout, 'length', { value: originalSetTimeout.length });

// Load Claude Code CLI with shared import logic
const { loadClaudeCodeCli } = require('./claude_code_paths.cjs');
loadClaudeCodeCli().catch(err => {
  console.error('Unexpected error loading Claude Code CLI:', err);
  process.exit(1);
});