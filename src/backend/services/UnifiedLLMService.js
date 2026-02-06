/**
 * BUBBLEVOICE MAC - UNIFIED LLM SERVICE (Vercel AI SDK)
 * 
 * ARCHITECTURE (2026-02-06):
 * This replaces the old LLMService.js which had 3 separate provider implementations
 * (~700 lines of provider-specific code). Now all providers use a single unified
 * interface via the Vercel AI SDK's `generateObject` function.
 * 
 * WHY VERCEL AI SDK:
 * - Single `generateObject()` call replaces generateGeminiResponse, generateAnthropicResponse,
 *   generateOpenAIResponse (eliminating ~500 lines of duplicated streaming/parsing code)
 * - Zod schema validation for ALL providers (previously only Gemini had schema enforcement)
 * - Built-in retry logic, abort signals, and error handling
 * - Consistent behavior across Google, Anthropic, and OpenAI
 * - Future: enables tool-calling pattern (Phase 4)
 * 
 * STREAMING APPROACH:
 * We use `generateObject` (not `streamText`) because BubbleVoice needs structured output
 * (response + bubbles + artifact_action + area_actions) from every LLM call. The response
 * text is then dispatched word-by-word with 30ms delays to simulate natural speech pacing.
 * This is actually what the old Gemini path already did — the "streaming" was fake
 * (full JSON response, then word-by-word dispatch). Now all providers work this way,
 * which is better UX than the old Anthropic/OpenAI paths that streamed raw JSON text.
 * 
 * BACKWARDS COMPATIBILITY:
 * Exports the same API as LLMService.js:
 * - constructor(promptService?)
 * - generateResponse(conversation, settings, callbacks) → { text, structured }
 * - buildSystemPrompt()
 * - buildSharedContextPrefix(conversation)
 * - getArtifactDesignPrompt()
 * 
 * PRODUCT CONTEXT:
 * The LLM is the core intelligence of BubbleVoice. It understands personal life contexts,
 * remembers past conversations (via RAG), generates empathetic responses, and produces
 * structured outputs (bubbles for follow-up prompts, artifacts for visual content).
 */

const { generateObject } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAI } = require('@ai-sdk/openai');
const { z } = require('zod');
const ContextCompactionService = require('./ContextCompactionService');

/**
 * ZOD SCHEMA FOR STRUCTURED LLM OUTPUT
 * 
 * This schema replaces the manual JSON parsing and Gemini-specific responseSchema
 * that was previously defined inline in generateGeminiResponse(). Now ALL providers
 * return this exact shape, validated by Zod.
 * 
 * WHY ZOD:
 * - Schema validation catches malformed LLM output before it reaches the rest of the app
 * - Descriptive field annotations help the LLM understand what each field is for
 * - Enum constraints prevent runaway generation (the old 50K+ char sentiment bug)
 * - Works identically across Gemini, Claude, and GPT
 * 
 * SCHEMA EVOLUTION:
 * When adding new fields or actions, update this schema. The Vercel AI SDK handles
 * converting the Zod schema to provider-specific formats (Gemini responseSchema,
 * Anthropic tool_use, OpenAI function_calling) automatically.
 */
