/**
 * BUBBLEVOICE MAC - WEBSOCKET CLIENT
 * 
 * Manages real-time bidirectional communication with the backend server.
 * Handles connection, reconnection, message sending, and event routing.
 * 
 * RESPONSIBILITIES:
 * - Establish WebSocket connection to backend
 * - Handle connection lifecycle (connect, disconnect, reconnect)
 * - Send messages to backend
 * - Receive and route messages from backend
 * - Implement automatic reconnection with exponential backoff
 * 
 * MESSAGE TYPES FROM BACKEND:
 * - transcription_update: Real-time speech transcription
 * - ai_response: AI generated response
 * - ai_response_stream: Streaming AI response (token by token)
 * - bubbles: Proactive bubble suggestions
 * - artifact: Generated artifact
 * - error: Error message
 * - status: Status update
 * 
 * PRODUCT CONTEXT:
 * Real-time communication is critical for natural conversation flow.
 * Transcription needs to appear instantly, AI responses should stream
 * naturally, and the connection should recover gracefully from failures.
 * 
 * TECHNICAL NOTES:
 * - Uses native WebSocket API
 * - Implements exponential backoff for reconnection
 * - Queues messages when disconnected
 * - Handles binary and text messages
 */

class WebSocketClient {
  constructor(url, app) {
    // WebSocket URL (e.g., ws://localhost:7483)
    this.url = url;

    // Reference to main app
    // Used to call app methods when messages arrive
    this.app = app;

    // WebSocket instance
    this.ws = null;

    // Connection state
    this.isConnected = false;
    this.isReconnecting = false;

    // Reconnection configuration
    // Implements exponential backoff to avoid overwhelming the server
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.reconnectTimer = null;

    // Message queue
    // Stores messages to send when connection is re-established
    this.messageQueue = [];
  }

