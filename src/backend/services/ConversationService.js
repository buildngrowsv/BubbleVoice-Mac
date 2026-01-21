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
   * @param {Object} metadata - Optional metadata for the conversation
   * @returns {Promise<Object>} Conversation object
   */
  async createConversation(metadata = {}) {
    const conversation = {
      id: uuidv4(),
      messages: [],
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
}

module.exports = ConversationService;
