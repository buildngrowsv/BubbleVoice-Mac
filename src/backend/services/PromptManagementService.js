/**
 * PROMPT MANAGEMENT SERVICE
 * 
 * **Purpose**: Centralized management of all system prompts with customization support
 * 
 * **Why This Exists**:
 * - All prompts were hardcoded in LLMService
 * - Users couldn't customize AI behavior
 * - No way to A/B test different prompts
 * - No version control for prompt changes
 * 
 * **What It Does**:
 * 1. Stores default prompts (from code)
 * 2. Loads custom prompts (from user_data/config/)
 * 3. Provides variable substitution
 * 4. Tracks prompt versions
 * 5. Allows reset to defaults
 * 
 * **Architecture**:
 * - Default prompts: Loaded from this file (source of truth)
 * - Custom prompts: Stored in user_data/config/prompts.json
 * - Active prompt: Custom if exists, otherwise default
 * 
 * **Integration**:
 * - LLMService calls getSystemPrompt() instead of buildSystemPrompt()
 * - Admin UI calls updateSection() to modify prompts
 * - Changes are persisted immediately
 * 
 * **Created**: 2026-01-24
 * **Last Modified**: 2026-01-24
 */

const fs = require('fs');
const path = require('path');

class PromptManagementService {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the prompt management service with default and custom prompts.
     * 
     * @param {string} userDataDir - Path to user_data directory
     * 
     * **Technical**: Creates config directory if it doesn't exist
     * **Why**: User data dir is passed from server.js, ensures consistent storage
     * **Product**: All user customizations are stored in their user_data folder
     */
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
        this.configDir = path.join(userDataDir, 'config');
        this.promptsPath = path.join(this.configDir, 'prompts.json');
        
