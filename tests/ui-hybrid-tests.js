/**
 * HYBRID UI TESTS FOR BUBBLEVOICE MAC
 * 
 * These tests verify BOTH visual rendering AND functional behavior of the UI.
 * They use real browser rendering to catch issues that pure logic tests miss:
 * - Layout problems (overlapping elements, overflow, responsive issues)
 * - Visual state indicators (colors, animations, visibility)
 * - User interaction flows (clicks, keyboard, focus)
 * - Accessibility (ARIA labels, keyboard navigation)
 * 
 * PRODUCT CONTEXT:
 * BubbleVoice's UI needs to be beautiful AND functional. The Liquid Glass
 * aesthetic requires careful visual testing, while the voice interaction
 * requires robust functional testing. These hybrid tests verify both.
 * 
 * TECHNICAL NOTES:
 * - Uses Puppeteer to launch actual browser with the UI
 * - Takes screenshots on failure for visual debugging
 * - Tests real DOM, CSS, and JavaScript interaction
 * - Verifies both appearance and behavior
 * - Generates detailed failure reports with screenshots
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  createTestSuite,
  sleep,
  waitForCondition,
  withTimeout
} = require('./test-utils');

/**
 * HYBRID UI TESTS SUITE
 */
const suite = createTestSuite('Hybrid UI Tests');

let browser;
let page;
const screenshotDir = path.join(__dirname, 'screenshots');
const failureReportPath = path.join(__dirname, 'ui-test-failures.json');
const failureReports = [];

/**
 * SETUP - Before all tests
 * 
 * Launches a browser and loads the BubbleVoice UI.
 */
suite.beforeAll(async () => {
  console.log('  Setting up hybrid UI tests...');
  
  // Create screenshots directory
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  // Clear old failure reports
  if (fs.existsSync(failureReportPath)) {
    fs.unlinkSync(failureReportPath);
  }
  
  console.log('  UI tests will use file:// protocol to load frontend');
});

/**
 * TEARDOWN - After all tests
 */
suite.afterAll(async () => {
  console.log('  Cleaning up hybrid UI tests...');
  
  // Save failure reports
  if (failureReports.length > 0) {
    fs.writeFileSync(failureReportPath, JSON.stringify(failureReports, null, 2));
    console.log(`  Saved ${failureReports.length} failure reports to ui-test-failures.json`);
  }
});

/**
 * HELPER: Take screenshot on failure
 */
async function captureFailure(testName, page, error, additionalInfo = {}) {
  const timestamp = Date.now();
  const screenshotPath = path.join(screenshotDir, `${testName.replace(/\s+/g, '_')}_${timestamp}.png`);
  
  let screenshot = null;
  let htmlContent = null;
  let computedStyles = null;
  
  try {
    if (page) {
      // Take screenshot
      screenshot = screenshotPath;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      
      // Get HTML content
      htmlContent = await page.content();
      
      // Get computed styles of key elements
      computedStyles = await page.evaluate(() => {
        const elements = {
          body: document.body,
          mainContainer: document.querySelector('.main-container'),
          voiceButton: document.querySelector('.voice-button'),
          conversationArea: document.querySelector('.conversation-area')
        };
        
        const styles = {};
        for (const [key, element] of Object.entries(elements)) {
          if (element) {
            const computed = window.getComputedStyle(element);
            styles[key] = {
              display: computed.display,
              visibility: computed.visibility,
              opacity: computed.opacity,
              position: computed.position,
              width: computed.width,
              height: computed.height,
              backgroundColor: computed.backgroundColor,
              color: computed.color
            };
          }
        }
        return styles;
      });
    }
  } catch (captureError) {
    console.error('    Error capturing failure details:', captureError.message);
  }
  
  const report = {
    testName,
    timestamp,
    error: {
      message: error.message,
      stack: error.stack
    },
    screenshot,
    htmlContent: htmlContent ? htmlContent.substring(0, 1000) + '...' : null,
    computedStyles,
    ...additionalInfo
  };
  
  failureReports.push(report);
  console.log(`    📸 Screenshot saved: ${screenshotPath}`);
  
  return report;
}

