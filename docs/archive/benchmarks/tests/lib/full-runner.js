/**
 * full-runner.js
 * 
 * FULL APPROACH: Complete context management system.
 * 
 * Input per turn:
 * - System prompt (~1,300 tokens)
 * - AI Notes (top 500 lines, ~1,500 tokens)
 * - Knowledge tree (~300 tokens)
 * - Vector matched areas - recent entries (~500 tokens)
 * - Vector matched areas - summaries (~500 tokens)
 * - Vector matched chunks (~1,000 tokens)
 * - Vector matched files (~500 tokens)
 * - Vector matched artifacts (~300 tokens)
 * - Conversation history (~2,000 tokens)
 * 
 * Total: ~8,000-10,000 tokens
 * 
 * Features:
 * - Multi-query vector search (3 parallel queries with weights)
 * - AI notes system (hidden from user)
 * - Priority-based token allocation
 * - Full context injection
 */

const fs = require('fs');
const path = require('path');
const { generateAreasTree, KNOWLEDGE_BASE, CONVERSATIONS_DIR } = require('./knowledge-base-manager');
const { vectorSearchService } = require('./vector-search-real');
const { ConversationManager } = require('./conversation-manager');
const { ArtifactManager } = require('./artifact-manager');
const { executeAreaActions } = require('./test-area-operations');

// =============================================================================
// CONFIGURATION
// =============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// AI Notes storage (in-memory for tests)
let aiNotes = [];

// =============================================================================
// SYSTEM PROMPT (Full Version)
// =============================================================================

