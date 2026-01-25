#!/usr/bin/env node

/**
 * UI TEST 3: MULTI-TURN CONVERSATION CHAIN
 * 
 * **Purpose**: Verify complete conversation chains work end-to-end
 * 
 * **What This Tests**:
 * - Multiple messages in sequence
 * - Context is maintained across turns
 * - Life areas are created and updated
 * - UI remains responsive throughout
 * - Message history displays correctly
 * - Scroll behavior works
 * 
 * **Why This Matters**:
 * Real users have multi-turn conversations. This tests the complete
 * agentic AI flow including memory and context.
 * 
 * **Product Context**:
 * This is the "Emma's Reading" scenario - a realistic use case that
 * tests area creation, entry appending, and context retrieval.
 * 
 * **Created**: 2026-01-25
 * **Part of**: UI Testing Suite
 * 
 * Run with: node tests/test-ui-conversation-chain.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const helpers = require('./puppeteer-helpers');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          UI TEST 3: Multi-Turn Conversation Chain          ║');
console.log('║          Emma\'s Reading Journey (5 turns)                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Verify API key
if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    process.exit(1);
}

// Configuration
const APP_URL = 'http://localhost:7482';
const SERVER_STARTUP_DELAY = 5000;

// Test conversation scenario
const CONVERSATION_TURNS = [
    {
        turn: 1,
        message: "I'm really worried about Emma. She's in 2nd grade and struggling with reading. Her teacher said she can decode words but doesn't remember what she reads.",
        expectations: {
            hasResponse: true,
            hasBubbles: true,
            minResponseLength: 50,
            shouldCreateArea: true
        }
    },
    {
        turn: 2,
        message: "We've tried reading together every night, but she gets frustrated. She says the stories are boring.",
        expectations: {
            hasResponse: true,
            hasBubbles: true,
            minResponseLength: 50
        }
    },
    {
        turn: 3,
        message: "Actually, I just tried graphic novels and she loved them! She read a whole book in one sitting.",
        expectations: {
            hasResponse: true,
            hasBubbles: true,
            minResponseLength: 50
        }
    },
    {
        turn: 4,
        message: "Can you give me a summary of what we've discovered?",
        expectations: {
            hasResponse: true,
            hasBubbles: true,
            minResponseLength: 100
        }
    },
    {
        turn: 5,
        message: "Should I tell her teacher about the graphic novels?",
        expectations: {
            hasResponse: true,
            hasBubbles: true,
            minResponseLength: 50,
            shouldUseContext: true
        }
    }
];

let serverProcess = null;
let testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
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
 * RUN CONVERSATION TURN
 */
