/**
 * BUBBLEVOICE MAC - MAIN ELECTRON PROCESS
 * 
 * This is the main entry point for the Electron application.
 * It manages the app lifecycle, creates windows, handles menu bar integration,
 * and sets up global keyboard shortcuts.
 * 
 * ARCHITECTURE DECISIONS:
 * - Electron provides the UI layer (web-based for rapid iteration)
 * - Node.js backend runs in a separate process for voice pipeline
 * - WebSocket communication between frontend and backend
 * - Menu bar app with floating window (always-on-top option)
 * - Global hotkey: Cmd+Shift+Space to activate
 * 
 * PRODUCT CONTEXT:
 * BubbleVoice is a personal AI companion that remembers your life.
 * The UI needs to be instantly accessible (menu bar + hotkey) for
 * spontaneous voice conversations about personal life topics.
 * 
 * TECHNICAL NOTES:
 * - Window is frameless with custom title bar for modern aesthetic
 * - Supports both menu bar icon and dock icon modes
 * - Handles macOS permissions (microphone, accessibility)
 * - Manages backend process lifecycle (start/stop with app)
 */

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage, dialog, systemPreferences } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Global references to prevent garbage collection
// These must persist for the lifetime of the app
let mainWindow = null;
let tray = null;
let backendProcess = null;

// Configuration constants
// Using non-standard ports to avoid conflicts with other apps
// Backend runs on 7482, WebSocket on 7483
const BACKEND_PORT = 7482;
const WEBSOCKET_PORT = 7483;
const GLOBAL_HOTKEY = 'CommandOrControl+Shift+Space';

// Development mode flag
// Enables additional logging and dev tools
const isDev = process.env.NODE_ENV === 'development';

/**
 * CREATE MAIN WINDOW
 * 
 * Creates the main conversation window with Liquid Glass UI aesthetic.
 * The window is frameless for a modern look, with custom controls.
 * 
 * DESIGN DECISIONS:
 * - 900x700 default size (comfortable for conversation + artifacts)
 * - Frameless with vibrancy for iOS 26 Liquid Glass effect
 * - Always-on-top option for persistent presence
 * - Hides instead of closes (menu bar app pattern)
 * 
 * TECHNICAL NOTES:
 * - Uses BrowserWindow with custom frame
 * - Vibrancy effect for macOS native glass appearance
 * - Context isolation enabled for security
 * - Node integration disabled in renderer (use preload script)
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    frame: false, // Frameless for custom title bar
    transparent: true, // Allows for vibrancy effects
    vibrancy: 'under-window', // macOS Liquid Glass effect
    visualEffectState: 'active',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  // Load the main UI
  mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));

  // Show window when ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    mainWindow.show();
  });

  // Hide instead of close (menu bar app pattern)
  // This allows instant re-activation via hotkey
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Open external links in default browser
  // Security: prevents navigation within the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

/**
 * CREATE MENU BAR TRAY
 * 
 * Creates the menu bar icon with dropdown menu.
 * This provides persistent access to the app without dock presence.
 * 
 * PRODUCT CONTEXT:
 * Menu bar apps feel less intrusive than dock apps for personal tools.
 * Users can quickly access BubbleVoice without switching to a full app.
 * 
 * TECHNICAL NOTES:
 * - Uses template image for automatic dark/light mode adaptation
 * - Click to toggle window visibility
 * - Right-click for context menu
 */
