# Happy CLI - Task Completion Checklist

## When a Task is Completed

### 1. Code Quality Checks

#### Type Checking
```bash
yarn typecheck
```
✅ Must pass with 0 errors

#### Build Verification
```bash
yarn build
```
✅ Must complete successfully

### 2. Testing

#### Run Test Suite
```bash
yarn test
```
✅ All tests must pass (100%)

**Note:** Tests make real API calls (no mocking), so ensure:
- ANTHROPIC_API_KEY is set in environment
- Network connectivity is available
- Server endpoints are accessible

### 3. Code Style Review

Self-review against style guidelines:
- [ ] All code is strictly typed (no `any` types)
- [ ] All imports are at the top of files
- [ ] Using `@/` alias for src imports
- [ ] JSDoc comments on public functions
- [ ] No excessive if statements or deep nesting
- [ ] Meaningful function names (not tiny getters/setters)
- [ ] Error handling with try-catch blocks
- [ ] File-based logging (no console.log during Claude sessions)

### 4. Documentation Updates

If applicable, update:
- [ ] **CLAUDE.md** - If architecture or patterns changed
- [ ] **README.md** - If user-facing behavior changed
- [ ] **JSDoc comments** - For new/modified functions
- [ ] **Type definitions** - If new types were added

### 5. Integration Testing

For features involving:

#### Local Mode
- [ ] Test spawning Claude in local mode
- [ ] Verify QR code display works
- [ ] Test session resumption

#### Remote Mode
- [ ] Test SDK spawning works
- [ ] Verify mobile app can connect
- [ ] Test permission handling flow

#### Daemon Mode
- [ ] Test `happy daemon start`
- [ ] Test `happy daemon stop`
- [ ] Test `happy daemon status`
- [ ] Verify logs are written correctly

### 6. Manual Smoke Test

Run happy CLI and verify:
```bash
yarn start
```
- [ ] CLI starts without errors
- [ ] QR code displays correctly
- [ ] Can connect from mobile app (if available)
- [ ] Logs are written to correct location
- [ ] Claude Code session works

### 7. Git Workflow

Only commit when explicitly requested by user:
```bash
git add .
git status                  # Review changes
git commit -m "$(cat <<'EOF'
<concise commit message>

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Important:** 
- NEVER commit unless explicitly requested
- NEVER skip hooks (--no-verify)
- NEVER force push to main/master
- Check authorship before amending commits

### 8. Security Checks

- [ ] No secrets committed (.env files excluded)
- [ ] API keys properly handled via environment
- [ ] Encryption keys stored securely
- [ ] No sensitive data in logs

### 9. Performance Verification

For SDK or performance-critical changes:
- [ ] No significant memory leaks
- [ ] Response latency acceptable
- [ ] No blocking operations on main thread

### 10. Breaking Changes

If breaking changes were made:
- [ ] Update version in package.json (bump major/minor)
- [ ] Update CHANGELOG.md
- [ ] Document migration path in README.md
- [ ] Add deprecation warnings if applicable

## Before Creating a PR

- [ ] All checklist items above completed
- [ ] Branch is up to date with main
- [ ] Descriptive PR title and description
- [ ] Reference related issues
- [ ] Screenshots/videos if UI changed

## Quick Reference: Common Issues

### Build fails with type errors
→ Run `yarn typecheck` to see all errors
→ Fix type annotations

### Tests fail
→ Check environment variables are set
→ Verify API keys are valid
→ Check network connectivity

### Runtime errors in daemon
→ Check logs in `~/.happy-dev/logs/`
→ Verify Claude CLI is installed and in PATH
→ Check Node.js version >= 20

### Cannot connect from mobile
→ Verify server URL is correct
→ Check encryption keys match
→ Check network firewall settings
