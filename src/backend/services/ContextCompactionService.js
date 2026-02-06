/**
 * BUBBLEVOICE MAC - CONTEXT COMPACTION SERVICE
 * 
 * Manages conversation context to prevent exceeding LLM token limits.
 * When conversations get long, older messages are summarized into a compact
 * context block, preserving key information while freeing token budget.
 * 
 * ARCHITECTURE (2026-02-06):
 * BubbleVoice conversations are designed to be long (ongoing personal reflection).
 * Without compaction, long conversations will hit context window limits,
 * especially on smaller-context models (GPT at 128K, Claude at 200K).
 * Even Gemini's 1M context would eventually overflow with very active users.
 * 
 * INSPIRED BY: OpenCode's SessionCompaction module, which summarizes old messages
 * when context overflows. Adapted for BubbleVoice's personal conversation domain.
 * 
 * COMPACTION STRATEGY:
 * 1. When message count exceeds a threshold, trigger compaction
 * 2. Take the oldest N messages and ask the LLM to summarize them
 * 3. Replace those N messages with a single "system summary" message
 * 4. Keep the most recent M messages intact (for immediate context)
 * 5. The summary preserves: key topics, emotional state, personal details,
 *    life area updates, and any commitments made
 * 
 * PRODUCT CONTEXT:
 * The summary must preserve personal context — names, relationships, emotions,
 * goals, struggles. A generic "they discussed work-life balance" is useless.
 * The summary should be rich enough that the AI can continue the conversation
 * naturally, as if it remembered everything.
 * 
 * THRESHOLDS:
 * - Default: Compact when message count > 60 (30 turns)
 * - Keep last 20 messages (10 turns) intact for immediate context
 * - Summarize the remaining 40+ messages into a ~500 token summary
 * 
 * WHY THESE NUMBERS:
 * - 60 messages is ~12K tokens (comfortable for all models)
 * - Last 20 messages give the AI enough recent context for natural flow
 * - 500 token summary preserves key facts without bloating the context
 * - These values were chosen based on typical BubbleVoice conversation patterns
 *   (5-10 minute sessions, 2-3 sentences per turn)
 */

