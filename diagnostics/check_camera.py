import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def run():
    try:
        output = []
        output.append("Camera Devices:")

        # Camera type definitions
        CAMERA_TYPES = {
            'IMX462': 'FSM',
            'IMX662': 'PGM'
        }

        # Detect all video and media devices
        video_devices = run_ssh_command("ls /dev/video* 2>/dev/null")
        media_devices = run_ssh_command("ls /dev/media* 2>/dev/null")
        v4l2_output = run_ssh_command("v4l2-ctl --list-devices 2>/dev/null")

        # Initialize status variables
        camera_checked = 0
        camera_found = 0
        camera_csi_ports = []  # List to store CSI port information for each detected camera
        camera_details = []    # To store detailed info about each detected camera (model and CSI port)
        
        # Filter for IMX462 and IMX662 devices
        imx462_devices = []
        imx662_devices = []
        for line in v4l2_output.splitlines():
            if 'imx462' in line.lower():  # Check for 'imx462' device, case-insensitive
                imx462_devices.append(line)
            elif 'imx662' in line.lower():  # Check for 'imx662' device, case-insensitive
                imx662_devices.append(line)

        # Count valid video devices from /dev/video*
        video_count = len([line for line in video_devices.splitlines() if "/dev/video" in line])
        
        # Expected CSI lanes
        EXPECTED_CSI = 6
        
        if video_count == 0:
            output.append("❌ No cameras detected.")
            output.append(f"Expected CSI lanes: {EXPECTED_CSI} — 0 cameras found.")
            status = 'error'
            message = "❌ No cameras detected"
        else:
            # Process IMX462 devices
            for line in imx462_devices:
                camera_checked += 1
                # Extract the CSI port from the 'platform:' string
                if "platform:tegra-capture-vi:" in line:
                    csi_port = line.split("platform:tegra-capture-vi:")[1]
                    camera_csi_ports.append(csi_port)  # Add the CSI port to the list
                    camera_found += 1
                    camera_details.append(f"IMX462 ({CAMERA_TYPES['IMX462']}) camera on CSI port {csi_port}.")  # Add camera info to details
                    output.append(f"✅ Detected IMX462 ({CAMERA_TYPES['IMX462']}) camera on CSI port {csi_port}.")

            # Process IMX662 devices
            for line in imx662_devices:
                camera_checked += 1
                # Extract the CSI port from the 'platform:' string
                if "platform:tegra-capture-vi:" in line:
                    csi_port = line.split("platform:tegra-capture-vi:")[1]
                    camera_csi_ports.append(csi_port)  # Add the CSI port to the list
                    camera_found += 1
                    camera_details.append(f"IMX662 ({CAMERA_TYPES['IMX662']}) camera on CSI port {csi_port}.")  # Add camera info to details
                    output.append(f"✅ Detected IMX662 ({CAMERA_TYPES['IMX662']}) camera on CSI port {csi_port}.")

            # If no cameras are found
            if camera_found == 0:
                output.append("❌ No IMX462 or IMX662 cameras detected.")
                status = 'error'
                message = "❌ No IMX462 or IMX662 cameras detected"
            else:
                imx462_count = len(imx462_devices)
                imx662_count = len(imx662_devices)
                camera_type_summary = []
                if imx462_count > 0:
                    camera_type_summary.append(f"{imx462_count} IMX462 ({CAMERA_TYPES['IMX462']})")
                if imx662_count > 0:
                    camera_type_summary.append(f"{imx662_count} IMX662 ({CAMERA_TYPES['IMX662']})")

                summary_message = f"Found {camera_found} camera(s): {', '.join(camera_type_summary)}"
                output.append(f"✅ {summary_message}.")
                if camera_found < EXPECTED_CSI:
                    output.append(f"⚠️ Only {camera_found} of {EXPECTED_CSI} CSI camera lanes active.")
                    status = 'warning'
                    message = f"⚠️ {summary_message} — {camera_found}/{EXPECTED_CSI} lanes active"
                else:
                    output.append(f"✅ All {EXPECTED_CSI} CSI camera lanes active.")
                    status = 'success'
                    message = f"✅ {summary_message}"
        
        # Optional: include camera name details if available
        if v4l2_output.strip():
            output.append("\n🔍 Camera Details:\n" + v4l2_output)
        
        # Return the status for the summary report
        summary = {
            'cameraChecked': camera_checked,
            'cameraFound': camera_found,
            'cameraCSI': camera_csi_ports,  # Include CSI port information
            'cameraDetails': camera_details,  # Detailed camera information
            'v4l2_output': v4l2_output.strip()
        }
        
        return {
            'status': status if status != 'warning' else 'success',
            'output': '\n'.join(output),
            'message': message,
            'summary': summary
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking cameras: {str(e)}',
            'message': f'❌ Error checking cameras: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])

