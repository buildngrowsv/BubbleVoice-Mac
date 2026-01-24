# Artifacts & User Data Management - Build & Testing Checklist

**Created**: January 24, 2026  
**Status**: Not Started  
**Estimated Total Time**: 25-35 hours  
**Dependencies**: Core app functional (95% complete per main checklist)

---

## 📊 EXECUTIVE SUMMARY

This checklist covers the implementation and testing of:
1. **Life Areas Hierarchy System** - Persistent memory for user's life domains
2. **Conversation Storage** - 4-file structure with user input isolation
3. **Artifact Management** - HTML/JSON visual artifacts with liquid glass design
4. **Vector Search Integration** - Multi-query semantic search with embeddings
5. **Prompt Context Assembly** - Dynamic token-aware context injection

**Key Innovation**: This system makes AI conversations feel **consequential** by remembering and organizing what matters to the user across Family, Work, Personal Growth, etc.

---

## 🎯 PHASE 1: FOUNDATION INFRASTRUCTURE

### 1.1 Directory Structure Setup
**Estimated Time**: 30 minutes  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create base `user_data/` directory in app data location
- [ ] Create `user_data/life_areas/` directory
- [ ] Create `user_data/conversations/` directory
- [ ] Create `user_data/embeddings/` directory (for vector store)
- [ ] Verify directory permissions are correct
- [ ] Add directory creation to app startup sequence

#### File Structure to Create:
```
user_data/
├── life_areas/
│   └── _AREAS_INDEX.md              # Master index (auto-generated)
├── conversations/
│   └── .gitkeep
└── embeddings/
    └── .gitkeep
```

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Take screenshot of Finder showing directory structure
- [ ] **VERIFY**: Confirm all directories exist with correct permissions
- [ ] **VERIFY**: App can write test file to each directory

#### Success Criteria:
- ✅ All directories created
- ✅ App startup creates missing directories
- ✅ Write permissions verified

---

### 1.2 Database Service (SQLite)
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Install `better-sqlite3` dependency: `npm install better-sqlite3`
- [ ] Create `src/backend/services/DatabaseService.js`
- [ ] Define database schema with migrations
- [ ] Implement CRUD operations

#### Schema Definition:
```sql
-- Conversations table
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON blob for flexible metadata
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT, -- JSON blob (sentiment, topics, etc.)
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Life Areas table
CREATE TABLE life_areas (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_path TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    entry_count INTEGER DEFAULT 0,
    last_activity DATETIME
);

-- Area Entries table
CREATE TABLE area_entries (
    id TEXT PRIMARY KEY,
    area_path TEXT NOT NULL,
    document_name TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    content TEXT NOT NULL,
    user_quote TEXT,
    ai_observation TEXT,
    sentiment TEXT,
    conversation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (area_path) REFERENCES life_areas(path),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Artifacts table
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    html_content TEXT NOT NULL,
    json_data TEXT, -- Optional JSON data for data artifacts
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    turn_number INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- Settings table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### DatabaseService Methods:
```javascript
// Required methods to implement:
class DatabaseService {
    // Database lifecycle
    initialize()
    close()
    runMigrations()
    
    // Conversations
    createConversation(id, title, metadata)
    getConversation(id)
    getAllConversations()
    updateConversation(id, updates)
    deleteConversation(id)
    
    // Messages
    addMessage(conversationId, role, content, metadata)
    getMessages(conversationId, limit, offset)
    getMessageCount(conversationId)
    
    // Life Areas
    createArea(path, name, parentPath, description)
    getArea(path)
    getAllAreas()
    updateArea(path, updates)
    deleteArea(path)
    getAreasTree()
    
    // Area Entries
    addEntry(areaPath, documentName, entry)
    getEntries(areaPath, documentName, limit)
    getRecentEntries(limit)
    searchEntries(query)
    
    // Artifacts
    saveArtifact(conversationId, artifact)
    getArtifact(id)
    getArtifactsByConversation(conversationId)
    deleteArtifact(id)
    
    // Settings
    getSetting(key)
    setSetting(key, value)
    getAllSettings()
}
```

#### Unit Tests:
- [ ] Test: Database initializes without errors
- [ ] Test: Migration runs on empty database
- [ ] Test: CRUD operations for each table
- [ ] Test: Foreign key constraints work
- [ ] Test: Concurrent access doesn't corrupt data
- [ ] Test: Database file persists across restarts

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Show database file in Finder with file size
- [ ] **VERIFY**: Run SQLite viewer (DB Browser for SQLite) to inspect tables
- [ ] **VERIFY**: Sample data inserted and retrieved correctly

#### Success Criteria:
- ✅ Database file created at `user_data/bubblevoice.db`
- ✅ All tables created with correct schema
- ✅ All CRUD operations work
- ✅ Data persists across app restarts

---

## 🎯 PHASE 2: LIFE AREAS SYSTEM

### 2.1 Area Manager Service
**Estimated Time**: 4-5 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create `src/backend/services/AreaManagerService.js`
- [ ] Implement file system operations for markdown files
- [ ] Implement database sync for metadata
- [ ] Create area tree generation for prompt injection

#### Core Methods:
```javascript
class AreaManagerService {
    constructor(databaseService, userDataDir)
    
    // Area Operations
    async initializeLifeAreas()
    async createArea(path, name, description, initialDocuments)
    async getAreaSummary(path)
    async updateAreaSummary(path, updates)
    async deleteArea(path)
    async promoteToSubproject(documentPath, newPath, structure)
    
    // Entry Operations
    async appendEntry(path, documentName, entry)
    async getRecentEntries(path, documentName, count)
    async readForContext(paths)
    
    // Tree Generation
    async generateAreasTree()
    async getAreasTreeCompact()
    
    // Markdown File Operations
    async createMarkdownFile(path, content)
    async readMarkdownFile(path)
    async appendToMarkdownFile(path, content)
    async updateMarkdownSection(path, sectionName, newContent)
}
```

#### Entry Format (Newest First):
```markdown
# Document Name

**Area**: Family/Emma_School  
**Document Type**: Time-Ordered Log  
**Created**: 2026-01-19

---

## Summary (AI-Maintained)

[AI maintains this summary section]

**Frequency**: X entries/week  
**Sentiment Trend**: [trend]  
**Action Items**: [items]

---

## Entries (Newest First)

### 2026-01-24 14:30:00
**Conversation Context**: [context]

[Content of entry]

**User Quote**: "[quote]"

**AI Observation**: [observation]

**Sentiment**: [sentiment]

---

### 2026-01-23 10:15:00
[Previous entry...]
```

#### Unit Tests:
- [ ] Test: Create area with correct folder structure
- [ ] Test: Append entry at TOP (below summary)
- [ ] Test: Generate compact tree (under 300 tokens)
- [ ] Test: Update summary preserves other sections
- [ ] Test: Promote document to subproject
- [ ] Test: Read multiple areas for context

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Show life_areas folder with sample data in Finder
- [ ] **SCREENSHOT**: Open sample markdown file in text editor
- [ ] **VERIFY**: Entry ordering is newest first
- [ ] **VERIFY**: Summary section maintained at top

#### Success Criteria:
- ✅ Areas created with correct structure
- ✅ Entries append at TOP (newest first)
- ✅ Markdown files are human-readable
- ✅ Tree generation under 300 tokens
- ✅ Database sync works correctly

---

### 2.2 Conversation Storage System
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create `src/backend/services/ConversationStorageService.js`
- [ ] Implement 4-file conversation structure
- [ ] Implement user input isolation

#### 4-File Structure:
```
conversations/
└── conv_20260124_143022/
    ├── conversation.md              # Full transcript (user + AI)
    ├── user_inputs.md               # USER INPUTS ONLY ⭐
    ├── conversation_ai_notes.md     # Hidden AI notes (top 500 lines)
    └── conversation_summary.md      # AI-maintained summary
```

#### Methods:
```javascript
class ConversationStorageService {
    constructor(databaseService, conversationsDir)
    
    // Conversation Management
    async createConversation(id)
    async saveConversationTurn(conversationId, userInput, aiResponse, aiNotes, operations)
    async getConversation(conversationId)
    async deleteConversation(conversationId)
    
    // File Operations
    async getFullConversation(conversationId)
    async getUserInputsOnly(conversationId)
    async getAiNotes(conversationId, maxLines)
    async getSummary(conversationId)
    
    // User Input Isolation
    async appendUserInput(conversationId, turnNumber, input, timestamp)
    async getAllUserInputs(conversationId)
    
    // AI Notes (Newest First)
    async appendAiNotes(conversationId, notes)
    async getRecentAiNotes(conversationId, tokenBudget)
}
```

#### User Inputs File Format:
```markdown
# User Inputs Only - conv_20260124_143022

