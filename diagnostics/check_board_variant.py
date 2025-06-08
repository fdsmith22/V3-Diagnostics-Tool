#!/usr/bin/env python3
"""
Board Variant Detection Module
Detects and identifies NVIDIA Jetson board variants (Orin Nano, Xavier NX models)
"""

import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import subprocess
import json
import re
from utils.ssh_interface import run_ssh_command

def check_board_variant():
    """
    Detect connected hardware and identify the specific device model
    Returns structured information about the detected hardware
    """
    
    results = {
        'timestamp': None,
        'status': 'unknown',
        'hardware_detected': None,
        'internal_part_label': None,
        'vendor_part_number': None,
        'memory_size': None,
        'board_info': {},
        'tegra_info': {},
        'details': [],
        'raw_output': {}
    }
    
    try:
        # Get system timestamp
        timestamp_result = run_ssh_command('date "+%Y-%m-%d %H:%M:%S"')
        if timestamp_result['success']:
            results['timestamp'] = timestamp_result['output'].strip()
        
        # Method 1: Check device tree model
        device_tree_result = run_ssh_command('cat /proc/device-tree/model 2>/dev/null || echo "Not found"')
        if device_tree_result['success'] and device_tree_result.get('output'):
            model_info = device_tree_result['output'].strip()
            results['raw_output']['device_tree_model'] = model_info
            results['details'].append(f"Device Tree Model: {model_info}")
            
            # Parse device tree model for hardware identification
            hardware_info = parse_device_tree_model(model_info)
            if hardware_info:
                results.update(hardware_info)
        else:
            results['details'].append("Device tree model not accessible via SSH")
        
        # Method 2: Check tegrastats for additional info
        tegrastats_result = run_ssh_command('timeout 2 tegrastats --verbose 2>/dev/null | head -5 || echo "tegrastats not available"')
        if tegrastats_result['success'] and tegrastats_result.get('output'):
            tegra_output = tegrastats_result['output'].strip()
            results['raw_output']['tegrastats'] = tegra_output
            if 'not available' not in tegra_output:
                results['details'].append(f"Tegrastats Output: {tegra_output[:100]}...")
        else:
            results['details'].append("Tegrastats not accessible via SSH")
        
        # Method 3: Check board info from NVIDIA specific locations
        board_info_result = run_ssh_command('cat /proc/device-tree/nvidia,dtsfilename 2>/dev/null || cat /proc/device-tree/compatible 2>/dev/null || echo "Not found"')
        if board_info_result['success'] and board_info_result.get('output'):
            board_info = board_info_result['output'].strip()
            results['raw_output']['board_info'] = board_info
            results['details'].append(f"Board Info: {board_info}")
            
            # Parse board info for additional hardware details
            board_details = parse_board_info(board_info)
            if board_details:
                results['board_info'].update(board_details)
        else:
            results['details'].append("Board info not accessible via SSH")
        
        # Method 4: Check memory size from meminfo
        meminfo_result = run_ssh_command('grep MemTotal /proc/meminfo')
        if meminfo_result['success'] and meminfo_result.get('output'):
            mem_line = meminfo_result['output'].strip()
            results['raw_output']['meminfo'] = mem_line
            
            # Extract memory size in GB
            mem_match = re.search(r'MemTotal:\s+(\d+)\s+kB', mem_line)
            if mem_match:
                mem_kb = int(mem_match.group(1))
                mem_gb = round(mem_kb / 1024 / 1024)
                results['memory_size'] = f"{mem_gb}GB"
                results['details'].append(f"Total Memory: {results['memory_size']}")
        else:
            results['details'].append("Memory info not accessible via SSH")
        
        # Method 5: Check CPU info for additional details
        cpuinfo_result = run_ssh_command('grep -E "Hardware|Revision|Serial" /proc/cpuinfo | head -5')
        if cpuinfo_result['success'] and cpuinfo_result.get('output'):
            cpu_info = cpuinfo_result['output'].strip()
            results['raw_output']['cpuinfo'] = cpu_info
            if cpu_info:
                results['details'].append(f"CPU Info: {cpu_info}")
        else:
            results['details'].append("CPU info not accessible via SSH")
        
        # Attempt to match against known hardware configurations
        detected_hardware = identify_hardware_variant(results)
        if detected_hardware:
            results.update(detected_hardware)
            results['status'] = 'detected'
        else:
            results['status'] = 'unknown'
            results['details'].append("Unable to match against known hardware configurations")
        
    except Exception as e:
        results['status'] = 'error'
        results['details'].append(f"Error during hardware detection: {str(e)}")
    
    return results

