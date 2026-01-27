/**
 * BUBBLEVOICE MAC - MAIN APP CONTROLLER
 * 
 * This is the main entry point for the frontend application.
 * It initializes all components, manages app state, and coordinates
 * communication between UI components and the backend.
 * 
 * ARCHITECTURE:
 * - App class is the central controller
 * - ConversationManager handles message display and history
 * - VoiceController manages voice input/output
 * - WebSocketClient handles real-time backend communication
 * 
 * PRODUCT CONTEXT:
 * The app needs to feel instant and responsive. Voice input should
 * start immediately, transcription should appear in real-time, and
 * AI responses should stream naturally. The UI should never block
 * or feel sluggish.
 * 
 * TECHNICAL NOTES:
 * - Uses Electron's IPC for main process communication
 * - WebSocket for real-time backend communication
 * - LocalStorage for settings persistence
 * - Event-driven architecture for loose coupling
 */

class BubbleVoiceApp {
  constructor() {
    // Component references
    // These will be initialized in the init() method
    this.conversationManager = null;
    this.voiceController = null;
    this.websocketClient = null;
    this.chatSidebar = null;
    // NOTE: chatHistorySidebar was removed - it was a duplicate of chatSidebar
    // that created its own DOM element, causing visual conflicts and broken toggles.
    // Now we only use ChatSidebar which works with the existing #chat-sidebar HTML.
    this.lifeAreasSidebar = null;
    this.artifactSidebar = null;  // Sidebar for displaying artifacts (not inline)
    this.adminPanel = null;

    // DOM element references
    // Cached for performance (avoid repeated querySelector calls)
    this.elements = {
      welcomeState: document.getElementById('welcome-state'),
      messages: document.getElementById('messages'),
      inputField: document.getElementById('input-field'),
      voiceButton: document.getElementById('voice-button'),
      sendButton: document.getElementById('send-button'),
      bubblesContainer: document.getElementById('bubbles-container'),
      voiceVisualization: document.getElementById('voice-visualization'),
      statusIndicator: document.getElementById('status-indicator'),
      statusText: document.querySelector('.status-text'),
      settingsButton: document.getElementById('settings-button'),
      settingsPanel: document.getElementById('settings-panel'),
      closeSettings: document.getElementById('close-settings'),
      minimizeButton: document.getElementById('minimize-button'),
      closeButton: document.getElementById('close-button'),
      pinButton: document.getElementById('pin-button')
    };

    // App state
    // Tracks the current state of the application
    this.state = {
      isConnected: false,
      isListening: false,
      isProcessing: false,
      currentConversationId: null,
      settings: this.loadSettings()
    };

    // Initialize the app
    this.init();
  }

