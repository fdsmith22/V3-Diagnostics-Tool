import sys
import os
import json

# Add project root to sys.path so "utils" can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command

def parse_voltage_field(response, field_name):
    try:
        data = json.loads(response)
        if data.get("battery_charger_field") == field_name:
            return int(data.get("payload_int", 0))
    except json.JSONDecodeError:
        print(f"❌ JSON decode error for {field_name}. Response:\n{response}")
    except Exception as e:
        print(f"❌ Unexpected error for {field_name}: {e}")
    return 0

def format_voltage(raw_value):
    return round(raw_value / 1000.0, 2)

def calculate_battery_percent(voltage):
    v_min, v_max = 5.6, 7.2
    percent = (voltage - v_min) / (v_max - v_min)
    return max(0, min(100, round(percent * 100)))

def battery_bar(percent):
    return "▮" * (percent // 10) + "▯" * (10 - percent // 10)

try:
    print("[BATTERY STATUS]")

    vbat_response = run_ssh_command("curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VBAT_ADC")
    vac1_response = run_ssh_command("curl -s http://localhost:2000/battery_charger_field/BATTERY_CHARGER_FIELD_VAC1_ADC")

    print(f"🔧 Raw VBAT Response: {vbat_response}")
    print(f"🔧 Raw VAC1 Response: {vac1_response}")

    vbat_raw = parse_voltage_field(vbat_response, "BATTERY_CHARGER_FIELD_VBAT_ADC")
    vac1_raw = parse_voltage_field(vac1_response, "BATTERY_CHARGER_FIELD_VAC1_ADC")

    vbat = format_voltage(vbat_raw)
    vac1 = format_voltage(vac1_raw)
    percent = calculate_battery_percent(vbat)
    bar = battery_bar(percent)

    print(f"🔋 Battery Voltage (VBAT): {vbat} V (raw={vbat_raw})")
    print(f"🔋 Input Voltage (VAC1): {vac1} V (raw={vac1_raw})")
    print(f"🔋 Estimated Charge: {percent}%  {bar}")

except Exception as e:
    print(f"❌ Fatal battery check error: {e}")

sys.exit(0)
