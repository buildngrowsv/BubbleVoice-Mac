#!/usr/bin/env node

/**
 * models.js
 * 
 * Model configurations for BubbleVoice artifact generation benchmarks.
 * Contains API endpoints, model IDs, and structured output configurations
 * for each provider we're testing.
 * 
 * UPDATED: January 19, 2026 - Latest model IDs from Context7 docs lookup
 * 
 * Models included:
 * - OpenAI: GPT-5.2, GPT-5.1, GPT-5-mini, GPT-5-nano, GPT-4o-mini
 * - Anthropic: Claude Sonnet 4.5, Claude Haiku 4.5, Claude 3.5 Haiku
 * - Google: Gemini 2.5 Flash Lite, Gemini 2.5 Pro, Gemini 2.5 Flash
 * 
 * NOTE: API keys should be provided via environment variables:
 * - GOOGLE_API_KEY (for Gemini)
 * - OPENAI_API_KEY (for OpenAI)
 * - ANTHROPIC_API_KEY (for Claude)
 */

// =============================================================================
// STRUCTURED OUTPUT SCHEMA
// =============================================================================
// This is the response schema the AI must follow at every conversation turn.
// It separates: user-visible response, internal notes (hidden), artifact actions

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      description: "What the AI says to the user (visible/spoken)",
      properties: {
        text: {
          type: "string",
          description: "The actual response text shown/spoken to user"
        },
        tone: {
          type: "string",
          enum: ["empathetic", "curious", "supportive", "neutral", "excited", "concerned"],
          description: "Emotional tone of the response"
        }
      },
      required: ["text", "tone"]
    },
    internal_notes: {
      type: "object",
      description: "AI's private observations - NEVER shown to user",
      properties: {
        observations: {
          type: "string",
          description: "What the AI noticed about user's emotional state, concerns, patterns"
        },
        context_updates: {
          type: "string",
          description: "Important facts/context to remember for future turns"
        },
        reasoning: {
          type: "string",
          description: "Why the AI chose this response approach"
        }
      },
      required: ["observations"]
    },
    artifact_action: {
      type: "object",
      description: "Action to take on artifacts (create, update, or none)",
      properties: {
        action: {
          type: "string",
          enum: ["none", "create", "update"],
          description: "What to do with artifacts"
        },
        artifact_id: {
          type: "string",
          description: "Unique ID for the artifact (required if action is create/update)"
        },
        artifact_type: {
          type: "string",
          enum: [
            "comparison_card", "goal_tracker", "stress_map", "timeline", "checklist", "decision_framework",
            "mind_map", "venn_diagram", "pathway_diagram", "concept_visualization", "infographic"
          ],
          description: "Type of artifact - data artifacts (first 6) have data field, visual artifacts (last 5) are html-only"
        },
        data_json: {
          type: "string",
          description: "JSON string containing the artifact data structure. Parse this to get the actual data object."
        },
        html: {
          type: "string",
          description: "Complete standalone HTML with inline CSS when action is create or update. Must be beautiful, polished, and use liquid glass styling. Only include if you're creating or updating the visual. Omit if action is 'none'."
        }
      },
      required: ["action"]
    }
  },
  required: ["user_response", "internal_notes", "artifact_action"]
};

// Gemini-specific schema (uses string for flexible data)
const GEMINI_RESPONSE_SCHEMA = RESPONSE_SCHEMA;

// OpenAI/Claude schema can use proper nested objects
const FLEXIBLE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        text: { type: "string" },
        tone: { type: "string", enum: ["empathetic", "curious", "supportive", "neutral", "excited", "concerned"] }
      },
      required: ["text", "tone"]
    },
    internal_notes: {
      type: "object",
      properties: {
        observations: { type: "string" },
        context_updates: { type: "string" },
        reasoning: { type: "string" }
      },
      required: ["observations"]
    },
    artifact_action: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["none", "create", "update"] },
        artifact_id: { type: "string" },
        artifact_type: { type: "string", enum: ["goal_tracker", "comparison_card", "timeline", "checklist", "reflection_summary", "notes"] },
        data: { type: "object" }
      },
      required: ["action"]
    }
  },
  required: ["user_response", "internal_notes", "artifact_action"]
};

// JSON Schema as string for OpenAI's response_format
const RESPONSE_SCHEMA_JSON = JSON.stringify(RESPONSE_SCHEMA, null, 2);

// =============================================================================
// SYSTEM PROMPT
// =============================================================================
// This prompt defines the AI's persona and behavior rules
// Enhanced version with emotional intelligence and visual artifact support

const { ENHANCED_EMOTIONAL_PROMPT } = require('./enhanced-emotional-prompt.js');
const SYSTEM_PROMPT = ENHANCED_EMOTIONAL_PROMPT;

