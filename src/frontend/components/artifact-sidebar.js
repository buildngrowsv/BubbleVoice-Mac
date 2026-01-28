/**
 * ARTIFACT SIDEBAR COMPONENT
 * 
 * Purpose:
 * Displays artifacts in a dedicated sidebar panel on the right side of the screen.
 * This keeps artifacts visually separate from the conversation flow, preventing
 * confusion with inline content.
 * 
 * PRODUCT CONTEXT:
 * Per PRODUCT_INTENT.md, artifacts should appear in a "center panel" while
 * "conversation continues in right panel". This component provides that separation
 * by displaying artifacts in a collapsible sidebar that slides in from the right.
 * 
 * WHY THIS APPROACH:
 * - Originally artifacts were rendered inline with messages
 * - This caused visual confusion when artifact HTML contained sidebar-like UI
 * - A dedicated sidebar clearly separates artifacts from conversation
 * - Matches how Claude and ChatGPT handle artifact display
 * 
 * Features:
 * - Slides in from right when artifact is generated
 * - Collapsible to minimize when not needed
 * - Shows artifact in isolated iframe for security
 * - Export options (PNG, PDF, HTML)
 * - History of artifacts from current conversation
 * 
 * Design:
 * - Liquid glass styling consistent with app aesthetic
 * - Smooth slide-in/out animations
 * - Clear visual hierarchy with header and content area
 * - Accessible with keyboard navigation
 * 
 * Created: 2026-01-27
 * Fixes: Duplicate sidebar appearance when artifacts contain sidebar-like HTML
 */

class ArtifactSidebar {
    /**
     * Constructor
     * 
     * Initializes the artifact sidebar component.
     * Creates DOM structure and sets up event listeners.
     */
    constructor() {
        // State management
        // Tracks whether sidebar is open and what artifacts are displayed
        this.isOpen = false;
        this.currentArtifact = null;
        this.artifactHistory = [];
        
        // DOM element reference
        this.element = null;
        
        // Create the sidebar
        this.render();
        
        // Inject into page
        this.injectIntoPage();
        
        console.log('[ArtifactSidebar] Initialized');
    }

    /**
     * Render Sidebar
     * 
     * Creates the sidebar DOM structure with header, content area, and toolbar.
     * Uses liquid glass styling for visual consistency.
     */
    render() {
        // Create main container
        this.element = document.createElement('div');
        this.element.className = 'artifact-sidebar';
        this.element.id = 'artifact-sidebar';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Artifact panel');
        this.element.setAttribute('aria-hidden', 'true');

        // Build inner HTML with semantic structure
        this.element.innerHTML = `
            <!-- Resize handle on left edge -->
            <div class="artifact-sidebar-resize-handle" 
                 id="artifact-resize-handle"
                 title="Drag to resize"
                 aria-label="Resize artifact panel"></div>
            
            <!-- Header with title and controls -->
            <div class="artifact-sidebar-header">
                <div class="artifact-sidebar-title">
                    <span class="artifact-sidebar-icon">📊</span>
                    <span class="artifact-sidebar-name">Artifact</span>
                    <span class="artifact-sidebar-type" id="artifact-type-badge"></span>
                </div>
                <div class="artifact-sidebar-actions">
                    <!-- Minimize button - collapses to thin strip -->
                    <button class="artifact-sidebar-button" 
                            id="minimize-artifact-btn"
                            title="Minimize (Esc)"
                            aria-label="Minimize artifact panel">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <!-- Close button - hides completely -->
                    <button class="artifact-sidebar-button"
                            id="close-artifact-btn"
                            title="Close"
                            aria-label="Close artifact panel">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Main content area with iframe -->
            <div class="artifact-sidebar-content" id="artifact-sidebar-content">
                <!-- Empty state shown when no artifact -->
                <div class="artifact-empty-state" id="artifact-empty-state">
                    <div class="empty-icon">✨</div>
                    <div class="empty-title">No Artifact Yet</div>
                    <div class="empty-subtitle">Artifacts will appear here when the AI creates visualizations for you</div>
                </div>
                
                <!-- Artifact iframe - hidden until artifact is loaded -->
                <iframe class="artifact-sidebar-iframe"
                        id="artifact-sidebar-iframe"
                        sandbox="allow-same-origin"
                        title="Artifact content"
                        style="display: none;">
                </iframe>
            </div>

            <!-- Toolbar with export options -->
            <div class="artifact-sidebar-toolbar" id="artifact-sidebar-toolbar">
                <button class="artifact-toolbar-btn" data-action="export-png" title="Export as PNG">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="5.5" cy="5.5" r="1" fill="currentColor"/>
                        <path d="M12 10l-2-2-2 2-2-2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>PNG</span>
                </button>
                <button class="artifact-toolbar-btn" data-action="export-html" title="Export as HTML">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6l-2 2 2 2M12 6l2 2-2 2M10 3l-4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>HTML</span>
                </button>
                <button class="artifact-toolbar-btn" data-action="fullscreen" title="View fullscreen">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Full</span>
                </button>
            </div>

            <!-- History strip - shows previous artifacts -->
            <div class="artifact-sidebar-history" id="artifact-sidebar-history">
                <!-- History items will be populated dynamically -->
            </div>
        `;

        // Set up event listeners
        this.setupEventListeners();

        return this.element;
    }

