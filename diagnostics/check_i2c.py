import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("I2C Devices:")
        result = run_ssh_command("i2cdetect -y 1")
        output.append(result)
        
        return {
            'status': 'success' if not result.startswith('Error:') else 'error',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking I2C devices: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
