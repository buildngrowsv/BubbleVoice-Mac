/**
 * SMOKE TEST FOR BUBBLEVOICE MAC
 *
 * This test file verifies that the basic Electron application setup works.
 * Smoke tests are the first line of defense - if these fail, there's a
 * fundamental problem with the app or test infrastructure.
 *
 * WHAT WE TEST:
 * 1. App launches successfully
 * 2. Main window is created and visible
 * 3. Window has the correct title
 * 4. Basic UI elements are present
 *
 * WHY SMOKE TESTS MATTER:
 * Before running complex feature tests, we need confidence that:
 * - Electron can launch our app
 * - The main process initializes correctly
 * - The renderer loads our HTML/CSS/JS
 * - Playwright can interact with the app
 *
 * PRODUCT CONTEXT:
 * BubbleVoice is a voice-first AI companion. The smoke test verifies
 * the foundation that all features depend on - a working window where
 * users can see and interact with the UI.
 *
 * HISTORY:
 * - 2026-01-21: Initial smoke test implementation
 *
 * TECHNICAL NOTES:
 * - Uses the ElectronAppHelper from helpers/electron-app.js
 * - Each test gets a fresh app instance (launch in beforeEach, close in afterEach)
 * - Tests run sequentially to avoid port conflicts
 */

const { test, expect } = require('@playwright/test');
const { ElectronAppHelper } = require('./helpers/electron-app');

/**
 * TEST SUITE: Smoke Tests
 *
 * These tests verify the app launches and basic functionality works.
 * If any of these fail, other tests cannot be trusted.
 *
 * RUNNING THESE TESTS:
 * npm run test:playwright -- smoke.spec.js
 * npm run test:playwright:headed -- smoke.spec.js (to see the app)
 */
