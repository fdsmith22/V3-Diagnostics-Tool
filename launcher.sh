#!/bin/bash
# V3 Diagnostics Tool Auto-Update Launcher

# Try SSH first, fallback to HTTPS if it fails
REPO_SSH="git@github.com:vivacitylabs/V3-Diagnostics-Tool.git"
REPO_HTTPS="https://github.com/vivacitylabs/V3-Diagnostics-Tool.git"
REPO_URL="$REPO_SSH"
APP_DIR="$HOME/.v3-diagnostics-tool"
VENV_DIR="$APP_DIR/venv"

echo "V3 Diagnostics Tool Launcher"
echo "============================"

# Clone or update repository
if [ ! -d "$APP_DIR" ]; then
    echo "First time setup - cloning repository..."
    if ! git clone "$REPO_URL" "$APP_DIR" 2>/dev/null; then
        echo "SSH clone failed, trying HTTPS..."
        REPO_URL="$REPO_HTTPS"
        git clone "$REPO_URL" "$APP_DIR"
    fi
else
    echo "Checking for updates..."
    cd "$APP_DIR"
    git fetch origin
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "Updates available! Pulling latest version..."
        git pull origin main
        UPDATE_DEPS=true
    else
        echo "Already up to date!"
    fi
fi

cd "$APP_DIR"

# Setup Python environment if needed
if [ ! -d "$VENV_DIR" ]; then
    echo "Setting up Python environment..."
    python3 -m venv "$VENV_DIR"
    UPDATE_DEPS=true
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Always sync dependencies after update to catch any added/removed packages
if [ "$UPDATE_DEPS" = true ]; then
    echo "Syncing dependencies..."
    pip install --upgrade pip -q
    pip install -r requirements.txt --upgrade -q
    echo "Dependencies updated!"
fi

# Check for .env file and create if needed
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "============================================"
    echo "  First-time Setup: Device Configuration"
    echo "============================================"
    echo ""
    read -p "SSH Username [ubuntu]: " SSH_USER
    SSH_USER=${SSH_USER:-ubuntu}

    read -p "Device IP Address [192.168.55.1]: " SSH_IP
    SSH_IP=${SSH_IP:-192.168.55.1}

    read -sp "SSH Password: " SSH_PASSWORD
    echo ""

    cat > "$APP_DIR/.env" << EOF
SSH_USER=$SSH_USER
SSH_IP=$SSH_IP
SSH_PASSWORD=$SSH_PASSWORD
SUDO_PASSWORD=$SSH_PASSWORD
EOF
    echo "Configuration saved!"
    echo ""
fi

# Kill any existing Flask instances
pkill -f "python.*app.py" 2>/dev/null

# Start Flask app
echo "Starting V3 Diagnostics Tool..."
python app.py &
FLASK_PID=$!

# Wait for Flask to start
sleep 3

# Open browser
echo "Opening browser..."
xdg-open http://localhost:5000 2>/dev/null || open http://localhost:5000 2>/dev/null

# Keep script running
echo ""
echo "V3 Diagnostics Tool is running!"
echo "Press Ctrl+C to stop"
trap "kill $FLASK_PID; exit" INT
wait $FLASK_PID