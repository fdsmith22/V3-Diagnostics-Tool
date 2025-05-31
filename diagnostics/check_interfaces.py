import sys, os
import re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def get_wlan0_ip():
    # Get network interface information
    interfaces_info = run_ssh_command("ip a")

    # Extract the WLAN0 IP address using regex
    wlan0_ip = "Not connected"

    # Look for wlan0 section and find the inet address (192.168.x.x)
    wlan0_section = re.search(r'wlan0:.*?(?=^\d|\Z)', interfaces_info, re.DOTALL | re.MULTILINE)
    if wlan0_section:
        ip_match = re.search(r'inet\s+(192\.168\.\d+\.\d+)', wlan0_section.group(0))
        if ip_match:
            wlan0_ip = ip_match.group(1)

    return wlan0_ip

# Get and print the WLAN0 IP address
wlan0_ip = get_wlan0_ip()
print(f"Network Interfaces:")
print(f"WLAN0 IP Address: {wlan0_ip}")