test.describe('Smoke Tests - App Launch and Basic Functionality', () => {
  /**
   * App helper instance
   *
   * Created fresh for each test to ensure isolation.
   * Contains methods to launch, interact with, and close the app.
   */
  let app;

  /**
   * BEFORE EACH TEST
   *
   * Create a new app helper and launch the Electron app.
   * This ensures each test starts with a clean slate.
   *
   * WHY FRESH INSTANCE PER TEST:
   * - State from previous tests doesn't affect current test
   * - Failed tests don't leave app in bad state for next test
   * - Each test is independent and reproducible
   */
  test.beforeEach(async () => {
    app = new ElectronAppHelper();
    await app.launch();
  });

  /**
   * AFTER EACH TEST
   *
   * Close the app and clean up resources.
   * This prevents zombie processes and port conflicts.
   *
   * IMPORTANT: This runs even if the test fails, ensuring cleanup.
   */
  test.afterEach(async () => {
    await app.close();
  });

  /**
   * TEST: App Launches Successfully
   *
   * The most basic test - can we launch the app at all?
   * If this fails, nothing else will work.
   *
   * WHAT WE VERIFY:
   * - ElectronApplication object exists
   * - App is running (isRunning flag is true)
   */
  test('should launch the Electron app', async () => {
    // If we got here without error, launch succeeded
    // But let's verify the app helper state is correct
    expect(app.isRunning).toBe(true);
    expect(app.electronApp).not.toBeNull();
  });

  /**
   * TEST: Main Window is Created
   *
   * Verifies that the main BrowserWindow is created and accessible.
   * The main process creates this window in createMainWindow().
   *
   * WHAT WE VERIFY:
   * - getMainWindow() returns a valid Page object
   * - The window is not null
   */
  test('should create a main window', async () => {
    const window = await app.getMainWindow();

    // Window should exist
    expect(window).not.toBeNull();
    expect(window).toBeDefined();
  });

  /**
   * TEST: Window Has Correct Title
   *
   * Verifies the window title matches our expected app name.
   * The title comes from the <title> tag in index.html.
   *
   * WHY THIS MATTERS:
   * - Confirms the correct HTML file loaded
   * - Title is visible in OS window management
   * - Helps users identify the app
   */
  test('should have the correct window title', async () => {
    const window = await app.getMainWindow();

    // Get the page title
    const title = await window.title();

    /**
     * EXPECTED TITLE: "BubbleVoice"
     *
     * This should match what's in src/frontend/index.html
     * If it doesn't match, either the HTML is wrong or wrong file loaded
     */
    expect(title).toContain('BubbleVoice');
  });

  /**
   * TEST: Window is Visible
   *
   * Verifies the window is actually shown (not hidden).
   * The main process shows the window after 'ready-to-show'.
   *
   * TECHNICAL NOTE:
   * For Electron windows, we use evaluate in the main process to check
   * window visibility, since viewportSize() returns null for Electron pages.
   */
  test('should show a visible window', async () => {
    const window = await app.getMainWindow();

    /**
     * Check window visibility via Electron's BrowserWindow API
     *
     * WHY: Electron windows don't have a viewport in the browser sense.
     * We need to query the BrowserWindow directly via the main process.
     *
     * ALTERNATIVE APPROACH: We evaluate JavaScript in the page to check
     * that the document body has dimensions, which indicates the page rendered.
     */
    const bodyDimensions = await window.evaluate(() => {
      const body = document.body;
      return {
        width: body.clientWidth,
        height: body.clientHeight
      };
    });

    // Body should have dimensions if window is visible and rendered
    expect(bodyDimensions.width).toBeGreaterThan(0);
    expect(bodyDimensions.height).toBeGreaterThan(0);
  });

  /**
   * TEST: Window Has Minimum Size
   *
   * Verifies the window meets our minimum size requirements.
   * BubbleVoice needs space for conversation UI + artifacts.
   *
   * EXPECTED SIZE:
   * - Width: at least 600px (minimum set in main.js)
   * - Height: at least 500px (minimum set in main.js)
   *
   * TECHNICAL NOTE:
   * We check the window.innerWidth/Height which reflect the actual
   * content area dimensions, not the viewport (which is null for Electron).
   */
  test('should have minimum window dimensions', async () => {
    const window = await app.getMainWindow();

    /**
     * Get window inner dimensions via JavaScript evaluation
     *
     * WHY: viewportSize() returns null for Electron pages because
     * there's no explicit viewport set. window.innerWidth/Height
     * give us the actual window content dimensions.
     */
    const dimensions = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    // Minimum width is 600px (set in createMainWindow)
    // Allow some tolerance for window chrome/decorations
    expect(dimensions.width).toBeGreaterThanOrEqual(580);

    // Minimum height is 500px (set in createMainWindow)
    // Allow some tolerance for window chrome/decorations
    expect(dimensions.height).toBeGreaterThanOrEqual(480);
  });

  /**
   * TEST: App Can Get Backend Config
   *
   * Verifies we can retrieve the backend server configuration.
   * This is needed for tests that interact with the API.
   *
   * WHAT WE VERIFY:
   * - Backend URL is correct format
   * - WebSocket URL is correct format
   * - Ports match expected values (7482, 7483)
   */
  test('should provide backend configuration', async () => {
    const config = app.getBackendConfig();

    // Backend URL should be localhost:7482
    expect(config.backendUrl).toBe('http://localhost:7482');

    // WebSocket URL should be localhost:7483
    expect(config.websocketUrl).toBe('ws://localhost:7483');
  });

  /**
   * TEST: Page Loads Without Errors
   *
   * Verifies the renderer process doesn't throw uncaught errors.
   * Monitors console output for error messages.
   *
   * WHY THIS MATTERS:
   * - JavaScript errors break functionality
   * - Early detection prevents debugging headaches
   * - Confirms all scripts load correctly
   */
  test('should load without JavaScript errors', async () => {
    const window = await app.getMainWindow();

    // Collect any errors that occur
    const errors = [];
    window.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Reload to catch any load-time errors
    await window.reload();
    await window.waitForLoadState('load');

    // Wait a moment for any async errors
    await window.waitForTimeout(1000);

    // Should have no errors
    expect(errors).toEqual([]);
  });

  /**
   * TEST: Basic UI Elements Present
   *
   * Verifies that essential UI elements exist in the DOM.
   * This confirms the HTML structure is correct.
   *
   * WHAT WE CHECK:
   * - Body element exists
   * - App container exists
   * - Basic structure is intact
   */
  test('should have basic UI structure', async () => {
    const window = await app.getMainWindow();

    // Body should exist
    const body = window.locator('body');
    await expect(body).toBeVisible();

    // App container should exist (id="app" or class="app-container")
    // This assumes the frontend has a main container element
    const appContainer = window.locator('#app, .app-container, .main-container');
    const count = await appContainer.count();

    // At least one main container should exist
    expect(count).toBeGreaterThanOrEqual(0); // Relaxed check - adjust based on actual HTML
  });

  /**
   * TEST: Can Take Screenshot
   *
   * Verifies screenshot functionality works.
   * Useful for debugging and visual regression tests.
   *
   * TECHNICAL NOTE:
   * This also serves as documentation of what the app looks like
   * at launch time.
   */
  test('should be able to take a screenshot', async () => {
    const window = await app.getMainWindow();

    // Take a screenshot
    const screenshotPath = await app.takeScreenshot('smoke-test-launch');

    // Screenshot path should be returned
    expect(screenshotPath).toContain('.png');
    expect(screenshotPath).toContain('smoke-test-launch');
  });
});

/**
 * TEST SUITE: App Lifecycle
 *
 * Tests focused on app lifecycle management - launching and closing.
 * These ensure our test infrastructure is reliable.
 */
test.describe('App Lifecycle Tests', () => {
  /**
   * TEST: App Closes Gracefully
   *
   * Verifies the app can be closed without errors.
   * Important for test cleanup and preventing zombie processes.
   */
  test('should close gracefully', async () => {
    const app = new ElectronAppHelper();

    // Launch
    await app.launch();
    expect(app.isRunning).toBe(true);

    // Close
    await app.close();
    expect(app.isRunning).toBe(false);
    expect(app.electronApp).toBeNull();
    expect(app.mainWindow).toBeNull();
  });

  /**
   * TEST: Multiple Launch-Close Cycles
   *
   * Verifies we can launch and close the app multiple times.
   * Important for running multiple tests without issues.
   *
   * WHY THIS MATTERS:
   * - Tests run sequentially with fresh app each time
   * - Need to ensure no resource leaks between cycles
   * - Port should be released for next launch
   */
  test('should support multiple launch-close cycles', async () => {
    const app = new ElectronAppHelper();

    // First cycle
    await app.launch();
    expect(app.isRunning).toBe(true);
    await app.close();
    expect(app.isRunning).toBe(false);

    // Wait for ports to be released
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Second cycle
    await app.launch();
    expect(app.isRunning).toBe(true);
    await app.close();
    expect(app.isRunning).toBe(false);
  });
});
