/**
 * AREA MANAGER SERVICE
 * 
 * Purpose:
 * Manages the Life Areas hierarchy system - a folder-based structure for organizing
 * personal life information that the AI can read, create, edit, and restructure.
 * 
 * Architecture:
 * - Markdown files for human-readable storage
 * - Database for metadata and fast queries
 * - Newest-first entry ordering (critical for UX)
 * - AI-maintained summaries at top of each document
 * 
 * Key Innovation:
 * Areas grow organically: Document → Area → Subproject as complexity increases.
 * This mirrors how humans naturally organize their lives.
 * 
 * Why Markdown + Database:
 * - Markdown: Human-readable, version-controllable, portable
 * - Database: Fast queries, relationships, metadata
 * - Best of both worlds
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * AreaManagerService Class
 * 
 * Manages life areas file system operations and database synchronization.
 */
class AreaManagerService {
    /**
     * Constructor
     * 
     * @param {DatabaseService} databaseService - Database service instance
     * @param {string} userDataDir - Path to user_data directory
     * 
     * Why we pass DatabaseService:
     * - Keeps database operations centralized
     * - Allows transaction management
     * - Makes testing easier (can mock database)
     */
    constructor(databaseService, userDataDir) {
        this.db = databaseService;
        this.userDataDir = userDataDir;
        this.lifeAreasDir = path.join(userDataDir, 'life_areas');
        
        console.log(`[AreaManagerService] Initialized with data dir: ${userDataDir}`);
    }

