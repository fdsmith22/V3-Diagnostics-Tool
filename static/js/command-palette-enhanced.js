// Enhanced Command Palette with Delayed Hover Tooltips
(function() {
    // Configuration
    const HOVER_DELAY = 1000; // 1 second delay before showing command
    const hoverTimers = new Map(); // Store timers for each button
    const originalTexts = new Map(); // Store original button texts
    
    function initCommandPaletteEnhancements() {
        // Get all command items
        const commandItems = document.querySelectorAll('.command-item');
        
        commandItems.forEach(item => {
            const command = item.getAttribute('data-command');
            if (!command) return;
            
            // Store the original description text
            originalTexts.set(item, item.textContent);
            
            // Add mouseenter event for delayed hover
            item.addEventListener('mouseenter', function() {
                // Clear any existing timer for this button
                if (hoverTimers.has(item)) {
                    clearTimeout(hoverTimers.get(item));
                }
                
                // Set a new timer for delayed hover
                const timerId = setTimeout(() => {
                    // Show the actual command
                    showCommand(item, command);
                    hoverTimers.delete(item);
                }, HOVER_DELAY);
                
                hoverTimers.set(item, timerId);
            });
            
            // Add mouseleave event to restore original text
            item.addEventListener('mouseleave', function() {
                // Clear the timer if mouse leaves before delay
                if (hoverTimers.has(item)) {
                    clearTimeout(hoverTimers.get(item));
                    hoverTimers.delete(item);
                }
                
                // Restore the original description
                restoreDescription(item);
            });
            
            // Add visual indicator that button has hover functionality
            item.style.transition = 'all 0.3s ease';
        });
    }
    
    function showCommand(button, command) {
        // Store current state
        button.dataset.showingCommand = 'true';
        
        // Change the button text to show the command
        button.innerHTML = `
            <span style="font-family: 'Courier New', monospace; font-size: 0.85em; color: #00ff00;">
                $ ${escapeHtml(command)}
            </span>
        `;
        
        // Add visual styling to indicate command is being shown
        button.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        button.style.borderColor = '#00ff00';
    }
    
    function restoreDescription(button) {
        // Only restore if we're currently showing the command
        if (button.dataset.showingCommand === 'true') {
            button.textContent = originalTexts.get(button) || button.textContent;
            button.dataset.showingCommand = 'false';
            
            // Restore original styling
            button.style.backgroundColor = '';
            button.style.borderColor = '';
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Alternative implementation using CSS tooltips (can be toggled)
    function addTooltips() {
        const style = document.createElement('style');
        style.textContent = `
            .command-item {
                position: relative;
            }
            
            .command-item::after {
                content: attr(data-command);
                position: absolute;
                bottom: 100%;
                left: 0;
                right: 0;
                background: #1a1a1a;
                color: #00ff00;
                padding: 8px 12px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
                font-size: 0.85em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s, visibility 0.3s;
                transition-delay: 0s;
                z-index: 1000;
                border: 1px solid #00ff00;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                pointer-events: none;
            }
            
            .command-item:hover::after {
                opacity: 1;
                visibility: visible;
                transition-delay: ${HOVER_DELAY}ms;
            }
            
            .command-item::before {
                content: '';
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 6px solid #00ff00;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s, visibility 0.3s;
                transition-delay: 0s;
                z-index: 1001;
            }
            
            .command-item:hover::before {
                opacity: 1;
                visibility: visible;
                transition-delay: ${HOVER_DELAY}ms;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCommandPaletteEnhancements);
    } else {
        initCommandPaletteEnhancements();
    }
    
    // Re-initialize when new command items are added dynamically
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('command-item')) {
                        initCommandPaletteEnhancements();
                    }
                });
            }
        });
    });
    
    // Observe the command sidebar for changes
    const commandSidebar = document.getElementById('commandSidebar');
    if (commandSidebar) {
        observer.observe(commandSidebar, { childList: true, subtree: true });
    }
    
    // Export functions for external use
    window.CommandPaletteEnhanced = {
        init: initCommandPaletteEnhancements,
        showCommand: showCommand,
        restoreDescription: restoreDescription,
        addTooltips: addTooltips,
        setHoverDelay: (delay) => { HOVER_DELAY = delay; }
    };
})();