function createTray() {
  // Create a simple tray icon programmatically
  // This creates a 22x22 circle icon that adapts to light/dark mode
  // In production, this would be replaced with a proper designed icon
  const canvas = require('canvas');
  const { createCanvas } = canvas;
  
  // Create a 22x22 canvas for the tray icon
  const size = 22;
  const canvasImage = createCanvas(size, size);
  const ctx = canvasImage.getContext('2d');
  
  // Draw a simple circle (represents a "bubble")
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(size/2, size/2, 8, 0, 2 * Math.PI);
  ctx.fill();
  
  // Convert canvas to PNG buffer
  const buffer = canvasImage.toBuffer('image/png');
  const icon = nativeImage.createFromBuffer(buffer);
  icon.setTemplateImage(true); // This makes it adapt to light/dark mode
  
  tray = new Tray(icon);
  tray.setToolTip('BubbleVoice - Your Personal AI Companion');

  // Click to toggle window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Context menu with additional options
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show BubbleVoice',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'New Conversation',
      accelerator: GLOBAL_HOTKEY,
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('new-conversation');
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('show-settings');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit BubbleVoice',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * START BACKEND SERVER
 * 
 * Spawns the Node.js backend process that handles voice pipeline,
 * LLM orchestration, and conversation management.
 * 
 * ARCHITECTURE DECISION:
 * Backend runs as a separate process (not in main Electron process)
 * because voice pipeline is CPU-intensive and we want to isolate
 * potential crashes from the UI.
 * 
 * TECHNICAL NOTES:
 * - Backend runs on port 7482
 * - WebSocket on port 7483 for real-time communication
 * - Logs are captured and can be viewed in dev mode
 * - Process is killed when app quits
 * 
 * ERROR HANDLING:
 * If backend crashes, we attempt to restart it automatically.
 * After 3 failed restarts, we show an error to the user.
 */
let backendRestartCount = 0;
const MAX_BACKEND_RESTARTS = 3;

function startBackendServer() {
  const backendPath = path.join(__dirname, '../backend/server.js');
  
  console.log('[Main] Starting backend server...');
  
  // IMPORTANT: In development mode, we skip the database to avoid
  // native module version conflicts between Electron's Node.js and
  // system Node.js. Both need different versions of better-sqlite3.
  // In production, the app is packaged with the correct version.
  const skipDatabase = isDev || process.env.SKIP_DATABASE === 'true';
  
  backendProcess = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: BACKEND_PORT,
      WEBSOCKET_PORT: WEBSOCKET_PORT,
      NODE_ENV: isDev ? 'development' : 'production',
      // Skip database in dev mode to avoid native module conflicts
      SKIP_DATABASE: skipDatabase ? 'true' : 'false'
    },
    stdio: isDev ? 'inherit' : 'pipe'
  });

  // Log backend output in dev mode
  if (!isDev && backendProcess.stdout) {
    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });
  }

  if (!isDev && backendProcess.stderr) {
    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });
  }

  // Handle backend crashes
  backendProcess.on('exit', (code, signal) => {
    console.log(`[Main] Backend process exited with code ${code}, signal ${signal}`);
    
    // CRITICAL FIX: Don't restart if port is already in use (code 1 with EADDRINUSE)
    // This prevents infinite restart loops when multiple instances are running
    if (code === 1 && backendRestartCount > 0) {
      console.error('[Main] Backend failed due to port conflict - not restarting to prevent loop');
      backendRestartCount = MAX_BACKEND_RESTARTS; // Prevent further restarts
      return;
    }
    
    if (!app.isQuitting && backendRestartCount < MAX_BACKEND_RESTARTS) {
      backendRestartCount++;
      console.log(`[Main] Attempting to restart backend (attempt ${backendRestartCount}/${MAX_BACKEND_RESTARTS})...`);
      setTimeout(() => startBackendServer(), 2000);
    } else if (backendRestartCount >= MAX_BACKEND_RESTARTS) {
      console.error('[Main] Backend failed to start after multiple attempts');
      // TODO: Show error dialog to user
    }
  });

  // Reset restart count on successful startup
  setTimeout(() => {
    if (backendProcess && !backendProcess.killed) {
      backendRestartCount = 0;
      console.log('[Main] Backend server started successfully');
    }
  }, 5000);
}

/**
 * STOP BACKEND SERVER
 * 
 * Gracefully shuts down the backend process.
 * Called when the app is quitting.
 */