const { generateText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');

class ContextCompactionService {
  /**
   * Constructor
   * 
   * @param {Object} options - Configuration options
   * @param {number} options.compactionThreshold - Trigger compaction when messages exceed this count (default: 60)
   * @param {number} options.keepRecentCount - Number of recent messages to keep intact (default: 20)
   * @param {number} options.summaryMaxTokens - Max tokens for the summary (default: 800)
   * 
   * WHY CONFIGURABLE: Different models have different context windows.
   * Gemini's 1M context might warrant higher thresholds, while GPT's 128K
   * might need more aggressive compaction. These can be tuned per-model.
   */
  constructor(options = {}) {
    this.compactionThreshold = options.compactionThreshold || 60;
    this.keepRecentCount = options.keepRecentCount || 20;
    this.summaryMaxTokens = options.summaryMaxTokens || 800;
    
    // Provider for generating summaries
    // We use a fast, cheap model (gemini-2.0-flash) for compaction summaries
    // regardless of what the user's selected model is.
    // WHY: Compaction is a background operation that shouldn't use the user's
    // premium model quota. Flash is fast and cheap enough for summarization.
    this._summaryProvider = null;
    
    // Cache of compaction summaries per conversation
    // Maps conversationId → { summary: string, compactedAt: timestamp, originalCount: number }
    this.summaryCache = new Map();
    
    console.log(`[ContextCompaction] Initialized (threshold: ${this.compactionThreshold}, keepRecent: ${this.keepRecentCount})`);
  }

  /**
   * CHECK IF COMPACTION IS NEEDED
   * 
   * Determines whether a conversation's messages need compaction.
   * Called before each LLM request in the message flow.
   * 
   * @param {Object} conversation - Conversation object with messages[]
   * @returns {boolean} True if compaction should be performed
   */
  needsCompaction(conversation) {
    if (!conversation.messages || conversation.messages.length <= this.compactionThreshold) {
      return false;
    }
    
    console.log(`[ContextCompaction] Conversation ${conversation.id} has ${conversation.messages.length} messages (threshold: ${this.compactionThreshold})`);
    return true;
  }

  /**
   * COMPACT CONVERSATION
   * 
   * Summarizes older messages and returns a compacted message array.
   * Does NOT modify the original conversation — returns a new messages array
   * for use in the LLM call only. The original messages are preserved in the
   * database for full conversation history.
   * 
   * FLOW:
   * 1. Split messages into "old" (to summarize) and "recent" (to keep)
   * 2. Generate a summary of the old messages using a fast LLM
   * 3. Return [summary_message, ...recent_messages]
   * 
   * WHY NOT MODIFY ORIGINAL:
   * The full conversation must remain in the database for:
   * - User review (scrolling back through history)
   * - Vector search (RAG needs all messages for embedding)
   * - Conversation export
   * Compaction only affects what gets sent to the LLM for the current turn.
   * 
   * @param {Object} conversation - Conversation object with messages[]
   * @returns {Promise<Array>} Compacted messages array for LLM use
   */
  async compact(conversation) {
    const messages = conversation.messages;
    const totalCount = messages.length;
    
    // Split: keep the most recent messages intact, summarize the rest
    const splitIndex = totalCount - this.keepRecentCount;
    const oldMessages = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);
    
    console.log(`[ContextCompaction] Compacting: ${oldMessages.length} old → summary, keeping ${recentMessages.length} recent`);
    
    // Check cache first — if we already summarized this conversation at this length,
    // reuse the summary (no need to call the LLM again)
    const cacheKey = `${conversation.id}_${splitIndex}`;
    const cached = this.summaryCache.get(cacheKey);
    if (cached) {
      console.log(`[ContextCompaction] Using cached summary (${cached.summary.length} chars)`);
      return this.buildCompactedMessages(cached.summary, recentMessages);
    }
    
    // Generate summary of old messages
    const summary = await this.generateSummary(oldMessages, conversation.id);
    
    // Cache the summary
    this.summaryCache.set(cacheKey, {
      summary,
      compactedAt: Date.now(),
      originalCount: oldMessages.length
    });
    
    // Limit cache size (keep last 10 summaries across all conversations)
    if (this.summaryCache.size > 10) {
      const firstKey = this.summaryCache.keys().next().value;
      this.summaryCache.delete(firstKey);
    }
    
    return this.buildCompactedMessages(summary, recentMessages);
  }

  /**
   * BUILD COMPACTED MESSAGES
   * 
   * Combines a summary with recent messages into the format expected by the LLM.
   * The summary is injected as a "user" message at the start, followed by an
   * "assistant" acknowledgment, then the recent messages.
   * 
   * @param {string} summary - Summary text of older messages
   * @param {Array} recentMessages - Recent messages to keep intact
   * @returns {Array} Compacted messages array
   */
  buildCompactedMessages(summary, recentMessages) {
    const compacted = [];
    
    // Add summary as the first message pair
    compacted.push({
      role: 'user',
      content: `[CONVERSATION HISTORY SUMMARY]\n${summary}\n[END SUMMARY - Recent messages follow below]`
    });
    compacted.push({
      role: 'assistant',
      content: 'I have the conversation history context. Continuing with the recent messages.'
    });
    
    // Add recent messages
    for (const msg of recentMessages) {
      compacted.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    return compacted;
  }

  /**
   * GENERATE SUMMARY
   * 
   * Uses a fast LLM to summarize a batch of conversation messages.
   * The summary preserves personal details, emotional context, and key topics
   * that the AI needs to continue the conversation naturally.
   * 
   * WHY DEDICATED SUMMARY LLM:
   * We use gemini-2.0-flash (fast and cheap) for summaries, regardless of the
   * user's selected model. This keeps compaction cost low and latency minimal.
   * The summary quality from a fast model is sufficient — we're extracting facts,
   * not generating creative responses.
   * 
   * @param {Array} messages - Messages to summarize
   * @param {string} conversationId - For logging
   * @returns {Promise<string>} Summary text
   */
  async generateSummary(messages, conversationId) {
    try {
      // Initialize summary provider (lazy)
      if (!this._summaryProvider) {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
          // Fallback: create a simple extractive summary without LLM
          console.warn('[ContextCompaction] No GOOGLE_API_KEY, using extractive summary');
          return this.createExtractiveSummary(messages);
        }
        this._summaryProvider = createGoogleGenerativeAI({ apiKey });
      }
      
      // Format messages for the summary prompt
      const formattedConversation = messages.map(msg => {
        const role = msg.role === 'assistant' ? 'AI' : 'User';
        const content = msg.content.substring(0, 300); // Truncate very long messages
        return `${role}: ${content}`;
      }).join('\n');
      
      const startTime = Date.now();
      
      const result = await generateText({
        model: this._summaryProvider('gemini-2.0-flash'),
        system: `You are a conversation summarizer for a personal AI companion app called BubbleVoice.
Your job is to create concise but comprehensive summaries of conversation history.

CRITICAL: Preserve these details in your summary:
- Personal names (family members, friends, colleagues)
- Specific emotions and how they evolved
- Life decisions discussed and any conclusions reached
- Goals, commitments, and action items
- Relationship dynamics mentioned
- Key life areas discussed (career, family, health, etc.)

Format: Write a flowing narrative summary (not bullet points).
Length: 200-400 words.
Tone: Factual and warm, as if briefing the AI before continuing the conversation.`,
        prompt: `Summarize this conversation between a user and their AI companion:\n\n${formattedConversation}`,
        maxTokens: this.summaryMaxTokens,
        temperature: 0.3, // Low temperature for factual summarization
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`[ContextCompaction] Summary generated in ${elapsed}ms (${result.text.length} chars) for conversation ${conversationId}`);
      
      return result.text;
    } catch (error) {
      console.error(`[ContextCompaction] Summary generation failed:`, error.message);
      // Fallback: extractive summary
      return this.createExtractiveSummary(messages);
    }
  }

  /**
   * CREATE EXTRACTIVE SUMMARY
   * 
   * Fallback summary method when the LLM is unavailable.
   * Extracts key sentences from the conversation without AI generation.
   * 
   * STRATEGY: Take the first and last sentence from each user message,
   * plus any messages containing personal names or emotional keywords.
   * This gives a rough but usable context.
   * 
   * @param {Array} messages - Messages to summarize
   * @returns {string} Extractive summary
   */
  createExtractiveSummary(messages) {
    const keyPhrases = [];
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        // Take user messages (most important for context)
        const content = msg.content.trim();
        if (content.length <= 100) {
          keyPhrases.push(`User said: "${content}"`);
        } else {
          // Take first sentence
          const firstSentence = content.split(/[.!?]/)[0];
          keyPhrases.push(`User said: "${firstSentence}..."`);
        }
      }
    }
    
    // Limit to 20 key phrases
    const limited = keyPhrases.slice(0, 20);
    
    return `[Extractive summary of ${messages.length} earlier messages]\n${limited.join('\n')}`;
  }

  /**
   * CLEAR CACHE FOR CONVERSATION
   * 
   * Removes cached summaries for a specific conversation.
   * Called when a conversation is deleted.
   * 
   * @param {string} conversationId - Conversation ID
   */
  clearCacheForConversation(conversationId) {
    for (const key of this.summaryCache.keys()) {
      if (key.startsWith(conversationId)) {
        this.summaryCache.delete(key);
      }
    }
  }
}

module.exports = ContextCompactionService;
