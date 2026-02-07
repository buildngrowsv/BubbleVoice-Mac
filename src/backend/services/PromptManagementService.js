/**
 * PROMPT MANAGEMENT SERVICE
 * 
 * **Purpose**: Centralized management of all system prompts with customization support,
 * block-based visual editing, template management, and variable substitution.
 * 
 * **Why This Exists**:
 * - All prompts were hardcoded in LLMService
 * - Users couldn't customize AI behavior
 * - No way to A/B test different prompts
 * - No version control for prompt changes
 * - (2026-02-06) Added block-based config, templates, and variables for the
 *   visual prompt editor that shows programmatic/RAG sections inline
 * 
 * **What It Does**:
 * 1. Stores default prompts (from code)
 * 2. Loads custom prompts (from user_data/config/)
 * 3. Provides variable substitution (resolves {{variableName}} at runtime)
 * 4. Tracks prompt versions
 * 5. Allows reset to defaults
 * 6. (NEW) Stores block-based config for visual editor (block ordering, toggles)
 * 7. (NEW) Manages custom prompt templates (save/load/delete)
 * 8. (NEW) Resolves runtime variables before prompt is sent to LLM
 * 
 * **Architecture**:
 * - Default prompts: Loaded from this file (source of truth)
 * - Custom prompts: Stored in user_data/config/prompts.json
 * - Block config: Stored in user_data/config/prompt-blocks.json
 * - Custom templates: Stored in user_data/config/prompt-templates.json
 * - Active prompt: Custom if exists, otherwise default
 * - Variable resolution: Happens at getSystemPrompt() call time
 * 
 * **Integration**:
 * - LLMService calls getSystemPrompt() instead of buildSystemPrompt()
 * - Admin UI calls updateSection() to modify prompts
 * - Visual Editor saves/loads block config via getBlockConfig()/saveBlockConfig()
 * - Template Library saves/loads via getCustomTemplates()/saveCustomTemplates()
 * - Changes are persisted immediately
 * 
 * **Created**: 2026-01-24
 * **Last Modified**: 2026-02-06
 */

const fs = require('fs');
const path = require('path');

class PromptManagementService {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the prompt management service with default and custom prompts,
     * block configuration, and custom templates.
     * 
     * @param {string} userDataDir - Path to user_data directory
     * 
     * **Technical**: Creates config directory if it doesn't exist. Loads all
     * config files: prompts.json, prompt-blocks.json, prompt-templates.json.
     * 
     * **Why**: User data dir is passed from server.js, ensures consistent storage.
     * Block config and templates are stored separately from prompts for clean separation.
     * 
     * **Product**: All user customizations are stored in their user_data folder.
     * The visual editor's block ordering, programmatic block toggles, and saved
     * templates all persist across app restarts.
     */
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
        this.configDir = path.join(userDataDir, 'config');
        this.promptsPath = path.join(this.configDir, 'prompts.json');
        
        /**
         * blockConfigPath: Stores the visual editor's block-based configuration.
         * This includes block ordering, programmatic block enable/disable states,
         * custom text block content, and collapse states.
         * Separate from prompts.json to avoid breaking existing section-based API.
         * Added 2026-02-06 for the visual prompt editor feature.
         */
        this.blockConfigPath = path.join(this.configDir, 'prompt-blocks.json');
        
        /**
         * templatesPath: Stores user-saved custom prompt templates.
         * Each template has a name, description, icon, and section content.
         * Separate file so templates can be exported/shared independently.
         * Added 2026-02-06 for the template library feature.
         */
        this.templatesPath = path.join(this.configDir, 'prompt-templates.json');
        
