#!/usr/bin/env node

/**
 * TEST STREAMING JSON
 * 
 * Tests how Gemini streams JSON responses.
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    process.exit(1);
}

console.log('Testing Gemini Streaming with JSON Mode...\n');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function testStreamingJSON() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        systemInstruction: 'Respond with ONLY valid JSON.',
        generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    response: { type: 'string' },
                    sentiment: { type: 'string' },
                    topics: { type: 'array', items: { type: 'string' } }
                },
                required: ['response', 'sentiment', 'topics']
            }
        }
    });
    
    const result = await model.generateContentStream("I'm worried about Emma's reading.");
    
    let fullResponse = '';
    let chunkCount = 0;
    
    console.log('Streaming chunks:');
    console.log('─'.repeat(60));
    
    for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        chunkCount++;
        console.log(`Chunk ${chunkCount}: "${chunkText.slice(0, 50)}${chunkText.length > 50 ? '...' : ''}"`);
    }
    
    console.log('─'.repeat(60));
    console.log(`Total chunks: ${chunkCount}`);
    console.log('');
    console.log('Full Response:');
    console.log(fullResponse);
    console.log('');
    
    try {
        const parsed = JSON.parse(fullResponse);
        console.log('✅ Successfully parsed as JSON!');
        console.log('');
        console.log('Parsed:');
        console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.log('❌ Failed to parse');
        console.log(`Error: ${e.message}`);
    }
}

testStreamingJSON().catch(error => {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
});
