#!/usr/bin/env node

/**
 * TEST GEMINI JSON MODE
 * 
 * Simple test to verify Gemini's JSON mode is working.
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    process.exit(1);
}

console.log('Testing Gemini JSON Mode...\n');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function testJSONMode() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        systemInstruction: 'You must respond with ONLY valid JSON. No other text.',
        generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    response: { type: 'string', description: 'Your conversational response' },
                    sentiment: { type: 'string', description: 'User sentiment: happy, sad, worried, neutral' },
                    topics: { 
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Topics discussed'
                    }
                },
                required: ['response', 'sentiment', 'topics']
            }
        }
    });
    
    const result = await model.generateContent("I'm worried about my daughter Emma. She's struggling with reading.");
    const response = result.response.text();
    
    console.log('Raw Response:');
    console.log(response);
    console.log('');
    
    try {
        const parsed = JSON.parse(response);
        console.log('✅ Successfully parsed as JSON!');
        console.log('');
        console.log('Parsed Object:');
        console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.log('❌ Failed to parse as JSON');
        console.log(`Error: ${e.message}`);
    }
}

testJSONMode().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});
