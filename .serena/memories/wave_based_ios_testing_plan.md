# Wave-Based iOS Simulator Functional Testing Plan

## Mission
Comprehensive end-user functional testing of Happy mobile app v1.1.0 with Claude Sonnet 4.5 integration

## Ultra-Deep Sequential Analysis Complete
- Total thoughts: 25
- Approach: Hybrid user-agent testing
- Strategy: 6 waves, 12 agents, iterative fix-retry loops
- Evidence: Screenshots + CLI logs + Serena reports

---

## Testing Architecture

### Hybrid User-Agent Approach

**User Role**: Perform actions in iOS simulator
**Agent Role**: Verify state, capture evidence, fix issues if needed

**Iteration Loop Per Agent**:
```
1. Agent prompts user for action
2. User performs action in simulator
3. Agent captures screenshot
4. Agent verifies expected state (reads screenshot with Claude vision)
5. IF PASS → Document success → Next agent
6. IF FAIL → Analyze → Fix code → Rebuild → Retry (max 3 attempts)
```

### Screenshot Evidence System

**Directory**: `~/Documents/happy-testing-screenshots/`

**Naming Convention**:
```
wave{N}_{sequence}_{description}.png
```

**Capture Method**:
```bash
xcrun simctl io booted screenshot ~/Documents/happy-testing-screenshots/wave1_01_app_launch.png
```

**Verification Method**:
- Use Read tool to view PNG (Claude can see images!)
- Verify UI elements, text, state
- Document findings in Serena MCP

---

## 6-Wave Testing Flow

### WAVE 1: Foundation (Build & Launch)

**Objective**: Get app running in iOS simulator without crashes

#### Agent 1A: Build-Complete-Agent
**Mission**: Monitor and verify iOS build completion

**Tasks**:
1. Monitor background build process (ID: 40738b)
2. Wait for completion or timeout (15 min max)
3. Verify .app created in ~/Documents/happy/ios/build/
4. Document build metrics (time, warnings, errors)
5. If build fails: Analyze errors, fix if possible, retry

**Success Criteria**:
- ✅ Build exits with code 0
- ✅ .app bundle created
- ✅ No critical errors

**Retry Strategy**:
- Attempt 1: Current build
- Attempt 2: Clean build (`rm -rf ios/build && npx expo run:ios`)
- Attempt 3: Dependency reinstall + build

**Serena Output**: `wave1_agent_1a_build_complete.md`

---

#### Agent 1B: Simulator-Launch-Agent
**Mission**: Launch app and verify it opens without crashing

**Tasks**:
1. Verify app launched in simulator
2. Wait 10 seconds for app initialization
3. Screenshot: `wave1_01_app_launch.png`
4. Read screenshot to verify: App UI visible, not crashed
5. Screenshot: `wave1_02_home_screen.png` (main screen)

**USER ACTION**: None (automatic launch from build)

**Success Criteria**:
- ✅ App launches
- ✅ Home screen visible
- ✅ No crash dialog

**If Fails**:
- Check crash logs: `xcrun simctl spawn booted log | grep -i crash`
- Fix crash if identifiable
- Rebuild and retry

**Serena Output**: `wave1_agent_1b_launch.md`

---

### WAVE 2: Authentication & Connection

**Objective**: Complete auth flow and connect to local machine

#### Agent 2A: Auth-Flow-Agent
**Mission**: Guide user through authentication and verify success

**Tasks**:
1. Prompt user: "Please complete authentication in simulator (QR scan or manual entry)"
2. Wait for user confirmation
3. Screenshot: `wave2_01_after_auth.png`
4. Read screenshot to verify: Logged in state, no auth screen
5. Check for: User profile visible, sessions list accessible

**USER ACTION REQUIRED**:
```
In iOS Simulator:
1. If not authenticated: Complete auth flow
2. If QR code shown: Scan with phone OR enter credentials manually
3. When you see home screen with sessions, type 'done'
```

**Success Criteria**:
- ✅ Authentication complete
- ✅ Home screen shows authenticated state
- ✅ No auth prompts visible

**If Fails**:
- Check auth code in sources/auth/
- Verify API endpoint configuration
- Check encryption setup

**Serena Output**: `wave2_agent_2a_auth.md`

---

#### Agent 2B: Machine-Connection-Agent
**Mission**: Verify local machine appears and is connected

**Tasks**:
1. Prompt user: "Navigate to machine list (if not already visible)"
2. Screenshot: `wave2_02_machine_list.png`
3. Read screenshot to verify: Local machine appears in list
4. Check daemon status with Bash: `./bin/happy.mjs daemon status`
5. Verify daemon log shows mobile connection

**USER ACTION**:
```
In iOS Simulator:
1. Look for your local machine in the app
2. Verify it shows as "online" or "connected"
3. Type 'done' when ready
```

**Success Criteria**:
- ✅ Local machine visible in app
- ✅ Machine shows connected status
- ✅ Daemon shows mobile client connected

**If Fails**:
- Check daemon running: `daemon status`
- Verify WebSocket connection
- Check server URL configuration

**Serena Output**: `wave2_agent_2b_machine_connect.md`

---

### WAVE 3: Model Selector UI (Core Feature)

**Objective**: Verify model selector shows and cycles through modes including 'sonnet'

#### Agent 3A: Navigation-Agent
**Mission**: Navigate to new session screen and verify model selector visible

**Tasks**:
1. Prompt user: "Tap 'New Session' or '+' button to start new session"
2. Wait for user confirmation
3. Screenshot: `wave3_01_new_session_screen.png`
4. Read screenshot to verify:
   - New session input area visible
   - Model selector (hammer icon) visible
   - Machine selector visible
   - Path selector visible

**USER ACTION**:
```
In iOS Simulator:
1. Tap the "New Session" or "+" button
2. You should see the new session creation screen
3. Look for the hammer icon (model selector)
4. Type 'done' when you see it
```

**Success Criteria**:
- ✅ New session screen visible
- ✅ Model selector (hammer icon) present
- ✅ UI fully rendered

**If Fails**:
- Check navigation code in sources/app/(app)/new/index.tsx
- Verify component rendering
- Check for UI errors in console

**Serena Output**: `wave3_agent_3a_navigation