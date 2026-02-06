/**
 * BUBBLEVOICE MAC - LLM SERVICE
 * 
 * Manages interactions with Large Language Model providers.
 * Supports multiple providers: Gemini, Claude, GPT.
 * 
 * RESPONSIBILITIES:
 * - Generate AI responses to user messages
 * - Stream responses token-by-token for real-time display
 * - Generate structured outputs (bubbles, artifacts)
 * - Handle provider fallback and error recovery
 * - Manage conversation context and history
 * 
 * PRODUCT CONTEXT:
 * The LLM is the core intelligence of BubbleVoice. It needs to:
 * - Understand personal life contexts (family, goals, struggles)
 * - Remember past conversations (via RAG integration)
 * - Generate empathetic, helpful responses
 * - Produce structured outputs (bubbles, artifacts)
 * - Stream responses naturally for conversation flow
 * 
 * TECHNICAL NOTES:
 * - Uses official SDK for each provider
 * - Implements streaming for all providers
 * - Supports structured output via JSON mode
 * - Handles rate limiting and retries
 * - Manages API key rotation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

class LLMService {
  constructor(promptService = null) {
    // Prompt management service (optional)
    // If provided, allows customizable prompts via admin panel
    // If not provided, uses hardcoded defaults
    this.promptService = promptService;
    
    // Initialize API clients
    // These are created lazily when first needed
    this.geminiClient = null;
    this.anthropicClient = null;
    this.openaiClient = null;

    // Provider configuration
    // Maps model names to provider implementations
    // UPDATED (2026-01-28): Added Gemini 3 Pro, Gemini 3 Flash, Opus 4.5
    this.providers = {
      // Gemini models (Google)
      'gemini-2.5-flash-lite': 'gemini',
      'gemini-2.0-flash': 'gemini',
      'gemini-2.0-flash-exp': 'gemini',
      'gemini-3-flash-preview': 'gemini',      // New: Gemini 3 Flash (preview)
      'gemini-3-pro-preview': 'gemini',        // New: Gemini 3 Pro (preview)
      // Claude models (Anthropic)
      'claude-sonnet-4.5': 'anthropic',
      'claude-sonnet-4': 'anthropic',
      'claude-opus-4.5': 'anthropic',    // New: Opus 4.5
      // GPT models (OpenAI)
      'gpt-5.2-turbo': 'openai',
      'gpt-5.1': 'openai'
    };
    
    // Model display names for logging and UI
    this.modelDisplayNames = {
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite',
      'gemini-2.0-flash': 'Gemini 2.0 Flash',
      'gemini-3-flash-preview': 'Gemini 3 Flash',
      'gemini-3-pro-preview': 'Gemini 3 Pro',
      'claude-sonnet-4.5': 'Claude Sonnet 4.5',
      'claude-opus-4.5': 'Claude Opus 4.5',
      'gpt-5.2-turbo': 'GPT-5.2 Turbo',
      'gpt-5.1': 'GPT-5.1'
    };

    // System prompt
    // Defines the AI's personality and capabilities
    // Now uses PromptManagementService if available (2026-01-24)
    this.systemPrompt = this.buildSystemPrompt();
  }

  /**
   * BUILD SYSTEM PROMPT
   * 
   * Creates the system prompt that defines the AI's behavior.
   * This is the core instruction that shapes how the AI responds.
   * 
   * PRODUCT CONTEXT:
   * The AI is a personal companion, not a productivity assistant.
   * It should be empathetic, remember personal context, and help
   * users work through life decisions and personal growth.
   * 
   * UPDATED 2026-01-24:
   * Now uses PromptManagementService if available, allowing users
   * to customize the AI's behavior via admin panel.
   * 
   * @returns {string} System prompt
   */
  buildSystemPrompt() {
    // Use PromptManagementService if available (allows customization)
    if (this.promptService) {
      return this.promptService.getSystemPrompt();
    }
    
    // SYSTEM PROMPT SLIMMING (2026-02-06):
    // Previously this was ~300 lines with CSS gradients, box shadows, color hex codes,
    // font stacks, and other visual design instructions sent on EVERY request — even
    // casual conversation that would never generate artifacts.
    //
    // Savings: ~5,000 tokens per request on non-artifact conversations.
    // The design instructions are now in a separate method (getArtifactDesignPrompt)
    // and only injected when html_toggle.generate_html would be true, via the
    // buildSharedContextPrefix method when an artifact is being created/updated.
    //
    // This base prompt focuses on: personality, response format, area actions,
    // and artifact action selection logic. The "how to make it pretty" part
    // is deferred to the design prompt appendix.
    return `You are BubbleVoice, a personal AI companion designed to help people think through their lives.

**Your Purpose:**
You help users process their thoughts about personal life topics: family, relationships, personal growth, goals, struggles, and life decisions. You're not a productivity tool or task manager - you're a thinking partner for life.

**Your Approach:**
- Be empathetic and understanding, not prescriptive
- Ask thoughtful follow-up questions to help users explore their thoughts
- Remember and reference past conversations (context will be provided)
- Help users see patterns they might not notice themselves
- Validate feelings while gently challenging assumptions when helpful
- Be conversational and natural, not formal or robotic

**Life Areas System:**
You have access to a hierarchical memory system called "Life Areas" where you can store and retrieve information about the user's life. When the user discusses a topic, you should:
1. **Create areas** when a new topic emerges (e.g., Family/Emma_School)
2. **Append entries** to existing areas to track ongoing situations
3. **Update summaries** to maintain high-level understanding

**CRITICAL: Response Format**
You MUST respond with ONLY valid JSON. No other text before or after:

{
  "response": "Your conversational response text",
  "bubbles": ["bubble 1", "bubble 2", "bubble 3"],
  "area_actions": [
    {
      "action": "create_area|append_entry|update_summary",
      "area_path": "Family/Emma_School",
      "document": "reading_comprehension.md",
      "content": "Entry content summary",
      "user_quote": "Direct quote from user",
      "ai_observation": "Your observation (1-2 sentences)",
      "sentiment": "hopeful|concerned|anxious|excited|neutral"
    }
  ],
  "artifact_action": {
    "action": "create|patch|update|none",
    "artifact_id": "unique_id",
    "artifact_type": "comparison_card|stress_map|checklist|reflection_summary|goal_tracker|timeline|decision_matrix|progress_chart|mindmap|celebration_card",
    "html": "Full standalone HTML (for create/update)",
    "patches": [{ "old_string": "text to find", "new_string": "replacement text" }]
  },
  "html_toggle": { "generate_html": true|false, "reason": "why" }
}

**Area Actions:**
- Create areas when user mentions new topics (kids, work, health goals)
- Append entries with updates or new info — MUST include "content" field
- Include "user_quote" and "ai_observation" for memory search quality
- Tag sentiment: hopeful, concerned, anxious, excited, neutral

**Artifact Action Selection:**
- **PATCH** — PREFERRED for small text changes ("change X to Y"). Use same artifact_id, provide patches array. No html needed.
- **UPDATE** — For visual/structural changes to EXISTING artifact. Use same artifact_id, regenerate complete HTML.
- **CREATE** — ONLY for truly NEW artifacts or different types. Generate new artifact_id.
- **NONE** — No artifact work needed (casual conversation).

When [CURRENT ARTIFACT DISPLAYED] context is present, ALWAYS reuse that artifact_id for modifications. Only create new when user explicitly asks for something NEW or a DIFFERENT type.

**HTML Toggle:** generate_html=true when creating/updating artifacts. generate_html=false for casual conversation.

**Important:**
- ALWAYS respond with ONLY valid JSON
- Include 2-4 relevant bubbles (≤7 words each) as contextual micro-prompts
- Keep responses conversational and natural
- Reference past conversations when context is provided
- Be warm and supportive, like a thoughtful friend`;
  }

  /**
   * GET ARTIFACT DESIGN PROMPT
   * 
   * Returns the visual design standards prompt that tells the AI how to generate
   * beautiful, marketing-polished HTML artifacts. This is ONLY injected when the
   * AI needs to generate HTML (artifact create/update actions).
   * 
   * ARCHITECTURE FIX (2026-02-06):
   * Previously these ~100 lines of CSS instructions were embedded in the main
   * system prompt and sent with EVERY request, burning ~2000 tokens per turn
   * even for casual "how was your day?" conversations that would never produce
   * an artifact. Now they're only injected when buildSharedContextPrefix detects
   * that an artifact exists (implying the AI might need to update it).
   * 
   * PRODUCT CONTEXT:
   * These design standards ensure artifacts look premium. The Liquid Glass aesthetic,
   * gradient palettes, and typography specs were refined through benchmark testing
   * (see docs/archive/benchmarks/ for comparison results).
   * 
   * @returns {string} Design prompt for artifact HTML generation
   */
  getArtifactDesignPrompt() {
    return `**VISUAL DESIGN STANDARDS FOR HTML ARTIFACTS:**

All artifacts must look premium and marketing-polished:

**Color & Contrast:** Minimum 4.5:1 contrast ratio. White/light text on dark/medium backgrounds, or dark text on light backgrounds. NEVER light-on-light or dark-on-dark.

**Color Palettes:**
- Purple/Violet: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
- Teal/Cyan: linear-gradient(135deg, #11998e 0%, #38ef7d 100%)
- Sunset: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)
- Ocean: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)
- Dark elegant: #1a1a2e, #16213e, #0f3460

**Liquid Glass Styling:** background: rgba(255,255,255,0.15); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.3); border-radius: 16-24px

**Typography:** -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif. Headers 600-700 weight, body 400 weight, line-height 1.6.

**Shadows:** Cards: box-shadow: 0 8px 32px rgba(0,0,0,0.2). Elevated: 0 4px 20px rgba(0,0,0,0.15).

**Interactions:** Hover states on all interactive elements. transition: all 0.3s ease. Cards: translateY(-2px) on hover.

**Layout:** Consistent padding (16/24/32/48px). CSS Grid or Flexbox. Breathing room (min 24px padding on cards).

**Emotional Depth:** Use first-person language, acknowledge emotional weight, validate difficulty, provide encouragement.

**HTML Structure:** Complete <!DOCTYPE html>, all styles in <style> tag, self-contained, accessible (semantic HTML, ARIA labels).

**Artifact Types:** comparison_card (pros/cons), stress_map (intensity viz), checklist (actionable items), reflection_summary (journey recap), goal_tracker (progress), timeline (events over time), decision_matrix (weighted scoring), progress_chart (metrics), mindmap (connected concepts), celebration_card (achievement recognition).`;
  }

  /**
   * GENERATE RESPONSE
   * 
   * Generates an AI response to the user's message.
   * Streams the response token-by-token for real-time display.
   * 
   * @param {Object} conversation - Conversation object with history
   * @param {Object} settings - User settings (model, temperature, etc.)
   * @param {Object} callbacks - Callback functions for streaming
   * @param {Function} callbacks.onChunk - Called for each response chunk
   * @param {Function} callbacks.onBubbles - Called when bubbles are generated
   * @param {Function} callbacks.onArtifact - Called when artifact is generated
   * @returns {Promise<string>} Full response text
   */
  async generateResponse(conversation, settings, callbacks) {
    const model = settings?.model || 'gemini-2.5-flash-lite';
    const provider = this.providers[model];

    if (!provider) {
      throw new Error(`Unknown model: ${model}`);
    }

    console.log(`[LLMService] Generating response with ${model} (${provider})`);

    // Route to appropriate provider
    switch (provider) {
      case 'gemini':
        return await this.generateGeminiResponse(model, conversation, settings, callbacks);
      case 'anthropic':
        return await this.generateAnthropicResponse(model, conversation, settings, callbacks);
      case 'openai':
        return await this.generateOpenAIResponse(model, conversation, settings, callbacks);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * GENERATE GEMINI RESPONSE
   * 
   * Generates response using Google's Gemini API.
   * Uses streaming for real-time token delivery.
   * 
   * @param {string} model - Model name
   * @param {Object} conversation - Conversation object
   * @param {Object} settings - Settings
   * @param {Object} callbacks - Callbacks
   * @returns {Promise<string>} Full response
   */
  async generateGeminiResponse(model, conversation, settings, callbacks) {
    // Initialize client if needed
    if (!this.geminiClient) {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not set in environment');
      }
      this.geminiClient = new GoogleGenerativeAI(apiKey);
    }

    // Get model instance
    // WHY: We pass systemInstruction at the model level, NOT embedded as a user message.
    // The Gemini SDK has a dedicated systemInstruction parameter that correctly routes
    // the system prompt without polluting the conversation contents.
    // HISTORY: Previously we were embedding the system prompt as the first user message
    // in the contents array, which works but is less clean and can confuse role alternation.
    const geminiModel = this.geminiClient.getGenerativeModel({
      model: model,
      systemInstruction: this.systemPrompt,
      generationConfig: {
        temperature: settings?.temperature || 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192, // Increased for HTML artifacts (was 2048)
        responseMimeType: 'application/json',
        // CRITICAL: Schema with enum constraints to prevent runaway generation
        // (2026-01-28) ROOT CAUSE IDENTIFIED: Without enum constraints, Gemini can generate
        // absurdly long strings for fields like sentiment (e.g., 50,000+ character gibberish).
        // Gemini RESPECTS: type, required, enum
        // Gemini IGNORES: maxLength, description, pattern (see SCHEMA_ENFORCEMENT_FINDINGS.md)
        responseSchema: {
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
                  // ENUM: Constrain action to valid values only
                  action: { 
                    type: 'string',
                    enum: ['create_area', 'append_entry', 'update_summary']
                  },
                  area_path: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  document: { type: 'string' },
                  content: { type: 'string' },
                  user_quote: { type: 'string' },
                  ai_observation: { type: 'string' },
                  // ENUM: Constrain sentiment to prevent runaway generation
                  // This was the root cause of the 50K+ character bug!
                  sentiment: { 
                    type: 'string',
                    enum: ['hopeful', 'concerned', 'anxious', 'excited', 'neutral']
                  }
                }
              }
            },
            artifact_action: {
              type: 'object',
              properties: {
                // ENUM: Constrain artifact action types
                action: { 
                  type: 'string',
                  enum: ['create', 'patch', 'update', 'none']
                },
                artifact_id: { type: 'string' },
                // ENUM: Constrain artifact types to valid values
                artifact_type: { 
                  type: 'string',
                  enum: [
                    'comparison_card', 'stress_map', 'checklist', 
                    'reflection_summary', 'goal_tracker', 'timeline',
                    'decision_matrix', 'progress_chart', 'mindmap', 
                    'celebration_card'
                  ]
                },
                html: { type: 'string' },
                patches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      old_string: { type: 'string' },
                      new_string: { type: 'string' },
                      replace_all: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            html_toggle: {
              type: 'object',
              properties: {
                generate_html: { type: 'boolean' },
                reason: { type: 'string' }
              }
            }
          },
          required: ['response', 'bubbles']
        }
      }
    });

    // Build messages array for Gemini
    // The SDK's generateContentStream() expects an object with a `contents` property,
    // NOT a raw array. Passing a raw array causes the SDK to misinterpret {role, parts}
    // objects as Part objects, leading to the error:
    // "Unknown name 'role' at 'contents[0].parts[0]': Cannot find field"
    const contents = this.buildMessagesForGemini(conversation);

    // Debug: Log the contents structure
    console.log('[LLMService] Gemini contents structure:', JSON.stringify(contents, null, 2));

    // Generate streaming response
    // CRITICAL FIX: Pass { contents: [...] } object, NOT the array directly.
    // The SDK's formatGenerateContentInput() checks for a `contents` property on the input.
    // If it finds one, it uses it correctly. If it gets a raw array, it falls through to
    // formatNewContent() which treats each array item as a Part (not a Content object),
    // causing the "Unknown name 'role'" error because role is not a valid Part field.
    const result = await geminiModel.generateContentStream({ contents });

    let fullResponse = '';
    let structuredOutput = null;

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullResponse += chunkText;
      
      // Stream raw text chunks
      if (callbacks.onChunk) {
        // For structured output, we'll parse at the end
        // For now, just accumulate
      }
    }

    // Parse structured output
    // (2026-01-28) Added truncation recovery for MAX_TOKENS errors
    // When Gemini hits the token limit, JSON is cut off mid-generation.
    // We attempt to recover what we can from the partial response.
    try {
      structuredOutput = JSON.parse(fullResponse);
      
      // Send the conversational response in chunks
      if (structuredOutput.response && callbacks.onChunk) {
        const words = structuredOutput.response.split(' ');
        for (let i = 0; i < words.length; i++) {
          callbacks.onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      }

      // Send bubbles
      if (structuredOutput.bubbles && callbacks.onBubbles) {
        callbacks.onBubbles(structuredOutput.bubbles);
      }

      // Send artifact
      // LOGGING (2026-01-29): Enhanced artifact logging to debug patch failures
      // This helps identify when AI says it made a change but sends wrong action
      if (structuredOutput.artifact_action) {
        const artifactAction = structuredOutput.artifact_action;
        console.log('[LLMService] ✨ Artifact action from LLM:', {
          action: artifactAction.action,
          artifact_type: artifactAction.artifact_type,
          artifact_id: artifactAction.artifact_id || '(none)',
          has_html: !!artifactAction.html,
          html_length: artifactAction.html?.length || 0,
          has_patches: !!(artifactAction.patches && artifactAction.patches.length > 0),
          patches_count: artifactAction.patches?.length || 0
        });
        
        // Log patch details for debugging
        if (artifactAction.action === 'patch' && artifactAction.patches) {
          console.log('[LLMService] 🔧 Patch details:');
          artifactAction.patches.forEach((p, i) => {
            console.log(`  Patch ${i + 1}:`);
            console.log(`    old: "${(p.old_string || '').substring(0, 50)}..."`);
            console.log(`    new: "${(p.new_string || '').substring(0, 50)}..."`);
          });
        }
        
        // WARN if AI says it made a change but sent action: "none"
        // This is a common failure mode where AI claims success but doesn't act
        if (artifactAction.action === 'none') {
          const responseText = structuredOutput.response || '';
          const suggestsChange = /\b(changed|updated|renamed|modified|replaced|made the change|done|applied)\b/i.test(responseText);
          if (suggestsChange) {
            console.warn('[LLMService] ⚠️ POTENTIAL BUG: AI response suggests a change was made, but artifact_action is "none"');
            console.warn(`  Response: "${responseText.substring(0, 100)}..."`);
          }
        }
        
        if (callbacks.onArtifact) {
          callbacks.onArtifact(structuredOutput.artifact_action);
        }
      }

      // Send area actions (NEW: for integration service)
      if (structuredOutput.area_actions && callbacks.onAreaActions) {
        callbacks.onAreaActions(structuredOutput.area_actions);
      }

      // Return full structured output (NEW: needed for integration)
      return {
        text: structuredOutput.response || fullResponse,
        structured: structuredOutput
      };
    } catch (error) {
      console.error('[LLMService] Error parsing structured output:', error);
      console.log('[LLMService] Attempting truncation recovery...');
      
      // TRUNCATION RECOVERY (2026-01-28)
      // When MAX_TOKENS is hit, try to extract what we can from the partial JSON
      const recovered = this.attemptTruncationRecovery(fullResponse);
      
      if (recovered) {
        console.log('[LLMService] ✅ Recovered partial response');
        
        // Send recovered response
        if (recovered.response && callbacks.onChunk) {
          const words = recovered.response.split(' ');
          for (let i = 0; i < words.length; i++) {
            callbacks.onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
        
        // Send bubbles if we have them
        if (recovered.bubbles && callbacks.onBubbles) {
          callbacks.onBubbles(recovered.bubbles);
        }
        
        return {
          text: recovered.response || '[Response truncated due to length]',
          structured: recovered
        };
      }
      
      // Last resort: extract any text that looks like a response
      console.log('[LLMService] ❌ Recovery failed, using raw fallback');
      const rawText = this.extractRawResponseText(fullResponse);
      if (callbacks.onChunk) {
        callbacks.onChunk(rawText || '[Error: Response was truncated and could not be recovered]');
      }
      return rawText || fullResponse;
    }
  }

  /**
   * GENERATE ANTHROPIC RESPONSE
   * 
   * Generates response using Anthropic's Claude API.
   * 
   * @param {string} model - Model name
   * @param {Object} conversation - Conversation object
   * @param {Object} settings - Settings
   * @param {Object} callbacks - Callbacks
   * @returns {Promise<string>} Full response
   */
  async generateAnthropicResponse(model, conversation, settings, callbacks) {
    // Initialize client if needed
    if (!this.anthropicClient) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set in environment');
      }
      this.anthropicClient = new Anthropic({ apiKey });
    }

    // Build messages array
    const messages = this.buildMessagesForAnthropic(conversation);

    // Generate streaming response
    const stream = await this.anthropicClient.messages.stream({
      model: model,
      max_tokens: 2048,
      temperature: settings?.temperature || 0.7,
      system: this.systemPrompt,
      messages: messages
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        
        if (callbacks.onChunk) {
          callbacks.onChunk(text);
        }
      }
    }

    // Try to parse structured output
    try {
      const structuredOutput = JSON.parse(fullResponse);
      
      if (structuredOutput.bubbles && callbacks.onBubbles) {
        callbacks.onBubbles(structuredOutput.bubbles);
      }

      if (structuredOutput.artifact && callbacks.onArtifact) {
        callbacks.onArtifact(structuredOutput.artifact);
      }

      return structuredOutput.response || fullResponse;
    } catch (error) {
      // Not structured output, return as-is
      return fullResponse;
    }
  }

  /**
   * GENERATE OPENAI RESPONSE
   * 
   * Generates response using OpenAI's GPT API.
   * 
   * @param {string} model - Model name
   * @param {Object} conversation - Conversation object
   * @param {Object} settings - Settings
   * @param {Object} callbacks - Callbacks
   * @returns {Promise<string>} Full response
   */
  async generateOpenAIResponse(model, conversation, settings, callbacks) {
    // Initialize client if needed
    if (!this.openaiClient) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set in environment');
      }
      this.openaiClient = new OpenAI({ apiKey });
    }

    // Build messages array
    const messages = this.buildMessagesForOpenAI(conversation);

    // Generate streaming response
    const stream = await this.openaiClient.chat.completions.create({
      model: model,
      messages: messages,
      temperature: settings?.temperature || 0.7,
      max_tokens: 2048,
      stream: true,
      response_format: { type: 'json_object' }
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        
        if (callbacks.onChunk) {
          callbacks.onChunk(content);
        }
      }
    }

    // Parse structured output
    try {
      const structuredOutput = JSON.parse(fullResponse);
      
      if (structuredOutput.bubbles && callbacks.onBubbles) {
        callbacks.onBubbles(structuredOutput.bubbles);
      }

      if (structuredOutput.artifact && callbacks.onArtifact) {
        callbacks.onArtifact(structuredOutput.artifact);
      }

      return structuredOutput.response || fullResponse;
    } catch (error) {
      return fullResponse;
    }
  }

  /**
   * BUILD SHARED CONTEXT PREFIX
   * 
   * Generates the shared context string that should be injected into ALL provider
   * message builders. This includes:
   * 1. RAG context (vector search results, knowledge tree, AI notes)
   * 2. Artifact context (what artifact is currently displayed)
   * 
   * ARCHITECTURE FIX (2026-02-06):
   * Previously, artifact context was ONLY injected for Gemini (buildMessagesForGemini).
   * Anthropic and OpenAI message builders had NO artifact context, causing 0% artifact
   * update rate when using those providers. RAG context was never injected at all in the
   * main message flow (ContextAssemblyService was built but disconnected).
   * 
   * Now all three providers share this method for consistent context injection.
   * 
   * @param {Object} conversation - Conversation object (may have ragContext and currentArtifact)
   * @returns {string} Combined context string to prepend to messages
   */
  buildSharedContextPrefix(conversation) {
    let contextParts = [];

    // 1. RAG CONTEXT INJECTION (2026-02-06)
    // If the server assembled RAG context before calling generateResponse,
    // it will be attached to conversation.ragContext as a formatted string.
    // This includes: AI notes, knowledge tree, vector search results, conversation history.
    //
    // WHY: This is the core memory feature of BubbleVoice — the AI needs to know what
    // the user has discussed in past conversations to provide continuity.
    // BECAUSE: Without this, the AI responds as if every conversation is the first one.
    if (conversation.ragContext) {
      contextParts.push(conversation.ragContext);
      console.log('[LLMService] Injected RAG context:', conversation.ragContext.length, 'chars');
    }

    // 2. ARTIFACT CONTEXT + DESIGN PROMPT INJECTION
    // If there's a current artifact displayed, inject both:
    // a) The artifact context (what's displayed, its ID, type)
    // b) The design prompt (CSS/styling instructions for HTML generation)
    //
    // The design prompt is ONLY injected here, not in the base system prompt.
    // This saves ~2000 tokens on every casual conversation turn.
    // (Originally 2026-01-27, design prompt split out 2026-02-06)
    if (conversation.currentArtifact) {
      // Inject design standards since artifact work may be needed
      contextParts.push(this.getArtifactDesignPrompt());
      const artifact = conversation.currentArtifact;
      const artifactContext = `[CURRENT ARTIFACT DISPLAYED]
================================
ARTIFACT ID TO REUSE: ${artifact.artifact_id}
TYPE: ${artifact.artifact_type}
CONTENT: ${artifact.html_summary || 'Visual artifact is displayed'}
${artifact.data ? `DATA: ${JSON.stringify(artifact.data)}` : ''}
================================

EDITING RULES (FOLLOW STRICTLY):
1. If user wants to MODIFY this artifact (change, update, add, remove, fix):
   - action: "update"
   - artifact_id: "${artifact.artifact_id}" (COPY THIS EXACT ID)
   - html: Complete regenerated HTML with the change applied
   - html_toggle.generate_html: true

2. If user wants a DIFFERENT/NEW artifact:
   - action: "create"
   - artifact_id: new unique id (e.g., "checklist_${Date.now()}")
   - html: Complete new HTML

3. If no artifact changes needed:
   - action: "none"
   - html_toggle.generate_html: false

COMMON MISTAKE TO AVOID: Creating a new artifact when user says "change X to Y" - this should UPDATE with the same ID, not CREATE new.

[END ARTIFACT CONTEXT]`;
      contextParts.push(artifactContext);
      console.log('[LLMService] Injected artifact context:', artifact.artifact_id, artifact.artifact_type);
    }

    return contextParts.join('\n\n');
  }

  /**
   * BUILD MESSAGES FOR GEMINI
   * 
   * Formats conversation history for Gemini API.
   * 
   * GEMINI FORMAT:
   * The Gemini SDK expects an array of content objects with role and parts.
   * System prompt is passed via `systemInstruction` in the model config.
   * 
   * IMPORTANT: Gemini alternates between 'user' and 'model' roles.
   * We combine consecutive messages from the same role to maintain alternation.
   * 
   * ARCHITECTURE FIX (2026-02-06):
   * - Artifact context now comes from shared buildSharedContextPrefix()
   * - RAG context is now injected here (was previously disconnected)
   * - All three providers now get identical context injection
   * 
   * @param {Object} conversation - Conversation object
   * @returns {Array} Contents array for Gemini
   */
  buildMessagesForGemini(conversation) {
    const contents = [];

    // Inject shared context (RAG + artifact) as a user message at the start
    // This ensures the AI sees memory and artifact state before conversation history
    const sharedContext = this.buildSharedContextPrefix(conversation);
    if (sharedContext) {
      contents.push({
        role: 'user',
        parts: [{ text: sharedContext }]
      });
      
      // Add a model acknowledgment to maintain Gemini's role alternation requirement
      // WHY: Gemini strictly requires user/model alternation — two consecutive user
      // messages cause an API error. This synthetic acknowledgment maintains the pattern.
      const artifact = conversation.currentArtifact;
      const ackText = artifact 
        ? `I see the ${artifact.artifact_type} artifact (ID: ${artifact.artifact_id}). For modifications, I will use action "update" with that same ID. I have the conversation context and memory available.`
        : 'I have the conversation context and memory available. Ready to continue our conversation.';
      contents.push({
        role: 'model',
        parts: [{ text: ackText }]
      });
    }
    
    // Track current message being built (for combining consecutive same-role messages)
    let currentRole = null;
    let currentParts = [];

    // Add conversation history
    if (conversation.messages && conversation.messages.length > 0) {
      for (const msg of conversation.messages) {
        const msgRole = msg.role === 'assistant' ? 'model' : 'user';
        
        // If same role as current, append to current parts
        if (msgRole === currentRole) {
          currentParts.push({ text: msg.content });
        } else {
          // Different role - first push any accumulated message
          if (currentParts.length > 0) {
            contents.push({
              role: currentRole,
              parts: currentParts
            });
          }
          // Then start new message
          currentRole = msgRole;
          currentParts = [{ text: msg.content }];
        }
      }
      
      // Push the last accumulated message
      if (currentParts.length > 0) {
        contents.push({
          role: currentRole,
          parts: currentParts
        });
      }
    }

    // SAFETY CHECK: Gemini requires at least one message
    if (contents.length === 0) {
      console.warn('[LLMService] buildMessagesForGemini: Empty conversation, adding placeholder');
      contents.push({
        role: 'user',
        parts: [{ text: '(Start of conversation)' }]
      });
    }

    return contents;
  }

  /**
   * BUILD MESSAGES FOR ANTHROPIC
   * 
   * Formats conversation history for Anthropic API.
   * 
   * ARCHITECTURE FIX (2026-02-06):
   * Now injects shared context (RAG + artifact) as the first user message.
   * Previously had NO artifact context or RAG context, causing:
   * - 0% artifact update rate when using Claude
   * - No memory retrieval (AI couldn't remember past conversations)
   * 
   * @param {Object} conversation - Conversation object
   * @returns {Array} Messages array
   */
  buildMessagesForAnthropic(conversation) {
    const messages = [];

    // Inject shared context (RAG + artifact) as the first user message
    // WHY: Anthropic doesn't have a separate context injection mechanism
    // other than the system prompt. We prepend context as a user message
    // so the AI sees it before the actual conversation history.
    // BECAUSE: Without this, Claude had zero visibility into artifacts and memories.
    const sharedContext = this.buildSharedContextPrefix(conversation);
    if (sharedContext) {
      messages.push({
        role: 'user',
        content: `[CONTEXT FOR THIS CONVERSATION]\n${sharedContext}\n[END CONTEXT]`
      });
      // Anthropic also requires alternating user/assistant roles
      messages.push({
        role: 'assistant',
        content: 'I have the context. Ready to continue our conversation.'
      });
    }

    if (conversation.messages) {
      for (const msg of conversation.messages) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    return messages;
  }

  /**
   * BUILD MESSAGES FOR OPENAI
   * 
   * Formats conversation history for OpenAI API.
   * 
   * ARCHITECTURE FIX (2026-02-06):
   * Now injects shared context (RAG + artifact) as a system message.
   * OpenAI supports multiple system messages, so we add context as a
   * second system message after the main system prompt.
   * Previously had NO artifact context or RAG context.
   * 
   * @param {Object} conversation - Conversation object
   * @returns {Array} Messages array
   */
  buildMessagesForOpenAI(conversation) {
    const messages = [
      {
        role: 'system',
        content: this.systemPrompt
      }
    ];

    // Inject shared context (RAG + artifact) as a second system message
    // WHY: OpenAI supports multiple system messages — this is the cleanest
    // way to add context without polluting the conversation history.
    // BECAUSE: Without this, GPT had zero visibility into artifacts and memories.
    const sharedContext = this.buildSharedContextPrefix(conversation);
    if (sharedContext) {
      messages.push({
        role: 'system',
        content: `[CONVERSATION CONTEXT]\n${sharedContext}\n[END CONTEXT]`
      });
    }

    if (conversation.messages) {
      for (const msg of conversation.messages) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    return messages;
  }

  /**
   * ATTEMPT TRUNCATION RECOVERY
   * 
   * When Gemini hits MAX_TOKENS, the JSON response is cut off mid-generation.
   * This method attempts to recover usable data from the partial response.
   * 
   * STRATEGY:
   * 1. Try to find and extract the "response" field (most important)
   * 2. Try to extract "bubbles" array if present
   * 3. Skip artifact_action and area_actions (likely truncated anyway)
   * 
   * HISTORY (2026-01-28):
   * Added after observing truncation errors like "Unterminated string in JSON at position 20341"
   * This provides graceful degradation instead of complete failure.
   * 
   * @param {string} partialJson - The truncated JSON response
   * @returns {object|null} Recovered partial response or null if unrecoverable
   */
  attemptTruncationRecovery(partialJson) {
    try {
      // Strategy 1: Try to find the response field using regex
      // Match "response": "..." pattern, handling escaped quotes
      const responseMatch = partialJson.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      
      if (responseMatch && responseMatch[1]) {
        const recoveredResponse = responseMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // Try to also get bubbles
        let bubbles = [];
        const bubblesMatch = partialJson.match(/"bubbles"\s*:\s*\[([\s\S]*?)\]/);
        if (bubblesMatch && bubblesMatch[1]) {
          // Extract individual bubble strings
          const bubbleMatches = bubblesMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
          if (bubbleMatches) {
            bubbles = bubbleMatches.map(b => 
              b.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            );
          }
        }
        
        console.log('[LLMService] Truncation recovery extracted:', {
          responseLength: recoveredResponse.length,
          bubblesCount: bubbles.length
        });
        
        return {
          response: recoveredResponse,
          bubbles: bubbles.length > 0 ? bubbles : ['tell me more', 'what else?'],
          area_actions: [], // Skip - likely truncated
          artifact_action: { action: 'none' }, // Skip - likely truncated
          _recovered: true, // Flag for debugging
          _truncated: true
        };
      }
      
      return null;
    } catch (error) {
      console.error('[LLMService] Truncation recovery failed:', error);
      return null;
    }
  }

  /**
   * EXTRACT RAW RESPONSE TEXT
   * 
   * Last-resort fallback when truncation recovery fails.
   * Tries to extract any readable text from the malformed response.
   * 
   * @param {string} partialJson - The truncated JSON
   * @returns {string} Any extractable text or empty string
   */
  extractRawResponseText(partialJson) {
    try {
      // Try to find any substantial text content
      // Look for the "response": " pattern and grab what follows
      const startIndex = partialJson.indexOf('"response"');
      if (startIndex !== -1) {
        const valueStart = partialJson.indexOf('"', startIndex + 10) + 1;
        if (valueStart > 0) {
          // Find where the string ends (might be truncated)
          let endIndex = partialJson.length;
          for (let i = valueStart; i < partialJson.length; i++) {
            if (partialJson[i] === '"' && partialJson[i-1] !== '\\') {
              endIndex = i;
              break;
            }
          }
          
          const text = partialJson.substring(valueStart, endIndex)
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
          
          // Return if we got something meaningful (more than 50 chars)
          if (text.length > 50) {
            return text + '... [truncated]';
          }
        }
      }
      
      return '';
    } catch (error) {
      return '';
    }
  }
}

module.exports = LLMService;
