#!/usr/bin/env node

/**
 * TEST AREA OPERATIONS
 * 
 * Purpose:
 * Executes area operations (append_entry, update_summary, create_area) for test scenarios.
 * This is a wrapper around the knowledge-base-manager that matches the area-manager API.
 * 
 * Why separate from area-manager:
 * - Tests use knowledge-base/life_areas (reset between tests)
 * - Production uses user_data/life_areas (persistent)
 * - Different initialization and path handling
 * 
 * Date: 2026-01-19
 */

const fs = require('fs');
const path = require('path');
const { LIFE_AREAS_DIR } = require('./knowledge-base-manager');

/**
 * Execute area actions from AI response
 * 
 * @param {Array} areaActions - Array of area actions from AI
 * @returns {Promise<Object>} - Results of operations
 */
async function executeAreaActions(areaActions) {
  if (!areaActions || areaActions.length === 0) {
    return { executed: 0, results: [] };
  }

  const results = [];
  let executed = 0;

  for (const action of areaActions) {
    if (action.action === 'none') continue;

    try {
      let result = null;

      switch (action.action) {
        case 'create_area':
          result = await createArea(action);
          break;
        case 'append_entry':
          result = await appendEntry(action);
          break;
        case 'update_summary':
          result = await updateSummary(action);
          break;
        default:
          result = { success: false, error: `Unknown action: ${action.action}` };
      }

      results.push({
        action: action.action,
        path: action.path,
        success: result.success,
        error: result.error
      });

      if (result.success) executed++;

    } catch (error) {
      results.push({
        action: action.action,
        path: action.path,
        success: false,
        error: error.message
      });
    }
  }

  return { executed, results };
}

/**
 * Create a new area
 * 
 * @param {Object} action - Action object with path, area_name, description
 * @returns {Promise<Object>} - Result object
 */