const BubbleVoiceResponseSchema = z.object({
  // The conversational response text shown to the user
  // This is the primary output — the AI's empathetic, helpful response
  response: z.string().describe(
    'Your conversational response to the user. Be empathetic and thoughtful. ' +
    'This is what the user sees and hears via TTS.'
  ),
  
  // Follow-up prompt bubbles (2-4 short suggestions, max 7 words each)
  // These appear as clickable buttons below the response
  // PRODUCT CONTEXT: Bubbles make the conversation feel proactive, not reactive.
  // Good bubbles reference specific personal context (e.g., "how is Emma doing?")
  bubbles: z.array(z.string()).describe(
    '2-4 short follow-up prompt suggestions (max 7 words each). ' +
    'Reference personal context when possible. Examples: "tell me more about that", ' +
    '"how does that make you feel?", "what would ideal look like?"'
  ),
  
  // Life area actions — create areas, append entries, update summaries
  // These are processed by IntegrationService to build the user's knowledge graph
  area_actions: z.array(z.object({
    action: z.enum(['create_area', 'append_entry', 'update_summary']).describe(
      'Type of area action to perform'
    ),
    area_path: z.string().describe('Path like "family/kids" or "career/goals"'),
    name: z.string().optional().describe('Area display name (for create_area)'),
    description: z.string().optional().describe('Area description (for create_area)'),
    document: z.string().optional().describe('Document name within area (for append_entry)'),
    content: z.string().optional().describe('Entry content text'),
    user_quote: z.string().optional().describe('Direct quote from user'),
    ai_observation: z.string().optional().describe('AI observation about this entry'),
    sentiment: z.enum(['hopeful', 'concerned', 'anxious', 'excited', 'neutral']).optional().describe(
      'Emotional sentiment of the entry'
    ),
  })).describe(
    'Actions to organize user information into life areas. ' +
    'Only include when user shares personal information worth remembering.'
  ),
  
  // Artifact action — create, update, or patch visual HTML content
  // Artifacts are rich visual outputs (checklists, timelines, decision matrices, etc.)
  artifact_action: z.object({
    action: z.enum(['create', 'patch', 'update', 'none']).describe(
      'Whether to create a new artifact, update/patch existing, or do nothing'
    ),
    artifact_id: z.string().optional().describe(
      'Unique artifact ID. For updates, reuse the existing artifact_id.'
    ),
    artifact_type: z.enum([
      'comparison_card', 'stress_map', 'checklist',
      'reflection_summary', 'goal_tracker', 'timeline',
      'decision_matrix', 'progress_chart', 'mindmap',
      'celebration_card'
    ]).optional().describe('Type of visual artifact'),
    html: z.string().optional().describe(
      'Complete self-contained HTML for the artifact (only for create/update actions)'
    ),
    patches: z.array(z.object({
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional(),
    })).optional().describe('Patch operations for incremental artifact edits'),
  }).describe(
    'Visual artifact action. Use "none" for casual conversation. ' +
    'Only create/update when user requests visual output or it would genuinely help.'
  ),
  
  // HTML toggle — whether the response includes HTML artifact generation
  html_toggle: z.object({
    generate_html: z.boolean().describe('Whether HTML artifact was generated'),
    reason: z.string().optional().describe('Brief reason for the decision'),
  }).describe('Indicates whether this response includes HTML artifact generation'),
});


class UnifiedLLMService {
  /**
   * Constructor
   * 
   * @param {PromptManagementService} promptService - Optional prompt customization service.
   *   If provided, system prompt comes from the admin panel instead of hardcoded defaults.
   * 
   * ARCHITECTURE: Provider instances are created lazily on first use.
   * The Vercel AI SDK provider constructors just create config objects — the actual
   * API calls happen in generateObject(). So lazy init is essentially free.
   */
  constructor(promptService = null) {
    this.promptService = promptService;
    
    // Provider instances (created lazily)
    // These are Vercel AI SDK provider factories, not raw API clients
    this._googleProvider = null;
    this._anthropicProvider = null;
    this._openaiProvider = null;
    
    // MODEL REGISTRY
    // Maps user-facing model names to Vercel AI SDK model constructors.
    // When adding a new model, just add an entry here — no new generate method needed.
    //
    // WHY A REGISTRY: The old LLMService had a providers map that routed to separate
    // generate methods. Now all models use the same generateObject() call, so the registry
    // just maps model name → SDK model constructor.
    //
    // UPDATED 2026-02-06: Same models as old LLMService
    this.modelRegistry = {
      // Google Gemini models
      'gemini-2.5-flash-lite': { provider: 'google', displayName: 'Gemini 2.5 Flash-Lite' },
      'gemini-2.0-flash': { provider: 'google', displayName: 'Gemini 2.0 Flash' },
      'gemini-2.0-flash-exp': { provider: 'google', displayName: 'Gemini 2.0 Flash Exp' },
      'gemini-3-flash-preview': { provider: 'google', displayName: 'Gemini 3 Flash' },
      'gemini-3-pro-preview': { provider: 'google', displayName: 'Gemini 3 Pro' },
      // Anthropic Claude models
      'claude-sonnet-4.5': { provider: 'anthropic', displayName: 'Claude Sonnet 4.5' },
      'claude-sonnet-4': { provider: 'anthropic', displayName: 'Claude Sonnet 4' },
      'claude-opus-4.5': { provider: 'anthropic', displayName: 'Claude Opus 4.5' },
      // OpenAI GPT models
      'gpt-5.2-turbo': { provider: 'openai', displayName: 'GPT-5.2 Turbo' },
      'gpt-5.1': { provider: 'openai', displayName: 'GPT-5.1' },
    };
    
    // BACKWARDS COMPATIBILITY: Expose providers and modelDisplayNames
    // server.js and frontend may reference these for model listing/validation
    this.providers = {};
    this.modelDisplayNames = {};
    for (const [modelName, config] of Object.entries(this.modelRegistry)) {
      this.providers[modelName] = config.provider;
      this.modelDisplayNames[modelName] = config.displayName;
    }
    
    // Context compaction service
    // Summarizes older messages when conversations get long to prevent
    // exceeding LLM context window limits.
    // WHY HERE: The LLM service is the right place for compaction because
    // it knows about token budgets and needs to manage what gets sent to the model.
    this.compaction = new ContextCompactionService();
    
    // Build system prompt
    this.systemPrompt = this.buildSystemPrompt();
    
    console.log('[UnifiedLLMService] Initialized with Vercel AI SDK');
    console.log(`[UnifiedLLMService] ${Object.keys(this.modelRegistry).length} models registered`);
  }

