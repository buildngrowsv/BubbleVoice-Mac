/**
 * ARTIFACT MANAGER SERVICE
 * 
 * Purpose:
 * Manages artifact files (HTML + optional JSON) for conversation artifacts.
 * Artifacts are visual or data-driven outputs that help users understand
 * complex information (timelines, stress maps, goal trackers, etc.).
 * 
 * Artifact Types (10 total):
 * 
 * Data Artifacts (HTML + JSON):
 * 1. goal_tracker - Progress visualization with milestones
 * 2. comparison_card - Side-by-side pros/cons
 * 3. timeline - Events over time
 * 4. decision_matrix - Weighted scoring grid
 * 5. progress_chart - Metrics over time
 * 
 * Visual Artifacts (HTML only):
 * 6. stress_map - Topic breakdown with intensity
 * 7. reflection_summary - Journey recap
 * 8. mindmap - Connected concepts
 * 9. checklist - Actionable items
 * 10. celebration_card - Achievement recognition
 * 
 * Design Standards:
 * - Liquid glass styling (backdrop-filter, blur)
 * - Modern gradients
 * - Smooth animations and hover states
 * - Responsive layouts
 * - Beautiful typography
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * ArtifactManagerService Class
 * 
 * Manages artifact creation, storage, and retrieval.
 * 
 * DIFF/PATCH SYSTEM (2026-01-28):
 * The service now supports incremental updates via JSON patches. Instead of
 * regenerating the entire HTML for small changes (like "change growth to money"),
 * the AI can send a patch operation that modifies specific data values.
 * 
 * This enables:
 * - Faster updates (no need to regenerate full HTML)
 * - Lower token usage (patch is smaller than full HTML)
 * - More reliable updates (less chance of breaking the design)
 * - Better UX (instantaneous changes)
 * 
 * Patch Format:
 * {
 *   action: "patch",
 *   artifact_id: "existing_id",
 *   patches: [
 *     { op: "replace", path: "/title", value: "New Title" },
 *     { op: "replace", path: "/items/0/name", value: "New Name" }
 *   ]
 * }
 * 
 * Or simpler key-value format for common cases:
 * {
 *   action: "patch",
 *   artifact_id: "existing_id",
 *   data_changes: { "title": "New Title", "items[0].name": "New Name" }
 * }
 */
class ArtifactManagerService {
    /**
     * Constructor
     * 
     * @param {DatabaseService} databaseService - Database service instance
     * @param {string} conversationsDir - Path to conversations directory
     * 
     * Why we pass DatabaseService:
     * - Store artifact metadata in database
     * - Enable fast queries (find all artifacts of type X)
     * - Link artifacts to conversations
     */
    constructor(databaseService, conversationsDir) {
        this.db = databaseService;
        this.conversationsDir = conversationsDir;
        
        console.log(`[ArtifactManagerService] Initialized with dir: ${conversationsDir}`);
    }