        // Ensure config directory exists
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
            console.log('[PromptManagementService] Created config directory');
        }
        
        // Load default prompts (hardcoded source of truth)
        this.defaultPrompts = this.loadDefaultPrompts();
        
        // Load custom prompts (user modifications)
        this.customPrompts = this.loadCustomPrompts();
        
        console.log('[PromptManagementService] Initialized');
        console.log(`  Custom prompts: ${Object.keys(this.customPrompts).length > 0 ? 'YES' : 'NO'}`);
    }
    
    /**
     * LOAD DEFAULT PROMPTS
     * 
     * Returns the default system prompt structure.
     * This is the source of truth for what the prompt should be.
     * 
     * **Technical**: Returns a structured object with all prompt sections
     * **Why**: Keeping defaults in code ensures they're version-controlled
     * **Product**: Users can always reset to defaults if they mess up
     * **History**: Extracted from LLMService.buildSystemPrompt() on 2026-01-24
     */
    loadDefaultPrompts() {
        return {
            system: {
                purpose: `You are BubbleVoice, a personal AI companion designed to help people think through their lives.

**Your Purpose:**
You help users process their thoughts about personal life topics: family, relationships, personal growth, goals, struggles, and life decisions. You're not a productivity tool or task manager - you're a thinking partner for life.`,

                approach: `**Your Approach:**
- Be empathetic and understanding, not prescriptive
- Ask thoughtful follow-up questions to help users explore their thoughts
- Remember and reference past conversations (context will be provided)
- Help users see patterns they might not notice themselves
- Validate feelings while gently challenging assumptions when helpful
- Be conversational and natural, not formal or robotic`,

                lifeAreas: `**Life Areas System:**
You have access to a hierarchical memory system called "Life Areas" where you can store and retrieve information about the user's life. When the user discusses a topic, you should:

1. **Create areas** when a new topic emerges (e.g., Family/Emma_School when discussing Emma's reading)
2. **Append entries** to existing areas to track ongoing situations
3. **Update summaries** to maintain high-level understanding

Areas are organized hierarchically:
- Family → Emma_School → reading_comprehension.md
- Work → Startup → fundraising.md
- Personal → Health → exercise_goals.md`,

                responseFormat: `**CRITICAL: Response Format**
You MUST respond with ONLY valid JSON. No other text before or after. Your response must be in this exact JSON format:

{
  "response": "Your empathetic, conversational response",
  "bubbles": ["short prompt 1", "short prompt 2", "short prompt 3"],
  "area_actions": [
    {
      "action": "create_area" or "append_entry",
      "area_path": "Family/Emma_School",
      "name": "Emma's School",
      "description": "Brief description",
      "document": "reading_comprehension.md",
      "content": "Summary of what user shared",
      "sentiment": "concerned"
    }
  ],
  "artifact_action": {
    "action": "none" or "create",
    "artifact_type": "visualization" or "exercise" etc,
    "html": "Full HTML with inline CSS"
  }
}`,

                areaActionsGuidelines: `**Area Actions Guidelines:**
- Create areas when user mentions a new topic (kids, work projects, health goals)
- Append entries when user provides updates or new information
- For append_entry: MUST include "content" field with summary of what user shared
- Include direct quotes from user in "user_quote" (helps with vector search)
- Add your observations in "ai_observation" (helps with future context)
- Tag sentiment: hopeful, concerned, anxious, excited, neutral`,

                artifactGuidelines: `**Artifact Guidelines:**
- Create artifacts when user needs visual representation or interactive tool
- Types: visualization, exercise, checklist, timeline, comparison
- Use "Liquid Glass" styling: translucent backgrounds, vibrant gradients, smooth animations
- Must be self-contained HTML with inline CSS (no external dependencies)
- Include clear instructions for user
- Make it beautiful and engaging`,

                exampleResponse: `**Example Response:**
{"response":"I hear you're worried about Emma's reading. That must be stressful. Tell me more about what you've noticed at home?","area_actions":[{"action":"create_area","area_path":"Family/Emma_School","name":"Emma's School","description":"Tracking Emma's reading progress and school challenges"},{"action":"append_entry","area_path":"Family/Emma_School","document":"reading_comprehension.md","content":"Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain.","user_quote":"Her teacher said she can decode words but doesn't remember what she reads.","ai_observation":"Specific diagnosis from teacher. Comprehension issue, not decoding.","sentiment":"concerned"}],"artifact_action":{"action":"none"},"bubbles":["what helps her focus?","teacher's suggestions?","how does she feel?"]}`,

                importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON (no markdown, no code blocks, no extra text)
- Always include area_actions when user discusses life topics
- Always include 2-4 relevant bubbles
- Keep responses conversational and natural
- Reference past conversations when relevant (context provided)
- Be warm and supportive, like a thoughtful friend`
            },
            
            // Context assembly configuration
            contextAssembly: {
                multiQueryWeights: {
                    recentUserInputs: 3.0,
                    allUserInputs: 1.5,
                    fullConversation: 0.5
                },
                multiQueryCounts: {
                    recentUserInputsCount: 2,
                    recentUserInputsTopK: 10,
                    allUserInputsTopK: 10,
                    fullConversationTopK: 5,
                    finalTopK: 10
                },
                boosts: {
                    recencyBoostPerDay: 0.05,
                    areaBoost: 1.5
                },
                tokenBudgets: {
                    systemInstruction: 1300,
                    aiNotes: 1500,
                    knowledgeTree: 300,
                    vectorMatchedEntries: 500,
                    vectorMatchedSummaries: 500,
                    vectorMatchedChunks: 1000,
                    conversationHistory: 2000,
                    total: 10000
                }
            },
            
            // Version metadata
            version: '1.0.0',
            lastModified: new Date().toISOString(),
            modifiedBy: 'system'
        };
    }
    
    /**
     * LOAD CUSTOM PROMPTS
     * 
     * Loads user's custom prompt modifications from disk.
     * 
     * **Technical**: Reads from user_data/config/prompts.json
     * **Why**: Persists user customizations across app restarts
     * **Product**: Users can customize AI behavior and it sticks
     * **History**: Created 2026-01-24 for admin panel feature
     */
    loadCustomPrompts() {
        if (!fs.existsSync(this.promptsPath)) {
            console.log('[PromptManagementService] No custom prompts found');
            return {};
        }
        
        try {
            const data = fs.readFileSync(this.promptsPath, 'utf-8');
            const prompts = JSON.parse(data);
            console.log('[PromptManagementService] Loaded custom prompts');
            return prompts;
        } catch (error) {
            console.error('[PromptManagementService] Error loading custom prompts:', error);
            return {};
        }
    }
    
    /**
     * SAVE CUSTOM PROMPTS
     * 
     * Persists custom prompts to disk.
     * 
     * **Technical**: Writes to user_data/config/prompts.json with pretty formatting
     * **Why**: Immediate persistence ensures no data loss
     * **Product**: Changes are saved instantly, no "Save" button needed
     * **History**: Created 2026-01-24
     */
    saveCustomPrompts() {
        try {
            fs.writeFileSync(
                this.promptsPath,
                JSON.stringify(this.customPrompts, null, 2),
                'utf-8'
            );
            console.log('[PromptManagementService] Saved custom prompts');
        } catch (error) {
            console.error('[PromptManagementService] Error saving custom prompts:', error);
            throw error;
        }
    }
    
    /**
     * GET SYSTEM PROMPT
     * 
     * Returns the complete system prompt, using custom if available, otherwise default.
     * This is what LLMService calls to get the prompt.
     * 
     * **Technical**: Merges custom sections over defaults
     * **Why**: Allows partial customization (user can change just one section)
     * **Product**: Users can customize specific parts without rewriting everything
     * **Called By**: LLMService.buildSystemPrompt()
     */
    getSystemPrompt() {
        const defaultSystem = this.defaultPrompts.system;
        const customSystem = this.customPrompts.system || {};
        
        // Merge custom over default (custom takes precedence)
        const merged = {
            purpose: customSystem.purpose || defaultSystem.purpose,
            approach: customSystem.approach || defaultSystem.approach,
            lifeAreas: customSystem.lifeAreas || defaultSystem.lifeAreas,
            responseFormat: customSystem.responseFormat || defaultSystem.responseFormat,
            areaActionsGuidelines: customSystem.areaActionsGuidelines || defaultSystem.areaActionsGuidelines,
            artifactGuidelines: customSystem.artifactGuidelines || defaultSystem.artifactGuidelines,
            exampleResponse: customSystem.exampleResponse || defaultSystem.exampleResponse,
            importantNotes: customSystem.importantNotes || defaultSystem.importantNotes
        };
        
        // Concatenate all sections
        return Object.values(merged).join('\n\n');
    }
    
    /**
     * GET PROMPT SECTION
     * 
     * Returns a specific section of the system prompt.
     * 
     * @param {string} section - Section name (purpose, approach, etc.)
     * @returns {string} Section content
     * 
     * **Technical**: Returns custom if exists, otherwise default
     * **Why**: Admin UI needs to show current value for editing
     * **Product**: Users see what's currently active
     */
    getPromptSection(section) {
        if (this.customPrompts.system && this.customPrompts.system[section]) {
            return this.customPrompts.system[section];
        }
        return this.defaultPrompts.system[section];
    }
    
    /**
     * UPDATE PROMPT SECTION
     * 
     * Updates a specific section of the system prompt.
     * 
     * @param {string} section - Section name
     * @param {string} content - New content
     * 
     * **Technical**: Updates custom prompts and saves immediately
     * **Why**: Instant persistence, no "Save" button needed
     * **Product**: Changes take effect immediately
     * **Called By**: Admin panel UI
     */
    updatePromptSection(section, content) {
        if (!this.customPrompts.system) {
            this.customPrompts.system = {};
        }
        
        this.customPrompts.system[section] = content;
        this.customPrompts.version = this.defaultPrompts.version;
        this.customPrompts.lastModified = new Date().toISOString();
        this.customPrompts.modifiedBy = 'user';
        
        this.saveCustomPrompts();
        
        console.log(`[PromptManagementService] Updated section: ${section}`);
    }
    
    /**
     * RESET TO DEFAULTS
     * 
     * Resets all prompts to default values.
     * 
     * **Technical**: Clears custom prompts and saves
     * **Why**: Users need a way to undo their changes
     * **Product**: "Reset to Default" button in admin UI
     */
    resetToDefaults() {
        this.customPrompts = {};
        this.saveCustomPrompts();
        console.log('[PromptManagementService] Reset to defaults');
    }
    
    /**
     * GET CONTEXT ASSEMBLY CONFIG
     * 
     * Returns the context assembly configuration.
     * 
     * **Technical**: Returns custom if exists, otherwise default
     * **Why**: ContextAssemblyService needs these values
     * **Product**: Users can tune vector search parameters
     */
    getContextAssemblyConfig() {
        return this.customPrompts.contextAssembly || this.defaultPrompts.contextAssembly;
    }
    
    /**
     * UPDATE CONTEXT ASSEMBLY CONFIG
     * 
     * Updates context assembly configuration.
     * 
     * @param {object} config - New configuration
     * 
     * **Technical**: Merges with existing config
     * **Why**: Allows partial updates
     * **Product**: Users can tune specific parameters
     */
    updateContextAssemblyConfig(config) {
        if (!this.customPrompts.contextAssembly) {
            this.customPrompts.contextAssembly = {};
        }
        
        // Deep merge
        this.customPrompts.contextAssembly = {
            ...this.defaultPrompts.contextAssembly,
            ...this.customPrompts.contextAssembly,
            ...config
        };
        
        this.customPrompts.lastModified = new Date().toISOString();
        this.customPrompts.modifiedBy = 'user';
        
        this.saveCustomPrompts();
        
        console.log('[PromptManagementService] Updated context assembly config');
    }
    
    /**
     * GET ALL SECTIONS
     * 
     * Returns all prompt sections with metadata.
     * 
     * **Technical**: Returns object with section names, content, and status
     * **Why**: Admin UI needs to show all sections
     * **Product**: Users can see what's customized vs default
     */
    getAllSections() {
        const sections = {};
        const sectionNames = [
            'purpose',
            'approach',
            'lifeAreas',
            'responseFormat',
            'areaActionsGuidelines',
            'artifactGuidelines',
            'exampleResponse',
            'importantNotes'
        ];
        
        for (const name of sectionNames) {
            sections[name] = {
                content: this.getPromptSection(name),
                isCustom: !!(this.customPrompts.system && this.customPrompts.system[name]),
                default: this.defaultPrompts.system[name]
            };
        }
        
        return sections;
    }
    
    /**
     * GET METADATA
     * 
     * Returns metadata about current prompts.
     * 
     * **Technical**: Version, last modified, who modified
     * **Why**: Admin UI shows this info
     * **Product**: Users can see when prompts were last changed
     */
    getMetadata() {
        return {
            version: this.customPrompts.version || this.defaultPrompts.version,
            lastModified: this.customPrompts.lastModified || this.defaultPrompts.lastModified,
            modifiedBy: this.customPrompts.modifiedBy || this.defaultPrompts.modifiedBy,
            hasCustomizations: Object.keys(this.customPrompts).length > 0
        };
    }
}

module.exports = PromptManagementService;