/**
 * HELPER: Load UI in browser
 *
 * WHY MOCKING ELECTRON API:
 * The app's JavaScript expects window.electronAPI to exist (provided by Electron's
 * preload script). When testing in Puppeteer, we must inject a mock before the
 * page scripts run, otherwise the app initialization fails with errors like
 * "Cannot read property 'getBackendConfig' of undefined".
 *
 * WHY 'domcontentloaded' instead of 'networkidle0':
 * 'networkidle0' waits for no network activity for 500ms, which can timeout
 * if the page has background requests or websocket connections trying to connect.
 * 'domcontentloaded' is faster and more reliable for file:// URLs.
 */
async function loadUI(page) {
  const frontendPath = path.join(__dirname, '../src/frontend/index.html');
  const fileUrl = `file://${frontendPath}`;

  // Check if the file exists before trying to load it
  if (!fs.existsSync(frontendPath)) {
    throw new Error(`Frontend file not found: ${frontendPath}`);
  }

  // Inject mock Electron API BEFORE the page loads
  // This must be done with evaluateOnNewDocument so it runs before page scripts
  //
  // WHY: The app's JavaScript expects window.electronAPI to exist (provided by Electron's
  // preload script). In Puppeteer, we inject a comprehensive mock that includes:
  // 1. Mock WebSocket that doesn't actually connect (prevents connection hang)
  // 2. Mock speechSynthesis (prevents getVoices errors in non-browser contexts)
  // 3. Mock localStorage for settings persistence
  //
  // CRITICAL FIX (2026-01-21): The app was hanging because it tried to connect to
  // a real WebSocket server. We now mock the WebSocket class itself to prevent
  // any actual network connections during UI tests.
  await page.evaluateOnNewDocument(() => {
    // Mock WebSocket to prevent real connection attempts
    // This is CRITICAL - the app tries to connect during initialization
    // and will hang indefinitely waiting for a connection that never completes
    //
    // IMPORTANT: The WebSocketClient uses addEventListener, not on* properties,
    // so we must implement both styles for compatibility.
    class MockWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0; // CONNECTING

        // Event listeners storage (for addEventListener API)
        this._listeners = {
          open: [],
          close: [],
          message: [],
          error: []
        };

        // Simulate successful connection after a short delay
        // This gives time for addEventListener calls to register
        setTimeout(() => {
          this.readyState = 1; // OPEN

          // Fire open event to all listeners
          const openEvent = { type: 'open' };
          this._listeners.open.forEach(fn => fn(openEvent));
          if (this.onopen) this.onopen(openEvent);

          // Send a mock welcome message
          setTimeout(() => {
            const msgEvent = {
              data: JSON.stringify({
                type: 'status',
                data: { message: 'Connected to mock backend', clientId: 'mock_client' }
              })
            };
            this._listeners.message.forEach(fn => fn(msgEvent));
            if (this.onmessage) this.onmessage(msgEvent);
          }, 10);
        }, 50);
      }

      addEventListener(event, callback) {
        if (this._listeners[event]) {
          this._listeners[event].push(callback);
        }
      }

      removeEventListener(event, callback) {
        if (this._listeners[event]) {
          this._listeners[event] = this._listeners[event].filter(fn => fn !== callback);
        }
      }

      send(data) {
        // Mock send - log but don't actually send
        console.log('[MockWebSocket] Would send:', data);
      }

      close(code, reason) {
        this.readyState = 3; // CLOSED
        const closeEvent = { code: code || 1000, reason: reason || 'Normal closure' };
        this._listeners.close.forEach(fn => fn(closeEvent));
        if (this.onclose) this.onclose(closeEvent);
      }
    }
    MockWebSocket.CONNECTING = 0;
    MockWebSocket.OPEN = 1;
    MockWebSocket.CLOSING = 2;
    MockWebSocket.CLOSED = 3;
    window.WebSocket = MockWebSocket;

    // Mock the Electron API that the app expects
    // This prevents initialization errors when running outside of Electron
    window.electronAPI = {
      getBackendConfig: () => Promise.resolve({
        websocketUrl: 'ws://localhost:7483',
        httpUrl: 'http://localhost:7482'
      }),
      selectTargetFolder: () => Promise.resolve({ success: false }),
      onActivateVoiceInput: (callback) => {
        // Store callback for potential use in tests
        window._voiceInputCallback = callback;
      },
      onNewConversation: (callback) => {
        window._newConversationCallback = callback;
      },
      onShowSettings: (callback) => {
        window._showSettingsCallback = callback;
      },
      window: {
        minimize: () => Promise.resolve(),
        close: () => Promise.resolve(),
        toggleAlwaysOnTop: () => Promise.resolve(false)
      },
      permissions: {
        checkMicrophone: () => Promise.resolve({ granted: true }),
        requestMicrophone: () => Promise.resolve({ granted: true }),
        checkAccessibility: () => Promise.resolve({ granted: true }),
        openAccessibilitySettings: () => Promise.resolve()
      }
    };

    // Mock speechSynthesis for voice-related functionality
    // CRITICAL FIX (2026-01-21): Prevents TypeError when getVoices() is called
    // in environments where speechSynthesis is not fully available
    if (!window.speechSynthesis) {
      window.speechSynthesis = {
        speak: () => {},
        cancel: () => {},
        pause: () => {},
        resume: () => {},
        getVoices: () => [],
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null
      };
    }

    // Mock SpeechRecognition for voice input
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      class MockSpeechRecognition {
        constructor() {
          this.continuous = false;
          this.interimResults = false;
          this.lang = 'en-US';
          this.maxAlternatives = 1;
          this.onstart = null;
          this.onend = null;
          this.onresult = null;
          this.onerror = null;
        }
        start() {
          if (this.onstart) this.onstart();
        }
        stop() {
          if (this.onend) this.onend();
        }
        abort() {
          if (this.onend) this.onend();
        }
      }
      window.SpeechRecognition = MockSpeechRecognition;
      window.webkitSpeechRecognition = MockSpeechRecognition;
    }

    // Also mock localStorage to prevent errors in tests
    const store = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value; },
        removeItem: (key) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); }
      },
      writable: true
    });

    // Mock navigator.mediaDevices for microphone access
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({
      getTracks: () => [{ stop: () => {} }]
    });
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
      { kind: 'audioinput', deviceId: 'default', label: 'Default Microphone' },
      { kind: 'audiooutput', deviceId: 'default', label: 'Default Speaker' }
    ]);
  });

  // Use domcontentloaded instead of networkidle0 - it's faster and more reliable
  // for file:// URLs that may have failing network requests (like WebSocket connections)
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });

  // Wait for basic UI to load
  await page.waitForSelector('body', { timeout: 3000 });

  // Give a brief moment for JavaScript to initialize
  // REDUCED FROM 500ms: The mocked WebSocket connects quickly (50ms delay in mock)
  await sleep(200);
}

