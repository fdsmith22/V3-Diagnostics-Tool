// Terminal configuration and setup
 let term, fitAddon, webLinksAddon, searchAddon, socket;
 let commandHistory = [];
 let historyIndex = -1;
 let currentCommand = '';
 let terminalLog = '';
 let connected = false;
 let sshConnected = false;
 let connectionDetails = null;
 let customCommands = [];
 let isFullscreen = false;
 let reconnecting = false;
 let lastOutput = '';
 let confirmModal;
 let connectionCheckInterval = null;
 let keepAliveInterval = null;
 let sessionStartTime = null;
 let commandCount = 0;
 let lastActivityTime = null;
 let fallbackMode = false;
 let httpFallbackInterval = null;
 let persistentSessionId = null;
 let isReconnection = false;
 let terminalInitialized = false;

 // Track all timeouts for cleanup
 window._terminalTimeouts = [];

 console.log("Terminal.js loaded, initializing...");

 // Enhanced configuration for improved connection stability
 const TERMINAL_CONFIG = {
   SOCKET_RETRY_ATTEMPTS: 1,  // Minimal retry attempts
   SOCKET_RETRY_DELAY: 10000,  // Long delay between retries
   CONNECTION_CHECK_INTERVAL: 900000, // Increased to 15 minutes
   KEEP_ALIVE_INTERVAL: 1800000, // Increased to 30 minutes
   IDLE_TIMEOUT: 3600000, // Increased to 60 minutes
   MAX_COMMAND_HISTORY: 100,
   MAX_TERMINAL_LOG_SIZE: 1000000, // 1MB
   AUTOSCROLL_THRESHOLD: 1000,
   CONNECTION_STABILITY_THRESHOLD: 30000, // 30 seconds minimum stable connection
   FALLBACK_ENABLED: false  // Disable aggressive fallback
 };

 // Connection status tracking
 const CONNECTION_STATES = {
   DISCONNECTED: 'disconnected',
   CONNECTING: 'connecting',
   CONNECTED: 'connected',
   SSH_CONNECTED: 'ssh_connected',
   ERROR: 'error',
   TIMEOUT: 'timeout'
 };

 // Check if we have socket.io loaded
 if (typeof io === 'undefined') {
   console.error("Socket.io not available at initialization time");
 } else {
   console.log("Socket.io detected, will initialize connection");
 }

 // Initialize the application when the DOM is fully loaded
 document.addEventListener('DOMContentLoaded', function() {
   console.log("DOM loaded, setting up enhanced terminal with SSH support");

   // Initialize Terminal with enhanced Tailwind-compatible theme
   try {
     term = new Terminal({
       cursorBlink: true,
       cursorStyle: 'bar',
       fontFamily: '"Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
       fontSize: 14,
       lineHeight: 1.5,
       theme: {
         background: '#0d0d0d',        // dashboard-bg
         foreground: '#f5f5f5',       // surface-50
         cursor: '#ffffff',
         selection: '#2d4a72',        // primary-600 with opacity
         black: '#060606',            // surface-900
         red: '#ef4444',              // red-500
         green: '#22c55e',            // green-500
         yellow: '#eab308',           // yellow-500
         blue: '#3b82f6',             // blue-500
         magenta: '#a855f7',          // purple-500
         cyan: '#06b6d4',             // cyan-500
         white: '#f5f5f5',            // surface-50
         brightBlack: '#636363',      // surface-200
         brightRed: '#f87171',        // red-400
         brightGreen: '#4ade80',      // green-400
         brightYellow: '#facc15',     // yellow-400
         brightBlue: '#60a5fa',       // blue-400
         brightMagenta: '#c084fc',    // purple-400
         brightCyan: '#22d3ee',       // cyan-400
         brightWhite: '#ffffff'
       },
       allowTransparency: true,
       scrollback: 10000,
       tabStopWidth: 4,
       windowsMode: false,
       convertEol: true,
       bellStyle: 'sound'
     });
     console.log("Terminal initialized with enhanced Tailwind theme and SSH support");
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

   // Initialize socket.io with enhanced retry mechanism
   initializeSocketIO();

   // Check for native confirm modal instead of Bootstrap
   const modalElement = document.getElementById('confirmModal');
   if (modalElement) {
     // We'll use a simple custom modal system instead of Bootstrap
     confirmModal = {
       show: () => {
         modalElement.classList.remove('hidden');
         modalElement.classList.add('flex');
       },
       hide: () => {
         modalElement.classList.add('hidden');
         modalElement.classList.remove('flex');
       }
     };
   }

   // Page transition effect
   const pageTransition = document.querySelector('.page-transition');
   if (pageTransition) {
     setTimeout(() => {
       pageTransition.classList.add('loaded');
     }, 100);
   }

   // Initialize the terminal container
   const terminalContainer = document.getElementById('terminal');
   if (terminalContainer) {
     term.open(terminalContainer);
     
     // Ensure proper initial sizing
     setTimeout(() => {
       if (fitAddon) {
         try {
           fitAddon.fit();
           console.log(`Terminal fitted to ${term.cols}x${term.rows}`);
         } catch (e) {
           console.error("Error fitting terminal initially:", e);
         }
       }
       term.focus();
     }, 100);
     
     // Additional resize after everything is loaded
     window.addEventListener('load', () => {
       setTimeout(() => {
         if (fitAddon) {
           try {
             fitAddon.fit();
           } catch (e) {
             console.error("Error fitting terminal on load:", e);
           }
         }
       }, 250);
     });
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

   // Initialize connection monitoring
   initializeConnectionMonitoring();

   // Welcome message with enhanced status
   displayWelcomeMessage();
   
   // Automatically connect to SSH after socket is ready
   setTimeout(() => {
     console.log("Checking if ready for auto-connect...");
     // Wait for socket to be connected before auto-connecting
     if (socket && socket.connected) {
       console.log("Socket ready, auto-connecting to SSH...");
       connectToSSH();
     } else {
       console.log("Socket not ready, waiting for connection...");
       // Try again after socket connects
       const checkInterval = setInterval(() => {
         if (socket && socket.connected) {
           clearInterval(checkInterval);
           console.log("Socket now ready, auto-connecting to SSH...");
           connectToSSH();
         }
       }, 1000);
       
       // Give up after 10 seconds
       const giveUpTimeout = setTimeout(() => {
         clearInterval(checkInterval);
         if (!socket || !socket.connected) {
           console.error("Failed to establish socket connection for auto-connect");
         }
       }, 10000);
       window._terminalTimeouts.push(giveUpTimeout);
     }
   }, 500);
 });

 // Enhanced socket initialization with stability improvements
 function initializeSocketIO(retryCount = 0) {
   const maxRetries = TERMINAL_CONFIG.SOCKET_RETRY_ATTEMPTS;

   console.log(`Attempting to initialize Socket.io (attempt ${retryCount + 1}/${maxRetries + 1})`);

   // Check if socket.io is loaded
   if (typeof io === 'undefined') {
     if (retryCount < maxRetries) {
       const delay = TERMINAL_CONFIG.SOCKET_RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
       console.warn(`Socket.io not available, retrying in ${delay}ms...`);
       setTimeout(() => initializeSocketIO(retryCount + 1), delay);
     } else {
       console.error("Socket.io library not loaded after multiple attempts.");
       // Don't enable fallback mode to prevent loops
     }
     return;
   }

   try {
     // Create socket connection with simpler, more stable settings
     console.log("Socket.io available, creating stable connection");
     socket = io({
       timeout: 20000,
       reconnection: false,  // Disable auto-reconnection to prevent loops
       forceNew: true,       // Force new connection
       transports: ['websocket', 'polling']  // Allow both transports
     });

     // Set up event listeners
     setupSocketListeners();

     console.log("Socket.io connection initialized with enhanced stability");
   } catch (e) {
     console.error("Error initializing socket.io:", e);
     if (retryCount < maxRetries) {
       const delay = TERMINAL_CONFIG.SOCKET_RETRY_DELAY * Math.pow(2, retryCount);
       setTimeout(() => initializeSocketIO(retryCount + 1), delay);
     } else {
       console.error("Failed to initialize socket after retries");
     }
   }
 }

 // Initialize improved connection monitoring
 function initializeConnectionMonitoring() {
   // Reduced frequency connection status check
   connectionCheckInterval = setInterval(() => {
     if (shouldCheckConnection()) {
       checkConnectionStatus();
     }
   }, TERMINAL_CONFIG.CONNECTION_CHECK_INTERVAL);

   // Conservative keep-alive mechanism
   keepAliveInterval = setInterval(() => {
     if (connected && socket && socket.connected) {
       // Only send keep-alive if connection has been stable for a long time
       const connectionAge = Date.now() - (sessionStartTime || Date.now());
       if (connectionAge > TERMINAL_CONFIG.CONNECTION_STABILITY_THRESHOLD) {
         // Only send keep-alive if no recent activity
         const timeSinceActivity = Date.now() - (lastActivityTime || 0);
         if (timeSinceActivity > 300000) { // 5 minutes since last activity
           socket.emit('keep_alive');
         }
       }
     }
   }, TERMINAL_CONFIG.KEEP_ALIVE_INTERVAL);

   console.log('Enhanced connection monitoring initialized');
 }

 // Smart connection status checking
 function checkConnectionStatus() {
   if (socket && connected && socket.connected) {
     // Only check SSH status if we haven't checked recently
     const timeSinceLastCheck = Date.now() - (lastActivityTime || 0);
     if (timeSinceLastCheck > 300000) { // 5 minutes
       socket.emit('get_ssh_status');
     }
   }
 }

 // Check if we should perform connection check (avoid spam)
 function shouldCheckConnection() {
   if (!connected) return false; // Don't check when disconnected
   
   // Don't check if user is actively typing or recently active
   const timeSinceLastActivity = Date.now() - (lastActivityTime || 0);
   return timeSinceLastActivity > 1800000; // 30 minutes of inactivity
 }

 // HTTP fallback for connection checking - DISABLED
 function checkConnectionViaHTTP() {
   // Disabled to prevent connection loops
   console.log('HTTP fallback disabled to prevent connection loops');
 }

 // Display enhanced welcome message
 function displayWelcomeMessage() {
   if (!term) return;

   term.write('\r\n\x1b[2m--- V3 Diagnostic Terminal (Persistent SSH) ---\x1b[0m\r\n');
   term.write('\x1b[2mInitializing terminal with persistent connection support...\x1b[0m\r\n');
   term.write('\x1b[2mSSH connections persist across page navigation\x1b[0m\r\n');
   term.write('\x1b[2mPress F1 for help, F2 for commands, Ctrl+L to clear\x1b[0m\r\n\r\n');
 }

 // Setup enhanced UI components
 function setupUIComponents() {
   // Initialize command categories sidebar (default hidden on mobile)
   const sidebar = document.getElementById('commandCategoriesSidebar');
   if (sidebar) {
     // Show network commands by default
     showCommandTab('network');
   }

   // Set up command tab functionality
   setupCommandTabs();

   // Initialize session statistics
   updateSessionStatistics();
 }

 // Setup command tabs functionality
 function setupCommandTabs() {
   const tabs = document.querySelectorAll('.command-tab');
   tabs.forEach(tab => {
     tab.addEventListener('click', function() {
       const tabName = this.dataset.tab;
       if (tabName) {
         showCommandTab(tabName);
       }
     });
   });
 }

 // Show specific command tab with SSH awareness
 function showCommandTab(tabName) {
   // Hide all tab contents
   const contents = document.querySelectorAll('.command-tab-content');
   contents.forEach(content => content.classList.add('hidden'));

   // Remove active state from all tabs
   const tabs = document.querySelectorAll('.command-tab');
   tabs.forEach(tab => {
     tab.classList.remove('border-primary-500', 'text-primary-400', 'bg-primary-900/20');
     tab.classList.add('border-transparent', 'text-gray-400');
   });

   // Show the selected tab content
   const targetContent = document.getElementById(`${tabName}-commands`);
   if (targetContent) {
     targetContent.classList.remove('hidden');

     // Add SSH status indicators to commands if not SSH connected
     if (!sshConnected) {
       addSSHWarningsToCommands(targetContent);
     }
   }

   // Activate the selected tab
   const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
   if (targetTab) {
     targetTab.classList.remove('border-transparent', 'text-gray-400');
     targetTab.classList.add('border-primary-500', 'text-primary-400', 'bg-primary-900/20');
   }
 }

 // Add SSH warnings to commands when SSH is not available
 function addSSHWarningsToCommands(container) {
   const commandButtons = container.querySelectorAll('button[onclick*="injectCommand"]');
   commandButtons.forEach(button => {
     if (!button.querySelector('.ssh-warning')) {
       const warning = document.createElement('span');
       warning.className = 'ssh-warning text-yellow-400 text-xs ml-2';
       warning.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
       warning.title = 'SSH required - command may not work properly';
       button.appendChild(warning);
     }
   });
 }

 // Remove SSH warnings from commands when SSH is available
 function removeSSHWarningsFromCommands() {
   const warnings = document.querySelectorAll('.ssh-warning');
   warnings.forEach(warning => warning.remove());
 }

 // Toggle command categories sidebar
 function toggleCommandCategories() {
   const sidebar = document.getElementById('commandCategoriesSidebar');
   if (!sidebar) return;

   if (sidebar.classList.contains('hidden')) {
     sidebar.classList.remove('hidden');
     sidebar.classList.add('block');
   } else {
     sidebar.classList.add('hidden');
     sidebar.classList.remove('block');
   }
 }

 // Enhanced toggle terminal assistant with SSH status integration
 function toggleTerminalAssistant() {
   const sidebar = document.getElementById('terminalAssistantSidebar');
   if (!sidebar) {
     console.error('Terminal assistant sidebar not found');
     return;
   }

   if (sidebar.classList.contains('translate-x-full')) {
     // Show sidebar
     sidebar.classList.remove('translate-x-full');
     sidebar.classList.add('translate-x-0');

     // Update sidebar with current status
     updateSidebarConnectionStatus();
     updateSidebarSessionInfo();
     updateSidebarCommandHistory();
     updateSidebarCustomCommands();
   } else {
     // Hide sidebar
     sidebar.classList.add('translate-x-full');
     sidebar.classList.remove('translate-x-0');
   }
 }

 // Enhanced sidebar connection status with SSH details
 function updateSidebarConnectionStatus() {
   const sidebarStatus = document.getElementById('sidebarConnectionStatus');
   if (!sidebarStatus) return;

   let statusHTML = '';
   let statusClass = '';

   if (sshConnected) {
     statusClass = 'flex items-center px-3 py-2 rounded-lg bg-green-900/20 border border-green-600/30 text-green-200';
     statusHTML = `
       <div class="flex items-center">
         <i class="bi bi-shield-check mr-2 text-green-500"></i>
         <div>
           <div class="text-sm font-medium">SSH Connected</div>
           <div class="text-xs text-green-300">Full functionality available</div>
         </div>
       </div>
     `;
   } else if (connected) {
     statusClass = 'flex items-center px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-600/30 text-blue-200';
     statusHTML = `
       <div class="flex items-center">
         <i class="bi bi-wifi mr-2 text-blue-500"></i>
         <div>
           <div class="text-sm font-medium">Socket Connected</div>
           <div class="text-xs text-blue-300">Limited functionality</div>
         </div>
       </div>
     `;
   } else if (reconnecting) {
     statusClass = 'flex items-center px-3 py-2 rounded-lg bg-yellow-900/20 border border-yellow-600/30 text-yellow-200';
     statusHTML = `
       <div class="flex items-center">
         <i class="bi bi-arrow-repeat mr-2 animate-spin text-yellow-500"></i>
         <div>
           <div class="text-sm font-medium">Connecting...</div>
           <div class="text-xs text-yellow-300">Establishing connection</div>
         </div>
       </div>
     `;
   } else {
     statusClass = 'flex items-center px-3 py-2 rounded-lg bg-red-900/20 border border-red-600/30 text-red-200';
     statusHTML = `
       <div class="flex items-center">
         <i class="bi bi-x-circle mr-2 text-red-500"></i>
         <div>
           <div class="text-sm font-medium">Disconnected</div>
           <div class="text-xs text-red-300">No connection available</div>
         </div>
       </div>
     `;
   }

   sidebarStatus.className = statusClass;
   sidebarStatus.innerHTML = statusHTML;
 }

 // Update sidebar session information
 function updateSidebarSessionInfo() {
   const sessionInfo = document.getElementById('sidebarSessionInfo');
   if (!sessionInfo) return;

   const uptime = sessionStartTime ?
     formatDuration((Date.now() - sessionStartTime) / 1000) : 'Not started';

   const sessionType = persistentSessionId ? 'Persistent' : 'Temporary';
   const sessionIcon = persistentSessionId ? '💾' : '📄';

   sessionInfo.innerHTML = `
     <div class="space-y-2">
       <div class="flex justify-between items-center">
         <span class="text-sm text-gray-400">Session Type</span>
         <span class="text-sm text-white font-mono">${sessionIcon} ${sessionType}</span>
       </div>
       <div class="flex justify-between items-center">
         <span class="text-sm text-gray-400">Session Uptime</span>
         <span class="text-sm text-white font-mono">${uptime}</span>
       </div>
       <div class="flex justify-between items-center">
         <span class="text-sm text-gray-400">Commands Executed</span>
         <span class="text-sm text-white font-mono">${commandCount}</span>
       </div>
       <div class="flex justify-between items-center">
         <span class="text-sm text-gray-400">SSH Status</span>
         <span class="text-sm ${sshConnected ? 'text-green-400' : 'text-red-400'} font-mono">
           ${sshConnected ? 'Available' : 'Unavailable'}
         </span>
       </div>
     </div>
   `;
 }

 // Format duration helper
 function formatDuration(seconds) {
   if (seconds < 60) return `${Math.floor(seconds)}s`;
   if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
   return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
 }

 // Enhanced sidebar command history with SSH indicators
 function updateSidebarCommandHistory() {
   const historyList = document.getElementById('commandHistoryList');
   if (!historyList) return;

   if (commandHistory && commandHistory.length > 0) {
     historyList.innerHTML = '';

     // Show only last 10 commands in sidebar
     const recentCommands = commandHistory.slice(0, 10);

     recentCommands.forEach((cmd, index) => {
       const div = document.createElement('div');
       div.className = 'command-item group cursor-pointer p-3 rounded-lg hover:bg-surface-600/50 transition-all mb-1';
       div.onclick = function() { injectCommand(cmd); };

       const requiresSSH = commandRequiresSSH(cmd);
       const canExecute = !requiresSSH || sshConnected;

       div.innerHTML = `
         <div class="flex items-center justify-between">
           <code class="text-sm ${canExecute ? 'text-green-300' : 'text-yellow-300'} font-mono flex-1 truncate mr-2">${escapeHtml(cmd)}</code>
           <div class="flex items-center space-x-1">
             ${!canExecute ? '<i class="bi bi-exclamation-triangle text-yellow-400 text-xs" title="SSH required"></i>' : ''}
             <i class="bi bi-play-fill text-gray-400 group-hover:${canExecute ? 'text-green-400' : 'text-yellow-400'} transition-colors"></i>
           </div>
         </div>
         <div class="text-xs text-gray-400 mt-1">
           Used ${index === 0 ? 'recently' : (index + 1) + ' commands ago'}
           ${!canExecute ? ' • SSH required' : ''}
         </div>
       `;

       historyList.appendChild(div);
     });
   } else {
     historyList.innerHTML = `
       <div class="text-center py-8">
         <i class="bi bi-clock-history text-gray-500 text-4xl"></i>
         <p class="text-gray-400 text-sm mt-2 mb-1">No commands in history yet</p>
         <p class="text-gray-500 text-xs">Recent commands will appear here</p>
       </div>
     `;
   }
 }

 // Check if command requires SSH
 function commandRequiresSSH(command) {
   const sshCommands = [
     'ls', 'cat', 'grep', 'find', 'ps', 'top', 'htop', 'df', 'du', 'free',
     'uname', 'whoami', 'pwd', 'cd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv',
     'chmod', 'chown', 'systemctl', 'service', 'mount', 'umount', 'lsblk',
     'fdisk', 'ifconfig', 'ip', 'netstat', 'ss', 'ping', 'traceroute',
     'iptables', 'firewall-cmd', 'tail', 'head', 'less', 'more', 'nano',
     'vi', 'vim', 'emacs', 'wget', 'curl', 'scp', 'rsync', 'tar', 'gzip',
     'zip', 'unzip', 'crontab', 'history', 'alias', 'env', 'export'
   ];

   const cmdLower = command.toLowerCase().trim();
   return sshCommands.some(sshCmd =>
     cmdLower.startsWith(sshCmd + ' ') || cmdLower === sshCmd
   );
 }

 // Enhanced sidebar custom commands with SSH awareness
 function updateSidebarCustomCommands() {
   const customList = document.getElementById('customCommandsList');
   if (!customList) return;

   if (customCommands && customCommands.length > 0) {
     customList.innerHTML = '';

     customCommands.forEach((cmd, index) => {
       const div = document.createElement('div');
       div.className = 'command-item group cursor-pointer p-3 rounded-lg hover:bg-surface-600/50 transition-all mb-1 relative';

       const requiresSSH = commandRequiresSSH(cmd);
       const canExecute = !requiresSSH || sshConnected;

       div.innerHTML = `
         <div class="flex items-center justify-between">
           <code class="text-sm ${canExecute ? 'text-orange-300' : 'text-yellow-300'} font-mono flex-1 truncate mr-2" onclick="injectCommand('${escapeHtml(cmd)}')">${escapeHtml(cmd)}</code>
           <div class="flex items-center space-x-1">
             ${!canExecute ? '<i class="bi bi-exclamation-triangle text-yellow-400 text-xs" title="SSH required"></i>' : ''}
             <i class="bi bi-play-fill text-gray-400 group-hover:${canExecute ? 'text-orange-400' : 'text-yellow-400'} transition-colors" onclick="injectCommand('${escapeHtml(cmd)}')" title="Run command"></i>
             <i class="bi bi-x-lg text-gray-400 hover:text-red-400 transition-colors text-xs" onclick="removeSidebarCustomCommand(${index})" title="Remove command"></i>
           </div>
         </div>
         <div class="text-xs text-gray-400 mt-1">
           Custom command ${index + 1}
           ${!canExecute ? ' • SSH required' : ''}
         </div>
       `;

       customList.appendChild(div);
     });
   } else {
     customList.innerHTML = `
       <div class="text-center py-8">
         <i class="bi bi-bookmark text-gray-500 text-4xl"></i>
         <p class="text-gray-400 text-sm mt-2 mb-1">No custom commands saved yet</p>
         <p class="text-gray-500 text-xs">Commands you save will appear here</p>
       </div>
     `;
   }
 }

 // Remove custom command from sidebar
 function removeSidebarCustomCommand(index) {
   removeCustomCommand(index);
   updateSidebarCustomCommands();
 }

 // Toggle sidebar sections
 function toggleSection(sectionId) {
   const section = document.getElementById(sectionId);
   const chevron = document.getElementById(sectionId.replace('Section', 'Chevron'));

   if (!section || !chevron) return;

   if (section.classList.contains('hidden')) {
     section.classList.remove('hidden');
     chevron.style.transform = 'rotate(180deg)';
   } else {
     section.classList.add('hidden');
     chevron.style.transform = 'rotate(0deg)';
   }
 }

 // Enhanced socket event listeners with stability improvements
 function setupSocketListeners() {
   if (!socket) {
     console.error("Cannot setup socket listeners - socket not initialized");
     return;
   }

   // Connection established
   socket.on('connect', () => {
     console.log("Socket connected");
     connected = true;
     reconnecting = false;
     lastActivityTime = Date.now();
     
     // Don't immediately show connection success - wait for server confirmation
   });

   // Handle initial connection acknowledgment
   socket.on('connection_established', (data) => {
     console.log('Connection established:', data);
     
     persistentSessionId = data.persistent_session_id;
     isReconnection = data.is_reconnection || false;
     sessionStartTime = data.server_time ? data.server_time * 1000 : Date.now();
     
     if (isReconnection) {
       console.log('Detected reconnection to existing session');
       term.write('\r\n\x1b[36m✓ Reconnected to existing session\x1b[0m\r\n');
     } else {
       console.log('New session established');
       term.write('\r\n\x1b[32m✓ New terminal session started\x1b[0m\r\n');
     }
     
     updateTerminalStatus(CONNECTION_STATES.CONNECTED);
     updateSidebarConnectionStatus();
     
     // Update the connection status badge
     if (typeof updateConnectionStatus === 'function') {
       updateConnectionStatus(true);
     }
     
     // Start terminal session after connection is confirmed
     if (!terminalInitialized) {
       startTerminal();
       terminalInitialized = true;
     }
   });

   // Connection lost
   socket.on('disconnect', (reason) => {
     console.log("Socket disconnected:", reason);
     
     // Only show disconnect message if connection was stable and not a planned disconnect
     const connectionDuration = Date.now() - (sessionStartTime || Date.now());
     const isPlannedDisconnect = reason === 'io client disconnect' || reason === 'transport close';
     
     if (connectionDuration > TERMINAL_CONFIG.CONNECTION_STABILITY_THRESHOLD && !isPlannedDisconnect) {
       term.write('\r\n\x1b[33m⚠ Connection lost: ' + reason + '\x1b[0m\r\n');
     }
     
     connected = false;
     sshConnected = false;
     updateTerminalStatus(CONNECTION_STATES.DISCONNECTED);
     updateSidebarConnectionStatus();
     
     // Update the connection status badge
     if (typeof updateConnectionStatus === 'function') {
       updateConnectionStatus(false);
     }
   });

   // Connection errors
   socket.on('connect_error', (error) => {
     console.error("Socket connection error:", error);
     
     // Only show error if we've been trying for a while
     if (!sessionStartTime || Date.now() - sessionStartTime > 10000) {
       term.write('\r\n\x1b[31m✗ Connection error: ' + (error.message || 'Unknown error') + '\x1b[0m\r\n');
     }
     
     connected = false;
     sshConnected = false;
     updateTerminalStatus(CONNECTION_STATES.ERROR);
     updateSidebarConnectionStatus();
   });

   // Enhanced terminal output handler
   socket.on('terminal_output', data => {
     term.write(data);
     terminalLog += data;
     appendTerminalLog(data);
     lastActivityTime = Date.now();

     // Detect SSH connection status from output
     analyzeTerminalOutput(data);

     // Update session statistics
     updateSessionStatistics();
   });

   // Connection status updates from server
   socket.on('connection_status', (status) => {
     console.log('Connection status update:', status);
     sshConnected = status.ssh_available || false;
     connectionDetails = status;

     if (sshConnected) {
       if (!isReconnection) {
         term.write('\r\n\x1b[32m✓ SSH connection established\x1b[0m\r\n');
       }
       updateTerminalStatus(CONNECTION_STATES.SSH_CONNECTED);
       removeSSHWarningsFromCommands();
     } else {
       term.write('\r\n\x1b[33m⚠ SSH connection unavailable\x1b[0m\r\n');
       if (status.error) {
         term.write(`\x1b[31mSSH Error: ${status.error}\x1b[0m\r\n`);
       }
     }

     updateSidebarConnectionStatus();
     updateSidebarCommandHistory();
     updateSidebarCustomCommands();
     
     // Update the connection status badge on the terminal page
     if (typeof updateConnectionStatus === 'function') {
       updateConnectionStatus(sshConnected);
     }
   });

   // SSH connection status updates
   socket.on('ssh_status', (status) => {
     console.log('SSH status update:', status);
     sshConnected = status.ssh_available || false;
     connectionDetails = status;

     if (status.persistent) {
       console.log('Using persistent SSH connection');
       if (status.page_navigations > 0) {
         term.write(`\r\n\x1b[36m✓ Restored SSH session (${status.page_navigations} page navigations)\x1b[0m\r\n`);
       }
     }

     if (sshConnected) {
       if (!isReconnection && !status.persistent) {
         term.write('\r\n\x1b[32m✓ SSH connection established\x1b[0m\r\n');
       }
       updateTerminalStatus(CONNECTION_STATES.SSH_CONNECTED);
       removeSSHWarningsFromCommands();
     } else {
       term.write('\r\n\x1b[33m⚠ SSH connection unavailable\x1b[0m\r\n');
       if (status.error) {
         term.write(`\x1b[31mSSH Error: ${status.error}\x1b[0m\r\n`);
       }
     }

     updateSidebarConnectionStatus();
     updateSidebarCommandHistory();
     updateSidebarCustomCommands();
   });

   // Connection status responses
   socket.on('connection_status_response', (status) => {
     console.log('Connection status response:', status);
     connectionDetails = status;

     if (status.ssh_available !== sshConnected) {
       sshConnected = status.ssh_available;
       updateSidebarConnectionStatus();
     }
   });
   
   // Handle terminal connected event
   socket.on('terminal_connected', (data) => {
     console.log('Terminal connected:', data);
     connected = true;
     sshConnected = true;
     isConnecting = false;
     
     // Update UI to show we're connected
     updateTerminalStatus(CONNECTION_STATES.SSH_CONNECTED);
     updateSidebarConnectionStatus();
     
     // Update connect button
     const connectBtn = document.getElementById('connectBtn');
     if (connectBtn) {
       connectBtn.disabled = false;
       connectBtn.innerHTML = '<i class="bi bi-link-45deg"></i> <span class="hidden sm:inline">Connected</span>';
     }
     
     // Focus terminal for typing
     if (term) {
       term.focus();
     }
   });

   // Keep-alive responses
   socket.on('keep_alive_response', () => {
     console.log('Keep-alive response received');
   });

   // Handle trigger_terminal_connect from server (removed to avoid double execution)
   // socket.on('trigger_terminal_connect', () => {
   //   console.log('Server triggered terminal_connect');
   //   socket.emit('terminal_connect', {});
   // });

   // Handle session restoration check response
   socket.on('session_status', (data) => {
     console.log('Session status received:', data);
     if (!data.active && sshConnected) {
       // Session was lost but frontend thinks it's connected - clear state
       console.log('Session lost, clearing frontend state');
       sshConnected = false;
       connected = false;
       updateTerminalStatus(CONNECTION_STATES.DISCONNECTED);
       updateSidebarConnectionStatus();
       term.write('\r\n\x1b[33m⚠ Session lost after page reload. Please reconnect.\x1b[0m\r\n');
     }
   });

   // Error handling
   socket.on('terminal_error', (error) => {
     console.error('Terminal error:', error);
     term.write(`\r\n\x1b[31mTerminal Error: ${error.message || error}\x1b[0m\r\n`);

     if (error.type === 'ssh_error') {
       sshConnected = false;
       updateSidebarConnectionStatus();
     }
   });

   // Improved reconnection handling
   socket.on('reconnect', (attemptNumber) => {
     console.log(`Reconnected after ${attemptNumber} attempts`);
     
     // Wait for connection to stabilize before announcing success
     setTimeout(() => {
       if (connected && socket.connected) {
         term.write('\r\n\x1b[32m✓ Reconnected to server\x1b[0m\r\n');
         reconnecting = false;
         
         // Request current SSH status after stable reconnection
         setTimeout(() => {
           if (socket && socket.connected) {
             socket.emit('get_ssh_status');
           }
         }, 30000); // Wait 30 seconds instead of 3 to prevent connection loops
       }
     }, 10000); // 10 second stability check
   });

   socket.on('reconnect_attempt', (attemptNumber) => {
     console.log(`Reconnection attempt ${attemptNumber}`);
     if (attemptNumber === 1) {
       reconnecting = true;
       updateTerminalStatus(CONNECTION_STATES.CONNECTING);
       updateSidebarConnectionStatus();
       term.write('\r\n\x1b[33m↻ Attempting to reconnect...\x1b[0m\r\n');
     }
   });

   socket.on('reconnect_failed', () => {
     console.log('Socket reconnection failed');
     term.write('\r\n\x1b[31m✗ Reconnection failed\x1b[0m\r\n');
     term.write('\x1b[33mPlease refresh the page to restore connection\x1b[0m\r\n');
     
     connected = false;
     sshConnected = false;
     reconnecting = false;
     updateTerminalStatus(CONNECTION_STATES.ERROR);
     updateSidebarConnectionStatus();
   });
 }

 // Enhanced terminal key handlers with SSH awareness
 function setupTerminalKeyHandlers() {
   if (!term) return;

   term.onKey((ev) => {
     const key = ev.key;
     const domEvent = ev.domEvent;

     // Check if we're connected to the socket
     if (!socket || !socket.connected) {
       // Show visual feedback that input is blocked
       if (!term._notConnectedWarningShown || Date.now() - term._notConnectedWarningShown > 3000) {
         term.write('\r\n\x1b[33m⚠ Socket not connected. Please wait...\x1b[0m\r\n');
         term._notConnectedWarningShown = Date.now();
       }
       return;
     }

     // Check if SSH is available for commands that need it
     if (!sshConnected && commandRequiresSSH(currentCommand)) {
       if (!term._sshWarningShown || Date.now() - term._sshWarningShown > 3000) {
         term.write('\r\n\x1b[33m⚠ SSH not connected. Trying to execute anyway...\x1b[0m\r\n');
         term._sshWarningShown = Date.now();
       }
     }

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
         // Check if command requires SSH
         if (commandRequiresSSH(currentCommand) && !sshConnected) {
           term.write('\r\n\x1b[33m⚠ Warning: This command requires SSH access\x1b[0m\r\n');

           // Still allow execution but warn user
           const proceed = true; // You could make this configurable
           if (!proceed) {
             currentCommand = '';
             historyIndex = -1;
             return;
           }
         }

         // Add to command history
         if (commandHistory.length === 0 || commandHistory[0] !== currentCommand) {
           commandHistory.unshift(currentCommand);
           // Keep history limited
           if (commandHistory.length > TERMINAL_CONFIG.MAX_COMMAND_HISTORY) {
             commandHistory.pop();
           }
           // Update history UI
           updateCommandHistoryUI();
           // Save to local storage
           saveCommandHistory();
           // Increment command count
           commandCount++;
           updateSessionStatistics();
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

 // Enhanced terminal output analysis with SSH detection
 function analyzeTerminalOutput(data) {
   const output = data.toLowerCase();

   // Detect SSH connection establishment
   if (output.includes('welcome') ||
       output.includes('last login') ||
       output.includes('@') && output.includes('$') ||
       output.includes('root@') ||
       output.includes('pi@')) {
     if (!sshConnected) {
       sshConnected = true;
       updateTerminalStatus(CONNECTION_STATES.SSH_CONNECTED);
       updateSidebarConnectionStatus();
       removeSSHWarningsFromCommands();
     }
   }

   // Detect SSH connection loss
   if (output.includes('connection closed') ||
       output.includes('could not resolve hostname') ||
       output.includes('connection refused') ||
       output.includes('permission denied') ||
       output.includes('ssh: connect to host')) {
     if (sshConnected) {
       sshConnected = false;
       updateTerminalStatus(CONNECTION_STATES.CONNECTED);
       updateSidebarConnectionStatus();
     }
   }

   // Detect command completion for statistics
   if (output.includes('$') || output.includes('#') || output.includes('>')) {
     updateSessionStatistics();
   }

   // Auto-scroll if user is near bottom
   if (term.buffer && term.buffer.active) {
     const viewport = term.rows;
     const scrollback = term.buffer.active.length;
     const scrollTop = term.buffer.active.viewportY;

     if (scrollback - scrollTop - viewport < TERMINAL_CONFIG.AUTOSCROLL_THRESHOLD) {
       term.scrollToBottom();
     }
   }
 }

 // Enhanced setup window event listeners
 function setupEventListeners() {
   // Window resize handling with debouncing
   let resizeTimeout;
   window.addEventListener('resize', () => {
     clearTimeout(resizeTimeout);
     resizeTimeout = setTimeout(() => {
       if (fitAddon && term) {
         try {
           fitAddon.fit();
           // Notify server about terminal resize if connected
           if (socket && socket.connected && sshConnected) {
             const cols = term.cols;
             const rows = term.rows;
             socket.emit('terminal_resize', { cols, rows });
           }
         } catch (e) {
           console.error("Error fitting terminal on resize:", e);
         }
       }
     }, 100); // Debounce resize events
   });

   // Minimal user activity tracking
   let idleTimer;

   function resetIdleTimer() {
     clearTimeout(idleTimer);
     lastActivityTime = Date.now();
     // Don't send keep-alive on every activity - let the interval handle it
   }

   // Only track significant interactions
   document.addEventListener('keydown', resetIdleTimer);
   document.addEventListener('click', resetIdleTimer);
   resetIdleTimer();

   // Global keyboard shortcuts (enhanced)
   document.addEventListener('keydown', handleGlobalKeyboardShortcuts);

   // Page visibility handling
   document.addEventListener('visibilitychange', () => {
     if (document.hidden) {
       console.log('Page hidden');
     } else {
       console.log('Page visible');
       lastActivityTime = Date.now();
       // Don't immediately check SSH status when page becomes visible
     }
   });
 }

 // Enhanced global keyboard shortcuts
 function handleGlobalKeyboardShortcuts(e) {
   // Global shortcuts
   if (e.ctrlKey && e.key === 's') {
     e.preventDefault();
     saveHistoryToFile();
     return;
   }

   if (e.ctrlKey && e.key === 'f') {
     e.preventDefault();
     toggleFullscreen();
     return;
   }

   // Clear terminal with Ctrl+L (same as in bash)
   if (e.ctrlKey && e.key === 'l') {
     clearTerminal();
     e.preventDefault();
     return;
   }

   // Reconnect with Ctrl+R
   if (e.ctrlKey && e.key === 'r') {
     e.preventDefault();
     reconnectTerminal();
     return;
   }

   // Toggle command categories with F2
   if (e.key === 'F2') {
     e.preventDefault();
     toggleCommandCategories();
     return;
   }

   // Toggle assistant with F1
   if (e.key === 'F1') {
     e.preventDefault();
     toggleTerminalAssistant();
     return;
   }

   // Emergency reset with Ctrl+Alt+R
   if (e.ctrlKey && e.altKey && e.key === 'r') {
     e.preventDefault();
     emergencyReset();
     return;
   }

   // Connection recovery with Ctrl+Shift+R
   if (e.ctrlKey && e.shiftKey && e.key === 'R') {
     e.preventDefault();
     attemptConnectionRecovery();
     return;
   }

   // Focus command input when typing starts (if not in terminal)
   if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
     const activeElement = document.activeElement;
     const commandInput = document.getElementById('commandInput');

     // Check if we're in fullscreen terminal mode
     if (isFullscreen) {
       // In fullscreen, everything goes to terminal
       term.focus();
       return;
     }

     if (!commandInput) return;

     // If not already focused on an input
     if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
       commandInput.focus();
       // If it's a printable character, add it to the input
       if (e.key.match(/^[a-zA-Z0-9!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]$/)) {
         commandInput.value += e.key;
       }
     }
   }
 }

 // Emergency reset function
 function emergencyReset() {
   console.log('Emergency reset triggered');

   if (confirmModal) {
     // Show emergency reset confirmation
     const proceed = confirm('Emergency Reset: This will disconnect all connections and restart the terminal. Continue?');
     if (!proceed) return;
   }

   // Clear all intervals
   if (connectionCheckInterval) clearInterval(connectionCheckInterval);
   if (keepAliveInterval) clearInterval(keepAliveInterval);

   // Reset all state
   connected = false;
   sshConnected = false;
   reconnecting = false;
   connectionDetails = null;
   sessionStartTime = null;
   commandCount = 0;

   // Disconnect socket
   if (socket) {
     socket.disconnect();
     socket = null;
   }

   // Clear terminal
   clearTerminal();
   clearTerminalLog();

   // Reinitialize everything
   setTimeout(() => {
     initializeSocketIO();
     initializeConnectionMonitoring();
     updateTerminalStatus(CONNECTION_STATES.CONNECTING);
     updateSidebarConnectionStatus();
   }, 1000);

   showToast('Reset', 'Emergency reset completed', 'info');
 }

 // Helper for command history navigation
 function replaceCurrentCommandWithHistory() {
   let command = '';
   if (historyIndex >= 0 && historyIndex < commandHistory.length) {
     command = commandHistory[historyIndex];
   }

   // Clear current line and send history command
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

 // Enhanced UI update for command history with SSH indicators
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
       li.className = 'flex items-center justify-between p-3 bg-surface-700 hover:bg-surface-600 rounded-lg border border-surface-600/50 transition-colors';

       const requiresSSH = commandRequiresSSH(cmd);
       const canExecute = !requiresSSH || sshConnected;

       const cmdText = document.createElement('span');
       cmdText.textContent = cmd;
       cmdText.className = `font-mono text-sm flex-1 mr-2 ${canExecute ? 'text-white' : 'text-yellow-300'}`;

       const actions = document.createElement('div');
       actions.className = 'flex items-center space-x-1';

       if (!canExecute) {
         const warningIcon = document.createElement('i');
         warningIcon.className = 'bi bi-exclamation-triangle text-yellow-400 text-sm';
         warningIcon.title = 'SSH required for this command';
         actions.appendChild(warningIcon);
       }

       const runBtn = document.createElement('button');
       runBtn.className = `p-2 ${canExecute ? 'text-green-400 hover:text-green-300' : 'text-yellow-400 hover:text-yellow-300'} hover:bg-surface-600 rounded transition-colors`;
       runBtn.innerHTML = '<i class="bi bi-play-fill text-sm"></i>';
       runBtn.title = canExecute ? 'Run command' : 'Run command (SSH required)';
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

   // Also update sidebar history
   updateSidebarCommandHistory();
 }

 // Enhanced save and load command history
 function saveCommandHistory() {
   if (commandHistory && commandHistory.length > 0) {
     try {
       const historyData = {
         commands: commandHistory,
         timestamp: Date.now(),
         sshStatus: sshConnected
       };
       localStorage.setItem('terminalCommandHistory', JSON.stringify(historyData));
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

       // Handle both old format (array) and new format (object)
       if (Array.isArray(parsed)) {
         commandHistory = parsed;
       } else if (parsed.commands && Array.isArray(parsed.commands)) {
         commandHistory = parsed.commands;
         // Log SSH status from when history was saved
         if (parsed.sshStatus !== undefined) {
           console.log(`History loaded with SSH status: ${parsed.sshStatus}`);
         }
       }

       updateCommandHistoryUI();
     }
   } catch (e) {
     console.error('Failed to load command history:', e);
     commandHistory = [];
   }
 }

 // Enhanced clear history with confirmation
 function clearHistory() {
   confirmAction('Are you sure you want to clear command history? This action cannot be undone.', () => {
     commandHistory = [];
     localStorage.removeItem('terminalCommandHistory');
     updateCommandHistoryUI();
     showToast('History', 'Command history cleared', 'info');
   });
 }

 // Enhanced save history to file with SSH status
 function saveHistoryToFile() {
   if (!commandHistory || commandHistory.length === 0) {
     showToast('History', 'No commands to save', 'warning');
     return;
   }

   // Create enhanced text content for file export
   let content = "# V3 Terminal Command History (Enhanced SSH Support)\n";
   content += `# Generated: ${new Date().toLocaleString()}\n`;
   content += `# SSH Status: ${sshConnected ? 'Connected' : 'Disconnected'}\n`;
   content += `# Session Commands: ${commandCount}\n`;
   content += `# Session Uptime: ${sessionStartTime ? formatDuration((Date.now() - sessionStartTime) / 1000) : 'N/A'}\n\n`;

   commandHistory.forEach((cmd, index) => {
     const requiresSSH = commandRequiresSSH(cmd);
     const sshIndicator = requiresSSH ? ' [SSH]' : '';
     content += `${index + 1}. ${cmd}${sshIndicator}\n`;
   });

   content += `\n# Legend:\n`;
   content += `# [SSH] - Command requires SSH connection\n`;

   // Create download
   const blob = new Blob([content], { type: 'text/plain' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `terminal_history_${new Date().toISOString().slice(0, 10)}.txt`;
   document.body.appendChild(a);
   a.click();

   // Clean up
   setTimeout(() => {
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
   }, 0);

   showToast('Success', 'History saved to file with SSH indicators', 'success');
 }

 // Enhanced Terminal Functions with persistent connection support
 function startTerminal() {
   console.log("Starting terminal session with persistent connection support");

   // Only start if socket is connected and stable
   if (!socket || !socket.connected) {
     console.log("Socket not ready, delaying terminal start");
     return;
   }

   // Show connecting status
   updateTerminalStatus(CONNECTION_STATES.CONNECTING);

   // Request terminal session from server
   socket.emit('start_terminal');
   
   // Request SSH status after a delay
   setTimeout(() => {
     if (socket && socket.connected) {
       socket.emit('get_ssh_status');
     }
   }, 1000); // Reduced delay since we have persistent connections
   
   console.log("Terminal start request sent to server");

   // Show welcome message based on connection type
   if (isReconnection) {
     term.write('\r\n\x1b[2m=== Reconnecting to Existing Session ===\x1b[0m\r\n');
   } else if (!reconnecting) {
     term.write('\r\n\x1b[2m=== V3 Diagnostic Terminal ===\x1b[0m\r\n');
     term.write('\x1b[2mInitializing persistent connection...\x1b[0m\r\n\r\n');
   }
 }

 // Track if we're already connecting to prevent duplicates
 let isConnecting = false;

 // Manual SSH connection function
 function connectToSSH() {
   console.log("Manual SSH connection requested");
   
   // Prevent duplicate connections
   if (isConnecting) {
     console.log("Already connecting, skipping duplicate request");
     return;
   }
   
   if (!socket || !socket.connected) {
     showToast('Connection', 'WebSocket not connected. Please refresh the page.', 'error');
     return;
   }

   isConnecting = true;
   
   const connectBtn = document.getElementById('connectBtn');
   if (connectBtn) {
     connectBtn.disabled = true;
     connectBtn.innerHTML = '<i class="bi bi-arrow-repeat animate-spin"></i> <span class="hidden sm:inline">Connecting...</span>';
   }

   term.write('\r\n\x1b[36m→ Connecting to SSH...\x1b[0m\r\n');
   
   // Mark as connected so input works while waiting for SSH
   connected = true;
   
   // Use the existing terminal_connect event
   socket.emit('terminal_connect', {});
   
   // Re-enable button after timeout
   setTimeout(() => {
     isConnecting = false;
     if (connectBtn) {
       connectBtn.disabled = false;
       connectBtn.innerHTML = '<i class="bi bi-link-45deg"></i> <span class="hidden sm:inline">Connect</span>';
     }
   }, 10000);
 }

 function resetTerminal() {
   confirmAction('Are you sure you want to reset the terminal session? This will clear the display but preserve your SSH connection.', () => {
     clearTerminal();
     
     // Don't reset SSH connection or session data for persistent connections
     if (persistentSessionId) {
       term.write('\r\n\x1b[33m→ Terminal display cleared (SSH connection preserved)\x1b[0m\r\n');
       updateSessionStatistics();
       showToast('Terminal', 'Terminal display reset (connection preserved)', 'info');
     } else {
       // Full reset for non-persistent connections
       clearTerminalLog();
       sshConnected = false;
       connectionDetails = null;
       sessionStartTime = Date.now();
       commandCount = 0;
       terminalInitialized = false;
       
       reconnectTerminal(true);
       updateSessionStatistics();
       showToast('Terminal', 'Terminal session has been reset', 'info');
     }
   });
 }

 function reconnectTerminal(force = false) {
   if (persistentSessionId && !force) {
     confirmAction('Refresh the connection? Your SSH session will be preserved.', () => {
       performReconnect();
     });
   } else if (connected && !force) {
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
   sshConnected = false;
   updateTerminalStatus(CONNECTION_STATES.CONNECTING);
   updateSidebarConnectionStatus();

   term.write('\r\n\x1b[33mReconnecting to device...\x1b[0m\r\n');

   // Disconnect and reconnect the socket
   socket.disconnect();
   setTimeout(() => {
     socket.connect();
   }, 1000);
 }

 function clearTerminal() {
   if (term) {
     term.clear();
     term.write('\r\n\x1b[2mTerminal cleared\x1b[0m\r\n');
   }
 }

 function clearTerminalLog() {
   sessionStorage.removeItem("terminal_log");
   terminalLog = '';
   showToast('Terminal', 'Terminal log cleared', 'info');
 }

 // Enhanced copy terminal content
 function copyTerminalContent() {
   if (!term) return;

   // Get visible terminal content
   const selection = term.getSelection();

   // If there's a selection, copy that, otherwise copy all visible content
   let textToCopy = selection;
   if (!textToCopy && term.buffer && term.buffer.active) {
     try {
       // Get all visible lines
       const lines = [];
       for (let i = 0; i < term.rows; i++) {
         const line = term.buffer.active.getLine(i);
         if (line) {
           lines.push(line.translateToString());
         }
       }
       textToCopy = lines.join('\n');
     } catch (e) {
       console.error("Error getting terminal content:", e);
       textToCopy = "Error copying terminal content";
     }
   }

   // Add SSH status to copied content
   const sshStatus = sshConnected ? 'SSH Connected' : 'SSH Disconnected';
   const timestamp = new Date().toLocaleString();
   const header = `# V3 Terminal Content (${timestamp})\n# Status: ${sshStatus}\n\n`;
   textToCopy = header + (textToCopy || '');

   // Copy to clipboard
   if (navigator.clipboard) {
     navigator.clipboard.writeText(textToCopy)
       .then(() => {
         showToast('Success', 'Terminal content copied to clipboard with SSH status', 'success');
       })
       .catch(err => {
         showToast('Error', `Failed to copy: ${err}`, 'danger');
       });
   } else {
     showToast('Error', 'Clipboard API not available in this browser', 'danger');
   }
 }

 function toggleFullscreen() {
   const terminalContainer = document.getElementById('terminal');
   if (!terminalContainer) return;

   const container = terminalContainer.closest('.terminal-wrapper');
   if (!container) return;

   if (!isFullscreen) {
     // Save current styles
     container._originalClasses = container.className;

     // Make fullscreen with Tailwind classes
     container.className = 'fixed inset-0 z-50 bg-dashboard-bg flex flex-col';
     document.body.style.overflow = 'hidden';

     // Update button icon
     const fullscreenBtn = document.querySelector('[title="Toggle Fullscreen"] i');
     if (fullscreenBtn) {
       fullscreenBtn.classList.replace('bi-arrows-fullscreen', 'bi-fullscreen-exit');
     }

     isFullscreen = true;
     showToast('Terminal', 'Fullscreen mode enabled', 'info');
   } else {
     // Restore original classes
     if (container._originalClasses) {
       container.className = container._originalClasses;
     }
     document.body.style.overflow = '';

     // Update button icon
     const fullscreenBtn = document.querySelector('[title="Toggle Fullscreen"] i');
     if (fullscreenBtn) {
       fullscreenBtn.classList.replace('bi-fullscreen-exit', 'bi-arrows-fullscreen');
     }

     isFullscreen = false;
     showToast('Terminal', 'Fullscreen mode disabled', 'info');
   }

   // Resize the terminal to fit the new container size
   setTimeout(() => {
     if (fitAddon) fitAddon.fit();
   }, 100);
 }

 // Enhanced Custom Commands Management
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
     buttonWrapper.className = 'flex items-center gap-2 p-3 bg-surface-700 hover:bg-surface-600 rounded-lg border border-surface-600/50 transition-colors';

     const requiresSSH = commandRequiresSSH(cmd);
     const canExecute = !requiresSSH || sshConnected;

     const button = document.createElement('button');
     button.className = `flex-1 text-left font-mono text-sm hover:text-primary-400 transition-colors ${canExecute ? 'text-white' : 'text-yellow-300'}`;
     button.onclick = () => injectCommand(cmd);
     button.textContent = cmd;
     button.title = canExecute ? `Run: ${cmd}` : `Run: ${cmd} (SSH required)`;

     // Add SSH warning if needed
     if (!canExecute) {
       const warning = document.createElement('span');
       warning.className = 'text-yellow-400 text-xs ml-2';
       warning.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
       warning.title = 'SSH required for this command';
       button.appendChild(warning);
     }

     const deleteBtn = document.createElement('button');
     deleteBtn.className = 'p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors';
     deleteBtn.innerHTML = '<i class="bi bi-x-lg text-sm"></i>';
     deleteBtn.onclick = () => removeCustomCommand(index);
     deleteBtn.title = 'Remove command';

     buttonWrapper.appendChild(button);
     buttonWrapper.appendChild(deleteBtn);
     container.appendChild(buttonWrapper);
   });

   // Also update sidebar custom commands
   updateSidebarCustomCommands();
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

     const requiresSSH = commandRequiresSSH(command);
     const message = requiresSSH ?
       'Custom command added (SSH required)' :
       'Custom command added';
     showToast('Command', message, 'success');
   } else {
     showToast('Command', 'Command already exists in custom commands', 'warning');
   }

   input.value = '';
 }

 function removeCustomCommand(index) {
   if (index >= 0 && index < customCommands.length) {
     const command = customCommands[index];
     customCommands.splice(index, 1);
     localStorage.setItem('customCommands', JSON.stringify(customCommands));
     updateCustomCommandsDisplay();
     showToast('Command', `Removed: ${command}`, 'info');
   }
 }

 // Enhanced command injection with SSH checking
 function injectCommand(command) {
   if (!command || !term) return;

   const requiresSSH = commandRequiresSSH(command);

   if (requiresSSH && !sshConnected) {
     const proceed = confirm(
       `This command requires SSH access, but SSH is currently unavailable.\n\n` +
       `Command: ${command}\n\n` +
       `The command may fail or provide limited results. Continue anyway?`
     );

     if (!proceed) {
       showToast('Command', 'Command cancelled - SSH required', 'warning');
       return;
     }
   }

   // Clear current input and inject the command
   for (let i = 0; i < currentCommand.length; i++) {
     if (socket) socket.emit('terminal_input', '\b');
   }

   if (socket) {
     socket.emit('terminal_input', command);
   }

   currentCommand = command;
   term.focus();

   const statusMessage = requiresSSH && !sshConnected ?
     'Command injected (SSH warning given)' :
     'Command injected';
   showToast('Command', statusMessage, 'info');
 }

 // Enhanced terminal status update
 function updateTerminalStatus(status) {
   const statusElement = document.getElementById('terminalStatus');
   if (!statusElement) return;

   let statusText = '';
   let statusClass = '';
   let iconClass = '';

   switch (status) {
     case CONNECTION_STATES.SSH_CONNECTED:
       statusText = 'SSH Connected';
       statusClass = 'text-green-400';
       iconClass = 'bi-shield-check';
       break;
     case CONNECTION_STATES.CONNECTED:
       statusText = sshConnected ? 'SSH Connected' : 'Socket Connected';
       statusClass = sshConnected ? 'text-green-400' : 'text-blue-400';
       iconClass = sshConnected ? 'bi-shield-check' : 'bi-wifi';
       break;
     case CONNECTION_STATES.CONNECTING:
       statusText = 'Connecting...';
       statusClass = 'text-yellow-400';
       iconClass = 'bi-arrow-repeat animate-spin';
       break;
     case CONNECTION_STATES.ERROR:
       statusText = 'Connection Error';
       statusClass = 'text-red-400';
       iconClass = 'bi-exclamation-triangle';
       break;
     case CONNECTION_STATES.TIMEOUT:
       statusText = 'Connection Timeout';
       statusClass = 'text-orange-400';
       iconClass = 'bi-clock';
       break;
     default:
       statusText = 'Disconnected';
       statusClass = 'text-red-400';
       iconClass = 'bi-x-circle';
   }

   statusElement.className = `flex items-center space-x-2 ${statusClass}`;
   statusElement.innerHTML = `
     <i class="bi ${iconClass}"></i>
     <span class="text-sm font-medium">${statusText}</span>
   `;
 }

 // Update session statistics
 function updateSessionStatistics() {
   const statsElement = document.getElementById('sessionStats');
   if (!statsElement) return;

   const uptime = sessionStartTime ?
     formatDuration((Date.now() - sessionStartTime) / 1000) :
     'Not started';

   statsElement.innerHTML = `
     <div class="flex items-center justify-between text-sm">
       <span class="text-gray-400">Uptime:</span>
       <span class="text-white font-mono">${uptime}</span>
     </div>
     <div class="flex items-center justify-between text-sm">
       <span class="text-gray-400">Commands:</span>
       <span class="text-white font-mono">${commandCount}</span>
     </div>
     <div class="flex items-center justify-between text-sm">
       <span class="text-gray-400">SSH:</span>
       <span class="text-white font-mono ${sshConnected ? 'text-green-400' : 'text-red-400'}">
         ${sshConnected ? 'Available' : 'Unavailable'}
       </span>
     </div>
   `;

   // Update sidebar session info if visible
   updateSidebarSessionInfo();
 }

 // Enhanced terminal log management
 function appendTerminalLog(data) {
   try {
     terminalLog += data;

     // Prevent log from getting too large
     if (terminalLog.length > TERMINAL_CONFIG.MAX_TERMINAL_LOG_SIZE) {
       terminalLog = terminalLog.slice(-TERMINAL_CONFIG.MAX_TERMINAL_LOG_SIZE / 2);
     }

     // Save to session storage periodically
     const logData = {
       log: terminalLog,
       timestamp: Date.now(),
       sshConnected: sshConnected,
       sessionStartTime: sessionStartTime,
       commandCount: commandCount
     };

     sessionStorage.setItem("terminal_log", JSON.stringify(logData));
   } catch (e) {
     console.error("Error appending terminal log:", e);
   }
 }

 function restoreTerminalLog() {
   try {
     const saved = sessionStorage.getItem("terminal_log");
     if (saved) {
       const logData = JSON.parse(saved);

       if (logData.log) {
         terminalLog = logData.log;
         term.write(terminalLog);
       }

       if (logData.sessionStartTime) {
         sessionStartTime = logData.sessionStartTime;
       }

       if (logData.commandCount) {
         commandCount = logData.commandCount;
       }

       updateSessionStatistics();
       console.log('Terminal log restored from session storage');
     }
   } catch (e) {
     console.error("Error restoring terminal log:", e);
   }
 }

 // Utility functions
 function escapeHtml(text) {
   const map = {
     '&': '&amp;',
     '<': '&lt;',
     '>': '&gt;',
     '"': '&quot;',
     "'": '&#039;'
   };
   return text.replace(/[&<>"']/g, (m) => map[m]);
 }

 function confirmAction(message, callback) {
   if (confirmModal) {
     // Use custom modal if available
     confirmModal.show();
     // You would need to wire up the modal buttons to call callback
   } else {
     // Fallback to browser confirm
     if (confirm(message)) {
       callback();
     }
   }
 }

 function showToast(title, message, type = 'info') {
   // Enhanced toast implementation
   console.log(`${type.toUpperCase()}: ${title} - ${message}`);

   // If parent window has showToast function and is not the same window, use it
   if (window.parent && window.parent !== window && window.parent.showToast && typeof window.parent.showToast === 'function') {
     window.parent.showToast(`${title}: ${message}`, type);
     return;
   }

   // Simple fallback implementation
   const toast = document.createElement('div');
   toast.className = `fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white transition-all duration-300 transform translate-x-full`;

   switch (type) {
     case 'success':
       toast.classList.add('bg-green-600');
       break;
     case 'danger':
     case 'error':
       toast.classList.add('bg-red-600');
       break;
     case 'warning':
       toast.classList.add('bg-yellow-600');
       break;
     default:
       toast.classList.add('bg-blue-600');
   }

   toast.innerHTML = `
     <div class="flex items-center">
       <strong class="mr-2">${title}:</strong>
       <span>${message}</span>
     </div>
   `;

   document.body.appendChild(toast);

   // Show toast
   setTimeout(() => {
     toast.classList.remove('translate-x-full');
     toast.classList.add('translate-x-0');
   }, 10);

   // Hide toast after 3 seconds
   setTimeout(() => {
     toast.classList.remove('translate-x-0');
     toast.classList.add('translate-x-full');
     setTimeout(() => {
       if (toast.parentNode) {
         toast.remove();
       }
     }, 300);
   }, 3000);
 }

 // Enhanced fallback mode implementation - DISABLED
 function enableFallbackMode() {
   console.log('Fallback mode disabled to prevent connection loops');
   fallbackMode = false;
   connected = false;
   sshConnected = false;
   
   updateTerminalStatus(CONNECTION_STATES.ERROR);
   
   if (term) {
     term.write('\r\n\x1b[33m⚠ WebSocket connection failed\x1b[0m\r\n');
     term.write('\x1b[2mPlease refresh the page to reconnect\x1b[0m\r\n\r\n');
   }
 }

 function startHTTPFallback() {
   // HTTP fallback disabled to prevent connection loops
   console.log('HTTP fallback polling disabled');
 }

 function disableFallbackMode() {
   console.log('Disabling HTTP fallback mode');
   fallbackMode = false;
   
   if (httpFallbackInterval) {
     clearInterval(httpFallbackInterval);
     httpFallbackInterval = null;
   }
 }

 // Enhanced connection recovery
 function attemptConnectionRecovery() {
   if (fallbackMode) {
     disableFallbackMode();
   }
   
   // Clean up existing socket
   if (socket) {
     socket.removeAllListeners();
     socket.disconnect();
     socket = null;
   }
   
   // Clear intervals
   if (connectionCheckInterval) clearInterval(connectionCheckInterval);
   if (keepAliveInterval) clearInterval(keepAliveInterval);
   
   // Reset state
   connected = false;
   sshConnected = false;
   reconnecting = false;
   
   // Reinitialize after delay
   setTimeout(() => {
     initializeSocketIO();
     initializeConnectionMonitoring();
   }, 5000);
 }

 // Cleanup on page unload
 window.addEventListener('beforeunload', () => {
   console.log('Cleaning up terminal resources');

   try {
     // Clear all intervals
     if (connectionCheckInterval) {
       clearInterval(connectionCheckInterval);
       connectionCheckInterval = null;
     }

     if (keepAliveInterval) {
       clearInterval(keepAliveInterval);
       keepAliveInterval = null;
     }
     
     if (httpFallbackInterval) {
       clearInterval(httpFallbackInterval);
       httpFallbackInterval = null;
     }

     // Clear any pending timeouts
     if (window._terminalTimeouts) {
       window._terminalTimeouts.forEach(timeout => clearTimeout(timeout));
     }

     // Properly cleanup terminal
     if (term) {
       try {
         term.dispose();
       } catch (e) {
         console.error('Error disposing terminal:', e);
       }
     }

     // Disconnect socket properly
     if (socket) {
       try {
         socket.removeAllListeners();
         socket.disconnect();
       } catch (e) {
         console.error('Error disconnecting socket:', e);
       }
     }

     // Save current state
     try {
       appendTerminalLog(''); // Force save current log state
     } catch (e) {
       console.error('Error saving terminal log:', e);
     }
   } catch (error) {
     console.error('Error during terminal cleanup:', error);
   }
 });

 // Additional cleanup for page navigation
 window.addEventListener('pagehide', () => {
   console.log('Page hide event - cleaning up');
   try {
     if (socket && socket.connected) {
       socket.disconnect();
     }
   } catch (e) {
     console.error('Error on pagehide:', e);
   }
 });

 // Export functions for global access
 window.toggleCommandCategories = toggleCommandCategories;
 window.toggleTerminalAssistant = toggleTerminalAssistant;
 window.clearTerminal = clearTerminal;
 window.copyTerminalContent = copyTerminalContent;
 window.toggleFullscreen = toggleFullscreen;
 window.reconnectTerminal = reconnectTerminal;
 window.resetTerminal = resetTerminal;
 window.clearHistory = clearHistory;
 window.saveHistoryToFile = saveHistoryToFile;
 window.addCustomCommand = addCustomCommand;
 window.removeCustomCommand = removeCustomCommand;
 window.injectCommand = injectCommand;
 window.toggleSection = toggleSection;
 window.showCommandTab = showCommandTab;
 window.attemptConnectionRecovery = attemptConnectionRecovery;
 window.enableFallbackMode = enableFallbackMode;
 window.connectToSSH = connectToSSH;

 console.log("Enhanced Terminal.js with SSH support loaded successfully");