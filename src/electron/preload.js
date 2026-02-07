/**
 * BUBBLEVOICE MAC - ELECTRON PRELOAD SCRIPT
 * 
 * This script runs in the renderer process before the web page loads.
 * It provides a secure bridge between the renderer (frontend) and main process.
 * 
 * SECURITY CONTEXT:
 * - Context isolation is enabled (renderer can't access Node.js directly)
 * - This preload script exposes only specific, safe APIs to the frontend
 * - All IPC communication goes through this controlled interface
 * 
 * ARCHITECTURE DECISION:
 * We use the contextBridge API to expose a clean, minimal API surface
 * to the frontend. This prevents the frontend from accessing Node.js
 * directly, which would be a security risk.
 * 
 * EXPOSED API:
 * window.electronAPI - Contains all methods the frontend can call
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * ELECTRON API BRIDGE
 * 
 * This object is exposed to the frontend as window.electronAPI.
 * Each method here provides a safe way for the frontend to interact
 * with the main process or receive events from it.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * WINDOW CONTROLS
   * 
   * Methods for controlling the application window.
   * Used by the custom title bar in the UI.
   */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top')
  },

  /**
   * BACKEND CONFIGURATION
   * 
   * Gets the backend server URLs for WebSocket and HTTP connections.
   * The frontend needs these to establish connections to the backend.
   */
  getBackendConfig: () => ipcRenderer.invoke('get-backend-config'),

  /**
   * FOLDER SELECTION
   * 
   * Opens a native folder picker dialog for selecting where to save
   * conversation data, recordings, and other files.
   * 
   * RETURNS:
   * { success: boolean, path: string | null, error?: string }
   */
  selectTargetFolder: () => ipcRenderer.invoke('select-target-folder'),

  /**
   * OPEN FOLDER IN FINDER
   * 
   * Opens the specified folder in Finder (macOS file browser).
   * Allows users to quickly access their data folder.
   * 
   * Added 2026-01-28 to complement folder selection.
   * 
   * @param {string} folderPath - Absolute path to the folder to open
   * RETURNS: { success: boolean, error?: string }
   */
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),

  /**
   * STORAGE MANAGEMENT API
   * 
   * Methods for managing the user-selected storage folder.
   * All BubbleVoice data is stored in this folder.
   */
  storage: {
    getFolder: () => ipcRenderer.invoke('storage:get-folder'),
    getInfo: () => ipcRenderer.invoke('storage:get-info')
  },

  /**
   * PERMISSIONS MANAGEMENT
   * 
   * Methods for checking and requesting macOS system permissions.
   * BubbleVoice requires microphone access and optionally accessibility
   * permissions for global hotkeys.
   */
  permissions: {
    /**
     * Check microphone permission status
     * Returns: { status: string, granted: boolean }
     */
    checkMicrophone: () => ipcRenderer.invoke('check-microphone-permission'),

    /**
     * Request microphone permission from user
     * Returns: { granted: boolean, status: string }
     */
    requestMicrophone: () => ipcRenderer.invoke('request-microphone-permission'),

    /**
     * Check if accessibility permissions are enabled
     * (needed for global hotkeys to work)
     * Returns: { granted: boolean, status: string }
     */
    checkAccessibility: () => ipcRenderer.invoke('check-accessibility-permission'),

    /**
     * Open System Preferences to accessibility settings
     * User must manually enable accessibility permissions
     * Returns: { success: boolean }
     */
    openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings')
  },

  /**
   * EVENT LISTENERS
   * 
   * Allows the frontend to listen for events from the main process.
   * 
   * EVENTS:
   * - 'activate-voice-input': Global hotkey was pressed
   * - 'new-conversation': User selected "New Conversation" from menu
   * - 'show-settings': User selected "Settings" from menu
   */
  onActivateVoiceInput: (callback) => {
    ipcRenderer.on('activate-voice-input', callback);
  },

  onNewConversation: (callback) => {
    ipcRenderer.on('new-conversation', callback);
  },

  onShowSettings: (callback) => {
    ipcRenderer.on('show-settings', callback);
  },

  /**
   * LIFE AREAS API
   * 
   * Methods for interacting with the Life Areas system.
   * Allows frontend to fetch, create, and manage life areas.
   */
  getLifeAreas: () => ipcRenderer.invoke('get-life-areas'),
  getAreaDetails: (areaPath) => ipcRenderer.invoke('get-area-details', areaPath),
  createLifeArea: (areaPath, name, description) => ipcRenderer.invoke('create-life-area', { areaPath, name, description }),

  /**
   * CLEANUP
   * 
   * Removes event listeners to prevent memory leaks.
   * Should be called when components unmount.
   */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  /**
   * CHAT HISTORY API
   * 
   * Methods for managing conversation history.
   * Provides access to conversation list, switching, and management.
   */
  chatHistory: {
    getConversations: () => ipcRenderer.invoke('chat-history:get-conversations'),
    createConversation: (title) => ipcRenderer.invoke('chat-history:create-conversation', title),
    deleteConversation: (id) => ipcRenderer.invoke('chat-history:delete-conversation', id),
    updateConversationTitle: (id, title) => ipcRenderer.invoke('chat-history:update-title', { id, title }),
    getConversation: (id) => ipcRenderer.invoke('chat-history:get-conversation', id),
    exportConversations: () => ipcRenderer.invoke('chat-history:export-conversations')
  },

  /**
   * TEST HELPERS
   * 
   * Methods for Playwright tests to reset state between test runs.
   * Only available when SKIP_DATABASE=true.
   */
  test: {
    resetStorage: () => ipcRenderer.invoke('test:reset-storage')
  },

  /**
   * ADMIN PANEL API
   * 
   * Methods for the admin panel to manage prompts and configuration.
   * These provide access to the PromptManagementService.
   * 
   * SECURITY NOTE:
   * These are power-user features. In production, you might want to
   * add authentication or restrict access.
   */
  adminPanel: {
    // Prompt management
    getPromptSections: () => ipcRenderer.invoke('admin:get-prompt-sections'),
    getPromptSection: (section) => ipcRenderer.invoke('admin:get-prompt-section', section),
    updatePromptSection: (section, content) => ipcRenderer.invoke('admin:update-prompt-section', { section, content }),
    resetPromptSection: (section) => ipcRenderer.invoke('admin:reset-prompt-section', section),
    getFullSystemPrompt: () => ipcRenderer.invoke('admin:get-full-system-prompt'),
    resetAllPrompts: () => ipcRenderer.invoke('admin:reset-all-prompts'),
    
    // Context assembly configuration
    getContextConfig: () => ipcRenderer.invoke('admin:get-context-config'),
    updateContextConfig: (config) => ipcRenderer.invoke('admin:update-context-config', config),
    resetContextConfig: () => ipcRenderer.invoke('admin:reset-context-config'),
    
    // Metadata and performance
    getPromptMetadata: () => ipcRenderer.invoke('admin:get-prompt-metadata'),
    getPerformanceMetrics: () => ipcRenderer.invoke('admin:get-performance-metrics'),
    
    // Visual prompt editor: block configuration (Added 2026-02-06)
    // These support the new block-based visual editor that shows programmatic/RAG
    // sections as visual blocks alongside editable text sections.
    getBlockConfig: () => ipcRenderer.invoke('admin:get-block-config'),
    saveBlockConfig: (config) => ipcRenderer.invoke('admin:save-block-config', config),
    
    // Template library: custom templates (Added 2026-02-06)
    // Users can save their current prompt config as a reusable template
    // and browse/apply from a library of built-in and custom templates.
    getCustomTemplates: () => ipcRenderer.invoke('admin:get-custom-templates'),
    saveCustomTemplates: (templates) => ipcRenderer.invoke('admin:save-custom-templates', templates),
    
    // Variable resolution preview (Added 2026-02-06)
    // Shows users what the prompt looks like with all {{variables}} resolved
    // to their current runtime values.
    previewResolvedPrompt: () => ipcRenderer.invoke('admin:preview-resolved-prompt')
  }
});

console.log('[Preload] Electron API bridge initialized');
