# Happy Mobile Update Plan - Claude Sonnet 4.5

## Implementation Guide

### Files to Modify: 1

**File**: `sources/sync/sync.ts`

### Change 1: Update 'sonnet' Mode (Line 340)
```typescript
// BEFORE:
case 'sonnet':
    model = 'claude-sonnet-4-20250514';
    fallbackModel = null;
    break;

// AFTER:
case 'sonnet':
    model = 'claude-sonnet-4-5-20250929';
    fallbackModel = null;
    break;
```

### Change 2: Update 'adaptiveUsage' Fallback (Line 344)
```typescript
// BEFORE:
case 'adaptiveUsage':
    model = 'claude-opus-4-1-20250805';
    fallbackModel = 'claude-sonnet-4-20250514';
    break;

// AFTER:
case 'adaptiveUsage':
    model = 'claude-opus-4-1-20250805';
    fallbackModel = 'claude-sonnet-4-5-20250929';
    break;
```

### Change 3: Version Bump
**File**: `package.json`
```json
{
  "version": "1.1.0"  // Changed from 1.0.0
}
```

---

## Git Workflow

### Branch Creation
```bash
git checkout -b feature/claude-sonnet-4-5
```

### Commits
```bash
# Commit 1
git add sources/sync/sync.ts
git commit -m "feat: update to Claude Sonnet 4.5 model

- Update 'sonnet' mode to use claude-sonnet-4-5-20250929
- Update 'adaptiveUsage' fallback to Sonnet 4.5
- Enables 1M token context window for users

Requires: happy-cli v0.11.0 or later"

# Commit 2
git add package.json
git commit -m "chore: bump version to 1.1.0"
```

### PR Creation
```bash
gh pr create --repo slopus/happy \
  --title "feat: Add Claude Sonnet 4.5 support" \
  --body "[PR description from template]"
```

---

## Testing Checklist

### Development Testing
- [ ] Build mobile app with changes
- [ ] Test model selection UI cycles through modes
- [ ] Verify 'sonnet' sends claude-sonnet-4-5-20250929
- [ ] Verify 'adaptiveUsage' fallback correct
- [ ] Test session creation with Sonnet 4.5
- [ ] Confirm messages flow correctly

### Integration Testing
- [ ] Test with happy-cli v0.11.0
- [ ] Verify encrypted message format unchanged
- [ ] Test WebSocket message relay through server
- [ ] Confirm Sonnet 4.5 API responses

### Platform Testing
- [ ] iOS device testing
- [ ] Android device testing
- [ ] Web browser testing
- [ ] Test on macOS (Catalyst)

### Backward Compatibility
- [ ] New mobile + old CLI (graceful degradation)
- [ ] Old mobile + new CLI (still works with old models)
- [ ] Mixed version scenarios documented

---

## Deployment Steps

### Pre-Deployment
1. ✅ Ensure happy-cli v0.11.0 published to npm
2. Create PR to slopus/happy
3. Request review from maintainers
4. Address feedback if any
5. Merge PR

### iOS Deployment
1. Update version in app.config.js
2. Build iOS app: `eas build --platform ios`
3. Submit to App Store: `eas submit --platform ios`
4. Wait for review (1-3 days typically)
5. Release to users

### Android Deployment
1. Build Android app: `eas build --platform android`
2. Submit to Play Store: `eas submit --platform android`
3. Wait for review (hours typically)
4. Release to users

### Web Deployment
1. Build web version
2. Deploy to hosting (instant)
3. Users get update immediately

---

## User Communication

### App Store Release Notes
```
🎉 Claude Sonnet 4.5 Now Available!

What's New in v1.1.0:
• Updated to Claude Sonnet 4.5 - the latest and most capable Sonnet model
• 5x larger context window (up to 1 million tokens)
• Enhanced coding and reasoning capabilities

⚠️ Important:
This update requires happy-cli v0.11.0 or later on your computer.

Update your CLI first:
npm install -g happy-coder@latest

Then update this app to access Claude Sonnet 4.5.

See full documentation: https://happy.engineering/docs/
```

### In-App Notification
Consider showing one-time notification after update:
- "Claude Sonnet 4.5 available! Update your CLI to v0.11.0 first."
- Link to update instructions
- Dismiss option

---

## Rollback Plan

### If Issues Arise

**Revert Changes**:
```bash
# Revert the commits
git revert <commit-hash>

# Or reset to previous version
git reset --hard <previous-commit>

# Redeploy previous version
```

**Emergency Rollback**:
- Revert to model identifiers: claude-sonnet-4-20250514
- Version: 1.0.0
- No server changes needed (still works)

---

## Success Criteria

### Technical
- ✅ App builds successfully
- ✅ Model selection sends correct identifier
- ✅ Sessions create without errors
- ✅ Messages encrypt/decrypt properly
- ✅ Claude Sonnet 4.5 responds correctly

### User Experience
- ✅ UI functions normally
- ✅ No regression in existing features
- ✅ Clear communication about CLI requirement
- ✅ Smooth update process

### Business
- ✅ App Store approval received
- ✅ No increase in error rates
- ✅ User adoption >80% within 2 weeks
- ✅ Positive user feedback

---

## Dependencies

### Blocking Dependencies
1. ✅ happy-cli PR #36 must be merged
2. ✅ happy-cli v0.11.0 must be published to npm
3. Users must update CLI before mobile app is useful

### Optional Dependencies
- Documentation updates (can be async)
- User communication (should precede release)

---

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| happy-cli merge | 1-5 days | Pending review |
| happy-cli npm publish | <1 hour | After merge |
| happy mobile PR | 1-2 hours | After CLI published |
| happy mobile review | 1-2 days | After PR |
| App Store submission | <1 hour | After merge |
| App Store review (iOS) | 1-3 days | After submission |
| Play Store review (Android) | Hours | After submission |
| **Total** | **~1-2 weeks** | End-to-end |

---

## Contact Points

**Repository Owners** (for PR review):
- @slopus organization
- @ex3ndr (Steve Korshakov)
- @bra1nDump (Kirill Dubovitskiy)

**Testing Coordinators**:
- Internal testing team
- Beta testers (TestFlight/Internal Track)

---

## Appendix: Alternative Approaches Considered

### Approach 1: Client-Side Model Version Detection
- Auto-detect happy-cli version
- Show/hide Sonnet 4.5 based on CLI capability
- Rejected: Adds complexity, not worth benefit

### Approach 2: Server-Side Model Validation
- Server validates model identifiers
- Reject unknown models
- Rejected: Breaks zero-knowledge architecture

### Approach 3: Both Sonnet 4.0 and 4.5 Available
- Add 'sonnet45' mode alongside 'sonnet'
- Users choose version
- Rejected: User confusion, maintenance burden

**Selected**: Simple update of 'sonnet' to point to latest version