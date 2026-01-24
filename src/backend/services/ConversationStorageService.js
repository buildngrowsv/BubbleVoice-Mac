/**
 * CONVERSATION STORAGE SERVICE
 * 
 * Purpose:
 * Manages conversation file storage with 4-file structure:
 * 1. conversation.md - Full transcript (user + AI)
 * 2. user_inputs.md - USER INPUTS ONLY (no AI bias)
 * 3. conversation_ai_notes.md - Hidden AI notes (newest first)
 * 4. conversation_summary.md - AI-maintained summary
 * 
 * Why 4 files:
 * - User inputs isolated for vector search (reduces AI bias)
 * - AI notes separate for context (top 500 lines read)
 * - Summary for quick overview
 * - Full conversation for debugging/review
 * 
 * Key Innovation:
 * User input isolation enables dual-source vector search where user's
 * actual words are weighted higher than AI interpretations.
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * ConversationStorageService Class
 * 
 * Manages conversation file operations and database synchronization.
 */
class ConversationStorageService {
    /**
     * Constructor
     * 
     * @param {DatabaseService} databaseService - Database service instance
     * @param {string} conversationsDir - Path to conversations directory
     * 
     * Why we pass DatabaseService:
     * - Keeps database operations centralized
     * - Allows transaction management
     * - Makes testing easier
     */
    constructor(databaseService, conversationsDir) {
        this.db = databaseService;
        this.conversationsDir = conversationsDir;
        
        console.log(`[ConversationStorageService] Initialized with dir: ${conversationsDir}`);
    }

    /**
     * Create Conversation
     * 
     * Creates conversation folder and initializes 4 files.
     * 
     * @param {string} conversationId - Unique conversation ID
     * @param {string} title - Conversation title
     * @param {object} metadata - Additional metadata
     * @returns {object} Conversation info
     */
    async createConversation(conversationId, title = 'New Conversation', metadata = {}) {
        try {
            console.log(`[ConversationStorageService] Creating conversation: ${conversationId}`);
            
            // Create in database
            const dbConv = this.db.createConversation(conversationId, title, metadata);
            
            // Create conversation folder
            const convDir = path.join(this.conversationsDir, conversationId);
            await fs.mkdir(convDir, { recursive: true });
            
            // Create artifacts subfolder
            const artifactsDir = path.join(convDir, 'artifacts');
            await fs.mkdir(artifactsDir, { recursive: true });
            
            // Initialize 4 files
            await this.initializeConversationFiles(conversationId, title);
            
            console.log(`[ConversationStorageService] ✅ Created conversation: ${conversationId}`);
            
            return {
                id: conversationId,
                title: title,
                path: convDir,
                filesCreated: 4
            };
        } catch (error) {
            console.error('[ConversationStorageService] Failed to create conversation:', error);
            throw error;
        }
    }

    /**
     * Initialize Conversation Files
     * 
     * Creates the 4 initial files for a conversation.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} title - Conversation title
     */
    async initializeConversationFiles(conversationId, title) {
        const convDir = path.join(this.conversationsDir, conversationId);
        const timestamp = new Date().toISOString();
        
        // 1. Full conversation file
        const conversationContent = `# Full Conversation - ${conversationId}

**Title**: ${title}  
**Started**: ${timestamp}  
**Last Updated**: ${timestamp}  
**Total Turns**: 0

---

_Conversation will appear here as it progresses._

---
`;
        await fs.writeFile(
            path.join(convDir, 'conversation.md'),
            conversationContent,
            'utf-8'
        );
        
        // 2. User inputs only file (CRITICAL for vector search)
        const userInputsContent = `# User Inputs Only - ${conversationId}

**Started**: ${timestamp}  
**Last Updated**: ${timestamp}  
**Total Inputs**: 0

---

_This file contains ONLY the user's inputs, with no AI responses._  
_Used for vector search to reduce AI bias and find user's actual words._

---
`;
        await fs.writeFile(
            path.join(convDir, 'user_inputs.md'),
            userInputsContent,
            'utf-8'
        );
        
        // 3. AI notes file (newest first, top 500 lines read)
        const aiNotesContent = `# AI Notes (Hidden from User) - ${conversationId}

**Started**: ${timestamp}  
**Last Updated**: ${timestamp}

**Note**: Entries are added at TOP. Only top 500 lines are read into context.

---

_AI notes will appear here as the conversation progresses._

---
`;
        await fs.writeFile(
            path.join(convDir, 'conversation_ai_notes.md'),
            aiNotesContent,
            'utf-8'
        );
        
        // 4. Conversation summary file
        const summaryContent = `# Conversation Summary - ${conversationId}

**Last Updated**: ${timestamp}

## Key Topics

_Topics will be identified as conversation progresses._

## Emotional Arc

_Emotional progression will be tracked here._

## Areas Created/Updated

_Life areas touched in this conversation._

## Artifacts Generated

_Artifacts created during this conversation._

## Next Steps

_Action items or follow-ups._

---

_This summary is automatically maintained by BubbleVoice._
`;
        await fs.writeFile(
            path.join(convDir, 'conversation_summary.md'),
            summaryContent,
            'utf-8'
        );
        
        console.log(`[ConversationStorageService] Initialized 4 files for ${conversationId}`);
    }

