/**
 * ELECTRON APP HELPER FOR PLAYWRIGHT TESTING
 *
 * This module provides utilities for launching, controlling, and testing
 * the BubbleVoice Electron application with Playwright.
 *
 * TECHNICAL ARCHITECTURE:
 * - Uses Playwright's experimental _electron module for Electron automation
 * - Launches the app in test mode (NODE_ENV=test) to enable test-specific behavior
 * - Provides methods for common test operations (launch, close, reset, get windows)
 * - Handles cleanup to prevent zombie processes and port conflicts
 *
 * WHY THIS APPROACH:
 * Electron testing with Playwright is different from browser testing because:
 * 1. We need to launch a real Electron process, not just a browser
 * 2. We must handle multiple windows (main process creates BrowserWindows)
 * 3. IPC communication between main and renderer needs special handling
 * 4. App state persists across tests unless explicitly reset
 *
 * PRODUCT CONTEXT:
 * BubbleVoice is a menu bar app with a main conversation window. Tests need to:
 * - Verify the app launches correctly
 * - Interact with the UI (buttons, inputs, etc.)
 * - Test the settings panel
 * - Verify voice activation UI elements
 *
 * HISTORY:
 * - 2026-01-21: Initial implementation for Playwright Electron testing
 *
 * USAGE:
 * ```javascript
 * const { ElectronAppHelper } = require('./helpers/electron-app');
 *
 * test.describe('App Tests', () => {
 *   let app;
 *
 *   test.beforeEach(async () => {
 *     app = new ElectronAppHelper();
 *     await app.launch();
 *   });
 *
 *   test.afterEach(async () => {
 *     await app.close();
 *   });
 *
 *   test('should launch', async () => {
 *     const window = await app.getMainWindow();
 *     expect(await window.title()).toBe('BubbleVoice');
 *   });
 * });
 * ```
 */

const { _electron: electron } = require('@playwright/test');
const path = require('path');
const http = require('http');
const net = require('net');

/**
 * BACKEND PORT CONFIGURATION
 *
 * These must match the ports in src/electron/main.js
 * Using non-standard ports to avoid conflicts with other apps/tests
 *
 * WHY THESE VALUES:
 * - 7482: Backend HTTP server port
 * - 7483: WebSocket server port
 * - Chosen to avoid common ports (3000, 8080, etc.)
 */
const BACKEND_PORT = 7482;
const WEBSOCKET_PORT = 7483;

/**
 * TIMEOUT CONFIGURATION
 *
 * Generous timeouts to accommodate:
 * - Cold start (no cached node_modules)
 * - Backend server initialization
 * - macOS security prompts (though we try to avoid these in tests)
 */
const APP_LAUNCH_TIMEOUT = 20000; // 20 seconds for app to fully launch
const WINDOW_READY_TIMEOUT = 10000; // 10 seconds for window to be ready

/**
 * ElectronAppHelper Class
 *
 * Encapsulates all Electron app management for tests.
 * Each test should create a new instance and call launch() in beforeEach,
 * then close() in afterEach to ensure clean state.
 *
 * TECHNICAL NOTES:
 * - The _electron module from Playwright is marked as experimental but stable
 * - electronApp is the Playwright ElectronApplication object
 * - mainWindow is the first BrowserWindow (our main conversation window)
 */
class ElectronAppHelper {
  /**
   * Constructor
   *
   * Initializes the helper with null references.
   * Call launch() to actually start the app.
   *
   * DESIGN DECISION:
   * We don't auto-launch in constructor because:
   * 1. Constructors shouldn't have side effects (launching is async)
   * 2. Tests need control over when to launch
   * 3. Different tests might need different launch configurations
   */
  constructor() {
    /**
     * Reference to the Playwright ElectronApplication object.
     * This represents the main Electron process.
     *
     * @type {import('@playwright/test').ElectronApplication|null}
     */
    this.electronApp = null;

    /**
     * Reference to the main BrowserWindow's Page object.
     * This is what we use to interact with the UI.
     *
     * @type {import('@playwright/test').Page|null}
     */
    this.mainWindow = null;

    /**
     * Flag to track if the app is currently running.
     * Used to prevent double-launch or double-close issues.
     *
     * @type {boolean}
     */
    this.isRunning = false;
  }

