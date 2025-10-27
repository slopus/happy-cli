#!/bin/bash
# iOS Simulator Control Script
# Automation for iOS simulator operations

set -e

ACTION=$1
shift || true

# Get booted simulator UDID
get_booted_device() {
  xcrun simctl list devices | grep "Booted" | grep -oE '\([A-Z0-9-]+\)' | tr -d '()' | head -1
}

# Get device UDID by name
get_device_by_name() {
  local name=$1
  xcrun simctl list devices | grep "$name" | grep -oE '\([A-Z0-9-]+\)' | tr -d '()' | head -1
}

case "$ACTION" in
  "list")
    # List all available simulators
    xcrun simctl list devices
    ;;

  "boot")
    # Boot a simulator by name or UDID
    DEVICE=${1:-"iPhone 15 Pro"}

    # Try to get UDID
    if [[ "$DEVICE" =~ ^[A-Z0-9-]{36}$ ]]; then
      UDID=$DEVICE
    else
      UDID=$(get_device_by_name "$DEVICE")
    fi

    if [ -z "$UDID" ]; then
      echo "Error: Device not found: $DEVICE"
      exit 1
    fi

    echo "Booting $DEVICE ($UDID)..."
    xcrun simctl boot "$UDID" 2>/dev/null || echo "Device already booted or boot in progress"
    sleep 3
    echo "✓ Simulator booted"
    ;;

  "shutdown")
    # Shutdown simulator
    DEVICE=${1:-$(get_booted_device)}
    if [ -z "$DEVICE" ]; then
      echo "No booted simulator to shutdown"
      exit 0
    fi
    echo "Shutting down $DEVICE..."
    xcrun simctl shutdown "$DEVICE"
    echo "✓ Simulator shutdown"
    ;;

  "install")
    # Install app to booted simulator
    APP_PATH=$1
    DEVICE=${2:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No booted simulator found"
      exit 1
    fi

    if [ ! -d "$APP_PATH" ]; then
      echo "Error: App not found: $APP_PATH"
      exit 1
    fi

    echo "Installing $APP_PATH to $DEVICE..."
    xcrun simctl install "$DEVICE" "$APP_PATH"
    echo "✓ App installed"
    ;;

  "launch")
    # Launch app by bundle ID
    BUNDLE_ID=$1
    DEVICE=${2:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No booted simulator found"
      exit 1
    fi

    echo "Launching $BUNDLE_ID..."
    xcrun simctl launch "$DEVICE" "$BUNDLE_ID"
    echo "✓ App launched"
    ;;

  "screenshot")
    # Capture screenshot
    OUTPUT_PATH=$1
    DEVICE=${2:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No booted simulator found"
      exit 1
    fi

    echo "Capturing screenshot to $OUTPUT_PATH..."
    xcrun simctl io "$DEVICE" screenshot "$OUTPUT_PATH"
    echo "✓ Screenshot saved: $OUTPUT_PATH"
    ;;

  "logs")
    # Get app logs
    BUNDLE_ID=${1:-"all"}
    DEVICE=${2:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No booted simulator found"
      exit 1
    fi

    if [ "$BUNDLE_ID" = "all" ]; then
      xcrun simctl spawn "$DEVICE" log stream --level=default
    else
      xcrun simctl spawn "$DEVICE" log stream --predicate "processImagePath CONTAINS '$BUNDLE_ID'" --level=default
    fi
    ;;

  "status")
    # Show booted simulators
    echo "Booted simulators:"
    xcrun simctl list devices | grep "Booted" || echo "No booted simulators"
    ;;

  "reset")
    # Erase simulator data
    DEVICE=${1:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No simulator specified"
      exit 1
    fi

    echo "WARNING: This will erase all data on $DEVICE"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      xcrun simctl shutdown "$DEVICE" 2>/dev/null || true
      xcrun simctl erase "$DEVICE"
      echo "✓ Simulator reset"
    fi
    ;;

  "listapps")
    # List installed apps
    DEVICE=${1:-$(get_booted_device)}

    if [ -z "$DEVICE" ]; then
      echo "Error: No booted simulator found"
      exit 1
    fi

    xcrun simctl listapps "$DEVICE"
    ;;

  *)
    echo "Usage: $0 <action> [args]"
    echo ""
    echo "Actions:"
    echo "  list                     - List all available simulators"
    echo "  boot [device-name]       - Boot simulator (default: iPhone 15 Pro)"
    echo "  shutdown [device-id]     - Shutdown simulator"
    echo "  install <app-path>       - Install app to booted simulator"
    echo "  launch <bundle-id>       - Launch app by bundle ID"
    echo "  screenshot <output-path> - Capture screenshot"
    echo "  logs [bundle-id]         - Stream logs (default: all)"
    echo "  status                   - Show booted simulators"
    echo "  reset [device-id]        - Erase simulator data"
    echo "  listapps                 - List installed apps"
    exit 1
    ;;
esac
