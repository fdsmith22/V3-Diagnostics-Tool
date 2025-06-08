#!/bin/bash

# V3 Diagnostics Tool Terminal Startup Script
# This script starts ttyd and the Flask application for the terminal interface

echo "🚀 Starting V3 Diagnostics Tool Terminal..."

# Check if ttyd is installed
if ! command -v ttyd &> /dev/null; then
    echo "❌ ttyd is not installed. Please install it first:"
    echo "   wget https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64"
    echo "   chmod +x ttyd.x86_64"
    echo "   sudo mv ttyd.x86_64 /usr/local/bin/ttyd"
    exit 1
fi

# Kill existing ttyd processes on port 8080
echo "🔄 Stopping existing ttyd processes..."
pkill -f "ttyd -p 8080" 2>/dev/null || true

# Check if SSH target is reachable
SSH_HOST=${SSH_HOST:-192.168.55.1}
SSH_USERNAME=${SSH_USERNAME:-ubuntu}

echo "🔍 Testing SSH connection to $SSH_USERNAME@$SSH_HOST..."
if timeout 5 bash -c "</dev/tcp/$SSH_HOST/22" 2>/dev/null; then
    echo "✅ SSH target is reachable, starting ttyd with SSH..."
    ttyd -p 8080 -W ssh $SSH_USERNAME@$SSH_HOST &
    TTYD_MODE="SSH to $SSH_USERNAME@$SSH_HOST"
else
    echo "⚠️  SSH target not reachable, starting ttyd with local bash..."
    ttyd -p 8080 -W bash &
    TTYD_MODE="Local bash shell"
fi

TTYD_PID=$!
echo "✅ ttyd started (PID: $TTYD_PID) - Mode: $TTYD_MODE"

# Wait for ttyd to start
echo "⏳ Waiting for ttyd to start..."
sleep 2

# Test ttyd connection
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ | grep -q "200"; then
    echo "✅ ttyd is running on http://localhost:8080"
else
    echo "❌ ttyd failed to start properly"
    exit 1
fi

# Check if Flask app is running
if pgrep -f "python3 app.py" > /dev/null; then
    echo "✅ Flask application is already running"
else
    echo "🚀 Starting Flask application..."
    python3 app.py &
    FLASK_PID=$!
    echo "✅ Flask application started (PID: $FLASK_PID)"
fi

# Wait for Flask to start
echo "⏳ Waiting for Flask to start..."
sleep 3

# Test Flask connection
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/terminal | grep -q "200"; then
    echo "✅ Flask application is running on http://localhost:5000"
else
    echo "❌ Flask application failed to start properly"
    exit 1
fi

echo ""
echo "🎉 V3 Diagnostics Terminal is ready!"
echo "📱 Access the terminal at: http://localhost:5000/terminal"
echo "🔧 Direct ttyd access: http://localhost:8080"
echo ""
echo "Features:"
echo "  ✅ Integrated sidebar with command categories"
echo "  ✅ Command injection with clipboard copy"
echo "  ✅ Connection status monitoring"
echo "  ✅ Responsive design with fullscreen support"
echo "  ✅ $TTYD_MODE"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap 'echo "🛑 Stopping services..."; kill $TTYD_PID 2>/dev/null; pkill -f "python3 app.py" 2>/dev/null; echo "✅ Services stopped"; exit 0' INT

# Keep script running
while true; do
    sleep 1
done