#!/bin/bash
# Happy Expo Deployment Script
# Manages Metro bundler + native build + simulator deployment

set -e  # Exit on error

HAPPY_PROJECT_DIR="${HAPPY_PROJECT_DIR:-/Users/nick/Documents/happy}"
METRO_PORT=8081
BUNDLE_ID="com.anonymous.happy"
MAX_RETRIES=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Metro is running
check_metro() {
  curl -s http://localhost:$METRO_PORT/status > /dev/null 2>&1
  return $?
}

# Start Metro bundler
start_metro() {
  log_info "Starting Metro bundler..."
  cd "$HAPPY_PROJECT_DIR"
  npx expo start --non-interactive > /tmp/metro.log 2>&1 &
  METRO_PID=$!

  # Wait for Metro to be ready (max 30 seconds)
  for i in {1..30}; do
    if check_metro; then
      log_info "Metro bundler started (PID: $METRO_PID)"
      return 0
    fi
    sleep 1
  done

  log_error "Metro failed to start within 30 seconds"
  return 1
}

# Stop Metro bundler
stop_metro() {
  log_info "Stopping Metro bundler..."
  lsof -ti:$METRO_PORT | xargs kill -9 2>/dev/null || true
  log_info "Metro stopped"
}

# Check if app is installed in simulator
is_app_installed() {
  local device_id=$1
  xcrun simctl listapps "$device_id" | grep -q "$BUNDLE_ID"
  return $?
}

# Build native iOS app
build_native() {
  log_info "Building native iOS app with Expo..."
  cd "$HAPPY_PROJECT_DIR"

  # Run Expo iOS build
  npx expo run:ios --non-interactive

  log_info "Native build complete"
}

# Launch app in simulator
launch_app() {
  local device_id=$1
  log_info "Launching Happy app in simulator..."

  xcrun simctl launch "$device_id" "$BUNDLE_ID"

  # Wait for app to connect to Metro
  sleep 5

  log_info "App launched"
}

# Get booted simulator ID
get_booted_simulator() {
  xcrun simctl list devices | grep "Booted" | grep -oE '\([A-Z0-9-]+\)' | tr -d '()'
}

# Full deployment workflow
deploy_full() {
  log_info "=== FULL DEPLOYMENT ==="

  # Get simulator
  DEVICE_ID=$(get_booted_simulator)
  if [ -z "$DEVICE_ID" ]; then
    log_error "No booted simulator found. Boot a simulator first."
    exit 1
  fi
  log_info "Using simulator: $DEVICE_ID"

  # Start Metro
  if ! check_metro; then
    start_metro || exit 1
  else
    log_info "Metro already running"
  fi

  # Build native (includes install)
  build_native

  # Verify app installed
  if is_app_installed "$DEVICE_ID"; then
    log_info "App successfully installed"
  else
    log_error "App installation failed"
    exit 1
  fi

  log_info "=== DEPLOYMENT COMPLETE ==="
  log_info "Metro bundler: http://localhost:$METRO_PORT"
  log_info "App ready for testing in simulator"
}

# Development mode (Metro + Launch only)
deploy_dev() {
  log_info "=== DEVELOPMENT MODE ==="

  DEVICE_ID=$(get_booted_simulator)
  if [ -z "$DEVICE_ID" ]; then
    log_error "No booted simulator found"
    exit 1
  fi

  # Ensure Metro running
  if ! check_metro; then
    start_metro || exit 1
  else
    log_info "Metro already running"
  fi

  # Launch existing app
  if is_app_installed "$DEVICE_ID"; then
    launch_app "$DEVICE_ID"
  else
    log_warn "App not installed. Running full build..."
    build_native
  fi

  log_info "=== DEVELOPMENT MODE READY ==="
}

# Test mode (Clean + Full Build)
deploy_test() {
  log_info "=== TEST MODE (Clean Build) ==="

  # Stop Metro
  stop_metro
  sleep 2

  # Clean build artifacts
  cd "$HAPPY_PROJECT_DIR"
  rm -rf ios/build
  log_info "Build artifacts cleaned"

  # Full deployment
  deploy_full

  log_info "=== TEST MODE READY ==="
}

# Main
MODE=${1:-full}

case "$MODE" in
  "full")
    deploy_full
    ;;
  "dev")
    deploy_dev
    ;;
  "test")
    deploy_test
    ;;
  "metro-start")
    start_metro
    ;;
  "metro-stop")
    stop_metro
    ;;
  *)
    echo "Usage: $0 {full|dev|test|metro-start|metro-stop}"
    echo ""
    echo "Modes:"
    echo "  full        - Complete deployment (Metro + Build + Install + Launch)"
    echo "  dev         - Development mode (Metro + Launch, skip build if installed)"
    echo "  test        - Testing mode (Clean + Full Build)"
    echo "  metro-start - Start Metro bundler only"
    echo "  metro-stop  - Stop Metro bundler"
    exit 1
    ;;
esac
