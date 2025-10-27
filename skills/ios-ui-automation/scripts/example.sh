#!/bin/bash
# Example script for ios-ui-automation
# This script demonstrates how to structure executable code for your skill

set -e  # Exit on error

# Parse arguments
ACTION=$1
shift  # Remove first arg

case "$ACTION" in
  "example")
    echo "Example action executed"
    ;;
  "help")
    echo "Usage: $0 <action>"
    echo "Actions: example, help"
    ;;
  *)
    echo "Unknown action: $ACTION"
    exit 1
    ;;
esac
