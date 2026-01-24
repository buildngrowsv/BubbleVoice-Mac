/**
 * BUBBLEVOICE MAC - CHAT SIDEBAR COMPONENT
 * 
 * Manages the conversation history sidebar.
 * Allows users to view, switch, create, and delete conversations.
 * 
 * RESPONSIBILITIES:
 * - Display list of all conversations
 * - Handle conversation switching
 * - Create new conversations
 * - Delete conversations
 * - Show conversation metadata (title, time, preview)
 * - Keyboard shortcuts (⌘N, ⌘B, ⌘1-9)
 * 
 * PRODUCT CONTEXT:
 * Users often have multiple ongoing conversations with their AI companion.
 * The sidebar provides quick access to conversation history and context switching.
 * Each conversation maintains its own context and memory.
 * 
 * DESIGN PHILOSOPHY:
 * - Collapsible to maximize conversation space
 * - Liquid Glass styling for visual consistency
 * - Smooth animations for state changes
 * - Keyboard-first navigation
 * - Clear visual hierarchy (active conversation highlighted)
 * 
 * TECHNICAL NOTES:
 * - Conversations stored in-memory (will be persisted to SQLite later)
 * - Integrates with ConversationService via WebSocket
 * - Timestamps formatted as relative time ("5m ago", "2h ago", "3d ago")
 * - Preview shows last user or AI message (truncated to 50 chars)
 * 
 * FUTURE ENHANCEMENTS:
 * - Search conversations
 * - Filter by date/topic
 * - Pin important conversations
 * - Archive old conversations
 * - Export conversations
 */

class ChatSidebar {
  constructor() {
    // DOM elements
    // These are the key UI elements we'll interact with
    this.sidebar = document.getElementById('chat-sidebar');
    this.conversationsList = document.getElementById('conversations-list');
    this.newChatButton = document.getElementById('new-chat-button');
    this.toggleButton = document.getElementById('toggle-sidebar-button');
    
    // State
    // Track which conversation is currently active and sidebar visibility
    this.currentConversationId = null;
    this.conversations = new Map(); // conversationId -> conversation data
    this.isExpanded = true; // Sidebar starts expanded
    
    // Bind methods
    // This ensures 'this' refers to the ChatSidebar instance in event handlers
    // WHY: JavaScript event handlers change the context of 'this'
    // BECAUSE: We need to access instance properties and methods
    this.handleNewChat = this.handleNewChat.bind(this);
    this.handleToggleSidebar = this.handleToggleSidebar.bind(this);
    this.handleConversationClick = this.handleConversationClick.bind(this);
    this.handleDeleteConversation = this.handleDeleteConversation.bind(this);
    this.handleKeyboardShortcut = this.handleKeyboardShortcut.bind(this);
    
    // Initialize
    this.init();
  }
  
  /**
   * INITIALIZE
   * 
   * Sets up event listeners and loads initial conversation list.
   * Called once when the component is created.
   * 
   * TECHNICAL NOTE:
   * We use event delegation for conversation items since they're
   * dynamically created. This is more efficient than adding listeners
   * to each item individually.
   */
  init() {
    console.log('[ChatSidebar] Initializing chat sidebar');
    
    // Button event listeners
    // WHY: Direct listeners for static elements
    // BECAUSE: These buttons always exist in the DOM
    if (this.newChatButton) {
      this.newChatButton.addEventListener('click', this.handleNewChat);
    }
    
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', this.handleToggleSidebar);
    }
    
    // Event delegation for conversation items
    // WHY: Conversation items are created dynamically
    // BECAUSE: We can't attach listeners to elements that don't exist yet
    // SOLUTION: Listen on parent and check if clicked element is a conversation item
    if (this.conversationsList) {
      this.conversationsList.addEventListener('click', (e) => {
        // Check if clicked element is a conversation item
        const conversationItem = e.target.closest('.conversation-item');
        if (conversationItem && !e.target.closest('.delete-conversation')) {
          this.handleConversationClick(conversationItem.dataset.conversationId);
        }
        
        // Check if clicked element is a delete button
        const deleteButton = e.target.closest('.delete-conversation');
        if (deleteButton) {
          const conversationItem = deleteButton.closest('.conversation-item');
          if (conversationItem) {
            this.handleDeleteConversation(conversationItem.dataset.conversationId);
          }
        }
      });
    }
    