// Fallback if enhanced prompt fails to load
const SYSTEM_PROMPT_FALLBACK = `You are Bubble, a personal AI companion. You help users think through life's complexities through conversation and STUNNING VISUAL artifacts.

## CRITICAL: Artifacts Must Be Beautiful HTML

When you create artifacts, you MUST generate complete, standalone HTML with inline CSS that looks PREMIUM and POLISHED.

**Required styling:**
- Liquid glass / glassmorphism (backdrop-filter: blur(20px), semi-transparent backgrounds)
- Modern color palettes with gradients
- Thoughtful typography (font weights, sizes, spacing)
- Subtle shadows for depth (box-shadow: 0 8px 32px rgba(0,0,0,0.1))
- Smooth rounded corners (border-radius: 16px-24px)
- Smart use of emojis or icons for visual interest
- Responsive spacing and padding

**Example HTML (comparison card):**
\`\`\`html
<div class="comparison-card">
  <h2>🤔 Job Decision</h2>
  <div class="comparison-grid">
    <div class="option stable">
      <div class="option-header">
        <h3>💼 Stable Company</h3>
        <span class="badge">Safe Choice</span>
      </div>
      <div class="factors">
        <div class="factor pro">✅ Higher salary ($120k)</div>
        <div class="factor pro">✅ Great benefits</div>
        <div class="factor con">⚠️ Boring work</div>
      </div>
    </div>
    <div class="option exciting">
      <div class="option-header">
        <h3>🚀 Startup</h3>
        <span class="badge">Risky</span>
      </div>
      <div class="factors">
        <div class="factor pro">✅ Exciting challenges</div>
        <div class="factor pro">✅ Equity opportunity</div>
        <div class="factor con">⚠️ Lower pay ($90k)</div>
      </div>
    </div>
  </div>
</div>

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 40px;
    min-height: 100vh;
  }
  .comparison-card {
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    padding: 40px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    max-width: 900px;
    margin: 0 auto;
  }
  h2 { font-size: 32px; margin-bottom: 32px; color: #2d3748; }
  .comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .option {
    background: white;
    border-radius: 16px;
    padding: 24px;
    border-left: 4px solid;
  }
  .option.stable { border-color: #4299e1; }
  .option.exciting { border-color: #ed8936; }
  .option-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  h3 { font-size: 20px; color: #2d3748; }
  .badge {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 6px 14px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  .factors { display: flex; flex-direction: column; gap: 12px; }
  .factor {
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 15px;
  }
  .factor.pro { background: #f0fff4; color: #22543d; }
  .factor.con { background: #fffaf0; color: #7c2d12; }
</style>
\`\`\`

The HTML should be complete and standalone - user should be able to save it as .html and open it in a browser.

**Your artifact_action should look like:**
{
  "action": "create",
  "artifact_type": "comparison_card",
  "artifact_id": "job_decision_001",
  "data": { "stable_salary": 120000, "startup_salary": 90000, ... },
  "html": "<div class='comparison-card'>...</div><style>...</style>"
}

## Artifact Intelligence: WHEN to Create

### ✅ CREATE artifacts when:
1. **Complexity Threshold Met** - User describes 3+ interconnected concerns/factors across multiple domains
   Example: "I have startup launch, Emma's project, Jake's reading issues, house repairs..." → CREATE stress map
2. **Decision with Tradeoffs** - User is comparing 2+ options with pros/cons
   Example: "Job A is stable but boring, Job B is risky but exciting..." → CREATE comparison card
3. **Timeline/Progress Tracking Needed** - Multiple deadlines or progress over time
   Example: "I want to exercise 3x/week but keep failing..." → CREATE goal tracker

### ❌ DO NOT create artifacts when:
1. **Casual Conversation** - Simple thoughts without complexity
   Example: "I'm thinking about getting a dog" (no factors yet) → NO artifact
2. **Single-Factor Situations** - Only one thing to track
3. **Questions** - User asking for opinion or clarification
   Example: "What do you think?" → NO artifact
4. **Gratitude/Acknowledgment** - "Thanks, this helps" → NO artifact

## Artifact Modification: WHAT to Change

### 1. DATA-ONLY Updates
**When:** User corrects fact, adds info, updates status
**Change:** ONLY data/content | **Preserve:** ALL styling, layout, colors
Example: "Emma's project is Thursday not Friday" → Change deadline ONLY

### 2. UI-ONLY Updates  
**When:** User requests visual/styling changes
**Change:** ONLY styling, emphasis, colors | **Preserve:** ALL data
Example: "Make startup stuff stand out more" → Emphasize visually ONLY

### 3. COMBINED Updates
**When:** Data change implies UI change
**Change:** Both data and relevant UI | **Preserve:** Unrelated elements
Example: "Launch pushed to next month" → Update deadline + reduce urgency styling

### 4. COMPLETE OVERHAUL
**When:** User requests fundamental restructuring
**Change:** Entire structure/format | **Preserve:** Core data
Example: "Show as calendar instead of matrix" → Rebuild structure, keep data

### 5. NO CHANGE (Preservation)
**When:** User just talking, asking questions, expressing gratitude
**Change:** NOTHING | **Preserve:** EVERYTHING
Example: "What should I focus on?" → Answer, don't touch artifact

## Response Format

Always include modification_type when action is "update":

{
  "user_response": { "text": "...", "tone": "empathetic" },
  "internal_notes": { 
    "observations": "...",
    "reasoning": "Why this artifact action/modification"
  },
  "artifact_action": {
    "action": "none|create|update",
    "modification_type": "data_only|ui_only|data_and_ui|complete_overhaul",
    "artifact_type": "stress_map|comparison_card|goal_tracker|timeline|reflection_summary|decision_framework",
    "artifact_id": "unique_id",
    "data": { /* structured data */ }
  }
}

## Artifact Types
- stress_map: Multiple domains/concerns with urgency
- comparison_card: Side-by-side decision comparison
- goal_tracker: Progress tracking with targets
- timeline: Events/milestones over time
- reflection_summary: Emotional processing/patterns
- decision_framework: Complex decision with many factors

Remember: Proactive but not presumptuous. Surgical precision in updates. Preservation discipline when no change needed.`;

