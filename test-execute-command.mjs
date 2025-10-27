#!/usr/bin/env node
/**
 * Test script for execute-command endpoint
 * Tests basic functionality and security measures
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Read daemon state to get port
function getDaemonPort() {
  try {
    const statePath = join(homedir(), '.happy-dev', 'daemon.state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    return state.httpPort;
  } catch (error) {
    console.error('❌ Failed to read daemon state:', error.message);
    console.log('\nMake sure the daemon is running: happy daemon start');
    process.exit(1);
  }
}

// Execute a command via the control server
async function executeCommand(command, args = [], options = {}) {
  const port = getDaemonPort();
  const url = `http://127.0.0.1:${port}/execute-command`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        args,
        ...options
      })
    });

    const result = await response.json();
    return { status: response.status, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Testing execute-command endpoint\n');

  // Test 1: Basic command (pwd)
  console.log('Test 1: Basic command (pwd)');
  const test1 = await executeCommand('pwd');
  if (test1.success) {
    console.log('✅ Success');
    console.log(`   Output: ${test1.stdout.trim()}\n`);
  } else {
    console.log('❌ Failed:', test1.error, '\n');
  }

  // Test 2: Command with arguments (ls -la)
  console.log('Test 2: Command with arguments (ls -la)');
  const test2 = await executeCommand('ls', ['-la']);
  if (test2.success) {
    console.log('✅ Success');
    console.log(`   Output lines: ${test2.stdout.split('\n').length}\n`);
  } else {
    console.log('❌ Failed:', test2.error, '\n');
  }

  // Test 3: Command with cwd
  console.log('Test 3: Command with working directory (/tmp)');
  const test3 = await executeCommand('pwd', [], { cwd: '/tmp' });
  if (test3.success) {
    console.log('✅ Success');
    console.log(`   Output: ${test3.stdout.trim()}\n`);
  } else {
    console.log('❌ Failed:', test3.error, '\n');
  }

  // Test 4: Short timeout
  console.log('Test 4: Timeout behavior (sleep 5s with 2s timeout)');
  const test4 = await executeCommand('sleep', ['5'], { timeoutMs: 2000 });
  if (test4.success && test4.timedOut) {
    console.log('✅ Success - Command timed out as expected\n');
  } else if (!test4.success) {
    console.log('⚠️  Sleep command not available or failed:', test4.error, '\n');
  } else {
    console.log('❌ Failed - Command did not timeout\n');
  }

  // Test 5: Security - disallowed command
  console.log('Test 5: Security - disallowed command (rm)');
  const test5 = await executeCommand('rm', ['-rf', '/']);
  if (!test5.success && test5.status === 400) {
    console.log('✅ Success - Command correctly rejected');
    console.log(`   Error: ${test5.error}\n`);
  } else {
    console.log('❌ Failed - Command should have been rejected\n');
  }

  // Test 6: Security - shell injection attempt
  console.log('Test 6: Security - shell injection prevention');
  const test6 = await executeCommand('ls', [';rm -rf /']);
  if (!test6.success && test6.status === 400) {
    console.log('✅ Success - Dangerous arguments correctly rejected');
    console.log(`   Error: ${test6.error}\n`);
  } else {
    console.log('❌ Failed - Dangerous arguments should have been rejected\n');
  }

  // Test 7: Valid git command
  console.log('Test 7: Git command (git --version)');
  const test7 = await executeCommand('git', ['--version']);
  if (test7.success) {
    console.log('✅ Success');
    console.log(`   Output: ${test7.stdout.trim()}\n`);
  } else {
    console.log('❌ Failed:', test7.error, '\n');
  }

  console.log('✨ Testing complete!\n');

  // Summary
  const results = [test1, test2, test3, test5, test6, test7];
  const passed = results.filter(r => r.success || (!r.success && r.status === 400)).length;
  console.log(`📊 Results: ${passed}/${results.length} tests passed`);
}

runTests().catch(console.error);
