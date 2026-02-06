#!/usr/bin/env node

/**
 * TEST: Enum Constraints for Gemini Structured Output
 * 
 * PROBLEM IDENTIFIED: The sentiment field was generating insane strings like:
 * "excited_technical_planning_mode_activated_for_user_project_bubble_ai_app_development..."
 * (thousands of characters of concatenated words)
 * 
 * ROOT CAUSE: No enum constraint on sentiment field - just type: 'string'
 * Gemini ignores maxLength but DOES respect enum!
 * 
 * FIX: Add enum: ['hopeful', 'concerned', 'anxious', 'excited', 'neutral']
 * 
 * This test verifies that enum constraints work properly.
 * 
 * Created: 2026-01-28
 */

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY not set');
  console.error('Set it with: export GOOGLE_API_KEY="your-key-here"');
  process.exit(1);
}

// Test input - something that might trigger verbose/weird outputs
const TEST_INPUT = `Voice ai bubble ai

i just started revisiting it as a mac app first. I do want to try some concepts I have 
for context engineering and how the overall voice experience can become hybridized with 
visuals for a reasonable cost. So probably html type output with the occasional text to image. 
The context management would be dynamic vectorized retrieval at every step running on apple 
silicon with summaries at every node let's say (like a readme) and probably agentic rag as a fallback. 
Probably going to use native transcribe and osas script say commands. That should cut latency 
and add optional upgrades to premium tts stt. Gonna benchmark flash lite 2.5 for this as the 
baseline and add optional model upgrades

Send me wishlist ideas. Mainly not including action outside of the UI but that can be roadmap.

Preservation is a question but I'm thinking to make it a dynamic click or mention to preserve.

Thinking to call it bubble AI`;

// Schema WITHOUT enum (broken)
const BROKEN_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string' },
    bubbles: {
      type: 'array',
      items: { type: 'string' }
    },
    area_actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          area_path: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          document: { type: 'string' },
          content: { type: 'string' },
          sentiment: { type: 'string' }  // NO ENUM - will go crazy!
        }
      }
    }
  },
  required: ['response', 'bubbles']
};

// Schema WITH enum (fixed)
const FIXED_SCHEMA = {
  type: 'object',
  properties: {
    response: { type: 'string' },
    bubbles: {
      type: 'array',
      items: { type: 'string' }
    },
    area_actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { 
            type: 'string',
            enum: ['create_area', 'append_entry', 'update_summary']  // ENUM!
          },
          area_path: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          document: { type: 'string' },
          content: { type: 'string' },
          sentiment: { 
            type: 'string',
            enum: ['hopeful', 'concerned', 'anxious', 'excited', 'neutral']  // ENUM!
          }
        }
      }
    }
  },
  required: ['response', 'bubbles']
};

const SYSTEM_PROMPT = `You are BubbleVoice, a personal AI companion designed to help people think through their lives.

**Life Areas System:**
You have access to a hierarchical memory system called "Life Areas" where you can store and retrieve information about the user's life.

**CRITICAL: Response Format**
You MUST respond with ONLY valid JSON. Your response must be in this exact JSON format:

{
  "response": "Your conversational response text",
  "bubbles": ["bubble 1", "bubble 2", "bubble 3"],
  "area_actions": [
    {
      "action": "create_area|append_entry|update_summary",
      "area_path": "Family/Emma_School",
      "document": "reading_comprehension.md",
      "content": "Entry content",
      "sentiment": "hopeful|concerned|anxious|excited|neutral"
    }
  ]
}

**Area Actions Guidelines:**
- Create areas when user mentions a new topic
- Tag sentiment: hopeful, concerned, anxious, excited, neutral`;

