// Terminal configuration and setup
let term, fitAddon, webLinksAddon, searchAddon, socket;
let commandHistory = [];
let historyIndex = -1;
let currentCommand = '';
let terminalLog = '';
let connected = false;
let customCommands = [];
let isFullscreen = false;
let reconnecting = false;
let lastOutput = '';
let confirmModal;

console.log("Terminal.js loaded, initializing...");

// Check if we have socket.io loaded
if (typeof io === 'undefined') {
  console.error("Socket.io not available at initialization time");
} else {
  console.log("Socket.io detected, will initialize connection");
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM loaded, setting up terminal");

  // Initialize Terminal
  try {
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"Fira Code", Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.5,
      theme: {
        background: 'var(--terminal-bg)',
        foreground: 'var(--terminal-text)',
        cursor: '#ffffff',
        selection: 'var(--terminal-selection)',
        black: '#000000',
        red: '#cc0000',
        green: '#4cd964',
        yellow: '#ffcc00',
        blue: '#0095ff',
        magenta: '#9a5cb4',
        cyan: '#00bcd4',
        white: '#f2f2f2',
        brightBlack: '#666666',
        brightRed: '#ff6b6b',
        brightGreen: '#5af78e',
        brightYellow: '#f4f99d',
        brightBlue: '#69c9ff',
        brightMagenta: '#cb79e6',
        brightCyan: '#5dfdff',
        brightWhite: '#ffffff'
      },
      allowTransparency: true,
      scrollback: 10000,
      tabStopWidth: 4,
      windowsMode: false,
      convertEol: true
    });
    console.log("Terminal initialized");
  } catch (e) {
    console.error("Error initializing terminal:", e);
    return;
  }

  // Initialize addons if they exist
  try {
    if (window.FitAddon) {
      fitAddon = new FitAddon.FitAddon();
      term.loadAddon(fitAddon);
      console.log("FitAddon loaded");
    } else {
      console.error("FitAddon not available");
    }

    if (window.WebLinksAddon) {
      webLinksAddon = new WebLinksAddon.WebLinksAddon();
      term.loadAddon(webLinksAddon);
      console.log("WebLinksAddon loaded");
    } else {
      console.error("WebLinksAddon not available");
    }

    if (window.SearchAddon) {
      searchAddon = new SearchAddon.SearchAddon();
      term.loadAddon(searchAddon);
      console.log("SearchAddon loaded");
    } else {
      console.error("SearchAddon not available");
    }
  } catch (e) {
    console.error("Error loading terminal addons:", e);
  }

  // Initialize socket.io with retry mechanism
  initializeSocketIO();

  // Initialize Bootstrap modal
  const modalElement = document.getElementById('confirmModal');
  if (modalElement && typeof bootstrap !== 'undefined') {
    confirmModal = new bootstrap.Modal(modalElement);
  }

  // Page transition effect
  const pageTransition = document.querySelector('.page-transition');
  if (pageTransition) {
    setTimeout(() => {
      pageTransition.classList.add('loaded');
    }, 100);
  }

  // Initialize the terminal container
  const terminalContainer = document.getElementById('terminal-container');
  if (terminalContainer) {
    term.open(terminalContainer);
    setTimeout(() => {
      if (fitAddon) fitAddon.fit();
      term.focus();
    }, 100);
  }

  // Set up UI components
  setupUIComponents();

  // Load data from storage
  loadCommandHistory();
  loadCustomCommands();

  // Set up terminal key handlers
  setupTerminalKeyHandlers();

  // Set up event listeners
  setupEventListeners();

  // Restore terminal log
  restoreTerminalLog();

  // Welcome message
  term.write('\r\n\x1b[2m--- V3 Diagnostic Terminal ---\x1b[0m\r\n');
  term.write('\x1b[2mInitializing terminal...\x1b[0m\r\n\r\n');
});

