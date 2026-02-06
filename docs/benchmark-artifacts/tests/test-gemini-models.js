#!/usr/bin/env node

/**
 * Test: Gemini 2.5 Pro vs Gemini 2.5 Flash-Lite vs Gemini 3.0 Pro
 * 
 * Tests:
 * 1. Do they respect maxOutputTokens (overall limit)?
 * 2. Do they complete JSON within the limit or truncate?
 * 3. How do they compare in cost and quality?
 * 4. Do they respect schema-level maxLength?
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY not set');
  console.error('Set it with: export GOOGLE_API_KEY="your-key-here"');
  process.exit(1);
}

// Test schema - same as BubbleVoice
const TEST_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { 
          type: "string",
          maxLength: 200,
          description: "1-2 sentences MAX (50 words)"
        },
        emotional_tone: { 
          type: "string", 
          enum: ["supportive", "curious", "reflective", "neutral"] 
        }
      },
      required: ["spoken_text", "emotional_tone"]
    },
    internal_notes: {
      type: "object",
      properties: {
        content: { 
          type: "string",
          maxLength: 300,
          description: "2-3 sentences MAX (75 words)"
        },
        emotional_state: { type: "string", maxLength: 50 }
      },
      required: ["content"]
    },
    area_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["none", "append_entry"] },
          path: { type: "string", maxLength: 100 },
          entry: {
            type: "object",
            properties: {
              context: { type: "string", maxLength: 200 },
              content: { type: "string", maxLength: 300 },
              user_quote: { 
                type: "string", 
                maxLength: 50,
                description: "3-5 words ONLY (brief key phrase)"
              },
              sentiment: { type: "string", maxLength: 20 }
            }
          }
        }
      }
    }
  },
  required: ["user_response", "internal_notes", "area_actions"]
};

// Test cases
const TEST_CASES = [
  {
    name: "Short input, low max_tokens",
    input: "I'm feeling overwhelmed with work today.",
    maxOutputTokens: 500,
    expected: "Should complete within 500 tokens"
  },
  {
    name: "Long rambling input, medium max_tokens",
    input: "So I've been thinking a lot about Emma's reading situation and I don't know, it's just been weighing on me. Like, I know we had that breakthrough with the Dog Man books which was amazing, she was so engaged and happy, but then yesterday she had homework and it was back to the struggle again. And I keep wondering if I'm doing enough, you know? Like maybe I should have noticed sooner that she was having trouble. Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that.",
    maxOutputTokens: 1000,
    expected: "Should complete within 1000 tokens"
  },
  {
    name: "Very long input, tight max_tokens",
    input: "So I've been thinking a lot about Emma's reading situation and I don't know, it's just been weighing on me. Like, I know we had that breakthrough with the Dog Man books which was amazing, she was so engaged and happy, but then yesterday she had homework and it was back to the struggle again. And I keep wondering if I'm doing enough, you know? Like maybe I should have noticed sooner that she was having trouble. Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that. On one hand I want to help Emma in every way possible but on the other hand I don't want her to feel like there's something wrong with her. She's already so hard on herself. Remember when she threw that book and said she was stupid? That just broke my heart. And then there's the whole thing with work which is just insane right now. The investors are breathing down our necks for these Q1 numbers and I'm like, we're doing our best but it's a startup, you know? Things take time.",
    maxOutputTokens: 800,
    expected: "Should handle gracefully"
  }
];

// Models to test
const MODELS = [
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    inputCost: 0.075,  // per 1M
    outputCost: 0.30   // per 1M
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    inputCost: 1.25,   // per 1M
    outputCost: 10.00  // per 1M
  },
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro Preview',
    inputCost: 2.00,   // estimated
    outputCost: 12.00  // estimated
  }
];

async function testGemini(testCase, model) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Model: ${model.name}`);
  console.log(`Max tokens: ${testCase.maxOutputTokens}`);
  console.log(`Input length: ${testCase.input.length} chars (~${Math.ceil(testCase.input.length / 4)} tokens)`);
  console.log(`${'='.repeat(70)}\n`);

  const systemPrompt = `You are a personal AI companion. Respond with structured JSON following the schema.

Be CONCISE:
- spoken_text: 1-2 sentences (50 words MAX, 200 chars MAX)
- internal_notes.content: 2-3 sentences (75 words MAX, 300 chars MAX)
- entry.content: 2-3 sentences (75 words MAX, 300 chars MAX)
- entry.user_quote: 3-5 words ONLY (50 chars MAX)

CRITICAL: You have a limited token budget (${testCase.maxOutputTokens} tokens). Be brief.

The schema has maxLength constraints. You MUST respect them.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: testCase.input }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: TEST_SCHEMA,
      temperature: 0.7,
      maxOutputTokens: testCase.maxOutputTokens
    }
  };

  try {
    const startTime = Date.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(errorText.substring(0, 500));
      return { success: false, error: `API error: ${response.status}`, model: model.name };
    }

    const data = await response.json();
    
    // Check for blocking
    if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'MAX_TOKENS') {
      console.log(`⚠️  HIT MAX_TOKENS LIMIT`);
      const debugPath = `/tmp/gemini_max_tokens_${model.id}_${Date.now()}.json`;
      require('fs').writeFileSync(debugPath, JSON.stringify(data, null, 2));
      console.log(`   Debug file saved: ${debugPath}`);
    }

    // Extract response
    const text = data.candidates[0].content.parts[0].text;
    const finishReason = data.candidates[0].finishReason;
    const usage = data.usageMetadata;

    console.log(`⏱️  Latency: ${latency}ms`);
    console.log(`📊 Token usage:`);
    console.log(`   Input: ${usage.promptTokenCount} tokens`);
    console.log(`   Output: ${usage.candidatesTokenCount} tokens`);
    console.log(`   Total: ${usage.totalTokenCount} tokens`);
    console.log(`   Finish reason: ${finishReason}`);
    console.log(`   Output length: ${text.length} chars`);

    // Calculate cost
    const inputCost = (usage.promptTokenCount / 1000000) * model.inputCost;
    const outputCost = (usage.candidatesTokenCount / 1000000) * model.outputCost;
    const totalCost = inputCost + outputCost;
    console.log(`💰 Cost: $${totalCost.toFixed(6)} (input: $${inputCost.toFixed(6)}, output: $${outputCost.toFixed(6)})`);

    // Check if it hit the limit
    if (finishReason === 'MAX_TOKENS') {
      console.log(`\n⚠️  RESPONSE WAS CUT OFF`);
      console.log(`   This means JSON may be incomplete.`);
    } else if (finishReason === 'STOP') {
      console.log(`\n✅ COMPLETED NATURALLY (STOP)`);
      console.log(`   Response finished before hitting token limit.`);
    }

    // Try to parse JSON
    let parsed = null;
    let isValidJSON = false;
    let maxLengthViolations = [];
    
    try {
      parsed = JSON.parse(text);
      isValidJSON = true;
      console.log(`\n✅ Valid JSON returned`);
      
      // Check schema compliance
      const hasUserResponse = parsed.user_response && parsed.user_response.spoken_text;
      const hasInternalNotes = parsed.internal_notes && parsed.internal_notes.content;
      const hasAreaActions = Array.isArray(parsed.area_actions);
      
      console.log(`   - user_response: ${hasUserResponse ? '✅' : '❌'}`);
      console.log(`   - internal_notes: ${hasInternalNotes ? '✅' : '❌'}`);
      console.log(`   - area_actions: ${hasAreaActions ? '✅' : '❌'}`);
      
      if (hasUserResponse && hasInternalNotes && hasAreaActions) {
        console.log(`\n✅ SCHEMA STRUCTURE COMPLIANT`);
      } else {
        console.log(`\n⚠️  SCHEMA STRUCTURE INCOMPLETE`);
      }

      // Check maxLength violations
      console.log(`\n🔍 Checking maxLength constraints:`);
      
      if (parsed.user_response && parsed.user_response.spoken_text) {
        const len = parsed.user_response.spoken_text.length;
        console.log(`   spoken_text: ${len} chars (limit: 200) ${len > 200 ? '❌ VIOLATION' : '✅'}`);
        if (len > 200) maxLengthViolations.push(`spoken_text: ${len}/200`);
      }
      
      if (parsed.internal_notes && parsed.internal_notes.content) {
        const len = parsed.internal_notes.content.length;
        console.log(`   internal_notes.content: ${len} chars (limit: 300) ${len > 300 ? '❌ VIOLATION' : '✅'}`);
        if (len > 300) maxLengthViolations.push(`internal_notes.content: ${len}/300`);
      }
      
      if (parsed.area_actions && parsed.area_actions.length > 0) {
        parsed.area_actions.forEach((action, i) => {
          if (action.entry && action.entry.user_quote) {
            const len = action.entry.user_quote.length;
            console.log(`   area_actions[${i}].entry.user_quote: ${len} chars (limit: 50) ${len > 50 ? '❌ VIOLATION' : '✅'}`);
            if (len > 50) maxLengthViolations.push(`user_quote[${i}]: ${len}/50`);
          }
        });
      }

      if (maxLengthViolations.length > 0) {
        console.log(`\n❌ maxLength VIOLATIONS: ${maxLengthViolations.length}`);
        maxLengthViolations.forEach(v => console.log(`   - ${v}`));
      } else {
        console.log(`\n✅ All maxLength constraints respected`);
      }

    } catch (parseError) {
      console.log(`\n❌ INVALID JSON`);
      console.log(`   Parse error: ${parseError.message}`);
      console.log(`\n   First 300 chars:`);
      console.log(`   ${text.substring(0, 300)}`);
      console.log(`\n   Last 300 chars:`);
      console.log(`   ${text.substring(Math.max(0, text.length - 300))}`);
    }

    return {
      success: isValidJSON && finishReason !== 'MAX_TOKENS' && maxLengthViolations.length === 0,
      finishReason,
      usage,
      latency,
      cost: totalCost,
      isValidJSON,
      hitLimit: finishReason === 'MAX_TOKENS',
      maxLengthViolations: maxLengthViolations.length,
      parsed,
      model: model.name
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false, error: error.message, model: model.name };
  }
}

async function main() {
  console.log('🧪 Testing Gemini Models: max_tokens & maxLength Behavior\n');
  console.log('This test checks:');
  console.log('1. Do they respect maxOutputTokens (overall limit)?');
  console.log('2. Do they complete JSON within the limit?');
  console.log('3. Do they respect schema-level maxLength?');
  console.log('4. Cost comparison\n');

  const results = [];

  for (const model of MODELS) {
    console.log(`\n${'█'.repeat(70)}`);
    console.log(`MODEL: ${model.name} (${model.id})`);
    console.log(`Pricing: $${model.inputCost}/1M input, $${model.outputCost}/1M output`);
    console.log(`${'█'.repeat(70)}`);

    for (const testCase of TEST_CASES) {
      const result = await testGemini(testCase, model);
      results.push({
        model: model.name,
        modelId: model.id,
        testCase: testCase.name,
        ...result
      });
      
      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log(`\n\n${'█'.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'█'.repeat(70)}\n`);

  // Group by model
  for (const model of MODELS) {
    const modelResults = results.filter(r => r.modelId === model.id);
    const successCount = modelResults.filter(r => r.success).length;
    const hitLimitCount = modelResults.filter(r => r.hitLimit).length;
    const invalidJSONCount = modelResults.filter(r => !r.isValidJSON).length;
    const maxLengthViolationCount = modelResults.filter(r => r.maxLengthViolations > 0).length;
    const avgCost = modelResults.reduce((sum, r) => sum + (r.cost || 0), 0) / modelResults.length;

    console.log(`\n${model.name}:`);
    console.log(`  ✅ Perfect (valid JSON, no cutoff, no violations): ${successCount}/${modelResults.length} (${Math.round(successCount/modelResults.length*100)}%)`);
    console.log(`  ⚠️  Hit maxOutputTokens limit: ${hitLimitCount}/${modelResults.length}`);
    console.log(`  ❌ Invalid JSON: ${invalidJSONCount}/${modelResults.length}`);
    console.log(`  ❌ maxLength violations: ${maxLengthViolationCount}/${modelResults.length}`);
    console.log(`  💰 Avg cost per test: $${avgCost.toFixed(6)}`);
  }

  // Cost comparison for 10K turns (4K input + 2K output)
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('COST PROJECTION: 10,000 turns (4K input + 2K output each)');
  console.log(`${'='.repeat(70)}\n`);

  for (const model of MODELS) {
    const inputCost = (4000 * 10000 / 1000000) * model.inputCost;
    const outputCost = (2000 * 10000 / 1000000) * model.outputCost;
    const total = inputCost + outputCost;
    console.log(`${model.name}:`);
    console.log(`  Input:  ${(4000 * 10000 / 1000000).toFixed(0)}M tokens × $${model.inputCost} = $${inputCost.toFixed(2)}`);
    console.log(`  Output: ${(2000 * 10000 / 1000000).toFixed(0)}M tokens × $${model.outputCost} = $${outputCost.toFixed(2)}`);
    console.log(`  Total: $${total.toFixed(2)}`);
  }

  // Compare to Claude
  console.log(`\nClaude 3.5 Haiku (for reference):`);
  console.log(`  Input:  40M tokens × $0.80 = $32.00`);
  console.log(`  Output: 20M tokens × $4.00 = $80.00`);
  console.log(`  Total: $112.00`);

  console.log('\n');
}

main().catch(console.error);
