# UI Testing Best Practices for Electron Apps

## Overview

This document outlines best practices for testing Electron applications, specifically for BubbleVoice Mac. These practices are based on 2026 industry standards and address the unique challenges of testing desktop applications.

## Tool Selection

### Recommended: Playwright for Electron

**Why Playwright?**
- Official Electron support via `_electron.launch()`
- Access to both main and renderer processes
- Can test IPC communication
- Screenshot and video recording on failure
- Cross-platform support (macOS, Windows, Linux)
- Active development and good documentation

**Deprecated: Spectron**
- Built on ChromeDriver and WebDriverIO
- Deprecated since Electron v14 (remote module removed)
- No longer maintained
- Should not be used for new projects

### Alternative: WebdriverIO with Electron Service

**Pros:**
- Mature ecosystem
- Good for teams already using WebdriverIO
- Supports Electron-specific features

**Cons:**
- More complex setup than Playwright
- Requires additional configuration

## Test Structure

### 1. Test Pyramid

```
        /\
       /  \      E2E UI Tests (Few)
      /____\     - Critical user flows
     /      \    - Cross-window interactions
    /________\   Integration Tests (Some)
   /          \  - Component + service
  /____________\ Unit Tests (Many)
                 - Logic, utilities, state
```

### 2. Test Types for Electron Apps

#### Unit Tests
- Pure logic (no UI)
- State management
- Utility functions
- Service classes
- Fast, run frequently

#### Integration Tests
- Multiple components working together
- IPC communication (main ↔ renderer)
- Backend API integration
- WebSocket connections
- Medium speed, run on commit

#### UI/E2E Tests
- Full application launch
- User flows (login, settings, voice interaction)
- Window management
- Native dialogs
- Slow, run on PR/deploy

#### Hybrid Tests (Recommended for BubbleVoice)
- Combine UI interaction with functional verification
- Test both visual appearance AND behavior
- Verify UI state matches internal state
- Check for visual regressions
- Medium-slow speed, run on PR

## Best Practices

### 1. Stable Locators

**Good:**
```javascript
// Use test IDs
await page.locator('[data-testid="voice-button"]').click();

// Use semantic selectors
await page.locator('button[aria-label="Start voice input"]').click();

// Use IDs
await page.locator('#conversation-area').scrollIntoView();
```

**Bad:**
```javascript
// Brittle class selectors
await page.locator('.btn.btn-primary.voice-btn-active').click();

// Deep nesting
await page.locator('div > div > div > button:nth-child(3)').click();

// Text content (breaks with i18n)
await page.locator('text=Click here').click();
```

### 2. Synchronization

**Good:**
```javascript
// Wait for specific condition
await page.waitForSelector('.voice-button', { state: 'visible' });

// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for function to return true
await page.waitForFunction(() => window.appReady === true);
```

**Bad:**
```javascript
// Arbitrary delays
await page.waitForTimeout(5000); // Flaky!

// No waiting
await page.click('.button'); // May not be ready
```

### 3. Test Independence

**Good:**
```javascript
test('user can send message', async () => {
  // Setup: Create fresh state
  await app.evaluate(({ app }) => {
    app.clearConversation();
  });
  
  // Test: Perform action
  await page.fill('[data-testid="message-input"]', 'Hello');
  await page.click('[data-testid="send-button"]');
  
  // Assert: Verify result
  await expect(page.locator('.message')).toHaveText('Hello');
  
  // Cleanup: Not needed, next test creates fresh state
});
```

**Bad:**
```javascript
// Test 1 creates data that Test 2 depends on
test('create user', async () => {
  // Creates user...
});

test('user can login', async () => {
  // Assumes user from previous test exists
});
```

### 4. Electron-Specific Testing

#### Testing Main Process

```javascript
const { _electron: electron } = require('playwright');

test('app launches correctly', async () => {
  const app = await electron.launch({
    args: ['path/to/main.js']
  });
  
  // Access main process
  const appPath = await app.evaluate(async ({ app }) => {
    return app.getAppPath();
  });
  
  // Get first window
  const window = await app.firstWindow();
  
  // Test window properties
  const title = await window.title();
  expect(title).toBe('BubbleVoice');
  
  await app.close();
});
```

#### Testing IPC Communication

