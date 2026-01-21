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
   * CLEANUP
   * 
   * Removes event listeners to prevent memory leaks.
   * Should be called when components unmount.
   */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

console.log('[Preload] Electron API bridge initialized');
