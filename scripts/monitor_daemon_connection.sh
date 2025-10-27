#!/bin/bash

# Monitor daemon logs for authentication and connection events
# Usage: ./scripts/monitor_daemon_connection.sh

LOG_DIR="$HOME/.happy-dev/logs"
LATEST_LOG=$(ls -t "$LOG_DIR"/*.log 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
    echo "No daemon log found in $LOG_DIR"
    exit 1
fi

echo "Monitoring daemon log: $LATEST_LOG"
echo "Press Ctrl+C to stop"
echo "---"

# Get initial position
INITIAL_SIZE=$(wc -c < "$LATEST_LOG")

# Monitor for 60 seconds or until Ctrl+C
DURATION=60
ELAPSED=0

while [ $ELAPSED -lt $DURATION ]; do
    CURRENT_SIZE=$(wc -c < "$LATEST_LOG")

    if [ $CURRENT_SIZE -gt $INITIAL_SIZE ]; then
        # New content added, show only the new lines
        tail -c +$((INITIAL_SIZE + 1)) "$LATEST_LOG" | grep -E "(auth|connect|mobile|session|websocket|encryption)" -i --color=always
        INITIAL_SIZE=$CURRENT_SIZE
    fi

    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

echo ""
echo "Monitoring complete"
