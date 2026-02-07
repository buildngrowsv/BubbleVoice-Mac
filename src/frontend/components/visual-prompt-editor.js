/**
 * VISUAL PROMPT EDITOR COMPONENT
 * 
 * **Purpose**: A block-based visual editor for system prompts that shows
 * text sections, programmatic/RAG injection points, and template variables
 * as draggable, reorderable visual blocks.
 * 
 * **Why This Exists**:
 * - The old admin panel had a plain textarea for editing prompt sections one at a time
 * - Users couldn't see how programmatic sections (RAG context, vector results, etc.)
 *   fit into the overall prompt flow
 * - No way to reorder sections or see the full picture
 * - No variable substitution visualization
 * 
 * **What It Provides**:
 * 1. Block-based editor where each prompt section is a visual block
 * 2. Programmatic blocks (RAG context, knowledge tree, etc.) shown as visual elements
 *    the user can reorder, toggle on/off, and write custom text before/after
 * 3. Variable chips ({{currentDate}}, {{userName}}) rendered as colored pills
 *    that users can insert via a palette toolbar
 * 4. Drag-and-drop reordering of ALL blocks (text + programmatic)
 * 5. Live preview of the assembled prompt with variable resolution
 * 
 * **Architecture**:
 * - Stores prompt as an ordered array of "blocks" (text or programmatic)
 * - Text blocks use auto-growing textarea with variable insertion toolbar
 * - Programmatic blocks are visual-only, showing what gets injected at runtime
 * - Serialization: blocks array → JSON → PromptManagementService → prompts.json
 * - Variable chips are stored as {{variableName}} in text, rendered as pills in preview
 * 
 * **Integration**:
 * - Used by admin-panel.js in the System Prompts tab
 * - Communicates with PromptManagementService via IPC through window.electronAPI
 * - Block order + content saved to user_data/config/prompts.json
 * 
 * **Created**: 2026-02-06
 * **Part of**: Visual Prompt Editor + Templates Feature
 */

class VisualPromptEditor {
    /**
     * CONSTRUCTOR
     * 
     * Initializes the visual prompt editor with default blocks and variables.
     * 
     * **Technical**: Creates the editor DOM structure and sets up drag-and-drop.
     * The editor starts with the default block configuration until data is loaded.
     * 
     * **Why**: The editor needs to be ready to render immediately, then hydrate
     * with data from the backend. This prevents a flash of empty content.
     * 
     * **Product**: Users see a beautifully organized prompt editor on first open.
     */
    constructor() {
        /**
         * blocks: The ordered array of prompt blocks.
         * Each block is either 'text' (user-editable) or 'programmatic' (system-injected).
         * This is the core data model for the entire editor.
         */
        this.blocks = [];
        
        /**
         * availableVariables: Variables that can be inserted into text blocks.
         * Each variable has a key (used in {{key}}), label, source, and example value.
         * These are resolved at runtime before the prompt is sent to the LLM.
         */
        this.availableVariables = this.getDefaultVariables();
        
        /**
         * dragState: Tracks the current drag-and-drop operation.
         * draggedBlockId is the block being dragged, dragOverBlockId is where it would drop.
         * We use this to show visual indicators during drag.
         */
        this.dragState = {
            draggedBlockId: null,
            dragOverBlockId: null,
            dragOverPosition: null  // 'before' or 'after'
        };
        
        /**
         * onChangeCallback: Called whenever the block configuration changes.
         * The admin panel hooks into this to persist changes via IPC.
         */
        this.onChangeCallback = null;
        
        /**
         * previewMode: When true, shows the assembled prompt with variable chips rendered.
         * When false, shows the block editor.
         */
        this.previewMode = false;
        
        /**
         * variablePaletteTarget: Which text block's textarea is currently targeted
         * for variable insertion. Set when user clicks "Insert Variable" on a text block.
         */
        this.variablePaletteTarget = null;
        
        // Create the main container element
        this.element = document.createElement('div');
        this.element.className = 'visual-prompt-editor';
    }
    
    /**
     * GET DEFAULT VARIABLES
     * 
     * Returns the list of available template variables that users can insert
     * into text blocks. These get resolved at runtime by the backend.
     * 
     * **Technical**: Each variable specifies its source (runtime, database, settings, etc.)
     * and an example value shown in the insertion palette.
     * 
     * **Why**: Gives users dynamic placeholders so their prompts stay up-to-date
     * without manual editing. E.g., {{currentDate}} always shows today's date.
     * 
     * **Product**: Makes prompts feel alive and contextual. The AI always knows
     * what day it is, how many conversations have happened, etc.
     */
    getDefaultVariables() {
        return [
            {
                key: 'currentDate',
                label: 'Current Date',
                source: 'runtime',
                description: 'Today\'s date in natural format',
                example: 'Friday, February 6, 2026',
                category: 'time'
            },
            {
                key: 'currentTime',
                label: 'Current Time',
                source: 'runtime',
                description: 'Current time of day',
                example: '3:45 PM',
                category: 'time'
            },
            {
                key: 'userName',
                label: 'User Name',
                source: 'user_profile',
                description: 'The user\'s display name (if set)',
                example: 'Alex',
                category: 'user'
            },
            {
                key: 'conversationCount',
                label: 'Total Conversations',
                source: 'database',
                description: 'Number of conversations in history',
                example: '42',
                category: 'stats'
            },
            {
                key: 'activeAreaCount',
                label: 'Active Life Areas',
                source: 'database',
                description: 'Number of life areas being tracked',
                example: '5',
                category: 'stats'
            },
            {
                key: 'modelName',
                label: 'AI Model',
                source: 'settings',
                description: 'Currently selected AI model',
                example: 'Gemini 2.5 Flash',
                category: 'system'
            },
            {
                key: 'appVersion',
                label: 'App Version',
                source: 'system',
                description: 'BubbleVoice version number',
                example: '1.0.0',
                category: 'system'
            },
            {
                key: 'areasList',
                label: 'Life Areas List',
                source: 'database',
                description: 'Comma-separated list of life area names',
                example: 'Family, Work, Health, Personal Growth',
                category: 'context'
            },
            {
                key: 'dayOfWeek',
                label: 'Day of Week',
                source: 'runtime',
                description: 'Current day name',
                example: 'Friday',
                category: 'time'
            },
            {
                key: 'timeOfDay',
                label: 'Time of Day Period',
                source: 'runtime',
                description: 'Morning, afternoon, evening, or night',
                example: 'afternoon',
                category: 'time'
            }
        ];
    }
    