  /**
   * GET MODEL INSTANCE
   * 
   * Creates a Vercel AI SDK model instance for the given model name.
   * Lazily initializes provider factories on first use.
   * 
   * WHY LAZY INIT: API keys might not be available at construction time
   * (e.g., loaded from settings later). Creating the provider on first use
   * ensures the key is available when needed.
   * 
   * @param {string} modelName - Model name from the registry (e.g., 'gemini-2.0-flash')
   * @returns {object} Vercel AI SDK model instance ready for generateObject/streamText
   * @throws {Error} If model is unknown or API key is missing
   */
  getModelInstance(modelName) {
    const config = this.modelRegistry[modelName];
    if (!config) {
      throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(this.modelRegistry).join(', ')}`);
    }
    
    switch (config.provider) {
      case 'google': {
        if (!this._googleProvider) {
          const apiKey = process.env.GOOGLE_API_KEY;
          if (!apiKey) throw new Error('GOOGLE_API_KEY not set in environment');
          this._googleProvider = createGoogleGenerativeAI({ apiKey });
        }
        return this._googleProvider(modelName);
      }
      case 'anthropic': {
        if (!this._anthropicProvider) {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');
          this._anthropicProvider = createAnthropic({ apiKey });
        }
        return this._anthropicProvider(modelName);
      }
      case 'openai': {
        if (!this._openaiProvider) {
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment');
          this._openaiProvider = createOpenAI({ apiKey });
        }
        return this._openaiProvider(modelName);
      }
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * BUILD MESSAGES FOR VERCEL AI SDK
   * 
   * Converts BubbleVoice conversation format to Vercel AI SDK messages format.
   * The Vercel AI SDK uses a unified message format for all providers:
   * { role: 'user'|'assistant'|'system', content: string }
   * 
   * The SDK handles provider-specific conversions internally:
   * - Gemini: Converts to contents[] with user/model roles
   * - Anthropic: Passes through as-is (supports user/assistant)
   * - OpenAI: Passes through as-is (supports user/assistant/system)
   * 
   * This replaces THREE separate builder methods:
   * - buildMessagesForGemini() (with role alternation handling)
   * - buildMessagesForAnthropic() (with context injection)
   * - buildMessagesForOpenAI() (with system message injection)
   * 
   * @param {Object} conversation - Conversation object with messages[], ragContext, currentArtifact
   * @returns {Array} Messages array for Vercel AI SDK
   */
  async buildMessages(conversation) {
    const messages = [];
    
    // INJECT SHARED CONTEXT (RAG + Artifact) as the first user message
    // This ensures the AI sees memory and artifact state before conversation history.
    // The Vercel AI SDK handles role alternation for Gemini automatically, so we
    // don't need the manual user/model acknowledgment dance from the old code.
    const sharedContext = this.buildSharedContextPrefix(conversation);
    if (sharedContext) {
      messages.push({
        role: 'user',
        content: `[CONTEXT FOR THIS CONVERSATION]\n${sharedContext}\n[END CONTEXT]`
      });
      // Add an assistant acknowledgment for providers that need role alternation
      // (Gemini requires strict user/model alternation)
      const artifact = conversation.currentArtifact;
      const ackText = artifact
        ? `I see the ${artifact.artifact_type} artifact (ID: ${artifact.artifact_id}). For modifications, I will use action "update" with that same ID. I have the conversation context and memory available.`
        : 'I have the conversation context and memory available. Ready to continue our conversation.';
      messages.push({
        role: 'assistant',
        content: ackText
      });
    }
    
    // CONTEXT COMPACTION (2026-02-06):
    // If the conversation has too many messages, compact older ones into a summary.
    // This prevents exceeding LLM context window limits while preserving key information.
    // The compaction returns a modified messages array: [summary, ...recent_messages]
    // The original conversation.messages are NOT modified (preserved for DB/history).
    let conversationMessages;
    if (this.compaction.needsCompaction(conversation)) {
      console.log(`[UnifiedLLMService] Compacting conversation ${conversation.id} (${conversation.messages.length} messages)`);
      conversationMessages = await this.compaction.compact(conversation);
    } else {
      conversationMessages = conversation.messages || [];
    }
    
    // Add conversation history (possibly compacted)
    if (conversationMessages.length > 0) {
      for (const msg of conversationMessages) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
    
    // SAFETY: Ensure at least one message exists
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: '(Start of conversation)'
      });
    }
    
    return messages;
  }

  /**
   * GENERATE RESPONSE
   * 
   * Unified response generation for ALL providers using Vercel AI SDK's generateObject.
   * This single method replaces generateGeminiResponse, generateAnthropicResponse,
   * and generateOpenAIResponse (~400 lines → ~80 lines).
   * 
   * FLOW:
   * 1. Resolve model name to Vercel AI SDK model instance
   * 2. Build messages (with shared context injection)
   * 3. Call generateObject() with Zod schema — provider-agnostic
   * 4. Dispatch response text word-by-word via onChunk callback
   * 5. Dispatch bubbles, artifact, area actions via their callbacks
   * 6. Return { text, structured } matching old LLMService API
   * 
   * @param {Object} conversation - Conversation object with messages[], ragContext, currentArtifact
   * @param {Object} settings - User settings (model, temperature)
   * @param {Object} callbacks - Callback functions for streaming
   * @param {Function} callbacks.onChunk - Called for each word of the response (simulated streaming)
   * @param {Function} callbacks.onBubbles - Called with array of bubble suggestions
   * @param {Function} callbacks.onArtifact - Called with artifact action object
   * @param {Function} callbacks.onAreaActions - Called with array of area actions
   * @returns {Promise<{text: string, structured: object}>} Response text and full structured output
   */
  async generateResponse(conversation, settings, callbacks) {
    const modelName = settings?.model || 'gemini-2.5-flash-lite';
    
    console.log(`[UnifiedLLMService] Generating response with ${modelName} (${this.modelRegistry[modelName]?.displayName || modelName})`);
    
    // Get Vercel AI SDK model instance
    const model = this.getModelInstance(modelName);
    
    // Build unified messages array (async due to potential context compaction)
    const messages = await this.buildMessages(conversation);
    
    // GENERATE STRUCTURED RESPONSE
    // generateObject() calls the LLM and validates the response against our Zod schema.
    // The Vercel AI SDK handles provider-specific structured output mechanisms:
    // - Gemini: Uses responseMimeType + responseSchema (native structured output)
    // - Anthropic: Uses tool_use with the schema as a tool definition
    // - OpenAI: Uses response_format with JSON schema
    //
    // WHY generateObject over streamText:
    // BubbleVoice needs structured output (response + bubbles + artifacts + area_actions)
    // from every call. streamText gives raw text; generateObject gives a validated object.
    // We simulate streaming by dispatching the response text word-by-word after generation.
    // This is what the old Gemini path already did (it was never truly streaming structured JSON).
    const startTime = Date.now();
    
    try {
      const result = await generateObject({
        model,
        system: this.systemPrompt,
        messages,
        schema: BubbleVoiceResponseSchema,
        maxTokens: 8192,
        temperature: settings?.temperature || 0.7,
      });
      
      const elapsed = Date.now() - startTime;
      const structuredOutput = result.object;
      
      console.log(`[UnifiedLLMService] Response generated in ${elapsed}ms`);
      console.log(`[UnifiedLLMService] Tokens: ${result.usage?.totalTokens || 'unknown'}`);
      
      // DISPATCH RESPONSE TEXT word-by-word (simulated streaming)
      // WHY: The frontend expects onChunk callbacks for real-time text display.
      // Even though generateObject returns the full response at once, we dispatch
      // it word-by-word with 30ms delays to create natural reading pacing.
      // This matches the old Gemini behavior and is better than the old Anthropic/OpenAI
      // behavior which streamed raw JSON text (ugly in the UI).
      if (structuredOutput.response && callbacks.onChunk) {
        const words = structuredOutput.response.split(' ');
        for (let i = 0; i < words.length; i++) {
          callbacks.onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
          // 30ms delay between words for natural pacing
          // This matches the old Gemini implementation
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      }
      
      // DISPATCH BUBBLES
      if (structuredOutput.bubbles && structuredOutput.bubbles.length > 0 && callbacks.onBubbles) {
        callbacks.onBubbles(structuredOutput.bubbles);
      }
      
      // DISPATCH ARTIFACT ACTION
      if (structuredOutput.artifact_action && callbacks.onArtifact) {
        const artifactAction = structuredOutput.artifact_action;
        
        // Log artifact details (preserved from old LLMService for debugging)
        console.log('[UnifiedLLMService] Artifact action:', {
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
          console.log('[UnifiedLLMService] Patch details:');
          artifactAction.patches.forEach((p, i) => {
            console.log(`  Patch ${i + 1}: "${(p.old_string || '').substring(0, 50)}..." → "${(p.new_string || '').substring(0, 50)}..."`);
          });
        }
        
        // WARN if AI says it made a change but sent action: "none"
        // This is a common failure mode preserved from old LLMService
        if (artifactAction.action === 'none') {
          const responseText = structuredOutput.response || '';
          const suggestsChange = /\b(changed|updated|renamed|modified|replaced|made the change|done|applied)\b/i.test(responseText);
          if (suggestsChange) {
            console.warn('[UnifiedLLMService] POTENTIAL BUG: AI response suggests a change was made, but artifact_action is "none"');
            console.warn(`  Response: "${responseText.substring(0, 100)}..."`);
          }
        }
        
        if (artifactAction.action !== 'none') {
          callbacks.onArtifact(artifactAction);
        }
      }
      
      // DISPATCH AREA ACTIONS
      if (structuredOutput.area_actions && structuredOutput.area_actions.length > 0 && callbacks.onAreaActions) {
        callbacks.onAreaActions(structuredOutput.area_actions);
      }
      
      // Return in the same format as old LLMService
      return {
        text: structuredOutput.response || '',
        structured: structuredOutput
      };
      
    } catch (error) {
      // ENHANCED ERROR HANDLING
      // The Vercel AI SDK wraps provider errors in typed error classes.
      // We log details and attempt graceful degradation.
      const elapsed = Date.now() - startTime;
      console.error(`[UnifiedLLMService] generateObject failed after ${elapsed}ms:`, error.message);
      
      // If the error contains a partial response (some providers send partial data before failing),
      // try to extract what we can
      if (error.text) {
        console.log('[UnifiedLLMService] Attempting recovery from partial response...');
        const recovered = this.attemptTruncationRecovery(error.text);
        if (recovered) {
          console.log('[UnifiedLLMService] Recovered partial response');
          if (recovered.response && callbacks.onChunk) {
            callbacks.onChunk(recovered.response);
          }
          return { text: recovered.response || '', structured: recovered };
        }
      }
      
      // Re-throw for server.js to handle
      throw error;
    }
  }

  /**
   * BUILD SYSTEM PROMPT
   * 
   * Creates the system prompt that defines the AI's behavior.
   * Identical to the old LLMService — this is pure business logic, not provider-specific.
   * 
   * PRODUCT CONTEXT:
   * The AI is a personal companion, not a productivity assistant. It should be empathetic,
   * remember personal context, and help users work through life decisions.
   * 
   * @returns {string} System prompt
   */
  buildSystemPrompt() {
    if (this.promptService) {
      return this.promptService.getSystemPrompt();
    }
    
    // SYSTEM PROMPT SLIMMING (2026-02-06):
    // Visual design instructions are in getArtifactDesignPrompt() and only injected
    // when an artifact is being created/updated (via buildSharedContextPrefix).
    // This base prompt is ~3500 chars vs the old ~8000 chars.
    return `You are BubbleVoice, a personal AI companion designed to help people think through their lives.

**Your Purpose:**
You help users process their thoughts about personal life topics: family, relationships, personal growth, goals, struggles, and life decisions. You're not a productivity tool or task manager - you're a thinking partner for life.

**Your Approach:**
- Be empathetic and understanding, not prescriptive
- Ask thoughtful follow-up questions to help users explore their thoughts
- Remember what users have shared (context will be provided)
- When appropriate, create visual artifacts to help users see their thoughts
- Generate 2-4 bubble suggestions for natural conversation continuation

**Response Format:**
Always respond with a JSON object containing:
- "response": Your conversational response (this is what the user sees/hears)
- "bubbles": 2-4 short follow-up prompts (max 7 words each)
- "area_actions": Array of life area operations (create_area, append_entry, update_summary) - only when user shares personal info worth remembering
- "artifact_action": Object with action ("create", "update", "patch", or "none") and optional HTML
- "html_toggle": Object with generate_html (boolean) and optional reason

**Life Areas System:**
When users share personal information (about family, goals, struggles, etc.), organize it into life areas:
- create_area: New topic (e.g., area_path: "family/kids", name: "Kids")
- append_entry: Add info to existing area (include user_quote, ai_observation, sentiment)
- update_summary: Update area overview

**Artifact Guidelines:**
- Create artifacts ONLY when specifically requested or when visual representation genuinely helps
- Use "none" for casual conversation (most turns)
- If updating an existing artifact, use action "update" with the SAME artifact_id
- Include complete, self-contained HTML with all styles in <style> tag

**Bubble Guidelines:**
- 2-4 suggestions, max 7 words each
- Reference personal context when available (e.g., "how's Emma doing?" not just "tell me more")
- Mix emotional exploration with practical follow-ups
- At least one should go deeper into the current topic`;
  }

  /**
   * BUILD SHARED CONTEXT PREFIX
   * 
   * Generates the shared context string injected into messages for ALL providers.
   * Includes RAG context (memory) and artifact context (what's currently displayed).
   * 
   * Identical to old LLMService — this is pure business logic.
   * 
   * @param {Object} conversation - Conversation object (may have ragContext and currentArtifact)
   * @returns {string} Combined context string to prepend to messages
   */
  buildSharedContextPrefix(conversation) {
    let contextParts = [];

    // 1. RAG CONTEXT INJECTION
    // Memory from past conversations: vector search results, knowledge tree, AI notes
    if (conversation.ragContext) {
      contextParts.push(conversation.ragContext);
      console.log('[UnifiedLLMService] Injected RAG context:', conversation.ragContext.length, 'chars');
    }

    // 2. ARTIFACT CONTEXT + DESIGN PROMPT INJECTION
    // If there's a current artifact displayed, inject both the artifact state
    // and the design prompt (CSS/styling instructions for HTML generation).
    // Design prompt is ONLY injected here, saving ~2000 tokens on casual turns.
    if (conversation.currentArtifact) {
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
      console.log('[UnifiedLLMService] Injected artifact context:', artifact.artifact_id, artifact.artifact_type);
    }

    return contextParts.join('\n\n');
  }

  /**
   * GET ARTIFACT DESIGN PROMPT
   * 
   * Visual design standards for HTML artifacts. Only injected when artifact context
   * exists (via buildSharedContextPrefix), saving tokens on casual conversation.
   * 
   * Identical to old LLMService — this is pure design specification.
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
   * ATTEMPT TRUNCATION RECOVERY
   * 
   * Tries to extract usable data from a partial/malformed JSON response.
   * Preserved from old LLMService for graceful degradation.
   * 
   * @param {string} partialJson - The truncated JSON response
   * @returns {object|null} Recovered partial response or null
   */
  attemptTruncationRecovery(partialJson) {
    try {
      const responseMatch = partialJson.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      
      if (responseMatch && responseMatch[1]) {
        const recoveredResponse = responseMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        let bubbles = [];
        const bubblesMatch = partialJson.match(/"bubbles"\s*:\s*\[([\s\S]*?)\]/);
        if (bubblesMatch && bubblesMatch[1]) {
          const bubbleMatches = bubblesMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
          if (bubbleMatches) {
            bubbles = bubbleMatches.map(b =>
              b.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
            );
          }
        }
        
        console.log('[UnifiedLLMService] Truncation recovery extracted:', {
          responseLength: recoveredResponse.length,
          bubblesCount: bubbles.length
        });
        
        return {
          response: recoveredResponse,
          bubbles: bubbles.length > 0 ? bubbles : ['tell me more', 'what else?'],
          area_actions: [],
          artifact_action: { action: 'none' },
          html_toggle: { generate_html: false },
          _recovered: true,
          _truncated: true
        };
      }
      
      return null;
    } catch (error) {
      console.error('[UnifiedLLMService] Truncation recovery failed:', error);
      return null;
    }
  }
}

module.exports = UnifiedLLMService;