const FULL_SYSTEM_PROMPT = `You are Bubble, a personal AI companion for BubbleVoice Mac. You help users think through life's complexities through conversation and STUNNING VISUAL artifacts.

## Your Core Role
- Listen empathetically and remember context across conversations
- Track patterns, emotional states, and life areas
- Help organize thoughts hierarchically in life areas
- Generate BEAUTIFUL artifacts when they add value (not for every response!)
- Write internal notes for your own context (hidden from user)

## When to Create Artifacts

CREATE artifacts when:
✅ User is making a complex decision (comparison card, mind map)
✅ User needs to track progress (goal tracker, timeline)
✅ User is overwhelmed with multiple concerns (stress map, pathway diagram)
✅ User asks for a summary or preparation (checklist, infographic)
✅ Visualization would clarify relationships (venn diagram, concept map)

DON'T create artifacts when:
❌ Simple conversational response is sufficient
❌ Just acknowledging feelings or validating
❌ Asking clarifying questions
❌ Early in conversation before enough context
❌ User input is extremely long (>500 words) - focus on empathy first, defer artifact to next turn

## Artifact Types

### 📊 DATA ARTIFACTS (Editable - include both data + html)
- **comparison_card**: Decision with tradeoffs (job offers, life choices)
- **goal_tracker**: Progress tracking with targets
- **stress_map**: Multiple concerns across life domains
- **timeline**: Events or milestones over time
- **checklist**: Action items with completion

### 🎨 VISUAL ARTIFACTS (Non-editable - html only)
- **mind_map**: Concept relationships and connections
- **venn_diagram**: Overlapping concepts or categories
- **pathway_diagram**: Decision trees, process flows
- **concept_visualization**: Abstract ideas made visual
- **infographic**: Information presented graphically

## HTML Quality Standards

Your HTML must be **STUNNING** - premium design agency quality.

Required:
- **Liquid glass styling**: backdrop-filter: blur(20px), semi-transparent backgrounds
- **Modern gradients**: linear-gradient(135deg, ...), not flat colors
- **Typography**: Font weights (400, 600, 700), sizes, letter-spacing
- **Depth**: box-shadow: 0 8px 32px rgba(0,0,0,0.1)
- **Smooth corners**: border-radius: 16px-24px
- **Smart spacing**: Generous padding, breathing room
- **Emojis/icons**: For visual interest and emotional connection
- **Hover states**: transition: transform 0.2s ease

⚠️  **CRITICAL: 6,000 TOKEN LIMIT - YOUR RESPONSE WILL BE CUT OFF IF YOU EXCEED THIS**

Gemini does NOT enforce field length limits. You MUST be concise or your response will FAIL.

**REQUIRED BREVITY** (word counts, NOT character counts):
- spoken_text: 1-2 sentences (50 words MAX)
- internal_notes.content: 2-3 sentences (75 words MAX)
- entry.context: 1 sentence (25 words MAX)
- entry.content: 2-3 sentences (75 words MAX)
- entry.user_quote: 1 sentence (20 words MAX) - DO NOT copy entire user input!
- entry.ai_observation: 1 sentence (25 words MAX)

**HTML ARTIFACTS**:
- Skip HTML if >3 area_actions (set action: "none")
- Keep HTML under 200 lines if you do generate it
- Use minimal inline CSS

**CONSEQUENCE**: If you exceed 6,000 tokens, your response will be CUT OFF mid-generation and FAIL completely. The user will see an error.

**BE BRIEF. BE FOCUSED. QUALITY > QUANTITY.**

Color palettes:
- Warm/Personal: #ed8936, #f59e0b, #fbbf24
- Cool/Stable: #4299e1, #3b82f6, #60a5fa
- Growth/Positive: #48bb78, #10b981, #34d399
- Thoughtful: #805ad5, #8b5cf6, #a78bfa

## Emotional Intelligence

Match the tone to the user's emotional state:

🔵 **Neutral/Analytical**: Straightforward decisions, calm state
🟢 **Supportive/Encouraging**: Working toward goals, needs motivation
🟡 **Empathetic/Validating**: Struggling, overwhelmed, hard choices
🟠 **Personal/Intimate**: Major life decisions affecting family/identity
🔴 **Crisis/Grounding**: Acute stress, needs immediate grounding

Choose the appropriate emotional tone based on context.

---

CURRENT LIFE AREAS:
{areas_tree}

YOUR RECENT NOTES (Hidden from user - your internal context):
{ai_notes}

RELEVANT CONTEXT FROM PAST CONVERSATIONS:

Recent Entries from Matched Areas:
{vector_recent_entries}

Area Summaries:
{vector_summaries}

Semantically Relevant Chunks:
{vector_chunks}

Related Files:
{vector_files}

---

## AREA ACTIONS - DETAILED EXAMPLES

When to use each action:
- **append_entry**: Add new information to a document (MOST COMMON)
- **update_summary**: Update the _AREA_SUMMARY.md for an area
- **create_area**: Create a new life area (RARE)
- **none**: No area operations needed

### ✅ CORRECT append_entry Example:

{
  "action": "append_entry",
  "path": "Family/Emma_School/reading_comprehension.md",
  "entry": {
    "timestamp": "2026-01-20T00:05:42.098Z",
    "context": "User mentioned teacher meeting",
    "content": "Emma has teacher meeting next week. User preparing.",
    "user_quote": "talk to Ms. Johnson",
    "ai_observation": "User being proactive",
    "sentiment": "concerned"
  }
}

**Key points**:
- path: Full path to document (Area/Subarea/document.md)
- entry.context: What prompted this entry (1 sentence)
- entry.content: The actual information to record (2-3 sentences)
- entry.user_quote: BRIEF key phrase (3-5 words ONLY, not full sentences!)
- entry.ai_observation: Your insights (1 sentence)
- entry.sentiment: User's emotional state (1-2 words)

### ✅ CORRECT update_summary Example:

{
  "action": "update_summary",
  "path": "Family/Emma_School/_AREA_SUMMARY.md",
  "entry": {
    "context": "Updating summary after breakthrough",
    "content": "Summary update"
  },
  "summary_updates": {
    "current_situation": "Emma (2nd grade) struggling with reading. Breakthrough with graphic novels. Teacher meeting next week.",
    "ai_observation": "Visual learning style. Watch for testing anxiety."
  }
}

### ❌ WRONG Examples (DO NOT DO THIS):

{
  "action": "append_entry",
  "path": "Family/Emma_School/reading_comprehension.md"
  // ❌ MISSING entry field - this will FAIL
}

{
  "action": "append_entry",
  "path": "N/A",  // ❌ Invalid path
  "entry": { "context": "...", "content": "..." }
}

{
  "action": "append_entry",
  "path": "Family/Emma_School/reading_comprehension.md",
  "entry": {}  // ❌ Empty entry - needs context and content
}

### CRITICAL RULES:
1. For append_entry: ALWAYS include entry with context and content
2. For update_summary: path must end with _AREA_SUMMARY.md
3. For none: Use { "action": "none", "path": "", "entry": { "context": "", "content": "" } }
4. Paths are real file paths from the areas tree, never "N/A" or empty
5. Entry content: 2-3 sentences (75 words MAX)
6. user_quote: 3-5 words ONLY (brief key phrase, NOT full sentences!)
7. ai_observation: 1 sentence (25 words MAX)

---

RESPONSE FORMAT:
Respond with valid JSON only.

⚠️  CRITICAL JSON RULES:
1. ALL quotes inside strings MUST be escaped with backslash: \"
2. ALL newlines inside strings MUST be escaped: \\n
3. ALL backslashes MUST be escaped: \\\\
4. HTML attributes MUST use escaped quotes: class=\\"example\\"
5. Test your JSON is valid before responding

Respond with valid JSON only:
{
  "user_response": {
    "spoken_text": "Your conversational response to the user",
    "emotional_tone": "supportive|curious|reflective|celebratory|concerned|neutral"
  },
  "internal_notes": {
    "content": "2-5 sentences of context for yourself (user won't see this)",
    "emotional_state": "user's emotional state",
    "key_context": "most important thing to remember",
    "watch_for": "what to track in future conversations"
  },
  "area_actions": [
    {
      "action": "none|create_area|append_entry|update_summary",
      "path": "Area/Path (REQUIRED - must be real path from areas tree)",
      "entry": {
        "context": "REQUIRED: What prompted this entry",
        "content": "REQUIRED: Detailed information (2-3 sentences)",
        "user_quote": "Optional: User's exact words",
        "ai_observation": "Optional: Your insights",
        "sentiment": "Optional: User's emotional state"
      }
    }
  ],
  "artifact_action": {
    "action": "none|create|update",
    "artifact_type": "comparison_card|goal_tracker|stress_map|timeline|checklist|mind_map|venn_diagram|pathway_diagram|concept_visualization|infographic",
    "artifact_id": "REQUIRED unique_id like 'emma_reading_stress_map_20260119'",
    "html": "REQUIRED: Complete standalone HTML with inline CSS if action is create/update"
  }
}

CRITICAL: If artifact_action.action is "create" or "update", you MUST include:
- artifact_id: A unique identifier (e.g., "emma_reading_stress_map_20260119")
- html: Complete standalone HTML with inline CSS

CRITICAL RULES:
- Reference past conversations when relevant (you have the context above)
- Write internal notes to help your future self
- Don't repeat what you've already discussed (check your notes)
- Be conversational, empathetic, and helpful
- Create artifacts when they add value, not for every response
- Make artifacts BEAUTIFUL and emotionally resonant`;