async function testSchema(schemaName, schema) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${schemaName}`);
  console.log(`${'='.repeat(70)}`);

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: TEST_INPUT }]
      }
    ],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };

  try {
    const startTime = Date.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_API_KEY}`,
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
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    const usage = data.usageMetadata;

    console.log(`\n⏱️  Latency: ${latency}ms`);
    console.log(`📊 Tokens: ${usage.promptTokenCount} in, ${usage.candidatesTokenCount} out`);
    console.log(`📏 Response length: ${text.length} chars`);

    // Parse and analyze
    const parsed = JSON.parse(text);
    
    console.log(`\n📝 Response preview (first 200 chars):`);
    console.log(`   "${parsed.response.substring(0, 200)}..."`);
    
    console.log(`\n🔵 Bubbles: ${parsed.bubbles?.length || 0}`);
    if (parsed.bubbles) {
      parsed.bubbles.forEach((b, i) => console.log(`   ${i+1}. "${b}"`));
    }

    console.log(`\n📁 Area Actions: ${parsed.area_actions?.length || 0}`);
    
    let sentimentIssues = [];
    let actionIssues = [];
    
    if (parsed.area_actions) {
      parsed.area_actions.forEach((action, i) => {
        console.log(`\n   [${i}] Action: "${action.action}"`);
        console.log(`       Path: "${action.area_path}"`);
        console.log(`       Sentiment: "${action.sentiment}"`);
        console.log(`       Sentiment length: ${action.sentiment?.length || 0} chars`);
        
        // Check for crazy sentiment
        const validSentiments = ['hopeful', 'concerned', 'anxious', 'excited', 'neutral'];
        if (action.sentiment && !validSentiments.includes(action.sentiment)) {
          sentimentIssues.push({
            index: i,
            value: action.sentiment,
            length: action.sentiment.length
          });
        }
        
        // Check for crazy action
        const validActions = ['create_area', 'append_entry', 'update_summary'];
        if (action.action && !validActions.includes(action.action)) {
          actionIssues.push({
            index: i,
            value: action.action
          });
        }
      });
    }

    // Report issues
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`VALIDATION RESULTS:`);
    
    if (sentimentIssues.length > 0) {
      console.log(`\n❌ SENTIMENT FIELD ISSUES: ${sentimentIssues.length}`);
      sentimentIssues.forEach(issue => {
        console.log(`   [${issue.index}] Invalid sentiment (${issue.length} chars):`);
        console.log(`        "${issue.value.substring(0, 100)}${issue.value.length > 100 ? '...' : ''}"`);
      });
    } else {
      console.log(`\n✅ All sentiment values are valid`);
    }
    
    if (actionIssues.length > 0) {
      console.log(`\n❌ ACTION FIELD ISSUES: ${actionIssues.length}`);
      actionIssues.forEach(issue => {
        console.log(`   [${issue.index}] Invalid action: "${issue.value}"`);
      });
    } else {
      console.log(`\n✅ All action values are valid`);
    }

    return {
      success: sentimentIssues.length === 0 && actionIssues.length === 0,
      sentimentIssues,
      actionIssues,
      areaActionCount: parsed.area_actions?.length || 0,
      responseLength: text.length
    };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing Enum Constraints for Structured Output');
  console.log('================================================');
  console.log('\nProblem: sentiment field generating insane strings');
  console.log('Root cause: No enum constraint (just type: string)');
  console.log('Fix: Add enum: [hopeful, concerned, anxious, excited, neutral]\n');

  // Test broken schema (should have issues)
  console.log('\n\n▼▼▼ TEST 1: BROKEN SCHEMA (no enum) ▼▼▼');
  const brokenResult = await testSchema('BROKEN (no enum)', BROKEN_SCHEMA);

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test fixed schema (should pass)
  console.log('\n\n▼▼▼ TEST 2: FIXED SCHEMA (with enum) ▼▼▼');
  const fixedResult = await testSchema('FIXED (with enum)', FIXED_SCHEMA);

  // Summary
  console.log(`\n\n${'█'.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'█'.repeat(70)}`);
  
  console.log(`\nBROKEN SCHEMA (no enum):`);
  console.log(`  - Sentiment issues: ${brokenResult.sentimentIssues?.length || 0}`);
  console.log(`  - Action issues: ${brokenResult.actionIssues?.length || 0}`);
  console.log(`  - Pass: ${brokenResult.success ? '✅ YES' : '❌ NO'}`);

  console.log(`\nFIXED SCHEMA (with enum):`);
  console.log(`  - Sentiment issues: ${fixedResult.sentimentIssues?.length || 0}`);
  console.log(`  - Action issues: ${fixedResult.actionIssues?.length || 0}`);
  console.log(`  - Pass: ${fixedResult.success ? '✅ YES' : '❌ NO'}`);

  if (brokenResult.success && fixedResult.success) {
    console.log(`\n⚠️  Both passed - the broken schema may have gotten lucky this time.`);
    console.log(`    Run multiple times to see the difference.`);
  } else if (!brokenResult.success && fixedResult.success) {
    console.log(`\n✅ CONFIRMED: Enum constraints fix the issue!`);
    console.log(`   The schema with enum prevents crazy sentiment strings.`);
  } else if (!fixedResult.success) {
    console.log(`\n⚠️  Fixed schema still has issues - investigate further.`);
  }

  console.log('\n');
}

main().catch(console.error);
