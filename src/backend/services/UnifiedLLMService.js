/**
 * BUBBLEVOICE MAC - UNIFIED LLM SERVICE (Vercel AI SDK + Tool Calling)
 * 
 * ARCHITECTURE (2026-02-06):
 * This service is the core LLM interface for BubbleVoice. It originally used three
 * separate provider implementations (~700 lines). Phase 3 unified them via generateObject.
 * Phase 4 (this version) converts to a TOOL-CALLING PATTERN.
 * 
 * WHY TOOL CALLING (Phase 4 evolution):
 * The old approach used generateObject() with a monolithic Zod schema that forced the LLM
 * to produce a giant JSON blob with response + bubbles + area_actions + artifact_action
 * on EVERY turn. This was problematic because:
 * 1. The LLM had to produce empty arrays/objects for fields not relevant to the turn
 * 2. The monolithic JSON delayed response delivery (had to wait for entire object)
 * 3. Adding new capabilities meant growing the schema and re-training LLM behavior
 * 4. The LLM sometimes hallucinated area_actions or artifacts when not needed
 * 
 * With tool calling, the model:
 * - Generates its natural text response FIRST (streamed word-by-word)
 * - Calls tools ONLY when needed (remember_info, suggest_bubbles, create_artifact)
 * - Tools have focused, validated schemas (no empty arrays/objects)
 * - New capabilities = new tools (no schema migration needed)
 * 
 * IMPORTANT AI SDK 6 NOTES:
 * - In AI SDK 6, tool schemas use `inputSchema` (NOT `parameters` which was v5)
 * - Multi-step loops use `stopWhen: stepCountIs(N)` (NOT `maxSteps` which was v5)
 * - The `tool()` helper is an identity function — it returns the object as-is
 * - Google Gemini requires strict object schemas (no optional fields at top level)
 * 
 * BACKWARDS COMPATIBILITY:
 * Exports the same API as before:
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

const { generateText, tool, stepCountIs } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAI } = require('@ai-sdk/openai');
const { z } = require('zod');
const ContextCompactionService = require('./ContextCompactionService');


/**
 * TOOL DEFINITIONS FOR BUBBLEVOICE
 * 
 * These tools replace the monolithic BubbleVoiceResponseSchema. Instead of forcing
 * the LLM to produce ALL fields on every turn, tools are called only when needed.
 * 
 * WHY SEPARATE TOOLS vs ONE BIG SCHEMA:
 * - suggest_bubbles: Called on nearly every turn (follow-up prompts)
 * - remember_info: Called ONLY when user shares personal information
 * - create_artifact: Called ONLY when visual output is requested/helpful
 * - update_artifact: Called ONLY when modifying an existing artifact
 * 
 * This means casual conversation turns (most of them) only call suggest_bubbles,
 * saving tokens and reducing hallucinated area_actions/artifacts.
 * 
 * SCHEMA NOTES:
 * - Use z.string() (never z.string().optional()) for top-level fields — Gemini 
 *   doesn't handle optional fields well in tool schemas
 * - The `inputSchema` property name is required for AI SDK 6 (not `parameters`)
 * - Each tool's execute() collects results into a shared array that the caller reads
 */