// Initialize Socket.io with retry
function initializeSocketIO(retryCount = 0) {
  const maxRetries = 5;

  console.log(`Attempting to initialize Socket.io (attempt ${retryCount + 1}/${maxRetries + 1})`);

  // Check if socket.io is loaded
  if (typeof io === 'undefined') {
    if (retryCount < maxRetries) {
      console.warn(`Socket.io not available, retrying in ${(retryCount + 1) * 500}ms...`);
      setTimeout(() => initializeSocketIO(retryCount + 1), (retryCount + 1) * 500);
    } else {
      console.error("Socket.io library not loaded after multiple attempts. Terminal functionality will be limited.");
      showToast('Error', 'Failed to initialize terminal connection. Socket.io not available.', 'danger');

      // Update UI to show disconnected state
      updateTerminalStatus('disconnected');

      if (term) {
        term.write('\r\n\x1b[31mError: Could not connect to server. Socket.io not available.\x1b[0m\r\n');
        term.write('\x1b[33mYou can still view the terminal interface, but commands will not be sent to the server.\x1b[0m\r\n');
      }
    }
    return;
  }

  try {
    // Create socket connection
    console.log("Socket.io available, creating connection");
    socket = io();

    // Set up event listeners
    setupSocketListeners();

    // Start terminal session
    startTerminal();

    console.log("Socket.io connection initialized");
  } catch (e) {
    console.error("Error initializing socket.io:", e);
    if (retryCount < maxRetries) {
      setTimeout(() => initializeSocketIO(retryCount + 1), (retryCount + 1) * 500);
    } else {
      showToast('Error', 'Failed to initialize terminal connection. Please reload the page.', 'danger');
    }
  }
}

// Setup UI components
function setupUIComponents() {
  // Collapse the Helpful Tips section by default
  const helpfulTipsCardBody = document.getElementById('helpfulTipsCardBody');
  if (helpfulTipsCardBody && typeof bootstrap !== 'undefined') {
    const collapse = bootstrap.Collapse.getOrCreateInstance(helpfulTipsCardBody);
    if (collapse) collapse.hide();

    // Update the icon to match the collapsed state
    const tipsButton = document.querySelector('[data-bs-target="#helpfulTipsCardBody"]');
    if (tipsButton) {
      const tipsIcon = tipsButton.querySelector('i');
      if (tipsIcon) {
        tipsIcon.classList.replace('bi-chevron-down', 'bi-chevron-up');
      }
    }
  }
}