  /**
   * CONNECT
   * 
   * Establishes WebSocket connection to backend.
   * Sets up event handlers and initiates handshake.
   * 
   * @returns {Promise} Resolves when connected, rejects on error
   */
  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocketClient] Already connected');
      return;
    }

    console.log('[WebSocketClient] Connecting to:', this.url);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        // Connection opened
        this.ws.addEventListener('open', () => {
          console.log('[WebSocketClient] Connected');
          this.onConnected();
          resolve();
        });

        // Message received
        this.ws.addEventListener('message', (event) => {
          this.onMessage(event);
        });

        // Connection closed
        this.ws.addEventListener('close', (event) => {
          console.log('[WebSocketClient] Disconnected:', event.code, event.reason);
          this.onDisconnected();
        });

        // Connection error
        this.ws.addEventListener('error', (error) => {
          console.error('[WebSocketClient] Error:', error);
          reject(error);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.ws.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        console.error('[WebSocketClient] Connection error:', error);
        reject(error);
      }
    });
  }

  /**
   * DISCONNECT
   * 
   * Closes the WebSocket connection gracefully.
   */
  disconnect() {
    if (!this.ws) {
      return;
    }

    console.log('[WebSocketClient] Disconnecting');
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close connection
    this.ws.close(1000, 'Client disconnect');
    this.ws = null;
    this.isConnected = false;
  }

  /**
   * SEND MESSAGE
   * 
   * Sends a message to the backend.
   * Queues message if not connected.
   * 
   * @param {Object} message - Message object to send
   * @returns {Promise} Resolves when message is sent
   */
  async sendMessage(message) {
    // Add timestamp if not present
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }

    // If not connected, queue the message
    if (!this.isConnected) {
      console.log('[WebSocketClient] Not connected, queueing message');
      this.messageQueue.push(message);
      return;
    }

    try {
      const payload = JSON.stringify(message);
      this.ws.send(payload);
      console.log('[WebSocketClient] Sent:', message.type);
    } catch (error) {
      console.error('[WebSocketClient] Error sending message:', error);
      // Queue message for retry
      this.messageQueue.push(message);
      throw error;
    }
  }

  /**
   * ON CONNECTED
   * 
   * Called when WebSocket connection is established.
   * Resets reconnection state and sends queued messages.
   */
  onConnected() {
    this.isConnected = true;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    // Notify app
    this.app.onConnected();

    // Send queued messages
    this.flushMessageQueue();
  }

  /**
   * ON DISCONNECTED
   * 
   * Called when WebSocket connection is closed.
   * Initiates reconnection if not intentional disconnect.
   */
  onDisconnected() {
    this.isConnected = false;

    // Notify app
    this.app.onDisconnected();

    // Attempt to reconnect
    this.scheduleReconnect();
  }

  /**
   * SCHEDULE RECONNECT
   * 
   * Schedules a reconnection attempt with exponential backoff.
   * Gives up after maxReconnectAttempts.
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocketClient] Max reconnect attempts reached');
      this.app.showError('Lost connection to backend. Please restart the app.');
      return;
    }

    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`[WebSocketClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // Notify app
    this.app.onReconnecting();

    // Schedule reconnect
    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  /**
   * RECONNECT
   * 
   * Attempts to reconnect to the backend.
   */
  async reconnect() {
    console.log('[WebSocketClient] Attempting to reconnect...');

    try {
      await this.connect();
      console.log('[WebSocketClient] Reconnected successfully');
    } catch (error) {
      console.error('[WebSocketClient] Reconnection failed:', error);
      this.isReconnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * FLUSH MESSAGE QUEUE
   * 
   * Sends all queued messages after reconnection.
   */
  async flushMessageQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`[WebSocketClient] Flushing ${this.messageQueue.length} queued messages`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      try {
        await this.sendMessage(message);
      } catch (error) {
        console.error('[WebSocketClient] Error sending queued message:', error);
      }
    }
  }

  /**
   * ON MESSAGE
   * 
   * Handles incoming messages from the backend.
   * Routes messages to appropriate handlers based on type.
   * 
   * @param {MessageEvent} event - WebSocket message event
   */
  onMessage(event) {
    try {
      // Parse message
      const message = JSON.parse(event.data);
      console.log('[WebSocketClient] Received:', message.type);

      // Route to appropriate handler
      switch (message.type) {
        case 'transcription_update':
          this.handleTranscriptionUpdate(message.data);
          break;

        case 'ai_response':
          this.handleAIResponse(message.data);
          break;

        case 'ai_response_stream_start':
          this.handleAIResponseStreamStart(message.data);
          break;

        case 'ai_response_stream_chunk':
          this.handleAIResponseStreamChunk(message.data);
          break;

        case 'ai_response_stream_end':
          this.handleAIResponseStreamEnd(message.data);
          break;

        case 'bubbles':
          this.handleBubbles(message.data);
          break;

        case 'artifact':
          this.handleArtifact(message.data);
          break;

        case 'error':
          this.handleError(message.data);
          break;

        case 'status':
          this.handleStatus(message.data);
          break;

        case 'voices_list':
          this.handleVoicesList(message.data);
          break;

        case 'pong':
          // Pong response to ping - no action needed, just confirms connection is alive
          console.log('[WebSocketClient] Received pong');
          break;

        default:
          console.warn('[WebSocketClient] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[WebSocketClient] Error handling message:', error);
    }
  }

  /**
   * MESSAGE HANDLERS
   * 
   * These methods handle specific message types from the backend.
   */

  handleTranscriptionUpdate(data) {
    this.app.voiceController.handleTranscription(data);
  }

  handleAIResponse(data) {
    this.app.handleAIResponse(data);
  }

  handleAIResponseStreamStart(data) {
    this.app.conversationManager.startStreamingMessage('assistant');
  }

  handleAIResponseStreamChunk(data) {
    this.app.conversationManager.updateStreamingMessage(data.content);
  }

  handleAIResponseStreamEnd(data) {
    this.app.conversationManager.endStreamingMessage();
    
    // Handle bubbles and artifacts if present
    if (data.bubbles) {
      this.handleBubbles(data.bubbles);
    }
    if (data.artifact) {
      this.handleArtifact(data.artifact);
    }
    if (data.audioUrl) {
      this.app.voiceController.playAudio(data.audioUrl);
    }

    this.app.state.isProcessing = false;
    this.app.updateStatus('Ready', 'connected');
  }

  handleBubbles(data) {
    if (this.app.state.settings.showBubbles) {
      this.app.displayBubbles(data.bubbles || data);
    }
  }

  handleArtifact(data) {
    this.app.conversationManager.addArtifact(data);
  }

  handleError(data) {
    console.error('[WebSocketClient] Backend error:', data);
    this.app.showError(data.message || 'An error occurred');
  }

  handleStatus(data) {
    console.log('[WebSocketClient] Status:', data.message);
    // Could update UI status indicator here
  }

  /**
   * HANDLE VOICES LIST
   *
   * Called when backend responds with available TTS voices.
   * Updates the voice controller and triggers UI refresh.
   *
   * TECHNICAL NOTES:
   * - This is the response to a 'get_voices' request
   * - The voices array contains voice objects with name, lang, etc.
   * - The UI should be updated to show available voices in settings
   *
   * WHY THIS HANDLER:
   * Previously missing, which caused "Unknown message type: voices_list" warnings.
   * The get_voices message was being sent correctly but the response wasn't handled.
   *
   * @param {Object} data - Data containing voices array
   * @param {Array} data.voices - Array of voice objects
   */
  handleVoicesList(data) {
    console.log('[WebSocketClient] Received voices list:', data.voices ? data.voices.length : 0, 'voices');

    // Store voices in voice controller for later use
    // The voice controller can use this to populate the voice dropdown
    if (this.app.voiceController) {
      this.app.voiceController.availableVoices = data.voices || [];
    }

    // Trigger UI update if the settings panel is open
    // This will refresh the voice dropdown with new options
    if (typeof this.app.populateVoices === 'function') {
      // Only call if voices changed
      if (data.voices && data.voices.length > 0) {
        this.app.populateVoices();
      }
    }
  }
}

console.log('[WebSocketClient] WebSocketClient class loaded');
