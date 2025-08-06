import sys, os
import re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, run_sudo_command

def extract_sim_details(modem_output):
    """Extract key SIM details from modem output"""
    details = {}
    
    # Extract network modes
    modes_match = re.search(r'Modes.*?current:\s*(.*?)(?:\n|$)', modem_output, re.DOTALL)
    if modes_match:
        details['modes'] = modes_match.group(1).strip()
    
    # Extract bands
    bands_match = re.search(r'Bands.*?current:\s*(.*?)(?:\n\s*---|\n\s*[A-Z]|$)', modem_output, re.DOTALL)
    if bands_match:
        bands = bands_match.group(1).strip()
        # Clean up the bands output
        bands = ' '.join(bands.split())
        details['bands'] = bands
    
    # Extract IP support
    ip_match = re.search(r'IP\s*\|.*?supported:\s*(.*?)(?:\n|$)', modem_output)
    if ip_match:
        details['ip_support'] = ip_match.group(1).strip()
    
    # Extract 3GPP info
    imei_match = re.search(r'imei:\s*(\d+)', modem_output)
    if imei_match:
        details['imei'] = imei_match.group(1)
    
    operator_match = re.search(r'operator name:\s*(.*?)(?:\n|$)', modem_output)
    if operator_match:
        details['operator'] = operator_match.group(1).strip()
    
    registration_match = re.search(r'registration:\s*(.*?)(?:\n|$)', modem_output)
    if registration_match:
        details['registration'] = registration_match.group(1).strip()
    
    # Extract SIM specific info
    imsi_match = re.search(r'imsi:\s*(\d+)', modem_output)
    if imsi_match:
        details['imsi'] = imsi_match.group(1)
    
    iccid_match = re.search(r'iccid:\s*(\d+)', modem_output)
    if iccid_match:
        details['iccid'] = iccid_match.group(1)
    
    # Extract signal strength if available
    signal_match = re.search(r'signal quality:\s*(\d+)', modem_output)
    if signal_match:
        details['signal_quality'] = signal_match.group(1) + '%'
    
    return details

def run():
    try:
        output = []
        output.append("📱 SIM Card Status:")
        
        # Step 1: Check for modems
        modem_list = run_sudo_command("mmcli -L", timeout=10)
        
        if "No modems were found" in modem_list:
            output.append("❌ No modem found - cannot check SIM")
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        elif "ModemManager is not running" in modem_list:
            output.append("❌ ModemManager service is not active")
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        elif "/Modem/" not in modem_list:
            output.append("❌ Could not detect modem")
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        
        # Step 2: Get full modem information
        modem_info = run_sudo_command("mmcli -m 0", timeout=10)
        
        # Check if SIM is present
        if "sim: none" in modem_info.lower() or "no sim" in modem_info.lower():
            output.append("❌ No SIM card inserted")
            return {
                'status': 'error',
                'output': '\n'.join(output)
            }
        
        # Check for SIM path
        if "/SIM/" not in modem_info:
            output.append("⚠️ SIM status unclear")
            output.append(modem_info)
            return {
                'status': 'warning',
                'output': '\n'.join(output)
            }
        
        # SIM is detected - extract details
        output.append("✅ SIM card detected")
        output.append("")
        
        # Get SIM specific information
        sim_info = run_sudo_command("mmcli -i 0", timeout=10)
        
        # Extract and display key details
        details = extract_sim_details(modem_info + "\n" + sim_info)
        
        if details:
            output.append("--- SIM Details ---")
            if 'operator' in details:
                output.append(f"Operator: {details['operator']}")
            if 'registration' in details:
                output.append(f"Registration: {details['registration']}")
            if 'imsi' in details:
                output.append(f"IMSI: {details['imsi']}")
            if 'iccid' in details:
                output.append(f"ICCID: {details['iccid']}")
            if 'imei' in details:
                output.append(f"IMEI: {details['imei']}")
            
            output.append("")
            output.append("--- Network Configuration ---")
            if 'modes' in details:
                output.append(f"Network Modes: {details['modes']}")
            if 'ip_support' in details:
                output.append(f"IP Support: {details['ip_support']}")
            if 'signal_quality' in details:
                output.append(f"Signal Quality: {details['signal_quality']}")
            
            if 'bands' in details:
                output.append("")
                output.append("--- Supported Bands ---")
                # Format bands nicely
                bands = details['bands'].replace(',', ', ')
                output.append(bands)
        
        # Get signal strength
        signal_info = run_sudo_command("mmcli -m 0 --signal", timeout=10)
        if signal_info and "error" not in signal_info.lower():
            output.append("")
            output.append("--- Signal Information ---")
            # Clean up signal output
            clean_signal = signal_info.replace("[sudo] password for ubuntu:", "").strip()
            if clean_signal and "no actions specified" not in clean_signal.lower():
                # Extract just the relevant signal lines
                for line in clean_signal.split('\n'):
                    if 'rssi' in line.lower() or 'quality' in line.lower() or 'access tech' in line.lower():
                        output.append(line.strip())
        
        return {
            'status': 'success',
            'output': '\n'.join(output)
        }
    except Exception as e:
        return {
            'status': 'error',
            'output': f'❌ Error checking SIM: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])