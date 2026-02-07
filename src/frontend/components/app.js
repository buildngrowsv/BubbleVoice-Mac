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

    // Welcome suggestion chips - auto-send on click (P1 FIX)
    // WHY: Same rationale as bubble auto-send - reduce friction for starter prompts
    // BECAUSE: User clicks a suggestion because they want that conversation started
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.textContent.replace(/['"]/g, '');
        this.elements.inputField.textContent = text;
        this.updateSendButtonState();
        this.sendMessage();
      });
    });

    // Settings button - TOGGLE settings panel (open if closed, close if open)
    // FIX (2026-01-28): Changed from openSettings() to toggleSettings()
    // WHY: User reported clicking settings icon should close the panel if already open
    // BECAUSE: Standard UX pattern - clicking a toggle button should toggle state
    this.elements.settingsButton.addEventListener('click', () => {
      this.toggleSettings();
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
   * SETUP KEYBOARD SHORTCUTS (P2 ENHANCED)
   * 
   * Global keyboard shortcuts that work within the app.
   * 
   * ADDED (2026-02-06): 
   * - Escape now also cancels AI generation (P0 fix)
   * - Cmd+/ shows keyboard shortcuts help overlay (P2 fix)
   * - Cmd+N creates new conversation
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

      // Cmd/Ctrl + / - Show keyboard shortcuts help (P2 FIX)
      // WHY: Users need a way to discover available shortcuts
      // BECAUSE: Without discoverability, shortcuts go unused
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        this.showKeyboardShortcutsHelp();
      }

      // Cmd/Ctrl + N - New conversation
      // NOTE: ChatSidebar also handles this, but this ensures it works
      // even if the sidebar is collapsed/hidden
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        this.startNewConversation();
      }

      // Escape - Close settings, stop voice, cancel generation, or close overlays
      // PRIORITY ORDER: Settings > Shortcuts overlay > Generation > Voice
      if (e.key === 'Escape') {
        if (this.elements.settingsPanel.classList.contains('open')) {
          this.closeSettings();
        } else if (document.querySelector('.shortcuts-overlay')) {
          document.querySelector('.shortcuts-overlay').remove();
        } else if (this.state.isProcessing) {
          // P0 FIX: Escape cancels AI generation
          this.cancelGeneration();
        } else if (this.state.isListening) {
          this.stopVoiceInput();
        }
      }
    });

    // CANCEL BUTTON: Wire up the cancel generation button
    const cancelBtn = document.getElementById('cancel-generation-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.cancelGeneration();
      });
    }
  }

  /**
   * KEYBOARD SHORTCUTS HELP OVERLAY (P2 FIX)
   * 
   * Shows a modal with all available keyboard shortcuts.
   * WHY: Discoverability is key for power users who want to work faster.
   * BECAUSE: Most shortcuts exist but users don't know about them.
   * 
   * Triggered by Cmd+/ or could be linked from a help button.
   */
  showKeyboardShortcutsHelp() {
    // Don't show if already visible
    if (document.querySelector('.shortcuts-overlay')) {
      document.querySelector('.shortcuts-overlay').remove();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-dialog">
        <div class="shortcuts-title">
          Keyboard Shortcuts
          <button class="shortcuts-close" aria-label="Close shortcuts">×</button>
        </div>

        <div class="shortcuts-group">
          <div class="shortcuts-group-title">General</div>
          <div class="shortcut-row">
            <span class="shortcut-label">Focus input</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Open settings</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>,</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Show shortcuts</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>/</kbd></span>
          </div>
        </div>

        <div class="shortcuts-group">
          <div class="shortcuts-group-title">Voice & Messages</div>
          <div class="shortcut-row">
            <span class="shortcut-label">Start voice input</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Space</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Send message</span>
            <span class="shortcut-keys"><kbd>Enter</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">New line in message</span>
            <span class="shortcut-keys"><kbd>⇧</kbd><kbd>Enter</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Cancel AI response</span>
            <span class="shortcut-keys"><kbd>Esc</kbd></span>
          </div>
        </div>

        <div class="shortcuts-group">
          <div class="shortcuts-group-title">Conversations</div>
          <div class="shortcut-row">
            <span class="shortcut-label">New conversation</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>N</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Toggle sidebar</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>B</kbd></span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Switch conversation 1-9</span>
            <span class="shortcut-keys"><kbd>⌘</kbd><kbd>1</kbd>-<kbd>9</kbd></span>
          </div>
        </div>
      </div>
    `;

    // Close button handler
    overlay.querySelector('.shortcuts-close').addEventListener('click', () => {
      overlay.remove();
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    document.body.appendChild(overlay);
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
  /**
   * START VOICE INPUT (P0 ENHANCED)
   * 
   * Begins listening for voice input.
   * Shows visualization and updates UI state.
   * 
   * P0 FIX: Now catches errors (e.g., mic permission denied) and shows
   * a clear toast with an action to open Settings, instead of silently failing.
   * WHY: Users clicked the voice button and nothing happened with no explanation.
   * BECAUSE: The error was only logged to console where users never look.
   */
  async startVoiceInput() {
    console.log('[App] Starting voice input');
    
    this.state.isListening = true;
    this.elements.voiceButton.classList.add('active');
    this.elements.voiceVisualization.classList.add('active');
    this.updateStatus('Listening...', 'processing');

    // Hide welcome state if visible
    if (this.elements.welcomeState.style.display !== 'none') {
      this.elements.welcomeState.style.display = 'none';
    }

    // Start voice controller with error handling for mic permission
    try {
      await this.voiceController.startListening();
    } catch (error) {
      console.error('[App] Voice input failed:', error);
      
      // Reset UI state since we failed to start
      this.state.isListening = false;
      this.elements.voiceButton.classList.remove('active');
      this.elements.voiceVisualization.classList.remove('active');
      this.updateStatus('Ready', 'connected');

      // Show helpful error with action to open settings (P0 FIX)
      // WHY: Users need to know WHY voice isn't working and HOW to fix it
      const isPermissionError = error.message?.toLowerCase().includes('permission') ||
                                error.message?.toLowerCase().includes('microphone') ||
                                error.message?.toLowerCase().includes('not allowed');
      
      if (isPermissionError) {
        this.showToast('Microphone access required. Grant permission in Settings.', 'warning', {
          duration: 8000,
          actionLabel: 'Open Settings',
          onAction: () => this.openSettings()
        });
      } else {
        this.showError('Voice input failed: ' + (error.message || 'Unknown error'), {
          actionLabel: 'Retry',
          onAction: () => this.startVoiceInput()
        });
      }
    }
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
    // FIX (2026-01-28): Use innerText to properly capture text with line breaks
    if (this.state.settings.autoSend && this.elements.inputField.innerText.trim()) {
      this.sendMessage();
    }
  }

  /**
   * SEND MESSAGE
   * 
   * Sends the current input text to the AI.
   * Clears input and adds message to conversation.
   * 
   * P0 FIX: Added thinking indicator (animated dots bubble) while waiting.
   * P2 FIX: Added debounce to prevent double-sends from rapid Enter presses.
   * P2 FIX: Added max message length validation (10,000 chars).
   */
  async sendMessage() {
    // DEBOUNCE: Prevent double-sends from rapid Enter key or button clicks.
    // WHY: Without this, rapid Enter presses send the same message multiple times.
    // BECAUSE: The input clear + send is async and there's a race window.
    if (this.state.isProcessing) {
      console.log('[App] Already processing, ignoring send');
      return;
    }

    // CRITICAL FIX (2026-01-28): Use innerText instead of textContent
    // WHY: textContent doesn't preserve line breaks from contenteditable elements
    // BECAUSE: When user presses Shift+Enter, contenteditable creates <br> tags
    // but textContent ignores them. innerText converts <br> to \n properly.
    // HISTORY: User reported that new lines weren't appearing in sent messages
    const text = this.elements.inputField.innerText.trim();
    
    if (!text) {
      console.log('[App] No text to send');
      return;
    }

    // MAX LENGTH VALIDATION (P2 FIX): Prevent extremely long messages
    // WHY: Messages over 10K chars can overflow LLM context limits and break layout.
    // BECAUSE: Users may paste enormous text blocks without realizing the impact.
    const MAX_MESSAGE_LENGTH = 10000;
    if (text.length > MAX_MESSAGE_LENGTH) {
      this.showError(`Message too long (${text.length.toLocaleString()} chars). Maximum is ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }

    if (!this.state.isConnected) {
      console.error('[App] Not connected to backend');
      this.showError('Not connected to backend. Please check your connection.', {
        actionLabel: 'Retry',
        onAction: () => this.websocketClient.scheduleReconnect()
      });
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

    // Update status and show cancel button
    this.state.isProcessing = true;
    this.updateStatus('Thinking...', 'processing');
    this.showCancelButton(true);

    // THINKING INDICATOR (P0 FIX): Show animated dots while waiting for AI
    // WHY: Without this, the user stares at empty space for 2-5+ seconds
    // BECAUSE: LLM API calls take variable time and visual feedback is critical
    this.conversationManager.showThinkingIndicator();

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
      this.showCancelButton(false);
      this.conversationManager.removeThinkingIndicator();
    }
  }

  /**
   * CANCEL AI GENERATION (P0 FIX)
   * 
   * Cancels the current AI response generation.
   * WHY: Users need an escape hatch when LLM takes too long (10+ seconds).
   * BECAUSE: Without this, users feel trapped with "Thinking..." showing forever.
   * 
   * TECHNICAL: Sends an interrupt message to backend and resets UI state.
   */
  cancelGeneration() {
    console.log('[App] Cancelling AI generation');

    // Send interrupt to backend
    if (this.websocketClient && this.websocketClient.isConnected) {
      this.websocketClient.sendMessage({
        type: 'interrupt',
        data: { reason: 'user_cancelled' }
      });
    }

    // Reset UI state
    this.state.isProcessing = false;
    this.updateStatus('Ready', 'connected');
    this.showCancelButton(false);
    this.conversationManager.removeThinkingIndicator();

    this.showToast('Response cancelled', 'info', { duration: 2000 });
  }

  /**
   * SHOW/HIDE CANCEL BUTTON (P0 FIX)
   * 
   * Toggles visibility of the cancel generation button in the status bar.
   * 
   * @param {boolean} visible - Whether to show the cancel button
   */
  showCancelButton(visible) {
    const cancelBtn = document.getElementById('cancel-generation-btn');
    if (cancelBtn) {
      cancelBtn.classList.toggle('visible', visible);
    }
  }

  /**
   * UPDATE SEND BUTTON STATE
   * 
   * Enables/disables send button based on input content.
   */
  /**
   * UPDATE SEND BUTTON STATE (P2 ENHANCED)
   * 
   * Enables/disables send button based on input content.
   * Also updates character count indicator when approaching limit.
   * 
   * P2 FIX: Added character count indicator near max length.
   * WHY: Users should see they're approaching the limit before hitting it.
   */
  updateSendButtonState() {
    // FIX (2026-01-28): Use innerText to properly capture text with line breaks
    const text = this.elements.inputField.innerText.trim();
    const hasText = text.length > 0;
    this.elements.sendButton.disabled = !hasText;

    // Update character count indicator when approaching limit
    const MAX_MESSAGE_LENGTH = 10000;
    const SHOW_AT = 8000; // Show counter when 80% of limit reached
    let charCountEl = document.getElementById('char-count-indicator');
    
    if (!charCountEl) {
      // Create it if it doesn't exist
      charCountEl = document.createElement('div');
      charCountEl.className = 'char-count-indicator';
      charCountEl.id = 'char-count-indicator';
      const inputWrapper = this.elements.inputField.closest('.input-wrapper');
      if (inputWrapper) {
        inputWrapper.style.position = 'relative';
        inputWrapper.appendChild(charCountEl);
      }
    }

    if (text.length >= SHOW_AT) {
      charCountEl.classList.add('visible');
      charCountEl.textContent = `${text.length.toLocaleString()} / ${MAX_MESSAGE_LENGTH.toLocaleString()}`;
      
      if (text.length > MAX_MESSAGE_LENGTH) {
        charCountEl.classList.add('danger');
        charCountEl.classList.remove('warning');
      } else if (text.length >= MAX_MESSAGE_LENGTH * 0.9) {
        charCountEl.classList.add('warning');
        charCountEl.classList.remove('danger');
      } else {
        charCountEl.classList.remove('warning', 'danger');
      }
    } else {
      charCountEl.classList.remove('visible');
    }
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

    // CRITICAL: Remove thinking indicator before adding the real response
    // WHY: The thinking dots should be replaced by actual AI text
    this.conversationManager.removeThinkingIndicator();
    this.showCancelButton(false);

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
  /**
   * DISPLAY BUBBLES
   * 
   * Shows proactive bubble suggestions above the input.
   * 
   * P1 FIX: Bubbles now auto-send on click instead of just populating the input.
   * WHY: For a voice-first app, bubble taps should feel instant and proactive.
   * BECAUSE: Extra friction (having to click Send after tapping a bubble) defeats
   * the purpose of contextual suggestions. ChatGPT's suggestion chips send immediately.
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
      
      // AUTO-SEND ON CLICK (P1 FIX): Clicking a bubble sends it immediately
      // WHY: Reduces friction - users expect bubble taps to trigger action
      // BECAUSE: The old behavior (populate input, require Enter) was confusing
      bubble.addEventListener('click', () => {
        this.elements.inputField.textContent = bubbleText;
        this.updateSendButtonState();
        // Auto-send the bubble text directly
        this.sendMessage();
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
  /**
   * LOAD CONVERSATION (P1 ENHANCED)
   * 
   * Loads a conversation from history and displays it.
   * Now shows a loading skeleton while waiting for data.
   * 
   * P1 FIX: Added loading skeleton placeholder while conversation data loads.
   * WHY: Empty chat area during load makes the app feel broken.
   * BECAUSE: Backend takes 100-500ms to retrieve and send conversation data.
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

      // Show loading skeleton while waiting for data (P1 FIX)
      this.conversationManager.clearMessages();
      this.conversationManager.showLoadingSkeleton();
      
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
      this.conversationManager.removeLoadingSkeleton();
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

  /**
   * TOGGLE SETTINGS PANEL
   * 
   * Opens the settings panel if closed, closes it if open.
   * Added 2026-01-28 to fix toggle behavior when clicking settings icon.
   * 
   * WHY: Standard UX pattern - clicking a toggle button should toggle state
   * BECAUSE: User expected clicking settings icon to close panel if already open
   */
  toggleSettings() {
    if (this.elements.settingsPanel.classList.contains('open')) {
      this.closeSettings();
    } else {
      this.openSettings();
    }
  }

  /**
   * OPEN SETTINGS PANEL
   * 
   * Opens the settings panel and manages accessibility attributes.
   * 
   * FIX (2026-01-28): Added aria-hidden management to fix browser warning
   * about aria-hidden on element with focused descendants.
   */
  openSettings() {
    this.elements.settingsPanel.classList.add('open');
    // Remove aria-hidden when panel is open so screen readers can access it
    this.elements.settingsPanel.removeAttribute('aria-hidden');
  }

  /**
   * CLOSE SETTINGS PANEL
   * 
   * Closes the settings panel and manages accessibility attributes.
   * 
   * FIX (2026-01-28): Added aria-hidden management for accessibility.
   */
  closeSettings() {
    this.elements.settingsPanel.classList.remove('open');
    // Add aria-hidden when panel is closed to hide from screen readers
    this.elements.settingsPanel.setAttribute('aria-hidden', 'true');
  }

  setupSettingsListeners() {
    // Model selection - Settings panel dropdown
    const modelSelect = document.getElementById('model-select');
    modelSelect.value = this.state.settings.model;
    modelSelect.addEventListener('change', (e) => {
      this.state.settings.model = e.target.value;
      this.saveSettings();
      // Sync with inline model selector
      this.syncInlineModelSelector();
    });
    
    // Inline model selector - Quick access in message input area
    // ADDED (2026-01-28): User requested model switching directly in message area
    this.setupInlineModelSelector();

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
    const openFolderButton = document.getElementById('open-folder-button');
    
    // Display current target folder if set
    // FIX (2026-01-28): Make sure this persists across page reloads
    const savedFolder = this.state.settings.targetFolder;
    console.log('[App] Loading saved target folder:', savedFolder);
    if (savedFolder) {
      targetFolderPath.value = savedFolder;
      openFolderButton.style.display = 'inline-block';
    } else {
      targetFolderPath.value = '';
      openFolderButton.style.display = 'none';
    }
    
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
          
          // Show the Open button now that a folder is selected
          openFolderButton.style.display = 'inline-block';
          
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
    
    // Handle open folder button click
    // This opens the selected folder in Finder so users can see their data
    openFolderButton.addEventListener('click', async () => {
      const folderPath = this.state.settings.targetFolder;
      if (!folderPath) {
        console.warn('[App] No folder selected to open');
        return;
      }
      
      try {
        console.log('[App] Opening folder in Finder:', folderPath);
        await window.electronAPI.openFolder(folderPath);
      } catch (error) {
        console.error('[App] Error opening folder:', error);
        this.showError('Failed to open folder');
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
      
      // Update model availability display
      // FIX (2026-01-28): Refresh model availability after API keys change
      // WHY: Models that were grayed out may now be available
      this.updateModelAvailability();
      this.updateModelIndicator(this.state.settings.model);
      
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
   * SETUP INLINE MODEL SELECTOR
   * 
   * Initializes the inline model dropdown in the message input area.
   * 
   * ADDED (2026-01-28): User requested quick model switching without opening settings.
   * 
   * FUNCTIONALITY:
   * - Syncs with settings panel model selector
   * - Grays out models that require API keys (but don't have them)
   * - Updates model indicator (green = available, red = needs key)
   * - Sends model change to backend
   */
  setupInlineModelSelector() {
    const inlineModelSelect = document.getElementById('inline-model-select');
    const modelIndicator = document.getElementById('model-indicator');
    
    if (!inlineModelSelect) {
      console.warn('[App] Inline model selector not found');
      return;
    }
    
    // Set initial value from settings
    inlineModelSelect.value = this.state.settings.model;
    
    // Update model availability display
    this.updateModelAvailability();
    
    // Handle model change
    inlineModelSelect.addEventListener('change', (e) => {
      const newModel = e.target.value;
      const availability = this.checkModelAvailability(newModel);
      
      // WARN USER if model needs API key (P2 FIX)
      // WHY: Users need clear guidance on why a model won't work
      // BECAUSE: Previously, selecting an unavailable model showed no feedback
      if (!availability.available) {
        console.log(`[App] Model ${newModel} requires ${availability.provider} API key`);
        this.showToast(`${newModel} requires a ${availability.provider} API key. Add it in Settings.`, 'warning', {
          duration: 5000,
          actionLabel: 'Settings',
          onAction: () => this.openSettings()
        });
      }
      
      this.state.settings.model = newModel;
      this.saveSettings();
      
      // Sync with settings panel
      const modelSelect = document.getElementById('model-select');
      if (modelSelect) {
        modelSelect.value = newModel;
      }
      
      // Update indicator
      this.updateModelIndicator(newModel);
      
      // Notify backend of model change
      this.websocketClient.sendMessage({
        type: 'change_model',
        data: { model: newModel }
      });
      
      console.log(`[App] Model changed to: ${newModel}`);
    });
    
    // Initial indicator update
    this.updateModelIndicator(this.state.settings.model);
  }

  /**
   * SYNC INLINE MODEL SELECTOR
   * 
   * Syncs the inline model selector with the current settings.
   * Called when model is changed from settings panel.
   */
  syncInlineModelSelector() {
    const inlineModelSelect = document.getElementById('inline-model-select');
    if (inlineModelSelect) {
      inlineModelSelect.value = this.state.settings.model;
      this.updateModelIndicator(this.state.settings.model);
    }
  }

  /**
   * CHECK MODEL AVAILABILITY
   * 
   * Checks if a model can be used based on available API keys.
   * 
   * @param {string} model - The model identifier
   * @returns {Object} { available: boolean, provider: string, reason: string }
   * 
   * MODEL PROVIDERS:
   * - gemini-*: Requires Google API key (free tier available)
   * - claude-*: Requires Anthropic API key
   * - gpt-*: Requires OpenAI API key
   */
  checkModelAvailability(model) {
    const settings = this.state.settings;
    
    // Model to provider mapping
    const modelProviders = {
      'gemini-2.5-flash-lite': 'google',
      'gemini-2.0-flash': 'google',
      'gemini-3-flash-preview': 'google',
      'gemini-3-pro-preview': 'google',
      'claude-sonnet-4.5': 'anthropic',
      'claude-opus-4.5': 'anthropic',
      'gpt-5.2-turbo': 'openai',
      'gpt-5.1': 'openai'
    };
    
    const provider = modelProviders[model] || 'unknown';
    
    // Check API key availability
    let hasKey = false;
    switch (provider) {
      case 'google':
        hasKey = !!settings.googleApiKey;
        break;
      case 'anthropic':
        hasKey = !!settings.anthropicApiKey;
        break;
      case 'openai':
        hasKey = !!settings.openaiApiKey;
        break;
    }
    
    return {
      available: hasKey,
      provider: provider,
      reason: hasKey ? 'API key configured' : `Requires ${provider} API key`
    };
  }

  /**
   * UPDATE MODEL AVAILABILITY
   * 
   * Updates the visual appearance of model options based on API key availability.
   * Models without API keys are grayed out but still selectable.
   * 
   * DESIGN DECISION: We gray out but don't disable options because:
   * 1. User might want to select then add key
   * 2. Backend can provide helpful error message
   * 3. Better UX than completely hiding options
   */
  updateModelAvailability() {
    const inlineModelSelect = document.getElementById('inline-model-select');
    const settingsModelSelect = document.getElementById('model-select');
    
    const selects = [inlineModelSelect, settingsModelSelect].filter(Boolean);
    
    selects.forEach(select => {
      Array.from(select.options).forEach(option => {
        const availability = this.checkModelAvailability(option.value);
        
        if (!availability.available) {
          option.classList.add('model-unavailable');
          // Add visual indicator to option text
          if (!option.textContent.includes('(needs key)')) {
            option.textContent = option.textContent.replace(' (New)', '') + ' (needs key)';
          }
        } else {
          option.classList.remove('model-unavailable');
          // Remove "needs key" indicator if present
          option.textContent = option.textContent.replace(' (needs key)', '');
        }
      });
    });
  }

  /**
   * UPDATE MODEL INDICATOR
   * 
   * Updates the small colored dot next to the model selector.
   * Green = model available, Red = needs API key, Yellow = limited.
   * 
   * @param {string} model - Current selected model
   */
  updateModelIndicator(model) {
    const indicator = document.getElementById('model-indicator');
    if (!indicator) return;
    
    const availability = this.checkModelAvailability(model);
    
    indicator.classList.remove('unavailable', 'warning');
    
    if (!availability.available) {
      indicator.classList.add('unavailable');
      indicator.title = availability.reason;
    } else {
      indicator.title = 'Model available';
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
   * TOAST NOTIFICATION SYSTEM (P0 UX FIX)
   * 
   * Replaces all native alert()/confirm() dialogs with non-blocking toasts.
   * WHY: Native alert() blocks the UI thread and looks out of place in Electron.
   * BECAUSE: User feedback showed the app felt "janky" with system dialogs 
   * appearing over a translucent Liquid Glass window.
   * 
   * TYPES: 'error', 'success', 'warning', 'info'
   * AUTO-DISMISS: errors=6s, others=4s
   * 
   * @param {string} message - The message to display
   * @param {string} type - Toast type: 'error'|'success'|'warning'|'info'
   * @param {Object} [options] - Optional config
   * @param {number} [options.duration] - Custom dismiss duration in ms
   * @param {string} [options.actionLabel] - Label for action button (e.g., "Retry")
   * @param {Function} [options.onAction] - Callback when action button is clicked
   */
  showToast(message, type = 'info', options = {}) {
    const container = document.getElementById('toast-container');
    if (!container) {
      console.error('[App] Toast container not found, falling back to console:', message);
      return;
    }

    // Icon map for each toast type
    // WHY: Visual icons help users instantly identify severity
    const icons = {
      error: '✕',
      success: '✓',
      warning: '⚠',
      info: 'ℹ'
    };

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    // Build toast inner HTML
    let actionHTML = '';
    if (options.actionLabel) {
      actionHTML = `<button class="toast-action">${options.actionLabel}</button>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
      ${actionHTML}
      <button class="toast-close" aria-label="Dismiss notification">×</button>
    `;

    // Attach action handler if provided
    if (options.actionLabel && options.onAction) {
      toast.querySelector('.toast-action').addEventListener('click', () => {
        options.onAction();
        this.dismissToast(toast);
      });
    }

    // Attach close handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismissToast(toast);
    });

    // Add to container (newest on top)
    container.prepend(toast);

    // Auto-dismiss: errors get longer (6s), success/info get 4s
    // WHY: Errors are more important and need more reading time
    const duration = options.duration || (type === 'error' ? 6000 : 4000);
    setTimeout(() => {
      this.dismissToast(toast);
    }, duration);
  }

  /**
   * DISMISS TOAST
   * 
   * Removes a toast with a smooth exit animation.
   * WHY: Abrupt removal feels jarring; animation signals intentional UI change.
   * 
   * @param {HTMLElement} toast - The toast element to remove
   */
  dismissToast(toast) {
    if (!toast || toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 200);
  }

  /**
   * SHOW ERROR (updated - now uses toast system)
   * 
   * Displays an error toast notification. This replaces the old alert()-based
   * error handler. All existing showError() call sites automatically benefit.
   * 
   * HISTORY: Previously used alert() which blocked the UI thread. Changed to
   * toast system 2026-02-06 as part of P0 UX fixes.
   * 
   * @param {string} message - Error message to display
   * @param {Object} [options] - Optional config passed through to showToast
   */
  showError(message, options = {}) {
    console.error('[App] Error:', message);
    this.showToast(message, 'error', options);
  }

  /**
   * SHOW SUCCESS
   * 
   * Displays a success toast notification.
   * WHY: Users need positive feedback when actions succeed (save, delete, etc.)
   * 
   * @param {string} message - Success message to display
   */
  showSuccess(message) {
    console.log('[App] Success:', message);
    this.showToast(message, 'success');
  }

  /**
   * SHOW CUSTOM CONFIRM DIALOG (P0 UX FIX)
   * 
   * Replaces native confirm() with a styled, non-blocking modal dialog.
   * Returns a Promise that resolves to true/false based on user choice.
   * 
   * WHY: Native confirm() blocks the thread and looks ugly in Electron.
   * BECAUSE: We need a confirm dialog for destructive actions (delete, reset)
   * but it must match the Liquid Glass aesthetic.
   * 
   * @param {string} title - Dialog title
   * @param {string} message - Dialog body text
   * @param {string} [confirmLabel='Delete'] - Label for confirm button
   * @returns {Promise<boolean>} True if user confirmed, false if cancelled
   */
  showConfirm(title, message, confirmLabel = 'Delete') {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      overlay.innerHTML = `
        <div class="confirm-dialog">
          <div class="confirm-title">${title}</div>
          <div class="confirm-message">${message}</div>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn-cancel">Cancel</button>
            <button class="confirm-btn confirm-btn-confirm">${confirmLabel}</button>
          </div>
        </div>
      `;

      // Handle cancel
      overlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });

      // Handle confirm
      overlay.querySelector('.confirm-btn-confirm').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      // Handle Escape key to cancel
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);

      // Handle click outside dialog to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          document.removeEventListener('keydown', handleEscape);
          resolve(false);
        }
      });

      document.body.appendChild(overlay);

      // Focus confirm button for keyboard accessibility
      overlay.querySelector('.confirm-btn-cancel').focus();
    });
  }

  /**
   * CONNECTION STATE HANDLERS
   * 
   * Called by WebSocketClient when connection state changes.
   */

  onConnected() {
    console.log('[App] Connected to backend');
    
    // If we were previously disconnected, show a reconnection toast
    // WHY: Users need to know their connection was restored
    if (this.state.isConnected === false && this._wasDisconnected) {
      this.showToast('Connection restored', 'success', { duration: 3000 });
    }
    
    this.state.isConnected = true;
    this._wasDisconnected = false;
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

  /**
   * ON DISCONNECTED (P2 ENHANCED)
   * 
   * Called when WebSocket connection drops.
   * Now shows a toast with reconnection status instead of just updating the dot.
   * WHY: The status dot alone was too subtle for users to notice.
   */
  onDisconnected() {
    console.log('[App] Disconnected from backend');
    this.state.isConnected = false;
    this._wasDisconnected = true;
    this.updateStatus('Disconnected', 'disconnected');
    
    // Show disconnection toast with action (P2 FIX)
    this.showToast('Connection lost. Reconnecting...', 'warning', {
      duration: 6000,
      actionLabel: 'Retry Now',
      onAction: () => {
        if (this.websocketClient) {
          this.websocketClient.scheduleReconnect();
        }
      }
    });
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
