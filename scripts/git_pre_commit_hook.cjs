#!/usr/bin/env node
/**
 * Git pre-commit hook for Happy CLI
 * Runs yarn test before allowing commits
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if we're in a git repository
const cwd = process.cwd();
const gitDir = path.resolve(cwd, '.git');

if (!fs.existsSync(gitDir)) {
  console.error('❌ Not in a git repository');
  process.exit(1);
}

// Check if package.json exists
const packageJsonPath = path.resolve(cwd, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.log('⚠️  No package.json found, skipping tests');
  process.exit(0);
}

// Check if yarn is available
const yarnCheck = spawnSync('yarn', ['--version'], {
  stdio: 'pipe',
  shell: true
});

if (yarnCheck.status !== 0) {
  console.error('❌ Yarn not found');
  console.error('Install from https://yarnpkg.com');
  console.error('Or uninstall hook: happy git-hook uninstall');
  process.exit(1);
}

// Run tests
console.log('🧪 Running tests...');
const result = spawnSync('yarn', ['test'], {
  stdio: 'inherit',
  shell: true,
  cwd
});

if (result.status !== 0) {
  console.error('\n❌ Pre-commit hook failed: Tests must pass before committing\n');
  console.error('Run "yarn test" to see full details');
  console.error('Fix failing tests before committing\n');
  process.exit(1);
}

console.log('✅ All tests passed');