def parse_device_tree_model(model_string):
    """Parse device tree model string to identify hardware"""
    if not model_string or model_string == "Not found" or model_string is None:
        return None
    
    try:
        model_lower = str(model_string).lower()
    except (AttributeError, TypeError):
        return None
    
    # Known patterns for NVIDIA Jetson devices
    if 'orin nano' in model_lower:
        if '8gb' in model_lower or '8g' in model_lower:
            return {
                'hardware_detected': 'Orin Nano 8GB',
                'internal_part_label': 'PT-ZA-499',
                'vendor_part_number': '900-13767-0030-000'
            }
        elif '4gb' in model_lower or '4g' in model_lower:
            return {
                'hardware_detected': 'Orin Nano 4GB',
                'internal_part_label': 'PT-ZA-498',
                'vendor_part_number': '900-13767-0040-000'
            }
        else:
            # Default to 8GB if memory not specified
            return {
                'hardware_detected': 'Orin Nano (variant unknown)',
                'internal_part_label': 'PT-ZA-499',
                'vendor_part_number': '900-13767-0030-000'
            }
    
    elif 'xavier nx' in model_lower:
        if '16gb' in model_lower or '16g' in model_lower:
            return {
                'hardware_detected': 'Xavier NX 16GB',
                'internal_part_label': 'PT-ZA-471',
                'vendor_part_number': '900-83668-0030-000'
            }
        elif '8gb' in model_lower or '8g' in model_lower:
            return {
                'hardware_detected': 'Xavier NX 8GB',
                'internal_part_label': 'PT-ZA-667',
                'vendor_part_number': '900-83668-0000-000'
            }
        else:
            # Default to 8GB if memory not specified
            return {
                'hardware_detected': 'Xavier NX (variant unknown)',
                'internal_part_label': 'PT-ZA-667',
                'vendor_part_number': '900-83668-0000-000'
            }
    
    elif 'orin' in model_lower:
        return {
            'hardware_detected': 'Orin (variant unknown)',
            'internal_part_label': 'Unknown',
            'vendor_part_number': 'Unknown'
        }
    
    elif 'xavier' in model_lower:
        return {
            'hardware_detected': 'Xavier (variant unknown)',
            'internal_part_label': 'Unknown',
            'vendor_part_number': 'Unknown'
        }
    
    return None

def parse_board_info(board_string):
    """Parse board info string for additional details"""
    if not board_string or board_string == "Not found":
        return {}
    
    details = {}
    
    # Look for DTS filename patterns
    if '.dts' in board_string:
        details['dts_file'] = board_string
    
    # Look for compatible strings
    if 'nvidia' in board_string.lower():
        details['nvidia_compatible'] = True
    
    return details

def identify_hardware_variant(results):
    """
    Cross-reference multiple detection methods to identify hardware variant
    Uses memory size and model info to make best guess
    """
    
    # If we already detected hardware from device tree, use memory to refine
    if results.get('hardware_detected'):
        detected = results['hardware_detected']
        memory = results.get('memory_size', '')
        
        # Refine Orin Nano detection based on memory
        if 'Orin Nano' in detected and 'variant unknown' in detected:
            if memory and '8' in memory:
                return {
                    'hardware_detected': 'Orin Nano 8GB',
                    'internal_part_label': 'PT-ZA-499',
                    'vendor_part_number': '900-13767-0030-000'
                }
            elif memory and '4' in memory:
                return {
                    'hardware_detected': 'Orin Nano 4GB',
                    'internal_part_label': 'PT-ZA-498',
                    'vendor_part_number': '900-13767-0040-000'
                }
        
        # Refine Xavier NX detection based on memory
        elif 'Xavier NX' in detected and 'variant unknown' in detected:
            if memory and '16' in memory:
                return {
                    'hardware_detected': 'Xavier NX 16GB',
                    'internal_part_label': 'PT-ZA-471',
                    'vendor_part_number': '900-83668-0030-000'
                }
            elif memory and '8' in memory:
                return {
                    'hardware_detected': 'Xavier NX 8GB',
                    'internal_part_label': 'PT-ZA-667',
                    'vendor_part_number': '900-83668-0000-000'
                }
        
        # Already have good detection, return as-is
        return None
    
    # Fallback: try to detect based on memory size alone
    memory = results.get('memory_size', '')
    
    if memory and '16' in memory:
        # Most likely Xavier NX 16GB
        return {
            'hardware_detected': 'Xavier NX 16GB (inferred from memory)',
            'internal_part_label': 'PT-ZA-471',
            'vendor_part_number': '900-83668-0030-000'
        }
    elif memory and '8' in memory:
        # Could be either Xavier NX 8GB or Orin Nano 8GB - default to Xavier NX
        return {
            'hardware_detected': 'Xavier NX 8GB (inferred from memory)',
            'internal_part_label': 'PT-ZA-667',
            'vendor_part_number': '900-83668-0000-000'
        }
    elif memory and '4' in memory:
        # Most likely Orin Nano 4GB
        return {
            'hardware_detected': 'Orin Nano 4GB (inferred from memory)',
            'internal_part_label': 'PT-ZA-498',
            'vendor_part_number': '900-13767-0040-000'
        }
    
    return None

if __name__ == "__main__":
    # Test the board variant detection
    result = check_board_variant()
    
    # Print formatted output for display
    print("[BOARD VARIANT DETECTION]")
    print(f"🔍 Detection Status: {result['status'].upper()}")
    
    if result.get('timestamp'):
        print(f"⏰ Scan Time: {result['timestamp']}")
    
    if result.get('hardware_detected'):
        print(f"🏷️  Detected Hardware: {result['hardware_detected']}")
        if result.get('internal_part_label'):
            print(f"📋 Internal Part Label: {result['internal_part_label']}")
        if result.get('vendor_part_number'):
            print(f"🔢 Vendor Part Number: {result['vendor_part_number']}")
        if result.get('memory_size'):
            print(f"💾 Memory Size: {result['memory_size']}")
    else:
        print("❌ Unable to detect specific board variant")
    
    # Print diagnostic details
    if result.get('details'):
        print("\n[DETECTION DETAILS]")
        for detail in result['details']:
            print(f"📝 {detail}")
    
    # Print any errors or warnings
    if result['status'] == 'error':
        print("\n⚠️  Error occurred during detection")
    
    # For debugging: output raw JSON data as well
    print(f"\n[DEBUG] Raw detection result:")
    print(json.dumps(result, indent=2))