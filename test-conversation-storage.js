#!/usr/bin/env node

/**
 * CONVERSATION STORAGE SERVICE TEST SCRIPT
 * 
 * Tests the 4-file conversation storage system.
 * Run with: node test-conversation-storage.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const ConversationStorageService = require('./src/backend/services/ConversationStorageService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     ConversationStorageService Test Script                 ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database and directory
const testDbPath = path.join(__dirname, 'user_data', 'test.db');
const testConversationsDir = path.join(__dirname, 'user_data', 'conversations');

// Clean up old test database
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old test database');
}

// Clean up old test conversations
if (fs.existsSync(testConversationsDir)) {
    fs.rmSync(testConversationsDir, { recursive: true, force: true });
    console.log('🗑️  Removed old test conversations');
}

// Initialize services
console.log('📦 Initializing services...');
const db = new DatabaseService(testDbPath);
db.initialize();

const convStorage = new ConversationStorageService(db, testConversationsDir);

async function runTests() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Create Conversation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const conv = await convStorage.createConversation(
        'conv_test_emma_reading',
        "Emma's Reading Discussion",
        { test: true }
    );
    
    console.log(`✅ Created conversation: ${conv.id}`);
    console.log(`   Files created: ${conv.filesCreated}`);
    
    // Verify folder exists
    const convDir = path.join(testConversationsDir, 'conv_test_emma_reading');
    const dirExists = fs.existsSync(convDir);
    console.log(`✅ Conversation folder exists: ${dirExists}`);
    
    // Verify 4 files exist
    const file1 = fs.existsSync(path.join(convDir, 'conversation.md'));
    const file2 = fs.existsSync(path.join(convDir, 'user_inputs.md'));
    const file3 = fs.existsSync(path.join(convDir, 'conversation_ai_notes.md'));
    const file4 = fs.existsSync(path.join(convDir, 'conversation_summary.md'));
    
    console.log(`✅ conversation.md exists: ${file1}`);
    console.log(`✅ user_inputs.md exists: ${file2}`);
    console.log(`✅ conversation_ai_notes.md exists: ${file3}`);
    console.log(`✅ conversation_summary.md exists: ${file4}`);
    
    // Verify artifacts folder
    const artifactsDir = fs.existsSync(path.join(convDir, 'artifacts'));
    console.log(`✅ artifacts/ folder exists: ${artifactsDir}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Save Conversation Turn');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Turn 1
    await convStorage.saveConversationTurn(
        'conv_test_emma_reading',
        "I'm really worried about Emma. She's struggling with reading and I don't know how to help her.",
        "I hear you. It can be really worrying when our children struggle with something as important as reading. Tell me more about what you've noticed. What does her struggle look like?",
        "User is worried about daughter Emma's reading. First mention - need to create area to track.",
        ['create_area: Family/Emma_School']
    );
    
    console.log('✅ Saved turn 1');
    
    // Turn 2
    await convStorage.saveConversationTurn(
        'conv_test_emma_reading',
        "She's in 2nd grade. Her teacher said she can decode words but doesn't remember what she reads.",
        "It sounds like Emma has the foundational skills for reading, but the comprehension isn't clicking yet. That's actually a specific and helpful observation from her teacher.",
        "Emma is 7yo, 2nd grade. Comprehension issue (not decoding). Teacher involved. User likely feeling guilty.",
        ['append_entry: Family/Emma_School/reading_comprehension.md']
    );
    
    console.log('✅ Saved turn 2');
    
    // Turn 3
    await convStorage.saveConversationTurn(
        'conv_test_emma_reading',
        "She had a meltdown yesterday. Threw her book and said 'I'm stupid.' It just broke my heart.",
        "That must have been so hard to witness. When children say things like that, it really does break our hearts. Emma's frustration is understandable, but it's also a sign that her self-esteem is being affected.",
        "Emotional moment: Emma's self-esteem at risk. User heartbroken. This is about more than reading skills now.",
        ['append_entry: Family/Emma_School/struggles.md']
    );
    
    console.log('✅ Saved turn 3');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Verify User Input Isolation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const userInputsContent = await convStorage.getUserInputsOnly('conv_test_emma_reading');
    
    // Check that user_inputs.md contains NO AI responses
    const hasAiMarker = userInputsContent.includes('**AI**:');
    const hasOperations = userInputsContent.includes('**Operations**:');
    const hasAiResponse1 = userInputsContent.includes('I hear you');
    const hasAiResponse2 = userInputsContent.includes('It sounds like Emma');
    
    console.log(`✅ No "**AI**:" marker: ${!hasAiMarker}`);
    console.log(`✅ No "**Operations**:" marker: ${!hasOperations}`);
    console.log(`✅ No AI response text: ${!hasAiResponse1 && !hasAiResponse2}`);
    
    // Check that user_inputs.md DOES contain user text
    const hasUserInput1 = userInputsContent.includes("I'm really worried about Emma");
    const hasUserInput2 = userInputsContent.includes("She's in 2nd grade");
    const hasUserInput3 = userInputsContent.includes("She had a meltdown");
    
    console.log(`✅ Contains user input 1: ${hasUserInput1}`);
    console.log(`✅ Contains user input 2: ${hasUserInput2}`);
    console.log(`✅ Contains user input 3: ${hasUserInput3}`);
    
    if (!hasAiMarker && !hasOperations && !hasAiResponse1 && hasUserInput1) {
        console.log('');
        console.log('🎯 USER INPUT ISOLATION VERIFIED ✅');
    } else {
        console.log('');
        console.log('❌ USER INPUT ISOLATION FAILED');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Verify AI Notes (Newest First)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const aiNotesContent = await convStorage.getAiNotes('conv_test_emma_reading');
    
    // Check that AI notes are in newest-first order
    // Turn 3 notes should appear before Turn 2 notes
    const turn3Index = aiNotesContent.indexOf('self-esteem at risk');
    const turn2Index = aiNotesContent.indexOf('7yo, 2nd grade');
    const turn1Index = aiNotesContent.indexOf("First mention");
    
    if (turn3Index < turn2Index && turn2Index < turn1Index && 
        turn3Index !== -1 && turn2Index !== -1 && turn1Index !== -1) {
        console.log('✅ AI notes in newest-first order (Turn 3 → 2 → 1)');
    } else {
        console.log('❌ FAIL: AI notes not in newest-first order');
        console.log(`   Turn 3 index: ${turn3Index}`);
        console.log(`   Turn 2 index: ${turn2Index}`);
        console.log(`   Turn 1 index: ${turn1Index}`);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Get All User Inputs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const allInputs = await convStorage.getAllUserInputs('conv_test_emma_reading');
    
    console.log(`✅ Extracted ${allInputs.length} user inputs`);
    
    allInputs.forEach((input, i) => {
        console.log(`   Turn ${input.turnNumber}: "${input.content.slice(0, 50)}..."`);
    });
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Update Conversation Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await convStorage.updateConversationSummary('conv_test_emma_reading', {
        key_topics: [
            "Emma's reading comprehension struggles (2nd grade)",
            "Teacher feedback and concerns",
            "Emotional impact on Emma (self-esteem)"
        ],
        emotional_arc: "Started: Worried, anxious\nMiddle: Heartbroken (after meltdown)\nCurrent: Seeking solutions",
        areas_updated: [
            "Family/Emma_School (created, 2 entries)"
        ],
        next_steps: [
            "Follow up on teacher meeting",
            "Explore graphic novel options",
            "Monitor Emma's emotional state"
        ]
    });
    
    console.log('✅ Updated conversation summary');
    
    // Verify summary was updated
    const summaryContent = await convStorage.getSummary('conv_test_emma_reading');
    const hasTopics = summaryContent.includes('reading comprehension');
    const hasArc = summaryContent.includes('Worried, anxious');
    const hasSteps = summaryContent.includes('graphic novel');
    
    console.log(`✅ Topics updated: ${hasTopics}`);
    console.log(`✅ Emotional arc updated: ${hasArc}`);
    console.log(`✅ Next steps updated: ${hasSteps}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: File Structure Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('📁 Conversation file structure:');
    console.log('');
    
    const { execSync } = require('child_process');
    try {
        const treeOutput = execSync(
            `cd "${testConversationsDir}" && tree -L 2 2>/dev/null || find . -maxdepth 2 -type f -o -type d`,
            { encoding: 'utf-8' }
        );
        console.log(treeOutput);
    } catch (e) {
        const lsOutput = execSync(`ls -laR "${testConversationsDir}" | head -40`, { encoding: 'utf-8' });
        console.log(lsOutput);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 8: Sample File Contents');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('📄 user_inputs.md (first 40 lines):');
    console.log('');
    const userInputsPath = path.join(convDir, 'user_inputs.md');
    const userInputsFile = fs.readFileSync(userInputsPath, 'utf-8');
    console.log(userInputsFile.split('\n').slice(0, 40).join('\n'));
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 9: Full Conversation Content');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('📄 conversation.md (first 50 lines):');
    console.log('');
    const fullConvPath = path.join(convDir, 'conversation.md');
    const fullConvFile = fs.readFileSync(fullConvPath, 'utf-8');
    console.log(fullConvFile.split('\n').slice(0, 50).join('\n'));
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 10: File Size Comparison');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const convSize = fs.statSync(fullConvPath).size;
    const userInputsSize = fs.statSync(userInputsPath).size;
    const aiNotesPath = path.join(convDir, 'conversation_ai_notes.md');
    const aiNotesSize = fs.statSync(aiNotesPath).size;
    const summaryPath = path.join(convDir, 'conversation_summary.md');
    const summarySize = fs.statSync(summaryPath).size;
    
    console.log(`📊 conversation.md: ${convSize} bytes`);
    console.log(`📊 user_inputs.md: ${userInputsSize} bytes`);
    console.log(`📊 conversation_ai_notes.md: ${aiNotesSize} bytes`);
    console.log(`📊 conversation_summary.md: ${summarySize} bytes`);
    console.log('');
    
    const ratio = (userInputsSize / convSize * 100).toFixed(1);
    console.log(`📊 User inputs are ${ratio}% of full conversation size`);
    
    if (userInputsSize < convSize) {
        console.log('✅ User inputs file is smaller (as expected)');
    } else {
        console.log('⚠️  User inputs file is larger than expected');
    }
    
    // Close database
    db.close();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('ALL TESTS COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Test conversation created at: ${convDir}`);
    console.log('You can explore the 4 files to see the structure.');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ TEST FAILED:', error);
    console.error('');
    process.exit(1);
});
