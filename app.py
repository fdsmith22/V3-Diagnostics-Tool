from flask import Flask, render_template, jsonify, request, send_from_directory, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import sys
import importlib.util
import psutil
import platform
import socket
import subprocess
import datetime
import netifaces
import json
from pathlib import Path
from werkzeug.utils import secure_filename
import io
import contextlib
import logging.handlers
from typing import List
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="flask_limiter")

# === App Setup ===
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app)

app.config.update(
    SECRET_KEY=os.environ.get('FLASK_SECRET_KEY') or os.urandom(24),
    UPLOAD_FOLDER='uploads',
    STATIC_FOLDER='static',
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,
    ALLOWED_ORIGINS="*",
    MAX_TERMINAL_OUTPUT=100000,
    RATE_LIMIT_DEFAULT="100 per hour"
)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'log', 'json'}
DIAGNOSTICS_DIR = Path(__file__).parent / 'diagnostics'
STATIC_DIR = Path(__file__).parent / 'static'

limiter = Limiter(app=app, key_func=get_remote_address, default_limits=[app.config['RATE_LIMIT_DEFAULT']])
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=1024 * 1024)

for directory in [UPLOAD_FOLDER, STATIC_DIR / 'css', STATIC_DIR / 'js']:
    os.makedirs(directory, exist_ok=True)

log_file = 'app.log'
handler = logging.handlers.RotatingFileHandler(log_file, maxBytes=1024 * 1024, backupCount=5)
handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
handler.setLevel(logging.INFO)
app.logger.addHandler(handler)
app.logger.setLevel(logging.INFO)
logger = app.logger

# Commands are now executed via SSH on the target device
# No need for allowed commands list since SSH provides isolation

# Terminal backend options
TERMINAL_BACKEND = os.getenv('TERMINAL_BACKEND', 'ssh')  # Options: 'ssh', 'ttyd', 'pty'

# Initialize terminal manager for PTY sessions
terminal_manager = None

# Track active ttyd terminals (tab_id -> {port, pid, status})
active_terminals = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/terminal')
def terminal():
    """Terminal using ttyd for native experience"""
    return render_template('terminal_ttyd.html')

def capture_output():
    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        yield stdout

def load_diagnostic_module(script_name):
    try:
        script_path = DIAGNOSTICS_DIR / f"{script_name}.py"
        if not script_path.exists() or not script_path.is_file():
            return None

        spec = importlib.util.spec_from_file_location(script_name, str(script_path))
        if not spec or not spec.loader:
            return None

        module = importlib.util.module_from_spec(spec)
        sys.modules[script_name] = module
        spec.loader.exec_module(module)
        return module
    except Exception as e:
        logger.error(f"Error loading module {script_name}: {str(e)}")
        return None

def get_primary_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(1.0)
            s.connect(('8.8.8.8', 1))
            return s.getsockname()[0]
    except Exception as e:
        logger.error(f"Error getting primary IP: {e}")
        return '127.0.0.1'

