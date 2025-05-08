import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Memory Summary:")
print(run_ssh_command("free -h"))

print("\nDetailed Memory Info:")
print(run_ssh_command("cat /proc/meminfo | head -n 20"))
