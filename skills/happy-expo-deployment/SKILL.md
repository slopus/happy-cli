---
name: happy-expo-deployment
description: Deploy and manage Happy React Native Expo app in iOS simulator with Metro bundler flow for automated testing
license: MIT
---

# Happy Expo Deployment

Automates the complete React Native Expo deployment workflow for the Happy mobile app, including Metro bundler management, native builds, and simulator deployment.

## Purpose

Enables automated testing of Happy mobile app in iOS simulator by managing the complete Expo development workflow: Metro bundler lifecycle, native iOS builds, app installation, and launch orchestration.

## When to Use

- Deploying Happy app to iOS simulator for testing
- Running automated E2E tests requiring app deployment
- Validating enhancements in production iOS environment
- Setting up continuous testing workflows
- Managing Metro bundler for Fast Refresh development

## Metro Bundler Flow

Expo uses Metro bundler to serve JavaScript:
1. **Metro Server**: Runs on localhost:8081, serves JS bundles
2. **Native App**: iOS app connects to Metro for JavaScript
3. **Fast Refresh**: Code changes reload without native rebuild
4. **Development Workflow**: Build native once → Metro for iterations

## Capabilities

### Metro Management
- Start Metro bundler (non-interactive mode)
- Check Metro status (port 8081 health check)
- Stop Metro server
- Monitor Metro logs

### Native Build
- Detect if native build needed (check installed apps)
- Run full iOS build: `expo run:ios`
- Incremental builds when possible
- Handle build errors and retries

### Simulator Deployment
- Install app to simulator
- Launch app and verify Metro connection
- Wait for app ready state
- Capture deployment logs

### Workflow Orchestration
- Complete deployment: Metro + Build + Install + Launch
- Development mode: Metro + Launch (skip build if installed)
- Testing mode: Clean build + Deploy + Verify

## Usage Examples

### Example 1: Full Deployment (First Time)

```bash
# Complete workflow: Metro + Build + Install + Launch
./scripts/deploy.sh full
```

### Example 2: Development Mode (Fast Iteration)

```bash
# Quick reload: Just Metro + Launch (native already installed)
./scripts/deploy.sh dev
```

### Example 3: Testing Mode (Clean Build)

```bash
# Clean testing: Stop Metro + Clean + Full Build
./scripts/deploy.sh test
```

## Guidelines

- Always check Metro status before assuming it's running
- Use --non-interactive flag for automated workflows
- Skip native rebuild if no native changes (dependencies, native modules)
- Clean build only when necessary (dependency changes, errors)
- Wait for Metro ready before starting tests

## References

See files in the `references/` directory for detailed Expo and Metro documentation.
