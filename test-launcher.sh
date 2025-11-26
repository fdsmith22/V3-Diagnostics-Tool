#!/bin/bash
# TEST VERSION - Uses a different directory to avoid conflicts

REPO_URL="git@github.com:vivacitylabs/V3-Diagnostics-Tool.git"
APP_DIR="$HOME/.v3-diagnostics-tool-TEST"  # Different directory for testing
VENV_DIR="$APP_DIR/venv"

echo "V3 Diagnostics Tool Launcher (TEST VERSION)"
echo "==========================================="
echo "Using test directory: $APP_DIR"
echo ""

# Clone or update repository
if [ ! -d "$APP_DIR" ]; then
    echo "First time setup - cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
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
    echo "Copying from your dev version..."
    
    # Copy .env from dev version if it exists
    if [ -f "/home/freddy/V3-Diagnostics-Tool2/.env" ]; then
        cp "/home/freddy/V3-Diagnostics-Tool2/.env" "$APP_DIR/.env"
        echo "Copied .env from dev version"
    else
        echo "Please create $APP_DIR/.env with your SSH credentials"
        echo "Copy from .env.template for reference"
        read -p "Press enter to continue anyway..."
    fi
fi

# Kill any existing Flask instances on port 5001 (different port for testing)
lsof -ti:5001 | xargs kill -9 2>/dev/null

# Start Flask app on different port
echo "Starting V3 Diagnostics Tool on port 5001 (TEST)..."
cd "$APP_DIR"
source "$VENV_DIR/bin/activate"
python app.py --port 5001 &
FLASK_PID=$!

# Wait for Flask to start
sleep 3

# Check if Flask is running
if ! kill -0 $FLASK_PID 2>/dev/null; then
    echo "ERROR: Flask failed to start!"
    echo "Trying with default settings..."
    cd "$APP_DIR"
    source "$VENV_DIR/bin/activate"
    python -c "import app; app.socketio.run(app.app, host='0.0.0.0', port=5001)" &
    FLASK_PID=$!
    sleep 3
fi

# Open browser
echo "Opening browser on port 5001..."
xdg-open http://localhost:5001 2>/dev/null || open http://localhost:5001 2>/dev/null

# Keep script running
echo ""
echo "TEST VERSION is running on port 5001!"
echo "Your dev version can still run on port 5000"
echo "Press Ctrl+C to stop"
trap "kill $FLASK_PID 2>/dev/null; exit" INT
wait $FLASK_PID