**Started**: 2026-01-24T14:30:22Z
**Last Updated**: 2026-01-24T14:45:33Z
**Total Inputs**: 8

---

## Turn 1 (2026-01-24T14:30:22Z)

I'm really worried about Emma. She's struggling with reading...

---

## Turn 2 (2026-01-24T14:31:45Z)

She's in 2nd grade. Her teacher said she can decode words...

---
```

#### Unit Tests:
- [ ] Test: Create conversation creates all 4 files
- [ ] Test: User inputs isolated correctly (no AI content)
- [ ] Test: AI notes append at top (newest first)
- [ ] Test: Token budget respected for AI notes
- [ ] Test: Conversation can be read back correctly

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Show conversation folder with 4 files
- [ ] **SCREENSHOT**: Open user_inputs.md - verify NO AI responses
- [ ] **SCREENSHOT**: Open conversation.md - verify full dialogue
- [ ] **VERIFY**: Files are human-readable markdown

#### Success Criteria:
- ✅ 4 files created per conversation
- ✅ User inputs completely isolated
- ✅ AI notes are newest-first
- ✅ All files are readable markdown

---

### 2.3 Artifact Manager Service
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create `src/backend/services/ArtifactManagerService.js`
- [ ] Implement HTML + JSON artifact storage
- [ ] Create artifact templates for each type
- [ ] Implement artifact index generation

#### Artifact Types (10 Total):

**Data Artifacts (HTML + JSON):**
1. `goal_tracker` - Progress visualization with milestones
2. `comparison_card` - Side-by-side pros/cons
3. `timeline` - Events over time
4. `decision_matrix` - Weighted scoring grid
5. `progress_chart` - Metrics over time

**Visual Artifacts (HTML only):**
6. `stress_map` - Topic breakdown with intensity
7. `reflection_summary` - Journey recap
8. `mindmap` - Connected concepts
9. `checklist` - Actionable items
10. `celebration_card` - Achievement recognition

#### HTML Quality Standards:
```css
/* Required Liquid Glass Styling */
.artifact-card {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border-radius: 24px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

/* Required Gradient Background */
body {
    background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
}

/* Required Hover States */
.interactive-element:hover {
    transform: translateY(-5px);
    transition: all 0.3s ease;
}

/* Required Typography */
.title {
    font-weight: 700;
    letter-spacing: -0.5px;
}
```

#### Methods:
```javascript
class ArtifactManagerService {
    constructor(databaseService, artifactsDir)
    
    // Artifact CRUD
    async saveArtifact(conversationId, artifactAction)
    async readArtifact(conversationId, artifactId)
    async listArtifacts(conversationId)
    async deleteArtifact(conversationId, artifactId)
    
    // Index Management
    async createArtifactsIndex(conversationId, artifacts)
    async getArtifactsIndex(conversationId)
    
    // Auto-ID Generation (for missing artifact_id)
    generateArtifactId(artifactType)
    
    // Template Rendering
    async renderArtifactTemplate(type, data)
    getArtifactTemplate(type)
}
```

#### Unit Tests:
- [ ] Test: Save artifact creates HTML file
- [ ] Test: Data artifact creates HTML + JSON files
- [ ] Test: Auto-generate artifact_id when missing
- [ ] Test: Index file created correctly
- [ ] Test: HTML meets quality standards (has blur, gradients, etc.)

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Open generated HTML artifact in browser
- [ ] **VERIFY**: Liquid glass styling is visible
- [ ] **VERIFY**: Hover states work
- [ ] **VERIFY**: Responsive on different sizes
- [ ] **UI REVIEW**: Rate artifact visual quality (1-5 stars)

#### Success Criteria:
- ✅ HTML artifacts render beautifully
- ✅ Data artifacts have editable JSON
- ✅ Index tracks all artifacts
- ✅ Auto-ID prevents missing saves

---

## 🎯 PHASE 3: VECTOR SEARCH INTEGRATION

### 3.1 Embedding Service
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Research local embedding options (MLX, Transformers.js, etc.)
- [ ] Create `src/backend/services/EmbeddingService.js`
- [ ] Implement embedding generation
- [ ] Implement batch processing for efficiency

#### Technology Options:
1. **MLX via Swift helper** - Native macOS, very fast
2. **Transformers.js** - Pure JavaScript, portable
3. **Node bindings to ONNX** - Good balance

#### Methods:
```javascript
class EmbeddingService {
    constructor(modelPath)
    
    async initialize()
    async generateEmbedding(text)
    async generateBatchEmbeddings(texts)
    async getEmbeddingDimension()
    
    // Chunking helpers
    chunkByEntry(document)
    chunkByParagraph(text, maxTokens)
}
```

#### Embedding Metadata:
```json
{
    "chunk_id": "family_emma_school_struggles_20260124_143000",
    "area_path": "Family/Emma_School",
    "document": "struggles.md",
    "timestamp": "2026-01-24T14:30:00Z",
    "entry_type": "time_ordered_log",
    "sentiment": "hopeful",
    "user_quote": "I think we've been pushing chapter books too hard...",
    "ai_observation": "Visual learning style hypothesis strengthening...",
    "embedding": [0.123, 0.456, ...]
}
```

#### Unit Tests:
- [ ] Test: Model initializes without errors
- [ ] Test: Embeddings have correct dimension
- [ ] Test: Batch processing is faster than sequential
- [ ] Test: Chunking respects entry boundaries

#### Human-in-the-Loop Checkpoint:
- [ ] **VERIFY**: Model downloads/initializes successfully
- [ ] **VERIFY**: Embedding generation takes < 100ms per chunk
- [ ] **VERIFY**: Memory usage is reasonable (< 500MB)

#### Success Criteria:
- ✅ Embeddings generate correctly
- ✅ Batch processing works
- ✅ Performance under 100ms per chunk
- ✅ Chunking preserves semantic boundaries

---

### 3.2 Vector Store Service
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Research vector store options (SQLite + extensions, ObjectBox, etc.)
- [ ] Create `src/backend/services/VectorStoreService.js`
- [ ] Implement vector similarity search
- [ ] Implement hybrid search (vector + keyword + recency)

#### Methods:
```javascript
class VectorStoreService {
    constructor(databaseService, embeddingService)
    
    async initialize()
    
    // Storage
    async storeEmbedding(chunkId, embedding, metadata)
    async storeEmbeddings(chunks)
    async deleteEmbedding(chunkId)
    async deleteByArea(areaPath)
    
    // Search
    async vectorSearch(queryEmbedding, topK, filters)
    async keywordSearch(keywords, topK, filters)
    async hybridSearch(queryEmbedding, keywords, weights, topK, filters)
    
    // Boosting
    applyRecencyBoost(results, decayFactor)
    applyAreaBoost(results, currentAreaPath, boostFactor)
}
```

#### Hybrid Search Weights:
```javascript
const searchConfig = {
    vectorWeight: 0.7,      // Semantic similarity
    keywordWeight: 0.2,     // Exact matches
    recencyWeight: 0.1,     // Recent entries boosted
    
    // Decay factor: score = baseScore * e^(-age_days * decayFactor)
    recencyDecayFactor: 0.05,
    
    // Area boost: current conversation area gets 1.5x
    currentAreaBoost: 1.5
};
```

#### Unit Tests:
- [ ] Test: Store and retrieve embeddings
- [ ] Test: Vector search returns relevant results
- [ ] Test: Keyword search finds exact matches
- [ ] Test: Hybrid search combines both
- [ ] Test: Recency boost works correctly
- [ ] Test: Area boost works correctly

#### Human-in-the-Loop Checkpoint:
- [ ] **VERIFY**: Search returns expected results for test queries
- [ ] **VERIFY**: Search latency < 100ms
- [ ] **SCREENSHOT**: Show search results for "Emma's reading struggles"

#### Success Criteria:
- ✅ Vector search works correctly
- ✅ Hybrid search improves relevance
- ✅ Latency under 100ms
- ✅ Boosting functions work

---

### 3.3 Multi-Query Search Strategy
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Implement 3-query search strategy in VoicePipelineService
- [ ] Implement result merging and deduplication
- [ ] Implement context assembly for prompts

#### 3-Query Strategy:
```javascript
async function runMultiQuerySearch(messages) {
    // Query 1: Last 2 user inputs (weight 3.0x)
    const recentUserQuery = getRecentUserInputs(messages, 2);
    
    // Query 2: All user inputs (weight 1.5x)
    const allUserQuery = getAllUserInputs(messages);
    
    // Query 3: Full conversation with AI (weight 0.5x)
    const fullConvQuery = getFullConversation(messages);
    
    // Run in parallel
    const [results1, results2, results3] = await Promise.all([
        vectorStore.hybridSearch(recentUserQuery, { weight: 3.0, topK: 10 }),
        vectorStore.hybridSearch(allUserQuery, { weight: 1.5, topK: 10 }),
        vectorStore.hybridSearch(fullConvQuery, { weight: 0.5, topK: 5 })
    ]);
    
    // Merge and deduplicate
    return mergeAndDeduplicate([results1, results2, results3]);
}
```

#### Token Budget Allocation:
```javascript
const tokenBudgets = {
    systemInstruction: 1300,
    aiNotes: 1500,
    knowledgeTree: 300,
    vectorMatchedEntries: 500,
    vectorMatchedSummaries: 500,
    vectorMatchedChunks: 1000,
    vectorMatchedFiles: 500,
    vectorMatchedArtifacts: 300,
    currentArtifact: 2000,  // Only if user viewing
    conversationHistory: 2000,
    
    total: 10000  // Max per turn
};
```

#### Unit Tests:
- [ ] Test: 3 queries run in parallel
- [ ] Test: Results merge correctly
- [ ] Test: Deduplication works (keeps highest score)
- [ ] Test: Token budgets respected
- [ ] Test: Context assembled correctly

#### Human-in-the-Loop Checkpoint:
- [ ] **VERIFY**: Multi-query improves relevance
- [ ] **VERIFY**: Total latency < 300ms
- [ ] **LOG REVIEW**: Check query weights are applied

#### Success Criteria:
- ✅ 3-query strategy implemented
- ✅ Results merge and deduplicate
- ✅ Token budgets respected
- ✅ Total latency under 300ms

---

## 🎯 PHASE 4: UI IMPLEMENTATION

### 4.1 Artifact Display Component
**Estimated Time**: 4-5 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create `src/frontend/components/artifact-viewer.js`
- [ ] Implement artifact rendering in iframe
- [ ] Add artifact toolbar (expand, export, close)
- [ ] Add artifact animations

#### Component Structure:
```javascript
class ArtifactViewer {
    constructor(containerElement)
    
    // Display
    showArtifact(artifactId, html, metadata)
    hideArtifact()
    expandArtifact()
    collapseArtifact()
    
    // Export
    exportAsPNG()
    exportAsPDF()
    exportAsHTML()
    
    // Events
    onArtifactOpened(callback)
    onArtifactClosed(callback)
    onArtifactExported(callback)
}
```

#### UI/UX Requirements:
- [ ] Artifact appears as floating card below AI message
- [ ] Smooth slide-in animation (300ms ease-out)
- [ ] Expand button for full-screen view
- [ ] Close button (X) in top-right
- [ ] Export dropdown (PNG, PDF, HTML)
- [ ] Artifact casts subtle shadow
- [ ] Responsive: adapts to window width

#### Screenshot-Based Analysis Checklist:
- [ ] **SCREENSHOT 1**: Artifact card in collapsed state
  - [ ] Verify glass effect visible
  - [ ] Verify shadow looks natural
  - [ ] Verify toolbar icons are visible
- [ ] **SCREENSHOT 2**: Artifact card expanded (full screen)
  - [ ] Verify content scales correctly
  - [ ] Verify toolbar repositions
  - [ ] Verify close button prominent
- [ ] **SCREENSHOT 3**: Artifact in dark mode (if applicable)
  - [ ] Verify contrast is sufficient
  - [ ] Verify glass effect adapts
- [ ] **SCREENSHOT 4**: Multiple artifacts in conversation
  - [ ] Verify spacing between artifacts
  - [ ] Verify scroll works correctly

#### Success Criteria:
- ✅ Artifacts render beautifully
- ✅ Animations are smooth
- ✅ Export functions work
- ✅ Responsive design works

---

### 4.2 Life Areas Sidebar
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Create `src/frontend/components/life-areas-sidebar.js`
- [ ] Implement tree view of areas
- [ ] Add area search/filter
- [ ] Add area creation UI

#### UI/UX Requirements:
- [ ] Slide-in sidebar from left
- [ ] Tree view with expand/collapse
- [ ] Search bar at top
- [ ] "New Area" button
- [ ] Last activity timestamp per area
- [ ] Entry count badges
- [ ] Hover preview of summary

#### Screenshot-Based Analysis Checklist:
- [ ] **SCREENSHOT 1**: Sidebar open with populated tree
  - [ ] Verify hierarchy is clear
  - [ ] Verify icons are appropriate
  - [ ] Verify text is readable
- [ ] **SCREENSHOT 2**: Sidebar with search active
  - [ ] Verify search filters correctly
  - [ ] Verify matching text highlighted
- [ ] **SCREENSHOT 3**: Hover state on area
  - [ ] Verify preview appears
  - [ ] Verify preview content is useful

#### Success Criteria:
- ✅ Tree view renders correctly
- ✅ Search filters work
- ✅ Create area flow works
- ✅ Animation is smooth

---

### 4.3 Conversation History Sidebar (Enhanced)
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

This enhances the planned chat sidebar with artifact indicators.

#### Additional Tasks:
- [ ] Add artifact count badge per conversation
- [ ] Add artifact preview thumbnails
- [ ] Add "has artifacts" filter
- [ ] Add area tags per conversation

#### Screenshot-Based Analysis Checklist:
- [ ] **SCREENSHOT 1**: Conversation list with artifact badges
  - [ ] Verify badge count is correct
  - [ ] Verify badge styling matches design
- [ ] **SCREENSHOT 2**: Conversation with area tags
  - [ ] Verify tags are readable
  - [ ] Verify tags don't overflow

#### Success Criteria:
- ✅ Artifact badges display
- ✅ Area tags display
- ✅ Filtering works

---

## 🎯 PHASE 5: INTEGRATION & END-TO-END TESTING

### 5.1 LLM Structured Output Integration
**Estimated Time**: 3-4 hours  
**Status**: [ ] Not Started

#### Tasks:
- [ ] Update system prompt with life areas instructions
- [ ] Update structured output schema
- [ ] Implement area action execution
- [ ] Implement artifact action execution

#### Updated Schema:
```javascript
const responseSchema = {
    type: "object",
    properties: {
        user_response: {
            type: "object",
            properties: {
                spoken_text: { type: "string" },
                emotional_tone: { 
                    type: "string", 
                    enum: ["supportive", "curious", "reflective", "celebratory", "concerned"] 
                }
            },
            required: ["spoken_text"]
        },
        
        internal_notes: {
            type: "string",
            description: "1-2 sentences for AI's internal context"
        },
        
        area_actions: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["none", "create_area", "append_entry", "update_summary", 
                               "promote_to_subproject", "read_for_context", "vector_search"]
                    },
                    path: { type: "string" },
                    // ... action-specific fields
                }
            }
        },
        
        artifact_action: {
            type: "object",
            properties: {
                action: { type: "string", enum: ["none", "create", "update"] },
                artifact_id: { type: "string" },
                artifact_type: { type: "string" },
                html: { type: "string" },
                data: { type: "object" }
            }
        },
        
        proactive_bubbles: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    text: { type: "string", maxLength: 50 },
                    related_area: { type: "string" }
                }
            }
        }
    },
    required: ["user_response", "area_actions", "artifact_action"]
};
```

#### Unit Tests:
- [ ] Test: LLM generates valid area actions
- [ ] Test: Area actions execute correctly
- [ ] Test: Artifact actions execute correctly
- [ ] Test: Schema validation catches errors

#### Human-in-the-Loop Checkpoint:
- [ ] **LOG REVIEW**: Check LLM outputs valid JSON
- [ ] **VERIFY**: Area operations create/update files
- [ ] **VERIFY**: Artifacts are saved correctly

#### Success Criteria:
- ✅ LLM generates valid structured output
- ✅ All actions execute correctly
- ✅ Error handling works

---

### 5.2 End-to-End Conversation Flow Test
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Test Scenario: "Emma's Reading Struggles" (8 turns)

**Turn 1**: User mentions Emma's reading struggles
- [ ] Expected: AI creates `Family/Emma_School` area
- [ ] Expected: AI creates `reading_comprehension.md` document
- [ ] Expected: AI responds supportively
- [ ] Verify: Files created correctly
- [ ] **SCREENSHOT**: Show area created in sidebar

**Turn 2**: User provides details (2nd grade, comprehension issue)
- [ ] Expected: AI appends entry to `reading_comprehension.md`
- [ ] Expected: Entry at TOP (newest first)
- [ ] Verify: Entry format correct
- [ ] **SCREENSHOT**: Show markdown file with entry

**Turn 3**: User mentions emotional moment (Emma said "I'm stupid")
- [ ] Expected: AI recognizes emotional significance
- [ ] Expected: Entry captures emotional context
- [ ] Expected: AI responds empathetically
- [ ] **SCREENSHOT**: Show AI response in chat

**Turn 4**: User reports breakthrough (graphic novel success)
- [ ] Expected: AI appends positive entry
- [ ] Expected: Sentiment is "hopeful"
- [ ] **SCREENSHOT**: Show entry with sentiment

**Turn 5**: User asks about graphic novel type
- [ ] Expected: AI retrieves context
- [ ] Expected: AI generates progress chart artifact
- [ ] **SCREENSHOT**: Show artifact in chat

**Turn 6**: User mentions teacher meeting about testing
- [ ] Expected: AI creates `Learning_Differences` subproject
- [ ] Expected: AI appends entry about testing concerns
- [ ] **SCREENSHOT**: Show new subproject in tree

**Turn 7**: User asks for summary of Emma discussions
- [ ] Expected: AI reads all Emma_School context
- [ ] Expected: AI generates reflection summary artifact
- [ ] Expected: Summary is comprehensive
- [ ] **SCREENSHOT**: Show reflection artifact

**Turn 8**: User thanks AI and says they feel prepared
- [ ] Expected: AI updates area summary
- [ ] Expected: Conversation summary updated
- [ ] **SCREENSHOT**: Show final conversation state

#### Full Test Recording:
- [ ] **RECORD**: Screen record entire 8-turn conversation
- [ ] **REVIEW**: Watch recording for UX issues
- [ ] **NOTE**: Document any visual bugs

#### Success Criteria:
- ✅ All 8 turns complete successfully
- ✅ Area structure matches expected
- ✅ Artifacts render correctly
- ✅ No crashes or errors
- ✅ Response times under 3 seconds

---

### 5.3 Edge Case Testing
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Test Cases:

**1. Extreme Rambling (500+ words)**
- [ ] Test: Long user input is captured completely
- [ ] Test: AI creates multiple area actions
- [ ] Test: Response time under 5 seconds
- [ ] Test: Token budget not exceeded
- [ ] **SCREENSHOT**: Show rambling input and response

**2. Rapid Topic Switching**
- [ ] Test: User switches topics 5 times in 5 turns
- [ ] Test: Context is retrieved for each topic
- [ ] Test: No topic confusion
- [ ] **SCREENSHOT**: Show topic switches

**3. Vague Follow-ups**
- [ ] Test: "So what should I do?" (requires context)
- [ ] Test: "Tell me more" (requires context)
- [ ] Test: AI retrieves relevant context
- [ ] **SCREENSHOT**: Show context retrieval

**4. Artifact Update**
- [ ] Test: User asks to update existing artifact
- [ ] Test: Old artifact updated (not new created)
- [ ] **SCREENSHOT**: Show updated artifact

**5. Error Recovery**
- [ ] Test: Invalid JSON from LLM
- [ ] Test: File write failure
- [ ] Test: Database error
- [ ] Test: UI shows graceful error
- [ ] **SCREENSHOT**: Show error state

#### Success Criteria:
- ✅ All edge cases handled gracefully
- ✅ No crashes
- ✅ Errors are user-friendly

---

## 🎯 PHASE 6: PERFORMANCE & POLISH

### 6.1 Performance Benchmarks
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Metrics to Measure:

| Metric | Target | Method |
|--------|--------|--------|
| Vector search latency | < 100ms | Console timing |
| Total response time | < 3s | User-perceived |
| Memory usage | < 500MB | Activity Monitor |
| Embedding generation | < 100ms/chunk | Console timing |
| Database query time | < 50ms | Console timing |
| UI render time | < 16ms | Chrome DevTools |

#### Tasks:
- [ ] Add performance logging to all services
- [ ] Create benchmark script
- [ ] Run benchmarks on 100 conversations
- [ ] Run benchmarks on 1000 area entries
- [ ] Profile memory usage over 1 hour

#### Human-in-the-Loop Checkpoint:
- [ ] **SCREENSHOT**: Activity Monitor showing memory usage
- [ ] **SCREENSHOT**: Chrome DevTools Performance tab
- [ ] **LOG REVIEW**: Check for slow operations

#### Success Criteria:
- ✅ All metrics meet targets
- ✅ No memory leaks
- ✅ No performance degradation over time

---

### 6.2 UI Polish Checklist
**Estimated Time**: 2-3 hours  
**Status**: [ ] Not Started

#### Visual Review:

**Colors & Contrast**:
- [ ] All text has sufficient contrast (WCAG AA)
- [ ] Focus states are visible
- [ ] Error states are clearly red
- [ ] Success states are clearly green

**Typography**:
- [ ] Font hierarchy is clear (headings vs body)
- [ ] Line height is comfortable (1.5+)
- [ ] No text truncation without ellipsis

**Spacing**:
- [ ] Consistent padding (8px grid)
- [ ] Breathing room between elements
- [ ] No cramped layouts

**Animations**:
- [ ] All animations are smooth (60fps)
- [ ] Animations can be reduced (accessibility)
- [ ] Loading states have animations

**Responsive**:
- [ ] Works at 800px width
- [ ] Works at 1200px width
- [ ] Works at 1920px width

#### Screenshot-Based Analysis:
- [ ] **SCREENSHOT SET**: Take screenshots at 3 widths
- [ ] **COMPARE**: Check consistency across sizes
- [ ] **ANNOTATE**: Mark any visual issues

#### Success Criteria:
- ✅ All visual checks pass
- ✅ Responsive at all sizes
- ✅ Animations smooth

---

## 📋 FINAL SIGN-OFF CHECKLIST

### Pre-Release Verification

#### Functionality:
- [ ] Life areas create/read/update/delete works
- [ ] Conversation storage works (4 files)
- [ ] Artifact generation works (10 types)
- [ ] Vector search works
- [ ] Multi-query strategy works

#### Data Integrity:
- [ ] Database persists across restarts
- [ ] Markdown files are valid
- [ ] No data loss scenarios found
- [ ] Backup/export works

#### Performance:
- [ ] All latency targets met
- [ ] No memory leaks
- [ ] No CPU spikes

#### UX/UI:
- [ ] All screenshots reviewed
- [ ] No visual bugs found
- [ ] Animations smooth
- [ ] Error states graceful

#### Human-in-the-Loop Final Review:
- [ ] **DEMO**: Record 5-minute demo video
- [ ] **REVIEW**: Watch demo for issues
- [ ] **SIGN-OFF**: Mark as ready for merge

---

## 📊 PROGRESS TRACKING

| Phase | Status | Est. Hours | Actual Hours | Notes |
|-------|--------|------------|--------------|-------|
| 1.1 Directory Setup | [ ] Not Started | 0.5 | - | - |
| 1.2 Database Service | [ ] Not Started | 4 | - | - |
| 2.1 Area Manager | [ ] Not Started | 5 | - | - |
| 2.2 Conversation Storage | [ ] Not Started | 3 | - | - |
| 2.3 Artifact Manager | [ ] Not Started | 4 | - | - |
| 3.1 Embedding Service | [ ] Not Started | 4 | - | - |
| 3.2 Vector Store | [ ] Not Started | 4 | - | - |
| 3.3 Multi-Query Search | [ ] Not Started | 3 | - | - |
| 4.1 Artifact Display | [ ] Not Started | 5 | - | - |
| 4.2 Life Areas Sidebar | [ ] Not Started | 4 | - | - |
| 4.3 History Sidebar | [ ] Not Started | 3 | - | - |
| 5.1 LLM Integration | [ ] Not Started | 4 | - | - |
| 5.2 E2E Testing | [ ] Not Started | 3 | - | - |
| 5.3 Edge Case Testing | [ ] Not Started | 3 | - | - |
| 6.1 Performance | [ ] Not Started | 3 | - | - |
| 6.2 UI Polish | [ ] Not Started | 3 | - | - |
| **TOTAL** | - | **55 hours** | - | - |

---

## 🔗 RELATED DOCUMENTATION

### Architecture Docs:
- `benchmark-artifacts/LIFE_AREAS_ARCHITECTURE.md` - Life areas design
- `benchmark-artifacts/LIFE_AREAS_SYSTEM_COMPLETE.md` - Implementation summary
- `benchmark-artifacts/PROMPT_INPUT_STRUCTURE.md` - Prompt assembly design
- `benchmark-artifacts/tests/ARTIFACTS_IMPLEMENTATION_STATUS.md` - Artifact status

### Testing Docs:
- `benchmark-artifacts/tests/CONVERSATION_FILES_ANALYSIS.md` - Conversation storage analysis
- `benchmark-artifacts/tests/USER_INPUT_ISOLATION_IMPLEMENTED.md` - User input isolation

### Reference Implementation:
- `benchmark-artifacts/tests/lib/artifact-manager.js` - Artifact manager reference
- `benchmark-artifacts/lib/area-manager.js` - Area manager reference
- `benchmark-artifacts/lib/life-areas-runner.js` - Integration reference

---

**Last Updated**: January 24, 2026  
**Next Review**: After Phase 1 completion  
**Maintained By**: AI Development Team

---

## 🎬 SCREENSHOT REQUIREMENTS SUMMARY

Total screenshots required for full verification:

| Phase | Screenshots | Description |
|-------|-------------|-------------|
| 1.1 | 1 | Directory structure |
| 1.2 | 2 | Database in SQLite viewer |
| 2.1 | 2 | Life areas folders and markdown |
| 2.2 | 3 | Conversation 4-file structure |
| 2.3 | 4 | Artifact rendering quality |
| 3.3 | 1 | Search results |
| 4.1 | 4 | Artifact viewer states |
| 4.2 | 3 | Life areas sidebar |
| 4.3 | 2 | Conversation history |
| 5.2 | 8 | E2E test (one per turn) |
| 5.3 | 5 | Edge case tests |
| 6.1 | 2 | Performance metrics |
| 6.2 | 3 | Responsive screenshots |
| **TOTAL** | **40** | - |

**Naming Convention**: `{phase}_{step}_{description}_{timestamp}.png`
Example: `4.1_01_artifact_collapsed_1706123456.png`

---

**Ready to build consequential AI conversations! 🚀**

---

## 🤖 AGENT-EXECUTABLE TESTING SUITE

This section contains tests the AI agent can run autonomously using Puppeteer, terminal commands, and file analysis. These tests enable continuous self-verification without human intervention.

---

### 7.1 Automated UI Screenshot Analysis
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer MCP, File Read, Terminal

#### Test: Main Window Layout Verification
```bash
# Agent runs this test by:
# 1. Navigate to app URL with Puppeteer
# 2. Take screenshot
# 3. Analyze screenshot for expected elements
```

**Steps for Agent:**
1. [ ] Navigate: `puppeteer_navigate` to `file:///path/to/index.html` or `http://localhost:7482`
2. [ ] Screenshot: `puppeteer_screenshot` name="main_window_layout"
3. [ ] Analyze screenshot for:
   - [ ] Voice button visible (bottom right area)
   - [ ] Input field visible (bottom center)
   - [ ] Settings gear icon visible (top right)
   - [ ] Message area visible (center)
   - [ ] No visual overflow or clipping
   - [ ] Glass effect visible (blur/transparency)

