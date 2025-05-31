from gevent import monkey

monkey.patch_all()

from flask import Flask, render_template, jsonify, request, flash, redirect, url_for
from flask_socketio import SocketIO, emit
import subprocess
import os
import pty
import select
import threading
import re
import json
import time
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "diagnostic-tool-secret-key")
# Update Socket.IO configuration with correct parameters for v5.x
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='gevent',
    logger=True,
    engineio_logger=True,
    ping_timeout=60
)


# === Device Ping Check ===
def check_device_connection():
    try:
        response = subprocess.run(
            ['ping', '-c', '1', os.getenv("SSH_IP", "192.168.55.1")],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2
        )
        return response.returncode == 0
    except Exception:
        return False


def extract_simplified_uptime(uptime_str):
    """Extract just the time and uptime duration from the full uptime string"""
    uptime_match = re.search(r'(\d+:\d+:\d+)\s+up\s+([^,]+)', uptime_str)
    if uptime_match:
        time = uptime_match.group(1)
        duration = uptime_match.group(2).strip()
        return f"{time} up {duration}"
    return uptime_str  # Return original if pattern not found


def extract_wlan0_ip(interfaces_output):
    """Extract the WLAN0 IP address (192.168.x.x) from interfaces output"""
    wlan0_section = re.search(r'wlan0:.*?(?=^\d|\Z)', interfaces_output, re.DOTALL | re.MULTILINE)
    if wlan0_section:
        ip_match = re.search(r'inet\s+(192\.168\.\d+\.\d+)', wlan0_section.group(0))
        if ip_match:
            return ip_match.group(1)
    return "Not connected"  # Return default message if IP not found


def extract_hostname(system_output):
    """Extract the hardware-xxxx hostname from system output"""
    # First try to find Static hostname
    hostname_match = re.search(r'Static hostname:\s+(hardware-\d+)', system_output)
    if hostname_match:
        return hostname_match.group(1)

    # If not found, try to extract from Linux hostname line
    linux_match = re.search(r'Linux (hardware-\d+)', system_output)
    if linux_match:
        return linux_match.group(1)

    # If not found in either place, look for Machine ID
    machine_id_match = re.search(r'Machine ID:\s+([a-f0-9]+)', system_output)
    if machine_id_match:
        return machine_id_match.group(1)

    return "Unknown"  # Return default if not found


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/terminal')
def terminal():
    return render_template('terminal.html')


@app.route('/ping', methods=['GET'])
def ping():
    is_connected = check_device_connection()
    return jsonify({'status': 'success', 'connected': is_connected})


@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        # Update settings
        ssh_username = request.form.get('ssh_username')
        ssh_password = request.form.get('ssh_password')
        ssh_ip = request.form.get('ssh_ip', '192.168.55.1')

        # Create or update .env file
        with open('.env', 'w') as f:
            f.write(f"SSH_USER={ssh_username}\n")
            f.write(f"SSH_PASSWORD={ssh_password}\n")
            f.write(f"SSH_IP={ssh_ip}\n")

        # Reload environment variables
        load_dotenv(override=True)

        flash('Settings updated successfully', 'success')
        return redirect(url_for('index'))

    # GET request - show current settings
    ssh_username = os.getenv("SSH_USER", "")
    ssh_ip = os.getenv("SSH_IP", "192.168.55.1")

    return render_template('settings.html',
                           ssh_username=ssh_username,
                           ssh_ip=ssh_ip)


@app.route('/run_test/<test_name>')
def run_single_test(test_name):
    """Run a single diagnostic test"""
    test_path = f'diagnostics/{test_name}.py'

    if not os.path.exists(test_path):
        return jsonify({
            'status': 'error',
            'output': f"Test script not found: {test_name}"
        })

    try:
        from utils.ssh_interface import run_ssh_command
        result = subprocess.check_output(['python3', test_path],
                                         stderr=subprocess.STDOUT,
                                         timeout=30)
        output = result.decode()

        # If running system check, extract simplified data for the dashboard
        if test_name == 'check_system':
            system_data = {}

            # Get system info for the dashboard
            system_output = run_ssh_command("hostnamectl")
            uptime_output = run_ssh_command("uptime")
            interfaces_output = run_ssh_command("ip a")
            mac_address_output = run_ssh_command("cat /sys/class/net/wlan0/address")

            system_data['hwid'] = extract_hostname(system_output)
            system_data['uptime'] = extract_simplified_uptime(uptime_output)
            system_data['ip'] = extract_wlan0_ip(interfaces_output)
            system_data['macAddress'] = mac_address_output.strip() if mac_address_output else "Unknown"

            return jsonify({
                'status': 'success',
                'output': output,
                'test': test_name,
                'systemData': system_data
            })

        return jsonify({
            'status': 'success',
            'output': output,
            'test': test_name
        })
    except subprocess.CalledProcessError as e:
        return jsonify({
            'status': 'error',
            'output': e.output.decode(),
            'test': test_name
        })
    except subprocess.TimeoutExpired:
        return jsonify({
            'status': 'error',
            'output': f"Test timed out: {test_name}",
            'test': test_name
        })


