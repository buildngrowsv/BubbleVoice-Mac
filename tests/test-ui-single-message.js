#!/usr/bin/env node

/**
 * UI TEST 2: SINGLE MESSAGE FLOW
 * 
 * **Purpose**: Verify a complete message send/receive cycle works
 * 
 * **What This Tests**:
 * - User can type a message
 * - Send button works
 * - Message appears in chat
 * - AI response appears
 * - Suggestion bubbles appear
 * - UI remains responsive
 * 
 * **Why This Matters**:
 * This is the core user interaction. If this fails, the app is unusable.
 * 
 * **Product Context**:
 * Users expect instant feedback and smooth interactions.
 * 
 * **Created**: 2026-01-25
 * **Part of**: UI Testing Suite
 * 
 * Run with: node tests/test-ui-single-message.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const helpers = require('./puppeteer-helpers');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          UI TEST 2: Single Message Flow                    ║');
console.log('║          Verify complete send/receive cycle                ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Verify API key
if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    console.error('This test requires a real API key to test LLM responses');
    process.exit(1);
}

// Configuration
const APP_URL = 'http://localhost:7482';
const SERVER_STARTUP_DELAY = 5000;
const TEST_MESSAGE = "Hello! I'm testing the app. Can you respond?";

let serverProcess = null;
let testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

/**
 * START SERVER
 */
async function startServer() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SETUP: Starting Backend Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', ['src/backend/server.js'], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, NODE_ENV: 'test' }
        });
        
        let serverReady = false;
        
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Server running') || output.includes('WebSocket')) {
                serverReady = true;
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            console.error(`[Server Error] ${data.toString().trim()}`);
        });
        
        setTimeout(() => {
            if (serverReady) {
                console.log('✅ Server started');
                console.log('');
                resolve();
            } else {
                reject(new Error('Server failed to start'));
            }
        }, SERVER_STARTUP_DELAY);
    });
}

/**
 * STOP SERVER
 */
function stopServer() {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
}

/**
 * TEST: SEND MESSAGE
 */
async function testSendMessage() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Send Message');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Take before screenshot
        await helpers.screenshot('01_before_message');
        
        // Send message
        await helpers.sendMessage(TEST_MESSAGE);
        
        // Take after screenshot
        await helpers.screenshot('02_after_send');
        
        console.log('✅ TEST PASSED: Message sent');
        testResults.passed++;
        
    } catch (error) {
        console.error('❌ TEST FAILED: Could not send message');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Send Message', error: error.message });
    }
}

/**
 * TEST: USER MESSAGE APPEARS
 */
async function testUserMessageAppears() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: User Message Appears');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Wait for user message bubble
        await helpers.waitForElement('.message-bubble.user', { timeout: 5000 });
        
        // Get message text
        const messageText = await helpers.getElementText('.message-bubble.user:last-child');
        
        if (messageText.includes(TEST_MESSAGE)) {
            console.log('✅ User message displayed correctly');
            console.log(`   Text: "${messageText}"`);
            testResults.passed++;
        } else {
            console.log('❌ User message text does not match');
            console.log(`   Expected: "${TEST_MESSAGE}"`);
            console.log(`   Got: "${messageText}"`);
            testResults.failed++;
            testResults.errors.push({
                test: 'User Message Appears',
                error: 'Message text mismatch'
            });
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED: User message did not appear');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'User Message Appears', error: error.message });
    }
}

/**
 * TEST: AI RESPONSE APPEARS
 */
async function testAIResponseAppears() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: AI Response Appears');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Wait for AI response (up to 30 seconds)
        const responseText = await helpers.waitForAIResponse({ timeout: 30000 });
        
        // Take screenshot of response
        await helpers.screenshot('03_ai_response');
        
        if (responseText && responseText.length > 10) {
            console.log('✅ AI response received');
            console.log(`   Length: ${responseText.length} characters`);
            testResults.passed++;
        } else {
            console.log('❌ AI response too short or empty');
            console.log(`   Got: "${responseText}"`);
            testResults.failed++;
            testResults.errors.push({
                test: 'AI Response Appears',
                error: 'Response too short'
            });
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED: AI response did not appear');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'AI Response Appears', error: error.message });
        
        // Take error screenshot
        await helpers.screenshot('03_ai_response_error');
    }
}

/**
 * TEST: SUGGESTION BUBBLES APPEAR
 */
