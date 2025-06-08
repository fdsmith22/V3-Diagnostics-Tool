import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Critical Kernel Logs:")
result = run_ssh_command("echo $SSH_PASSWORD | sudo -S dmesg | grep -iE 'fail|error|critical' | tail -n 30")
if result['success']:
    print(result['output'])
else:
    print(f"❌ Error: {result['stderr']}")