  /**
   * LAUNCH THE ELECTRON APP
   *
   * Starts the BubbleVoice Electron application in test mode.
   * Waits for the main window to be ready before returning.
   *
   * @param {Object} options - Launch options
   * @param {boolean} options.headless - Run in headless mode (default: false for Electron)
   * @param {Object} options.env - Additional environment variables
   * @returns {Promise<void>}
   *
   * TECHNICAL NOTES:
   * - Sets NODE_ENV=test to enable test-specific behavior in the app
   * - Uses the project root as the working directory
   * - Passes the main.js path as the entry point
   *
   * WHY NODE_ENV=test:
   * In test mode, the app can:
   * - Skip certain initializations (e.g., analytics)
   * - Expose test hooks via IPC
   * - Use test-specific configuration
   */
  async launch(options = {}) {
    // Prevent double-launch
    if (this.isRunning) {
      console.warn('[ElectronAppHelper] App is already running, skipping launch');
      return;
    }

    // Resolve paths relative to project root
    const projectRoot = path.resolve(__dirname, '../../..');
    const mainPath = path.join(projectRoot, 'src/electron/main.js');

    console.log('[ElectronAppHelper] Launching app from:', mainPath);

    try {
      /**
       * Launch the Electron app using Playwright's electron module
       *
       * IMPORTANT OPTIONS:
       * - args: Path to main.js (required)
       * - env: Environment variables for the app process
       * - timeout: How long to wait for app to launch
       *
       * BECAUSE: We pass the full environment plus test-specific vars to ensure
       * the app has access to API keys and other necessary configuration while
       * still knowing it's in test mode.
       */
      this.electronApp = await electron.launch({
        args: [mainPath],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_IS_DEV: '0', // Treat as production for cleaner test runs
          PORT: BACKEND_PORT.toString(),
          WEBSOCKET_PORT: WEBSOCKET_PORT.toString(),
          ...options.env
        },
        timeout: APP_LAUNCH_TIMEOUT,
      });

      console.log('[ElectronAppHelper] Electron app launched, waiting for first window...');

      /**
       * Wait for the first window to be created
       *
       * WHY: The main process creates a BrowserWindow in createMainWindow().
       * We need to wait for this to be ready before we can interact with the UI.
       *
       * TECHNICAL NOTE: firstWindow() returns a Page object (like browser pages)
       * that we use for all UI interactions.
       */
      this.mainWindow = await this.electronApp.firstWindow({
        timeout: WINDOW_READY_TIMEOUT
      });

      console.log('[ElectronAppHelper] Main window ready');

      /**
       * Wait for the window to be fully loaded
       *
       * BECAUSE: Even after firstWindow() returns, the page content might still
       * be loading. We wait for the 'load' event to ensure the DOM is ready.
       */
      await this.mainWindow.waitForLoadState('load');

      console.log('[ElectronAppHelper] Window content loaded');

      this.isRunning = true;

      /**
       * Set up event handlers for debugging
       *
       * WHY: Console logs from the renderer process help debug test failures.
       * Page crashes should fail tests immediately rather than hanging.
       */
      this.mainWindow.on('console', (msg) => {
        const type = msg.type();
        const text = msg.text();
        // Only log errors and warnings to keep output clean
        if (type === 'error' || type === 'warning') {
          console.log(`[Renderer ${type}] ${text}`);
        }
      });

      this.mainWindow.on('pageerror', (error) => {
        console.error('[Renderer Error]', error.message);
      });

      /**
       * WAIT FOR BACKEND SERVER TO BE READY
       *
       * WHY: The backend server (started by main.js via startBackendServer()) takes
       * 2-3 seconds to fully initialize. If we return from launch() too early, the
       * frontend will try to connect to WebSocket and get ERR_CONNECTION_REFUSED.
       *
       * BECAUSE: We previously saw test failures with WebSocket connection refused
       * errors. The root cause was that launch() returned as soon as the window
       * was ready, but the backend wasn't fully started yet.
       *
       * PRODUCT CONTEXT: This ensures tests can immediately interact with the app
       * without needing to add explicit waits in each test.
       *
       * TECHNICAL NOTE: We poll the /health endpoint on port 7482 until it responds.
       * The WebSocket server on port 7483 typically starts around the same time.
       */
      console.log('[ElectronAppHelper] Waiting for backend server to be ready...');
      const backendReady = await this.waitForBackendReady(15000); // 15 second timeout
      if (!backendReady) {
        console.warn('[ElectronAppHelper] Backend did not become ready, but continuing anyway');
        // Don't throw - let tests decide how to handle backend issues
      }

    } catch (error) {
      console.error('[ElectronAppHelper] Failed to launch app:', error.message);
      // Attempt cleanup on failed launch
      await this.close();
      throw error;
    }
  }

  /**
   * CLOSE THE ELECTRON APP
   *
   * Gracefully shuts down the Electron application and cleans up resources.
   * Should be called in afterEach() to prevent resource leaks.
   *
   * @returns {Promise<void>}
   *
   * TECHNICAL NOTES:
   * - Calls close() on the ElectronApplication object
   * - This sends SIGTERM to the main process
   * - The app's 'before-quit' handler will stop the backend server
   *
   * WHY CAREFUL CLEANUP:
   * Without proper cleanup:
   * - Backend server might keep running (port 7482 blocked)
   * - Zombie Electron processes consume memory
   * - Next test launch might fail with "port in use" errors
   */
  async close() {
    if (!this.isRunning && !this.electronApp) {
      console.log('[ElectronAppHelper] App not running, nothing to close');
      return;
    }

    console.log('[ElectronAppHelper] Closing app...');

    try {
      if (this.electronApp) {
        await this.electronApp.close();
        console.log('[ElectronAppHelper] App closed successfully');
      }
    } catch (error) {
      console.error('[ElectronAppHelper] Error closing app:', error.message);
      // Don't re-throw - cleanup should be best-effort
    } finally {
      // Reset state regardless of close success
      this.electronApp = null;
      this.mainWindow = null;
      this.isRunning = false;
    }
  }

  /**
   * GET THE MAIN WINDOW
   *
   * Returns the Page object for the main BrowserWindow.
   * This is the primary interface for UI testing.
   *
   * @returns {Promise<import('@playwright/test').Page>}
   * @throws {Error} If app is not running
   *
   * USAGE:
   * ```javascript
   * const window = await app.getMainWindow();
   * await window.click('.some-button');
   * await window.fill('#input', 'text');
   * ```
   */
  async getMainWindow() {
    if (!this.isRunning || !this.mainWindow) {
      throw new Error('App is not running. Call launch() first.');
    }
    return this.mainWindow;
  }

  /**
   * GET ALL WINDOWS
   *
   * Returns all currently open BrowserWindow Page objects.
   * Useful for testing scenarios that open multiple windows.
   *
   * @returns {Promise<import('@playwright/test').Page[]>}
   *
   * PRODUCT CONTEXT:
   * BubbleVoice might open additional windows for:
   * - Settings panel (if implemented as separate window)
   * - Artifact viewer (full-screen HTML artifacts)
   * - OAuth flows (authentication popups)
   */
  async getAllWindows() {
    if (!this.isRunning || !this.electronApp) {
      throw new Error('App is not running. Call launch() first.');
    }
    return await this.electronApp.windows();
  }

  /**
   * GET BACKEND CONFIGURATION
   *
   * Returns the backend server URLs for testing network interactions.
   *
   * @returns {Object} Configuration object with backendUrl and websocketUrl
   *
   * USAGE:
   * ```javascript
   * const config = app.getBackendConfig();
   * // config.backendUrl = 'http://localhost:7482'
   * // config.websocketUrl = 'ws://localhost:7483'
   * ```
   */
  getBackendConfig() {
    return {
      backendUrl: `http://localhost:${BACKEND_PORT}`,
      websocketUrl: `ws://localhost:${WEBSOCKET_PORT}`
    };
  }

  /**
   * RESET APP STATE
   *
   * Clears app state without restarting the entire app.
   * Useful for running multiple tests without full restart overhead.
   *
   * @returns {Promise<void>}
   *
   * TECHNICAL NOTES:
   * This sends an IPC message to the main process to clear state.
   * The app must have a handler for 'test:reset-state' in test mode.
   *
   * WHAT GETS RESET:
   * - Conversation history
   * - UI state (panels, modals)
   * - Settings (reset to defaults)
   *
   * WHY NOT RESTART:
   * Full restart takes 3-5 seconds. State reset takes <100ms.
   * For many tests, reset is sufficient and much faster.
   */
  async resetState() {
    if (!this.isRunning) {
      throw new Error('App is not running. Call launch() first.');
    }

    console.log('[ElectronAppHelper] Resetting app state...');

    try {
      // Evaluate in main process via Electron's evaluate API
      await this.electronApp.evaluate(async ({ ipcMain }) => {
        // Emit a reset event that the app can listen for
        ipcMain.emit('test:reset-state');
      });

      // Also clear renderer state by reloading the page
      // This is a fallback if IPC reset isn't fully implemented
      await this.mainWindow.reload();
      await this.mainWindow.waitForLoadState('load');

      console.log('[ElectronAppHelper] App state reset complete');
    } catch (error) {
      console.error('[ElectronAppHelper] Failed to reset state:', error.message);
      throw error;
    }
  }

  /**
   * WAIT FOR BACKEND READY
   *
   * Waits for the backend server to be fully operational by checking both
   * the HTTP health endpoint and the WebSocket port.
   *
   * @param {number} timeout - Max time to wait in ms (default: 10000)
   * @returns {Promise<boolean>} True if backend is ready
   *
   * TECHNICAL NOTES:
   * - Polls the backend /health endpoint on port 7482 until it responds
   * - Also checks that WebSocket port 7483 is listening
   * - The backend server takes 2-3 seconds to fully start
   *
   * WHY POLLING WITH NATIVE HTTP:
   * - We use Node.js http module instead of Playwright's request context
   *   because during app startup, the Playwright page might not be fully
   *   ready for API requests
   * - This is more reliable and doesn't depend on window state
   *
   * BECAUSE: Previous tests failed with ERR_CONNECTION_REFUSED because
   * the launch() method returned before the backend was ready. Now we
   * poll both the HTTP server and WebSocket port to ensure everything
   * is ready before tests run.
   */
  async waitForBackendReady(timeout = 10000) {
    const startTime = Date.now();
    const pollInterval = 300; // Check every 300ms for faster detection

    console.log('[ElectronAppHelper] Waiting for backend to be ready...');

    while (Date.now() - startTime < timeout) {
      try {
        // Check HTTP health endpoint using native Node.js http
        const httpReady = await this._checkHttpHealth();

        if (httpReady) {
          // Also verify WebSocket port is listening
          const wsReady = await this._checkPortOpen(WEBSOCKET_PORT);

          if (wsReady) {
            const elapsed = Date.now() - startTime;
            console.log(`[ElectronAppHelper] Backend is ready (took ${elapsed}ms)`);
            return true;
          } else {
            console.log('[ElectronAppHelper] HTTP ready but WebSocket port not yet open...');
          }
        }
      } catch (error) {
        // Ignore errors - backend might not be ready yet
        // This is expected during startup
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    const elapsed = Date.now() - startTime;
    console.error(`[ElectronAppHelper] Backend did not become ready after ${elapsed}ms`);
    return false;
  }

  /**
   * CHECK HTTP HEALTH ENDPOINT
   *
   * Makes a GET request to the backend /health endpoint using native Node.js http.
   *
   * @returns {Promise<boolean>} True if health endpoint responds with 200 OK
   *
   * TECHNICAL NOTES:
   * - Uses Node.js http module for reliability during startup
   * - Short timeout (2 seconds) to allow fast retry loop
   * - Returns false on any error (connection refused, timeout, etc.)
   *
   * WHY NATIVE HTTP:
   * Playwright's request context requires the window to be fully initialized.
   * During app startup, the window might exist but not be ready for API calls.
   * Native http module works independently of Playwright's state.
   */
  async _checkHttpHealth() {
    return new Promise((resolve) => {
      const req = http.get({
        hostname: 'localhost',
        port: BACKEND_PORT,
        path: '/health',
        timeout: 2000 // 2 second timeout
      }, (res) => {
        // Any successful response means the server is up
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * CHECK IF A PORT IS OPEN
   *
   * Attempts to connect to a port to verify it's listening.
   * Used to verify the WebSocket server is ready.
   *
   * @param {number} port - Port number to check
   * @returns {Promise<boolean>} True if port is open and accepting connections
   *
   * TECHNICAL NOTES:
   * - Uses Node.js net module to attempt TCP connection
   * - Closes connection immediately after successful connect
   * - Returns false if connection fails or times out
   *
   * WHY CHECK PORT SEPARATELY:
   * The WebSocket server (port 7483) is separate from the HTTP server (7482).
   * The HTTP health check only verifies the HTTP server is up. We also need
   * to verify the WebSocket port is listening to prevent ERR_CONNECTION_REFUSED
   * when the frontend tries to establish a WebSocket connection.
   */
  async _checkPortOpen(port) {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(1000); // 1 second timeout

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, 'localhost');
    });
  }

  /**
   * TAKE SCREENSHOT
   *
   * Captures a screenshot of the current window state.
   * Useful for debugging and visual regression testing.
   *
   * @param {string} name - Name for the screenshot file (without extension)
   * @returns {Promise<string>} Path to the saved screenshot
   *
   * TECHNICAL NOTES:
   * Screenshots are saved to tests/playwright/screenshots/
   * File names include timestamp to avoid overwriting.
   */
  async takeScreenshot(name = 'screenshot') {
    if (!this.mainWindow) {
      throw new Error('No window available for screenshot');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const screenshotPath = path.join(__dirname, '../screenshots', filename);

    await this.mainWindow.screenshot({ path: screenshotPath });
    console.log('[ElectronAppHelper] Screenshot saved:', screenshotPath);

    return screenshotPath;
  }

  /**
   * EVALUATE IN MAIN PROCESS
   *
   * Runs code in the Electron main process context.
   * Useful for testing IPC handlers and main process logic.
   *
   * @param {Function} fn - Function to execute in main process
   * @param {any} args - Arguments to pass to the function
   * @returns {Promise<any>} Return value from the function
   *
   * USAGE:
   * ```javascript
   * const appVersion = await app.evaluateMain(
   *   ({ app }) => app.getVersion()
   * );
   * ```
   *
   * WARNING:
   * This runs code with full Node.js privileges in the main process.
   * Only use for testing purposes, never in production code.
   */
  async evaluateMain(fn, ...args) {
    if (!this.electronApp) {
      throw new Error('App is not running. Call launch() first.');
    }
    return await this.electronApp.evaluate(fn, ...args);
  }
}

/**
 * MODULE EXPORTS
 *
 * Export the ElectronAppHelper class and port constants.
 * Tests import this module to create app instances.
 */
module.exports = {
  ElectronAppHelper,
  BACKEND_PORT,
  WEBSOCKET_PORT,
  APP_LAUNCH_TIMEOUT,
  WINDOW_READY_TIMEOUT
};
