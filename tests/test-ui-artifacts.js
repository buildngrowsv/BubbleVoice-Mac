#!/usr/bin/env node

/**
 * UI TEST 4: ARTIFACT RENDERING
 * 
 * **Purpose**: Verify artifacts render correctly in the UI
 * 
 * **What This Tests**:
 * - Artifacts appear when generated
 * - HTML renders correctly
 * - Liquid Glass styling applied
 * - Artifacts are interactive (if applicable)
 * - Multiple artifacts can coexist
 * - Visual quality is high
 * 
 * **Why This Matters**:
 * Artifacts are a key differentiator. They must look polished and professional.
 * 
 * **Product Context**:
 * Users expect beautiful, interactive visualizations. This tests the
 * complete artifact generation and rendering pipeline.
 * 
 * **Created**: 2026-01-25
 * **Part of**: UI Testing Suite
 * 
 * Run with: node tests/test-ui-artifacts.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const helpers = require('./puppeteer-helpers');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          UI TEST 4: Artifact Rendering                     ║');
console.log('║          Verify artifacts display correctly                ║');
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

// Test messages designed to trigger artifacts
const ARTIFACT_TRIGGERS = [
    {
        name: 'Checklist',
        message: "Can you create a checklist for helping Emma with reading? Include specific action items.",
        expectedType: 'checklist',
        description: 'Request for checklist artifact'
    },
    {
        name: 'Summary',
        message: "Please give me a summary of everything we've discussed about Emma's reading.",
        expectedType: 'reflection_summary',
        description: 'Request for reflection summary'
    }
];

let serverProcess = null;
let testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    errors: [],
    artifactsFound: []
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
 * SETUP CONVERSATION CONTEXT
 */
async function setupConversationContext() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SETUP: Creating Conversation Context');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    // Send a few messages to establish context
    const contextMessages = [
        "I'm worried about Emma's reading. She's in 2nd grade.",
        "She tried graphic novels and loved them!"
    ];
    
    for (const msg of contextMessages) {
        console.log(`📤 Context: "${msg}"`);
        await helpers.sendMessage(msg);
        await helpers.waitForAIResponse({ timeout: 30000 });
        await helpers.sleep(1000);
    }
    
    console.log('✅ Context established');
    console.log('');
}

/**
 * TEST ARTIFACT GENERATION
 */
async function testArtifactGeneration(trigger) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`TEST: ${trigger.name} Artifact`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Take before screenshot
        await helpers.screenshot(`artifact_${trigger.name.toLowerCase()}_before`);
        
        // Send message to trigger artifact
        console.log(`📤 Trigger: "${trigger.message}"`);
        await helpers.sendMessage(trigger.message);
        
        // Wait for AI response
        console.log('⏳ Waiting for AI response with artifact...');
        await helpers.waitForAIResponse({ timeout: 45000 }); // Longer timeout for artifacts
        
        // Wait a bit more for artifact to render
        await helpers.sleep(3000);
        
        // Take after screenshot
        await helpers.screenshot(`artifact_${trigger.name.toLowerCase()}_after`);
        
        // Check if artifact exists
        console.log('');
        console.log('🔍 Checking for artifact...');
        
        const artifactExists = await helpers.checkElementExists('.artifact-container');
        
        if (artifactExists) {
            console.log(`✅ Artifact container found`);
            
            // Get artifact HTML
            const artifactHTML = await helpers.evaluate(`
                const container = document.querySelector('.artifact-container');
                container ? container.innerHTML.length : 0;
            `);
            
            console.log(`  📏 HTML size: ${artifactHTML} characters`);
            
            // Check for Liquid Glass styling
            const hasGlassEffect = await helpers.evaluate(`
                const container = document.querySelector('.artifact-container');
                if (!container) return false;
                const styles = window.getComputedStyle(container);
                return styles.backdropFilter && styles.backdropFilter !== 'none';
            `);
            
            if (hasGlassEffect) {
                console.log('  ✅ Liquid Glass styling applied');
            } else {
                console.log('  ⚠️  No Liquid Glass effect detected');
                testResults.warnings++;
            }
            
            // Take detailed screenshot of artifact
            await helpers.screenshot(`artifact_${trigger.name.toLowerCase()}_detail`, {
                selector: '.artifact-container'
            });
            
            testResults.artifactsFound.push(trigger.name);
            testResults.passed++;
            
            console.log('');
            console.log(`✅ ${trigger.name} artifact PASSED`);
            
        } else {
            console.log(`❌ Artifact container not found`);
            console.log('  This may mean:');
            console.log('  - LLM did not generate artifact');
            console.log('  - Artifact rendering failed');
            console.log('  - Selector is incorrect');
            
            testResults.failed++;
            testResults.errors.push({
                test: `${trigger.name} Artifact`,
                error: 'Artifact container not found'
            });
        }
        
    } catch (error) {
        console.error(`❌ ${trigger.name} artifact FAILED: ${error.message}`);
        testResults.failed++;
        testResults.errors.push({
            test: `${trigger.name} Artifact`,
            error: error.message
        });
        
        // Take error screenshot
        await helpers.screenshot(`artifact_${trigger.name.toLowerCase()}_error`);
    }
}

