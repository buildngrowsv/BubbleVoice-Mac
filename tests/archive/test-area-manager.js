#!/usr/bin/env node

/**
 * AREA MANAGER SERVICE TEST SCRIPT
 * 
 * Tests the Life Areas hierarchy system.
 * Run with: node test-area-manager.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const AreaManagerService = require('./src/backend/services/AreaManagerService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          AreaManagerService Test Script                    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database and directory
const testDbPath = path.join(__dirname, 'user_data', 'test.db');
const testUserDataDir = path.join(__dirname, 'user_data');

// Clean up old test database
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old test database');
}

// Clean up old test areas
const testAreasDir = path.join(testUserDataDir, 'life_areas');
if (fs.existsSync(testAreasDir)) {
    fs.rmSync(testAreasDir, { recursive: true, force: true });
    console.log('🗑️  Removed old test areas');
}

// Initialize services
console.log('📦 Initializing services...');
const db = new DatabaseService(testDbPath);
db.initialize();

const areaManager = new AreaManagerService(db, testUserDataDir);

async function runTests() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Initialize Life Areas');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await areaManager.initializeLifeAreas();
    
    // Check if directory exists
    const dirExists = fs.existsSync(testAreasDir);
    console.log(`✅ Life areas directory created: ${dirExists}`);
    
    // Check if index exists
    const indexPath = path.join(testAreasDir, '_AREAS_INDEX.md');
    const indexExists = fs.existsSync(indexPath);
    console.log(`✅ Master index created: ${indexExists}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Create Area');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const area = await areaManager.createArea(
        'Family/Emma_School',
        "Emma's School",
        "Tracking Emma's reading struggles and school progress",
        ['reading_comprehension.md', 'teacher_meetings.md', 'wins.md']
    );
    
    console.log(`✅ Created area: ${area.path}`);
    console.log(`   Documents created: ${area.documentsCreated}`);
    
    // Verify folder exists
    const areaPath = path.join(testAreasDir, 'Family', 'Emma_School');
    const areaExists = fs.existsSync(areaPath);
    console.log(`✅ Area folder exists: ${areaExists}`);
    
    // Verify summary exists
    const summaryPath = path.join(areaPath, '_AREA_SUMMARY.md');
    const summaryExists = fs.existsSync(summaryPath);
    console.log(`✅ Area summary exists: ${summaryExists}`);
    
    // Verify documents exist
    const doc1Exists = fs.existsSync(path.join(areaPath, 'reading_comprehension.md'));
    const doc2Exists = fs.existsSync(path.join(areaPath, 'teacher_meetings.md'));
    const doc3Exists = fs.existsSync(path.join(areaPath, 'wins.md'));
    console.log(`✅ Documents created: ${doc1Exists && doc2Exists && doc3Exists}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Append Entry (Newest First)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Add first entry
    const entry1 = await areaManager.appendEntry(
        'Family/Emma_School',
        'reading_comprehension.md',
        {
            timestamp: '2026-01-24T10:00:00Z',
            conversation_context: 'Initial discussion about reading',
            content: "Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.",
            user_quote: "Her teacher said she can decode words but doesn't remember what she reads.",
            ai_observation: "Specific diagnosis from teacher is helpful. Comprehension issue, not decoding.",
            sentiment: "concerned"
        }
    );
    
    console.log(`✅ Added entry 1: ${entry1.entryId}`);
    
    // Add second entry (should appear ABOVE first entry)
    const entry2 = await areaManager.appendEntry(
        'Family/Emma_School',
        'reading_comprehension.md',
        {
            timestamp: '2026-01-24T14:00:00Z',
            conversation_context: 'Breakthrough with graphic novels',
            content: "Emma had a breakthrough with graphic novels! She read Dog Man for 20 minutes straight without complaining.",
            user_quote: "I think we've been pushing chapter books too hard. The pictures help her stay engaged.",
            ai_observation: "Visual learning style hypothesis strengthening. Recommend more graphic novels.",
            sentiment: "hopeful"
        }
    );
    
    console.log(`✅ Added entry 2: ${entry2.entryId}`);
    
    // Read file to verify newest-first ordering
    const docContent = fs.readFileSync(
        path.join(areaPath, 'reading_comprehension.md'),
        'utf-8'
    );
    
    // Check if entry 2 (14:00) appears before entry 1 (10:00)
    const entry2Index = docContent.indexOf('2026-01-24 14:00:00');
    const entry1Index = docContent.indexOf('2026-01-24 10:00:00');
    
    if (entry2Index < entry1Index && entry2Index !== -1 && entry1Index !== -1) {
        console.log('✅ Newest-first ordering verified (14:00 before 10:00)');
    } else {
        console.log('❌ FAIL: Entries not in newest-first order');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Get Recent Entries');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const recentEntries = await areaManager.getRecentEntries(
        'Family/Emma_School',
        'reading_comprehension.md',
        5
    );
    
    console.log(`✅ Retrieved ${recentEntries.length} recent entries`);
    
    if (recentEntries.length === 2) {
        // Check if most recent is first
        const first = recentEntries[0];
        const second = recentEntries[1];
        
        if (first.timestamp > second.timestamp) {
            console.log('✅ Entries returned in newest-first order');
        } else {
            console.log('❌ FAIL: Entries not in correct order');
        }
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Update Area Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await areaManager.updateAreaSummary('Family/Emma_School', {
        current_situation: "Emma is showing progress with graphic novels. Visual learning style appears to be her strength.",
        timeline_highlight: {
            date: "2026-01-24",
            event: "Breakthrough with Dog Man graphic novel - 20min sustained reading"
        },
        ai_notes: "User feels more hopeful after discovering visual learning approach. Continue exploring graphic novels and illustrated chapter books."
    });
    
    console.log('✅ Updated area summary');
    
    // Verify summary was updated
    const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
    const hasTimeline = summaryContent.includes('2026-01-24');
    const hasSituation = summaryContent.includes('graphic novels');
    
    console.log(`✅ Timeline updated: ${hasTimeline}`);
    console.log(`✅ Situation updated: ${hasSituation}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Generate Areas Tree');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Create another area for better tree
    await areaManager.createArea(
        'Work/Startup',
        'Startup Project',
        'Building BubbleVoice',
        ['product_ideas.md']
    );
    
    const tree = await areaManager.generateAreasTree();
    
    console.log('✅ Generated areas tree:');
    console.log('');
    console.log(tree);
    
    // Check token count (rough estimate: 4 chars per token)
    const estimatedTokens = tree.length / 4;
    console.log(`📊 Estimated tokens: ${Math.round(estimatedTokens)} (target: < 300)`);
    
    if (estimatedTokens < 300) {
        console.log('✅ Tree is compact enough for prompt injection');
    } else {
        console.log('⚠️  Tree might be too large for prompt');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Read Areas for Context');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const context = await areaManager.readForContext([
        'Family/Emma_School',
        'Work/Startup'
    ]);
    
    console.log(`✅ Read ${Object.keys(context).length} areas for context`);
    
    for (const [areaPath, data] of Object.entries(context)) {
        console.log(`   - ${areaPath}: ${data.entryCount} entries, ${data.recentEntries.length} recent`);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 8: Master Index Update');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    
    const hasFamily = indexContent.includes('Family');
    const hasWork = indexContent.includes('Work');
    const hasStats = indexContent.includes('Total Areas: 2');
    
    console.log(`✅ Index includes Family: ${hasFamily}`);
    console.log(`✅ Index includes Work: ${hasWork}`);
    console.log(`✅ Index has correct stats: ${hasStats}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 9: File Structure Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Show file structure
    console.log('📁 File structure created:');
    console.log('');
    
    const { execSync } = require('child_process');
    try {
        const treeOutput = execSync(
            `cd "${testAreasDir}" && tree -L 3 -I "node_modules" 2>/dev/null || find . -maxdepth 3 -type f -o -type d | head -20`,
            { encoding: 'utf-8' }
        );
        console.log(treeOutput);
    } catch (e) {
        console.log('(tree command not available, using ls)');
        const lsOutput = execSync(`ls -laR "${testAreasDir}" | head -50`, { encoding: 'utf-8' });
        console.log(lsOutput);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 10: Sample Document Content');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('📄 reading_comprehension.md (first 50 lines):');
    console.log('');
    const sampleDoc = fs.readFileSync(
        path.join(areaPath, 'reading_comprehension.md'),
        'utf-8'
    );
    const lines = sampleDoc.split('\n').slice(0, 50);
    console.log(lines.join('\n'));
    
    // Close database
    db.close();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('ALL TESTS COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Test areas created at: ${testAreasDir}`);
    console.log('You can explore the files to see the structure.');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ TEST FAILED:', error);
    console.error('');
    process.exit(1);
});
