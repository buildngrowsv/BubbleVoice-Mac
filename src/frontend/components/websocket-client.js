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
      // P2 FIX: Show error with retry action instead of just a message
      this.app.showError('Lost connection to backend.', {
        duration: 10000,
        actionLabel: 'Restart Connection',
        onAction: () => {
          this.reconnectAttempts = 0;
          this.scheduleReconnect();
        }
      });
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

        case 'user_message':
          this.handleUserMessage(message.data);
          break;

        case 'ai_response':
          this.handleAIResponse(message.data);
          break;

        case 'ai_response_stream_start':
          this.handleAIResponseStreamStart(message.data);
          break;

        // VOICE PIPELINE THINKING INDICATOR (2026-02-16 FIX):
        // ====================================================
        //
        // This message type is sent by VoicePipelineService when it starts
        // the LLM API call after the user stops speaking. It shows the
        // animated bouncing dots (thinking indicator) WITHOUT creating an
        // empty streaming message bubble.
        //
        // WHY THIS IS DIFFERENT FROM ai_response_stream_start:
        // The voice pipeline collects the FULL LLM response, then delivers
        // it as one ai_response message. It does NOT stream chunks like the
        // text input path does. Previously, the voice pipeline incorrectly
        // sent ai_response_stream_start which created an empty streaming
        // bubble that expected chunk updates — causing the blank bubble bug.
        //
        // FLOW: voice_processing_start → thinking dots shown → LLM processes
        //       → ai_response arrives → handleAIResponse() removes dots + adds message
        case 'voice_processing_start':
          this.handleVoiceProcessingStart(message.data);
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

        case 'api_keys_updated':
          // API KEY CONFIRMATION (2026-02-07):
          // We handle this explicitly because the backend confirms when it
          // receives API keys. Without this case, we log "Unknown message type"
          // which can look like an error even though everything is fine.
          // We route it through the status handler so the logging is consistent.
          this.handleStatus({
            message: message.data?.message || 'API keys updated successfully'
          });
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

        case 'conversations_list':
          this.handleConversationsList(message.data);
          break;

        case 'conversation_created':
          this.handleConversationCreated(message.data);
          break;

        case 'conversation_loaded':
          this.handleConversationLoaded(message.data);
          break;

        case 'conversation_deleted':
          this.handleConversationDeleted(message.data);
          break;

        case 'conversation_title_updated':
          this.handleConversationTitleUpdated(message.data);
          break;

        case 'listening_active':
          // VISUAL FEEDBACK (2026-02-06): Swift helper confirmed audio engine
          // is running and recognition is active. Show the user that we're
          // now actively listening (mic pulse animation, status text, etc.)
          this.handleListeningActive(message.data);
          break;
        
        // SINGLE-WORD UTTERANCE FEEDBACK (2026-02-07):
        // The Swift helper detected speech energy followed by silence, but the
        // SpeechAnalyzer didn't produce any transcription (Finding #11 from testing).
        // This typically happens with very short utterances like "yes", "no", "ok"
        // that fall within the analyzer's ~4-second processing window.
        //
        // PRODUCT IMPACT: Without this handler, the user says "yes" and gets
        // zero feedback — no text appears, no response comes. That feels broken.
        // With this handler, we show a brief, polite hint that encourages them
        // to add a word or two, which the analyzer CAN reliably capture.
        case 'speech_not_captured':
          console.log('[WebSocketClient] Speech not captured:', message.data);
          this.handleSpeechNotCaptured(message.data);
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

  /**
   * HANDLE LISTENING ACTIVE
   * 
   * Called when the Swift helper confirms that the audio engine is running
   * and speech recognition is actively capturing audio.
   * 
   * WHY: There's a perceptible delay between clicking the mic button and
   * actual audio capture starting. The user reported "no visual feedback
   * on when transcription starts so I have to repeat myself." This event
   * provides that feedback — the mic button animates and status changes
   * only when we KNOW audio is being captured.
   * 
   * BECAUSE: Previously, the mic button just toggled immediately on click
   * regardless of whether the backend/Swift helper was ready.
   * 
   * @param {Object} data - { status: 'listening' }
   */
  handleListeningActive(data) {
    console.log('[WebSocketClient] ✅ Listening is active — audio engine confirmed running');
    this.app.handleListeningActive(data);
  }

  /**
   * HANDLE SPEECH NOT CAPTURED (2026-02-07)
   *
   * Called when the Swift helper detected speech energy followed by silence
   * but the SpeechAnalyzer produced no transcription results. This is the
   * "single-word utterance" problem documented in Finding #11.
   *
   * WHAT WE DO:
   * Show a brief, subtle hint in the input field that fades away.
   * This gives the user feedback that we DID hear them, but couldn't
   * transcribe what they said. The hint encourages them to speak more.
   *
   * PRODUCT DESIGN DECISION:
   * We intentionally DON'T show a modal or alert. This is a gentle nudge,
   * not an error state. The user is still in the flow of conversation.
   *
   * WHY NOT AUTO-RETRY:
   * The analyzer already processed the audio and decided it wasn't enough
   * to commit to a transcription. Replaying the same audio won't help.
   * The user needs to provide more signal (speak more words).
   *
   * @param {Object} data - Data from backend
   * @param {string} data.reason - Why speech wasn't captured
   * @param {string} data.hint - User-facing hint text
   */
  handleSpeechNotCaptured(data) {
    console.log('[WebSocketClient] Speech not captured:', data.reason);
    
    const inputField = this.app.elements.inputField;
    if (inputField && !inputField.textContent.trim()) {
      // Show a subtle placeholder-style hint that fades away after 3 seconds
      inputField.textContent = data.hint || "Didn't catch that — try saying a bit more";
      inputField.style.opacity = '0.4';
      inputField.style.fontStyle = 'italic';
      inputField.style.transition = 'opacity 0.3s ease-out';
      
      // Clear the hint after 3 seconds so the field is ready for new input
      setTimeout(() => {
        // Only clear if the hint text is still there (user hasn't spoken new text)
        if (inputField.textContent === (data.hint || "Didn't catch that — try saying a bit more")) {
          inputField.textContent = '';
          inputField.style.opacity = '1.0';
          inputField.style.fontStyle = 'normal';
        }
      }, 3000);
    }
  }

  /**
   * HANDLE USER MESSAGE
   * 
   * Called when the backend sends a user message to display.
   * This happens after the turn detection timer fires (2s of silence).
   * 
   * WHY THIS IS NEEDED:
   * The backend's VoicePipelineService sends user messages when the
   * playback timer fires. This ensures the user's transcribed speech
   * appears as a sent bubble in the conversation.
   * 
   * TECHNICAL NOTES:
   * - Message includes text and timestamp from backend
   * - Displayed as a right-aligned blue bubble (user role)
   * - This is separate from the real-time transcription updates
   * 
   * @param {Object} data - User message data
   * @param {string} data.text - User's transcribed speech
   * @param {number} data.timestamp - When the message was sent
   */
  handleUserMessage(data) {
    console.log('[WebSocketClient] Handling user message:', data.text);
    
    // Add user message to conversation display
    this.app.conversationManager.addMessage({
      role: 'user',
      content: data.text,
      timestamp: data.timestamp
    });

    // Clear the input field if it contains the transcription
    // This prevents the user from seeing duplicate text
    // Handle both input elements and contenteditable divs
    // FIX (2026-01-28): Use innerText instead of textContent to properly handle line breaks
    const inputField = this.app.elements.inputField;
    if (inputField) {
      const currentText = inputField.value || inputField.innerText || '';
      if (currentText.trim() === data.text.trim()) {
        if (inputField.value !== undefined) {
          inputField.value = '';
        } else {
          inputField.textContent = '';  // OK to use textContent for clearing
        }
      }
    }
  }

  handleAIResponse(data) {
    this.app.handleAIResponse(data);
  }

  handleAIResponseStreamStart(data) {
    // Remove thinking indicator when actual streaming begins
    // WHY: The dots should be replaced by real streaming text
    this.app.conversationManager.removeThinkingIndicator();
    this.app.showCancelButton(false);
    this.app.conversationManager.startStreamingMessage('assistant');
  }

  /**
   * HANDLE VOICE PROCESSING START (2026-02-16 FIX)
   * 
   * Shows the thinking indicator (animated bouncing dots) when the voice
   * pipeline starts processing the user's speech through the LLM.
   * 
   * WHY THIS IS SEPARATE FROM handleAIResponseStreamStart:
   * The text-input path uses streaming (start → chunks → end) and needs
   * to create a streaming message bubble. The voice pipeline does NOT
   * stream — it collects the full response and delivers it at once via
   * ai_response. So the voice pipeline only needs thinking dots, not a
   * streaming bubble.
   * 
   * PREVIOUS BUG: Voice pipeline sent ai_response_stream_start which
   * called startStreamingMessage('assistant'), creating an empty gray
   * bubble. Since no chunks ever arrived (voice doesn't stream), this
   * bubble stayed blank forever — the "blank bubble" bug.
   * 
   * @param {Object} data - Empty data object (no payload needed)
   */
  handleVoiceProcessingStart(data) {
    console.log('[WebSocketClient] Voice processing started — showing thinking indicator');
    this.app.conversationManager.showThinkingIndicator();
    this.app.showCancelButton(true);
    this.app.state.isProcessing = true;
    this.app.updateStatus('Thinking...', 'processing');
  }

  handleAIResponseStreamChunk(data) {
    this.app.conversationManager.updateStreamingMessage(data.content);
  }

  handleAIResponseStreamEnd(data) {
    this.app.conversationManager.endStreamingMessage();
    
    // Handle bubbles and artifacts if present
    if (data.bubbles && data.bubbles.length > 0) {
      this.handleBubbles(data.bubbles);
    }
    // Only handle artifact if it has required properties
    // IMPORTANT: LLM generates artifact_type (snake_case) but we also accept type for flexibility
    // The artifact must have either type or artifact_type AND either html or content
    if (data.artifact && (data.artifact.type || data.artifact.artifact_type)) {
      // Normalize the artifact format - convert artifact_type to type if needed
      const normalizedArtifact = {
        ...data.artifact,
        type: data.artifact.type || data.artifact.artifact_type,
        content: data.artifact.content || data.artifact.html || ''
      };
      this.handleArtifact(normalizedArtifact);
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

  /**
   * HANDLE ARTIFACT
   * 
   * Routes artifacts to the dedicated artifact sidebar instead of
   * rendering them inline with messages.
   * 
   * DESIGN FIX (2026-01-27):
   * Previously, artifacts were rendered inline in the conversation area.
   * This caused visual confusion when artifact HTML contained sidebar-like
   * UI elements (headers, buttons, etc.) - making it look like there were
   * two sidebars on screen.
   * 
   * Now artifacts are displayed in a dedicated sidebar panel on the right
   * side of the screen, clearly separated from the conversation flow.
   * This matches the PRODUCT_INTENT.md design where artifacts appear in
   * a "center panel" while "conversation continues in right panel".
   * 
   * @param {Object} data - Artifact data from backend
   */
  handleArtifact(data) {
    // PATCH SUPPORT (2026-01-28):
    // Detect patch actions and log accordingly. Patch actions are 3-4x faster
    // because they only send the changes, not the full HTML.
    // 
    // Action types:
    // - "patch": Apply string replacements to existing artifact (FAST!)
    // - "create": New artifact with full HTML
    // - "update": Replace existing artifact with new full HTML
    if (data.action === 'patch') {
      console.log('[WebSocketClient] 🔧 Routing PATCH to sidebar:', {
        artifact_id: data.artifact_id,
        patches_count: data.patches?.length || 0
      });
    } else {
      console.log('[WebSocketClient] Routing artifact to sidebar:', data.artifact_type || data.type);
    }
    
    // Route to artifact sidebar (not inline in conversation)
    if (this.app.artifactSidebar) {
      this.app.artifactSidebar.showArtifact(data);
    } else {
      // Fallback to inline if sidebar not available
      console.warn('[WebSocketClient] Artifact sidebar not available, falling back to inline');
      this.app.conversationManager.addArtifact(data);
    }
  }

  /**
   * HANDLE ERROR (P2 ENHANCED)
   * 
   * Handles error messages from the backend.
   * Now also removes thinking indicator and cancel button since the response failed.
   * WHY: If backend sends an error, the thinking indicator should stop.
   * BECAUSE: Without cleanup, the dots keep bouncing even after an error.
   */
  handleError(data) {
    console.error('[WebSocketClient] Backend error:', data);
    
    // Clean up thinking state if we were waiting for a response
    if (this.app.state.isProcessing) {
      this.app.state.isProcessing = false;
      this.app.updateStatus('Ready', 'connected');
      this.app.showCancelButton(false);
      this.app.conversationManager.removeThinkingIndicator();
    }
    
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

  /**
   * HANDLE CONVERSATIONS LIST
   * 
   * Called when backend sends list of all conversations.
   * Forwards to ChatSidebar to update the UI.
   */
  handleConversationsList(data) {
    console.log('[WebSocketClient] Received conversations list:', data.conversations?.length || 0, 'conversations');
    
    if (window.app && window.app.chatSidebar) {
      window.app.chatSidebar.updateConversationsList(data.conversations || []);
    }
  }

  /**
   * HANDLE CONVERSATION CREATED
   * 
   * Called when a new conversation is created.
   * Forwards to ChatSidebar and switches to the new conversation.
   */
  handleConversationCreated(data) {
    console.log('[WebSocketClient] Conversation created:', data.conversation?.id);
    
    if (window.app && window.app.chatSidebar) {
      // Add to list
      window.app.chatSidebar.updateConversationsList([data.conversation]);
      
      // Switch to new conversation
      window.app.chatSidebar.handleConversationClick(data.conversation.id);
    }
  }

  /**
   * HANDLE CONVERSATION LOADED
   * 
   * Called when switching to a different conversation.
   * Loads the conversation messages into the UI.
   * 
   * CRITICAL FIX:
   * Don't clear messages if we're already displaying messages for this conversation.
   * This prevents a race condition where:
   * 1. User sends message
   * 2. Message is added to UI
   * 3. Conversation switch happens
   * 4. conversation_loaded arrives and clears the message we just added
   * 
   * SOLUTION:
   * Only clear and reload if the conversation has different messages than what's displayed.
   */
  /**
   * HANDLE CONVERSATION LOADED (P1 ENHANCED)
   * 
   * Called when switching to a different conversation.
   * Now removes loading skeleton before populating messages.
   */
  handleConversationLoaded(data) {
    console.log('[WebSocketClient] Conversation loaded:', data.conversation?.id);
    
    if (window.app && window.app.conversationManager) {
      // CRITICAL: Remove loading skeleton first (P1 FIX)
      window.app.conversationManager.removeLoadingSkeleton();

      // Get current messages in UI
      const currentMessages = window.app.conversationManager.messages;
      const loadedMessages = data.conversation?.messages || [];
      
      // Only clear and reload if the message count is different
      // This prevents clearing messages that were just added
      // WHY: Race condition between message sending and conversation loading
      // BECAUSE: New conversations trigger an immediate switch, which loads empty state
      if (currentMessages.length === 0 || loadedMessages.length > currentMessages.length) {
        // Clear current messages
        window.app.conversationManager.clearMessages();
        
        // Load conversation messages
        if (data.conversation && data.conversation.messages) {
          data.conversation.messages.forEach(msg => {
            window.app.conversationManager.addMessage(msg);
          });
        }
      } else {
        console.log('[WebSocketClient] Skipping message reload - current messages are newer');
      }
    }
  }

  /**
   * HANDLE CONVERSATION DELETED
   * 
   * Called when a conversation is deleted.
   * Removes from sidebar.
   */
  handleConversationDeleted(data) {
    console.log('[WebSocketClient] Conversation deleted:', data.conversationId);
    
    // ChatSidebar handles this locally, no need to update
  }

  /**
   * HANDLE CONVERSATION TITLE UPDATED
   * 
   * Called when a conversation title is updated.
   * Updates the sidebar display.
   */
  /**
   * HANDLE CONVERSATION TITLE UPDATED (P1 ENHANCED)
   * 
   * Called when a conversation title changes (e.g., auto-generated from first message).
   * Now updates the sidebar DOM to reflect the new title.
   * 
   * P1 FIX: Previously did nothing ("ChatSidebar handles this locally") but auto-titles
   * from the backend need to propagate to the UI.
   */
  handleConversationTitleUpdated(data) {
    console.log('[WebSocketClient] Conversation title updated:', data.conversationId, data.title);
    
    // Update sidebar UI with new title
    if (window.app && window.app.chatSidebar) {
      const conv = window.app.chatSidebar.conversations.get(data.conversationId);
      if (conv) {
        conv.title = data.title;
      }
      
      // Update DOM element
      const item = document.querySelector(`[data-conversation-id="${data.conversationId}"] .conversation-title`);
      if (item) {
        item.textContent = data.title;
      }
    }
  }
}

console.log('[WebSocketClient] WebSocketClient class loaded');
