#!/usr/bin/env node

/**
 * ARTIFACT MANAGER
 * 
 * Purpose:
 * Manages artifact files (HTML + JSON) for conversation artifacts.
 * 
 * Artifact Types:
 * - Data Artifacts: Have both HTML (visual) and JSON (editable data)
 * - Visual Artifacts: Have only HTML (non-editable visualizations)
 * 
 * File Structure:
 * conversations/
 * └── conv_id/
 *     └── artifacts/
 *         ├── artifact_id.html
 *         └── artifact_id.json (if data artifact)
 * 
 * Date: 2026-01-19
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Artifact Manager Class
 * 
 * Handles creation and updating of artifact files.
 */
class ArtifactManager {
  constructor(conversationsDir) {
    this.conversationsDir = conversationsDir;
  }

  /**
   * Save an artifact (HTML + optional JSON)
   * 
   * @param {string} conversationId - Conversation ID
   * @param {Object} artifactAction - Artifact action from AI response
   * @returns {Promise<Object>} - Saved artifact info
   */
  async saveArtifact(conversationId, artifactAction) {
    if (!artifactAction || artifactAction.action === 'none') {
      return null;
    }

    const { artifact_id, artifact_type, html, data } = artifactAction;
    
    if (!artifact_id) {
      console.warn('⚠️  Artifact missing artifact_id, skipping save');
      return null;
    }

    if (!html) {
      console.warn('⚠️  Artifact missing html, skipping save');
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

    return {
      artifact_id,
      artifact_type,
      html_path: htmlPath,
      json_path: jsonPath,
      has_data: !!jsonPath,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Read an artifact
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} artifactId - Artifact ID
   * @returns {Promise<Object>} - Artifact data
   */
  async readArtifact(conversationId, artifactId) {
    const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
    
    try {
      const htmlPath = path.join(artifactsDir, `${artifactId}.html`);
      const jsonPath = path.join(artifactsDir, `${artifactId}.json`);
      
      const html = await fs.readFile(htmlPath, 'utf-8');
      
      let data = null;
      try {
        data = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      } catch (e) {
        // No JSON file, visual-only artifact
      }
      
      return {
        artifact_id: artifactId,
        html,
        data,
        has_data: !!data
      };
    } catch (error) {
      console.error(`Failed to read artifact ${artifactId}: ${error.message}`);
      return null;
    }
  }

  /**
   * List all artifacts for a conversation
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Array>} - List of artifact IDs
   */
  async listArtifacts(conversationId) {
    const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
    
    try {
      const files = await fs.readdir(artifactsDir);
      const htmlFiles = files.filter(f => f.endsWith('.html'));
      return htmlFiles.map(f => f.replace('.html', ''));
    } catch (error) {
      return [];
    }
  }

  /**
   * Create artifacts index for a conversation
   * 
   * @param {string} conversationId - Conversation ID
   * @param {Array} artifacts - Array of artifact metadata
   */
  async createArtifactsIndex(conversationId, artifacts) {
    if (artifacts.length === 0) return;

    const artifactsDir = path.join(this.conversationsDir, conversationId, 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });

    let index = `# Artifacts Index - ${conversationId}\n\n`;
    index += `**Total Artifacts**: ${artifacts.length}\n`;
    index += `**Created**: ${new Date().toISOString()}\n\n`;
    index += '---\n\n';

    for (const artifact of artifacts) {
      index += `## ${artifact.artifact_id}\n\n`;
      index += `- **Type**: ${artifact.artifact_type}\n`;
      index += `- **Has Data**: ${artifact.has_data ? 'Yes' : 'No (visual only)'}\n`;
      index += `- **HTML**: ${artifact.artifact_id}.html\n`;
      if (artifact.has_data) {
        index += `- **JSON**: ${artifact.artifact_id}.json\n`;
      }
      index += `- **Created**: ${artifact.created_at}\n`;
      index += `- **Turn**: ${artifact.turn}\n\n`;
      index += '---\n\n';
    }

    const indexPath = path.join(artifactsDir, '_INDEX.md');
    await fs.writeFile(indexPath, index, 'utf-8');
  }
}

module.exports = {
  ArtifactManager
};
