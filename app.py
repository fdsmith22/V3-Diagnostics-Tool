from gevent import monkey
import warnings
import os

# Patch all before importing other modules
monkey.patch_all()

# Suppress threading warnings that can occur with gevent
warnings.filterwarnings("ignore", category=RuntimeWarning, module="threading")
os.environ['PYTHONWARNINGS'] = 'ignore::RuntimeWarning:threading'

from flask import Flask, render_template, jsonify, request, flash, redirect, url_for, session, Response
from flask_socketio import SocketIO
import subprocess
import os
import re
import time
import logging
import requests
from dotenv import load_dotenv

load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)  # Changed to INFO to reduce spam
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "diagnostic-tool-secret-key-v3-persistent-sessions")
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 86400  # 24 hours

# Clean Socket.IO configuration - no debug logging
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='gevent',
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=30,
    max_http_buffer_size=1000000,
    allow_upgrades=True,
    compression=True,
    manage_session=True
)

# === Device Connection Check ===
def check_device_connection():
    """Enhanced device connection check using both ping and SSH"""
    try:
        from utils.ssh_interface import test_ssh_connection
        
        ssh_result = test_ssh_connection()
        is_connected = ssh_result['success']
        error = ssh_result.get('error')
        
        if is_connected:
            logger.info("Device connection verified via SSH")
            return True

        logger.warning(f"SSH connection failed: {error}")

        # Fallback to ping test
        response = subprocess.run(
            ['ping', '-c', '1', os.getenv("SSH_HOST", "192.168.55.1")],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2
        )

        if response.returncode == 0:
            logger.info("Device reachable via ping (but SSH may be unavailable)")
            return True
        else:
            logger.warning("Device not reachable via ping")
            return False

    except Exception as e:
        logger.error(f"Connection check failed: {str(e)}")
        return False

# === Utility Functions ===
def extract_simplified_uptime(uptime_str):
    """Extract just the time and uptime duration from the full uptime string"""
    if not uptime_str:
        return "Unknown"
    uptime_match = re.search(r'(\d+:\d+:\d+)\s+up\s+([^,]+)', uptime_str)
    if uptime_match:
        time_part = uptime_match.group(1)
        duration = uptime_match.group(2).strip()
        return f"{time_part} up {duration}"
    return uptime_str

def extract_wlan0_ip(interfaces_output):
    """Extract the WLAN0 IP address (192.168.x.x) from interfaces output"""
    if not interfaces_output:
        return "Not connected"
    wlan0_section = re.search(r'wlan0:.*?(?=^\d|\Z)', interfaces_output, re.DOTALL | re.MULTILINE)
    if wlan0_section:
        ip_match = re.search(r'inet\s+(192\.168\.\d+\.\d+)', wlan0_section.group(0))
        if ip_match:
            return ip_match.group(1)
    return "Not connected"

def extract_hostname(system_output):
    """Extract the hardware-xxxx hostname from system output"""
    if not system_output:
        return "Unknown"
    hostname_match = re.search(r'Static hostname:\s+(hardware-\d+)', system_output)
    if hostname_match:
        return hostname_match.group(1)
    
    linux_match = re.search(r'Linux (hardware-\d+)', system_output)
    if linux_match:
        return linux_match.group(1)
    
    machine_id_match = re.search(r'Machine ID:\s+([a-f0-9]+)', system_output)
    if machine_id_match:
        return machine_id_match.group(1)

    return "Unknown"

def extract_battery_info(battery_output):
    """Extract battery information from command output"""
    battery_info = {
        'percentage': '—',
        'voltage': '—',
        'input_voltage': '—',
        'status': '—'
    }

    if not battery_output:
        return battery_info

    # Look for percentage
    percentage_match = re.search(r'(\d+)%', battery_output)
    if percentage_match:
        battery_info['percentage'] = f"{percentage_match.group(1)}%"

    # Look for voltage patterns
    voltage_matches = re.findall(r'(\d+\.?\d*)\s*[Vv]', battery_output)
    if len(voltage_matches) >= 1:
        battery_info['voltage'] = f"{voltage_matches[0]}V"
    if len(voltage_matches) >= 2:
        battery_info['input_voltage'] = f"{voltage_matches[1]}V"

    # Look for status keywords
    if 'charging' in battery_output.lower():
        battery_info['status'] = 'Charging'
    elif 'discharging' in battery_output.lower():
        battery_info['status'] = 'Discharging'
    elif 'full' in battery_output.lower():
        battery_info['status'] = 'Full'

    return battery_info