async function createArea(action) {
  try {
    const { path: areaPath, area_name, description } = action;
    
    if (!areaPath || !area_name) {
      return { success: false, error: 'Missing required fields: path, area_name' };
    }

    const fullPath = path.join(LIFE_AREAS_DIR, areaPath);
    
    // Create the folder
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    // Create _AREA_SUMMARY.md
    const summaryPath = path.join(fullPath, '_AREA_SUMMARY.md');
    const summaryContent = generateAreaSummary({
      area_name,
      path: areaPath,
      description: description || `Area for ${area_name}`,
      created: new Date().toISOString().split('T')[0]
    });
    fs.writeFileSync(summaryPath, summaryContent, 'utf8');
    
    return {
      success: true,
      area_path: areaPath,
      message: `Created area: ${areaPath}`
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Append entry to a document
 * 
 * @param {Object} action - Action object with path and entry
 * @returns {Promise<Object>} - Result object
 */
async function appendEntry(action) {
  try {
    const { path: docPath, entry } = action;
    
    // Validation
    if (!docPath || docPath === 'N/A' || docPath === '') {
      return { success: false, error: 'Missing or invalid path' };
    }
    
    if (!entry) {
      return { success: false, error: 'Missing entry object' };
    }
    
    if (!entry.context && !entry.content) {
      return { success: false, error: 'Entry must have context and/or content' };
    }

    const fullPath = path.join(LIFE_AREAS_DIR, docPath);
    
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Read existing document or create new
    let content = '';
    if (fs.existsSync(fullPath)) {
      content = fs.readFileSync(fullPath, 'utf8');
    } else {
      // Create new document
      const docName = path.basename(docPath, '.md');
      const areaPath = path.dirname(docPath);
      content = generateTimeOrderedDocument({
        title: docName.replace(/_/g, ' '),
        area_path: areaPath,
        created: new Date().toISOString().split('T')[0]
      });
    }
    
    // Generate entry markdown
    const entryMarkdown = generateEntryMarkdown(entry);
    
    // Find insertion point (after "## Entries (Newest First)")
    const insertionMarker = '## Entries (Newest First)';
    const insertionIndex = content.indexOf(insertionMarker);
    
    if (insertionIndex !== -1) {
      // Insert after the marker and newlines
      const afterMarker = insertionIndex + insertionMarker.length;
      const insertPoint = content.indexOf('\n', afterMarker) + 1;
      content = content.slice(0, insertPoint) + '\n' + entryMarkdown + '\n' + content.slice(insertPoint);
    } else {
      // No marker found, append to end
      content += '\n\n' + entryMarkdown;
    }
    
    // Update entry count
    const entryCountMatch = content.match(/\*\*Entries\*\*: (\d+)/);
    if (entryCountMatch) {
      const currentCount = parseInt(entryCountMatch[1]);
      content = content.replace(
        /\*\*Entries\*\*: \d+/,
        `**Entries**: ${currentCount + 1}`
      );
    }
    
    // Write back
    fs.writeFileSync(fullPath, content, 'utf8');
    
    return {
      success: true,
      document_path: docPath,
      message: `Appended entry to: ${docPath}`
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update area summary
 * 
 * @param {Object} action - Action object with path and summary updates
 * @returns {Promise<Object>} - Result object
 */
async function updateSummary(action) {
  try {
    const { path: summaryPath, summary_updates } = action;
    
    if (!summaryPath) {
      return { success: false, error: 'Missing required field: path' };
    }

    const fullPath = path.join(LIFE_AREAS_DIR, summaryPath);
    
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Summary file does not exist: ${summaryPath}` };
    }
    
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Update "Last Updated" timestamp
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    content = content.replace(
      /\*\*Last Updated\*\*: .+/,
      `**Last Updated**: ${now}`
    );
    
    // Update specific sections if provided
    if (summary_updates) {
      if (summary_updates.current_situation) {
        content = updateSection(content, '## Current Situation', summary_updates.current_situation);
      }
      
      if (summary_updates.ai_notes) {
        content = updateSection(content, '## AI Notes', summary_updates.ai_notes);
      }
    }
    
    // Write back
    fs.writeFileSync(fullPath, content, 'utf8');
    
    return {
      success: true,
      summary_path: summaryPath,
      message: `Updated summary: ${summaryPath}`
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateAreaSummary({ area_name, path: areaPath, description, created }) {
  return `# ${area_name} - Area Summary

**Created**: ${created}
**Last Updated**: ${created}
**Path**: \`${areaPath}\`

---

## Current Situation

${description}

---

## Recent Activity

No entries yet.

---

## AI Notes

Area created. Awaiting first entries.
`;
}

function generateTimeOrderedDocument({ title, area_path, created }) {
  return `# ${title}

**Area**: ${area_path}
**Document Type**: Time-Ordered Log
**Entries**: 0

---

## Summary (AI-Maintained)

No entries yet.

---

## Entries (Newest First)

`;
}

function generateEntryMarkdown(entry) {
  const timestamp = entry.timestamp || new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().split(' ')[0];
  const context = entry.context || 'Conversation';
  const content = entry.content || '';
  const userQuote = entry.user_quote || '';
  const aiObservation = entry.ai_observation || '';
  const sentiment = entry.sentiment || 'neutral';
  
  let markdown = `### ${timestamp}\n`;
  markdown += `**Conversation Context**: ${context}\n\n`;
  markdown += `${content}\n\n`;
  
  if (userQuote) {
    markdown += `**User Quote**: "${userQuote}"\n\n`;
  }
  
  if (aiObservation) {
    markdown += `**AI Observation**: ${aiObservation}\n\n`;
  }
  
  markdown += `**Sentiment**: ${sentiment}\n\n`;
  markdown += `---\n`;
  
  return markdown;
}

function updateSection(content, sectionHeader, newContent) {
  const sectionRegex = new RegExp(`${sectionHeader}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const match = content.match(sectionRegex);
  
  if (match) {
    const replacement = `${sectionHeader}\n\n${newContent}\n\n---\n`;
    return content.replace(sectionRegex, replacement);
  } else {
    // Section doesn't exist, append it
    return content + `\n\n${sectionHeader}\n\n${newContent}\n\n---\n`;
  }
}

module.exports = {
  executeAreaActions,
  createArea,
  appendEntry,
  updateSummary
};