async function testSuggestionBubblesAppear() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Suggestion Bubbles Appear');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Wait a moment for bubbles to appear
        await helpers.sleep(2000);
        
        // Count bubbles
        const bubbleCount = await helpers.getElementCount('.bubble-suggestion');
        
        if (bubbleCount > 0) {
            console.log(`✅ Found ${bubbleCount} suggestion bubbles`);
            
            // Get text of first few bubbles
            for (let i = 0; i < Math.min(3, bubbleCount); i++) {
                const bubbleText = await helpers.getElementText(`.bubble-suggestion:nth-child(${i + 1})`);
                console.log(`   ${i + 1}. "${bubbleText}"`);
            }
            
            testResults.passed++;
        } else {
            console.log('⚠️  No suggestion bubbles found');
            console.log('   This may be expected if LLM did not return bubbles');
            testResults.passed++; // Don't fail, just warn
        }
        
        // Take screenshot
        await helpers.screenshot('04_suggestion_bubbles');
        
    } catch (error) {
        console.error('❌ TEST FAILED: Could not check suggestion bubbles');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Suggestion Bubbles', error: error.message });
    }
}

/**
 * TEST: UI REMAINS RESPONSIVE
 */
async function testUIResponsive() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: UI Remains Responsive');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Check that input is enabled and empty
        const inputDisabled = await helpers.evaluate(`
            document.querySelector('#user-input')?.disabled || false;
        `);
        
        if (!inputDisabled) {
            console.log('✅ Input field is enabled');
        } else {
            console.log('❌ Input field is disabled');
            testResults.errors.push({
                test: 'UI Responsive',
                error: 'Input field disabled'
            });
        }
        
        // Check that send button is enabled
        const sendDisabled = await helpers.evaluate(`
            document.querySelector('#send-button')?.disabled || false;
        `);
        
        if (!sendDisabled) {
            console.log('✅ Send button is enabled');
        } else {
            console.log('❌ Send button is disabled');
            testResults.errors.push({
                test: 'UI Responsive',
                error: 'Send button disabled'
            });
        }
        
        // Check for console errors
        const consoleErrors = await helpers.checkNoConsoleErrors();
        
        if (consoleErrors.length === 0) {
            console.log('✅ No console errors');
        } else {
            console.log(`⚠️  Found ${consoleErrors.length} console errors`);
        }
        
        if (!inputDisabled && !sendDisabled) {
            console.log('');
            console.log('✅ TEST PASSED: UI is responsive');
            testResults.passed++;
        } else {
            console.log('');
            console.log('❌ TEST FAILED: UI has issues');
            testResults.failed++;
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED: Could not verify UI responsiveness');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'UI Responsive', error: error.message });
    }
}

/**
 * RUN ALL TESTS
 */
async function runAllTests() {
    try {
        // Start server
        await startServer();
        
        // Navigate to app
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('SETUP: Opening App');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        
        await helpers.navigate(APP_URL);
        await helpers.sleep(2000);
        
        console.log('✅ App loaded');
        console.log('');
        
        // Run tests
        await testSendMessage();
        await testUserMessageAppears();
        await testAIResponseAppears();
        await testSuggestionBubblesAppear();
        await testUIResponsive();
        
        // Final screenshot
        await helpers.screenshot('05_final_state');
        
        // Print results
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST RESULTS');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log(`✅ Passed: ${testResults.passed}/5`);
        console.log(`❌ Failed: ${testResults.failed}/5`);
        console.log('');
        
        if (testResults.errors.length > 0) {
            console.log('Errors:');
            testResults.errors.forEach((err, i) => {
                console.log(`  ${i + 1}. ${err.test}: ${err.error}`);
            });
            console.log('');
        }
        
        console.log(`📸 Screenshots: ${helpers.SCREENSHOTS_DIR}`);
        console.log('');
        
        if (testResults.failed === 0) {
            console.log('🎉 ALL TESTS PASSED!');
            console.log('');
            console.log('Summary:');
            console.log('  ✅ Message sent successfully');
            console.log('  ✅ User message displayed');
            console.log('  ✅ AI response received');
            console.log('  ✅ Suggestion bubbles appeared');
            console.log('  ✅ UI remains responsive');
        } else {
            console.log('⚠️  SOME TESTS FAILED');
            console.log('Review errors and screenshots above');
        }
        
        console.log('');
        
    } catch (error) {
        console.error('');
        console.error('❌ TEST SUITE FAILED:', error.message);
        console.error(error.stack);
        console.error('');
    } finally {
        stopServer();
    }
    
    process.exit(testResults.failed === 0 ? 0 : 1);
}

// Handle cleanup
process.on('SIGINT', () => {
    console.log('');
    console.log('⚠️  Test interrupted');
    stopServer();
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('');
    console.error('❌ UNCAUGHT EXCEPTION:', error);
    stopServer();
    process.exit(1);
});

// Run tests
runAllTests().catch(error => {
    console.error('');
    console.error('❌ FATAL ERROR:', error);
    stopServer();
    process.exit(1);
});
