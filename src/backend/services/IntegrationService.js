/**
 * INTEGRATION SERVICE
 * 
 * Purpose:
 * Integrates all data management services with the LLM conversation flow.
 * Processes structured outputs from LLM and executes area/artifact actions.
 * 
 * Responsibilities:
 * - Execute area_actions from LLM response
 * - Execute artifact_action from LLM response
 * - Assemble context for LLM prompts
 * - Manage embeddings for new entries
 * - Coordinate between all services
 * 
 * Flow:
 * 1. User sends message
 * 2. Assemble context (vector search, areas, history)
 * 3. Send to LLM with context
 * 4. Process LLM response (area_actions, artifact_action)
 * 5. Execute actions (create areas, save artifacts, generate embeddings)
 * 6. Return response to user
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const path = require('path');

/**
 * IntegrationService Class
 * 
 * Coordinates all data management services with LLM conversation flow.
 */
class IntegrationService {
    /**
     * Constructor
     * 
     * @param {string} userDataDir - Path to user_data directory
     */
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
        
        // Import services
        const DatabaseService = require('./DatabaseService');
        const AreaManagerService = require('./AreaManagerService');
        const ConversationStorageService = require('./ConversationStorageService');
        const ArtifactManagerService = require('./ArtifactManagerService');
        const EmbeddingService = require('./EmbeddingService');
        const VectorStoreService = require('./VectorStoreService');
        const ContextAssemblyService = require('./ContextAssemblyService');
        
        // Initialize database
        const dbPath = path.join(userDataDir, 'bubblevoice.db');
        this.db = new DatabaseService(dbPath);
        this.db.initialize();
        
        // Initialize services
        const conversationsDir = path.join(userDataDir, 'conversations');
        
        this.areaManager = new AreaManagerService(this.db, userDataDir);
        this.convStorage = new ConversationStorageService(this.db, conversationsDir);
        this.artifactManager = new ArtifactManagerService(this.db, conversationsDir);
        this.embeddingService = new EmbeddingService();
        this.vectorStore = new VectorStoreService(this.db, this.embeddingService);
        this.contextAssembly = new ContextAssemblyService(
            this.vectorStore,
            this.areaManager,
            this.convStorage
        );
        
        // Initialize async components
        this.initializeAsync();
        
