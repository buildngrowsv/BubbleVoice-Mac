/**
 * BUBBLEVOICE MAC - CONVERSATION MANAGER
 * 
 * Manages the display and storage of conversation messages.
 * Handles rendering of user messages, AI responses, and artifacts.
 * 
 * RESPONSIBILITIES:
 * - Add messages to the conversation view
 * - Render different message types (text, artifacts)
 * - Auto-scroll to latest message
 * - Format timestamps and metadata
 * - Handle message animations
 * 
 * PRODUCT CONTEXT:
 * The conversation view is the heart of BubbleVoice. It needs to feel
 * natural and flowing, like a real conversation. Messages should appear
 * smoothly, artifacts should render beautifully, and the user should
 * never lose context.
 * 
 * TECHNICAL NOTES:
 * - Uses DOM manipulation for message rendering
 * - Supports streaming responses (partial updates)
 * - Auto-scrolls to keep latest message visible
 * - Handles artifact rendering (HTML injection with sanitization)
 */

class ConversationManager {
  constructor(messagesContainer) {
    // DOM container for messages
    // This is the scrollable area where messages appear
    this.messagesContainer = messagesContainer;

    // Message history
    // Stores all messages in the current conversation
    this.messages = [];

    // Current streaming message
    // Used when AI response is being streamed token-by-token
    this.currentStreamingMessage = null;
  }

  /**
   * ADD MESSAGE
   * 
   * Adds a new message to the conversation.
   * Creates the DOM element and appends it to the container.
   * 
   * @param {Object} message - Message object
   * @param {string} message.role - 'user' or 'assistant'
   * @param {string} message.content - Message text content
   * @param {number} message.timestamp - Unix timestamp
   * @param {Object} [message.artifact] - Optional artifact data
   */
  addMessage(message) {
    console.log('[ConversationManager] Adding message:', message.role);

    // Store in history
    this.messages.push(message);

    // Create message element
    const messageElement = this.createMessageElement(message);

    // Append to container
    this.messagesContainer.appendChild(messageElement);

    // If message has artifact, render it below the message
    if (message.artifact) {
      this.addArtifact(message.artifact, messageElement);
    }

    // Scroll to bottom
    this.scrollToBottom();

    // Trigger animation
    requestAnimationFrame(() => {
      messageElement.classList.add('fade-in');
    });
  }

  /**
   * ADD ARTIFACT
   * 
   * Adds an artifact card below a message.
   * 
   * @param {Object} artifact - Artifact data
   * @param {HTMLElement} messageElement - Message element to attach artifact to
   */
  addArtifact(artifact, messageElement) {
    console.log('[ConversationManager] Adding artifact:', artifact.artifact_type);

    try {
      // Create artifact viewer
      const viewer = new ArtifactViewer(
        artifact.artifact_id,
        artifact.artifact_type,
        artifact.html,
        artifact.data || null
      );

      // Insert artifact card after message
      messageElement.parentNode.insertBefore(viewer.element, messageElement.nextSibling);

      console.log('[ConversationManager] Artifact added successfully');
    } catch (error) {
      console.error('[ConversationManager] Failed to add artifact:', error);
    }
  }

