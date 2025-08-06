import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, run_sudo_command

def run():
    try:
        output = []
        output.append("🔌 Modem Status:")
        
        # First check if modem exists
        modem_list = run_sudo_command("mmcli -L", timeout=10)
        
        if "No modems were found" in modem_list:
            output.append("❌ No modem detected")
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        elif "ModemManager is not running" in modem_list:
            output.append("❌ ModemManager service is not running")
            return {
                'status': 'error', 
                'output': '\n'.join(output)
            }
        elif "/Modem/" not in modem_list:
            output.append("❌ Could not detect modem")
            output.append(modem_list)
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        
        # Modem found - get details
        output.append("✅ Modem detected")
        output.append("")
        output.append("Modem Details:")
        output.append(modem_list)
        output.append("")
        
        # Get detailed modem info
        commands = [
            ("mmcli -m 0", "Modem Information"),
            ("mmcli -i 0", "SIM Information"), 
            ("mmcli -m 0 --signal", "Signal Strength")
        ]
        
        for cmd, description in commands:
            output.append(f"\n--- {description} ---")
            result = run_sudo_command(cmd, timeout=10)
            
            # Don't fail if these commands have issues, just report them
            if "error" in result.lower() and "no actions specified" not in result.lower():
                output.append(f"⚠️ Could not retrieve {description.lower()}")
                output.append(result)
            else:
                # Clean up output
                clean_result = result.replace("[sudo] password for ubuntu:", "").strip()
                if clean_result:
                    output.append(clean_result)
        
        return {
            'status': 'success',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'❌ Error checking modem: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])