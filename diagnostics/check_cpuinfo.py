import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("CPU Load:")

# Get CPU load section from top
top_result = run_ssh_command("top -bn1 | head -n 15")
if not top_result['success']:
    print(f"❌ Error getting CPU load: {top_result['stderr']}")
else:
    top_output = top_result['output']
    # Extract key metrics
    top_lines = top_output.strip().splitlines()
    for line in top_lines:
        if "load average:" in line:
            print("🔁 " + line.strip())  # load avg
        elif "%Cpu(s):" in line:
            print("⚙️  " + line.strip())  # CPU usage breakdown
        elif "COMMAND" in line:
            print("\nTop Processes:")
        elif "polkitd" in line or "top" in line or "systemd" in line or "Network" in line or "%CPU" in line:
            print(line.strip())

# CPU model
print("\nCPU Info:")
cpu_result = run_ssh_command("cat /proc/cpuinfo | grep -m1 'model name'")
if cpu_result['success'] and cpu_result['output'].strip():
    print("🧠 " + cpu_result['output'].strip())
else:
    # For ARM-based systems, fallback to 'Hardware'
    hardware_result = run_ssh_command("cat /proc/cpuinfo | grep -m1 'Hardware'")
    if hardware_result['success']:
        print("🧠 " + hardware_result['output'].strip())
    else:
        print(f"❌ Error getting CPU info: {cpu_result['stderr']}")
