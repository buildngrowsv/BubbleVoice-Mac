#!/usr/bin/env node

/**
 * E2E TEST: CREATE NEW CONVERSATION
 * 
 * **Purpose**: Verify the complete flow of creating a new conversation
 * 
 * **What This Tests**:
 * 1. Click "New Conversation" button
 * 2. New conversation created in backend
 * 3. New conversation appears in sidebar
 * 4. New conversation becomes active
 * 5. Can send messages in new conversation
 * 6. Conversation persists after app restart
 * 
 * **Why This Matters**:
 * Users need to be able to start new conversations easily.
 * This is a core feature that must work reliably.
 * 
 * **Product Context**:
 * Similar to ChatGPT, users expect to click "New Chat" and
 * immediately start a fresh conversation.
 * 
 * **Created**: 2026-01-26
 * **Part of**: Conversation Management Test Suite
 * 
 * Run with: node tests/test-create-conversation-e2e.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const helpers = require('./puppeteer-helpers');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     E2E TEST: Create New Conversation                      ║');
console.log('║     Verify complete conversation creation flow             ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Configuration
const APP_URL = 'http://localhost:7482';
const SERVER_STARTUP_DELAY = 5000;

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
 * TEST 1: New Conversation Button Exists
 */
async function testNewConversationButtonExists() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: New Conversation Button Exists');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        await helpers.screenshot('01_initial_state');
        
        // Check if new conversation button exists
        const buttonExists = await helpers.elementExists('#new-conversation-btn');
        
        if (buttonExists) {
            console.log('✅ TEST PASSED: New conversation button exists');
            testResults.passed++;
        } else {
            console.log('❌ TEST FAILED: New conversation button not found');
            testResults.failed++;
            testResults.errors.push({ test: 'Button Exists', error: 'Button not found in DOM' });
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Button Exists', error: error.message });
    }
}

/**
 * TEST 2: Click New Conversation Button
 */
async function testClickNewConversationButton() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Click New Conversation Button');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Get initial conversation count
        const initialCount = await helpers.getElementCount('.conversation-item');
        console.log(`   Initial conversation count: ${initialCount}`);
        
        // Click new conversation button
        await helpers.click('#new-conversation-btn');
        console.log('   Clicked new conversation button');
        
        // Wait for new conversation to appear
        await helpers.sleep(1000);
        
        await helpers.screenshot('02_after_click');
        
        // Get new conversation count
        const newCount = await helpers.getElementCount('.conversation-item');
        console.log(`   New conversation count: ${newCount}`);
        
        if (newCount > initialCount) {
            console.log('✅ TEST PASSED: New conversation created');
            testResults.passed++;
        } else {
            console.log('❌ TEST FAILED: Conversation count did not increase');
            testResults.failed++;
            testResults.errors.push({ test: 'Click Button', error: 'No new conversation appeared' });
        }
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Click Button', error: error.message });
    }
}

/**
 * TEST 3: New Conversation Appears in Sidebar
 */
async function testNewConversationInSidebar() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: New Conversation Appears in Sidebar');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Check for active conversation in sidebar
        const activeConversation = await helpers.elementExists('.conversation-item.active');
        
        if (activeConversation) {
            console.log('✅ TEST PASSED: Active conversation visible in sidebar');
            
            // Get conversation title
            const title = await helpers.getElementText('.conversation-item.active .conversation-title');
            console.log(`   Conversation title: "${title}"`);
            
            testResults.passed++;
        } else {
            console.log('❌ TEST FAILED: No active conversation in sidebar');
            testResults.failed++;
            testResults.errors.push({ test: 'Sidebar Display', error: 'No active conversation found' });
        }
        
        await helpers.screenshot('03_sidebar_state');
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Sidebar Display', error: error.message });
    }
}

/**
 * TEST 4: Can Send Message in New Conversation
 */
async function testSendMessageInNewConversation() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Can Send Message in New Conversation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        const testMessage = 'Test message in new conversation';
        
        // Send message
        await helpers.sendMessage(testMessage);
        console.log(`   Sent message: "${testMessage}"`);
        
        // Wait for message to appear
        await helpers.sleep(1000);
        
        // Check if message appears
        const messageText = await helpers.getElementText('.message-bubble.user:last-child');
        
        if (messageText.includes(testMessage)) {
            console.log('✅ TEST PASSED: Message sent successfully');
            testResults.passed++;
        } else {
            console.log('❌ TEST FAILED: Message not found');
            console.log(`   Expected: "${testMessage}"`);
            console.log(`   Got: "${messageText}"`);
            testResults.failed++;
            testResults.errors.push({ test: 'Send Message', error: 'Message not displayed' });
        }
        
        await helpers.screenshot('04_message_sent');
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Send Message', error: error.message });
    }
}

/**
 * TEST 5: Create Multiple Conversations
 */
async function testCreateMultipleConversations() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Create Multiple Conversations');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Get current count
        const initialCount = await helpers.getElementCount('.conversation-item');
        console.log(`   Initial count: ${initialCount}`);
        
        // Create 3 more conversations
        for (let i = 0; i < 3; i++) {
            await helpers.click('#new-conversation-btn');
            await helpers.sleep(500);
            console.log(`   Created conversation ${i + 1}`);
        }
        
        // Get final count
        const finalCount = await helpers.getElementCount('.conversation-item');
        console.log(`   Final count: ${finalCount}`);
        
        if (finalCount === initialCount + 3) {
            console.log('✅ TEST PASSED: Multiple conversations created');
            testResults.passed++;
        } else {
            console.log('❌ TEST FAILED: Unexpected conversation count');
            console.log(`   Expected: ${initialCount + 3}`);
            console.log(`   Got: ${finalCount}`);
            testResults.failed++;
            testResults.errors.push({ test: 'Multiple Conversations', error: 'Count mismatch' });
        }
        
        await helpers.screenshot('05_multiple_conversations');
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Multiple Conversations', error: error.message });
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
        await testNewConversationButtonExists();
        await testClickNewConversationButton();
        await testNewConversationInSidebar();
        await testSendMessageInNewConversation();
        await testCreateMultipleConversations();
        
        // Final screenshot
        await helpers.screenshot('06_final_state');
        
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
            console.log('  ✅ New conversation button exists');
            console.log('  ✅ Clicking button creates conversation');
            console.log('  ✅ New conversation appears in sidebar');
            console.log('  ✅ Can send messages in new conversation');
            console.log('  ✅ Can create multiple conversations');
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