    /**
     * Initialize Life Areas System
     * 
     * Creates base directory structure and master index.
     * Called on app startup.
     */
    async initializeLifeAreas() {
        try {
            // Ensure life_areas directory exists
            await fs.mkdir(this.lifeAreasDir, { recursive: true });
            
            // Create master index if it doesn't exist
            const indexPath = path.join(this.lifeAreasDir, '_AREAS_INDEX.md');
            try {
                await fs.access(indexPath);
            } catch {
                // Index doesn't exist, create it
                await this.createMasterIndex();
            }
            
            console.log('[AreaManagerService] Life areas initialized');
        } catch (error) {
            console.error('[AreaManagerService] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Create Master Index
     * 
     * Creates _AREAS_INDEX.md with overview of all areas.
     * This file is regenerated whenever areas change.
     */
    async createMasterIndex() {
        const indexPath = path.join(this.lifeAreasDir, '_AREAS_INDEX.md');
        
        const content = `# Life Areas Index

**Last Updated**: ${new Date().toISOString()}

## Active Areas

_No areas created yet. Areas will appear here as you discuss different aspects of your life._

## Getting Started

Life areas are created automatically when you discuss topics like:
- 👨‍👩‍👧‍👦 **Family** - Kids, partner, extended family
- 💼 **Work** - Career, projects, goals
- 🌱 **Personal Growth** - Learning, health, habits
- 🏡 **Home** - House projects, maintenance
- ❤️ **Relationships** - Friends, social life
- 💰 **Finances** - Budget, savings, investments
- 🎨 **Hobbies** - Interests, creative projects

Just start talking about what matters to you, and I'll organize it automatically.

---

_This index is automatically maintained by BubbleVoice._
`;

        await fs.writeFile(indexPath, content, 'utf-8');
        console.log('[AreaManagerService] Created master index');
    }

    /**
     * Create Area
     * 
     * Creates a new life area with folder structure, summary, and initial documents.
     * 
     * @param {string} areaPath - Area path (e.g., "Family/Emma_School")
     * @param {string} name - Human-readable name (e.g., "Emma's School")
     * @param {string} description - Area description
     * @param {array} initialDocuments - Initial document names (e.g., ["struggles.md", "wins.md"])
     * @returns {object} Created area info
     * 
     * Why newest-first ordering:
     * - Humans naturally think about recent events first
     * - AI can read top N entries without reading entire file
     * - Matches how people scroll (top = newest)
     */
    async createArea(areaPath, name, description = '', initialDocuments = []) {
        try {
            console.log(`[AreaManagerService] Creating area: ${areaPath}`);
            
            // Create folder structure
            const fullPath = path.join(this.lifeAreasDir, areaPath);
            await fs.mkdir(fullPath, { recursive: true });
            
            // Determine parent path
            const pathParts = areaPath.split('/');
            const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : null;
            
            // Create in database
            const area = this.db.createArea(areaPath, name, parentPath, description);
            
            // Create area summary
            await this.createAreaSummary(areaPath, name, description);
            
            // Create initial documents
            for (const docName of initialDocuments) {
                await this.createDocument(areaPath, docName);
            }
            
            // Update master index
            await this.updateMasterIndex();
            
            console.log(`[AreaManagerService] ✅ Created area: ${areaPath}`);
            
            return {
                path: areaPath,
                name: name,
                fullPath: fullPath,
                documentsCreated: initialDocuments.length
            };
        } catch (error) {
            console.error('[AreaManagerService] Failed to create area:', error);
            throw error;
        }
    }

    /**
     * Create Area Summary
     * 
     * Creates _AREA_SUMMARY.md file with AI-maintained overview.
     * This file is at the top of every area folder.
     * 
     * @param {string} areaPath - Area path
     * @param {string} name - Area name
     * @param {string} description - Area description
     */
    async createAreaSummary(areaPath, name, description) {
        const summaryPath = path.join(this.lifeAreasDir, areaPath, '_AREA_SUMMARY.md');
        
        const content = `# ${name} - Area Summary

**Created**: ${new Date().toISOString().split('T')[0]}  
**Last Updated**: ${new Date().toISOString()}  
**Parent Area**: ${areaPath.includes('/') ? areaPath.split('/')[0] : 'Root'}  
**Status**: Active

---

## Current Situation

${description || '_No description yet. This will be updated as conversations progress._'}

**Key Concerns**:
- _Will be added as topics are discussed_

**What's Working**:
- _Will be added as progress is made_

---

## Timeline Highlights

_Timeline will be populated as significant events occur_

---

## Related Areas

_Related areas will be linked here as connections emerge_

---

## AI Notes

_AI observations and patterns will be noted here_

---

_This summary is automatically maintained by BubbleVoice._
`;

        await fs.writeFile(summaryPath, content, 'utf-8');
        console.log(`[AreaManagerService] Created summary for: ${areaPath}`);
    }

    /**
     * Create Document
     * 
     * Creates a time-ordered log document with summary section at top.
     * 
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name (e.g., "reading_comprehension.md")
     * 
     * Document structure:
     * - Summary section (AI-maintained)
     * - Entries section (newest first)
     */
    async createDocument(areaPath, documentName) {
        const docPath = path.join(this.lifeAreasDir, areaPath, documentName);
        
        // Ensure .md extension
        const fileName = documentName.endsWith('.md') ? documentName : `${documentName}.md`;
        const finalPath = path.join(this.lifeAreasDir, areaPath, fileName);
        
        // Create readable title from filename
        const title = fileName
            .replace('.md', '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        
        const content = `# ${title}

**Area**: ${areaPath}  
**Document Type**: Time-Ordered Log  
**Created**: ${new Date().toISOString().split('T')[0]}

---

## Summary (AI-Maintained)

_This summary will be updated as entries are added._

**Frequency**: _Not yet determined_  
**Sentiment Trend**: _Not yet determined_  
**Action Items**: _None yet_

---

## Entries (Newest First)

_Entries will appear here as conversations progress._

---
`;

        await fs.writeFile(finalPath, content, 'utf-8');
        console.log(`[AreaManagerService] Created document: ${areaPath}/${fileName}`);
    }

    /**
     * Append Entry to Document
     * 
     * CRITICAL: Adds entry at TOP (below summary), not bottom.
     * This is the key innovation for UX - newest content is immediately visible.
     * 
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name
     * @param {object} entry - Entry data
     * @returns {object} Entry info
     * 
     * Entry format:
     * ### YYYY-MM-DD HH:MM:SS
     * **Conversation Context**: [context]
     * 
     * [content]
     * 
     * **User Quote**: "[quote]"
     * **AI Observation**: [observation]
     * **Sentiment**: [sentiment]
     */
    async appendEntry(areaPath, documentName, entry) {
        try {
            const fileName = documentName.endsWith('.md') ? documentName : `${documentName}.md`;
            const docPath = path.join(this.lifeAreasDir, areaPath, fileName);
            
            // Read existing content
            let content;
            try {
                content = await fs.readFile(docPath, 'utf-8');
            } catch {
                // Document doesn't exist, create it
                await this.createDocument(areaPath, documentName);
                content = await fs.readFile(docPath, 'utf-8');
            }
            
            // Find the "## Entries (Newest First)" section
            const entriesSectionMarker = '## Entries (Newest First)';
            const entriesIndex = content.indexOf(entriesSectionMarker);
            
            if (entriesIndex === -1) {
                throw new Error('Document format invalid: missing Entries section');
            }
            
            // Find the end of the section header (after the next line)
            const afterHeader = content.indexOf('\n', entriesIndex + entriesSectionMarker.length);
            
            // Format timestamp
            const timestamp = entry.timestamp || new Date().toISOString();
            const formattedTimestamp = timestamp.replace('T', ' ').split('.')[0];
            
            // Build entry content
            const entryContent = `

### ${formattedTimestamp}
**Conversation Context**: ${entry.conversation_context || 'General discussion'}

${entry.content}

${entry.user_quote ? `**User Quote**: "${entry.user_quote}"\n\n` : ''}${entry.ai_observation ? `**AI Observation**: ${entry.ai_observation}\n\n` : ''}${entry.sentiment ? `**Sentiment**: ${entry.sentiment}\n\n` : ''}${entry.related_paths && entry.related_paths.length > 0 ? `**Related**: ${entry.related_paths.join(', ')}\n\n` : ''}---
`;
            
            // Insert entry at TOP (right after "## Entries (Newest First)" header)
            const newContent = content.slice(0, afterHeader) + entryContent + content.slice(afterHeader);
            
            // Write back to file
            await fs.writeFile(docPath, newContent, 'utf-8');
            
            // Add to database
            const dbEntry = this.db.addEntry(areaPath, fileName, {
                timestamp: timestamp,
                content: entry.content,
                user_quote: entry.user_quote || null,
                ai_observation: entry.ai_observation || null,
                sentiment: entry.sentiment || null,
                conversation_id: entry.conversation_id || null
            });
            
            console.log(`[AreaManagerService] ✅ Appended entry to ${areaPath}/${fileName}`);
            
            return {
                entryId: dbEntry.id,
                areaPath: areaPath,
                documentName: fileName,
                timestamp: timestamp
            };
        } catch (error) {
            console.error('[AreaManagerService] Failed to append entry:', error);
            throw error;
        }
    }

    /**
     * Get Area Summary
     * 
     * Reads the _AREA_SUMMARY.md file for an area.
     * 
     * @param {string} areaPath - Area path
     * @returns {string} Summary content
     */
    async getAreaSummary(areaPath) {
        try {
            const summaryPath = path.join(this.lifeAreasDir, areaPath, '_AREA_SUMMARY.md');
            const content = await fs.readFile(summaryPath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[AreaManagerService] Failed to get area summary:', error);
            return null;
        }
    }

    /**
     * Update Area Summary
     * 
     * Updates specific sections of the area summary.
     * 
     * @param {string} areaPath - Area path
     * @param {object} updates - Sections to update
     * @returns {boolean} Success
     * 
     * Updates can include:
     * - current_situation: New situation description
     * - timeline_highlight: { date, event } to add
     * - ai_notes: New AI observation
     */
    async updateAreaSummary(areaPath, updates) {
        try {
            const summaryPath = path.join(this.lifeAreasDir, areaPath, '_AREA_SUMMARY.md');
            let content = await fs.readFile(summaryPath, 'utf-8');
            
            // Update "Last Updated" timestamp
            const now = new Date().toISOString();
            content = content.replace(
                /\*\*Last Updated\*\*: .*/,
                `**Last Updated**: ${now}`
            );
            
            // Update Current Situation if provided
            if (updates.current_situation) {
                const situationRegex = /(## Current Situation\n\n)([\s\S]*?)(\n\n\*\*Key Concerns)/;
                content = content.replace(
                    situationRegex,
                    `$1${updates.current_situation}$3`
                );
            }
            
            // Add timeline highlight if provided
            if (updates.timeline_highlight) {
                const { date, event } = updates.timeline_highlight;
                const timelineMarker = '## Timeline Highlights';
                const timelineIndex = content.indexOf(timelineMarker);
                
                if (timelineIndex !== -1) {
                    const afterHeader = content.indexOf('\n', timelineIndex + timelineMarker.length);
                    const highlight = `\n- **${date}**: ${event}`;
                    
                    // Check if this is the first highlight (remove placeholder)
                    if (content.includes('_Timeline will be populated')) {
                        content = content.replace(
                            '_Timeline will be populated as significant events occur_',
                            highlight.trim()
                        );
                    } else {
                        // Add to existing highlights
                        content = content.slice(0, afterHeader) + highlight + content.slice(afterHeader);
                    }
                }
            }
            
            // Update AI Notes if provided
            if (updates.ai_notes) {
                const notesRegex = /(## AI Notes\n\n)([\s\S]*?)(\n\n---)/;
                content = content.replace(
                    notesRegex,
                    `$1${updates.ai_notes}$3`
                );
            }
            
            // Write back
            await fs.writeFile(summaryPath, content, 'utf-8');
            
            // Update database
            this.db.updateArea(areaPath, {});
            
            console.log(`[AreaManagerService] ✅ Updated summary for: ${areaPath}`);
            return true;
        } catch (error) {
            console.error('[AreaManagerService] Failed to update summary:', error);
            throw error;
        }
    }

    /**
     * Get Recent Entries from Area
     * 
     * Reads recent entries from a document.
     * 
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name
     * @param {number} count - Number of entries to retrieve
     * @returns {array} Array of entries
     */
    async getRecentEntries(areaPath, documentName, count = 5) {
        try {
            const fileName = documentName.endsWith('.md') ? documentName : `${documentName}.md`;
            
            // Get from database (faster)
            const entries = this.db.getEntries(areaPath, fileName, count);
            
            return entries;
        } catch (error) {
            console.error('[AreaManagerService] Failed to get recent entries:', error);
            return [];
        }
    }

    /**
     * Read Areas for Context
     * 
     * Reads multiple areas and returns their content for prompt injection.
     * 
     * @param {array} paths - Array of area paths to read
     * @returns {object} Context object with area contents
     */
    async readForContext(paths) {
        try {
            const context = {};
            
            for (const areaPath of paths) {
                // Get area summary
                const summary = await this.getAreaSummary(areaPath);
                
                // Get recent entries from database
                const area = this.db.getArea(areaPath);
                const recentEntries = this.db.getRecentEntries(10); // Get last 10 across all areas
                const areaEntries = recentEntries.filter(e => e.area_path === areaPath);
                
                context[areaPath] = {
                    summary: summary,
                    recentEntries: areaEntries,
                    entryCount: area ? area.entry_count : 0,
                    lastActivity: area ? area.last_activity : null
                };
            }
            
            console.log(`[AreaManagerService] Read ${paths.length} areas for context`);
            return context;
        } catch (error) {
            console.error('[AreaManagerService] Failed to read for context:', error);
            return {};
        }
    }

    /**
     * Generate Areas Tree
     * 
     * Generates a compact tree view of all areas for prompt injection.
     * Target: < 300 tokens
     * 
     * @returns {string} Compact tree representation
     * 
     * Format:
     * - Family/ (2 subprojects, last active 2h ago)
     *   - Emma_School/ (3 documents, last active 2h ago)
     *   - Max_Activities/ (1 document, last active 3d ago)
     */
    async generateAreasTree() {
        try {
            const areas = this.db.getAllAreas();
            
            if (areas.length === 0) {
                return 'LIFE AREAS: None created yet';
            }
            
            // Build tree structure
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
            
            // Format as compact string
            let output = 'LIFE AREAS STRUCTURE:\n\n';
            
            const formatNode = (node, indent = 0) => {
                let result = '';
                const prefix = '  '.repeat(indent);
                
                for (const [key, value] of Object.entries(node)) {
                    if (key === 'children') continue;
                    
                    const childCount = Object.keys(node[key].children || {}).length;
                    const lastActivity = this.formatRelativeTime(node[key].last_activity);
                    
                    result += `${prefix}- ${key}/ (${node[key].entry_count} entries, ${childCount} sub${childCount === 1 ? '' : 's'}, ${lastActivity})\n`;
                    
                    if (node[key].children && Object.keys(node[key].children).length > 0) {
                        result += formatNode(node[key].children, indent + 1);
                    }
                }
                
                return result;
            };
            
            output += formatNode(tree);
            
            return output;
        } catch (error) {
            console.error('[AreaManagerService] Failed to generate tree:', error);
            return 'LIFE AREAS: Error generating tree';
        }
    }

    /**
     * Get Compact Areas Tree
     * 
     * Alias for generateAreasTree for consistency with documentation.
     */
    async getAreasTreeCompact() {
        return this.generateAreasTree();
    }

    /**
     * Format Relative Time
     * 
     * Converts timestamp to human-readable relative time.
     * 
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Relative time (e.g., "2h ago", "3d ago")
     */
    formatRelativeTime(timestamp) {
        if (!timestamp) return 'never';
        
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    /**
     * Update Master Index
     * 
     * Regenerates _AREAS_INDEX.md with current areas.
     */
    async updateMasterIndex() {
        try {
            const areas = this.db.getAllAreas();
            const indexPath = path.join(this.lifeAreasDir, '_AREAS_INDEX.md');
            
            let content = `# Life Areas Index

**Last Updated**: ${new Date().toISOString()}

## Active Areas (${areas.length})

`;
            
            if (areas.length === 0) {
                content += '_No areas created yet._\n\n';
            } else {
                // Group by top-level area
                const topLevel = {};
                
                areas.forEach(area => {
                    const topLevelName = area.path.split('/')[0];
                    if (!topLevel[topLevelName]) {
                        topLevel[topLevelName] = [];
                    }
                    topLevel[topLevelName].push(area);
                });
                
                // Format each top-level area
                for (const [topName, areaList] of Object.entries(topLevel)) {
                    const mainArea = areaList.find(a => a.path === topName) || areaList[0];
                    const subprojects = areaList.filter(a => a.path !== topName);
                    
                    content += `### ${mainArea.name}\n`;
                    content += `- **Path**: \`${mainArea.path}\`\n`;
                    content += `- **Subprojects**: ${subprojects.length}\n`;
                    content += `- **Total Entries**: ${areaList.reduce((sum, a) => sum + a.entry_count, 0)}\n`;
                    content += `- **Last Activity**: ${this.formatRelativeTime(mainArea.last_activity)}\n`;
                    content += '\n';
                }
            }
            
            content += `## Statistics

- **Total Areas**: ${areas.length}
- **Total Entries**: ${areas.reduce((sum, a) => sum + a.entry_count, 0)}

---

_This index is automatically maintained by BubbleVoice._
`;
            
            await fs.writeFile(indexPath, content, 'utf-8');
            console.log('[AreaManagerService] Updated master index');
        } catch (error) {
            console.error('[AreaManagerService] Failed to update master index:', error);
        }
    }

    /**
     * Delete Area
     * 
     * Deletes area folder and database records.
     * 
     * @param {string} areaPath - Area path
     * @returns {boolean} Success
     */
    async deleteArea(areaPath) {
        try {
            // Delete from database (cascade deletes entries)
            this.db.deleteArea(areaPath);
            
            // Delete folder
            const fullPath = path.join(this.lifeAreasDir, areaPath);
            await fs.rm(fullPath, { recursive: true, force: true });
            
            // Update master index
            await this.updateMasterIndex();
            
            console.log(`[AreaManagerService] ✅ Deleted area: ${areaPath}`);
            return true;
        } catch (error) {
            console.error('[AreaManagerService] Failed to delete area:', error);
            throw error;
        }
    }

    /**
     * Promote Document to Subproject
     * 
     * Converts a document into a folder with substructure.
     * Example: reading_comprehension.md → Reading_Comprehension/ with multiple docs
     * 
     * @param {string} documentPath - Full path to document (e.g., "Family/Emma_School/reading.md")
     * @param {string} newPath - New subproject path
     * @param {object} structure - Initial substructure
     * @returns {object} Result
     */
    async promoteToSubproject(documentPath, newPath, structure = {}) {
        try {
            console.log(`[AreaManagerService] Promoting ${documentPath} to ${newPath}`);
            
            // Read existing document
            const oldDocPath = path.join(this.lifeAreasDir, documentPath);
            const content = await fs.readFile(oldDocPath, 'utf-8');
            
            // Create new area
            await this.createArea(
                newPath,
                structure.name || newPath.split('/').pop(),
                structure.description || 'Promoted from document',
                structure.initial_documents || ['main.md']
            );
            
            // Copy content to main.md in new area
            const mainDocPath = path.join(this.lifeAreasDir, newPath, 'main.md');
            await fs.writeFile(mainDocPath, content, 'utf-8');
            
            // Delete old document
            await fs.unlink(oldDocPath);
            
            console.log(`[AreaManagerService] ✅ Promoted to subproject: ${newPath}`);
            
            return {
                oldPath: documentPath,
                newPath: newPath,
                success: true
            };
        } catch (error) {
            console.error('[AreaManagerService] Failed to promote:', error);
            throw error;
        }
    }
}

module.exports = AreaManagerService;