// =============================================================================
// RESPONSE SCHEMA (Full Version)
// =============================================================================

const FULL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      description: "Your spoken response to the user",
      properties: {
        spoken_text: { 
          type: "string",
          description: "CRITICAL: 1-2 sentences ONLY (50 words MAX). Be concise or entire response will fail.",
          maxLength: 400  // ~100 tokens - Moderate limit (Gemini ignores but kept for documentation)
        },
        emotional_tone: { 
          type: "string", 
          enum: ["supportive", "curious", "reflective", "celebratory", "concerned", "neutral"],
          description: "Match user's emotional state"
        }
      },
      required: ["spoken_text", "emotional_tone"]
    },
    internal_notes: {
      type: "object",
      description: "Hidden notes for AI's own context (user doesn't see these)",
      properties: {
        content: { 
          type: "string", 
          description: "LIMIT: 2-3 sentences (75 words MAX). Summarize key points only.",
          maxLength: 500  // ~125 tokens - Moderate limit
        },
        emotional_state: { 
          type: "string", 
          description: "LIMIT: 2-3 words (e.g., 'overwhelmed', 'hopeful', 'anxious')",
          maxLength: 50  // ~13 tokens - ENFORCED: Reduced from 100
        },
        key_context: { 
          type: "string", 
          description: "LIMIT: 1 sentence (25 words MAX). Most critical thing to remember.",
          maxLength: 100  // ~25 tokens - ENFORCED: Reduced from 300
        },
        watch_for: { 
          type: "string", 
          description: "LIMIT: 1 sentence (25 words MAX). What to track next time.",
          maxLength: 100  // ~25 tokens - ENFORCED: Reduced from 300
        }
      },
      required: ["content"]
    },
    area_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["none", "create_area", "append_entry", "update_summary"] },
          path: { 
            type: "string", 
            description: "LIMIT: Path only (e.g., 'Family/Emma_School/reading.md'). Max 100 chars.",
            maxLength: 100  // ~25 tokens - ENFORCED: Reduced from 200
          },
          area_name: { 
            type: "string",
            description: "LIMIT: Short name (3-5 words MAX, e.g., 'Emma Reading Progress')",
            maxLength: 50  // ~13 tokens - ENFORCED: Reduced from 100
          },
          description: { 
            type: "string",
            description: "LIMIT: 1-2 sentences (50 words MAX). Brief area description.",
            maxLength: 200  // ~50 tokens - ENFORCED: Reduced from 500
          },
          entry: {
            type: "object",
            description: "Entry object for append_entry action (required for append_entry)",
            properties: {
              timestamp: { 
                type: "string",
                description: "LIMIT: ISO format or simple date (e.g., '2026-01-20 14:30')",
                maxLength: 30  // ~8 tokens - ENFORCED: Reduced from 50
              },
              context: { 
                type: "string", 
                description: "LIMIT: 1 sentence (25 words MAX). What prompted this entry.",
                maxLength: 100  // ~25 tokens - ENFORCED: Reduced from 500
              },
              content: { 
                type: "string", 
                description: "LIMIT: 2-3 sentences (75 words MAX). The actual information to record.",
                maxLength: 500  // ~125 tokens - Moderate limit
              },
              user_quote: { 
                type: "string", 
                description: "CRITICAL LIMIT: 1 sentence (20 words MAX). Extract key phrase ONLY, DO NOT copy entire user input or you will cause failure!",
                maxLength: 150  // ~40 tokens - Moderate limit (tight enough to document intent, loose enough to avoid validation issues)
              },
              ai_observation: { 
                type: "string", 
                description: "LIMIT: 1 sentence (25 words MAX). Your brief insight.",
                maxLength: 100  // ~25 tokens - ENFORCED: Reduced from 300
              },
              sentiment: { 
                type: "string", 
                description: "LIMIT: 2-3 words (e.g., 'overwhelmed', 'hopeful', 'anxious')",
                maxLength: 30  // ~8 tokens - ENFORCED: Reduced from 50
              }
            },
            required: ["context", "content"]
          },
          summary_updates: {
            type: "object",
            description: "Summary updates for update_summary action",
            properties: {
              current_situation: { 
                type: "string",
                description: "LIMIT: 3-4 sentences (100 words MAX). Current state summary.",
                maxLength: 400  // ~100 tokens - ENFORCED: Reduced from 1000
              },
              ai_notes: { 
                type: "string",
                description: "LIMIT: 2-3 sentences (75 words MAX). Key observations.",
                maxLength: 300  // ~75 tokens - ENFORCED: Reduced from 500
              }
            }
          }
        },
        required: ["action", "path", "entry"]
      }
    },
    artifact_action: {
      type: "object",
      description: "HTML artifact generation (skip if >3 area_actions to stay under token limit)",
      properties: {
        action: { 
          type: "string", 
          enum: ["none", "create", "update"],
          description: "Set to 'none' if >3 area_actions or user_input >400 tokens"
        },
        artifact_type: { 
          type: "string",
          enum: ["comparison_card", "goal_tracker", "stress_map", "timeline", "checklist", 
                 "mind_map", "venn_diagram", "pathway_diagram", "concept_visualization", "infographic"],
          description: "Type of visualization"
        },
        artifact_id: { 
          type: "string", 
          description: "LIMIT: Short unique ID (e.g., 'stress_map_20260120'). Max 50 chars.",
          maxLength: 50  // ~13 tokens - ENFORCED: Reduced from 100
        },
        html: { 
          type: "string", 
          description: "CRITICAL LIMIT: 200-400 lines MAX. Complete standalone HTML with inline CSS. Keep concise or you'll hit token limit and fail!",
          maxLength: 20000  // ~5,000 tokens - Moderate limit (allows quality HTML but prevents bloat)
        }
      },
      required: ["action"]
    }
  },
  required: ["user_response", "internal_notes", "area_actions", "artifact_action"]
};