  /**
   * INITIALIZE APPLICATION
   * 
   * Sets up all components and event listeners.
   * This is called once when the app starts.
   * 
   * INITIALIZATION ORDER:
   * 1. Load settings from localStorage
   * 2. Initialize components (conversation, voice, websocket)
   * 3. Set up event listeners (UI interactions)
   * 4. Set up Electron IPC listeners (main process events)
   * 5. Connect to backend
   */
  async init() {
    console.log('[App] Initializing BubbleVoice...');

    try {
      // Get backend configuration from Electron main process
      const backendConfig = await window.electronAPI.getBackendConfig();
      console.log('[App] Backend config:', backendConfig);

      // Initialize components
      // Each component is responsible for its own domain
      this.conversationManager = new ConversationManager(this.elements.messages);
      this.voiceController = new VoiceController(this);
      this.websocketClient = new WebSocketClient(backendConfig.websocketUrl, this);
      
      // Initialize chat sidebar (uses existing HTML element #chat-sidebar from index.html)
      // NOTE: We previously had BOTH ChatSidebar AND ChatHistorySidebar which caused
      // duplicate sidebars to render. ChatHistorySidebar was creating its own DOM element
      // and prepending it to body, causing the "messed up icons" at the bottom and the
      // non-functional collapse button. Now we only use ChatSidebar which works with
      // the existing HTML structure.
      this.chatSidebar = new ChatSidebar();
      console.log('[App] Chat sidebar initialized');

      // Initialize life areas sidebar
      this.lifeAreasSidebar = new LifeAreasSidebar();
      const sidebarContainer = document.getElementById('life-areas-sidebar-container');
      if (sidebarContainer) {
        sidebarContainer.appendChild(this.lifeAreasSidebar.element);
      }

      // Initialize artifact sidebar
      // DESIGN FIX (2026-01-27): Artifacts now display in a dedicated sidebar
      // instead of inline with messages. This prevents visual confusion when
      // artifact HTML contains sidebar-like UI elements.
      // Per PRODUCT_INTENT.md: artifacts should appear in "center panel"
      // while "conversation continues in right panel"
      this.artifactSidebar = new ArtifactSidebar();
      console.log('[App] Artifact sidebar initialized');

      // Initialize admin panel
      this.adminPanel = new AdminPanel();
      document.body.appendChild(this.adminPanel.element);
      console.log('[App] Admin panel initialized');

      // Set up event listeners
      this.setupUIEventListeners();
      this.setupElectronEventListeners();
      this.setupKeyboardShortcuts();

      // Apply saved settings
      this.applySettings();

      /**
       * CONNECT TO BACKEND WITH RETRY
       *
       * WHY: The backend server takes 2-3 seconds to start after the Electron
       * app launches. If we try to connect immediately, the connection will
       * fail with ERR_CONNECTION_REFUSED.
       *
       * BECAUSE: Tests were failing because the frontend tried to connect to
       * WebSocket immediately on page load, before the backend was ready.
       * The WebSocket client has reconnection logic, but the initial connect()
       * would reject and stop the app initialization.
       *
       * SOLUTION: Retry the initial connection with exponential backoff.
       * After 5 attempts, we let the WebSocket client's built-in reconnection
       * take over. This gives the backend time to start while keeping the
       * app responsive and eventually connected.
       *
       * HISTORY: Added 2026-01-21 to fix ERR_CONNECTION_REFUSED in tests
       */
      const maxInitialRetries = 5;
      const initialRetryDelay = 500; // Start with 500ms
      let connected = false;

      for (let attempt = 1; attempt <= maxInitialRetries && !connected; attempt++) {
        try {
          console.log(`[App] Connecting to backend (attempt ${attempt}/${maxInitialRetries})...`);
          await this.websocketClient.connect();
          connected = true;
          console.log('[App] Connected to backend');
        } catch (error) {
          console.log(`[App] Connection attempt ${attempt} failed, backend may still be starting...`);

          if (attempt < maxInitialRetries) {
            // Wait before retrying, with exponential backoff
            const delay = initialRetryDelay * Math.pow(2, attempt - 1);
            console.log(`[App] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!connected) {
        // Let the WebSocket client's built-in reconnection handle it
        console.log('[App] Initial connection failed, WebSocket client will keep trying...');
        this.updateStatus('Connecting...', 'processing');
        // Trigger the reconnection mechanism
        this.websocketClient.scheduleReconnect();
      }

      console.log('[App] BubbleVoice initialized successfully');
    } catch (error) {
      console.error('[App] Initialization error:', error);
      this.showError('Failed to initialize app. Please restart.');
    }
  }

  /**
   * SETUP UI EVENT LISTENERS
   * 
   * Attaches event handlers to UI elements.
   * These handle user interactions like button clicks and text input.
   */
  setupUIEventListeners() {
    // Voice button - start/stop voice input
    console.log('[App] Setting up voice button listener, button:', this.elements.voiceButton);
    this.elements.voiceButton.addEventListener('click', () => {
      console.log('[App] Voice button clicked!');
      this.toggleVoiceInput();
    });

    // Send button - send message
    this.elements.sendButton.addEventListener('click', () => {
      this.sendMessage();
    });

    // Input field - enable send button when there's text
    this.elements.inputField.addEventListener('input', () => {
      this.updateSendButtonState();
    });

    // Input field - handle Enter key (send message)
    this.elements.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Welcome suggestion chips - populate input with suggestion
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.textContent.replace(/['"]/g, '');
        this.elements.inputField.textContent = text;
        this.updateSendButtonState();
        this.elements.inputField.focus();
      });
    });

    // Settings button - open settings panel
    this.elements.settingsButton.addEventListener('click', () => {
      this.openSettings();
    });

    // Close settings button
    this.elements.closeSettings.addEventListener('click', () => {
      this.closeSettings();
    });

    // Admin panel button - add to settings panel
    // This is a power-user feature, so we put it in settings
    const adminPanelButton = document.createElement('button');
    adminPanelButton.className = 'settings-button admin-panel-trigger';
    adminPanelButton.innerHTML = '⚙️ Admin Panel';
    adminPanelButton.title = 'Advanced configuration (power users)';
    adminPanelButton.addEventListener('click', () => {
      console.log('[App] Opening admin panel');
      this.adminPanel.open();
    });
    
    // Add to settings panel
    const settingsPanel = this.elements.settingsPanel;
    if (settingsPanel) {
      // Find the save button and insert before it
      const saveButton = settingsPanel.querySelector('#save-settings');
      if (saveButton && saveButton.parentNode) {
        saveButton.parentNode.insertBefore(adminPanelButton, saveButton);
      } else {
        // Fallback: append to settings panel
        settingsPanel.appendChild(adminPanelButton);
      }
    }

    // Window controls
    this.elements.minimizeButton.addEventListener('click', async () => {
      await window.electronAPI.window.minimize();
    });

    this.elements.closeButton.addEventListener('click', async () => {
      await window.electronAPI.window.close();
    });

    this.elements.pinButton.addEventListener('click', async () => {
      const isAlwaysOnTop = await window.electronAPI.window.toggleAlwaysOnTop();
      this.elements.pinButton.classList.toggle('active', isAlwaysOnTop);
    });

    // Settings inputs - save on change
    this.setupSettingsListeners();
    
    // CRITICAL FIX (2026-01-24): Listen for conversation switches from chat sidebar
    // WHY: When user clicks a conversation or a new one is created, we need to track the active conversation ID
    // BECAUSE: Without this, every message creates a NEW conversation (currentConversationId stays null)
    // HISTORY: Bug discovered - AI forgot everything because each message started a new conversation!
    // 
    // The flow:
    // 1. User sends message with conversationId: null (first message)
    // 2. Backend creates conversation and sends conversation_created event
    // 3. ChatSidebar receives it and calls handleConversationClick
    // 4. handleConversationClick dispatches 'conversation-switched' event
    // 5. THIS LISTENER updates app.state.currentConversationId
    // 6. Next message includes the conversationId, so conversation continues!
    window.addEventListener('conversation-switched', (event) => {
      const { conversationId } = event.detail;
      console.log('[App] Conversation switched to:', conversationId);
      this.state.currentConversationId = conversationId;
      
      // Also hide welcome state when a conversation is active
      if (this.elements.welcomeState) {
        this.elements.welcomeState.style.display = 'none';
      }
    });
  }

  /**
   * SETUP ELECTRON EVENT LISTENERS
   * 
   * Listens for events from the Electron main process.
   * These are triggered by menu items, global shortcuts, etc.
   */
  setupElectronEventListeners() {
    // Global hotkey pressed - activate voice input
    window.electronAPI.onActivateVoiceInput(() => {
      console.log('[App] Global hotkey activated');
      if (!this.state.isListening) {
        this.startVoiceInput();
      }
    });

    // New conversation requested from menu
    window.electronAPI.onNewConversation(() => {
      console.log('[App] New conversation requested');
      this.startNewConversation();
    });

    // Settings requested from menu
    window.electronAPI.onShowSettings(() => {
      console.log('[App] Settings requested');
      this.openSettings();
    });
  }

  /**
   * SETUP KEYBOARD SHORTCUTS
   * 
   * Global keyboard shortcuts that work within the app.
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K - Focus input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.elements.inputField.focus();
      }

      // Cmd/Ctrl + , - Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        this.openSettings();
      }

      // Escape - Close settings or stop voice
      if (e.key === 'Escape') {
        if (this.elements.settingsPanel.classList.contains('open')) {
          this.closeSettings();
        } else if (this.state.isListening) {
          this.stopVoiceInput();
        }
      }
    });
  }

  /**
   * TOGGLE VOICE INPUT
   * 
   * Starts or stops voice input based on current state.
   */
  toggleVoiceInput() {
    console.log('[App] toggleVoiceInput called, isListening:', this.state.isListening);
    if (this.state.isListening) {
      this.stopVoiceInput();
    } else {
      this.startVoiceInput();
    }
  }

  /**
   * START VOICE INPUT
   * 
   * Begins listening for voice input.
   * Shows visualization and updates UI state.
   */
  startVoiceInput() {
    console.log('[App] Starting voice input');
    
    this.state.isListening = true;
    this.elements.voiceButton.classList.add('active');
    this.elements.voiceVisualization.classList.add('active');
    this.updateStatus('Listening...', 'processing');

    // Hide welcome state if visible
    if (this.elements.welcomeState.style.display !== 'none') {
      this.elements.welcomeState.style.display = 'none';
    }

    // Start voice controller
    this.voiceController.startListening();
  }

  /**
   * STOP VOICE INPUT
   * 
   * Stops listening for voice input.
   * Hides visualization and updates UI state.
   */
  stopVoiceInput() {
    console.log('[App] Stopping voice input');
    
    this.state.isListening = false;
    this.elements.voiceButton.classList.remove('active');
    this.elements.voiceVisualization.classList.remove('active');
    this.updateStatus('Ready', 'connected');

    // Stop voice controller
    this.voiceController.stopListening();

    // Auto-send if enabled and there's text
    if (this.state.settings.autoSend && this.elements.inputField.textContent.trim()) {
      this.sendMessage();
    }
  }

  /**
   * SEND MESSAGE
   * 
   * Sends the current input text to the AI.
   * Clears input and adds message to conversation.
   */
  async sendMessage() {
    const text = this.elements.inputField.textContent.trim();
    
    if (!text) {
      console.log('[App] No text to send');
      return;
    }

    if (!this.state.isConnected) {
      console.error('[App] Not connected to backend');
      this.showError('Not connected to backend. Please check your connection.');
      return;
    }

    console.log('[App] Sending message:', text);

    // CRITICAL FIX: Do NOT add message to UI here
    // WHY: The backend will send back a user_message event after processing
    // BECAUSE: Adding it here AND from backend causes duplicate messages
    // HISTORY: Bug discovered 2026-01-24 - messages appeared twice in UI
    // SOLUTION: Let the backend be the single source of truth for message display
    
    // Clear input immediately for better UX (user sees their action registered)
    this.elements.inputField.textContent = '';
    this.updateSendButtonState();

    // Update status
    this.state.isProcessing = true;
    this.updateStatus('Thinking...', 'processing');

    // Send to backend via WebSocket
    // Backend will send back user_message event which will add it to UI
    try {
      await this.websocketClient.sendMessage({
        type: 'user_message',
        content: text,
        conversationId: this.state.currentConversationId,
        settings: {
          model: this.state.settings.model,
          voiceSpeed: this.state.settings.voiceSpeed
        }
      });
    } catch (error) {
      console.error('[App] Error sending message:', error);
      this.showError('Failed to send message. Please try again.');
      this.state.isProcessing = false;
      this.updateStatus('Ready', 'connected');
    }
  }

  /**
   * UPDATE SEND BUTTON STATE
   * 
   * Enables/disables send button based on input content.
   */
  updateSendButtonState() {
    const hasText = this.elements.inputField.textContent.trim().length > 0;
    this.elements.sendButton.disabled = !hasText;
  }

  /**
   * UPDATE STATUS INDICATOR
   * 
   * Updates the status text and visual indicator.
   * 
   * @param {string} text - Status text to display
   * @param {string} state - Visual state: 'connected', 'disconnected', 'processing'
   */
  updateStatus(text, state) {
    this.elements.statusText.textContent = text;
    this.elements.statusIndicator.className = `status-indicator ${state}`;
  }

  /**
   * HANDLE AI RESPONSE
   * 
   * Called when AI response is received from backend.
   * Adds message to conversation and triggers TTS if enabled.
   * 
   * WHY THIS FORMAT:
   * The backend's VoicePipelineService sends AI responses with the following structure:
   * - text: The AI's response text
   * - bubbles: Proactive suggestions for follow-up
   * - artifact: Optional visual artifact (timeline, checklist, etc.)
   * - timestamp: When the response was generated
   * 
   * TECHNICAL NOTES:
   * - Uses backend's timestamp for accurate message ordering
   * - Displays AI message as left-aligned gray bubble (assistant role)
   * - Bubbles and artifacts are optional and handled separately
   * - TTS playback is triggered automatically if audio is available
   * 
   * @param {Object} data - Response data from backend
   * @param {string} data.text - AI response text
   * @param {Array} [data.bubbles] - Optional bubble suggestions
   * @param {Object} [data.artifact] - Optional artifact
   * @param {number} data.timestamp - Response timestamp
   */
  handleAIResponse(data) {
    console.log('[App] Received AI response:', data.text ? data.text.substring(0, 50) + '...' : '(no text)');

    // Add AI message to conversation
    // Use backend's timestamp for accurate ordering
    this.conversationManager.addMessage({
      role: 'assistant',
      content: data.text || data.content || '', // Support both 'text' and 'content' for backwards compatibility
      timestamp: data.timestamp || Date.now()
    });

    // Handle bubbles if present
    if (data.bubbles && data.bubbles.length > 0) {
      this.displayBubbles(data.bubbles);
    }

    // Handle artifacts if present (must have type property)
    if (data.artifact && data.artifact.type) {
      this.conversationManager.addArtifact(data.artifact);
    }

    // Trigger TTS - the backend will handle actual audio playback through Swift helper
    // The frontend just needs to display the message
    // Audio playback is managed by the backend's VoicePipelineService

    // Update status
    this.state.isProcessing = false;
    this.updateStatus('Ready', 'connected');
  }

  /**
   * DISPLAY BUBBLES
   * 
   * Shows proactive bubble suggestions above the input.
   * 
   * @param {Array} bubbles - Array of bubble text strings
   */
  displayBubbles(bubbles) {
    // Clear existing bubbles
    this.elements.bubblesContainer.innerHTML = '';

    // Add new bubbles
    bubbles.forEach(bubbleText => {
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = bubbleText;
      
      // Click to populate input
      bubble.addEventListener('click', () => {
        this.elements.inputField.textContent = bubbleText;
        this.updateSendButtonState();
        this.elements.inputField.focus();
      });

      this.elements.bubblesContainer.appendChild(bubble);
    });
  }

  /**
   * LOAD CONVERSATION
   * 
   * Loads a conversation from history and displays it.
   * Called when user clicks a conversation in the sidebar.
   * 
   * NOTE: This method is triggered by the 'conversation-switched' event
   * dispatched by ChatSidebar when a user clicks on a conversation item.
   * 
   * @param {string} conversationId - Conversation ID to load
   */
  async loadConversation(conversationId) {
    try {
      console.log(`[App] Loading conversation: ${conversationId}`);
      
      // Update state immediately for responsiveness
      this.state.currentConversationId = conversationId;
      
      // Hide welcome state
      if (this.elements.welcomeState) {
        this.elements.welcomeState.style.display = 'none';
      }
      
      // Get conversation data from backend via WebSocket
      // The WebSocket client will handle loading messages when the backend responds
      if (this.websocketClient && this.websocketClient.isConnected) {
        this.websocketClient.sendMessage({
          type: 'switch_conversation',
          data: { conversationId }
        });
      }
      
      console.log(`[App] Switched to conversation: ${conversationId}`);
      
    } catch (error) {
      console.error('[App] Failed to load conversation:', error);
      this.showError('Failed to load conversation');
    }
  }

  /**
   * START NEW CONVERSATION
   * 
   * Clears current conversation and starts fresh.
   */
  startNewConversation() {
    console.log('[App] Starting new conversation');
    
    this.state.currentConversationId = null;
    this.conversationManager.clear();
    this.elements.bubblesContainer.innerHTML = '';
    this.elements.welcomeState.style.display = 'flex';
    this.elements.inputField.textContent = '';
    this.updateSendButtonState();
  }

  /**
   * SETTINGS MANAGEMENT
   */

  openSettings() {
    this.elements.settingsPanel.classList.add('open');
  }

  closeSettings() {
    this.elements.settingsPanel.classList.remove('open');
  }

  setupSettingsListeners() {
    // Model selection
    const modelSelect = document.getElementById('model-select');
    modelSelect.value = this.state.settings.model;
    modelSelect.addEventListener('change', (e) => {
      this.state.settings.model = e.target.value;
      this.saveSettings();
    });

    // Microphone selection
    const microphoneSelect = document.getElementById('microphone-select');
    this.populateMicrophones();
    microphoneSelect.addEventListener('change', (e) => {
      this.state.settings.microphone = e.target.value;
      this.voiceController.setMicrophone(e.target.value);
      this.saveSettings();
    });

    // Voice/Speaker selection
    const voiceSelect = document.getElementById('voice-select');
    this.populateVoices();
    voiceSelect.addEventListener('change', (e) => {
      this.state.settings.voice = e.target.value;
      this.saveSettings();
    });

    // Voice speed
    const voiceSpeed = document.getElementById('voice-speed');
    const voiceSpeedValue = document.getElementById('voice-speed-value');
    voiceSpeed.value = this.state.settings.voiceSpeed;
    voiceSpeedValue.textContent = `${this.state.settings.voiceSpeed}x`;
    voiceSpeed.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.state.settings.voiceSpeed = value;
      voiceSpeedValue.textContent = `${value.toFixed(1)}x`;
      this.saveSettings();
    });

    // Auto-send
    const autoSend = document.getElementById('auto-send');
    autoSend.checked = this.state.settings.autoSend;
    autoSend.addEventListener('change', (e) => {
      this.state.settings.autoSend = e.target.checked;
      this.saveSettings();
    });

    // Show bubbles
    const showBubbles = document.getElementById('show-bubbles');
    showBubbles.checked = this.state.settings.showBubbles;
    showBubbles.addEventListener('change', (e) => {
      this.state.settings.showBubbles = e.target.checked;
      this.saveSettings();
    });

    // Target folder selection
    // This allows users to choose where conversation data is saved
    // (e.g., Dropbox, iCloud Drive, specific project folder)
    const targetFolderPath = document.getElementById('target-folder-path');
    const selectFolderButton = document.getElementById('select-folder-button');
    
    // Display current target folder if set
    targetFolderPath.value = this.state.settings.targetFolder || '';
    
    // Handle folder selection button click
    selectFolderButton.addEventListener('click', async () => {
      try {
        console.log('[App] Opening folder selection dialog...');
        const result = await window.electronAPI.selectTargetFolder();
        
        if (result.success && result.path) {
          console.log('[App] Folder selected:', result.path);
          this.state.settings.targetFolder = result.path;
          targetFolderPath.value = result.path;
          this.saveSettings();
          
          // Show success feedback
          selectFolderButton.textContent = 'Folder Selected ✓';
          setTimeout(() => {
            selectFolderButton.textContent = 'Choose Folder';
          }, 2000);
        } else if (result.error) {
          console.error('[App] Error selecting folder:', result.error);
          this.showError('Failed to select folder: ' + result.error);
        }
      } catch (error) {
        console.error('[App] Error in folder selection:', error);
        this.showError('Failed to open folder selection dialog');
      }
    });

    // Permissions status and requests
    // These handle checking and requesting macOS system permissions
    this.setupPermissionsUI();

    // API keys - Load saved values
    const googleApiKey = document.getElementById('google-api-key');
    const anthropicApiKey = document.getElementById('anthropic-api-key');
    const openaiApiKey = document.getElementById('openai-api-key');
    
    googleApiKey.value = this.state.settings.googleApiKey || '';
    anthropicApiKey.value = this.state.settings.anthropicApiKey || '';
    openaiApiKey.value = this.state.settings.openaiApiKey || '';

    // API key visibility toggles
    document.querySelectorAll('.toggle-visibility').forEach(button => {
      button.addEventListener('click', (e) => {
        const targetId = button.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    });

    // Save API keys button
    const saveApiKeysButton = document.getElementById('save-api-keys');
    saveApiKeysButton.addEventListener('click', () => {
      // Update settings
      this.state.settings.googleApiKey = googleApiKey.value.trim();
      this.state.settings.anthropicApiKey = anthropicApiKey.value.trim();
      this.state.settings.openaiApiKey = openaiApiKey.value.trim();
      
      // Save to localStorage
      this.saveSettings();
      
      // Send to backend
      this.sendApiKeysToBackend();
      
      // Show success feedback
      const originalText = saveApiKeysButton.textContent;
      saveApiKeysButton.textContent = 'Saved ✓';
      saveApiKeysButton.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.9) 0%, rgba(22, 163, 74, 0.9) 100%)';
      
      setTimeout(() => {
        saveApiKeysButton.textContent = originalText;
        saveApiKeysButton.style.background = '';
      }, 2000);
    });
  }

  /**
   * SEND API KEYS TO BACKEND
   * 
   * Sends the API keys to the backend server so it can use them
   * for LLM API calls. Keys are sent securely over WebSocket.
   * 
   * WHY THIS IS NEEDED:
   * The backend needs the API keys to make requests to LLM providers.
   * We store keys in frontend localStorage for persistence, but send
   * them to backend when they change so it can use them immediately.
   * 
   * SECURITY NOTE:
   * Keys are sent over localhost WebSocket (not exposed to internet).
   * Backend stores them in memory only (not persisted to disk).
   */
  sendApiKeysToBackend() {
    if (!this.websocketClient || !this.websocketClient.isConnected) {
      console.warn('[App] Cannot send API keys - not connected to backend');
      return;
    }

    const keys = {
      googleApiKey: this.state.settings.googleApiKey,
      anthropicApiKey: this.state.settings.anthropicApiKey,
      openaiApiKey: this.state.settings.openaiApiKey
    };

    console.log('[App] Sending API keys to backend:', {
      hasGoogle: !!keys.googleApiKey,
      hasAnthropic: !!keys.anthropicApiKey,
      hasOpenAI: !!keys.openaiApiKey,
      googleKeyLength: keys.googleApiKey ? keys.googleApiKey.length : 0
    });

    this.websocketClient.sendMessage({
      type: 'update_api_keys',
      data: keys
    });

    console.log('[App] API keys sent to backend successfully');
  }

  /**
   * SETUP PERMISSIONS UI
   * 
   * Initializes the permissions section in settings.
   * Checks current permission status and sets up request handlers.
   * 
   * PERMISSIONS MANAGED:
   * - Microphone: Required for voice input
   * - Accessibility: Required for global hotkeys
   * 
   * TECHNICAL NOTES:
   * - Microphone can be requested programmatically
   * - Accessibility must be enabled manually in System Preferences
   * - Permission status is checked when settings panel opens
   */
  async setupPermissionsUI() {
    const microphoneStatus = document.getElementById('microphone-status');
    const microphoneButton = document.getElementById('request-microphone-button');
    const accessibilityStatus = document.getElementById('accessibility-status');
    const accessibilityButton = document.getElementById('open-accessibility-button');

    // Check microphone permission
    try {
      const micResult = await window.electronAPI.permissions.checkMicrophone();
      this.updatePermissionStatus(microphoneStatus, microphoneButton, micResult.granted);
      
      if (!micResult.granted) {
        // Show button to request permission
        microphoneButton.style.display = 'inline-block';
        microphoneButton.addEventListener('click', async () => {
          const result = await window.electronAPI.permissions.requestMicrophone();
          this.updatePermissionStatus(microphoneStatus, microphoneButton, result.granted);
          
          if (result.granted) {
            microphoneButton.style.display = 'none';
          }
        });
      }
    } catch (error) {
      console.error('[App] Error checking microphone permission:', error);
      microphoneStatus.textContent = 'Error';
      microphoneStatus.className = 'permission-badge error';
    }

    // Check accessibility permission
    try {
      const accResult = await window.electronAPI.permissions.checkAccessibility();
      this.updatePermissionStatus(accessibilityStatus, accessibilityButton, accResult.granted);
      
      if (!accResult.granted) {
        // Show button to open System Preferences
        // Accessibility can't be requested programmatically
        accessibilityButton.style.display = 'inline-block';
        accessibilityButton.addEventListener('click', async () => {
          await window.electronAPI.permissions.openAccessibilitySettings();
          
          // Check again after a delay (user might have enabled it)
          setTimeout(async () => {
            const newResult = await window.electronAPI.permissions.checkAccessibility();
            this.updatePermissionStatus(accessibilityStatus, accessibilityButton, newResult.granted);
            
            if (newResult.granted) {
              accessibilityButton.style.display = 'none';
            }
          }, 3000);
        });
      }
    } catch (error) {
      console.error('[App] Error checking accessibility permission:', error);
      accessibilityStatus.textContent = 'Error';
      accessibilityStatus.className = 'permission-badge error';
    }
  }

  /**
   * UPDATE PERMISSION STATUS UI
   * 
   * Updates the visual status badge and button visibility for a permission.
   * 
   * @param {HTMLElement} statusElement - The status badge element
   * @param {HTMLElement} buttonElement - The action button element
   * @param {boolean} granted - Whether the permission is granted
   */
  updatePermissionStatus(statusElement, buttonElement, granted) {
    if (granted) {
      statusElement.textContent = 'Granted ✓';
      statusElement.className = 'permission-badge granted';
      buttonElement.style.display = 'none';
    } else {
      statusElement.textContent = 'Not Granted';
      statusElement.className = 'permission-badge denied';
      buttonElement.style.display = 'inline-block';
    }
  }

  loadSettings() {
    const defaultSettings = {
      model: 'gemini-2.5-flash-lite',
      voiceSpeed: 1.0,
      autoSend: true,
      showBubbles: true,
      microphone: '',
      voice: '',
      targetFolder: '',
      googleApiKey: '',
      anthropicApiKey: '',
      openaiApiKey: ''
    };

    try {
      const saved = localStorage.getItem('bubblevoice_settings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch (error) {
      console.error('[App] Error loading settings:', error);
      return defaultSettings;
    }
  }

  /**
   * POPULATE MICROPHONES
   * 
   * Populates the microphone dropdown with available devices.
   */
  populateMicrophones() {
    const select = document.getElementById('microphone-select');
    const microphones = this.voiceController.getMicrophones();

    select.innerHTML = '';

    if (microphones.length === 0) {
      select.innerHTML = '<option value="">No microphones found</option>';
      return;
    }

    microphones.forEach(mic => {
      const option = document.createElement('option');
      option.value = mic.id;
      option.textContent = mic.label;
      if (mic.isDefault || mic.id === this.state.settings.microphone) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  }

  /**
   * POPULATE VOICES
   * 
   * Populates the voice dropdown with available TTS voices.
   */
  populateVoices() {
    const select = document.getElementById('voice-select');
    const voices = this.voiceController.getAvailableVoices();

    // Keep default option
    select.innerHTML = '<option value="">Default</option>';

    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (voice.name === this.state.settings.voice) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Voices might load asynchronously, so refresh after a delay
    setTimeout(() => {
      const updatedVoices = this.voiceController.getAvailableVoices();
      if (updatedVoices.length > voices.length) {
        this.populateVoices();
      }
    }, 1000);
  }

  saveSettings() {
    try {
      localStorage.setItem('bubblevoice_settings', JSON.stringify(this.state.settings));
      console.log('[App] Settings saved');
    } catch (error) {
      console.error('[App] Error saving settings:', error);
    }
  }

  applySettings() {
    // Apply any settings that affect the UI immediately
    console.log('[App] Settings applied');
  }

  /**
   * ERROR HANDLING
   */

  showError(message) {
    // TODO: Implement proper error UI
    console.error('[App] Error:', message);
    alert(message);
  }

  /**
   * CONNECTION STATE HANDLERS
   * 
   * Called by WebSocketClient when connection state changes.
   */

  onConnected() {
    console.log('[App] Connected to backend');
    this.state.isConnected = true;
    this.updateStatus('Ready', 'connected');
    
    // Send API keys to backend if they exist
    // This ensures the backend has the keys immediately after connection
    console.log('[App] Checking for API keys to send:', {
      hasGoogle: !!this.state.settings.googleApiKey,
      hasAnthropic: !!this.state.settings.anthropicApiKey,
      hasOpenAI: !!this.state.settings.openaiApiKey
    });
    
    if (this.state.settings.googleApiKey || 
        this.state.settings.anthropicApiKey || 
        this.state.settings.openaiApiKey) {
      console.log('[App] Sending API keys to backend...');
      this.sendApiKeysToBackend();
    } else {
      console.warn('[App] No API keys found in settings - user needs to add them');
    }
  }

  onDisconnected() {
    console.log('[App] Disconnected from backend');
    this.state.isConnected = false;
    this.updateStatus('Disconnected', 'disconnected');
  }

  onReconnecting() {
    console.log('[App] Reconnecting to backend...');
    this.updateStatus('Reconnecting...', 'processing');
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new BubbleVoiceApp();
  });
} else {
  window.app = new BubbleVoiceApp();
}

console.log('[App] App script loaded');
