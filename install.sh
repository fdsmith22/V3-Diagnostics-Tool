#!/bin/bash
# V3 Diagnostics Tool Installer for Ubuntu
# Safe to run multiple times - will update/fix existing installation

set -e

LAUNCHER_DEST="$HOME/v3-diagnostics-launcher.sh"
APP_DIR="$HOME/.v3-diagnostics-tool"

echo "======================================"
echo "V3 Diagnostics Tool Installer"
echo "======================================"
echo ""

# Check if this is a reinstall/update
if [ -f "$LAUNCHER_DEST" ] || [ -d "$APP_DIR" ]; then
    echo "Existing installation detected - updating..."
    echo ""
fi

# Check for required system packages
echo "Checking system dependencies..."

# Check for Python 3 and venv
if ! command -v python3 &> /dev/null; then
    echo "  Installing Python 3..."
    sudo apt-get update -qq
    sudo apt-get install -y python3 python3-pip python3-venv
else
    # Get Python version and install matching venv package
    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "  Python $PYTHON_VERSION detected"
    echo "  Ensuring python${PYTHON_VERSION}-venv is installed..."
    sudo apt-get update -qq
    sudo apt-get install -y python${PYTHON_VERSION}-venv python3-pip
fi

# Check for Git
if ! command -v git &> /dev/null; then
    echo "  Installing Git..."
    sudo apt-get install -y git
else
    echo "  Git: OK"
fi

# Check for sshpass
if ! command -v sshpass &> /dev/null; then
    echo "  Installing sshpass..."
    sudo apt-get install -y sshpass
else
    echo "  sshpass: OK"
fi

# Check for ttyd
if ! command -v ttyd &> /dev/null; then
    echo "  Installing ttyd..."
    sudo apt-get install -y ttyd
else
    echo "  ttyd: OK"
fi

# Download/update the launcher script
echo ""
echo "Downloading latest launcher..."
LAUNCHER_URL="https://raw.githubusercontent.com/vivacitylabs/V3-Diagnostics-Tool/main/launcher.sh"
curl -fsSL "$LAUNCHER_URL" -o "$LAUNCHER_DEST"
chmod +x "$LAUNCHER_DEST"

# Create desktop entry
echo "Setting up desktop shortcut..."
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

# Create symlinks
if [ -d "$HOME/bin" ]; then
    ln -sf "$LAUNCHER_DEST" "$HOME/bin/v3-diagnostics"
fi

echo "Setting up system command..."
sudo ln -sf "$LAUNCHER_DEST" /usr/local/bin/v3-diagnostics

# Fix broken venv if exists
if [ -d "$APP_DIR" ] && [ ! -f "$APP_DIR/venv/bin/activate" ]; then
    echo ""
    echo "Fixing broken Python environment..."
    rm -rf "$APP_DIR/venv"
fi

echo ""
echo "======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "Run 'v3-diagnostics' to start the tool."
echo ""
