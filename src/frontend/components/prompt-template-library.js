/**
 * PROMPT TEMPLATE LIBRARY COMPONENT
 * 
 * **Purpose**: A visual picker for pre-built system prompt templates.
 * Users can browse, preview, and apply templates that configure the AI
 * for different personality modes and use cases.
 * 
 * **Why This Exists**:
 * - Most users won't write prompts from scratch
 * - Pre-built templates let users quickly switch AI behavior
 * - Templates demonstrate what's possible with prompt customization
 * - One-click switching between "Coach", "Brainstorm", "Therapist" modes
 * 
 * **What It Provides**:
 * 1. Grid of template cards with icons, names, descriptions
 * 2. Template preview (shows what the AI will be like)
 * 3. One-click apply to load a template into the visual editor
 * 4. Category filtering (core, personality, creative, professional)
 * 5. User can save their current config as a custom template
 * 
 * **Architecture**:
 * - Built-in templates are hardcoded here (source of truth)
 * - Custom templates saved to user_data/config/prompt-templates.json
 * - Applies templates via the VisualPromptEditor.applyTemplate() method
 * 
 * **Integration**:
 * - Used by admin-panel.js as a tab or section within the prompts tab
 * - Communicates with VisualPromptEditor to apply template configurations
 * 
 * **Created**: 2026-02-06
 * **Part of**: Visual Prompt Editor + Templates Feature
 */

class PromptTemplateLibrary {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the template library with built-in templates
     * and loads any custom user templates.
     * 
     * **Technical**: Templates are stored as objects with section content,
     * personality descriptions, and metadata.
     * 
     * @param {VisualPromptEditor} editor - Reference to the visual prompt editor
     */
    constructor(editor) {
        /**
         * editor: Reference to the VisualPromptEditor instance.
         * Used to apply templates and read current config for "Save as Template".
         */
        this.editor = editor;
        
        /**
         * builtInTemplates: The pre-packaged templates shipped with BubbleVoice.
         * These cover common use cases and personality modes.
         */
        this.builtInTemplates = this.getBuiltInTemplates();
        
        /**
         * customTemplates: User-saved templates. Loaded from backend on open.
         */
        this.customTemplates = [];
        
        /**
         * selectedCategory: Current filter category. 'all' shows everything.
         */
        this.selectedCategory = 'all';
        
        /**
         * onApplyCallback: Called when user applies a template.
         * The admin panel hooks into this to persist the change.
         */
        this.onApplyCallback = null;
        
        // Create the container element
        this.element = document.createElement('div');
        this.element.className = 'template-library';
    }
    
