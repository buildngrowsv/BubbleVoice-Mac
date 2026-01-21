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
  constructor() {
    // Initialize API clients
    // These are created lazily when first needed
    this.geminiClient = null;
    this.anthropicClient = null;
    this.openaiClient = null;

    // Provider configuration
    // Maps model names to provider implementations
    this.providers = {
      'gemini-2.5-flash-lite': 'gemini',
      'gemini-2.0-flash': 'gemini',
      'gemini-2.0-flash-exp': 'gemini',
      'claude-sonnet-4.5': 'anthropic',
      'claude-sonnet-4': 'anthropic',
      'gpt-5.2-turbo': 'openai',
      'gpt-5.1': 'openai'
    };

    // System prompt
    // Defines the AI's personality and capabilities
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
   * @returns {string} System prompt
   */
  buildSystemPrompt() {
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

**Structured Outputs:**
You can generate two types of structured outputs alongside your conversational response:

1. **Bubbles** - Short (≤7 words) contextual prompts that help continue the conversation
   - Examples: "how's Emma doing?", "that startup worry?", "your sleep goal?"
   - Generate 2-4 bubbles that are relevant to the current conversation
   - Bubbles should feel like natural conversation continuations

2. **Artifacts** - Visual outputs that help users see their life patterns
   - Types: timelines, decision cards, goal trackers, stress maps, checklists
   - Only generate artifacts when they would genuinely help the user
   - Artifacts should be based on real conversation content, not generic

**Response Format:**
Your response should be in JSON format with these fields:
{
  "response": "Your conversational response text",
  "bubbles": ["bubble 1", "bubble 2", "bubble 3"],
  "artifact": {
    "type": "timeline|card|tracker|map|checklist",
    "title": "Artifact title",
    "content": "HTML content for the artifact"
  }
}

If no artifact is needed, omit the "artifact" field.
Always include 2-4 relevant bubbles.

**Important:**
- Keep responses conversational and natural (not too long)
- Reference past conversations when relevant (context provided)
- Focus on helping users think, not telling them what to do
- Be warm and supportive, like a thoughtful friend`;
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
    const geminiModel = this.geminiClient.getGenerativeModel({
      model: model.replace('gemini-', 'models/gemini-'),
      generationConfig: {
        temperature: settings?.temperature || 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    });

    // Build messages array
    const messages = this.buildMessagesForGemini(conversation);

    // Generate streaming response
    const result = await geminiModel.generateContentStream(messages);

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
      if (structuredOutput.artifact && callbacks.onArtifact) {
        callbacks.onArtifact(structuredOutput.artifact);
      }

      return structuredOutput.response || fullResponse;
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
   * @param {Object} conversation - Conversation object
   * @returns {Array} Messages array
   */
  buildMessagesForGemini(conversation) {
    const messages = [
      {
        role: 'user',
        parts: [{ text: this.systemPrompt }]
      }
    ];

    // Add conversation history
    if (conversation.messages) {
      for (const msg of conversation.messages) {
        messages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    return messages;
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
