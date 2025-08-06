// static/js/connection.js

(function () {
    class ConnectionManager {
        constructor() {
            this.isDeviceConnected = false;
            this.checkInterval = null;
            this.stateKey = 'connectionState';

            this.statusStates = {
                ready: {
                    color: 'primary',
                    icon: 'check_circle',
                    message: 'Ready to run diagnostics'
                },
                running: {
                    color: 'warning',
                    icon: 'pending',
                    message: 'Diagnostics in progress...'
                },
                success: {
                    color: 'success',
                    icon: 'task_alt',
                    message: 'Diagnostics complete'
                },
                error: {
                    color: 'danger',
                    icon: 'error',
                    message: 'Error - Check Connection'
                }
            };

            this.init();
        }

        init() {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('[ConnectionManager] Initializing...');
                this.loadSavedState();
                this.injectStatusComponents();
                this.startConnectionCheck();
            });
        }

        getAuthHeaders() {
            const token =
                window.CONFIG?.API?.DEFAULT_TOKEN ||
                'changeme';
            const headerKey =
                window.CONFIG?.API?.AUTH_HEADER_KEY ||
                'X-Auth-Token';

            return {
                'Accept': 'application/json',
                [headerKey]: token
            };
        }

        injectStatusComponents() {
            this.injectStatusBanner();
            // Removed duplicate connection indicator - using navbar.html version
        }

        injectStatusBanner() {
            if (document.getElementById('statusBanner')) return;

            const container = document.querySelector('.content-area');
            if (!container) {
                console.warn('[ConnectionManager] No .content-area container found');
                return;
            }

            const banner = document.createElement('div');
            banner.id = 'statusBanner';
            banner.className = 'alert alert-primary d-flex align-items-center mb-4';
            banner.setAttribute('role', 'alert');
            banner.innerHTML = `
                <i class="material-icons me-2">check_circle</i>
                <div>Ready to run diagnostics</div>
            `;
            container.insertBefore(banner, container.firstChild);
        }

        injectConnectionIndicator() {
            const navbar = document.querySelector('.navbar-nav');
            if (!navbar || document.getElementById('connectionIndicator')) return;

            const indicator = document.createElement('li');
            indicator.className = 'nav-item ms-2';
            indicator.innerHTML = `
                <div id="connectionIndicator" class="d-flex align-items-center">
                    <button class="btn btn-sm btn-danger d-flex align-items-center gap-2"
                            onclick="connectionManager.checkDeviceConnection()"
                            data-bs-toggle="tooltip"
                            data-bs-placement="bottom"
                            title="Click to check connection">
                        <i class="material-icons" style="font-size: 16px;">fiber_manual_record</i>
                        <span>Disconnected</span>
                    </button>
                </div>
            `;

            navbar.appendChild(indicator);

            const tooltipEl = indicator.querySelector('[data-bs-toggle="tooltip"]');
            if (tooltipEl && typeof bootstrap !== 'undefined') {
                new bootstrap.Tooltip(tooltipEl);
            }
        }

        async checkDeviceConnection() {
            try {
                const response = await fetch('/api/ping', {
                    method: 'GET',
                    headers: this.getAuthHeaders(),
                    cache: 'no-store'
                });

                if (!response.ok) throw new Error('Ping failed with non-200 status');

                const data = await response.json();
                console.log('[ConnectionManager] Ping response:', data);

                this.isDeviceConnected = data.connected === true;
                this.updateConnectionDisplay();
                this.updateStatusBanner(this.isDeviceConnected ? 'ready' : 'error');

                if (window.diagnosticsState?.setConnectionStatus) {
                    window.diagnosticsState.setConnectionStatus(this.isDeviceConnected);
                }

                this.saveState();
                
                // Reset failures and interval on successful connection
                if (this.isDeviceConnected && this.consecutiveFailures > 0) {
                    console.log('[ConnectionManager] Connection restored, resetting to normal interval');
                    this.consecutiveFailures = 0;
                    this.checkIntervalMs = 20000;
                }
            } catch (error) {
                console.warn('[ConnectionManager] Connection check failed:', error);
                this.isDeviceConnected = false;
                this.updateConnectionDisplay();
                this.updateStatusBanner('error');

                if (window.diagnosticsState?.setConnectionStatus) {
                    window.diagnosticsState.setConnectionStatus(false);
                }

                this.saveState();
                
                // Implement exponential backoff for failures
                this.consecutiveFailures = (this.consecutiveFailures || 0) + 1;
                if (this.consecutiveFailures >= 3) {
                    // After 3 failures, slow down checks to every 60 seconds
                    this.checkIntervalMs = Math.min(60000, this.checkIntervalMs * 2);
                    console.log(`[ConnectionManager] Backing off to ${this.checkIntervalMs/1000}s interval after ${this.consecutiveFailures} failures`);
                }
            }
        }

        updateConnectionDisplay() {
            // Update navbar connection status
            const navbarButton = document.getElementById('connectionStatus');
            const navbarText = document.getElementById('connectionText');
            
            if (navbarButton && navbarText) {
                // Enable button after check
                navbarButton.disabled = false;
                
                if (this.isDeviceConnected) {
                    navbarButton.classList.remove('btn-danger', 'btn-warning');
                    navbarButton.classList.add('btn-success');
                    navbarText.textContent = 'Connected';
                    navbarButton.setAttribute('title', 'Device connected');
                } else {
                    navbarButton.classList.remove('btn-success', 'btn-warning');
                    navbarButton.classList.add('btn-danger');
                    navbarText.textContent = 'Disconnected';
                    navbarButton.setAttribute('title', 'Click to check connection');
                }
            }
        }

        updateStatusBanner(state) {
            const banner = document.getElementById('statusBanner');
            if (!banner) return;

            const stateConfig = this.statusStates[state];
            if (!stateConfig) return;

            banner.className = `alert alert-${stateConfig.color} d-flex align-items-center mb-4`;
            banner.innerHTML = `
                <i class="material-icons me-2">${stateConfig.icon}</i>
                <div>${stateConfig.message}</div>
            `;
            banner.style.animation = 'fadeInDown 0.3s ease-out';
            setTimeout(() => banner.style.animation = '', 300);
        }

        startConnectionCheck() {
            this.checkDeviceConnection();
            // Start with normal interval
            this.checkIntervalMs = 20000;
            this.consecutiveFailures = 0;
            this.scheduleNextCheck();
        }
        
        scheduleNextCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }
            this.checkInterval = setTimeout(() => {
                this.checkDeviceConnection();
                this.scheduleNextCheck();
            }, this.checkIntervalMs);
        }

        stopConnectionCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
        }

        loadSavedState() {
            // Always start with disconnected state and verify with actual check
            this.isDeviceConnected = false;
            
            const saved = localStorage.getItem(this.stateKey);
            if (saved) {
                try {
                    const state = JSON.parse(saved);
                    // Only use saved state if it's recent (within last 30 seconds)
                    if (state.lastCheck) {
                        const lastCheck = new Date(state.lastCheck);
                        const now = new Date();
                        const diffSeconds = (now - lastCheck) / 1000;
                        
                        if (diffSeconds < 30) {
                            this.isDeviceConnected = state.isConnected || false;
                        }
                    }
                } catch (e) {
                    console.error('[ConnectionManager] Failed to parse saved state:', e);
                }
            }
        }

        saveState() {
            try {
                localStorage.setItem(this.stateKey, JSON.stringify({
                    isConnected: this.isDeviceConnected,
                    lastCheck: new Date().toISOString()
                }));
            } catch (e) {
                console.error('[ConnectionManager] Failed to save state:', e);
            }
        }
    }

    // Global instance
    window.connectionManager = new ConnectionManager();

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        #statusBanner {
            border: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        #connectionIndicator button {
            transition: all 0.3s ease;
        }

        #connectionIndicator button:hover {
            filter: brightness(0.9);
        }

        #connectionIndicator button:active {
            transform: scale(0.95);
        }

        .material-icons {
            font-size: 20px;
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);
})();