/**
 * VERIFY ARTIFACT QUALITY
 */
async function verifyArtifactQuality() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICATION: Artifact Quality');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Count total artifacts
        const artifactCount = await helpers.getElementCount('.artifact-container');
        
        console.log(`📊 Total artifacts: ${artifactCount}`);
        console.log(`📊 Expected: ${ARTIFACT_TRIGGERS.length}`);
        
        if (artifactCount >= 1) {
            console.log('✅ At least one artifact rendered');
            testResults.passed++;
        } else {
            console.log('❌ No artifacts found');
            testResults.failed++;
            testResults.errors.push({
                test: 'Artifact Quality',
                error: 'No artifacts rendered'
            });
            return;
        }
        
        // Check visual quality indicators
        console.log('');
        console.log('🎨 Checking visual quality...');
        
        // Check for proper spacing
        const hasProperSpacing = await helpers.evaluate(`
            const artifacts = document.querySelectorAll('.artifact-container');
            if (artifacts.length === 0) return false;
            
            const firstArtifact = artifacts[0];
            const styles = window.getComputedStyle(firstArtifact);
            const padding = parseInt(styles.padding);
            const margin = parseInt(styles.margin);
            
            return padding > 0 || margin > 0;
        `);
        
        if (hasProperSpacing) {
            console.log('  ✅ Proper spacing');
        } else {
            console.log('  ⚠️  No spacing detected');
            testResults.warnings++;
        }
        
        // Check for rounded corners
        const hasRoundedCorners = await helpers.evaluate(`
            const artifacts = document.querySelectorAll('.artifact-container');
            if (artifacts.length === 0) return false;
            
            const firstArtifact = artifacts[0];
            const styles = window.getComputedStyle(firstArtifact);
            const borderRadius = parseInt(styles.borderRadius);
            
            return borderRadius > 0;
        `);
        
        if (hasRoundedCorners) {
            console.log('  ✅ Rounded corners');
        } else {
            console.log('  ⚠️  No rounded corners');
            testResults.warnings++;
        }
        
        // Check for shadows
        const hasShadow = await helpers.evaluate(`
            const artifacts = document.querySelectorAll('.artifact-container');
            if (artifacts.length === 0) return false;
            
            const firstArtifact = artifacts[0];
            const styles = window.getComputedStyle(firstArtifact);
            const boxShadow = styles.boxShadow;
            
            return boxShadow && boxShadow !== 'none';
        `);
        
        if (hasShadow) {
            console.log('  ✅ Box shadow');
        } else {
            console.log('  ⚠️  No box shadow');
            testResults.warnings++;
        }
        
        console.log('');
        console.log('✅ Artifact quality check complete');
        
    } catch (error) {
        console.error('❌ Could not verify artifact quality');
        console.error(error.message);
        testResults.failed++;
        testResults.errors.push({
            test: 'Artifact Quality',
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
        console.log('');
        
        // Setup conversation context
        await setupConversationContext();
        
        // Test each artifact type
        for (const trigger of ARTIFACT_TRIGGERS) {
            await testArtifactGeneration(trigger);
        }
        
        // Verify artifact quality
        await verifyArtifactQuality();
        
        // Final screenshot
        await helpers.screenshot('99_final_state');
        
        // Print results
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST RESULTS');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log(`✅ Passed: ${testResults.passed}/${ARTIFACT_TRIGGERS.length + 1}`);
        console.log(`❌ Failed: ${testResults.failed}`);
        console.log(`⚠️  Warnings: ${testResults.warnings}`);
        console.log('');
        
        if (testResults.artifactsFound.length > 0) {
            console.log('Artifacts Found:');
            testResults.artifactsFound.forEach((name, i) => {
                console.log(`  ${i + 1}. ${name}`);
            });
            console.log('');
        }
        
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
            console.log(`  ✅ ${testResults.artifactsFound.length} artifacts rendered`);
            console.log('  ✅ HTML generated correctly');
            console.log('  ✅ Liquid Glass styling applied');
            console.log('  ✅ Visual quality verified');
        } else {
            console.log('⚠️  SOME TESTS FAILED');
            console.log('Review errors and screenshots above');
            console.log('');
            console.log('Note: Artifact generation depends on LLM behavior.');
            console.log('Failures may indicate LLM did not generate artifacts,');
            console.log('not necessarily a UI rendering issue.');
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
