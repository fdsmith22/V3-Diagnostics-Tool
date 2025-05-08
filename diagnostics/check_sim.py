import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Checking SIM card...")

# Step 1: Check for modems
output = run_ssh_command("sudo mmcli -L")  # Avoiding echo $SSH_PASSWORD and sudo -S

if "No modems were found" in output:
    print("❌ No modem found.")
elif "ModemManager is not running" in output:
    print("❌ ModemManager service is not active.")
elif "error" in output.lower():
    print("❌ Error communicating with modem.\n" + output)
elif "/Modem/" in output:
    modem_path = output.strip().split()[-1]
    # Step 2: Check SIM and signal
    sim_output = run_ssh_command(f"sudo mmcli -m {modem_path} --location-get --signal")
    if "SIM" in sim_output and ("signal" in sim_output.lower() or "access tech" in sim_output.lower()):
        print("✅ SIM detected with signal:")
        print(sim_output)
    elif "no sim" in sim_output.lower() or "absent" in sim_output.lower():
        print("❌ Modem detected but SIM not inserted.")
        # Add SIM not detected issue
        print("❌ SIM not inserted.")
    else:
        print("⚠️ Modem detected but SIM status unclear:")
        print(sim_output)
else:
    print("⚠️ Could not determine SIM or modem status.\n" + output)
