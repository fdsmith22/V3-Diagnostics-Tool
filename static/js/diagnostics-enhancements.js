/*
============================================================================
V3 DIAGNOSTICS TOOL - ENHANCED DEBUGGING FEATURES
============================================================================
Advanced debugging and monitoring features for the diagnostics application
============================================================================
*/

// Real-time System Monitor
class SystemMonitor {
    constructor() {
        this.metrics = {
            cpu: 0,
            memory: 0,
            network: 0,
            connections: 0,
            errors: 0
        };
        this.history = [];
        this.isRunning = false;
        this.interval = null;
        this.callbacks = [];
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.interval = setInterval(() => this.updateMetrics(), 2000);
        this.createWidget();
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.interval) clearInterval(this.interval);
        this.removeWidget();
    }

    async updateMetrics() {
        try {
            // Simulate real metrics (would connect to real endpoints in production)
            this.metrics = {
                cpu: Math.random() * 100,
                memory: Math.random() * 100,
                network: Math.random() * 10,
                connections: Math.floor(Math.random() * 50),
                errors: Math.floor(Math.random() * 5)
            };

            this.history.push({
                timestamp: Date.now(),
                ...this.metrics
            });

            // Keep only last 50 readings
            if (this.history.length > 50) {
                this.history.shift();
            }

            this.updateWidget();
            this.callbacks.forEach(callback => callback(this.metrics));
        } catch (error) {
            console.error('Error updating metrics:', error);
        }
    }

    createWidget() {
        const widget = document.createElement('div');
        widget.id = 'system-monitor-widget';
        widget.className = 'fixed bottom-4 left-4 z-50 card glass-effect w-80 animate-slide-in-left';
        
        widget.innerHTML = `
            <div class="card-header cursor-pointer" onclick="toggleSystemMonitor()">
                <div class="card-title">
                    <div class="activity-pulse">
                        <i class="bi bi-activity"></i>
                    </div>
                    <span>System Monitor</span>
                </div>
                <button onclick="systemMonitor.stop(); event.stopPropagation();" class="btn btn-sm">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="card-body" id="system-monitor-content">
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="text-center">
                        <div class="performance-indicator">
                            <div class="text-lg font-mono font-bold" id="cpu-metric">--</div>
                            <div class="text-xs opacity-70">CPU %</div>
                            <div class="performance-bar">
                                <div class="performance-fill" id="cpu-bar"></div>
                            </div>
                        </div>
                    </div>
                    <div class="text-center">
                        <div class="performance-indicator">
                            <div class="text-lg font-mono font-bold" id="memory-metric">--</div>
                            <div class="text-xs opacity-70">Memory %</div>
                            <div class="performance-bar">
                                <div class="performance-fill" id="memory-bar"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="opacity-70">Network I/O:</span>
                        <span id="network-metric" class="font-mono">-- MB/s</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="opacity-70">Connections:</span>
                        <span id="connections-metric" class="font-mono">--</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="opacity-70">Errors:</span>
                        <span id="errors-metric" class="font-mono text-red-400">--</span>
                    </div>
                </div>
                <canvas id="metrics-chart" width="280" height="80" class="mt-3"></canvas>
            </div>
        `;

        document.body.appendChild(widget);
        this.setupChart();
    }

    updateWidget() {
        const widget = document.getElementById('system-monitor-widget');
        if (!widget) return;

        // Update CPU
        const cpuMetric = document.getElementById('cpu-metric');
        const cpuBar = document.getElementById('cpu-bar');
        if (cpuMetric && cpuBar) {
            cpuMetric.textContent = this.metrics.cpu.toFixed(1);
            cpuBar.style.width = `${this.metrics.cpu}%`;
            cpuBar.className = `performance-fill ${this.getPerformanceLevel(this.metrics.cpu)}`;
        }

        // Update Memory
        const memoryMetric = document.getElementById('memory-metric');
        const memoryBar = document.getElementById('memory-bar');
        if (memoryMetric && memoryBar) {
            memoryMetric.textContent = this.metrics.memory.toFixed(1);
            memoryBar.style.width = `${this.metrics.memory}%`;
            memoryBar.className = `performance-fill ${this.getPerformanceLevel(this.metrics.memory)}`;
        }

        // Update other metrics
        const networkMetric = document.getElementById('network-metric');
        if (networkMetric) networkMetric.textContent = `${this.metrics.network.toFixed(1)} MB/s`;

        const connectionsMetric = document.getElementById('connections-metric');
        if (connectionsMetric) connectionsMetric.textContent = this.metrics.connections;

        const errorsMetric = document.getElementById('errors-metric');
        if (errorsMetric) errorsMetric.textContent = this.metrics.errors;

        this.updateChart();
    }

    getPerformanceLevel(value) {
        if (value < 50) return 'low';
        if (value < 80) return 'medium';
        return 'high';
    }

    setupChart() {
        const canvas = document.getElementById('metrics-chart');
        if (!canvas) return;
        this.chartContext = canvas.getContext('2d');
    }

    updateChart() {
        if (!this.chartContext || this.history.length < 2) return;

        const ctx = this.chartContext;
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw CPU line
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.history.forEach((point, index) => {
            const x = (width / (this.history.length - 1)) * index;
            const y = height - (point.cpu / 100) * height;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw Memory line
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.history.forEach((point, index) => {
            const x = (width / (this.history.length - 1)) * index;
            const y = height - (point.memory / 100) * height;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    removeWidget() {
        const widget = document.getElementById('system-monitor-widget');
        if (widget) widget.remove();
    }

    onUpdate(callback) {
        this.callbacks.push(callback);
    }
}

// Enhanced Error Tracker
class ErrorTracker {
    constructor() {
        this.errors = [];
        this.errorCount = { critical: 0, warning: 0, info: 0 };
        this.maxErrors = 100;
        this.notifications = [];
    }

    logError(level, message, details = {}) {
        const error = {
            id: Date.now() + Math.random(),
            level,
            message,
            details,
            timestamp: new Date(),
            acknowledged: false
        };

        this.errors.unshift(error);
        this.errorCount[level]++;

        // Keep only recent errors
        if (this.errors.length > this.maxErrors) {
            const removed = this.errors.pop();
            this.errorCount[removed.level]--;
        }

        this.showNotification(error);
        this.updateErrorWidget();
        
        return error.id;
    }

    acknowledgeError(errorId) {
        const error = this.errors.find(e => e.id === errorId);
        if (error) {
            error.acknowledged = true;
            this.updateErrorWidget();
        }
    }

    clearErrors() {
        this.errors = [];
        this.errorCount = { critical: 0, warning: 0, info: 0 };
        this.updateErrorWidget();
    }

    showNotification(error) {
        const notification = document.createElement('div');
        notification.className = `fixed top-20 right-4 z-50 max-w-sm p-4 rounded-lg shadow-xl backdrop-blur-xl border transition-all duration-300 transform translate-x-full
            ${error.level === 'critical' ? 'bg-red-900/90 border-red-600 text-red-200' :
              error.level === 'warning' ? 'bg-yellow-900/90 border-yellow-600 text-yellow-200' :
              'bg-blue-900/90 border-blue-600 text-blue-200'}`;

        const icon = error.level === 'critical' ? 'bi-exclamation-triangle-fill' :
                    error.level === 'warning' ? 'bi-exclamation-circle-fill' :
                    'bi-info-circle-fill';

        notification.innerHTML = `
            <div class="flex items-center">
                <i class="${icon} mr-2"></i>
                <div class="flex-1">
                    <div class="font-medium">${error.level.toUpperCase()}</div>
                    <div class="text-sm opacity-90">${error.message}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-2 opacity-70 hover:opacity-100">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.remove('translate-x-full'), 100);

        // Auto remove
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    createErrorWidget() {
        const widget = document.createElement('div');
        widget.id = 'error-tracker-widget';
        widget.className = 'fixed bottom-4 right-4 z-50 card glass-effect w-80 animate-slide-in-right';
        
        widget.innerHTML = `
            <div class="card-header cursor-pointer" onclick="toggleErrorTracker()">
                <div class="card-title">
                    <i class="bi bi-exclamation-triangle text-yellow-400"></i>
                    <span>Error Tracker</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs opacity-70" id="error-count">0 errors</span>
                    <button onclick="errorTracker.clearErrors(); event.stopPropagation();" class="btn btn-sm">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body hidden" id="error-tracker-content">
                <div class="grid grid-cols-3 gap-2 mb-4">
                    <div class="text-center p-2 bg-red-900/30 rounded">
                        <div class="text-lg font-bold text-red-400" id="critical-count">0</div>
                        <div class="text-xs opacity-70">Critical</div>
                    </div>
                    <div class="text-center p-2 bg-yellow-900/30 rounded">
                        <div class="text-lg font-bold text-yellow-400" id="warning-count">0</div>
                        <div class="text-xs opacity-70">Warning</div>
                    </div>
                    <div class="text-center p-2 bg-blue-900/30 rounded">
                        <div class="text-lg font-bold text-blue-400" id="info-count">0</div>
                        <div class="text-xs opacity-70">Info</div>
                    </div>
                </div>
                <div class="max-h-40 overflow-y-auto scrollbar-hide" id="error-list">
                    <div class="text-center py-4 opacity-70 text-sm">No errors logged</div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);
        this.updateErrorWidget();
    }

    updateErrorWidget() {
        const widget = document.getElementById('error-tracker-widget');
        if (!widget) return;

        // Update counts
        document.getElementById('critical-count').textContent = this.errorCount.critical;
        document.getElementById('warning-count').textContent = this.errorCount.warning;
        document.getElementById('info-count').textContent = this.errorCount.info;
        
        const totalErrors = this.errors.length;
        document.getElementById('error-count').textContent = `${totalErrors} error${totalErrors !== 1 ? 's' : ''}`;

        // Update error list
        const errorList = document.getElementById('error-list');
        if (this.errors.length === 0) {
            errorList.innerHTML = '<div class="text-center py-4 opacity-70 text-sm">No errors logged</div>';
        } else {
            errorList.innerHTML = this.errors.slice(0, 10).map(error => `
                <div class="p-2 mb-2 rounded border-l-2 ${
                    error.level === 'critical' ? 'border-red-500 bg-red-900/20' :
                    error.level === 'warning' ? 'border-yellow-500 bg-yellow-900/20' :
                    'border-blue-500 bg-blue-900/20'
                } ${error.acknowledged ? 'opacity-50' : ''}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="text-xs opacity-70">${error.timestamp.toLocaleTimeString()}</div>
                            <div class="text-sm">${error.message}</div>
                            ${error.details.source ? `<div class="text-xs opacity-70 font-mono">${error.details.source}</div>` : ''}
                        </div>
                        <button onclick="errorTracker.acknowledgeError(${error.id})" class="btn btn-sm opacity-70 hover:opacity-100">
                            <i class="bi bi-check"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }
}

// Performance Profiler
class PerformanceProfiler {
    constructor() {
        this.measurements = new Map();
        this.results = [];
        this.isEnabled = true;
    }

    start(label) {
        if (!this.isEnabled) return;
        this.measurements.set(label, {
            startTime: performance.now(),
            startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0
        });
    }

    end(label) {
        if (!this.isEnabled || !this.measurements.has(label)) return;

        const measurement = this.measurements.get(label);
        const endTime = performance.now();
        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

        const result = {
            label,
            duration: endTime - measurement.startTime,
            memoryDelta: endMemory - measurement.startMemory,
            timestamp: new Date()
        };

        this.results.push(result);
        this.measurements.delete(label);

        // Keep only recent measurements
        if (this.results.length > 100) {
            this.results.shift();
        }

        console.log(`⚡ Performance: ${label} took ${result.duration.toFixed(2)}ms`);
        return result;
    }

    getReport() {
        const grouped = this.results.reduce((acc, result) => {
            if (!acc[result.label]) {
                acc[result.label] = [];
            }
            acc[result.label].push(result);
            return acc;
        }, {});

        return Object.entries(grouped).map(([label, measurements]) => {
            const durations = measurements.map(m => m.duration);
            return {
                label,
                count: measurements.length,
                average: durations.reduce((a, b) => a + b, 0) / durations.length,
                min: Math.min(...durations),
                max: Math.max(...durations),
                total: durations.reduce((a, b) => a + b, 0)
            };
        });
    }

    showReport() {
        const report = this.getReport();
        console.table(report);
        
        // Show visual report
        this.createReportWidget(report);
    }

    createReportWidget(report) {
        const widget = document.createElement('div');
        widget.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 card glass-effect w-96 max-h-80 overflow-y-auto';
        
        widget.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">
                    <i class="bi bi-speedometer"></i>
                    Performance Report
                </h3>
                <button onclick="this.closest('.card').remove()" class="btn btn-sm">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="card-body">
                ${report.length === 0 ? 
                    '<div class="text-center py-4 opacity-70">No performance data available</div>' :
                    report.map(item => `
                        <div class="mb-3 p-3 bg-surface-800/50 rounded border border-surface-600/30">
                            <div class="font-medium mb-2">${item.label}</div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span class="opacity-70">Avg:</span> 
                                    <span class="font-mono">${item.average.toFixed(2)}ms</span>
                                </div>
                                <div>
                                    <span class="opacity-70">Count:</span> 
                                    <span class="font-mono">${item.count}</span>
                                </div>
                                <div>
                                    <span class="opacity-70">Min:</span> 
                                    <span class="font-mono">${item.min.toFixed(2)}ms</span>
                                </div>
                                <div>
                                    <span class="opacity-70">Max:</span> 
                                    <span class="font-mono">${item.max.toFixed(2)}ms</span>
                                </div>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;

        document.body.appendChild(widget);
    }
}

// Connection Quality Monitor
class ConnectionMonitor {
    constructor() {
        this.pingHistory = [];
        this.connectionEvents = [];
        this.isMonitoring = false;
        this.interval = null;
    }

    start() {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.interval = setInterval(() => this.checkConnection(), 30000); // Reduced frequency to 30 seconds
        this.logEvent('monitoring_started', 'Connection monitoring started');
    }

    stop() {
        if (!this.isMonitoring) return;
        this.isMonitoring = false;
        if (this.interval) clearInterval(this.interval);
        this.logEvent('monitoring_stopped', 'Connection monitoring stopped');
    }

    async checkConnection() {
        const startTime = performance.now();
        
        try {
            const response = await fetch('/connection_status', {
                method: 'GET',
                cache: 'no-cache',
                timeout: 5000
            });

            const endTime = performance.now();
            const ping = endTime - startTime;
            
            const data = await response.json();
            
            this.pingHistory.push({
                timestamp: Date.now(),
                ping: ping,
                connected: data.connected,
                quality: this.calculateQuality(ping)
            });

            // Keep only last 50 pings
            if (this.pingHistory.length > 50) {
                this.pingHistory.shift();
            }

            // Detect connection state changes
            if (this.pingHistory.length > 1) {
                const current = this.pingHistory[this.pingHistory.length - 1];
                const previous = this.pingHistory[this.pingHistory.length - 2];
                
                if (current.connected !== previous.connected) {
                    this.logEvent(
                        current.connected ? 'connection_restored' : 'connection_lost',
                        `Connection ${current.connected ? 'restored' : 'lost'} (ping: ${ping.toFixed(0)}ms)`
                    );
                }
            }

            this.updateConnectionWidget();
            
        } catch (error) {
            this.pingHistory.push({
                timestamp: Date.now(),
                ping: -1,
                connected: false,
                quality: 'poor',
                error: error.message
            });

            this.logEvent('connection_error', `Connection check failed: ${error.message}`);
        }
    }

    calculateQuality(ping) {
        if (ping < 50) return 'excellent';
        if (ping < 100) return 'good';
        if (ping < 200) return 'fair';
        return 'poor';
    }

    logEvent(type, message) {
        this.connectionEvents.push({
            timestamp: new Date(),
            type,
            message
        });

        // Keep only last 100 events
        if (this.connectionEvents.length > 100) {
            this.connectionEvents.shift();
        }
    }

    updateConnectionWidget() {
        // This would update a connection quality widget if it exists
        const widget = document.getElementById('connection-quality-widget');
        if (widget) {
            const latest = this.pingHistory[this.pingHistory.length - 1];
            if (latest) {
                // Update connection quality display
                widget.querySelector('.ping-value').textContent = `${latest.ping.toFixed(0)}ms`;
                widget.querySelector('.quality-indicator').className = `quality-indicator ${latest.quality}`;
            }
        }
    }

    getStats() {
        if (this.pingHistory.length === 0) return null;

        const pings = this.pingHistory.filter(p => p.ping > 0).map(p => p.ping);
        const connected = this.pingHistory.filter(p => p.connected).length;
        
        return {
            averagePing: pings.reduce((a, b) => a + b, 0) / pings.length,
            minPing: Math.min(...pings),
            maxPing: Math.max(...pings),
            uptime: (connected / this.pingHistory.length) * 100,
            totalChecks: this.pingHistory.length
        };
    }
}

// Initialize enhanced debugging features
const systemMonitor = new SystemMonitor();
const errorTracker = new ErrorTracker();
const performanceProfiler = new PerformanceProfiler();
const connectionMonitor = new ConnectionMonitor();

// Global functions for widget interaction
function toggleSystemMonitor() {
    const content = document.getElementById('system-monitor-content');
    if (content) {
        content.classList.toggle('hidden');
    }
}

function toggleErrorTracker() {
    const content = document.getElementById('error-tracker-content');
    if (content) {
        content.classList.toggle('hidden');
    }
}

// Auto-start features
document.addEventListener('DOMContentLoaded', function() {
    // Initialize error tracker but don't show widget by default
    // errorTracker.createErrorWidget(); // Commented out for cleaner interface
    
    // Start connection monitoring if we're on a page that needs it
    // Note: Exclude /terminal since it now uses ttyd instead of Socket.IO
    if (window.location.pathname === '/') {
        connectionMonitor.start();
    }
});

// Enhanced debugging console commands
if (typeof window !== 'undefined') {
    window.debugTools = {
        startSystemMonitor: () => systemMonitor.start(),
        stopSystemMonitor: () => systemMonitor.stop(),
        logError: (level, message, details) => errorTracker.logError(level, message, details),
        clearErrors: () => errorTracker.clearErrors(),
        profileStart: (label) => performanceProfiler.start(label),
        profileEnd: (label) => performanceProfiler.end(label),
        performanceReport: () => performanceProfiler.showReport(),
        connectionStats: () => connectionMonitor.getStats()
    };
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SystemMonitor,
        ErrorTracker,
        PerformanceProfiler,
        ConnectionMonitor
    };
}