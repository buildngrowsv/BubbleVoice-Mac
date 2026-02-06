/**
 * simple-runner.js
 * 
 * SIMPLE APPROACH: Minimal context, prove it works first.
 * 
 * Input per turn:
 * - System prompt (~1,000 tokens)
 * - Areas tree (~300 tokens)
 * - Conversation history with operations (~2,000 tokens)
 * - Single vector search on current input (~500 tokens)
 * 
 * Total: ~4,000 tokens
 * 
 * NO: AI notes, multi-query search, priority system, retrieved context
 * 
 * This tests whether the basic approach works before adding complexity.
 */

const fs = require('fs');
const path = require('path');
const { generateAreasTree, KNOWLEDGE_BASE } = require('./knowledge-base-manager');
const { vectorSearch, vectorSearchService } = require('./vector-search-real');

// =============================================================================
// CONFIGURATION
// =============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// =============================================================================
// SYSTEM PROMPT (Simple Version)
// =============================================================================

const SIMPLE_SYSTEM_PROMPT = `You are a personal AI companion for BubbleVoice Mac. You help users think through their life - goals, family, work, personal growth.

Your role:
- Listen empathetically
- Remember context from past conversations
- Help organize thoughts
- Generate useful artifacts when helpful

CURRENT LIFE AREAS:
{areas_tree}

RELEVANT CONTEXT FROM PAST CONVERSATIONS:
{vector_context}

RESPONSE FORMAT:
Respond with valid JSON only:
{
  "user_response": {
    "spoken_text": "Your conversational response to the user",
    "emotional_tone": "supportive|curious|reflective|celebratory|concerned|neutral"
  },
  "area_actions": [
    {
      "action": "none|create_area|append_entry|update_summary",
      "path": "Area/Path if applicable",
      "entry": { "timestamp": "...", "context": "...", "content": "...", "sentiment": "..." }
    }
  ],
  "artifact_action": {
    "action": "none|create|update",
    "artifact_type": "progress_chart|timeline|summary|etc",
    "html": "Complete HTML if action is create/update"
  }
}

Be conversational, empathetic, and helpful. Reference past conversations when relevant.`;

// =============================================================================
// RESPONSE SCHEMA (Simple Version)
// =============================================================================

const SIMPLE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { type: "string" },
        emotional_tone: { 
          type: "string", 
          enum: ["supportive", "curious", "reflective", "celebratory", "concerned", "neutral"] 
        }
      },
      required: ["spoken_text"]
    },
    area_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["none", "create_area", "append_entry", "update_summary"] },
          path: { type: "string" },
          area_name: { type: "string" },
          description: { type: "string" },
          entry: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              context: { type: "string" },
              content: { type: "string" },
              user_quote: { type: "string" },
              ai_observation: { type: "string" },
              sentiment: { type: "string" }
            }
          }
        },
        required: ["action"]
      }
    },
    artifact_action: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["none", "create", "update"] },
        artifact_type: { type: "string" },
        html: { type: "string" }
      },
      required: ["action"]
    }
  },
  required: ["user_response", "area_actions", "artifact_action"]
};

// =============================================================================
// SIMPLE RUNNER
// =============================================================================

/**
 * Run a test scenario using the SIMPLE approach.
 * 
 * @param {Object} scenario - Test scenario with conversation steps
 * @returns {Object} - Results with metrics and responses
 */
async function runSimple(scenario) {
  const results = {
    approach: 'SIMPLE',
    scenario_name: scenario.name,
    description: scenario.description,
    timestamp: new Date().toISOString(),
    turns: [],
    metrics: {
      total_turns: 0,
      successful_turns: 0,
      avg_latency_ms: 0,
      total_input_tokens: 0,
      area_actions_taken: 0,
      artifacts_generated: 0,
      vector_search_time_ms: 0
    }
  };
  
  // Conversation history
  const messages = [];
  let totalLatency = 0;
  let totalVectorTime = 0;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SIMPLE RUNNER: ${scenario.name}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    console.log(`── Turn ${i + 1}/${scenario.steps.length} ──`);
    console.log(`👤 ${step.user_input}\n`);
    
    // Add user message
    messages.push({ role: 'user', content: step.user_input });
    
    // Get areas tree
    const areasTree = generateAreasTree();
    
    // Simple vector search (single query on current input)
    const vectorStart = Date.now();
    const vectorResults = await vectorSearch(step.user_input, { topK: 5 });
    const vectorContext = vectorResults.map(r => `[${r.areaPath}] ${r.text.substring(0, 150)}...`).join('\n\n');
    const vectorTime = Date.now() - vectorStart;
    totalVectorTime += vectorTime;
    
    // Build prompt
    const systemPrompt = SIMPLE_SYSTEM_PROMPT
      .replace('{areas_tree}', areasTree)
      .replace('{vector_context}', vectorContext);
    
    // Call API
    const startTime = Date.now();
    try {
      const response = await callGemini(messages, systemPrompt);
      const latency = Date.now() - startTime;
      totalLatency += latency;
      
      console.log(`🤖 ${response.user_response.spoken_text}`);
      console.log(`   ⏱️ ${latency}ms | 🔍 Vector: ${vectorTime}ms`);
      
      // Log actions
      if (response.area_actions?.length > 0) {
        for (const action of response.area_actions) {
          if (action.action !== 'none') {
            console.log(`   📁 ${action.action}: ${action.path || 'N/A'}`);
            results.metrics.area_actions_taken++;
          }
        }
      }
      
      if (response.artifact_action?.action !== 'none') {
        console.log(`   🎨 Artifact: ${response.artifact_action.artifact_type}`);
        results.metrics.artifacts_generated++;
      }
      
      // Add to history (with operations)
      messages.push({
        role: 'assistant',
        content: response.user_response.spoken_text + 
          (response.area_actions?.filter(a => a.action !== 'none').length > 0 
            ? `\n[Operations: ${response.area_actions.filter(a => a.action !== 'none').map(a => a.action).join(', ')}]`
            : '')
      });
      
      // Store turn results
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        response: response,
        latency_ms: latency,
        vector_time_ms: vectorTime,
        expected: step.expected,
        success: true
      });
      
      results.metrics.successful_turns++;
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        error: error.message,
        success: false
      });
    }
    
    results.metrics.total_turns++;
    console.log('');
  }
  
  // Calculate final metrics
  results.metrics.avg_latency_ms = Math.round(totalLatency / results.metrics.successful_turns);
  results.metrics.vector_search_time_ms = totalVectorTime;
  
  return results;
}

/**
 * Call Gemini API with structured output.
 */
async function callGemini(messages, systemPrompt) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not set');
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })),
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseSchema: SIMPLE_RESPONSE_SCHEMA
        }
      })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  runSimple,
  SIMPLE_SYSTEM_PROMPT,
  SIMPLE_RESPONSE_SCHEMA
};