function createBubbleVoiceTools(toolResults) {
  return {
    /**
     * SUGGEST BUBBLES TOOL
     * Called to generate follow-up conversation prompts displayed as clickable buttons.
     * Expected on nearly every turn. The model should call this after its text response.
     * 
     * PRODUCT CONTEXT: Bubbles make conversation feel proactive, not reactive.
     * Good bubbles reference personal context (e.g., "how's Emma doing?")
     */
    suggest_bubbles: tool({
      description: 
        'Generate 2-4 short follow-up conversation prompts (max 7 words each) ' +
        'that appear as clickable buttons. Reference personal context when possible. ' +
        'Examples: "tell me more about that", "how does that make you feel?". ' +
        'ALWAYS call this tool on every turn.',
      inputSchema: z.object({
        bubbles: z.array(z.string()).describe(
          '2-4 short follow-up prompts, max 7 words each'
        ),
      }),
      execute: async (args) => {
        toolResults.push({ type: 'bubbles', data: args.bubbles });
        return { stored: true, count: args.bubbles.length };
      },
    }),

    /**
     * REMEMBER INFO TOOL
     * Called when the user shares personal information worth remembering.
     * This feeds into the Life Areas system (IntegrationService).
     * 
     * WHEN TO CALL: User mentions family, goals, struggles, events, emotions.
     * WHEN NOT TO CALL: User asks a general question, gives instructions, etc.
     * 
     * Multiple remember_info calls in one turn are fine (e.g., user shares
     * info about both family and career in one message).
     */
    remember_info: tool({
      description:
        'Remember personal information the user shared. Call this when the user ' +
        'mentions family, relationships, goals, struggles, events, or emotions. ' +
        'Do NOT call for general questions or instructions.',
      inputSchema: z.object({
        action: z.string().describe(
          'Action type: "create_area" (new topic), "append_entry" (add to existing), or "update_summary"'
        ),
        area_path: z.string().describe(
          'Life area path like "family/kids" or "career/goals"'
        ),
        name: z.string().describe(
          'Area display name for create_area, or empty string for other actions'
        ),
        content: z.string().describe(
          'The information to remember — what the user shared'
        ),
        user_quote: z.string().describe(
          'Direct quote from the user, or empty string if not applicable'
        ),
        ai_observation: z.string().describe(
          'Your observation about the emotional significance of this information'
        ),
        sentiment: z.string().describe(
          'Emotional tone: hopeful, concerned, anxious, excited, or neutral'
        ),
      }),
      execute: async (args) => {
        // Convert tool call format to the area_actions format that IntegrationService expects
        // This maintains backwards compatibility with the existing processing pipeline
        const areaAction = {
          action: args.action,
          area_path: args.area_path,
          ...(args.name ? { name: args.name } : {}),
          ...(args.content ? { content: args.content } : {}),
          ...(args.user_quote ? { user_quote: args.user_quote } : {}),
          ...(args.ai_observation ? { ai_observation: args.ai_observation } : {}),
          ...(args.sentiment ? { sentiment: args.sentiment } : {}),
        };
        toolResults.push({ type: 'area_action', data: areaAction });
        return { stored: true, area_path: args.area_path };
      },
    }),

    /**
     * CREATE ARTIFACT TOOL
     * Called to generate a new visual HTML artifact (checklist, timeline, etc.).
     * Only called when the user explicitly requests visual output or it would genuinely help.
     * 
     * PRODUCT CONTEXT: Artifacts are rich visual HTML outputs displayed alongside
     * the conversation. They help users see their thoughts organized visually.
     */
    create_artifact: tool({
      description:
        'Create a new visual HTML artifact. Only call when user requests visual output ' +
        'or when a visual representation would genuinely help (e.g., pros/cons, timeline, checklist). ' +
        'Do NOT call for casual conversation.',
      inputSchema: z.object({
        artifact_id: z.string().describe(
          'Unique artifact ID, e.g., "checklist_1707235200000"'
        ),
        artifact_type: z.string().describe(
          'Type: comparison_card, stress_map, checklist, reflection_summary, ' +
          'goal_tracker, timeline, decision_matrix, progress_chart, mindmap, celebration_card'
        ),
        html: z.string().describe(
          'Complete self-contained HTML with <!DOCTYPE html>, all styles in <style> tag, ' +
          'premium design with gradients, glass effects, and smooth transitions'
        ),
      }),
      execute: async (args) => {
        toolResults.push({
          type: 'artifact',
          data: {
            action: 'create',
            artifact_id: args.artifact_id,
            artifact_type: args.artifact_type,
            html: args.html,
          }
        });
        return { created: true, artifact_id: args.artifact_id };
      },
    }),

    /**
     * UPDATE ARTIFACT TOOL
     * Called to modify an existing artifact that's currently displayed.
     * Reuses the existing artifact_id and provides complete replacement HTML.
     * 
     * IMPORTANT: The system prompt includes the current artifact_id when one is displayed.
     * The model should reuse that exact ID and provide updated HTML.
     */
    update_artifact: tool({
      description:
        'Update an existing artifact that is currently displayed. Use the SAME artifact_id. ' +
        'Provide complete replacement HTML with the requested changes applied. ' +
        'Call this when the user asks to change, modify, update, or fix the current artifact.',
      inputSchema: z.object({
        artifact_id: z.string().describe(
          'The SAME artifact_id as the current artifact being updated'
        ),
        artifact_type: z.string().describe(
          'The artifact type (usually same as original)'
        ),
        html: z.string().describe(
          'Complete updated HTML with all changes applied'
        ),
      }),
      execute: async (args) => {
        toolResults.push({
          type: 'artifact',
          data: {
            action: 'update',
            artifact_id: args.artifact_id,
            artifact_type: args.artifact_type,
            html: args.html,
          }
        });
        return { updated: true, artifact_id: args.artifact_id };
      },
    }),
  };
}


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
      // Listed from fastest/cheapest to most capable
      'gemini-2.5-flash-lite': { provider: 'google', displayName: 'Gemini 2.5 Flash-Lite' },
      'gemini-2.5-flash': { provider: 'google', displayName: 'Gemini 2.5 Flash' },
      'gemini-2.5-pro': { provider: 'google', displayName: 'Gemini 2.5 Pro' },
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
   * GENERATE RESPONSE — TOOL-CALLING PATTERN (Phase 4)
   * 
   * Uses generateText() with tools instead of generateObject() with a monolithic schema.
   * The model generates its text response naturally, then calls tools for side effects.
   * 
   * FLOW:
   * 1. Resolve model name to Vercel AI SDK model instance
   * 2. Build messages (with shared context injection and optional compaction)
   * 3. Create tool instances with a shared toolResults collector
   * 4. Call generateText() with tools + stopWhen: stepCountIs(5) for multi-step
   * 5. Step 1: Model generates text + calls tools (remember_info, suggest_bubbles, etc.)
   * 6. Step 2+: Model gets tool results, may call more tools or finish with text
   * 7. Dispatch response text word-by-word via onChunk callback
   * 8. Dispatch tool results (bubbles, artifacts, area_actions) via callbacks
   * 9. Return { text, structured } matching old API for backwards compatibility
   * 
   * WHY TOOL CALLING > generateObject:
   * - Text response is generated naturally (not extracted from JSON blob)
   * - Tools called ONLY when needed (no empty artifact_action:{action:"none"} waste)
   * - Adding new capabilities = adding new tools (no schema migration)
   * - Model is better at tool calling than producing complex nested JSON
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
    // DEFAULT MODEL: gemini-2.5-flash
    // Previously used gemini-2.5-flash-lite but gemini-2.5-flash has better tool-calling
    // support. Gemini 2.0 Flash has known issues with multi-step tool calling in AI SDK 6.
    // (Invalid JSON response errors on step 2 when processing tool results.)
    const modelName = settings?.model || 'gemini-2.5-flash';
    
    console.log(`[UnifiedLLMService] Generating response with ${modelName} (tool-calling)`);
    
    // Get Vercel AI SDK model instance
    const model = this.getModelInstance(modelName);
    
    // Build unified messages array (async due to potential context compaction)
    const messages = await this.buildMessages(conversation);
    
    // TOOL RESULTS COLLECTOR
    // Each tool's execute() pushes results here. After generateText completes,
    // we read this array to dispatch callbacks. This is the bridge between
    // the Vercel AI SDK's tool execution and BubbleVoice's callback system.
    const toolResults = [];
    
    // Create tool instances with the shared collector
    const tools = createBubbleVoiceTools(toolResults);
    
    const startTime = Date.now();

    // LLM API TIMEOUT (P0 UX FIX — 2026-02-06)
    // WHY: LLM API calls can hang indefinitely if the provider is overloaded or
    // experiencing an outage. Without a timeout, the user sees "Thinking..." forever.
    // BECAUSE: We observed 30+ second hangs with Gemini and OpenAI during high traffic.
    // 
    // DESIGN: 45 second timeout is generous enough for complex artifact generation
    // (which typically takes 5-15s) but catches genuine hangs. The user can also
    // cancel manually via the UI cancel button (sends 'interrupt' message).
    const LLM_TIMEOUT_MS = 45000;
    
    try {
      // GENERATE TEXT WITH TOOL CALLING
      // The model produces its natural text response and calls tools as needed.
      // stopWhen: stepCountIs(5) allows up to 5 steps:
      //   Step 1: Model generates text + calls tools
      //   Step 2: Model sees tool results, may call more tools
      //   Step 3-5: Additional tool steps if needed (rare)
      //
      // WHY stopWhen(5): Most turns need 2 steps (text+tools, then final text).
      // Artifact creation may need 3 (text, create_artifact, confirmation).
      // 5 gives safety margin without risking runaway loops.
      //
      // AI SDK 6 NOTE: `maxSteps` was removed in v6, replaced by `stopWhen`.
      // `stepCountIs(N)` stops when the total number of steps reaches N.
      //
      // WRAPPED WITH TIMEOUT: Promise.race against a timeout to prevent indefinite hangs.
      const generatePromise = generateText({
        model,
        system: this.systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(5),
        maxTokens: 8192,
        temperature: settings?.temperature || 0.7,
        onStepFinish: (step) => {
          // Log each step for debugging tool-calling flow
          console.log(`[UnifiedLLMService] Step finished:`, {
            finishReason: step.finishReason,
            toolCalls: step.toolCalls?.length || 0,
            hasText: !!step.text,
            textLength: step.text?.length || 0,
          });
        },
      });

      // Race the LLM call against a timeout
      // WHY: This is the P0 fix for the "user stuck with Thinking..." forever issue
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          `LLM response timed out after ${LLM_TIMEOUT_MS / 1000}s. The AI provider may be overloaded. Please try again.`
        )), LLM_TIMEOUT_MS)
      );

      const result = await Promise.race([generatePromise, timeoutPromise]);
      
      const elapsed = Date.now() - startTime;
      const responseText = result.text || '';
      
      console.log(`[UnifiedLLMService] Response generated in ${elapsed}ms (${result.steps.length} steps)`);
      console.log(`[UnifiedLLMService] Tokens: ${result.usage?.totalTokens || 'unknown'}`);
      console.log(`[UnifiedLLMService] Tool calls: ${toolResults.length} (${toolResults.map(r => r.type).join(', ') || 'none'})`);
      
      // DISPATCH RESPONSE TEXT word-by-word (simulated streaming)
      // WHY: The frontend expects onChunk callbacks for real-time text display.
      // Even though generateText returns the full response at once (we don't use
      // streamText because we need tool calling results), we dispatch word-by-word
      // with 30ms delays to create natural reading pacing.
      if (responseText && callbacks.onChunk) {
        const words = responseText.split(' ');
        for (let i = 0; i < words.length; i++) {
          callbacks.onChunk(words[i] + (i < words.length - 1 ? ' ' : ''));
          // 30ms delay between words for natural pacing
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      }
      
      // PROCESS TOOL RESULTS
      // Extract tool results from the shared collector and dispatch via callbacks.
      // This bridges the tool-calling pattern to the existing callback API.
      let bubbles = [];
      const areaActions = [];
      let artifactAction = null;
      
      for (const tr of toolResults) {
        switch (tr.type) {
          case 'bubbles':
            bubbles = tr.data;
            break;
          case 'area_action':
            areaActions.push(tr.data);
            break;
          case 'artifact':
            artifactAction = tr.data;
            break;
        }
      }
      
      // DISPATCH BUBBLES
      // If the model didn't call suggest_bubbles (shouldn't happen but safety),
      // provide default follow-up prompts so the UI always has something.
      if (bubbles.length === 0) {
        console.warn('[UnifiedLLMService] Model did not call suggest_bubbles — using defaults');
        bubbles = ['tell me more', 'how does that make you feel?', 'what would help?'];
      }
      if (callbacks.onBubbles) {
        callbacks.onBubbles(bubbles);
      }
      
      // DISPATCH ARTIFACT ACTION
      if (artifactAction && callbacks.onArtifact) {
        console.log('[UnifiedLLMService] Artifact action:', {
          action: artifactAction.action,
          artifact_type: artifactAction.artifact_type,
          artifact_id: artifactAction.artifact_id || '(none)',
          has_html: !!artifactAction.html,
          html_length: artifactAction.html?.length || 0,
        });
        callbacks.onArtifact(artifactAction);
      }
      
      // DISPATCH AREA ACTIONS
      if (areaActions.length > 0 && callbacks.onAreaActions) {
        console.log(`[UnifiedLLMService] Processing ${areaActions.length} area action(s)`);
        callbacks.onAreaActions(areaActions);
      }
      
      // BUILD STRUCTURED OUTPUT FOR BACKWARDS COMPATIBILITY
      // server.js expects a `structured` object with the old schema shape.
      // We reconstruct it from tool results to maintain API compatibility.
      const structuredOutput = {
        response: responseText,
        bubbles,
        area_actions: areaActions,
        artifact_action: artifactAction || { action: 'none' },
        html_toggle: {
          generate_html: !!artifactAction,
          reason: artifactAction ? `Created ${artifactAction.artifact_type}` : 'No artifact needed',
        },
      };
      
      return {
        text: responseText,
        structured: structuredOutput,
      };
      
    } catch (error) {
      // ENHANCED ERROR HANDLING
      // The Vercel AI SDK wraps provider errors in typed error classes.
      const elapsed = Date.now() - startTime;
      console.error(`[UnifiedLLMService] generateText failed after ${elapsed}ms:`, error.message);
      
      // If there were any partial tool results before the error, try to use them
      if (toolResults.length > 0) {
        console.log(`[UnifiedLLMService] Partial tool results available: ${toolResults.length}`);
        const bubbles = toolResults.find(r => r.type === 'bubbles')?.data || ['tell me more'];
        if (callbacks.onBubbles) callbacks.onBubbles(bubbles);
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
    
    // SYSTEM PROMPT FOR TOOL-CALLING PATTERN (2026-02-06):
    // In the tool-calling architecture, the system prompt focuses on PERSONALITY and BEHAVIOR.
    // The old prompt had detailed JSON schema instructions (~1500 chars of format spec) which
    // are now handled by tool descriptions. This frees up ~1500 tokens for better personality guidance.
    //
    // The prompt no longer says "respond with a JSON object" because the model generates
    // natural text and calls tools for side effects. This produces better, more natural responses.
    //
    // Visual design instructions remain in getArtifactDesignPrompt() (only injected when needed).
    return `You are BubbleVoice, a personal AI companion designed to help people think through their lives.

**Your Purpose:**
You help users process their thoughts about personal life topics: family, relationships, personal growth, goals, struggles, and life decisions. You're not a productivity tool or task manager - you're a thinking partner for life.

**Your Approach:**
- Be empathetic and understanding, not prescriptive
- Ask thoughtful follow-up questions to help users explore their thoughts
- Remember what users have shared (context will be provided in messages)
- When appropriate, create visual artifacts to help users see their thoughts

**How You Use Tools:**
You have several tools available. Use them naturally as part of your response:

1. **suggest_bubbles** — ALWAYS call this on every turn to provide follow-up conversation prompts
2. **remember_info** — Call when the user shares personal information worth remembering (family, goals, struggles, emotions, events). Organize into life areas like "family/kids", "career/goals", "health/mental"
3. **create_artifact** — Call ONLY when user requests visual output or it would genuinely help (checklists, timelines, comparisons). Most turns should NOT create artifacts.
4. **update_artifact** — Call when user asks to modify the currently displayed artifact

**Response Guidelines:**
- Your text response should be empathetic, thoughtful, and conversational
- Keep responses concise but warm (2-4 sentences for casual conversation)
- Ask follow-up questions to help users explore their thoughts
- Reference past context when available to show you remember`;
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
   * No longer needed in the tool-calling pattern since the model generates natural
   * text (not JSON) and tools handle structured data. Kept as a no-op for backwards
   * compatibility in case anything still references it.
   * 
   * HISTORY: In the generateObject era, truncated JSON was common when the model
   * hit token limits mid-response. With tool calling, the text response completes
   * normally and tools are separate invocations, making truncation much rarer.
   * 
   * @param {string} partialText - Unused
   * @returns {null} Always returns null
   */
  attemptTruncationRecovery(partialText) {
    return null;
  }
}

module.exports = UnifiedLLMService;