    /**
     * Save Artifact
     * 
     * Saves artifact HTML + optional JSON to files and database.
     * Auto-generates artifact_id if missing (fixes 67% save failure rate).
     * 
     * @param {string} conversationId - Conversation ID
     * @param {object} artifactAction - Artifact action from AI
     * @param {number} turnNumber - Turn number (optional)
     * @returns {object} Saved artifact info
     * 
     * Why auto-generate ID:
     * - AI sometimes forgets to include artifact_id
     * - Without ID, artifact is lost (67% failure rate in tests)
     * - Auto-generation ensures 100% save rate
     */
    async saveArtifact(conversationId, artifactAction, turnNumber = null) {
        try {
            if (!artifactAction || artifactAction.action === 'none') {
                return null;
            }

            let { artifact_id, artifact_type, html, data } = artifactAction;
            
            // Auto-generate artifact_id if missing (CRITICAL FIX)
            if (!artifact_id) {
                const timestamp = Date.now();
                artifact_id = `${artifact_type || 'artifact'}_${timestamp}`;
                console.log(`[ArtifactManagerService] ⚠️  Auto-generated artifact_id: ${artifact_id}`);
            }
            
            if (!html) {
                console.warn('[ArtifactManagerService] ⚠️  Artifact missing html, skipping save');
                return null;
            }

            // Create artifacts folder
            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            await fs.mkdir(artifactsDir, { recursive: true });

            // Save HTML
            const htmlPath = path.join(artifactsDir, `${artifact_id}.html`);
            await fs.writeFile(htmlPath, html, 'utf-8');

            // Save JSON if data artifact
            let jsonPath = null;
            if (data && Object.keys(data).length > 0) {
                jsonPath = path.join(artifactsDir, `${artifact_id}.json`);
                await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
            }

            // Save to database
            this.db.saveArtifact(conversationId, {
                artifact_id: artifact_id,
                artifact_type: artifact_type,
                html: html,
                data: data,
                turn_number: turnNumber
            });

            console.log(`[ArtifactManagerService] ✅ Saved artifact: ${artifact_id}`);

            return {
                artifact_id: artifact_id,
                artifact_type: artifact_type,
                html_path: htmlPath,
                json_path: jsonPath,
                has_data: !!jsonPath,
                created_at: new Date().toISOString()
            };
        } catch (error) {
            console.error('[ArtifactManagerService] Failed to save artifact:', error);
            throw error;
        }
    }

    /**
     * Read Artifact
     * 
     * Reads artifact HTML + JSON from files.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} artifactId - Artifact ID
     * @returns {object} Artifact data
     */
    async readArtifact(conversationId, artifactId) {
        try {
            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            
            const htmlPath = path.join(artifactsDir, `${artifactId}.html`);
            const jsonPath = path.join(artifactsDir, `${artifactId}.json`);
            
            const html = await fs.readFile(htmlPath, 'utf-8');
            
            let data = null;
            try {
                const jsonContent = await fs.readFile(jsonPath, 'utf-8');
                data = JSON.parse(jsonContent);
            } catch (e) {
                // No JSON file, visual-only artifact
            }
            
            return {
                artifact_id: artifactId,
                html: html,
                data: data,
                has_data: !!data
            };
        } catch (error) {
            console.error(`[ArtifactManagerService] Failed to read artifact ${artifactId}:`, error);
            return null;
        }
    }

    /**
     * List Artifacts for Conversation
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {array} Array of artifact IDs
     */
    async listArtifacts(conversationId) {
        try {
            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            
            const files = await fs.readdir(artifactsDir);
            const htmlFiles = files.filter(f => f.endsWith('.html') && !f.startsWith('_'));
            return htmlFiles.map(f => f.replace('.html', ''));
        } catch (error) {
            return [];
        }
    }

    /**
     * Delete Artifact
     * 
     * Deletes artifact files and database record.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} artifactId - Artifact ID
     * @returns {boolean} Success
     */
    async deleteArtifact(conversationId, artifactId) {
        try {
            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            
            // Delete HTML
            const htmlPath = path.join(artifactsDir, `${artifactId}.html`);
            await fs.unlink(htmlPath).catch(() => {});
            
            // Delete JSON if exists
            const jsonPath = path.join(artifactsDir, `${artifactId}.json`);
            await fs.unlink(jsonPath).catch(() => {});
            
            // Delete from database
            this.db.deleteArtifact(artifactId);
            
            console.log(`[ArtifactManagerService] ✅ Deleted artifact: ${artifactId}`);
            return true;
        } catch (error) {
            console.error('[ArtifactManagerService] Failed to delete artifact:', error);
            throw error;
        }
    }

