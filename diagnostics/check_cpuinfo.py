import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("CPU Load:")
        
        # Get CPU load section from top
        top_output = run_ssh_command("top -bn1 | head -n 15")
        if "Error" in top_output:
            output.append(top_output)
        else:
            # Extract key metrics
            top_lines = top_output.strip().splitlines()
            for line in top_lines:
                if "load average:" in line:
                    output.append("🔁 " + line.strip())  # load avg
                elif "%Cpu(s):" in line:
                    output.append("⚙️  " + line.strip())  # CPU usage breakdown
                elif "COMMAND" in line:
                    output.append("\nTop Processes:")
                elif "polkitd" in line or "top" in line or "systemd" in line or "Network" in line or "%CPU" in line:
                    output.append(line.strip())
        
        # CPU model
        output.append("\nCPU Info:")
        cpu_model_output = run_ssh_command("cat /proc/cpuinfo | grep -m1 'model name'")
        if not cpu_model_output.strip():
            # For ARM-based systems, fallback to 'Hardware'
            cpu_model_output = run_ssh_command("cat /proc/cpuinfo | grep -m1 'Hardware'")
        
        output.append("🧠 " + cpu_model_output.strip())
        
        has_error = "Error" in top_output or cpu_model_output.startswith('Error:')
        return {
            'status': 'error' if has_error else 'success',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking CPU info: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
