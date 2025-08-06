// static/js/state.js
(function () {
    class DiagnosticsState {
        constructor() {
            this._state = {
                testResults: new Map(),
                isConnected: false,
                isLoading: false,
                errors: new Map()
            };
            this._listeners = new Set();
            this.loadFromStorage();
        }

        subscribe(listener) {
            if (typeof listener === 'function') {
                this._listeners.add(listener);
                return () => this._listeners.delete(listener);
            }
        }

        notify() {
            this._listeners.forEach(listener => {
                try {
                    listener(this._state);
                } catch (e) {
                    console.warn('[DiagnosticsState] Listener failed:', e);
                }
            });
        }

        setState(updater) {
            const newState = typeof updater === 'function' ? updater(this._state) : updater;
            this._state = { ...this._state, ...newState };
            this.saveToStorage();
            this.notify();
        }

        setTestResult(testName, result) {
            if (!(this._state.testResults instanceof Map)) {
                this._state.testResults = new Map();
            }

            // If check_all, flatten and store each result separately
            if (testName === 'check_all' && result?.data) {
                Object.entries(result.data).forEach(([key, value]) => {
                    this._state.testResults.set(key, {
                        ...value,
                        timestamp: new Date().toISOString()
                    });
                });
            } else {
                this._state.testResults.set(testName, {
                    ...result,
                    timestamp: new Date().toISOString()
                });
            }

            this.saveToStorage();
            this.notify();
        }

        getTestResult(testName) {
            return this._state.testResults?.get(testName) || null;
        }

        setConnectionStatus(status) {
            this._state.isConnected = !!status;
            this.saveToStorage();
            this.notify();
        }

        isDeviceConnected() {
            return !!this._state.isConnected;
        }

        saveToStorage() {
            try {
                const serialized = JSON.stringify({
                    testResults: Array.from(this._state.testResults?.entries?.() || []),
                    isConnected: this._state.isConnected,
                    errors: Array.from(this._state.errors?.entries?.() || [])
                });
                localStorage.setItem('diagnosticsState', serialized);
            } catch (error) {
                console.error('[DiagnosticsState] Failed to save state:', error);
            }
        }

        loadFromStorage() {
            try {
                const saved = localStorage.getItem('diagnosticsState');
                if (!saved) return;

                const parsed = JSON.parse(saved);
                this._state.testResults = new Map(parsed.testResults || []);
                this._state.errors = new Map(parsed.errors || []);
                this._state.isConnected = !!parsed.isConnected;
            } catch (error) {
                console.error('[DiagnosticsState] Failed to load state:', error);
            }
        }
    }

    // Global instance
    window.diagnosticsState = new DiagnosticsState();

    // Global helpers
    window.isDeviceConnected = () => window.diagnosticsState?.isDeviceConnected?.() || false;

    window.updateStatusBanner = function (state) {
        const banner = document.getElementById('statusBanner');
        if (!banner) return;

        const states = {
            ready: {
                class: 'alert-primary',
                icon: 'check_circle',
                text: 'Ready to run diagnostics'
            },
            running: {
                class: 'alert-warning',
                icon: 'pending',
                text: 'Diagnostics in progress...'
            },
            success: {
                class: 'alert-success',
                icon: 'task_alt',
                text: 'Diagnostics complete'
            },
            partial: {
                class: 'alert-info',
                icon: 'info',
                text: 'Diagnostics complete with warnings'
            },
            error: {
                class: 'alert-danger',
                icon: 'error',
                text: 'Error - Check connection or device status'
            }
        };

        const current = states[state] || states.ready;

        banner.className = `alert ${current.class} d-flex align-items-center mb-4`;
        banner.innerHTML = `
            <i class="material-icons me-2">${current.icon}</i>
            <div>${current.text}</div>
        `;
    };
})();

