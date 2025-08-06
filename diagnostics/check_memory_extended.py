import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("Memory Summary:")
        result1 = run_ssh_command("free -h")
        output.append(result1)
        
        output.append("\nDetailed Memory Info:")
        result2 = run_ssh_command("cat /proc/meminfo | head -n 20")
        output.append(result2)
        
        has_error = result1.startswith('Error:') or result2.startswith('Error:')
        return {
            'status': 'error' if has_error else 'success',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking extended memory: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
