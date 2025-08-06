#!/usr/bin/env python3
"""Battery diagnostics for V3 device"""

import sys, os
import json
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def parse_voltage_field(response, field_name):
    """Parse voltage field from JSON response"""
    try:
        data = json.loads(response)
        if data and data.get("battery_charger_field") == field_name:
            return int(data.get("payload_int", 0))
    except:
        pass
    return 0

def format_voltage(raw_value):
    """Convert raw voltage value to volts"""
    return round(raw_value / 1000.0, 2)

def calculate_battery_percent(voltage):
    """Calculate battery percentage from voltage"""
    v_min, v_max = 5.6, 7.2
    percent = (voltage - v_min) / (v_max - v_min)
    return max(0, min(100, round(percent * 100)))

def battery_bar(percent):
    """Generate battery charge visual bar"""
    return "▮" * (percent // 10) + "▯" * (10 - percent // 10)

def run():
    try:
        output = []
        
        # Get voltage readings via API calls
        vbat_response = run_ssh_command(
            "curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VBAT_ADC"
        )
        vac1_response = run_ssh_command(
            "curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VAC1_ADC"
        )
        
        # Check if commands failed or returned errors
        if not vbat_response or vbat_response.startswith('Error:') or not vac1_response or vac1_response.startswith('Error:'):
            output.append("No battery")
            return {
                'status': 'success',
                'output': '\n'.join(output)
            }
        
        # Parse voltage values
        vbat_raw = parse_voltage_field(vbat_response, "BATTERY_CHARGER_FIELD_VBAT_ADC")
        vac1_raw = parse_voltage_field(vac1_response, "BATTERY_CHARGER_FIELD_VAC1_ADC")
        
        # Check if battery is actually connected (voltage should be > 0)
        if vbat_raw == 0:
            output.append("No battery")
            return {
                'status': 'success',
                'output': '\n'.join(output)
            }
        
        # Convert to human-readable format
        vbat = format_voltage(vbat_raw)
        vac1 = format_voltage(vac1_raw)
        percent = calculate_battery_percent(vbat)
        bar = battery_bar(percent)
        
        # Output results
        output.append(f"🔋 Battery Voltage (VBAT): {vbat} V (raw={vbat_raw})")
        output.append(f"🔋 Input Voltage (VAC1): {vac1} V (raw={vac1_raw})")
        output.append(f"🔋 Estimated Charge: {percent}%  {bar}")
        
        return {
            'status': 'success',
            'output': '\n'.join(output)
        }
        
    except Exception as e:
        return {
            'status': 'error',
            'output': f'Error running battery check: {str(e)}'
        }

if __name__ == "__main__":
    result = run()
    print(result['output'])