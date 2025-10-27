#!/usr/bin/env node

/**
 * Test script for list-commands RPC endpoint
 * Tests the command registry API functionality
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Read daemon state to get port
function getDaemonPort() {
  const stateFile = join(homedir(), '.happy', 'daemon.state.json');
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    return state.httpPort;
  } catch (error) {
    console.error('❌ Failed to read daemon state:', error.message);
    console.error('Make sure daemon is running: happy daemon start');
    process.exit(1);
  }
}

// Make RPC call to daemon
async function callRPC(endpoint, body = {}) {
  const port = getDaemonPort();
  const url = `http://127.0.0.1:${port}${endpoint}`;

  console.log(`\n🔌 Calling ${endpoint}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ HTTP ${response.status}:`, data);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return null;
  }
}

// Test cases
async function runTests() {
  console.log('🧪 Testing list-commands RPC endpoint\n');
  console.log('=' .repeat(60));

  // Test 1: Get all commands
  console.log('\n📋 Test 1: Get all commands');
  console.log('-'.repeat(60));
  const allCommands = await callRPC('/list-commands', {});

  if (allCommands && allCommands.commands) {
    console.log(`✅ Success! Found ${allCommands.commands.length} commands:`);
    allCommands.commands.forEach(cmd => {
      console.log(`  • ${cmd.name}: ${cmd.description}`);
      if (cmd.subcommands) {
        console.log(`    Subcommands: ${cmd.subcommands.map(s => s.name).join(', ')}`);
      }
    });
  }

  // Test 2: Get specific command
  console.log('\n📋 Test 2: Get specific command (daemon)');
  console.log('-'.repeat(60));
  const daemonCmd = await callRPC('/list-commands', { commandName: 'daemon' });

  if (daemonCmd && daemonCmd.commands && daemonCmd.commands.length > 0) {
    const cmd = daemonCmd.commands[0];
    console.log(`✅ Success! Found command:`);
    console.log(`  Name: ${cmd.name}`);
    console.log(`  Description: ${cmd.description}`);
    console.log(`  Usage: ${cmd.usage}`);
    if (cmd.examples) {
      console.log(`  Examples:`);
      cmd.examples.forEach(ex => console.log(`    - ${ex}`));
    }
    if (cmd.subcommands) {
      console.log(`  Subcommands (${cmd.subcommands.length}):`);
      cmd.subcommands.forEach(sub => {
        console.log(`    • ${sub.name}: ${sub.description}`);
      });
    }
  }

  // Test 3: Search commands
  console.log('\n📋 Test 3: Search commands (query: "session")');
  console.log('-'.repeat(60));
  const searchResults = await callRPC('/list-commands', { query: 'session' });

  if (searchResults && searchResults.commands) {
    console.log(`✅ Success! Found ${searchResults.commands.length} matching commands:`);
    searchResults.commands.forEach(cmd => {
      console.log(`  • ${cmd.name}: ${cmd.description}`);
    });
  }

  // Test 4: Search for authentication
  console.log('\n📋 Test 4: Search commands (query: "auth")');
  console.log('-'.repeat(60));
  const authResults = await callRPC('/list-commands', { query: 'auth' });

  if (authResults && authResults.commands) {
    console.log(`✅ Success! Found ${authResults.commands.length} matching commands:`);
    authResults.commands.forEach(cmd => {
      console.log(`  • ${cmd.name}: ${cmd.description}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!\n');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
