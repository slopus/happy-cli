#!/bin/bash
# Test script for invoke-skill RPC functionality

set -e

echo "=== Testing invoke-skill RPC endpoint ==="
echo ""

# Get daemon port
DAEMON_PORT=$(cat ~/.happy-dev/daemon-state.json 2>/dev/null | grep -o '"httpControlPort":[0-9]*' | cut -d: -f2)

if [ -z "$DAEMON_PORT" ]; then
  echo "Error: Daemon not running or port not found"
  exit 1
fi

echo "Daemon control port: $DAEMON_PORT"
echo ""

# Test 1: List all skills
echo "Test 1: List all skills"
echo "Request: POST http://127.0.0.1:$DAEMON_PORT/skill-list"
curl -s -X POST "http://127.0.0.1:$DAEMON_PORT/skill-list" \
  -H "Content-Type: application/json" | jq '.' || echo "Failed"
echo ""

# Test 2: Get specific skill (algorithmic-art)
echo "Test 2: Get skill metadata (algorithmic-art)"
echo "Request: POST http://127.0.0.1:$DAEMON_PORT/skill-get"
curl -s -X POST "http://127.0.0.1:$DAEMON_PORT/skill-get" \
  -H "Content-Type: application/json" \
  -d '{"skillName": "algorithmic-art"}' | jq '.' || echo "Failed"
echo ""

# Test 3: Invoke skill (get full content)
echo "Test 3: Invoke skill (algorithmic-art)"
echo "Request: POST http://127.0.0.1:$DAEMON_PORT/invoke-skill"
RESPONSE=$(curl -s -X POST "http://127.0.0.1:$DAEMON_PORT/invoke-skill" \
  -H "Content-Type: application/json" \
  -d '{"skillName": "algorithmic-art"}')

echo "$RESPONSE" | jq '.success, .metadata.name, (.skillMd | length), (.templates | keys)' || echo "Failed"
echo ""

# Test 4: Invoke non-existent skill
echo "Test 4: Invoke non-existent skill (should fail)"
echo "Request: POST http://127.0.0.1:$DAEMON_PORT/invoke-skill"
curl -s -X POST "http://127.0.0.1:$DAEMON_PORT/invoke-skill" \
  -H "Content-Type: application/json" \
  -d '{"skillName": "non-existent-skill"}' | jq '.' || echo "Failed"
echo ""

echo "=== Tests complete ==="