@socketio.on('connect')
@limiter.limit("60 per minute")
def handle_connect():
    logger.info('Client connected')
    emit('connection_established', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('terminal_input')
@limiter.limit("30 per minute")
def handle_terminal_input(data):
    from utils.ssh_interface import run_ssh_command
    try:
        command = data.get('command', '').strip()
        if not command:
            return
        
        # Use SSH to execute commands on the connected device
        logger.info(f"Terminal received command: {command}")
        try:
            output = run_ssh_command(command, timeout=10)
            logger.info(f"SSH command returned: {output[:100]}...")  # Log first 100 chars
            
            # Check if output indicates an error
            if output.startswith("Error:") or "SSH connection failed" in output:
                emit('terminal_output', {
                    'output': output,
                    'status': 'error'
                })
            else:
                # Truncate if too long
                if len(output) > app.config['MAX_TERMINAL_OUTPUT']:
                    output = output[:app.config['MAX_TERMINAL_OUTPUT']] + '\n... (output truncated)'
                
                emit('terminal_output', {
                    'output': output,
                    'status': 'success'
                })
                logger.info("Terminal output sent successfully")
        except Exception as e:
            logger.error(f"SSH command error: {str(e)}")
            emit('terminal_output', {
                'output': f'SSH command failed: {str(e)}',
                'status': 'error'
            })

    except subprocess.TimeoutExpired:
        emit('terminal_output', {
            'output': 'Command timed out after 10 seconds',
            'status': 'error'
        })
    except Exception as e:
        logger.error(f"Terminal command error: {str(e)}")
        emit('terminal_output', {
            'output': 'Internal error occurred',
            'status': 'error'
        })

@socketio.on('terminal_tab_completion')
@limiter.limit("60 per minute")
def handle_tab_completion(data):
    from utils.ssh_interface import run_ssh_command
    try:
        command = data.get('command', '').strip()
        path = data.get('path', '').strip()
        
        logger.info(f"Tab completion requested - command: '{command}', path: '{path}'")
        
        # Parse the command to understand context
        words = command.split()
        if not words:
            return emit('tab_completion_result', {'completions': []})
        
        # Determine what we're completing
        last_word = words[-1] if words else ''
        
        # Check if we're in a path context (after cd, ls, cat, etc.)
        path_commands = ['cd', 'ls', 'cat', 'less', 'more', 'vi', 'vim', 'nano', 'rm', 'cp', 'mv', 'mkdir', 'touch', 'head', 'tail', 'grep']
        in_path_context = len(words) > 1 and words[0] in path_commands
        
        if in_path_context or '/' in last_word:
            # Complete file/directory paths
            if '/' in last_word:
                # Split path and partial filename
                path_parts = last_word.rsplit('/', 1)
                if len(path_parts) == 2:
                    base_path, partial = path_parts
                    base_path = base_path + '/' if base_path else '/'
                else:
                    base_path = '/'
                    partial = path_parts[0]
            else:
                base_path = './'
                partial = last_word
            
            # List files in the directory
            try:
                # Use ls with specific formatting for parsing
                ls_command = f"ls -1a {base_path} 2>/dev/null | grep '^{partial}' 2>/dev/null || true"
                logger.info(f"Running completion command: {ls_command}")
                
                output = run_ssh_command(ls_command, timeout=2)
                
                if output and not output.startswith("Error:"):
                    # Parse ls output
                    items = [item.strip() for item in output.strip().split('\n') if item.strip()]
                    
                    # For directories, check which items are directories
                    completions = []
                    for item in items:
                        if item and item not in ['.', '..']:
                            # Check if it's a directory
                            check_dir_cmd = f"test -d '{base_path}{item}' && echo 'dir' || echo 'file'"
                            is_dir = run_ssh_command(check_dir_cmd, timeout=1).strip() == 'dir'
                            
                            # Format the completion
                            if base_path == './':
                                completion = item + ('/' if is_dir else '')
                            else:
                                completion = base_path + item + ('/' if is_dir else '')
                            completions.append(completion)
                    
                    logger.info(f"Found {len(completions)} completions: {completions[:5]}...")
                    emit('tab_completion_result', {'completions': completions})
                else:
                    emit('tab_completion_result', {'completions': []})
                    
            except Exception as e:
                logger.error(f"Error getting path completions: {e}")
                emit('tab_completion_result', {'completions': []})
        else:
            # Command completion (existing behavior)
            commands = ['ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'mkdir', 'rm', 'cp', 'mv', 
                       'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'whoami', 'hostname', 
                       'ifconfig', 'ping', 'wget', 'curl', 'ssh', 'scp', 'tar', 'gzip', 'gunzip',
                       'head', 'tail', 'less', 'more', 'vi', 'vim', 'nano', 'touch', 'date']
            
            completions = [cmd for cmd in commands if cmd.startswith(last_word)]
            logger.info(f"Command completions for '{last_word}': {completions}")
            emit('tab_completion_result', {'completions': completions})
            
    except Exception as e:
        logger.error(f"Tab completion error: {str(e)}")
        emit('tab_completion_result', {'completions': []})

# === API ROUTES ===

@app.route('/api/diagnostic/quick', methods=['POST'])
@limiter.limit("10 per minute")
def quick_diagnostic():
    try:
        results = {}
        for script in ['check_system', 'check_memory', 'check_network']:
            result = run_diagnostic_test(script)
            results[script] = result

        return jsonify({
            "status": "success",
            "data": results,
            "message": "Quick diagnostics completed"
        })
    except Exception as e:
        logger.error(f"Error running quick diagnostic: {str(e)}")
        return jsonify({"status": "error", "message": "Internal error occurred"}), 500

@app.route('/api/diagnostic/check_all', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def run_all_diagnostics():
    from flask import Response
    import json
    
    def generate():
        try:
            # Get list of all diagnostic scripts
            scripts = sorted(DIAGNOSTICS_DIR.glob("check_*.py"))
            total_scripts = len(scripts)
            
            # Send initial status with explicit flush
            yield f"data: {json.dumps({'type': 'start', 'total': total_scripts})}\n\n"
            
            results = {}
            for idx, script in enumerate(scripts):
                script_name = script.stem
                
                # Send progress update with explicit flush
                yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total_scripts, 'test': script_name})}\n\n"
                
                # Log progress for debugging
                logger.info(f"Running diagnostic {idx + 1}/{total_scripts}: {script_name}")
                
                try:
                    # Run with shorter timeout to prevent hanging
                    result = run_diagnostic_test(script_name)
                except Exception as e:
                    logger.error(f"Error running {script_name}: {e}")
                    result = {'status': 'error', 'output': str(e)}
                
                results[script_name] = result
                
                # Send individual result with explicit flush
                yield f"data: {json.dumps({'type': 'result', 'test': script_name, 'result': result})}\n\n"
            
            # Send completion with explicit flush
            yield f"data: {json.dumps({'type': 'complete', 'data': results})}\n\n"
            
        except Exception as e:
            logger.exception("Error in check_all generator")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    # Return as Server-Sent Events stream with proper headers
    response = Response(generate(), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/api/diagnostic/<test_name>', methods=['POST'])
@limiter.limit("10 per minute")
def run_diagnostic(test_name):
    try:
        test_name = secure_filename(test_name.replace('-', '_').lower())
        result = run_diagnostic_test(test_name)
        return jsonify({"status": "success", "data": result, "message": "Test completed"})
    except Exception as e:
        logger.error(f"Error running diagnostic {test_name}: {str(e)}")
        return jsonify({"status": "error", "message": "Internal error occurred"}), 500

@app.route('/api/system/status')
@limiter.limit("60 per minute")
def system_status():
    try:
        from utils.ssh_interface import check_ssh_connection
        connected, message = check_ssh_connection()
        
        if not connected:
            # Return default values when device not connected
            default_data = {
                "uptime": "--",
                "deviceId": "No device connected",
                "firmwareVersion": "--",
                "lastUpdate": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "ipAddress": "--",
                "batteryLevel": 0,
                "temperature": "--",
                "processor": "--",
                "connected": False,
                "connectionMessage": message
            }
            return jsonify({
                'status': 'success',
                'data': default_data,
                'timestamp': datetime.datetime.now().isoformat()
            })

        status_data = get_system_info()
        if not status_data:
            raise Exception("Failed to get system information")
        
        status_data['connected'] = True
        status_data['connectionMessage'] = 'Device connected'

        return jsonify({
            'status': 'success',
            'data': status_data,
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in system status: {str(e)}")
        # Return default error state
        default_data = {
            "uptime": "--",
            "deviceId": "Error",
            "firmwareVersion": "--",
            "lastUpdate": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ipAddress": "--",
            "batteryLevel": 0,
            "temperature": "--",
            "processor": "--",
            "connected": False,
            "connectionMessage": str(e)
        }
        return jsonify({
            'status': 'success',
            'data': default_data,
            'timestamp': datetime.datetime.now().isoformat()
        })

@app.route('/api/ping')
@limiter.limit("30 per minute")
def ping():
    """Quick endpoint to check device connection status"""
    from utils.ssh_interface import check_ssh_connection
    try:
        connected, message = check_ssh_connection()
        return jsonify({
            'connected': connected,
            'message': message,
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Ping failed: {e}")
        return jsonify({
            'connected': False,
            'message': str(e),
            'timestamp': datetime.datetime.now().isoformat()
        })

@app.route('/api/terminal/start', methods=['POST'])
@limiter.limit("10 per minute")
def start_terminal():
    """Start a ttyd terminal server with SSH connection to target device"""
    try:
        import subprocess
        import time
        from dotenv import load_dotenv
        
        # Load environment variables
        load_dotenv()
        
        # Get tab_id from request (default to 0 for backward compatibility)
        data = request.json or {}
        tab_id = data.get('tab_id', 0)
        
        # Validate tab_id (max 5 tabs)
        if tab_id < 0 or tab_id >= 5:
            return jsonify({
                'status': 'error',
                'message': 'Invalid tab ID. Must be between 0 and 4'
            }), 400
        
        # Calculate port for this tab
        port = 7682 + tab_id
        
        # Check if terminal already exists for this tab
        if tab_id in active_terminals:
            # Check if the process is still running
            pid = active_terminals[tab_id].get('pid')
            if pid:
                check_result = subprocess.run(f"ps -p {pid}", shell=True, capture_output=True)
                if check_result.returncode == 0:
                    # Terminal already running for this tab
                    return jsonify({
                        'status': 'success',
                        'url': f'http://localhost:{port}',
                        'port': port,
                        'tab_id': tab_id,
                        'pid': pid,
                        'message': 'Terminal already running for this tab'
                    })
        
        # Kill any existing ttyd instances on this port first
        subprocess.run(f"pkill -f 'ttyd.*{port}'", shell=True, capture_output=True)
        time.sleep(0.5)  # Give it time to clean up
        
        # Get SSH credentials
        ssh_user = os.getenv('SSH_USER', 'ubuntu')
        ssh_ip = os.getenv('SSH_IP', '192.168.55.1')
        ssh_password = os.getenv('SSH_PASSWORD', '')
        
        if not ssh_password:
            return jsonify({
                'status': 'error',
                'message': 'SSH password not configured in .env file'
            }), 500
        
        # Start ttyd with SSH connection with better keepalive settings
        cmd = [
            'ttyd', '-W', '-p', str(port), '-i', '0.0.0.0',
            '-t', 'fontSize=14',
            '-t', 'theme={"background": "#1e1e1e", "foreground": "#ffffff", "cursor": "#00ff00"}',
            '--', 
            'sshpass', '-p', ssh_password,
            'ssh', '-o', 'StrictHostKeyChecking=no', 
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'ServerAliveInterval=15',  # Send keepalive every 15 seconds
            '-o', 'ServerAliveCountMax=4',   # Allow 4 missed keepalives before disconnect
            '-o', 'TCPKeepAlive=yes',        # Enable TCP keepalive
            '-o', 'ConnectTimeout=10',       # Connection timeout
            '-o', 'ConnectionAttempts=3',    # Retry connection 3 times
            f'{ssh_user}@{ssh_ip}'
        ]
        
        # Start ttyd process
        process = subprocess.Popen(cmd, 
                                 stdout=subprocess.DEVNULL, 
                                 stderr=subprocess.DEVNULL)
        
        # Wait a moment for ttyd to start
        time.sleep(1.5)
        
        # Check if ttyd started successfully
        check_result = subprocess.run(f"pgrep -f 'ttyd.*{port}'", shell=True, capture_output=True)
        if check_result.returncode == 0:
            pid = check_result.stdout.decode().strip().split('\n')[0]
            logger.info(f"ttyd started successfully on port {port} with PID: {pid} for tab {tab_id}")
            
            # Store terminal info
            active_terminals[tab_id] = {
                'port': port,
                'pid': pid,
                'status': 'running',
                'started_at': datetime.datetime.now().isoformat()
            }
            
            return jsonify({
                'status': 'success',
                'url': f'http://localhost:{port}',
                'port': port,
                'tab_id': tab_id,
                'pid': pid,
                'message': 'Terminal server started'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to start terminal server'
            }), 500
            
    except Exception as e:
        logger.error(f"Failed to start terminal: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/terminal/stop', methods=['POST'])
@limiter.limit("10 per minute")
def stop_terminal():
    """Stop ttyd terminal server for specific tab or all tabs"""
    try:
        import subprocess
        import time
        
        # Get tab_id from request
        data = request.json or {}
        tab_id = data.get('tab_id', None)
        
        if tab_id is not None:
            # Stop specific tab
            if tab_id in active_terminals:
                port = active_terminals[tab_id]['port']
                pid = active_terminals[tab_id].get('pid')
                
                # Kill ttyd process on this port
                result = subprocess.run(f"pkill -f 'ttyd.*{port}'", shell=True, capture_output=True)
                
                # Wait a moment to ensure it's stopped
                time.sleep(0.5)
                
                # Verify it's stopped
                check_result = subprocess.run(f"pgrep -f 'ttyd.*{port}'", shell=True, capture_output=True)
                if check_result.returncode == 0:
                    # Still running, force kill
                    subprocess.run(f"pkill -9 -f 'ttyd.*{port}'", shell=True)
                    logger.warning(f"Had to force kill ttyd on port {port}")
                
                # Remove from active terminals
                del active_terminals[tab_id]
                logger.info(f"ttyd on port {port} (tab {tab_id}) stopped successfully")
            else:
                return jsonify({
                    'status': 'warning',
                    'message': f'No terminal found for tab {tab_id}'
                })
        else:
            # Stop all terminals
            for tid, term_info in list(active_terminals.items()):
                port = term_info['port']
                subprocess.run(f"pkill -f 'ttyd.*{port}'", shell=True, capture_output=True)
                
            # Clear all active terminals
            active_terminals.clear()
            logger.info("All ttyd terminals stopped successfully")
        
        return jsonify({
            'status': 'success',
            'message': 'Terminal server stopped'
        })
        
    except Exception as e:
        logger.error(f"Failed to stop terminal: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/terminal/list', methods=['GET'])
def list_terminals():
    """List all active terminal sessions"""
    try:
        import subprocess
        
        # Verify which terminals are actually running
        verified_terminals = {}
        for tab_id, term_info in active_terminals.items():
            pid = term_info.get('pid')
            if pid:
                # Check if process is still running
                check_result = subprocess.run(f"ps -p {pid}", shell=True, capture_output=True)
                if check_result.returncode == 0:
                    verified_terminals[tab_id] = term_info
                else:
                    # Process not running, update status
                    term_info['status'] = 'stopped'
        
        # Update active terminals with verified ones
        active_terminals.clear()
        active_terminals.update(verified_terminals)
        
        return jsonify({
            'status': 'success',
            'terminals': active_terminals,
            'count': len(active_terminals)
        })
    except Exception as e:
        logger.error(f"Failed to list terminals: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/system/check-connection')
@limiter.limit("10 per minute")
def check_connection():
    from utils.ssh_interface import check_ssh_connection
    try:
        connected, message = check_ssh_connection()
        interfaces = get_network_interfaces()
        
        # Check if the expected USB network interface exists
        usb_interface_exists = any(
            iface.startswith('usb') or 
            (interfaces.get(iface, {}).get('ip', '').startswith('192.168.55.') if interfaces.get(iface) else False)
            for iface in interfaces
        )
        
        return jsonify({
            'status': 'success',
            'connected': connected,
            'message': message,
            'interfaces': interfaces,
            'usbInterfaceDetected': usb_interface_exists,
            'targetIP': os.getenv('SSH_IP', '192.168.55.1')
        })
    except Exception as e:
        logger.error(f"Error checking connection: {str(e)}")
        return jsonify({
            'status': 'error', 
            'connected': False,
            'message': str(e),
            'interfaces': {},
            'usbInterfaceDetected': False
        })

@app.route('/api/system/reset-connection', methods=['POST'])
@limiter.limit("5 per minute")
def reset_connection():
    """Reset SSH connection and clear host keys for switching devices."""
    try:
        from utils.ssh_persistent import reset_ssh_connection
        success, message = reset_ssh_connection()
        
        if success:
            logger.info("SSH connection reset successfully")
            return jsonify({
                'status': 'success',
                'message': message
            })
        else:
            logger.error(f"Failed to reset SSH connection: {message}")
            return jsonify({
                'status': 'error',
                'message': message
            }), 500
    except Exception as e:
        logger.error(f"Error resetting connection: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f"Failed to reset connection: {str(e)}"
        }), 500

@app.errorhandler(404)
def not_found_error(error):
    return jsonify({"status": "error", "message": "Requested resource not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"status": "error", "message": "Internal server error occurred"}), 500

# === Utility Functions ===
def run_diagnostic_test(script_name):
    module = load_diagnostic_module(script_name)
    if not module or not hasattr(module, 'run'):
        return {'status': 'error', 'output': f'{script_name} not found or invalid'}
    try:
        return module.run()
    except Exception as e:
        logger.error(f"Error running {script_name}: {e}")
        return {'status': 'error', 'output': str(e)}

def get_network_interfaces():
    interfaces = {}
    for iface in netifaces.interfaces():
        try:
            addr = netifaces.ifaddresses(iface)
            ip = addr.get(netifaces.AF_INET, [{}])[0].get('addr', 'N/A')
            mac = addr.get(netifaces.AF_LINK, [{}])[0].get('addr', 'N/A')
            interfaces[iface] = {'ip': ip, 'mac': mac}
        except Exception:
            interfaces[iface] = {'ip': 'N/A', 'mac': 'N/A'}
    return interfaces

# Cache for system info to reduce SSH commands
_system_info_cache = {
    'data': None,
    'timestamp': None,
    'ttl': 10  # Cache TTL in seconds - increased to reduce SSH load
}

def get_system_info():
    from utils.ssh_interface import run_ssh_command
    import time
    
    # Check cache
    if (_system_info_cache['timestamp'] and 
        time.time() - _system_info_cache['timestamp'] < _system_info_cache['ttl'] and
        _system_info_cache['data']):
        logger.info("[CACHE HIT] Using cached system info")
        return _system_info_cache['data']

    try:
        logger.info(f"[CACHE MISS] Fetching fresh system info (cache age: {time.time() - (_system_info_cache['timestamp'] or 0):.1f}s)")
        
        # Run all commands in a single SSH command for efficiency
        combined_cmd = """
        echo "UPTIME:$(uptime -p)"
        echo "HOSTNAME:$(hostname)"
        echo "OS_VERSION:$(grep PRETTY_NAME /etc/os-release | cut -d= -f2)"
        echo "IP:$(ip addr show wlan0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 || echo 'N/A')"
        echo "TEMP:$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0)"
        echo "BATTERY:$(cd /home/freddy/V3-Diagnostics-Tool2 && python3 diagnostics/check_battery.py 2>/dev/null | grep -E '(Estimated Charge:|No battery)' | sed 's/.*Estimated Charge: //' | head -1 || echo 'No battery')"
        echo "PROCESSOR:$(cat /proc/device-tree/model 2>/dev/null | tr -d '\\0' || echo 'Unknown')"
        """
        
        result = run_ssh_command(combined_cmd.strip())
        
        # Parse the combined output
        data = {}
        for line in result.split('\n'):
            if ':' in line:
                key, value = line.split(':', 1)
                data[key] = value.strip()
        
        uptime = data.get('UPTIME', '--')
        hostname = data.get('HOSTNAME', '--')
        os_version = data.get('OS_VERSION', '--')
        ip = data.get('IP', '--')
        temp_raw = data.get('TEMP', '0')
        battery = data.get('BATTERY', '100%')
        processor = data.get('PROCESSOR', 'Unknown')

        temperature = "--"
        if temp_raw.isdigit():
            temperature = f"{int(temp_raw) / 1000:.1f}"

        battery_percent = 0
        if battery == "No battery":
            battery_percent = 0
        elif "%" in battery:
            battery_percent = int(''.join(filter(str.isdigit, battery)))

        result = {
            "uptime": uptime.strip(),
            "deviceId": hostname.strip(),
            "firmwareVersion": os_version.strip().replace('"', ''),
            "lastUpdate": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "ipAddress": ip.strip(),
            "batteryLevel": battery_percent,
            "temperature": temperature,
            "processor": processor.strip()
        }
        
        # Update cache
        _system_info_cache['data'] = result
        _system_info_cache['timestamp'] = time.time()
        
        return result

    except Exception as e:
        logger.error(f"[SSH SYSTEM INFO] Error: {e}")
        return None

if __name__ == '__main__':
    import argparse
    
    # Parse command line arguments for port
    parser = argparse.ArgumentParser(description='V3 Diagnostics Tool')
    parser.add_argument('--port', type=int, default=5000, help='Port to run on (default: 5000)')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to (default: 0.0.0.0)')
    args = parser.parse_args()
    
    # Also check environment variable for port
    port = int(os.environ.get('FLASK_RUN_PORT', args.port))
    host = args.host
    
    logger.info(f"Starting V3 Diagnostics Tool on {host}:{port}")
    
    # Use threading mode for better stability with long-running requests
    socketio.run(app, host=host, port=port, debug=True, allow_unsafe_werkzeug=True,
                 use_reloader=False, log_output=True)