// =============================================================================
// MODEL CONFIGURATIONS - UPDATED JANUARY 2026
// =============================================================================

const MODELS = {
  // -------------------------------------------------------------------------
  // GOOGLE GEMINI - Latest models from Context7 docs
  // -------------------------------------------------------------------------
  'gemini-2.5-flash-lite': {
    provider: 'google',
    model_id: 'gemini-2.5-flash-lite',
    display_name: 'Gemini 2.5 Flash Lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
    cost_per_1m_input: 0.075,
    cost_per_1m_output: 0.30,
    max_tokens: 65536,
    context_window: 1048576, // 1M tokens!
    supports_structured_output: true,
    is_baseline: true, // Our primary test model - cheapest with good quality
    
    buildRequest: (messages, apiKey) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT + '\n\nIMPORTANT: Include the "html" field in artifact_action when action is "create" or "update". The html field should contain complete standalone HTML with inline CSS. Do NOT include html field when action is "none" (no artifact changes). Respond with ONLY valid JSON, no markdown code blocks.' }] },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      })
    }),
    
    parseResponse: (response) => {
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    }
  },

  'gemini-2.5-pro': {
    provider: 'google',
    model_id: 'gemini-2.5-pro',
    display_name: 'Gemini 2.5 Pro',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    cost_per_1m_input: 1.25,
    cost_per_1m_output: 5.00,
    max_tokens: 65536,
    context_window: 1048576,
    supports_structured_output: true,
    supports_thinking: true,
    
    buildRequest: (messages, apiKey) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })),
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT + '\n\nIMPORTANT: Include the "html" field in artifact_action when action is "create" or "update". The html field should contain complete standalone HTML with inline CSS. Do NOT include html field when action is "none" (no artifact changes). Respond with ONLY valid JSON, no markdown code blocks.' }] },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      })
    }),
    
    parseResponse: (response) => {
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      return JSON.parse(text);
    }
  },

  // -------------------------------------------------------------------------
  // OPENAI - GPT-4o series (working models)
  // -------------------------------------------------------------------------
  'gpt-4o': {
    provider: 'openai',
    model_id: 'gpt-4o',
    display_name: 'GPT-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    cost_per_1m_input: 2.50,
    cost_per_1m_output: 10.00,
    max_tokens: 16384,
    context_window: 128000,
    supports_structured_output: true,
    
    buildRequest: (messages, apiKey) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nRespond ONLY with valid JSON.' },
          ...messages
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4096
      })
    }),
    
    parseResponse: (response) => {
      const text = response.choices?.[0]?.message?.content;
      return JSON.parse(text);
    }
  },

  'gpt-4o-mini': {
    provider: 'openai',
    model_id: 'gpt-4o-mini',
    display_name: 'GPT-4o Mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    cost_per_1m_input: 0.15,
    cost_per_1m_output: 0.60,
    max_tokens: 16384,
    context_window: 128000,
    supports_structured_output: true,
    
    buildRequest: (messages, apiKey) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + `

IMPORTANT: You MUST respond with this EXACT JSON structure:
{
  "user_response": {
    "text": "Your response to the user here",
    "tone": "empathetic|curious|supportive|neutral|excited|concerned"
  },
  "internal_notes": {
    "observations": "What you noticed about the user",
    "context_updates": "Important facts to remember"
  },
  "artifact_action": {
    "action": "none|create|update",
    "artifact_type": "goal_tracker|comparison_card|timeline|checklist|reflection_summary|notes",
    "data": {}
  }
}

Always include user_response with text and tone. Always include internal_notes with observations. Always include artifact_action with action field.` },
          ...messages
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 4096
      })
    }),
    
    parseResponse: (response) => {
      const text = response.choices?.[0]?.message?.content;
      return JSON.parse(text);
    }
  },

  // -------------------------------------------------------------------------
  // ANTHROPIC CLAUDE - Working models
  // -------------------------------------------------------------------------
  'claude-sonnet-4.5': {
    provider: 'anthropic',
    model_id: 'claude-sonnet-4-20250514',
    display_name: 'Claude Sonnet 4.5',
    endpoint: 'https://api.anthropic.com/v1/messages',
    cost_per_1m_input: 3.00,
    cost_per_1m_output: 15.00,
    max_tokens: 8192,
    context_window: 200000,
    supports_structured_output: true,
    description: 'Latest Claude Sonnet 4.5 model',
    
    buildRequest: (messages, apiKey) => ({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT + '\n\nYou MUST use the respond tool to provide your response. Do not respond with plain text.',
        messages: messages,
        tools: [{
          name: 'respond',
          description: 'Provide structured response to the user',
          input_schema: RESPONSE_SCHEMA
        }],
        tool_choice: { type: 'tool', name: 'respond' }
      })
    }),
    
    parseResponse: (response) => {
      const toolUse = response.content?.find(c => c.type === 'tool_use');
      return toolUse?.input;
    }
  },

  'claude-3.5-sonnet': {
    provider: 'anthropic',
    model_id: 'claude-3-5-sonnet-20241022',
    display_name: 'Claude 3.5 Sonnet',
    endpoint: 'https://api.anthropic.com/v1/messages',
    cost_per_1m_input: 3.00,
    cost_per_1m_output: 15.00,
    max_tokens: 8192,
    context_window: 200000,
    supports_structured_output: true, // via tool use
    description: 'Best model for real-world agents and coding',
    
    // Claude uses tool_use for structured output
    buildRequest: (messages, apiKey) => ({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: SYSTEM_PROMPT + '\n\nYou MUST use the respond tool to provide your response. Do not respond with plain text.',
        messages: messages,
        tools: [{
          name: 'respond',
          description: 'Provide structured response to the user',
          input_schema: RESPONSE_SCHEMA
        }],
        tool_choice: { type: 'tool', name: 'respond' }
      })
    }),
    
    parseResponse: (response) => {
      const toolUse = response.content?.find(c => c.type === 'tool_use');
      return toolUse?.input;
    }
  },

  'claude-3.5-haiku': {
    provider: 'anthropic',
    model_id: 'claude-3-5-haiku-20241022',
    display_name: 'Claude 3.5 Haiku',
    endpoint: 'https://api.anthropic.com/v1/messages',
    cost_per_1m_input: 0.25,
    cost_per_1m_output: 1.25,
    max_tokens: 8192,
    context_window: 200000,
    supports_structured_output: true,
    description: 'Fastest and most compact model for near-instant responsiveness',
    
    buildRequest: (messages, apiKey) => ({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        system: SYSTEM_PROMPT + '\n\nYou MUST use the respond tool to provide your response. Do not respond with plain text.',
        messages: messages,
        tools: [{
          name: 'respond',
          description: 'Provide structured response to the user',
          input_schema: RESPONSE_SCHEMA
        }],
        tool_choice: { type: 'tool', name: 'respond' }
      })
    }),
    
    parseResponse: (response) => {
      const toolUse = response.content?.find(c => c.type === 'tool_use');
      return toolUse?.input;
    }
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  MODELS,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  
  // Helper to get API key for a provider
  getApiKey: (provider) => {
    const keys = {
      google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY
    };
    return keys[provider];
  },
  
  // Get baseline model
  getBaselineModel: () => MODELS['gemini-2.5-flash-lite'],
  
  // List all model IDs
  listModels: () => Object.keys(MODELS),
  
  // Get model by ID
  getModel: (id) => MODELS[id],
  
  // Get models by provider
  getModelsByProvider: (provider) => {
    return Object.entries(MODELS)
      .filter(([_, m]) => m.provider === provider)
      .map(([id, m]) => ({ id, ...m }));
  },
  
  // Get cheapest models for each provider
  getCheapestModels: () => ({
    google: 'gemini-2.5-flash-lite',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3.5-haiku'
  })
};