    /**
     * Save Conversation Turn
     * 
     * Appends a turn (user input + AI response) to all 4 files.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} userInput - User's input
     * @param {string} aiResponse - AI's response
     * @param {string} aiNotes - AI's internal notes (optional)
     * @param {array} operations - Operations performed (optional)
     * @returns {object} Turn info
     * 
     * Why we save to 4 files:
     * - conversation.md: Full context for review
     * - user_inputs.md: Isolated for vector search
     * - conversation_ai_notes.md: Internal context (newest first)
     * - conversation_summary.md: Updated periodically
     */
    async saveConversationTurn(conversationId, userInput, aiResponse, aiNotes = null, operations = []) {
        try {
            const timestamp = new Date().toISOString();
            const turnNumber = await this.getTurnCount(conversationId) + 1;
            
            // Save to database
            this.db.addMessage(conversationId, 'user', userInput, { timestamp });
            this.db.addMessage(conversationId, 'assistant', aiResponse, { timestamp });
            
            // Append to conversation.md (full transcript)
            await this.appendToFullConversation(conversationId, turnNumber, userInput, aiResponse, operations, timestamp);
            
            // Append to user_inputs.md (user only)
            await this.appendUserInput(conversationId, turnNumber, userInput, timestamp);
            
            // Append to conversation_ai_notes.md (AI notes, newest first)
            if (aiNotes) {
                await this.appendAiNotes(conversationId, aiNotes, timestamp);
            }
            
            // Update conversation in database
            this.db.updateConversation(conversationId, {});
            
            console.log(`[ConversationStorageService] ✅ Saved turn ${turnNumber} for ${conversationId}`);
            
            return {
                conversationId: conversationId,
                turnNumber: turnNumber,
                timestamp: timestamp
            };
        } catch (error) {
            console.error('[ConversationStorageService] Failed to save turn:', error);
            throw error;
        }
    }

    /**
     * Append to Full Conversation
     * 
     * Adds turn to conversation.md with full context.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {number} turnNumber - Turn number
     * @param {string} userInput - User input
     * @param {string} aiResponse - AI response
     * @param {array} operations - Operations performed
     * @param {string} timestamp - ISO timestamp
     */
    async appendToFullConversation(conversationId, turnNumber, userInput, aiResponse, operations, timestamp) {
        const convPath = path.join(this.conversationsDir, conversationId, 'conversation.md');
        
        // Read existing content
        let content = await fs.readFile(convPath, 'utf-8');
        
        // Update metadata
        content = content.replace(
            /\*\*Last Updated\*\*: .*/,
            `**Last Updated**: ${timestamp}`
        );
        content = content.replace(
            /\*\*Total Turns\*\*: \d+/,
            `**Total Turns**: ${turnNumber}`
        );
        
        // Format turn
        const formattedTimestamp = timestamp.replace('T', ' ').split('.')[0];
        
        let turnContent = `

## Turn ${turnNumber} (${formattedTimestamp})

**User**: ${userInput}

**AI**: ${aiResponse}
`;
        
        // Add operations if any
        if (operations && operations.length > 0) {
            const opsStr = operations.map(op => {
                if (typeof op === 'string') return op;
                return `${op.action}: ${op.path || op.artifact_type || 'unknown'}`;
            }).join(', ');
            
            turnContent += `\n**Operations**: ${opsStr}\n`;
        }
        
        turnContent += '\n---\n';
        
        // Append to end (full conversation is chronological, not newest-first)
        content += turnContent;
        
        // Write back
        await fs.writeFile(convPath, content, 'utf-8');
    }

