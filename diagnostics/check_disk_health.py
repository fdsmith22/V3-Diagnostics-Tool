import sys, os, re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("SMART Disk Health:\n")

# Get all disk devices
lsblk_result = run_ssh_command("lsblk -dno NAME")
if not lsblk_result['success']:
    print(f"❌ Error getting disk devices: {lsblk_result['stderr']}")
    exit(1)

lsblk_output = lsblk_result['output']
device_list = [line.strip() for line in lsblk_output.splitlines() if line.strip()]
unique_devices = set(f"/dev/{dev}" for dev in device_list)

# Run smartctl on each and summarize result
for device in unique_devices:
    print(f"Device: {device}")
    smart_result = run_ssh_command(f"sudo smartctl -H {device}")
    
    if not smart_result['success']:
        print(f"❌ Error running smartctl: {smart_result['stderr']}\n")
        continue
        
    output = smart_result['output']
    if "PASSED" in output:
        print("✅ Health: PASSED\n")
    elif "FAILED" in output:
        print("❌ Health: FAILED\n")
    elif "Unable to detect device type" in output:
        print("⚠️ Unsupported or virtual device\n")
    else:
        match = re.search(r'SMART overall-health self-assessment test result:\s*(.+)', output)
        if match:
            print(f"⚠️ Health: {match.group(1)}\n")
        else:
            print("⚠️ SMART data unavailable or malformed\n")
