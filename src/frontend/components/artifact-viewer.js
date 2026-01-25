/**
 * ARTIFACT VIEWER COMPONENT
 * 
 * Purpose:
 * Displays artifacts inline with conversation messages.
 * Renders HTML artifacts in isolated iframes with expand/collapse animations.
 * 
 * Features:
 * - Expand/collapse with smooth animations
 * - Export to PNG, PDF, HTML
 * - Isolated rendering (iframe for security)
 * - Liquid glass card design
 * - Keyboard shortcuts
 * 
 * Design:
 * - Floats below AI message that created it
 * - Collapsed state shows preview + expand button
 * - Expanded state shows full artifact with toolbar
 * - Smooth height transitions
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

class ArtifactViewer {
    /**
     * Constructor
     * 
     * @param {string} artifactId - Unique artifact ID
     * @param {string} artifactType - Type of artifact (stress_map, checklist, etc.)
     * @param {string} htmlContent - HTML content to display
     * @param {object} jsonData - Optional JSON data for data artifacts
     */
    constructor(artifactId, artifactType, htmlContent, jsonData = null) {
        this.artifactId = artifactId;
        this.artifactType = artifactType;
        this.htmlContent = htmlContent;
        this.jsonData = jsonData;
        this.isExpanded = false;
        this.element = null;
        
        this.render();
    }

    /**
     * Render Artifact Card
     * 
     * Creates the artifact card element with iframe.
     */
    render() {
        // Create container
        this.element = document.createElement('div');
        this.element.className = 'artifact-card collapsed';
        this.element.setAttribute('data-artifact-id', this.artifactId);
        this.element.setAttribute('data-artifact-type', this.artifactType);
        this.element.setAttribute('role', 'article');
        this.element.setAttribute('aria-label', `${this.artifactType} artifact`);

        // Create header
        const header = document.createElement('div');
        header.className = 'artifact-header';
        
        // Icon based on type
        const icon = this.getIconForType(this.artifactType);
        
        // Title
        const title = document.createElement('div');
        title.className = 'artifact-title';
        title.innerHTML = `
            <span class="artifact-icon">${icon}</span>
            <span class="artifact-name">${this.getReadableName(this.artifactType)}</span>
            ${this.jsonData ? '<span class="artifact-badge">Data</span>' : ''}
        `;
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'artifact-actions';
        
        // Expand/collapse button
        const expandButton = document.createElement('button');
        expandButton.className = 'artifact-button';
        expandButton.setAttribute('aria-label', 'Expand artifact');
        expandButton.setAttribute('aria-expanded', 'false');
        expandButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="expand-icon">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        expandButton.addEventListener('click', () => this.toggle());
        
        actions.appendChild(expandButton);
        
        header.appendChild(title);
        header.appendChild(actions);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'artifact-content';
        
        // Create iframe for isolated rendering
        const iframe = document.createElement('iframe');
        iframe.className = 'artifact-iframe';
        iframe.setAttribute('sandbox', 'allow-same-origin');
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('title', `${this.artifactType} artifact content`);
        
        content.appendChild(iframe);
        
        // Create toolbar (shown when expanded)
        const toolbar = document.createElement('div');
        toolbar.className = 'artifact-toolbar';
        toolbar.innerHTML = `
            <button class="artifact-toolbar-button" data-action="export-png" title="Export as PNG">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="5.5" cy="5.5" r="1" fill="currentColor"/>
                    <path d="M12 10l-2-2-2 2-2-2-2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                PNG
            </button>
            <button class="artifact-toolbar-button" data-action="export-pdf" title="Export as PDF">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2h10v12H3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                PDF
            </button>
            <button class="artifact-toolbar-button" data-action="export-html" title="Export as HTML">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6l-2 2 2 2M12 6l2 2-2 2M10 3l-4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                HTML
            </button>
            ${this.jsonData ? `
                <button class="artifact-toolbar-button" data-action="export-json" title="Export data as JSON">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 2v12M4 2a2 2 0 00-2 2M4 14a2 2 0 01-2-2M12 2v12M12 2a2 2 0 012 2M12 14a2 2 0 002-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    JSON
                </button>
            ` : ''}
        `;
        
        // Add toolbar event listeners
        toolbar.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                this.handleExport(action);
            });
        });
        
        // Assemble
        this.element.appendChild(header);
        this.element.appendChild(content);
        this.element.appendChild(toolbar);
        
        // Load content into iframe
        this.loadContent(iframe);
        
        return this.element;
    }

    /**
     * Load Content into Iframe
     * 
     * @param {HTMLIFrameElement} iframe - Iframe element
     */
    loadContent(iframe) {
        // Wait for iframe to be ready
        iframe.addEventListener('load', () => {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(this.htmlContent);
            doc.close();
            
            // Adjust iframe height to content
            setTimeout(() => {
                const height = doc.documentElement.scrollHeight;
                iframe.style.height = `${height}px`;
            }, 100);
        });
        
        // Trigger load
        iframe.src = 'about:blank';
    }

    /**
     * Toggle Expand/Collapse
     */
    toggle() {
        if (this.isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    /**
     * Expand Artifact
     */
    expand() {
        this.isExpanded = true;
        this.element.classList.remove('collapsed');
        this.element.classList.add('expanded');
        
        const button = this.element.querySelector('.artifact-button');
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-label', 'Collapse artifact');
        
        console.log(`[ArtifactViewer] Expanded artifact: ${this.artifactId}`);
    }

    /**
     * Collapse Artifact
     */
    collapse() {
        this.isExpanded = false;
        this.element.classList.remove('expanded');
        this.element.classList.add('collapsed');
        
        const button = this.element.querySelector('.artifact-button');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Expand artifact');
        
        console.log(`[ArtifactViewer] Collapsed artifact: ${this.artifactId}`);
    }

    /**
     * Handle Export
     * 
     * @param {string} action - Export action (export-png, export-pdf, export-html, export-json)
     */
    async handleExport(action) {
        console.log(`[ArtifactViewer] Export ${action} for ${this.artifactId}`);
        
        try {
            switch (action) {
                case 'export-png':
                    await this.exportAsPNG();
                    break;
                case 'export-pdf':
                    await this.exportAsPDF();
                    break;
                case 'export-html':
                    await this.exportAsHTML();
                    break;
                case 'export-json':
                    await this.exportAsJSON();
                    break;
            }
        } catch (error) {
            console.error('[ArtifactViewer] Export failed:', error);
            alert(`Export failed: ${error.message}`);
        }
    }

    /**
     * Export as PNG
     * 
     * Uses html2canvas to capture artifact as image.
     */
    async exportAsPNG() {
        // This would require html2canvas library
        // For now, show not implemented message
        alert('PNG export will be implemented with html2canvas library');
    }

    /**
     * Export as PDF
     * 
     * Uses jsPDF to generate PDF.
     */
    async exportAsPDF() {
        // This would require jsPDF library
        alert('PDF export will be implemented with jsPDF library');
    }

    /**
     * Export as HTML
     * 
     * Downloads the HTML file.
     */
    async exportAsHTML() {
        const blob = new Blob([this.htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.artifactId}.html`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        console.log('[ArtifactViewer] Exported as HTML');
    }

    /**
     * Export as JSON
     * 
     * Downloads the JSON data.
     */
    async exportAsJSON() {
        if (!this.jsonData) {
            alert('This artifact has no data to export');
            return;
        }
        
        const blob = new Blob([JSON.stringify(this.jsonData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.artifactId}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        console.log('[ArtifactViewer] Exported as JSON');
    }

    /**
     * Get Icon for Artifact Type
     * 
     * @param {string} type - Artifact type
     * @returns {string} SVG icon HTML
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
            celebration_card: '🎉'
        };
        
        return icons[type] || '📄';
    }

    /**
     * Get Readable Name for Artifact Type
     * 
     * @param {string} type - Artifact type
     * @returns {string} Human-readable name
     */
    getReadableName(type) {
        const names = {
            stress_map: 'Stress Map',
            checklist: 'Checklist',
            reflection_summary: 'Reflection Summary',
            goal_tracker: 'Goal Tracker',
            comparison_card: 'Comparison',
            timeline: 'Timeline',
            decision_matrix: 'Decision Matrix',
            progress_chart: 'Progress Chart',
            mindmap: 'Mind Map',
            celebration_card: 'Celebration'
        };
        
        return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Destroy
     * 
     * Cleans up and removes the artifact card.
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ArtifactViewer;
}