# === Routes ===
@app.route('/')
def index():
    return render_template('index.html')

# Global variable to store the shared ttyd WebSocket connection
ttyd_websocket = None
command_queue = []

# TTYD Terminal Proxy Routes
@app.route('/terminal-proxy/')
@app.route('/terminal-proxy/<path:path>')
def terminal_proxy(path=''):
    """Proxy requests to ttyd terminal"""
    try:
        ttyd_url = f'http://localhost:8080/{path}'
        
        # Forward HTTP requests to ttyd
        resp = requests.get(
            ttyd_url,
            params=request.args,
            headers={key: value for key, value in request.headers if key.lower() not in ['host', 'x-forwarded-for', 'x-real-ip']},
            timeout=30,
            stream=True
        )
        
        # Get response content and modify if it's HTML to fix WebSocket URLs and add debugging
        if 'text/html' in resp.headers.get('content-type', ''):
            content = resp.content.decode('utf-8')
            
            # Replace WebSocket URLs to point to our proxy instead of directly to ttyd
            content = content.replace('ws://localhost:8080/', f'ws://{request.host}/ws-proxy/')
            content = content.replace('wss://localhost:8080/', f'wss://{request.host}/ws-proxy/')
            
            # Add debugging script to check iframe load
            debug_script = '''
<script>
console.log("TTYD page loaded successfully");
window.addEventListener('load', function() {
    console.log("TTYD window loaded");
    // Try to send a message to parent
    try {
        if (window.parent) {
            window.parent.postMessage('ttyd-loaded', '*');
        }
    } catch(e) {
        console.log("Could not send message to parent:", e);
    }
});
</script>
</body>'''
            content = content.replace('</body>', debug_script)
            
            # Create proper response headers
            headers = dict(resp.headers)
            headers['Content-Length'] = str(len(content.encode('utf-8')))
            # Remove X-Frame-Options to allow iframe
            headers.pop('X-Frame-Options', None)
            # Add headers to allow iframe embedding
            headers['X-Frame-Options'] = 'SAMEORIGIN'
            
            return Response(
                content,
                status=resp.status_code,
                headers=headers
            )
        else:
            # Stream non-HTML content as before
            def generate():
                try:
                    for chunk in resp.iter_content(chunk_size=1024):
                        if chunk:
                            yield chunk
                except Exception as e:
                    logger.error(f"Error streaming ttyd response: {e}")
            
            # Remove X-Frame-Options from headers
            headers = dict(resp.headers)
            headers.pop('X-Frame-Options', None)
            
            return Response(
                generate(),
                status=resp.status_code,
                headers=headers
            )
        
    except requests.exceptions.ConnectionError:
        return jsonify({
            'error': 'Terminal service not available',
            'message': 'Please ensure ttyd is running on port 8080'
        }), 503
    except Exception as e:
        logger.error(f"Terminal proxy error: {e}")
        return jsonify({'error': str(e)}), 500

# WebSocket proxy for ttyd with command injection capability
from flask_socketio import emit, disconnect
import websocket as ws_client

@socketio.on('connect', namespace='/ws-proxy')
def handle_ws_connect():
    """Handle WebSocket connection from browser"""
    logger.info("Browser WebSocket connected to proxy")
    
    def on_ttyd_message(ws, message):
        """Forward messages from ttyd to browser"""
        try:
            if isinstance(message, str):
                emit('ttyd_output', {'data': message, 'type': 'text'}, namespace='/ws-proxy')
            else:
                emit('ttyd_output', {'data': message.decode('utf-8', errors='ignore'), 'type': 'binary'}, namespace='/ws-proxy')
        except Exception as e:
            logger.error(f"Error forwarding ttyd message: {e}")
    
    def on_ttyd_error(ws, error):
        logger.error(f"TTYD WebSocket error: {error}")
        disconnect(namespace='/ws-proxy')
    
    def on_ttyd_close(ws, close_status_code, close_msg):
        logger.info("TTYD WebSocket connection closed")
        disconnect(namespace='/ws-proxy')
    
    def on_ttyd_open(ws):
        global ttyd_websocket
        logger.info("Connected to TTYD WebSocket")
        ttyd_websocket = ws
        
        # Send any queued commands
        while command_queue:
            command = command_queue.pop(0)
            try:
                ws.send((command + '\n').encode('utf-8'), websocket.ABNF.OPCODE_BINARY)
                logger.info(f"Sent queued command: {command}")
            except Exception as e:
                logger.error(f"Error sending queued command: {e}")
    
    # Create WebSocket connection to ttyd
    try:
        ttyd_ws = ws_client.WebSocketApp(
            "ws://localhost:8080/ws",
            on_message=on_ttyd_message,
            on_error=on_ttyd_error,
            on_close=on_ttyd_close,
            on_open=on_ttyd_open
        )
        
        # Run in background thread
        import threading
        ws_thread = threading.Thread(target=ttyd_ws.run_forever, daemon=True)
        ws_thread.start()
        
    except Exception as e:
        logger.error(f"Failed to connect to ttyd: {e}")
        disconnect(namespace='/ws-proxy')

