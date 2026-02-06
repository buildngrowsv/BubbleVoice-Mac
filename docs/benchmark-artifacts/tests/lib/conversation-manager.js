#!/usr/bin/env node

/**
 * CONVERSATION MANAGER
 * 
 * Purpose:
 * Manages conversation files including:
 * - Full conversation transcript (user + AI)
 * - User inputs only (isolated)
 * - AI notes (hidden from user)
 * - Conversation summary
 * 
 * Why Separate User Inputs:
 * - Better vector search (user's actual words, not AI interpretation)
 * - Reduced AI bias in search results
 * - Authentic voice preservation
 * - Historical tracking of user's thinking
 * 
 * Date: 2026-01-19
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Conversation Manager Class
 * 
 * Handles creation and updating of conversation files.
 */
class ConversationManager {
  constructor(conversationsDir) {
    this.conversationsDir = conversationsDir;
  }

  /**
   * Create a new conversation folder
   * 
   * @param {string} conversationId - Unique conversation ID
   * @returns {Promise<string>} - Path to conversation folder
   */
  async createConversation(conversationId) {
    const convPath = path.join(this.conversationsDir, conversationId);
    
    try {
      await fs.mkdir(convPath, { recursive: true });
      
      // Initialize empty files
      await this.writeConversationFile(conversationId, '');
      await this.writeUserInputsFile(conversationId, '');
      await this.writeAiNotesFile(conversationId, '');
      await this.writeSummaryFile(conversationId, '');
      
      return convPath;
    } catch (error) {
      console.error(`Failed to create conversation ${conversationId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write full conversation transcript
   * 
   * @param {string} conversationId
   * @param {string} content - Full conversation markdown
   */
  async writeConversationFile(conversationId, content) {
    const filePath = path.join(this.conversationsDir, conversationId, 'conversation.md');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Write user inputs only (isolated from AI responses)
   * 
   * This is the key file for unbiased vector search.
   * 
   * @param {string} conversationId
   * @param {string} content - User inputs markdown
   */
  async writeUserInputsFile(conversationId, content) {
    const filePath = path.join(this.conversationsDir, conversationId, 'user_inputs.md');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Write AI notes (hidden from user)
   * 
   * @param {string} conversationId
   * @param {string} content - AI notes markdown
   */
  async writeAiNotesFile(conversationId, content) {
    const filePath = path.join(this.conversationsDir, conversationId, 'conversation_ai_notes.md');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Write conversation summary
   * 
   * @param {string} conversationId
   * @param {string} content - Summary markdown
   */
  async writeSummaryFile(conversationId, content) {
    const filePath = path.join(this.conversationsDir, conversationId, 'conversation_summary.md');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Format full conversation transcript
   * 
   * @param {Array<{role: string, content: string, timestamp: number}>} messages
   * @param {string} conversationId
   * @returns {string} - Formatted markdown
   */
  formatFullConversation(messages, conversationId) {
    let md = `# Full Conversation - ${conversationId}\n\n`;
    md += `**Started**: ${new Date(messages[0]?.timestamp || Date.now()).toISOString()}\n`;
    md += `**Last Updated**: ${new Date().toISOString()}\n`;
    md += `**Total Turns**: ${Math.ceil(messages.length / 2)}\n\n`;
    md += '---\n\n';

    let turnNumber = 1;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const timestamp = new Date(msg.timestamp || Date.now()).toISOString();
      
      if (msg.role === 'user') {
        md += `## Turn ${turnNumber} (${timestamp})\n\n`;
        md += `**User**: ${msg.content}\n\n`;
      } else {
        md += `**AI**: ${msg.content}\n\n`;
        md += '---\n\n';
        turnNumber++;
      }
    }

    return md;
  }

  /**
   * Format user inputs only (isolated)
   * 
   * This is the key method for user input isolation.
   * Only includes what the user said, no AI responses.
   * 
   * @param {Array<{role: string, content: string, timestamp: number}>} messages
   * @param {string} conversationId
   * @returns {string} - Formatted markdown
   */
  formatUserInputs(messages, conversationId) {
    const userMessages = messages.filter(m => m.role === 'user');
    
    let md = `# User Inputs Only - ${conversationId}\n\n`;
    md += `**Started**: ${new Date(userMessages[0]?.timestamp || Date.now()).toISOString()}\n`;
    md += `**Last Updated**: ${new Date().toISOString()}\n`;
    md += `**Total Inputs**: ${userMessages.length}\n\n`;
    md += '---\n\n';

    userMessages.forEach((msg, index) => {
      const timestamp = new Date(msg.timestamp || Date.now()).toISOString();
      md += `## Turn ${index + 1} (${timestamp})\n\n`;
      md += `${msg.content}\n\n`;
      md += '---\n\n';
    });

    return md;
  }

  /**
   * Format AI notes
   * 
   * @param {Array<{turn: number, content: string, timestamp: number}>} notes
   * @param {string} conversationId
   * @returns {string} - Formatted markdown
   */
  formatAiNotes(notes, conversationId) {
    let md = `# AI Notes (Hidden) - ${conversationId}\n\n`;
    md += `**Note**: Entries are added at TOP. Only top 500 lines are read into context.\n\n`;
    md += '---\n\n';

    // Reverse to show newest first
    const reversed = [...notes].reverse();
    
    reversed.forEach(note => {
      const timestamp = new Date(note.timestamp || Date.now()).toISOString();
      md += `## Turn ${note.turn} (${timestamp})\n\n`;
      md += `${note.content}\n\n`;
      if (note.emotional_state) md += `**Emotional State**: ${note.emotional_state}\n\n`;
      if (note.key_context) md += `**Key Context**: ${note.key_context}\n\n`;
      if (note.watch_for) md += `**Watch For**: ${note.watch_for}\n\n`;
      md += '---\n\n';
    });

    return md;
  }

  /**
   * Save conversation state
   * 
   * Writes all conversation files at once.
   * 
   * @param {string} conversationId
   * @param {Array} messages - Full message history
   * @param {Array} aiNotes - AI notes
   * @param {string} summary - Conversation summary
   */
  async saveConversation(conversationId, messages, aiNotes = [], summary = '') {
    // Ensure conversation folder exists
    const convPath = path.join(this.conversationsDir, conversationId);
    await fs.mkdir(convPath, { recursive: true });

    // Format and write all files
    const fullConv = this.formatFullConversation(messages, conversationId);
    const userInputs = this.formatUserInputs(messages, conversationId);
    const notes = this.formatAiNotes(aiNotes, conversationId);

    await Promise.all([
      this.writeConversationFile(conversationId, fullConv),
      this.writeUserInputsFile(conversationId, userInputs),
      this.writeAiNotesFile(conversationId, notes),
      this.writeSummaryFile(conversationId, summary)
    ]);
  }

  /**
   * Read conversation files
   * 
   * @param {string} conversationId
   * @returns {Promise<Object>} - All conversation files
   */
  async readConversation(conversationId) {
    const convPath = path.join(this.conversationsDir, conversationId);
    
    try {
      const [conversation, userInputs, aiNotes, summary] = await Promise.all([
        fs.readFile(path.join(convPath, 'conversation.md'), 'utf-8'),
        fs.readFile(path.join(convPath, 'user_inputs.md'), 'utf-8'),
        fs.readFile(path.join(convPath, 'conversation_ai_notes.md'), 'utf-8'),
        fs.readFile(path.join(convPath, 'conversation_summary.md'), 'utf-8')
      ]);

      return {
        conversation,
        userInputs,
        aiNotes,
        summary
      };
    } catch (error) {
      console.error(`Failed to read conversation ${conversationId}: ${error.message}`);
      return null;
    }
  }
}

module.exports = {
  ConversationManager
};
