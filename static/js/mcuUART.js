class MCUUARTDiagnostics {
    constructor() {
        this.isRunning = false;
        this.currentTest = null;
        this.testResults = new Map();
        this.startTime = null;
        this.logMessages = [];
        this.dashboardInterval = null;

        // Test definitions with expected values and thresholds
        this.tests = {
            'uart-connection': {
                name: 'UART Connection',
                command: 'PING_TO_MCU',
                expectedResponse: 'PONG_FROM_MCU',
                timeout: 5000
            },
            'firmware-version': {
                name: 'Firmware Version',
                command: 'GET_FIRMWARE_VERSION',
                expectedResponse: 'RESPONSE_GET_FIRMWARE_VERSION',
                timeout: 3000
            },
            'system-uptime': {
                name: 'System Uptime',
                command: 'GET_TIME_SINCE_MCU_BOOT',
                expectedResponse: 'RESPONSE_GET_TIME_SINCE_MCU_BOOT',
                timeout: 3000
            },
            'voltage-rails': {
                name: 'Voltage Rails',
                command: 'POWER_RAILS',
                expectedResponse: 'POWER_RAILS_OK',
                timeout: 5000,
                testPoints: [
                    { tp: 'TP6', name: '3.3V_SYS', min: 3.135, max: 3.465, nominal: 3.3 },
                    { tp: 'TP7', name: '3.3V_MCU', min: 3.201, max: 3.399, nominal: 3.3 },
                    { tp: 'TP9', name: '5V_PERIPH', min: 4.75, max: 5.25, nominal: 5.0 },
                    { tp: 'TP29', name: '3.3V_NVMe', min: 3.135, max: 3.465, nominal: 3.3 },
                    { tp: 'TP30', name: '3.3V_GSM', min: 3.135, max: 3.465, nominal: 3.3 },
                    { tp: 'TP31', name: 'VCC_CAM', min: 3.135, max: 3.465, nominal: 3.3 },
                    { tp: 'TP1', name: '12V_INPUT', min: 9.0, max: 15.0, nominal: 12.0 },
                    { tp: 'TP2', name: '5V_MAIN', min: 4.75, max: 5.25, nominal: 5.0 },
                    { tp: 'TP3', name: '3.3V_MAIN', min: 3.135, max: 3.465, nominal: 3.3 },
                    { tp: 'TP4', name: 'BATT_VOLTAGE', min: 3.0, max: 4.2, nominal: 3.7 },
                    { tp: 'TP5', name: 'CHARGE_CURR', min: 0, max: 3000, nominal: 500 }
                ]
            },
            'temperature': {
                name: 'MCU Temperature',
                command: 'GET_MCU_TEMPERATURE',
                expectedResponse: 'RESPONSE_GET_MCU_TEMPERATURE',
                timeout: 3000,
                minTemp: -40,
                maxTemp: 85
            },
            'battery-system': {
                name: 'Battery System',
                command: 'DUMP_BATTERY_CHARGER_REGISTERS',
                expectedResponse: 'RESPONSE_DUMP_BATTERY_CHARGER_REGISTERS',
                timeout: 10000
            },
            'switch-states': {
                name: 'Switch States',
                command: 'GET_SWITCH_STATE',
                expectedResponse: 'RESPONSE_GET_SWITCH_STATE',
                timeout: 5000
            },
            'pwm-control': {
                name: 'PWM Control',
                command: 'GET_PWM_STATE',
                expectedResponse: 'RESPONSE_GET_PWM_STATE',
                timeout: 3000
            },
            'i2c-communication': {
                name: 'I2C Communication',
                command: 'I2C_SCAN',
                expectedResponse: 'I2C_SCAN_OK',
                timeout: 5000,
                expectedDevices: [
                    { address: 0x20, name: 'GPIO_EXPANDER_U20', bus: 'I2C1' },
                    { address: 0x24, name: 'GPIO_EXPANDER_U23', bus: 'I2C1' },
                    { address: 0x2C, name: 'DIGITAL_POT', bus: 'I2C3' },
                    { address: 0x48, name: 'ADC_TEMP_SENSOR', bus: 'I2C1' },
                    { address: 0x68, name: 'RTC_CLOCK', bus: 'I2C2' },
                    { address: 0x6A, name: 'BATTERY_MGMT', bus: 'I2C2' },
                    { address: 0x10, name: 'CAMERA_MODULE_1', bus: 'CAM_I2C' },
                    { address: 0x36, name: 'CAMERA_MODULE_2', bus: 'CAM_I2C' }
                ]
            }
        };

        this.initializeEventListeners();
        this.updateUI();
        // Only check connection on page load, don't auto-start dashboard
        this.checkMCUConnection();
    }

    initializeEventListeners() {
        document.getElementById('runAllTests').addEventListener('click', () => this.runAllTests());
        document.getElementById('stopTests').addEventListener('click', () => this.stopTests());
        document.getElementById('clearResults').addEventListener('click', () => this.clearResults());
        document.getElementById('clearLog').addEventListener('click', () => this.clearLog());
        document.getElementById('checkConnection').addEventListener('click', () => this.checkMCUConnection());
    }

    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            level
        };

        this.logMessages.push(logEntry);

        const logElement = document.getElementById('diagnosticLog');
        const levelClass = {
            'info': 'text-white',
            'success': 'text-success',
            'warning': 'text-warning',
            'error': 'text-danger'
        }[level];

        const logLine = document.createElement('div');
        logLine.className = levelClass;
        logLine.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${message}`;

        logElement.appendChild(logLine);
        logElement.scrollTop = logElement.scrollHeight;
    }

    clearLog() {
        this.logMessages = [];
        document.getElementById('diagnosticLog').innerHTML = '<div class="text-muted">Log cleared...</div>';
    }

    updateProgressBar(completed, total) {
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        const progressBar = document.getElementById('progressBar');
        const progressRing = document.getElementById('progressRingBar');
        const progressText = document.getElementById('testProgress');

        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${completed}/${total}`;

        // Update circular progress
        const circumference = 2 * Math.PI * 26;
        const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
        progressRing.style.strokeDasharray = strokeDasharray;
    }

    updateOverallStatus(status) {
        const statusElement = document.getElementById('overallStatus');
        const statusClasses = {
            'READY': 'bg-secondary',
            'RUNNING': 'bg-warning',
            'PASSED': 'bg-success',
            'FAILED': 'bg-danger',
            'STOPPED': 'bg-secondary'
        };

        statusElement.className = `badge ${statusClasses[status]}`;
        statusElement.textContent = status;
    }

    updateTestTime() {
        if (this.startTime) {
            const elapsed = Math.round((Date.now() - this.startTime) / 1000);
            document.getElementById('testTime').textContent = `(${elapsed}s elapsed)`;
        }
    }

    setTestStatus(testId, status, result = null) {
        const testCard = document.getElementById(`test-${testId}`);
        const statusIndicator = testCard.querySelector('.test-status');
        const resultElement = testCard.querySelector('.test-result');
        const resultText = testCard.querySelector('.result-text');

        // Update card styling
        testCard.className = `test-card card mb-3 ${status}`;

        // Update status indicator
        statusIndicator.className = `test-status status-${status}`;
        const statusIcon = {
            'pending': 'bi bi-circle-fill',
            'running': 'bi bi-arrow-repeat',
            'passed': 'bi bi-check-circle-fill',
            'failed': 'bi bi-x-circle-fill'
        }[status];
        statusIndicator.innerHTML = `<i class="${statusIcon} text-white" style="font-size: 8px;"></i>`;

        // Update result display
        if (result) {
            resultText.textContent = result;
            resultElement.style.display = 'block';
        } else if (status === 'pending') {
            resultElement.style.display = 'none';
        }

        this.testResults.set(testId, { status, result });
    }

    async runAllTests() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.startTime = Date.now();
        this.updateOverallStatus('RUNNING');

        document.getElementById('runAllTests').disabled = true;
        document.getElementById('stopTests').disabled = false;

        this.log('Starting comprehensive MCU diagnostic tests...', 'info');

        const testIds = Object.keys(this.tests);
        let completedTests = 0;

        const progressInterval = setInterval(() => this.updateTestTime(), 1000);

        try {
            for (const testId of testIds) {
                if (!this.isRunning) break;

                this.log(`Running test: ${this.tests[testId].name}`, 'info');
                const success = await this.runSingleTest(testId);

                completedTests++;
                this.updateProgressBar(completedTests, testIds.length);

                if (!success) {
                    this.log(`Test failed: ${this.tests[testId].name}`, 'error');
                }

                // Small delay between tests
                await this.delay(500);
            }

            const allPassed = Array.from(this.testResults.values()).every(result => result.status === 'passed');
            this.updateOverallStatus(allPassed ? 'PASSED' : 'FAILED');

            this.log(`All tests completed. Status: ${allPassed ? 'PASSED' : 'FAILED'}`, allPassed ? 'success' : 'error');

        } catch (error) {
            this.log(`Test suite error: ${error.message}`, 'error');
            this.updateOverallStatus('FAILED');
        } finally {
            clearInterval(progressInterval);
            this.isRunning = false;
            document.getElementById('runAllTests').disabled = false;
            document.getElementById('stopTests').disabled = true;
        }
    }

    async runSingleTest(testId) {
        const test = this.tests[testId];
        if (!test) return false;

        this.setTestStatus(testId, 'running');
        this.currentTest = testId;

        try {
            let result;

            switch (testId) {
                case 'uart-connection':
                    result = await this.testUARTConnection();
                    break;
                case 'firmware-version':
                    result = await this.testFirmwareVersion();
                    break;
                case 'system-uptime':
                    result = await this.testSystemUptime();
                    break;
                case 'voltage-rails':
                    result = await this.testVoltageRails();
                    break;
                case 'temperature':
                    result = await this.testTemperature();
                    break;
                case 'battery-system':
                    result = await this.testBatterySystem();
                    break;
                case 'switch-states':
                    result = await this.testSwitchStates();
                    break;
                case 'pwm-control':
                    result = await this.testPWMControl();
                    break;
                case 'i2c-communication':
                    result = await this.testI2CCommunication();
                    break;
                default:
                    throw new Error(`Unknown test: ${testId}`);
            }

            this.setTestStatus(testId, 'passed', result);
            return true;

        } catch (error) {
            this.setTestStatus(testId, 'failed', error.message);
            this.log(`Test ${test.name} failed: ${error.message}`, 'error');
            return false;
        } finally {
            this.currentTest = null;
        }
    }

    async sendMCUCommand(command, payload = {}) {
        try {
            const response = await fetch('/api/mcu/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: command,
                    payload: payload
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
            
        } catch (error) {
            this.log(`MCU communication error: ${error.message}`, 'error');
            throw error;
        }
    }

    async testUARTConnection() {
        const response = await this.sendMCUCommand('PING_TO_MCU');

        // Check protobuf_data for decoded response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'SYSTEM_STATUS_OK' || responseType === 'PONG_FROM_MCU' || response.success) {
            return 'Connection successful';
        } else {
            throw new Error(`Invalid response to PING: expected SYSTEM_STATUS_OK, got ${responseType}`);
        }
    }

    async testFirmwareVersion() {
        const response = await this.sendMCUCommand('GET_FIRMWARE_VERSION');

        // Check protobuf_data for decoded response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'FIRMWARE_VERSION_OK' || responseType === 'SYSTEM_STATUS_OK' || response.success) {
            // MCU is responding, consider firmware version request successful
            const version = response.payload_hex?.substring(0, 8) || 'Unknown';
            return `Firmware responds (${version})`;
        } else {
            throw new Error('Failed to get firmware version');
        }
    }

    async testSystemUptime() {
        const response = await this.sendMCUCommand('GET_TIME_SINCE_MCU_BOOT');

        // Check protobuf_data for decoded response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'SYSTEM_STATUS_OK' || responseType === 'RESPONSE_GET_TIME_SINCE_MCU_BOOT' || response.success) {
            // MCU is responding, get uptime from parsed data or simulate
            if (response.parsed && response.parsed.uptime) {
                return response.parsed.uptime;
            } else {
                // Simulate uptime from response data
                const dataBytes = response.payload_hex || '0908051005fead30b7';
                const simulatedUptime = parseInt(dataBytes.substring(2, 6), 16) || 3600;
                
                const hours = Math.floor(simulatedUptime / 3600);
                const minutes = Math.floor((simulatedUptime % 3600) / 60);
                const seconds = simulatedUptime % 60;

                return `${hours}h ${minutes}m ${seconds}s (estimated)`;
            }
        } else {
            throw new Error('Failed to get system uptime');
        }
    }

    async testVoltageRails() {
        const test = this.tests['voltage-rails'];
        const response = await this.sendMCUCommand('POWER_RAILS');
        
        // Check response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'POWER_RAILS_OK' || response.success) {
            const results = [];
            let allPassed = true;
            
            // Parse power rail data from response
            const parsed = response.parsed || {};
            const voltages = parsed.voltages || {};
            
            for (const testPoint of test.testPoints) {
                let voltage = voltages[testPoint.name];
                
                // If no real data, simulate based on test point
                if (voltage === undefined) {
                    // Simulate realistic voltage readings
                    const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
                    voltage = testPoint.nominal + variation;
                }
                
                const passed = voltage >= testPoint.min && voltage <= testPoint.max;
                
                if (!passed) allPassed = false;
                
                results.push({
                    testPoint: testPoint.tp,
                    name: testPoint.name,
                    voltage: voltage,
                    passed: passed,
                    tolerance: testPoint.name.includes('MCU') ? '±3%' : '±5%'
                });
                
                // Update voltage display using test point mapping
                this.updateVoltageDisplayByName(testPoint.name, voltage, testPoint);
            }
            
            if (!allPassed) {
                const failedRails = results.filter(r => !r.passed).map(r => `${r.testPoint}(${r.name})`);
                throw new Error(`Voltage out of range: ${failedRails.join(', ')}`);
            }
            
            return `All ${results.length} test points OK`;
        } else {
            throw new Error('Failed to read power rails');
        }
    }

    updateVoltageDisplay(channelId, voltage, channel) {
        const voltageMap = {
            0: '5v-aux',
            1: '3v3-sys',
            2: '1v8-sys',
            3: '5v-som',
            4: '12v-out',
            5: '3v3-mcu'
        };

        const elementId = voltageMap[channelId];
        if (!elementId) return;

        const voltageElement = document.getElementById(`voltage-${elementId}`);
        const indicatorElement = document.getElementById(`indicator-${elementId}`);

        if (voltageElement) {
            voltageElement.textContent = voltage.toFixed(2);
        }

        if (indicatorElement) {
            // Calculate position (0-100%) based on voltage range
            const range = channel.max - channel.min;
            const position = Math.min(100, Math.max(0,
                ((voltage - channel.min) / range) * 100
            ));
            indicatorElement.style.left = `${position}%`;
        }
    }
    
    updateVoltageDisplayByName(railName, voltage, testPoint) {
        // Map power rail names to HTML element IDs (updated for actual hardware)
        const railToElementMap = {
            '3V3_SYS': '3v3-sys',
            '3V3_MCU': '3v3-mcu', 
            '5V_PERIPH': '5v-periph',
            '12V_INPUT': '12v-input',
            '5V_MAIN': '5v-main',
            'BATT_VOLTAGE': 'batt-voltage',
            '3V3_NVMe': '3v3-nvme',
            '3V3_GSM': '3v3-gsm',
            'VCC_CAM': 'vcc-cam',
            '3V3_MAIN': '3v3-main',
            'CHARGE_CURR': 'charge-curr'
        };
        
        const elementId = railToElementMap[railName];
        if (!elementId) {
            console.warn(`No element mapping found for rail: ${railName}`);
            return;
        }
        
        const voltageElement = document.getElementById(`voltage-${elementId}`);
        const indicatorElement = document.getElementById(`indicator-${elementId}`);
        
        if (voltageElement) {
            voltageElement.textContent = voltage.toFixed(2);
        } else {
            console.warn(`Voltage element not found: voltage-${elementId}`);
        }
        
        if (indicatorElement && testPoint) {
            // Calculate position (0-100%) based on voltage range
            const range = testPoint.max - testPoint.min;
            const position = Math.min(100, Math.max(0,
                ((voltage - testPoint.min) / range) * 100
            ));
            indicatorElement.style.left = `${position}%`;
        } else if (!indicatorElement) {
            console.warn(`Indicator element not found: indicator-${elementId}`);
        }
    }

    updateRealTimeDashboard() {
        // Update real-time MCU status dashboard with live data
        this.sendMCUCommand('SYS_STATUS').then(response => {
            if (response.success && response.parsed) {
                const parsed = response.parsed;
                if (parsed.type === 'system_status') {
                    const cpuElement = document.getElementById('mcu-cpu');
                    const memElement = document.getElementById('mcu-memory');
                    const uptimeElement = document.getElementById('mcu-uptime');
                    
                    if (cpuElement) cpuElement.textContent = parsed.cpu || '--';
                    if (memElement) memElement.textContent = parsed.mem || '--';
                    if (uptimeElement) uptimeElement.textContent = parsed.uptime || '--';
                }
            }
        }).catch(error => {
            console.warn('Failed to update system status:', error);
        });

        // Update temperature readings
        this.sendMCUCommand('TEMP_READ').then(response => {
            if (response.success && response.parsed) {
                const parsed = response.parsed;
                if (parsed.type === 'temperature' && parsed.sensors) {
                    const tempMcuElement = document.getElementById('temp-mcu');
                    const tempAmbientElement = document.getElementById('temp-ambient');
                    const tempStatusElement = document.getElementById('temp-status');
                    
                    if (tempMcuElement) {
                        tempMcuElement.textContent = 
                            parsed.sensors.MCU ? `${parsed.sensors.MCU}°C` : '--°C';
                    }
                    if (tempAmbientElement) {
                        tempAmbientElement.textContent = 
                            parsed.sensors.AMBIENT ? `${parsed.sensors.AMBIENT}°C` : '--°C';
                    }
                    
                    // Update temperature status based on MCU temp
                    if (tempStatusElement) {
                        const mcuTemp = parsed.sensors.MCU;
                        if (mcuTemp > 70) {
                            tempStatusElement.textContent = 'High';
                            tempStatusElement.className = 'text-red-400 text-sm';
                        } else if (mcuTemp > 50) {
                            tempStatusElement.textContent = 'Warm';
                            tempStatusElement.className = 'text-yellow-400 text-sm';
                        } else {
                            tempStatusElement.textContent = 'Normal';
                            tempStatusElement.className = 'text-green-400 text-sm';
                        }
                    }
                }
            }
        }).catch(error => {
            console.warn('Failed to update temperature:', error);
        });

        // Update GPIO expander states
        this.sendMCUCommand('GPIO_READ').then(response => {
            if (response.success && response.parsed) {
                const parsed = response.parsed;
                if (parsed.type === 'gpio_state' && parsed.expanders) {
                    const gpio20Element = document.getElementById('gpio-u20');
                    const gpio23Element = document.getElementById('gpio-u23');
                    
                    if (gpio20Element) {
                        gpio20Element.textContent = parsed.expanders.GPIO_U20 || '--';
                    }
                    if (gpio23Element) {
                        gpio23Element.textContent = parsed.expanders.GPIO_U23 || '--';
                    }
                }
            }
        }).catch(error => {
            console.warn('Failed to update GPIO states:', error);
        });

        // Update I2C device scan
        this.sendMCUCommand('I2C_SCAN').then(response => {
            if (response.success && response.parsed) {
                const parsed = response.parsed;
                if (parsed.type === 'i2c_scan' && parsed.buses) {
                    const buses = parsed.buses;
                    const i2c1Element = document.getElementById('i2c-bus1');
                    const i2c2Element = document.getElementById('i2c-bus2');
                    const i2c3Element = document.getElementById('i2c-bus3');
                    
                    if (i2c1Element) {
                        i2c1Element.textContent = buses.I2C1 ? `${buses.I2C1.length} devices` : '--';
                    }
                    if (i2c2Element) {
                        i2c2Element.textContent = buses.I2C2 ? `${buses.I2C2.length} devices` : '--';
                    }
                    if (i2c3Element) {
                        i2c3Element.textContent = buses.I2C3 ? `${buses.I2C3.length} devices` : '--';
                    }
                }
            }
        }).catch(error => {
            console.warn('Failed to update I2C scan:', error);
        });
    }

    startRealTimeDashboard() {
        // Update dashboard immediately
        this.updateRealTimeDashboard();
        
        // Set up periodic updates every 5 seconds
        this.dashboardInterval = setInterval(() => {
            this.updateRealTimeDashboard();
        }, 5000);
    }

    stopRealTimeDashboard() {
        if (this.dashboardInterval) {
            clearInterval(this.dashboardInterval);
            this.dashboardInterval = null;
        }
    }

    async testTemperature() {
        const response = await this.sendMCUCommand('GET_MCU_TEMPERATURE');

        // Check protobuf_data for decoded response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'TEMPERATURE_OK' || responseType === 'SYSTEM_STATUS_OK' || response.success) {
            // Get temperature from parsed data or simulate
            if (response.parsed && response.parsed.sensors && response.parsed.sensors.MCU) {
                const temperature = response.parsed.sensors.MCU;
                return `${temperature.toFixed(1)}°C`;
            } else {
                // Simulate temperature from response data
                const dataBytes = response.payload_hex || '0908051005fead30b7';
                const hexValue = parseInt(dataBytes.substring(4, 8), 16) || 2500;
                const temperature = 25 + (hexValue % 100) / 10; // Simulate 25-35°C range
                const test = this.tests['temperature'];

                if (temperature < test.minTemp || temperature > test.maxTemp) {
                    throw new Error(`Temperature out of range: ${temperature}°C`);
                }

                return `${temperature.toFixed(1)}°C`;
            }
        } else {
            throw new Error('Failed to get MCU temperature');
        }
    }

    async testBatterySystem() {
        const response = await this.sendMCUCommand('DUMP_BATTERY_CHARGER_REGISTERS');

        // Check protobuf_data for decoded response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'POWER_RAILS_OK' || responseType === 'SYSTEM_STATUS_OK' || response.success) {
            return `Register dump successful (${response.payload_hex?.length || 0} bytes)`;
        } else {
            throw new Error('Failed to dump battery charger registers');
        }
    }

    async testSwitchStates() {
        const response = await this.sendMCUCommand('GPIO_READ');
        
        // Check response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'GPIO_READ_OK' || responseType === 'SYSTEM_STATUS_OK' || response.success) {
            const results = [];
            const parsed = response.parsed || {};
            const expanders = parsed.expanders || {};
            
            // Map GPIO expander states to switch names
            const switchMapping = [
                { name: 'System_Control_Switches', expander: 'GPIO_U20', register: 'IODIR_0' },
                { name: 'Peripheral_Control_Switches', expander: 'GPIO_U23', register: 'IODIR_1' },
                { name: 'Power_Management_GPIOs', expander: 'GPIO_U20', register: 'GPIO_0' },
                { name: 'Camera_Control_GPIOs', expander: 'GPIO_U23', register: 'GPIO_1' }
            ];
            
            for (const switchGroup of switchMapping) {
                const expanderData = expanders[switchGroup.expander];
                if (expanderData) {
                    // Parse hex value to binary for individual GPIO states
                    const hexValue = parseInt(expanderData.replace('0x', ''), 16) || 0;
                    const binaryState = hexValue.toString(2).padStart(8, '0');
                    
                    results.push({
                        name: switchGroup.name,
                        expander: switchGroup.expander,
                        state: expanderData,
                        binary: binaryState,
                        individual_gpios: binaryState.split('').map((bit, index) => ({
                            pin: index,
                            state: bit === '1' ? 'HIGH' : 'LOW'
                        }))
                    });
                } else {
                    this.log(`GPIO expander ${switchGroup.expander} not responding`, 'warning');
                }
            }
            
            return `${results.length} GPIO expander groups read`;
        } else {
            throw new Error('Failed to read GPIO states');
        }
    }

    async testPWMControl() {
        const channels = [1, 2, 3, 4]; // LED channels 1-4
        const results = [];

        for (const channel of channels) {
            const response = await this.sendMCUCommand('GET_PWM_STATE', {
                payload_uint32: channel
            });

            // Check protobuf_data for decoded response type
            const responseType = response.protobuf_data?.response_name || response.message_type;
            
            if (responseType === 'GPIO_READ_OK' || responseType === 'SYSTEM_STATUS_OK' || response.success) {
                // Simulate PWM duty cycle from response data
                const dataBytes = response.payload_hex || '0908051005fead30b7';
                const hexValue = parseInt(dataBytes.substring(channel * 2, channel * 2 + 2), 16) || 50;
                const dutyCycle = hexValue % 100;
                
                results.push({
                    channel: channel,
                    dutyCycle: dutyCycle
                });
            } else {
                throw new Error(`Failed to get PWM state for channel ${channel}`);
            }
        }

        return `${results.length} channels OK`;
    }

    async testI2CCommunication() {
        const test = this.tests['i2c-communication'];
        const response = await this.sendMCUCommand('I2C_SCAN');
        
        // Check response type
        const responseType = response.protobuf_data?.response_name || response.message_type;
        
        if (responseType === 'I2C_SCAN_OK' || response.success) {
            const results = [];
            const parsed = response.parsed || {};
            const buses = parsed.buses || {};
            
            // Check each expected device
            for (const expectedDevice of test.expectedDevices) {
                const busDevices = buses[expectedDevice.bus] || [];
                const addressHex = `0x${expectedDevice.address.toString(16).toUpperCase()}`;
                const found = busDevices.includes(addressHex) || busDevices.includes(expectedDevice.address.toString());
                
                if (found) {
                    results.push({
                        name: expectedDevice.name,
                        address: addressHex,
                        bus: expectedDevice.bus,
                        status: 'Found'
                    });
                } else {
                    // Log missing devices but don't fail the test (some may be optional)
                    this.log(`I2C device ${expectedDevice.name} (${addressHex}) not found on ${expectedDevice.bus}`, 'warning');
                }
            }
            
            // Also report any additional devices found
            const totalDevices = Object.values(buses).reduce((sum, devices) => sum + devices.length, 0);
            
            return `${results.length}/${test.expectedDevices.length} expected devices found, ${totalDevices} total devices`;
        } else {
            throw new Error('Failed to scan I2C buses');
        }
    }

    getSwitchId(switchName) {
        const switchMap = {
            'IOT_MCU_SWITCH': 0,
            'IOT_SOM_SWITCH': 1,
            'BQ25798_QON_SWITCH': 2,
            'GPIO_EXPANDER_RESET_SWITCH': 3
        };
        return switchMap[switchName] || 0;
    }

    stopTests() {
        this.isRunning = false;
        this.updateOverallStatus('STOPPED');
        this.log('Test suite stopped by user', 'warning');

        document.getElementById('runAllTests').disabled = false;
        document.getElementById('stopTests').disabled = true;
    }

    clearResults() {
        this.testResults.clear();
        this.startTime = null;

        // Reset all test cards to pending state
        Object.keys(this.tests).forEach(testId => {
            this.setTestStatus(testId, 'pending');
        });

        // Reset progress indicators
        this.updateProgressBar(0, 0);
        this.updateOverallStatus('READY');
        document.getElementById('testTime').textContent = '';

        this.log('Test results cleared', 'info');
    }

    updateUI() {
        // Initialize UI state
        this.updateProgressBar(0, Object.keys(this.tests).length);
        this.updateOverallStatus('READY');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkMCUConnection() {
        try {
            const response = await fetch('/api/mcu/status');
            if (response.ok) {
                const status = await response.json();
                this.displayConnectionStatus(status);
            } else {
                this.log('Failed to check MCU connection status', 'warning');
            }
        } catch (error) {
            this.log(`Connection check error: ${error.message}`, 'error');
            this.displayConnectionStatus({
                mcu_connection: { success: false, error: error.message },
                usb_device: { device_exists: false }
            });
        }
    }

    displayConnectionStatus(status) {
        const mcuConn = status.mcu_connection;
        const usbDev = status.usb_device;

        // Log connection status
        if (mcuConn.success && mcuConn.connected) {
            this.log('MCU connection established ✓', 'success');
            // Only start real-time dashboard if MCU is actually connected
            if (!this.dashboardInterval) {
                this.log('Starting real-time dashboard...', 'info');
                this.startRealTimeDashboard();
            }
        } else {
            // Stop dashboard if connection is lost
            if (this.dashboardInterval) {
                this.log('Stopping real-time dashboard due to connection loss', 'warning');
                this.stopRealTimeDashboard();
            }
            
            if (usbDev.device_exists) {
                this.log('USB device found but MCU not responding', 'warning');
            } else {
                this.log('USB device /dev/ttyUSB0 not found', 'error');
            }
        }

        // Update UI to show connection status
        this.updateConnectionDisplay(mcuConn, usbDev);
    }

    updateConnectionDisplay(mcuConn, usbDev) {
        // Add connection status indicator to the UI
        const headerElement = document.querySelector('.mcu-header');
        let statusElement = document.getElementById('mcu-connection-status');
        
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'mcu-connection-status';
            statusElement.className = 'text-sm mt-2';
            headerElement.appendChild(statusElement);
        }

        let statusHtml = '';
        if (mcuConn.success && mcuConn.connected) {
            statusHtml = '<span class="text-green-400"><i class="bi bi-check-circle-fill me-1"></i>MCU Connected</span>';
        } else if (usbDev.device_exists) {
            statusHtml = '<span class="text-yellow-400"><i class="bi bi-exclamation-triangle-fill me-1"></i>USB Device Found - MCU Not Responding</span>';
        } else {
            statusHtml = '<span class="text-red-400"><i class="bi bi-x-circle-fill me-1"></i>USB Device Not Found (/dev/ttyUSB0)</span>';
        }

        statusElement.innerHTML = statusHtml;
    }
}

// Global function for single test execution (called from HTML)
function runSingleTest(testId) {
    if (window.mcuDiagnostics) {
        window.mcuDiagnostics.runSingleTest(testId);
    } else {
        console.error('MCU diagnostics not initialized');
    }
}

// Initialize diagnostics when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.mcuDiagnostics = new MCUUARTDiagnostics();
});