    /**
     * Append User Input
     * 
     * CRITICAL: Adds ONLY user input to user_inputs.md.
     * No AI responses, no operations, no interpretation.
     * This file is used for vector search to find user's actual words.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {number} turnNumber - Turn number
     * @param {string} userInput - User input
     * @param {string} timestamp - ISO timestamp
     */
    async appendUserInput(conversationId, turnNumber, userInput, timestamp) {
        const userInputsPath = path.join(this.conversationsDir, conversationId, 'user_inputs.md');
        
        // Read existing content
        let content = await fs.readFile(userInputsPath, 'utf-8');
        
        // Update metadata
        content = content.replace(
            /\*\*Last Updated\*\*: .*/,
            `**Last Updated**: ${timestamp}`
        );
        content = content.replace(
            /\*\*Total Inputs\*\*: \d+/,
            `**Total Inputs**: ${turnNumber}`
        );
        
        // Format input (ONLY user's words, nothing else)
        const formattedTimestamp = timestamp.replace('T', ' ').split('.')[0];
        
        const inputContent = `

## Turn ${turnNumber} (${formattedTimestamp})

${userInput}

---
`;
        
        // Append to end (chronological order for user inputs)
        content += inputContent;
        
        // Write back
        await fs.writeFile(userInputsPath, content, 'utf-8');
    }

    /**
     * Append AI Notes
     * 
     * CRITICAL: Adds notes at TOP (newest first), not bottom.
     * Only top 500 lines are read for context, so newest must be first.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {string} notes - AI notes (1-2 sentences)
     * @param {string} timestamp - ISO timestamp
     */
    async appendAiNotes(conversationId, notes, timestamp) {
        const aiNotesPath = path.join(this.conversationsDir, conversationId, 'conversation_ai_notes.md');
        
        // Read existing content
        let content = await fs.readFile(aiNotesPath, 'utf-8');
        
        // Update metadata
        content = content.replace(
            /\*\*Last Updated\*\*: .*/,
            `**Last Updated**: ${timestamp}`
        );
        
        // Find insertion point (after the "---" following the header)
        const firstSeparator = content.indexOf('---');
        const secondSeparator = content.indexOf('---', firstSeparator + 3);
        
        if (secondSeparator === -1) {
            throw new Error('AI notes file format invalid');
        }
        
        // Format notes (newest first)
        const formattedTimestamp = timestamp.replace('T', ' ').split('.')[0];
        
        const noteContent = `

## ${formattedTimestamp}

${notes}

---
`;
        
        // Insert at TOP (after second separator)
        const insertPoint = secondSeparator + 3; // After "---"
        content = content.slice(0, insertPoint) + noteContent + content.slice(insertPoint);
        
        // Write back
        await fs.writeFile(aiNotesPath, content, 'utf-8');
    }