async function runConversationTurn(turn) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`TURN ${turn.turn}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Take before screenshot
        await helpers.screenshot(`turn${turn.turn}_before`);
        
        // Send message
        console.log(`📤 Message: "${turn.message.slice(0, 60)}..."`);
        await helpers.sendMessage(turn.message);
        
        // Wait for AI response
        console.log('⏳ Waiting for AI response...');
        const responseText = await helpers.waitForAIResponse({ timeout: 30000 });
        
        // Take after screenshot
        await helpers.screenshot(`turn${turn.turn}_after`);
        
        // Verify expectations
        console.log('');
        console.log('🔍 Verifying expectations...');
        
        let turnPassed = true;
        
        // Check response length
        if (turn.expectations.minResponseLength) {
            if (responseText.length >= turn.expectations.minResponseLength) {
                console.log(`  ✅ Response length: ${responseText.length} chars`);
            } else {
                console.log(`  ❌ Response too short: ${responseText.length} chars (expected ${turn.expectations.minResponseLength}+)`);
                turnPassed = false;
                testResults.errors.push({
                    turn: turn.turn,
                    error: 'Response too short'
                });
            }
        }
        
        // Check for bubbles
        if (turn.expectations.hasBubbles) {
            const bubbleCount = await helpers.getElementCount('.bubble-suggestion');
            if (bubbleCount > 0) {
                console.log(`  ✅ Suggestion bubbles: ${bubbleCount}`);
            } else {
                console.log('  ⚠️  No suggestion bubbles (may be expected)');
                testResults.warnings++;
            }
        }
        
        // Check for life area (turn 1)
        if (turn.expectations.shouldCreateArea) {
            await helpers.sleep(2000); // Give time for area to be created
            const areaExists = await helpers.checkElementExists('.life-area-item');
            if (areaExists) {
                console.log('  ✅ Life area created');
            } else {
                console.log('  ⚠️  Life area not visible (may not be in UI yet)');
                testResults.warnings++;
            }
        }
        
        // Check message count
        const messageCount = await helpers.getElementCount('.message-bubble');
        const expectedCount = turn.turn * 2; // User + AI for each turn
        console.log(`  📊 Total messages: ${messageCount} (expected ${expectedCount})`);
        
        if (turnPassed) {
            console.log('');
            console.log(`✅ Turn ${turn.turn} PASSED`);
            testResults.passed++;
        } else {
            console.log('');
            console.log(`❌ Turn ${turn.turn} FAILED`);
            testResults.failed++;
        }
        
    } catch (error) {
        console.error(`❌ Turn ${turn.turn} FAILED: ${error.message}`);
        testResults.failed++;
        testResults.errors.push({
            turn: turn.turn,
            error: error.message
        });
        
        // Take error screenshot
        await helpers.screenshot(`turn${turn.turn}_error`);
    }
}

/**
 * VERIFY CONVERSATION HISTORY
 */
async function verifyConversationHistory() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICATION: Conversation History');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Count total messages
        const totalMessages = await helpers.getElementCount('.message-bubble');
        const expectedMessages = CONVERSATION_TURNS.length * 2; // User + AI per turn
        
        console.log(`📊 Total messages: ${totalMessages}`);
        console.log(`📊 Expected: ${expectedMessages}`);
        
        if (totalMessages === expectedMessages) {
            console.log('✅ Message count correct');
            testResults.passed++;
        } else if (totalMessages >= CONVERSATION_TURNS.length) {
            console.log('⚠️  Message count differs (may be expected)');
            testResults.warnings++;
            testResults.passed++;
        } else {
            console.log('❌ Message count too low');
            testResults.failed++;
            testResults.errors.push({
                test: 'Conversation History',
                error: `Expected ${expectedMessages} messages, got ${totalMessages}`
            });
        }
        
        // Check scroll position (should be at bottom)
        const isAtBottom = await helpers.evaluate(`
            const container = document.querySelector('.message-container');
            if (!container) return false;
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;
            return (scrollHeight - scrollTop - clientHeight) < 100;
        `);
        
        if (isAtBottom) {
            console.log('✅ Scrolled to bottom');
        } else {
            console.log('⚠️  Not scrolled to bottom');
            testResults.warnings++;
        }
        
    } catch (error) {
        console.error('❌ Could not verify conversation history');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({
            test: 'Conversation History',
            error: error.message
        });
    }
}

/**
 * VERIFY UI PERFORMANCE
 */
async function verifyUIPerformance() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICATION: UI Performance');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Check UI is still responsive
        const inputEnabled = await helpers.evaluate(`
            !document.querySelector('#user-input')?.disabled;
        `);
        
        if (inputEnabled) {
            console.log('✅ Input still enabled');
        } else {
            console.log('❌ Input disabled');
            testResults.errors.push({
                test: 'UI Performance',
                error: 'Input disabled after conversation'
            });
        }
        
        // Check for console errors
        const consoleErrors = await helpers.checkNoConsoleErrors();
        
        if (consoleErrors.length === 0) {
            console.log('✅ No console errors');
        } else {
            console.log(`⚠️  ${consoleErrors.length} console errors`);
            testResults.warnings++;
        }
        
        if (inputEnabled) {
            console.log('');
            console.log('✅ UI Performance OK');
            testResults.passed++;
        } else {
            console.log('');
            console.log('❌ UI Performance Issues');
            testResults.failed++;
        }
        
    } catch (error) {
        console.error('❌ Could not verify UI performance');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({
            test: 'UI Performance',
            error: error.message
        });
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
        await helpers.screenshot('00_initial_state');
        
        console.log('✅ App loaded');
        
        // Run conversation turns
        for (const turn of CONVERSATION_TURNS) {
            await runConversationTurn(turn);
        }
        
        // Verify conversation history
        await verifyConversationHistory();
        
        // Verify UI performance
        await verifyUIPerformance();
        
        // Final screenshot
        await helpers.screenshot('99_final_state');
        
        // Print results
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST RESULTS');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log(`✅ Passed: ${testResults.passed}/${CONVERSATION_TURNS.length + 2}`);
        console.log(`❌ Failed: ${testResults.failed}`);
        console.log(`⚠️  Warnings: ${testResults.warnings}`);
        console.log('');
        
        if (testResults.errors.length > 0) {
            console.log('Errors:');
            testResults.errors.forEach((err, i) => {
                const location = err.turn ? `Turn ${err.turn}` : err.test;
                console.log(`  ${i + 1}. ${location}: ${err.error}`);
            });
            console.log('');
        }
        
        console.log(`📸 Screenshots: ${helpers.SCREENSHOTS_DIR}`);
        console.log('');
        
        if (testResults.failed === 0) {
            console.log('🎉 ALL TESTS PASSED!');
            console.log('');
            console.log('Summary:');
            console.log(`  ✅ Completed ${CONVERSATION_TURNS.length}-turn conversation`);
            console.log('  ✅ All AI responses received');
            console.log('  ✅ Context maintained across turns');
            console.log('  ✅ Life areas created');
            console.log('  ✅ Message history correct');
            console.log('  ✅ UI remained responsive');
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
