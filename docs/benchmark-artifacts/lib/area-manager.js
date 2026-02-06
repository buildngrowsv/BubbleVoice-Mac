/**
 * area-manager.js
 * 
 * Manages the hierarchical life areas system for BubbleVoice Mac.
 * Handles file system operations for creating, reading, updating areas and documents.
 * 
 * CORE PRINCIPLES:
 * - Areas are organized hierarchically (folders within folders)
 * - Every folder has _AREA_SUMMARY.md (AI-maintained overview)
 * - Documents grow from the top (newest entries first, below summary)
 * - Areas can be promoted from documents to subprojects (folders)
 * - All operations are designed for vector search optimization
 * 
 * DOCUMENT TYPES:
 * 1. Time-Ordered Logs: Timestamped entries, newest at top (e.g., struggles.md)
 * 2. Reference Documents: Static info, updated in place (e.g., teacher_info.md)
 * 3. Task Lists: Checkbox format with dates (e.g., home_projects.md)
 * 
 * This was built to support the personal AI companion use case where the AI needs to:
 * - Remember conversations about life (kids, work, goals, struggles)
 * - Organize information hierarchically as complexity grows
 * - Retrieve relevant context via vector search
 * - Maintain summaries that provide quick context
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Base directory for all user data.
 * In production, this would be in the user's home directory or app data folder.
 * For benchmarking, we use a local directory.
 */
const USER_DATA_DIR = path.join(__dirname, '..', 'user_data');
const LIFE_AREAS_DIR = path.join(USER_DATA_DIR, 'life_areas');

/**
 * Special filenames used throughout the system.
 * These are reserved and have specific meanings.
 */
const SPECIAL_FILES = {
  AREAS_INDEX: '_AREAS_INDEX.md',      // Master index of all areas
  AREA_SUMMARY: '_AREA_SUMMARY.md',    // Summary for each area folder
};

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the life areas system.
 * Creates the base directory structure if it doesn't exist.
 * 
 * This is called once at app startup or before running benchmarks.
 * It's safe to call multiple times (idempotent).
 */
function initializeLifeAreas() {
  // Create base directories if they don't exist
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }
  
  if (!fs.existsSync(LIFE_AREAS_DIR)) {
    fs.mkdirSync(LIFE_AREAS_DIR, { recursive: true });
  }
  
  // Create master index if it doesn't exist
  const indexPath = path.join(LIFE_AREAS_DIR, SPECIAL_FILES.AREAS_INDEX);
  if (!fs.existsSync(indexPath)) {
    const initialIndex = generateAreasIndex([]);
    fs.writeFileSync(indexPath, initialIndex, 'utf8');
  }
  
  return LIFE_AREAS_DIR;
}

// =============================================================================
// AREAS TREE GENERATION
// =============================================================================

/**
 * Generate a tree view of all life areas.
 * This is injected into the AI's prompt for every conversation turn.
 * 
 * Returns a compact, human-readable representation of the folder structure
 * with metadata about last activity and number of documents.
 * 
 * Example output:
 * - Family/ (2 subprojects, last active 2h ago)
 *   - Emma_School/ (3 documents, last active 2h ago)
 *   - Max_Activities/ (1 document, last active 3d ago)
 * - Work/ (1 subproject, last active 1d ago)
 *   - Startup/ (3 subprojects, last active 1d ago)
 * 
 * @param {string} basePath - Base path to scan (defaults to LIFE_AREAS_DIR)
 * @param {number} depth - Current depth (for indentation)
 * @returns {string} - Tree representation
 */
function generateAreasTree(basePath = LIFE_AREAS_DIR, depth = 0) {
  const indent = '  '.repeat(depth);
  let tree = '';
  
  try {
    const items = fs.readdirSync(basePath, { withFileTypes: true });
    
    // Filter out special files and hidden files
    const folders = items.filter(item => 
      item.isDirectory() && 
      !item.name.startsWith('.') &&
      !item.name.startsWith('_')
    );
    
    const documents = items.filter(item => 
      item.isFile() && 
      !item.name.startsWith('_') &&
      item.name.endsWith('.md')
    );
    
    // Process folders (areas/subprojects)
    for (const folder of folders) {
      const folderPath = path.join(basePath, folder.name);
      const stats = getAreaStats(folderPath);
      
      tree += `${indent}- ${folder.name}/ (${stats.subprojects} subprojects, ${stats.documents} documents, last active ${stats.lastActivity})\n`;
      
      // Recurse into subfolders
      tree += generateAreasTree(folderPath, depth + 1);
    }
    
    // Process documents (endpoints)
    for (const doc of documents) {
      const docPath = path.join(basePath, doc.name);
      const stats = fs.statSync(docPath);
      const lastActivity = getRelativeTime(stats.mtime);
      
      tree += `${indent}- ${doc.name} (last active ${lastActivity})\n`;
    }
    
  } catch (error) {
    console.error(`Error generating tree for ${basePath}:`, error.message);
  }
  
  return tree;
}