    /**
     * Update Conversation Summary
     * 
     * Updates the conversation_summary.md file with new information.
     * 
     * @param {string} conversationId - Conversation ID
     * @param {object} updates - Sections to update
     * @returns {boolean} Success
     * 
     * Updates can include:
     * - key_topics: Array of topics
     * - emotional_arc: Description of emotional progression
     * - areas_updated: Array of area paths
     * - artifacts: Array of artifact IDs
     * - next_steps: Array of action items
     */
    async updateConversationSummary(conversationId, updates) {
        try {
            const summaryPath = path.join(this.conversationsDir, conversationId, 'conversation_summary.md');
            let content = await fs.readFile(summaryPath, 'utf-8');
            
            // Update timestamp
            const timestamp = new Date().toISOString();
            content = content.replace(
                /\*\*Last Updated\*\*: .*/,
                `**Last Updated**: ${timestamp}`
            );
            
            // Update Key Topics
            if (updates.key_topics && updates.key_topics.length > 0) {
                const topicsText = updates.key_topics.map(t => `- ${t}`).join('\n');
                content = content.replace(
                    /(## Key Topics\n\n)([\s\S]*?)(\n\n##)/,
                    `$1${topicsText}$3`
                );
            }
            
            // Update Emotional Arc
            if (updates.emotional_arc) {
                content = content.replace(
                    /(## Emotional Arc\n\n)([\s\S]*?)(\n\n##)/,
                    `$1${updates.emotional_arc}$3`
                );
            }
            
            // Update Areas
            if (updates.areas_updated && updates.areas_updated.length > 0) {
                const areasText = updates.areas_updated.map(a => `- ${a}`).join('\n');
                content = content.replace(
                    /(## Areas Created\/Updated\n\n)([\s\S]*?)(\n\n##)/,
                    `$1${areasText}$3`
                );
            }
            
            // Update Artifacts
            if (updates.artifacts && updates.artifacts.length > 0) {
                const artifactsText = updates.artifacts.map(a => `- ${a}`).join('\n');
                content = content.replace(
                    /(## Artifacts Generated\n\n)([\s\S]*?)(\n\n##)/,
                    `$1${artifactsText}$3`
                );
            }
            
            // Update Next Steps
            if (updates.next_steps && updates.next_steps.length > 0) {
                const stepsText = updates.next_steps.map(s => `- ${s}`).join('\n');
                content = content.replace(
                    /(## Next Steps\n\n)([\s\S]*?)(\n\n---)/,
                    `$1${stepsText}$3`
                );
            }
            
            // Write back
            await fs.writeFile(summaryPath, content, 'utf-8');
            
            console.log(`[ConversationStorageService] ✅ Updated summary for ${conversationId}`);
            return true;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to update summary:', error);
            throw error;
        }
    }

    /**
     * Get Full Conversation
     * 
     * Reads the full conversation.md file.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {string} Full conversation content
     */
    async getFullConversation(conversationId) {
        try {
            const convPath = path.join(this.conversationsDir, conversationId, 'conversation.md');
            const content = await fs.readFile(convPath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get full conversation:', error);
            return null;
        }
    }

    /**
     * Get User Inputs Only
     * 
     * Reads the user_inputs.md file.
     * CRITICAL for vector search - contains only user's words.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {string} User inputs content
     */
    async getUserInputsOnly(conversationId) {
        try {
            const userInputsPath = path.join(this.conversationsDir, conversationId, 'user_inputs.md');
            const content = await fs.readFile(userInputsPath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get user inputs:', error);
            return null;
        }
    }

    /**
     * Get AI Notes
     * 
     * Reads the conversation_ai_notes.md file (top N lines).
     * 
     * @param {string} conversationId - Conversation ID
     * @param {number} maxLines - Max lines to read (default: 500)
     * @returns {string} AI notes content (top N lines)
     */
    async getAiNotes(conversationId, maxLines = 500) {
        try {
            const aiNotesPath = path.join(this.conversationsDir, conversationId, 'conversation_ai_notes.md');
            const content = await fs.readFile(aiNotesPath, 'utf-8');
            
            // Return top N lines only
            const lines = content.split('\n');
            const topLines = lines.slice(0, maxLines);
            
            return topLines.join('\n');
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get AI notes:', error);
            return null;
        }
    }

    /**
     * Get Summary
     * 
     * Reads the conversation_summary.md file.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {string} Summary content
     */
    async getSummary(conversationId) {
        try {
            const summaryPath = path.join(this.conversationsDir, conversationId, 'conversation_summary.md');
            const content = await fs.readFile(summaryPath, 'utf-8');
            return content;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get summary:', error);
            return null;
        }
    }

    /**
     * Get All User Inputs
     * 
     * Extracts all user inputs from user_inputs.md as array.
     * Useful for vector search and context assembly.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {array} Array of user inputs with metadata
     */
    async getAllUserInputs(conversationId) {
        try {
            const content = await this.getUserInputsOnly(conversationId);
            if (!content) return [];
            
            const inputs = [];
            const turnRegex = /## Turn (\d+) \((.*?)\)\n\n([\s\S]*?)(?=\n---|\n##|$)/g;
            
            let match;
            while ((match = turnRegex.exec(content)) !== null) {
                inputs.push({
                    turnNumber: parseInt(match[1]),
                    timestamp: match[2],
                    content: match[3].trim()
                });
            }
            
            return inputs;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get all user inputs:', error);
            return [];
        }
    }

    /**
     * Get Turn Count
     * 
     * Returns the number of turns in a conversation.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {number} Turn count
     */
    async getTurnCount(conversationId) {
        try {
            const count = this.db.getMessageCount(conversationId);
            // Divide by 2 since each turn has user + assistant message
            return Math.floor(count / 2);
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get turn count:', error);
            return 0;
        }
    }

    /**
     * Delete Conversation
     * 
     * Deletes conversation folder and database records.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {boolean} Success
     */
    async deleteConversation(conversationId) {
        try {
            // Delete from database (cascade deletes messages)
            this.db.deleteConversation(conversationId);
            
            // Delete folder
            const convDir = path.join(this.conversationsDir, conversationId);
            await fs.rm(convDir, { recursive: true, force: true });
            
            console.log(`[ConversationStorageService] ✅ Deleted conversation: ${conversationId}`);
            return true;
        } catch (error) {
            console.error('[ConversationStorageService] Failed to delete conversation:', error);
            throw error;
        }
    }

    /**
     * Get Conversation
     * 
     * Gets conversation from database with all files.
     * 
     * @param {string} conversationId - Conversation ID
     * @returns {object} Conversation data
     */
    async getConversation(conversationId) {
        try {
            const dbConv = this.db.getConversation(conversationId);
            if (!dbConv) return null;
            
            const convDir = path.join(this.conversationsDir, conversationId);
            
            return {
                ...dbConv,
                path: convDir,
                fullConversation: await this.getFullConversation(conversationId),
                userInputs: await this.getUserInputsOnly(conversationId),
                aiNotes: await this.getAiNotes(conversationId),
                summary: await this.getSummary(conversationId)
            };
        } catch (error) {
            console.error('[ConversationStorageService] Failed to get conversation:', error);
            return null;
        }
    }
}

module.exports = ConversationStorageService;