@app.route('/run_full_diagnostics')
def run_full_diagnostics():
    from utils.ssh_interface import run_ssh_command
    import re

    start_time = time.time()

    # System identification data
    system_output = run_ssh_command("hostnamectl")
    uptime_output = run_ssh_command("uptime")
    interfaces_output = run_ssh_command("ip a")
    mac_address_output = run_ssh_command("cat /sys/class/net/wlan0/address")

    # Extract specific information
    hwid = extract_hostname(system_output)
    full_uptime = uptime_output.strip() if uptime_output else "Unknown"
    uptime = extract_simplified_uptime(full_uptime)
    ip = extract_wlan0_ip(interfaces_output)
    mac_address = mac_address_output.strip() if mac_address_output else "Unknown"

    # Create summary report
    summary = [
        f"[SYSTEM IDENTITY]",
        f"HWID: {hwid}",
        f"Uptime: {uptime}",
        f"WLAN0 IP: {ip}",
        f"MAC Address: {mac_address}",
        ""
    ]

    # Camera detection logic
    camera_check_output = run_ssh_command("v4l2-ctl --list-devices")
    camera_status_report = camera_check_output.strip()
    camera_details = []

    if "video" in camera_status_report:
        for line in camera_check_output.splitlines():
            if 'vi-output' in line.lower():
                csi_port = line.split("platform:tegra-capture-vi:")[-1]
                camera_details.append(f"IMX462 camera on CSI port {csi_port}.")

    if camera_details:
        summary.append(f"✅ Detected IMX462 camera(s) on CSI port(s): {', '.join(camera_details)}")
    else:
        summary.append("❌ No IMX462 cameras detected.")

    # === Modem and SIM Check ===
    modem_check_output = run_ssh_command("sudo mmcli -L")
    if "No modems were found" in modem_check_output:
        summary.append("❌ No modem found.")
    elif "ModemManager is not running" in modem_check_output:
        summary.append("❌ ModemManager service is not active.")
    elif "error" in modem_check_output.lower():
        summary.append(f"❌ Error communicating with modem.\n{modem_check_output}")
    elif "/Modem/" in modem_check_output:
        modem_path_match = re.search(r'/org/freedesktop/ModemManager1/Modem/\d+', modem_check_output)
        modem_path = modem_path_match.group(0) if modem_path_match else None

        if modem_path:
            sim_status = run_ssh_command(f"sudo mmcli -m {modem_path} --signal-get")
            if "error" in sim_status.lower() or "failed" in sim_status.lower():
                summary.append(f"⚠️ Modem detected, but signal query failed:\n{sim_status}")
            elif "SIM" in sim_status and ("signal" in sim_status.lower() or "access tech" in sim_status.lower()):
                summary.append(f"✅ SIM detected with signal: {sim_status}")
            elif "no sim" in sim_status.lower() or "absent" in sim_status.lower():
                summary.append("❌ SIM not inserted.")
            else:
                summary.append(f"⚠️ Modem detected but SIM status unclear: {sim_status}")
        else:
            summary.append("⚠️ Could not parse modem path from output:\n" + modem_check_output)
    else:
        summary.append("⚠️ Could not determine SIM or modem status:\n" + modem_check_output)

    # === Run Diagnostics Scripts with enhanced logging ===
    tests = [
        'check_battery', 'check_power', 'check_network', 'check_sim', 'check_logs', 'check_system',
        'check_storage', 'check_memory', 'check_interfaces', 'check_modem',
        'check_i2c', 'check_usb', 'check_camera', 'check_thermals',
        'check_cpuinfo', 'check_memory_extended', 'check_disk_health', 'check_dmesg_critical'
    ]

    test_results = {}
    issues_detected = []
    test_count = 0

    summary.append("\n[DIAGNOSTIC TEST RESULTS]")

    for test in tests:
        test_path = f'diagnostics/{test}.py'
        if not os.path.exists(test_path):
            summary.append(f"❌ {test}: script not found.")
            test_results[test] = {"status": "error", "output": "Script not found"}
            issues_detected.append(f"Missing test script: {test}")
            continue

        test_count += 1
        try:
            result = subprocess.check_output(['python3', test_path], stderr=subprocess.STDOUT, timeout=60)
            output = result.decode()

            # Check for warning keywords in the output
            if any(keyword in output.lower() for keyword in ['warning', 'caution', 'attention']):
                status_icon = "⚠️"
                test_results[test] = {"status": "warning", "output": output}

                # Extract warning lines for the issues list
                warning_lines = [line.strip() for line in output.split('\n')
                                 if any(keyword in line.lower() for keyword in ['warning', 'caution', 'attention'])]
                if warning_lines:
                    issues_detected.append(f"Warning in {test}: {warning_lines[0]}")
            else:
                status_icon = "✅"
                test_results[test] = {"status": "success", "output": output}

            # Add a more detailed summary with categorized output
            summary.append(f"{status_icon} {test}:")

            # Format the output more nicely
            formatted_lines = []
            for line in output.strip().split("\n"):
                if line.strip():  # Skip empty lines
                    if ":" in line and not line.startswith(" "):
                        formatted_lines.append(f"  • {line.strip()}")
                    else:
                        formatted_lines.append(f"    {line.strip()}")

            summary.append("\n".join(formatted_lines))
            summary.append("")  # Add an empty line for readability

        except subprocess.CalledProcessError as e:
            output = e.output.decode()
            summary.append(f"❌ {test}:\n{output}")
            test_results[test] = {"status": "error", "output": output}

            # Extract error message for the issues list
            error_lines = output.strip().split('\n')
            if error_lines:
                issues_detected.append(f"Error in {test}: {error_lines[0]}")
            else:
                issues_detected.append(f"Error in {test}: Test failed with code {e.returncode}")

        except subprocess.TimeoutExpired:
            summary.append(f"⚠️ {test}: Test timed out.")
            test_results[test] = {"status": "timeout", "output": "Test timed out"}
            issues_detected.append(f"Timeout in {test}: Test did not complete in the allowed time")

    end_time = time.time()
    elapsed_time = round(end_time - start_time, 2)

    # Add a final summary section
    summary.append("\n[DIAGNOSTICS SUMMARY]")
    summary.append(f"• Total tests run: {test_count}")
    summary.append(f"• Execution time: {elapsed_time} seconds")
    summary.append(f"• Issues detected: {len(issues_detected)}")

    if issues_detected:
        summary.append("\nIssues that need attention:")
        for i, issue in enumerate(issues_detected, 1):
            summary.append(f"{i}. {issue}")

    return jsonify({
        'status': 'success',
        'output': "\n".join(summary),
        'cameraDetails': camera_details,
        'hwid': hwid,
        'ip': ip,
        'uptime': uptime,
        'macAddress': mac_address,
        'testResults': test_results,
        'elapsedTime': elapsed_time,
        'testCount': test_count,
        'issuesDetected': issues_detected
    })


