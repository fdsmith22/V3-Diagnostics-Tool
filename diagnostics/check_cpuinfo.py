import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("CPU Load:")

# Get CPU load section from top
top_output = run_ssh_command("top -bn1 | head -n 15")
if "Error" in top_output:
    print(top_output)
else:
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
cpu_model_output = run_ssh_command("cat /proc/cpuinfo | grep -m1 'model name'")
if not cpu_model_output.strip():
    # For ARM-based systems, fallback to 'Hardware'
    cpu_model_output = run_ssh_command("cat /proc/cpuinfo | grep -m1 'Hardware'")

print("🧠 " + cpu_model_output.strip())
