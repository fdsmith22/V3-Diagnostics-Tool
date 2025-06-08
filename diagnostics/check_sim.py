import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Checking SIM card...")

# Step 1: Check for modems
modem_result = run_ssh_command("sudo mmcli -L")  # Avoiding echo $SSH_PASSWORD and sudo -S

if not modem_result['success']:
    print(f"❌ Error checking modems: {modem_result['stderr']}")
elif "No modems were found" in modem_result['output']:
    print("❌ No modem found.")
elif "ModemManager is not running" in modem_result['output']:
    print("❌ ModemManager service is not active.")
elif "error" in modem_result['output'].lower():
    print("❌ Error communicating with modem.\n" + modem_result['output'])
elif "/Modem/" in modem_result['output']:
    modem_path = modem_result['output'].strip().split()[-1]
    # Step 2: Check SIM and signal
    sim_result = run_ssh_command(f"sudo mmcli -m {modem_path} --location-get --signal")
    if not sim_result['success']:
        print(f"❌ Error checking SIM: {sim_result['stderr']}")
    else:
        sim_output = sim_result['output']
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
    print("⚠️ Could not determine SIM or modem status.\n" + modem_result['output'])