```javascript
test('IPC message sent correctly', async () => {
  const app = await electron.launch({ args: ['main.js'] });
  const window = await app.firstWindow();
  
  // Listen for IPC messages from main process
  const ipcMessage = await window.evaluate(() => {
    return new Promise(resolve => {
      window.electronAPI.onMessage((event, message) => {
        resolve(message);
      });
    });
  });
  
  // Trigger action that sends IPC
  await window.click('[data-testid="sync-button"]');
  
  // Verify IPC message
  expect(ipcMessage.type).toBe('sync-complete');
});
```

#### Testing Native Dialogs

```javascript
test('save dialog works', async () => {
  const app = await electron.launch({ args: ['main.js'] });
  const window = await app.firstWindow();
  
  // Mock dialog
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({
      filePath: '/tmp/test-file.txt',
      canceled: false
    });
  });
  
  await window.click('[data-testid="save-button"]');
  
  // Verify file was saved
  // ...
});
```

### 5. Visual Regression Testing

```javascript
test('voice button has correct appearance', async () => {
  const app = await electron.launch({ args: ['main.js'] });
  const window = await app.firstWindow();
  
  // Take screenshot of specific element
  const button = await window.locator('[data-testid="voice-button"]');
  await button.screenshot({ path: 'voice-button.png' });
  
  // Compare to baseline (using external tool)
  const diff = await compareImages('voice-button.png', 'baseline/voice-button.png');
  expect(diff.percentage).toBeLessThan(0.1); // < 0.1% difference
});
```

### 6. Error Handling and Debugging

```javascript
test('captures failure details', async () => {
  const app = await electron.launch({ args: ['main.js'] });
  const window = await app.firstWindow();
  
  try {
    // Test code...
    await window.click('[data-testid="missing-button"]');
  } catch (error) {
    // Capture screenshot on failure
    await window.screenshot({ 
      path: `failure-${Date.now()}.png`,
      fullPage: true 
    });
    
    // Capture console logs
    const logs = await window.evaluate(() => {
      return window.testLogs || [];
    });
    
    // Capture DOM state
    const html = await window.content();
    
    // Save failure report
    fs.writeFileSync('failure-report.json', JSON.stringify({
      error: error.message,
      screenshot: `failure-${Date.now()}.png`,
      logs,
      html: html.substring(0, 1000)
    }));
    
    throw error;
  }
});
```

### 7. Performance Considerations

```javascript
// Reuse app instance for multiple tests
let app, window;

beforeAll(async () => {
  app = await electron.launch({ args: ['main.js'] });
  window = await app.firstWindow();
});

afterAll(async () => {
  await app.close();
});

test('test 1', async () => {
  // Reset state instead of relaunching
  await window.evaluate(() => window.resetApp());
  // Test...
});

test('test 2', async () => {
  await window.evaluate(() => window.resetApp());
  // Test...
});
```

## BubbleVoice-Specific Recommendations

### 1. Test Critical Voice Pipeline

```javascript
test('voice input flow works end-to-end', async () => {
  // 1. Click voice button
  await window.click('[data-testid="voice-button"]');
  
  // 2. Verify UI shows "listening" state
  await expect(window.locator('[data-testid="voice-status"]'))
    .toHaveText('Listening...');
  
  // 3. Simulate voice input (mock)
  await window.evaluate(() => {
    window.simulateVoiceInput('Hello, how are you?');
  });
  
  // 4. Verify transcription appears
  await expect(window.locator('[data-testid="transcription"]'))
    .toHaveText('Hello, how are you?');
  
  // 5. Verify message sent to backend
  const messageSent = await window.evaluate(() => {
    return window.lastWebSocketMessage;
  });
  expect(messageSent.type).toBe('user_message');
  
  // 6. Mock AI response
  await window.evaluate(() => {
    window.simulateAIResponse('I\'m doing well, thanks!');
  });
  
  // 7. Verify response displayed
  await expect(window.locator('[data-testid="ai-response"]'))
    .toContainText('I\'m doing well');
});
```

### 2. Test Liquid Glass UI

