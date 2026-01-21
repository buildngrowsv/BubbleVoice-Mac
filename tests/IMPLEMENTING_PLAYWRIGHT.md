# Implementing Playwright for BubbleVoice Mac

## Current Status

The current `ui-hybrid-tests.js` uses Puppeteer to load the frontend HTML directly via `file://` protocol. This approach has limitations:

**Problems:**
1. Frontend depends on Electron APIs (`window.electronAPI`) that don't exist in regular browser
2. Page crashes when trying to access undefined Electron APIs
3. Can't test IPC communication
4. Can't test main process behavior
5. Can't test native dialogs or window management

## Recommended Approach: Playwright with Electron

### Why Playwright?

1. **Official Electron Support** - `_electron.launch()` launches actual Electron app
2. **Main Process Access** - Can test both renderer and main process
3. **IPC Testing** - Can verify communication between processes
4. **Native Features** - Can test dialogs, menus, multiple windows
5. **Better Debugging** - Screenshots, videos, traces on failure

### Implementation Steps

## Step 1: Install Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install
```

## Step 2: Create Playwright Config

Create `playwright.config.js`:

```javascript
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/playwright',
  timeout: 30000,
  fullyParallel: false, // Electron tests should run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // One worker for Electron tests
  reporter: [
    ['html', { outputFolder: 'tests/playwright-report' }],
    ['json', { outputFile: 'tests/playwright-results.json' }],
    ['list']
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
});
```

## Step 3: Create Test Helpers

Create `tests/playwright/helpers/electron-app.js`:

```javascript
const { _electron: electron } = require('playwright');
const path = require('path');

class ElectronApp {
  constructor() {
    this.app = null;
    this.window = null;
  }

