// Global variables
let isDeviceConnected = false;
let sshConnectionDetails = null;
let connectionCheckInterval = null;
let cpuChart = null; // Placeholder for potential CPU chart
let memoryChart = null; // Placeholder for potential Memory chart
let testResults = {}; // To store results of various tests
let allDetectedIssues = []; // Store all issues from all tests

// Define the standard camera placeholder HTML for reuse
const defaultCameraPlaceholder = `
  <div class="camera-placeholder text-center p-3">
    <i class="bi bi-camera-video-off text-4xl text-gray-400"></i>
    <p class="mt-2 text-gray-300">Camera details will appear here after running a check.</p>
  </div>`;
const noCameraDataPlaceholder = `
  <div class="camera-placeholder text-center p-3">
    <i class="bi bi-camera-video-off text-4xl text-gray-400"></i>
    <p class="mt-2 text-gray-300">No camera data returned or test did not provide camera details.</p>
  </div>`;
const noCameraDataLastRunPlaceholder = `
  <div class="camera-placeholder text-center p-3">
    <i class="bi bi-camera-video-off text-4xl text-gray-400"></i>
    <p class="mt-2 text-gray-300">No camera data from last tests.</p>
  </div>`;

// Enhanced configuration object for better maintainability
const CONFIG = {
  TIMEOUTS: {
    CONNECTION_CHECK: 10000, // Increased for SSH verification
    CONNECTION_CHECK_INTERVAL: 60000, // Check every 60 seconds
    TEST_EXECUTION: 300000, // 5 minutes
    NOTIFICATION_DURATION: 3000,
    PAGE_TRANSITION: 100,
    CONNECTION_RETRY_DELAY: 5000
  },
  TEMPERATURE_THRESHOLDS: {
    HIGH: 45,
    CRITICAL: 75,
    MIN_VALID: -50,
    MAX_VALID: 150
  },
  BATTERY_LOW_THRESHOLD: 15,
  MAX_RESPONSE_SNIPPET_LENGTH: 200,
  CONNECTION_CHECK_ENABLED: true,
  AUTO_REFRESH_SYSTEM_INFO: true
};

// Utility functions - enhanced for SSH integration
const utils = {
  /**
   * Safely get text content from element
   */
  safeGetText: (selector, defaultValue = '—') => {
    const element = document.querySelector(selector);
    return element ? (element.textContent.trim() || defaultValue) : defaultValue;
  },

  /**
   * Safely set text content to element
   */
  safeSetText: (selector, value, defaultValue = '—') => {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value || defaultValue;
    }
  },

  /**
   * Safely set HTML content to element
   */
  safeSetHTML: (selector, html) => {
    const element = document.querySelector(selector);
    if (element) {
      element.innerHTML = html;
    }
  },

  /**
   * Safely get HTML content from element
   */
  safeGetHTML: (selector) => {
    const element = document.querySelector(selector);
    return element ? element.innerHTML : '';
  },

  /**
   * Create timestamp for filenames
   */
  createTimestamp: () => {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  },

  /**
   * Validate temperature values
   */
  isValidTemperature: (temp) => {
    return temp >= CONFIG.TEMPERATURE_THRESHOLDS.MIN_VALID &&
           temp <= CONFIG.TEMPERATURE_THRESHOLDS.MAX_VALID;
  },

  /**
   * Debounce function to prevent rapid successive calls
   */
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml: (text) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  },

  /**
   * Add class to element
   */
  addClass: (selector, className) => {
    const element = document.querySelector(selector);
    if (element) {
      element.classList.add(className);
    }
  },

  /**
   * Remove class from element
   */
  removeClass: (selector, className) => {
    const element = document.querySelector(selector);
    if (element) {
      element.classList.remove(className);
    }
  },

  /**
   * Check if element has class
   */
  hasClass: (selector, className) => {
    const element = document.querySelector(selector);
    return element ? element.classList.contains(className) : false;
  },

  /**
   * Set CSS property
   */
  setCSS: (selector, property, value) => {
    const element = document.querySelector(selector);
    if (element) {
      element.style[property] = value;
    }
  },

  /**
   * Format duration from seconds
   */
  formatDuration: (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  },

  /**
   * Check if connection details indicate SSH availability
   */
  isSSHAvailable: (connectionDetails) => {
    return connectionDetails?.ssh_available === true;
  },

  /**
   * Get connection age in seconds
   */
  getConnectionAge: (connectionDetails) => {
    if (!connectionDetails?.last_test) return null;
    return Math.floor((Date.now() / 1000) - connectionDetails.last_test);
  }
};

// Initialize everything when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeApplication();
});

/**
 * Enhanced application initialization with SSH integration
 */
function initializeApplication() {
  try {
    console.log('Initializing V3 Diagnostics Tool with enhanced SSH support...');

    // Page transition animation
    setTimeout(() => {
      const pageTransitionElement = document.querySelector('.page-transition');
      if (pageTransitionElement) {
        pageTransitionElement.classList.add('loaded');
      }
    }, CONFIG.TIMEOUTS.PAGE_TRANSITION);

    // Restore any saved diagnostics data
    restoreDiagnosticsOutput();

    // Enhanced connection checking with SSH support
    initializeConnectionMonitoring();

    // Initialize expandable cards
    initializeExpandableCards();

    // Set initial camera placeholder
    const cameraDetails = document.querySelector('#cameraDetails');
    if (cameraDetails && !cameraDetails.innerHTML.trim()) {
      cameraDetails.innerHTML = defaultCameraPlaceholder;
    }

    // Initialize error handling
    initializeErrorHandling();

    // Initialize keyboard shortcuts
    initializeKeyboardShortcuts();

    // Check for URL parameters (e.g., auto-run tests)
    handleURLParameters();

    console.log('Application initialization complete');

  } catch (error) {
    console.error('Failed to initialize application:', error);
    showToast('Application initialization failed. Please refresh the page.', 'error');
  }
}