    /**
     * GET DEFAULT BLOCKS
     * 
     * Returns the default block configuration — the initial layout of the prompt.
     * This mirrors the current 8-section prompt structure from PromptManagementService
     * but adds the programmatic/RAG blocks in their logical positions.
     * 
     * **Technical**: Each block has a type (text/programmatic), an id, label, content,
     * and various flags (enabled, locked, collapsed).
     * 
     * **Why**: The default block order places programmatic context injection points
     * where they make the most sense in the prompt flow — RAG context after the
     * personality sections, conversation history before response format, etc.
     * 
     * **Product**: Users start with a sensible default and can customize from there.
     * The visual layout immediately shows them "oh, THIS is where my conversation
     * history gets injected" — demystifying the AI's behavior.
     * 
     * **History**: Block order derived from how LLMService.buildSharedContextPrefix()
     * and ContextAssemblyService.formatContextForPrompt() assemble the final prompt.
     */
    getDefaultBlocks() {
        return [
            {
                id: 'purpose',
                type: 'text',
                label: 'Purpose & Identity',
                icon: '💜',
                content: '',  // Will be filled from PromptManagementService
                description: 'Defines the AI\'s core identity, role, and personality. This is the first thing the AI "reads" about itself.',
                locked: false,
                collapsed: false
            },
            {
                id: 'approach',
                type: 'text',
                label: 'Approach & Style',
                icon: '🗣️',
                content: '',
                description: 'Guidelines for how the AI communicates — empathy level, question style, tone. Shapes every response.',
                locked: false,
                collapsed: false
            },
            {
                id: 'lifeAreas',
                type: 'text',
                label: 'Life Areas System',
                icon: '📂',
                content: '',
                description: 'Instructions for the hierarchical memory system. Tells the AI when/how to create areas and entries.',
                locked: false,
                collapsed: false
            },
            {
                id: 'rag_aiNotes',
                type: 'programmatic',
                label: 'AI Notes & Observations',
                icon: '🧠',
                description: 'Internal notes from past conversations — AI\'s observations, insights, and things to remember. Auto-populated from ConversationStorageService.',
                enabled: true,
                locked: true,
                source: 'ContextAssemblyService → aiNotes',
                previewText: '=== AI NOTES (Internal Context) ===\n[Up to 500 lines of AI observations from past conversations, newest first.\nIncludes patterns noticed, emotional themes, and important facts.]',
                runtimeBehavior: 'Injected via buildSharedContextPrefix() from conversation.ragContext'
            },
            {
                id: 'rag_knowledgeTree',
                type: 'programmatic',
                label: 'Knowledge Tree',
                icon: '🌳',
                description: 'Hierarchical structure of all life areas — shows the AI what topics exist and how they\'re organized. Generated from AreaManagerService.',
                enabled: true,
                locked: true,
                source: 'AreaManagerService → generateAreasTree()',
                previewText: '=== KNOWLEDGE TREE ===\n📁 Family\n  📁 Emma_School\n    📄 reading_comprehension.md\n  📁 Mom\n📁 Work\n  📁 Startup\n    📄 fundraising.md\n📁 Health\n  📄 exercise_goals.md',
                runtimeBehavior: 'Injected via buildSharedContextPrefix() from conversation.ragContext'
            },
            {
                id: 'rag_vectorResults',
                type: 'programmatic',
                label: 'Vector Search Results',
                icon: '🔍',
                description: 'Relevant context from past conversations found via multi-query semantic search. Weighted by recency, topic relevance, and area match.',
                enabled: true,
                locked: true,
                source: 'ContextAssemblyService → runMultiQuerySearch()',
                previewText: '=== RELEVANT CONTEXT (Vector Search) ===\n[1] Family/Emma_School/reading_comprehension.md\n    Timestamp: 2026-02-05\n    Sentiment: concerned\n    "Emma struggling with reading comprehension..."\n    User: "Her teacher said she can decode but doesn\'t remember"\n\n[2] Work/Startup/fundraising.md\n    ...',
                runtimeBehavior: 'Multi-query: Recent inputs (3.0x weight) + All inputs (1.5x) + Full conversation (0.5x). Top 10 results.'
            },
            {
                id: 'rag_conversationHistory',
                type: 'programmatic',
                label: 'Conversation History',
                icon: '💬',
                description: 'Recent messages from the current conversation — last 20 turns with timestamps. Gives the AI immediate conversational context.',
                enabled: true,
                locked: true,
                source: 'ContextAssemblyService → getConversationHistory()',
                previewText: '=== CONVERSATION HISTORY ===\n[Turn 1 — 3:30 PM]\nUser: "I\'m worried about Emma\'s reading"\nAssistant: "That sounds stressful. Tell me more..."\n\n[Turn 2 — 3:32 PM]\nUser: "Her teacher said..."\nAssistant: "I understand your concern..."',
                runtimeBehavior: 'Last 20 turns with timestamps, injected via buildSharedContextPrefix()'
            },
            {
                id: 'responseFormat',
                type: 'text',
                label: 'Response Format',
                icon: '📋',
                content: '',
                description: 'Defines the exact JSON structure the AI must output. Critical for structured responses — area actions, artifacts, bubbles.',
                locked: false,
                collapsed: false
            },
            {
                id: 'areaActionsGuidelines',
                type: 'text',
                label: 'Area Actions Rules',
                icon: '📝',
                content: '',
                description: 'Specific rules for creating and updating life areas. Ensures data consistency and meaningful memory entries.',
                locked: false,
                collapsed: false
            },
            {
                id: 'artifactGuidelines',
                type: 'text',
                label: 'Artifact Guidelines',
                icon: '🎨',
                content: '',
                description: 'Rules for generating visual HTML artifacts — when to create them, styling standards, and types available.',
                locked: false,
                collapsed: false
            },
            {
                id: 'exampleResponse',
                type: 'text',
                label: 'Example Response',
                icon: '💡',
                content: '',
                description: 'A complete example showing the AI exactly what correct output looks like. Few-shot learning — very important for consistency.',
                locked: false,
                collapsed: false
            },
            {
                id: 'importantNotes',
                type: 'text',
                label: 'Important Notes',
                icon: '⚠️',
                content: '',
                description: 'Final critical reminders and rules. Reinforced at the end of the prompt for recency bias in attention.',
                locked: false,
                collapsed: false
            },
            {
                id: 'rag_artifactContext',
                type: 'programmatic',
                label: 'Current Artifact Context',
                icon: '🖼️',
                description: 'When an artifact is displayed, this block injects its ID, type, and content summary so the AI can update/modify it correctly.',
                enabled: true,
                locked: true,
                source: 'conversation.currentArtifact',
                previewText: '[CURRENT ARTIFACT DISPLAYED]\n================================\nARTIFACT ID: comparison_card_1738900000\nTYPE: comparison_card\nCONTENT: Visual comparison of two options\n================================\n[Includes editing rules for update vs create vs none]',
                runtimeBehavior: 'Conditional — only injected when an artifact is currently displayed in the UI',
                conditional: true
            },
            {
                id: 'rag_designPrompt',
                type: 'programmatic',
                label: 'Visual Design Standards',
                icon: '🎭',
                description: 'CSS styling instructions for HTML artifacts — color palettes, liquid glass effects, typography, shadows. Only injected when artifact work is needed.',
                enabled: true,
                locked: true,
                source: 'LLMService → getArtifactDesignPrompt()',
                previewText: '**VISUAL DESIGN STANDARDS FOR HTML ARTIFACTS:**\nAll artifacts must look premium and marketing-polished...\n\nColor Palettes:\n- Purple/Violet: #667eea → #764ba2\n- Teal/Cyan: #11998e → #38ef7d\n\nLiquid Glass Styling:\nbackground: rgba(255,255,255,0.15);\nbackdrop-filter: blur(20px);',
                runtimeBehavior: 'Conditional — only injected when conversation.currentArtifact exists. Saves ~2000 tokens on casual turns.',
                conditional: true
            }
        ];
    }
    
