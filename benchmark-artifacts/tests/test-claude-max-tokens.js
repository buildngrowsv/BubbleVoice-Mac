#!/usr/bin/env node

/**
 * Test: Does Claude respect max_tokens and complete JSON within the limit?
 * 
 * This tests whether Claude:
 * 1. Respects the max_tokens parameter
 * 2. Completes valid JSON within that limit (no cutoff)
 * 3. Handles complex schemas without truncation
 * 
 * Compare to Gemini which often hits MAX_TOKENS and returns incomplete JSON.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set');
  console.error('Set it with: export ANTHROPIC_API_KEY="your-key-here"');
  process.exit(1);
}

// Test schema - same as BubbleVoice
const TEST_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { type: "string" },
        emotional_tone: { type: "string", enum: ["supportive", "curious", "reflective", "neutral"] }
      },
      required: ["spoken_text", "emotional_tone"]
    },
    internal_notes: {
      type: "object",
      properties: {
        content: { type: "string" },
        emotional_state: { type: "string" }
      },
      required: ["content"]
    },
    area_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["none", "append_entry"] },
          path: { type: "string" },
          entry: {
            type: "object",
            properties: {
              context: { type: "string" },
              content: { type: "string" },
              user_quote: { type: "string" },
              sentiment: { type: "string" }
            }
          }
        }
      }
    }
  },
  required: ["user_response", "internal_notes", "area_actions"]
};

// Test cases with different complexity levels
const TEST_CASES = [
  {
    name: "Short input, low max_tokens",
    input: "I'm feeling overwhelmed with work today.",
    max_tokens: 500,
    expected: "Should complete within 500 tokens"
  },
  {
    name: "Long rambling input, medium max_tokens",
    input: "So I've been thinking a lot about Emma's reading situation and I don't know, it's just been weighing on me. Like, I know we had that breakthrough with the Dog Man books which was amazing, she was so engaged and happy, but then yesterday she had homework and it was back to the struggle again. And I keep wondering if I'm doing enough, you know? Like maybe I should have noticed sooner that she was having trouble. Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that.",
    max_tokens: 1000,
    expected: "Should complete within 1000 tokens"
  },
  {
    name: "Very long input, tight max_tokens",
    input: "So I've been thinking a lot about Emma's reading situation and I don't know, it's just been weighing on me. Like, I know we had that breakthrough with the Dog Man books which was amazing, she was so engaged and happy, but then yesterday she had homework and it was back to the struggle again. And I keep wondering if I'm doing enough, you know? Like maybe I should have noticed sooner that she was having trouble. Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that. On one hand I want to help Emma in every way possible but on the other hand I don't want her to feel like there's something wrong with her. She's already so hard on herself. Remember when she threw that book and said she was stupid? That just broke my heart. And then there's the whole thing with work which is just insane right now. The investors are breathing down our necks for these Q1 numbers and I'm like, we're doing our best but it's a startup, you know? Things take time.",
    max_tokens: 800,
    expected: "Should handle gracefully - either complete or intelligently truncate"
  }
];

async function testClaude(testCase, model) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Model: ${model}`);
  console.log(`Max tokens: ${testCase.max_tokens}`);
  console.log(`Input length: ${testCase.input.length} chars (~${Math.ceil(testCase.input.length / 4)} tokens)`);
  console.log(`${'='.repeat(70)}\n`);

  const systemPrompt = `You are a personal AI companion. Respond with structured JSON following the schema.

Be CONCISE:
- spoken_text: 1-2 sentences (50 words MAX)
- internal_notes.content: 2-3 sentences (75 words MAX)
- entry.content: 2-3 sentences (75 words MAX)
- entry.user_quote: 3-5 words ONLY (brief key phrase)

CRITICAL: You have a limited token budget (${testCase.max_tokens} tokens). Be brief.`;

  const requestBody = {
    model: model,
    max_tokens: testCase.max_tokens,
    messages: [
      {
        role: "user",
        content: testCase.input
      }
    ],
    system: systemPrompt
  };

  try {
    const startTime = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status}`);
      console.error(errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Extract response
    const content = data.content[0].text;
    const stopReason = data.stop_reason;
    const usage = data.usage;

    console.log(`⏱️  Latency: ${latency}ms`);
    console.log(`📊 Token usage:`);
    console.log(`   Input: ${usage.input_tokens} tokens`);
    console.log(`   Output: ${usage.output_tokens} tokens`);
    console.log(`   Total: ${usage.input_tokens + usage.output_tokens} tokens`);
    console.log(`   Stop reason: ${stopReason}`);
    console.log(`   Output length: ${content.length} chars`);

    // Check if it hit the limit
    if (stopReason === 'max_tokens') {
      console.log(`\n⚠️  HIT MAX_TOKENS LIMIT`);
      console.log(`   This means the response was cut off.`);
    } else if (stopReason === 'end_turn') {
      console.log(`\n✅ COMPLETED NATURALLY (end_turn)`);
      console.log(`   Response finished before hitting token limit.`);
    }

    // Try to parse JSON
    let parsed = null;
    let isValidJSON = false;
    try {
      parsed = JSON.parse(content);
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
        console.log(`\n✅ SCHEMA COMPLIANT`);
      } else {
        console.log(`\n⚠️  SCHEMA INCOMPLETE`);
      }

      // Show actual JSON structure for debugging
      console.log(`\n📄 Actual JSON structure:`);
      console.log(JSON.stringify(parsed, null, 2).substring(0, 1000));

      // Check field lengths
      if (parsed.area_actions && parsed.area_actions.length > 0) {
        parsed.area_actions.forEach((action, i) => {
          if (action.entry && action.entry.user_quote) {
            const quoteLength = action.entry.user_quote.length;
            const quoteWords = action.entry.user_quote.split(/\s+/).length;
            console.log(`   Action ${i} user_quote: ${quoteLength} chars, ${quoteWords} words`);
            if (quoteWords > 10) {
              console.log(`      ⚠️  Exceeds 5-word guideline`);
            }
          }
        });
      }

    } catch (parseError) {
      console.log(`\n❌ INVALID JSON`);
      console.log(`   Parse error: ${parseError.message}`);
      console.log(`\n   First 500 chars of response:`);
      console.log(`   ${content.substring(0, 500)}`);
      console.log(`\n   Last 500 chars of response:`);
      console.log(`   ${content.substring(Math.max(0, content.length - 500))}`);
    }

    return {
      success: isValidJSON && stopReason !== 'max_tokens',
      stopReason,
      usage,
      latency,
      isValidJSON,
      hitLimit: stopReason === 'max_tokens',
      parsed
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing Claude Models: max_tokens Behavior\n');
  console.log('This test checks if Claude:');
  console.log('1. Respects max_tokens parameter');
  console.log('2. Completes valid JSON within the limit');
  console.log('3. Handles complex schemas without truncation\n');

  const models = [
    'claude-3-5-haiku-20241022',  // Claude 3.5 Haiku
    // 'claude-4-5-haiku-20250514'   // Claude 4.5 Haiku (if available)
  ];

  const results = [];

  for (const model of models) {
    console.log(`\n${'█'.repeat(70)}`);
    console.log(`MODEL: ${model}`);
    console.log(`${'█'.repeat(70)}`);

    for (const testCase of TEST_CASES) {
      const result = await testClaude(testCase, model);
      results.push({
        model,
        testCase: testCase.name,
        ...result
      });
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log(`\n\n${'█'.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'█'.repeat(70)}\n`);

  const successCount = results.filter(r => r.success).length;
  const hitLimitCount = results.filter(r => r.hitLimit).length;
  const invalidJSONCount = results.filter(r => !r.isValidJSON).length;

  console.log(`Total tests: ${results.length}`);
  console.log(`✅ Successful (valid JSON, no cutoff): ${successCount} (${Math.round(successCount/results.length*100)}%)`);
  console.log(`⚠️  Hit max_tokens limit: ${hitLimitCount} (${Math.round(hitLimitCount/results.length*100)}%)`);
  console.log(`❌ Invalid JSON: ${invalidJSONCount} (${Math.round(invalidJSONCount/results.length*100)}%)`);

  console.log('\nDetailed Results:');
  results.forEach(r => {
    const status = r.success ? '✅' : (r.hitLimit ? '⚠️ ' : '❌');
    console.log(`${status} ${r.model} - ${r.testCase}`);
    if (r.usage) {
      console.log(`   ${r.usage.output_tokens} tokens, ${r.stopReason}`);
    }
  });

  console.log('\n');
}

main().catch(console.error);