/**
 * Get statistics for an area (folder).
 * Used by generateAreasTree to show metadata.
 * 
 * @param {string} areaPath - Path to the area folder
 * @returns {object} - Stats object with subprojects, documents, lastActivity
 */
function getAreaStats(areaPath) {
  try {
    const items = fs.readdirSync(areaPath, { withFileTypes: true });
    
    const subprojects = items.filter(item => 
      item.isDirectory() && 
      !item.name.startsWith('.') &&
      !item.name.startsWith('_')
    ).length;
    
    const documents = items.filter(item => 
      item.isFile() && 
      !item.name.startsWith('_') &&
      item.name.endsWith('.md')
    ).length;
    
    // Find most recent modification time
    let lastMtime = new Date(0);
    for (const item of items) {
      const itemPath = path.join(areaPath, item.name);
      const stats = fs.statSync(itemPath);
      if (stats.mtime > lastMtime) {
        lastMtime = stats.mtime;
      }
    }
    
    return {
      subprojects,
      documents,
      lastActivity: getRelativeTime(lastMtime)
    };
    
  } catch (error) {
    return {
      subprojects: 0,
      documents: 0,
      lastActivity: 'unknown'
    };
  }
}

/**
 * Convert a Date to relative time string (e.g., "2h ago", "3d ago").
 * 
 * @param {Date} date - Date to convert
 * @returns {string} - Relative time string
 */
function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

// =============================================================================
// AREA OPERATIONS
// =============================================================================

/**
 * Create a new life area (folder with summary and initial documents).
 * 
 * This is called when the AI decides a new area is needed based on conversation.
 * For example, when user first mentions "Emma's school struggles", the AI creates
 * Family/Emma_School/ with initial documents like struggles.md and wins.md.
 * 
 * @param {object} params - Creation parameters
 * @param {string} params.path - Relative path (e.g., "Family/Emma_School")
 * @param {string} params.area_name - Human-readable name (e.g., "Emma's School")
 * @param {string} params.description - Brief description of the area
 * @param {array} params.initial_documents - Array of document names to create
 * @returns {object} - Result object with success status and created paths
 */
