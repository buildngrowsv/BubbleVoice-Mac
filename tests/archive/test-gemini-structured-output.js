#!/usr/bin/env node

/**
 * TEST GEMINI STRUCTURED OUTPUT
 * 
 * Tests Gemini with full structured output schema for BubbleVoice.
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY not found');
    process.exit(1);
}

console.log('Testing Gemini with BubbleVoice Structured Output Schema...\n');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const systemPrompt = `You are BubbleVoice, a personal AI companion. You help users process thoughts about family, relationships, goals, and life decisions.

When users discuss life topics, you should create "area_actions" to store information in their personal knowledge tree.

Respond with ONLY valid JSON in this format:
{
  "response": "Your empathetic, conversational response",
  "area_actions": [
    {
      "action": "create_area",
      "area_path": "Family/Emma_School",
      "name": "Emma's School",
      "description": "Tracking Emma's reading progress"
    }
  ],
  "artifact_action": {
    "action": "none"
  },
  "bubbles": ["what helps her?", "teacher's advice?", "how does she feel?"]
}

Always include 2-4 bubbles. Create area_actions when user discusses life topics.`;

async function testStructuredOutput() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        systemInstruction: systemPrompt,
        generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    response: { type: 'string' },
                    area_actions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                action: { type: 'string' },
                                area_path: { type: 'string' },
                                name: { type: 'string' },
                                description: { type: 'string' }
                            }
                        }
                    },
                    artifact_action: {
                        type: 'object',
                        properties: {
                            action: { type: 'string' }
                        }
                    },
                    bubbles: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                },
                required: ['response', 'bubbles']
            }
        }
    });
    
    const result = await model.generateContent("I'm really worried about Emma. She's in 2nd grade and struggling with reading. Her teacher said she can decode words but doesn't remember what she reads.");
    const response = result.response.text();
    
    console.log('Raw Response:');
    console.log(response);
    console.log('');
    
    try {
        const parsed = JSON.parse(response);
        console.log('✅ Successfully parsed as JSON!');
        console.log('');
        console.log('Structured Output:');
        console.log(JSON.stringify(parsed, null, 2));
        console.log('');
        console.log('Analysis:');
        console.log(`  Response length: ${parsed.response.length} chars`);
        console.log(`  Area actions: ${parsed.area_actions?.length || 0}`);
        console.log(`  Artifact action: ${parsed.artifact_action?.action || 'none'}`);
        console.log(`  Bubbles: ${parsed.bubbles?.length || 0}`);
        console.log('');
        
        if (parsed.area_actions && parsed.area_actions.length > 0) {
            console.log('Area Actions Details:');
            parsed.area_actions.forEach((action, i) => {
                console.log(`  ${i + 1}. ${action.action}: ${action.area_path}`);
            });
        }
        
    } catch (e) {
        console.log('❌ Failed to parse as JSON');
        console.log(`Error: ${e.message}`);
    }
}

testStructuredOutput().catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});