/**
 * Initialize enhanced connection monitoring with SSH support
 */
function initializeConnectionMonitoring() {
  // Initial connection check
  checkDeviceConnection();

  // Set up periodic connection checking if enabled
  if (CONFIG.CONNECTION_CHECK_ENABLED) {
    connectionCheckInterval = setInterval(() => {
      checkDeviceConnection(false); // Silent check
    }, CONFIG.TIMEOUTS.CONNECTION_CHECK_INTERVAL);

    console.log(`Connection monitoring enabled (${CONFIG.TIMEOUTS.CONNECTION_CHECK_INTERVAL}ms interval)`);
  }
}

/**
 * Initialize keyboard shortcuts
 */
function initializeKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    // Ctrl+R or F5 for refresh
    if ((event.ctrlKey && event.key === 'r') || event.key === 'F5') {
      event.preventDefault();
      checkDeviceConnection(true); // Force refresh
    }

    // Ctrl+S for save log
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      saveLogOutput();
    }

    // Ctrl+D for full diagnostics
    if (event.ctrlKey && event.key === 'd') {
      event.preventDefault();
      runTest('full_diagnostics');
    }
  });
}

/**
 * Handle URL parameters for auto-running tests
 */
function handleURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const autoTest = urlParams.get('test');

  if (autoTest) {
    console.log(`Auto-running test from URL: ${autoTest}`);
    setTimeout(() => {
      runTest(autoTest);
    }, 1000); // Delay to ensure UI is ready
  }
}

/**
 * Initialize expandable cards functionality
 */
function initializeExpandableCards() {
  document.querySelectorAll('.dashboard-card.expandable').forEach(card => {
    const header = card.querySelector('.card-header');
    const content = card.querySelector('.collapse');
    const icon = header?.querySelector('.btn-expand i');

    if (!header || !content || !icon) return;

    // Set initial state
    updateExpandIcon(icon, !content.classList.contains('hidden'));

    // Add click listener with debouncing
    const debouncedToggle = utils.debounce(() => {
      setTimeout(() => {
        updateExpandIcon(icon, !content.classList.contains('hidden'));
      }, 200);
    }, 100);

    header.addEventListener('click', debouncedToggle);
  });
}

/**
 * Update expand/collapse icon
 */
function updateExpandIcon(icon, isExpanded) {
  icon.classList.remove('bi-chevron-down', 'bi-chevron-up');
  icon.classList.add(isExpanded ? 'bi-chevron-up' : 'bi-chevron-down');
}

/**
 * Initialize global error handling
 */
function initializeErrorHandling() {
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('An unexpected error occurred. Check the console for details.', 'error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An unexpected error occurred. Check the console for details.', 'error');
  });
}

// Enhanced Connection Check with SSH support and detailed reporting
function checkDeviceConnection(forceRefresh = false, showNotification = true) {
  const btn = document.querySelector('#connectionStatus');
  if (!btn) {
    console.warn('Connection status button not found');
    return Promise.resolve(false);
  }

  // Update button to show checking state
  btn.innerHTML = '<i class="bi bi-arrow-repeat mr-2 animate-spin"></i>Checking...';
  btn.className = btn.className.replace(/bg-(red|green|yellow)-\d+/, '').replace(/hover:bg-(red|green|yellow)-\d+/, '');
  btn.classList.add('bg-yellow-600', 'hover:bg-yellow-700');

  const url = forceRefresh ? '/connection_status?refresh=true' : '/ping';

  return fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(CONFIG.TIMEOUTS.CONNECTION_CHECK)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    try {
      const wasConnected = isDeviceConnected;
      isDeviceConnected = Boolean(data?.connected);
      sshConnectionDetails = data?.connection_details || data?.details || null;

      updateConnectionDisplay(isDeviceConnected, sshConnectionDetails);

      // Update status banner if not currently running tests
      const banner = document.getElementById("statusBanner");
      if (banner && !banner.innerHTML.includes("progress")) {
        updateStatusBanner(isDeviceConnected ? "ready" : "error");
      }

      // Show notification for connection state changes
      if (showNotification && wasConnected !== isDeviceConnected) {
        const message = isDeviceConnected ?
          'Device connection established' :
          'Device connection lost';
        const type = isDeviceConnected ? 'success' : 'warning';
        showToast(message, type);
      }

      // Log connection details for debugging
      if (forceRefresh || showNotification) {
        console.log('Connection check result:', {
          connected: isDeviceConnected,
          ssh_available: utils.isSSHAvailable(sshConnectionDetails),
          details: sshConnectionDetails
        });
      }

      return isDeviceConnected;

    } catch (error) {
      console.error('Error processing connection response:', error);
      handleConnectionError(showNotification);
      return false;
    }
  })
  .catch(error => {
    console.error('Connection check failed:', error);
    handleConnectionError(showNotification);
    return false;
  });
}

/**
 * Enhanced connection error handling
 */
function handleConnectionError(showNotification = true) {
  isDeviceConnected = false;
  sshConnectionDetails = null;
  updateConnectionDisplay(false);

  const banner = document.getElementById("statusBanner");
  if (banner && !banner.innerHTML.includes("progress")) {
    updateStatusBanner("error");
  }

  if (showNotification) {
    showToast('Connection check failed - network or SSH issue', 'error');
  }
}

/**
 * Enhanced connection display with SSH details
 */