@socketio.on('browser_input', namespace='/ws-proxy')
def handle_browser_input(data):
    """Handle input from browser and forward to ttyd"""
    global ttyd_websocket
    
    try:
        if ttyd_websocket:
            if isinstance(data.get('data'), str):
                ttyd_websocket.send(data['data'].encode('utf-8'), websocket.ABNF.OPCODE_BINARY)
            else:
                ttyd_websocket.send(data.get('data', b''), websocket.ABNF.OPCODE_BINARY)
        else:
            logger.warning("No ttyd WebSocket connection available")
    except Exception as e:
        logger.error(f"Error forwarding browser input: {e}")

@socketio.on('disconnect', namespace='/ws-proxy')
def handle_ws_disconnect():
    """Handle WebSocket disconnection"""
    global ttyd_websocket
    logger.info("Browser disconnected from WebSocket proxy")
    if ttyd_websocket:
        try:
            ttyd_websocket.close()
        except:
            pass
        ttyd_websocket = None

@app.route('/terminal')
def terminal():
    """Terminal page with ttyd integration"""
    return render_template('terminal_ttyd.html')

@app.route('/send-command', methods=['POST'])
def send_command():
    """Send command to ttyd terminal via WebSocket"""
    try:
        data = request.get_json()
        command = data.get('command', '')
        add_newline = data.get('addNewline', True)  # Default to True for backward compatibility
        
        if not command:
            return jsonify({'success': False, 'error': 'No command provided'}), 400
        
        logger.info(f"Attempting to send command to ttyd: {command} (newline: {add_newline})")
        
        # Create a fresh WebSocket connection for each command to avoid session conflicts
        import websocket
        import threading
        import time
        
        success = False
        error_msg = None
        
        def on_open(ws):
            nonlocal success
            try:
                if add_newline:
                    # Send command with newline to execute immediately
                    binary_data = (command + '\n').encode('utf-8')
                    ws.send(binary_data, websocket.ABNF.OPCODE_BINARY)
                    logger.info(f"Sent command with newline: {command}")
                else:
                    # Send command character by character to simulate typing
                    logger.info(f"Typing command to prompt: {command}")
                    for char in command:
                        char_data = char.encode('utf-8')
                        ws.send(char_data, websocket.ABNF.OPCODE_BINARY)
                        time.sleep(0.05)  # Small delay between characters for realistic typing
                    logger.info(f"Command typed to prompt: {command}")
                
                success = True
                time.sleep(0.2)  # Brief delay to ensure delivery
                ws.close()
            except Exception as e:
                logger.error(f"Error sending command: {e}")
                ws.close()
        
        def on_error(ws, error):
            nonlocal error_msg
            error_msg = str(error)
            logger.error(f"WebSocket error: {error}")
        
        def on_close(ws, close_status_code, close_msg):
            logger.debug(f"WebSocket connection closed: {close_status_code}")
        
        # Create WebSocket connection to ttyd
        ws_url = "ws://localhost:8080/ws"
        ws = websocket.WebSocketApp(ws_url,
                                  on_open=on_open,
                                  on_error=on_error,
                                  on_close=on_close)
        
        # Run WebSocket in a separate thread with timeout
        ws_thread = threading.Thread(target=ws.run_forever)
        ws_thread.daemon = True
        ws_thread.start()
        
        # Wait for connection with timeout
        timeout = 3.0
        start_time = time.time()
        while ws_thread.is_alive() and (time.time() - start_time) < timeout:
            time.sleep(0.05)
        
        if success:
            action = "executed" if add_newline else "injected to prompt"
            return jsonify({'success': True, 'message': f'Command {action}: {command}'})
        else:
            return jsonify({'success': False, 'error': error_msg or 'Failed to connect to terminal'}), 500
            
    except Exception as e:
        logger.error(f"Send command error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/mcu-uart')
def mcu_uart():
    """MCU UART diagnostics page"""
    return render_template('mcuUART.html')

@app.route('/ping', methods=['GET'])
def ping():
    """Enhanced ping endpoint with detailed connection information"""
    try:
        from utils.ssh_interface import test_ssh_connection, get_connection_status

        ssh_result = test_ssh_connection()
        is_connected = ssh_result['success']
        error = ssh_result.get('error')
        conn_status = get_connection_status()

        response_data = {
            'status': 'success',
            'connected': is_connected,
            'connection_details': {
                'ssh_available': is_connected,
                'last_test': conn_status.get('timestamp', 0),
                'connection_count': 1,
                'cache_age': 0,
                'error': error if not is_connected else None
            }
        }

        if not is_connected:
            try:
                ping_response = subprocess.run(
                    ['ping', '-c', '1', os.getenv("SSH_HOST", "192.168.55.1")],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2
                )
                response_data['connection_details']['ping_available'] = ping_response.returncode == 0
            except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
                response_data['connection_details']['ping_available'] = False

        return jsonify(response_data)

    except Exception as e:
        logger.error(f"Ping endpoint error: {str(e)}")
        return jsonify({
            'status': 'error',
            'connected': False,
            'error': str(e)
        }), 500

@app.route('/connection_status', methods=['GET'])
def connection_status():
    """Enhanced endpoint for detailed connection status"""
    try:
        from utils.ssh_interface import get_connection_status, test_ssh_connection

        ssh_result = test_ssh_connection()
        is_connected = ssh_result['success']
        error = ssh_result.get('error')
        status_details = get_connection_status()

        return jsonify({
            'status': 'success',
            'connected': is_connected,
            'details': status_details,
            'error': error,
            'timestamp': time.time()
        })

    except Exception as e:
        logger.error(f"Connection status error: {str(e)}")
        return jsonify({
            'status': 'error',
            'connected': False,
            'error': str(e)
        }), 500

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        ssh_username = request.form.get('ssh_username')
        ssh_password = request.form.get('ssh_password')
        ssh_ip = request.form.get('ssh_ip', '192.168.55.1')

        # Create or update .env file
        with open('.env', 'w') as f:
            f.write(f"SSH_USERNAME={ssh_username}\n")
            f.write(f"SSH_PASSWORD={ssh_password}\n")
            f.write(f"SSH_HOST={ssh_ip}\n")

        # Reload environment variables
        load_dotenv(override=True)

        flash('Settings updated successfully', 'success')
        return redirect(url_for('index'))

    # GET request - show current settings
    ssh_username = os.getenv("SSH_USERNAME", "")
    ssh_ip = os.getenv("SSH_HOST", "192.168.55.1")

    return render_template('settings.html',
                           ssh_username=ssh_username,
                           ssh_ip=ssh_ip)

# === Diagnostic Test Routes ===
@app.route('/run_single_test', methods=['POST'])
def run_single_test():
    """Run a single diagnostic test with enhanced error handling"""
    test_name = request.form.get('test_script')
    if not test_name:
        return jsonify({
            'status': 'error',
            'output': 'No test script specified'
        }), 400

    test_path = f'diagnostics/{test_name}.py'

    if not os.path.exists(test_path):
        return jsonify({
            'status': 'error',
            'output': f"Test script not found: {test_name}"
        }), 404

    start_time = time.time()

    try:
        from utils.ssh_interface import run_ssh_command_with_connection_check

        logger.info(f"Running single test: {test_name}")

        result = subprocess.check_output(['python3', test_path],
                                         stderr=subprocess.STDOUT,
                                         timeout=120)
        output = result.decode()

        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)

        response_data = {
            'status': 'success',
            'output': output,
            'test': test_name,
            'execution_time': f"{elapsed_time}s",
            'test_count': 1
        }

        # Enhanced handling for specific test types
        if test_name == 'check_system':
            hostname_result = run_ssh_command_with_connection_check("hostnamectl")
            uptime_result = run_ssh_command_with_connection_check("uptime")
            interfaces_result = run_ssh_command_with_connection_check("ip a")
            mac_result = run_ssh_command_with_connection_check("cat /sys/class/net/wlan0/address")

            system_info = {
                'hwid': extract_hostname(hostname_result['output'] if hostname_result['success'] else ""),
                'uptime': extract_simplified_uptime(uptime_result['output'].strip() if uptime_result['success'] and uptime_result['output'] else "Unknown"),
                'ip': extract_wlan0_ip(interfaces_result['output'] if interfaces_result['success'] else ""),
                'mac': mac_result['output'].strip() if mac_result['success'] and mac_result['output'] else "Unknown",
                'refresh_time': time.strftime("%H:%M:%S"),
                'ssh_connected': all([hostname_result['success'], uptime_result['success'], interfaces_result['success']])
            }
            response_data['system_info'] = system_info

        elif test_name == 'check_battery':
            battery_info = extract_battery_info(output)
            response_data['battery_info'] = battery_info

        return jsonify(response_data)

    except subprocess.CalledProcessError as e:
        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)

        logger.error(f"Test {test_name} failed with exit code {e.returncode}")
        return jsonify({
            'status': 'error',
            'output': e.output.decode() if e.output else f"Test failed with exit code {e.returncode}",
            'test': test_name,
            'execution_time': f"{elapsed_time}s",
            'test_count': 1
        }), 500

    except subprocess.TimeoutExpired:
        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)

        logger.error(f"Test {test_name} timed out")
        return jsonify({
            'status': 'error',
            'output': f"Test timed out: {test_name}",
            'test': test_name,
            'execution_time': f"{elapsed_time}s",
            'test_count': 1
        }), 500

    except Exception as e:
        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)

        logger.error(f"Unexpected error in test {test_name}: {str(e)}")
        return jsonify({
            'status': 'error',
            'output': f"Unexpected error: {str(e)}",
            'test': test_name,
            'execution_time': f"{elapsed_time}s",
            'test_count': 1
        }), 500

