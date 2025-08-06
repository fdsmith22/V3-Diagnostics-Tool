import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("Thermal Sensors:")
        
        # Build shell command to fetch and label thermal zones
        command = r"""
for zone in /sys/class/thermal/thermal_zone*; do
  label=$(cat "$zone/type" 2>/dev/null)
  temp=$(cat "$zone/temp" 2>/dev/null)
  if [[ "$temp" =~ ^[0-9]+$ ]]; then
    celsius=$(echo "scale=1; $temp / 1000" | bc)
    alert=""
    if (( $(echo "$celsius > 75.0" | bc -l) )); then alert=" 🔥"; fi
    echo "$label: ${celsius}°C$alert"
  else
    echo "$label: Invalid temperature format"
  fi
done
"""
        
        result = run_ssh_command(command)
        
        # Format the result
        if "Error" not in result:
            output.append(result.strip())
            status = 'success'
        else:
            output.append(f"❌ Error retrieving thermal zones:\n{result}")
            status = 'error'
        
        return {
            'status': status,
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking thermals: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])
