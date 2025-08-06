import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, run_sudo_command

def run():
    try:
        output = []
        output.append("Critical Kernel Logs:")
        # Use sudo with password
        result = run_sudo_command("dmesg | grep -iE 'fail|error|critical' | tail -n 30", timeout=10)
        output.append(result)
        
        return {
            'status': 'success' if not result.startswith('Error:') else 'error',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking dmesg: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