function updateConnectionDisplay(connected, connectionDetails = null) {
  const btn = document.querySelector('#connectionStatus');
  if (!btn) return;

  // Clear existing color classes
  btn.className = btn.className.replace(/bg-(red|green|yellow|blue)-\d+/, '');
  btn.className = btn.className.replace(/hover:bg-(red|green|yellow|blue)-\d+/, '');

  if (connected) {
    const sshAvailable = utils.isSSHAvailable(connectionDetails);

    if (sshAvailable) {
      // Full SSH connection available
      btn.classList.add('bg-green-600', 'hover:bg-green-700');
      btn.innerHTML = '<i class="bi bi-shield-check mr-2"></i>SSH Connected';

      // Add connection age if available
      const age = utils.getConnectionAge(connectionDetails);
      if (age !== null && age < 60) {
        btn.title = `SSH connection verified ${age}s ago`;
      }
    } else {
      // Ping only connection
      btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      btn.innerHTML = '<i class="bi bi-ethernet mr-2"></i>Ping Only';
      btn.title = 'Device reachable but SSH unavailable';
    }
  } else {
    // No connection
    btn.classList.add('bg-red-600', 'hover:bg-red-700');
    btn.innerHTML = '<i class="bi bi-exclamation-triangle mr-2"></i>Disconnected';
    btn.title = 'Device not reachable';
  }

  // Update navbar connection status if function exists
  if (typeof updateNavbarConnectionStatus === 'function') {
    updateNavbarConnectionStatus(connected);
  }
}

/**
 * Get detailed connection status for display
 */
function getConnectionStatusInfo() {
  if (!sshConnectionDetails) {
    return 'No connection details available';
  }

  const parts = [];

  if (sshConnectionDetails.ssh_available) {
    parts.push('✅ SSH Available');
  } else {
    parts.push('❌ SSH Unavailable');
  }

  if (sshConnectionDetails.ping_available !== undefined) {
    parts.push(sshConnectionDetails.ping_available ? '✅ Ping OK' : '❌ Ping Failed');
  }

  if (sshConnectionDetails.connection_count) {
    parts.push(`Connections: ${sshConnectionDetails.connection_count}`);
  }

  if (sshConnectionDetails.cache_age !== null && sshConnectionDetails.cache_age < 60) {
    parts.push(`Updated: ${Math.round(sshConnectionDetails.cache_age)}s ago`);
  }

  if (sshConnectionDetails.error) {
    parts.push(`Error: ${sshConnectionDetails.error}`);
  }

  return parts.join('\n');
}

// Enhanced Status Updates with SSH awareness
const statusConfig = {
  ready: {
    color: "rgb(59 130 246)", // blue-500
    bgColor: "rgb(30 58 138 / 0.3)", // blue-900/30
    borderColor: "rgb(29 78 216)", // blue-700
    textColor: "rgb(147 197 253)", // blue-200
    iconColor: "rgb(96 165 250)", // blue-400
    message: '<i class="bi bi-info-circle mr-2 text-blue-400"></i>Ready to run diagnostics'
  },
  running: {
    color: "rgb(245 158 11)", // yellow-500
    bgColor: "rgb(120 53 15 / 0.3)", // yellow-900/30
    borderColor: "rgb(217 119 6)", // yellow-700
    textColor: "rgb(254 240 138)", // yellow-200
    iconColor: "rgb(251 191 36)", // yellow-400
    message: '<i class="bi bi-hourglass-split mr-2 animate-pulse text-yellow-400"></i>Diagnostics in progress...'
  },
  success: {
    color: "rgb(34 197 94)", // green-500
    bgColor: "rgb(20 83 45 / 0.3)", // green-900/30
    borderColor: "rgb(21 128 61)", // green-700
    textColor: "rgb(187 247 208)", // green-200
    iconColor: "rgb(74 222 128)", // green-400
    message: '<i class="bi bi-check-circle mr-2 text-green-400"></i>Diagnostics complete'
  },
  error: {
    color: "rgb(239 68 68)", // red-500
    bgColor: "rgb(127 29 29 / 0.3)", // red-900/30
    borderColor: "rgb(185 28 28)", // red-700
    textColor: "rgb(254 202 202)", // red-200
    iconColor: "rgb(248 113 113)", // red-400
    message: '<i class="bi bi-exclamation-circle mr-2 text-red-400"></i>Error - Check Connection or Test Failure'
  },
  ssh_warning: {
    color: "rgb(245 158 11)", // yellow-500
    bgColor: "rgb(120 53 15 / 0.3)", // yellow-900/30
    borderColor: "rgb(217 119 6)", // yellow-700
    textColor: "rgb(254 240 138)", // yellow-200
    iconColor: "rgb(251 191 36)", // yellow-400
    message: '<i class="bi bi-exclamation-triangle mr-2 text-yellow-400"></i>Limited functionality - SSH unavailable'
  }
};

function updateStatusBanner(state) {
  const banner = document.getElementById("statusBanner");
  if (!banner) {
    console.warn('Status banner element not found');
    return;
  }

  // Auto-detect SSH warning state
  if (state === "ready" && isDeviceConnected && !utils.isSSHAvailable(sshConnectionDetails)) {
    state = "ssh_warning";
  }

  const config = statusConfig[state] || statusConfig.ready;

  // Update classes
  banner.className = `flex items-center p-3 border rounded-md transition-all`;
  banner.style.backgroundColor = config.bgColor;
  banner.style.borderColor = config.borderColor;
  banner.style.color = config.textColor;

  banner.innerHTML = config.message;

  // Add connection details tooltip for error states
  if (state === "error" || state === "ssh_warning") {
    banner.title = getConnectionStatusInfo();
  }

  // Animate banner update
  banner.classList.remove('animate-fade-in');
  void banner.offsetWidth; // Force reflow
  banner.classList.add('animate-fade-in');
}

// Enhanced save log functionality
function saveLogOutput() {
  try {
    const outputElement = document.getElementById('output');
    if (!outputElement) {
      showToast('No diagnostic output element found.', 'error');
      return;
    }

    const outputText = outputElement.textContent || outputElement.innerText || '';
    if (!outputText.trim()) {
      showToast('No diagnostic output to save.', 'warning');
      return;
    }

    const filename = `v3-diagnostics-${utils.createTimestamp()}.log`;
    downloadTextFile(outputText, filename);
    showToast(`Log saved successfully as ${filename}`, 'success');

  } catch (error) {
    console.error('Error saving log:', error);
    showToast('Failed to save log file.', 'error');
  }
}

