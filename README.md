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

### Quick Install (Auto-Update Version)

For colleagues who want automatic updates, run this one-line installer:

```bash
curl -fsSL https://raw.githubusercontent.com/fdsmith22/V3-Diagnostics-Tool/main/install.sh | bash
```

This will:
- Install all system dependencies
- Create a launcher that auto-updates from GitHub
- Add desktop shortcut and terminal command
- Always run the latest version on startup

After installation, simply run `v3-diagnostics` from anywhere.

### Manual Installation

For development or manual setup:

```bash
git clone https://github.com/fdsmith22/V3-Diagnostics-Tool.git
cd V3-Diagnostics-Tool
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
│   ├── check_system.py    # System info and uptime
│   ├── check_network.py   # Network connectivity tests
│   ├── check_storage.py   # Disk usage and health
│   ├── check_battery.py   # Battery voltage and charge
│   ├── check_modem.py     # LTE modem status
│   ├── check_sim.py       # SIM card detection
│   └── ...
├── static/               # Frontend assets
│   ├── css/             # Stylesheets
│   │   ├── global-theme.css      # Main theme and components
│   │   └── terminal-page.css     # Terminal-specific styles
│   └── js/              # JavaScript files
│       ├── diagnostics.js         # Diagnostic test runner
│       ├── connection.js          # SSH connection manager
│       └── command-palette-enhanced.js # Command hover tooltips
├── templates/            # HTML templates
│   ├── base.html              # Base template
│   ├── index.html             # Dashboard page
│   ├── terminal_ttyd.html     # Terminal interface
│   ├── sidebar.html           # Dashboard diagnostics sidebar
│   └── command_sidebar.html   # Terminal command palette
└── utils/               # Utility modules
    ├── ssh_interface.py       # SSH connection wrapper
    └── ssh_persistent.py      # Persistent SSH manager
```

## Project Context & Architecture

### Application Overview
The V3 Diagnostics Tool is a Flask-based web application designed for hardware testing and debugging of V3 sensor modules. It provides two main interfaces:

1. **Dashboard Page** (`/`) - Real-time system monitoring and diagnostic testing
2. **Terminal Page** (`/terminal`) - Interactive SSH terminal with command palette

### Key Components

#### Two Different Sidebars - Important Distinction!

##### 1. Dashboard Sidebar (`templates/sidebar.html`)
- **Purpose**: Diagnostic test buttons for running system checks
- **Location**: Left side of dashboard page
- **Content**: Grouped diagnostic tests (System, Hardware, Network, Advanced)
- **Function**: Each button runs a Python diagnostic script via API calls
- **Example buttons**: System Status, CPU Info, Battery Health, Network Status

##### 2. Command Palette Sidebar (`templates/command_sidebar.html`)  
- **Purpose**: Quick command shortcuts for terminal page
- **Location**: Right side of terminal page
- **Content**: Pre-defined shell commands organized by category
- **Function**: Copy commands to clipboard for pasting in terminal
- **Example commands**: System monitoring, power modes, network config, Docker

**⚠️ Important**: When adding new features, ensure you're editing the correct sidebar file!

### Adding New Features

#### Adding a New Diagnostic Test (Dashboard)

1. **Create diagnostic script** in `diagnostics/` folder:
```python
# diagnostics/check_example.py
from utils.ssh_interface import run_ssh_command

def run():
    try:
        result = run_ssh_command("your_command_here")
        return {
            'status': 'success',
            'output': result
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': str(e)
        }
```

2. **Add button to dashboard sidebar** (`templates/sidebar.html`):
```html
<button class="btn btn-diagnostic" onclick="runTest('check_example')">
    <i class="material-icons">icon_name</i> Test Name
</button>
```

#### Adding a New Command (Terminal)

1. **Edit command palette** (`templates/command_sidebar.html`):
```html
<!-- Find the appropriate command group -->
<div class="command-list">
    <!-- Add your new command button -->
    <button class="command-item" data-command="your command here">
        Command Description
    </button>
</div>
```

2. **Command Palette Features**:
   - Commands are copied to clipboard on click
   - Hover for 1-2 seconds to see the actual command
   - Organized into collapsible categories
   - Recently added: "Show Sensor Init Details" command

### Enhanced Command Palette Hover Feature

The terminal page includes an enhanced command palette with delayed hover tooltips:

- **Hover delay**: 1 second before showing actual command
- **Visual feedback**: Command displays in green monospace font
- **Auto-restore**: Returns to description when mouse leaves
- **Implementation**: `static/js/command-palette-enhanced.js`

To customize hover behavior:
```javascript
// In command-palette-enhanced.js
const HOVER_DELAY = 1000; // Milliseconds before showing command
```

### SSH Connection Management

The application uses a persistent SSH connection manager:
- **Auto-reconnect**: Automatically reconnects if connection drops
- **Connection pooling**: Reuses existing connections for efficiency
- **Host key management**: Auto-clears keys when switching devices
- **Configuration**: Set credentials in `.env` file

### Real-time Updates

The dashboard uses polling and WebSocket-like patterns for updates:
- **System info**: Updates every 10 seconds
- **Connection status**: Checks every 20 seconds  
- **Diagnostic results**: Stream via Server-Sent Events (SSE)

### Frontend Architecture

- **CSS Framework**: Bootstrap 5 with custom dark theme
- **Icons**: Google Material Icons
- **JavaScript**: Vanilla JS with modular components
- **Responsive**: Mobile-friendly with collapsible sidebars

### Backend Architecture

- **Framework**: Flask with blueprints
- **SSH Library**: Paramiko for SSH connections
- **Rate Limiting**: Flask-Limiter for API protection
- **Environment**: Python virtual environment (venv)

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