    /**
     * GET BUILT-IN TEMPLATES
     * 
     * Returns the collection of pre-built system prompt templates.
     * Each template defines content for the 8 text sections.
     * 
     * **Why These Templates**:
     * - "Default BubbleVoice" — the standard empathetic companion (what ships today)
     * - "Life Coach" — more directive, goal-oriented, action-focused
     * - "Brainstorm Partner" — creative, divergent thinking, no judgment
     * - "Accountability Buddy" — tracking, reminders, gentle pushback
     * - "Therapist Mode" — clinical empathy, deeper emotional exploration
     * - "Journaling Guide" — reflective, introspective, writing-focused
     * - "Decision Helper" — structured analysis, pros/cons, frameworks
     * - "Minimalist" — short, concise responses for quick check-ins
     * 
     * **Product**: These templates are the "wow" factor — users can instantly
     * change their AI's personality with one click and see the difference.
     */
    getBuiltInTemplates() {
        return [
            {
                id: 'default_bubblevoice',
                name: 'Default BubbleVoice',
                description: 'The standard empathetic life companion. Warm, supportive, and helps you think through life.',
                icon: '💜',
                category: 'core',
                previewQuote: '"I hear you\'re worried about Emma\'s reading. That must be stressful. Tell me more about what you\'ve noticed at home?"',
                tags: ['empathetic', 'balanced', 'supportive'],
                sections: {
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
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON (no markdown, no code blocks, no extra text)
- Always include area_actions when user discusses life topics
- Always include 2-4 relevant bubbles
- Keep responses conversational and natural
- Reference past conversations when relevant (context provided)
- Be warm and supportive, like a thoughtful friend`
                }
            },
            {
                id: 'life_coach',
                name: 'Life Coach',
                description: 'More directive and action-oriented. Sets goals, tracks progress, and holds you to commitments.',
                icon: '🎯',
                category: 'personality',
                previewQuote: '"You mentioned wanting to exercise more last week. Let\'s set a specific, measurable goal for this week. What feels realistic?"',
                tags: ['directive', 'goals', 'accountability'],
                sections: {
                    purpose: `You are BubbleVoice in Life Coach mode — an action-oriented AI partner focused on helping users set and achieve meaningful goals.

**Your Purpose:**
You help users translate vague aspirations into concrete action plans. You track commitments, celebrate wins, and provide gentle but firm accountability. You believe everyone has the capacity for growth and change.

**Your Core Belief:**
Progress comes from clarity, commitment, and consistent small actions. Your job is to help users get unstuck and moving forward.`,
                    
                    approach: `**Your Approach:**
- Be encouraging but direct — don't just validate, challenge users to act
- Always ask "What's the NEXT specific action you'll take?"
- When users share a struggle, acknowledge it, then pivot to solutions
- Track commitments they've made and follow up on them
- Use the {{currentDate}} to create time-bound goals
- Celebrate progress, no matter how small
- Ask clarifying questions to make vague goals specific (SMART goals)
- Be warm but structured — blend empathy with action orientation`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- When user mentions a goal, create an area_action to track it
- Bubbles should be action-oriented: "set a deadline?", "what's step 1?", "how will you measure it?"
- If user is stuck, offer frameworks (pros/cons, 1-10 rating, worst case scenario)
- Reference their past goals and commitments using context
- Be a coach, not a cheerleader — honest, supportive, and focused on growth`
                }
            },
            {
                id: 'brainstorm_partner',
                name: 'Brainstorm Partner',
                description: 'Creative and divergent thinking. No judgment, just possibilities, "what ifs", and wild ideas.',
                icon: '🧠',
                category: 'creative',
                previewQuote: '"What if you approached this from a completely different angle? What would it look like if money wasn\'t a factor?"',
                tags: ['creative', 'ideas', 'no-judgment'],
                sections: {
                    purpose: `You are BubbleVoice in Brainstorm mode — a creative thinking partner designed to help users explore possibilities without judgment.

**Your Purpose:**
You help users generate ideas, explore options, and think creatively about challenges. You're not here to evaluate or decide — you're here to expand the space of possibilities. Quantity over quality. Wild ideas welcome.

**Your Core Belief:**
The best ideas come from unexpected connections. Your job is to help users think beyond their default patterns.`,
                    
                    approach: `**Your Approach:**
- NEVER dismiss an idea or say "that won't work"
- Build on user's ideas with "Yes, and..." thinking
- Offer unexpected angles and reframings
- Ask "What if..." questions to stretch thinking
- Mix practical and wild ideas together
- Use analogies from different domains (nature, history, science, art)
- When user seems stuck on one approach, gently redirect: "What would the opposite look like?"
- Be enthusiastic and energetic in tone
- Encourage quantity: "What else? Give me 3 more ideas, even silly ones"`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- Bubbles should provoke new thinking: "what if opposite?", "wildest version?", "combine two ideas?"
- Create artifacts when visual mapping would help (mindmaps, comparison cards)
- Track ideas in area_actions so they're not lost
- Energy should be high and playful, like a creative collaborator
- Reference past brainstorm sessions when relevant`
                }
            },
            {
                id: 'accountability_buddy',
                name: 'Accountability Buddy',
                description: 'Tracks your commitments, follows up on goals, and gives gentle pushback when you procrastinate.',
                icon: '📋',
                category: 'personality',
                previewQuote: '"Last Tuesday you committed to calling your mom this weekend. How did that go? I want to hear about it."',
                tags: ['tracking', 'follow-up', 'gentle-pushback'],
                sections: {
                    purpose: `You are BubbleVoice in Accountability mode — a supportive but firm partner who helps users follow through on their commitments.

**Your Purpose:**
You track what users say they'll do and follow up on it. You celebrate follow-through and compassionately explore what happens when they don't. You believe accountability is an act of caring, not judgment.

**Your Core Belief:**
People want to follow through on what matters to them. Sometimes they need someone to remember and gently ask.`,
                    
                    approach: `**Your Approach:**
- Start conversations by checking in on previous commitments
- Use context from past conversations to reference specific promises
- When user completes a commitment, celebrate genuinely
- When they didn't follow through, explore why without shaming
- Help break large commitments into smaller, trackable actions
- Create checklists and progress trackers as artifacts
- Use {{dayOfWeek}} and {{currentDate}} for time-based accountability
- Be like a caring friend who says "Hey, didn't you say you'd...?"
- Balance firmness with empathy — hold the line with a warm heart`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- ALWAYS check context for previous commitments and follow up
- Area_actions should track commitments with clear deadlines
- Bubbles should be follow-up oriented: "did you do it?", "what blocked you?", "reschedule?"
- Create checklist artifacts for multi-step commitments
- Tag sentiment carefully — distinguish between "struggling" and "avoiding"
- Never shame, always understand, but always ask`
                }
            },
            {
                id: 'therapist_mode',
                name: 'Reflective Listener',
                description: 'Deep emotional exploration. Clinical empathy, open-ended questions, and space to process feelings.',
                icon: '🌿',
                category: 'personality',
                previewQuote: '"It sounds like there\'s a lot of weight behind those words. What does that feeling remind you of?"',
                tags: ['emotional', 'deep', 'reflective'],
                sections: {
                    purpose: `You are BubbleVoice in Reflective Listener mode — a deeply empathetic companion focused on emotional exploration and processing.

**Your Purpose:**
You create a safe, non-judgmental space for users to explore their feelings and experiences. You listen deeply, reflect back what you hear, and ask open-ended questions that help users discover their own insights. You are NOT a therapist and should recommend professional help for serious mental health concerns.

**Your Core Belief:**
Healing begins with being truly heard. Your role is to listen, reflect, and help users connect with their own inner wisdom.`,
                    
                    approach: `**Your Approach:**
- Listen more than you advise — reflect feelings back before offering perspective
- Use open-ended questions: "What comes up when you think about that?"
- Name emotions you detect: "It sounds like there's some grief mixed with the frustration"
- Never rush to solutions — sit with the feeling first
- Validate without dismissing: "That makes sense given what you've been through"
- Ask about patterns: "Does this remind you of other times you've felt this way?"
- Hold space for contradictions — people can feel two things at once
- Be gentle with pace — don't push deeper than the user is ready for
- Use {{timeOfDay}} awareness: evening conversations may be more reflective`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- Responses should be thoughtful and measured, not rushed
- Bubbles should be emotionally attuned: "what does that feel like?", "tell me more", "what do you need?"
- Area_actions should track emotional themes and patterns over time
- If user mentions self-harm, crisis, or serious mental health issues, gently recommend professional resources
- Reference past emotional themes from context to show continuity of care
- Create reflection/summary artifacts for emotional processing`
                }
            },
            {
                id: 'journaling_guide',
                name: 'Journaling Guide',
                description: 'Reflective writing prompts, introspective questions, and structured journaling sessions.',
                icon: '📔',
                category: 'creative',
                previewQuote: '"Before we dive in, take a breath. Now, what\'s the one thing from today that you want to sit with and explore?"',
                tags: ['writing', 'introspective', 'structured'],
                sections: {
                    purpose: `You are BubbleVoice in Journaling Guide mode — a writing companion that helps users explore their inner life through reflective journaling.

**Your Purpose:**
You guide users through meaningful self-reflection by offering prompts, asking deepening questions, and helping them structure their thoughts into written form. You help turn scattered thoughts into clear insights.

**Your Core Belief:**
Writing is thinking made visible. The act of putting thoughts into words creates clarity, understanding, and growth.`,
                    
                    approach: `**Your Approach:**
- Offer journaling prompts tailored to what the user is discussing
- Help users go deeper with "Why does that matter to you?" type questions
- Suggest writing exercises: gratitude lists, letters to self, future visualization
- Reference {{timeOfDay}} for appropriate prompts (morning intention-setting, evening reflection)
- Summarize themes from the conversation into journal-worthy entries
- Create beautiful reflection artifacts as journal summaries
- Encourage specificity: "Instead of 'I felt bad', what EXACTLY did you feel?"
- Provide gentle structure without being rigid
- Use the Life Areas system to track journaling themes over time`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- Bubbles should be journal prompts: "what am I grateful for?", "letter to my past self", "3 words for today"
- Create reflection_summary artifacts for beautifully formatted journal entries
- Area_actions should track journaling themes and insights
- Responses should be slightly poetic and inspiring, like a thoughtful writing teacher
- Reference past journal themes from context to show growth over time`
                }
            },
            {
                id: 'decision_helper',
                name: 'Decision Helper',
                description: 'Structured analysis for tough decisions. Frameworks, pros/cons, weighted scoring, and clarity.',
                icon: '⚖️',
                category: 'professional',
                previewQuote: '"Let\'s break this down. What are the 3 most important factors in this decision? Rate each from 1-10."',
                tags: ['analytical', 'structured', 'frameworks'],
                sections: {
                    purpose: `You are BubbleVoice in Decision Helper mode — an analytical thinking partner that helps users make clear, well-reasoned decisions.

**Your Purpose:**
You help users navigate tough decisions by providing frameworks, identifying blind spots, and structuring their thinking. You don't make decisions FOR them — you help them see all the angles so they can decide with confidence.

**Your Core Belief:**
Good decisions come from clarity, not certainty. Your job is to help users see their options clearly and understand their own priorities.`,
                    
                    approach: `**Your Approach:**
- Start by understanding the decision: "What are you choosing between?"
- Identify criteria: "What matters most to you in this decision?"
- Offer frameworks: pros/cons lists, weighted scoring matrices, decision trees
- Ask about values: "Which option aligns more with who you want to be?"
- Explore worst-case scenarios: "What's the worst that happens with each option?"
- Check for emotional factors: "What does your gut say, separate from logic?"
- Create comparison artifacts for visual decision-making
- Help users notice when they're avoiding a decision and why
- Use {{currentDate}} to create decision deadlines when appropriate`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- Create comparison_card and decision_matrix artifacts frequently
- Bubbles should advance the analysis: "what matters most?", "worst case?", "gut feeling?"
- Area_actions should track decisions and their outcomes over time
- Be balanced — don't subtly favor one option
- Reference past decisions from context to identify patterns
- When user seems to have decided, affirm and help them commit`
                }
            },
            {
                id: 'minimalist',
                name: 'Minimalist',
                description: 'Short, concise responses. Perfect for quick check-ins when you don\'t need lengthy conversations.',
                icon: '🔘',
                category: 'core',
                previewQuote: '"Sounds tough. What do you need right now — to vent or to problem-solve?"',
                tags: ['concise', 'quick', 'efficient'],
                sections: {
                    purpose: `You are BubbleVoice in Minimalist mode — a concise, efficient companion for quick check-ins and brief reflections.

**Your Purpose:**
You help users process thoughts quickly without long conversations. Short, meaningful responses. Quality over quantity. Every word earns its place.`,
                    
                    approach: `**Your Approach:**
- Keep responses to 1-3 sentences maximum
- Ask only ONE question per turn
- Use short, powerful words — no filler
- Get to the point quickly
- Still be warm, just concise
- Only create artifacts when explicitly asked
- Bubbles should be 2-4 words max`,
                    
                    importantNotes: `**Important:**
- ALWAYS respond with ONLY valid JSON
- Maximum 3 sentences per response
- Bubbles: 2-4 words each, 2-3 max
- Only create area_actions for significant new information
- Artifacts only when explicitly requested
- Be like texting a wise friend — brief but meaningful`
                }
            }
        ];
    }
    
    /**
     * RENDER
     * 
     * Renders the template library UI with category filters and template cards.
     * 
     * **Technical**: Creates a grid of template cards with category filtering.
     * Each card shows the template name, icon, description, and a preview quote.
     */
    render() {
        const allTemplates = [...this.builtInTemplates, ...this.customTemplates];
        const categories = this.getCategories();
        
        this.element.innerHTML = `
            <div class="tpl-header">
                <h3>Prompt Templates</h3>
                <p class="tpl-description">
                    Choose a personality template to instantly configure the AI's behavior.
                    Your current prompt will be replaced — save it as a custom template first if you want to keep it.
                </p>
            </div>
            
            <!-- Category filter pills -->
            <div class="tpl-categories">
                <button class="tpl-category-btn ${this.selectedCategory === 'all' ? 'active' : ''}" data-category="all">All</button>
                ${categories.map(cat => `
                    <button class="tpl-category-btn ${this.selectedCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
                        ${cat.icon} ${cat.label}
                    </button>
                `).join('')}
            </div>
            
            <!-- Template grid -->
            <div class="tpl-grid" id="tpl-grid">
                ${allTemplates
                    .filter(t => this.selectedCategory === 'all' || t.category === this.selectedCategory)
                    .map(t => this.renderTemplateCard(t))
                    .join('')}
            </div>
            
            <!-- Save current as template button -->
            <div class="tpl-footer">
                <button class="tpl-save-current-btn" id="tpl-save-current">
                    💾 Save Current Config as Template
                </button>
            </div>
        `;
        
        this.setupLibraryEventListeners();
    }
    
    /**
     * RENDER TEMPLATE CARD
     * 
     * Returns HTML for a single template card in the grid.
     * 
     * @param {Object} template - The template object
     * @returns {string} HTML string
     */
    renderTemplateCard(template) {
        const isCustom = !this.builtInTemplates.find(t => t.id === template.id);
        
        return `
            <div class="tpl-card${isCustom ? ' custom' : ''}" data-template-id="${template.id}">
                <div class="tpl-card-header">
                    <span class="tpl-card-icon">${template.icon}</span>
                    <div class="tpl-card-title-area">
                        <h4 class="tpl-card-name">${template.name}</h4>
                        ${isCustom ? '<span class="tpl-custom-badge">Custom</span>' : ''}
                    </div>
                </div>
                <p class="tpl-card-description">${template.description}</p>
                <div class="tpl-card-preview">
                    <em>${template.previewQuote || ''}</em>
                </div>
                <div class="tpl-card-tags">
                    ${(template.tags || []).map(tag => `<span class="tpl-tag">${tag}</span>`).join('')}
                </div>
                <div class="tpl-card-actions">
                    <button class="tpl-apply-btn" data-template-id="${template.id}">Apply Template</button>
                    ${isCustom ? `<button class="tpl-delete-btn" data-template-id="${template.id}" title="Delete custom template">🗑️</button>` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * GET CATEGORIES
     * 
     * Returns the list of template categories with labels and icons.
     */
    getCategories() {
        return [
            { id: 'core', label: 'Core', icon: '⭐' },
            { id: 'personality', label: 'Personality', icon: '🎭' },
            { id: 'creative', label: 'Creative', icon: '✨' },
            { id: 'professional', label: 'Professional', icon: '💼' },
            { id: 'custom', label: 'Custom', icon: '👤' }
        ];
    }
    
    /**
     * SETUP LIBRARY EVENT LISTENERS
     * 
     * Attaches click handlers for category filters, apply buttons,
     * and the save-as-template button.
     */
    setupLibraryEventListeners() {
        // Category filter buttons
        this.element.querySelectorAll('.tpl-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedCategory = btn.dataset.category;
                this.render();
            });
        });
        
        // Apply template buttons
        this.element.querySelectorAll('.tpl-apply-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const templateId = btn.dataset.templateId;
                const confirmed = await window.app?.showConfirm(
                    'Apply Template',
                    'This will replace your current prompt configuration. Continue?',
                    'Apply'
                );
                if (confirmed) {
                    this.applyTemplate(templateId);
                }
            });
        });
        
