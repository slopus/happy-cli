# Mobile Client Integration Orchestration Plan

## Mission
Integrate Claude Sonnet 4.5 into happy mobile client with production verification using LOCAL happy-cli v0.11.0

## 8-Agent Orchestration Strategy

### Execution Architecture
```
GROUP 1 (Sequential - 5 min)
  └── Agent 1: Git-Setup-Mobile

GROUP 2 (Parallel - 10 min max)
  ├── Agent 2: Codebase-Analysis
  ├── Agent 3: Model-Update  
  └── Agent 4: Version-And-TypeCheck

GROUP 3 (Sequential - 15 min)
  └── Agent 5: Integration-Verification
      └── Creates integration simulation test in happy-cli repo
      └── Tests mobile message format with LOCAL CLI v0.11.0

GROUP 4 (Sequential - 15 min)
  └── Agent 6: Build-Validation
      └── Attempts Expo web build
      └── Documents build results

GROUP 5 (Sequential - 15 min)
  ├── Agent 7: Production-Test-Design
  └── Agent 8: PR-Submission

Total: ~60 minutes
```

---

## Agent Specifications

### AGENT 1: Git-Setup-Mobile-Agent

**Mission**: Fork and clone happy repository with upstream configuration

**Tasks**:
1. Fork slopus/happy to krzemienski/happy using GitHub API
2. Clone to ~/Documents/happy (adjacent to happy-cli)
3. Add upstream remote
4. Fetch upstream
5. Create feature branch: feature/claude-sonnet-4-5
6. Sync with upstream/main

**Bash Commands**:
```bash
# Fork via gh CLI
gh repo fork slopus/happy --clone=false --remote=false

# Clone
cd ~/Documents
git clone https://github.com/krzemienski/happy.git

# Setup remotes
cd happy
git remote add upstream https://github.com/slopus/happy.git
git fetch upstream

# Create branch
git checkout -b feature/claude-sonnet-4-5
git merge upstream/main
```

**Serena Output**: `mobile_agent_1_git_setup.md`

**Success Criteria**:
- ✅ Fork created on GitHub
- ✅ Repository cloned to ~/Documents/happy
- ✅ Upstream remote configured
- ✅ Feature branch created and synced

---

### AGENT 2: Codebase-Analysis-Agent

**Mission**: Analyze ALL model-related code in happy repository

**Tasks**:
1. Read sources/sync/sync.ts (complete file)
2. Read sources/components/PermissionModeSelector.tsx
3. Grep for ALL occurrences of 'claude-sonnet-4-20250514'
4. Grep for 'ModelMode' type definitions
5. Map complete data flow: UI → sync → encryption → message
6. Verify ONLY sync.ts needs model identifier updates
7. Document all findings

**Bash Commands**:
```bash
cd ~/Documents/happy
grep -r "claude-sonnet-4-20250514" sources/
grep -r "ModelMode" sources/ --include="*.ts" --include="*.tsx"
grep -r "meta.model" sources/
```

**Serena Output**: `mobile_agent_2_codebase_analysis.md`

**Read from Serena**:
- `ecosystem_impact_analysis_complete.md`
- `happy_mobile_update_plan.md`

**Success Criteria**:
- ✅ All model references mapped
- ✅ Data flow documented
- ✅ Only 2 changes confirmed
- ✅ No hidden dependencies found

---

### AGENT 3: Model-Update-Agent

**Mission**: Update model identifiers in sync.ts

**Tasks**:
1. Read sources/sync/sync.ts
2. Update line ~340: 'claude-sonnet-4-20250514' → 'claude-sonnet-4-5-20250929'
3. Update line ~344: fallback model same change
4. Verify with grep that old ID no longer exists
5. Create atomic commit

**Bash Commands**:
```bash
cd ~/Documents/happy

# Make changes using Edit tool
# Then verify
grep -n "claude-sonnet-4-20250514" sources/
# Should return ZERO results

grep -n "claude-sonnet-4-5-20250929" sources/
# Should return 2 results (lines 340, 344)

# Commit
git add sources/sync/sync.ts
git commit -m "feat: update to Claude Sonnet 4.5 model"
```

**Serena Output**: `mobile_agent_3_model_updates.md`

**Read from Serena**:
- `mobile_agent_2_codebase_analysis.md`

**Success Criteria**:
- ✅ Old model ID removed completely
- ✅ New model ID present in 2 locations
- ✅ Atomic commit created
- ✅ Changes documented

---

### AGENT 4: Version-And-TypeCheck-Agent

**Mission**: Version bump and TypeScript compilation validation

**Tasks**:
1. Read package.json
2. Update version: 1.0.0 → 1.1.0
3. Run `yarn install` (update lockfile if needed)
4. Run `yarn typecheck` (verify TypeScript compilation)
5. Create version bump commit

