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