function stopBackendServer() {
  if (backendProcess && !backendProcess.killed) {
    console.log('[Main] Stopping backend server...');
    backendProcess.kill('SIGTERM');
    
    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        console.log('[Main] Force killing backend server...');
        backendProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * REGISTER GLOBAL SHORTCUTS
 * 
 * Sets up keyboard shortcuts that work system-wide.
 * 
 * PRIMARY SHORTCUT:
 * Cmd+Shift+Space - Activate BubbleVoice and start listening
 * 
 * PRODUCT CONTEXT:
 * This is the primary way users will interact with BubbleVoice.
 * It needs to feel instant and reliable, like Spotlight or Raycast.
 * 
 * TECHNICAL NOTES:
 * - Shortcuts are registered after app is ready
 * - Must be unregistered before app quits
 * - Conflicts with existing shortcuts are handled gracefully
 */
function registerGlobalShortcuts() {
  const registered = globalShortcut.register(GLOBAL_HOTKEY, () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
    
    // Signal to frontend to start voice input
    mainWindow.webContents.send('activate-voice-input');
  });

  if (!registered) {
    console.error(`[Main] Failed to register global shortcut: ${GLOBAL_HOTKEY}`);
  } else {
    console.log(`[Main] Global shortcut registered: ${GLOBAL_HOTKEY}`);
  }
}

/**
 * IPC HANDLERS
 * 
 * Handles communication from renderer process (frontend).
 * These are the main commands the UI can send to the main process.
 */

// Window control commands
ipcMain.handle('window:minimize', () => {
  mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow.hide();
});

// Always-on-top toggle
ipcMain.handle('window:toggle-always-on-top', () => {
  const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
  return !isAlwaysOnTop;
});

// Get backend connection info
ipcMain.handle('get-backend-config', () => {
  return {
    backendUrl: `http://localhost:${BACKEND_PORT}`,
    websocketUrl: `ws://localhost:${WEBSOCKET_PORT}`
  };
});

/**
 * FOLDER SELECTION HANDLER
 * 
 * Opens a native folder picker dialog for the user to select a target folder
 * where conversation transcripts, recordings, and other data will be saved.
 * 
 * PRODUCT CONTEXT:
 * Users need control over where their personal data is stored. This could be
 * a Dropbox folder, iCloud Drive, or a specific project folder. The folder
 * selection should persist across app restarts.
 * 
 * TECHNICAL NOTES:
 * - Uses Electron's dialog.showOpenDialog for native macOS folder picker
 * - Returns the selected folder path or null if cancelled
 * - The frontend is responsible for persisting this in localStorage
 */
// Lazy-load StorageManagerService
let storageManagerService = null;

function getStorageManager() {
  if (!storageManagerService) {
    const StorageManagerService = require('../backend/services/StorageManagerService');
    const defaultPath = path.join(app.getPath('userData'), 'user_data');
    storageManagerService = new StorageManagerService(defaultPath);
    console.log('[Main] StorageManagerService initialized');
  }
  return storageManagerService;
}

// Select target folder
ipcMain.handle('select-target-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Folder for BubbleVoice Data',
      message: 'Choose where to save your conversations, life areas, and artifacts',
      buttonLabel: 'Select Folder'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, path: null };
    }

    const selectedPath = result.filePaths[0];
    console.log('[Main] Target folder selected:', selectedPath);
    
    // Update storage manager
    const storageManager = getStorageManager();
    await storageManager.setUserFolder(selectedPath);
    
    return { success: true, path: selectedPath };
  } catch (error) {
    console.error('[Main] Error selecting folder:', error);
    return { success: false, error: error.message };
  }
});

// Get current storage folder
ipcMain.handle('storage:get-folder', async () => {
  try {
    const storageManager = getStorageManager();
    await storageManager.initialize();
    
    return {
      success: true,
      path: storageManager.userSelectedPath
    };
  } catch (error) {
    console.error('[Main] Error getting storage folder:', error);
    throw error;
  }
});

