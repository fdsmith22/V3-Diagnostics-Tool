// static/js/config.js - Unified Global Configuration

const CONFIG = {
    THEME: {
        dark: {
            background: '#1a1a1a',
            foreground: '#e1e1e1',
            primary: '#0d6efd',
            success: '#198754',
            warning: '#ffc107',
            danger: '#dc3545',
            gray: '#888888'
        }
    },

    TERMINAL: {
        fontSize: 14,
        fontFamily: '"Courier New", monospace',
        cursorBlink: true,
        scrollback: 1000,
        theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff'
        }
    },

    API: {
        BASE_URL: '',  // For future proxy handling
        TIMEOUT_MS: 30000,
        ENDPOINTS: {
            ping: '/api/ping',
            diagnostic: '/api/diagnostic',
            system: '/api/system'
        },
        AUTH_HEADER_KEY: 'X-Auth-Token',
        DEFAULT_TOKEN: 'changeme'  // Replace with a secure token at runtime if needed
    },

    UI: {
        REFRESH_INTERVAL_MS: 30000,
        ALERT_DURATION_MS: 5000
    }
};

// Expose globally
window.CONFIG = CONFIG;