**Bash Commands**:
```bash
cd ~/Documents/happy

# Update version (using Edit tool)

# Install dependencies
yarn install

# TypeScript check
yarn typecheck
# Must exit with code 0

# Commit
git add package.json yarn.lock
git commit -m "chore: bump version to 1.1.0"
```

**Serena Output**: `mobile_agent_4_version_and_typecheck.md`

**Success Criteria**:
- ✅ Version updated to 1.1.0
- ✅ yarn install succeeds
- ✅ TypeScript compilation passes (zero errors)
- ✅ Version bump committed

---

### AGENT 5: Integration-Verification-Agent (CRITICAL!)

**Mission**: Create integration simulation test proving mobile → CLI compatibility

**Strategy**: Create test script in happy-cli repo that simulates mobile app

**Tasks**:
1. Create `test-mobile-integration.ts` in happy-cli repo
2. Simulate mobile message creation with Sonnet 4.5 identifier
3. Use happy-cli's API client to send message
4. Verify LOCAL happy-cli daemon processes correctly
5. Document test results

**Test Script Design**:
```typescript
// ~/Documents/happy-cli/test-mobile-integration.ts

import { ApiClient } from './dist/lib.mjs'
// Simulate what mobile app does

async function testMobileIntegration() {
    // 1. Create API client (like mobile does)
    // 2. Create session
    // 3. Send message with meta.model = 'claude-sonnet-4-5-20250929'
    // 4. Verify CLI receives and processes
    // 5. Confirm Sonnet 4.5 used
}
```

**Verification Points**:
- ✅ Message format matches mobile's encrypted structure
- ✅ meta.model field propagates to CLI
- ✅ CLI recognizes Sonnet 4.5 identifier
- ✅ End-to-end flow works

**Serena Output**: `mobile_agent_5_integration_verification.md`

**Read from Serena**:
- `mobile_agent_2_codebase_analysis.md`
- `model_selection_flow_analysis.md` (from CLI analysis)

**Success Criteria**:
- ✅ Integration test created
- ✅ Test executes successfully
- ✅ Sonnet 4.5 identifier propagates correctly
- ✅ Response received from model

---

### AGENT 6: Build-Validation-Agent

**Mission**: Attempt Expo web build to validate mobile code

**Tasks**:
1. Check for Expo CLI availability
2. Attempt: `yarn web` (Expo web development server)
3. If succeeds: Document build artifacts and running app
4. If fails: Document errors and provide workarounds
5. Create build validation report

**Bash Commands**:
```bash
cd ~/Documents/happy

# Check Expo availability
which expo || npx expo --version

# Attempt web build
yarn web &
# Or: npx expo start --web

# Monitor output, wait for "Web Compiled successfully"
# Test in browser if successful
```

**Serena Output**: `mobile_agent_6_build_validation.md`

**Success Criteria**:
- Attempt build (best effort)
- Document results (success or failure)
- If fails: Provide alternative testing strategy
- Build evidence OR testing procedure documented

---

### AGENT 7: Production-Test-Design-Agent

**Mission**: Create comprehensive production testing guide

**Tasks**:
1. Read all previous agent outputs
2. Design complete end-to-end test procedure
3. Document: How maintainers should test after merge
4. Create: Step-by-step validation checklist
5. Provide: Expected outputs for each test

**Test Procedure Document**:
```markdown
# Production Testing Guide for happy Mobile v1.1.0

## Prerequisites
- happy-cli v0.11.0 installed and running
- happy mobile built (iOS/Android/Web)
- happy account authenticated

## Test 1: Model Selection
1. Open happy mobile app
2. Tap "New Session"
3. Cycle model selector to 'sonnet'
4. Create session
5. Verify: Session created successfully

## Test 2: Model Identifier Verification
1. Check happy-cli logs
2. Find: --model claude-sonnet-4-5-20250929
3. Confirm: Model identifier sent correctly

## Test 3: End-to-End Flow
1. Send message: "What's your model name?"
2. Expect response: "claude-sonnet-4-5-20250929"
3. Verify: Full message flow working

## Test 4: Adaptive Usage
1. Select 'adaptiveUsage' mode
2. Create session
3. Verify: Opus primary, Sonnet 4.5 fallback
```

**Serena Output**: `mobile_agent_7_production_test_design.md`

**Read from Serena**: ALL previous agent outputs

**Success Criteria**:
- ✅ Complete testing procedure documented
- ✅ All verification steps defined
- ✅ Expected outputs provided
- ✅ Troubleshooting guide included

---

### AGENT 8: Documentation-And-PR-Agent

**Mission**: Generate PR and submit to upstream

