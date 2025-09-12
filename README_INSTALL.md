# V3 Diagnostics Tool - Quick Installation Guide

## One-Line Installation

For users without Git access, run this single command in your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/fdsmith22/V3-Diagnostics-Tool/main/quick-install.sh | bash
```

Or if you prefer wget:

```bash
wget -qO- https://raw.githubusercontent.com/fdsmith22/V3-Diagnostics-Tool/main/quick-install.sh | bash
```

## What This Does

The installer will:

1. **Clone the repository** to `~/V3-Diagnostics-Tool`
2. **Install system dependencies** (Python, Node.js, ttyd, sshpass)
3. **Create a Python virtual environment**
4. **Install all Python packages** from requirements.txt
5. **Create a `.env` configuration file** (you'll need to edit this)
6. **Set up a launcher script** at `~/v3-diagnostics.sh`
7. **Create a desktop shortcut** for easy access
8. **Add command line access** via `v3-diagnostics` command

## Post-Installation Setup

After installation, you **MUST** configure the `.env` file:

1. Open the file:
   ```bash
   nano ~/V3-Diagnostics-Tool/.env
   ```

2. Set these required values:
   - `FLASK_SECRET_KEY` - Any random string (e.g., `my-super-secret-key-123`)
   - `SSH_PASSWORD` - The password for your target device
   - `SSH_HOST` - If different from default `192.168.2.1`

3. Save and exit (Ctrl+X, then Y, then Enter)

## Running the Tool

After configuration, you can run the tool using any of these methods:

```bash
# Method 1: Using the command
v3-diagnostics

# Method 2: Using the launcher script
~/v3-diagnostics.sh

# Method 3: Manual startup
cd ~/V3-Diagnostics-Tool
source venv/bin/activate
python app.py
```

The web interface will be available at: **http://localhost:5000**

## System Requirements

- Ubuntu 20.04 or later (or similar Debian-based system)
- Python 3.8 or later
- Internet connection for initial installation
- sudo access for installing system packages

## Troubleshooting

### Port 5000 Already in Use
If you get a "port already in use" error, either:
- Stop the other service using port 5000
- Or edit the `.env` file to add: `FLASK_PORT=5001` (or another port)

### Can't Connect to Target Device
- Ensure target device is connected via USB
- Check that SSH_HOST in `.env` matches your device (usually `192.168.2.1`)
- Verify SSH_PASSWORD is correct

### ttyd Installation Fails
If ttyd doesn't install automatically, you can install it manually:
```bash
sudo apt-get update
sudo apt-get install ttyd
```

Or download the binary:
```bash
wget https://github.com/tsl0922/ttyd/releases/download/1.7.4/ttyd.x86_64
sudo mv ttyd.x86_64 /usr/local/bin/ttyd
sudo chmod +x /usr/local/bin/ttyd
```

## Updating the Tool

The tool automatically checks for updates each time it starts. To manually update:

```bash
cd ~/V3-Diagnostics-Tool
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
```

## Uninstalling

To completely remove the tool:

```bash
rm -rf ~/V3-Diagnostics-Tool
rm -f ~/v3-diagnostics.sh
rm -f ~/.local/bin/v3-diagnostics
rm -f ~/.local/share/applications/v3-diagnostics.desktop
```

## Support

For issues or questions, please check the project repository:
https://github.com/fdsmith22/V3-Diagnostics-Tool