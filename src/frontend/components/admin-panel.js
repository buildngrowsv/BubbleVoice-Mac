/**
 * ADMIN PANEL COMPONENT
 * 
 * **Purpose**: Advanced configuration panel for power users and developers
 * 
 * **What It Provides**:
 * - Visual prompt editor with draggable text + programmatic blocks (NEW 2026-02-06)
 * - Template library for one-click AI personality switching (NEW 2026-02-06)
 * - Variable system for dynamic prompt content (NEW 2026-02-06)
 * - Vector search configuration
 * - Context assembly parameters
 * - Performance monitoring
 * - Reset to defaults
 * 
 * **Why This Exists**:
 * - Users need to customize AI behavior
 * - Developers need to tune search parameters
 * - Power users want to optimize performance
 * - Transparency: show what's happening under the hood
 * - (NEW) Users want to see and control WHERE programmatic sections (RAG context,
 *   vector results, etc.) appear in the prompt flow
 * - (NEW) Users want to quickly switch AI personality via templates
 * 
 * **Product Context**:
 * This is a "power user" feature. Most users won't touch it,
 * but those who do will appreciate the control and transparency.
 * The visual editor makes the prompt system accessible to non-technical users too.
 * 
 * **Architecture Change (2026-02-06)**:
 * The old textarea-based section editor has been replaced with:
 * 1. VisualPromptEditor — block-based editor with drag-and-drop
 * 2. PromptTemplateLibrary — template picker with built-in presets
 * Both are imported as separate components and mounted inside the admin panel.
 * 
 * **Created**: 2026-01-24
 * **Last Modified**: 2026-02-06
 * **Part of**: Agentic AI Flows Enhancement + Visual Prompt Editor Feature
 */

class AdminPanel {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the admin panel with the visual prompt editor and template library.
     * 
     * **Technical**: Creates DOM structure, initializes sub-components (VisualPromptEditor,
     * PromptTemplateLibrary), and loads current config from backend.
     * 
     * **Why**: Admin panel is hidden by default, shown on demand. Sub-components are
     * created eagerly so they're ready when the panel opens.
     * 
     * **Product**: Advanced users can access via settings gear icon. The visual editor
     * and template library are the first things they see in the System Prompts tab.
     */
    constructor() {
        this.isOpen = false;
        this.currentTab = 'prompts';
        this.sections = null;
        this.config = null;
        this.metadata = null;
        
        /**
         * visualEditor: The block-based visual prompt editor component.
         * Shows text sections and programmatic/RAG blocks as draggable visual elements.
         * Users can reorder blocks, toggle programmatic sections, insert variables,
         * and write custom text between blocks.
         * Created 2026-02-06 to replace the old textarea-based section editor.
         */
        this.visualEditor = new VisualPromptEditor();
        
        /**
         * templateLibrary: The prompt template picker component.
         * Shows a grid of pre-built and custom templates with one-click apply.
         * Created 2026-02-06 to give users quick AI personality switching.
         */
        this.templateLibrary = new PromptTemplateLibrary(this.visualEditor);
        
        /**
         * autoSaveTimer: Debounce timer for auto-saving block config changes.
         * The visual editor fires onChange frequently (on every keystroke),
         * so we debounce saves to avoid excessive disk writes.
         * 500ms delay balances responsiveness with I/O efficiency.
         */
        this.autoSaveTimer = null;
        
        // Create panel element
        this.element = this.render();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Wire up visual editor auto-save
        this.visualEditor.onChange((data) => {
            this.autoSaveBlockConfig(data);
        });
        
        // Wire up template apply callback
        this.templateLibrary.onApply((template) => {
            this.showNotification(`Applied template: ${template.name}`, 'success');
        });
        
        console.log('[AdminPanel] Initialized with visual editor + template library');
    }
    