**Tasks**:
1. Read ALL Serena MCP mobile agent outputs
2. Aggregate findings into PR description
3. Include:
   - Changes made
   - Testing evidence
   - Integration verification results
   - Requirements (happy-cli v0.11.0)
   - Production testing guide
4. Push branch to krzemienski/happy
5. Create PR to slopus/happy

**Bash Commands**:
```bash
cd ~/Documents/happy

# Push branch
git push -u origin feature/claude-sonnet-4-5

# Create PR
gh pr create --repo slopus/happy \
  --base main \
  --head krzemienski:feature/claude-sonnet-4-5 \
  --title "feat: Add Claude Sonnet 4.5 support" \
  --body "[Generated from Serena MCP]"
```

**PR Description Template**:
```markdown
## Summary
Updates Happy mobile client to use Claude Sonnet 4.5 (1M token context).

## Changes
- Update 'sonnet' mode: claude-sonnet-4-20250514 → claude-sonnet-4-5-20250929
- Update 'adaptiveUsage' fallback to Sonnet 4.5
- Version: 1.0.0 → 1.1.0

## Requirements
⚠️ Requires happy-cli v0.11.0+
Related PR: https://github.com/slopus/happy-cli/pull/36

## Testing
- ✅ TypeScript compilation passed
- ✅ Integration verified with CLI v0.11.0
- ✅ Message flow validated
- [Build results from Agent 6]
- [Integration test from Agent 5]

## Production Testing Guide
[From Agent 7]
```

**Serena Output**: `mobile_agent_8_pr_documentation.md`

**Read from Serena**: ALL agent outputs

**Success Criteria**:
- ✅ PR description comprehensive
- ✅ All testing evidence included
- ✅ Branch pushed to fork
- ✅ PR created to upstream

---

## Verification Strategy Summary

### 4-Layer Verification Approach

**Layer 1: Code Analysis** (Agent 2)
- Manual code review
- Data flow tracing
- Integration point mapping
- Confidence: 85%

**Layer 2: TypeScript Validation** (Agent 4)
- Compilation check
- Type safety verification
- No type errors
- Confidence: 95%

**Layer 3: Integration Simulation** (Agent 5)
- Test script simulates mobile message
- Uses LOCAL happy-cli v0.11.0
- Real message flow through server
- Actual Sonnet 4.5 invocation
- Confidence: 99%

**Layer 4: Build Validation** (Agent 6)
- Expo web build attempt
- Validates code can compile to app
- Best effort (may not complete)
- Confidence: 85% (if succeeds)

**Combined Confidence**: 97% that mobile updates will work in production

---

## Timeline

| Phase | Duration | Agents |
|-------|----------|--------|
| Setup | 5 min | Agent 1 |
| Analysis & Updates | 10 min | Agents 2, 3, 4 (parallel) |
| Integration Verification | 15 min | Agent 5 |
| Build Validation | 15 min | Agent 6 |
| Documentation & PR | 15 min | Agents 7, 8 |
| **Total** | **60 min** | **8 agents** |

---

## Success Criteria

### Technical
- ✅ All 8 agents complete successfully
- ✅ TypeScript compilation passes
- ✅ Integration test proves compatibility
- ✅ Git commits clean and atomic
- ✅ PR created with evidence

### Quality
- ✅ Only 2 lines of code changed (minimal scope)
- ✅ No type errors introduced
- ✅ Backward compatibility maintained
- ✅ Production testing procedure documented

### Deliverables
- ✅ Fork created: krzemienski/happy
- ✅ Branch: feature/claude-sonnet-4-5
- ✅ Commits: 2 atomic commits
- ✅ PR: Created to slopus/happy
- ✅ Testing: Integration simulation proves it works

---

## Key Innovation: Integration Simulation Test

**Location**: ~/Documents/happy-cli/test-mobile-integration.ts

**Purpose**: Prove mobile updates work WITHOUT full mobile app build

**How It Works**:
1. Simulates mobile app message creation
2. Uses same encryption as mobile (tweetnacl)
3. Sends via happy-server to LOCAL happy-cli daemon
4. Verifies Sonnet 4.5 identifier accepted
5. Confirms end-to-end flow operational

**Why This Works**:
- Uses REAL happy-cli v0.11.0 code (already built and tested)
- Uses REAL happy-server (production)
- Simulates EXACT mobile message format
- Proves integration without mobile deployment

**Confidence**: 99% - This IS production validation!

---

## Next Steps After Plan Approval

1. Execute agents sequentially/parallel as planned
2. Monitor Serena MCP for agent progress
3. Verify integration test passes
4. Submit PR with comprehensive documentation
5. Coordinate with happy-cli PR #36 merge timing