#!/bin/bash
# Start ttyd terminal server with connection check

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

# Get SSH credentials from environment or use defaults
SSH_USER="${SSH_USER:-ubuntu}"
SSH_HOST="${SSH_IP:-192.168.55.1}"
SSH_PORT="${SSH_PORT:-22}"
SSH_PASSWORD="${SSH_PASSWORD}"

echo "Starting ttyd terminal server..."

# Check if device is reachable first
if [ -n "$SSH_PASSWORD" ]; then
    # Test SSH connection with timeout
    echo "Testing connection to $SSH_USER@$SSH_HOST..."
    if timeout 3 sshpass -p "$SSH_PASSWORD" ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$SSH_USER@$SSH_HOST" -p "$SSH_PORT" "echo 'Connected'" &>/dev/null; then
        
        echo "Device is reachable, starting terminal with SSH connection..."
        # Device is reachable, start with SSH
        ttyd -W -p 7681 -i lo \
            -t fontSize=14 \
            -t 'theme={"background": "#000000", "foreground": "#ffffff", "cursor": "#ffffff"}' \
            -- sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            "$SSH_USER@$SSH_HOST" -p "$SSH_PORT"
    else
        echo "Device not reachable, starting local shell with connection helper..."
        # Device not reachable, start local shell with helper script
        ttyd -W -p 7681 -i lo \
            -t fontSize=14 \
            -t 'theme={"background": "#000000", "foreground": "#ffffff", "cursor": "#ffffff"}' \
            -- bash -c "echo 'V3 device not connected. Starting local shell.'; echo 'To connect when device is available, run:'; echo '  ssh $SSH_USER@$SSH_HOST'; echo ''; bash"
    fi
else
    echo "No SSH password configured, starting local shell..."
    # No password configured, start local shell
    ttyd -W -p 7681 -i lo \
        -t fontSize=14 \
        -t 'theme={"background": "#000000", "foreground": "#ffffff", "cursor": "#ffffff"}' \
        -- bash -c "echo 'No SSH credentials configured. Starting local shell.'; echo 'Please configure .env file with SSH_PASSWORD'; echo ''; bash"
fi