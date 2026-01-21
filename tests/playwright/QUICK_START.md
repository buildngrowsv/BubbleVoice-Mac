# Playwright Testing - Quick Start Guide

## 🚀 Running Tests

### Run All Tests (Recommended)
```bash
npm run test:playwright
```
Expected: ~3.5 minutes, 121/123 tests passing

### Run Specific Test Suite
```bash
# Smoke tests only (11 tests, ~20 seconds)
npm run test:playwright -- smoke.spec.js

# UI tests only (42 tests, ~1.5 minutes)
npm run test:playwright -- ui.spec.js

# IPC tests only (34 tests, ~1 minute)
npm run test:playwright -- ipc.spec.js

# Integration tests only (36 tests, ~1 minute)
npm run test:playwright -- integration.spec.js
```

### Run with Visible Window (For Debugging)
```bash
npm run test:playwright:headed
```
This shows the Electron app window during tests - great for debugging!

### Debug Mode (Step Through Tests)
```bash
npm run test:playwright:debug
```
Opens Playwright Inspector to step through tests line by line.

### Interactive UI Mode (Best for Development)
```bash
npm run test:playwright:ui
```
Opens interactive UI to run/debug tests visually.

### View Test Report
```bash
npm run test:playwright:report
```
Opens HTML report with screenshots, videos, and traces.

---

## 📝 Writing New Tests

### 1. Create Test File
```javascript
// tests/playwright/my-feature.spec.js
const { test, expect } = require('@playwright/test');
const { ElectronAppHelper } = require('./helpers/electron-app');

test.describe('My Feature Tests', () => {
  let app;

  test.beforeEach(async () => {
    app = new ElectronAppHelper();
    await app.launch();
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('should do something', async () => {
    const window = app.getWindow();
    
    // Use data-testid selectors
    const button = window.locator('[data-testid="my-button"]');
    await button.click();
    
    // Make assertions
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  });
});
```

### 2. Use Data-testid Selectors
See `TEST_IDS.md` for all available test IDs.

```javascript
// Good: Use data-testid
window.locator('[data-testid="voice-button"]')

// Bad: Use CSS classes (they can change)
window.locator('.voice-btn')
```

### 3. Add Comments
Explain what the test does, why it matters, and any technical details:

```javascript
/**
 * TEST: Voice button should activate recording
 * 
 * WHAT: Clicks voice button and verifies recording starts
 * WHY: Core feature - users need to start voice input
 * HOW: Click button, check aria-pressed, verify visualization
 */
test('voice button should activate recording', async () => {
  // Implementation...
});
```

---

## 🔍 Common Patterns

### Get Window
```javascript
const window = app.getWindow();
```

### Click Element
```javascript
await window.locator('[data-testid="voice-button"]').click();
```

### Type Text
```javascript
await window.locator('[data-testid="message-input"]').fill('Hello');
```

### Check Visibility
```javascript
await expect(window.locator('[data-testid="settings-panel"]')).toBeVisible();
```

### Check Text Content
```javascript
await expect(window.locator('[data-testid="status-text"]')).toHaveText('Ready');
```

### Take Screenshot
```javascript
await app.screenshot('my-feature-state');
```

### Access Main Process
```javascript
const result = await app.evaluateMain(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  return win.isMinimized();
});
```

### Access Renderer Process
```javascript
const config = await window.evaluate(async () => {
  return await window.electronAPI.getBackendConfig();
});
```

---

## 🐛 Debugging Tips

### 1. Run in Headed Mode
```bash
npm run test:playwright:headed
```
See the app window during tests.

### 2. Use Debug Mode
```bash
npm run test:playwright:debug
```
Step through tests line by line.

### 3. Add Pauses
```javascript
await window.pause(); // Pauses test execution
```

### 4. Take Screenshots
```javascript
await app.screenshot('debug-state');
```

### 5. Check Console Logs
Test output shows renderer errors and warnings.

### 6. View HTML Report
```bash
npm run test:playwright:report
```
See screenshots, videos, and traces for failed tests.

---

## ⚠️ Known Issues

### 1. Window Minimize Test Fails on macOS
**Issue**: `isMinimized()` returns false  
**Workaround**: Use `isVisible()` instead  
**Impact**: Low - minimize works in practice

### 2. Scroll Overflow Test Flaky
**Issue**: Protocol error with dialog  
**Workaround**: Add dialog handler  
**Impact**: Low - scrolling works in practice

---

## 📊 Test Statistics

- **Total Tests**: 123
- **Pass Rate**: 98.4% (121/123)
- **Execution Time**: ~3.5 minutes
- **Test Suites**: 4 (smoke, ui, ipc, integration)
- **Lines of Code**: ~4,500 lines
- **Test IDs**: 68 unique data-testid attributes

---

## 🔗 Related Documentation

- [PLAYWRIGHT_SETUP_COMPLETE.md](./PLAYWRIGHT_SETUP_COMPLETE.md) - Full setup documentation
- [TEST_IDS.md](./TEST_IDS.md) - All available test IDs
- [TEST_ARCHITECTURE.md](./TEST_ARCHITECTURE.md) - Testing architecture
- [Playwright Docs](https://playwright.dev/) - Official documentation

---

## 💡 Tips

1. **Run smoke tests first** - If they fail, other tests won't work
2. **Use data-testid selectors** - They're more stable than CSS classes
3. **Add comments** - Explain what, why, and how
4. **Keep tests independent** - Each test should work in isolation
5. **Clean up resources** - Always close the app in afterEach
6. **Use descriptive names** - Test names should explain what they verify
7. **Take screenshots** - Visual debugging is powerful
8. **Check HTML report** - It shows exactly what went wrong

---

**Quick Help**: Run `npm run test:playwright:ui` for interactive testing!
