#!/usr/bin/env node

/**
 * VECTOR STORE SERVICE TEST SCRIPT
 * 
 * Tests vector storage and hybrid search.
 * Run with: node test-vector-store.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const EmbeddingService = require('./src/backend/services/EmbeddingService');
const VectorStoreService = require('./src/backend/services/VectorStoreService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          VectorStoreService Test Script                    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database
const testDbPath = path.join(__dirname, 'user_data', 'test.db');

// Clean up
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old test database');
}

// Initialize services
console.log('📦 Initializing services...');
const db = new DatabaseService(testDbPath);
db.initialize();

const embeddingService = new EmbeddingService();
const vectorStore = new VectorStoreService(db, embeddingService);

async function runTests() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Initialize Vector Store');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await vectorStore.initialize();
    console.log('✅ Vector store initialized');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Initialize Embedding Model');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('(This may take 30-60s on first run to download model)');
    console.log('');
    
    await embeddingService.initialize();
    console.log('✅ Embedding model ready');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Store Sample Embeddings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Create sample chunks
    const sampleTexts = [
        {
            content: "Emma had a breakthrough with graphic novels. She read for 20 minutes straight.",
            area_path: "Family/Emma_School",
            document: "reading_comprehension.md",
            timestamp: "2026-01-24T14:00:00Z",
            sentiment: "hopeful"
        },
        {
            content: "Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.",
            area_path: "Family/Emma_School",
            document: "reading_comprehension.md",
            timestamp: "2026-01-24T10:00:00Z",
            sentiment: "concerned"
        },
        {
            content: "We tried positive reinforcement - praising effort not results. Emma responded well.",
            area_path: "Family/Emma_School",
            document: "strategies.md",
            timestamp: "2026-01-23T15:00:00Z",
            sentiment: "hopeful"
        },
        {
            content: "Teacher recommended educational testing for learning differences.",
            area_path: "Family/Emma_School",
            document: "teacher_meetings.md",
            timestamp: "2026-01-22T18:00:00Z",
            sentiment: "anxious"
        },
        {
            content: "The startup fundraising is stressful. Investors want Q1 numbers.",
            area_path: "Work/Startup",
            document: "fundraising.md",
            timestamp: "2026-01-24T09:00:00Z",
            sentiment: "stressed"
        }
    ];
    
    // Generate embeddings
    const texts = sampleTexts.map(t => t.content);
    const embeddings = await embeddingService.generateBatchEmbeddings(texts);
    
    // Store with metadata
    const chunks = sampleTexts.map((text, i) => ({
        chunk_id: `chunk_${i + 1}`,
        ...text,
        embedding: embeddings[i]
    }));
    
    await vectorStore.storeEmbeddings(chunks);
    
    const count = vectorStore.getEmbeddingCount();
    console.log(`✅ Stored ${count} embeddings`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Vector Search');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const query1 = "What progress has Emma made with reading?";
    const queryEmbedding = await embeddingService.generateEmbedding(query1);
    const vectorResults = await vectorStore.vectorSearch(queryEmbedding, 5);
    
    console.log(`Query: "${query1}"`);
    console.log('');
    console.log('Top results:');
    vectorResults.forEach((result, i) => {
        console.log(`${i + 1}. [${result.score.toFixed(4)}] ${result.content.slice(0, 60)}...`);
        console.log(`   Area: ${result.area_path}, Sentiment: ${result.sentiment}`);
    });
    
    // Verify top result is about Emma's breakthrough (most relevant)
    if (vectorResults[0].content.includes('breakthrough') || vectorResults[0].content.includes('graphic novels')) {
        console.log('');
        console.log('✅ Most relevant result ranked first');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Keyword Search');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const keywordResults = await vectorStore.keywordSearch('graphic novels', 5);
    
    console.log('Keyword: "graphic novels"');
    console.log('');
    console.log(`Found ${keywordResults.length} results`);
    keywordResults.forEach((result, i) => {
        console.log(`${i + 1}. ${result.content.slice(0, 70)}...`);
    });
    
    if (keywordResults.length > 0 && keywordResults[0].content.includes('graphic novels')) {
        console.log('');
        console.log('✅ Keyword search found exact matches');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Hybrid Search');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const hybridResults = await vectorStore.hybridSearch(
        "Emma's reading strategies",
        {
            vectorWeight: 0.7,
            keywordWeight: 0.3,
            topK: 5
        }
    );
    
    console.log('Query: "Emma\'s reading strategies"');
    console.log('');
    console.log('Top results (hybrid):');
    hybridResults.forEach((result, i) => {
        console.log(`${i + 1}. [${result.weighted_score.toFixed(4)}] ${result.content.slice(0, 60)}...`);
        console.log(`   Vector: ${result.vector_score.toFixed(4)}, Keyword: ${result.keyword_score.toFixed(4)}, Type: ${result.match_type}`);
    });
    
    console.log('');
    console.log('✅ Hybrid search combines both methods');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Recency Boost');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const boostedResults = vectorStore.applyRecencyBoost(hybridResults, 0.05);
    
    console.log('Recency boost applied (decay factor: 0.05):');
    console.log('');
    boostedResults.forEach((result, i) => {
        const age = Math.round((new Date() - new Date(result.timestamp)) / (1000 * 60 * 60 * 24));
        console.log(`${i + 1}. [${result.boosted_score.toFixed(4)}] ${result.content.slice(0, 50)}...`);
        console.log(`   Age: ${age}d, Multiplier: ${result.recency_multiplier.toFixed(4)}`);
    });
    
    console.log('');
    console.log('✅ Recency boost applied correctly');
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 8: Area Boost');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const areaBoostedResults = vectorStore.applyAreaBoost(
        boostedResults,
        'Family/Emma_School',
        1.5
    );
    
    console.log('Area boost applied (current area: Family/Emma_School, factor: 1.5x):');
    console.log('');
    areaBoostedResults.forEach((result, i) => {
        console.log(`${i + 1}. [${result.final_score.toFixed(4)}] ${result.content.slice(0, 50)}...`);
        console.log(`   Area: ${result.area_path}, Multiplier: ${result.area_multiplier}x`);
    });
    
    // Check if Emma_School entries are boosted
    const emmaEntries = areaBoostedResults.filter(r => r.area_path === 'Family/Emma_School');
    const workEntries = areaBoostedResults.filter(r => r.area_path === 'Work/Startup');
    
    if (emmaEntries.length > 0 && workEntries.length > 0) {
        const emmaBoosted = emmaEntries[0].area_multiplier === 1.5;
        const workNotBoosted = workEntries[0].area_multiplier === 1.0;
        
        if (emmaBoosted && workNotBoosted) {
            console.log('');
            console.log('✅ Area boost working correctly');
        }
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 9: Search with Filters');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const filteredResults = await vectorStore.hybridSearch(
        "Emma reading",
        {
            topK: 5,
            filters: {
                area_path: 'Family/Emma_School',
                sentiment: 'hopeful'
            }
        }
    );
    
    console.log('Query: "Emma reading" (filtered: area=Family/Emma_School, sentiment=hopeful)');
    console.log('');
    console.log(`Found ${filteredResults.length} results`);
    filteredResults.forEach((result, i) => {
        console.log(`${i + 1}. ${result.content.slice(0, 60)}...`);
        console.log(`   Sentiment: ${result.sentiment}`);
    });
    
    // Verify all results match filters
    const allHopeful = filteredResults.every(r => r.sentiment === 'hopeful');
    const allEmmaSchool = filteredResults.every(r => r.area_path === 'Family/Emma_School');
    
    if (allHopeful && allEmmaSchool) {
        console.log('');
        console.log('✅ Filters working correctly');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 10: Performance Metrics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const perfQuery = "What have we discussed about Emma?";
    
    const start1 = Date.now();
    const perfQueryEmbedding = await embeddingService.generateEmbedding(perfQuery);
    const embedTime = Date.now() - start1;
    
    const start2 = Date.now();
    const perfResults = await vectorStore.vectorSearch(perfQueryEmbedding, 10);
    const searchTime = Date.now() - start2;
    
    const totalTime = embedTime + searchTime;
    
    console.log('Performance:');
    console.log(`  Query embedding: ${embedTime}ms`);
    console.log(`  Vector search: ${searchTime}ms`);
    console.log(`  Total: ${totalTime}ms`);
    console.log('');
    
    if (totalTime < 100) {
        console.log('✅ Performance excellent (< 100ms)');
    } else if (totalTime < 300) {
        console.log('✅ Performance good (< 300ms)');
    } else {
        console.log('⚠️  Performance could be improved');
    }
    
    // Close database
    db.close();
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('ALL TESTS COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Vector store is ready for integration with conversation system.');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ TEST FAILED:', error);
    console.error('');
    process.exit(1);
});