// Setup socket event listeners
function setupSocketListeners() {
  if (!socket) {
    console.error("Cannot setup socket listeners - socket not initialized");
    return;
  }

  socket.on('connect', () => {
    console.log("Socket connected");
    term.write('\r\n\x1b[32mConnection established\x1b[0m\r\n');
    reconnecting = false;
  });

  socket.on('disconnect', () => {
    console.log("Socket disconnected");
    term.write('\r\n\x1b[31mConnection lost\x1b[0m\r\n');
    updateTerminalStatus('disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error("Socket connection error:", error);
    term.write('\r\n\x1b[31mConnection error: ' + error.message + '\x1b[0m\r\n');
    updateTerminalStatus('disconnected');
  });

  socket.on('terminal_output', data => {
    term.write(data);
    terminalLog += data;
    // Append to session storage
    appendTerminalLog(data);
    // Check for connection status in terminal output
    if (data.includes('Welcome') || data.includes('Last login')) {
      updateTerminalStatus('connected');
    }
    if (data.includes('Connection closed') || data.includes('could not resolve hostname')) {
      updateTerminalStatus('disconnected');
    }
    // Analyze output for common errors
    analyzeTerminalOutput(data);
  });
}

// Setup terminal key handlers
function setupTerminalKeyHandlers() {
  if (!term) return;

  term.onKey((ev) => {
    const key = ev.key;
    const domEvent = ev.domEvent;

    // Detect Ctrl+C and handle specially
    if (domEvent.ctrlKey && domEvent.key === 'c') {
      term.write('^C\r\n');
      if (socket) socket.emit('terminal_input', '\x03'); // Send SIGINT character
      return;
    }

    // Handle enter key
    if (domEvent.key === 'Enter') {
      // Send the command to the server
      if (currentCommand) {
        // Add to command history
        if (commandHistory.length === 0 || commandHistory[0] !== currentCommand) {
          commandHistory.unshift(currentCommand);
          // Keep history limited to 50 items
          if (commandHistory.length > 50) {
            commandHistory.pop();
          }
          // Update history UI
          updateCommandHistoryUI();
          // Save to local storage
          saveCommandHistory();
        }
      }
      // Send the input to server
      if (socket) socket.emit('terminal_input', '\r');
      // Reset command tracking
      currentCommand = '';
      historyIndex = -1;
      return;
    }

    // Handle backspace/delete
    if (domEvent.key === 'Backspace') {
      // Don't allow deleting past the start of current line
      if (socket) socket.emit('terminal_input', '\b');
      // Update current command
      if (currentCommand.length > 0) {
        currentCommand = currentCommand.slice(0, -1);
      }
      return;
    }

    // Handle arrow keys for history navigation
    if (domEvent.key === 'ArrowUp') {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        replaceCurrentCommandWithHistory();
      }
      return;
    }

    if (domEvent.key === 'ArrowDown') {
      if (historyIndex >= 0) {
        historyIndex--;
        replaceCurrentCommandWithHistory();
      }
      return;
    }

    // For regular keypresses, update currentCommand and send to terminal
    if (key.length === 1) {
      currentCommand += key;
      if (socket) socket.emit('terminal_input', key);
    }
  });
}

// Setup window event listeners
function setupEventListeners() {
  // Window resize handling
  window.addEventListener('resize', () => {
    if (fitAddon) fitAddon.fit();
  });

  // User activity tracking to keep session active
  let idleTimer;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (connected && socket) {
        // Send a harmless command to keep connection alive
        socket.emit('terminal_input', '\b');
      }
    }, 300000); // 5 minutes
  }

  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keypress', resetIdleTimer);
  resetIdleTimer();

  // Keyboard shortcuts for terminal
  document.addEventListener('keydown', function(e) {
    // Global shortcuts
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveHistoryToFile();
    }

    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      toggleFullscreen();
    }

    // Focus command input when typing starts
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const activeElement = document.activeElement;
      const commandInput = document.getElementById('commandInput');
      if (!commandInput) return;

      // If not already focused on an input and not in fullscreen terminal
      if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && !isFullscreen) {
        commandInput.focus();
        // If it's a printable character, add it to the input
        if (e.key.match(/^[a-zA-Z0-9!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]$/)) {
          commandInput.value += e.key;
        }
      }
    }
  });
}

// Helper for command history navigation
function replaceCurrentCommandWithHistory() {
  let command = '';
  if (historyIndex >= 0 && historyIndex < commandHistory.length) {
    command = commandHistory[historyIndex];
  }

  // This is a simplified approach - in reality you may need to
  // determine prompt length and cursor position
  // For now, just emit backspaces to clear current line
  for (let i = 0; i < currentCommand.length; i++) {
    if (socket) socket.emit('terminal_input', '\b');
  }

  // Send the history command
  if (command) {
    if (socket) socket.emit('terminal_input', command);
    currentCommand = command;
  } else {
    currentCommand = '';
  }
}

