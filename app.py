import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import subprocess
import os
import pty
import select
import threading
import re
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
socketio = SocketIO(app)

# === Device Ping Check ===
def check_device_connection():
    try:
        response = subprocess.run(
            ['ping', '-c', '1', os.getenv("SSH_IP", "192.168.55.1")],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        return response.returncode == 0
    except Exception:
        return False

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

@app.route('/run_full_diagnostics')
def run_full_diagnostics():
    from utils.ssh_interface import run_ssh_command
    import re

    id_info = run_ssh_command("hostnamectl && uptime && ip addr show")
    hwid, uptime, ip = "Unknown", "Unknown", "Unavailable"

    for line in id_info.splitlines():
        if "Static hostname:" in line:
            hwid = line.split(":")[1].strip()
        elif "up" in line and "load average" in line:
            uptime = line.strip()
        elif "inet " in line and not "127.0.0.1" in line and not "192.168.55." in line:
            candidate = line.strip().split()[1].split('/')[0]
            if candidate.startswith("192.") or candidate.startswith("10.") or candidate.startswith("172."):
                ip = candidate

    summary = [f"[IDENTITY]", f"HWID: {hwid}", f"Uptime: {uptime}", f"IP: {ip}", ""]

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

    mac_address_output = run_ssh_command("cat /sys/class/net/eth0/address")
    mac_address = mac_address_output.strip().split()[-1] if mac_address_output else "Unavailable"

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

    # === Run Diagnostics Scripts ===
    tests = [
        'check_power', 'check_network', 'check_sim', 'check_logs', 'check_system',
        'check_storage', 'check_memory', 'check_interfaces', 'check_modem',
        'check_i2c', 'check_usb', 'check_camera', 'check_thermals',
        'check_cpuinfo', 'check_memory_extended', 'check_disk_health', 'check_dmesg_critical'
    ]

    for test in tests:
        test_path = f'diagnostics/{test}.py'
        if not os.path.exists(test_path):
            summary.append(f"❌ {test}: script not found.")
            continue
        try:
            result = subprocess.check_output(['python3', test_path], stderr=subprocess.STDOUT, timeout=60)
            summary.append(f"✅ {test}:\n{result.decode()}")
        except subprocess.CalledProcessError as e:
            summary.append(f"❌ {test}:\n{e.output.decode()}")
        except subprocess.TimeoutExpired:
            summary.append(f"⚠️ {test}: Test timed out.")

    return jsonify({
        'status': 'success',
        'output': "\n\n".join(summary),
        'cameraDetails': camera_details,
        'hwid': hwid,
        'ip': ip,
        'uptime': uptime,
        'macAddress': mac_address
    })

# === Socket.IO Terminal Handler ===

terminal_sessions = {}

@socketio.on('start_terminal')
def handle_terminal_start():
    sid = request.sid

    ssh_user = os.getenv("SSH_USER", "ubuntu")
    ssh_host = os.getenv("SSH_IP", "192.168.55.1")
    ssh_pass = os.getenv("SSH_PASSWORD")

    subprocess.run(["ssh-keygen", "-R", ssh_host], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

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

    terminal_sessions[sid] = fd

    def read_and_emit():
        while True:
            try:
                data_ready, _, _ = select.select([fd], [], [], 0.1)
                if fd in data_ready:
                    output = os.read(fd, 1024).decode(errors='ignore')
                    socketio.emit('terminal_output', output, to=sid)
            except OSError:
                break

    threading.Thread(target=read_and_emit, daemon=True).start()


@socketio.on('terminal_input')
def handle_terminal_input(data):
    fd = terminal_sessions.get(request.sid)
    if fd:
        os.write(fd, data.encode())

if __name__ == '__main__':
    socketio.run(app, debug=True)