```javascript
test('liquid glass effect renders correctly', async () => {
  const window = await app.firstWindow();
  
  // Check vibrancy is applied
  const hasVibrancy = await window.evaluate(() => {
    const style = window.getComputedStyle(document.body);
    return style.backdropFilter !== 'none' || 
           style.webkitBackdropFilter !== 'none';
  });
  
  expect(hasVibrancy).toBe(true);
  
  // Take screenshot for visual regression
  await window.screenshot({ path: 'liquid-glass-ui.png' });
});
```

### 3. Test Interruption System

```javascript
test('user can interrupt AI response', async () => {
  // Start AI response
  await window.evaluate(() => {
    window.simulateAIStreamingResponse('This is a very long response...');
  });
  
  // Wait for response to start
  await window.waitForSelector('[data-testid="ai-speaking"]');
  
  // Interrupt
  await window.click('[data-testid="interrupt-button"]');
  
  // Verify interruption
  await expect(window.locator('[data-testid="voice-status"]'))
    .toHaveText('Idle');
  
  // Verify backend received interrupt
  const interruptSent = await window.evaluate(() => {
    return window.lastWebSocketMessage?.type === 'interrupt';
  });
  expect(interruptSent).toBe(true);
});
```

### 4. Test Conversation Memory

```javascript
test('conversation context is maintained', async () => {
  // Send first message
  await window.fill('[data-testid="message-input"]', 'My name is Alice');
  await window.click('[data-testid="send-button"]');
  
  // Wait for response
  await window.waitForSelector('[data-testid="ai-response"]');
  
  // Send follow-up
  await window.fill('[data-testid="message-input"]', 'What is my name?');
  await window.click('[data-testid="send-button"]');
  
  // Verify context maintained
  const response = await window.locator('[data-testid="ai-response"]').last();
  await expect(response).toContainText('Alice');
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: UI Tests

on: [push, pull_request]

jobs:
  ui-tests:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install
      
      - name: Run UI tests
        run: npm run test:ui
        env:
          CI: true
      
      - name: Upload screenshots on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots-${{ matrix.os }}
          path: tests/screenshots/
      
      - name: Upload failure reports
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: failure-reports-${{ matrix.os }}
          path: tests/ui-test-failures.json
```

## Common Pitfalls

### 1. Testing in Development vs Production

**Problem:** Tests pass in dev but fail in packaged app

**Solution:**
```javascript
// Test both modes
test.describe('Production mode', () => {
  test.use({ 
    launchOptions: { 
      executablePath: 'dist/BubbleVoice.app/Contents/MacOS/BubbleVoice' 
    } 
  });
  
  test('app works in production', async () => {
    // Tests...
  });
});
```

### 2. Timing Issues

**Problem:** Tests fail intermittently due to timing

**Solution:**
- Always use explicit waits
- Increase timeout for slow operations
- Use retry logic for flaky assertions

### 3. State Pollution

**Problem:** Tests affect each other

**Solution:**
- Reset state between tests
- Use fresh app instance or clear data
- Don't rely on test execution order

### 4. Platform Differences

**Problem:** Tests pass on macOS but fail on Windows

**Solution:**
- Test on all target platforms
- Use platform-agnostic paths
- Handle platform-specific UI differences

## Maintenance

### Regular Tasks

1. **Update Baselines** - When UI intentionally changes
2. **Review Flaky Tests** - Fix or remove unreliable tests
3. **Update Selectors** - When DOM structure changes
4. **Prune Obsolete Tests** - Remove tests for removed features
5. **Monitor Test Duration** - Keep suite fast

### Metrics to Track

- Test pass rate
- Test duration
- Flakiness rate (same test fails/passes without code changes)
- Coverage of critical flows
- Time to debug failures

## Resources

- [Playwright Electron Docs](https://playwright.dev/docs/api/class-electron)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [UI Testing Best Practices](https://github.com/NoriSte/ui-testing-best-practices)

## Summary

For BubbleVoice Mac, prioritize:

1. **Hybrid tests** that verify both UI and functionality
2. **Critical path testing** (voice input, AI response, interruption)
3. **Visual regression** for Liquid Glass UI
4. **Cross-platform testing** (at least macOS + one other)
5. **Detailed failure reporting** with screenshots and logs
6. **Fast feedback** through test parallelization and smart test selection

Start with a small set of high-value tests and expand coverage over time. Focus on tests that catch real bugs, not tests that exist just for coverage metrics.
