// static/js/diagnostics.js

(function () {
    const REGEX = {
        BATTERY_SECTION: /\[BATTERY STATUS\]([\s\S]*?)\n(?=\[|$)/,
        SIM_ISSUE: /SIM.*not detected|No SIM/i,
        MODEM_ISSUE: /No modems were found|ModemManager.*not running/i,
        CAMERA_ISSUE: /Cannot open device \/dev\/video0/i,
        TEMP_ISSUE: /temperature.*([7-9]\d|[1-9]\d{2,})/i,
        CPU_USAGE: /%Cpu\(s\):.*?(\d+\.\d+)\s*id/,
        LOG_ACCESS: /No journal files.*permissions|dmesg: read kernel buffer failed/i,
        ERROR_PATTERN: /error|failed|not found/i
    };

    const DOM_CACHE = {
        elements: new Map(),
        get(id) {
            if (!this.elements.has(id)) {
                this.elements.set(id, document.getElementById(id));
            }
            return this.elements.get(id);
        },
        clear() {
            this.elements.clear();
        }
    };

    function getAuthHeaders() {
        const token = CONFIG?.API?.DEFAULT_TOKEN || 'changeme';
        const headerKey = CONFIG?.API?.AUTH_HEADER_KEY || 'X-Auth-Token';
        return {
            [headerKey]: token,
            'Accept': 'application/json'
        };
    }

    // Global flag to track diagnostics state
    window.diagnosticsRunning = false;
    
    function runTest(testName) {
        console.log(`[Diagnostics] Running test: ${testName}`);
        
        // Set global flag
        window.diagnosticsRunning = true;
        
        // Check if we're on the dashboard page with the new diagnostic results container
        const diagnosticResults = document.getElementById('diagnostic-results');
        const isDashboard = !!diagnosticResults;
        
        const elements = {
            banner: DOM_CACHE.get("statusBanner"),
            output: isDashboard ? diagnosticResults : DOM_CACHE.get("output"),
            issueList: DOM_CACHE.get("issueList"),
            issueLog: DOM_CACHE.get("issueLog")
        };
        
        console.log("[Diagnostics] Elements found:", {
            output: !!elements.output,
            issueList: !!elements.issueList,
            issueLog: !!elements.issueLog,
            isDashboard: isDashboard
        });

        if (!elements.output) return console.error("Missing output element");

        if (!elements.banner && typeof Utils?.createStatusBanner === 'function') {
            Utils.createStatusBanner();
        }

        if (typeof window.isDeviceConnected === 'function' && !window.isDeviceConnected()) {
            updateStatusBanner("error");
            elements.output.textContent = "❌ Device not reachable.";
            return;
        }

        clearDiagnosticsCache();
        updateStatusBanner?.("running");

        // Handle dashboard display differently
        if (isDashboard) {
            // Show loading state in the diagnostic results container
            if (window.showDiagnosticLoading) {
                window.showDiagnosticLoading();
            } else {
                elements.output.innerHTML = `
                    <div class="text-center py-3">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Running diagnostics...</span>
                        </div>
                        <p class="mt-2 text-muted">Running test: ${testName}...</p>
                    </div>
                `;
            }
        } else {
            elements.output.textContent = `Running test: ${testName}...`;
        }
        
        if (elements.issueList) elements.issueList.innerHTML = "";
        if (elements.issueLog) {
            elements.issueLog.classList.add("hidden");
            elements.issueLog.style.display = "none";
        }

        const controller = new AbortController();
        const signal = controller.signal;
        // Increase timeout for check_all which runs multiple tests
        const timeout = testName === 'check_all' ? 120000 : (CONFIG?.API?.TIMEOUT_MS || 30000);
        const timeoutId = setTimeout(() => {
            controller.abort(new DOMException('Request timeout', 'TimeoutError'));
        }, timeout);

        const route = `/api/diagnostic/${testName}`;

        // Handle check_all with Server-Sent Events for progress
        if (testName === 'check_all') {
            // For SSE, we need to make a GET request
            const eventSource = new EventSource(route);
            let allResults = {};
            
            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                switch(data.type) {
                    case 'start':
                        elements.output.textContent = `Starting all diagnostics (0/${data.total} tests)...`;
                        break;
                        
                    case 'progress':
                        elements.output.textContent = `Running diagnostics (${data.current}/${data.total}): ${data.test}...`;
                        break;
                        
                    case 'result':
                        allResults[data.test] = data.result;
                        // Update output with partial results
                        const outputText = Object.entries(allResults)
                            .map(([k, v]) => `\n[${k}]\n${v.output || v}`)
                            .join('\n');
                        elements.output.textContent = `Running diagnostics... (${Object.keys(allResults).length} completed)\n${outputText}`;
                        break;
                        
                    case 'complete':
                        eventSource.close();
                        clearTimeout(timeoutId);
                        
                        // Format results for dashboard
                        if (isDashboard && window.updateDiagnosticResults) {
                            // Convert raw output to structured format for dashboard
                            const formattedResults = {};
                            for (const [test, result] of Object.entries(data.data)) {
                                const output = result.output || result;
                                // Determine status based on output content
                                let status = 'passed';
                                let message = '';

                                // Check if the result already has a message field, use it
                                if (result.message) {
                                    message = result.message;
                                    // Determine status from the message
                                    if (message.includes('❌')) {
                                        status = 'failed';
                                    } else if (message.includes('⚠️')) {
                                        status = 'warning';
                                    } else if (message.includes('✅')) {
                                        status = 'passed';
                                    }
                                } else {
                                    // Fall back to extracting from output
                                    // Check for success indicators first
                                    if (output.includes('✅')) {
                                        status = 'passed';
                                        // Find the line with ✅ for the message
                                        const lines = output.split('\n');
                                        const successLine = lines.find(line => line.includes('✅'));
                                        message = successLine || lines[0];
                                    } else if (output.includes('❌') || (output.includes('Error') && !output.includes('Error running') && !output.includes('Error:'))) {
                                        status = 'failed';
                                        // Find the line with ❌ for the message
                                        const lines = output.split('\n');
                                        const errorLine = lines.find(line => line.includes('❌'));
                                        message = errorLine || lines[0];
                                    } else if (output.includes('⚠️') || output.includes('Warning')) {
                                        status = 'warning';
                                        const lines = output.split('\n');
                                        const warningLine = lines.find(line => line.includes('⚠️'));
                                        message = warningLine || lines[0];
                                    } else {
                                        message = 'Test completed';
                                    }
                                }

                                formattedResults[test] = {
                                    status: status,
                                    message: message,
                                    output: output
                                };
                            }
                            window.updateDiagnosticResults(formattedResults);
                        } else {
                            // Format final output for non-dashboard pages
                            const finalOutput = Object.entries(data.data)
                                .map(([k, v]) => `\n[${k}]\n${v.output || v}`)
                                .join('\n');
                            elements.output.textContent = finalOutput;
                        }
                        
                        // Ensure the output log is visible
                        const outputLog = document.getElementById('outputLog');
                        if (outputLog && outputLog.classList.contains('collapse')) {
                            outputLog.classList.add('show');
                        }
                        updateStatusBanner?.("success");
                        
                        const finalOutput = Object.entries(data.data)
                            .map(([k, v]) => `\n[${k}]\n${v.output || v}`)
                            .join('\n');
                        analyzeOutputForIssues({ output: finalOutput });
                        updateBatteryFromOutput(finalOutput);
                        persistDiagnosticsOutput();
                        window.diagnosticsRunning = false;  // Reset flag
                        break;
                        
                    case 'error':
                        eventSource.close();
                        clearTimeout(timeoutId);
                        elements.output.textContent = `❌ Error: ${data.message}`;
                        updateStatusBanner?.("error");
                        window.diagnosticsRunning = false;  // Reset flag
                        break;
                }
            };
            
            eventSource.onerror = (err) => {
                eventSource.close();
                clearTimeout(timeoutId);
                console.error("❌ SSE connection failed:", err);
                elements.output.textContent = `❌ Connection lost during diagnostics`;
                updateStatusBanner?.("error");
                window.diagnosticsRunning = false;  // Reset flag
            };
            
            // Handle abort
            signal.addEventListener('abort', () => {
                eventSource.close();
            });
            
            return; // Exit early for SSE handling
        }

        // Normal fetch for single tests
        fetch(route, {
            method: 'POST',
            signal,
            headers: getAuthHeaders()
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then(response => {
                clearTimeout(timeoutId);
                console.log(`[Diagnostics Response for ${testName}]`, response);

                if (response.status === 'success') {
                    // Handle different response formats
                    let outputText = '';
                    
                    if (response.data) {
                        if (typeof response.data === 'object' && response.data.output) {
                            // Single test response format
                            outputText = response.data.output;
                        } else if (typeof response.data === 'object') {
                            // Multiple test response format (check_all)
                            outputText = Object.entries(response.data)
                                .map(([k, v]) => `\n[${k}]\n${v.output || v}`)
                                .join('\n');
                        } else {
                            outputText = response.data;
                        }
                    } else {
                        outputText = response.output || response.message;
                    }

                    // Format results for dashboard
                    if (isDashboard && window.updateDiagnosticResults) {
                        // Convert to structured format for dashboard
                        const formattedResults = {};
                        
                        if (response.data && typeof response.data === 'object' && !response.data.output) {
                            // Multiple tests format
                            for (const [test, result] of Object.entries(response.data)) {
                                const output = result.output || result;
                                let status = 'passed';
                                let message = '';

                                // Check if the result already has a message field, use it
                                if (result.message) {
                                    message = result.message;
                                    // Determine status from the message
                                    if (message.includes('❌')) {
                                        status = 'failed';
                                    } else if (message.includes('⚠️')) {
                                        status = 'warning';
                                    } else if (message.includes('✅')) {
                                        status = 'passed';
                                    }
                                } else {
                                    // Fall back to extracting from output
                                    // Check for success indicators first
                                    if (output.includes('✅')) {
                                        status = 'passed';
                                        // Find the line with ✅ for the message
                                        const lines = output.split('\n');
                                        const successLine = lines.find(line => line.includes('✅'));
                                        message = successLine || lines[0];
                                    } else if (output.includes('❌')) {
                                        status = 'failed';
                                        // Find the line with ❌ for the message
                                        const lines = output.split('\n');
                                        const errorLine = lines.find(line => line.includes('❌'));
                                        message = errorLine || lines[0];
                                    } else if (output.includes('⚠️') || output.includes('Warning')) {
                                        status = 'warning';
                                        const lines = output.split('\n');
                                        const warningLine = lines.find(line => line.includes('⚠️'));
                                        message = warningLine || lines[0];
                                    } else {
                                        message = 'Test completed';
                                    }
                                }

                                formattedResults[test] = {
                                    status: status,
                                    message: message,
                                    output: output
                                };
                            }
                        } else {
                            // Single test format
                            let status = 'passed';
                            let message = '';

                            // Check if response.data has a message field, use it
                            if (response.data && response.data.message) {
                                message = response.data.message;
                                // Determine status from the message
                                if (message.includes('❌')) {
                                    status = 'failed';
                                } else if (message.includes('⚠️')) {
                                    status = 'warning';
                                } else if (message.includes('✅')) {
                                    status = 'passed';
                                }
                            } else {
                                // Fall back to extracting from output
                                // Check for success indicators first
                                if (outputText.includes('✅')) {
                                    status = 'passed';
                                    // Find the line with ✅ for the message
                                    const lines = outputText.split('\n');
                                    const successLine = lines.find(line => line.includes('✅'));
                                    message = successLine || lines[0];
                                } else if (outputText.includes('❌')) {
                                    status = 'failed';
                                    // Find the line with ❌ for the message
                                    const lines = outputText.split('\n');
                                    const errorLine = lines.find(line => line.includes('❌'));
                                    message = errorLine || lines[0];
                                } else if (outputText.includes('⚠️') || outputText.includes('Warning')) {
                                    status = 'warning';
                                    const lines = outputText.split('\n');
                                    const warningLine = lines.find(line => line.includes('⚠️'));
                                    message = warningLine || lines[0];
                                } else {
                                    message = 'Test completed';
                                }
                            }

                            formattedResults[testName] = {
                                status: status,
                                message: message,
                                output: outputText
                            };
                        }
                        
                        window.updateDiagnosticResults(formattedResults);
                    } else {
                        elements.output.textContent = outputText;
                    }
                    
                    // Ensure the output log is visible
                    const outputLog = document.getElementById('outputLog');
                    if (outputLog && outputLog.classList.contains('collapse')) {
                        outputLog.classList.add('show');
                    }
                    updateStatusBanner?.("success");
                    analyzeOutputForIssues({ output: outputText });
                    updateBatteryFromOutput(outputText);
                    persistDiagnosticsOutput();
                    window.diagnosticsRunning = false;  // Reset flag
                } else {
                    throw new Error(response.output || "Unknown error");
                }
            })
            .catch(err => {
                clearTimeout(timeoutId);
                console.error("❌ Diagnostics fetch failed:", err);
                
                // Handle different error types
                let errorMessage = "Test error.";
                if (err.name === 'AbortError' || err.name === 'TimeoutError') {
                    errorMessage = testName === 'check_all' 
                        ? "Test timed out. Running all tests may take longer than expected. Try running individual tests instead."
                        : "Test timed out after " + (timeout / 1000) + " seconds.";
                } else if (err.message) {
                    errorMessage = err.message;
                }
                
                elements.output.textContent = `❌ ${errorMessage}`;
                updateStatusBanner?.("error");
                window.diagnosticsRunning = false;  // Reset flag
            });
    }

    function analyzeOutputForIssues(response) {
        if (!response?.output) return;
        const output = response.output;
        const issues = [];

        if (REGEX.SIM_ISSUE.test(output)) issues.push("❌ SIM card not detected");
        if (REGEX.MODEM_ISSUE.test(output)) issues.push("❌ Modem not found or service down");
        if (REGEX.CAMERA_ISSUE.test(output)) issues.push("❌ Camera not detected");
        if (REGEX.TEMP_ISSUE.test(output)) issues.push("🔥 High temperature reading detected");

        const cpuMatch = output.match(REGEX.CPU_USAGE);
        if (cpuMatch) {
            const idle = parseFloat(cpuMatch[1]);
            if (idle < 70) issues.push(`⚠️ High CPU usage detected (Idle: ${idle.toFixed(1)}%)`);
        } else {
            issues.push("⚠️ Unable to determine CPU usage.");
        }

        if (REGEX.LOG_ACCESS.test(output)) issues.push("⚠️ Log access denied or restricted");
        if (REGEX.ERROR_PATTERN.test(output) && !output.includes("✅"))
            issues.push("⚠️ One or more components returned errors");

        updateIssueLog(issues);
    }

    function updateIssueLog(issues) {
        const issueLog = DOM_CACHE.get("issueLog");
        const issueList = DOM_CACHE.get("issueList");
        if (!issueLog || !issueList) return;

        issueList.innerHTML = "";
        issues.forEach(issue => {
            const li = document.createElement("li");
            li.textContent = issue;
            issueList.appendChild(li);
        });

        issueLog.classList.remove("hidden");
        issueLog.style.display = "block";
    }

    function updateBatteryFromOutput(output) {
        const section = output.match(REGEX.BATTERY_SECTION);
        if (!section) return;

        const lines = section[1].trim().split("\n");
        const batteryData = {
            vbat: lines.find(l => l.includes("VBAT")),
            vac1: lines.find(l => l.includes("VAC1")),
            charge: lines.find(l => l.includes("Estimated Charge"))
        };

        const elements = {
            voltage: DOM_CACHE.get("batteryVoltage"),
            input: DOM_CACHE.get("inputVoltage"),
            percent: DOM_CACHE.get("batteryPercent"),
            bar: DOM_CACHE.get("batteryBar")
        };

        if (batteryData.vbat && elements.voltage) {
            elements.voltage.textContent = batteryData.vbat.split(":").pop().trim();
        }
        if (batteryData.vac1 && elements.input) {
            elements.input.textContent = batteryData.vac1.split(":").pop().trim();
        }
        if (batteryData.charge && elements.percent) {
            const parts = batteryData.charge.split(":").pop().trim().split(/\s{2,}|\s(?=▮|▯)/);
            elements.percent.textContent = parts[0];
            if (elements.bar) elements.bar.textContent = parts[1] || "";
        }
    }

    function persistDiagnosticsOutput() {
        try {
            sessionStorage.setItem("diagnostics_output", DOM_CACHE.get("output")?.textContent || "");
            sessionStorage.setItem("diagnostics_issues", DOM_CACHE.get("issueLog")?.textContent || "");
        } catch (e) {
            console.error("Failed to persist diagnostics:", e);
        }
    }

    function restoreDiagnosticsOutput() {
        try {
            const output = DOM_CACHE.get("output");
            const issueLog = DOM_CACHE.get("issueLog");
            const savedOutput = sessionStorage.getItem("diagnostics_output");
            const savedIssues = sessionStorage.getItem("diagnostics_issues");

            if (output && savedOutput) output.textContent = savedOutput;
            if (issueLog && savedIssues) {
                issueLog.textContent = savedIssues;
                issueLog.classList.remove("hidden");
        issueLog.style.display = "block";
            }
        } catch (e) {
            console.error("Failed to restore diagnostics output:", e);
        }
    }

    function clearDiagnosticsCache() {
        sessionStorage.removeItem("diagnostics_output");
        sessionStorage.removeItem("diagnostics_issues");
    }

    window.runTest = runTest;
    window.clearDiagnosticsCache = clearDiagnosticsCache;

    document.addEventListener("DOMContentLoaded", restoreDiagnosticsOutput);
    window.addEventListener("unload", DOM_CACHE.clear.bind(DOM_CACHE));
})();