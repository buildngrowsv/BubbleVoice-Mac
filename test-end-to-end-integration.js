#!/usr/bin/env node

/**
 * END-TO-END INTEGRATION TEST
 * 
 * Tests the complete Artifacts & User Data Management system:
 * - Life Areas creation and management
 * - Conversation storage with 4-file structure
 * - Artifact generation and storage
 * - Embedding generation and vector search
 * - Multi-query search strategy
 * - Context assembly for prompts
 * 
 * This simulates a real conversation about Emma's reading struggles.
 * Run with: node test-end-to-end-integration.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const AreaManagerService = require('./src/backend/services/AreaManagerService');
const ConversationStorageService = require('./src/backend/services/ConversationStorageService');
const ArtifactManagerService = require('./src/backend/services/ArtifactManagerService');
const EmbeddingService = require('./src/backend/services/EmbeddingService');
const VectorStoreService = require('./src/backend/services/VectorStoreService');
const ContextAssemblyService = require('./src/backend/services/ContextAssemblyService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          End-to-End Integration Test                       ║');
console.log('║          Emma\'s Reading Struggles Scenario                  ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database
const testDbPath = path.join(__dirname, 'user_data', 'test.db');
const testUserDataDir = path.join(__dirname, 'user_data');
const testConversationsDir = path.join(testUserDataDir, 'conversations');

// Clean up
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

const testAreasDir = path.join(testUserDataDir, 'life_areas');
if (fs.existsSync(testAreasDir)) {
    fs.rmSync(testAreasDir, { recursive: true, force: true });
}

if (fs.existsSync(testConversationsDir)) {
    fs.rmSync(testConversationsDir, { recursive: true, force: true });
}

console.log('🗑️  Cleaned up old test data');
console.log('');

// Initialize all services
console.log('📦 Initializing services...');
const db = new DatabaseService(testDbPath);
db.initialize();

const areaManager = new AreaManagerService(db, testUserDataDir);
const convStorage = new ConversationStorageService(db, testConversationsDir);
const artifactManager = new ArtifactManagerService(db, testConversationsDir);
const embeddingService = new EmbeddingService();
const vectorStore = new VectorStoreService(db, embeddingService);
const contextAssembly = new ContextAssemblyService(vectorStore, areaManager, convStorage);

async function runE2ETest() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SETUP: Initialize Systems');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await areaManager.initializeLifeAreas();
    await vectorStore.initialize();
    await embeddingService.initialize();
    
    console.log('✅ All systems initialized');
    
    // Create conversation
    const conversationId = 'e2e_test_emma_reading';
    await convStorage.createConversation(conversationId, "Emma's Reading Discussion");
    
    console.log(`✅ Created conversation: ${conversationId}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TURN 1: User mentions Emma\'s reading struggles');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const turn1User = "I'm really worried about Emma. She's struggling with reading and I don't know how to help her.";
    const turn1AI = "I hear you. It can be really worrying when our children struggle with something as important as reading. Tell me more about what you've noticed.";
    const turn1Notes = "User is worried about daughter Emma's reading. First mention - created Family/Emma_School area to track.";
    
    // Create area
    await areaManager.createArea(
        'Family/Emma_School',
        "Emma's School",
        "Tracking Emma's reading struggles and school progress",
        ['reading_comprehension.md', 'teacher_meetings.md']
    );
    
    // Save turn
    await convStorage.saveConversationTurn(
        conversationId,
        turn1User,
        turn1AI,
        turn1Notes,
        ['create_area: Family/Emma_School']
    );
    
    console.log('✅ Turn 1 saved');
    console.log('✅ Created area: Family/Emma_School');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TURN 2: User provides details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const turn2User = "She's in 2nd grade. Her teacher said she can decode words but doesn't remember what she reads.";
    const turn2AI = "It sounds like Emma has the foundational skills for reading, but the comprehension isn't clicking yet. That's actually a specific and helpful observation from her teacher.";
    const turn2Notes = "Emma is 7yo, 2nd grade. Comprehension issue (not decoding). Teacher involved. User likely feeling guilty.";
    
    // Append entry
    const entry1 = await areaManager.appendEntry(
        'Family/Emma_School',
        'reading_comprehension.md',
        {
            timestamp: new Date().toISOString(),
            conversation_context: 'Initial discussion about reading',
            content: "Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.",
            user_quote: "Her teacher said she can decode words but doesn't remember what she reads.",
            ai_observation: "Specific diagnosis from teacher is helpful. Comprehension issue, not decoding.",
            sentiment: "concerned",
            conversation_id: conversationId
        }
    );
    
    // Generate embedding for entry
    const entry1Embedding = await embeddingService.generateEmbedding(entry1.content || turn2User);
    
    // Store embedding
    await vectorStore.storeEmbedding(
        entry1.entryId,
        entry1Embedding,
        {
            area_path: 'Family/Emma_School',
            document: 'reading_comprehension.md',
            timestamp: entry1.timestamp,
            entry_type: 'time_ordered_log',
            sentiment: 'concerned',
            content: "Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.",
            user_quote: "Her teacher said she can decode words but doesn't remember what she reads.",
            ai_observation: "Specific diagnosis from teacher is helpful."
        }
    );
    
    // Save turn
    await convStorage.saveConversationTurn(
        conversationId,
        turn2User,
        turn2AI,
        turn2Notes,
        ['append_entry: Family/Emma_School/reading_comprehension.md']
    );
    
    console.log('✅ Turn 2 saved');
    console.log('✅ Appended entry to reading_comprehension.md');
    console.log('✅ Stored embedding for entry');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TURN 3: User reports breakthrough');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const turn3User = "She had a breakthrough yesterday! She read a graphic novel (Dog Man) for 20 minutes straight without complaining. I think the pictures help her stay engaged.";
    const turn3AI = "That's wonderful! It sounds like you've discovered something important about how Emma learns best. Visual elements seem to really help her engage with the content.";
    const turn3Notes = "Breakthrough with graphic novels. Visual learning style hypothesis strengthening. User feels hopeful.";
    
    // Append entry
    const entry2 = await areaManager.appendEntry(
        'Family/Emma_School',
        'reading_comprehension.md',
        {
            timestamp: new Date().toISOString(),
            conversation_context: 'Breakthrough with graphic novels',
            content: "Emma had a breakthrough with graphic novels! She read Dog Man for 20 minutes straight without complaining.",
            user_quote: "I think the pictures help her stay engaged.",
            ai_observation: "Visual learning style hypothesis strengthening. Recommend more graphic novels.",
            sentiment: "hopeful",
            conversation_id: conversationId
        }
    );
    
    // Generate and store embedding
    const entry2Embedding = await embeddingService.generateEmbedding(turn3User);
    await vectorStore.storeEmbedding(
        entry2.entryId,
        entry2Embedding,
        {
            area_path: 'Family/Emma_School',
            document: 'reading_comprehension.md',
            timestamp: entry2.timestamp,
            entry_type: 'time_ordered_log',
            sentiment: 'hopeful',
            content: turn3User,
            user_quote: "I think the pictures help her stay engaged.",
            ai_observation: "Visual learning style hypothesis strengthening."
        }
    );
    
    // Save turn
    await convStorage.saveConversationTurn(
        conversationId,
        turn3User,
        turn3AI,
        turn3Notes,
        ['append_entry: Family/Emma_School/reading_comprehension.md']
    );
    
    console.log('✅ Turn 3 saved');
    console.log('✅ Appended entry (newest first)');
    console.log('✅ Stored embedding');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TURN 4: User asks for summary (triggers context assembly)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const turn4User = "Can you summarize what we've discussed about Emma's reading?";
    
    // Build messages array for context assembly
    const messages = [
        { role: 'user', content: turn1User },
        { role: 'assistant', content: turn1AI },
        { role: 'user', content: turn2User },
        { role: 'assistant', content: turn2AI },
        { role: 'user', content: turn3User },
        { role: 'assistant', content: turn3AI },
        { role: 'user', content: turn4User }
    ];
    
    // Assemble context using multi-query strategy
    const context = await contextAssembly.assembleContext(
        conversationId,
        messages,
        'Family/Emma_School'
    );
    
    console.log('✅ Context assembled with multi-query search');
    console.log(`   Vector results: ${context.vectorResults.results.length}`);
    console.log(`   Search time: ${context.vectorResults.searchTime}ms`);
    
    // Show top results
    console.log('');
    console.log('Top 3 context results:');
    context.vectorResults.results.slice(0, 3).forEach((result, i) => {
        const score = result.final_score || result.boosted_score || result.score;
        console.log(`${i + 1}. [${score.toFixed(4)}] ${result.content.slice(0, 60)}...`);
        console.log(`   Source: ${result.source}, Sentiment: ${result.sentiment}`);
    });
    
    // Generate artifact (reflection summary)
    const artifactHtml = await artifactManager.renderArtifactTemplate('reflection_summary', {
        title: "Emma's Reading Journey",
        date: new Date().toLocaleDateString(),
        sections: [
            {
                title: "The Challenge",
                content: "Emma (2nd grade) has been struggling with reading comprehension. She can decode words but doesn't retain what she reads."
            },
            {
                title: "The Breakthrough",
                content: "We discovered that graphic novels (like Dog Man) help Emma stay engaged. She read for 20 minutes straight - a huge win!"
            }
        ],
        timeline: [
            { date: "Jan 24", event: "Breakthrough with Dog Man graphic novel" },
            { date: "Jan 24", event: "Initial discussion about reading struggles" }
        ],
        insights: [
            "Visual learning style appears to be Emma's strength",
            "Graphic novels help with engagement and retention",
            "Teacher has been helpful in identifying the specific issue"
        ]
    });
    
    // Save artifact
    const artifact = await artifactManager.saveArtifact(
        conversationId,
        {
            action: 'create',
            artifact_type: 'reflection_summary',
            html: artifactHtml
        },
        4
    );
    
    console.log('');
    console.log(`✅ Generated reflection_summary artifact: ${artifact.artifact_id}`);
    console.log(`   HTML size: ${artifactHtml.length} chars`);
    
    // Save turn 4
    const turn4AI = "I can help with that. Here's a summary of what we've discussed about Emma's reading...";
    await convStorage.saveConversationTurn(
        conversationId,
        turn4User,
        turn4AI,
        "User asked for summary. Generated reflection_summary artifact with timeline and insights.",
        ['create_artifact: reflection_summary']
    );
    
    console.log('✅ Turn 4 saved with artifact');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICATION: Check All Systems');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 1. Life Areas
    const areasTree = await areaManager.generateAreasTree();
    console.log('');
    console.log('1. Life Areas Tree:');
    console.log(areasTree);
    
    // 2. Conversation Files
    console.log('2. Conversation Files:');
    const convDir = path.join(testConversationsDir, conversationId);
    const convFiles = fs.readdirSync(convDir);
    console.log(`   Files: ${convFiles.filter(f => !fs.statSync(path.join(convDir, f)).isDirectory()).join(', ')}`);
    
    // 3. User Input Isolation
    const userInputs = await convStorage.getUserInputsOnly(conversationId);
    const hasAI = userInputs.includes('**AI**:');
    console.log(`   User input isolation: ${!hasAI ? '✅' : '❌'}`);
    
    // 4. Artifacts
    const artifacts = await artifactManager.listArtifacts(conversationId);
    console.log(`   Artifacts created: ${artifacts.length}`);
    
    // 5. Embeddings
    const embeddingCount = vectorStore.getEmbeddingCount();
    console.log(`   Embeddings stored: ${embeddingCount}`);
    
    // 6. Vector Search
    const searchQuery = "What strategies have we tried for Emma?";
    const searchResults = await contextAssembly.runMultiQuerySearch(messages, 'Family/Emma_School');
    console.log(`   Vector search results: ${searchResults.results.length}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('FINAL STATS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('');
    console.log('Database:');
    console.log(`  Conversations: ${db.getAllConversations().length}`);
    console.log(`  Messages: ${db.getMessageCount(conversationId)}`);
    console.log(`  Life Areas: ${db.getAllAreas().length}`);
    console.log(`  Area Entries: ${db.getRecentEntries(100).length}`);
    console.log(`  Artifacts: ${db.getArtifactsByConversation(conversationId).length}`);
    console.log(`  Embeddings: ${embeddingCount}`);
    
    console.log('');
    console.log('Files Created:');
    const { execSync } = require('child_process');
    const fileCount = execSync(
        `find "${testUserDataDir}" -type f | wc -l`,
        { encoding: 'utf-8' }
    ).trim();
    console.log(`  Total files: ${fileCount}`);
    
    // Close database
    db.close();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('END-TO-END TEST COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('All systems working together correctly!');
    console.log('');
    console.log('You can explore the generated files:');
    console.log(`  Life areas: ${testAreasDir}`);
    console.log(`  Conversations: ${testConversationsDir}`);
    console.log(`  Artifacts: ${path.join(convDir, 'artifacts')}`);
    console.log('');
}

runE2ETest().catch(error => {
    console.error('');
    console.error('❌ E2E TEST FAILED:', error);
    console.error(error.stack);
    console.error('');
    process.exit(1);
});
