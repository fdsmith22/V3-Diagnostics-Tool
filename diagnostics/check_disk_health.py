import sys, os, re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, run_sudo_command

def run():
    try:
        output = []
        output.append("SMART Disk Health:\n")
        
        # Get all disk devices
        lsblk_output = run_ssh_command("lsblk -dno NAME")
        if lsblk_output.startswith('Error:'):
            return {
                'status': 'error',
                'output': f'Error getting disk devices: {lsblk_output}'
            }
        
        device_list = [line.strip() for line in lsblk_output.splitlines() if line.strip()]
        unique_devices = set(f"/dev/{dev}" for dev in device_list)
        
        # Run smartctl on each and summarize result
        for device in unique_devices:
            # Skip virtual devices that don't support SMART
            device_name = device.split('/')[-1]
            if device_name.startswith(('loop', 'zram', 'ram')):
                continue
                
            output.append(f"Device: {device}")
            # Use sudo with password
            result = run_sudo_command(f"smartctl -H {device}", timeout=10)
            if "PASSED" in result:
                output.append("✅ Health: PASSED\n")
            elif "FAILED" in result:
                output.append("❌ Health: FAILED\n")
            elif "Unable to detect device type" in result:
                output.append("⚠️ Unsupported or virtual device\n")
            else:
                match = re.search(r'SMART overall-health self-assessment test result:\s*(.+)', result)
                if match:
                    output.append(f"⚠️ Health: {match.group(1)}\n")
                else:
                    output.append("⚠️ SMART data unavailable or malformed\n")
        
        return {
            'status': 'success',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking disk health: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