// Get storage info
ipcMain.handle('storage:get-info', async () => {
  try {
    const storageManager = getStorageManager();
    await storageManager.initialize();
    
    const info = await storageManager.getStorageInfo();
    
    return info;
  } catch (error) {
    console.error('[Main] Error getting storage info:', error);
    throw error;
  }
});

/**
 * PERMISSIONS MANAGEMENT
 * 
 * Handles checking and requesting macOS system permissions.
 * BubbleVoice needs microphone access for voice input and file system
 * access for saving conversations.
 * 
 * MACOS PERMISSIONS REQUIRED:
 * - Microphone: For voice input (required)
 * - File System: For saving data to user-selected folder (required)
 * - Accessibility: For global hotkeys (optional but recommended)
 * 
 * TECHNICAL NOTES:
 * - Uses systemPreferences API to check/request permissions
 * - Microphone permission must be in Info.plist
 * - File system access is granted via user folder selection
 * - Accessibility must be manually enabled in System Preferences
 */

// Check microphone permission status
ipcMain.handle('check-microphone-permission', async () => {
  try {
    // On macOS, check if we have microphone access
    // This will return 'granted', 'denied', or 'restricted'
    const status = systemPreferences.getMediaAccessStatus('microphone');
    console.log('[Main] Microphone permission status:', status);
    
    return { 
      status: status,
      granted: status === 'granted'
    };
  } catch (error) {
    console.error('[Main] Error checking microphone permission:', error);
    return { status: 'unknown', granted: false, error: error.message };
  }
});

// Request microphone permission
ipcMain.handle('request-microphone-permission', async () => {
  try {
    // This will prompt the user if permission hasn't been granted yet
    // Note: This only works if NSMicrophoneUsageDescription is in Info.plist
    const granted = await systemPreferences.askForMediaAccess('microphone');
    console.log('[Main] Microphone permission request result:', granted);
    
    return { 
      granted: granted,
      status: granted ? 'granted' : 'denied'
    };
  } catch (error) {
    console.error('[Main] Error requesting microphone permission:', error);
    return { granted: false, status: 'error', error: error.message };
  }
});

// Note: Speech recognition permission is handled by the Swift helper
// Electron doesn't support requesting speech recognition permission directly
// The Swift helper will call SFSpeechRecognizer.requestAuthorization() which shows a system dialog
// This requires NSSpeechRecognitionUsageDescription in Info.plist (which we have)

// Check if accessibility permissions are enabled (for global hotkeys)
// Note: This can't be requested programmatically, user must enable manually
ipcMain.handle('check-accessibility-permission', () => {
  try {
    // isTrustedAccessibilityClient checks if app has accessibility permissions
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    console.log('[Main] Accessibility permission status:', trusted);
    
    return { 
      granted: trusted,
      status: trusted ? 'granted' : 'denied'
    };
  } catch (error) {
    console.error('[Main] Error checking accessibility permission:', error);
    return { granted: false, status: 'unknown', error: error.message };
  }
});

// Open System Preferences to accessibility settings
// This is needed because accessibility can't be requested programmatically
ipcMain.handle('open-accessibility-settings', async () => {
  try {
    // Open the Security & Privacy > Accessibility pane
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error opening accessibility settings:', error);
    return { success: false, error: error.message };
  }
});

/**
 * LIFE AREAS IPC HANDLERS
 * 
 * Handlers for life areas system integration.
 * These connect the frontend UI to the backend AreaManagerService.
 */

// Get all life areas
ipcMain.handle('get-life-areas', async () => {
  try {
    // TODO: Integrate with AreaManagerService
    // For now, return mock data
    return [
      {
        path: 'Family/Emma_School',
        name: "Emma's School",
        entry_count: 2,
        last_activity: new Date().toISOString()
      },
      {
        path: 'Work/Startup',
        name: 'Startup Project',
        entry_count: 5,
        last_activity: new Date(Date.now() - 86400000).toISOString()
      }
    ];
  } catch (error) {
    console.error('[Main] Error getting life areas:', error);
    return [];
  }
});