// Update UI to show command history
function updateCommandHistoryUI() {
  const historyList = document.getElementById('commandHistory');
  const emptyMessage = document.getElementById('commandHistoryEmpty');
  if (!historyList || !emptyMessage) return;

  if (commandHistory && commandHistory.length > 0) {
    // Hide the empty message
    emptyMessage.style.display = 'none';
    // Clear and populate the history list
    historyList.innerHTML = '';
    commandHistory.forEach((cmd, index) => {
      const li = document.createElement('li');
      li.className = 'list-group-item command-history-item d-flex justify-content-between align-items-center';
      const cmdText = document.createElement('span');
      cmdText.textContent = cmd;
      cmdText.className = 'command-text';
      const actions = document.createElement('div');
      actions.className = 'command-actions';
      const runBtn = document.createElement('button');
      runBtn.className = 'btn btn-sm btn-link p-0 ms-2';
      runBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
      runBtn.title = 'Run command';
      runBtn.onclick = function() { injectCommand(cmd); };
      actions.appendChild(runBtn);
      li.appendChild(cmdText);
      li.appendChild(actions);
      historyList.appendChild(li);
    });
  } else {
    // Show the empty message
    emptyMessage.style.display = 'block';
    historyList.innerHTML = '';
  }
}

// Save and load command history
function saveCommandHistory() {
  if (commandHistory && commandHistory.length > 0) {
    try {
      localStorage.setItem('terminalCommandHistory', JSON.stringify(commandHistory));
    } catch (e) {
      console.error("Error saving command history:", e);
    }
  }
}

function loadCommandHistory() {
  try {
    const saved = localStorage.getItem('terminalCommandHistory');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        commandHistory = parsed;
        updateCommandHistoryUI();
      }
    }
  } catch (e) {
    console.error('Failed to load command history:', e);
    commandHistory = [];
  }
}

// Clear command history
function clearHistory() {
  confirmAction('Are you sure you want to clear command history?', () => {
    commandHistory = [];
    localStorage.removeItem('terminalCommandHistory');
    updateCommandHistoryUI();
    showToast('History', 'Command history cleared', 'info');
  });
}

// Save history to file
function saveHistoryToFile() {
  if (!commandHistory || commandHistory.length === 0) {
    showToast('History', 'No commands to save', 'warning');
    return;
  }

  // Create text content for file export
  let content = "# V3 Terminal Command History\n";
  content += `# Generated: ${new Date().toLocaleString()}\n\n`;
  commandHistory.forEach((cmd, index) => {
    content += `${index + 1}. ${cmd}\n`;
  });

  // Create download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'terminal_history.txt';
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);

  showToast('Success', 'History saved to file', 'success');
}

// Terminal Functions
function startTerminal() {
  console.log("Starting terminal session");

  // Show connecting status
  updateTerminalStatus('connecting');

  // Request terminal session from server
  if (socket) {
    socket.emit('start_terminal');
    console.log("Sent start_terminal event to server");
  } else {
    console.error("Cannot start terminal - socket not initialized");
  }

  // Show welcome message if first connection
  if (!reconnecting) {
    term.write('\r\n\x1b[2m--- V3 Diagnostic Terminal ---\x1b[0m\r\n');
    term.write('\x1b[2mConnecting to device...\x1b[0m\r\n\r\n');
  }
}

function resetTerminal() {
  confirmAction('Are you sure you want to reset the terminal session? All history will be cleared.', () => {
    clearTerminal();
    clearTerminalLog();
    reconnectTerminal(true);
    showToast('Terminal', 'Terminal session has been reset', 'info');
  });
}

function reconnectTerminal(force = false) {
  if (connected && !force) {
    confirmAction('Disconnect the current session and reconnect?', () => {
      performReconnect();
    });
  } else {
    performReconnect();
  }
}

function performReconnect() {
  if (!socket) {
    showToast('Error', 'Socket connection not available', 'danger');
    return;
  }

  reconnecting = true;
  updateTerminalStatus('connecting');
  term.write('\r\n\x1b[33mReconnecting to device...\x1b[0m\r\n');
  socket.emit('reset_terminal');
  setTimeout(() => {
    socket.emit('start_terminal');
  }, 500);
}

function clearTerminal() {
  if (term) term.clear();
}

function clearTerminalLog() {
  sessionStorage.removeItem("terminal_log");
  terminalLog = '';
}

