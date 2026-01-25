/**
 * CONTEXT ASSEMBLY SERVICE
 * 
 * Purpose:
 * Assembles context for LLM prompts using multi-query vector search strategy.
 * Implements the 3-query approach: recent user, all user, full conversation.
 * 
 * Multi-Query Strategy:
 * 1. Query 1: Last 2 user inputs (weight 3.0x) - Immediate intent
 * 2. Query 2: All user inputs (weight 1.5x) - Broader context
 * 3. Query 3: Full conversation with AI (weight 0.5x) - Repetition prevention
 * 
 * Why 3 queries:
 * - Recent context is most important (user's immediate needs)
 * - Full user history prevents missing topics
 * - AI responses help catch when AI is going off-course
 * 
 * Token Budget Management:
 * - Total budget: ~10,000 tokens per turn
 * - Dynamic allocation based on what's available
 * - Priority system for critical sections
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

/**
 * ContextAssemblyService Class
 * 
 * Manages context assembly for LLM prompts with multi-query vector search.
 */
class ContextAssemblyService {
    /**
     * Constructor
     * 
     * @param {VectorStoreService} vectorStoreService - Vector store instance
     * @param {AreaManagerService} areaManagerService - Area manager instance
     * @param {ConversationStorageService} conversationStorageService - Conversation storage instance
     * @param {PromptManagementService} promptService - Prompt management service (optional)
     * 
     * Why we pass all services:
     * - Need vector search for semantic matching
     * - Need area manager for life areas tree
     * - Need conversation storage for history
     * 
     * UPDATED 2026-01-24:
     * - Added promptService parameter for customizable config
     * - Token budgets and query weights now come from PromptManagementService
     */
    constructor(vectorStoreService, areaManagerService, conversationStorageService, promptService = null) {
        this.vectorStore = vectorStoreService;
        this.areaManager = areaManagerService;
        this.convStorage = conversationStorageService;
        this.promptService = promptService;
        
        // Get config from PromptManagementService if available
        const config = promptService ? promptService.getContextAssemblyConfig() : null;
        
        // Token budgets (can be customized via admin panel)
        this.tokenBudgets = config?.tokenBudgets || {
            systemInstruction: 1300,
            aiNotes: 1500,
            knowledgeTree: 300,
            vectorMatchedEntries: 500,
            vectorMatchedSummaries: 500,
            vectorMatchedChunks: 1000,
            conversationHistory: 2000,
            total: 10000
        };
        
        // Multi-query weights (can be customized via admin panel)
        this.multiQueryWeights = config?.multiQueryWeights || {
            recentUserInputs: 3.0,
            allUserInputs: 1.5,
            fullConversation: 0.5
        };
        
        // Multi-query counts (can be customized via admin panel)
        this.multiQueryCounts = config?.multiQueryCounts || {
            recentUserInputsCount: 2,
            recentUserInputsTopK: 10,
            allUserInputsTopK: 10,
            fullConversationTopK: 5,
            finalTopK: 10
        };
        
        // Boost values (can be customized via admin panel)
        this.boosts = config?.boosts || {
            recencyBoostPerDay: 0.05,
            areaBoost: 1.5
        };
        
        console.log('[ContextAssemblyService] Initialized');
        console.log(`  Using ${promptService ? 'custom' : 'default'} configuration`);
    }

    /**
     * Assemble Context for Turn
     * 
     * Assembles complete context for an LLM prompt turn.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {Array<object>} messages - Conversation messages so far
     * @param {string} currentAreaPath - Current area path (optional)
     * @returns {object} Assembled context
     */
    async assembleContext(conversationId, messages, currentAreaPath = null) {
        try {
            console.log(`[ContextAssemblyService] Assembling context for ${conversationId}`);
            
            const context = {};
            
            // 1. AI Notes (top 500 lines, newest first)
            context.aiNotes = await this.convStorage.getAiNotes(conversationId, 500);
            
            // 2. Knowledge Tree (life areas structure)
            context.knowledgeTree = await this.areaManager.generateAreasTree();
            
            // 3. Multi-Query Vector Search
            const vectorResults = await this.runMultiQuerySearch(messages, currentAreaPath);
            context.vectorResults = vectorResults;
            
            // 4. Conversation History (last 10-20 turns)
            context.conversationHistory = await this.getConversationHistory(conversationId, 20);
            
            console.log('[ContextAssemblyService] ✅ Context assembled');
            
            return context;
        } catch (error) {
            console.error('[ContextAssemblyService] Failed to assemble context:', error);
            throw error;
        }
    }

