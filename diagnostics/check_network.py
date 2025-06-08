import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Checking network interfaces on remote sensor...")
result = run_ssh_command("nmcli device")
if result['success']:
    print(result['output'])
else:
    print(f"❌ Error: {result['stderr']}")