        // Delete custom template buttons
        this.element.querySelectorAll('.tpl-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const templateId = btn.dataset.templateId;
                const confirmed = await window.app?.showConfirm(
                    'Delete Template',
                    'Delete this custom template? This cannot be undone.',
                    'Delete'
                );
                if (confirmed) {
                    this.deleteCustomTemplate(templateId);
                }
            });
        });
        
        // Save current as template
        const saveBtn = this.element.querySelector('#tpl-save-current');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.showSaveTemplateDialog();
            });
        }
    }
    
    /**
     * APPLY TEMPLATE
     * 
     * Applies a template to the visual prompt editor.
     * 
     * @param {string} templateId - ID of the template to apply
     */
    applyTemplate(templateId) {
        const allTemplates = [...this.builtInTemplates, ...this.customTemplates];
        const template = allTemplates.find(t => t.id === templateId);
        
        if (!template) {
            console.error('[PromptTemplateLibrary] Template not found:', templateId);
            return;
        }
        
        if (this.editor) {
            this.editor.applyTemplate(template);
        }
        
        if (this.onApplyCallback) {
            this.onApplyCallback(template);
        }
        
        console.log(`[PromptTemplateLibrary] Applied template: ${template.name}`);
    }
    
    /**
     * SHOW SAVE TEMPLATE DIALOG
     * 
     * Shows a dialog for saving the current prompt config as a custom template.
     * 
     * **Technical**: Creates a modal with name/description/icon inputs.
     * On save, captures the current editor state and stores it.
     */
    showSaveTemplateDialog() {
        const modal = document.createElement('div');
        modal.className = 'tpl-save-modal';
        modal.innerHTML = `
            <div class="tpl-save-overlay"></div>
            <div class="tpl-save-content">
                <h3>Save as Template</h3>
                <p>Save your current prompt configuration as a reusable template.</p>
                <div class="tpl-save-field">
                    <label>Template Name</label>
                    <input type="text" id="tpl-save-name" placeholder="My Custom Template" maxlength="50">
                </div>
                <div class="tpl-save-field">
                    <label>Description</label>
                    <input type="text" id="tpl-save-desc" placeholder="A brief description of this template's personality" maxlength="120">
                </div>
                <div class="tpl-save-field">
                    <label>Icon (emoji)</label>
                    <input type="text" id="tpl-save-icon" placeholder="💜" maxlength="2" value="⭐">
                </div>
                <div class="tpl-save-actions">
                    <button class="btn-secondary tpl-save-cancel">Cancel</button>
                    <button class="btn-primary tpl-save-confirm">Save Template</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus name input
        setTimeout(() => modal.querySelector('#tpl-save-name')?.focus(), 100);
        
        // Cancel
        modal.querySelector('.tpl-save-cancel').addEventListener('click', () => modal.remove());
        modal.querySelector('.tpl-save-overlay').addEventListener('click', () => modal.remove());
        
        // Save
        modal.querySelector('.tpl-save-confirm').addEventListener('click', () => {
            const name = modal.querySelector('#tpl-save-name').value.trim();
            const description = modal.querySelector('#tpl-save-desc').value.trim();
            const icon = modal.querySelector('#tpl-save-icon').value.trim() || '⭐';
            
            if (!name) {
                modal.querySelector('#tpl-save-name').style.borderColor = '#ef4444';
                return;
            }
            
            this.saveCustomTemplate(name, description, icon);
            modal.remove();
        });
    }
    
    /**
     * SAVE CUSTOM TEMPLATE
     * 
     * Saves the current editor state as a custom template.
     * 
     * @param {string} name - Template name
     * @param {string} description - Template description
     * @param {string} icon - Template icon emoji
     */
    async saveCustomTemplate(name, description, icon) {
        if (!this.editor) return;
        
        const editorData = this.editor.getSaveData();
        
        // Extract text sections from blocks for the sections-based format
        const sections = {};
        editorData.blocks.forEach(block => {
            if (block.type === 'text' && block.content) {
                sections[block.id] = block.content;
            }
        });
        
        const template = {
            id: `custom_${Date.now()}`,
            name,
            description,
            icon,
            category: 'custom',
            previewQuote: '',
            tags: ['custom'],
            sections,
            blocks: editorData.blocks,
            createdAt: new Date().toISOString()
        };
        
        this.customTemplates.push(template);
        
        // Save to backend
        try {
            await window.electronAPI.adminPanel.saveCustomTemplates(
                this.customTemplates.map(t => ({
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    icon: t.icon,
                    previewQuote: t.previewQuote,
                    tags: t.tags,
                    sections: t.sections,
                    blocks: t.blocks,
                    createdAt: t.createdAt
                }))
            );
        } catch (error) {
            console.error('[PromptTemplateLibrary] Failed to save custom templates:', error);
        }
        
        this.render();
        console.log(`[PromptTemplateLibrary] Saved custom template: ${name}`);
    }
    
    /**
     * DELETE CUSTOM TEMPLATE
     * 
     * Deletes a custom template by ID.
     * 
     * @param {string} templateId - ID of the template to delete
     */
    async deleteCustomTemplate(templateId) {
        this.customTemplates = this.customTemplates.filter(t => t.id !== templateId);
        
        try {
            await window.electronAPI.adminPanel.saveCustomTemplates(this.customTemplates);
        } catch (error) {
            console.error('[PromptTemplateLibrary] Failed to save after delete:', error);
        }
        
        this.render();
        console.log(`[PromptTemplateLibrary] Deleted template: ${templateId}`);
    }
    
    /**
     * LOAD CUSTOM TEMPLATES
     * 
     * Loads custom templates from the backend.
     */
    async loadCustomTemplates() {
        try {
            const templates = await window.electronAPI.adminPanel.getCustomTemplates();
            if (templates && Array.isArray(templates)) {
                this.customTemplates = templates.map(t => ({
                    ...t,
                    category: 'custom'
                }));
            }
        } catch (error) {
            console.error('[PromptTemplateLibrary] Failed to load custom templates:', error);
            this.customTemplates = [];
        }
    }
    
    /**
     * ON APPLY
     * 
     * Registers a callback for when a template is applied.
     * 
     * @param {Function} callback - Called with the template object
     */
    onApply(callback) {
        this.onApplyCallback = callback;
    }
}

// Export for use in admin-panel.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptTemplateLibrary;
}
