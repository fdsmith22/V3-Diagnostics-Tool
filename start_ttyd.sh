#!/bin/bash
# Start ttyd terminal server for SSH connection to device

# Check if ttyd is installed
if ! command -v ttyd &> /dev/null; then
    echo "ttyd is not installed. Please install it first:"
    echo "sudo apt-get install ttyd"
    exit 1
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Get SSH credentials from environment or use defaults (matching ssh_interface.py)
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_IP:-192.168.55.1}"
SSH_PORT="${SSH_PORT:-22}"
SSH_PASSWORD="${SSH_PASSWORD}"

# Start ttyd with SSH command
echo "Starting ttyd terminal server..."
echo "Connecting to: $SSH_USER@$SSH_HOST:$SSH_PORT"

# Run ttyd with SSH command
# -p 7682: Port to listen on
# -i lo: Only listen on localhost for security
# -t fontSize=14: Set font size
# -t theme='{"background": "#000000", "foreground": "#ffffff"}': Dark theme

# Check if password is provided
if [ -n "$SSH_PASSWORD" ]; then
    echo "Using SSH password authentication"
    # Use sshpass if password is available
    # -W flag makes terminal writable
    ttyd -W -p 7682 -i lo \
        -t fontSize=14 \
        -t 'theme={"background": "#000000", "foreground": "#ffffff", "cursor": "#ffffff"}' \
        -- sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$SSH_USER@$SSH_HOST" -p "$SSH_PORT"
else
    echo "No SSH password provided, will prompt for password"
    # Without password (will prompt)
    # -W flag makes terminal writable
    ttyd -W -p 7682 -i lo \
        -t fontSize=14 \
        -t 'theme={"background": "#000000", "foreground": "#ffffff", "cursor": "#ffffff"}' \
        -- ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$SSH_USER@$SSH_HOST" -p "$SSH_PORT"
fi