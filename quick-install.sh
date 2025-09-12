#!/bin/bash
# V3 Diagnostics Tool - Quick One-Line Installer
# This script clones the repository, installs dependencies, and sets up the environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================"
echo "V3 Diagnostics Tool - Quick Installer"
echo "======================================"
echo -e "${NC}"

# Determine installation directory
INSTALL_DIR="$HOME/V3-Diagnostics-Tool"

# Check if directory already exists
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Installation directory already exists at $INSTALL_DIR${NC}"
    read -p "Do you want to remove it and reinstall? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Removing existing installation..."
        rm -rf "$INSTALL_DIR"
    else
        echo "Using existing installation..."
        cd "$INSTALL_DIR"
        git pull origin main 2>/dev/null || true
    fi
fi

# Clone repository if needed
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${GREEN}Step 1: Cloning repository...${NC}"
    git clone https://github.com/fdsmith22/V3-Diagnostics-Tool.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
else
    cd "$INSTALL_DIR"
fi

echo -e "${GREEN}Step 2: Installing system dependencies...${NC}"

# Update package list
sudo apt-get update

# Install Python and pip if not present
if ! command -v python3 &> /dev/null; then
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Install Git if not present (shouldn't happen since we cloned, but just in case)
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
fi

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install sshpass for SSH connections
if ! command -v sshpass &> /dev/null; then
    sudo apt-get install -y sshpass
fi

# Install ttyd for terminal functionality
if ! command -v ttyd &> /dev/null; then
    echo "Installing ttyd..."
    # Try to install from package manager first
    sudo apt-get install -y ttyd 2>/dev/null || {
        # If that fails, download binary
        echo "Package manager install failed, downloading ttyd binary..."
        TTYD_VERSION="1.7.4"
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            TTYD_ARCH="x86_64"
        elif [ "$ARCH" = "aarch64" ]; then
            TTYD_ARCH="aarch64"
        else
            echo -e "${YELLOW}Warning: ttyd binary not available for architecture $ARCH${NC}"
            echo "You may need to build ttyd from source"
        fi
        
        if [ ! -z "$TTYD_ARCH" ]; then
            wget -q "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}" -O /tmp/ttyd
            sudo mv /tmp/ttyd /usr/local/bin/ttyd
            sudo chmod +x /usr/local/bin/ttyd
        fi
    }
fi

echo -e "${GREEN}Step 3: Setting up Python virtual environment...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

echo -e "${GREEN}Step 4: Installing Python dependencies...${NC}"

# Install requirements
pip install -r requirements.txt

echo -e "${GREEN}Step 5: Setting up environment configuration...${NC}"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cat > .env << 'EOF'
# V3 Diagnostics Tool Environment Configuration
# Please fill in the required values

# SSH Configuration for Target Device
SSH_USER=ubuntu
SSH_IP=192.168.55.1
SSH_PASSWORD=your-ssh-password-here
SUDO_PASSWORD=your-sudo-password-here
EOF
    
    echo -e "${YELLOW}"
    echo "======================================"
    echo "IMPORTANT: Environment Configuration"
    echo "======================================"
    echo -e "${NC}"
    echo "A .env file has been created with default values."
    echo "You MUST edit this file to add your specific configuration:"
    echo ""
    echo "  1. Open: $INSTALL_DIR/.env"
    echo "  2. Set SSH_PASSWORD for your target device"
    echo "  3. Set SUDO_PASSWORD for your target device"
    echo "  4. Adjust SSH_IP if different from 192.168.55.1"
    echo "  5. Adjust SSH_USER if different from ubuntu"
    echo ""
else
    echo -e "${YELLOW}.env file already exists - skipping creation${NC}"
fi

echo -e "${GREEN}Step 6: Creating launcher script...${NC}"

# Create launcher script
cat > "$HOME/v3-diagnostics.sh" << 'EOF'
#!/bin/bash
# V3 Diagnostics Tool Launcher

INSTALL_DIR="$HOME/V3-Diagnostics-Tool"

# Check if installation exists
if [ ! -d "$INSTALL_DIR" ]; then
    echo "V3 Diagnostics Tool not found at $INSTALL_DIR"
    echo "Please run the installer first."
    exit 1
fi

cd "$INSTALL_DIR"

# Check for updates
echo "Checking for updates..."
git pull origin main 2>/dev/null || echo "Could not check for updates (offline or no git access)"

# Activate virtual environment
source venv/bin/activate

# Update dependencies if requirements.txt changed
pip install -r requirements.txt --quiet

# Check if .env is configured
if ! grep -q "your-ssh-password-here\|your-sudo-password-here" .env 2>/dev/null; then
    # .env is configured, start normally
    echo "Starting V3 Diagnostics Tool..."
    python app.py
else
    # .env needs configuration
    echo ""
    echo "======================================"
    echo "CONFIGURATION REQUIRED"
    echo "======================================"
    echo ""
    echo "Please edit the .env file first:"
    echo "  $INSTALL_DIR/.env"
    echo ""
    echo "Set these required values:"
    echo "  - SSH_PASSWORD"
    echo "  - SUDO_PASSWORD"
    echo ""
    read -p "Would you like to edit it now? [Y/n]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        ${EDITOR:-nano} "$INSTALL_DIR/.env"
        echo ""
        echo "Starting V3 Diagnostics Tool..."
        python app.py
    else
        echo "Please edit .env before running the tool."
        exit 1
    fi
fi
EOF

chmod +x "$HOME/v3-diagnostics.sh"

# Create desktop entry
echo -e "${GREEN}Step 7: Creating desktop shortcut...${NC}"
mkdir -p "$HOME/.local/share/applications"

cat > "$HOME/.local/share/applications/v3-diagnostics.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=V3 Diagnostics Tool
Comment=Diagnostic tool for V3 sensor modules
Exec=$HOME/v3-diagnostics.sh
Icon=utilities-system-monitor
Terminal=true
Categories=Development;Utility;
EOF

# Create symlink for command line access
if [ -d "$HOME/.local/bin" ]; then
    mkdir -p "$HOME/.local/bin"
fi
ln -sf "$HOME/v3-diagnostics.sh" "$HOME/.local/bin/v3-diagnostics"

# Add to PATH if needed
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
fi

echo ""
echo -e "${GREEN}======================================"
echo "Installation Complete!"
echo "======================================${NC}"
echo ""
echo -e "${YELLOW}NEXT STEPS:${NC}"
echo "1. Edit the configuration file:"
echo "   nano $INSTALL_DIR/.env"
echo ""
echo "2. Set these required values:"
echo "   - SSH_PASSWORD (SSH password for your target device)"
echo "   - SUDO_PASSWORD (sudo password for your target device)"
echo ""
echo "3. Optionally adjust:"
echo "   - SSH_IP (default: 192.168.55.1)"
echo "   - SSH_USER (default: ubuntu)"
echo ""
echo "4. Run the application:"
echo "   v3-diagnostics"
echo "   OR"
echo "   $HOME/v3-diagnostics.sh"
echo ""
echo -e "${GREEN}The tool will be available at: http://localhost:5000${NC}"
echo ""

read -p "Would you like to edit the .env file now? [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    ${EDITOR:-nano} "$INSTALL_DIR/.env"
    echo ""
    read -p "Configuration complete. Launch V3 Diagnostics Tool now? [Y/n]: " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "Starting V3 Diagnostics Tool..."
        cd "$INSTALL_DIR"
        source venv/bin/activate
        python app.py
    fi
else
    echo ""
    echo "Remember to edit $INSTALL_DIR/.env before running the tool!"
fi