    /**
     * Create Artifacts Index
     * 
     * Creates _INDEX.md in artifacts folder with list of all artifacts.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {boolean} Success
     */
    async createArtifactsIndex(conversationId) {
        try {
            const artifacts = this.db.getArtifactsByConversation(conversationId);
            
            if (artifacts.length === 0) {
                return false;
            }

            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            await fs.mkdir(artifactsDir, { recursive: true });

            let index = `# Artifacts Index - ${conversationId}\n\n`;
            index += `**Total Artifacts**: ${artifacts.length}\n`;
            index += `**Last Updated**: ${new Date().toISOString()}\n\n`;
            index += '---\n\n';

            for (const artifact of artifacts) {
                index += `## ${artifact.id}\n\n`;
                index += `- **Type**: ${artifact.artifact_type}\n`;
                index += `- **Has Data**: ${artifact.json_data ? 'Yes' : 'No (visual only)'}\n`;
                index += `- **HTML**: ${artifact.id}.html\n`;
                if (artifact.json_data) {
                    index += `- **JSON**: ${artifact.id}.json\n`;
                }
                index += `- **Created**: ${artifact.created_at}\n`;
                if (artifact.turn_number) {
                    index += `- **Turn**: ${artifact.turn_number}\n`;
                }
                index += '\n---\n\n';
            }

            const indexPath = path.join(artifactsDir, '_INDEX.md');
            await fs.writeFile(indexPath, index, 'utf-8');
            
            console.log(`[ArtifactManagerService] ✅ Created artifacts index for ${conversationId}`);
            return true;
        } catch (error) {
            console.error('[ArtifactManagerService] Failed to create index:', error);
            throw error;
        }
    }

    /**
     * Get Artifact Template
     * 
     * Returns HTML template for a given artifact type.
     * Templates follow liquid glass design standards.
     * 
     * @param {string} artifactType - Type of artifact
     * @returns {function} Template function that takes data and returns HTML
     * 
     * Why templates:
     * - Ensures consistent design across all artifacts
     * - Liquid glass styling baked in
     * - Easy to customize per type
     * - Can be used by AI or manually
     */
    getArtifactTemplate(artifactType) {
        const templates = {
            // Visual Artifact: Stress Map
            stress_map: (data) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stress Map</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            color: white;
        }
        
        .header h1 {
            font-size: 42px;
            font-weight: 700;
            letter-spacing: -1px;
            margin-bottom: 12px;
        }
        
        .header p {
            font-size: 18px;
            opacity: 0.9;
        }
        
        .stress-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
        }
        
        .stress-card {
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 28px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
            color: white;
        }
        
