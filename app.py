from flask import Flask, render_template, jsonify
import subprocess
import os
import socket
import threading

app = Flask(__name__)

# Function to check device connection
def check_device_connection():
    try:
        # Simple ping test to check if the device is reachable
        response = subprocess.run(
            ['ping', '-c', '1', '192.168.55.1'],  # Replace with your device's IP
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        if response.returncode == 0:
            return True  # Device is reachable
        else:
            return False  # Device is unreachable
    except Exception as e:
        return False  # Exception occurred, device is unreachable

# Route to check if the device is reachable
@app.route('/ping', methods=['GET'])
def ping():
    # You can call the check_device_connection function to check connectivity
    is_connected = check_device_connection()
    return jsonify({'status': 'success', 'connected': is_connected})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/run_full_diagnostics')
def run_full_diagnostics():
    from utils.ssh_interface import run_ssh_command  # ensure local import

    # Pull identifier info
    id_info = run_ssh_command("hostnamectl && uptime && hostname -I")
    hwid = "Unknown"
    uptime = "Unknown"
    ip = "Unavailable"

    for line in id_info.splitlines():
        if "Static hostname:" in line:
            hwid = line.split(":")[1].strip()
        elif "up" in line and "load average" in line:
            uptime = line.strip()
        elif line.strip() and line[0].isdigit():
            ip = line.strip().split()[0]

    summary = [
        f"[IDENTITY]",
        f"HWID: {hwid}",
        f"Uptime: {uptime}",
        f"IP: {ip}",
        ""
    ]

    # Fetch Camera Status:
    camera_check_output = run_ssh_command("v4l2-ctl --list-devices")
    camera_status_report = camera_check_output.strip()  # Get the exact camera report

    # Initialize camera details
    camera_details = []

    if "video" in camera_status_report:  # Check if there is any valid camera output
        # Process camera details (CSI ports)
        for line in camera_check_output.splitlines():
            if 'vi-output' in line.lower():  # Look for the specific camera model (IMX462)
                csi_port = line.split("platform:tegra-capture-vi:")[-1]
                camera_details.append(f"IMX462 camera on CSI port {csi_port}.")

    # Add camera status to summary
    if camera_details:
        summary.append(f"✅ Detected IMX462 camera(s) on CSI port(s): {', '.join(camera_details)}")
    else:
        summary.append("❌ No IMX462 cameras detected.")

    # Fetch MAC Address
    mac_address_output = run_ssh_command("cat /sys/class/net/eth0/address")
    mac_address = mac_address_output.strip() if mac_address_output else "Unavailable"
    mac_address = mac_address.split()[-1]  # Ensure we only get the MAC address

    # Fetch SIM and Modem Status
    modem_check_output = run_ssh_command("sudo mmcli -L")
    if "No modems were found" in modem_check_output:
        summary.append("❌ No modem found.")
    elif "ModemManager is not running" in modem_check_output:
        summary.append("❌ ModemManager service is not active.")
    elif "error" in modem_check_output.lower():
        summary.append(f"❌ Error communicating with modem.\n{modem_check_output}")
    elif "/Modem/" in modem_check_output:
        modem_path = modem_check_output.strip().split()[-1]
        sim_status = run_ssh_command(f"sudo mmcli -m {modem_path} --location-get --signal")
        if "SIM" in sim_status and ("signal" in sim_status.lower() or "access tech" in sim_status.lower()):
            summary.append(f"✅ SIM detected with signal: {sim_status}")
        elif "no sim" in sim_status.lower() or "absent" in sim_status.lower():
            summary.append("❌ SIM not inserted.")
        else:
            summary.append(f"⚠️ Modem detected but SIM status unclear: {sim_status}")
    else:
        summary.append("⚠️ Could not determine SIM or modem status.\n" + modem_check_output)

    tests = [
        'check_power',
        'check_network',
        'check_sim',
        'check_logs',
        'check_system',
        'check_storage',
        'check_memory',
        'check_interfaces',
        'check_modem',
        'check_i2c',
        'check_usb',
        'check_camera',
        'check_thermals',
        'check_cpuinfo',
        'check_memory_extended',
        'check_disk_health',
        'check_dmesg_critical'       
    ]

    # Running tests with timeout
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

    # Return the full summary and camera check output for frontend
    return jsonify({
        'status': 'success', 
        'output': "\n\n".join(summary), 
        'cameraDetails': camera_details,  # Send filtered camera details (CSI port info)
        'hwid': hwid, 
        'ip': ip, 
        'uptime': uptime, 
        'macAddress': mac_address
    })


if __name__ == '__main__':
    app.run(debug=True)
