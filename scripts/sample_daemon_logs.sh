#!/bin/bash

# Sample daemon logs for authentication events
# Runs 10 times with 3-second intervals

LOG_DIR="$HOME/.happy-dev/logs"
LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
    echo "No daemon log found"
    exit 1
fi

echo "Sampling log: $LATEST_LOG"
echo "================================"

for i in {1..10}; do
    echo ""
    echo "--- Sample $i at $(date +%H:%M:%S) ---"
    tail -50 "$LATEST_LOG" | grep -iE "(auth|connect|mobile|session|websocket|encryption|error)" || echo "No relevant entries"
    sleep 3
done

echo ""
echo "Sampling complete"