**Pass Criteria:**
- All UI elements present
- No obvious visual bugs
- Layout appears balanced

---

#### Test: Settings Panel UI Verification
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Click settings icon: `puppeteer_click` selector=`[data-testid="settings-btn"]` or `.settings-btn`
3. [ ] Wait 500ms for animation
4. [ ] Screenshot: `puppeteer_screenshot` name="settings_panel_open"
5. [ ] Analyze screenshot for:
   - [ ] Settings panel visible (slides from right)
   - [ ] API key inputs visible
   - [ ] Model dropdown visible
   - [ ] Voice settings section visible
   - [ ] Save button visible
   - [ ] Close button (X) visible
   - [ ] Scrollbar if content overflows

**Pass Criteria:**
- Panel fully visible
- All form elements present
- No text truncation

---

#### Test: Artifact Display Verification
**Steps for Agent:**
1. [ ] Create test artifact HTML file in temp location
2. [ ] Navigate to app
3. [ ] Inject test artifact into conversation (via WebSocket or test endpoint)
4. [ ] Screenshot: `puppeteer_screenshot` name="artifact_in_conversation"
5. [ ] Analyze screenshot for:
   - [ ] Artifact card visible below AI message
   - [ ] Glass effect on artifact card
   - [ ] Toolbar visible (expand, export, close)
   - [ ] No content overflow
   - [ ] Shadow visible (depth effect)

