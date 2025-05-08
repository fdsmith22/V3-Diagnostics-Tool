import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("I2C Devices:")
print(run_ssh_command("i2cdetect -y 1"))
