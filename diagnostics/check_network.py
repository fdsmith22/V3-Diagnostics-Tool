import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("Checking network interfaces on remote sensor...")
        result = run_ssh_command("nmcli device")
        output.append(result)
        
        return {
            'status': 'success' if not result.startswith('Error:') else 'error',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking network: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