**Test Artifact HTML:**
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        .card {
            background: rgba(255,255,255,0.2);
            backdrop-filter: blur(15px);
            border-radius: 16px;
            padding: 24px;
            color: white;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>Test Artifact</h2>
        <p>This is a test artifact to verify rendering.</p>
    </div>
</body>
</html>
```

---

### 7.2 User Flow Automation Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer MCP, Terminal

#### Flow 1: New Conversation Creation
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Screenshot: `puppeteer_screenshot` name="flow1_01_initial_state"
3. [ ] Verify no messages displayed (empty state)
4. [ ] Click input field: `puppeteer_click` selector=`.message-input`
5. [ ] Type message: `puppeteer_fill` selector=`.message-input` value="Hello, this is a test message"
6. [ ] Screenshot: `puppeteer_screenshot` name="flow1_02_message_typed"
7. [ ] Click send button: `puppeteer_click` selector=`.send-btn`
8. [ ] Wait 3000ms for AI response
9. [ ] Screenshot: `puppeteer_screenshot` name="flow1_03_response_received"
10. [ ] Verify:
    - [ ] User message appears (right-aligned, blue)
    - [ ] AI message appears (left-aligned, glass effect)
    - [ ] Bubble suggestions appear below AI message
    - [ ] Timestamps visible

**Pass Criteria:**
- Complete conversation round-trip
- Both messages visible
- No errors in console

---

#### Flow 2: Settings Save and Persist
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Open settings panel
3. [ ] Fill API key field: `puppeteer_fill` selector=`#gemini-key` value="test-api-key-12345"
4. [ ] Select model from dropdown: `puppeteer_select` selector=`#model-select` value="gemini-2.5-flash-lite"
5. [ ] Screenshot: `puppeteer_screenshot` name="flow2_01_settings_filled"
6. [ ] Click save button: `puppeteer_click` selector=`.save-btn`
7. [ ] Wait 500ms
8. [ ] Screenshot: `puppeteer_screenshot` name="flow2_02_settings_saved"
9. [ ] Close settings panel
10. [ ] Reopen settings panel
11. [ ] Screenshot: `puppeteer_screenshot` name="flow2_03_settings_persisted"
12. [ ] Verify:
    - [ ] API key field shows dots (masked) or saved state
    - [ ] Model selection persisted
    - [ ] Save confirmation shown

**Pass Criteria:**
- Settings persist after close/reopen
- Visual feedback on save

---

#### Flow 3: Conversation with Area Creation
**Prerequisites**: App running, API key configured

**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Type message about a life area topic:
   ```
   puppeteer_fill selector=".message-input" value="I'm worried about my daughter Emma. She's struggling with reading in 2nd grade and her teacher wants to discuss testing."
   ```
3. [ ] Send message
4. [ ] Wait 5000ms for AI response with area creation
5. [ ] Screenshot: `puppeteer_screenshot` name="flow3_01_area_topic_response"
6. [ ] Check terminal/logs for area creation:
   ```bash
   # Agent runs:
   grep -r "create_area" /path/to/logs --include="*.log" | tail -5
   ```
7. [ ] Verify file created:
   ```bash
   # Agent runs:
   ls -la user_data/life_areas/Family/ 2>/dev/null || echo "Area not created yet"
   ```
8. [ ] Take follow-up turn:
   ```
   puppeteer_fill selector=".message-input" value="She can read the words but doesn't remember what she read afterwards."
   ```
9. [ ] Send and wait 5000ms
10. [ ] Screenshot: `puppeteer_screenshot` name="flow3_02_entry_appended"
11. [ ] Verify entry appended to file:
    ```bash
    # Agent runs:
    head -50 user_data/life_areas/Family/Emma_School/reading_comprehension.md 2>/dev/null || echo "File not found"
    ```

**Pass Criteria:**
- AI creates area on first mention
- Entry appended on follow-up
- Files exist with correct content

---

#### Flow 4: Artifact Generation Request
**Steps for Agent:**
1. [ ] Have existing conversation context (from Flow 3)
2. [ ] Type artifact request:
   ```
   puppeteer_fill selector=".message-input" value="Can you create a visual summary of what we've discussed about Emma's reading?"
   ```
3. [ ] Send message
4. [ ] Wait 8000ms (artifact generation takes longer)
5. [ ] Screenshot: `puppeteer_screenshot` name="flow4_01_artifact_request"
6. [ ] Check for artifact in response:
   - [ ] Artifact card visible in chat
   - [ ] Artifact type badge visible
7. [ ] If artifact visible, click expand: `puppeteer_click` selector=`.artifact-expand-btn`
8. [ ] Screenshot: `puppeteer_screenshot` name="flow4_02_artifact_expanded"
9. [ ] Verify artifact file exists:
   ```bash
   # Agent runs:
   ls -la user_data/conversations/*/artifacts/*.html 2>/dev/null | tail -5
   ```
10. [ ] Read artifact HTML and verify quality:
    ```bash
    # Agent runs:
    cat $(ls user_data/conversations/*/artifacts/*.html | tail -1) | head -100
    ```

**Pass Criteria:**
- Artifact generated and displayed
- HTML file saved
- Liquid glass styling present in HTML

---

#### Flow 5: Bubble Suggestion Interaction
**Steps for Agent:**
1. [ ] Navigate to app with existing conversation
2. [ ] Identify bubble suggestions below AI message
3. [ ] Screenshot: `puppeteer_screenshot` name="flow5_01_bubbles_visible"
4. [ ] Click first bubble: `puppeteer_click` selector=`.bubble-suggestion:first-child`
5. [ ] Verify bubble text appears in input field
6. [ ] Screenshot: `puppeteer_screenshot` name="flow5_02_bubble_clicked"
7. [ ] Send the suggested message
8. [ ] Wait for response
9. [ ] Screenshot: `puppeteer_screenshot` name="flow5_03_bubble_response"
10. [ ] Verify new bubbles generated (different from previous)

**Pass Criteria:**
- Bubble click populates input
- New relevant bubbles appear
- No bubble repetition

---

### 7.3 Visual Regression Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer screenshots, File comparison

#### Test: Component Visual Consistency

**Baseline Screenshots to Create:**
```
tests/visual-baselines/
├── main_window_empty.png
├── main_window_with_messages.png
├── settings_panel_open.png
├── artifact_card_collapsed.png
├── artifact_card_expanded.png
├── life_areas_sidebar.png
├── error_state.png
└── loading_state.png
```

**Agent Comparison Process:**
1. [ ] Take new screenshot of component
2. [ ] Compare with baseline (if exists)
3. [ ] Report differences:
   - Size differences
   - Major layout shifts
   - Missing elements
   - Color/contrast changes

**Automated Check Script:**
```bash
#!/bin/bash
# Agent can run this to compare screenshots

BASELINE_DIR="tests/visual-baselines"
CURRENT_DIR="tests/visual-current"

for baseline in $BASELINE_DIR/*.png; do
    name=$(basename "$baseline")
    current="$CURRENT_DIR/$name"
    
    if [ -f "$current" ]; then
        # Check file sizes (crude but fast check)
        baseline_size=$(stat -f%z "$baseline")
        current_size=$(stat -f%z "$current")
        diff=$((current_size - baseline_size))
        
        if [ ${diff#-} -gt 10000 ]; then
            echo "⚠️  VISUAL CHANGE: $name (size diff: $diff bytes)"
        else
            echo "✅ OK: $name"
        fi
    else
        echo "❌ MISSING: $current"
    fi
done
```

---

### 7.4 Accessibility Checks
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer evaluate, Terminal

#### Test: Color Contrast Verification
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Execute contrast check script:
   ```javascript
   // puppeteer_evaluate
   const elements = document.querySelectorAll('*');
   const issues = [];
   
   elements.forEach(el => {
       const style = window.getComputedStyle(el);
       const color = style.color;
       const bg = style.backgroundColor;
       
       // Check if text is visible
       if (el.textContent.trim() && color && bg) {
           // Simple check: white text on light background
           if (color.includes('255, 255, 255') && 
               !bg.includes('0, 0, 0') && 
               !bg.includes('rgba(0')) {
               issues.push({
                   element: el.tagName,
                   text: el.textContent.slice(0, 30),
                   issue: 'Potential low contrast'
               });
           }
       }
   });
   
   return issues;
   ```
3. [ ] Report any contrast issues found

---

#### Test: Keyboard Navigation
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Execute tab navigation test:
   ```javascript
   // puppeteer_evaluate
   const focusableElements = document.querySelectorAll(
       'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
   );
   
   const results = {
       totalFocusable: focusableElements.length,
       withVisibleFocus: 0,
       elements: []
   };
   
   focusableElements.forEach((el, i) => {
       el.focus();
       const style = window.getComputedStyle(el);
       const hasOutline = style.outline !== 'none' && style.outline !== '';
       const hasBoxShadow = style.boxShadow !== 'none';
       
       if (hasOutline || hasBoxShadow) {
           results.withVisibleFocus++;
       }
       
       results.elements.push({
           index: i,
           tag: el.tagName,
           hasVisibleFocus: hasOutline || hasBoxShadow
       });
   });
   
   return results;
   ```
3. [ ] Verify all interactive elements have visible focus state

**Pass Criteria:**
- All buttons/inputs focusable
- Visible focus indicator on each

---

### 7.5 Performance Measurement Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer evaluate, Terminal

#### Test: Page Load Performance
**Steps for Agent:**
1. [ ] Navigate to app with performance timing:
   ```javascript
   // puppeteer_evaluate after navigation
   const timing = performance.timing;
   const metrics = {
       // Time to first byte
       ttfb: timing.responseStart - timing.navigationStart,
       // DOM Content Loaded
       domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
       // Full page load
       pageLoad: timing.loadEventEnd - timing.navigationStart,
       // DOM Interactive
       domInteractive: timing.domInteractive - timing.navigationStart
   };
   
   return metrics;
   ```
2. [ ] Record metrics
3. [ ] Compare against thresholds:
   - TTFB: < 200ms
   - DOM Content Loaded: < 1000ms
   - Page Load: < 2000ms

---

#### Test: Runtime Performance
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Send 10 messages in rapid succession
3. [ ] Measure frame rate during scroll:
   ```javascript
   // puppeteer_evaluate
   let frameCount = 0;
   let startTime = performance.now();
   
   function countFrame() {
       frameCount++;
       if (performance.now() - startTime < 1000) {
           requestAnimationFrame(countFrame);
       }
   }
   
   requestAnimationFrame(countFrame);
   
   // Trigger scroll
   const container = document.querySelector('.messages-container');
   if (container) {
       container.scrollTop = container.scrollHeight;
   }
   
   // Return after 1 second
   return new Promise(resolve => {
       setTimeout(() => resolve({ fps: frameCount }), 1100);
   });
   ```
4. [ ] Verify FPS > 30 during scroll

---

#### Test: Memory Usage
**Steps for Agent:**
1. [ ] Run app and monitor memory:
   ```bash
   # Agent runs:
   # Get initial memory
   ps aux | grep -i "BubbleVoice\|Electron" | grep -v grep | awk '{print $4, $11}' | head -5
   ```
2. [ ] Interact with app (send 20 messages)
3. [ ] Check memory again:
   ```bash
   ps aux | grep -i "BubbleVoice\|Electron" | grep -v grep | awk '{print $4, $11}' | head -5
   ```
4. [ ] Calculate memory growth
5. [ ] Flag if growth > 100MB

---

### 7.6 File System Verification Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Terminal, File Read

#### Test: Conversation File Structure
**Steps for Agent:**
```bash
# Agent runs after creating a conversation:

# 1. List conversation directories
echo "=== Conversation Directories ==="
ls -la user_data/conversations/ 2>/dev/null || echo "No conversations yet"

# 2. For each conversation, verify 4-file structure
for dir in user_data/conversations/conv_*/; do
    if [ -d "$dir" ]; then
        echo ""
        echo "=== Checking: $dir ==="
        
        # Check for required files
        [ -f "${dir}conversation.md" ] && echo "✅ conversation.md exists" || echo "❌ MISSING: conversation.md"
        [ -f "${dir}user_inputs.md" ] && echo "✅ user_inputs.md exists" || echo "❌ MISSING: user_inputs.md"
        [ -f "${dir}conversation_ai_notes.md" ] && echo "✅ conversation_ai_notes.md exists" || echo "❌ MISSING: conversation_ai_notes.md"
        [ -f "${dir}conversation_summary.md" ] && echo "✅ conversation_summary.md exists" || echo "❌ MISSING: conversation_summary.md"
        
        # Check artifacts folder
        [ -d "${dir}artifacts" ] && echo "✅ artifacts/ directory exists" || echo "⚠️  No artifacts/ directory"
    fi
done
```

---

#### Test: User Input Isolation Verification
**Steps for Agent:**
```bash
# Agent runs to verify user inputs are truly isolated:

# 1. Read user_inputs.md
echo "=== User Inputs File ==="
CONV_DIR=$(ls -td user_data/conversations/conv_*/ 2>/dev/null | head -1)

if [ -n "$CONV_DIR" ]; then
    cat "${CONV_DIR}user_inputs.md" 2>/dev/null | head -50
    
    echo ""
    echo "=== Checking for AI content leak ==="
    
    # Search for AI markers that shouldn't be in user_inputs.md
    if grep -q "**AI**:" "${CONV_DIR}user_inputs.md" 2>/dev/null; then
        echo "❌ FAIL: Found AI response in user_inputs.md!"
    else
        echo "✅ PASS: No AI responses in user_inputs.md"
    fi
    
    if grep -q "Operations:" "${CONV_DIR}user_inputs.md" 2>/dev/null; then
        echo "❌ FAIL: Found operations log in user_inputs.md!"
    else
        echo "✅ PASS: No operations in user_inputs.md"
    fi
else
    echo "No conversations found"
fi
```

---

#### Test: Life Areas Structure Verification
**Steps for Agent:**
```bash
# Agent runs to verify life areas structure:

echo "=== Life Areas Tree ==="
tree user_data/life_areas/ 2>/dev/null || ls -laR user_data/life_areas/ 2>/dev/null

echo ""
echo "=== Checking Area Summaries ==="

# Find all _AREA_SUMMARY.md files
find user_data/life_areas -name "_AREA_SUMMARY.md" 2>/dev/null | while read summary; do
    echo ""
    echo "--- $summary ---"
    head -20 "$summary"
done

echo ""
echo "=== Checking Entry Ordering (Newest First) ==="

# Check first document file
DOC=$(find user_data/life_areas -name "*.md" ! -name "_*" 2>/dev/null | head -1)
if [ -n "$DOC" ]; then
    echo "Checking: $DOC"
    
    # Extract timestamps and verify descending order
    grep -E "^### [0-9]{4}-[0-9]{2}-[0-9]{2}" "$DOC" | head -5
    
    # Check if first entry is newest
    FIRST_DATE=$(grep -E "^### [0-9]{4}-[0-9]{2}-[0-9]{2}" "$DOC" | head -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}")
    SECOND_DATE=$(grep -E "^### [0-9]{4}-[0-9]{2}-[0-9]{2}" "$DOC" | head -2 | tail -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}")
    
    if [[ "$FIRST_DATE" > "$SECOND_DATE" ]] || [[ "$FIRST_DATE" == "$SECOND_DATE" ]]; then
        echo "✅ PASS: Entries in newest-first order"
    else
        echo "❌ FAIL: Entries NOT in newest-first order"
    fi
else
    echo "No document files found"
fi
```

---

#### Test: Artifact HTML Quality Check
**Steps for Agent:**
```bash
# Agent runs to verify artifact HTML quality:

echo "=== Artifact Quality Checks ==="

ARTIFACT=$(find user_data -name "*.html" -path "*/artifacts/*" 2>/dev/null | head -1)

if [ -n "$ARTIFACT" ]; then
    echo "Checking: $ARTIFACT"
    
    # Check for required styling elements
    echo ""
    echo "--- Liquid Glass Styling ---"
    
    grep -q "backdrop-filter" "$ARTIFACT" && echo "✅ backdrop-filter present" || echo "❌ MISSING: backdrop-filter"
    grep -q "blur" "$ARTIFACT" && echo "✅ blur effect present" || echo "❌ MISSING: blur effect"
    grep -q "border-radius" "$ARTIFACT" && echo "✅ border-radius present" || echo "❌ MISSING: border-radius"
    grep -q "box-shadow" "$ARTIFACT" && echo "✅ box-shadow present" || echo "❌ MISSING: box-shadow"
    grep -q "linear-gradient\|radial-gradient" "$ARTIFACT" && echo "✅ gradient present" || echo "⚠️  No gradient found"
    
    echo ""
    echo "--- Interactive Elements ---"
    grep -q ":hover" "$ARTIFACT" && echo "✅ hover states present" || echo "⚠️  No hover states"
    grep -q "transition" "$ARTIFACT" && echo "✅ transitions present" || echo "⚠️  No transitions"
    
    echo ""
    echo "--- Typography ---"
    grep -q "font-family" "$ARTIFACT" && echo "✅ font-family set" || echo "⚠️  No font-family"
    grep -q "font-weight" "$ARTIFACT" && echo "✅ font-weight used" || echo "⚠️  No font-weight"
    
    echo ""
    echo "--- File Size ---"
    SIZE=$(stat -f%z "$ARTIFACT" 2>/dev/null || stat --format=%s "$ARTIFACT" 2>/dev/null)
    echo "File size: $SIZE bytes"
    
    if [ "$SIZE" -lt 500 ]; then
        echo "⚠️  WARNING: Artifact seems too small (< 500 bytes)"
    elif [ "$SIZE" -gt 50000 ]; then
        echo "⚠️  WARNING: Artifact seems too large (> 50KB)"
    else
        echo "✅ File size reasonable"
    fi
else
    echo "No artifact files found"
fi
```

---

### 7.7 Database Integrity Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Terminal (sqlite3)

#### Test: Database Schema Verification
**Steps for Agent:**
```bash
# Agent runs to verify database schema:

DB_PATH="user_data/bubblevoice.db"

if [ -f "$DB_PATH" ]; then
    echo "=== Database Tables ==="
    sqlite3 "$DB_PATH" ".tables"
    
    echo ""
    echo "=== Table Schemas ==="
    sqlite3 "$DB_PATH" ".schema"
    
    echo ""
    echo "=== Row Counts ==="
    for table in conversations messages life_areas area_entries artifacts settings; do
        COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "N/A")
        echo "$table: $COUNT rows"
    done
    
    echo ""
    echo "=== Foreign Key Check ==="
    sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;"
    
    RESULT=$?
    if [ $RESULT -eq 0 ]; then
        echo "✅ Foreign keys valid"
    else
        echo "❌ Foreign key violations found!"
    fi
    
    echo ""
    echo "=== Integrity Check ==="
    sqlite3 "$DB_PATH" "PRAGMA integrity_check;"
else
    echo "Database not found at $DB_PATH"
fi
```

---

#### Test: Data Consistency Check
**Steps for Agent:**
```bash
# Agent runs to verify data consistency:

DB_PATH="user_data/bubblevoice.db"

if [ -f "$DB_PATH" ]; then
    echo "=== Orphaned Messages Check ==="
    ORPHANS=$(sqlite3 "$DB_PATH" "
        SELECT COUNT(*) FROM messages m 
        WHERE NOT EXISTS (
            SELECT 1 FROM conversations c WHERE c.id = m.conversation_id
        );
    ")
    
    if [ "$ORPHANS" -eq 0 ]; then
        echo "✅ No orphaned messages"
    else
        echo "❌ Found $ORPHANS orphaned messages!"
    fi
    
    echo ""
    echo "=== Orphaned Entries Check ==="
    ORPHAN_ENTRIES=$(sqlite3 "$DB_PATH" "
        SELECT COUNT(*) FROM area_entries e 
        WHERE NOT EXISTS (
            SELECT 1 FROM life_areas a WHERE a.path = e.area_path
        );
    ")
    
    if [ "$ORPHAN_ENTRIES" -eq 0 ]; then
        echo "✅ No orphaned area entries"
    else
        echo "❌ Found $ORPHAN_ENTRIES orphaned entries!"
    fi
    
    echo ""
    echo "=== Recent Activity ==="
    sqlite3 "$DB_PATH" "
        SELECT 'Conversations:', COUNT(*), MAX(updated_at) FROM conversations
        UNION ALL
        SELECT 'Messages:', COUNT(*), MAX(timestamp) FROM messages
        UNION ALL  
        SELECT 'Areas:', COUNT(*), MAX(updated_at) FROM life_areas
        UNION ALL
        SELECT 'Artifacts:', COUNT(*), MAX(created_at) FROM artifacts;
    "
else
    echo "Database not found"
fi
```

---

### 7.8 API Response Validation Tests
**Agent Can Run**: ✅ Yes  
**Tools**: Terminal (curl), File Read

#### Test: LLM Structured Output Validation
**Steps for Agent:**
```bash
# Agent runs to validate LLM response structure:

# 1. Make test request to backend (if running)
RESPONSE=$(curl -s -X POST http://localhost:7482/api/chat \
    -H "Content-Type: application/json" \
    -d '{"message": "Hello, how are you?", "conversationId": "test_123"}' \
    2>/dev/null)

if [ -n "$RESPONSE" ]; then
    echo "=== Raw Response ==="
    echo "$RESPONSE" | head -c 500
    
    echo ""
    echo ""
    echo "=== Structure Validation ==="
    
    # Check for required fields using jq if available, otherwise grep
    if command -v jq &> /dev/null; then
        echo "$RESPONSE" | jq -e '.user_response.spoken_text' > /dev/null && \
            echo "✅ user_response.spoken_text present" || \
            echo "❌ MISSING: user_response.spoken_text"
        
        echo "$RESPONSE" | jq -e '.area_actions' > /dev/null && \
            echo "✅ area_actions present" || \
            echo "❌ MISSING: area_actions"
        
        echo "$RESPONSE" | jq -e '.artifact_action' > /dev/null && \
            echo "✅ artifact_action present" || \
            echo "❌ MISSING: artifact_action"
        
        echo "$RESPONSE" | jq -e '.proactive_bubbles' > /dev/null && \
            echo "✅ proactive_bubbles present" || \
            echo "⚠️  proactive_bubbles not present"
    else
        echo "jq not available, using grep..."
        echo "$RESPONSE" | grep -q "spoken_text" && echo "✅ spoken_text found" || echo "❌ spoken_text missing"
        echo "$RESPONSE" | grep -q "area_actions" && echo "✅ area_actions found" || echo "❌ area_actions missing"
    fi
else
    echo "No response from server (is it running?)"
fi
```

---

### 7.9 Full Automated Test Suite Runner
**Agent Can Run**: ✅ Yes  
**Tools**: Terminal

#### Master Test Script
```bash
#!/bin/bash
# AGENT TEST SUITE RUNNER
# Agent can run this to execute all automated tests

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     BubbleVoice Artifacts & Data Management Test Suite     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Started: $(date)"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Function to run a test
run_test() {
    local name="$1"
    local command="$2"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "TEST: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    eval "$command"
    
    echo ""
}

# Directory structure tests
run_test "Directory Structure" '
    [ -d "user_data/life_areas" ] && echo "✅ life_areas exists" || echo "❌ life_areas missing"
    [ -d "user_data/conversations" ] && echo "✅ conversations exists" || echo "❌ conversations missing"
    [ -d "user_data/embeddings" ] && echo "✅ embeddings exists" || echo "❌ embeddings missing"
'

# Database tests
run_test "Database Integrity" '
    DB="user_data/bubblevoice.db"
    if [ -f "$DB" ]; then
        sqlite3 "$DB" "PRAGMA integrity_check;" && echo "✅ DB integrity OK"
    else
        echo "⚠️  Database not found"
    fi
'

# File structure tests
run_test "Conversation File Structure" '
    for dir in user_data/conversations/conv_*/; do
        [ -d "$dir" ] || continue
        MISSING=0
        [ -f "${dir}conversation.md" ] || MISSING=$((MISSING+1))
        [ -f "${dir}user_inputs.md" ] || MISSING=$((MISSING+1))
        [ -f "${dir}conversation_ai_notes.md" ] || MISSING=$((MISSING+1))
        [ -f "${dir}conversation_summary.md" ] || MISSING=$((MISSING+1))
        
        if [ $MISSING -eq 0 ]; then
            echo "✅ $(basename $dir): All 4 files present"
        else
            echo "❌ $(basename $dir): Missing $MISSING files"
        fi
    done
'

# Artifact quality tests
run_test "Artifact Quality" '
    for artifact in user_data/conversations/*/artifacts/*.html; do
        [ -f "$artifact" ] || continue
        NAME=$(basename "$artifact")
        
        CHECKS=0
        grep -q "backdrop-filter" "$artifact" && CHECKS=$((CHECKS+1))
        grep -q "border-radius" "$artifact" && CHECKS=$((CHECKS+1))
        grep -q "box-shadow" "$artifact" && CHECKS=$((CHECKS+1))
        
        if [ $CHECKS -ge 2 ]; then
            echo "✅ $NAME: Quality OK ($CHECKS/3 style checks)"
        else
            echo "⚠️  $NAME: Low quality ($CHECKS/3 style checks)"
        fi
    done
'

# Performance check
run_test "Performance (Memory)" '
    MEM=$(ps aux | grep -i "node.*server\|electron" | grep -v grep | awk "{sum+=\$4} END {print sum}")
    if [ -n "$MEM" ]; then
        echo "Current memory usage: ${MEM}%"
        if (( $(echo "$MEM > 10" | bc -l) )); then
            echo "⚠️  High memory usage"
        else
            echo "✅ Memory usage OK"
        fi
    else
        echo "⚠️  Process not found"
    fi
'

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TEST SUITE COMPLETE"
echo "Finished: $(date)"
echo "═══════════════════════════════════════════════════════════════"
```

---

### 7.10 Puppeteer Screenshot Comparison Workflow
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer MCP, File operations

#### Complete Agent Workflow for UI Verification:

```
AGENT UI VERIFICATION WORKFLOW
==============================

1. PREPARATION
   - Ensure app is running (npm run dev)
   - Navigate to app: puppeteer_navigate url="http://localhost:7482"
   - Wait for load

2. CAPTURE BASELINE (First Run Only)
   - Screenshot each state:
     - Empty state
     - With messages
     - Settings open
     - Artifact displayed
     - Error state
   - Save to tests/visual-baselines/

3. CAPTURE CURRENT STATE
   - Repeat all screenshots
   - Save to tests/visual-current/

4. COMPARE AND REPORT
   - For each pair:
     - Check file sizes (major changes)
     - Visual inspection via puppeteer view
     - Report differences

5. DOCUMENT FINDINGS
   - Create markdown report
   - Include screenshots of issues
   - Suggest fixes

SCREENSHOT NAMING CONVENTION:
  {component}_{state}_{timestamp}.png
  
  Examples:
  - main_window_empty_1706185234.png
  - settings_panel_open_1706185240.png
  - artifact_stress_map_expanded_1706185250.png
```

---

### 7.11 Error State Testing
**Agent Can Run**: ✅ Yes  
**Tools**: Puppeteer, Terminal

#### Test: Network Error Handling
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Disable network in Puppeteer or stop backend
3. [ ] Attempt to send message
4. [ ] Screenshot: `puppeteer_screenshot` name="error_network_failure"
5. [ ] Verify:
   - [ ] Error message displayed to user
   - [ ] Error is user-friendly (not technical jargon)
   - [ ] Retry option available
   - [ ] App doesn't crash

---

#### Test: Invalid API Key Handling
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Set invalid API key in settings
3. [ ] Send message
4. [ ] Wait for error response
5. [ ] Screenshot: `puppeteer_screenshot` name="error_invalid_api_key"
6. [ ] Verify:
   - [ ] Clear error about API key
   - [ ] Suggestion to check settings
   - [ ] Link to settings panel

---

#### Test: Large Input Handling
**Steps for Agent:**
1. [ ] Navigate to app
2. [ ] Generate large input (10,000 characters):
   ```javascript
   // puppeteer_evaluate
   const largeText = 'This is a test sentence. '.repeat(500);
   document.querySelector('.message-input').value = largeText;
   return largeText.length;
   ```
3. [ ] Click send
4. [ ] Screenshot: `puppeteer_screenshot` name="error_large_input"
5. [ ] Verify:
   - [ ] Input handled or truncated gracefully
   - [ ] No browser freeze
   - [ ] Error message if rejected

---

## 📋 AGENT TEST EXECUTION CHECKLIST

Use this checklist to track which tests the agent has run:

### Quick Tests (< 1 minute each)
- [ ] 7.1 Main Window Layout Screenshot
- [ ] 7.1 Settings Panel Screenshot
- [ ] 7.6 Directory Structure Check
- [ ] 7.6 File Structure Verification
- [ ] 7.7 Database Schema Check

### Medium Tests (1-5 minutes each)
- [ ] 7.2 Flow 1: New Conversation
- [ ] 7.2 Flow 2: Settings Save
- [ ] 7.4 Color Contrast Check
- [ ] 7.4 Keyboard Navigation
- [ ] 7.5 Page Load Performance
- [ ] 7.6 User Input Isolation
- [ ] 7.6 Artifact Quality Check
- [ ] 7.7 Data Consistency Check

### Long Tests (5-15 minutes each)
- [ ] 7.2 Flow 3: Area Creation
- [ ] 7.2 Flow 4: Artifact Generation
- [ ] 7.2 Flow 5: Bubble Interaction
- [ ] 7.5 Runtime Performance
- [ ] 7.5 Memory Usage
- [ ] 7.9 Full Test Suite

### Visual Regression (Manual trigger)
- [ ] 7.3 Baseline Screenshots Created
- [ ] 7.10 Current Screenshots Captured
- [ ] 7.10 Comparison Report Generated

### Error Handling
- [ ] 7.11 Network Error Test
- [ ] 7.11 Invalid API Key Test
- [ ] 7.11 Large Input Test

---

**Total Agent-Executable Tests**: 25+  
**Estimated Agent Runtime**: 30-60 minutes for full suite
