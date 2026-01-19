#!/usr/bin/env node
/**
 * Minimal reproduction script for Claude Code exit code 1 crash
 *
 * This script reproduces a crash that happens when:
 * 1. Claude Code is spawned with --input-format stream-json and --permission-prompt-tool stdio
 * 2. A conversation completes successfully (result message received)
 * 3. ~400ms later, Claude Code exits with code 1 (no error message)
 *
 * To run:
 *   node scripts/reproduce-crash.mjs
 *
 * Expected: Process should wait indefinitely for next stdin message
 * Actual: Process exits with code 1 after ~400ms
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Configuration
const CLAUDE_CODE_PATH = 'claude'; // or full path to claude binary
const TEST_PROMPT = 'Say "hello" and nothing else.';

console.log('=== Claude Code Exit Code 1 Reproduction Script ===\n');

// Test configuration - toggle these to isolate the issue
const USE_MCP = true;  // Happy always uses MCP
const MCP_URL = 'http://127.0.0.1:65222/';  // Use actual Happy MCP port or fake
const USE_RESUME = true;  // Happy uses --resume for session continuity
const SESSION_ID = process.argv[2] || null;  // Pass session ID as argument

// Spawn Claude Code with the same flags Happy uses
const args = [
  '--output-format', 'stream-json',
  '--input-format', 'stream-json',
  '--verbose',
  '--permission-prompt-tool', 'stdio',
];

// Add MCP config (Happy always passes this)
if (USE_MCP) {
  args.push('--mcp-config', JSON.stringify({
    mcpServers: {
      happy: { type: 'http', url: MCP_URL }
    }
  }));
}

// Add resume flag (Happy uses this after first message in a session)
if (USE_RESUME && SESSION_ID) {
  args.push('--resume', SESSION_ID);
  console.log(`Using --resume with session: ${SESSION_ID}\n`);
}

console.log(`Spawning: ${CLAUDE_CODE_PATH} ${args.join(' ')}\n`);

const child = spawn(CLAUDE_CODE_PATH, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, DEBUG: 'true' }
});

// Track timing
let resultReceivedAt = null;
let processExitedAt = null;

// Handle stderr
child.stderr.on('data', (data) => {
  console.log(`[stderr] ${data.toString().trim()}`);
});

// Handle stdout (stream-json output)
const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    console.log(`[stdout] type=${msg.type}${msg.subtype ? ` subtype=${msg.subtype}` : ''}`);

    if (msg.type === 'result') {
      resultReceivedAt = Date.now();
      console.log(`\n>>> Result received at ${new Date(resultReceivedAt).toISOString()}`);
      console.log('>>> Now waiting for stdin... process should stay alive indefinitely');
      console.log('>>> If process exits with code 1 in ~400ms, bug is reproduced\n');
    }
  } catch (e) {
    console.log(`[stdout] (non-JSON) ${line}`);
  }
});

// Handle process exit
child.on('close', (code, signal) => {
  processExitedAt = Date.now();
  const timeSinceResult = resultReceivedAt ? processExitedAt - resultReceivedAt : 'N/A';

  console.log(`\n=== Process Exited ===`);
  console.log(`Exit code: ${code}`);
  console.log(`Signal: ${signal}`);
  console.log(`Time since result: ${timeSinceResult}ms`);

  if (code === 1 && resultReceivedAt && timeSinceResult < 1000) {
    console.log(`\n>>> BUG REPRODUCED! Process exited with code 1 after ${timeSinceResult}ms`);
    console.log('>>> This is the issue being reported.');
  } else if (code === 0) {
    console.log('\n>>> Process exited normally (code 0)');
  } else if (signal) {
    console.log(`\n>>> Process was killed by signal ${signal}`);
  }
});

// Handle spawn error
child.on('error', (err) => {
  console.error(`[error] Failed to spawn: ${err.message}`);
  process.exit(1);
});

// Send initial message after a short delay
setTimeout(() => {
  const userMessage = {
    type: 'user',
    message: {
      role: 'user',
      content: TEST_PROMPT
    }
  };

  console.log(`[stdin] Sending user message: "${TEST_PROMPT}"`);
  child.stdin.write(JSON.stringify(userMessage) + '\n');

  // DO NOT close stdin - we want to test idle behavior
  // child.stdin.end();
}, 1000);

// Keep the script running
console.log('Script will wait indefinitely. Press Ctrl+C to exit.\n');