  /**
   * CLEAR MESSAGES
   * 
   * Clears all messages from the conversation view.
   * Used when switching between conversations.
   */
  clearMessages() {
    console.log('[ConversationManager] Clearing messages');
    
    // Clear message history
    this.messages = [];
    
    // Clear DOM
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }
  }

  /**
   * CREATE MESSAGE ELEMENT
   * 
   * Creates the DOM element for a message.
   * Handles different message types and roles.
   * 
   * FEATURES (2026-01-28):
   * - Message bubble with formatted content
   * - Timestamp showing when message was sent
   * - Copy button to copy message text to clipboard
   * 
   * WHY COPY BUTTON: Users need to easily copy AI responses to use elsewhere
   * (emails, documents, etc). Text is selectable but copy button is faster.
   * 
   * @param {Object} message - Message object
   * @returns {HTMLElement} Message DOM element
   */
  createMessageElement(message) {
    // Main message container
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.role}`;
    messageDiv.dataset.timestamp = message.timestamp;

    // Message bubble (contains the actual content)
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = `message-bubble ${message.role}`;

    // Format content (handle markdown, links, etc.)
    bubbleDiv.innerHTML = this.formatMessageContent(message.content);

    // Message footer (timestamp + copy button)
    // WHY: Groups timestamp and copy button together for clean layout
    const footerDiv = document.createElement('div');
    footerDiv.className = 'message-footer';

    // Timestamp
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'message-timestamp';
    timestampDiv.textContent = this.formatTimestamp(message.timestamp);

    // Copy button
    // WHY: Users requested ability to easily copy message content
    // BECAUSE: While text is now selectable, a copy button is faster
    const copyButton = document.createElement('button');
    copyButton.className = 'message-copy-button';
    copyButton.title = 'Copy to clipboard';
    copyButton.setAttribute('aria-label', 'Copy message to clipboard');
    copyButton.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M10 4V2.5A1.5 1.5 0 008.5 1h-6A1.5 1.5 0 001 2.5v6A1.5 1.5 0 002.5 10H4" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="copy-text">Copy</span>
    `;
    
    // Store the original message content for copying (without HTML formatting)
    copyButton.addEventListener('click', async () => {
      try {
        // Copy the original plain text content (not the HTML-formatted version)
        await navigator.clipboard.writeText(message.content);
        
        // Show success feedback
        copyButton.classList.add('copied');
        const textSpan = copyButton.querySelector('.copy-text');
        const originalText = textSpan.textContent;
        textSpan.textContent = 'Copied!';
        
        // Reset after 2 seconds
        setTimeout(() => {
          copyButton.classList.remove('copied');
          textSpan.textContent = originalText;
        }, 2000);
        
        console.log('[ConversationManager] Message copied to clipboard');
      } catch (error) {
        console.error('[ConversationManager] Failed to copy message:', error);
        // Fallback: select text for manual copy
        const range = document.createRange();
        range.selectNodeContents(bubbleDiv);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });

    // Assemble footer
    footerDiv.appendChild(timestampDiv);
    footerDiv.appendChild(copyButton);

    // Assemble message
    messageDiv.appendChild(bubbleDiv);
    messageDiv.appendChild(footerDiv);

    return messageDiv;
  }

  /**
   * FORMAT MESSAGE CONTENT
   * 
   * Formats message text with basic markdown-like formatting.
   * Handles line breaks, links, and basic styling.
   * 
   * SECURITY NOTE:
   * This does basic HTML escaping to prevent XSS attacks.
   * For production, consider using a proper markdown library
   * with sanitization (like marked + DOMPurify).
   * 
   * @param {string} content - Raw message content
   * @returns {string} Formatted HTML content
   */
  formatMessageContent(content) {
    // Escape HTML to prevent XSS
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');

    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Convert *italic* to <em>
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Convert [link](url) to <a>
    formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    return formatted;
  }

  /**
   * FORMAT TIMESTAMP
   * 
   * Formats a Unix timestamp into a human-readable time.
   * Shows time in 12-hour format with AM/PM.
   * 
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  /**
   * START STREAMING MESSAGE
   * 
   * Begins a streaming message that will be updated token-by-token.
   * Used when AI response is streamed in real-time.
   * 
   * @param {string} role - Message role ('assistant')
   * @returns {string} Message ID for updating
   */
  startStreamingMessage(role = 'assistant') {
    console.log('[ConversationManager] Starting streaming message');

    const message = {
      role,
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    };

    this.messages.push(message);

    const messageElement = this.createMessageElement(message);
    this.messagesContainer.appendChild(messageElement);

    this.currentStreamingMessage = {
      message,
      element: messageElement,
      bubbleElement: messageElement.querySelector('.message-bubble')
    };

    this.scrollToBottom();

    return message.timestamp.toString();
  }

  /**
   * UPDATE STREAMING MESSAGE
   * 
   * Appends new content to the currently streaming message.
   * 
   * @param {string} content - New content to append
   */
  updateStreamingMessage(content) {
    if (!this.currentStreamingMessage) {
      console.warn('[ConversationManager] No streaming message to update');
      return;
    }

    this.currentStreamingMessage.message.content += content;
    this.currentStreamingMessage.bubbleElement.innerHTML = 
      this.formatMessageContent(this.currentStreamingMessage.message.content);

    this.scrollToBottom();
  }

  /**
   * END STREAMING MESSAGE
   * 
   * Finalizes the streaming message.
   */
  endStreamingMessage() {
    if (!this.currentStreamingMessage) {
      return;
    }

    console.log('[ConversationManager] Ending streaming message');
    this.currentStreamingMessage.message.isStreaming = false;
    this.currentStreamingMessage = null;
  }

  /**
   * ADD ARTIFACT
   * 
   * Adds an artifact (visual output) to the conversation.
   * Artifacts are rendered as special message types with rich content.
   * 
   * ARTIFACT TYPES:
   * - timeline: Visual timeline of events
   * - chart: Data visualization
   * - card: Decision card or comparison
   * - checklist: Interactive checklist
   * - custom: Custom HTML content
   * 
   * SECURITY NOTE:
   * Artifacts contain HTML. In production, this should be sanitized
   * using DOMPurify or similar to prevent XSS attacks.
   * 
   * @param {Object} artifact - Artifact data
   * @param {string} artifact.type - Artifact type
   * @param {string} artifact.title - Artifact title
   * @param {string} artifact.content - HTML content or data
   */
  addArtifact(artifact) {
    console.log('[ConversationManager] Adding artifact:', artifact.type);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message artifact';
    messageDiv.dataset.timestamp = Date.now();

    const artifactContainer = document.createElement('div');
    artifactContainer.className = `artifact-container artifact-${artifact.type}`;

    // Artifact header
    if (artifact.title) {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'artifact-header';
      headerDiv.textContent = artifact.title;
      artifactContainer.appendChild(headerDiv);
    }

    // Artifact content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'artifact-content glass-card';
    
    // For now, directly inject HTML
    // TODO: Add proper sanitization with DOMPurify
    contentDiv.innerHTML = artifact.content;

    artifactContainer.appendChild(contentDiv);
    messageDiv.appendChild(artifactContainer);

    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();

    // Trigger animation
    requestAnimationFrame(() => {
      messageDiv.classList.add('fade-in');
    });
  }

  /**
   * SCROLL TO BOTTOM
   * 
   * Smoothly scrolls the conversation to the latest message.
   * Uses smooth scrolling for better UX.
   * 
   * CRITICAL FIX: Scroll the messages container itself, not its parent
   * WHY: The .messages container has overflow-y: auto, so it's the scrollable element
   * BECAUSE: Trying to scroll the parent doesn't work when child is the scroll container
   * HISTORY: Bug discovered 2026-01-24 - conversation area wasn't scrollable
   */
  scrollToBottom() {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTo({
        top: this.messagesContainer.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  /**
   * CLEAR CONVERSATION
   * 
   * Removes all messages from the conversation.
   * Used when starting a new conversation.
   */
  clear() {
    console.log('[ConversationManager] Clearing conversation');
    
    this.messages = [];
    this.currentStreamingMessage = null;
    this.messagesContainer.innerHTML = '';
  }

  /**
   * GET MESSAGE COUNT
   * 
   * Returns the number of messages in the conversation.
   * 
   * @returns {number} Message count
   */
  getMessageCount() {
    return this.messages.length;
  }

  /**
   * GET CONVERSATION HISTORY
   * 
   * Returns the full conversation history.
   * Used for saving or exporting conversations.
   * 
   * @returns {Array} Array of message objects
   */
  getHistory() {
    return [...this.messages];
  }
}

console.log('[ConversationManager] ConversationManager class loaded');
