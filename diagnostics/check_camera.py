import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

print("Camera Devices:")

# Detect all video and media devices
video_result = run_ssh_command("ls /dev/video* 2>/dev/null")
media_result = run_ssh_command("ls /dev/media* 2>/dev/null")
v4l2_result = run_ssh_command("v4l2-ctl --list-devices 2>/dev/null")

# Handle SSH results
video_devices = video_result['output'] if video_result['success'] else ""
media_devices = media_result['output'] if media_result['success'] else ""
v4l2_output = v4l2_result['output'] if v4l2_result['success'] else ""

# Check for any critical SSH errors
if not video_result['success'] and video_result['returncode'] != 2:  # returncode 2 is normal for 'file not found'
    print(f"❌ Error checking video devices: {video_result['stderr']}")
if not media_result['success'] and media_result['returncode'] != 2:
    print(f"❌ Error checking media devices: {media_result['stderr']}")
if not v4l2_result['success']:
    print(f"❌ Error running v4l2-ctl: {v4l2_result['stderr']}")

# Initialize status variables
camera_checked = 0
camera_found = 0
camera_csi_ports = []  # List to store CSI port information for each detected camera
camera_details = []    # To store detailed info about each detected camera (model and CSI port)

# Filter for IMX462 devices only
imx462_devices = []
for line in v4l2_output.splitlines():
    if 'imx462' in line.lower():  # Check for 'imx462' device, case-insensitive
        imx462_devices.append(line)

# Count valid video devices from /dev/video*
video_count = len([line for line in video_devices.splitlines() if "/dev/video" in line])

# Expected CSI lanes
EXPECTED_CSI = 6

if video_count == 0:
    print("❌ No cameras detected.")
    print(f"Expected CSI lanes: {EXPECTED_CSI} — 0 cameras found.")
else:
    # Count and filter out only IMX462 devices
    for line in imx462_devices:
        camera_checked += 1
        # Extract the CSI port from the 'platform:' string
        if "platform:tegra-capture-vi:" in line:
            csi_port = line.split("platform:tegra-capture-vi:")[1]
            camera_csi_ports.append(csi_port)  # Add the CSI port to the list
            camera_found += 1
            camera_details.append(f"IMX462 camera on CSI port {csi_port}.")  # Add camera info to details
            print(f"✅ Detected IMX462 camera on CSI port {csi_port}.")

    # If no IMX462 cameras are found
    if camera_found == 0:
        print("❌ No IMX462 cameras detected.")
    else:
        print(f"✅ Found {camera_found} IMX462 camera(s).")
        if camera_found < EXPECTED_CSI:
            print(f"⚠️ Only {camera_found} of {EXPECTED_CSI} CSI camera lanes active.")
        else:
            print(f"✅ All {EXPECTED_CSI} CSI camera lanes active.")

# Optional: include camera name details if available
if v4l2_output.strip():
    print("\n🔍 Camera Details:\n" + v4l2_output)

# Return the status for the summary report
summary = {
    'cameraChecked': camera_checked,
    'cameraFound': camera_found,
    'cameraCSI': camera_csi_ports,  # Include CSI port information
    'cameraDetails': camera_details,  # Detailed camera information
    'v4l2_output': v4l2_output.strip()
}