    /**
     * RENDER
     * 
     * Renders the complete visual prompt editor into this.element.
     * Builds the toolbar, block list, variable palette, and preview area.
     * 
     * **Technical**: Uses innerHTML for initial render, then attaches event listeners.
     * Block list is re-rendered on data changes via renderBlocks().
     * 
     * **Why**: Full re-render on data load, incremental updates on edits.
     * **Product**: Immediate visual feedback, smooth interactions.
     */
    render() {
        this.element.innerHTML = `
            <!-- 
                EDITOR TOOLBAR
                Contains mode toggle (Edit/Preview), template picker trigger,
                and action buttons (Reset, Save). Fixed at top of editor.
            -->
            <div class="vpe-toolbar">
                <div class="vpe-toolbar-left">
                    <button class="vpe-mode-btn active" data-mode="edit" title="Edit prompt blocks">
                        <span class="vpe-mode-icon">✏️</span> Edit
                    </button>
                    <button class="vpe-mode-btn" data-mode="preview" title="Preview assembled prompt">
                        <span class="vpe-mode-icon">👁️</span> Preview
                    </button>
                </div>
                <div class="vpe-toolbar-center">
                    <div class="vpe-block-count">
                        <span id="vpe-text-count">0</span> text blocks · 
                        <span id="vpe-prog-count">0</span> runtime blocks · 
                        <span id="vpe-var-count">0</span> variables used
                    </div>
                </div>
                <div class="vpe-toolbar-right">
                    <button class="vpe-action-btn vpe-add-text-btn" id="vpe-add-text-block" title="Add new text block">
                        + Text Block
                    </button>
                    <button class="vpe-action-btn vpe-reset-btn" id="vpe-reset-all" title="Reset all to defaults">
                        Reset All
                    </button>
                </div>
            </div>
            
            <!-- 
                EDITOR BODY
                Contains the block list (edit mode) or assembled preview (preview mode).
                Blocks are rendered dynamically via renderBlocks().
            -->
            <div class="vpe-body">
                <!-- Edit mode: block list -->
                <div class="vpe-block-list" id="vpe-block-list">
                    <!-- Blocks rendered dynamically -->
                </div>
                
                <!-- Preview mode: assembled prompt -->
                <div class="vpe-preview" id="vpe-preview" style="display: none;">
                    <div class="vpe-preview-content" id="vpe-preview-content">
                        <!-- Assembled prompt rendered here -->
                    </div>
                </div>
            </div>
            
            <!-- 
                VARIABLE PALETTE (floating)
                Shows available variables grouped by category.
                Appears when user clicks "Insert Variable" on a text block.
                Clicking a variable inserts {{variableName}} at cursor position.
            -->
            <div class="vpe-variable-palette" id="vpe-variable-palette" style="display: none;">
                <div class="vpe-palette-header">
                    <h4>Insert Variable</h4>
                    <button class="vpe-palette-close" id="vpe-palette-close">×</button>
                </div>
                <div class="vpe-palette-body" id="vpe-palette-body">
                    <!-- Variables rendered dynamically -->
                </div>
            </div>
        `;
        
        this.setupEventListeners();
        this.renderBlocks();
        this.renderVariablePalette();
        this.updateBlockCounts();
    }
    