// Get area details
ipcMain.handle('get-area-details', async (event, areaPath) => {
  try {
    // TODO: Integrate with AreaManagerService
    return {
      path: areaPath,
      name: areaPath.split('/').pop(),
      entry_count: 0,
      last_activity: null
    };
  } catch (error) {
    console.error('[Main] Error getting area details:', error);
    throw error;
  }
});

// Create new life area
ipcMain.handle('create-life-area', async (event, { areaPath, name, description }) => {
  try {
    // TODO: Integrate with AreaManagerService
    console.log('[Main] Creating life area:', areaPath);
    return { success: true, path: areaPath };
  } catch (error) {
    console.error('[Main] Error creating life area:', error);
    throw error;
  }
});

/**
 * CHAT HISTORY IPC HANDLERS
 * 
 * Provides access to conversation history for the chat history sidebar.
 * These handlers allow the frontend to list, create, delete, and switch conversations.
 * 
 * ARCHITECTURE NOTE:
 * We use the same DatabaseService and ConversationStorageService that the
 * backend server uses. They share the same user_data directory.
 */

// Lazy-load services for chat history
let databaseService = null;
let conversationStorageService = null;

function getChatHistoryServices() {
    if (!databaseService) {
        // IMPORTANT: In development mode, we skip the real database to avoid
        // native module version conflicts. Electron uses its own Node.js version
        // which is different from system Node.js. The better-sqlite3 native module
        // can only be compiled for ONE version at a time, causing conflicts.
        // In production, the app is packaged with the correct version.
        const skipDatabase = isDev || process.env.SKIP_DATABASE === 'true';
        
        if (skipDatabase) {
            console.log('[Main] ⚠️  DEV MODE or SKIP_DATABASE=true - Using mock storage');
            
            // Import IntegrationService to access MOCK_STORAGE
            const IntegrationService = require('../backend/services/IntegrationService');
            
            // Create mock database service
            databaseService = {
                getAllConversations: () => {
                    // Access the global MOCK_STORAGE from IntegrationService
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        return Array.from(mockStorage.conversations.values());
                    }
                    return [];
                },
                getConversation: (convId) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        return mockStorage.conversations.get(convId) || null;
                    }
                    return null;
                },
                getMessageCount: (convId) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        const conv = mockStorage.conversations.get(convId);
                        return conv ? conv.messages.length : 0;
                    }
                    return 0;
                },
                getMessages: (convId, limit) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        const conv = mockStorage.conversations.get(convId);
                        if (conv && conv.messages) {
                            return limit ? conv.messages.slice(-limit) : conv.messages;
                        }
                    }
                    return [];
                },
                deleteConversation: (convId) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        mockStorage.conversations.delete(convId);
                        console.log(`[Main MockDB] Deleted conversation ${convId}, remaining: ${mockStorage.conversations.size}`);
                    }
                },
                updateConversation: (convId, updates) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (mockStorage && mockStorage.conversations) {
                        const conv = mockStorage.conversations.get(convId);
                        if (conv) {
                            Object.assign(conv, updates);
                            console.log(`[Main MockDB] Updated conversation ${convId}`);
                        }
                    }
                }
            };
            
            // Create mock conversation storage service
            conversationStorageService = {
                createConversation: async (id, title) => {
                    const mockStorage = require('../backend/services/IntegrationService').MOCK_STORAGE;
                    if (!mockStorage.conversations) {
                        mockStorage.conversations = new Map();
                    }
                    const conv = {
                        id: id || 'conv-' + Date.now(),
                        title: title || 'New Conversation',
                        messages: [],
                        createdAt: new Date().toISOString()
                    };
                    mockStorage.conversations.set(conv.id, conv);
                    console.log(`[Main MockStorage] Created conversation ${conv.id}, total: ${mockStorage.conversations.size}`);
                    return conv;
                }
            };
            
        } else {
            // Normal initialization with real database
            const DatabaseService = require('../backend/services/DatabaseService');
            const ConversationStorageService = require('../backend/services/ConversationStorageService');
            
            const userDataPath = path.join(app.getPath('userData'), 'user_data');
            const dbPath = path.join(userDataPath, 'bubblevoice.db');
            const conversationsDir = path.join(userDataPath, 'conversations');
            
            databaseService = new DatabaseService(dbPath);
            databaseService.initialize();
            
            conversationStorageService = new ConversationStorageService(databaseService, conversationsDir);
        }
        
        console.log('[Main] Chat history services initialized');
    }
    
    return { db: databaseService, storage: conversationStorageService };
}

