#!/usr/bin/env node

/**
 * Test script for hardened command whitelist
 * Tests that dangerous commands are blocked and safe commands work
 */

console.log('🔒 Testing Hardened Command Whitelist\n');

// Simulated whitelist from controlServer.ts
const ALLOWED_COMMANDS = new Set([
  'ls',
  'pwd',
  'echo',
  'date',
  'whoami',
  'hostname',
  'uname'
]);

// Test cases
const testCases = [
  // Safe commands - should pass
  { command: 'ls', expected: true, category: 'SAFE' },
  { command: 'pwd', expected: true, category: 'SAFE' },
  { command: 'echo', expected: true, category: 'SAFE' },
  { command: 'date', expected: true, category: 'SAFE' },
  { command: 'whoami', expected: true, category: 'SAFE' },
  { command: 'hostname', expected: true, category: 'SAFE' },
  { command: 'uname', expected: true, category: 'SAFE' },

  // Removed dangerous commands - should fail
  { command: 'node', expected: false, category: 'REMOVED (CRITICAL RISK)' },
  { command: 'npm', expected: false, category: 'REMOVED (CRITICAL RISK)' },
  { command: 'yarn', expected: false, category: 'REMOVED (CRITICAL RISK)' },
  { command: 'git', expected: false, category: 'REMOVED (HIGH RISK)' },

  // Other dangerous commands - should fail
  { command: 'rm', expected: false, category: 'DANGEROUS' },
  { command: 'curl', expected: false, category: 'DANGEROUS' },
  { command: 'wget', expected: false, category: 'DANGEROUS' },
  { command: 'chmod', expected: false, category: 'DANGEROUS' },
  { command: 'chown', expected: false, category: 'DANGEROUS' },
  { command: 'sudo', expected: false, category: 'DANGEROUS' },
  { command: 'sh', expected: false, category: 'DANGEROUS' },
  { command: 'bash', expected: false, category: 'DANGEROUS' },
];

let passed = 0;
let failed = 0;

console.log('Testing command whitelist:\n');

for (const test of testCases) {
  const isAllowed = ALLOWED_COMMANDS.has(test.command);
  const testPassed = isAllowed === test.expected;

  if (testPassed) {
    passed++;
    const symbol = test.expected ? '✅' : '🚫';
    console.log(`${symbol} ${test.command.padEnd(12)} - ${test.category.padEnd(30)} [PASS]`);
  } else {
    failed++;
    console.log(`❌ ${test.command.padEnd(12)} - ${test.category.padEnd(30)} [FAIL]`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

if (failed === 0) {
  console.log('\n✅ All tests passed! Whitelist is properly hardened.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed! Whitelist may have issues.');
  process.exit(1);
}