/**
 * Download text content as file
 */
function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

// Enhanced toast notification system with better error handling
function showToast(message, type = 'info', duration = CONFIG.TIMEOUTS.NOTIFICATION_DURATION) {
  try {
    const toastContainer = getOrCreateToastContainer();
    const toast = createToastElement(message, type);

    toastContainer.appendChild(toast);

    // Show toast with animation
    setTimeout(() => {
      toast.classList.remove('translate-x-full', 'opacity-0');
      toast.classList.add('translate-x-0', 'opacity-100');
    }, 10);

    // Auto-hide toast
    setTimeout(() => {
      hideToast(toast);
    }, duration);

    // Add click to dismiss
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => hideToast(toast));
    }

  } catch (error) {
    console.error('Error showing toast:', error);
    // Fallback to basic alert
    alert(`${type.toUpperCase()}: ${message}`);
  }
}

/**
 * Hide toast with animation
 */
function hideToast(toast) {
  toast.classList.remove('translate-x-0', 'opacity-100');
  toast.classList.add('translate-x-full', 'opacity-0');

  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 300);
}

/**
 * Get or create toast container
 */
function getOrCreateToastContainer() {
  let container = document.querySelector('.toast-container');

  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container fixed bottom-4 right-4 z-50 space-y-2';
    document.body.appendChild(container);
  }

  return container;
}

/**
 * Create toast element
 */
function createToastElement(message, type) {
  const iconMap = {
    success: 'check-circle',
    error: 'exclamation-circle',
    warning: 'exclamation-triangle',
    info: 'info-circle'
  };

  const colorMap = {
    success: 'bg-green-600 border-green-500',
    error: 'bg-red-600 border-red-500',
    warning: 'bg-yellow-600 border-yellow-500',
    info: 'bg-blue-600 border-blue-500'
  };

  const toast = document.createElement('div');
  toast.className = `flex items-center w-80 p-4 text-white ${colorMap[type] || colorMap.info} border rounded-lg shadow-lg transform transition-all duration-300 ease-in-out translate-x-full opacity-0`;

  const iconClass = iconMap[type] || 'info-circle';
  const escapedMessage = utils.escapeHtml(message);

  toast.innerHTML = `
    <div class="flex items-center flex-1">
      <i class="bi bi-${iconClass} mr-3 text-lg"></i>
      <span class="text-sm font-medium">${escapedMessage}</span>
    </div>
    <button class="toast-close ml-4 p-1 hover:bg-white/20 rounded transition-colors" title="Close">
      <i class="bi bi-x text-lg"></i>
    </button>
  `;

  return toast;
}

// Enhanced issue detection with SSH awareness
function processAndDetectIssues(response, testName) {
  let detectedIssues = [];

  try {
    // Process backend issues first
    if (Array.isArray(response?.issues)) {
      detectedIssues = [...response.issues];
    }

    // Add SSH-specific issues
    detectedIssues.push(...detectSSHIssues(response));



    // Additional client-side issue detection
    detectedIssues.push(...detectCameraIssues(response, testName));
    detectedIssues.push(...detectConnectivityIssues(response));
    detectedIssues.push(...detectTemperatureIssues(response));
    detectedIssues.push(...detectBatteryIssues(response));

    // Filter out unwanted issues
    detectedIssues = filterIssues(detectedIssues);

  } catch (error) {
    console.error('Error processing issues:', error);
    detectedIssues.push('⚠️ System Issue: Error occurred while analyzing diagnostic results');
  }

  return detectedIssues;
}

/**
 * Detect SSH-related issues
 */
function detectSSHIssues(response) {
  const issues = [];

  // Check if SSH is explicitly marked as unavailable
  if (response?.ssh_connected === false) {
    issues.push('🔒 SSH Issue: SSH connection unavailable - some features may be limited');
  }

  // Check global SSH connection status
  if (isDeviceConnected && !utils.isSSHAvailable(sshConnectionDetails)) {
    issues.push('🔒 SSH Warning: Device reachable but SSH access unavailable');
  }

  return issues;
}

/**
 * Detect camera-related issues
 */
function detectCameraIssues(response, testName) {
  const issues = [];

  if (response?.camera_details_html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = response.camera_details_html;
    const cameraText = (tempDiv.textContent || tempDiv.innerText || '').toLowerCase();

    const errorKeywords = ['not found', 'no camera', 'failed', 'error'];
    if (errorKeywords.some(keyword => cameraText.includes(keyword))) {
      issues.push('⚠️ Camera Issue: Camera not detected or failed to initialize');
    }
  } else if (testName === 'check_camera' || testName === 'full_diagnostics') {
    issues.push('⚠️ Camera Issue: No camera data available');
  }

  return issues;
}

/**
 * Detect connectivity issues
 */
function detectConnectivityIssues(response) {
  const issues = [];

  if (response?.output) {
    const output = response.output.toLowerCase();

    // SIM/Modem issues
    if (output.includes('sim') && ['not found', 'failed', 'error'].some(keyword => output.includes(keyword))) {
      issues.push('📡 SIM/Modem Issue: SIM card or modem connectivity problem detected');
    }

    if (output.includes('modem') && ['not found', 'failed', 'error'].some(keyword => output.includes(keyword))) {
      issues.push('📡 Modem Issue: Modem device not responding or not found');
    }

    // Network issues
    if (output.includes('network') && ['failed', 'timeout', 'unreachable'].some(keyword => output.includes(keyword))) {
      issues.push('🌐 Network Issue: Network connectivity problems detected');
    }
  }

  return issues;
}

/**
 * Detect temperature issues with improved parsing
 */