    /**
     * Run Multi-Query Search
     * 
     * Implements 3-query strategy with different weights.
     * 
     * @param {Array<object>} messages - Conversation messages
     * @param {string} currentAreaPath - Current area path
     * @returns {object} Vector search results
     * 
     * Query Strategy:
     * - Query 1: Last 2 user inputs (weight 3.0x)
     * - Query 2: All user inputs (weight 1.5x)
     * - Query 3: Full conversation (weight 0.5x)
     */
    async runMultiQuerySearch(messages, currentAreaPath = null) {
        try {
            const startTime = Date.now();
            
            // Extract queries (using configurable counts)
            const recentUserQuery = this.getRecentUserInputs(messages, this.multiQueryCounts.recentUserInputsCount);
            const allUserQuery = this.getAllUserInputs(messages);
            const fullConvQuery = this.getFullConversation(messages);
            
            console.log(`[ContextAssemblyService] Running 3-query search...`);
            console.log(`  Query 1 (recent): ${recentUserQuery.slice(0, 50)}...`);
            console.log(`  Query 2 (all user): ${allUserQuery.slice(0, 50)}...`);
            console.log(`  Query 3 (full): ${fullConvQuery.slice(0, 50)}...`);
            
            // Generate embeddings for all queries
            const queryEmbeddings = await this.vectorStore.embeddingService.generateBatchEmbeddings([
                recentUserQuery,
                allUserQuery,
                fullConvQuery
            ]);
            
            // Run searches in parallel with configurable top K values
            const [results1, results2, results3] = await Promise.all([
                this.vectorStore.vectorSearch(queryEmbeddings[0], this.multiQueryCounts.recentUserInputsTopK),
                this.vectorStore.vectorSearch(queryEmbeddings[1], this.multiQueryCounts.allUserInputsTopK),
                this.vectorStore.vectorSearch(queryEmbeddings[2], this.multiQueryCounts.fullConversationTopK)
            ]);
            
            // Apply configurable weights
            const weighted1 = results1.map(r => ({ ...r, score: r.score * this.multiQueryWeights.recentUserInputs, source: 'recent_user' }));
            const weighted2 = results2.map(r => ({ ...r, score: r.score * this.multiQueryWeights.allUserInputs, source: 'all_user' }));
            const weighted3 = results3.map(r => ({ ...r, score: r.score * this.multiQueryWeights.fullConversation, source: 'full_conv' }));
            
            // Merge and deduplicate (keep highest score per chunk)
            const merged = this.deduplicateResults([...weighted1, ...weighted2, ...weighted3]);
            
            // Apply configurable recency boost
            const recencyBoosted = this.vectorStore.applyRecencyBoost(merged, this.boosts.recencyBoostPerDay);
            
            // Apply configurable area boost if current area provided
            let final = recencyBoosted;
            if (currentAreaPath) {
                final = this.vectorStore.applyAreaBoost(recencyBoosted, currentAreaPath, this.boosts.areaBoost);
            }
            
            // Sort by final score
            final.sort((a, b) => (b.final_score || b.boosted_score || b.score) - (a.final_score || a.boosted_score || a.score));
            
            const duration = Date.now() - startTime;
            console.log(`[ContextAssemblyService] ✅ Multi-query search complete in ${duration}ms`);
            console.log(`  Total unique results: ${final.length}`);
            
            return {
                results: final.slice(0, this.multiQueryCounts.finalTopK),
                totalResults: final.length,
                searchTime: duration
            };
        } catch (error) {
            console.error('[ContextAssemblyService] Multi-query search failed:', error);
            throw error;
        }
    }

    /**
     * Get Recent User Inputs
     * 
     * Extracts last N user inputs from messages.
     * 
     * @param {Array<object>} messages - Conversation messages
     * @param {number} count - Number of recent inputs
     * @returns {string} Combined user inputs
     */
    getRecentUserInputs(messages, count = 2) {
        const userMessages = messages.filter(m => m.role === 'user');
        const recent = userMessages.slice(-count);
        return recent.map(m => m.content).join('\n\n');
    }

