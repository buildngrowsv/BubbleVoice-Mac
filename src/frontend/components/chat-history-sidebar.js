/**
 * CHAT HISTORY SIDEBAR COMPONENT
 * 
 * **Purpose**: Display list of past conversations with switching capability
 * 
 * **What It Provides**:
 * - List of all conversations with metadata
 * - Editable conversation titles
 * - Timestamp formatting ("5m ago", "2h ago")
 * - Last message preview
 * - New conversation button
 * - Delete conversation functionality
 * - Conversation switching
 * - Search/filter conversations
 * 
 * **Why This Exists**:
 * Users need to access past conversations and start new ones.
 * This provides a familiar chat app experience.
 * 
 * **Product Context**:
 * Similar to ChatGPT, Claude, or any modern chat app - users expect
 * to see their conversation history and easily switch between chats.
 * 
 * **Technical Approach**:
 * - Fetches conversations from backend via IPC
 * - Renders as scrollable list
 * - Updates in real-time as new messages arrive
 * - Persists to user-selected folder
 * 
 * **Created**: 2026-01-25
 * **Part of**: Chat History & Persistent Storage Feature
 */

class ChatHistorySidebar {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the chat history sidebar.
     * 
     * **Technical**: Creates DOM structure and loads conversations
     * **Why**: Sidebar is visible by default on larger screens
     * **Product**: Easy access to conversation history
     */
    constructor() {
        this.isOpen = true;
        this.conversations = [];
        this.currentConversationId = null;
        this.searchQuery = '';
        
        // Create sidebar element
        this.element = this.render();
        
        // Setup event listeners
        this.setupEventListeners();
        
        console.log('[ChatHistorySidebar] Initialized');
    }
    
    /**
     * RENDER
     * 
     * Creates the sidebar DOM structure.
     * 
     * **Technical**: Returns a div with header, search, list, and actions
     * **Why**: Liquid glass styling for consistency
     * **Product**: Beautiful, professional sidebar
     */
    render() {
        const sidebar = document.createElement('div');
        sidebar.className = 'chat-history-sidebar';
        sidebar.innerHTML = `
            <div class="sidebar-header">
                <h3>💬 Conversations</h3>
                <button class="sidebar-toggle" title="Toggle Sidebar">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M15 5L10 10L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            
            <div class="sidebar-search">
                <input 
                    type="text" 
                    id="conversation-search" 
                    placeholder="Search conversations..."
                    class="search-input"
                >
            </div>
            
            <button class="new-conversation-btn" id="new-conversation-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                New Conversation
            </button>
            
            <div class="conversations-list" id="conversations-list">
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading conversations...</p>
                </div>
            </div>
            
            <div class="sidebar-footer">
                <button class="footer-btn" id="export-conversations" title="Export All">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 12V4M8 12L5 9M8 12L11 9M2 14h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="footer-btn" id="refresh-conversations" title="Refresh">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M14 8A6 6 0 114 4.5M4 4.5V1M4 4.5H7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;
        
        return sidebar;
    }
    
    /**
     * SETUP EVENT LISTENERS
     * 
     * Attaches all event handlers.
     */
    setupEventListeners() {
        // Toggle sidebar
        this.element.querySelector('.sidebar-toggle').addEventListener('click', () => {
            this.toggle();
        });
        
        // New conversation button
        this.element.querySelector('#new-conversation-btn').addEventListener('click', () => {
            this.createNewConversation();
        });
        
        // Search input
        this.element.querySelector('#conversation-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterConversations();
        });
        
        // Refresh button
        this.element.querySelector('#refresh-conversations').addEventListener('click', () => {
            this.loadConversations();
        });
        
        // Export button
        this.element.querySelector('#export-conversations').addEventListener('click', () => {
            this.exportAllConversations();
        });
    }
    
    /**
     * LOAD CONVERSATIONS
     * 
     * Fetches all conversations from backend.
     * 
     * **Technical**: Calls IPC to get conversation list
     * **Why**: Need fresh data from database
     * **Product**: Always show current state
     */
    async loadConversations() {
        try {
            console.log('[ChatHistorySidebar] Loading conversations...');
            
            // Get conversations from backend
            this.conversations = await window.electronAPI.chatHistory.getConversations();
            
            console.log(`[ChatHistorySidebar] Loaded ${this.conversations.length} conversations`);
            
            // Render list
            this.renderConversationsList();
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to load conversations:', error);
            this.showError('Failed to load conversations');
        }
    }
    
    /**
     * RENDER CONVERSATIONS LIST
     * 
     * Renders the list of conversations.
     */
    renderConversationsList() {
        const listContainer = this.element.querySelector('#conversations-list');
        
        if (!this.conversations || this.conversations.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No conversations yet</p>
                    <p class="empty-hint">Start a new conversation to begin</p>
                </div>
            `;
            return;
        }
        
