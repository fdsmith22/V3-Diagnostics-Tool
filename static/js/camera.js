// Camera Testing Page JavaScript
(function() {
    'use strict';

    // State management
    let state = {
        selectedPort: null,
        isStreaming: false,
        deviceConnected: false,
        streamProcess: null,
        streamStartTime: null
    };

    // DOM elements
    const elements = {
        cameraPortBtns: document.querySelectorAll('.camera-port-btn'),
        startStreamBtn: document.getElementById('start-stream-btn'),
        stopStreamBtn: document.getElementById('stop-stream-btn'),
        refreshBtn: document.getElementById('refresh-camera-status'),
        cameraStream: document.getElementById('camera-stream'),
        cameraPlaceholder: document.getElementById('camera-placeholder'),
        streamLoading: document.getElementById('stream-loading'),

        // Status displays
        connectionStatus: document.getElementById('camera-connection-status'),
        connectionMessage: document.getElementById('camera-connection-message'),
        streamStatusText: document.getElementById('stream-status-text'),
        streamPortInfo: document.getElementById('stream-port-info'),
        activeCameraText: document.getElementById('active-camera-text'),
        cameraResolution: document.getElementById('camera-resolution'),
        previewStatusBadge: document.getElementById('preview-status-badge'),
        streamPortDisplay: document.getElementById('stream-port-display'),
        streamInfoFooter: document.getElementById('stream-info-footer'),
        streamTimeFooter: document.getElementById('stream-time-footer'),

        // Camera detection log
        cameraDetectionLog: document.getElementById('camera-detection-log'),

        // LED toggle buttons
        ledToggleBtns: document.querySelectorAll('.led-toggle-btn'),

        // Power toggle buttons
        powerToggleBtns: document.querySelectorAll('.power-toggle-btn'),

        // IR LED toggle buttons
        irLedToggleBtns: document.querySelectorAll('.ir-led-toggle-btn')
    };

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        console.log('Camera page initialized');

        // Set up event listeners
        setupEventListeners();

        // Check device connection
        checkDeviceConnection();

        // Auto-detect cameras on page load
        detectCameras();

        // Update time display
        setInterval(updateTimeDisplay, 1000);
    }

    function setupEventListeners() {
        // Camera port selection
        elements.cameraPortBtns.forEach(btn => {
            btn.addEventListener('click', () => selectCameraPort(parseInt(btn.dataset.port)));
        });

        // Stream controls
        elements.startStreamBtn.addEventListener('click', startStream);
        elements.stopStreamBtn.addEventListener('click', stopStream);

        // Refresh button
        elements.refreshBtn.addEventListener('click', function() {
            this.classList.add('spinning');
            checkDeviceConnection();
            detectCameras();
            setTimeout(() => {
                this.classList.remove('spinning');
            }, 1000);
        });

        // Handle stream image errors
        elements.cameraStream.addEventListener('error', handleStreamError);
        elements.cameraStream.addEventListener('load', handleStreamLoad);

        // LED toggle buttons
        elements.ledToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => toggleLED(btn));
        });

        // Power toggle buttons
        elements.powerToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => togglePower(btn));
        });

        // IR LED toggle buttons
        elements.irLedToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => toggleIRLED(btn));
        });
    }

    function selectCameraPort(port) {
        if (state.isStreaming) {
            alert('Please stop the current stream before selecting a different camera port.');
            return;
        }

        state.selectedPort = port;

        // Update UI
        elements.cameraPortBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.port) === port);
        });

        // Enable start button
        elements.startStreamBtn.disabled = !state.deviceConnected;

        // Update displays
        elements.activeCameraText.textContent = `Port ${port}`;
        elements.streamPortDisplay.textContent = `808${port}`;

        console.log(`Selected camera port: ${port}`);
    }

    async function startStream() {
        if (state.selectedPort === null) {
            alert('Please select a camera port first.');
            return;
        }

        if (!state.deviceConnected) {
            alert('Device not connected. Please check the connection.');
            return;
        }

        // Disable start button, enable stop button
        elements.startStreamBtn.disabled = true;
        elements.stopStreamBtn.disabled = false;

        // Show loading overlay
        elements.streamLoading.classList.remove('d-none');
        elements.cameraPlaceholder.classList.add('d-none');

        try {
            // Call backend to start GStreamer pipeline
            const response = await fetch('/api/camera/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    camera_port: state.selectedPort
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Wait a moment for stream to start
                setTimeout(() => {
                    // Set MJPEG stream URL - browser automatically handles the stream
                    elements.cameraStream.src = `/api/camera/stream/${state.selectedPort}`;
                    elements.cameraStream.classList.remove('d-none');
                    elements.streamLoading.classList.add('d-none');

                    // Update state
                    state.isStreaming = true;
                    state.streamStartTime = new Date();

                    // Update UI
                    updateStreamStatus(true);

                    console.log(`Stream started on port ${state.selectedPort}`);
                }, 2000); // Give GStreamer time to start
            } else {
                throw new Error(data.message || 'Failed to start stream');
            }
        } catch (error) {
            console.error('Error starting stream:', error);
            alert(`Failed to start stream: ${error.message}`);

            // Reset UI
            elements.streamLoading.classList.add('d-none');
            elements.cameraPlaceholder.classList.remove('d-none');
            elements.startStreamBtn.disabled = false;
            elements.stopStreamBtn.disabled = true;
        }
    }

    async function stopStream() {
        console.log('stopStream called, selectedPort:', state.selectedPort);
        try {
            console.log('Sending stop request...');
            const response = await fetch('/api/camera/stop', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    camera_port: state.selectedPort
                })
            }).catch(fetchError => {
                console.error('Fetch error:', fetchError);
                throw fetchError;
            });

            console.log('Stop API response status:', response.status);
            const data = await response.json();
            console.log('Stop API response data:', data);

            if (data.status === 'success' || data.status === 'warning') {
                // Update state first to prevent error handler from showing error message
                state.isStreaming = false;
                state.streamStartTime = null;

                // Stop displaying stream
                elements.cameraStream.src = '';
                elements.cameraStream.classList.add('d-none');
                elements.cameraPlaceholder.classList.remove('d-none');

                // Update UI
                updateStreamStatus(false);
                elements.startStreamBtn.disabled = false;
                elements.stopStreamBtn.disabled = true;

                console.log('Stream stopped');
            } else {
                throw new Error(data.message || 'Failed to stop stream');
            }
        } catch (error) {
            console.error('Error stopping stream:', error);
            alert(`Failed to stop stream: ${error.message}`);
        }
    }

    function updateStreamStatus(active) {
        if (active) {
            elements.streamStatusText.textContent = 'Active';
            elements.streamStatusText.classList.add('active');
            elements.streamPortInfo.textContent = `Port 808${state.selectedPort}`;
            elements.previewStatusBadge.textContent = 'Streaming';
            elements.previewStatusBadge.classList.remove('bg-secondary');
            elements.previewStatusBadge.classList.add('streaming', 'bg-success');
            elements.streamInfoFooter.textContent = `Stream: Camera Port ${state.selectedPort}`;
            elements.cameraResolution.textContent = '1280x720 @ 30fps';
        } else {
            elements.streamStatusText.textContent = 'Inactive';
            elements.streamStatusText.classList.remove('active');
            elements.streamPortInfo.textContent = 'No stream active';
            elements.previewStatusBadge.textContent = 'No Stream';
            elements.previewStatusBadge.classList.remove('streaming', 'bg-success');
            elements.previewStatusBadge.classList.add('bg-secondary');
            elements.streamInfoFooter.textContent = 'Stream: Inactive';
            elements.cameraResolution.textContent = '--';
        }
    }

    function handleStreamError(event) {
        console.error('Stream error:', event);

        if (state.isStreaming) {
            // Show error message
            elements.streamLoading.classList.remove('d-none');
            elements.streamLoading.innerHTML = `
                <i class="material-icons text-danger" style="font-size: 48px;">error</i>
                <p class="mt-2 text-light">Failed to load stream</p>
                <p class="small text-muted">Check if camera is connected and stream is running</p>
            `;
        }
    }

    function handleStreamLoad() {
        console.log('Stream loaded successfully');
        elements.streamLoading.classList.add('d-none');
    }

    async function toggleLED(btn) {
        // Get port number from button data attribute
        const port = parseInt(btn.dataset.port);

        // Get current state (off or on)
        const currentState = btn.dataset.state;
        const newState = currentState === 'off' ? 'on' : 'off';

        // Check if device is connected
        if (!state.deviceConnected) {
            alert('Device not connected. Please check the connection.');
            return;
        }

        // Disable button and add loading state
        btn.disabled = true;
        btn.classList.add('loading');

        const originalText = btn.querySelector('.btn-text').textContent;
        btn.querySelector('.btn-text').textContent = '...';

        try {
            console.log(`Toggling LED for port ${port} to ${newState}`);

            // Call backend API to toggle LED
            const response = await fetch('/api/camera/led/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    port: port,
                    state: newState
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Update button state
                btn.dataset.state = newState;

                // Update button appearance
                if (newState === 'on') {
                    btn.querySelector('.btn-text').textContent = 'ON';
                    btn.querySelector('.material-icons').textContent = 'lightbulb';
                    btn.classList.remove('btn-outline-secondary');
                    btn.classList.add('btn-outline-warning');
                } else {
                    btn.querySelector('.btn-text').textContent = 'OFF';
                    btn.querySelector('.material-icons').textContent = 'lightbulb_outline';
                    btn.classList.remove('btn-outline-warning');
                    btn.classList.add('btn-outline-secondary');
                }

                console.log(`LED ${data.led_name} toggled to ${newState} successfully`);
            } else {
                throw new Error(data.message || 'Failed to toggle LED');
            }
        } catch (error) {
            console.error('Error toggling LED:', error);
            alert(`Failed to toggle LED: ${error.message}`);

            // Restore original text on error
            btn.querySelector('.btn-text').textContent = originalText;
        } finally {
            // Re-enable button and remove loading state
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    async function togglePower(btn) {
        // Get switch name from button data attribute
        const switchName = btn.dataset.switch;

        // Get current state (off or on)
        const currentState = btn.dataset.state;
        const newState = currentState === 'off' ? 'on' : 'off';

        // Check if device is connected
        if (!state.deviceConnected) {
            alert('Device not connected. Please check the connection.');
            return;
        }

        // Disable button and add loading state
        btn.disabled = true;
        btn.classList.add('loading');

        const originalText = btn.querySelector('.btn-text').textContent;
        btn.querySelector('.btn-text').textContent = '...';

        try {
            console.log(`Toggling power switch ${switchName} to ${newState}`);

            // Call backend API to toggle power switch
            const response = await fetch('/api/hardware/power/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    switch: switchName,
                    state: newState
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Update button state
                btn.dataset.state = newState;

                // Update button appearance
                if (newState === 'on') {
                    btn.querySelector('.btn-text').textContent = 'ON';
                    btn.classList.remove('btn-outline-secondary');
                    btn.classList.add('btn-outline-success');
                } else {
                    btn.querySelector('.btn-text').textContent = 'OFF';
                    btn.classList.remove('btn-outline-success');
                    btn.classList.add('btn-outline-secondary');
                }

                console.log(`Power switch ${switchName} toggled to ${newState} successfully`);
            } else {
                throw new Error(data.message || 'Failed to toggle power switch');
            }
        } catch (error) {
            console.error('Error toggling power switch:', error);
            alert(`Failed to toggle power switch: ${error.message}`);

            // Restore original text on error
            btn.querySelector('.btn-text').textContent = originalText;
        } finally {
            // Re-enable button and remove loading state
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    async function toggleIRLED(btn) {
        // Get LED number from button data attribute
        const ledNumber = parseInt(btn.dataset.led);

        // Get current state (off or on)
        const currentState = btn.dataset.state;
        const newState = currentState === 'off' ? 'on' : 'off';

        // Check if device is connected
        if (!state.deviceConnected) {
            alert('Device not connected. Please check the connection.');
            return;
        }

        // Disable button and add loading state
        btn.disabled = true;
        btn.classList.add('loading');

        const originalText = btn.querySelector('.btn-text').textContent;
        btn.querySelector('.btn-text').textContent = '...';

        try {
            console.log(`Toggling IR LED ${ledNumber} to ${newState}`);

            // Call backend API to toggle IR LED
            const response = await fetch('/api/camera/ir-led/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    led: ledNumber,
                    state: newState
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                // Update button state
                btn.dataset.state = newState;

                // Update button appearance
                if (newState === 'on') {
                    btn.querySelector('.btn-text').textContent = 'ON';
                    btn.classList.remove('btn-outline-secondary');
                    btn.classList.add('btn-outline-success');
                } else {
                    btn.querySelector('.btn-text').textContent = 'OFF';
                    btn.classList.remove('btn-outline-success');
                    btn.classList.add('btn-outline-secondary');
                }

                console.log(`IR LED ${data.led_name} toggled to ${newState} successfully`);
            } else {
                throw new Error(data.message || 'Failed to toggle IR LED');
            }
        } catch (error) {
            console.error('Error toggling IR LED:', error);
            alert(`Failed to toggle IR LED: ${error.message}`);

            // Restore original text on error
            btn.querySelector('.btn-text').textContent = originalText;
        } finally {
            // Re-enable button and remove loading state
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    async function checkDeviceConnection() {
        try {
            const response = await fetch('/api/system/check-connection');
            const data = await response.json();

            state.deviceConnected = data.connected || false;

            // Update connection status UI
            if (state.deviceConnected) {
                elements.connectionStatus.classList.remove('disconnected');
                elements.connectionStatus.classList.add('connected');
                elements.connectionStatus.querySelector('.status-text').textContent = 'Connected';
                elements.connectionMessage.textContent = data.device || 'Device connected';

                // Enable camera selection if not streaming
                if (!state.isStreaming) {
                    elements.cameraPortBtns.forEach(btn => btn.disabled = false);
                    if (state.selectedPort !== null) {
                        elements.startStreamBtn.disabled = false;
                    }
                }
            } else {
                elements.connectionStatus.classList.remove('connected');
                elements.connectionStatus.classList.add('disconnected');
                elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
                elements.connectionMessage.textContent = 'No device connected';

                // Disable controls
                elements.cameraPortBtns.forEach(btn => btn.disabled = true);
                elements.startStreamBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error checking connection:', error);
            state.deviceConnected = false;
            elements.connectionStatus.classList.add('disconnected');
            elements.connectionStatus.querySelector('.status-text').textContent = 'Error';
        }
    }

    async function detectCameras() {
        try {
            const response = await fetch('/api/camera/detect');
            const data = await response.json();

            if (data.status === 'success') {
                displayCameraDetectionLog(data.cameras);
            } else {
                throw new Error(data.message || 'Failed to detect cameras');
            }
        } catch (error) {
            console.error('Error detecting cameras:', error);
            elements.cameraDetectionLog.innerHTML = `
                <div class="alert alert-danger">
                    <i class="material-icons align-middle me-2">error</i>
                    Failed to detect cameras: ${error.message}
                </div>
            `;
        }
    }

    function displayCameraDetectionLog(cameras) {
        if (!cameras || cameras.length === 0) {
            elements.cameraDetectionLog.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="material-icons mb-2" style="font-size: 48px; opacity: 0.3;">videocam_off</i>
                    <p>No cameras detected</p>
                </div>
            `;
            return;
        }

        // Update camera port buttons to highlight available cameras
        elements.cameraPortBtns.forEach(btn => {
            const port = btn.dataset.port;
            const camera = cameras.find(c => c.port === port);

            if (camera && camera.available) {
                btn.classList.add('camera-available');
                btn.setAttribute('title', camera.description || `${camera.type} camera available`);
            } else {
                btn.classList.remove('camera-available');
                btn.setAttribute('title', 'No camera detected on this port');
            }
        });

        // Update LED test items to highlight available cameras
        document.querySelectorAll('.led-test-item').forEach(item => {
            const port = item.dataset.port;
            const camera = cameras.find(c => c.port === port);

            if (camera && camera.available) {
                item.classList.add('camera-available');
                item.setAttribute('title', camera.description || `${camera.type} camera available`);
            } else {
                item.classList.remove('camera-available');
                item.setAttribute('title', 'No camera detected on this port');
            }
        });

        // Display detection log
        let html = '<div class="row g-2">';
        cameras.forEach(camera => {
            const available = camera.available ? '' : 'unavailable';
            const icon = camera.available ? 'videocam' : 'videocam_off';
            const status = camera.available ? 'Available' : 'Not Available';
            const statusClass = camera.available ? 'text-success' : 'text-danger';
            const cameraType = camera.type ? `${camera.type} - ` : '';

            html += `
                <div class="col-12 col-md-6">
                    <div class="camera-detection-item ${available}">
                        <div class="d-flex align-items-center">
                            <i class="material-icons me-3">${icon}</i>
                            <div class="flex-grow-1">
                                <div class="fw-semibold">${cameraType}${camera.device || 'Unknown'}</div>
                                <div class="small text-muted">CSI Port ${camera.port}</div>
                            </div>
                            <span class="badge ${statusClass}">${status}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        elements.cameraDetectionLog.innerHTML = html;
    }

    function updateTimeDisplay() {
        if (state.isStreaming && state.streamStartTime) {
            const now = new Date();
            const elapsed = Math.floor((now - state.streamStartTime) / 1000);
            const hours = Math.floor(elapsed / 3600).toString().padStart(2, '0');
            const minutes = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            elements.streamTimeFooter.textContent = `${hours}:${minutes}:${seconds}`;
        } else {
            elements.streamTimeFooter.textContent = '--:--:--';
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (state.isStreaming) {
            // Try to stop stream on page unload
            stopStream();
        }
    });

    // Expose functions for debugging
    window.cameraPage = {
        state,
        checkConnection: checkDeviceConnection,
        detectCameras,
        startStream,
        stopStream
    };

})();