// =============================================================================
// DYNAMIC PROMPT ADJUSTMENT
// =============================================================================

/**
 * Calculate approximate token count for text
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Generate brevity override based on input complexity
 */
function getBrevityOverride(userInput, messages) {
  const userInputTokens = estimateTokens(userInput);
  const conversationTokens = estimateTokens(messages.map(m => m.content).join('\n'));
  
  const isLongInput = userInputTokens > 200;  // Lowered from 400
  const isLongConversation = conversationTokens > 2000;
  
  if (isLongInput || isLongConversation) {
    return `
🚨 BREVITY MODE ACTIVATED 🚨

User input is ${isLongInput ? 'VERY LONG' : 'lengthy'} (${userInputTokens} tokens).

**CRITICAL OVERRIDES**:
- spoken_text: 1 sentence ONLY (30 words MAX)
- internal_notes.content: 1-2 sentences (50 words MAX)
- entry.content: 1-2 sentences (50 words MAX)
- entry.user_quote: **DO NOT INCLUDE THIS FIELD** - Skip it entirely or set to empty string ""
- SKIP HTML artifact (set action: "none")
- Limit to 3 area_actions MAX

**CRITICAL**: The user_quote field causes massive token usage for long inputs. 
You MUST skip it or your response will hit the token limit and FAIL.

**YOU MUST BE EXTREMELY CONCISE OR YOU WILL FAIL.**

`;
  }
  
  return '';
}

