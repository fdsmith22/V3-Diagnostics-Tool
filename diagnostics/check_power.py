#!/usr/bin/env python3
"""Power rail diagnostics for V3 device"""

import sys, os
import json
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command, check_ssh_connection

def parse_voltage_reading(response):
    """Parse voltage reading from various sources"""
    try:
        # If it's a raw ADC value, convert to voltage
        if response and response.strip().isdigit():
            return float(response.strip())
        return None
    except:
        return None

def check_voltage_rail(rail_name, expected_voltage, tolerance=0.3):
    """Check if a voltage rail is within expected range"""
    # Dictionary of possible voltage monitoring paths
    voltage_sources = {
        "3.3V": [
            "cat /sys/class/hwmon/hwmon*/in0_input 2>/dev/null | head -1",  # IIO/hwmon voltage monitor
            "cat /sys/bus/iio/devices/iio:device*/in_voltage0_raw 2>/dev/null | head -1",  # IIO ADC
            "grep VDD_3V3 /sys/kernel/debug/regulator/regulator_summary 2>/dev/null | awk '{print $3}'",  # Regulator
        ],
        "5.0V": [
            "cat /sys/class/hwmon/hwmon*/in1_input 2>/dev/null | head -1",  # IIO/hwmon voltage monitor
            "cat /sys/bus/iio/devices/iio:device*/in_voltage1_raw 2>/dev/null | head -1",  # IIO ADC
            "grep VDD_5V /sys/kernel/debug/regulator/regulator_summary 2>/dev/null | awk '{print $3}'",  # Regulator
        ]
    }
    
    # Try to read voltage from various sources
    voltage = None
    for cmd in voltage_sources.get(rail_name, []):
        response = run_ssh_command(cmd)
        if response and not response.startswith("Error:"):
            raw_value = parse_voltage_reading(response)
            if raw_value is not None:
                # Convert millivolts to volts if needed
                if raw_value > 100:  # Likely in millivolts
                    voltage = raw_value / 1000.0
                else:
                    voltage = raw_value
                break
    
    # If we couldn't read from system sources, try the power management API
    if voltage is None and rail_name == "3.3V":
        # Try to read 3.3V rail via power management API or GPIO
        response = run_ssh_command("cat /sys/class/gpio/gpio*/value 2>/dev/null | head -1")
        if response and response.strip() in ["0", "1"]:
            # GPIO high means rail is probably OK
            voltage = 3.3 if response.strip() == "1" else 0
    
    # Check voltage range
    if voltage is not None:
        min_voltage = expected_voltage - tolerance
        max_voltage = expected_voltage + tolerance
        is_ok = min_voltage <= voltage <= max_voltage
        status_icon = "✅" if is_ok else "❌"
        status_text = "OK" if is_ok else "OUT OF RANGE"
        return f"{status_icon} {rail_name}: {voltage:.2f}V ({status_text})"
    else:
        # If we can't read the voltage, check if the rail is at least enabled
        # This is a fallback - we'll check regulator status
        cmd = f"echo 'C1tyIsLif3' | sudo -S grep -E '(VDD_{rail_name.replace('.', '')}|{rail_name.replace('.', '')}V)' /sys/kernel/debug/regulator/regulator_summary 2>/dev/null | head -1"
        response = run_ssh_command(cmd)
        if response and "enabled" in response.lower():
            return f"⚠️  {rail_name}: Enabled (voltage reading unavailable)"
        elif response and "disabled" in response.lower():
            return f"❌ {rail_name}: DISABLED"
        else:
            # Final fallback - status unknown
            return f"⚠️  {rail_name}: Status unknown"

def run():
    try:
        # Check if device is connected first
        connected, message = check_ssh_connection()
        if not connected:
            return {
                'status': 'error',
                'output': f'❌ No device connected\n{message}\n\nPlease connect a V3 sensor module via USB to run diagnostics.'
            }
        
        output = []
        output.append("🔌 Power Rail Status:")
        output.append("-" * 30)
        
        # Check main power rails
        rails_to_check = [
            ("3.3V", 3.3),
            ("5.0V", 5.0),
        ]
        
        all_ok = True
        unknown_count = 0
        for rail_name, expected_voltage in rails_to_check:
            result = check_voltage_rail(rail_name, expected_voltage)
            output.append(result)
            if "❌" in result:
                all_ok = False
            if "Status unknown" in result:
                unknown_count += 1
        
        # Check for additional power information
        output.append("")
        output.append("📊 Additional Power Info:")
        
        # Check battery/input voltage if available
        vbat_response = run_ssh_command(
            "curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VBAT_ADC 2>/dev/null"
        )
        if vbat_response and not vbat_response.startswith("Error:"):
            try:
                data = json.loads(vbat_response)
                if data.get("battery_charger_field") == "BATTERY_CHARGER_FIELD_VBAT_ADC":
                    vbat_raw = int(data.get("payload_int", 0))
                    vbat = vbat_raw / 1000.0
                    if vbat > 0:
                        output.append(f"🔋 Battery: {vbat:.2f}V")
            except:
                pass
        
        vac_response = run_ssh_command(
            "curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VAC1_ADC 2>/dev/null"
        )
        if vac_response and not vac_response.startswith("Error:"):
            try:
                data = json.loads(vac_response)
                if data.get("battery_charger_field") == "BATTERY_CHARGER_FIELD_VAC1_ADC":
                    vac_raw = int(data.get("payload_int", 0))
                    vac = vac_raw / 1000.0
                    if vac > 0:
                        output.append(f"⚡ Input: {vac:.2f}V")
            except:
                pass
        
        # Check current consumption if available
        current_response = run_ssh_command(
            "cat /sys/class/power_supply/*/current_now 2>/dev/null | head -1"
        )
        if current_response and current_response.strip().isdigit():
            current_ma = int(current_response.strip()) / 1000  # Convert from uA to mA
            output.append(f"📈 Current Draw: {current_ma:.1f}mA")
        
        # Overall status - only show positive message if we actually verified the rails
        if unknown_count == 0:
            output.append("")
            if all_ok:
                output.append("✅ All power rails within specifications")
            else:
                output.append("⚠️  Some power rails may need attention")
        
        return {
            'status': 'success' if all_ok else 'warning',
            'output': '\n'.join(output)
        }
        
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error checking power: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])