@app.route('/run_full_diagnostics', methods=['POST'])
def run_full_diagnostics():
    """Run full diagnostic suite"""
    from utils.ssh_interface import run_ssh_command_with_connection_check
    
    start_time = time.time()
    
    try:
        logger.info("Starting full diagnostics suite")
        
        # System identification data
        hostname_result = run_ssh_command_with_connection_check("hostnamectl")
        uptime_result = run_ssh_command_with_connection_check("uptime")
        interfaces_result = run_ssh_command_with_connection_check("ip a")
        mac_result = run_ssh_command_with_connection_check("cat /sys/class/net/wlan0/address")
        
        ssh_success = all([hostname_result['success'], uptime_result['success'], interfaces_result['success'], mac_result['success']])
        hwid = extract_hostname(hostname_result['output'] if hostname_result['success'] else "")
        full_uptime = uptime_result['output'].strip() if uptime_result['success'] and uptime_result['output'] else "Unknown"
        uptime = extract_simplified_uptime(full_uptime)
        ip = extract_wlan0_ip(interfaces_result['output'] if interfaces_result['success'] else "")
        mac_address = mac_result['output'].strip() if mac_result['success'] and mac_result['output'] else "Unknown"
        
        # Create summary report
        summary = [
            "[SYSTEM IDENTITY]",
            f"SSH Connection: {'✅ Connected' if ssh_success else '❌ Disconnected'}",
            f"HWID: {hwid}",
            f"Uptime: {uptime}",
            f"WLAN0 IP: {ip}",
            f"MAC Address: {mac_address}",
            ""
        ]
        
        # Run diagnostic tests
        tests = [
            'check_battery', 'check_power', 'check_network', 'check_sim', 'check_logs', 'check_system',
            'check_storage', 'check_memory', 'check_interfaces', 'check_modem',
            'check_i2c', 'check_usb', 'check_camera', 'check_thermals',
            'check_cpuinfo', 'check_memory_extended', 'check_disk_health', 'check_dmesg_critical',
            'check_board_variant'
        ]
        
        test_results = {}
        issues_detected = []
        test_count = 0
        battery_info = None
        
        system_info = {
            'hwid': hwid,
            'ip': ip,
            'uptime': uptime,
            'mac': mac_address,
            'refresh_time': time.strftime("%H:%M:%S"),
            'ssh_connected': ssh_success
        }
        
        summary.append("[DIAGNOSTIC TEST RESULTS]")
        
        for test in tests:
            test_path = f'diagnostics/{test}.py'
            if not os.path.exists(test_path):
                summary.append(f"❌ {test}: script not found.")
                test_results[test] = {"status": "error", "output": "Script not found"}
                issues_detected.append(f"Missing test script: {test}")
                continue
            
            test_count += 1
            try:
                logger.info(f"Running diagnostic test: {test}")
                result = subprocess.check_output(['python3', test_path], stderr=subprocess.STDOUT, timeout=60)
                output = result.decode()
                
                # Extract battery info if this is battery test
                if test == 'check_battery':
                    battery_info = extract_battery_info(output)
                
                # Check for warning keywords in the output
                if any(keyword in output.lower() for keyword in ['warning', 'caution', 'attention', 'critical']):
                    status_icon = "⚠️"
                    test_results[test] = {"status": "warning", "output": output}
                    
                    warning_lines = [line.strip() for line in output.split('\n')
                                     if any(keyword in line.lower() for keyword in ['warning', 'caution', 'attention', 'critical'])]
                    if warning_lines:
                        issues_detected.append(f"Warning in {test}: {warning_lines[0]}")
                else:
                    status_icon = "✅"
                    test_results[test] = {"status": "success", "output": output}
                
                summary.append(f"{status_icon} {test}: OK")
                
            except subprocess.CalledProcessError as e:
                output = e.output.decode() if e.output else f"Test failed with exit code {e.returncode}"
                summary.append(f"❌ {test}: {output}")
                test_results[test] = {"status": "error", "output": output}
                issues_detected.append(f"Error in {test}: {output}")
                
            except subprocess.TimeoutExpired:
                summary.append(f"⚠️ {test}: Test timed out.")
                test_results[test] = {"status": "timeout", "output": "Test timed out"}
                issues_detected.append(f"Timeout in {test}: Test did not complete in the allowed time")
                
            except Exception as e:
                error_msg = f"Unexpected error: {str(e)}"
                summary.append(f"❌ {test}: {error_msg}")
                test_results[test] = {"status": "error", "output": error_msg}
                issues_detected.append(f"Error in {test}: {error_msg}")
        
        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)
        
        # Add final summary
        summary.append(f"\n[DIAGNOSTICS SUMMARY]")
        summary.append(f"• SSH Connection: {'Available' if ssh_success else 'Unavailable'}")
        summary.append(f"• Total tests run: {test_count}")
        summary.append(f"• Execution time: {elapsed_time} seconds")
        summary.append(f"• Issues detected: {len(issues_detected)}")
        
        if issues_detected:
            summary.append("\nIssues that need attention:")
            for i, issue in enumerate(issues_detected, 1):
                summary.append(f"{i}. {issue}")
        
        response_data = {
            'status': 'success',
            'output': "\n".join(summary),
            'system_info': system_info,
            'test_results': test_results,
            'execution_time': f"{elapsed_time}s",
            'test_count': test_count,
            'issues': issues_detected,
            'ssh_connected': ssh_success
        }
        
        # Add battery info if available
        if battery_info:
            response_data['battery_info'] = battery_info
        
        logger.info(f"Full diagnostics completed in {elapsed_time}s with {len(issues_detected)} issues")
        return jsonify(response_data)
        
    except Exception as e:
        end_time = time.time()
        elapsed_time = round(end_time - start_time, 2)
        
        error_message = f"Critical error during full diagnostics: {str(e)}"
        logger.error(error_message)
        
        return jsonify({
            'status': 'error',
            'output': error_message,
            'execution_time': f"{elapsed_time}s",
            'test_count': 0,
            'issues': [error_message],
            'ssh_connected': False
        }), 500

# === Legacy Terminal Socket.IO Handlers (Removed - Using ttyd) ===
# All terminal-related Socket.IO handlers have been removed since we now use ttyd
# which provides a more stable and reliable web terminal experience.

# Error handlers
@app.errorhandler(404)
def not_found_error(error):
    _ = error  # Suppress unused parameter warning
    return jsonify({'status': 'error', 'message': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    _ = error  # Suppress unused parameter warning
    return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

# Cleanup on exit (ttyd handles its own cleanup)
import atexit

def cleanup_on_exit():
    """Clean up resources on server shutdown"""
    try:
        logger.info("V3 Diagnostics Tool shutting down cleanly")
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")

atexit.register(cleanup_on_exit)

if __name__ == '__main__':
    logger.info("Starting V3 Diagnostics Tool server...")
    socketio.run(app, debug=False, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)