// Get all conversations
ipcMain.handle('chat-history:get-conversations', async () => {
    try {
        const { db } = getChatHistoryServices();
        const conversations = db.getAllConversations();
        
        // Enrich with message count and last message
        const enriched = conversations.map(conv => {
            const messageCount = db.getMessageCount(conv.id);
            const messages = db.getMessages(conv.id, 1); // Get last message
            const lastMessage = messages.length > 0 ? messages[0].content : null;
            
            return {
                ...conv,
                message_count: messageCount,
                lastMessage: lastMessage
            };
        });
        
        console.log(`[Main] Retrieved ${enriched.length} conversations`);
        return enriched;
    } catch (error) {
        console.error('[Main] Error getting conversations:', error);
        throw error;
    }
});

// Create new conversation
ipcMain.handle('chat-history:create-conversation', async (event, title) => {
    try {
        const { storage } = getChatHistoryServices();
        
        const conversationId = `conv_${Date.now()}`;
        const conversationTitle = title || 'New Conversation';
        
        const result = await storage.createConversation(conversationId, conversationTitle);
        
        console.log(`[Main] Created conversation: ${conversationId}`);
        return { success: true, id: conversationId, title: conversationTitle };
    } catch (error) {
        console.error('[Main] Error creating conversation:', error);
        throw error;
    }
});

// Delete conversation
ipcMain.handle('chat-history:delete-conversation', async (event, conversationId) => {
    try {
        const { db, storage } = getChatHistoryServices();
        
        // Delete from database
        db.deleteConversation(conversationId);
        
        // Delete conversation folder
        const fs = require('fs');
        const conversationsDir = path.join(app.getPath('userData'), 'user_data', 'conversations');
        const convDir = path.join(conversationsDir, conversationId);
        
        if (fs.existsSync(convDir)) {
            fs.rmSync(convDir, { recursive: true, force: true });
        }
        
        console.log(`[Main] Deleted conversation: ${conversationId}`);
        return { success: true };
    } catch (error) {
        console.error('[Main] Error deleting conversation:', error);
        throw error;
    }
});

// Update conversation title
ipcMain.handle('chat-history:update-title', async (event, { id, title }) => {
    try {
        const { db } = getChatHistoryServices();
        
        db.updateConversation(id, { title });
        
        console.log(`[Main] Updated conversation title: ${id}`);
        return { success: true };
    } catch (error) {
        console.error('[Main] Error updating conversation title:', error);
        throw error;
    }
});

// TEST HELPER: Reset mock storage (works in dev mode or when SKIP_DATABASE=true)
ipcMain.handle('test:reset-storage', async () => {
    try {
        const skipDatabase = isDev || process.env.SKIP_DATABASE === 'true';
        if (skipDatabase) {
            console.log('[Main] Resetting MOCK_STORAGE');
            const { MOCK_STORAGE } = require('../backend/services/IntegrationService');
            if (MOCK_STORAGE && MOCK_STORAGE.reset) {
                MOCK_STORAGE.reset();
                console.log('[Main] MOCK_STORAGE reset complete');
                return { success: true, message: 'Storage reset' };
            }
            return { success: false, message: 'MOCK_STORAGE.reset not available' };
        }
        return { success: false, message: 'Not in dev/test mode' };
    } catch (error) {
        console.error('[Main] Error resetting storage:', error);
        return { success: false, message: error.message };
    }
});

