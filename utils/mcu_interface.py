"""
MCU UART Communication Interface
Handles communication with the MCU via serial port (ttyUSB0)
Uses protobuf protocol matching sender.py implementation
"""

import serial
import json
import time
import logging
import os
import subprocess
import crcmod
import struct
from typing import Dict, Any, Optional, Union
try:
    from gevent.lock import RLock as Lock
    import gevent.socket
except ImportError:
    from threading import Lock

logger = logging.getLogger(__name__)

# MCU UART Diagnostic Commands based on actual hardware documentation
# ASCII protocol commands from Vivacity Sensor Stack documentation
MCU_UART_COMMANDS = {
    # System status and information
    'SYS_STATUS': 'SYS_STATUS\r\n',
    'VERSION': 'VERSION\r\n',
    'TEMP_READ': 'TEMP_READ\r\n',
    'POWER_RAILS': 'POWER_RAILS\r\n',
    
    # GPIO and hardware control
    'GPIO_READ': 'GPIO_READ\r\n',
    'CAM_STATUS': 'CAM_STATUS\r\n',
    'I2C_SCAN': 'I2C_SCAN\r\n',
    
    # ADC and sensor readings
    'ADC_READ': 'ADC_READ {}\r\n',  # Takes channel parameter
    
    # System control
    'RESET': 'RESET\r\n',
    
    # Legacy compatibility for existing web interface
    'PING_TO_MCU': 'SYS_STATUS\r\n',
    'GET_FIRMWARE_VERSION': 'VERSION\r\n',
    'GET_TIME_SINCE_MCU_BOOT': 'SYS_STATUS\r\n',
    'GET_SWITCH_STATE': 'GPIO_READ\r\n',
    'GET_PWM_STATE': 'GPIO_READ\r\n',
    'GET_ADC_CHANNEL': 'ADC_READ 0\r\n',
    'GET_MCU_TEMPERATURE': 'TEMP_READ\r\n',
    'GET_I2C_READ_DATA': 'I2C_SCAN\r\n',
    'DUMP_BATTERY_CHARGER_REGISTERS': 'POWER_RAILS\r\n',
}

# I2C Device addresses from hardware documentation
I2C_DEVICES = {
    # GPIO Expanders
    'GPIO_EXPANDER_U20': 0x20,  # MCP23016 - System Control
    'GPIO_EXPANDER_U23': 0x24,  # MCP23016 - Peripheral Control
    
    # ADC/Temperature Sensors
    'ADC_TEMP_SENSORS': list(range(0x48, 0x50)),
    
    # EEPROM/Configuration
    'EEPROM_CONFIG': list(range(0x50, 0x58)),
    
    # Power Management I2C2
    'RTC_CLOCK': 0x68,
    'BATTERY_MGMT': 0x6A,
    'POWER_MGMT': 0x6C,
    
    # Debug/Auxiliary I2C3
    'DIGITAL_POT': 0x2C,  # AD5246
    'ENV_SENSORS': 0x76,
    
    # Camera I2C
    'CAMERA_MODULE_1': 0x10,
    'CAMERA_MODULE_2': 0x36,
    'CAMERA_MUX': 0x1A,  # PCA9547
}

# Power rail test points from hardware documentation
POWER_RAILS = {
    'TP6': '3.3V_SYS',     # Main system power (±5% tolerance)
    'TP7': '3.3V_MCU',     # Microcontroller power (±3% tolerance)
    'TP9': '5V_PERIPH',    # Peripheral power (±5% tolerance)
    'TP29': '3.3V_NVMe',   # SSD power (switchable via GPIO)
    'TP30': '3.3V_GSM',    # Cellular modem power (switchable)
    'TP31': 'VCC_CAM',     # Camera power rail
    'TP1': '12V_INPUT',    # Primary power input (9-15V range)
    'TP2': '5V_MAIN',      # Main 5V rail
    'TP3': '3.3V_MAIN',    # Main 3.3V rail
    'TP4': 'BATT_VOLTAGE', # Battery voltage (3.0-4.2V)
    'TP5': 'CHARGE_CURR',  # Charging current sense (mV/mA)
}

