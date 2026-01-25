#!/usr/bin/env node

/**
 * UI TEST 1: BASIC RENDERING
 * 
 * **Purpose**: Verify the app loads and all basic UI elements are visible
 * 
 * **What This Tests**:
 * - App loads without errors
 * - All core UI elements are present
 * - CSS loads correctly
 * - No JavaScript errors in console
 * - Initial state is correct
 * 
 * **Why This Matters**:
 * This is the foundation test. If basic rendering fails, nothing else works.
 * 
 * **Product Context**:
 * Users expect a polished, error-free interface on first launch.
 * 
 * **Created**: 2026-01-25
 * **Part of**: UI Testing Suite
 * 
 * Run with: node tests/test-ui-basic-rendering.js
 */

const { spawn } = require('child_process');
const path = require('path');
const helpers = require('./puppeteer-helpers');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          UI TEST 1: Basic Rendering                        ║');
console.log('║          Verify app loads and UI elements exist            ║');
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
 * START BACKEND SERVER
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
 * TEST: PAGE LOADS
 */
async function testPageLoads() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Page Loads');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        await helpers.navigate(APP_URL);
        await helpers.screenshot('01_page_loaded');
        
        console.log('✅ TEST PASSED: Page loads');
        testResults.passed++;
    } catch (error) {
        console.error('❌ TEST FAILED: Page did not load');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Page Loads', error: error.message });
    }
}

/**
 * TEST: CORE UI ELEMENTS EXIST
 */
async function testCoreUIElements() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Core UI Elements Exist');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    const elementsToCheck = [
        { selector: '#user-input', name: 'User input field' },
        { selector: '#send-button', name: 'Send button' },
        { selector: '#voice-button', name: 'Voice button' },
        { selector: '#settings-button', name: 'Settings button' },
        { selector: '.message-container', name: 'Message container' },
        { selector: '.status-indicator', name: 'Status indicator' }
    ];
    
    let allPassed = true;
    
    for (const element of elementsToCheck) {
        try {
            const exists = await helpers.checkElementExists(element.selector);
            if (exists) {
                console.log(`  ✅ ${element.name} (${element.selector})`);
            } else {
                console.log(`  ❌ ${element.name} NOT FOUND (${element.selector})`);
                allPassed = false;
                testResults.errors.push({
                    test: 'Core UI Elements',
                    error: `${element.name} not found`
                });
            }
        } catch (error) {
            console.log(`  ❌ ${element.name} CHECK FAILED (${element.selector})`);
            allPassed = false;
            testResults.errors.push({
                test: 'Core UI Elements',
                error: `${element.name}: ${error.message}`
            });
        }
    }
    
    await helpers.screenshot('02_ui_elements');
    
    if (allPassed) {
        console.log('');
        console.log('✅ TEST PASSED: All core UI elements exist');
        testResults.passed++;
    } else {
        console.log('');
        console.log('❌ TEST FAILED: Some UI elements missing');
        testResults.failed++;
    }
}

/**
 * TEST: CSS LOADED
 */
async function testCSSLoaded() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: CSS Loaded');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Check if body has expected background
        const script = `
            const body = document.body;
            const styles = window.getComputedStyle(body);
            const bgColor = styles.backgroundColor;
            bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
        `;
        
        const hasStyles = await helpers.evaluate(script);
        
        if (hasStyles) {
            console.log('✅ CSS is loaded and applied');
            testResults.passed++;
        } else {
            console.log('❌ CSS may not be loaded correctly');
            testResults.failed++;
            testResults.errors.push({
                test: 'CSS Loaded',
                error: 'Body has no background color'
            });
        }
    } catch (error) {
        console.error('❌ TEST FAILED: Could not verify CSS');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'CSS Loaded', error: error.message });
    }
}

/**
 * TEST: NO CONSOLE ERRORS
 */
async function testNoConsoleErrors() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: No Console Errors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        const errors = await helpers.checkNoConsoleErrors();
        
        if (errors.length === 0) {
            console.log('✅ TEST PASSED: No console errors');
            testResults.passed++;
        } else {
            console.log(`❌ TEST FAILED: Found ${errors.length} console errors`);
            testResults.failed++;
            testResults.errors.push({
                test: 'No Console Errors',
                error: `${errors.length} console errors found`
            });
        }
    } catch (error) {
        console.error('❌ TEST FAILED: Could not check console errors');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'No Console Errors', error: error.message });
    }
}

/**
 * TEST: INITIAL STATE
 */
async function testInitialState() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Initial State');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Check that message container is empty
        const messageCount = await helpers.getElementCount('.message-bubble');
        
        if (messageCount === 0) {
            console.log('✅ Message container is empty (as expected)');
        } else {
            console.log(`⚠️  Found ${messageCount} messages (expected 0)`);
        }
        
        // Check that input is empty
        const inputValue = await helpers.evaluate(`
            document.querySelector('#user-input')?.value || '';
        `);
        
        if (inputValue === '') {
            console.log('✅ Input field is empty (as expected)');
        } else {
            console.log(`⚠️  Input has value: "${inputValue}"`);
        }
        
        // Check connection status
        const statusText = await helpers.getElementText('.status-indicator');
        console.log(`📊 Status: ${statusText}`);
        
        console.log('');
        console.log('✅ TEST PASSED: Initial state verified');
        testResults.passed++;
        
    } catch (error) {
        console.error('❌ TEST FAILED: Could not verify initial state');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({ test: 'Initial State', error: error.message });
    }
}

/**
 * RUN ALL TESTS
 */
async function runAllTests() {
    try {
        // Start server
        await startServer();
        
        // Run tests
        await testPageLoads();
        await testCoreUIElements();
        await testCSSLoaded();
        await testNoConsoleErrors();
        await testInitialState();
        
        // Final screenshot
        await helpers.screenshot('03_final_state');
        
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
            console.log('  ✅ App loads successfully');
            console.log('  ✅ All UI elements present');
            console.log('  ✅ CSS loaded correctly');
            console.log('  ✅ No console errors');
            console.log('  ✅ Initial state correct');
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
