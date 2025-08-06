import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, run_sudo_command

def run():
    try:
        output = []
        output.append("System Logs:\n")
        
        # Try journalctl with sudo (using password)
        result = run_sudo_command("journalctl -p 3 -xb --no-pager | tail -n 20", timeout=10)
        
        if "No journal files" in result or result.startswith('Error:'):
            # Fallback to dmesg with sudo
            output.append("Using dmesg (journalctl not accessible):\n")
            result = run_sudo_command("dmesg | grep -E 'error|fail|warn' | tail -n 20", timeout=10)
            
            if not result or result.startswith('Error:'):
                # Final fallback to basic log check
                result = run_ssh_command("tail -n 20 /var/log/syslog 2>/dev/null || echo 'No readable system logs'", timeout=10)
        
        output.append(result if result else "No log entries found")
        
        return {
            'status': 'success' if not result.startswith('Error:') else 'error',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking logs: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