    /**
     * Get All User Inputs
     * 
     * Extracts all user inputs from messages.
     * 
     * @param {Array<object>} messages - Conversation messages
     * @returns {string} Combined user inputs
     */
    getAllUserInputs(messages) {
        const userMessages = messages.filter(m => m.role === 'user');
        return userMessages.map(m => m.content).join('\n\n');
    }

    /**
     * Get Full Conversation
     * 
     * Extracts all messages (user + AI) from messages.
     * 
     * @param {Array<object>} messages - Conversation messages
     * @returns {string} Full conversation text
     */
    getFullConversation(messages) {
        return messages.map(m => m.content).join('\n\n');
    }

    /**
     * Deduplicate Results
     * 
     * Removes duplicate chunks, keeping the one with highest score.
     * 
     * @param {Array<object>} results - Search results
     * @returns {Array<object>} Deduplicated results
     */
    deduplicateResults(results) {
        const map = new Map();
        
        results.forEach(result => {
            const existing = map.get(result.chunk_id);
            
            if (!existing || result.score > existing.score) {
                map.set(result.chunk_id, result);
            }
        });
        
        return Array.from(map.values());
    }

    /**
     * Get Conversation History
     * 
     * Gets last N turns from conversation for context.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {number} maxTurns - Max turns to include
     * @returns {string} Formatted conversation history
     */
    async getConversationHistory(conversationId, maxTurns = 20) {
        try {
            // Get messages from database
            const messages = this.convStorage.db.getMessages(conversationId, maxTurns * 2); // *2 for user+AI
            
            if (messages.length === 0) {
                return 'CONVERSATION HISTORY: None yet (new conversation)';
            }
            
            let history = 'CONVERSATION HISTORY:\n\n';
            
            // Group messages into turns
            for (let i = 0; i < messages.length; i += 2) {
                const userMsg = messages[i];
                const aiMsg = messages[i + 1];
                
                if (!userMsg || !aiMsg) break;
                
                const turnNum = Math.floor(i / 2) + 1;
                const timestamp = new Date(userMsg.timestamp).toISOString().replace('T', ' ').split('.')[0];
                
                history += `Turn ${turnNum} (${timestamp}):\n`;
                history += `  User: ${userMsg.content.slice(0, 100)}${userMsg.content.length > 100 ? '...' : ''}\n`;
                history += `  AI: ${aiMsg.content.slice(0, 100)}${aiMsg.content.length > 100 ? '...' : ''}\n`;
                history += '\n';
            }
            
            return history;
        } catch (error) {
            console.error('[ContextAssemblyService] Failed to get conversation history:', error);
            return 'CONVERSATION HISTORY: Error loading history';
        }
    }

    /**
     * Format Context for Prompt
     * 
     * Formats assembled context into prompt-ready text.
     * 
     * @param {object} context - Assembled context
     * @returns {string} Formatted prompt context
     */
    formatContextForPrompt(context) {
        let prompt = '';
        
        // AI Notes (if available)
        if (context.aiNotes) {
            prompt += '=== AI NOTES (Internal Context) ===\n\n';
            prompt += context.aiNotes;
            prompt += '\n\n';
        }
        
        // Knowledge Tree
        if (context.knowledgeTree) {
            prompt += context.knowledgeTree;
            prompt += '\n\n';
        }
        
        // Vector Search Results
        if (context.vectorResults && context.vectorResults.results) {
            prompt += '=== RELEVANT CONTEXT (Vector Search) ===\n\n';
            
            context.vectorResults.results.forEach((result, i) => {
                prompt += `[${i + 1}] ${result.area_path}/${result.document}\n`;
                prompt += `    Timestamp: ${result.timestamp}\n`;
                prompt += `    Sentiment: ${result.sentiment}\n`;
                prompt += `    "${result.content.slice(0, 150)}${result.content.length > 150 ? '...' : ''}"\n`;
                
                if (result.user_quote) {
                    prompt += `    User: "${result.user_quote}"\n`;
                }
                
                prompt += '\n';
            });
        }
        
        // Conversation History
        if (context.conversationHistory) {
            prompt += context.conversationHistory;
            prompt += '\n\n';
        }
        
        return prompt;
    }

    /**
     * Estimate Token Count
     * 
     * Rough estimate of token count (4 chars per token).
     * 
     * @param {string} text - Text to estimate
     * @returns {number} Estimated token count
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }
}

module.exports = ContextAssemblyService;