    /**
     * RENDER
     * 
     * Creates the admin panel DOM structure.
     * 
     * **Technical**: Returns a div with tabs and content areas
     * **Why**: Liquid glass styling for consistency with app
     * **Product**: Beautiful, professional admin interface
     */
    render() {
        const panel = document.createElement('div');
        panel.className = 'admin-panel';
        panel.innerHTML = `
            <div class="admin-panel-overlay"></div>
            <div class="admin-panel-content">
                <div class="admin-panel-header">
                    <h2>⚙️ Admin Panel</h2>
                    <button class="admin-panel-close" title="Close">×</button>
                </div>
                
                <div class="admin-panel-tabs">
                    <button class="admin-tab active" data-tab="prompts">
                        📝 System Prompts
                    </button>
                    <button class="admin-tab" data-tab="context">
                        🔍 Context Assembly
                    </button>
                    <button class="admin-tab" data-tab="performance">
                        📊 Performance
                    </button>
                    <button class="admin-tab" data-tab="about">
                        ℹ️ About
                    </button>
                </div>
                
                <div class="admin-panel-body">
                    <!-- Prompts Tab (REBUILT 2026-02-06 with Visual Editor + Templates) -->
                    <div class="admin-tab-content active" data-tab-content="prompts">
                        <div class="admin-section">
                            <h3>Visual Prompt Editor</h3>
                            <p class="admin-description">
                                Build your AI's personality by arranging text blocks and runtime data injection points.
                                Drag blocks to reorder, toggle programmatic sections on/off, and insert dynamic variables.
                                Changes save automatically.
                            </p>
                            
                            <!-- 
                                VISUAL PROMPT EDITOR MOUNT POINT
                                The VisualPromptEditor component renders here.
                                It shows text blocks (editable) and programmatic blocks
                                (RAG context, vector results, etc.) as draggable visual elements.
                            -->
                            <div id="visual-editor-mount"></div>
                            
                            <!--
                                TEMPLATE LIBRARY MOUNT POINT
                                The PromptTemplateLibrary component renders below the editor.
                                Shows a grid of built-in + custom templates with one-click apply.
                            -->
                            <div id="template-library-mount" style="margin-top: 32px;"></div>
                        </div>
                    </div>
                    
                    <!-- Context Assembly Tab -->
                    <div class="admin-tab-content" data-tab-content="context">
                        <div class="admin-section">
                            <h3>Vector Search Configuration</h3>
                            <p class="admin-description">
                                Tune how the system searches for relevant context from past conversations.
                            </p>
                            
                            <div class="config-group">
                                <h4>Multi-Query Weights</h4>
                                <p class="config-description">
                                    How much to prioritize different types of context.
                                </p>
                                
                                <div class="config-item">
                                    <label for="weight-recent">Recent User Inputs (default: 3.0)</label>
                                    <input type="number" id="weight-recent" step="0.1" min="0" max="10" value="3.0">
                                    <span class="config-help">Higher = prioritize what user said recently</span>
                                </div>
                                
                                <div class="config-item">
                                    <label for="weight-all">All User Inputs (default: 1.5)</label>
                                    <input type="number" id="weight-all" step="0.1" min="0" max="10" value="1.5">
                                    <span class="config-help">Higher = prioritize user's overall topics</span>
                                </div>
                                
                                <div class="config-item">
                                    <label for="weight-full">Full Conversation (default: 0.5)</label>
                                    <input type="number" id="weight-full" step="0.1" min="0" max="10" value="0.5">
                                    <span class="config-help">Higher = include AI responses in search</span>
                                </div>
                            </div>
                            
                            <div class="config-group">
                                <h4>Search Parameters</h4>
                                
                                <div class="config-item">
                                    <label for="count-recent">Recent Inputs Count (default: 2)</label>
                                    <input type="number" id="count-recent" min="1" max="10" value="2">
                                    <span class="config-help">How many recent user messages to search</span>
                                </div>
                                
                                <div class="config-item">
                                    <label for="topk-final">Final Results Count (default: 10)</label>
                                    <input type="number" id="topk-final" min="1" max="50" value="10">
                                    <span class="config-help">Total context chunks to return</span>
                                </div>
                            </div>
                            
                            <div class="config-group">
                                <h4>Boost Factors</h4>
                                
                                <div class="config-item">
                                    <label for="boost-recency">Recency Boost (default: 0.05)</label>
                                    <input type="number" id="boost-recency" step="0.01" min="0" max="1" value="0.05">
                                    <span class="config-help">Boost per day (0.05 = 5% per day)</span>
                                </div>
                                
                                <div class="config-item">
                                    <label for="boost-area">Area Boost (default: 1.5)</label>
                                    <input type="number" id="boost-area" step="0.1" min="1" max="5" value="1.5">
                                    <span class="config-help">Boost for current area matches</span>
                                </div>
                            </div>
                            
                            <div class="config-actions">
                                <button class="btn-secondary" id="reset-config">Reset to Defaults</button>
                                <button class="btn-primary" id="save-config">Save Configuration</button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Performance Tab -->
                    <div class="admin-tab-content" data-tab-content="performance">
                        <div class="admin-section">
                            <h3>Performance Monitoring</h3>
                            <p class="admin-description">
                                Real-time metrics for system performance and resource usage.
                            </p>
                            
                            <div class="performance-grid">
                                <div class="performance-card">
                                    <h4>LLM Response Time</h4>
                                    <div class="performance-value" id="perf-llm">-- ms</div>
                                    <div class="performance-label">Average response time</div>
                                </div>
                                
                                <div class="performance-card">
                                    <h4>Vector Search</h4>
                                    <div class="performance-value" id="perf-vector">-- ms</div>
                                    <div class="performance-label">Multi-query search time</div>
                                </div>
                                
                                <div class="performance-card">
                                    <h4>Embedding Generation</h4>
                                    <div class="performance-value" id="perf-embedding">-- ms</div>
                                    <div class="performance-label">Local embedding time</div>
                                </div>
                                
                                <div class="performance-card">
                                    <h4>Total Context Assembly</h4>
                                    <div class="performance-value" id="perf-context">-- ms</div>
                                    <div class="performance-label">Full context build time</div>
                                </div>
                            </div>
                            
                            <div class="performance-details">
                                <h4>System Information</h4>
                                <div class="info-grid">
                                    <div class="info-item">
                                        <span class="info-label">Embeddings Stored:</span>
                                        <span class="info-value" id="info-embeddings">--</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Life Areas:</span>
                                        <span class="info-value" id="info-areas">--</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Conversations:</span>
                                        <span class="info-value" id="info-conversations">--</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="info-label">Database Size:</span>
                                        <span class="info-value" id="info-db-size">--</span>
                                    </div>
                                </div>
                            </div>
                            
                            <button class="btn-primary" id="refresh-performance">Refresh Metrics</button>
                        </div>
                    </div>
                    
                    <!-- About Tab -->
                    <div class="admin-tab-content" data-tab-content="about">
                        <div class="admin-section">
                            <h3>About Admin Panel</h3>
                            
                            <div class="about-content">
                                <h4>System Architecture</h4>
                                <p>
                                    BubbleVoice uses an orchestrated services architecture with:
                                </p>
                                <ul>
                                    <li><strong>IntegrationService</strong> - Coordinates all services</li>
                                    <li><strong>ContextAssemblyService</strong> - Multi-query vector search</li>
                                    <li><strong>LLMService</strong> - Gemini/Claude/GPT integration</li>
                                    <li><strong>PromptManagementService</strong> - Customizable prompts</li>
                                    <li><strong>VectorStoreService</strong> - Local embeddings (SQLite)</li>
                                    <li><strong>EmbeddingService</strong> - Transformers.js (384d)</li>
                                </ul>
                                
                                <h4>Prompt Management</h4>
                                <p>
                                    All customizations are stored in <code>user_data/config/prompts.json</code>.
                                    You can edit prompts here or manually edit the file.
                                </p>
                                
                                <h4>Version Information</h4>
                                <div class="version-info" id="version-info">
                                    <p><strong>Version:</strong> <span id="version">--</span></p>
                                    <p><strong>Last Modified:</strong> <span id="last-modified">--</span></p>
                                    <p><strong>Modified By:</strong> <span id="modified-by">--</span></p>
                                    <p><strong>Has Customizations:</strong> <span id="has-custom">--</span></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return panel;
    }
    
    /**
     * SETUP EVENT LISTENERS
     * 
     * Attaches all event handlers for the admin panel.
     * 
     * **Technical**: Uses event delegation for dynamic elements
     * **Why**: Single listener per type, efficient and maintainable
     * **Product**: Responsive, intuitive interface
     */
    setupEventListeners() {
        // Close button
        this.element.querySelector('.admin-panel-close').addEventListener('click', () => {
            this.close();
        });
        
        // Overlay click to close
        this.element.querySelector('.admin-panel-overlay').addEventListener('click', () => {
            this.close();
        });
        
        // Tab switching
        this.element.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // NOTE (2026-02-06): The old section-switching, save-section, reset-section,
        // preview-prompt, and reset-all listeners have been REMOVED because those
        // elements no longer exist in the DOM. The visual prompt editor handles
        // all prompt editing now, with its own internal event listeners.
        // The old textarea-based section editor has been replaced by the
        // VisualPromptEditor component which auto-saves on change.
        
        // Save config button (Context Assembly tab — still exists)
        this.element.querySelector('#save-config').addEventListener('click', () => {
            this.saveConfiguration();
        });
        
        // Reset config button (Context Assembly tab — still exists)
        this.element.querySelector('#reset-config').addEventListener('click', () => {
            this.resetConfiguration();
        });
        
        // Refresh performance button (Performance tab — still exists)
        this.element.querySelector('#refresh-performance').addEventListener('click', () => {
            this.refreshPerformance();
        });
    }
    
    /**
     * OPEN
     * 
     * Opens the admin panel and loads current configuration.
     * 
     * **Technical**: Fetches data from backend via IPC
     * **Why**: Always show fresh data when opening
     * **Product**: Users see current state, not stale data
     */
    async open() {
        this.isOpen = true;
        this.element.classList.add('open');
        
        // Load data
        await this.loadData();
        
        console.log('[AdminPanel] Opened');
    }
    
    /**
     * CLOSE
     * 
     * Closes the admin panel.
     * 
     * **Technical**: Removes 'open' class, triggers CSS animation
     * **Why**: Smooth transition out
     * **Product**: Professional, polished UX
     */
    close() {
        this.isOpen = false;
        this.element.classList.remove('open');
        
        console.log('[AdminPanel] Closed');
    }
    
    /**
     * TOGGLE
     * 
     * Toggles the admin panel open/closed.
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    /**
     * LOAD DATA
     * 
     * Loads all configuration data from backend.
     * 
     * **Technical**: Calls IPC handlers for prompts, config, metadata
     * **Why**: Need fresh data on every open
     * **Product**: Always show current state
     */
    async loadData() {
        try {
            // Load prompt sections (backward compat — still needed for visual editor)
            this.sections = await window.electronAPI.adminPanel.getPromptSections();
            
            // Load block configuration (visual editor layout)
            // This may be null for first-time users, in which case the visual
            // editor will create the default block layout from sections data
            let blockConfig = null;
            try {
                blockConfig = await window.electronAPI.adminPanel.getBlockConfig();
            } catch (err) {
                console.log('[AdminPanel] No block config yet (first time), will create from sections');
            }
            
            // Load context assembly config
            this.config = await window.electronAPI.adminPanel.getContextConfig();
            
            // Load metadata
            this.metadata = await window.electronAPI.adminPanel.getPromptMetadata();
            
            // Mount and populate the visual prompt editor
            this.mountVisualEditor(blockConfig);
            
            // Mount the template library
            this.mountTemplateLibrary();
            
            // Update remaining UI (context, about tabs)
            this.updateConfigUI();
            this.updateAboutUI();
            
            console.log('[AdminPanel] Data loaded (with visual editor + templates)');
        } catch (error) {
            console.error('[AdminPanel] Failed to load data:', error);
        }
    }
    
    /**
     * MOUNT VISUAL EDITOR
     * 
     * Renders the VisualPromptEditor into the admin panel's prompts tab.
     * Loads the editor with block config (if available) or creates default
     * blocks from the existing section-based prompt data.
     * 
     * **Technical**: Mounts the editor element into #visual-editor-mount,
     * then calls loadData() on the editor with sections and block config.
     * 
     * **Why**: The editor is a standalone component that needs to be mounted
     * into the admin panel's DOM and hydrated with data from the backend.
     * 
     * @param {Object|null} blockConfig - Saved block config or null
     */
    mountVisualEditor(blockConfig) {
        const mount = this.element.querySelector('#visual-editor-mount');
        if (!mount) return;
        
        // Clear previous mount (in case of re-load)
        mount.innerHTML = '';
        mount.appendChild(this.visualEditor.element);
        
        // Render the editor UI
        this.visualEditor.render();
        
        // Load data into the editor
        this.visualEditor.loadData(this.sections, blockConfig);
    }
    
    /**
     * MOUNT TEMPLATE LIBRARY
     * 
     * Renders the PromptTemplateLibrary into the admin panel's prompts tab,
     * below the visual editor.
     * 
     * **Technical**: Loads custom templates from backend, then renders
     * the library into #template-library-mount.
     */
    async mountTemplateLibrary() {
        const mount = this.element.querySelector('#template-library-mount');
        if (!mount) return;
        
        // Load custom templates from backend
        await this.templateLibrary.loadCustomTemplates();
        
        // Clear and mount
        mount.innerHTML = '';
        mount.appendChild(this.templateLibrary.element);
        
        // Render the library
        this.templateLibrary.render();
    }
    
    /**
     * AUTO SAVE BLOCK CONFIG
     * 
     * Debounced save of the visual editor's block configuration.
     * Called on every change from the visual editor (keypresses, reorders, toggles).
     * 
     * **Technical**: Uses a 500ms debounce timer. Each change resets the timer.
     * Only the final state is saved, avoiding excessive disk I/O.
     * 
     * **Why**: The visual editor fires onChange very frequently (on every keystroke
     * in a textarea). Without debouncing, we'd write to disk hundreds of times
     * during a single editing session. 500ms is fast enough to feel instant
     * but slow enough to batch rapid changes.
     * 
     * @param {Object} data - Block configuration from VisualPromptEditor.getSaveData()
     */
    autoSaveBlockConfig(data) {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        this.autoSaveTimer = setTimeout(async () => {
            try {
                await window.electronAPI.adminPanel.saveBlockConfig(data);
                console.log('[AdminPanel] Auto-saved block config');
            } catch (error) {
                console.error('[AdminPanel] Failed to auto-save block config:', error);
            }
        }, 500);
    }
    
    /**
     * SWITCH TAB
     * 
     * Switches between admin panel tabs.
     * 
     * @param {string} tabName - Tab to switch to
     */
    switchTab(tabName) {
        // Update tab buttons
        this.element.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab content
        this.element.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tabName);
        });
        
        this.currentTab = tabName;
        
        // Load data for performance tab
        if (tabName === 'performance') {
            this.refreshPerformance();
        }
    }
    
    // NOTE (2026-02-06): The old switchSection(), getSectionTitle(), getSectionExplanation(),
    // and updatePromptUI() methods have been REMOVED. They were part of the old textarea-based
    // section editor which has been replaced by the VisualPromptEditor component.
    // The visual editor handles all section display, editing, and navigation internally.
    
    /**
     * UPDATE CONFIG UI
     * 
     * Updates the context assembly config UI with loaded data.
     */
    updateConfigUI() {
        if (!this.config) return;
        
        // Multi-query weights
        this.element.querySelector('#weight-recent').value = this.config.multiQueryWeights.recentUserInputs;
        this.element.querySelector('#weight-all').value = this.config.multiQueryWeights.allUserInputs;
        this.element.querySelector('#weight-full').value = this.config.multiQueryWeights.fullConversation;
        
        // Counts
        this.element.querySelector('#count-recent').value = this.config.multiQueryCounts.recentUserInputsCount;
        this.element.querySelector('#topk-final').value = this.config.multiQueryCounts.finalTopK;
        
        // Boosts
        this.element.querySelector('#boost-recency').value = this.config.boosts.recencyBoostPerDay;
        this.element.querySelector('#boost-area').value = this.config.boosts.areaBoost;
    }
    
    /**
     * UPDATE ABOUT UI
     * 
     * Updates the about tab with metadata.
     */
    updateAboutUI() {
        if (!this.metadata) return;
        
        this.element.querySelector('#version').textContent = this.metadata.version;
        this.element.querySelector('#last-modified').textContent = new Date(this.metadata.lastModified).toLocaleString();
        this.element.querySelector('#modified-by').textContent = this.metadata.modifiedBy;
        this.element.querySelector('#has-custom').textContent = this.metadata.hasCustomizations ? 'Yes' : 'No';
    }
    
    // NOTE (2026-02-06): The old saveCurrentSection(), resetCurrentSection(),
    // previewFullPrompt(), and resetAllPrompts() methods have been REMOVED.
    // These were part of the old textarea-based section editor.
    // The VisualPromptEditor now handles saving (auto-save via onChange),
    // resetting (via its own Reset All button), and previewing (via its
    // Edit/Preview mode toggle). All section persistence is handled by
    // the autoSaveBlockConfig() method above which calls through IPC.
    
    /**
     * SAVE CONFIGURATION
     * 
     * Saves the context assembly configuration.
     */
    async saveConfiguration() {
        const config = {
            multiQueryWeights: {
                recentUserInputs: parseFloat(this.element.querySelector('#weight-recent').value),
                allUserInputs: parseFloat(this.element.querySelector('#weight-all').value),
                fullConversation: parseFloat(this.element.querySelector('#weight-full').value)
            },
            multiQueryCounts: {
                recentUserInputsCount: parseInt(this.element.querySelector('#count-recent').value),
                finalTopK: parseInt(this.element.querySelector('#topk-final').value)
            },
            boosts: {
                recencyBoostPerDay: parseFloat(this.element.querySelector('#boost-recency').value),
                areaBoost: parseFloat(this.element.querySelector('#boost-area').value)
            }
        };
        
        try {
            await window.electronAPI.adminPanel.updateContextConfig(config);
            
            // Reload data
            await this.loadData();
            
            // Show success
            this.showNotification('Configuration saved successfully!', 'success');
            
            console.log('[AdminPanel] Saved configuration');
        } catch (error) {
            console.error('[AdminPanel] Failed to save configuration:', error);
            this.showNotification('Failed to save configuration', 'error');
        }
    }
    
    /**
     * RESET CONFIGURATION
     * 
     * Resets context assembly config to defaults.
     */
    async resetConfiguration() {
        // P0 FIX: Use styled confirm instead of native confirm()
        const confirmed = await window.app?.showConfirm(
          'Reset Configuration',
          'Reset context assembly configuration to defaults?',
          'Reset'
        );
        if (!confirmed) return;
        
        try {
            await window.electronAPI.adminPanel.resetContextConfig();
            
            // Reload data
            await this.loadData();
            
            // Show success
            this.showNotification('Configuration reset to defaults', 'success');
            
            console.log('[AdminPanel] Reset configuration');
        } catch (error) {
            console.error('[AdminPanel] Failed to reset configuration:', error);
            this.showNotification('Failed to reset configuration', 'error');
        }
    }
    
    /**
     * REFRESH PERFORMANCE
     * 
     * Loads and displays performance metrics.
     */
    async refreshPerformance() {
        try {
            const metrics = await window.electronAPI.adminPanel.getPerformanceMetrics();
            
            // Update performance cards
            this.element.querySelector('#perf-llm').textContent = `${metrics.llmResponseTime || '--'} ms`;
            this.element.querySelector('#perf-vector').textContent = `${metrics.vectorSearchTime || '--'} ms`;
            this.element.querySelector('#perf-embedding').textContent = `${metrics.embeddingTime || '--'} ms`;
            this.element.querySelector('#perf-context').textContent = `${metrics.contextAssemblyTime || '--'} ms`;
            
            // Update system info
            this.element.querySelector('#info-embeddings').textContent = metrics.embeddingsCount || '--';
            this.element.querySelector('#info-areas').textContent = metrics.lifeAreasCount || '--';
            this.element.querySelector('#info-conversations').textContent = metrics.conversationsCount || '--';
            this.element.querySelector('#info-db-size').textContent = metrics.databaseSize || '--';
            
            console.log('[AdminPanel] Performance metrics refreshed');
        } catch (error) {
            console.error('[AdminPanel] Failed to refresh performance:', error);
            this.showNotification('Failed to load metrics', 'error');
        }
    }
    
    /**
     * SHOW NOTIFICATION
     * 
     * Shows a temporary notification message.
     * 
     * @param {string} message - Message to show
     * @param {string} type - Type: success, error, info
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `admin-notification ${type}`;
        notification.textContent = message;
        
        this.element.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminPanel;
}
