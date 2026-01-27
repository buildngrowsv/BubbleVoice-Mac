/**
 * BUBBLEVOICE MAC - CONVERSATION SERVICE
 * 
 * Manages conversation state and history.
 * Handles conversation creation, message storage, and retrieval.
 * 
 * RESPONSIBILITIES:
 * - Create and manage conversation sessions
 * - Store conversation messages
 * - Retrieve conversation history
 * - Manage conversation metadata
 * 
 * PRODUCT CONTEXT:
 * Conversations are the core unit of interaction in BubbleVoice.
 * Each conversation represents a session where the user discusses
 * personal topics with the AI. Conversations persist across app
 * restarts and can be searched/retrieved later.
 * 
 * TECHNICAL NOTES:
 * - Currently uses in-memory storage (Map)
 * - TODO: Integrate with persistent storage (SQLite/ObjectBox)
 * - TODO: Integrate with vector search for RAG
 * - Conversations are identified by UUID
 */

const { v4: uuidv4 } = require('uuid');

class ConversationService {
  constructor() {
    // In-memory conversation storage
    // Maps conversation ID to conversation object
    // TODO: Replace with persistent storage (SQLite)
    this.conversations = new Map();
  }

  /**
   * CREATE CONVERSATION
   * 
   * Creates a new conversation session.
   * 
   * ARTIFACT CONTEXT (2026-01-27):
   * Each conversation now tracks its current artifact state.
   * This allows the AI to know what artifact is displayed and decide
   * whether to update it vs create a new one.
   * 
   * WHY: Without artifact context, AI always creates new artifacts instead
   * of editing existing ones. User asks "change dreams to potatoes" and
   * AI creates entirely new diagram instead of modifying existing.
   * 
   * BECAUSE: The COMPREHENSIVE_EVALUATION.md documented 0% update rate -
   * "No artifact updates observed" - because AI had no visibility into
   * what artifact was currently displayed.
   * 
   * @param {Object} metadata - Optional metadata for the conversation
   * @returns {Promise<Object>} Conversation object
   */
  async createConversation(metadata = {}) {
    const conversation = {
      id: uuidv4(),
      messages: [],
      // ARTIFACT CONTEXT: Track current artifact for editing support
      // This is sent to LLM so it knows what artifact is displayed
      currentArtifact: null,
      // Track artifact history for this conversation
      artifactHistory: [],
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...metadata
      }
    };

    this.conversations.set(conversation.id, conversation);
    
    console.log(`[ConversationService] Created conversation: ${conversation.id}`);
    