function copyTerminalContent() {
  if (!term) return;

  // Get visible terminal content
  const selection = term.getSelection();

  // If there's a selection, copy that, otherwise copy all visible content
  let textToCopy = selection;
  if (!textToCopy && term.buffer && term.buffer.active) {
    try {
      textToCopy = term.buffer.active.getLine(0).translateToString();
    } catch (e) {
      console.error("Error getting terminal content:", e);
      textToCopy = "Error copying terminal content";
    }
  }

  // Copy to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy || '')
      .then(() => {
        showToast('Success', 'Terminal content copied to clipboard', 'success');
      })
      .catch(err => {
        showToast('Error', `Failed to copy: ${err}`, 'danger');
      });
  } else {
    showToast('Error', 'Clipboard API not available in this browser', 'danger');
  }
}

function toggleFullscreen() {
  const terminalContainer = document.getElementById('terminal-container');
  if (!terminalContainer) return;

  const container = terminalContainer.parentElement.parentElement;
  if (!isFullscreen) {
    // Save current position/size
    container._originalStyles = {
      position: container.style.position,
      top: container.style.top,
      left: container.style.left,
      width: container.style.width,
      height: container.style.height,
      zIndex: container.style.zIndex
    };

    // Make fullscreen
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.zIndex = '9999';
    document.body.style.overflow = 'hidden';

    // Update button icon
    const fullscreenBtn = document.querySelector('.btn-terminal-action[title="Toggle Full Screen"] i');
    if (fullscreenBtn) {
      fullscreenBtn.classList.replace('bi-fullscreen', 'bi-fullscreen-exit');
    }

    isFullscreen = true;
  } else {
    // Restore original position/size
    Object.assign(container.style, container._originalStyles);
    document.body.style.overflow = '';

    // Update button icon
    const fullscreenBtn = document.querySelector('.btn-terminal-action[title="Toggle Full Screen"] i');
    if (fullscreenBtn) {
      fullscreenBtn.classList.replace('bi-fullscreen-exit', 'bi-fullscreen');
    }

    isFullscreen = false;
  }

  // Resize the terminal to fit the new container size
  setTimeout(() => {
    if (fitAddon) fitAddon.fit();
  }, 100);
}

// Custom Commands Management
function loadCustomCommands() {
  try {
    const saved = localStorage.getItem('customCommands');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        customCommands = parsed;
      } else {
        customCommands = [];
      }
    } else {
      customCommands = [];
    }
    updateCustomCommandsDisplay();
  } catch (e) {
    console.error("Error loading custom commands:", e);
    customCommands = [];
  }
}