// Get conversation details
ipcMain.handle('chat-history:get-conversation', async (event, conversationId) => {
    try {
        const { db } = getChatHistoryServices();
        
        const conversation = db.getConversation(conversationId);
        const messages = db.getMessages(conversationId);
        
        console.log(`[Main] Retrieved conversation: ${conversationId} (${messages.length} messages)`);
        return { conversation, messages };
    } catch (error) {
        console.error('[Main] Error getting conversation:', error);
        throw error;
    }
});

// Export conversations
ipcMain.handle('chat-history:export-conversations', async () => {
    try {
        const { dialog } = require('electron');
        
        // Ask user where to save
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Conversations',
            defaultPath: `bubblevoice-export-${Date.now()}.zip`,
            filters: [
                { name: 'ZIP Archive', extensions: ['zip'] }
            ]
        });
        
        if (result.canceled) {
            return { success: false, canceled: true };
        }
        
        // TODO: Implement ZIP export
        console.log(`[Main] Export conversations to: ${result.filePath}`);
        
        return { success: true, path: result.filePath };
    } catch (error) {
        console.error('[Main] Error exporting conversations:', error);
        throw error;
    }
});

/**
 * ADMIN PANEL IPC HANDLERS
 * 
 * Provides access to the PromptManagementService for the admin panel UI.
 * These handlers allow the frontend to manage system prompts and configuration.
 * 
 * ARCHITECTURE NOTE:
 * The PromptManagementService is initialized in the backend server,
 * so we need to communicate with it via HTTP or shared state.
 * For now, we'll create a local instance here for the admin panel.
 * 
 * TODO: In production, consider moving this to a shared service
 * or using HTTP API to communicate with the backend's instance.
 */

// Lazy-load PromptManagementService
let promptManagementService = null;

function getPromptManagementService() {
  if (!promptManagementService) {
    const PromptManagementService = require('../backend/services/PromptManagementService');
    const userDataPath = path.join(app.getPath('userData'), 'user_data');
    promptManagementService = new PromptManagementService(userDataPath);
    console.log('[Main] PromptManagementService initialized for admin panel');
  }
  return promptManagementService;
}

// Get all prompt sections
ipcMain.handle('admin:get-prompt-sections', async () => {
  try {
    const service = getPromptManagementService();
    const sections = service.getAllSections();
    console.log('[Main] Retrieved prompt sections');
    return sections;
  } catch (error) {
    console.error('[Main] Error getting prompt sections:', error);
    throw error;
  }
});

// Get a specific prompt section
ipcMain.handle('admin:get-prompt-section', async (event, section) => {
  try {
    const service = getPromptManagementService();
    const content = service.getPromptSection(section);
    console.log(`[Main] Retrieved prompt section: ${section}`);
    return content;
  } catch (error) {
    console.error(`[Main] Error getting prompt section ${section}:`, error);
    throw error;
  }
});

// Update a prompt section
ipcMain.handle('admin:update-prompt-section', async (event, { section, content }) => {
  try {
    const service = getPromptManagementService();
    service.updatePromptSection(section, content);
    console.log(`[Main] Updated prompt section: ${section}`);
    return { success: true };
  } catch (error) {
    console.error(`[Main] Error updating prompt section ${section}:`, error);
    throw error;
  }
});

// Reset a prompt section to default
ipcMain.handle('admin:reset-prompt-section', async (event, section) => {
  try {
    const service = getPromptManagementService();
    service.updatePromptSection(section, null); // null resets to default
    console.log(`[Main] Reset prompt section: ${section}`);
    return { success: true };
  } catch (error) {
    console.error(`[Main] Error resetting prompt section ${section}:`, error);
    throw error;
  }
});

// Get full system prompt
ipcMain.handle('admin:get-full-system-prompt', async () => {
  try {
    const service = getPromptManagementService();
    const prompt = service.getSystemPrompt();
    console.log('[Main] Retrieved full system prompt');
    return prompt;
  } catch (error) {
    console.error('[Main] Error getting full system prompt:', error);
    throw error;
  }
});