        console.log('[IntegrationService] Initialized');
    }

    /**
     * Initialize Async
     * 
     * Initializes components that require async setup.
     */
    async initializeAsync() {
        try {
            await this.areaManager.initializeLifeAreas();
            await this.vectorStore.initialize();
            await this.embeddingService.initialize();
            
            console.log('[IntegrationService] ✅ Async initialization complete');
        } catch (error) {
            console.error('[IntegrationService] Async initialization failed:', error);
        }
    }

    /**
     * Process Turn
     * 
     * Processes a complete conversation turn with context assembly and action execution.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} userInput - User's input
     * @param {string} aiResponse - AI's response
     * @param {object} structuredOutput - Structured output from LLM
     * @returns {Promise<object>} Processing result
     */
    async processTurn(conversationId, userInput, aiResponse, structuredOutput) {
        try {
            console.log(`[IntegrationService] Processing turn for ${conversationId}`);
            
            const result = {
                areasCreated: [],
                entriesAppended: [],
                artifactsSaved: [],
                embeddingsGenerated: 0
            };
            
            // Extract structured output
            const areaActions = structuredOutput.area_actions || [];
            const artifactAction = structuredOutput.artifact_action || { action: 'none' };
            
            // Execute area actions
            for (const action of areaActions) {
                const actionResult = await this.executeAreaAction(action, conversationId);
                
                if (actionResult.type === 'area_created') {
                    result.areasCreated.push(actionResult.areaPath);
                } else if (actionResult.type === 'entry_appended') {
                    result.entriesAppended.push(actionResult.entryId);
                    
                    // Generate and store embedding for entry
                    // Use the same fallback logic as entry creation
                    const embeddingText = action.content || 
                                        action.user_quote || 
                                        action.ai_observation ||
                                        'Entry added to area';
                    
                    const embedding = await this.embeddingService.generateEmbedding(embeddingText);
                    await this.vectorStore.storeEmbedding(
                        actionResult.entryId,
                        embedding,
                        {
                            area_path: action.area_path,
                            document: action.document,
                            timestamp: new Date().toISOString(),
                            entry_type: 'time_ordered_log',
                            sentiment: action.sentiment,
                            content: embeddingText,
                            user_quote: action.user_quote,
                            ai_observation: action.ai_observation
                        }
                    );
                    
                    result.embeddingsGenerated++;
                }
            }
            
            // Execute artifact action
            if (artifactAction.action === 'create' || artifactAction.action === 'update') {
                const artifactResult = await this.artifactManager.saveArtifact(
                    conversationId,
                    artifactAction,
                    null // turn number will be calculated
                );
                
                if (artifactResult) {
                    result.artifactsSaved.push(artifactResult.artifact_id);
                }
            }
            
            // Save conversation turn to 4-file structure
            const aiNotes = this.generateAiNotes(areaActions, artifactAction);
            const operations = this.formatOperations(areaActions, artifactAction);
            
            await this.convStorage.saveConversationTurn(
                conversationId,
                userInput,
                aiResponse,
                aiNotes,
                operations
            );
            
            // Update conversation summary periodically (every 5 turns)
            const turnCount = await this.convStorage.getTurnCount(conversationId);
            if (turnCount % 5 === 0) {
                await this.updateConversationSummary(conversationId);
            }
            
            console.log('[IntegrationService] ✅ Turn processed');
            console.log(`  Areas created: ${result.areasCreated.length}`);
            console.log(`  Entries appended: ${result.entriesAppended.length}`);
            console.log(`  Artifacts saved: ${result.artifactsSaved.length}`);
            console.log(`  Embeddings generated: ${result.embeddingsGenerated}`);
            
            return result;
        } catch (error) {
            console.error('[IntegrationService] Failed to process turn:', error);
            throw error;
        }
    }

    /**
     * Execute Area Action
     * 
     * Executes a single area action (create_area, append_entry, update_summary).
     * 
     * @param {object} action - Area action from LLM
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<object>} Action result
     */
    async executeAreaAction(action, conversationId) {
        try {
            switch (action.action) {
                case 'create_area':
                    const area = await this.areaManager.createArea(
                        action.area_path,
                        action.name || action.area_path.split('/').pop(),
                        action.description || '',
                        action.initial_documents || []
                    );
                    
                    return {
                        type: 'area_created',
                        areaPath: action.area_path
                    };
                
                case 'append_entry':
                    // Ensure content exists (fallback to user_quote or generic message)
                    const entryContent = action.content || 
                                       action.user_quote || 
                                       action.ai_observation ||
                                       'Entry added to area';
                    
                    const entry = await this.areaManager.appendEntry(
                        action.area_path,
                        action.document,
                        {
                            timestamp: new Date().toISOString(),
                            conversation_context: action.conversation_context || 'General discussion',
                            content: entryContent,
                            user_quote: action.user_quote || null,
                            ai_observation: action.ai_observation || null,
                            sentiment: action.sentiment || 'neutral',
                            conversation_id: conversationId
                        }
                    );
                    
                    return {
                        type: 'entry_appended',
                        entryId: entry.entryId,
                        areaPath: action.area_path,
                        document: action.document
                    };
                
                case 'update_summary':
                    await this.areaManager.updateAreaSummary(
                        action.area_path,
                        action.updates || {}
                    );
                    
                    return {
                        type: 'summary_updated',
                        areaPath: action.area_path
                    };
                
                default:
                    console.warn(`[IntegrationService] Unknown area action: ${action.action}`);
                    return { type: 'unknown' };
            }
        } catch (error) {
            console.error('[IntegrationService] Failed to execute area action:', error);
            throw error;
        }
    }

    /**
     * Generate AI Notes
     * 
     * Generates AI notes from actions for conversation_ai_notes.md.
     * 
     * @param {Array} areaActions - Area actions
     * @param {object} artifactAction - Artifact action
     * @returns {string} AI notes
     */
    generateAiNotes(areaActions, artifactAction) {
        const notes = [];
        
        // Area actions
        areaActions.forEach(action => {
            if (action.action === 'create_area') {
                notes.push(`Created area: ${action.area_path}`);
            } else if (action.action === 'append_entry') {
                notes.push(`Entry: ${action.area_path}/${action.document}`);
                if (action.ai_observation) {
                    notes.push(`  ${action.ai_observation}`);
                }
            }
        });
        
        // Artifact action
        if (artifactAction.action === 'create') {
            notes.push(`Generated artifact: ${artifactAction.artifact_type}`);
        }
        
        return notes.join('\n');
    }

    /**
     * Format Operations
     * 
     * Formats operations for conversation.md.
     * 
     * @param {Array} areaActions - Area actions
     * @param {object} artifactAction - Artifact action
     * @returns {Array<string>} Operations list
     */
    formatOperations(areaActions, artifactAction) {
        const operations = [];
        
        areaActions.forEach(action => {
            if (action.action === 'create_area') {
                operations.push(`create_area: ${action.area_path}`);
            } else if (action.action === 'append_entry') {
                operations.push(`append_entry: ${action.area_path}/${action.document}`);
            }
        });
        
        if (artifactAction.action === 'create') {
            operations.push(`create_artifact: ${artifactAction.artifact_type}`);
        }
        
        return operations;
    }

    /**
     * Update Conversation Summary
     * 
     * Updates the conversation_summary.md file.
     * 
     * @param {string} conversationId - Conversation ID
     */
    async updateConversationSummary(conversationId) {
        try {
            // Get recent entries to identify topics and areas
            const recentEntries = this.db.getRecentEntries(20);
            const conversationEntries = recentEntries.filter(e => e.conversation_id === conversationId);
            
            // Extract unique areas
            const areas = [...new Set(conversationEntries.map(e => e.area_path))];
            
            // Get artifacts
            const artifacts = this.db.getArtifactsByConversation(conversationId);
            
            // Update summary
            await this.convStorage.updateConversationSummary(conversationId, {
                areas_updated: areas,
                artifacts: artifacts.map(a => `${a.artifact_type} (${a.id})`)
            });
            
            console.log(`[IntegrationService] Updated summary for ${conversationId}`);
        } catch (error) {
            console.error('[IntegrationService] Failed to update summary:', error);
        }
    }

    /**
     * Get Context for Turn
     * 
     * Assembles context for LLM prompt.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {Array} messages - Conversation messages
     * @param {string} currentAreaPath - Current area path
     * @returns {Promise<object>} Assembled context
     */
    async getContextForTurn(conversationId, messages, currentAreaPath = null) {
        return await this.contextAssembly.assembleContext(
            conversationId,
            messages,
            currentAreaPath
        );
    }

    /**
     * Format Context for Prompt
     * 
     * Formats assembled context into prompt text.
     * 
     * @param {object} context - Assembled context
     * @returns {string} Formatted prompt
     */
    formatContextForPrompt(context) {
        return this.contextAssembly.formatContextForPrompt(context);
    }
}

module.exports = IntegrationService;
