---
name: ios-simulator-control
description: Control iOS simulators - boot devices, install apps, capture screenshots, retrieve logs for automated testing
license: MIT
---

# iOS Simulator Control

Comprehensive iOS simulator automation for testing Happy mobile app. Provides complete lifecycle management of iOS simulators using xcrun simctl commands.

## Purpose

Automate iOS simulator operations for testing workflows: device management, app installation/launch, screenshot capture, and log retrieval.

## When to Use

- Booting iOS simulators for testing
- Installing Happy app to simulator
- Launching apps and monitoring status
- Capturing screenshot evidence
- Retrieving simulator logs for debugging
- Automating iOS testing workflows

## Capabilities

- List all available iOS simulator devices
- Boot and shutdown simulators
- Install .app bundles to simulator
- Launch apps by bundle ID
- Capture full-page screenshots
- Retrieve app and system logs
- Check simulator and app status
- Reset simulator to clean state

## Usage Examples

### Example 1: List Available Simulators

```bash
./scripts/simulator.sh list
```

### Example 2: Boot Simulator

```bash
./scripts/simulator.sh boot "iPhone 15 Pro"
```

### Example 3: Install and Launch App

```bash
./scripts/simulator.sh install path/to/Happy.app
./scripts/simulator.sh launch com.anonymous.happy
```

### Example 4: Capture Screenshot

```bash
./scripts/simulator.sh screenshot /path/to/output.png
```

### Example 5: Get Logs

```bash
./scripts/simulator.sh logs com.anonymous.happy
```

## Guidelines

- Boot simulator before installing/launching apps
- Check status to verify simulator state
- Handle errors from xcrun simctl
- Clean state between test runs if needed
- Wait for UI to render before screenshots

## Script Reference

See `scripts/simulator.sh` for complete implementation with all commands.

## References

See `references/` for xcrun simctl documentation.
