#!/bin/bash
# V3 Diagnostics Tool Auto-Update Launcher

# Try SSH first, fallback to HTTPS if it fails
REPO_SSH="git@github.com:fdsmith22/V3-Diagnostics-Tool.git"
REPO_HTTPS="https://github.com/fdsmith22/V3-Diagnostics-Tool.git"
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

# Update dependencies if needed
if [ "$UPDATE_DEPS" = true ]; then
    echo "Installing/updating dependencies..."
    pip install -r requirements.txt
    npm install
fi

# Check for .env file
if [ ! -f "$APP_DIR/.env" ]; then
    echo ""
    echo "WARNING: No .env file found!"
    echo "Please create $APP_DIR/.env with your SSH credentials"
    echo "Copy from .env.template for reference"
    echo ""
    read -p "Press enter to continue anyway..."
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