        // Ensure config directory exists
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
            console.log('[PromptManagementService] Created config directory');
        }
        
        // Load default prompts (hardcoded source of truth)
        this.defaultPrompts = this.loadDefaultPrompts();
        
        // Load custom prompts (user modifications to section text)
        this.customPrompts = this.loadCustomPrompts();
        
        // Load block configuration (visual editor block ordering and toggles)
        this.blockConfig = this.loadBlockConfig();
        
        // Load custom templates (user-saved prompt configurations)
        this.customTemplates = this.loadCustomTemplates();
        
        console.log('[PromptManagementService] Initialized');
        console.log(`  Custom prompts: ${Object.keys(this.customPrompts).length > 0 ? 'YES' : 'NO'}`);
        console.log(`  Block config: ${this.blockConfig ? 'YES' : 'NO'}`);
        console.log(`  Custom templates: ${this.customTemplates.length}`);
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
    
    // =========================================================================
    // BLOCK CONFIGURATION METHODS (Added 2026-02-06)
    //
    // These methods manage the visual prompt editor's block-based configuration.
    // The block config stores the ordering of text + programmatic blocks,
    // which programmatic blocks are enabled/disabled, and custom text content.
    //
    // This is separate from the section-based system (above) for backward
    // compatibility. When a block config exists, getSystemPrompt() uses it
    // to determine the text section content. When it doesn't exist, the old
    // section-based system is used as-is.
    // =========================================================================
    
    /**
     * LOAD BLOCK CONFIG
     * 
     * Loads the visual editor's block configuration from disk.
     * 
     * **Technical**: Reads from user_data/config/prompt-blocks.json
     * **Why**: Persists block ordering, toggles, and custom text across restarts
     * **Product**: Users' visual editor layout is preserved
     * **Returns**: Block config object or null if no config saved yet
     */
    loadBlockConfig() {
        if (!fs.existsSync(this.blockConfigPath)) {
            console.log('[PromptManagementService] No block config found (first-time user)');
            return null;
        }
        
        try {
            const data = fs.readFileSync(this.blockConfigPath, 'utf-8');
            const config = JSON.parse(data);
            console.log('[PromptManagementService] Loaded block config');
            return config;
        } catch (error) {
            console.error('[PromptManagementService] Error loading block config:', error);
            return null;
        }
    }
    
    /**
     * SAVE BLOCK CONFIG
     * 
     * Persists the visual editor's block configuration to disk.
     * Also syncs text block content back to the section-based system
     * for backward compatibility (so getSystemPrompt() still works).
     * 
     * **Technical**: Writes to prompt-blocks.json AND updates customPrompts
     * sections to keep the two systems in sync. This dual-write ensures that
     * even if the visual editor is not used, the prompt content is consistent.
     * 
     * @param {Object} config - Block configuration from the visual editor
     * 
     * **Why**: Dual-write to both block config and section prompts ensures
     * backward compat. LLMService calls getSystemPrompt() which reads sections.
     * Visual editor reads block config for layout/ordering.
     * 
     * **Product**: Changes in the visual editor take effect immediately for the AI.
     */
    saveBlockConfig(config) {
        try {
            // Save block config
            this.blockConfig = config;
            fs.writeFileSync(
                this.blockConfigPath,
                JSON.stringify(config, null, 2),
                'utf-8'
            );
            
            // Sync text block content to section-based system for backward compat
            // This ensures getSystemPrompt() returns the right content
            if (config && config.blocks) {
                const sectionMapping = [
                    'purpose', 'approach', 'lifeAreas', 'responseFormat',
                    'areaActionsGuidelines', 'artifactGuidelines',
                    'exampleResponse', 'importantNotes'
                ];
                
                if (!this.customPrompts.system) {
                    this.customPrompts.system = {};
                }
                
                config.blocks.forEach(block => {
                    if (block.type === 'text' && sectionMapping.includes(block.id) && block.content) {
                        this.customPrompts.system[block.id] = block.content;
                    }
                });
                
                this.customPrompts.lastModified = new Date().toISOString();
                this.customPrompts.modifiedBy = 'user';
                this.saveCustomPrompts();
            }
            
            console.log('[PromptManagementService] Saved block config (+ synced to sections)');
        } catch (error) {
            console.error('[PromptManagementService] Error saving block config:', error);
            throw error;
        }
    }
    
    /**
     * GET BLOCK CONFIG
     * 
     * Returns the current block configuration for the visual editor.
     * 
     * @returns {Object|null} Block config or null if none saved
     */
    getBlockConfig() {
        return this.blockConfig;
    }
    
    // =========================================================================
    // VARIABLE RESOLUTION METHODS (Added 2026-02-06)
    //
    // These methods resolve {{variableName}} placeholders in prompt text
    // at runtime. Variables provide dynamic context like the current date,
    // user name, conversation count, etc.
    //
    // Variables are resolved when getSystemPrompt() is called, so the LLM
    // always sees resolved values, not raw {{placeholders}}.
    //
    // WHY: Users want to write prompts like "Today is {{currentDate}}, help me
    // plan my {{dayOfWeek}} evening" and have the AI see the actual date.
    // BECAUSE: Without this, prompts are static and users would need to
    // manually update date references, model names, etc.
    // =========================================================================
    
    /**
     * RESOLVE VARIABLES
     * 
     * Replaces all {{variableName}} placeholders in a text string with
     * their resolved runtime values.
     * 
     * **Technical**: Uses regex to find {{variables}} and replaces each
     * with a value from the runtime context. Unknown variables are left as-is.
     * 
     * **Why**: Lets users write dynamic prompts without manual updating.
     * The AI always knows what day it is, what model is being used, etc.
     * 
     * @param {string} text - Text containing {{variable}} placeholders
     * @param {Object} runtimeContext - Optional additional context (e.g., from settings)
     * @returns {string} Text with variables resolved
     */
    resolveVariables(text, runtimeContext = {}) {
        if (!text || typeof text !== 'string') return text;
        
        // Build the variable values map
        const now = new Date();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const hour = now.getHours();
        
        /**
         * timeOfDay: Determines the period of day for conversational context.
         * The AI can use this to say things like "How's your evening going?"
         * Boundaries: morning (5-11), afternoon (12-16), evening (17-20), night (21-4)
         */
        let timeOfDay = 'morning';
        if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
        else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
        else if (hour >= 21 || hour < 5) timeOfDay = 'night';
        
        const variableValues = {
            // Time variables — resolved from the system clock
            currentDate: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            currentTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            dayOfWeek: dayNames[now.getDay()],
            timeOfDay: timeOfDay,
            
            // System variables — from the runtime context passed by the caller
            userName: runtimeContext.userName || 'User',
            modelName: runtimeContext.modelName || 'AI',
            appVersion: runtimeContext.appVersion || '1.0.0',
            
            // Database/stats variables — from the runtime context
            conversationCount: String(runtimeContext.conversationCount || 0),
            activeAreaCount: String(runtimeContext.activeAreaCount || 0),
            areasList: runtimeContext.areasList || '',
            
            // Allow any additional context values to be used as variables
            ...runtimeContext
        };
        
        // Replace all {{variableName}} occurrences
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            if (variableValues[varName] !== undefined) {
                return variableValues[varName];
            }
            // Unknown variable: leave as-is so the user can see it's unresolved
            console.warn(`[PromptManagementService] Unknown variable: {{${varName}}}`);
            return match;
        });
    }
    
    /**
     * GET SYSTEM PROMPT WITH VARIABLES
     * 
     * Returns the system prompt with all variables resolved.
     * This is the preferred method for LLMService to call.
     * 
     * **Technical**: Calls getSystemPrompt() then resolveVariables().
     * **Why**: LLMService doesn't need to know about variable resolution.
     * **Product**: The AI always sees fully resolved, contextual prompts.
     * 
     * @param {Object} runtimeContext - Context values for variable resolution
     * @returns {string} Fully resolved system prompt
     */
    getSystemPromptWithVariables(runtimeContext = {}) {
        const rawPrompt = this.getSystemPrompt();
        return this.resolveVariables(rawPrompt, runtimeContext);
    }
    
    // =========================================================================
    // TEMPLATE MANAGEMENT METHODS (Added 2026-02-06)
    //
    // These methods manage user-saved custom prompt templates.
    // Built-in templates are hardcoded in the frontend (prompt-template-library.js).
    // Custom templates are saved to user_data/config/prompt-templates.json.
    //
    // WHY: Users may want to save their current prompt configuration as a
    // reusable template, or share templates with others.
    // BECAUSE: The template library lets users quickly switch between
    // different AI personality modes, and custom templates extend this.
    // =========================================================================
    
    /**
     * LOAD CUSTOM TEMPLATES
     * 
     * Loads user-saved prompt templates from disk.
     * 
     * **Technical**: Reads from user_data/config/prompt-templates.json
     * **Returns**: Array of template objects, or empty array if none exist
     */
    loadCustomTemplates() {
        if (!fs.existsSync(this.templatesPath)) {
            return [];
        }
        
        try {
            const data = fs.readFileSync(this.templatesPath, 'utf-8');
            const templates = JSON.parse(data);
            console.log(`[PromptManagementService] Loaded ${templates.length} custom templates`);
            return Array.isArray(templates) ? templates : [];
        } catch (error) {
            console.error('[PromptManagementService] Error loading custom templates:', error);
            return [];
        }
    }
    
    /**
     * SAVE CUSTOM TEMPLATES
     * 
     * Persists custom templates to disk.
     * 
     * @param {Array} templates - Array of template objects to save
     * 
     * **Technical**: Overwrites the entire templates file with the new array.
     * This is fine because templates are small and infrequently modified.
     * 
     * **Why**: Atomic write ensures consistency. No partial updates.
     * **Product**: User-saved templates persist across app restarts.
     */
    saveCustomTemplates(templates) {
        try {
            this.customTemplates = Array.isArray(templates) ? templates : [];
            fs.writeFileSync(
                this.templatesPath,
                JSON.stringify(this.customTemplates, null, 2),
                'utf-8'
            );
            console.log(`[PromptManagementService] Saved ${this.customTemplates.length} custom templates`);
        } catch (error) {
            console.error('[PromptManagementService] Error saving custom templates:', error);
            throw error;
        }
    }
    
    /**
     * GET CUSTOM TEMPLATES
     * 
     * Returns all user-saved custom templates.
     * 
     * @returns {Array} Array of template objects
     */
    getCustomTemplates() {
        return this.customTemplates;
    }
}

module.exports = PromptManagementService;
