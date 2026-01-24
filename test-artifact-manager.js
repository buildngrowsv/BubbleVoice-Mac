#!/usr/bin/env node

/**
 * ARTIFACT MANAGER SERVICE TEST SCRIPT
 * 
 * Tests artifact creation, storage, and HTML quality.
 * Run with: node test-artifact-manager.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const ConversationStorageService = require('./src/backend/services/ConversationStorageService');
const ArtifactManagerService = require('./src/backend/services/ArtifactManagerService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        ArtifactManagerService Test Script                  ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database and directory
const testDbPath = path.join(__dirname, 'user_data', 'test.db');
const testConversationsDir = path.join(__dirname, 'user_data', 'conversations');

// Clean up
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old test database');
}

if (fs.existsSync(testConversationsDir)) {
    fs.rmSync(testConversationsDir, { recursive: true, force: true });
    console.log('🗑️  Removed old test conversations');
}

// Initialize services
console.log('📦 Initializing services...');
const db = new DatabaseService(testDbPath);
db.initialize();

const convStorage = new ConversationStorageService(db, testConversationsDir);
const artifactManager = new ArtifactManagerService(db, testConversationsDir);

async function runTests() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Create Conversation for Artifacts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await convStorage.createConversation(
        'conv_artifacts_test',
        'Artifact Testing Conversation'
    );
    
    console.log('✅ Created test conversation');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Save Artifact with Auto-Generated ID');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Test auto-ID generation (artifact_id missing)
    const artifact1 = await artifactManager.saveArtifact(
        'conv_artifacts_test',
        {
            action: 'create',
            // artifact_id: MISSING (should auto-generate)
            artifact_type: 'stress_map',
            html: '<html><body><h1>Test</h1></body></html>'
        },
        1
    );
    
    if (artifact1 && artifact1.artifact_id) {
        console.log(`✅ Auto-generated artifact_id: ${artifact1.artifact_id}`);
    } else {
        console.log('❌ FAIL: Artifact not saved');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Save Artifact with Manual ID');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const artifact2 = await artifactManager.saveArtifact(
        'conv_artifacts_test',
        {
            action: 'create',
            artifact_id: 'manual_artifact_123',
            artifact_type: 'checklist',
            html: '<html><body><h1>Manual ID Test</h1></body></html>'
        },
        2
    );
    
    console.log(`✅ Saved artifact with manual ID: ${artifact2.artifact_id}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Save Data Artifact (HTML + JSON)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const artifact3 = await artifactManager.saveArtifact(
        'conv_artifacts_test',
        {
            action: 'create',
            artifact_id: 'goal_tracker_test',
            artifact_type: 'goal_tracker',
            html: '<html><body><h1>Goal Tracker</h1></body></html>',
            data: {
                goals: [
                    { title: 'Read 3x per week', progress: 75 },
                    { title: 'Exercise daily', progress: 50 }
                ]
            }
        },
        3
    );
    
    console.log(`✅ Saved data artifact: ${artifact3.artifact_id}`);
    console.log(`   Has JSON: ${artifact3.has_data}`);
    
    // Verify JSON file exists
    const jsonPath = path.join(testConversationsDir, 'conv_artifacts_test', 'artifacts', 'goal_tracker_test.json');
    const jsonExists = fs.existsSync(jsonPath);
    console.log(`✅ JSON file created: ${jsonExists}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: List Artifacts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const artifactList = await artifactManager.listArtifacts('conv_artifacts_test');
    
    console.log(`✅ Found ${artifactList.length} artifacts:`);
    artifactList.forEach(id => console.log(`   - ${id}`));
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Read Artifact');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const readArtifact = await artifactManager.readArtifact('conv_artifacts_test', 'goal_tracker_test');
    
    console.log(`✅ Read artifact: ${readArtifact.artifact_id}`);
    console.log(`   Has HTML: ${!!readArtifact.html}`);
    console.log(`   Has data: ${readArtifact.has_data}`);
    console.log(`   Data goals: ${readArtifact.data?.goals?.length || 0}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Render Template - Stress Map');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const stressMapHtml = await artifactManager.renderArtifactTemplate('stress_map', {
        title: 'Current Stressors',
        subtitle: 'What\'s on your mind',
        stressors: [
            {
                icon: '👨‍👩‍👧‍👦',
                title: 'Family',
                description: 'Emma\'s reading struggles, Max\'s soccer schedule',
                intensity: 'High'
            },
            {
                icon: '💼',
                title: 'Work',
                description: 'Startup fundraising, team hiring challenges',
                intensity: 'Very High'
            },
            {
                icon: '🏃‍♀️',
                title: 'Personal',
                description: 'Exercise goals, work-life balance',
                intensity: 'Medium'
            }
        ]
    });
    
    console.log(`✅ Rendered stress_map template (${stressMapHtml.length} chars)`);
    
    // Save rendered artifact
    const artifact4 = await artifactManager.saveArtifact(
        'conv_artifacts_test',
        {
            action: 'create',
            artifact_type: 'stress_map',
            html: stressMapHtml
        },
        4
    );
    
    console.log(`✅ Saved rendered artifact: ${artifact4.artifact_id}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 8: HTML Quality Check');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check for liquid glass styling elements
    const hasBackdropFilter = stressMapHtml.includes('backdrop-filter');
    const hasBlur = stressMapHtml.includes('blur');
    const hasBorderRadius = stressMapHtml.includes('border-radius');
    const hasBoxShadow = stressMapHtml.includes('box-shadow');
    const hasGradient = stressMapHtml.includes('linear-gradient') || stressMapHtml.includes('radial-gradient');
    const hasHover = stressMapHtml.includes(':hover');
    const hasTransition = stressMapHtml.includes('transition');
    
    console.log('Liquid Glass Styling:');
    console.log(`  ✅ backdrop-filter: ${hasBackdropFilter}`);
    console.log(`  ✅ blur effect: ${hasBlur}`);
    console.log(`  ✅ border-radius: ${hasBorderRadius}`);
    console.log(`  ✅ box-shadow: ${hasBoxShadow}`);
    console.log(`  ✅ gradient: ${hasGradient}`);
    console.log(`  ✅ hover states: ${hasHover}`);
    console.log(`  ✅ transitions: ${hasTransition}`);
    
    const qualityScore = [hasBackdropFilter, hasBlur, hasBorderRadius, hasBoxShadow, hasGradient, hasHover, hasTransition]
        .filter(Boolean).length;
    
    console.log('');
    console.log(`📊 Quality Score: ${qualityScore}/7`);
    
    if (qualityScore >= 6) {
        console.log('✅ HTML meets quality standards');
    } else {
        console.log('⚠️  HTML quality could be improved');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 9: Create Artifacts Index');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await artifactManager.createArtifactsIndex('conv_artifacts_test');
    
    const indexPath = path.join(testConversationsDir, 'conv_artifacts_test', 'artifacts', '_INDEX.md');
    const indexExists = fs.existsSync(indexPath);
    
    console.log(`✅ Index created: ${indexExists}`);
    
    if (indexExists) {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        console.log(`   Total artifacts in index: ${(indexContent.match(/## /g) || []).length - 1}`);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 10: File Structure Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const artifactsDir = path.join(testConversationsDir, 'conv_artifacts_test', 'artifacts');
    const files = fs.readdirSync(artifactsDir);
    
    console.log(`📁 Artifacts folder contains ${files.length} files:`);
    files.forEach(file => {
        const size = fs.statSync(path.join(artifactsDir, file)).size;
        console.log(`   - ${file} (${size} bytes)`);
    });
    
    // Count HTML vs JSON files
    const htmlCount = files.filter(f => f.endsWith('.html')).length;
    const jsonCount = files.filter(f => f.endsWith('.json')).length;
    
    console.log('');
    console.log(`📊 HTML files: ${htmlCount}`);
    console.log(`📊 JSON files: ${jsonCount}`);
    console.log(`📊 Index files: ${files.filter(f => f.startsWith('_')).length}`);
    
    // Close database
    db.close();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('ALL TESTS COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Artifacts created at: ${artifactsDir}`);
    console.log('You can open the HTML files in a browser to see the visual quality.');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ TEST FAILED:', error);
    console.error('');
    process.exit(1);
});
