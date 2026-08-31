#!/usr/bin/env bash

# ===================================================
#   HAVIT Pro - Executive Tracker Launcher
#   Compatible with Linux & macOS
# ===================================================

# Navigate to script directory
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

echo "==================================================="
echo "  🚀 Starting HAVIT Pro Server..."
echo "==================================================="

# Detect Python interpreter
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python is not installed or not in PATH."
    echo "👉 Please install Python 3 (https://www.python.org/) and try again."
    read -p "Press [Enter] to exit..."
    exit 1
fi

PORT=8080
URL="http://localhost:$PORT"

# Function to open the browser based on OS
open_browser() {
    sleep 1.2
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "$URL" >/dev/null 2>&1
    elif command -v xdg-open >/dev/null 2>&1; then
        # Linux (freedesktop / modern desktop environments)
        xdg-open "$URL" >/dev/null 2>&1
    elif command -v gio >/dev/null 2>&1; then
        gio open "$URL" >/dev/null 2>&1
    elif command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$URL" >/dev/null 2>&1
    elif command -v google-chrome >/dev/null 2>&1; then
        google-chrome "$URL" >/dev/null 2>&1 &
    elif command -v firefox >/dev/null 2>&1; then
        firefox "$URL" >/dev/null 2>&1 &
    else
        echo "🌐 Please open your browser and navigate to: $URL"
    fi
}

# Open browser in background
open_browser &

# Run Python server in foreground
echo "📡 Server running at $URL (Press Ctrl+C to stop)"
echo ""
$PYTHON_CMD server.py "$PORT"