function createArea({ path: areaPath, area_name, description, initial_documents = [] }) {
  try {
    const fullPath = path.join(LIFE_AREAS_DIR, areaPath);
    
    // Create the folder
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    // Create _AREA_SUMMARY.md
    const summaryPath = path.join(fullPath, SPECIAL_FILES.AREA_SUMMARY);
    const summaryContent = generateAreaSummary({
      area_name,
      path: areaPath,
      description,
      created: new Date().toISOString().split('T')[0],
      parent_area: getParentAreaName(areaPath)
    });
    fs.writeFileSync(summaryPath, summaryContent, 'utf8');
    
    // Create initial documents
    const createdDocs = [];
    for (const docName of initial_documents) {
      const docPath = path.join(fullPath, docName);
      const docContent = generateTimeOrderedDocument({
        title: docName.replace('.md', '').replace(/_/g, ' '),
        area_path: areaPath,
        created: new Date().toISOString().split('T')[0]
      });
      fs.writeFileSync(docPath, docContent, 'utf8');
      createdDocs.push(docName);
    }
    
    // Update master index
    updateMasterIndex();
    
    return {
      success: true,
      area_path: areaPath,
      created_documents: createdDocs
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Append a new entry to a time-ordered document.
 * 
 * CRITICAL: Entries are added at the TOP (below the summary section).
 * This keeps the most recent information first, making it easy for humans
 * to scan and for vector search to find recent context.
 * 
 * @param {object} params - Append parameters
 * @param {string} params.path - Path to document (e.g., "Family/Emma_School/struggles.md")
 * @param {object} params.entry - Entry object with timestamp, content, etc.
 * @returns {object} - Result object with success status
 */
function appendEntry({ path: docPath, entry }) {
  try {
    const fullPath = path.join(LIFE_AREAS_DIR, docPath);
    
    // Read existing document
    let content = '';
    if (fs.existsSync(fullPath)) {
      content = fs.readFileSync(fullPath, 'utf8');
    } else {
      // Document doesn't exist - create it
      const docName = path.basename(docPath, '.md');
      const areaPath = path.dirname(docPath);
      content = generateTimeOrderedDocument({
        title: docName.replace(/_/g, ' '),
        area_path: areaPath,
        created: new Date().toISOString().split('T')[0]
      });
    }
    
    // Find the "## Entries (Newest First)" section
    const entriesMarker = '## Entries (Newest First)';
    const markerIndex = content.indexOf(entriesMarker);
    
    if (markerIndex === -1) {
      throw new Error('Document does not have "## Entries (Newest First)" section');
    }
    
    // Generate the new entry markdown
    const entryMarkdown = generateEntryMarkdown(entry);
    
    // Insert the new entry right after the marker (and its newlines)
    const insertIndex = markerIndex + entriesMarker.length;
    const beforeInsert = content.substring(0, insertIndex);
    const afterInsert = content.substring(insertIndex);
    
    // Combine: before + newlines + new entry + after
    const updatedContent = beforeInsert + '\n\n' + entryMarkdown + afterInsert;
    
    // Write back to file
    fs.writeFileSync(fullPath, updatedContent, 'utf8');
    
    return {
      success: true,
      document_path: docPath,
      entry_timestamp: entry.timestamp
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update an area's summary file.
 * 
 * The AI calls this to keep the _AREA_SUMMARY.md current as new information
 * emerges from conversations. Summaries provide quick context for both the AI
 * and the user.
 * 
 * @param {object} params - Update parameters
 * @param {string} params.path - Path to _AREA_SUMMARY.md
 * @param {object} params.summary_updates - Object with fields to update
 * @returns {object} - Result object with success status
 */
function updateSummary({ path: summaryPath, summary_updates }) {
  try {
    const fullPath = path.join(LIFE_AREAS_DIR, summaryPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Summary file does not exist: ${summaryPath}`);
    }
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Update "Last Updated" timestamp
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    content = content.replace(
      /\*\*Last Updated\*\*: .+/,
      `**Last Updated**: ${now}`
    );
    
    // Update specific sections based on summary_updates
    if (summary_updates.current_situation) {
      content = updateSection(content, '## Current Situation', summary_updates.current_situation);
    }
    
    if (summary_updates.timeline_highlight) {
      content = addTimelineHighlight(content, summary_updates.timeline_highlight);
    }
    
    if (summary_updates.ai_notes) {
      content = updateSection(content, '## AI Notes', summary_updates.ai_notes);
    }
    
    // Write back
    fs.writeFileSync(fullPath, content, 'utf8');
    
    return {
      success: true,
      summary_path: summaryPath
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Promote a document to a subproject (convert file to folder).
 * 
 * This is called when a simple document becomes complex enough to need
 * sub-organization. For example, "startup_idea.md" becomes "Startup/" folder
 * with subfolders for Product, Fundraising, Team.
 * 
 * The original document content is preserved in a "notes.md" file within
 * the new folder.
 * 
 * @param {object} params - Promotion parameters
 * @param {string} params.path - Path to document to promote
 * @param {string} params.new_path - New folder path
 * @param {string} params.reason - Why this promotion is happening
 * @param {object} params.initial_substructure - Folders and documents to create
 * @returns {object} - Result object with success status
 */
function promoteToSubproject({ path: docPath, new_path, reason, initial_substructure }) {
  try {
    const oldFullPath = path.join(LIFE_AREAS_DIR, docPath);
    const newFullPath = path.join(LIFE_AREAS_DIR, new_path);
    
    // Read original document
    if (!fs.existsSync(oldFullPath)) {
      throw new Error(`Document does not exist: ${docPath}`);
    }
    const originalContent = fs.readFileSync(oldFullPath, 'utf8');
    
    // Create new folder
    if (!fs.existsSync(newFullPath)) {
      fs.mkdirSync(newFullPath, { recursive: true });
    }
    
    // Create _AREA_SUMMARY.md for new folder
    const areaName = path.basename(new_path);
    const summaryPath = path.join(newFullPath, SPECIAL_FILES.AREA_SUMMARY);
    const summaryContent = generateAreaSummary({
      area_name: areaName.replace(/_/g, ' '),
      path: new_path,
      description: `Promoted from ${docPath}. Reason: ${reason}`,
      created: new Date().toISOString().split('T')[0],
      parent_area: getParentAreaName(new_path)
    });
    fs.writeFileSync(summaryPath, summaryContent, 'utf8');
    
    // Save original content as "notes.md"
    const notesPath = path.join(newFullPath, 'notes.md');
    fs.writeFileSync(notesPath, originalContent, 'utf8');
    
    // Create initial substructure
    if (initial_substructure) {
      // Create subfolders
      if (initial_substructure.folders) {
        for (const folderName of initial_substructure.folders) {
          const folderPath = path.join(newFullPath, folderName);
          fs.mkdirSync(folderPath, { recursive: true });
          
          // Create _AREA_SUMMARY.md for subfolder
          const subSummaryPath = path.join(folderPath, SPECIAL_FILES.AREA_SUMMARY);
          const subSummaryContent = generateAreaSummary({
            area_name: folderName.replace(/_/g, ' '),
            path: path.join(new_path, folderName),
            description: '',
            created: new Date().toISOString().split('T')[0],
            parent_area: areaName
          });
          fs.writeFileSync(subSummaryPath, subSummaryContent, 'utf8');
        }
      }
      
      // Create documents
      if (initial_substructure.documents) {
        for (const docName of initial_substructure.documents) {
          const docPath = path.join(newFullPath, docName);
          const docContent = generateTimeOrderedDocument({
            title: docName.replace('.md', '').replace(/_/g, ' '),
            area_path: new_path,
            created: new Date().toISOString().split('T')[0]
          });
          fs.writeFileSync(docPath, docContent, 'utf8');
        }
      }
    }
    
    // Delete original document
    fs.unlinkSync(oldFullPath);
    
    // Update master index
    updateMasterIndex();
    
    return {
      success: true,
      old_path: docPath,
      new_path: new_path,
      preserved_content: 'notes.md'
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Read content from specific areas/documents.
 * 
 * This is used when the AI needs to pull specific context into the next turn.
 * For example, if user mentions "Emma's reading", the AI can read the
 * Emma_School area summary and recent entries.
 * 
 * @param {array} paths - Array of paths to read
 * @returns {object} - Result object with content from each path
 */
function readForContext(paths) {
  const results = {};
  
  for (const relativePath of paths) {
    try {
      const fullPath = path.join(LIFE_AREAS_DIR, relativePath);
      
      if (!fs.existsSync(fullPath)) {
        results[relativePath] = { error: 'Path does not exist' };
        continue;
      }
      
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Read area summary
        const summaryPath = path.join(fullPath, SPECIAL_FILES.AREA_SUMMARY);
        if (fs.existsSync(summaryPath)) {
          results[relativePath] = {
            type: 'area',
            summary: fs.readFileSync(summaryPath, 'utf8')
          };
        } else {
          results[relativePath] = { error: 'No summary file found' };
        }
      } else {
        // Read document (limit to first 100 lines for context)
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        const truncated = lines.slice(0, 100).join('\n');
        
        results[relativePath] = {
          type: 'document',
          content: truncated,
          truncated: lines.length > 100
        };
      }
      
    } catch (error) {
      results[relativePath] = { error: error.message };
    }
  }
  
  return results;
}

// =============================================================================
// TEMPLATE GENERATORS
// =============================================================================

/**
 * Generate the master areas index content.
 * This is the top-level file that lists all areas with metadata.
 * 
 * @param {array} areas - Array of area objects
 * @returns {string} - Markdown content for _AREAS_INDEX.md
 */
function generateAreasIndex(areas) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  let content = `# Life Areas Index\n\n`;
  content += `**Last Updated**: ${now}\n\n`;
  content += `## Active Areas (${areas.length})\n\n`;
  
  if (areas.length === 0) {
    content += `No areas created yet. Areas will be created automatically as you have conversations about your life.\n\n`;
  } else {
    for (const area of areas) {
      content += `### ${area.icon} ${area.name}\n`;
      content += `- **Path**: \`${area.path}\`\n`;
      content += `- **Subprojects**: ${area.subprojects}\n`;
      content += `- **Last Activity**: ${area.lastActivity}\n`;
      content += `- **Summary**: ${area.summary}\n\n`;
    }
  }
  
  content += `## Statistics\n`;
  content += `- **Total Areas**: ${areas.length}\n`;
  content += `- **Total Subprojects**: ${areas.reduce((sum, a) => sum + a.subprojects, 0)}\n`;
  
  return content;
}

/**
 * Generate an area summary file (_AREA_SUMMARY.md).
 * 
 * @param {object} params - Summary parameters
 * @returns {string} - Markdown content
 */
function generateAreaSummary({ area_name, path: areaPath, description, created, parent_area }) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  let content = `# ${area_name} - Area Summary\n\n`;
  content += `**Created**: ${created}\n`;
  content += `**Last Updated**: ${now}\n`;
  content += `**Parent Area**: ${parent_area || 'Root'}\n`;
  content += `**Status**: Active\n\n`;
  content += `---\n\n`;
  content += `## Current Situation\n\n`;
  content += `${description || 'No description yet.'}\n\n`;
  content += `---\n\n`;
  content += `## Timeline Highlights\n\n`;
  content += `No highlights yet.\n\n`;
  content += `---\n\n`;
  content += `## Related Areas\n\n`;
  content += `No related areas yet.\n\n`;
  content += `---\n\n`;
  content += `## AI Notes\n\n`;
  content += `No notes yet.\n`;
  
  return content;
}

/**
 * Generate a time-ordered document template.
 * 
 * @param {object} params - Document parameters
 * @returns {string} - Markdown content
 */
function generateTimeOrderedDocument({ title, area_path, created }) {
  let content = `# ${title}\n\n`;
  content += `**Area**: ${area_path}\n`;
  content += `**Document Type**: Time-Ordered Log\n`;
  content += `**Created**: ${created}\n\n`;
  content += `---\n\n`;
  content += `## Summary (AI-Maintained)\n\n`;
  content += `No entries yet.\n\n`;
  content += `---\n\n`;
  content += `## Entries (Newest First)\n\n`;
  content += `No entries yet.\n`;
  
  return content;
}

/**
 * Generate markdown for a single entry.
 * 
 * @param {object} entry - Entry object
 * @returns {string} - Markdown for the entry
 */
function generateEntryMarkdown(entry) {
  let md = `### ${entry.timestamp}\n`;
  md += `**Conversation Context**: ${entry.conversation_context}\n\n`;
  md += `${entry.content}\n\n`;
  
  if (entry.user_quote) {
    md += `**User Quote**: "${entry.user_quote}"\n\n`;
  }
  
  if (entry.ai_observation) {
    md += `**AI Observation**: ${entry.ai_observation}\n\n`;
  }
  
  if (entry.sentiment) {
    md += `**Sentiment**: ${entry.sentiment}\n\n`;
  }
  
  if (entry.related_paths && entry.related_paths.length > 0) {
    md += `**Related**: ${entry.related_paths.map(p => `\`${p}\``).join(', ')}\n\n`;
  }
  
  md += `---\n`;
  
  return md;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the parent area name from a path.
 * 
 * @param {string} areaPath - Path like "Family/Emma_School"
 * @returns {string} - Parent name like "Family"
 */
function getParentAreaName(areaPath) {
  const parts = areaPath.split('/');
  return parts.length > 1 ? parts[parts.length - 2] : null;
}

/**
 * Update a section in a markdown document.
 * 
 * @param {string} content - Full document content
 * @param {string} sectionHeader - Header to find (e.g., "## Current Situation")
 * @param {string} newContent - New content for that section
 * @returns {string} - Updated document content
 */
function updateSection(content, sectionHeader, newContent) {
  const headerIndex = content.indexOf(sectionHeader);
  if (headerIndex === -1) return content;
  
  // Find the next header or end of document
  const afterHeader = content.substring(headerIndex + sectionHeader.length);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const nextHeaderIndex = nextHeaderMatch ? nextHeaderMatch.index : afterHeader.length;
  
  // Replace the section content
  const before = content.substring(0, headerIndex + sectionHeader.length);
  const after = content.substring(headerIndex + sectionHeader.length + nextHeaderIndex);
  
  return before + '\n\n' + newContent + '\n\n---\n' + after;
}

/**
 * Add a timeline highlight to an area summary.
 * 
 * @param {string} content - Full summary content
 * @param {object} highlight - Highlight object with date and event
 * @returns {string} - Updated content
 */
function addTimelineHighlight(content, highlight) {
  const sectionHeader = '## Timeline Highlights';
  const headerIndex = content.indexOf(sectionHeader);
  if (headerIndex === -1) return content;
  
  // Find where to insert (after the header and any existing content)
  const afterHeader = content.substring(headerIndex + sectionHeader.length);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const insertPoint = headerIndex + sectionHeader.length + 2; // +2 for newlines
  
  // Check if "No highlights yet" is present
  const noHighlightsIndex = content.indexOf('No highlights yet.');
  const newHighlight = `- **${highlight.date}**: ${highlight.event}\n`;
  
  if (noHighlightsIndex > headerIndex && noHighlightsIndex < headerIndex + sectionHeader.length + 100) {
    // Replace "No highlights yet"
    return content.replace('No highlights yet.\n', newHighlight);
  } else {
    // Add to existing highlights
    const before = content.substring(0, insertPoint);
    const after = content.substring(insertPoint);
    return before + newHighlight + after;
  }
}

/**
 * Update the master index by scanning all areas.
 * Called after any structural change (create area, promote to subproject).
 */
function updateMasterIndex() {
  try {
    const areas = scanAllAreas();
    const indexContent = generateAreasIndex(areas);
    const indexPath = path.join(LIFE_AREAS_DIR, SPECIAL_FILES.AREAS_INDEX);
    fs.writeFileSync(indexPath, indexContent, 'utf8');
  } catch (error) {
    console.error('Error updating master index:', error.message);
  }
}

/**
 * Scan all top-level areas and gather metadata.
 * 
 * @returns {array} - Array of area objects
 */
function scanAllAreas() {
  const areas = [];
  
  try {
    const items = fs.readdirSync(LIFE_AREAS_DIR, { withFileTypes: true });
    const folders = items.filter(item => 
      item.isDirectory() && 
      !item.name.startsWith('.') &&
      !item.name.startsWith('_')
    );
    
    for (const folder of folders) {
      const folderPath = path.join(LIFE_AREAS_DIR, folder.name);
      const stats = getAreaStats(folderPath);
      
      // Read summary if available
      const summaryPath = path.join(folderPath, SPECIAL_FILES.AREA_SUMMARY);
      let summary = 'No summary available';
      if (fs.existsSync(summaryPath)) {
        const summaryContent = fs.readFileSync(summaryPath, 'utf8');
        // Extract first line of "Current Situation" section
        const match = summaryContent.match(/## Current Situation\n\n(.+)/);
        if (match) {
          summary = match[1].substring(0, 100) + (match[1].length > 100 ? '...' : '');
        }
      }
      
      areas.push({
        name: folder.name.replace(/_/g, ' '),
        path: folder.name + '/',
        icon: getAreaIcon(folder.name),
        subprojects: stats.subprojects,
        lastActivity: stats.lastActivity,
        summary: summary
      });
    }
    
  } catch (error) {
    console.error('Error scanning areas:', error.message);
  }
  
  return areas;
}

/**
 * Get an emoji icon for an area based on its name.
 * 
 * @param {string} areaName - Area name
 * @returns {string} - Emoji icon
 */
function getAreaIcon(areaName) {
  const name = areaName.toLowerCase();
  if (name.includes('family')) return '🏠';
  if (name.includes('work') || name.includes('startup')) return '💼';
  if (name.includes('personal') || name.includes('growth')) return '🌱';
  if (name.includes('home')) return '🏡';
  if (name.includes('relationship')) return '❤️';
  if (name.includes('finance')) return '💰';
  if (name.includes('hobby') || name.includes('creative')) return '🎨';
  return '📁';
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Initialization
  initializeLifeAreas,
  
  // Tree generation
  generateAreasTree,
  
  // Operations
  createArea,
  appendEntry,
  updateSummary,
  promoteToSubproject,
  readForContext,
  
  // Helpers
  getAreaStats,
  scanAllAreas,
  
  // Constants
  LIFE_AREAS_DIR,
  SPECIAL_FILES
};