    /**
     * Inject Into Page
     * 
     * Adds the sidebar to the DOM in the correct location.
     * Should be a sibling of the main content, positioned on the right.
     * Also creates the floating toggle button for reopening closed sidebar.
     */
    injectIntoPage() {
        // Insert at end of body, will be positioned with CSS
        document.body.appendChild(this.element);

        // Create floating toggle button for reopening closed sidebar
        // WHY: User needs a way to reopen the artifact sidebar after closing it
        // DESIGN: Similar to the chat sidebar's floating toggle button
        this.floatingToggle = document.createElement('button');
        this.floatingToggle.className = 'artifact-toggle-floating';
        this.floatingToggle.id = 'artifact-toggle-floating';
        this.floatingToggle.setAttribute('title', 'Show Artifact Panel');
        this.floatingToggle.setAttribute('aria-label', 'Show artifact panel');
        this.floatingToggle.innerHTML = `
            <span class="artifact-toggle-icon">📊</span>
            <span class="artifact-toggle-label">Artifact</span>
        `;
        
        // Add click handler to open sidebar
        this.floatingToggle.addEventListener('click', () => {
            if (this.currentArtifact || this.artifactHistory.length > 0) {
                this.open();
            }
        });
        
        // Initially hidden (shown only when sidebar closed and has content)
        this.floatingToggle.style.display = 'none';
        
        document.body.appendChild(this.floatingToggle);
    }

    /**
     * Setup Event Listeners
     * 
     * Attaches handlers for close, minimize, export, and resize actions.
     */
    setupEventListeners() {
        // Close button - hides sidebar completely
        const closeBtn = this.element.querySelector('#close-artifact-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Minimize button - collapses to thin strip
        const minimizeBtn = this.element.querySelector('#minimize-artifact-btn');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.minimize());
        }

