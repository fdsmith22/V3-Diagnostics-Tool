#!/bin/bash
# Clean up test installation

echo "Cleaning up test installation..."

# Kill any Flask on port 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null

# Remove test directory
if [ -d "$HOME/.v3-diagnostics-tool-TEST" ]; then
    rm -rf "$HOME/.v3-diagnostics-tool-TEST"
    echo "Removed test directory"
fi

echo "Test cleanup complete!"