        // Filter conversations if search query exists
        const filtered = this.searchQuery 
            ? this.conversations.filter(conv => 
                conv.title.toLowerCase().includes(this.searchQuery) ||
                (conv.lastMessage && conv.lastMessage.toLowerCase().includes(this.searchQuery))
              )
            : this.conversations;
        
        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>No matching conversations</p>
                </div>
            `;
            return;
        }
        
        // Render conversation items
        listContainer.innerHTML = filtered.map(conv => this.renderConversationItem(conv)).join('');
        
        // Add click handlers
        listContainer.querySelectorAll('.conversation-item').forEach(item => {
            const convId = item.dataset.conversationId;
            
            // Click to switch conversation
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.conversation-actions')) {
                    this.switchToConversation(convId);
                }
            });
            
            // Delete button
            const deleteBtn = item.querySelector('.delete-conversation');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteConversation(convId);
                });
            }
            
            // Edit title button
            const editBtn = item.querySelector('.edit-title');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editConversationTitle(convId);
                });
            }
        });
    }
    
    /**
     * RENDER CONVERSATION ITEM
     * 
     * Renders a single conversation item.
     * 
     * @param {Object} conversation - Conversation data
     * @returns {string} HTML string
     */
    renderConversationItem(conversation) {
        const isActive = conversation.id === this.currentConversationId;
        const timestamp = this.formatTimestamp(conversation.updated_at || conversation.created_at);
        const preview = conversation.lastMessage 
            ? this.truncateText(conversation.lastMessage, 60)
            : 'No messages yet';
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 data-conversation-id="${conversation.id}"
                 data-testid="conversation-item">
                <div class="conversation-main">
                    <div class="conversation-title">${this.escapeHtml(conversation.title)}</div>
                    <div class="conversation-preview">${this.escapeHtml(preview)}</div>
                    <div class="conversation-meta">
                        <span class="conversation-time">${timestamp}</span>
                        <span class="conversation-count">${conversation.message_count || 0} messages</span>
                    </div>
                </div>
                <div class="conversation-actions">
                    <button class="action-btn edit-title" title="Edit Title">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M10 2l2 2-6 6H4V8l6-6z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="action-btn delete-conversation" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 4h10M5 4V2h4v2M3 4v8a1 1 0 001 1h6a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * FORMAT TIMESTAMP
     * 
     * Converts timestamp to relative time ("5m ago", "2h ago").
     * 
     * @param {number|string} timestamp - Timestamp in ms or ISO string
     * @returns {string} Formatted time
     */
    formatTimestamp(timestamp) {
        const now = Date.now();
        const then = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        const diffMs = now - then;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHour < 24) return `${diffHour}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
        return new Date(then).toLocaleDateString();
    }
    
    /**
     * TRUNCATE TEXT
     * 
     * Truncates text to max length with ellipsis.
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '...';
    }
    
    /**
     * ESCAPE HTML
     * 
     * Escapes HTML special characters to prevent XSS.
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * TOGGLE SIDEBAR
     * 
     * Opens/closes the sidebar.
     */
    toggle() {
        this.isOpen = !this.isOpen;
        this.element.classList.toggle('collapsed', !this.isOpen);
        
        // Rotate toggle icon
        const toggleBtn = this.element.querySelector('.sidebar-toggle svg');
        if (toggleBtn) {
            toggleBtn.style.transform = this.isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        }
        
        console.log(`[ChatHistorySidebar] ${this.isOpen ? 'Opened' : 'Closed'}`);
    }
    
    /**
     * CREATE NEW CONVERSATION
     * 
     * Creates a new conversation and switches to it.
     */
    async createNewConversation() {
        try {
            console.log('[ChatHistorySidebar] Creating new conversation...');
            
            const result = await window.electronAPI.chatHistory.createConversation();
            
            if (result.success) {
                console.log(`[ChatHistorySidebar] Created conversation: ${result.id}`);
                
                // Reload list
                await this.loadConversations();
                
                // Switch to new conversation
                this.switchToConversation(result.id);
                
                // Emit event for app
                this.emitEvent('conversation-created', { id: result.id });
            }
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to create conversation:', error);
            this.showError('Failed to create conversation');
        }
    }
    
    /**
     * SWITCH TO CONVERSATION
     * 
     * Switches to a different conversation.
     * 
     * @param {string} conversationId - Conversation ID to switch to
     */
    async switchToConversation(conversationId) {
        if (conversationId === this.currentConversationId) return;
        
        try {
            console.log(`[ChatHistorySidebar] Switching to conversation: ${conversationId}`);
            
            this.currentConversationId = conversationId;
            
            // Update active state in UI
            this.element.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.toggle('active', item.dataset.conversationId === conversationId);
            });
            
            // Emit event for app to load conversation
            this.emitEvent('conversation-switched', { id: conversationId });
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to switch conversation:', error);
            this.showError('Failed to switch conversation');
        }
    }
    
    /**
     * DELETE CONVERSATION
     * 
     * Deletes a conversation after confirmation.
     * 
     * @param {string} conversationId - Conversation ID to delete
     */
    async deleteConversation(conversationId) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (!conversation) return;
        
        const confirmMsg = `Delete "${conversation.title}"?\n\nThis will permanently delete all messages and cannot be undone.`;
        
        if (!confirm(confirmMsg)) return;
        
        try {
            console.log(`[ChatHistorySidebar] Deleting conversation: ${conversationId}`);
            
            const result = await window.electronAPI.chatHistory.deleteConversation(conversationId);
            
            if (result.success) {
                console.log('[ChatHistorySidebar] Conversation deleted');
                
                // If we deleted the current conversation, create a new one
                if (conversationId === this.currentConversationId) {
                    await this.createNewConversation();
                } else {
                    // Just reload the list
                    await this.loadConversations();
                }
                
                this.showNotification('Conversation deleted', 'success');
            }
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to delete conversation:', error);
            this.showError('Failed to delete conversation');
        }
    }
    
    /**
     * EDIT CONVERSATION TITLE
     * 
     * Allows user to edit conversation title inline.
     * 
     * @param {string} conversationId - Conversation ID
     */
    async editConversationTitle(conversationId) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (!conversation) return;
        
        const newTitle = prompt('Enter new title:', conversation.title);
        
        if (!newTitle || newTitle === conversation.title) return;
        
        try {
            console.log(`[ChatHistorySidebar] Updating title for: ${conversationId}`);
            
            const result = await window.electronAPI.chatHistory.updateConversationTitle(
                conversationId,
                newTitle
            );
            
            if (result.success) {
                console.log('[ChatHistorySidebar] Title updated');
                
                // Update local state
                conversation.title = newTitle;
                
                // Re-render
                this.renderConversationsList();
                
                this.showNotification('Title updated', 'success');
            }
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to update title:', error);
            this.showError('Failed to update title');
        }
    }
    
    /**
     * FILTER CONVERSATIONS
     * 
     * Filters conversations based on search query.
     */
    filterConversations() {
        this.renderConversationsList();
    }
    
    /**
     * EXPORT ALL CONVERSATIONS
     * 
     * Exports all conversations to a ZIP file.
     */
    async exportAllConversations() {
        try {
            console.log('[ChatHistorySidebar] Exporting all conversations...');
            
            const result = await window.electronAPI.chatHistory.exportConversations();
            
            if (result.success) {
                this.showNotification(`Exported to: ${result.path}`, 'success');
            }
            
        } catch (error) {
            console.error('[ChatHistorySidebar] Failed to export:', error);
            this.showError('Failed to export conversations');
        }
    }
    
    /**
     * UPDATE CONVERSATION
     * 
     * Updates a conversation in the list (called when new message arrives).
     * 
     * @param {string} conversationId - Conversation ID
     * @param {Object} updates - Updates to apply
     */
    updateConversation(conversationId, updates) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (conversation) {
            Object.assign(conversation, updates);
            this.renderConversationsList();
        }
    }
    
    /**
     * SET CURRENT CONVERSATION
     * 
     * Sets the active conversation.
     * 
     * @param {string} conversationId - Conversation ID
     */
    setCurrentConversation(conversationId) {
        this.currentConversationId = conversationId;
        
        // Update active state
        this.element.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('active', item.dataset.conversationId === conversationId);
        });
    }
    
    /**
     * EMIT EVENT
     * 
     * Emits a custom event for the app to listen to.
     * 
     * @param {string} eventName - Event name
     * @param {Object} detail - Event detail
     */
    emitEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        this.element.dispatchEvent(event);
    }
    
    /**
     * SHOW NOTIFICATION
     * 
     * Shows a temporary notification.
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `sidebar-notification ${type}`;
        notification.textContent = message;
        
        this.element.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    /**
     * SHOW ERROR
     * 
     * Shows an error message.
     */
    showError(message) {
        this.showNotification(message, 'error');
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatHistorySidebar;
}
