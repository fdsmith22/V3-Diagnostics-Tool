# V3 Diagnostics Tool

A comprehensive web-based diagnostic interface for V3 sensor modules with integrated terminal access and real-time monitoring. Designed for quick testing and debugging of devices over USB connection.

## Features

### Core Diagnostics
- **System Health Monitoring** - CPU, memory, and process monitoring
- **Power Supply Rails** - Voltage rail checks and power consumption
- **Network Diagnostics** - Interface status, connectivity, and modem checks
- **SIM Card Detection** - SIM presence, signal strength, and carrier info
- **Camera System** - IMX camera device check and physical port verification
- **Storage Health** - Disk usage, health checks, and SMART data
- **Thermal Monitoring** - Multi-zone temperature sensors with real-time updates
- **Log Analysis** - Condensed error logs and system messages

### Terminal Features
- **Integrated Web Terminal** - Native SSH terminal via ttyd
- **Command Palette** - Quick access to common diagnostic commands
- **Persistent SSH Connection** - Optimized connection management with auto-reconnect
- **Auto Host Key Management** - Automatic SSH key clearing for device switching

### User Interface
- **Modern Dashboard** - Real-time status updates with WebSocket support
- **Responsive Design** - Works on desktop and mobile devices
- **Dark Theme** - Eye-friendly interface for extended use
- **Collapsible Sidebars** - Diagnostics menu and command palette

## Prerequisites

- Python 3.7+
- Ubuntu/Linux system (for SSH connectivity)
- USB connection to V3 device (typically at 192.168.55.1)
- Node.js and npm (for frontend dependencies)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/V3-Diagnostics-Tool2.git
cd V3-Diagnostics-Tool2
```

### 2. Set Up Python Environment

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

### 3. Install System Dependencies

```bash
# Install sshpass for SSH authentication
sudo apt-get update
sudo apt-get install sshpass

# Install ttyd for web terminal (optional but recommended)
sudo apt-get install ttyd

# Or build from source for latest version:
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake ..
make && sudo make install
```

### 4. Install Frontend Dependencies

```bash
npm install
```

### 5. Configure Environment

```bash
# Copy the template
cp .env.template .env

# Edit with your credentials
nano .env
```

Update the `.env` file with your device credentials:

```env
SSH_USER=ubuntu
SSH_IP=192.168.55.1
SSH_PASSWORD=your_actual_password
SUDO_PASSWORD=your_actual_password
```

## Running the Application

### Development Mode

```bash
# Activate virtual environment
source venv/bin/activate

# Run Flask application
python app.py
```

### Production Mode

```bash
# Run with nohup for background execution
nohup python app.py > flask.log 2>&1 &

# Or use gunicorn (recommended for production)
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

Access the application at: `http://localhost:5000`

## Usage

### Dashboard
1. Connect your V3 device via USB
2. Navigate to `http://localhost:5000`
3. The dashboard will show device connection status
4. Click diagnostic buttons to run specific tests

### Terminal
1. Click "Terminal" in the navigation bar
2. Click "Connect" to establish SSH session
3. Use the command palette for quick commands
4. Commands are automatically copied to clipboard for pasting

### Running Diagnostics
1. Use the diagnostics sidebar (left) for individual tests
2. Click "Run All Diagnostics" for comprehensive testing
3. Results appear in real-time with progress indicators
4. Export results as needed

## API Endpoints

### System Status
- `GET /api/system/status` - Device status and metrics
- `GET /api/ping` - Quick connection check
- `POST /api/system/reset-connection` - Reset SSH and clear host keys

### Diagnostics
- `POST /api/diagnostic/<test_name>` - Run specific diagnostic
- `GET /api/diagnostic/check_all` - Run all diagnostics (SSE stream)
- `POST /api/diagnostic/quick` - Quick health check

### Terminal
- `POST /api/terminal/start` - Start ttyd terminal server
- `POST /api/terminal/stop` - Stop terminal server

## Security Notes

- Never commit `.env` files with actual passwords
- Use `.env.template` as a reference for required variables
- SSH host keys are automatically managed for device switching
- Rate limiting is enabled on all API endpoints
- Terminal access is isolated through SSH

## Troubleshooting

### Connection Issues
```bash
# Clear SSH known hosts
ssh-keygen -R 192.168.55.1

# Test SSH manually
sshpass -p 'your_password' ssh ubuntu@192.168.55.1 echo "Connected"
```

### Terminal Not Loading
```bash
# Check if ttyd is running
pgrep -f ttyd

# Restart ttyd manually
pkill -f ttyd
./start_ttyd.sh
```

### Permission Errors
```bash
# Ensure script is executable
chmod +x start_ttyd.sh

# Check Flask logs
tail -f flask.log
```

## Project Structure

```
V3-Diagnostics-Tool2/
├── app.py                  # Flask application main file
├── requirements.txt        # Python dependencies
├── package.json           # Node.js dependencies
├── .env.template          # Environment variable template
├── start_ttyd.sh          # Terminal server startup script
├── diagnostics/           # Diagnostic test modules
│   ├── check_system.py
│   ├── check_network.py
│   ├── check_storage.py
│   └── ...
├── static/               # Frontend assets
│   ├── css/             # Stylesheets
│   └── js/              # JavaScript files
├── templates/            # HTML templates
│   ├── base.html        # Base template
│   ├── index.html       # Dashboard
│   └── terminal_ttyd.html # Terminal interface
└── utils/               # Utility modules
    ├── ssh_interface.py  # SSH connection wrapper
    └── ssh_persistent.py # Persistent SSH manager
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Acknowledgments

- Built with Flask, Bootstrap, and Material Icons
- Terminal powered by ttyd
- SSH management via Paramiko
- WebSocket support through Flask-SocketIO