/**
 * LIFE AREAS SIDEBAR COMPONENT
 * 
 * Purpose:
 * Displays the hierarchical Life Areas structure in a collapsible sidebar.
 * Allows users to browse, search, and navigate their personal knowledge tree.
 * 
 * Features:
 * - Tree view with expand/collapse
 * - Search/filter areas
 * - Entry count badges
 * - Last activity timestamps
 * - Click to view area details
 * - Create new areas
 * 
 * Design:
 * - Liquid glass styling
 * - Smooth animations
 * - Keyboard navigation
 * - Responsive layout
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

class LifeAreasSidebar {
    /**
     * Constructor
     * 
     * Initializes the life areas sidebar component.
     */
    constructor() {
        this.isOpen = false;
        this.areas = [];
        this.filteredAreas = [];
        this.expandedAreas = new Set();
        
        this.element = null;
        this.render();
        
        console.log('[LifeAreasSidebar] Initialized');
    }

    /**
     * Render Sidebar
     * 
     * Creates the sidebar DOM structure.
     */
    render() {
        // Create sidebar container
        this.element = document.createElement('div');
        this.element.className = 'life-areas-sidebar collapsed';
        this.element.id = 'life-areas-sidebar';
        this.element.setAttribute('role', 'navigation');
        this.element.setAttribute('aria-label', 'Life areas navigation');

        // Header
        const header = document.createElement('div');
        header.className = 'sidebar-header';
        header.innerHTML = `
            <h2 class="sidebar-title">Life Areas</h2>
            <button class="new-area-button"
                    id="new-area-button"
                    title="Create New Area"
                    aria-label="Create new life area">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        // Search box
        const searchBox = document.createElement('div');
        searchBox.className = 'areas-search-box';
        searchBox.innerHTML = `
            <input type="text"
                   class="areas-search-input"
                   id="areas-search-input"
                   placeholder="Search areas..."
                   aria-label="Search life areas">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="search-icon">
                <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        `;

        // Areas list
        const areasList = document.createElement('div');
        areasList.className = 'areas-list';
        areasList.id = 'areas-list';
        areasList.setAttribute('role', 'tree');
        areasList.innerHTML = `
            <div class="areas-empty-state">
                <div class="empty-icon">🌱</div>
                <div class="empty-title">No Life Areas Yet</div>
                <div class="empty-subtitle">Areas will appear here as you discuss different aspects of your life</div>
            </div>
        `;

        // Footer with toggle
        const footer = document.createElement('div');
        footer.className = 'sidebar-footer';
        footer.innerHTML = `
            <button class="toggle-sidebar-button"
                    id="toggle-areas-sidebar"
                    title="Toggle Life Areas (⌘L)"
                    aria-label="Toggle life areas sidebar"
                    aria-expanded="false">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        `;

        // Assemble
        this.element.appendChild(header);
        this.element.appendChild(searchBox);
        this.element.appendChild(areasList);
        this.element.appendChild(footer);

        // Event listeners
        this.setupEventListeners();

        return this.element;
    }

    /**
     * Setup Event Listeners
     */
    setupEventListeners() {
        // Toggle sidebar
        const toggleButton = this.element.querySelector('#toggle-areas-sidebar');
        toggleButton.addEventListener('click', () => this.toggle());

        // Search
        const searchInput = this.element.querySelector('#areas-search-input');
        searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));

        // New area button
        const newAreaButton = this.element.querySelector('#new-area-button');
        newAreaButton.addEventListener('click', () => this.handleNewArea());
    }

    /**
     * Load Areas
     * 
     * Fetches areas from backend and renders them.
     */
    async loadAreas() {
        try {
            console.log('[LifeAreasSidebar] Loading areas...');

            // Fetch from backend via Electron IPC
            const areas = await window.electronAPI.getLifeAreas();

            this.areas = areas;
            this.filteredAreas = areas;

            this.renderAreas();

            console.log(`[LifeAreasSidebar] Loaded ${areas.length} areas`);
        } catch (error) {
            console.error('[LifeAreasSidebar] Failed to load areas:', error);
        }
    }

    /**
     * Render Areas
     * 
     * Renders the areas tree structure.
     */
    renderAreas() {
        const areasList = this.element.querySelector('#areas-list');

        if (this.filteredAreas.length === 0) {
            areasList.innerHTML = `
                <div class="areas-empty-state">
                    <div class="empty-icon">🌱</div>
                    <div class="empty-title">No Life Areas Yet</div>
                    <div class="empty-subtitle">Areas will appear here as you discuss different aspects of your life</div>
                </div>
            `;
            return;
        }

        // Build tree structure
        const tree = this.buildTree(this.filteredAreas);

        // Render tree
        areasList.innerHTML = '';
        this.renderTreeNode(tree, areasList, 0);
    }

    /**
     * Build Tree Structure
     * 
     * Converts flat array of areas into hierarchical tree.
     * 
     * @param {Array} areas - Flat array of areas
     * @returns {Object} Tree structure
     */
    buildTree(areas) {
        const tree = {};

        areas.forEach(area => {
            const parts = area.path.split('/');
            let current = tree;

            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = {
                        name: area.name,
                        path: area.path,
                        entry_count: area.entry_count,
                        last_activity: area.last_activity,
                        children: {}
                    };
                }
                current = current[part].children;
            });
        });

        return tree;
    }

    /**
     * Render Tree Node
     * 
     * Recursively renders tree nodes.
     * 
     * @param {Object} node - Tree node
     * @param {HTMLElement} container - Container element
     * @param {number} level - Indentation level
     */
    renderTreeNode(node, container, level) {
        for (const [key, value] of Object.entries(node)) {
            if (key === 'children') continue;

            // Create area item
            const item = document.createElement('div');
            item.className = 'area-item';
            item.style.paddingLeft = `${level * 20 + 12}px`;
            item.setAttribute('data-area-path', value.path);
            item.setAttribute('role', 'treeitem');
            item.setAttribute('aria-expanded', this.expandedAreas.has(value.path) ? 'true' : 'false');

            const hasChildren = Object.keys(value.children || {}).length > 0;

            // Format last activity
            const lastActivity = this.formatRelativeTime(value.last_activity);

            item.innerHTML = `
                ${hasChildren ? `
                    <button class="area-expand-button" aria-label="Expand ${value.name}">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                ` : '<span class="area-spacer"></span>'}
                <div class="area-content">
                    <div class="area-name">${value.name}</div>
                    <div class="area-meta">
                        <span class="area-count">${value.entry_count} entries</span>
                        <span class="area-activity">${lastActivity}</span>
                    </div>
                </div>
            `;

            // Click handler
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.area-expand-button')) {
                    this.handleAreaClick(value.path);
                }
            });

            // Expand button handler
            if (hasChildren) {
                const expandButton = item.querySelector('.area-expand-button');
                expandButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleAreaExpansion(value.path);
                });
            }

            container.appendChild(item);

            // Render children if expanded
            if (hasChildren && this.expandedAreas.has(value.path)) {
                this.renderTreeNode(value.children, container, level + 1);
            }
        }
    }

    /**
     * Toggle Area Expansion
     * 
     * @param {string} areaPath - Area path
     */
    toggleAreaExpansion(areaPath) {
        if (this.expandedAreas.has(areaPath)) {
            this.expandedAreas.delete(areaPath);
        } else {
            this.expandedAreas.add(areaPath);
        }

        this.renderAreas();
    }

    /**
     * Handle Area Click
     * 
     * @param {string} areaPath - Area path
     */
    async handleAreaClick(areaPath) {
        console.log(`[LifeAreasSidebar] Area clicked: ${areaPath}`);

        try {
            // Fetch area details from backend
            const areaDetails = await window.electronAPI.getAreaDetails(areaPath);

            // Show area details modal or panel
            this.showAreaDetails(areaDetails);
        } catch (error) {
            console.error('[LifeAreasSidebar] Failed to load area details:', error);
        }
    }

    /**
     * Show Area Details
     * 
     * @param {Object} areaDetails - Area details
     */
    showAreaDetails(areaDetails) {
        // TODO: Implement area details modal
        console.log('[LifeAreasSidebar] Show area details:', areaDetails);
        alert(`Area: ${areaDetails.name}\nEntries: ${areaDetails.entry_count}\nPath: ${areaDetails.path}`);
    }

    /**
     * Handle Search
     * 
     * @param {string} query - Search query
     */
    handleSearch(query) {
        if (!query.trim()) {
            this.filteredAreas = this.areas;
        } else {
            const lowerQuery = query.toLowerCase();
            this.filteredAreas = this.areas.filter(area => 
                area.name.toLowerCase().includes(lowerQuery) ||
                area.path.toLowerCase().includes(lowerQuery)
            );
        }

        this.renderAreas();
    }

    /**
     * Handle New Area
     */
    async handleNewArea() {
        console.log('[LifeAreasSidebar] Create new area');

        // TODO: Implement new area modal
        const areaName = prompt('Enter area name (e.g., "Family/Emma_School"):');
        
        if (areaName) {
            try {
                await window.electronAPI.createLifeArea(areaName);
                await this.loadAreas();
                console.log('[LifeAreasSidebar] Created area:', areaName);
            } catch (error) {
                console.error('[LifeAreasSidebar] Failed to create area:', error);
                alert('Failed to create area');
            }
        }
    }

    /**
     * Toggle Sidebar
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open Sidebar
     */
    open() {
        this.isOpen = true;
        this.element.classList.remove('collapsed');
        this.element.classList.add('expanded');

        const toggleButton = this.element.querySelector('#toggle-areas-sidebar');
        toggleButton.setAttribute('aria-expanded', 'true');

        // Load areas when opening
        this.loadAreas();

        console.log('[LifeAreasSidebar] Opened');
    }

    /**
     * Close Sidebar
     */
    close() {
        this.isOpen = false;
        this.element.classList.remove('expanded');
        this.element.classList.add('collapsed');

        const toggleButton = this.element.querySelector('#toggle-areas-sidebar');
        toggleButton.setAttribute('aria-expanded', 'false');

        console.log('[LifeAreasSidebar] Closed');
    }

    /**
     * Format Relative Time
     * 
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Relative time (e.g., "2h ago")
     */
    formatRelativeTime(timestamp) {
        if (!timestamp) return 'never';

        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LifeAreasSidebar;
}