function detectTemperatureIssues(response) {
  const issues = [];

  if (!response?.system_info && !response?.output) {
    return issues;
  }

  try {
    const textToCheck = (response.output || '') + ' ' + JSON.stringify(response.system_info || {});
    const temperatures = extractTemperatures(textToCheck);

    if (temperatures.length > 0) {
      const highTemps = temperatures.filter(temp =>
        temp > CONFIG.TEMPERATURE_THRESHOLDS.HIGH && temp <= CONFIG.TEMPERATURE_THRESHOLDS.CRITICAL
      );
      const criticalTemps = temperatures.filter(temp => temp > CONFIG.TEMPERATURE_THRESHOLDS.CRITICAL);

      if (criticalTemps.length > 0) {
        const maxCritical = Math.max(...criticalTemps);
        const message = criticalTemps.length === 1
          ? `🔥 Critical Temperature: ${maxCritical}°C detected (>${CONFIG.TEMPERATURE_THRESHOLDS.CRITICAL}°C)`
          : `🔥 Critical Temperature: ${criticalTemps.length} thermal zones above ${CONFIG.TEMPERATURE_THRESHOLDS.CRITICAL}°C (highest: ${maxCritical}°C)`;
        issues.push(message);
      } else if (highTemps.length > 0) {
        const maxHigh = Math.max(...highTemps);
        const message = highTemps.length === 1
          ? `🌡️ High Temperature: ${maxHigh}°C detected (>${CONFIG.TEMPERATURE_THRESHOLDS.HIGH}°C)`
          : `🌡️ High Temperature: ${highTemps.length} thermal zones above ${CONFIG.TEMPERATURE_THRESHOLDS.HIGH}°C (highest: ${maxHigh}°C)`;
        issues.push(message);
      }
    }
  } catch (error) {
    console.error('Error detecting temperature issues:', error);
  }

  return issues;
}

/**
 * Extract temperature values from text
 */
function extractTemperatures(text) {
  const tempPatterns = [
    /(\d+\.?\d*)\s*°?c(?:\s|$|,|;|\))/gi,
    /temperature[:\s]+(\d+\.?\d*)(?:\s*°?c)?/gi,
    /temp[:\s]+(\d+\.?\d*)(?:\s*°?c)?/gi,
    /thermal.*?(\d+\.?\d*)\s*°?c/gi
  ];

  const temperatures = [];

  tempPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const temp = parseFloat(match[1]);
      if (!isNaN(temp) && utils.isValidTemperature(temp)) {
        temperatures.push(temp);
      }
    }
  });

  return temperatures;
}

/**
 * Detect battery issues
 */
function detectBatteryIssues(response) {
  const issues = [];

  if (response?.battery_info) {
    const batteryPercent = parseInt(response.battery_info.percentage, 10);

    if (!isNaN(batteryPercent) && batteryPercent < CONFIG.BATTERY_LOW_THRESHOLD) {
      issues.push(`🔋 Battery Warning: Low battery level (${batteryPercent}%)`);
    }

    if (response.battery_info.status?.toLowerCase().includes('fault')) {
      issues.push('🔋 Battery Issue: Battery fault detected');
    }
  }

  return issues;
}

/**
 * Filter out unwanted issues
 */
function filterIssues(issues) {
  const excludeKeywords = ['storage', 'disk', 'memory usage', 'space'];

  return issues.filter(issue => {
    const lowercaseIssue = issue.toLowerCase();
    return !excludeKeywords.some(keyword => lowercaseIssue.includes(keyword));
  });
}

// Enhanced test execution with SSH verification
function runTest(testName) {
  if (!testName) {
    showToast('Invalid test name provided', 'error');
    return;
  }

  try {
    console.log(`Starting test execution: ${testName}`);

    // Check if SSH is required for this test and warn user
    if (requiresSSH(testName) && !utils.isSSHAvailable(sshConnectionDetails)) {
      const proceed = confirm(
        'This test requires SSH access, but SSH is currently unavailable. ' +
        'The test may fail or provide limited results. Continue anyway?'
      );

      if (!proceed) {
        showToast('Test cancelled - SSH required', 'warning');
        return;
      }
    }

    updateStatusBanner("running");

    const outputElement = document.getElementById("output");
    if (!outputElement) {
      showToast('Output element not found', 'error');
      return;
    }

    const testTitle = formatTestName(testName);
    appendToOutput(outputElement, `===== Running ${testTitle} =====\n`);

    utils.removeClass('#executionTimeCard', 'hidden');

    const { ajaxUrl, ajaxData } = prepareTestRequest(testName);
    executeTest(ajaxUrl, ajaxData, testName, testTitle, outputElement);

  } catch (error) {
    console.error('Error running test:', error);
    updateStatusBanner("error");
    showToast('Failed to start test execution', 'error');
  }
}

/**
 * Check if test requires SSH connection
 */
function requiresSSH(testName) {
  const sshRequiredTests = [
    'check_system', 'check_network', 'check_modem', 'check_camera',
    'check_battery', 'check_power', 'check_sim', 'check_logs',
    'check_storage', 'check_memory', 'check_interfaces', 'check_i2c',
    'check_usb', 'check_thermals', 'check_cpuinfo', 'check_memory_extended',
    'check_disk_health', 'check_dmesg_critical', 'check_board_variant', 'full_diagnostics'
  ];

  return sshRequiredTests.includes(testName);
}

/**
 * Format test name for display
 */
