import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("I2C Devices:")
result = run_ssh_command("i2cdetect -y 1")
if result['success']:
    print(result['output'])
else:
    print(f"❌ Error: {result['stderr']}")