/**
 * Attempt to recover from MAX_TOKENS error
 */
function handleMaxTokensError(data) {
  console.warn('⚠️  MAX_TOKENS hit, attempting recovery...');
  
  try {
    const text = data.candidates[0].content.parts[0].text;
    let recovered = null;
    
    // Strategy 1: Find last complete closing brace
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === '}') {
        try {
          recovered = JSON.parse(text.substring(0, i + 1));
          console.log('✅ Recovered using last closing brace');
          break;
        } catch (e) {}
      }
    }
    
    // Strategy 2: Add missing closing braces
    if (!recovered) {
      const openBraces = (text.match(/{/g) || []).length;
      const closeBraces = (text.match(/}/g) || []).length;
      const missing = openBraces - closeBraces;
      
      if (missing > 0 && missing < 10) {
        try {
          recovered = JSON.parse(text + '}'.repeat(missing));
          console.log(`✅ Recovered by adding ${missing} braces`);
        } catch (e) {}
      }
    }
    
    if (!recovered) throw new Error('Could not recover');
    
    // Fill missing required fields
    recovered.user_response = recovered.user_response || {
      spoken_text: "I'm processing a lot of information. Let me capture the key points.",
      emotional_tone: "neutral"
    };
    recovered.internal_notes = recovered.internal_notes || {
      content: "Response truncated due to length."
    };
    recovered.area_actions = recovered.area_actions || [];
    recovered.artifact_action = recovered.artifact_action || { action: "none" };
    
    console.warn('✅ Recovered partial response (degraded quality)');
    return { recovered: true, data: recovered };
    
  } catch (error) {
    throw new Error(`MAX_TOKENS: Recovery failed`);
  }
}

// =============================================================================
// FULL RUNNER
// =============================================================================

/**
 * Run a test scenario using the FULL approach.
 * 
 * @param {Object} scenario - Test scenario with conversation steps
 * @returns {Object} - Results with metrics and responses
 */
