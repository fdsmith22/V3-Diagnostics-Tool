import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Modem Info:")
print(run_ssh_command("sudo mmcli -L && sudo mmcli -m 0 && sudo mmcli -i 0 && sudo mmcli -m 0 --signal"))