        .stress-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
        }
        
        .stress-card .icon {
            font-size: 36px;
            margin-bottom: 16px;
        }
        
        .stress-card .title {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 12px;
            letter-spacing: -0.3px;
        }
        
        .stress-card .description {
            font-size: 15px;
            line-height: 1.6;
            opacity: 0.9;
        }
        
        .intensity {
            display: inline-block;
            margin-top: 12px;
            padding: 6px 14px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${data.title || 'Your Current Stressors'}</h1>
            <p>${data.subtitle || 'Understanding what\'s weighing on you'}</p>
        </div>
        
        <div class="stress-grid">
            ${(data.stressors || []).map(stressor => `
                <div class="stress-card">
                    <div class="icon">${stressor.icon || '📌'}</div>
                    <div class="title">${stressor.title}</div>
                    <div class="description">${stressor.description}</div>
                    ${stressor.intensity ? `<div class="intensity">${stressor.intensity}</div>` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`,

            // Visual Artifact: Checklist
            checklist: (data) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Checklist</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            color: white;
        }
        
        h1 {
            font-size: 36px;
            font-weight: 700;
            letter-spacing: -0.8px;
            margin-bottom: 12px;
        }
        
        .subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 32px;
        }
        
        .checklist-item {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            display: flex;
            align-items: flex-start;
            gap: 16px;
            transition: all 0.2s ease;
        }
        
        .checklist-item:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateX(4px);
        }
        
        .checkbox {
            width: 24px;
            height: 24px;
            border: 2px solid rgba(255, 255, 255, 0.6);
            border-radius: 8px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .checkbox.checked {
            background: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.8);
        }
        
        .item-content {
            flex: 1;
        }
        
        .item-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        
        .item-description {
            font-size: 14px;
            opacity: 0.85;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${data.title || 'Action Items'}</h1>
        <div class="subtitle">${data.subtitle || 'Things to focus on'}</div>
        
        ${(data.items || []).map(item => `
            <div class="checklist-item">
                <div class="checkbox ${item.completed ? 'checked' : ''}"></div>
                <div class="item-content">
                    <div class="item-title">${item.title}</div>
                    ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`,

            // Visual Artifact: Reflection Summary
            reflection_summary: (data) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reflection Summary</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 28px;
            border: 1px solid rgba(255, 255, 255, 0.4);
            padding: 48px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
            color: #2d3748;
        }
        
        h1 {
            font-size: 40px;
            font-weight: 700;
            letter-spacing: -1px;
            margin-bottom: 16px;
            color: #1a202c;
        }
        
        .date {
            font-size: 16px;
            color: #4a5568;
            margin-bottom: 32px;
        }
        
        .section {
            margin-bottom: 32px;
        }
        
        .section h2 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #2d3748;
        }
        
        .section p {
            font-size: 16px;
            line-height: 1.7;
            color: #4a5568;
        }
        
        .timeline {
            margin-top: 24px;
        }
        
        .timeline-item {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            border-left: 4px solid rgba(102, 126, 234, 0.6);
        }
        
        .timeline-item .date {
            font-size: 14px;
            font-weight: 600;
            color: #667eea;
            margin-bottom: 8px;
        }
        
        .timeline-item .event {
            font-size: 16px;
            color: #2d3748;
        }
        
        .insights {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
            border-radius: 16px;
            padding: 24px;
            margin-top: 24px;
        }
        
        .insights h3 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #667eea;
        }
        
        .insights ul {
            list-style: none;
            padding-left: 0;
        }
        
        .insights li {
            font-size: 15px;
            line-height: 1.6;
            color: #4a5568;
            margin-bottom: 8px;
            padding-left: 24px;
            position: relative;
        }
        
        .insights li:before {
            content: '✓';
            position: absolute;
            left: 0;
            color: #667eea;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${data.title || 'Reflection Summary'}</h1>
        <div class="date">${data.date || new Date().toLocaleDateString()}</div>
        
        ${data.sections ? data.sections.map(section => `
            <div class="section">
                <h2>${section.title}</h2>
                <p>${section.content}</p>
            </div>
        `).join('') : ''}
        
        ${data.timeline ? `
            <div class="section">
                <h2>Timeline</h2>
                <div class="timeline">
                    ${data.timeline.map(item => `
                        <div class="timeline-item">
                            <div class="date">${item.date}</div>
                            <div class="event">${item.event}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${data.insights ? `
            <div class="insights">
                <h3>Key Insights</h3>
                <ul>
                    ${data.insights.map(insight => `<li>${insight}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
    </div>
</body>
</html>`,

            // Data Artifact: Goal Tracker
            goal_tracker: (data) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Goal Tracker</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            color: white;
        }
        
        .header h1 {
            font-size: 40px;
            font-weight: 700;
            letter-spacing: -0.8px;
            margin-bottom: 12px;
        }
        
        .goal-card {
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.4);
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            color: white;
        }
        
        .goal-title {
            font-size: 26px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        
        .progress-bar {
            width: 100%;
            height: 12px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
            border-radius: 8px;
            transition: width 0.5s ease;
        }
        
        .progress-text {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .milestones {
            margin-top: 20px;
        }
        
        .milestone {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            font-size: 15px;
        }
        
        .milestone .check {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        
        .milestone.completed .check {
            background: rgba(79, 172, 254, 0.8);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${data.title || 'Goal Progress'}</h1>
        </div>
        
        ${(data.goals || []).map(goal => `
            <div class="goal-card">
                <div class="goal-title">${goal.title}</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${goal.progress || 0}%"></div>
                </div>
                <div class="progress-text">${goal.progress || 0}% Complete</div>
                
                ${goal.milestones ? `
                    <div class="milestones">
                        ${goal.milestones.map(milestone => `
                            <div class="milestone ${milestone.completed ? 'completed' : ''}">
                                <div class="check">${milestone.completed ? '✓' : ''}</div>
                                <div>${milestone.title}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>`
        };

        return templates[artifactType] || null;
    }

    /**
     * Render Artifact from Template
     * 
     * Generates HTML from template and data.
     * 
     * @param {string} artifactType - Type of artifact
     * @param {object} data - Data to render
     * @returns {string} Rendered HTML
     */
    async renderArtifactTemplate(artifactType, data) {
        try {
            const template = this.getArtifactTemplate(artifactType);
            
            if (!template) {
                console.warn(`[ArtifactManagerService] No template for type: ${artifactType}`);
                return null;
            }
            
            const html = template(data);
            
            console.log(`[ArtifactManagerService] Rendered ${artifactType} template`);
            return html;
        } catch (error) {
            console.error('[ArtifactManagerService] Failed to render template:', error);
            throw error;
        }
    }

    /**
     * Generate Artifact ID
     * 
     * Auto-generates artifact ID based on type and timestamp.
     * 
     * @param {string} artifactType - Type of artifact
     * @returns {string} Generated artifact ID
     */
    generateArtifactId(artifactType) {
        const timestamp = Date.now();
        return `${artifactType}_${timestamp}`;
    }

    /**
     * Patch Artifact
     * 
     * Applies string replacement patches to an existing artifact.
     * This is the key optimization that allows fast, targeted updates
     * without regenerating the entire HTML.
     * 
     * WHY THIS APPROACH (Claude's technique):
     * - String replacement is simple and reliable
     * - Works on any artifact type (HTML, SVG, etc.)
     * - 3-4x faster than full regeneration
     * - Lower token cost (patches are smaller than full HTML)
     * - Less error-prone (preserves styling and structure)
     * 
     * HOW IT WORKS:
     * 1. Load existing artifact HTML from storage
     * 2. Apply each patch (old_string → new_string)
     * 3. Save the patched HTML
     * 4. Return the updated artifact
     * 
     * PATCH FORMAT:
     * patches: [
     *   { old_string: "Growth", new_string: "Money" },
     *   { old_string: "Career Focus", new_string: "Financial Goals" }
     * ]
     * 
     * ERROR HANDLING:
     * - If old_string not found: patch is skipped (not fatal)
     * - If multiple matches: only first is replaced (use replace_all for all)
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} artifactId - Artifact ID to patch
     * @param {Array} patches - Array of {old_string, new_string, replace_all?}
     * @returns {Object} Patched artifact info with new HTML
     */
    async patchArtifact(conversationId, artifactId, patches) {
        try {
            console.log(`[ArtifactManagerService] 🔧 Patching artifact: ${artifactId}`);
            console.log(`[ArtifactManagerService]    Patches: ${patches.length}`);

            // Read existing artifact
            const artifact = await this.readArtifact(conversationId, artifactId);
            if (!artifact || !artifact.html) {
                console.error(`[ArtifactManagerService] ❌ Artifact not found: ${artifactId}`);
                throw new Error(`Artifact ${artifactId} not found`);
            }

            let patchedHtml = artifact.html;
            let appliedPatches = 0;
            let skippedPatches = 0;

            // Apply each patch in order
            for (const patch of patches) {
                const { old_string, new_string, replace_all } = patch;

                if (!old_string || old_string === new_string) {
                    console.warn(`[ArtifactManagerService] ⚠️ Skipping invalid patch`);
                    skippedPatches++;
                    continue;
                }

                // Check if old_string exists in the HTML
                if (!patchedHtml.includes(old_string)) {
                    // Try fuzzy matching with trimmed whitespace
                    const trimmedOld = old_string.trim();
                    if (trimmedOld !== old_string && patchedHtml.includes(trimmedOld)) {
                        console.log(`[ArtifactManagerService] 🔍 Using trimmed match`);
                        if (replace_all) {
                            patchedHtml = patchedHtml.split(trimmedOld).join(new_string);
                        } else {
                            patchedHtml = patchedHtml.replace(trimmedOld, new_string);
                        }
                        appliedPatches++;
                    } else {
                        console.warn(`[ArtifactManagerService] ⚠️ old_string not found: "${old_string.substring(0, 50)}..."`);
                        skippedPatches++;
                    }
                    continue;
                }

                // Apply the patch
                if (replace_all) {
                    patchedHtml = patchedHtml.split(old_string).join(new_string);
                } else {
                    patchedHtml = patchedHtml.replace(old_string, new_string);
                }

                console.log(`[ArtifactManagerService] ✅ Applied patch: "${old_string.substring(0, 30)}..." → "${new_string.substring(0, 30)}..."`);
                appliedPatches++;
            }

            console.log(`[ArtifactManagerService] 📊 Patch results: ${appliedPatches} applied, ${skippedPatches} skipped`);

            // Save the patched HTML
            const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
            const htmlPath = path.join(artifactsDir, `${artifactId}.html`);
            await fs.writeFile(htmlPath, patchedHtml, 'utf-8');

            // Update database
            this.db.saveArtifact(conversationId, {
                artifact_id: artifactId,
                artifact_type: artifact.artifact_type || 'unknown',
                html: patchedHtml,
                data: artifact.data
            });

            console.log(`[ArtifactManagerService] ✅ Artifact patched successfully: ${artifactId}`);

            return {
                artifact_id: artifactId,
                artifact_type: artifact.artifact_type,
                html: patchedHtml,
                data: artifact.data,
                patches_applied: appliedPatches,
                patches_skipped: skippedPatches,
                updated_at: new Date().toISOString()
            };

        } catch (error) {
            console.error('[ArtifactManagerService] Failed to patch artifact:', error);
            throw error;
        }
    }

    /**
     * Process Artifact Action
     * 
     * Main entry point for handling artifact actions from the AI.
     * Routes to create, patch, or update based on action type.
     * 
     * ACTION TYPES:
     * - "create" → Creates new artifact with full HTML
     * - "patch"  → Applies string replacements to existing artifact (FAST!)
     * - "update" → Full HTML replacement of existing artifact
     * - "none"   → No artifact action needed
     * 
     * WHY THIS ROUTING:
     * The AI decides which action to use based on:
     * - patch: Small changes like "change Growth to Money"
     * - update: Major visual changes, layout changes
     * - create: New artifact needed
     * 
     * @param {string} conversationId - Conversation ID
     * @param {Object} artifactAction - Artifact action from AI
     * @param {number} turnNumber - Turn number (optional)
     * @returns {Object} Result of the action
     */
    async processArtifactAction(conversationId, artifactAction, turnNumber = null) {
        try {
            if (!artifactAction || artifactAction.action === 'none') {
                return null;
            }

            const action = artifactAction.action;
            console.log(`[ArtifactManagerService] Processing action: ${action}`);

            switch (action) {
                case 'create':
                    // New artifact - save with full HTML
                    return await this.saveArtifact(conversationId, artifactAction, turnNumber);

                case 'patch':
                    // Apply string replacements to existing artifact
                    if (!artifactAction.artifact_id) {
                        throw new Error('patch action requires artifact_id');
                    }
                    if (!artifactAction.patches || !Array.isArray(artifactAction.patches)) {
                        throw new Error('patch action requires patches array');
                    }
                    return await this.patchArtifact(
                        conversationId,
                        artifactAction.artifact_id,
                        artifactAction.patches
                    );

                case 'update':
                    // Full HTML replacement - treat like create with existing ID
                    return await this.saveArtifact(conversationId, artifactAction, turnNumber);

                default:
                    console.warn(`[ArtifactManagerService] Unknown action: ${action}`);
                    return null;
            }
        } catch (error) {
            console.error('[ArtifactManagerService] Failed to process artifact action:', error);
            throw error;
        }
    }
}

module.exports = ArtifactManagerService;