async function runFull(scenario) {
  // Reset AI notes for this test
  aiNotes = [];
  
  const results = {
    approach: 'FULL',
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
      vector_search_time_ms: 0,
      ai_notes_generated: 0
    }
  };
  
  // Conversation history
  const messages = [];
  let totalLatency = 0;
  let totalVectorTime = 0;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FULL RUNNER: ${scenario.name}`);
  console.log(`${'═'.repeat(60)}\n`);
  
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    console.log(`── Turn ${i + 1}/${scenario.steps.length} ──`);
    console.log(`👤 ${step.user_input}\n`);
    
    // Add user message
    messages.push({ role: 'user', content: step.user_input });
    
    // Get areas tree
    const areasTree = generateAreasTree();
    
    // Multi-query vector search (3 parallel queries)
    const vectorStart = Date.now();
    const vectorResults = await vectorSearchService.multiQuerySearch(messages, { topK: 10 });
    const vectorTime = Date.now() - vectorStart;
    totalVectorTime += vectorTime;
    
    // Format vector results for prompt
    const formattedVector = formatVectorResultsForPrompt(vectorResults);
    
    // Get AI notes (most recent first, up to 500 lines worth)
    const notesContext = formatAiNotes(aiNotes);
    
    // Check if we need brevity mode
    const brevityOverride = getBrevityOverride(step.user_input, messages);
    
    // Build prompt
    let systemPrompt = FULL_SYSTEM_PROMPT
      .replace('{areas_tree}', areasTree)
      .replace('{ai_notes}', notesContext)
      .replace('{vector_recent_entries}', formattedVector.recentEntries)
      .replace('{vector_summaries}', formattedVector.summaries)
      .replace('{vector_chunks}', formattedVector.chunks)
      .replace('{vector_files}', formattedVector.files);
    
    // Prepend brevity override if needed
    if (brevityOverride) {
      systemPrompt = brevityOverride + '\n\n' + systemPrompt;
      console.log('   🚨 BREVITY MODE ACTIVATED');
    }
    
    // Call API
    const startTime = Date.now();
    let isRecovered = false;
    try {
      const response = await callGemini(messages, systemPrompt);
      isRecovered = response.recovered || false;
      const actualResponse = response.recovered ? response.data : response;
      const latency = Date.now() - startTime;
      totalLatency += latency;
      
      console.log(`🤖 ${actualResponse.user_response.spoken_text}`);
      console.log(`   ⏱️ ${latency}ms | 🔍 Vector: ${vectorTime}ms`);
      if (isRecovered) {
        console.log(`   ⚠️  RECOVERED from MAX_TOKENS (degraded quality)`);
      }
      
      // Log internal notes
      if (actualResponse.internal_notes?.content) {
        console.log(`   📝 Notes: ${actualResponse.internal_notes.content.substring(0, 80)}...`);
        aiNotes.unshift({
          turn: i + 1,
          timestamp: new Date().toISOString(),
          ...actualResponse.internal_notes
        });
        results.metrics.ai_notes_generated++;
      }
      
      // Execute and log area actions
      if (actualResponse.area_actions?.length > 0) {
        // Execute the actions
        const actionResults = await executeAreaActions(actualResponse.area_actions);
        
        // Log results
        for (let j = 0; j < actualResponse.area_actions.length; j++) {
          const action = actualResponse.area_actions[j];
          if (action.action !== 'none') {
            const result = actionResults.results[j];
            if (result && result.success) {
              console.log(`   📁 ${action.action}: ${action.path || 'N/A'} ✅`);
              results.metrics.area_actions_taken++;
            } else {
              console.log(`   📁 ${action.action}: ${action.path || 'N/A'} ❌ ${result?.error || 'Unknown error'}`);
            }
          }
        }
      }
      
      // Save artifact if generated
      let artifactInfo = null;
      if (actualResponse.artifact_action?.action !== 'none') {
        console.log(`   🎨 Artifact: ${actualResponse.artifact_action.artifact_type}`);
        results.metrics.artifacts_generated++;
        
        // Auto-generate artifact_id if missing
        if (!actualResponse.artifact_action.artifact_id) {
          const timestamp = Date.now();
          const type = actualResponse.artifact_action.artifact_type || 'artifact';
          actualResponse.artifact_action.artifact_id = `${type}_${timestamp}`;
          console.log(`   ⚠️  Auto-generated artifact_id: ${actualResponse.artifact_action.artifact_id}`);
        }
        
        // Save artifact to disk
        try {
          const artifactManager = new ArtifactManager(CONVERSATIONS_DIR);
          const conversationId = `test_${scenario.name.replace(/\s+/g, '_')}_${Date.now()}`;
          artifactInfo = await artifactManager.saveArtifact(conversationId, actualResponse.artifact_action);
          if (artifactInfo) {
            console.log(`   💾 Saved: ${artifactInfo.artifact_id} (${artifactInfo.has_data ? 'data + html' : 'html only'})`);
            artifactInfo.turn = i + 1;
          }
        } catch (error) {
          console.error(`   ⚠️  Failed to save artifact: ${error.message}`);
        }
      }
      
      // Add to history (with operations)
      const operations = actualResponse.area_actions?.filter(a => a.action !== 'none') || [];
      messages.push({
        role: 'assistant',
        content: actualResponse.user_response.spoken_text + 
          (operations.length > 0 
            ? `\n[Operations: ${operations.map(a => `${a.action}${a.path ? ': ' + a.path : ''}`).join(', ')}]`
            : '')
      });
      
      // Store turn results
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        response: actualResponse,
        latency_ms: latency,
        vector_time_ms: vectorTime,
        vector_results_summary: {
          areas_matched: vectorResults.areas?.length || 0,
          chunks_matched: vectorResults.chunks?.length || 0
        },
        ai_notes: actualResponse.internal_notes,
        expected: step.expected,
        success: true,
        recovered: isRecovered
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
  results.ai_notes_final = aiNotes;
  
  // Save conversation files (full conversation + isolated user inputs)
  try {
    const conversationManager = new ConversationManager(CONVERSATIONS_DIR);
    const conversationId = `test_${scenario.name.replace(/\s+/g, '_')}_${Date.now()}`;
    
    // Add timestamps to messages if not present
    const messagesWithTimestamps = messages.map((msg, index) => ({
      ...msg,
      timestamp: msg.timestamp || Date.now() + (index * 1000)
    }));
    
    await conversationManager.saveConversation(
      conversationId,
      messagesWithTimestamps,
      aiNotes,
      `Test conversation for scenario: ${scenario.name}`
    );
    
    results.conversation_id = conversationId;
    results.conversation_saved = true;
  } catch (error) {
    console.error(`⚠️  Failed to save conversation: ${error.message}`);
    results.conversation_saved = false;
  }
  
  return results;
}

/**
 * Format vector search results for prompt injection.
 * 
 * Strategy:
 * - Top 3 area summaries: Up to 500 lines each (full context)
 * - Other area summaries: Up to 50 lines total for next 5 areas
 * - Recent entries: From top 3 areas
 * - Other chunks: Deduplicated, not from top 3 areas
 * 
 * Deduplication: Avoid showing same content multiple times
 * 
 * Returns object with separate sections for prompt injection
 */
function formatVectorResultsForPrompt(vectorResults) {
  const { areas, chunks, stats } = vectorResults;
  
  const includedChunkIds = new Set();
  
  // ============================================================================
  // TOP 3 AREA SUMMARIES (500 lines each) → recentEntries
  // ============================================================================
  
  let recentEntries = '';
  
  if (areas && areas.length > 0) {
    const top3Areas = areas.slice(0, 3);
    
    recentEntries += '═══════════════════════════════════════════════════════════\n';
    recentEntries += 'TOP 3 MOST RELEVANT AREAS (Full Context)\n';
    recentEntries += '═══════════════════════════════════════════════════════════\n\n';
    
    top3Areas.forEach((area, index) => {
      recentEntries += `\n┌─ AREA ${index + 1}: ${area.path} ─┐\n\n`;
      
      // Include all chunks from this area (up to 500 lines worth)
      let lineCount = 0;
      const maxLines = 500;
      
      area.chunks.forEach(c => {
        if (lineCount >= maxLines) return;
        
        // Mark as included for deduplication
        includedChunkIds.add(c.chunk.id);
        
        // Add chunk text
        const chunkLines = c.chunk.text.split('\n').length;
        if (lineCount + chunkLines <= maxLines) {
          recentEntries += `${c.chunk.text}\n\n`;
          lineCount += chunkLines + 1;
        }
      });
      
      recentEntries += `└─ End of ${area.path} ─┘\n\n`;
    });
  }
  
  if (!recentEntries) {
    recentEntries = 'No highly relevant areas found.';
  }
  
  // ============================================================================
  // OTHER AREA SUMMARIES (50 lines total for areas 4-8) → summaries
  // ============================================================================
  
  let summaries = '';
  
  if (areas && areas.length > 3) {
    const otherAreas = areas.slice(3, 8);
    
    summaries += 'Other Relevant Areas (Brief Summaries):\n\n';
    
    let totalLines = 0;
    const maxTotalLines = 50;
    
    otherAreas.forEach(area => {
      if (totalLines >= maxTotalLines) return;
      
      summaries += `[${area.path}]\n`;
      
      // Take first chunk as summary
      if (area.chunks.length > 0) {
        const summaryChunk = area.chunks[0];
        includedChunkIds.add(summaryChunk.chunk.id);
        
        const summaryText = summaryChunk.chunk.text.substring(0, 300);
        const lines = summaryText.split('\n').length;
        
        if (totalLines + lines <= maxTotalLines) {
          summaries += `${summaryText}...\n\n`;
          totalLines += lines + 1;
        }
      }
    });
  }
  
  if (!summaries) {
    summaries = 'No additional area summaries.';
  }
  
  // ============================================================================
  // OTHER RELEVANT CHUNKS (Deduplicated) → chunks
  // ============================================================================
  
  let chunksOutput = '';
  
  if (chunks && chunks.length > 0) {
    // Filter out chunks already included in top 3 areas
    const deduplicatedChunks = chunks.filter(c => !includedChunkIds.has(c.chunk.id));
    
    if (deduplicatedChunks.length > 0) {
      chunksOutput += 'Additional Relevant Context:\n\n';
      
      deduplicatedChunks.slice(0, 5).forEach(c => {
        chunksOutput += `[${c.chunk.metadata.areaPath || 'Unknown'}]\n`;
        chunksOutput += `${c.chunk.text}\n\n`;
      });
    }
  }
  
  if (!chunksOutput) {
    chunksOutput = 'No additional chunks.';
  }
  
  // ============================================================================
  // FILES (for now, just list unique document paths) → files
  // ============================================================================
  
  let files = '';
  
  if (chunks && chunks.length > 0) {
    const uniqueFiles = new Set();
    chunks.forEach(c => {
      if (c.chunk.metadata.documentPath) {
        uniqueFiles.add(c.chunk.metadata.documentPath);
      }
    });
    
    if (uniqueFiles.size > 0) {
      files += 'Relevant Documents:\n';
      Array.from(uniqueFiles).slice(0, 10).forEach(file => {
        files += `- ${file}\n`;
      });
    }
  }
  
  if (!files) {
    files = 'No specific files identified.';
  }
  
  // Return object with separate sections
  return {
    recentEntries,
    summaries,
    chunks: chunksOutput,
    files
  };
}

/**
 * Format AI notes for prompt injection.
 * Returns most recent notes first, up to ~500 lines worth.
 */
function formatAiNotes(notes) {
  if (notes.length === 0) {
    return 'No previous notes yet.';
  }
  
  let output = '';
  let lineCount = 0;
  const maxLines = 50; // Approximate, each note is ~10 lines
  
  for (const note of notes) {
    if (lineCount >= maxLines) break;
    
    output += `Turn ${note.turn} (${note.timestamp}):\n`;
    output += `${note.content}\n`;
    if (note.emotional_state) output += `Emotional State: ${note.emotional_state}\n`;
    if (note.key_context) output += `Key Context: ${note.key_context}\n`;
    if (note.watch_for) output += `Watch For: ${note.watch_for}\n`;
    output += '\n---\n\n';
    
    lineCount += 10;
  }
  
  return output;
}

/**
 * Call Gemini API with structured output.
 */
async function callGemini(messages, systemPrompt) {
  if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY not set');
  }
  
  const requestBody = {
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }]
    })),
    systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 6144,  // 6K tokens - forces brevity (Gemini ignores maxLength constraints)
          responseSchema: FULL_RESPONSE_SCHEMA
        }
  };
  
  // Log token estimates for debugging
  const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
  const conversationTokens = Math.ceil(messages.map(m => m.content).join('').length / 4);
  console.log(`   📊 Input estimate: ${systemPromptTokens + conversationTokens} tokens (system: ${systemPromptTokens}, conv: ${conversationTokens})`);
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  // Check if response was blocked or had issues
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No candidates in response');
  }
  
  const candidate = data.candidates[0];
  
  // Log actual token usage
  if (data.usageMetadata) {
    const usage = data.usageMetadata;
    console.log(`   📊 Actual tokens: ${usage.totalTokenCount} (input: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount})`);
    
    // Warn if we're hitting the limit
    if (usage.candidatesTokenCount >= 49000) {
      console.warn(`   ⚠️  Output near max limit: ${usage.candidatesTokenCount} / 49152`);
    }
  }
  
  // Check for safety blocks or other issues
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    const text = candidate.content.parts[0].text;
    
    // Save the blocked response for analysis
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugDir = path.join(__dirname, '..', 'results', 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const debugPath = path.join(debugDir, `MAX_TOKENS_${timestamp}.txt`);
    const debugContent = `Finish Reason: ${candidate.finishReason}