    /**
     * SETUP EVENT LISTENERS
     * 
     * Attaches all top-level event listeners for the editor.
     * 
     * **Technical**: Uses event delegation on the block list for block-level events
     * (drag, click, input). Toolbar buttons get direct listeners.
     * 
     * **Why**: Event delegation means we don't need to re-attach listeners
     * when blocks are re-rendered. Single listener handles all blocks.
     */
    setupEventListeners() {
        // Mode toggle buttons (Edit / Preview)
        this.element.querySelectorAll('.vpe-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.setMode(mode);
            });
        });
        
        // Add text block button
        this.element.querySelector('#vpe-add-text-block').addEventListener('click', () => {
            this.addTextBlock();
        });
        
        // Reset all button
        this.element.querySelector('#vpe-reset-all').addEventListener('click', async () => {
            const confirmed = await window.app?.showConfirm(
                'Reset All Blocks',
                'Reset the entire prompt layout to defaults? Custom text and block ordering will be lost.',
                'Reset'
            );
            if (confirmed) {
                this.resetToDefaults();
            }
        });
        
        // Variable palette close
        this.element.querySelector('#vpe-palette-close').addEventListener('click', () => {
            this.hideVariablePalette();
        });
        
        // Close palette on outside click
        document.addEventListener('click', (e) => {
            const palette = this.element.querySelector('#vpe-variable-palette');
            if (palette && palette.style.display !== 'none' && 
                !palette.contains(e.target) && 
                !e.target.classList.contains('vpe-insert-var-btn')) {
                this.hideVariablePalette();
            }
        });
        
        // Block list event delegation for drag-and-drop and block actions
        const blockList = this.element.querySelector('#vpe-block-list');
        
        blockList.addEventListener('dragstart', (e) => {
            const blockEl = e.target.closest('.vpe-block');
            if (blockEl) {
                this.dragState.draggedBlockId = blockEl.dataset.blockId;
                blockEl.classList.add('vpe-dragging');
                e.dataTransfer.effectAllowed = 'move';
                // Needed for Firefox
                e.dataTransfer.setData('text/plain', blockEl.dataset.blockId);
            }
        });
        
        blockList.addEventListener('dragend', (e) => {
            const blockEl = e.target.closest('.vpe-block');
            if (blockEl) {
                blockEl.classList.remove('vpe-dragging');
                this.clearDropIndicators();
                this.dragState.draggedBlockId = null;
                this.dragState.dragOverBlockId = null;
            }
        });
        
        blockList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const blockEl = e.target.closest('.vpe-block');
            if (blockEl && blockEl.dataset.blockId !== this.dragState.draggedBlockId) {
                const rect = blockEl.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const position = e.clientY < midY ? 'before' : 'after';
                
                this.clearDropIndicators();
                blockEl.classList.add(position === 'before' ? 'vpe-drop-before' : 'vpe-drop-after');
                
                this.dragState.dragOverBlockId = blockEl.dataset.blockId;
                this.dragState.dragOverPosition = position;
            }
        });
        
        blockList.addEventListener('dragleave', (e) => {
            const blockEl = e.target.closest('.vpe-block');
            if (blockEl) {
                blockEl.classList.remove('vpe-drop-before', 'vpe-drop-after');
            }
        });
        
        blockList.addEventListener('drop', (e) => {
            e.preventDefault();
            this.clearDropIndicators();
            
            if (this.dragState.draggedBlockId && this.dragState.dragOverBlockId) {
                this.moveBlock(
                    this.dragState.draggedBlockId,
                    this.dragState.dragOverBlockId,
                    this.dragState.dragOverPosition
                );
            }
            
            this.dragState.draggedBlockId = null;
            this.dragState.dragOverBlockId = null;
        });
    }
    
    /**
     * SET MODE
     * 
     * Switches between Edit and Preview modes.
     * 
     * **Technical**: In edit mode, shows the block list with editable blocks.
     * In preview mode, assembles the full prompt with variables rendered as chips
     * and programmatic blocks shown as highlighted sections.
     * 
     * @param {string} mode - 'edit' or 'preview'
     */
    setMode(mode) {
        this.previewMode = mode === 'preview';
        
        // Update toolbar buttons
        this.element.querySelectorAll('.vpe-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Toggle views
        const blockList = this.element.querySelector('#vpe-block-list');
        const preview = this.element.querySelector('#vpe-preview');
        
        if (this.previewMode) {
            blockList.style.display = 'none';
            preview.style.display = 'block';
            this.renderPreview();
        } else {
            blockList.style.display = 'block';
            preview.style.display = 'none';
        }
    }
    
    /**
     * RENDER BLOCKS
     * 
     * Renders all blocks in the block list.
     * Each block is rendered as a draggable visual element with appropriate
     * controls based on its type (text vs programmatic).
     * 
     * **Technical**: Iterates over this.blocks and creates DOM elements.
     * Text blocks get textareas, programmatic blocks get toggle switches.
     * All blocks get drag handles and collapse toggles.
     * 
     * **Why**: Full re-render ensures DOM matches data. Called on load and
     * after reordering. Individual block edits update in-place via events.
     */
    renderBlocks() {
        const blockList = this.element.querySelector('#vpe-block-list');
        if (!blockList) return;
        
        blockList.innerHTML = '';
        
        this.blocks.forEach((block, index) => {
            const blockEl = document.createElement('div');
            blockEl.className = `vpe-block vpe-block-${block.type}${block.collapsed ? ' collapsed' : ''}${block.type === 'programmatic' && !block.enabled ? ' disabled' : ''}${block.conditional ? ' conditional' : ''}`;
            blockEl.dataset.blockId = block.id;
            blockEl.draggable = true;
            
            if (block.type === 'text') {
                blockEl.innerHTML = this.renderTextBlock(block, index);
            } else {
                blockEl.innerHTML = this.renderProgrammaticBlock(block, index);
            }
            
            blockList.appendChild(blockEl);
            
            // Auto-grow textarea after adding to DOM
            if (block.type === 'text' && !block.collapsed) {
                const textarea = blockEl.querySelector('.vpe-block-textarea');
                if (textarea) {
                    this.autoGrowTextarea(textarea);
                    
                    // Input handler for auto-grow and change detection
                    textarea.addEventListener('input', () => {
                        this.autoGrowTextarea(textarea);
                        block.content = textarea.value;
                        this.updateBlockCounts();
                        this.notifyChange();
                    });
                }
            }
            
            // Toggle collapse
            const collapseBtn = blockEl.querySelector('.vpe-collapse-btn');
            if (collapseBtn) {
                collapseBtn.addEventListener('click', () => {
                    block.collapsed = !block.collapsed;
                    this.renderBlocks();
                    this.notifyChange();
                });
            }
            
            // Toggle enable (programmatic blocks)
            const toggleBtn = blockEl.querySelector('.vpe-toggle-switch');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    block.enabled = !block.enabled;
                    blockEl.classList.toggle('disabled', !block.enabled);
                    toggleBtn.classList.toggle('active', block.enabled);
                    this.updateBlockCounts();
                    this.notifyChange();
                });
            }
            
            // Insert variable button
            const insertVarBtn = blockEl.querySelector('.vpe-insert-var-btn');
            if (insertVarBtn) {
                insertVarBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.variablePaletteTarget = block.id;
                    this.showVariablePalette(insertVarBtn);
                });
            }
            
            // Delete block button (only for non-locked blocks)
            const deleteBtn = blockEl.querySelector('.vpe-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    const confirmed = await window.app?.showConfirm(
                        'Delete Block',
                        `Delete the "${block.label}" block? This cannot be undone.`,
                        'Delete'
                    );
                    if (confirmed) {
                        this.deleteBlock(block.id);
                    }
                });
            }
            
            // Expand preview (programmatic blocks)
            const expandBtn = blockEl.querySelector('.vpe-expand-preview-btn');
            if (expandBtn) {
                expandBtn.addEventListener('click', () => {
                    const previewEl = blockEl.querySelector('.vpe-prog-preview');
                    if (previewEl) {
                        previewEl.classList.toggle('expanded');
                        expandBtn.textContent = previewEl.classList.contains('expanded') ? 'Hide Preview' : 'Show Preview';
                    }
                });
            }
        });
    }
    
    /**
     * RENDER TEXT BLOCK
     * 
     * Returns the HTML for a user-editable text block.
     * 
     * **Technical**: Contains a header with label/icon/controls, an auto-growing
     * textarea with the block content, and an "Insert Variable" button.
     * Variables in the content ({{varName}}) are highlighted in the textarea
     * via a transparent overlay (CSS trick).
     * 
     * @param {Object} block - The text block data
     * @param {number} index - Block index in the array
     * @returns {string} HTML string
     */
    renderTextBlock(block, index) {
        const variableChips = this.extractVariables(block.content);
        const hasVariables = variableChips.length > 0;
        
        return `
            <div class="vpe-block-header">
                <div class="vpe-drag-handle" title="Drag to reorder">⋮⋮</div>
                <span class="vpe-block-icon">${block.icon || '📝'}</span>
                <span class="vpe-block-label">${block.label}</span>
                ${hasVariables ? `<span class="vpe-var-badge">${variableChips.length} var${variableChips.length > 1 ? 's' : ''}</span>` : ''}
                <div class="vpe-block-controls">
                    <button class="vpe-insert-var-btn" title="Insert variable">{{ }}</button>
                    <button class="vpe-collapse-btn" title="${block.collapsed ? 'Expand' : 'Collapse'}">${block.collapsed ? '▶' : '▼'}</button>
                    ${!block.locked ? '<button class="vpe-delete-btn" title="Delete block">🗑️</button>' : ''}
                </div>
            </div>
            ${!block.collapsed ? `
                <div class="vpe-block-body">
                    <p class="vpe-block-description">${block.description}</p>
                    <div class="vpe-textarea-wrapper">
                        <textarea 
                            class="vpe-block-textarea"
                            placeholder="Enter prompt text here. Use {{variableName}} to insert dynamic variables..."
                            spellcheck="false"
                        >${this.escapeHtml(block.content || '')}</textarea>
                        <div class="vpe-textarea-overlay" id="vpe-overlay-${block.id}"></div>
                    </div>
                    ${hasVariables ? `
                        <div class="vpe-variable-chips">
                            ${variableChips.map(v => `<span class="vpe-chip" title="${this.getVariableDescription(v)}">{{${v}}}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        `;
    }
    
    /**
     * RENDER PROGRAMMATIC BLOCK
     * 
     * Returns the HTML for a runtime-injected programmatic block.
     * These blocks represent data that gets injected at runtime (RAG context,
     * vector results, conversation history, etc.) and are shown as visual
     * elements the user can enable/disable and reorder.
     * 
     * **Technical**: Contains a header with icon/label/toggle, a description,
     * source info, and an expandable preview showing example content.
     * 
     * @param {Object} block - The programmatic block data
     * @param {number} index - Block index in the array
     * @returns {string} HTML string
     */
    renderProgrammaticBlock(block, index) {
        return `
            <div class="vpe-block-header">
                <div class="vpe-drag-handle" title="Drag to reorder">⋮⋮</div>
                <span class="vpe-block-icon">${block.icon || '⚙️'}</span>
                <span class="vpe-block-label">${block.label}</span>
                ${block.conditional ? '<span class="vpe-conditional-badge">Conditional</span>' : ''}
                <div class="vpe-block-controls">
                    <div class="vpe-toggle-switch ${block.enabled ? 'active' : ''}" title="${block.enabled ? 'Enabled' : 'Disabled'}">
                        <div class="vpe-toggle-thumb"></div>
                    </div>
                    <button class="vpe-collapse-btn" title="${block.collapsed ? 'Expand' : 'Collapse'}">${block.collapsed ? '▶' : '▼'}</button>
                </div>
            </div>
            ${!block.collapsed ? `
                <div class="vpe-block-body">
                    <p class="vpe-block-description">${block.description}</p>
                    <div class="vpe-prog-meta">
                        <div class="vpe-prog-source">
                            <span class="vpe-meta-label">Source:</span>
                            <code>${block.source}</code>
                        </div>
                        <div class="vpe-prog-behavior">
                            <span class="vpe-meta-label">Behavior:</span>
                            <span>${block.runtimeBehavior}</span>
                        </div>
                    </div>
                    <div class="vpe-prog-preview">
                        <div class="vpe-prog-preview-header">
                            <span>Example Content Preview</span>
                            <button class="vpe-expand-preview-btn">Show Preview</button>
                        </div>
                        <pre class="vpe-prog-preview-content">${this.escapeHtml(block.previewText || '')}</pre>
                    </div>
                </div>
            ` : ''}
        `;
    }
    
    /**
     * RENDER PREVIEW
     * 
     * Renders the assembled prompt in preview mode.
     * Shows the full prompt as it would appear when sent to the LLM,
     * with variables rendered as colored chips and programmatic blocks
     * as highlighted sections.
     * 
     * **Technical**: Iterates blocks in order, concatenates text content,
     * and injects programmatic block placeholders. Variables are rendered
     * as <span> chip elements with their example values.
     */
    renderPreview() {
        const previewEl = this.element.querySelector('#vpe-preview-content');
        if (!previewEl) return;
        
        let html = '';
        
        this.blocks.forEach(block => {
            if (block.type === 'text') {
                let content = block.content || '';
                // Render variables as chips with example values
                content = this.escapeHtml(content).replace(
                    /\{\{(\w+)\}\}/g,
                    (match, varName) => {
                        const variable = this.availableVariables.find(v => v.key === varName);
                        if (variable) {
                            return `<span class="vpe-preview-chip" title="Variable: ${varName}">${variable.example}</span>`;
                        }
                        return `<span class="vpe-preview-chip unknown" title="Unknown variable: ${varName}">{{${varName}}}</span>`;
                    }
                );
                html += `
                    <div class="vpe-preview-section vpe-preview-text">
                        <div class="vpe-preview-section-label">${block.icon} ${block.label}</div>
                        <div class="vpe-preview-section-content">${content}</div>
                    </div>
                `;
            } else if (block.type === 'programmatic' && block.enabled) {
                html += `
                    <div class="vpe-preview-section vpe-preview-programmatic${block.conditional ? ' conditional' : ''}">
                        <div class="vpe-preview-section-label">
                            ${block.icon} ${block.label}
                            ${block.conditional ? '<span class="vpe-conditional-tag">injected when needed</span>' : '<span class="vpe-always-tag">always injected</span>'}
                        </div>
                        <pre class="vpe-preview-section-content">${this.escapeHtml(block.previewText || '')}</pre>
                    </div>
                `;
            } else if (block.type === 'programmatic' && !block.enabled) {
                html += `
                    <div class="vpe-preview-section vpe-preview-disabled">
                        <div class="vpe-preview-section-label">
                            ${block.icon} ${block.label} <span class="vpe-disabled-tag">disabled</span>
                        </div>
                    </div>
                `;
            }
        });
        
        previewEl.innerHTML = html;
    }
    
    /**
     * RENDER VARIABLE PALETTE
     * 
     * Populates the floating variable palette with available variables
     * grouped by category (time, user, stats, system, context).
     * 
     * **Technical**: Groups variables by category and renders each group
     * as a section with clickable variable items.
     * 
     * **Why**: Grouped presentation makes it easy to find the right variable
     * without scrolling through a flat list.
     */
    renderVariablePalette() {
        const body = this.element.querySelector('#vpe-palette-body');
        if (!body) return;
        
        const categories = {};
        this.availableVariables.forEach(v => {
            if (!categories[v.category]) categories[v.category] = [];
            categories[v.category].push(v);
        });
        
        const categoryLabels = {
            time: '🕐 Time & Date',
            user: '👤 User',
            stats: '📊 Statistics',
            system: '⚙️ System',
            context: '📎 Context'
        };
        
        let html = '';
        for (const [cat, vars] of Object.entries(categories)) {
            html += `
                <div class="vpe-palette-group">
                    <div class="vpe-palette-group-label">${categoryLabels[cat] || cat}</div>
                    ${vars.map(v => `
                        <button class="vpe-palette-item" data-variable="${v.key}" title="${v.description}">
                            <span class="vpe-palette-item-chip">{{${v.key}}}</span>
                            <span class="vpe-palette-item-label">${v.label}</span>
                            <span class="vpe-palette-item-example">${v.example}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }
        
        body.innerHTML = html;
        
        // Attach click handlers to palette items
        body.querySelectorAll('.vpe-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const varKey = item.dataset.variable;
                this.insertVariable(varKey);
                this.hideVariablePalette();
            });
        });
    }
    
    /**
     * SHOW VARIABLE PALETTE
     * 
     * Positions and shows the floating variable palette near the trigger button.
     * 
     * @param {HTMLElement} triggerBtn - The button that was clicked
     */
    showVariablePalette(triggerBtn) {
        const palette = this.element.querySelector('#vpe-variable-palette');
        if (!palette) return;
        
        const rect = triggerBtn.getBoundingClientRect();
        const editorRect = this.element.getBoundingClientRect();
        
        palette.style.display = 'block';
        palette.style.top = `${rect.bottom - editorRect.top + 8}px`;
        palette.style.left = `${Math.min(rect.left - editorRect.left, editorRect.width - 340)}px`;
    }
    
    /**
     * HIDE VARIABLE PALETTE
     */
    hideVariablePalette() {
        const palette = this.element.querySelector('#vpe-variable-palette');
        if (palette) palette.style.display = 'none';
        this.variablePaletteTarget = null;
    }
    
    /**
     * INSERT VARIABLE
     * 
     * Inserts a {{variableName}} placeholder at the cursor position in the
     * currently targeted text block's textarea.
     * 
     * **Technical**: Finds the textarea for the target block, inserts text
     * at the current selection/cursor position.
     * 
     * @param {string} varKey - The variable key to insert
     */
    insertVariable(varKey) {
        if (!this.variablePaletteTarget) return;
        
        const block = this.blocks.find(b => b.id === this.variablePaletteTarget);
        if (!block || block.type !== 'text') return;
        
        const blockEl = this.element.querySelector(`[data-block-id="${block.id}"]`);
        if (!blockEl) return;
        
        const textarea = blockEl.querySelector('.vpe-block-textarea');
        if (!textarea) return;
        
        const insertText = `{{${varKey}}}`;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        textarea.value = text.substring(0, start) + insertText + text.substring(end);
        block.content = textarea.value;
        
        // Move cursor after inserted text
        const newPos = start + insertText.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
        
        this.autoGrowTextarea(textarea);
        this.updateBlockCounts();
        this.notifyChange();
        
        // Re-render to update variable chips display
        // (slight delay so textarea doesn't lose focus)
        setTimeout(() => this.renderBlocks(), 100);
    }
    
    /**
     * MOVE BLOCK
     * 
     * Moves a block to a new position relative to another block.
     * This is the core of the drag-and-drop reordering system.
     * 
     * **Technical**: Removes the block from its current position and inserts
     * it before or after the target block.
     * 
     * @param {string} draggedId - ID of the block being moved
     * @param {string} targetId - ID of the block it's being dropped on
     * @param {string} position - 'before' or 'after'
     */
    moveBlock(draggedId, targetId, position) {
        const draggedIndex = this.blocks.findIndex(b => b.id === draggedId);
        const targetIndex = this.blocks.findIndex(b => b.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Remove dragged block
        const [draggedBlock] = this.blocks.splice(draggedIndex, 1);
        
        // Find new target index (may have shifted after removal)
        let newTargetIndex = this.blocks.findIndex(b => b.id === targetId);
        if (position === 'after') newTargetIndex++;
        
        // Insert at new position
        this.blocks.splice(newTargetIndex, 0, draggedBlock);
        
        this.renderBlocks();
        this.updateBlockCounts();
        this.notifyChange();
    }
    
    /**
     * ADD TEXT BLOCK
     * 
     * Adds a new empty text block at the end of the block list.
     * Users can then drag it to the desired position.
     * 
     * **Product**: Lets users add custom instruction sections anywhere
     * in the prompt flow.
     */
    addTextBlock() {
        const newBlock = {
            id: `custom_${Date.now()}`,
            type: 'text',
            label: 'Custom Section',
            icon: '✍️',
            content: '',
            description: 'A custom text section you added. Type your instructions here.',
            locked: false,
            collapsed: false
        };
        
        this.blocks.push(newBlock);
        this.renderBlocks();
        this.updateBlockCounts();
        this.notifyChange();
        
        // Scroll to the new block and focus its textarea
        setTimeout(() => {
            const blockEl = this.element.querySelector(`[data-block-id="${newBlock.id}"]`);
            if (blockEl) {
                blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const textarea = blockEl.querySelector('.vpe-block-textarea');
                if (textarea) textarea.focus();
            }
        }, 100);
    }
    
    /**
     * DELETE BLOCK
     * 
     * Removes a block from the list. Only works on non-locked blocks.
     * 
     * @param {string} blockId - ID of the block to delete
     */
    deleteBlock(blockId) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block || block.locked) return;
        
        this.blocks = this.blocks.filter(b => b.id !== blockId);
        this.renderBlocks();
        this.updateBlockCounts();
        this.notifyChange();
    }
    
    /**
     * LOAD DATA
     * 
     * Loads block configuration from the backend.
     * If a block-based config exists, uses it. Otherwise, creates
     * the default block layout and populates text blocks from the
     * existing section-based prompts.
     * 
     * **Technical**: Calls IPC to get both the block config and section data.
     * Merges them to handle migration from the old section-based format.
     * 
     * **Why**: Backward compatibility — existing users who customized sections
     * should see their customizations in the new block editor.
     * 
     * @param {Object} sections - Prompt sections from PromptManagementService.getAllSections()
     * @param {Object} blockConfig - Saved block configuration (may be null on first use)
     */
    loadData(sections, blockConfig) {
        if (blockConfig && blockConfig.blocks && blockConfig.blocks.length > 0) {
            // Use saved block configuration
            this.blocks = blockConfig.blocks;
            
            // Ensure all default programmatic blocks exist (in case new ones were added)
            const defaultBlocks = this.getDefaultBlocks();
            const existingIds = this.blocks.map(b => b.id);
            defaultBlocks.forEach(defaultBlock => {
                if (defaultBlock.type === 'programmatic' && !existingIds.includes(defaultBlock.id)) {
                    this.blocks.push(defaultBlock);
                }
            });
        } else {
            // First time: create default blocks and populate from sections
            this.blocks = this.getDefaultBlocks();
            
            if (sections) {
                // Map section data to text blocks
                const sectionMapping = {
                    purpose: 'purpose',
                    approach: 'approach',
                    lifeAreas: 'lifeAreas',
                    responseFormat: 'responseFormat',
                    areaActionsGuidelines: 'areaActionsGuidelines',
                    artifactGuidelines: 'artifactGuidelines',
                    exampleResponse: 'exampleResponse',
                    importantNotes: 'importantNotes'
                };
                
                for (const [sectionKey, blockId] of Object.entries(sectionMapping)) {
                    const block = this.blocks.find(b => b.id === blockId);
                    const section = sections[sectionKey];
                    if (block && section) {
                        block.content = section.content || '';
                    }
                }
            }
        }
        
        this.renderBlocks();
        this.updateBlockCounts();
    }
    
    /**
     * GET SAVE DATA
     * 
     * Returns the current block configuration for saving to the backend.
     * 
     * @returns {Object} Block configuration object with blocks array
     */
    getSaveData() {
        return {
            blocks: this.blocks.map(block => ({
                id: block.id,
                type: block.type,
                label: block.label,
                icon: block.icon,
                content: block.type === 'text' ? block.content : undefined,
                description: block.description,
                locked: block.locked,
                collapsed: block.collapsed,
                enabled: block.type === 'programmatic' ? block.enabled : undefined,
                source: block.source,
                previewText: block.previewText,
                runtimeBehavior: block.runtimeBehavior,
                conditional: block.conditional
            })),
            version: '2.0.0',
            lastModified: new Date().toISOString()
        };
    }
    
    /**
     * RESET TO DEFAULTS
     * 
     * Resets the entire block configuration to defaults.
     */
    resetToDefaults() {
        this.blocks = this.getDefaultBlocks();
        this.renderBlocks();
        this.updateBlockCounts();
        this.notifyChange();
    }
    
    /**
     * APPLY TEMPLATE
     * 
     * Applies a template configuration, replacing text block content
     * while preserving programmatic blocks and their ordering.
     * 
     * **Technical**: Templates specify text content for the standard sections
     * and optionally a custom block order. Programmatic blocks are preserved.
     * 
     * @param {Object} template - Template object with blocks configuration
     */
    applyTemplate(template) {
        if (template.blocks) {
            // Template provides full block configuration
            this.blocks = JSON.parse(JSON.stringify(template.blocks));
            
            // Ensure all programmatic blocks exist
            const defaultBlocks = this.getDefaultBlocks();
            const existingIds = this.blocks.map(b => b.id);
            defaultBlocks.forEach(defaultBlock => {
                if (defaultBlock.type === 'programmatic' && !existingIds.includes(defaultBlock.id)) {
                    this.blocks.push(defaultBlock);
                }
            });
        } else if (template.sections) {
            // Template only specifies section content, keep current block order
            for (const [sectionId, content] of Object.entries(template.sections)) {
                const block = this.blocks.find(b => b.id === sectionId);
                if (block && block.type === 'text') {
                    block.content = content;
                }
            }
        }
        
        this.renderBlocks();
        this.updateBlockCounts();
        this.notifyChange();
    }
    
    /**
     * EXTRACT VARIABLES
     * 
     * Finds all {{variableName}} occurrences in a text string.
     * 
     * @param {string} text - Text to search
     * @returns {string[]} Array of variable names found
     */
    extractVariables(text) {
        if (!text) return [];
        const matches = text.match(/\{\{(\w+)\}\}/g);
        if (!matches) return [];
        return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
    }
    
    /**
     * GET VARIABLE DESCRIPTION
     * 
     * Returns the description for a variable by its key.
     * 
     * @param {string} varKey - Variable key
     * @returns {string} Description or 'Unknown variable'
     */
    getVariableDescription(varKey) {
        const v = this.availableVariables.find(v => v.key === varKey);
        return v ? `${v.label}: ${v.description}` : 'Unknown variable';
    }
    
    /**
     * AUTO GROW TEXTAREA
     * 
     * Automatically adjusts textarea height to fit its content.
     * 
     * @param {HTMLTextAreaElement} textarea - The textarea element
     */
    autoGrowTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(120, textarea.scrollHeight) + 'px';
    }
    
    /**
     * CLEAR DROP INDICATORS
     * 
     * Removes all drag-and-drop visual indicators from blocks.
     */
    clearDropIndicators() {
        this.element.querySelectorAll('.vpe-drop-before, .vpe-drop-after').forEach(el => {
            el.classList.remove('vpe-drop-before', 'vpe-drop-after');
        });
    }
    
    /**
     * UPDATE BLOCK COUNTS
     * 
     * Updates the counter display in the toolbar showing how many
     * text blocks, programmatic blocks, and variables are in use.
     */
    updateBlockCounts() {
        const textCount = this.blocks.filter(b => b.type === 'text').length;
        const progCount = this.blocks.filter(b => b.type === 'programmatic' && b.enabled).length;
        
        let totalVars = 0;
        this.blocks.forEach(b => {
            if (b.type === 'text' && b.content) {
                totalVars += this.extractVariables(b.content).length;
            }
        });
        
        const textEl = this.element.querySelector('#vpe-text-count');
        const progEl = this.element.querySelector('#vpe-prog-count');
        const varEl = this.element.querySelector('#vpe-var-count');
        
        if (textEl) textEl.textContent = textCount;
        if (progEl) progEl.textContent = progCount;
        if (varEl) varEl.textContent = totalVars;
    }
    
    /**
     * NOTIFY CHANGE
     * 
     * Calls the onChange callback when block data changes.
     * The admin panel uses this to auto-save changes.
     */
    notifyChange() {
        if (this.onChangeCallback) {
            this.onChangeCallback(this.getSaveData());
        }
    }
    
    /**
     * ON CHANGE
     * 
     * Registers a callback for when blocks change.
     * 
     * @param {Function} callback - Called with getSaveData() result
     */
    onChange(callback) {
        this.onChangeCallback = callback;
    }
    
    /**
     * ESCAPE HTML
     * 
     * Escapes HTML special characters to prevent XSS.
     * 
     * @param {string} text - Raw text
     * @returns {string} Escaped text safe for innerHTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in admin-panel.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VisualPromptEditor;
}
