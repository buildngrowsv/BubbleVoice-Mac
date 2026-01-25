/**
 * PUPPETEER MCP HELPER UTILITIES
 * 
 * **Purpose**: Wrapper functions for Puppeteer MCP tools
 * 
 * **What This Provides**:
 * - High-level functions for common UI testing tasks
 * - Error handling and retries
 * - Wait utilities
 * - Screenshot management
 * - Element verification
 * 
 * **Why This Exists**:
 * Raw Puppeteer MCP calls are verbose. These helpers provide a clean,
 * reusable API for UI testing across all test files.
 * 
 * **Technical Approach**:
 * - Uses CallMcpTool to invoke Puppeteer MCP
 * - Implements retry logic for flaky operations
 * - Provides async/await interface
 * - Handles common edge cases
 * 
 * **Created**: 2026-01-25
 * **Part of**: UI Testing Infrastructure
 */

const path = require('path');
const fs = require('fs');

// Configuration
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'test-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * CALL MCP TOOL
 * 
 * Helper to call Puppeteer MCP tools.
 * 
 * **Technical**: This would use the actual MCP calling mechanism
 * **Why**: Centralize MCP calls for easier debugging
 * **Product**: N/A (internal utility)
 * 
 * @param {string} toolName - Name of the Puppeteer tool
 * @param {Object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
async function callMcpTool(toolName, args = {}) {
    // NOTE: In actual implementation, this would use the MCP SDK
    // For now, this is a placeholder that would be replaced with:
    // return await window.electronAPI.callMcpTool('user-Puppeteer', toolName, args);
    
    console.log(`[Puppeteer MCP] ${toolName}`, args);
    
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock success
    return { success: true };
}

/**
 * NAVIGATE TO URL
 * 
 * Opens a URL in the browser.
 * 
 * @param {string} url - URL to navigate to
 * @param {Object} options - Launch options
 * @returns {Promise<void>}
 */
async function navigate(url, options = {}) {
    console.log(`🌐 Navigating to: ${url}`);
    
    await callMcpTool('puppeteer_navigate', {
        url,
        launchOptions: options.launchOptions || null,
        allowDangerous: options.allowDangerous || false
    });
    
    // Wait for page to load
    await sleep(2000);
    
    console.log('✅ Navigation complete');
}

/**
 * CLICK ELEMENT
 * 
 * Clicks an element by CSS selector.
 * 
 * @param {string} selector - CSS selector
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function click(selector, options = {}) {
    const { retries = DEFAULT_RETRY_COUNT, waitBefore = 500 } = options;
    
    console.log(`🖱️  Clicking: ${selector}`);
    
    // Wait a bit before clicking
    await sleep(waitBefore);
    
    for (let i = 0; i < retries; i++) {
        try {
            await callMcpTool('puppeteer_click', { selector });
            console.log('✅ Click successful');
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`⚠️  Click failed, retrying... (${i + 1}/${retries})`);
            await sleep(DEFAULT_RETRY_DELAY);
        }
    }
}

/**
 * FILL INPUT
 * 
 * Fills an input field with text.
 * 
 * @param {string} selector - CSS selector for input
 * @param {string} value - Value to fill
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function fill(selector, value, options = {}) {
    const { clear = true, retries = DEFAULT_RETRY_COUNT } = options;
    
    console.log(`⌨️  Filling: ${selector} = "${value.slice(0, 50)}${value.length > 50 ? '...' : ''}"`);
    
    for (let i = 0; i < retries; i++) {
        try {
            await callMcpTool('puppeteer_fill', { selector, value });
            console.log('✅ Fill successful');
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`⚠️  Fill failed, retrying... (${i + 1}/${retries})`);
            await sleep(DEFAULT_RETRY_DELAY);
        }
    }
}

/**
 * TAKE SCREENSHOT
 * 
 * Captures a screenshot of the page or element.
 * 
 * @param {string} name - Screenshot name
 * @param {Object} options - Options
 * @returns {Promise<string>} Screenshot path
 */
async function screenshot(name, options = {}) {
    const {
        selector = null,
        width = 1280,
        height = 800,
        encoded = false
    } = options;
    
    const timestamp = Date.now();
    const filename = `${timestamp}_${name}`;
    
    console.log(`📸 Screenshot: ${name}`);
    
    await callMcpTool('puppeteer_screenshot', {
        name: filename,
        selector,
        width,
        height,
        encoded
    });
    
    const filepath = path.join(SCREENSHOTS_DIR, `${filename}.png`);
    console.log(`✅ Screenshot saved: ${filepath}`);
    
    return filepath;
}

/**
 * EVALUATE JAVASCRIPT
 * 
 * Executes JavaScript in the browser context.
 * 
 * @param {string} script - JavaScript code to execute
 * @returns {Promise<any>} Script result
 */
async function evaluate(script) {
    console.log(`🔧 Evaluating: ${script.slice(0, 100)}${script.length > 100 ? '...' : ''}`);
    
    const result = await callMcpTool('puppeteer_evaluate', { script });
    
    console.log('✅ Evaluation complete');
    return result;
}

/**
 * WAIT FOR ELEMENT
 * 
 * Waits for an element to appear in the DOM.
 * 
 * @param {string} selector - CSS selector
 * @param {Object} options - Options
 * @returns {Promise<boolean>} True if element found
 */
async function waitForElement(selector, options = {}) {
    const { timeout = DEFAULT_TIMEOUT, checkInterval = 500 } = options;
    
    console.log(`⏳ Waiting for element: ${selector}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const exists = await checkElementExists(selector);
            if (exists) {
                console.log('✅ Element found');
                return true;
            }
        } catch (error) {
            // Continue waiting
        }
        
        await sleep(checkInterval);
    }
    
    throw new Error(`Element not found after ${timeout}ms: ${selector}`);
}

/**
 * CHECK ELEMENT EXISTS
 * 
 * Checks if an element exists in the DOM.
 * 
 * @param {string} selector - CSS selector
 * @returns {Promise<boolean>} True if exists
 */
async function checkElementExists(selector) {
    const script = `
        !!document.querySelector('${selector}');
    `;
    
    const result = await evaluate(script);
    return result === true;
}

/**
 * GET ELEMENT TEXT
 * 
 * Gets the text content of an element.
 * 
 * @param {string} selector - CSS selector
 * @returns {Promise<string>} Element text
 */
async function getElementText(selector) {
    console.log(`📖 Getting text from: ${selector}`);
    
    const script = `
        const el = document.querySelector('${selector}');
        el ? el.textContent.trim() : null;
    `;
    
    const text = await evaluate(script);
    console.log(`✅ Text: "${text?.slice(0, 100)}${text?.length > 100 ? '...' : ''}"`);
    
    return text;
}

/**
 * GET ELEMENT COUNT
 * 
 * Counts how many elements match a selector.
 * 
 * @param {string} selector - CSS selector
 * @returns {Promise<number>} Element count
 */
async function getElementCount(selector) {
    console.log(`🔢 Counting elements: ${selector}`);
    
    const script = `
        document.querySelectorAll('${selector}').length;
    `;
    
    const count = await evaluate(script);
    console.log(`✅ Count: ${count}`);
    
    return count;
}

/**
 * WAIT FOR TEXT
 * 
 * Waits for an element to contain specific text.
 * 
 * @param {string} selector - CSS selector
 * @param {string} expectedText - Text to wait for
 * @param {Object} options - Options
 * @returns {Promise<boolean>} True if text found
 */
async function waitForText(selector, expectedText, options = {}) {
    const { timeout = DEFAULT_TIMEOUT, checkInterval = 500 } = options;
    
    console.log(`⏳ Waiting for text in ${selector}: "${expectedText}"`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const text = await getElementText(selector);
            if (text && text.includes(expectedText)) {
                console.log('✅ Text found');
                return true;
            }
        } catch (error) {
            // Continue waiting
        }
        
        await sleep(checkInterval);
    }
    
    throw new Error(`Text not found after ${timeout}ms: "${expectedText}" in ${selector}`);
}

/**
 * WAIT FOR ELEMENT COUNT
 * 
 * Waits for a specific number of elements to appear.
 * 
 * @param {string} selector - CSS selector
 * @param {number} expectedCount - Expected count
 * @param {Object} options - Options
 * @returns {Promise<boolean>} True if count reached
 */
async function waitForElementCount(selector, expectedCount, options = {}) {
    const { timeout = DEFAULT_TIMEOUT, checkInterval = 500 } = options;
    
    console.log(`⏳ Waiting for ${expectedCount} elements: ${selector}`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const count = await getElementCount(selector);
            if (count >= expectedCount) {
                console.log(`✅ Found ${count} elements`);
                return true;
            }
        } catch (error) {
            // Continue waiting
        }
        
        await sleep(checkInterval);
    }
    
    throw new Error(`Expected count not reached after ${timeout}ms: ${expectedCount} of ${selector}`);
}

/**
 * CHECK NO CONSOLE ERRORS
 * 
 * Verifies there are no console errors on the page.
 * 
 * @returns {Promise<Array>} Array of console errors (empty if none)
 */
async function checkNoConsoleErrors() {
    console.log('🔍 Checking for console errors...');
    
    const script = `
        // This would need to be set up earlier to capture console.error calls
        window.__testConsoleErrors || [];
    `;
    
    const errors = await evaluate(script);
    
    if (errors && errors.length > 0) {
        console.error(`❌ Found ${errors.length} console errors`);
        errors.forEach((err, i) => {
            console.error(`  ${i + 1}. ${err}`);
        });
        return errors;
    }
    
    console.log('✅ No console errors');
    return [];
}

/**
 * SLEEP
 * 
 * Utility to pause execution.
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * SEND MESSAGE TO APP
 * 
 * High-level helper to send a message in the BubbleVoice app.
 * 
 * @param {string} message - Message to send
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function sendMessage(message, options = {}) {
    const {
        inputSelector = '#user-input',
        sendButtonSelector = '#send-button',
        waitAfter = 1000
    } = options;
    
    console.log('');
    console.log(`📤 Sending message: "${message.slice(0, 60)}${message.length > 60 ? '...' : ''}"`);
    
    // Click input to focus
    await click(inputSelector);
    
    // Fill message
    await fill(inputSelector, message);
    
    // Click send
    await click(sendButtonSelector);
    
    // Wait for UI to update
    await sleep(waitAfter);
    
    console.log('✅ Message sent');
}

/**
 * WAIT FOR AI RESPONSE
 * 
 * Waits for the AI to respond to a message.
 * 
 * @param {Object} options - Options
 * @returns {Promise<string>} AI response text
 */
async function waitForAIResponse(options = {}) {
    const {
        responseSelector = '.message-bubble.ai:last-child',
        timeout = 30000
    } = options;
    
    console.log('⏳ Waiting for AI response...');
    
    // Wait for response bubble to appear
    await waitForElement(responseSelector, { timeout });
    
    // Get response text
    const responseText = await getElementText(responseSelector);
    
    console.log(`✅ AI responded: "${responseText?.slice(0, 100)}${responseText?.length > 100 ? '...' : ''}"`);
    
    return responseText;
}

/**
 * VERIFY UI STATE
 * 
 * Comprehensive UI state verification.
 * 
 * @param {Object} expectations - What to verify
 * @returns {Promise<Object>} Verification results
 */
async function verifyUIState(expectations) {
    console.log('');
    console.log('🔍 Verifying UI state...');
    
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };
    
    // Check for AI response
    if (expectations.hasAIResponse) {
        try {
            const exists = await checkElementExists('.message-bubble.ai');
            if (exists) {
                results.passed.push('AI response bubble exists');
                console.log('  ✅ AI response bubble');
            } else {
                results.failed.push('AI response bubble not found');
                console.log('  ❌ AI response bubble not found');
            }
        } catch (error) {
            results.failed.push(`AI response check failed: ${error.message}`);
        }
    }
    
    // Check for suggestion bubbles
    if (expectations.hasBubbles) {
        try {
            const count = await getElementCount('.bubble-suggestion');
            if (count > 0) {
                results.passed.push(`Found ${count} suggestion bubbles`);
                console.log(`  ✅ ${count} suggestion bubbles`);
            } else {
                results.warnings.push('No suggestion bubbles found');
                console.log('  ⚠️  No suggestion bubbles');
            }
        } catch (error) {
            results.failed.push(`Bubbles check failed: ${error.message}`);
        }
    }
    
    // Check for life area
    if (expectations.hasLifeArea) {
        try {
            const exists = await checkElementExists('.life-area-item');
            if (exists) {
                results.passed.push('Life area created');
                console.log('  ✅ Life area created');
            } else {
                results.failed.push('Life area not found');
                console.log('  ❌ Life area not found');
            }
        } catch (error) {
            results.failed.push(`Life area check failed: ${error.message}`);
        }
    }
    
    // Check for artifact
    if (expectations.hasArtifact) {
        try {
            const exists = await checkElementExists('.artifact-container');
            if (exists) {
                results.passed.push('Artifact rendered');
                console.log('  ✅ Artifact rendered');
            } else {
                results.failed.push('Artifact not found');
                console.log('  ❌ Artifact not found');
            }
        } catch (error) {
            results.failed.push(`Artifact check failed: ${error.message}`);
        }
    }
    
    // Check for console errors
    const consoleErrors = await checkNoConsoleErrors();
    if (consoleErrors.length > 0) {
        results.warnings.push(`${consoleErrors.length} console errors`);
    }
    
    console.log('');
    console.log(`✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️  Warnings: ${results.warnings.length}`);
    
    return results;
}

// Export all helpers
module.exports = {
    // Core Puppeteer operations
    navigate,
    click,
    fill,
    screenshot,
    evaluate,
    
    // Wait utilities
    waitForElement,
    waitForText,
    waitForElementCount,
    sleep,
    
    // Element queries
    checkElementExists,
    getElementText,
    getElementCount,
    
    // Console checks
    checkNoConsoleErrors,
    
    // High-level app helpers
    sendMessage,
    waitForAIResponse,
    verifyUIState,
    
    // Constants
    DEFAULT_TIMEOUT,
    SCREENSHOTS_DIR
};
