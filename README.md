# V3 Diagnostics Tool

A comprehensive web-based diagnostic interface for embedded systems diagnostics, specifically designed for NVIDIA Jetson devices (Orin Nano, Xavier NX variants).

## Features

### **Comprehensive Diagnostics**
- **System Information**: Hardware details, uptime, network configuration
- **Power & Battery**: Voltage monitoring, charging status, power rail checks
- **Network Connectivity**: Interface status, modem connection, SIM presence
- **Hardware Components**: Camera detection, USB devices, I2C bus status
- **Storage & Memory**: Disk health, memory usage, extended memory analysis
- **Thermal Monitoring**: Temperature sensors across multiple zones
- **Board Variant Detection**: Automatic identification of Jetson hardware models

### **Modern Web Interface**
- **Real-time Dashboard**: Live system monitoring with visual indicators
- **SSH Terminal**: Integrated web terminal with persistent sessions
- **MCU UART Interface**: Direct microcontroller communication
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Dark Theme**: Professional interface optimized for technical work

### **Connectivity**
- **SSH-based Diagnostics**: Secure remote command execution
- **Connection Monitoring**: Automatic SSH connection testing and status reporting
- **Fallback Support**: Graceful degradation when SSH is unavailable
- **Session Persistence**: Maintains connection state across page reloads

### **Hardware Identification**
- **Reference Guide**: Built-in hardware identification table for technicians
- **Automatic Detection**: Identifies specific board variants and memory configurations
- **Part Number Lookup**: Internal labels, hardware names, and vendor part numbers

## Quick Start

### 1. Clone and Setup
```bash
git clone <repository-url>
cd V3-Diagnostics-Tool
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment
Create a `.env` file with your SSH credentials:
```bash
# SSH Connection Settings
SSH_HOST=<target_ip>
SSH_USERNAME=<target_user>
SSH_PASSWORD=your_password

# Flask Application Settings
SECRET_KEY=your-secret-key-here
```

### 3. Run the Application
```bash
python app.py
```

Access the diagnostic interface at: **http://localhost:5000**

## Application Structure

```
V3-Diagnostics-Tool/
├── app.py                 # Main Flask application with Socket.IO
├── diagnostics/           # Diagnostic modules (19 total)
│   ├── check_system.py
│   ├── check_battery.py
│   ├── check_network.py
│   ├── check_board_variant.py
│   └── ...
├── templates/             # HTML templates
│   ├── index.html         # Main dashboard
│   ├── terminal.html      # SSH terminal interface
│   ├── mcuUART.html      # MCU communication
│   └── ...
├── static/               # CSS, JavaScript, assets
│   ├── css/              # Unified design system
│   ├── js/               # Frontend logic
│   └── manifest.json     # PWA configuration
├── utils/                # Utility modules
│   ├── ssh_interface.py  # SSH connection management
│   └── mcu_interface.py  # MCU communication
└── requirements.txt      # Python dependencies
```

## Diagnostic Modules

The system includes 19 specialized diagnostic modules:

- **System**: `check_system`, `check_cpuinfo`, `check_memory`, `check_memory_extended`
- **Network**: `check_network`, `check_interfaces`, `check_modem`, `check_sim`
- **Hardware**: `check_camera`, `check_usb`, `check_i2c`, `check_board_variant`
- **Power**: `check_battery`, `check_power`
- **Storage**: `check_storage`, `check_disk_health`
- **Monitoring**: `check_thermals`, `check_logs`, `check_dmesg_critical`

## Hardware Support

### Supported NVIDIA Jetson Devices
| Internal Label | Hardware Name | Vendor Part Number |
|---------------|---------------|-------------------|
| PT-ZA-498 | Orin Nano 4GB | 900-13767-0040-000 |
| PT-ZA-499 | Orin Nano 8GB | 900-13767-0030-000 |
| PT-ZA-471 | Xavier NX 16GB | 900-83668-0030-000 |
| PT-ZA-667 | Xavier NX 8GB | 900-83668-0000-000 |

## Requirements

- **Python**: 3.7 or higher
- **SSH Access**: Target device must be accessible via SSH
- **Network**: Device should be reachable (default: 192.168.55.1)
- **Optional**: `sshpass` for enhanced SSH connectivity

### Python Dependencies
- Flask 2.2.5+ with Socket.IO support
- Gevent for async operations
- Pexpect for SSH fallback
- Python-dotenv for configuration
- Requests for HTTP operations

## Configuration

### Environment Variables
```bash
# Required
SSH_HOST=<ip_address>          # Target device IP
SSH_USERNAME=<user>            # SSH username
SSH_PASSWORD=your_password     # SSH password

# Optional
SECRET_KEY=your-secret-key     # Flask session key (auto-generated if not set)
```

### Development Commands
```bash
# Run application
python app.py

# Install dependencies
pip install -r requirements.txt

# Access interfaces
# Dashboard: http://localhost:5000
# Terminal: http://localhost:5000/terminal
# MCU UART: http://localhost:5000/mcu-uart
# Settings: http://localhost:5000/settings
```

## Architecture

### Backend
- **Flask**: Web framework with Socket.IO for real-time communication
- **SSH Interface**: Connection caching, retry logic, and fallback support
- **Modular Diagnostics**: Each test is a separate Python module
- **Session Management**: Persistent connections with automatic cleanup

### Frontend
- **Modern CSS**: Custom design system with CSS variables
- **Responsive Design**: Tailwind-inspired utility classes
- **Real-time Updates**: Socket.IO for live diagnostic results
- **Progressive Web App**: Offline capabilities and mobile optimization

### Security
- **Credential Protection**: SSH credentials stored in `.env` (not committed)
- **Input Validation**: Sanitized command execution
- **Session Security**: Secure session management with configurable timeouts

## License

This project is developed for embedded systems diagnostics and hardware testing purposes.

## Contributing

When contributing:
1. Follow the existing code style and structure
2. Add appropriate error handling for SSH operations
3. Update diagnostic modules to use the SSH interface utility
4. Ensure responsive design compatibility
5. Test with both SSH available and unavailable scenarios
