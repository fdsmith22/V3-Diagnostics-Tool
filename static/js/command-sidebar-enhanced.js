// Command Sidebar Enhanced - Search and Favorites functionality
(function() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCommandSidebar);
    } else {
        // Small delay to ensure command sidebar is loaded
        setTimeout(initCommandSidebar, 100);
    }
    
    function initCommandSidebar() {
        console.log('Initializing Command Sidebar Enhanced...');
        
        // Initialize favorites from localStorage
        let favorites = JSON.parse(localStorage.getItem('commandFavorites') || '[]');
        
        // Initialize favorite buttons for existing command items
        function initializeFavoriteButtons() {
            const favoriteButtons = document.querySelectorAll('.favorite-btn');
            
            favoriteButtons.forEach(btn => {
                // Get the associated command item
                const wrapper = btn.closest('.command-wrapper');
                if (!wrapper) return;
                
                const commandItem = wrapper.querySelector('.command-item');
                if (!commandItem) return;
                
                const command = commandItem.getAttribute('data-command');
                const label = commandItem.textContent;
                
                // Set initial state based on stored favorites
                if (favorites.some(fav => fav.command === command)) {
                    btn.querySelector('i').textContent = 'star';
                    btn.classList.add('active');
                    btn.title = 'Remove from favorites';
                }
                
                // Add click handler
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(commandItem, btn);
                });
            });
            
            // Add click handlers to command items
            document.querySelectorAll('.command-item').forEach(item => {
                item.addEventListener('click', handleCommandClick);
            });
        }
        
        // Toggle favorite status
        function toggleFavorite(commandBtn, favBtn) {
            const command = commandBtn.getAttribute('data-command');
            const label = commandBtn.textContent;
            const category = commandBtn.getAttribute('data-category') || 'Uncategorized';
            
            const favIndex = favorites.findIndex(fav => fav.command === command);
            
            if (favIndex > -1) {
                // Remove from favorites
                favorites.splice(favIndex, 1);
                favBtn.querySelector('i').textContent = 'star_border';
                favBtn.classList.remove('active');
                favBtn.title = 'Add to favorites';
            } else {
                // Add to favorites
                favorites.push({ command, label, category });
                favBtn.querySelector('i').textContent = 'star';
                favBtn.classList.add('active');
                favBtn.title = 'Remove from favorites';
            }
            
            // Save to localStorage
            localStorage.setItem('commandFavorites', JSON.stringify(favorites));
            
            // Update favorites section
            updateFavoritesSection();
            
            console.log('Favorites updated:', favorites);
        }
        
        // Update favorites section
        function updateFavoritesSection() {
            const favoritesSection = document.getElementById('favoritesSection');
            const favoritesList = document.getElementById('favoritesList');
            
            if (!favoritesList) return;
            
            // Clear current favorites
            favoritesList.innerHTML = '';
            
            if (favorites.length > 0) {
                favoritesSection.style.display = 'block';
                
                favorites.forEach(fav => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'command-wrapper';
                    
                    const cmd = document.createElement('button');
                    cmd.className = 'command-item';
                    cmd.setAttribute('data-command', fav.command);
                    cmd.setAttribute('data-category', fav.category);
                    cmd.textContent = fav.label;
                    
                    const favBtn = document.createElement('button');
                    favBtn.className = 'favorite-btn active';
                    favBtn.title = 'Remove from favorites';
                    favBtn.innerHTML = '<i class="material-icons">star</i>';
                    
                    wrapper.appendChild(cmd);
                    wrapper.appendChild(favBtn);
                    favoritesList.appendChild(wrapper);
                    
                    // Add click handlers
                    cmd.addEventListener('click', handleCommandClick);
                    favBtn.addEventListener('click', function() {
                        toggleFavorite(cmd, favBtn);
                        // Also update the original button
                        updateOriginalButton(fav.command, false);
                    });
                });
            } else {
                favoritesSection.style.display = 'none';
            }
        }
        
        // Update original button when favorite is toggled from favorites section
        function updateOriginalButton(command, isFavorite) {
            // Escape special characters in command for CSS selector
            const escapedCommand = command.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
            const allCommands = document.querySelectorAll(`.command-item[data-command="${escapedCommand}"]`);
            
            allCommands.forEach(cmd => {
                if (cmd.closest('#favoritesList')) return; // Skip favorites list itself
                
                const wrapper = cmd.closest('.command-wrapper');
                if (wrapper) {
                    const favBtn = wrapper.querySelector('.favorite-btn');
                    if (favBtn) {
                        favBtn.querySelector('i').textContent = isFavorite ? 'star' : 'star_border';
                        favBtn.classList.toggle('active', isFavorite);
                        favBtn.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
                    }
                }
            });
        }
        
        // Search functionality
        const searchInput = document.getElementById('commandSearch');
        const clearSearchBtn = document.getElementById('clearSearch');
        
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase();
                filterCommands(searchTerm);
                
                // Show/hide clear button
                if (clearSearchBtn) {
                    clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
                }
            });
        }
        
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function() {
                if (searchInput) {
                    searchInput.value = '';
                    filterCommands('');
                }
                this.style.display = 'none';
            });
            
            // Initially hide clear button
            clearSearchBtn.style.display = 'none';
        }
        
        function filterCommands(searchTerm) {
            const accordionItems = document.querySelectorAll('.accordion-item');
            
            accordionItems.forEach(item => {
                // Skip favorites section from filtering
                if (item.id === 'favoritesSection') return;
                
                const commandWrappers = item.querySelectorAll('.command-wrapper');
                let hasVisibleCommands = false;
                
                commandWrappers.forEach(wrapper => {
                    const cmd = wrapper.querySelector('.command-item');
                    if (cmd) {
                        const label = cmd.textContent.toLowerCase();
                        const command = (cmd.getAttribute('data-command') || '').toLowerCase();
                        
                        // Search in both label and command
                        const matches = label.includes(searchTerm) || command.includes(searchTerm);
                        
                        wrapper.style.display = matches ? 'flex' : 'none';
                        if (matches) hasVisibleCommands = true;
                    }
                });
                
                // Hide entire category if no commands match
                item.style.display = hasVisibleCommands || !searchTerm ? 'block' : 'none';
                
                // Expand categories with matches
                if (hasVisibleCommands && searchTerm) {
                    const collapseElement = item.querySelector('.accordion-collapse');
                    if (collapseElement && !collapseElement.classList.contains('show')) {
                        // Use Bootstrap's collapse API if available
                        if (typeof bootstrap !== 'undefined') {
                            const bsCollapse = new bootstrap.Collapse(collapseElement, { show: true });
                        } else {
                            collapseElement.classList.add('show');
                            const button = item.querySelector('.accordion-button');
                            if (button) button.classList.remove('collapsed');
                        }
                    }
                }
            });
        }
        
        // Handle command click (for both regular and favorite commands)
        function handleCommandClick(e) {
            e.preventDefault();
            const command = this.getAttribute('data-command');
            if (command) {
                // Copy to clipboard
                navigator.clipboard.writeText(command).then(() => {
                    // Visual feedback
                    const originalText = this.textContent;
                    const originalBg = this.style.backgroundColor;
                    this.textContent = '✓ Copied!';
                    this.style.backgroundColor = '#28a745';
                    
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.backgroundColor = originalBg;
                    }, 1000);
                    
                    // Show notification
                    showNotification('Command copied to clipboard. Paste in terminal to execute.');
                }).catch(err => {
                    console.error('Failed to copy command:', err);
                    alert('Failed to copy command to clipboard');
                });
            }
        }
        
        function showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'alert alert-success position-fixed bottom-0 end-0 m-3';
            notification.style.zIndex = '9999';
            notification.innerHTML = `<small>${message}</small>`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
        
        // Initialize everything
        initializeFavoriteButtons();
        updateFavoritesSection();
        
        console.log('Command Sidebar Enhanced initialized successfully');
        console.log('Found', document.querySelectorAll('.command-item').length, 'command items');
        console.log('Found', document.querySelectorAll('.favorite-btn').length, 'favorite buttons');
        console.log('Loaded', favorites.length, 'favorites from localStorage');
    }
})();