        // Export buttons
        const toolbar = this.element.querySelector('#artifact-sidebar-toolbar');
        if (toolbar) {
            toolbar.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.currentTarget.getAttribute('data-action');
                    this.handleExport(action);
                });
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape closes the sidebar
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Resize handle - drag to resize sidebar width
        this.setupResizeHandler();
    }

    /**
     * Setup Resize Handler
     * 
     * Implements drag-to-resize functionality for the sidebar.
     * Users can drag the left edge to change the sidebar width.
     * 
     * IMPLEMENTATION:
     * - mousedown on resize handle starts resize
     * - mousemove updates width in real-time
     * - mouseup ends resize
     * - Updates CSS custom property for layout adjustments
     * 
     * DEFAULT SIZE: 2/3 of viewport (66.67%) per user request
     * MIN SIZE: 300px (for usability)
     * MAX SIZE: 85% of viewport
     * 
     * FIX (2026-01-27): User reported resize wasn't working.
     * - Increased handle width from 6px to 12px
     * - Added better visual feedback
     * - Fixed event listener binding
     */
    setupResizeHandler() {
        const resizeHandle = this.element.querySelector('#artifact-resize-handle');
        if (!resizeHandle) {
            console.warn('[ArtifactSidebar] Resize handle not found');
            return;
        }

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        // Store reference to this for event handlers
        const sidebar = this;

        // Mouse down - start resize
        const handleMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.element.offsetWidth;
            
            // Add visual feedback
            resizeHandle.classList.add('dragging');
            document.body.classList.add('artifact-sidebar-resizing');
            
            console.log('[ArtifactSidebar] Resize started at width:', startWidth);
        };

        // Mouse move - update width (attached to document for smooth dragging)
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            e.preventDefault();
            
            // Calculate new width (dragging left increases width, right decreases)
            const deltaX = startX - e.clientX;
            const minWidth = 300;
            const maxWidth = window.innerWidth * 0.85;
            const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
            
            // Update sidebar width
            sidebar.element.style.width = `${newWidth}px`;
            
            // Update CSS custom property for layout adjustments
            document.documentElement.style.setProperty('--artifact-sidebar-width', `${newWidth}px`);
        };

        // Mouse up - end resize
        const handleMouseUp = () => {
            if (!isResizing) return;
            
            isResizing = false;
            resizeHandle.classList.remove('dragging');
            document.body.classList.remove('artifact-sidebar-resizing');
            
            // Save the width preference
            const finalWidth = sidebar.element.offsetWidth;
            localStorage.setItem('artifactSidebarWidth', finalWidth);
            
            console.log('[ArtifactSidebar] Resize ended, width:', finalWidth);
        };

        // Attach event listeners
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Also support touch events for mobile/tablet
        resizeHandle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            handleMouseDown({ 
                clientX: touch.clientX, 
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation()
            });
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;
            const touch = e.touches[0];
            handleMouseMove({ clientX: touch.clientX, preventDefault: () => {} });
        }, { passive: false });

        document.addEventListener('touchend', handleMouseUp);

        // Set initial width - use saved width or default to 66.67% of viewport
        const savedWidth = localStorage.getItem('artifactSidebarWidth');
        if (savedWidth) {
            const width = parseInt(savedWidth, 10);
            const minWidth = 300;
            const maxWidth = window.innerWidth * 0.85;
            if (width >= minWidth && width <= maxWidth) {
                this.element.style.width = `${width}px`;
                document.documentElement.style.setProperty('--artifact-sidebar-width', `${width}px`);
                console.log('[ArtifactSidebar] Restored saved width:', width);
            }
        } else {
            // Default: 2/3 of viewport
            const defaultWidth = Math.round(window.innerWidth * 0.6667);
            this.element.style.width = `${defaultWidth}px`;
            document.documentElement.style.setProperty('--artifact-sidebar-width', `${defaultWidth}px`);
            console.log('[ArtifactSidebar] Using default width (66.67%):', defaultWidth);
        }

        console.log('[ArtifactSidebar] Resize handler setup complete');
    }

    /**
     * Show Artifact
     * 
     * Opens the sidebar and displays the given artifact.
     * This is the main entry point for showing artifacts.
     * 
     * @param {Object} artifact - Artifact data from backend
     * @param {string} artifact.artifact_id - Unique ID
     * @param {string} artifact.artifact_type - Type (mindmap, stress_map, etc.)
     * @param {string} artifact.html - HTML content to display
     * @param {Object} [artifact.data] - Optional JSON data
     */
    showArtifact(artifact) {
        console.log('[ArtifactSidebar] Showing artifact:', artifact.artifact_type || artifact.type);

        // Store current artifact
        this.currentArtifact = artifact;

        // Add to history
        this.addToHistory(artifact);

        // Update type badge
        const typeBadge = this.element.querySelector('#artifact-type-badge');
        const artifactType = artifact.artifact_type || artifact.type || 'artifact';
        if (typeBadge) {
            typeBadge.textContent = this.getReadableName(artifactType);
        }

        // Update icon based on type
        const iconSpan = this.element.querySelector('.artifact-sidebar-icon');
        if (iconSpan) {
            iconSpan.textContent = this.getIconForType(artifactType);
        }

        // Load content into iframe
        const iframe = this.element.querySelector('#artifact-sidebar-iframe');
        const emptyState = this.element.querySelector('#artifact-empty-state');
        const htmlContent = artifact.html || artifact.content || '';

        if (iframe && htmlContent) {
            // Hide empty state, show iframe
            if (emptyState) emptyState.style.display = 'none';
            iframe.style.display = 'block';

            // Load HTML into iframe
            this.loadIframeContent(iframe, htmlContent);
        }

        // Open the sidebar
        this.open();
    }

    /**
     * Load Iframe Content
     * 
     * Safely loads HTML content into the artifact iframe.
     * Uses srcdoc for security and to avoid cross-origin issues.
     * 
     * @param {HTMLIFrameElement} iframe - Target iframe
     * @param {string} htmlContent - HTML to load
     */
    loadIframeContent(iframe, htmlContent) {
        // Use srcdoc for cleaner loading
        iframe.srcdoc = htmlContent;

        // Adjust height after content loads
        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc && doc.body) {
                    // Set iframe height to content height (with max limit)
                    const contentHeight = doc.documentElement.scrollHeight;
                    iframe.style.height = `${Math.min(contentHeight, 600)}px`;
                }
            } catch (e) {
                // Cross-origin or other error - use default height
                console.warn('[ArtifactSidebar] Could not auto-size iframe:', e.message);
            }
        };
    }

    /**
     * Open Sidebar
     * 
     * Makes the sidebar visible with animation.
     * Also hides the floating toggle button since sidebar is now visible.
     */
    open() {
        this.isOpen = true;
        this.element.classList.add('open');
        this.element.classList.remove('minimized');
        this.element.setAttribute('aria-hidden', 'false');
        
        // Add class to body for layout adjustment
        document.body.classList.add('artifact-sidebar-open');
        
        // Hide the floating toggle when sidebar is open
        // WHY: Toggle is only needed when sidebar is closed
        if (this.floatingToggle) {
            this.floatingToggle.style.display = 'none';
        }
        
        console.log('[ArtifactSidebar] Opened');
    }

    /**
     * Close Sidebar
     * 
     * Hides the sidebar completely.
     * Shows the floating toggle button if there's artifact content to view.
     * 
     * FEATURE (2026-01-27): User requested a way to reopen the sidebar after closing.
     * The floating toggle appears on the right edge when artifacts are available.
     */
    close() {
        this.isOpen = false;
        this.element.classList.remove('open', 'minimized');
        this.element.setAttribute('aria-hidden', 'true');
        
        // Remove body class
        document.body.classList.remove('artifact-sidebar-open');
        
        // Show the floating toggle if there's artifact content to view
        // WHY: User needs a way to reopen the sidebar to view artifacts again
        // ONLY show if there's actual artifact content (current or history)
        if (this.floatingToggle) {
            const hasContent = this.currentArtifact || this.artifactHistory.length > 0;
            this.floatingToggle.style.display = hasContent ? 'flex' : 'none';
            
            // Update the icon to match the current/last artifact type
            if (hasContent) {
                const artifact = this.currentArtifact || this.artifactHistory[0];
                const type = artifact.artifact_type || artifact.type || 'artifact';
                const iconSpan = this.floatingToggle.querySelector('.artifact-toggle-icon');
                if (iconSpan) {
                    iconSpan.textContent = this.getIconForType(type);
                }
            }
        }
        
        console.log('[ArtifactSidebar] Closed');
    }

    /**
     * Minimize Sidebar
     * 
     * Collapses sidebar to a thin strip showing just the type badge.
     * User can click to expand again.
     */
    minimize() {
        this.element.classList.add('minimized');
        this.element.classList.remove('open');
        
        console.log('[ArtifactSidebar] Minimized');
    }

    /**
     * Toggle Sidebar
     * 
     * Switches between open and closed states.
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Add To History
     * 
     * Adds an artifact to the history strip for quick access.
     * 
     * @param {Object} artifact - Artifact to add
     */
    addToHistory(artifact) {
        // Avoid duplicates
        const existingIndex = this.artifactHistory.findIndex(
            a => a.artifact_id === artifact.artifact_id
        );
        
        if (existingIndex >= 0) {
            // Move to front
            this.artifactHistory.splice(existingIndex, 1);
        }
        
        // Add to front
        this.artifactHistory.unshift(artifact);
        
        // Limit history to 10 items
        if (this.artifactHistory.length > 10) {
            this.artifactHistory = this.artifactHistory.slice(0, 10);
        }
        
        // Update history UI
        this.updateHistoryUI();
    }

    /**
     * Update History UI
     * 
     * Renders the history strip with artifact thumbnails.
     */
    updateHistoryUI() {
        const historyContainer = this.element.querySelector('#artifact-sidebar-history');
        if (!historyContainer) return;

        // Only show if we have more than one artifact
        if (this.artifactHistory.length <= 1) {
            historyContainer.style.display = 'none';
            return;
        }

        historyContainer.style.display = 'flex';
        historyContainer.innerHTML = this.artifactHistory.map((artifact, index) => {
            const type = artifact.artifact_type || artifact.type || 'artifact';
            const icon = this.getIconForType(type);
            const isActive = index === 0 ? 'active' : '';
            
            return `
                <button class="history-item ${isActive}"
                        data-index="${index}"
                        title="${this.getReadableName(type)}"
                        aria-label="View ${this.getReadableName(type)} artifact">
                    <span class="history-icon">${icon}</span>
                </button>
            `;
        }).join('');

        // Add click handlers
        historyContainer.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.getAttribute('data-index'));
                if (this.artifactHistory[index]) {
                    this.showArtifact(this.artifactHistory[index]);
                }
            });
        });
    }

    /**
     * Handle Export
     * 
     * Handles export button clicks.
     * 
     * @param {string} action - Export action (export-png, export-html, fullscreen)
     */
    async handleExport(action) {
        if (!this.currentArtifact) {
            console.warn('[ArtifactSidebar] No artifact to export');
            return;
        }

        console.log('[ArtifactSidebar] Export action:', action);

        try {
            switch (action) {
                case 'export-png':
                    // TODO: Implement with html2canvas
                    alert('PNG export coming soon');
                    break;

                case 'export-html':
                    this.exportAsHTML();
                    break;

                case 'fullscreen':
                    this.openFullscreen();
                    break;
            }
        } catch (error) {
            console.error('[ArtifactSidebar] Export failed:', error);
        }
    }

    /**
     * Export As HTML
     * 
     * Downloads the artifact HTML as a file.
     */
    exportAsHTML() {
        const htmlContent = this.currentArtifact.html || this.currentArtifact.content;
        if (!htmlContent) return;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentArtifact.artifact_id || 'artifact'}.html`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        console.log('[ArtifactSidebar] Exported as HTML');
    }

    /**
     * Open Fullscreen
     * 
     * Opens the artifact in a new window/tab for fullscreen viewing.
     */
    openFullscreen() {
        const htmlContent = this.currentArtifact.html || this.currentArtifact.content;
        if (!htmlContent) return;

        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(htmlContent);
            newWindow.document.close();
        }
    }

    /**
     * Get Icon For Type
     * 
     * Returns an emoji icon based on artifact type.
     * 
     * @param {string} type - Artifact type
     * @returns {string} Emoji icon
     */
    getIconForType(type) {
        const icons = {
            stress_map: '📊',
            checklist: '✅',
            reflection_summary: '📝',
            goal_tracker: '🎯',
            comparison_card: '⚖️',
            timeline: '📅',
            decision_matrix: '🎲',
            progress_chart: '📈',
            mindmap: '🧠',
            celebration_card: '🎉',
            infographic: '📊'
        };
        
        return icons[type] || '📄';
    }

    /**
     * Get Readable Name
     * 
     * Converts artifact type to human-readable name.
     * 
     * @param {string} type - Artifact type
     * @returns {string} Readable name
     */
    getReadableName(type) {
        const names = {
            stress_map: 'Stress Map',
            checklist: 'Checklist',
            reflection_summary: 'Reflection',
            goal_tracker: 'Goal Tracker',
            comparison_card: 'Comparison',
            timeline: 'Timeline',
            decision_matrix: 'Decision Matrix',
            progress_chart: 'Progress Chart',
            mindmap: 'Mind Map',
            celebration_card: 'Celebration',
            infographic: 'Infographic'
        };
        
        return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Clear All
     * 
     * Clears current artifact and history.
     * Called when switching conversations.
     * Also hides the floating toggle since there's no content to show.
     */
    clearAll() {
        this.currentArtifact = null;
        this.artifactHistory = [];
        
        // Reset UI
        const iframe = this.element.querySelector('#artifact-sidebar-iframe');
        const emptyState = this.element.querySelector('#artifact-empty-state');
        
        if (iframe) {
            iframe.srcdoc = '';
            iframe.style.display = 'none';
        }
        if (emptyState) {
            emptyState.style.display = 'flex';
        }
        
        this.updateHistoryUI();
        
        // Close sidebar (don't show floating toggle since there's no content)
        this.isOpen = false;
        this.element.classList.remove('open', 'minimized');
        this.element.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('artifact-sidebar-open');
        
        // Hide floating toggle - no content to show
        if (this.floatingToggle) {
            this.floatingToggle.style.display = 'none';
        }
        
        console.log('[ArtifactSidebar] Cleared all');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArtifactSidebar;
}

console.log('[ArtifactSidebar] Class loaded');