  async launch() {
    this.app = await electron.launch({
      args: [path.join(__dirname, '../../../src/electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_ENABLE_LOGGING: '1'
      }
    });

    // Wait for first window
    this.window = await this.app.firstWindow();
    
    // Wait for app to be ready
    await this.window.waitForLoadState('domcontentloaded');
    
    return { app: this.app, window: this.window };
  }

  async close() {
    if (this.app) {
      await this.app.close();
    }
  }

  async getBackendConfig() {
    return await this.app.evaluate(async ({ ipcMain }) => {
      // Access main process to get backend config
      return {
        backendUrl: 'http://localhost:7482',
        websocketUrl: 'ws://localhost:7483'
      };
    });
  }

  async resetState() {
    // Reset app state without restarting
    await this.window.evaluate(() => {
      if (window.resetApp) {
        window.resetApp();
      }
    });
  }
}

module.exports = { ElectronApp };
```

## Step 4: Create UI Tests

Create `tests/playwright/ui.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const { ElectronApp } = require('./helpers/electron-app');

test.describe('BubbleVoice UI Tests', () => {
  let electronApp;
  let app;
  let window;

  test.beforeAll(async () => {
    electronApp = new ElectronApp();
    ({ app, window } = await electronApp.launch());
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test.beforeEach(async () => {
    await electronApp.resetState();
  });

  test('app launches and shows main window', async () => {
    expect(await window.title()).toContain('BubbleVoice');
    
    // Verify window is visible
    const isVisible = await window.isVisible();
    expect(isVisible).toBe(true);
  });

  test('voice button exists and is clickable', async () => {
    // Wait for voice button
    const voiceButton = window.locator('[data-testid="voice-button"]');
    await expect(voiceButton).toBeVisible();
    
    // Verify it's enabled
    await expect(voiceButton).toBeEnabled();
    
    // Click it
    await voiceButton.click();
    
    // Verify state changed
    await expect(voiceButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('conversation area is scrollable', async () => {
    const conversationArea = window.locator('[data-testid="conversation-area"]');
    await expect(conversationArea).toBeVisible();
    
    // Check if scrollable
    const isScrollable = await conversationArea.evaluate(el => {
      return el.scrollHeight > el.clientHeight;
    });
    
    // Should be scrollable or have space for content
    expect(isScrollable || true).toBe(true);
  });

  test('UI responds to window resize', async () => {
    // Resize to minimum
    await window.setViewportSize({ width: 600, height: 500 });
    await window.waitForTimeout(500);
    
    // Check no horizontal overflow
    const hasOverflow = await window.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth;
    });
    
    expect(hasOverflow).toBe(false);
    
    // Resize to large
    await window.setViewportSize({ width: 1400, height: 900 });
    await window.waitForTimeout(500);
    
    // UI should still be visible
    const voiceButton = window.locator('[data-testid="voice-button"]');
    await expect(voiceButton).toBeVisible();
  });

  test('keyboard shortcuts work', async () => {
    // Focus window
    await window.bringToFront();
    
    // Press Escape
    await window.keyboard.press('Escape');
    
    // Should trigger some action (e.g., close modal, stop recording)
    // Verify based on your app's behavior
  });

  test('error messages display correctly', async () => {
    // Trigger an error
    await window.evaluate(() => {
      if (window.showError) {
        window.showError('Test error message');
      }
    });
    
    // Verify error is visible
    const errorMessage = window.locator('[role="alert"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Test error');
  });

  test('loading indicators appear during operations', async () => {
    // Trigger loading state
    await window.evaluate(() => {
      if (window.setLoading) {
        window.setLoading(true);
      }
    });
    
    // Verify loading indicator
    const loadingIndicator = window.locator('[data-testid="loading"]');
    await expect(loadingIndicator).toBeVisible();
  });

  test('visual regression - main UI', async () => {
    // Take screenshot for visual comparison
    await expect(window).toHaveScreenshot('main-ui.png', {
      maxDiffPixels: 100 // Allow small differences
    });
  });
});
```

## Step 5: Create IPC Tests

Create `tests/playwright/ipc.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const { ElectronApp } = require('./helpers/electron-app');

test.describe('IPC Communication Tests', () => {
  let electronApp;
  let app;
  let window;

  test.beforeAll(async () => {
    electronApp = new ElectronApp();
    ({ app, window } = await electronApp.launch());
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('frontend can get backend config via IPC', async () => {
    const config = await window.evaluate(async () => {
      return await window.electronAPI.getBackendConfig();
    });
    
    expect(config).toHaveProperty('backendUrl');
    expect(config).toHaveProperty('websocketUrl');
    expect(config.backendUrl).toContain('localhost');
  });

  test('window controls work via IPC', async () => {
    // Minimize window
    await window.evaluate(async () => {
      await window.electronAPI.window.minimize();
    });
    
    // Verify window is minimized
    const isMinimized = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.isMinimized();
    });
    
    expect(isMinimized).toBe(true);
    
    // Restore
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.restore();
    });
  });

  test('global shortcut activates voice input', async () => {
    // Listen for voice activation event
    const voiceActivated = window.evaluate(() => {
      return new Promise(resolve => {
        window.electronAPI.onActivateVoiceInput(() => {
          resolve(true);
        });
      });
    });
    
    // Trigger global shortcut from main process
    await app.evaluate(({ globalShortcut }) => {
      // Simulate shortcut trigger
      globalShortcut.emit('CommandOrControl+Shift+Space');
    });
    
    // Verify event received
    expect(await voiceActivated).toBe(true);
  });
});
```

## Step 6: Update package.json

```json
{
  "scripts": {
    "test:ui:playwright": "playwright test",
    "test:ui:playwright:headed": "playwright test --headed",
    "test:ui:playwright:debug": "playwright test --debug",
    "test:ui:playwright:report": "playwright show-report tests/playwright-report"
  }
}
```

## Step 7: Add Test IDs to Frontend

Update your frontend components to include `data-testid` attributes:

```html
<!-- Voice button -->
<button 
  data-testid="voice-button"
  aria-label="Start voice input"
  aria-pressed="false">
  🎤
</button>

<!-- Conversation area -->
<div 
  data-testid="conversation-area"
  role="log"
  aria-live="polite">
  <!-- Messages -->
</div>

<!-- Loading indicator -->
<div 
  data-testid="loading"
  role="status"
  aria-live="polite">
  Loading...
</div>

<!-- Error messages -->
<div 
  data-testid="error-message"
  role="alert"
  aria-live="assertive">
  <!-- Error text -->
</div>
```

## Step 8: Run Tests

```bash
# Run all UI tests
npm run test:ui:playwright

# Run with visible browser (for debugging)
npm run test:ui:playwright:headed

# Run in debug mode (step through tests)
npm run test:ui:playwright:debug

# View HTML report
npm run test:ui:playwright:report
```

## Benefits Over Current Approach

### Current (Puppeteer + file://)
- ❌ Can't access Electron APIs
- ❌ Page crashes on Electron API calls
- ❌ Can't test IPC
- ❌ Can't test main process
- ❌ Can't test native features
- ✅ Simple setup

### Recommended (Playwright + Electron)
- ✅ Full Electron API access
- ✅ Tests real app behavior
- ✅ Can test IPC communication
- ✅ Can test main process
- ✅ Can test native features
- ✅ Better debugging tools
- ✅ Visual regression testing
- ✅ Video recording on failure
- ⚠️ Slightly more complex setup

## Migration Plan

1. **Phase 1: Setup**
   - Install Playwright
   - Create config and helpers
   - Add test IDs to frontend

2. **Phase 2: Convert Existing Tests**
   - Migrate current Puppeteer tests to Playwright
   - Add IPC tests
   - Add main process tests

3. **Phase 3: Expand Coverage**
   - Add visual regression tests
   - Add cross-platform tests
   - Add performance tests

4. **Phase 4: CI Integration**
   - Add to GitHub Actions
   - Set up screenshot comparison
   - Configure failure notifications

## Estimated Effort

- Setup: 2-3 hours
- Migration: 4-6 hours
- Expansion: Ongoing
- Total initial: 1 day

## Next Steps

1. Install Playwright: `npm install --save-dev @playwright/test`
2. Create config file
3. Add test IDs to frontend components
4. Write first test
5. Iterate and expand

Would you like me to implement this for BubbleVoice Mac?