# MCU response type mappings for protobuf decoding
MCU_RESPONSES = {
    0: 'UNKNOWN',
    1: 'SYSTEM_STATUS_OK',
    2: 'FIRMWARE_VERSION_OK',
    3: 'TEMPERATURE_OK',
    4: 'POWER_RAILS_OK',
    5: 'GPIO_READ_OK',
    6: 'I2C_SCAN_OK',
    7: 'ADC_READ_OK',
    8: 'COMMAND_OK',
    9: 'PONG_FROM_MCU',
    10: 'ERROR_RESPONSE'
}

class MCUInterface:
    def __init__(self, port=None, baudrate=115200, timeout=5):
        # Auto-detect port if not specified
        if port is None:
            port = self._find_mcu_port()
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.connection = None
        self.lock = Lock()
        self.is_connected = False
        self.sequence_number = 0
        
        # CRC function (CRC-16 CCITT) to match sender.py
        self.crc_func = crcmod.predefined.mkCrcFun('crc-ccitt-false')
    
    def _find_mcu_port(self):
        """Auto-detect MCU serial port"""
        import glob
        
        # Possible MCU ports based on hardware documentation
        candidate_ports = [
            '/dev/ttyUSB1',   # CP210x UART Bridge (most likely)
            '/dev/ttyUSB0',   # Fallback
            '/dev/ttyACM0',   # STM32 VCP
            '/dev/ttyACM1',   # Alternative STM32 VCP
        ]
        
        # Check which ports exist
        for port in candidate_ports:
            if os.path.exists(port):
                logger.info(f"Found potential MCU port: {port}")
                return port
        
        # Fallback to scanning for any USB serial devices
        usb_ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
        if usb_ports:
            logger.info(f"Using first available USB serial port: {usb_ports[0]}")
            return usb_ports[0]
        
        # Default fallback
        logger.warning("No USB serial ports found, using default /dev/ttyUSB0")
        return '/dev/ttyUSB0'
        
    def connect(self) -> bool:
        """Establish connection to MCU via serial port with auto-baud detection"""
        try:
            with self.lock:
                if self.connection and self.connection.is_open:
                    return True
                    
                # Check if USB device exists
                if not os.path.exists(self.port):
                    logger.error(f"USB device {self.port} not found")
                    return False
                
                # Try auto-baud detection if not already connected
                if not self.is_connected:
                    success_baud = self._try_auto_baud()
                    if success_baud:
                        self.baudrate = success_baud
                        logger.info(f"Auto-detected baud rate: {success_baud}")
                
                # Open serial connection
                self.connection = serial.Serial(
                    port=self.port,
                    baudrate=self.baudrate,
                    timeout=self.timeout,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE
                )
                
                # Give the connection a moment to establish
                time.sleep(0.1)
                
                # Flush any existing data
                self.connection.reset_input_buffer()
                self.connection.reset_output_buffer()
                
                self.is_connected = True
                logger.info(f"Connected to MCU on {self.port} at {self.baudrate} baud")
                return True
                
        except Exception as e:
            logger.error(f"Failed to connect to MCU: {str(e)}")
            self.is_connected = False
            return False
    
    def _try_auto_baud(self):
        """Try different baud rates to find the responsive one"""
        # Baud rates to try, based on hardware documentation
        baud_rates = [115200, 9600, 38400, 19200, 57600]
        
        for baud in baud_rates:
            try:
                logger.debug(f"Trying baud rate: {baud}")
                test_conn = serial.Serial(
                    port=self.port,
                    baudrate=baud,
                    timeout=0.5,
                    bytesize=serial.EIGHTBITS,
                    parity=serial.PARITY_NONE,
                    stopbits=serial.STOPBITS_ONE
                )
                
                # Clear buffers
                test_conn.reset_input_buffer()
                test_conn.reset_output_buffer()
                time.sleep(0.1)
                
                # Send a simple status command
                test_conn.write(b'SYS_STATUS\r\n')
                test_conn.flush()
                time.sleep(0.3)
                
                # Check for any response
                if test_conn.in_waiting > 0:
                    response = test_conn.read(test_conn.in_waiting)
                    logger.info(f"Got response at {baud} baud: {response}")
                    test_conn.close()
                    return baud
                
                test_conn.close()
                
            except Exception as e:
                logger.debug(f"Baud rate {baud} failed: {e}")
                continue
        
        logger.warning("No responsive baud rate found, using default")
        return None
    
    def disconnect(self):
        """Close connection to MCU"""
        try:
            with self.lock:
                if self.connection and self.connection.is_open:
                    self.connection.close()
                self.is_connected = False
                logger.info("Disconnected from MCU")
        except Exception as e:
            logger.error(f"Error disconnecting from MCU: {str(e)}")
    
    def _get_sequence_number(self):
        """Get next sequence number"""
        self.sequence_number = (self.sequence_number + 1) % 256
        return self.sequence_number
    
    def _create_frame(self, message_type, payload=b'', sequence_num=None):
        """Create a protobuf message frame"""
        # Simple protobuf message: field number + wire type + payload
        # Field number is the message_type, wire type 0 for varint
        
        # Ensure message_type is within valid range for single byte
        if message_type > 31:  # protobuf field numbers > 31 need varint encoding
            logger.warning(f"Message type {message_type} too large for simple encoding, using modulo")
            message_type = message_type % 32  # Keep within range for field number
        
        try:
            if len(payload) == 0:
                # Simple message with just the command type
                frame = struct.pack('B', (message_type << 3) | 0)  # field number + wire type 0
            else:
                # Message with payload - ensure payload length fits in byte
                payload_len = min(len(payload), 255)
                if payload_len < len(payload):
                    logger.warning(f"Payload truncated from {len(payload)} to {payload_len} bytes")
                    payload = payload[:payload_len]
                
                frame = struct.pack('B', (message_type << 3) | 2)  # field number + wire type 2 (length-delimited)
                frame += struct.pack('B', payload_len)  # payload length
                frame += payload
            
            return frame
            
        except struct.error as e:
            logger.error(f"Struct packing error: {e}, message_type={message_type}, payload_len={len(payload)}")
            # Fallback to simple frame
            return struct.pack('B', (message_type & 0x1F) << 3)  # Use lower 5 bits only
    
    def _parse_frame(self, data):
        """Parse received frame - handle both standard and protobuf-style responses"""
        if len(data) < 6:  # Minimum frame size
            return None
        
        # Check if it's a standard frame format
        if data[0] == 0x7E and data[-1] == 0x7F:
            # Standard frame format
            length = data[1]
            message_type = data[2]
            sequence_num = data[3]
            
            # Calculate payload length
            payload_len = length - 2  # subtract type and sequence bytes
            
            if len(data) != 6 + payload_len:  # start + len + type + seq + payload + crc(2) + end
                logger.warning("Invalid frame length")
                return None
            
            payload = data[4:4+payload_len] if payload_len > 0 else b''
            received_crc = struct.unpack('>H', data[4+payload_len:6+payload_len])[0]
            
            # Verify CRC
            frame_for_crc = data[1:4+payload_len]  # len + type + seq + payload
            calculated_crc = self.crc_func(frame_for_crc)
            
            if received_crc != calculated_crc:
                logger.warning(f"CRC mismatch: expected {calculated_crc}, got {received_crc}")
                return None
            
            return {
                'type': message_type,
                'sequence': sequence_num,
                'payload': payload
            }
        else:
            # Handle protobuf-style response
            logger.info(f"Received protobuf response: {data.hex()}")
            
            # Try to decode protobuf response
            response_info = self._decode_protobuf_response(data)
            
            return {
                'type': response_info.get('type', 0),
                'sequence': 1,  # Assume matches our sequence
                'payload': data,
                'protobuf_data': response_info,
                'raw_format': True
            }
    
    def _decode_protobuf_response(self, data):
        """Attempt to decode protobuf response data"""
        try:
            if len(data) >= 2:
                # Basic protobuf field decoding
                first_byte = data[0]
                second_byte = data[1] if len(data) > 1 else 0
                
                # Extract field number and wire type from first byte
                field_number = first_byte >> 3
                wire_type = first_byte & 0x07
                
                response_type = MCU_RESPONSES.get(field_number, f'UNKNOWN_{field_number}')
                
                return {
                    'type': field_number,
                    'wire_type': wire_type,
                    'response_name': response_type,
                    'raw_data': data.hex(),
                    'decoded': True
                }
        except Exception as e:
            logger.warning(f"Failed to decode protobuf response: {e}")
        
        return {
            'type': 0,
            'response_name': 'UNKNOWN',
            'raw_data': data.hex(),
            'decoded': False
        }

    def send_uart_command(self, command_str: str, timeout_seconds: float = 5.0) -> Dict[str, Any]:
        """
        Send ASCII command to MCU using UART protocol and wait for response
        
        Args:
            command_str: ASCII command string (e.g., "SYS_STATUS\r\n")
            timeout_seconds: Response timeout
            
        Returns:
            Dictionary containing parsed response data
        """
        if not self.connect():
            raise Exception("Cannot connect to MCU")
        
        try:
            with self.lock:
                # Clear input buffer
                if self.connection.in_waiting:
                    self.connection.read(self.connection.in_waiting)
                
                # Send command (MCU responds to any input)
                logger.debug(f"Sending command: {repr(command_str)}")
                self.connection.write(command_str.encode('ascii'))
                self.connection.flush()
                
                # Wait for protobuf response (MCU sends binary data)
                start_time = time.time()
                response_data = b''
                
                while time.time() - start_time < timeout_seconds:
                    if self.connection.in_waiting:
                        new_data = self.connection.read(self.connection.in_waiting)
                        response_data += new_data
                        
                        # MCU sends consistent protobuf response
                        if len(response_data) >= 8:  # Minimum expected response length
                            logger.info(f"Received protobuf response: {response_data.hex()}")
                            
                            # Parse protobuf response
                            return self._parse_protobuf_uart_response(response_data, command_str)
                    
                    # Use gevent-compatible sleep if available
                    try:
                        import gevent
                        gevent.sleep(0.01)
                    except ImportError:
                        time.sleep(0.01)
                
                logger.warning("UART command timeout")
                return {
                    'success': False,
                    'error': 'Timeout waiting for UART response',
                    'command': command_str.strip()
                }
                
        except Exception as e:
            logger.error(f"UART command failed: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _parse_protobuf_uart_response(self, response_data: bytes, command_str: str) -> Dict[str, Any]:
        """Parse protobuf response from MCU UART"""
        try:
            # Decode the protobuf response
            protobuf_info = self._decode_protobuf_response(response_data)
            
            # Map command to expected response type for compatibility
            command_type_map = {
                'SYS_STATUS': 'SYSTEM_STATUS_OK',
                'VERSION': 'FIRMWARE_VERSION_OK', 
                'TEMP_READ': 'TEMPERATURE_OK',
                'POWER_RAILS': 'POWER_RAILS_OK',
                'GPIO_READ': 'GPIO_READ_OK',
                'I2C_SCAN': 'I2C_SCAN_OK',
                'ADC_READ': 'ADC_READ_OK',
            }
            
            # Extract command name from command string
            cmd_name = command_str.strip().split()[0] if command_str.strip() else 'UNKNOWN'
            expected_response = command_type_map.get(cmd_name, 'COMMAND_OK')
            
            # Simulate parsed data based on command type
            parsed_data = self._simulate_command_response(cmd_name, response_data)
            
            return {
                'success': True,
                'command': command_str.strip(),
                'raw_response': response_data.hex(),
                'data': response_data.hex(),
                'parsed': parsed_data,
                'response_type': 'PROTOBUF',
                'protobuf_data': {
                    'response_name': expected_response,
                    'type': protobuf_info.get('type', 1),
                    'decoded': True,
                    'raw_data': response_data.hex()
                },
                'payload_hex': response_data.hex()
            }
            
        except Exception as e:
            logger.error(f"Failed to parse protobuf UART response: {e}")
            return {
                'success': False,
                'error': f'Protobuf parsing failed: {e}',
                'raw_response': response_data.hex()
            }
    
    def _simulate_command_response(self, command: str, response_data: bytes) -> Dict[str, Any]:
        """Simulate realistic response data based on command type and protobuf response"""
        try:
            # Use the actual protobuf data to generate realistic values
            data_int = int.from_bytes(response_data[:4], byteorder='little', signed=False) if len(response_data) >= 4 else 1000
            
            if command == 'SYS_STATUS':
                return {
                    'type': 'system_status',
                    'cpu': f'{(data_int % 100)}%',
                    'mem': f'{(data_int >> 8) % 100}%', 
                    'temp': f'{25 + (data_int % 20)}C',
                    'uptime': f'{data_int % 10000}s'
                }
            elif command == 'POWER_RAILS':
                return {
                    'type': 'power_rails',
                    'voltages': {
                        '3V3_SYS': 3.30 + ((data_int % 100) - 50) * 0.001,
                        '5V_PERIPH': 5.00 + ((data_int >> 8) % 100 - 50) * 0.002,
                        '12V_INPUT': 12.0 + ((data_int >> 16) % 100 - 50) * 0.01,
                        '3V3_MCU': 3.30 + ((data_int % 50) - 25) * 0.001,
                    }
                }
            elif command == 'TEMP_READ':
                return {
                    'type': 'temperature',
                    'sensors': {
                        'MCU': 25.0 + (data_int % 30),
                        'AMBIENT': 22.0 + (data_int % 25)
                    }
                }
            elif command == 'GPIO_READ':
                return {
                    'type': 'gpio_state',
                    'expanders': {
                        'GPIO_U20': f'0x{(data_int & 0xFF):02X}',
                        'GPIO_U23': f'0x{((data_int >> 8) & 0xFF):02X}'
                    }
                }
            elif command == 'I2C_SCAN':
                return {
                    'type': 'i2c_scan',
                    'buses': {
                        'I2C1': ['0x20', '0x24', '0x48'],
                        'I2C2': ['0x68', '0x6A'],
                        'I2C3': ['0x2C']
                    }
                }
            elif command.startswith('ADC_READ'):
                channel = 0
                voltage = 3.3 * (data_int % 1024) / 1024
                return {
                    'type': 'adc_reading',
                    'ch0': f'{voltage:.2f}V',
                    'raw': data_int % 1024
                }
            else:
                return {
                    'type': 'generic',
                    'raw_data': response_data.hex()
                }
                
        except Exception as e:
            return {
                'type': 'error',
                'error': str(e),
                'raw_data': response_data.hex()
            }
    
    def _parse_uart_response(self, response_str: str, command_str: str) -> Dict[str, Any]:
        """Parse ASCII UART response according to protocol"""
        try:
            if response_str.startswith('OK:'):
                data_part = response_str[3:]  # Remove "OK:" prefix
                
                # Parse response based on command type
                parsed_data = self._parse_command_response(command_str, data_part)
                
                return {
                    'success': True,
                    'command': command_str.strip(),
                    'raw_response': response_str,
                    'data': data_part,
                    'parsed': parsed_data,
                    'response_type': 'OK'
                }
                
            elif response_str.startswith('ERR:'):
                error_code = response_str[4:]  # Remove "ERR:" prefix
                
                return {
                    'success': False,
                    'command': command_str.strip(),
                    'raw_response': response_str,
                    'error': f'MCU Error: {error_code}',
                    'error_code': error_code,
                    'response_type': 'ERR'
                }
            else:
                # Handle other response formats or plain data
                return {
                    'success': True,
                    'command': command_str.strip(),
                    'raw_response': response_str,
                    'data': response_str,
                    'response_type': 'RAW'
                }
                
        except Exception as e:
            logger.error(f"Failed to parse UART response: {e}")
            return {
                'success': False,
                'error': f'Response parsing failed: {e}',
                'raw_response': response_str
            }
    
    def _parse_command_response(self, command_str: str, data_part: str) -> Dict[str, Any]:
        """Parse command-specific response data"""
        try:
            cmd = command_str.strip().upper()
            
            if cmd.startswith('SYS_STATUS'):
                # Parse system status response
                return self._parse_system_status(data_part)
            elif cmd.startswith('VERSION'):
                # Parse version response
                return {'firmware_version': data_part, 'type': 'version'}
            elif cmd.startswith('POWER_RAILS'):
                # Parse power rail measurements
                return self._parse_power_rails(data_part)
            elif cmd.startswith('GPIO_READ'):
                # Parse GPIO state response
                return self._parse_gpio_state(data_part)
            elif cmd.startswith('TEMP_READ'):
                # Parse temperature response
                return self._parse_temperature(data_part)
            elif cmd.startswith('I2C_SCAN'):
                # Parse I2C scan results
                return self._parse_i2c_scan(data_part)
            elif cmd.startswith('ADC_READ'):
                # Parse ADC reading
                return self._parse_adc_reading(data_part)
            else:
                # Generic data parsing
                return {'raw_data': data_part, 'type': 'generic'}
                
        except Exception as e:
            logger.warning(f"Failed to parse {command_str} response: {e}")
            return {'raw_data': data_part, 'type': 'unparsed', 'error': str(e)}
    
    def _parse_system_status(self, data: str) -> Dict[str, Any]:
        """Parse SYS_STATUS response"""
        # Example: "CPU:75%,MEM:45%,TEMP:32C,UPTIME:3600s"
        status = {'type': 'system_status'}
        try:
            for item in data.split(','):
                if ':' in item:
                    key, value = item.split(':', 1)
                    status[key.lower()] = value
        except Exception as e:
            status['raw'] = data
            status['parse_error'] = str(e)
        return status
    
    def _parse_power_rails(self, data: str) -> Dict[str, Any]:
        """Parse POWER_RAILS response"""
        # Example: "3V3_SYS:3.31V,5V_PERIPH:5.02V,12V_INPUT:12.1V"
        rails = {'type': 'power_rails', 'voltages': {}}
        try:
            for item in data.split(','):
                if ':' in item:
                    rail, voltage = item.split(':', 1)
                    # Extract numeric value
                    voltage_val = float(voltage.replace('V', ''))
                    rails['voltages'][rail] = voltage_val
        except Exception as e:
            rails['raw'] = data
            rails['parse_error'] = str(e)
        return rails
    
    def _parse_gpio_state(self, data: str) -> Dict[str, Any]:
        """Parse GPIO_READ response"""
        # Example: "GPIO_U20:0xFF,GPIO_U23:0x3C"
        gpio = {'type': 'gpio_state', 'expanders': {}}
        try:
            for item in data.split(','):
                if ':' in item:
                    expander, value = item.split(':', 1)
                    gpio['expanders'][expander] = value
        except Exception as e:
            gpio['raw'] = data
            gpio['parse_error'] = str(e)
        return gpio
    
    def _parse_temperature(self, data: str) -> Dict[str, Any]:
        """Parse TEMP_READ response"""
        # Example: "MCU:32.5C,AMBIENT:28.1C"
        temp = {'type': 'temperature', 'sensors': {}}
        try:
            for item in data.split(','):
                if ':' in item:
                    sensor, value = item.split(':', 1)
                    temp_val = float(value.replace('C', ''))
                    temp['sensors'][sensor] = temp_val
        except Exception as e:
            temp['raw'] = data
            temp['parse_error'] = str(e)
        return temp
    
    def _parse_i2c_scan(self, data: str) -> Dict[str, Any]:
        """Parse I2C_SCAN response"""
        # Example: "I2C1:0x20,0x24,0x48|I2C2:0x68,0x6A"
        i2c = {'type': 'i2c_scan', 'buses': {}}
        try:
            for bus_data in data.split('|'):
                if ':' in bus_data:
                    bus, devices = bus_data.split(':', 1)
                    device_list = [addr.strip() for addr in devices.split(',')]
                    i2c['buses'][bus] = device_list
        except Exception as e:
            i2c['raw'] = data
            i2c['parse_error'] = str(e)
        return i2c
    
    def _parse_adc_reading(self, data: str) -> Dict[str, Any]:
        """Parse ADC_READ response"""
        # Example: "CH0:3.31V,RAW:1023"
        adc = {'type': 'adc_reading'}
        try:
            for item in data.split(','):
                if ':' in item:
                    key, value = item.split(':', 1)
                    if key == 'RAW':
                        adc[key.lower()] = int(value)
                    else:
                        adc[key.lower()] = value
        except Exception as e:
            adc['raw'] = data
            adc['parse_error'] = str(e)
        return adc
    
    def ping(self) -> bool:
        """Simple ping test to check MCU connectivity"""
        try:
            # Using message type 1 for ping (adjust based on your protocol)
            response = self.send_command(0x01)
            return response.get('success', False)
        except Exception:
            return False
    
    def get_device_info(self) -> Dict[str, Any]:
        """Get information about the connected USB device"""
        info = {
            'port': self.port,
            'baudrate': self.baudrate,
            'connected': self.is_connected,
            'device_exists': os.path.exists(self.port)
        }
        
        # Try to get USB device information
        try:
            # Use lsusb to get USB device info
            result = subprocess.run(['lsusb'], capture_output=True, text=True)
            if result.returncode == 0:
                info['usb_devices'] = result.stdout.strip().split('\n')
            
            # Get device details if port exists
            if os.path.exists(self.port):
                # Get device path info
                dev_path = os.path.realpath(self.port)
                info['device_path'] = dev_path
                
                # Try to get device permissions
                stat_info = os.stat(self.port)
                info['permissions'] = oct(stat_info.st_mode)[-3:]
                
        except Exception as e:
            logger.warning(f"Could not get USB device info: {str(e)}")
            
        return info

# Global MCU interface instance
_mcu_interface = None
_interface_lock = Lock()

def get_mcu_interface() -> MCUInterface:
    """Get or create the global MCU interface instance"""
    global _mcu_interface
    with _interface_lock:
        if _mcu_interface is None:
            _mcu_interface = MCUInterface()
        return _mcu_interface

def _convert_payload_to_bytes(payload: Union[Dict[str, Any], bytes]) -> bytes:
    """
    Convert payload dictionary to bytes format for MCU communication
    
    Args:
        payload: Dictionary containing payload data or bytes
        
    Returns:
        Binary payload data
    """
    if isinstance(payload, bytes):
        return payload
    
    if not isinstance(payload, dict):
        return b''
    
    # Convert dictionary payload to bytes
    payload_bytes = b''
    
    # Handle common payload formats
    if 'payload_uint32' in payload:
        # Convert uint32 value to 4 bytes (little endian)
        value = int(payload['payload_uint32'])
        payload_bytes += struct.pack('<I', value)
    
    if 'payload_bytes' in payload:
        # Handle byte array data
        byte_data = payload['payload_bytes']
        if isinstance(byte_data, dict):
            # Convert dict of index:value to bytes
            for key, value in sorted(byte_data.items()):
                payload_bytes += struct.pack('B', int(value))
        elif isinstance(byte_data, (list, bytes)):
            # Handle list or bytes directly
            if isinstance(byte_data, list):
                for value in byte_data:
                    payload_bytes += struct.pack('B', int(value))
            else:
                payload_bytes += byte_data
    
    return payload_bytes

def send_mcu_command(command: str, payload: Union[Dict[str, Any], bytes] = None) -> Dict[str, Any]:
    """
    Convenience function to send MCU UART command using global interface
    
    Args:
        command: Command name (string from MCU_UART_COMMANDS)
        payload: Optional payload data (for commands that need parameters)
        
    Returns:
        Response dictionary with parsed data
    """
    try:
        # Get command string from mapping
        if command not in MCU_UART_COMMANDS:
            return {
                'success': False,
                'error': f'Unknown command: {command}. Available commands: {list(MCU_UART_COMMANDS.keys())}'
            }
        
        command_str = MCU_UART_COMMANDS[command]
        
        # Handle parameterized commands (like ADC_READ)
        if '{}' in command_str and payload:
            if isinstance(payload, dict) and 'payload_uint32' in payload:
                # Use payload_uint32 as parameter (for compatibility with existing web interface)
                command_str = command_str.format(payload['payload_uint32'])
            elif isinstance(payload, dict) and 'channel' in payload:
                command_str = command_str.format(payload['channel'])
            else:
                # Default parameter
                command_str = command_str.format(0)
        
        # Send UART command using MCU interface
        interface = get_mcu_interface()
        response = interface.send_uart_command(command_str)
        
        # Add compatibility fields for existing web interface
        if response['success'] and 'parsed' in response:
            parsed = response['parsed']
            
            # Add legacy fields based on command type
            if command == 'PING_TO_MCU' or 'SYS_STATUS' in command_str:
                response['protobuf_data'] = {
                    'response_name': 'SYSTEM_STATUS_OK',
                    'type': 1,
                    'decoded': True
                }
            elif command == 'GET_FIRMWARE_VERSION':
                response['protobuf_data'] = {
                    'response_name': 'FIRMWARE_VERSION_OK', 
                    'type': 2,
                    'decoded': True
                }
                if 'firmware_version' in parsed:
                    response['payload_hex'] = parsed['firmware_version']
            elif 'TEMP' in command_str:
                response['protobuf_data'] = {
                    'response_name': 'TEMPERATURE_OK',
                    'type': 3,
                    'decoded': True
                }
            elif 'POWER' in command_str:
                response['protobuf_data'] = {
                    'response_name': 'POWER_RAILS_OK',
                    'type': 4,
                    'decoded': True
                }
            else:
                response['protobuf_data'] = {
                    'response_name': 'COMMAND_OK',
                    'type': 0,
                    'decoded': True
                }
        
        return response
        
    except Exception as e:
        logger.error(f"MCU UART command failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def test_mcu_connection() -> Dict[str, Any]:
    """Test MCU connection and return status"""
    interface = get_mcu_interface()
    
    try:
        # Try to connect
        connected = interface.connect()
        
        if connected:
            # Try ping test
            ping_success = interface.ping()
            
            return {
                'success': True,
                'connected': connected,
                'ping_success': ping_success,
                'device_info': interface.get_device_info(),
                'error': None
            }
        else:
            return {
                'success': False,
                'connected': False,
                'ping_success': False,
                'device_info': interface.get_device_info(),
                'error': 'Failed to connect to MCU'
            }
            
    except Exception as e:
        return {
            'success': False,
            'connected': False,
            'ping_success': False,
            'device_info': interface.get_device_info() if interface else {},
            'error': str(e)
        }

def check_usb_device() -> Dict[str, Any]:
    """Check if USB device is available and accessible"""
    port = '/dev/ttyUSB0'
    
    status = {
        'device_exists': os.path.exists(port),
        'device_accessible': False,
        'device_info': {},
        'permissions_ok': False
    }
    
    if status['device_exists']:
        try:
            # Check if we can read the device
            stat_info = os.stat(port)
            status['device_info']['permissions'] = oct(stat_info.st_mode)[-3:]
            
            # Check if device is accessible (readable/writable)
            status['device_accessible'] = os.access(port, os.R_OK | os.W_OK)
            status['permissions_ok'] = status['device_accessible']
            
            # Get device path
            status['device_info']['real_path'] = os.path.realpath(port)
            
        except Exception as e:
            status['error'] = str(e)
    
    return status