    // Keyboard shortcuts
    // WHY: Power users prefer keyboard navigation
    // BECAUSE: It's faster than mouse clicking
    document.addEventListener('keydown', this.handleKeyboardShortcut);
    
    // Load conversations from backend
    // This will be populated when we receive conversation list from WebSocket
    this.loadConversations();
  }
  
  /**
   * LOAD CONVERSATIONS
   * 
   * Requests conversation list from backend.
   * In the future, this will load from SQLite.
   * 
   * TECHNICAL NOTE:
   * Currently conversations are in-memory only.
   * When we add persistence, this will query the database.
   */
  loadConversations() {
    console.log('[ChatSidebar] Loading conversations');
    
    // Request conversation list from backend via WebSocket
    // The backend will respond with 'conversations_list' event
    if (window.websocketClient) {
      window.websocketClient.send('get_conversations', {});
    }
  }
  
  /**
   * UPDATE CONVERSATIONS LIST
   * 
   * Called when we receive conversation data from backend.
   * Updates the sidebar UI with current conversations.
   * 
   * @param {Array} conversations - Array of conversation objects
   * 
   * CONVERSATION OBJECT STRUCTURE:
   * {
   *   id: 'session-123',
   *   title: 'My conversation',
   *   createdAt: '2026-01-24T10:30:00Z',
   *   updatedAt: '2026-01-24T10:35:00Z',
   *   messages: [...],
   *   lastMessage: 'Last message text...'
   * }
   */
  updateConversationsList(conversations) {
    console.log('[ChatSidebar] Updating conversations list', conversations.length);
    
    // Store conversations in Map for quick lookup
    // WHY: Map provides O(1) lookup by ID
    // BECAUSE: We frequently need to find conversations by ID
    this.conversations.clear();
    conversations.forEach(conv => {
      this.conversations.set(conv.id, conv);
    });
    
    // Clear existing list
    if (this.conversationsList) {
      this.conversationsList.innerHTML = '';
    }
    
    // Sort conversations by most recent first
    // WHY: Users want to see recent conversations at the top
    // BECAUSE: They're most likely to continue recent conversations
    const sortedConversations = conversations.sort((a, b) => {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    // Render each conversation
    sortedConversations.forEach(conv => {
      this.renderConversationItem(conv);
    });
    
    // If no conversations exist, show empty state
    if (conversations.length === 0) {
      this.showEmptyState();
    }
  }
  
  /**
   * RENDER CONVERSATION ITEM
   * 
   * Creates and appends a conversation item to the sidebar.
   * 
   * @param {Object} conversation - Conversation data
   * 
   * DESIGN NOTES:
   * - Active conversation has special styling
   * - Timestamp is relative ("5m ago" not "10:30 AM")
   * - Preview is truncated to 50 characters
   * - Delete button appears on hover
   */
  renderConversationItem(conversation) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.conversationId = conversation.id;
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    
    // Mark as active if this is the current conversation
    if (conversation.id === this.currentConversationId) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'true');
    }
    
    // Format timestamp as relative time
    // WHY: "5m ago" is more intuitive than "10:30 AM"
    // BECAUSE: Users think in relative time for recent events
    const timeAgo = this.formatTimeAgo(conversation.updatedAt);
    
    // Get preview text from last message
    // WHY: Helps users identify conversations
    // BECAUSE: Titles alone may not be descriptive enough
    const preview = this.getConversationPreview(conversation);
    
    // Get title (editable in future)
    // WHY: Users should be able to name their conversations
    // BECAUSE: Default titles like "Conversation 1" aren't meaningful
    const title = conversation.title || this.generateDefaultTitle(conversation);
    
    // Build HTML structure
    // TECHNICAL NOTE: We use data attributes for accessibility and testing
    item.innerHTML = `
      <div class="conversation-title" data-testid="conversation-title">${this.escapeHtml(title)}</div>
      <div class="conversation-meta">
        <span class="conversation-time" data-testid="conversation-time">${timeAgo}</span>
        <span class="conversation-preview" data-testid="conversation-preview">${this.escapeHtml(preview)}</span>
      </div>
      <button class="delete-conversation"
              data-testid="delete-conversation"
              aria-label="Delete conversation"
              title="Delete conversation">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    
    // Add keyboard navigation
    // WHY: Accessibility and power user efficiency
    // BECAUSE: Some users navigate entirely by keyboard
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handleConversationClick(conversation.id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.handleDeleteConversation(conversation.id);
      }
    });
    
    // Append to list
    if (this.conversationsList) {
      this.conversationsList.appendChild(item);
    }
  }
  
  /**
   * SHOW EMPTY STATE
   * 
   * Displays a helpful message when there are no conversations.
   * 
   * PRODUCT CONTEXT:
   * First-time users see this state. It should be welcoming
   * and guide them to start their first conversation.
   */
  showEmptyState() {
    if (!this.conversationsList) return;
    
    const emptyState = document.createElement('div');
    emptyState.className = 'conversations-empty-state';
    emptyState.setAttribute('data-testid', 'conversations-empty-state');
    emptyState.innerHTML = `
      <div class="empty-state-icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" opacity="0.3"/>
          <path d="M24 16v16M16 24h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="empty-state-text">No conversations yet</p>
      <p class="empty-state-hint">Click + to start a new conversation</p>
    `;
    
    this.conversationsList.appendChild(emptyState);
  }
  
  /**
   * HANDLE NEW CHAT
   * 
   * Creates a new conversation and switches to it.
   * 
   * PRODUCT FLOW:
   * 1. User clicks "+" button or presses ⌘N
   * 2. Backend creates new conversation
   * 3. Frontend switches to new conversation
   * 4. User can start talking immediately
   * 
   * TECHNICAL NOTE:
   * The backend generates a unique conversation ID.
   * We don't generate IDs on the frontend to avoid conflicts.
   */
  handleNewChat() {
    console.log('[ChatSidebar] Creating new conversation');
    
    // Request new conversation from backend
    // The backend will respond with 'conversation_created' event
    if (window.websocketClient) {
      window.websocketClient.send('create_conversation', {});
    }
    
    // Visual feedback
    // WHY: User needs to know their action was registered
    // BECAUSE: Network requests can take time
    if (this.newChatButton) {
      this.newChatButton.classList.add('loading');
      setTimeout(() => {
        this.newChatButton.classList.remove('loading');
      }, 500);
    }
  }
  
  /**
   * HANDLE CONVERSATION CLICK
   * 
   * Switches to a different conversation.
   * 
   * @param {string} conversationId - ID of conversation to switch to
   * 
   * PRODUCT FLOW:
   * 1. User clicks conversation in sidebar
   * 2. Frontend requests conversation data from backend
   * 3. Backend sends conversation messages
   * 4. Frontend displays messages
   * 5. User can continue conversation
   * 
   * TECHNICAL NOTE:
   * We update the UI immediately for responsiveness,
   * then load the actual conversation data from backend.
   */
  handleConversationClick(conversationId) {
    console.log('[ChatSidebar] Switching to conversation', conversationId);
    
    // Don't switch if already on this conversation
    if (conversationId === this.currentConversationId) {
      return;
    }
    
    // Update active conversation
    this.currentConversationId = conversationId;
    
    // Update UI to show active state
    // WHY: Visual feedback for user
    // BECAUSE: Users need to know which conversation they're viewing
    const items = this.conversationsList?.querySelectorAll('.conversation-item');
    items?.forEach(item => {
      if (item.dataset.conversationId === conversationId) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'true');
      } else {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      }
    });
    
    // Request conversation data from backend
    // The backend will respond with 'conversation_loaded' event
    if (window.websocketClient) {
      window.websocketClient.send('switch_conversation', { conversationId });
    }
    
    // Notify app component about conversation switch
    // WHY: Other components need to know (e.g., conversation manager)
    // BECAUSE: They need to update their state and UI
    window.dispatchEvent(new CustomEvent('conversation-switched', {
      detail: { conversationId }
    }));
  }
  
  /**
   * HANDLE DELETE CONVERSATION
   * 
   * Deletes a conversation after confirmation.
   * 
   * @param {string} conversationId - ID of conversation to delete
   * 
   * PRODUCT DECISION:
   * We ask for confirmation because deletion is permanent.
   * In the future, we might add an "Archive" feature instead.
   * 
   * TECHNICAL NOTE:
   * If deleting the active conversation, we switch to another one.
   * If no conversations remain, we create a new one.
   */
  handleDeleteConversation(conversationId) {
    console.log('[ChatSidebar] Deleting conversation', conversationId);
    
    // Get conversation for confirmation message
    const conversation = this.conversations.get(conversationId);
    const title = conversation?.title || 'this conversation';
    
    // Ask for confirmation
    // WHY: Deletion is permanent (for now)
    // BECAUSE: We don't have undo or archive yet
    const confirmed = confirm(`Delete ${title}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    
    // If deleting active conversation, switch to another
    // WHY: User needs to be viewing a conversation
    // BECAUSE: The UI is designed around having an active conversation
    if (conversationId === this.currentConversationId) {
      // Find another conversation to switch to
      const otherConversation = Array.from(this.conversations.values())
        .find(conv => conv.id !== conversationId);
      
      if (otherConversation) {
        this.handleConversationClick(otherConversation.id);
      } else {
        // No other conversations, create a new one
        this.handleNewChat();
      }
    }
    
    // Request deletion from backend
    // The backend will respond with 'conversation_deleted' event
    if (window.websocketClient) {
      window.websocketClient.send('delete_conversation', { conversationId });
    }
    
    // Remove from local state
    // WHY: Immediate UI feedback
    // BECAUSE: User expects instant response
    this.conversations.delete(conversationId);
    
    // Remove from UI
    const item = this.conversationsList?.querySelector(
      `[data-conversation-id="${conversationId}"]`
    );
    if (item) {
      // Animate removal
      // WHY: Smooth transition is less jarring
      // BECAUSE: Sudden disappearance feels broken
      item.style.opacity = '0';
      item.style.transform = 'translateX(-20px)';
      setTimeout(() => {
        item.remove();
        
        // Show empty state if no conversations left
        if (this.conversations.size === 0) {
          this.showEmptyState();
        }
      }, 200);
    }
  }
  
  /**
   * HANDLE TOGGLE SIDEBAR
   * 
   * Collapses or expands the sidebar.
   * 
   * PRODUCT CONTEXT:
   * Users want to maximize conversation space.
   * Collapsing the sidebar gives more room for messages.
   * 
   * TECHNICAL NOTE:
   * We use CSS transitions for smooth animation.
   * The sidebar width is controlled by a CSS class.
   */
  handleToggleSidebar() {
    console.log('[ChatSidebar] Toggling sidebar');
    
    this.isExpanded = !this.isExpanded;
    
    // Update UI
    if (this.sidebar) {
      if (this.isExpanded) {
        this.sidebar.classList.remove('collapsed');
      } else {
        this.sidebar.classList.add('collapsed');
      }
    }
    
    // Update button aria-expanded
    if (this.toggleButton) {
      this.toggleButton.setAttribute('aria-expanded', this.isExpanded.toString());
    }
    
    // Rotate arrow icon
    // WHY: Visual feedback for collapsed state
    // BECAUSE: User needs to know if sidebar is collapsed or expanded
    const icon = this.toggleButton?.querySelector('svg');
    if (icon) {
      icon.style.transform = this.isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  }
  
  /**
   * HANDLE KEYBOARD SHORTCUT
   * 
   * Handles keyboard shortcuts for sidebar actions.
   * 
   * SHORTCUTS:
   * - ⌘N: New conversation
   * - ⌘B: Toggle sidebar
   * - ⌘1-9: Switch to conversation 1-9
   * 
   * PRODUCT CONTEXT:
   * Power users love keyboard shortcuts.
   * They're much faster than clicking.
   * 
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyboardShortcut(e) {
    // Check for Command key (Meta on Mac)
    if (!e.metaKey) return;
    
    // ⌘N: New conversation
    if (e.key === 'n') {
      e.preventDefault();
      this.handleNewChat();
      return;
    }
    
    // ⌘B: Toggle sidebar
    if (e.key === 'b') {
      e.preventDefault();
      this.handleToggleSidebar();
      return;
    }
    
    // ⌘1-9: Switch to conversation by position
    // WHY: Quick switching between recent conversations
    // BECAUSE: Users often have a few active conversations
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      e.preventDefault();
      const conversations = Array.from(this.conversations.values())
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      
      if (conversations[num - 1]) {
        this.handleConversationClick(conversations[num - 1].id);
      }
    }
  }
  
  /**
   * FORMAT TIME AGO
   * 
   * Converts a timestamp to relative time format.
   * 
   * @param {string} timestamp - ISO 8601 timestamp
   * @returns {string} Relative time ("5m ago", "2h ago", "3d ago")
   * 
   * EXAMPLES:
   * - Less than 1 minute: "just now"
   * - Less than 1 hour: "5m ago"
   * - Less than 1 day: "2h ago"
   * - Less than 1 week: "3d ago"
   * - Less than 1 month: "2w ago"
   * - Older: "Jan 24"
   */
  formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffWeek < 4) return `${diffWeek}w ago`;
    
    // Format as "Jan 24"
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[then.getMonth()]} ${then.getDate()}`;
  }
  
  /**
   * GET CONVERSATION PREVIEW
   * 
   * Extracts preview text from conversation messages.
   * 
   * @param {Object} conversation - Conversation data
   * @returns {string} Preview text (truncated to 50 chars)
   * 
   * LOGIC:
   * - Show last message (user or AI)
   * - Truncate to 50 characters
   * - Add "..." if truncated
   */
  getConversationPreview(conversation) {
    if (!conversation.messages || conversation.messages.length === 0) {
      return 'No messages yet';
    }
    
    // Get last message
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const text = lastMessage.content || '';
    
    // Truncate to 50 characters
    if (text.length > 50) {
      return text.substring(0, 47) + '...';
    }
    
    return text;
  }
  
  /**
   * GENERATE DEFAULT TITLE
   * 
   * Creates a default title for conversations without custom titles.
   * 
   * @param {Object} conversation - Conversation data
   * @returns {string} Default title
   * 
   * LOGIC:
   * - If conversation has messages, use first user message (truncated)
   * - Otherwise, use "New Conversation"
   * 
   * PRODUCT CONTEXT:
   * Default titles should be meaningful but not too long.
   * Users can edit titles later (future feature).
   */
  generateDefaultTitle(conversation) {
    if (!conversation.messages || conversation.messages.length === 0) {
      return 'New Conversation';
    }
    
    // Find first user message
    const firstUserMessage = conversation.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const text = firstUserMessage.content || '';
      // Truncate to 30 characters for title
      if (text.length > 30) {
        return text.substring(0, 27) + '...';
      }
      return text;
    }
    
    return 'New Conversation';
  }
  
  /**
   * ESCAPE HTML
   * 
   * Escapes HTML characters to prevent XSS attacks.
   * 
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   * 
   * SECURITY NOTE:
   * Always escape user-generated content before inserting into DOM.
   * WHY: Prevents XSS (Cross-Site Scripting) attacks
   * BECAUSE: User input could contain malicious HTML/JavaScript
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * UPDATE CONVERSATION TITLE
   * 
   * Updates the title of a conversation.
   * (Future feature - not yet implemented)
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} newTitle - New title
   */
  updateConversationTitle(conversationId, newTitle) {
    console.log('[ChatSidebar] Updating conversation title', conversationId, newTitle);
    
    // Update local state
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.title = newTitle;
    }
    
    // Update UI
    const item = this.conversationsList?.querySelector(
      `[data-conversation-id="${conversationId}"]`
    );
    const titleElement = item?.querySelector('.conversation-title');
    if (titleElement) {
      titleElement.textContent = newTitle;
    }
    
    // Send to backend
    if (window.websocketClient) {
      window.websocketClient.send('update_conversation_title', {
        conversationId,
        title: newTitle
      });
    }
  }
}

// Export for use in app.js
window.ChatSidebar = ChatSidebar;