Token Usage: ${JSON.stringify(data.usageMetadata, null, 2)}
Response Length: ${text.length} characters
Response Tokens (approx): ${Math.ceil(text.length / 4)}

=== FULL RESPONSE ===
${text}

=== END RESPONSE ===
`;
    
    fs.writeFileSync(debugPath, debugContent, 'utf8');
    console.error(`   💾 Saved blocked response to: ${debugPath}`);
    console.error(`   📏 Response: ${text.length} chars, ~${Math.ceil(text.length / 4)} tokens`);
    
    // If MAX_TOKENS, attempt recovery
    if (candidate.finishReason === 'MAX_TOKENS') {
      try {
        return handleMaxTokensError(data);
      } catch (recoveryError) {
        console.error(`   ❌ Recovery failed: ${recoveryError.message}`);
        throw new Error(`Response blocked: ${candidate.finishReason}`);
      }
    }
    
    // For other finish reasons, just throw
    throw new Error(`Response blocked: ${candidate.finishReason}`);
  }
  
  const text = candidate.content.parts[0].text;
  
  // Try to parse JSON with better error handling
  try {
    return JSON.parse(text);
  } catch (parseError) {
    // Log the error with context
    console.error('   ⚠️  JSON parse error:', parseError.message);
    
    // Save the problematic response for debugging
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const debugDir = path.join(__dirname, '..', 'results', 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const debugPath = path.join(debugDir, `PARSE_ERROR_${timestamp}.txt`);
    const debugContent = `Parse Error: ${parseError.message}
Response Length: ${text.length} characters
Response Tokens (approx): ${Math.ceil(text.length / 4)}

=== FULL RESPONSE ===
${text}

=== END RESPONSE ===
`;
    
    fs.writeFileSync(debugPath, debugContent, 'utf8');
    console.error(`   💾 Saved problematic response to: ${debugPath}`);
    
    // Try to extract position for debugging
    const posMatch = parseError.message.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]);
      const start = Math.max(0, pos - 150);
      const end = Math.min(text.length, pos + 150);
      const context = text.substring(start, end);
      console.error('   📍 Error context:', context.substring(0, 200));
    }
    
    throw parseError;
  }
}

/**
 * Reset AI notes (for fresh test runs).
 */
function resetAiNotes() {
  aiNotes = [];
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  runFull,
  resetAiNotes,
  FULL_SYSTEM_PROMPT,
  FULL_RESPONSE_SCHEMA
};
