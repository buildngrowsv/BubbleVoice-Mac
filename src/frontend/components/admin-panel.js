/**
 * ADMIN PANEL COMPONENT
 * 
 * **Purpose**: Advanced configuration panel for power users and developers
 * 
 * **What It Provides**:
 * - System prompt editing (8 sections)
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
 * 
 * **Product Context**:
 * This is a "power user" feature. Most users won't touch it,
 * but those who do will appreciate the control and transparency.
 * 
 * **Created**: 2026-01-24
 * **Part of**: Agentic AI Flows Enhancement
 */

class AdminPanel {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the admin panel with default state.
     * 
     * **Technical**: Creates DOM structure and loads current config
     * **Why**: Admin panel is hidden by default, shown on demand
     * **Product**: Advanced users can access via settings gear icon
     */
    constructor() {
        this.isOpen = false;
        this.currentTab = 'prompts';
        this.sections = null;
        this.config = null;
        this.metadata = null;
        
        // Create panel element
        this.element = this.render();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('[AdminPanel] Initialized');
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
                    <!-- Prompts Tab -->
                    <div class="admin-tab-content active" data-tab-content="prompts">
                        <div class="admin-section">
                            <h3>System Prompt Editor</h3>
                            <p class="admin-description">
                                Customize how the AI behaves and responds. Changes take effect immediately.
                            </p>
                            
                            <div class="prompt-sections">
                                <div class="section-selector">
                                    <button class="section-btn active" data-section="purpose">Purpose</button>
                                    <button class="section-btn" data-section="approach">Approach</button>
                                    <button class="section-btn" data-section="lifeAreas">Life Areas</button>
                                    <button class="section-btn" data-section="responseFormat">Format</button>
                                    <button class="section-btn" data-section="areaActionsGuidelines">Actions</button>
                                    <button class="section-btn" data-section="artifactGuidelines">Artifacts</button>
                                    <button class="section-btn" data-section="exampleResponse">Example</button>
                                    <button class="section-btn" data-section="importantNotes">Notes</button>
                                </div>
                                
                                <div class="section-editor">
                                    <div class="section-header">
                                        <h4 id="section-title">Purpose Definition</h4>
                                        <span class="section-status" id="section-status">Default</span>
                                    </div>
                                    
                                    <textarea 
                                        id="section-content" 
                                        class="section-textarea"
                                        placeholder="Loading..."
                                    ></textarea>
                                    
                                    <div class="section-actions">
                                        <button class="btn-secondary" id="reset-section">Reset to Default</button>
                                        <button class="btn-primary" id="save-section">Save Changes</button>
                                    </div>
                                    
                                    <div class="section-info">
                                        <p><strong>What this section does:</strong></p>
                                        <p id="section-explanation">Loading...</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="prompt-preview">
                                <h4>Full System Prompt Preview</h4>
                                <button class="btn-secondary" id="preview-prompt">Show Full Prompt</button>
                                <button class="btn-danger" id="reset-all">Reset All to Defaults</button>
                            </div>
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
        
        // Section switching
        this.element.querySelectorAll('.section-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSection(e.target.dataset.section);
            });
        });
        
        // Save section button
        this.element.querySelector('#save-section').addEventListener('click', () => {
            this.saveCurrentSection();
        });
        
        // Reset section button
        this.element.querySelector('#reset-section').addEventListener('click', () => {
            this.resetCurrentSection();
        });
        
        // Preview prompt button
        this.element.querySelector('#preview-prompt').addEventListener('click', () => {
            this.previewFullPrompt();
        });
        
        // Reset all button
        this.element.querySelector('#reset-all').addEventListener('click', () => {
            this.resetAllPrompts();
        });
        
        // Save config button
        this.element.querySelector('#save-config').addEventListener('click', () => {
            this.saveConfiguration();
        });
        
        // Reset config button
        this.element.querySelector('#reset-config').addEventListener('click', () => {
            this.resetConfiguration();
        });
        
        // Refresh performance button
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
            // Load prompt sections
            this.sections = await window.electronAPI.adminPanel.getPromptSections();
            
            // Load context assembly config
            this.config = await window.electronAPI.adminPanel.getContextConfig();
            
            // Load metadata
            this.metadata = await window.electronAPI.adminPanel.getPromptMetadata();
            
            // Update UI
            this.updatePromptUI();
            this.updateConfigUI();
            this.updateAboutUI();
            
            console.log('[AdminPanel] Data loaded');
        } catch (error) {
            console.error('[AdminPanel] Failed to load data:', error);
        }
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
    
    /**
     * SWITCH SECTION
     * 
     * Switches between prompt sections in the editor.
     * 
     * @param {string} sectionName - Section to switch to
     */
    switchSection(sectionName) {
        if (!this.sections) return;
        
        // Update section buttons
        this.element.querySelectorAll('.section-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === sectionName);
        });
        
        // Update editor
        const section = this.sections[sectionName];
        if (section) {
            this.element.querySelector('#section-title').textContent = this.getSectionTitle(sectionName);
            this.element.querySelector('#section-content').value = section.content;
            this.element.querySelector('#section-status').textContent = section.isCustom ? 'Custom' : 'Default';
            this.element.querySelector('#section-status').className = section.isCustom ? 'section-status custom' : 'section-status';
            this.element.querySelector('#section-explanation').textContent = this.getSectionExplanation(sectionName);
        }
        
        this.currentSection = sectionName;
    }
    
    /**
     * GET SECTION TITLE
     * 
     * Returns human-readable title for a section.
     */
    getSectionTitle(sectionName) {
        const titles = {
            purpose: 'Purpose Definition',
            approach: 'Approach Guidelines',
            lifeAreas: 'Life Areas System',
            responseFormat: 'Response Format',
            areaActionsGuidelines: 'Area Actions Guidelines',
            artifactGuidelines: 'Artifact Guidelines',
            exampleResponse: 'Example Response',
            importantNotes: 'Important Notes'
        };
        return titles[sectionName] || sectionName;
    }
    
    /**
     * GET SECTION EXPLANATION
     * 
     * Returns explanation of what a section does.
     */
    getSectionExplanation(sectionName) {
        const explanations = {
            purpose: 'Defines the AI\'s core identity and role. Sets the overall tone for all interactions.',
            approach: 'Guidelines for how the AI should interact with users. Defines personality traits and communication style.',
            lifeAreas: 'Instructions for the Life Areas memory system. Tells the AI when and how to create areas and entries.',
            responseFormat: 'Defines the JSON structure the AI must use. Critical for structured outputs.',
            areaActionsGuidelines: 'Specific rules for creating and updating life areas. Ensures consistent data structure.',
            artifactGuidelines: 'Rules for generating visual artifacts. Defines when and how to create them.',
            exampleResponse: 'A complete example showing the AI exactly what output looks like. Very important for consistency.',
            importantNotes: 'Final reminders and critical rules. Reinforces key requirements.'
        };
        return explanations[sectionName] || 'No explanation available.';
    }
    
    /**
     * UPDATE PROMPT UI
     * 
     * Updates the prompts tab with loaded data.
     */
    updatePromptUI() {
        if (!this.sections) return;
        
        // Load first section by default
        this.switchSection('purpose');
    }
    
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
    
    /**
     * SAVE CURRENT SECTION
     * 
     * Saves the currently edited section.
     */
    async saveCurrentSection() {
        const content = this.element.querySelector('#section-content').value;
        
        try {
            await window.electronAPI.adminPanel.updatePromptSection(this.currentSection, content);
            
            // Reload data
            await this.loadData();
            
            // Show success
            this.showNotification('Section saved successfully!', 'success');
            
            console.log(`[AdminPanel] Saved section: ${this.currentSection}`);
        } catch (error) {
            console.error('[AdminPanel] Failed to save section:', error);
            this.showNotification('Failed to save section', 'error');
        }
    }
    
    /**
     * RESET CURRENT SECTION
     * 
     * Resets the current section to default.
     */
    async resetCurrentSection() {
        if (!confirm('Reset this section to default?')) return;
        
        try {
            await window.electronAPI.adminPanel.resetPromptSection(this.currentSection);
            
            // Reload data
            await this.loadData();
            
            // Show success
            this.showNotification('Section reset to default', 'success');
            
            console.log(`[AdminPanel] Reset section: ${this.currentSection}`);
        } catch (error) {
            console.error('[AdminPanel] Failed to reset section:', error);
            this.showNotification('Failed to reset section', 'error');
        }
    }
    
    /**
     * PREVIEW FULL PROMPT
     * 
     * Shows a modal with the complete assembled prompt.
     */
    async previewFullPrompt() {
        try {
            const fullPrompt = await window.electronAPI.adminPanel.getFullSystemPrompt();
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'prompt-preview-modal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Full System Prompt</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <pre>${fullPrompt}</pre>
                    </div>
                    <div class="modal-footer">
                        <p><strong>Length:</strong> ${fullPrompt.length} characters</p>
                        <button class="btn-secondary modal-close">Close</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Close handlers
            modal.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
                el.addEventListener('click', () => {
                    modal.remove();
                });
            });
            
        } catch (error) {
            console.error('[AdminPanel] Failed to preview prompt:', error);
            this.showNotification('Failed to load prompt', 'error');
        }
    }
    
    /**
     * RESET ALL PROMPTS
     * 
     * Resets all prompts to defaults.
     */
    async resetAllPrompts() {
        if (!confirm('Reset ALL prompts to defaults? This cannot be undone.')) return;
        
        try {
            await window.electronAPI.adminPanel.resetAllPrompts();
            
            // Reload data
            await this.loadData();
            
            // Show success
            this.showNotification('All prompts reset to defaults', 'success');
            
            console.log('[AdminPanel] Reset all prompts');
        } catch (error) {
            console.error('[AdminPanel] Failed to reset prompts:', error);
            this.showNotification('Failed to reset prompts', 'error');
        }
    }
    
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
        if (!confirm('Reset configuration to defaults?')) return;
        
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
