#!/usr/bin/env bash

# ===================================================
#   HAVIT Pro - macOS Double-Click Launcher (.command)
# ===================================================

# Change to script directory
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

# Execute the main launcher script
if [ -f "./Launch HAVIT Pro.sh" ]; then
    bash "./Launch HAVIT Pro.sh"
elif [ -f "./launch.sh" ]; then
    bash "./launch.sh"
else
    # Fallback inline execution
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_CMD="python3"
    else
        PYTHON_CMD="python"
    fi
    (sleep 1.2 && open "http://localhost:8080") &
    $PYTHON_CMD server.py 8080
fi