# === Socket.IO Terminal Handler ===

terminal_sessions = {}


@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on('start_terminal')
def handle_terminal_start():
    sid = request.sid
    print(f"Starting terminal session for client: {sid}")

    ssh_user = os.getenv("SSH_USER", "ubuntu")
    ssh_host = os.getenv("SSH_IP", "192.168.55.1")
    ssh_pass = os.getenv("SSH_PASSWORD")

    if not ssh_pass:
        emit('terminal_output', "Error: SSH password not configured. Please visit the settings page.")
        return

    subprocess.run(["ssh-keygen", "-R", ssh_host], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        pid, fd = pty.fork()
        if pid == 0:
            os.execvpe("sshpass", [
                "sshpass", "-p", ssh_pass,
                "ssh",
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "LogLevel=ERROR",
                f"{ssh_user}@{ssh_host}"
            ], os.environ)
    except Exception as e:
        emit('terminal_output', f"Error: Could not start terminal session: {str(e)}")
        return

    terminal_sessions[sid] = fd
    print(f"Terminal session created with fd: {fd}")

    def read_and_emit():
        while True:
            try:
                data_ready, _, _ = select.select([fd], [], [], 0.1)
                if fd in data_ready:
                    output = os.read(fd, 1024).decode(errors='ignore')
                    socketio.emit('terminal_output', output, to=sid)
            except OSError:
                break
            except Exception as e:
                socketio.emit('terminal_output', f"\nError in terminal session: {str(e)}", to=sid)
                break

    threading.Thread(target=read_and_emit, daemon=True).start()


@socketio.on('terminal_input')
def handle_terminal_input(data):
    sid = request.sid
    fd = terminal_sessions.get(sid)
    if fd:
        try:
            os.write(fd, data.encode())
        except Exception as e:
            emit('terminal_output', f"\nError sending command: {str(e)}")
    else:
        print(f"No terminal session found for client: {sid}")


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    print(f"Client disconnected: {sid}")
    if sid in terminal_sessions:
        try:
            os.close(terminal_sessions[sid])
            print(f"Terminal session closed for client: {sid}")
        except OSError:
            pass
        del terminal_sessions[sid]


if __name__ == '__main__':
    # Add debug and allow_unsafe_werkzeug=True for development
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)