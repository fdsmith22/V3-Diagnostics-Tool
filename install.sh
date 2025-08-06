#!/bin/bash
# V3 Diagnostics Tool One-Time Installer for Ubuntu

set -e

echo "======================================"
echo "V3 Diagnostics Tool Installer"
echo "======================================"
echo ""

# Check for required system packages
echo "Checking system dependencies..."

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Installing..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Check for Git
if ! command -v git &> /dev/null; then
    echo "Git not found. Installing..."
    sudo apt-get install -y git
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check for sshpass
if ! command -v sshpass &> /dev/null; then
    echo "sshpass not found. Installing..."
    sudo apt-get install -y sshpass
fi

# Check for ttyd (optional but recommended)
if ! command -v ttyd &> /dev/null; then
    echo "ttyd not found. Installing..."
    sudo apt-get install -y ttyd
fi

# Download the launcher script
echo ""
echo "Downloading launcher..."
LAUNCHER_URL="https://raw.githubusercontent.com/fdsmith22/V3-Diagnostics-Tool/main/launcher.sh"
LAUNCHER_DEST="$HOME/v3-diagnostics-launcher.sh"

curl -fsSL "$LAUNCHER_URL" -o "$LAUNCHER_DEST"
chmod +x "$LAUNCHER_DEST"

# Create desktop entry for easy access
echo "Creating desktop shortcut..."
DESKTOP_FILE="$HOME/.local/share/applications/v3-diagnostics.desktop"
mkdir -p "$HOME/.local/share/applications"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=V3 Diagnostics Tool
Comment=Diagnostic tool for V3 sensor modules
Exec=$LAUNCHER_DEST
Icon=utilities-system-monitor
Terminal=true
Categories=Development;Utility;
EOF

chmod +x "$DESKTOP_FILE"

# Create a symlink in user's bin directory if it exists
if [ -d "$HOME/bin" ]; then
    ln -sf "$LAUNCHER_DEST" "$HOME/bin/v3-diagnostics"
    echo "Created command 'v3-diagnostics' in ~/bin"
fi

# Also create a system-wide link (optional)
echo ""
read -p "Create system-wide command 'v3-diagnostics'? (requires sudo) [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo ln -sf "$LAUNCHER_DEST" /usr/local/bin/v3-diagnostics
    echo "Created system-wide command 'v3-diagnostics'"
fi

echo ""
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "To run V3 Diagnostics Tool, use one of these methods:"
echo "  1. Type 'v3-diagnostics' in terminal"
echo "  2. Run: $LAUNCHER_DEST"
echo "  3. Find 'V3 Diagnostics Tool' in your applications menu"
echo ""
echo "The tool will auto-update from GitHub on each launch."
echo ""
echo "First launch will clone the repository and set up the environment."
echo "This may take a few minutes."
echo ""
read -p "Would you like to launch V3 Diagnostics Tool now? [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    echo "Launching V3 Diagnostics Tool..."
    exec "$LAUNCHER_DEST"
fi