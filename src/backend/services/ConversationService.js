/**
 * BUBBLEVOICE MAC - CONVERSATION SERVICE (PERSISTENT)
 * 
 * Manages conversation state with write-through caching:
 * - In-memory Map for fast runtime access (sub-millisecond reads)
 * - SQLite database for persistence across app restarts
 * 
 * ARCHITECTURE (2026-02-06 REWRITE):
 * Previously this was a pure in-memory service — all conversations were
 * lost on restart, which fundamentally broke the "AI remembers your life"
 * promise. The persistent ConversationStorageService existed but was only
 * used by IntegrationService, creating two divergent conversation systems.
 * 
 * Now ConversationService is the SINGLE SOURCE OF TRUTH. It:
 * 1. Keeps the in-memory Map as a fast cache (voice pipeline needs <1ms reads)
 * 2. Writes through to DatabaseService for every mutation (create, addMessage, delete)
 * 3. On startup, loads existing conversations from the database into cache
 * 4. Preserves all existing APIs so server.js needs zero changes
 * 
 * WHY WRITE-THROUGH CACHE (not pure database):
 * The voice pipeline's three-timer system (VoicePipelineService) accesses
 * conversation state in timer callbacks that fire at 0.5s/1.5s/2.0s intervals.
 * Database queries in these hot paths would add latency. The in-memory Map
 * provides O(1) access while the database ensures persistence.
 * 
 * BACKWARDS COMPATIBILITY:
 * All existing callers (server.js, VoicePipelineService) use the same API.
 * If DatabaseService is not provided (e.g., in tests), falls back to
 * pure in-memory behavior exactly like the old implementation.
 * 
 * PRODUCT CONTEXT:
 * Conversations are the core unit of interaction in BubbleVoice. Each one
 * represents a session where the user discusses personal topics with the AI.
 * They MUST persist across restarts — a user who pours their heart out about
 * their kids or career should find that conversation there the next day.
 */

const { v4: uuidv4 } = require('uuid');

class ConversationService {
  /**
   * Constructor
   * 
   * @param {DatabaseService} databaseService - Optional. If provided, enables
   *   persistence. If null/undefined, falls back to pure in-memory (for tests).
   * 
   * WHY OPTIONAL: Some test scenarios and the SKIP_DATABASE dev mode don't
   * have a real database. Making it optional preserves backward compatibility
   * while enabling persistence when available.
   */
  constructor(databaseService = null) {
    // In-memory conversation cache
    // Fast O(1) access for the voice pipeline's timer callbacks
    this.conversations = new Map();
    
    // Database service for persistence (optional)
    // When present, every mutation writes through to SQLite
    this.db = databaseService;
    
    // Track if we've loaded from database yet
    // Prevents double-loading on multiple init calls
    this._loaded = false;
    
    if (this.db) {
      console.log('[ConversationService] Initialized with persistent storage (SQLite)');
    } else {
      console.log('[ConversationService] Initialized in-memory only (no database)');
    }
  }