    return conversation;
  }

  /**
   * GET CONVERSATION
   * 
   * Retrieves a conversation by ID.
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Conversation object
   * @throws {Error} If conversation not found
   */
  async getConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return conversation;
  }

  /**
   * ADD MESSAGE
   * 
   * Adds a message to a conversation.
   * 
   * @param {string} conversationId - Conversation ID
   * @param {Object} message - Message object
   * @param {string} message.role - 'user' or 'assistant'
   * @param {string} message.content - Message content
   * @param {number} message.timestamp - Unix timestamp
   * @returns {Promise<Object>} Updated conversation
   */
  async addMessage(conversationId, message) {
    const conversation = await this.getConversation(conversationId);

    // Add message to conversation
    conversation.messages.push({
      id: uuidv4(),
      ...message
    });

    // Update conversation metadata
    conversation.metadata.updatedAt = Date.now();
    conversation.metadata.messageCount = conversation.messages.length;

    console.log(`[ConversationService] Added message to ${conversationId}: ${message.role}`);

    return conversation;
  }

  /**
   * GET MESSAGES
   * 
   * Retrieves messages from a conversation.
   * 
   * @param {string} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Max messages to return
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages(conversationId, options = {}) {
    const conversation = await this.getConversation(conversationId);
    const { limit, offset = 0 } = options;

    let messages = conversation.messages;

    // Apply offset
    if (offset > 0) {
      messages = messages.slice(offset);
    }

    // Apply limit
    if (limit) {
      messages = messages.slice(0, limit);
    }

    return messages;
  }

  /**
   * DELETE CONVERSATION
   * 
   * Deletes a conversation.
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteConversation(conversationId) {
    const deleted = this.conversations.delete(conversationId);
    
    if (deleted) {
      console.log(`[ConversationService] Deleted conversation: ${conversationId}`);
    }

    return deleted;
  }

  /**
   * LIST CONVERSATIONS
   * 
   * Lists all conversations.
   * 
   * @param {Object} options - Query options
   * @param {number} options.limit - Max conversations to return
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Array of conversation objects
   */
  async listConversations(options = {}) {
    const { limit, offset = 0 } = options;

    let conversations = Array.from(this.conversations.values());

    // Sort by most recent first
    conversations.sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt);

    // Apply offset
    if (offset > 0) {
      conversations = conversations.slice(offset);
    }

    // Apply limit
    if (limit) {
      conversations = conversations.slice(0, limit);
    }

    return conversations;
  }

  /**
   * GET CONVERSATION COUNT
   * 
   * Returns the total number of conversations.
   * 
   * @returns {Promise<number>} Conversation count
   */
  async getConversationCount() {
    return this.conversations.size;
  }

  /**
   * GET ALL CONVERSATIONS
   * 
   * Returns the Map of all conversations.
   * Used by chat sidebar to display conversation list.
   * 
   * @returns {Map} Map of all conversations
   */
  getAllConversations() {
    return this.conversations;
  }

  /**
   * SET CURRENT ARTIFACT
   * 
   * Updates the current artifact for a conversation.
   * Called when AI generates an artifact (create or update action).
   * 
   * CRITICAL FOR ARTIFACT EDITING (2026-01-27):
   * This method tracks what artifact is currently displayed so the AI
   * can decide whether to edit vs create. Without this tracking, the
   * AI always creates new artifacts because it has no visibility.
   * 
   * @param {string} conversationId - Conversation ID
   * @param {Object} artifact - Artifact object with id, type, html, data
   * @returns {Promise<Object>} Updated conversation
   */
  async setCurrentArtifact(conversationId, artifact) {
    const conversation = await this.getConversation(conversationId);
    
    // Store in history before replacing (unless it's the same artifact being updated)
    if (conversation.currentArtifact && 
        conversation.currentArtifact.artifact_id !== artifact.artifact_id) {
      conversation.artifactHistory.push(conversation.currentArtifact);
      // Keep only last 5 artifacts in history to avoid unbounded growth
      if (conversation.artifactHistory.length > 5) {
        conversation.artifactHistory.shift();
      }
    }
    
    // Set current artifact
    conversation.currentArtifact = {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      // Store HTML (for context) - truncate if very long to avoid bloating context
      // AI doesn't need full HTML to know what to edit, just the structure
      html_summary: artifact.html ? this.summarizeArtifactHtml(artifact.html) : null,
      // Store full data (for editing data artifacts)
      data: artifact.data || null,
      created_at: artifact.created_at || Date.now(),
      turn_number: artifact.turn_number || conversation.messages.length
    };
    
    conversation.metadata.updatedAt = Date.now();
    
    console.log(`[ConversationService] Set current artifact for ${conversationId}: ${artifact.artifact_id} (${artifact.artifact_type})`);
    
    return conversation;
  }

  /**
   * GET CURRENT ARTIFACT
   * 
   * Returns the current artifact for a conversation.
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object|null>} Current artifact or null
   */
  async getCurrentArtifact(conversationId) {
    const conversation = await this.getConversation(conversationId);
    return conversation.currentArtifact;
  }

  /**
   * CLEAR CURRENT ARTIFACT
   * 
   * Clears the current artifact (e.g., user closed artifact panel).
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Updated conversation
   */
  async clearCurrentArtifact(conversationId) {
    const conversation = await this.getConversation(conversationId);
    
    if (conversation.currentArtifact) {
      conversation.artifactHistory.push(conversation.currentArtifact);
    }
    
    conversation.currentArtifact = null;
    conversation.metadata.updatedAt = Date.now();
    
    console.log(`[ConversationService] Cleared current artifact for ${conversationId}`);
    
    return conversation;
  }

  /**
   * SUMMARIZE ARTIFACT HTML
   * 
   * Creates a compact summary of artifact HTML for context.
   * Full HTML can be very large (8K+). AI only needs key content
   * to understand what's displayed, not every CSS rule.
   * 
   * TECHNICAL APPROACH:
   * - Extract text content (removes CSS/JS)
   * - Extract key structural elements (headers, sections)
   * - Truncate to ~500 chars if still too long
   * 
   * @param {string} html - Full HTML content
   * @returns {string} Summarized HTML content
   */
  summarizeArtifactHtml(html) {
    if (!html) return null;
    
    // Remove style and script tags entirely
    let summary = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Remove all HTML tags, keep text
    summary = summary.replace(/<[^>]+>/g, ' ');
    
    // Collapse whitespace
    summary = summary.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long (500 chars is enough for AI to understand content)
    if (summary.length > 500) {
      summary = summary.substring(0, 500) + '...';
    }
    
    return summary;
  }
}

module.exports = ConversationService;