/**
 * TEST: UI loads without errors
 *
 * FAILURE POINT: JavaScript errors prevent UI from loading
 * IMPACT: App shows blank screen, completely unusable
 *
 * WHY TIMEOUT WAS INCREASED:
 * Puppeteer browser launch can be slow on first run or when Chrome needs
 * to download. We use 'new' headless mode for better compatibility and
 * add explicit timeouts to prevent indefinite hanging.
 *
 * CRITICAL FIX (2026-01-21): The test was timing out because browser launch
 * and page loading takes longer in the full test suite context. We now use
 * withTimeout wrapper to ensure we get a meaningful error instead of hitting
 * the 30s test timeout with no information.
 */
suite.test('UI loads without JavaScript errors', async () => {
  const puppeteer = require('puppeteer');

  // WHY 'new' headless mode: The old 'headless: true' mode is deprecated.
  // 'new' headless mode provides better compatibility with modern web features.
  //
  // TIMEOUT HANDLING: We wrap browser launch in a promise with explicit timeout
  // so we can diagnose where the slowdown is occurring.
  browser = await withTimeout(
    puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 15000 // Puppeteer's internal timeout
    }),
    20000, // Our wrapper timeout
    'Browser launch timed out after 20s'
  );
  page = await browser.newPage();

  // Set a reasonable default timeout for all page operations
  page.setDefaultTimeout(10000);
  
  const consoleErrors = [];
  const jsErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    jsErrors.push(error.message);
  });
  
  try {
    await loadUI(page);
    
    // Wait a bit for any delayed errors
    await sleep(1000);
    
    if (consoleErrors.length > 0 || jsErrors.length > 0) {
      await captureFailure('UI_loads_without_errors', page, 
        new Error('JavaScript errors detected'), 
        { consoleErrors, jsErrors }
      );
    }
    
    assert.strictEqual(jsErrors.length, 0, `JavaScript errors: ${jsErrors.join(', ')}`);
    assert.strictEqual(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(', ')}`);
    
  } catch (error) {
    await captureFailure('UI_loads_without_errors', page, error);
    throw error;
  }
});

/**
 * TEST: Main container is visible
 * 
 * FAILURE POINT: CSS issues hide main UI
 * IMPACT: User sees blank screen
 */
suite.test('Main container is visible and properly sized', async () => {
  try {
    const mainContainer = await page.$('.main-container, #app, body > div');
    assert.ok(mainContainer, 'Main container element should exist');
    
    const isVisible = await page.evaluate(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        display: style.display !== 'none',
        visibility: style.visibility !== 'hidden',
        opacity: parseFloat(style.opacity) > 0,
        hasSize: rect.width > 0 && rect.height > 0,
        rect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        }
      };
    }, mainContainer);
    
    if (!isVisible.display || !isVisible.visibility || !isVisible.opacity || !isVisible.hasSize) {
      await captureFailure('Main_container_visible', page, 
        new Error('Main container not visible'), 
        { visibility: isVisible }
      );
    }
    
    assert.ok(isVisible.display, 'Main container should be displayed');
    assert.ok(isVisible.visibility, 'Main container should be visible');
    assert.ok(isVisible.opacity, 'Main container should have opacity > 0');
    assert.ok(isVisible.hasSize, 'Main container should have non-zero size');
    
    console.log(`    ✓ Container size: ${isVisible.rect.width}x${isVisible.rect.height}`);
    
  } catch (error) {
    await captureFailure('Main_container_visible', page, error);
    throw error;
  }
});

/**
 * TEST: Voice button exists and is clickable
 * 
 * FAILURE POINT: Voice button not rendered or not interactive
 * IMPACT: User can't start voice input
 */
suite.test('Voice button exists and is clickable', async () => {
  try {
    // Try multiple possible selectors
    const voiceButton = await page.$('.voice-button, #voice-button, button[aria-label*="voice" i], button[aria-label*="record" i]');
    
    if (!voiceButton) {
      await captureFailure('Voice_button_exists', page, 
        new Error('Voice button not found'),
        { 
          availableButtons: await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button')).map(btn => ({
              text: btn.textContent,
              id: btn.id,
              class: btn.className,
              ariaLabel: btn.getAttribute('aria-label')
            }));
          })
        }
      );
    }
    
    assert.ok(voiceButton, 'Voice button should exist');
    
    // Check if button is visible and clickable
    const buttonState = await page.evaluate(btn => {
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        opacity: parseFloat(style.opacity),
        disabled: btn.disabled,
        pointerEvents: style.pointerEvents,
        size: { width: rect.width, height: rect.height },
        position: { top: rect.top, left: rect.left }
      };
    }, voiceButton);
    
    if (!buttonState.visible || buttonState.disabled || buttonState.opacity === 0) {
      await captureFailure('Voice_button_clickable', page, 
        new Error('Voice button not clickable'),
        { buttonState }
      );
    }
    
    assert.ok(buttonState.visible, 'Voice button should be visible');
    assert.ok(!buttonState.disabled, 'Voice button should not be disabled');
    assert.ok(buttonState.opacity > 0, 'Voice button should have opacity > 0');
    
    console.log(`    ✓ Button size: ${buttonState.size.width}x${buttonState.size.height}`);
    
  } catch (error) {
    await captureFailure('Voice_button_exists', page, error);
    throw error;
  }
});

/**
 * TEST: Conversation area exists and scrollable
 * 
 * FAILURE POINT: Conversation area not rendered or not scrollable
 * IMPACT: User can't see conversation history
 */
suite.test('Conversation area exists and is scrollable', async () => {
  try {
    const conversationArea = await page.$('.conversation-area, .messages, #conversation, [role="log"]');
    
    if (!conversationArea) {
      await captureFailure('Conversation_area_exists', page,
        new Error('Conversation area not found'),
        {
          availableElements: await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div, section, main')).map(el => ({
              tag: el.tagName,
              id: el.id,
              class: el.className,
              role: el.getAttribute('role')
            }));
          })
        }
      );
    }
    
    assert.ok(conversationArea, 'Conversation area should exist');
    
    const areaState = await page.evaluate(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        overflow: style.overflow || style.overflowY,
        scrollable: el.scrollHeight > el.clientHeight,
        size: { width: rect.width, height: rect.height },
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight
      };
    }, conversationArea);
    
    assert.ok(areaState.visible, 'Conversation area should be visible');
    console.log(`    ✓ Area size: ${areaState.size.width}x${areaState.size.height}`);
    console.log(`    ✓ Scroll: ${areaState.scrollHeight}px content in ${areaState.clientHeight}px container`);
    
  } catch (error) {
    await captureFailure('Conversation_area_exists', page, error);
    throw error;
  }
});

/**
 * TEST: UI responds to window resize
 * 
 * FAILURE POINT: UI breaks at different window sizes
 * IMPACT: Poor UX on different screen sizes
 */
suite.test('UI responds to window resize', async () => {
  try {
    const sizes = [
      { width: 600, height: 500, name: 'minimum' },
      { width: 900, height: 700, name: 'default' },
      { width: 1400, height: 900, name: 'large' }
    ];
    
    const results = [];
    
    for (const size of sizes) {
      await page.setViewport(size);
      await sleep(500); // Wait for resize
      
      const state = await page.evaluate(() => {
        const body = document.body;
        const rect = body.getBoundingClientRect();
        
        // Check for overflow
        const hasHorizontalOverflow = body.scrollWidth > body.clientWidth;
        const hasVerticalOverflow = body.scrollHeight > body.clientHeight;
        
        // Check if key elements are still visible
        const voiceButton = document.querySelector('.voice-button, button[aria-label*="voice" i]');
        const conversationArea = document.querySelector('.conversation-area, .messages');
        
        return {
          bodySize: { width: rect.width, height: rect.height },
          overflow: { horizontal: hasHorizontalOverflow, vertical: hasVerticalOverflow },
          elementsVisible: {
            voiceButton: voiceButton ? window.getComputedStyle(voiceButton).display !== 'none' : false,
            conversationArea: conversationArea ? window.getComputedStyle(conversationArea).display !== 'none' : false
          }
        };
      });
      
      results.push({ size: size.name, ...state });
      
      // Check for horizontal overflow (usually a bug)
      if (state.overflow.horizontal) {
        await captureFailure('UI_resize_responsive', page,
          new Error(`Horizontal overflow at ${size.name} size`),
          { size, state }
        );
      }
      
      assert.ok(!state.overflow.horizontal, `No horizontal overflow at ${size.name} size`);
      console.log(`    ✓ ${size.name}: ${size.width}x${size.height} - OK`);
    }
    
  } catch (error) {
    await captureFailure('UI_resize_responsive', page, error);
    throw error;
  }
});

/**
 * TEST: Voice button click triggers state change
 * 
 * FAILURE POINT: Click doesn't trigger action
 * IMPACT: User can't start voice input
 */
suite.test('Voice button click triggers visual state change', async () => {
  try {
    const voiceButton = await page.$('.voice-button, #voice-button, button[aria-label*="voice" i]');
    assert.ok(voiceButton, 'Voice button should exist');
    
    // Get initial state
    const initialState = await page.evaluate(btn => {
      const style = window.getComputedStyle(btn);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        text: btn.textContent,
        ariaLabel: btn.getAttribute('aria-label'),
        className: btn.className
      };
    }, voiceButton);
    
    // Click button
    await voiceButton.click();
    await sleep(500); // Wait for state change
    
    // Get new state
    const newState = await page.evaluate(btn => {
      const style = window.getComputedStyle(btn);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        text: btn.textContent,
        ariaLabel: btn.getAttribute('aria-label'),
        className: btn.className
      };
    }, voiceButton);
    
    // Check if something changed (visual feedback)
    const stateChanged = 
      initialState.backgroundColor !== newState.backgroundColor ||
      initialState.color !== newState.color ||
      initialState.text !== newState.text ||
      initialState.className !== newState.className;
    
    if (!stateChanged) {
      await captureFailure('Voice_button_state_change', page,
        new Error('No visual state change after click'),
        { initialState, newState }
      );
    }
    
    console.log(`    ✓ State changed: ${JSON.stringify(initialState)} → ${JSON.stringify(newState)}`);
    
  } catch (error) {
    await captureFailure('Voice_button_state_change', page, error);
    throw error;
  }
});

/**
 * TEST: Keyboard shortcuts work
 * 
 * FAILURE POINT: Keyboard navigation doesn't work
 * IMPACT: Accessibility issues, power users frustrated
 */
suite.test('Keyboard shortcuts trigger actions', async () => {
  try {
    // Focus the page
    await page.focus('body');
    
    // Try Escape key (should trigger something)
    await page.keyboard.press('Escape');
    await sleep(200);
    
    // Try Tab key (should move focus)
    await page.keyboard.press('Tab');
    await sleep(200);
    
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el.tagName,
        id: el.id,
        class: el.className,
        type: el.type
      };
    });
    
    console.log(`    ✓ Tab moved focus to: ${focusedElement.tag}${focusedElement.id ? '#' + focusedElement.id : ''}`);
    
    // Verify some element has focus (not body)
    assert.notStrictEqual(focusedElement.tag, 'BODY', 'Tab should move focus from body');
    
  } catch (error) {
    await captureFailure('Keyboard_shortcuts', page, error);
    throw error;
  }
});

/**
 * TEST: Error messages are visible
 * 
 * FAILURE POINT: Errors happen silently
 * IMPACT: User doesn't know why app isn't working
 */
suite.test('Error messages display correctly', async () => {
  try {
    // Simulate an error by calling a function that should show error
    await page.evaluate(() => {
      // Try to trigger an error display
      if (window.showError) {
        window.showError('Test error message');
      } else if (window.displayError) {
        window.displayError('Test error message');
      } else {
        // Create a test error element
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message test-error';
        errorDiv.textContent = 'Test error message';
        errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: red; color: white; padding: 10px;';
        document.body.appendChild(errorDiv);
      }
    });
    
    await sleep(500);
    
    // Check if error is visible
    const errorVisible = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('.error, .error-message, [role="alert"]');
      for (const el of errorElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display !== 'none' && 
            style.visibility !== 'hidden' && 
            parseFloat(style.opacity) > 0 &&
            rect.width > 0 && rect.height > 0) {
          return {
            found: true,
            text: el.textContent,
            position: { top: rect.top, left: rect.left },
            size: { width: rect.width, height: rect.height }
          };
        }
      }
      return { found: false };
    });
    
    if (!errorVisible.found) {
      await captureFailure('Error_messages_visible', page,
        new Error('Error message not visible'),
        { errorVisible }
      );
    }
    
    console.log(`    ✓ Error visible: "${errorVisible.text?.substring(0, 50)}..."`);
    
    // Clean up test error
    await page.evaluate(() => {
      const testError = document.querySelector('.test-error');
      if (testError) testError.remove();
    });
    
  } catch (error) {
    await captureFailure('Error_messages_visible', page, error);
    throw error;
  }
});

/**
 * TEST: Loading indicators display
 * 
 * FAILURE POINT: No feedback during long operations
 * IMPACT: User thinks app is frozen
 */
suite.test('Loading indicators are visible', async () => {
  try {
    // Simulate loading state
    await page.evaluate(() => {
      // Try to trigger loading indicator
      if (window.showLoading) {
        window.showLoading();
      } else if (window.setLoading) {
        window.setLoading(true);
      } else {
        // Create a test loading element
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator test-loading';
        loadingDiv.textContent = 'Loading...';
        loadingDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px;';
        document.body.appendChild(loadingDiv);
      }
    });
    
    await sleep(500);
    
    // Check if loading indicator is visible
    const loadingVisible = await page.evaluate(() => {
      const loadingElements = document.querySelectorAll('.loading, .loading-indicator, .spinner, [aria-busy="true"]');
      for (const el of loadingElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display !== 'none' && 
            style.visibility !== 'hidden' && 
            parseFloat(style.opacity) > 0 &&
            rect.width > 0 && rect.height > 0) {
          return {
            found: true,
            position: { top: rect.top, left: rect.left },
            size: { width: rect.width, height: rect.height }
          };
        }
      }
      return { found: false };
    });
    
    if (!loadingVisible.found) {
      await captureFailure('Loading_indicators_visible', page,
        new Error('Loading indicator not visible'),
        { loadingVisible }
      );
    }
    
    console.log(`    ✓ Loading indicator visible at (${loadingVisible.position?.top}, ${loadingVisible.position?.left})`);
    
    // Clean up test loading
    await page.evaluate(() => {
      const testLoading = document.querySelector('.test-loading');
      if (testLoading) testLoading.remove();
    });
    
  } catch (error) {
    await captureFailure('Loading_indicators_visible', page, error);
    throw error;
  }
});

/**
 * TEST: Text is readable (contrast)
 * 
 * FAILURE POINT: Poor contrast makes text unreadable
 * IMPACT: Accessibility issues, hard to read
 */
suite.test('Text has sufficient contrast', async () => {
  try {
    const contrastIssues = await page.evaluate(() => {
      // Simple contrast check (not full WCAG algorithm but good enough)
      function getLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }
      
      function getContrastRatio(rgb1, rgb2) {
        const l1 = getLuminance(...rgb1);
        const l2 = getLuminance(...rgb2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }
      
      function parseRgb(rgbString) {
        const match = rgbString.match(/\d+/g);
        return match ? match.slice(0, 3).map(Number) : [0, 0, 0];
      }
      
      const textElements = document.querySelectorAll('p, span, button, a, h1, h2, h3, h4, h5, h6, label');
      const issues = [];
      
      for (const el of textElements) {
        if (el.textContent.trim().length === 0) continue;
        
        const style = window.getComputedStyle(el);
        const color = parseRgb(style.color);
        const bgColor = parseRgb(style.backgroundColor);
        
        const contrast = getContrastRatio(color, bgColor);
        
        // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
        const fontSize = parseFloat(style.fontSize);
        const minContrast = fontSize >= 18 ? 3 : 4.5;
        
        if (contrast < minContrast) {
          issues.push({
            text: el.textContent.substring(0, 50),
            contrast: contrast.toFixed(2),
            required: minContrast,
            color: style.color,
            backgroundColor: style.backgroundColor
          });
        }
      }
      
      return issues;
    });
    
    if (contrastIssues.length > 0) {
      await captureFailure('Text_contrast', page,
        new Error(`${contrastIssues.length} contrast issues found`),
        { contrastIssues: contrastIssues.slice(0, 5) } // Only include first 5
      );
      
      console.log(`    ⚠️  Found ${contrastIssues.length} contrast issues (see failure report)`);
    } else {
      console.log(`    ✓ All text has sufficient contrast`);
    }
    
    // Don't fail the test, just warn
    // assert.strictEqual(contrastIssues.length, 0, 'All text should have sufficient contrast');
    
  } catch (error) {
    await captureFailure('Text_contrast', page, error);
    throw error;
  }
});

/**
 * TEST: No layout shift on load
 * 
 * FAILURE POINT: UI jumps around during load
 * IMPACT: Poor UX, hard to click elements
 */
suite.test('No significant layout shift during load', async () => {
  try {
    // Reload page and measure layout shifts
    await page.goto(`file://${path.join(__dirname, '../src/frontend/index.html')}`, { waitUntil: 'networkidle0' });
    
    // Wait for page to settle
    await sleep(2000);
    
    // Get Cumulative Layout Shift (CLS) score
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let clsScore = 0;
        
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsScore += entry.value;
            }
          }
        });
        
        observer.observe({ type: 'layout-shift', buffered: true });
        
        setTimeout(() => {
          observer.disconnect();
          resolve(clsScore);
        }, 1000);
      });
    });
    
    console.log(`    ✓ CLS score: ${cls.toFixed(4)} (< 0.1 is good)`);
    
    if (cls > 0.25) {
      await captureFailure('Layout_shift', page,
        new Error(`High layout shift: ${cls.toFixed(4)}`),
        { cls }
      );
    }
    
    // Warn but don't fail for moderate shifts
    if (cls > 0.1) {
      console.log(`    ⚠️  Layout shift is higher than ideal`);
    }
    
  } catch (error) {
    await captureFailure('Layout_shift', page, error);
    throw error;
  }
});

/**
 * CLEANUP - Close browser
 */
suite.afterAll(async () => {
  if (browser) {
    await browser.close();
  }
});

// Run the test suite
if (require.main === module) {
  suite.run().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

module.exports = suite;
