#!/usr/bin/env node

/**
 * TEST GEMINI FULL RESPONSE
 * 
 * Captures the complete JSON response from Gemini to debug.
 */

require('dotenv').config();
const LLMService = require('./src/backend/services/LLMService');

if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    process.exit(1);
}

console.log('Testing Gemini Full Response...\n');

const llmService = new LLMService();

async function testFullResponse() {
    const conversation = {
        id: 'test',
        messages: [
            {
                role: 'user',
                content: "I'm really worried about Emma. She's in 2nd grade and struggling with reading. Her teacher said she can decode words but doesn't remember what she reads.",
                timestamp: Date.now()
            }
        ]
    };
    
    let streamedText = '';
    let receivedBubbles = null;
    let receivedArtifact = null;
    let receivedAreaActions = null;
    
    const result = await llmService.generateResponse(
        conversation,
        { model: 'gemini-2.5-flash-lite', temperature: 0.7 },
        {
            onChunk: (chunk) => {
                streamedText += chunk;
            },
            onBubbles: (bubbles) => {
                receivedBubbles = bubbles;
            },
            onArtifact: (artifact) => {
                receivedArtifact = artifact;
            },
            onAreaActions: (areaActions) => {
                receivedAreaActions = areaActions;
            }
        }
    );
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('LLM Result:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Streamed Text:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(streamedText);
    console.log('');
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Callbacks Received:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Bubbles:', receivedBubbles);
    console.log('Artifact:', receivedArtifact);
    console.log('Area Actions:', receivedAreaActions);
    console.log('');
    
    if (result.structured) {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('Structured Output:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(JSON.stringify(result.structured, null, 2));
    }
}

testFullResponse().catch(error => {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
});
