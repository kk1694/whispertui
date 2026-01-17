#!/bin/bash
# WhisperTUI Hyprland Startup Script
#
# Add to your hyprland.conf:
#   exec-once = ~/.local/share/whispertui/hyprland-startup.sh
# Or if installed globally:
#   exec-once = whispertui daemon &
#
# This script starts the WhisperTUI daemon in the background.

# Get script directory for logging
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/whispertui"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Log file for startup debugging
LOG_FILE="$LOG_DIR/startup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "Starting WhisperTUI daemon..."

# Check if daemon is already running
if command -v whispertui &> /dev/null; then
    # Try to get status - if it works, daemon is already running
    if whispertui status &> /dev/null; then
        log "Daemon already running, skipping startup"
        exit 0
    fi

    # Start daemon in background
    whispertui daemon >> "$LOG_FILE" 2>&1 &
    DAEMON_PID=$!

    log "Daemon started with PID $DAEMON_PID"

    # Wait a moment and verify it started
    sleep 1
    if kill -0 $DAEMON_PID 2>/dev/null; then
        log "Daemon startup successful"
    else
        log "ERROR: Daemon process died immediately"
        exit 1
    fi
else
    log "ERROR: whispertui command not found"
    log "Make sure whispertui is in your PATH"
    exit 1
fi