function updateCustomCommandsDisplay() {
  const container = document.getElementById('customCommandsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (!customCommands || customCommands.length === 0) return;

  customCommands.forEach((cmd, index) => {
    const buttonWrapper = document.createElement('div');
    buttonWrapper.className = 'd-flex align-items-center gap-1 mb-1';

    const button = document.createElement('button');
    button.className = 'btn btn-sm text-start command-btn flex-grow-1';
    button.onclick = () => injectCommand(cmd);
    button.textContent = cmd;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-outline-danger';
    deleteBtn.innerHTML = '<i class="bi bi-x"></i>';
    deleteBtn.onclick = () => removeCustomCommand(index);
    deleteBtn.title = 'Remove command';

    buttonWrapper.appendChild(button);
    buttonWrapper.appendChild(deleteBtn);
    container.appendChild(buttonWrapper);
  });
}

function addCustomCommand() {
  const input = document.getElementById('customCommand');
  if (!input) return;

  const command = input.value.trim();
  if (!command) return;

  if (!customCommands) {
    customCommands = [];
  }

  if (!customCommands.includes(command)) {
    customCommands.push(command);
    localStorage.setItem('customCommands', JSON.stringify(customCommands));
    updateCustomCommandsDisplay();
    showToast('Command', 'Custom command added', 'success');
  }

  input.value = '';
}

function removeCustomCommand(index) {
  if (!customCommands || index < 0 || index >= customCommands.length) return;

  customCommands.splice(index, 1);
  localStorage.setItem('customCommands', JSON.stringify(customCommands));
  updateCustomCommandsDisplay();
}

// Terminal Input Management
function handleCommandInput(event) {
  // Handle Enter key
  if (event.key === 'Enter') {
    const input = document.getElementById('commandInput');
    if (!input) return;

    const command = input.value.trim();
    if (command) {
      injectCommand(command);
      input.value = '';
    }
    return;
  }

  // Tab completion
  if (event.key === 'Tab') {
    event.preventDefault();
    // For simplicity, we're not implementing actual tab completion here
  }

  // Clear terminal with Ctrl+L (same as in bash)
  if (event.ctrlKey && event.key === 'l') {
    clearTerminal();
    event.preventDefault();
    return;
  }

  // Search history with Ctrl+R
  if (event.ctrlKey && event.key === 'r') {
    // Not fully implemented, but we could show a modal with searchable history
    event.preventDefault();
  }
}

function injectCommand(cmd) {
  if (!socket) {
    showToast('Error', 'Socket connection not available', 'danger');
    console.error("Cannot inject command - socket not initialized");
    return;
  }

  if (!connected) {
    showToast('Error', 'Not connected. Please reconnect first.', 'danger');
    return;
  }

  if (!cmd) return;

  // Add to history
  if (cmd && (!commandHistory || commandHistory.length === 0 || commandHistory[0] !== cmd)) {
    if (!commandHistory) {
      commandHistory = [];
    }

    commandHistory.unshift(cmd);

    // Keep history limited to 50 items
    if (commandHistory.length > 5) {
      commandHistory.pop();
    }

    // Update history UI and save
    updateCommandHistoryUI();
    saveCommandHistory();
  }

  // Send the command to the terminal
  console.log("Sending command:", cmd);
  for (let i = 0; i < cmd.length; i++) {
    socket.emit('terminal_input', cmd[i]);
  }

  // Send Enter
  socket.emit('terminal_input', '\r');

  // Focus back on terminal
  if (term) term.focus();
}

// Status Management
function updateTerminalStatus(state) {
  const statusElement = document.getElementById('terminalStatus');
  const badgeElement = document.getElementById('connectionStatusBadge');
  if (!statusElement || !badgeElement) return;

  console.log("Updating terminal status:", state);

  switch(state) {
    case 'connected':
      statusElement.className = 'connection-status connected';
      statusElement.innerHTML = '<i class="bi bi-dot me-1"></i>Connected';
      badgeElement.style.backgroundColor = 'var(--accent-green-light)';
      badgeElement.style.color = 'var(--accent-green)';
      badgeElement.innerHTML = '<i class="bi bi-ethernet me-1"></i><span>Connected</span>';
      connected = true;
      break;
    case 'disconnected':
      statusElement.className = 'connection-status disconnected';
      statusElement.innerHTML = '<i class="bi bi-dot me-1"></i>Disconnected';
      badgeElement.style.backgroundColor = 'var(--accent-red-light)';
      badgeElement.style.color = 'var(--accent-red)';
      badgeElement.innerHTML = '<i class="bi bi-ethernet-disconnect me-1"></i><span>Disconnected</span>';
      connected = false;
      break;
    case 'connecting':
      statusElement.className = 'connection-status disconnected';
      statusElement.innerHTML = '<i class="bi bi-dot me-1 pulse"></i>Connecting...';
      badgeElement.style.backgroundColor = 'var(--accent-yellow-light)';
      badgeElement.style.color = 'var(--accent-yellow)';
      badgeElement.innerHTML = '<i class="bi bi-hourglass-split me-1 pulse"></i><span>Connecting</span>';
      connected = false;
      break;
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(title, message, type = 'success') {
  const toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    console.error("Toast container not found");
    console.log(`${title}: ${message}`);
    return;
  }

  const toastId = 'toast-' + Date.now();
  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
  toastEl.id = toastId;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <strong>${title}:</strong> ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  toastContainer.appendChild(toastEl);

  if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
    const toast = new bootstrap.Toast(toastEl, {
      animation: true,
      autohide: true,
      delay: 3000
    });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  } else {
    // Fallback if Bootstrap is not available
    console.log(`${title}: ${message}`);
    setTimeout(() => {
      toastEl.remove();
    }, 3000);
  }
}

function confirmAction(message, callback) {
  if (!confirmModal) {
    // Fallback to native confirm if Bootstrap modal is not available
    if (confirm(message)) {
      callback();
    }
    return;
  }

  if (typeof callback === 'string') {
    const command = callback;
    callback = () => injectCommand(command);
  }

  const confirmModalBody = document.getElementById('confirmModalBody');
  if (confirmModalBody) {
    confirmModalBody.textContent = message;
  }

  const yesButton = document.getElementById('confirmModalYes');
  if (yesButton) {
    // Remove previous event listeners
    const newYesButton = yesButton.cloneNode(true);
    yesButton.parentNode.replaceChild(newYesButton, yesButton);
    // Add new event listener
    newYesButton.addEventListener('click', () => {
      confirmModal.hide();
      callback();
    });
  }

  confirmModal.show();
}

// Detect common error patterns in terminal output
function analyzeTerminalOutput(output) {
  if (!output || lastOutput === output) return;
  lastOutput = output;

  // Check for specific error patterns
  if (/command not found/i.test(output)) {
    showToast('Error', 'Command not found. Check spelling or install required package.', 'warning');
  }
  else if (/permission denied/i.test(output)) {
    showToast('Access Error', 'Permission denied. Try using sudo.', 'warning');
  }
  else if (/No such file or directory/i.test(output)) {
    showToast('File Error', 'File or directory not found', 'warning');
  }
}

// Terminal session storage
function appendTerminalLog(data) {
  if (!data) return;

  try {
    const current = sessionStorage.getItem("terminal_log") || "";
    // Limit storage size to prevent overflow
    const maxSize = 50000;
    let newLog = current + data;
    if (newLog.length > maxSize) {
      newLog = newLog.substring(newLog.length - maxSize);
    }
    sessionStorage.setItem("terminal_log", newLog);
  } catch (e) {
    console.error("Error storing terminal log:", e);
  }
}

function restoreTerminalLog() {
  try {
    const saved = sessionStorage.getItem("terminal_log");
    if (saved && term) term.write(saved);
  } catch (e) {
    console.error("Error restoring terminal log:", e);
  }
}

function toggleTipsIcon(button) {
  if (!button) return;

  const icon = button.querySelector('i');
  if (!icon) return;

  if (icon.classList.contains('bi-chevron-down')) {
    icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
  } else {
    icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
  }
}

function toggleCategoriesIcon(button) {
  if (!button) return;

  const icon = button.querySelector('i');
  if (!icon) return;

  if (icon.classList.contains('bi-chevron-down')) {
    icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
  } else {
    icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
  }
}

// Keyboard shortcuts for terminal
document.addEventListener('keydown', function(e) {
  // Global shortcuts
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveHistoryToFile();
  }
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    toggleFullscreen();
  }
  // Focus command input when typing starts
  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
    const activeElement = document.activeElement;
    const commandInput = document.getElementById('commandInput');
    if (!commandInput) return;

    // If not already focused on an input and not in fullscreen terminal
    if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA' && !isFullscreen) {
      commandInput.focus();
      // If it's a printable character, add it to the input
      if (e.key.match(/^[a-zA-Z0-9!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]$/)) {
        commandInput.value += e.key;
      }
    }
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  restoreTerminalLog();
});