import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Memory Summary:")
result1 = run_ssh_command("free -h")
if result1['success']:
    print(result1['output'])
else:
    print(f"❌ Error: {result1['stderr']}")

print("\nDetailed Memory Info:")
result2 = run_ssh_command("cat /proc/meminfo | head -n 20")
if result2['success']:
    print(result2['output'])
else:
    print(f"❌ Error: {result2['stderr']}")
