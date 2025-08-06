(function () {
    const Utils = {
        debounce(func, wait) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        throttle(func, limit) {
            let inThrottle;
            return function (...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        showAlert(message, type = 'info', duration) {
            const alertContainer = document.getElementById('alertContainer') || this.createAlertContainer();

            const alert = document.createElement('div');
            alert.className = `alert alert-${type} alert-dismissible fade show`;
            alert.innerHTML = `
                ${this.escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;

            alertContainer.appendChild(alert);

            const timeout = duration ?? CONFIG?.UI?.ALERT_DURATION_MS ?? 5000;
            if (timeout > 0) {
                setTimeout(() => {
                    alert.classList.remove('show');
                    setTimeout(() => alert.remove(), 150);
                }, timeout);
            }
        },

        createAlertContainer() {
            const container = document.createElement('div');
            container.id = 'alertContainer';
            container.className = 'alert-container position-fixed top-0 end-0 p-3';
            container.style.zIndex = '1050';
            document.body.appendChild(container);
            return container;
        },

        async fetchWithTimeout(url, options = {}) {
            const timeout = options.timeout ?? CONFIG?.API?.TIMEOUT_MS ?? 30000;
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(id);
                return response;
            } catch (error) {
                clearTimeout(id);
                throw error;
            }
        },

        escapeHtml(unsafe = '') {
            if (typeof unsafe !== 'string') return '';
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        },

        createStatusBanner() {
            if (document.getElementById('statusBanner')) return;

            const content = document.querySelector('.content-area');
            if (!content) return;

            const banner = document.createElement('div');
            banner.id = 'statusBanner';
            banner.className = 'alert alert-primary d-flex align-items-center mb-4';
            banner.innerHTML = `
                <i class="material-icons me-2">check_circle</i>
                <div>Ready to run diagnostics</div>
            `;

            content.insertBefore(banner, content.firstChild);
        }
    };

    // Expose globally
    window.Utils = Utils;
})();
