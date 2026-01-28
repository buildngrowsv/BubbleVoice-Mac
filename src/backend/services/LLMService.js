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
    
    // Fallback to hardcoded default (backward compatibility)
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

1. **Create areas** when a new topic emerges (e.g., Family/Emma_School when discussing Emma's reading)
2. **Append entries** to existing areas to track ongoing situations
3. **Update summaries** to maintain high-level understanding

Areas are organized hierarchically:
- Family → Emma_School → reading_comprehension.md
- Work → Startup → fundraising.md
- Personal → Health → exercise_goals.md

**CRITICAL: Response Format**
You MUST respond with ONLY valid JSON. No other text before or after. Your response must be in this exact JSON format:

{
  "response": "Your conversational response text",
  "bubbles": ["bubble 1", "bubble 2", "bubble 3"],
  "area_actions": [
    {
      "action": "create_area|append_entry|update_summary",
      "area_path": "Family/Emma_School",
      "document": "reading_comprehension.md",
      "content": "Entry content",
      "user_quote": "Direct quote from user",
      "ai_observation": "Your observation (1-2 sentences)",
      "sentiment": "hopeful|concerned|anxious|excited|neutral"
    }
  ],
  "artifact_action": {
    "action": "create|update|none",
    "artifact_id": "unique_id",
    "artifact_type": "comparison_card|stress_map|checklist|reflection_summary|goal_tracker|timeline|decision_matrix|progress_chart|mindmap|celebration_card",
    "html": "Full standalone HTML with inline CSS (only when html_toggle.generate_html is true)",
    "data": { /* optional JSON data for data artifacts */ }
  },
  "html_toggle": {
    "generate_html": true|false,
    "reason": "Why HTML is/isn't needed (for debugging and optimization)"
  }
}

**Area Actions Guidelines:**
- Create areas when user mentions a new topic (kids, work projects, health goals)
- Append entries when user provides updates or new information
- For append_entry: MUST include "content" field with summary of what user shared
- Include direct quotes from user in "user_quote" (helps with vector search)
- Add your observations in "ai_observation" (helps with future context)
- Tag sentiment: hopeful, concerned, anxious, excited, neutral

**Artifact Guidelines:**

**CRITICAL - EDIT vs CREATE Decision (prevents duplicates):**
- **UPDATE (action: "update")** - Use when modifying EXISTING artifact:
  - User says "change X to Y" on the displayed artifact
  - User says "add X" or "remove Y" from artifact
  - User says "update the checklist" or similar modification request
  - User is refining/iterating on what they already see
  - **MUST use the SAME artifact_id from [CURRENT ARTIFACT DISPLAYED] context**
  - **MUST regenerate complete HTML with the modification applied**
- **CREATE (action: "create")** - Use ONLY when making NEW artifact:
  - User explicitly asks for something NEW ("make me a timeline", "create a checklist")
  - User wants a DIFFERENT artifact type ("show this as a mindmap instead")
  - No artifact is currently displayed
  - User explicitly says "new" or "create" or requests a different format
  - Generate a new unique artifact_id (format: type_timestamp)
- **NONE (action: "none")** - Use when no artifact work needed:
  - User is just chatting/asking questions
  - No visual output is appropriate

**HTML Toggle System**: Control when to generate expensive HTML vs fast data-only responses
  - **HTML OFF (default)**: Fast mode for simple updates, questions, minor corrections
  - **HTML ON**: Visual mode for complex decisions, new artifacts, redesign requests
- **When to Toggle HTML ON**:
  - User explicitly requests visual ("show me", "visualize", "make a chart")
  - Complex decision needs visualization (job, family, major life choice)
  - First time creating artifact (user hasn't seen it yet)
  - User requests redesign ("change layout", "show as pros/cons")
  - High-stakes personal decision deserves beautiful visual
  - **ANY artifact action (create or update) that changes content**
- **When to Keep HTML OFF**:
  - User just asking questions (no artifact change)
  - Casual conversation (no artifact needed)
  - ONLY when artifact_action.action is "none"
- **Artifact Quality Standards**:
  - Standalone HTML with ALL CSS inline (no external deps)
  - Liquid glass styling (backdrop-filter: blur(15-20px), modern gradients)
  - Emotionally resonant language (first-person, validates feelings)
  - Premium typography (SF Pro Display, Inter, or system fonts)
  - Sophisticated color palettes (purple, pink, blue, teal gradients)
  - Smooth hover states and transitions
  - Responsive layouts (works on different sizes)
  - Marketing-polished quality
- **Emotional Depth**:
  - Use first-person language ("I can sleep well knowing...")
  - Acknowledge emotional weight ("This is hard because...")
  - Validate difficulty of choice
  - Provide perspective and encouragement
  - Add reflection sections for major decisions
- **HTML Structure**:
  - Complete <!DOCTYPE html> document
  - All styles in <style> tag (no external CSS)
  - Self-contained (no external images or fonts beyond system fonts)
  - Accessible (semantic HTML, ARIA labels)
- **Artifact Types**:
  - comparison_card: Side-by-side pros/cons with emotional context
  - stress_map: Topic breakdown with intensity visualization
  - checklist: Actionable items with progress tracking
  - reflection_summary: Journey recap with timeline and insights
  - goal_tracker: Progress visualization with milestones
  - timeline: Events over time with emotional markers
  - decision_matrix: Weighted scoring grid with priorities
  - progress_chart: Metrics over time with trends
  - mindmap: Connected concepts with relationships
  - celebration_card: Achievement recognition with encouragement

**Important:**
- ALWAYS respond with ONLY valid JSON (no markdown, no code blocks, no extra text)
- Always include area_actions when user discusses life topics
- Always include 2-4 relevant bubbles
- Keep responses conversational and natural
- Reference past conversations when relevant (context provided)
- Be warm and supportive, like a thoughtful friend
- Include html_toggle field to control HTML generation

**Example Response:**
{"response":"I hear you're worried about Emma's reading. That must be stressful. Tell me more about what you've noticed at home?","area_actions":[{"action":"create_area","area_path":"Family/Emma_School","name":"Emma's School","description":"Tracking Emma's reading progress and school challenges"},{"action":"append_entry","area_path":"Family/Emma_School","document":"reading_comprehension.md","content":"Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.","user_quote":"Her teacher said she can decode words but doesn't remember what she reads.","ai_observation":"Specific diagnosis from teacher. Comprehension issue, not decoding.","sentiment":"concerned"}],"artifact_action":{"action":"none"},"bubbles":["what helps her focus?","teacher's suggestions?","how does she feel?"]}`;
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
                  action: { type: 'string' },
                  area_path: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  document: { type: 'string' },
                  content: { type: 'string' },
                  sentiment: { type: 'string' }
                }
              }
            },
            artifact_action: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                artifact_id: { type: 'string' },
                artifact_type: { type: 'string' },
                html: { type: 'string' }
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
      // LOGGING: Track artifact generation from LLM
      if (structuredOutput.artifact_action) {
        console.log('[LLMService] ✨ Artifact action from LLM:', {
          action: structuredOutput.artifact_action.action,
          artifact_type: structuredOutput.artifact_action.artifact_type,
          has_html: !!structuredOutput.artifact_action.html,
          html_length: structuredOutput.artifact_action.html?.length || 0
        });
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
      // Fallback to raw response
      if (callbacks.onChunk) {
        callbacks.onChunk(fullResponse);
      }
      return fullResponse;
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
   * BUILD MESSAGES FOR GEMINI
   * 
   * Formats conversation history for Gemini API.
   * 
   * GEMINI FORMAT:
   * The Gemini SDK expects an array of content objects with role and parts.
   * 
   * CRITICAL FIX (2026-01-24): System prompt is now passed via `systemInstruction`
   * in the model config (see generateGeminiResponse), NOT as a user message.
   * This prevents the system prompt from being sent twice.
   * 
   * CRITICAL FIX (2026-01-27): Now includes artifact context.
   * The AI needs to know what artifact is currently displayed to decide
   * whether to edit vs create. Without this context, AI always creates
   * new artifacts (0% update rate documented in COMPREHENSIVE_EVALUATION.md).
   * 
   * IMPORTANT: Gemini alternates between 'user' and 'model' roles.
   * We need to ensure proper alternation and combine consecutive messages
   * from the same role if needed.
   * 
   * @param {Object} conversation - Conversation object
   * @returns {Array} Contents array for Gemini
   */
  buildMessagesForGemini(conversation) {
    const contents = [];

    // NO LONGER: Start with system prompt as first user message
    // WHY: System prompt is now passed via systemInstruction in model config
    // BECAUSE: Passing it twice wastes tokens and could confuse the model
    // HISTORY: Bug discovered 2026-01-24 - system prompt was being sent twice
    
    // ARTIFACT CONTEXT INJECTION (2026-01-27, improved 2026-01-28)
    // If there's a current artifact displayed, prepend context so AI knows
    // what artifact exists and can decide to edit vs create
    // 
    // FIX (2026-01-28): Made instructions more explicit to prevent the AI from:
    // 1. Creating duplicate artifacts when it should update
    // 2. Using a different artifact_id when modifying existing content
    // 3. Generating blank/malformed HTML on updates
    if (conversation.currentArtifact) {
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

[END ARTIFACT CONTEXT]

`;
      contents.push({
        role: 'user',
        parts: [{ text: artifactContext }]
      });
      
      // Add a model acknowledgment to maintain alternation
      contents.push({
        role: 'model',
        parts: [{ text: `I see the ${artifact.artifact_type} artifact (ID: ${artifact.artifact_id}). For modifications, I will use action "update" with that same ID. For new artifacts, I will use action "create" with a new ID.` }]
      });
      
      console.log('[LLMService] Injected artifact context:', artifact.artifact_id, artifact.artifact_type);
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
    // If conversation is empty, this shouldn't happen (we always add user message first)
    // but just in case, add a placeholder
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
   * @param {Object} conversation - Conversation object
   * @returns {Array} Messages array
   */
  buildMessagesForAnthropic(conversation) {
    const messages = [];

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
}

module.exports = LLMService;