// Reset all prompts to defaults
ipcMain.handle('admin:reset-all-prompts', async () => {
  try {
    const service = getPromptManagementService();
    service.resetToDefaults();
    console.log('[Main] Reset all prompts to defaults');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error resetting all prompts:', error);
    throw error;
  }
});

// Get context assembly configuration
ipcMain.handle('admin:get-context-config', async () => {
  try {
    const service = getPromptManagementService();
    const config = service.getContextAssemblyConfig();
    console.log('[Main] Retrieved context assembly config');
    return config;
  } catch (error) {
    console.error('[Main] Error getting context config:', error);
    throw error;
  }
});

// Update context assembly configuration
ipcMain.handle('admin:update-context-config', async (event, config) => {
  try {
    const service = getPromptManagementService();
    service.updateContextAssemblyConfig(config);
    console.log('[Main] Updated context assembly config');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error updating context config:', error);
    throw error;
  }
});

// Reset context assembly configuration
ipcMain.handle('admin:reset-context-config', async () => {
  try {
    const service = getPromptManagementService();
    const defaultConfig = service.loadDefaultPrompts().contextAssembly;
    service.updateContextAssemblyConfig(defaultConfig);
    console.log('[Main] Reset context assembly config');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error resetting context config:', error);
    throw error;
  }
});

// Get prompt metadata
ipcMain.handle('admin:get-prompt-metadata', async () => {
  try {
    const service = getPromptManagementService();
    const metadata = service.getMetadata();
    console.log('[Main] Retrieved prompt metadata');
    return metadata;
  } catch (error) {
    console.error('[Main] Error getting prompt metadata:', error);
    throw error;
  }
});

// Get performance metrics
ipcMain.handle('admin:get-performance-metrics', async () => {
  try {
    // TODO: Integrate with actual performance monitoring
    // For now, return mock data
    const metrics = {
      llmResponseTime: 2500,
      vectorSearchTime: 150,
      embeddingTime: 80,
      contextAssemblyTime: 230,
      embeddingsCount: 1250,
      lifeAreasCount: 8,
      conversationsCount: 42,
      databaseSize: '12.5 MB'
    };
    console.log('[Main] Retrieved performance metrics');
    return metrics;
  } catch (error) {
    console.error('[Main] Error getting performance metrics:', error);
    throw error;
  }
});

/**
 * APP LIFECYCLE EVENTS
 */

// App is ready - create window and start backend
app.whenReady().then(async () => {
  console.log('[Main] App is ready, initializing...');
  
  createMainWindow();
  createTray();
  registerGlobalShortcuts();
  
  // CRITICAL: Request speech recognition permission BEFORE starting backend
  // The Swift helper needs this permission to use SFSpeechRecognizer
  console.log('[Main] Checking permissions...');
  
  // Check microphone permission
  const micStatus = systemPreferences.getMediaAccessStatus('microphone');
  console.log('[Main] Microphone permission status:', micStatus);
  
  if (micStatus !== 'granted') {
    console.log('[Main] Requesting microphone permission...');
    try {
      const micGranted = await systemPreferences.askForMediaAccess('microphone');
      console.log('[Main] Microphone permission granted:', micGranted);
    } catch (error) {
      console.error('[Main] Error requesting microphone permission:', error);
    }
  }
  
  // Note: Electron doesn't support requesting speech recognition permission directly
  // The Swift helper will request it when first used via SFSpeechRecognizer.requestAuthorization()
  // This is handled in the Swift code and will show a system dialog
  console.log('[Main] Speech recognition permission will be requested by Swift helper on first use');
  
  // Now start backend with permissions granted
  startBackendServer();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// App is quitting - cleanup
app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  stopBackendServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
  // TODO: Log to file or crash reporter
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
  // TODO: Log to file or crash reporter
});

console.log('[Main] Electron main process initialized');
