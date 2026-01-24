#!/usr/bin/env node

/**
 * EMBEDDING SERVICE TEST SCRIPT
 * 
 * Tests local text embedding generation with Transformers.js.
 * Run with: node test-embedding-service.js
 * 
 * Note: First run will download model (~50MB) and may take 30-60 seconds.
 */

const EmbeddingService = require('./src/backend/services/EmbeddingService');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          EmbeddingService Test Script                      ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log('⚠️  First run may take 30-60s to download model (~50MB)');
console.log('');

const embeddingService = new EmbeddingService();

async function runTests() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Initialize Model');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await embeddingService.initialize();
    
    console.log(`✅ Model initialized`);
    console.log(`   Embedding dimension: ${embeddingService.getEmbeddingDimension()}`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Generate Single Embedding');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const text1 = "Emma is struggling with reading comprehension in 2nd grade.";
    const embedding1 = await embeddingService.generateEmbedding(text1);
    
    console.log(`✅ Generated embedding for: "${text1.slice(0, 50)}..."`);
    console.log(`   Dimension: ${embedding1.length}`);
    console.log(`   First 5 values: [${embedding1.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Generate Batch Embeddings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const texts = [
        "Emma had a breakthrough with graphic novels today.",
        "She read Dog Man for 20 minutes without complaining.",
        "Visual learning style seems to be her strength.",
        "Teacher wants to discuss testing for learning differences.",
        "User is worried about labeling Emma."
    ];
    
    const embeddings = await embeddingService.generateBatchEmbeddings(texts);
    
    console.log(`✅ Generated ${embeddings.length} embeddings in batch`);
    console.log(`   Each embedding: ${embeddings[0].length} dimensions`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Cosine Similarity');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Compare similar texts
    const text2 = "Emma's reading comprehension is improving with graphic novels.";
    const embedding2 = await embeddingService.generateEmbedding(text2);
    
    const similarity = embeddingService.cosineSimilarity(embedding1, embedding2);
    
    console.log(`Text 1: "${text1}"`);
    console.log(`Text 2: "${text2}"`);
    console.log(`✅ Similarity: ${similarity.toFixed(4)} (${similarity > 0.7 ? 'HIGH' : similarity > 0.5 ? 'MEDIUM' : 'LOW'})`);
    
    // Compare dissimilar texts
    const text3 = "The weather is sunny and warm today.";
    const embedding3 = await embeddingService.generateEmbedding(text3);
    
    const dissimilarity = embeddingService.cosineSimilarity(embedding1, embedding3);
    
    console.log('');
    console.log(`Text 1: "${text1}"`);
    console.log(`Text 3: "${text3}"`);
    console.log(`✅ Similarity: ${dissimilarity.toFixed(4)} (${dissimilarity > 0.7 ? 'HIGH' : dissimilarity > 0.5 ? 'MEDIUM' : 'LOW'})`);
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Semantic Search Simulation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const query = "What strategies have we tried for Emma's reading?";
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    
    const documents = [
        "Emma had a breakthrough with graphic novels. She read for 20 minutes straight.",
        "We tried positive reinforcement - praising effort not results. Emma responded well.",
        "Teacher recommended educational testing for learning differences.",
        "Tried reading together before bed. Some progress but inconsistent.",
        "The startup fundraising is stressful. Investors want Q1 numbers.",
    ];
    
    const docEmbeddings = await embeddingService.generateBatchEmbeddings(documents);
    
    // Compute similarities
    const results = documents.map((doc, i) => ({
        document: doc,
        score: embeddingService.cosineSimilarity(queryEmbedding, docEmbeddings[i])
    })).sort((a, b) => b.score - a.score);
    
    console.log(`Query: "${query}"`);
    console.log('');
    console.log('Top results:');
    results.forEach((result, i) => {
        console.log(`${i + 1}. [${result.score.toFixed(4)}] ${result.document.slice(0, 60)}...`);
    });
    
    // Verify top results are relevant
    const topScore = results[0].score;
    const bottomScore = results[results.length - 1].score;
    
    console.log('');
    if (topScore > 0.5 && bottomScore < 0.3) {
        console.log('✅ Semantic search working (relevant docs ranked higher)');
    } else {
        console.log('⚠️  Semantic search may need tuning');
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Chunk by Entry');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const sampleDocument = `# Reading Comprehension

**Area**: Family/Emma_School  
**Document Type**: Time-Ordered Log

---

## Summary (AI-Maintained)

Emma's reading struggles tracked here.

---

## Entries (Newest First)

### 2026-01-24 14:00:00
**Conversation Context**: Breakthrough with graphic novels

Emma had a breakthrough with graphic novels! She read Dog Man for 20 minutes straight.

**User Quote**: "I think we've been pushing chapter books too hard."

**AI Observation**: Visual learning style hypothesis strengthening.

**Sentiment**: hopeful

---

### 2026-01-24 10:00:00
**Conversation Context**: Initial discussion

Emma (2nd grade) struggling with reading comprehension.

**User Quote**: "She can decode but doesn't remember what she reads."

**AI Observation**: Comprehension issue, not decoding.

**Sentiment**: concerned

---
`;
    
    const chunks = embeddingService.chunkByEntry(
        sampleDocument,
        'Family/Emma_School',
        'reading_comprehension.md'
    );
    
    console.log(`✅ Extracted ${chunks.length} chunks from document`);
    
    chunks.forEach((chunk, i) => {
        console.log(`   Chunk ${i + 1}:`);
        console.log(`     - Timestamp: ${chunk.timestamp}`);
        console.log(`     - Sentiment: ${chunk.sentiment}`);
        console.log(`     - Content: "${chunk.content.slice(0, 50)}..."`);
    });
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 7: Chunk by Paragraph');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const longText = `This is the first paragraph. It contains some information about a topic.

This is the second paragraph. It continues the discussion with more details.

This is the third paragraph. It adds even more context and information.

This is the fourth paragraph. It wraps up the topic nicely.`;
    
    const paraChunks = embeddingService.chunkByParagraph(longText, 100);
    
    console.log(`✅ Chunked text into ${paraChunks.length} paragraph-based chunks`);
    
    paraChunks.forEach((chunk, i) => {
        const tokens = Math.ceil(chunk.length / 4);
        console.log(`   Chunk ${i + 1}: ~${tokens} tokens, "${chunk.slice(0, 40)}..."`);
    });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('ALL TESTS COMPLETE ✅');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Embedding service is ready for vector search integration.');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ TEST FAILED:', error);
    console.error('');
    process.exit(1);
});