  /**
   * LOAD FROM DATABASE
   * 
   * Populates the in-memory cache from the SQLite database on startup.
   * Called once during server initialization to restore conversations
   * from previous sessions.
   * 
   * WHY: On app restart, the in-memory Map is empty. Without loading
   * from the database, the user would see no conversations in the sidebar
   * and the AI would have no conversation history.
   * 
   * BECAUSE: The old pure in-memory ConversationService had this exact bug —
   * conversations vanished on every restart.
   * 
   * @returns {number} Number of conversations loaded
   */
  async loadFromDatabase() {
    if (!this.db || !this.db.db) {
      console.log('[ConversationService] No database available, skipping load');
      return 0;
    }
    
    if (this._loaded) {
      console.log('[ConversationService] Already loaded from database, skipping');
      return this.conversations.size;
    }
    
    try {
      // Get all conversations from database
      const dbConversations = this.db.getAllConversations(500, 0);
      
      for (const dbConv of dbConversations) {
        // Get messages for this conversation from database
        const dbMessages = this.db.getMessages(dbConv.id, 1000);
        
        // Build the in-memory conversation object matching the expected shape
        // server.js and other callers expect: { id, messages[], currentArtifact, 
        // artifactHistory[], metadata: { createdAt, updatedAt, title } }
        const conversation = {
          id: dbConv.id,
          // Reconstruct messages array from database rows
          messages: dbMessages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.timestamp).getTime()
          })),
          // Runtime-only state (not persisted — artifacts are tracked per-session)
          // These will be repopulated when the user interacts with artifacts
          currentArtifact: null,
          artifactHistory: [],
          // Title and timestamps from database
          title: dbConv.title,
          createdAt: dbConv.created_at,
          updatedAt: dbConv.updated_at,
          metadata: {
            createdAt: new Date(dbConv.created_at).getTime(),
            updatedAt: new Date(dbConv.updated_at).getTime(),
            title: dbConv.title,
            messageCount: dbMessages.length,
            ...(dbConv.metadata || {})
          }
        };
        
        this.conversations.set(conversation.id, conversation);
      }
      
      this._loaded = true;
      console.log(`[ConversationService] Loaded ${dbConversations.length} conversations from database`);
      return dbConversations.length;
    } catch (error) {
      console.error('[ConversationService] Failed to load from database:', error);
      // Non-fatal: continue with empty cache
      return 0;
    }
  }

  /**
   * CREATE CONVERSATION
   * 
   * Creates a new conversation session. Writes to both in-memory cache
   * and database (if available) for persistence.
   * 
   * ARTIFACT CONTEXT (2026-01-27):
   * Each conversation tracks its current artifact state so the AI can
   * decide whether to update vs create new artifacts.
   * 
   * @param {Object} metadata - Optional metadata for the conversation
   * @returns {Promise<Object>} Conversation object
   */
  async createConversation(metadata = {}) {
    const id = uuidv4();
    const now = Date.now();
    const title = metadata.title || 'New Conversation';
    
    const conversation = {
      id,
      messages: [],
      // ARTIFACT CONTEXT: Track current artifact for editing support
      currentArtifact: null,
      artifactHistory: [],
      title,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      metadata: {
        createdAt: now,
        updatedAt: now,
        title,
        ...metadata
      }
    };

    // Write to in-memory cache (fast access for voice pipeline)
    this.conversations.set(id, conversation);
    
    // Write through to database (persistence across restarts)
    // WHY: If we only wrote to memory, conversations would vanish on restart.
    // The database write adds ~1ms which is negligible for conversation creation.
    if (this.db && this.db.db) {
      try {
        this.db.createConversation(id, title, metadata);
        console.log(`[ConversationService] Created conversation: ${id} (persisted)`);
      } catch (dbError) {
        // Non-fatal: conversation exists in memory, just won't persist
        console.error(`[ConversationService] DB write failed for create: ${dbError.message}`);
      }
    } else {
      console.log(`[ConversationService] Created conversation: ${id} (in-memory only)`);
    }
    
    return conversation;
  }

  /**
   * GET CONVERSATION
   * 
   * Retrieves a conversation by ID from the in-memory cache.
   * Fast O(1) lookup — no database query needed.
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
   * Adds a message to a conversation. Writes to both in-memory cache
   * and database for persistence.
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

    // Generate a unique message ID
    const messageId = uuidv4();
    
    // Add message to in-memory cache (fast access)
    conversation.messages.push({
      id: messageId,
      ...message
    });

    // Update conversation metadata
    conversation.metadata.updatedAt = Date.now();
    conversation.metadata.messageCount = conversation.messages.length;

    // Write through to database (persistence)
    // WHY: Messages are the most critical data to persist. A user's
    // heartfelt conversation about their kids must survive restart.
    if (this.db && this.db.db) {
      try {
        this.db.addMessage(
          conversationId,
          message.role,
          message.content,
          { timestamp: message.timestamp || Date.now() }
        );
      } catch (dbError) {
        // Non-fatal: message exists in memory, just won't persist
        // This can happen if the conversation wasn't created in DB
        // (e.g., created before DB was connected)
        console.error(`[ConversationService] DB write failed for message: ${dbError.message}`);
      }
    }

    console.log(`[ConversationService] Added message to ${conversationId}: ${message.role}`);
    return conversation;
  }

  /**
   * GET MESSAGES
   * 
   * Retrieves messages from a conversation (from in-memory cache).
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

    if (offset > 0) {
      messages = messages.slice(offset);
    }

    if (limit) {
      messages = messages.slice(0, limit);
    }

    return messages;
  }

  /**
   * DELETE CONVERSATION
   * 
   * Deletes a conversation from both cache and database.
   * Database cascade-deletes associated messages and artifacts.
   * 
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteConversation(conversationId) {
    const deleted = this.conversations.delete(conversationId);
    
    // Delete from database too (cascade deletes messages, artifacts)
    if (this.db && this.db.db) {
      try {
        this.db.deleteConversation(conversationId);
      } catch (dbError) {
        console.error(`[ConversationService] DB delete failed: ${dbError.message}`);
      }
    }
    
    if (deleted) {
      console.log(`[ConversationService] Deleted conversation: ${conversationId}`);
    }

    return deleted;
  }

  /**
   * LIST CONVERSATIONS
   * 
   * Lists all conversations sorted by most recent first.
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

    if (offset > 0) {
      conversations = conversations.slice(offset);
    }

    if (limit) {
      conversations = conversations.slice(0, limit);
    }

    return conversations;
  }

  /**
   * GET CONVERSATION COUNT
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
   * This is runtime-only state (not persisted to DB) because artifacts
   * are a session concern — they're tracked in the database separately
   * by ArtifactManagerService.
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
      if (conversation.artifactHistory.length > 5) {
        conversation.artifactHistory.shift();
      }
    }
    
    // Set current artifact (runtime state for LLM context injection)
    conversation.currentArtifact = {
      artifact_id: artifact.artifact_id,
      artifact_type: artifact.artifact_type,
      html_summary: artifact.html ? this.summarizeArtifactHtml(artifact.html) : null,
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
   * Creates a compact text summary of artifact HTML for LLM context.
   * Strips CSS/JS, keeps text content, truncates to 4000 chars.
   * 
   * @param {string} html - Full HTML content
   * @returns {string} Summarized text content
   */
  summarizeArtifactHtml(html) {
    if (!html) return null;
    
    let summary = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    summary = summary.replace(/<[^>]+>/g, ' ');
    summary = summary.replace(/\s+/g, ' ').trim();
    
    if (summary.length > 4000) {
      summary = summary.substring(0, 4000) + '...';
    }
    
    return summary;
  }
}

module.exports = ConversationService;