function formatTestName(testName) {
  return testName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Append text to output element
 */
function appendToOutput(outputElement, text) {
  const currentOutput = outputElement.innerText;
  outputElement.innerText = (currentOutput.trim() ? currentOutput + "\n\n" : "") + text;

  // Auto-scroll to bottom
  outputElement.scrollTop = outputElement.scrollHeight;
}

/**
 * Prepare request parameters
 */
function prepareTestRequest(testName) {
  if (testName === 'full_diagnostics') {
    return {
      ajaxUrl: '/run_full_diagnostics',
      ajaxData: {}
    };
  } else {
    return {
      ajaxUrl: '/run_single_test',
      ajaxData: { test_script: testName }
    };
  }
}

/**
 * Execute test with enhanced error handling and SSH awareness
 */
function executeTest(ajaxUrl, ajaxData, testName, testTitle, outputElement) {
  const startTime = Date.now();

  // Disable test buttons
  setTestButtonsState(true);

  const formData = new FormData();
  Object.keys(ajaxData).forEach(key => {
    formData.append(key, ajaxData[key]);
  });

  fetch(ajaxUrl, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(CONFIG.TIMEOUTS.TEST_EXECUTION)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(response => {
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Test ${testName} completed in ${duration}s`);
    handleTestSuccess(response, testName, testTitle, outputElement);
  })
  .catch(error => {
    const duration = (Date.now() - startTime) / 1000;
    console.error(`Test ${testName} failed after ${duration}s:`, error);
    handleTestError(error, testTitle, outputElement);
  })
  .finally(() => {
    setTestButtonsState(false);

    // Re-check connection after test to update status
    setTimeout(() => {
      checkDeviceConnection(false, false);
    }, 1000);
  });
}

/**
 * Set test buttons enabled/disabled state
 */
function setTestButtonsState(disabled) {
  const selectors = [
    '.btn-run-diagnostics',
    '.tests-grid button',
    'button[onclick*="runTest"]'
  ];

  selectors.forEach(selector => {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(button => {
      button.disabled = disabled;

      if (disabled) {
        button.classList.add('opacity-50', 'cursor-not-allowed');
      } else {
        button.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    });
  });
}

/**
 * Handle successful test response with SSH awareness
 */
function handleTestSuccess(response, testName, testTitle, outputElement) {
  try {
    const output = response.output || "Test completed. No specific output received.";
    appendToOutput(outputElement, `${output}\n===== ${testTitle} Complete =====\n`);

    // Show SSH status in output if relevant
    if (response.ssh_connected === false) {
      appendToOutput(outputElement, "\n⚠️ Note: SSH was unavailable during this test - results may be limited.\n");
    }

    updateStatusBanner("success");
    updateSystemInfo(response);
    updateBatteryInfo(response);
    updateCameraDetails(response, testName);
    updateIssuesDisplay(response, testName);
    updateExecutionSummary(response, testName);

    // Store results and persist
    testResults[testName] = response;
    persistDiagnosticsOutput();

    // Show completion notification
    const hasIssues = response.issues && response.issues.length > 0;
    const message = hasIssues ?
      `${testTitle} complete - ${response.issues.length} issues detected` :
      `${testTitle} completed successfully`;
    const type = hasIssues ? 'warning' : 'success';
    showToast(message, type);

  } catch (error) {
    console.error('Error handling test success:', error);
    appendToOutput(outputElement, `\nError processing test results: ${error.message}\n`);
    updateStatusBanner("error");
    showToast('Error processing test results', 'error');
  }
}

/**
 * Handle test execution error
 */
function handleTestError(error, testTitle, outputElement) {
  let errorMessage = `Error running ${testTitle}: ${error.message || 'Unknown error'}`;

  // Check if error is related to SSH connectivity
  if (error.message && (error.message.includes('SSH') || error.message.includes('connection'))) {
    errorMessage += '\n⚠️ This may be related to SSH connectivity issues.';
  }

  console.error('Test execution error:', error);
  appendToOutput(outputElement, `\n${errorMessage}\n===== ${testTitle} Failed =====\n`);
  updateStatusBanner("error");
  persistDiagnosticsOutput();
  showToast(`${testTitle} failed`, 'error');
}

/**
 * Update system information display with SSH status
 */
function updateSystemInfo(response) {
  if (!response.system_info) return;

  const { system_info } = response;
  utils.safeSetText('#hwid', system_info.hwid);
  utils.safeSetText('#ip', system_info.ip);
  utils.safeSetText('#uptime', system_info.uptime);
  utils.safeSetText('#macAddress', system_info.mac);
  utils.safeSetText('#refreshTime', system_info.refresh_time || new Date().toLocaleTimeString());

  // Add SSH status indicator if available
  if (system_info.ssh_connected !== undefined) {
    const sshStatusElement = document.querySelector('#sshStatus');
    if (sshStatusElement) {
      const status = system_info.ssh_connected ? 'Connected' : 'Unavailable';
      const icon = system_info.ssh_connected ? '✅' : '❌';
      sshStatusElement.textContent = `${icon} SSH: ${status}`;
    }
  }
}

/**
 * Update battery information display
 */
function updateBatteryInfo(response) {
  if (!response.battery_info) return;

  const { battery_info } = response;
  utils.safeSetText('#batteryPercentage', battery_info.percentage ? `${battery_info.percentage}%` : '—%');
  utils.safeSetText('#batteryVoltage', battery_info.voltage ? `${battery_info.voltage}V` : '—V');
  utils.safeSetText('#inputVoltage', battery_info.input_voltage ? `${battery_info.input_voltage}V` : '—V');
  utils.safeSetText('#batteryStatus', battery_info.status);

  // Update battery level bar
  const levelPercent = parseInt(battery_info.percentage, 10);
  const barWidth = !isNaN(levelPercent) ? `${levelPercent}%` : '0%';
  utils.setCSS('#batteryLevelBar', 'width', barWidth);

  // Add battery level color coding
  const batteryBar = document.querySelector('#batteryLevelBar');
  if (batteryBar && !isNaN(levelPercent)) {
    batteryBar.className = batteryBar.className.replace(/bg-(red|yellow|green)-\d+/, '');

    if (levelPercent < 20) {
      batteryBar.classList.add('bg-red-500');
    } else if (levelPercent < 50) {
      batteryBar.classList.add('bg-yellow-500');
    } else {
      batteryBar.classList.add('bg-green-500');
    }
  }
}

/**
 * Update camera details display
 */
function updateCameraDetails(response, testName) {
  if (response.camera_details_html) {
    utils.safeSetHTML('#cameraDetails', response.camera_details_html);
  } else if (testName === 'check_camera' || (testName === 'full_diagnostics' && !response.camera_details_html)) {
    utils.safeSetHTML('#cameraDetails', noCameraDataPlaceholder);
  }
}

/**
 * Update issues display with enhanced management and SSH awareness
 */
function updateIssuesDisplay(response, testName) {
  const detectedIssues = processAndDetectIssues(response, testName);
  const issueLog = document.querySelector("#issueLog");
  const issueList = document.querySelector("#issueList");

  if (!issueLog || !issueList) return;

  // Clear issues if this is a full diagnostic run
  if (testName === 'full_diagnostics') {
    issueList.innerHTML = '';
    allDetectedIssues = [];
  }

  // Add new issues and avoid duplicates
  if (detectedIssues?.length > 0) {
    detectedIssues.forEach(issue => {
      if (!allDetectedIssues.includes(issue)) {
        allDetectedIssues.push(issue);
        addIssueToList(issueList, issue);
      }
    });
    issueLog.classList.remove("hidden");
  } else if (testName === 'full_diagnostics' && allDetectedIssues.length === 0) {
    issueLog.classList.add("hidden");
  }

  // Update issue count in header
  const issueCount = document.querySelector('#issueCount');
  if (issueCount) {
    issueCount.textContent = allDetectedIssues.length;
  }
}

/**
 * Add issue to the issues list with categorization
 */
function addIssueToList(issueList, issue) {
  const escapedIssue = utils.escapeHtml(issue);
  const timestamp = new Date().toLocaleTimeString();

  // Determine issue severity
  const severity = getIssueSeverity(issue);
  const severityClass = getSeverityClass(severity);

  const listItem = document.createElement('li');
  listItem.className = `bg-surface-700 border border-surface-600 rounded-lg p-3 flex justify-between items-start ${severityClass}`;
  listItem.innerHTML = `
    <div class="flex-1">
      <span class="text-gray-200">${escapedIssue}</span>
      <div class="text-xs text-gray-400 mt-1">Severity: ${severity}</div>
    </div>
    <small class="text-gray-400 ml-2">${timestamp}</small>
  `;

  issueList.appendChild(listItem);
}

/**
 * Determine issue severity based on content
 */
function getIssueSeverity(issue) {
  const lowercaseIssue = issue.toLowerCase();

  if (lowercaseIssue.includes('critical') || lowercaseIssue.includes('🔥')) {
    return 'Critical';
  } else if (lowercaseIssue.includes('error') || lowercaseIssue.includes('❌')) {
    return 'Error';
  } else if (lowercaseIssue.includes('warning') || lowercaseIssue.includes('⚠️')) {
    return 'Warning';
  } else {
    return 'Info';
  }
}

/**
 * Get CSS class for severity level
 */
function getSeverityClass(severity) {
  switch (severity) {
    case 'Critical':
      return 'border-red-500';
    case 'Error':
      return 'border-red-400';
    case 'Warning':
      return 'border-yellow-400';
    default:
      return 'border-blue-400';
  }
}

/**
 * Update execution summary with enhanced details
 */
function updateExecutionSummary(response, testName) {
  utils.safeSetText('#executionTime', response.execution_time, 'N/A');

  const testCount = response.test_count || (testName === 'full_diagnostics' ? 'Multiple' : '1');
  utils.safeSetText('#testCount', testCount);

  // Add SSH status to summary
  const sshStatus = response.ssh_connected !== undefined ?
    (response.ssh_connected ? 'Available' : 'Unavailable') : 'Unknown';
  utils.safeSetText('#sshConnectionStatus', sshStatus);

  utils.removeClass('#testCountCard', 'hidden');
  utils.removeClass('#executionTimeCard', 'hidden');
}

// Enhanced report saving functionality with SSH status
function saveFullDiagnosticReport() {
  try {
    const reportData = gatherReportData();
    const reportText = generateReportText(reportData);
    const filename = `V3-Diagnostic-Report-${utils.createTimestamp()}.txt`;

    downloadTextFile(reportText, filename);
    showToast('Report saved successfully!', 'success');

  } catch (error) {
    console.error('Error saving report:', error);
    showToast('Failed to save diagnostic report.', 'error');
  }
}

/**
 * Gather all report data including SSH status
 */
function gatherReportData() {
  return {
    timestamp: new Date().toISOString(),
    connectionInfo: {
      deviceConnected: isDeviceConnected,
      sshAvailable: utils.isSSHAvailable(sshConnectionDetails),
      connectionDetails: sshConnectionDetails
    },
    systemInfo: {
      hwid: utils.safeGetText('#hwid'),
      ip: utils.safeGetText('#ip'),
      uptime: utils.safeGetText('#uptime'),
      macAddress: utils.safeGetText('#macAddress')
    },
    batteryInfo: {
      percentage: utils.safeGetText('#batteryPercentage'),
      voltage: utils.safeGetText('#batteryVoltage'),
      inputVoltage: utils.safeGetText('#inputVoltage'),
      status: utils.safeGetText('#batteryStatus')
    },
    diagnosticOutput: document.getElementById("output")?.innerText || '',
    detectedIssues: [...allDetectedIssues],
    cameraDetails: utils.safeGetHTML('#cameraDetails'),
    executionTime: utils.safeGetText('#executionTime'),
    testCount: utils.safeGetText('#testCount'),
    testResults: { ...testResults }
  };
}

/**
 * Generate formatted report text with SSH details
 */
function generateReportText(reportData) {
  let reportText = `V3 DIAGNOSTICS REPORT\n`;
  reportText += `Generated: ${new Date().toLocaleString()}\n`;
  reportText += `=`.repeat(50) + `\n\n`;

  // Connection Status
  reportText += `CONNECTION STATUS:\n`;
  reportText += `Device Connected: ${reportData.connectionInfo.deviceConnected ? 'Yes' : 'No'}\n`;
  reportText += `SSH Available: ${reportData.connectionInfo.sshAvailable ? 'Yes' : 'No'}\n`;

  if (reportData.connectionInfo.connectionDetails) {
    const details = reportData.connectionInfo.connectionDetails;
    if (details.connection_count) {
      reportText += `SSH Connections: ${details.connection_count}\n`;
    }
    if (details.cache_age !== null) {
      reportText += `Last Check: ${Math.round(details.cache_age)}s ago\n`;
    }
    if (details.error) {
      reportText += `Connection Error: ${details.error}\n`;
    }
  }
  reportText += `\n`;

  // System Information
  reportText += `SYSTEM INFORMATION:\n`;
  reportText += `Hardware ID: ${reportData.systemInfo.hwid}\n`;
  reportText += `IP Address: ${reportData.systemInfo.ip}\n`;
  reportText += `Uptime: ${reportData.systemInfo.uptime}\n`;
  reportText += `MAC Address: ${reportData.systemInfo.macAddress}\n\n`;

  // Battery Information
  reportText += `BATTERY INFORMATION:\n`;
  reportText += `Percentage: ${reportData.batteryInfo.percentage}\n`;
  reportText += `Voltage: ${reportData.batteryInfo.voltage}\n`;
  reportText += `Input Voltage: ${reportData.batteryInfo.inputVoltage}\n`;
  reportText += `Status: ${reportData.batteryInfo.status}\n\n`;

  // Issues
  if (reportData.detectedIssues.length > 0) {
    reportText += `DETECTED ISSUES (${reportData.detectedIssues.length}):\n`;
    reportData.detectedIssues.forEach((issue, index) => {
      reportText += `${index + 1}. ${issue}\n`;
    });
    reportText += `\n`;
  }

  // Execution Summary
  reportText += `EXECUTION SUMMARY:\n`;
  reportText += `Test Count: ${reportData.testCount}\n`;
  reportText += `Execution Time: ${reportData.executionTime}\n\n`;

  // Full Diagnostic Output
  reportText += `FULL DIAGNOSTIC OUTPUT:\n`;
  reportText += `=`.repeat(50) + `\n`;
  reportText += reportData.diagnosticOutput;

  return reportText;
}

// Enhanced data persistence functions
function persistDiagnosticsOutput() {
  try {
    const outputElement = document.getElementById('output');
    if (outputElement) {
      const data = {
        output: outputElement.innerText,
        testResults: testResults,
        allDetectedIssues: allDetectedIssues,
        timestamp: Date.now(),
        connectionStatus: {
          isConnected: isDeviceConnected,
          sshAvailable: utils.isSSHAvailable(sshConnectionDetails),
          details: sshConnectionDetails
        }
      };

      sessionStorage.setItem('diagnosticsData', JSON.stringify(data));
    }
  } catch (error) {
    console.error('Error persisting diagnostics data:', error);
  }
}

function restoreDiagnosticsOutput() {
  try {
    const saved = sessionStorage.getItem('diagnosticsData');
    if (saved) {
      const data = JSON.parse(saved);

      // Check if data is recent (within 1 hour)
      const dataAge = Date.now() - (data.timestamp || 0);
      const oneHour = 60 * 60 * 1000;

      if (dataAge < oneHour) {
        const outputElement = document.getElementById('output');
        if (outputElement && data.output) {
          outputElement.innerText = data.output;
        }

        if (data.testResults) {
          testResults = data.testResults;
        }

        if (data.allDetectedIssues) {
          allDetectedIssues = data.allDetectedIssues;

          // Restore issues display
          const issueList = document.querySelector("#issueList");
          const issueLog = document.querySelector("#issueLog");

          if (issueList && allDetectedIssues.length > 0) {
            issueList.innerHTML = '';
            allDetectedIssues.forEach(issue => addIssueToList(issueList, issue));

            if (issueLog) {
              issueLog.classList.remove("hidden");
            }
          }
        }

        console.log('Restored diagnostics data from session storage');
      } else {
        // Clear old data
        sessionStorage.removeItem('diagnosticsData');
        console.log('Cleared old diagnostics data');
      }
    }
  } catch (error) {
    console.error('Error restoring diagnostics data:', error);
    sessionStorage.removeItem('diagnosticsData');
  }
}

/**
 * Clear diagnostic output and reset the dashboard
 */
function clearOutput() {
  try {
    // Clear the main output area
    const outputElement = document.getElementById('output');
    if (outputElement) {
      outputElement.innerText = 'Ready to Run Diagnostics\n\nClick "Run Full Diagnostics" or any individual test to see output here';
    }

    // Clear all detected issues
    allDetectedIssues = [];
    const issueList = document.querySelector("#issueList");
    const issueLog = document.querySelector("#issueLog");
    
    if (issueList) {
      issueList.innerHTML = '';
    }
    
    if (issueLog) {
      issueLog.classList.add("hidden");
    }

    // Reset issue count
    const issueCount = document.querySelector('#issueCount');
    if (issueCount) {
      issueCount.textContent = '0';
    }

    // Clear test results
    testResults = {};

    // Hide execution summary cards
    utils.addClass('#executionTimeCard', 'hidden');
    utils.addClass('#testCountCard', 'hidden');

    // Reset camera details to default placeholder
    const cameraDetails = document.querySelector('#cameraDetails');
    if (cameraDetails) {
      cameraDetails.innerHTML = defaultCameraPlaceholder;
    }

    // Reset status banner to ready state
    updateStatusBanner("ready");

    // Clear session storage
    sessionStorage.removeItem('diagnosticsData');

    // Show success notification
    showToast('Output cleared successfully', 'success');

    console.log('Dashboard output cleared and reset');

  } catch (error) {
    console.error('Error clearing output:', error);
    showToast('Error clearing output', 'error');
  }
}