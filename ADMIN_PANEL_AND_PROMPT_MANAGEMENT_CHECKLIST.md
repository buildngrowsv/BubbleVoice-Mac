# Admin Panel & Prompt Management - Build Checklist

**Date**: January 25, 2026  
**Purpose**: Add sophisticated prompt management and admin controls  
**Priority**: HIGH - Enables user customization and system transparency

---

## 📊 EXECUTIVE SUMMARY

### What We're Building

A comprehensive admin panel that allows users to:
1. **View and edit all system prompts** with variable substitution
2. **Configure vector search parameters** (chunking, indexing, retrieval)
3. **Manage context assembly settings** (token budgets, query weights)
4. **Monitor system performance** (embedding times, search latency)
5. **Debug conversation flow** (see what context was injected)

### Why This Matters

**Current State**: All prompts and settings are hardcoded in services  
**Problem**: Users can't customize AI behavior or optimize for their use case  
**Solution**: Admin panel with full control over prompts, context, and indexing

---

## 🎯 CURRENT AGENTIC IMPLEMENTATION (ACTUAL)

### What We Actually Built

Based on code analysis, here's the **real** agentic architecture:

```
┌────────────────────────────────────────────────────────────────┐
│  VoicePipelineService                                          │
│  - Three-timer turn detection (0.5s, 1.5s, 2.0s)             │
│  - Interruption handling                                       │
│  - Swift helper coordination                                   │
│  - TTS management                                              │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  IntegrationService (Orchestrator)                             │
│  - Coordinates all services                                    │
│  - Processes LLM structured outputs                            │
│  - Executes area_actions and artifact_actions                  │
│  - Manages embeddings for new entries                          │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  ContextAssemblyService (Context Builder)                      │
│  - Multi-query vector search (3 queries with weights)         │
│  - Assembles: AI notes + knowledge tree + vector results       │
│  - Token budget management                                     │
│  - Formats context for LLM prompt                              │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  LLMService (Single LLM with Structured Output)                │
│  - System prompt (buildSystemPrompt)                           │
│  - Multi-provider (Gemini, Claude, GPT)                        │
│  - Structured JSON output (response + bubbles + actions)       │
│  - Streaming support                                           │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│  Supporting Services (Execution Layer)                         │
│  - AreaManagerService: Life areas CRUD                         │
│  - ArtifactManagerService: Artifact rendering                  │
│  - BubbleGeneratorService: Bubble validation                   │
│  - ConversationStorageService: 4-file storage                  │
│  - EmbeddingService: Local embeddings (Transformers.js)        │
│  - VectorStoreService: Hybrid search (vector + keyword)        │
└────────────────────────────────────────────────────────────────┘
```

### Key Characteristics

**NOT Multi-Agent**:
- ❌ No separate ConversationAgent, BubbleAgent, ArtifactAgent
- ❌ No AgentCoordinator routing between agents
- ❌ No parallel agent execution
- ❌ No tool registry or intent analysis layer

**IS Service-Oriented with Orchestration**:
- ✅ IntegrationService orchestrates all services
- ✅ ContextAssemblyService builds context intelligently
- ✅ LLMService generates structured output
- ✅ Supporting services execute actions

**Sophistication Level**: **Orchestrated Services** (not Multi-Agent)

---

## 📝 PROMPT ARCHITECTURE (ACTUAL)

### Current Prompt Structure

#### 1. System Prompt (LLMService.buildSystemPrompt)

**Location**: `src/backend/services/LLMService.js:72-148`

**Components**:
```
1. Purpose Definition
   - "You are BubbleVoice, a personal AI companion..."
   - Role: thinking partner for life
   
2. Approach Guidelines
   - Be empathetic and understanding
   - Ask thoughtful follow-up questions
   - Remember past conversations
   - Help users see patterns
   - Validate feelings
   
3. Life Areas System Instructions
   - When to create areas
   - When to append entries
   - When to update summaries
   - Hierarchical organization
   
4. Response Format (JSON Schema)
   - response: conversational text
   - bubbles: array of 2-4 prompts
   - area_actions: array of actions
   - artifact_action: single action
   
5. Area Actions Guidelines
   - When to create vs append
   - Include user_quote for vector search
   - Include ai_observation for context
   - Tag sentiment
   
6. Artifact Guidelines
   - When to create artifacts
   - Liquid glass styling
   - Self-contained HTML/CSS
   
7. Example Response
   - Full JSON example with all fields
```

**Current Implementation**: Hardcoded string in `buildSystemPrompt()`

**Variables**: NONE (all static text)

---

#### 2. Context Injection (ContextAssemblyService.formatContextForPrompt)

**Location**: `src/backend/services/ContextAssemblyService.js:293-334`

**Components**:
```
1. AI Notes (Internal Context)
   - Top 500 lines from conversation_ai_notes.md
   - Newest first
   - What AI did in previous turns
   
2. Knowledge Tree
   - Life areas structure
   - Generated by AreaManagerService
   - Shows all areas, documents, last activity
   
3. Relevant Context (Vector Search)
   - Results from multi-query search
   - Shows: area_path, document, timestamp, sentiment
   - Includes content preview (150 chars)
   - Includes user_quote if available
   
4. Conversation History
   - Last 10-20 turns
   - Format: Turn N (timestamp): User: ... AI: ...
   - Truncated to 100 chars per message
```

**Current Implementation**: Hardcoded formatting in `formatContextForPrompt()`

**Variables**:
- `aiNotes` (from conversation storage)
- `knowledgeTree` (from area manager)
- `vectorResults` (from vector search)
- `conversationHistory` (from database)

---

#### 3. Multi-Query Vector Search (ContextAssemblyService.runMultiQuerySearch)

**Location**: `src/backend/services/ContextAssemblyService.js:117-178`

**Strategy**:
```
Query 1: Last 2 user inputs (weight 3.0x)
  - Captures immediate intent
  - Highest priority
  - Top 10 results
  
Query 2: All user inputs (weight 1.5x)
  - Broader context
  - Medium priority
  - Top 10 results
  
Query 3: Full conversation (weight 0.5x)
  - Repetition prevention
  - Lowest priority
  - Top 5 results
  
Merging:
  - Deduplicate by chunk_id (keep highest score)
  - Apply recency boost (0.05 per day)
  - Apply area boost (1.5x if current area matches)
  - Sort by final score
  - Return top 10
```

**Current Implementation**: Hardcoded weights and counts

**Variables**:
- Query 1 weight: `3.0`
- Query 2 weight: `1.5`
- Query 3 weight: `0.5`
- Query 1 count: `2` (last N user inputs)
- Query 1 top K: `10`
- Query 2 top K: `10`
- Query 3 top K: `5`
- Recency boost: `0.05` (per day)
- Area boost: `1.5`
- Final top K: `10`

---

#### 4. Token Budget Management (ContextAssemblyService.tokenBudgets)

**Location**: `src/backend/services/ContextAssemblyService.js:51-60`

**Budgets**:
```javascript
{
  systemInstruction: 1300,      // System prompt
  aiNotes: 1500,                // AI's internal notes
  knowledgeTree: 300,           // Life areas tree
  vectorMatchedEntries: 500,    // Vector search results
  vectorMatchedSummaries: 500,  // Area summaries
  vectorMatchedChunks: 1000,    // Entry chunks
  conversationHistory: 2000,    // Recent turns
  total: 10000                  // Total budget
}
```

**Current Implementation**: Hardcoded object

**Usage**: NOT ENFORCED (just documentation)

---

## 🎨 ADMIN PANEL REQUIREMENTS

### Panel 1: System Prompt Editor

**Purpose**: Allow users to customize AI personality and behavior

**Features**:
- ✅ Multi-section editor with tabs
- ✅ Variable substitution support
- ✅ Live preview of final prompt
- ✅ Reset to default
- ✅ Save custom prompts
- ✅ Version history

**Sections to Edit**:

1. **Purpose Definition**
   - Variables: None
   - Editable: Full text
   - Default: "You are BubbleVoice, a personal AI companion..."

2. **Approach Guidelines**
   - Variables: None
   - Editable: Bullet points
   - Default: 5 guidelines

3. **Life Areas Instructions**
   - Variables: None
   - Editable: Full text
   - Default: When to create/append/update

4. **Response Format**
   - Variables: None
   - Editable: JSON schema description
   - Default: Current schema explanation

5. **Area Actions Guidelines**
   - Variables: None
   - Editable: Bullet points
   - Default: Current guidelines

6. **Artifact Guidelines**
   - Variables: None
   - Editable: Bullet points
   - Default: Current guidelines

7. **Example Response**
   - Variables: None
   - Editable: JSON example
   - Default: Current example

**UI Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ System Prompt Editor                                  [Save] │
├─────────────────────────────────────────────────────────────┤
│ [Purpose] [Approach] [Life Areas] [Format] [Actions] [...]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Purpose Definition:                                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ You are BubbleVoice, a personal AI companion designed  │ │
│  │ to help people think through their lives.              │ │
│  │                                                         │ │
│  │ [Edit full text...]                                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Logic: This defines the AI's core identity and role.       │
│  It sets the tone for all interactions.                     │
│                                                              │
│  [Reset to Default] [Preview Full Prompt]                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
// New service: PromptConfigService.js
class PromptConfigService {
  constructor(configPath) {
    this.configPath = configPath;
    this.defaultPrompts = this.loadDefaults();
    this.customPrompts = this.loadCustom();
  }
  
  // Get current system prompt (custom or default)
  getSystemPrompt() {
    return this.customPrompts.system || this.defaultPrompts.system;
  }
  
  // Update section
  updateSection(section, content) {
    this.customPrompts.system[section] = content;
    this.save();
  }
  
  // Reset to default
  resetToDefault() {
    this.customPrompts = {};
    this.save();
  }
  
  // Build final prompt with variable substitution
  buildPrompt(variables = {}) {
    const sections = this.getSystemPrompt();
    let prompt = '';
    
    for (const [key, value] of Object.entries(sections)) {
      prompt += this.substituteVariables(value, variables);
      prompt += '\n\n';
    }
    
    return prompt;
  }
  
  // Variable substitution
  substituteVariables(text, variables) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }
}
```

---

### Panel 2: Context Assembly Configuration

**Purpose**: Configure how context is assembled for each turn

**Features**:
- ✅ Token budget sliders
- ✅ Query weight adjustments
- ✅ Top K configuration
- ✅ Boost factor tuning
- ✅ Real-time impact preview

**Settings**:

1. **Token Budgets**
   ```
   System Instruction:      [====|====] 1300 tokens
   AI Notes:                [====|====] 1500 tokens
   Knowledge Tree:          [==|======] 300 tokens
   Vector Results:          [===|=====] 500 tokens
   Conversation History:    [======|==] 2000 tokens
   Total Budget:            [========] 10000 tokens
   ```

2. **Multi-Query Weights**
   ```
   Recent User (last 2):    [======|==] 3.0x
   All User Inputs:         [===|=====] 1.5x
   Full Conversation:       [=|=======] 0.5x
   ```

3. **Top K Configuration**
   ```
   Query 1 Results:         [====|====] 10
   Query 2 Results:         [====|====] 10
   Query 3 Results:         [==|======] 5
   Final Merged:            [====|====] 10
   ```

4. **Boost Factors**
   ```
   Recency Boost:           [=|=======] 0.05 per day
   Area Boost:              [===|=====] 1.5x
   ```

5. **Query Configuration**
   ```
   Recent User Count:       [==|======] 2 messages
   ```

**UI Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ Context Assembly Configuration                        [Save] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Token Budgets:                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ System Instruction:    [====|====] 1300 tokens         │ │
│  │ AI Notes:              [====|====] 1500 tokens         │ │
│  │ Knowledge Tree:        [==|======] 300 tokens          │ │
│  │ Vector Results:        [===|=====] 500 tokens          │ │
│  │ Conversation History:  [======|==] 2000 tokens         │ │
│  │ ─────────────────────────────────────────────────────  │ │
│  │ Total:                 [========] 6600 / 10000 tokens  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Logic: Token budgets control how much context is included  │
│  in each section. Adjust to prioritize different types of   │
│  information. Total should stay under 10K for performance.  │
│                                                              │
│  Multi-Query Weights:                                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Recent User (last 2):  [======|==] 3.0x               │ │
│  │ All User Inputs:       [===|=====] 1.5x               │ │
│  │ Full Conversation:     [=|=======] 0.5x               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Logic: Higher weights prioritize certain query types.      │
│  Recent user input (3.0x) is most important for immediate   │
│  intent. Full conversation (0.5x) prevents repetition.      │
│                                                              │
│  [Reset to Defaults] [Test Configuration]                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
// New service: ContextConfigService.js
class ContextConfigService {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }
  
  // Get token budgets
  getTokenBudgets() {
    return this.config.tokenBudgets || {
      systemInstruction: 1300,
      aiNotes: 1500,
      knowledgeTree: 300,
      vectorMatchedEntries: 500,
      vectorMatchedSummaries: 500,
      vectorMatchedChunks: 1000,
      conversationHistory: 2000,
      total: 10000
    };
  }
  
  // Get query weights
  getQueryWeights() {
    return this.config.queryWeights || {
      recentUser: 3.0,
      allUser: 1.5,
      fullConversation: 0.5
    };
  }
  
  // Get top K values
  getTopK() {
    return this.config.topK || {
      query1: 10,
      query2: 10,
      query3: 5,
      final: 10
    };
  }
  
  // Get boost factors
  getBoostFactors() {
    return this.config.boostFactors || {
      recency: 0.05,
      area: 1.5
    };
  }
  
  // Update configuration
  updateConfig(section, values) {
    this.config[section] = { ...this.config[section], ...values };
    this.save();
  }
}
```

---

### Panel 3: Vector Search Configuration

**Purpose**: Configure embedding and indexing parameters

**Features**:
- ✅ Embedding model selection
- ✅ Chunking strategy configuration
- ✅ Search algorithm parameters
- ✅ Performance monitoring

**Settings**:

1. **Embedding Configuration**
   ```
   Model:                   [Xenova/all-MiniLM-L6-v2 ▼]
   Dimensions:              384 (read-only)
   Pooling:                 [Mean ▼]
   Normalize:               [✓] Enabled
   ```

2. **Chunking Strategy**
   ```
   Strategy:                [By Entry ▼]
                            - By Entry (current)
                            - By Paragraph
                            - Fixed Token Count
                            - Sliding Window
   
   Max Chunk Size:          [====|====] 500 tokens
   Overlap:                 [==|======] 50 tokens
   ```

3. **Search Algorithm**
   ```
   Algorithm:               [Brute Force Cosine ▼]
                            - Brute Force Cosine (current)
                            - HNSW (not implemented)
   
   Similarity Metric:       [Cosine ▼]
   Threshold:               [===|=====] 0.7
   ```

4. **Hybrid Search Weights**
   ```
   Vector Weight:           [=======|=] 0.7
   Keyword Weight:          [===|=====] 0.3
   ```

5. **Performance Metrics** (read-only)
   ```
   Avg Embedding Time:      7ms
   Avg Search Time:         1ms
   Total Embeddings:        1,234
   Index Size:              45 MB
   ```

**UI Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ Vector Search Configuration                           [Save] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Embedding Configuration:                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Model: [Xenova/all-MiniLM-L6-v2 ▼]                    │ │
│  │ Dimensions: 384 (read-only)                            │ │
│  │ Pooling: [Mean ▼]                                      │ │
│  │ Normalize: [✓] Enabled                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Logic: Xenova/all-MiniLM-L6-v2 is optimized for sentence   │
│  similarity. 384 dimensions balance speed vs quality.       │
│  Mean pooling averages all token embeddings. Normalization  │
│  enables cosine similarity.                                  │
│                                                              │
│  Chunking Strategy:                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Strategy: [By Entry ▼]                                 │ │
│  │ Max Chunk Size: [====|====] 500 tokens                 │ │
│  │ Overlap: [==|======] 50 tokens                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Logic: "By Entry" chunks each life area entry separately,  │
│  preserving semantic boundaries. Max size prevents huge     │
│  chunks. Overlap prevents information loss at boundaries.   │
│                                                              │
│  [Reset to Defaults] [Reindex All Embeddings]               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
// New service: VectorConfigService.js
class VectorConfigService {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }
  
  // Get embedding config
  getEmbeddingConfig() {
    return this.config.embedding || {
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      pooling: 'mean',
      normalize: true
    };
  }
  
  // Get chunking config
  getChunkingConfig() {
    return this.config.chunking || {
      strategy: 'by_entry',
      maxChunkSize: 500,
      overlap: 50
    };
  }
  
  // Get search config
  getSearchConfig() {
    return this.config.search || {
      algorithm: 'brute_force_cosine',
      metric: 'cosine',
      threshold: 0.7
    };
  }
  
  // Get hybrid weights
  getHybridWeights() {
    return this.config.hybrid || {
      vector: 0.7,
      keyword: 0.3
    };
  }
  
  // Update configuration
  updateConfig(section, values) {
    this.config[section] = { ...this.config[section], ...values };
    this.save();
  }
}
```

---

### Panel 4: Conversation Debug View

**Purpose**: See exactly what context was injected into each turn

**Features**:
- ✅ Turn-by-turn breakdown
- ✅ Context sections displayed
- ✅ Token counts per section
- ✅ Vector search results shown
- ✅ Export debug data

**UI Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ Conversation Debug View                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Turn: [Turn 5 ▼]                                    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ User Input (Turn 5):                                   │ │
│  │ "What have we discussed about Emma's reading?"         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Context Injected:                                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ [1] AI Notes (1,234 tokens)                [Expand ▼]  │ │
│  │ [2] Knowledge Tree (287 tokens)            [Expand ▼]  │ │
│  │ [3] Vector Search Results (456 tokens)     [Expand ▼]  │ │
│  │     - Query 1 (recent): 4 results                      │ │
│  │     - Query 2 (all user): 3 results                    │ │
│  │     - Query 3 (full): 2 results                        │ │
│  │ [4] Conversation History (1,890 tokens)    [Expand ▼]  │ │
│  │                                                         │ │
│  │ Total Context: 3,867 tokens                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ AI Response:                                           │ │
│  │ "You've mentioned Emma's reading three times..."       │ │
│  │                                                         │ │
│  │ Area Actions:                                          │ │
│  │ - append_entry: Family/Emma_School/reading.md          │ │
│  │                                                         │ │
│  │ Artifact Action: none                                  │ │
│  │                                                         │ │
│  │ Bubbles: ["what helps her?", "teacher's advice?"]      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Export Debug Data] [Copy Context]                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```javascript
// New service: DebugService.js
class DebugService {
  constructor(db, contextAssembly) {
    this.db = db;
    this.contextAssembly = contextAssembly;
  }
  
  // Get debug data for turn
  async getDebugDataForTurn(conversationId, turnNumber) {
    const turn = this.db.getTurn(conversationId, turnNumber);
    
    if (!turn) {
      throw new Error('Turn not found');
    }
    
    // Reconstruct context that was used
    const messages = this.db.getMessages(conversationId, turnNumber * 2);
    const context = await this.contextAssembly.assembleContext(
      conversationId,
      messages
    );
    
    return {
      turn,
      context,
      tokenCounts: this.calculateTokenCounts(context),
      vectorResults: context.vectorResults,
      formattedContext: this.contextAssembly.formatContextForPrompt(context)
    };
  }
  
  // Calculate token counts per section
  calculateTokenCounts(context) {
    return {
      aiNotes: this.estimateTokens(context.aiNotes || ''),
      knowledgeTree: this.estimateTokens(context.knowledgeTree || ''),
      vectorResults: this.estimateTokens(JSON.stringify(context.vectorResults || {})),
      conversationHistory: this.estimateTokens(context.conversationHistory || ''),
      total: this.estimateTokens(this.contextAssembly.formatContextForPrompt(context))
    };
  }
  
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}
```

---

### Panel 5: Performance Monitoring

**Purpose**: Monitor system performance and identify bottlenecks

**Features**:
- ✅ Real-time metrics
- ✅ Historical graphs
- ✅ Bottleneck identification
- ✅ Optimization suggestions

**Metrics**:

1. **Embedding Performance**
   ```
   Avg Generation Time:     7ms
   P50:                     5ms
   P95:                     12ms
   P99:                     20ms
   Total Generated:         1,234
   ```

2. **Vector Search Performance**
   ```
   Avg Search Time:         1ms
   P50:                     0ms
   P95:                     2ms
   P99:                     5ms
   Total Searches:          456
   ```

3. **Context Assembly Performance**
   ```
   Avg Assembly Time:       57ms
   - AI Notes:              2ms
   - Knowledge Tree:        5ms
   - Vector Search:         45ms
   - History:               5ms
   ```

4. **LLM Performance**
   ```
   Avg First Token:         523ms
   Avg Total Time:          2.1s
   Avg Tokens/Second:       45
   ```

5. **Overall Turn Latency**
   ```
   Avg Total:               2.8s
   - Context Assembly:      57ms (2%)
   - LLM Generation:        2.1s (75%)
   - Action Execution:      643ms (23%)
   ```

**UI Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ Performance Monitoring                            [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Overall Turn Latency:                                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Avg: 2.8s                                              │ │
│  │ [Context|==] [LLM|======================] [Actions|===]│ │
│  │   57ms (2%)      2.1s (75%)                643ms (23%) │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Bottleneck: LLM Generation (75% of time)                   │
│  Suggestion: Consider using faster model or local inference │
│                                                              │
│  Embedding Performance:                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Avg: 7ms  P50: 5ms  P95: 12ms  P99: 20ms              │ │
│  │ [Graph showing distribution]                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Vector Search Performance:                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Avg: 1ms  P50: 0ms  P95: 2ms  P99: 5ms                │ │
│  │ [Graph showing distribution]                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Status: ✅ All metrics within targets                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 BUILD CHECKLIST

### Phase 1: Configuration Services (4-6 hours)

#### 1.1 Create PromptConfigService

- [ ] Create `src/backend/services/PromptConfigService.js`
- [ ] Implement config file loading/saving
- [ ] Extract default prompts from LLMService
- [ ] Add section-based editing
- [ ] Add variable substitution support
- [ ] Add reset to default functionality
- [ ] Add version history tracking

**Files**:
- `src/backend/services/PromptConfigService.js` (new, ~300 lines)
- `user_data/config/prompts.json` (new config file)

**Tests**:
- [ ] Test loading default prompts
- [ ] Test saving custom prompts
- [ ] Test variable substitution
- [ ] Test reset to default

---

#### 1.2 Create ContextConfigService

- [ ] Create `src/backend/services/ContextConfigService.js`
- [ ] Implement token budget configuration
- [ ] Implement query weight configuration
- [ ] Implement top K configuration
- [ ] Implement boost factor configuration
- [ ] Add validation (total budget, valid ranges)
- [ ] Add preset configurations (conservative, balanced, aggressive)

**Files**:
- `src/backend/services/ContextConfigService.js` (new, ~250 lines)
- `user_data/config/context.json` (new config file)

**Tests**:
- [ ] Test loading/saving config
- [ ] Test validation
- [ ] Test presets

---

#### 1.3 Create VectorConfigService

- [ ] Create `src/backend/services/VectorConfigService.js`
- [ ] Implement embedding configuration
- [ ] Implement chunking configuration
- [ ] Implement search configuration
- [ ] Implement hybrid weights configuration
- [ ] Add reindexing trigger
- [ ] Add performance metrics tracking

**Files**:
- `src/backend/services/VectorConfigService.js` (new, ~300 lines)
- `user_data/config/vector.json` (new config file)

**Tests**:
- [ ] Test loading/saving config
- [ ] Test reindexing trigger
- [ ] Test metrics tracking

---

#### 1.4 Create DebugService

- [ ] Create `src/backend/services/DebugService.js`
- [ ] Implement turn data reconstruction
- [ ] Implement context breakdown
- [ ] Implement token counting
- [ ] Add export functionality
- [ ] Add context diff (turn-to-turn changes)

**Files**:
- `src/backend/services/DebugService.js` (new, ~200 lines)

**Tests**:
- [ ] Test turn reconstruction
- [ ] Test token counting
- [ ] Test export

---

#### 1.5 Create PerformanceMonitorService

- [ ] Create `src/backend/services/PerformanceMonitorService.js`
- [ ] Implement metric collection
- [ ] Implement percentile calculation
- [ ] Implement bottleneck detection
- [ ] Add historical tracking
- [ ] Add optimization suggestions

**Files**:
- `src/backend/services/PerformanceMonitorService.js` (new, ~350 lines)
- `user_data/metrics/performance.db` (new SQLite DB)

**Tests**:
- [ ] Test metric collection
- [ ] Test percentile calculation
- [ ] Test bottleneck detection

---

### Phase 2: Integrate Config Services (2-3 hours)

#### 2.1 Update LLMService

- [ ] Inject PromptConfigService
- [ ] Replace hardcoded prompt with config-based
- [ ] Add variable substitution in generateResponse
- [ ] Support custom prompts

**Changes**:
- `src/backend/services/LLMService.js` (modify)
  - Replace `buildSystemPrompt()` with `promptConfig.getSystemPrompt()`
  - Add variable substitution

---

#### 2.2 Update ContextAssemblyService

- [ ] Inject ContextConfigService
- [ ] Replace hardcoded budgets with config
- [ ] Replace hardcoded weights with config
- [ ] Replace hardcoded top K with config
- [ ] Add token budget enforcement

**Changes**:
- `src/backend/services/ContextAssemblyService.js` (modify)
  - Replace hardcoded values with config calls
  - Add budget enforcement logic

---

#### 2.3 Update EmbeddingService & VectorStoreService

- [ ] Inject VectorConfigService
- [ ] Support configurable embedding model
- [ ] Support configurable chunking strategy
- [ ] Support configurable search algorithm
- [ ] Support configurable hybrid weights

**Changes**:
- `src/backend/services/EmbeddingService.js` (modify)
- `src/backend/services/VectorStoreService.js` (modify)

---

#### 2.4 Add Performance Instrumentation

- [ ] Inject PerformanceMonitorService into all services
- [ ] Add timing wrappers around key operations
- [ ] Emit metrics events
- [ ] Track percentiles

**Changes**:
- All services (add timing instrumentation)

---

### Phase 3: Admin Panel Frontend (8-12 hours)

#### 3.1 Create Admin Panel Route

- [ ] Add `/admin` route to Electron app
- [ ] Create admin panel HTML/CSS
- [ ] Add navigation between panels
- [ ] Add authentication (optional)

**Files**:
- `src/frontend/admin.html` (new, ~500 lines)
- `src/frontend/styles/admin.css` (new, ~400 lines)
- `src/frontend/js/admin-app.js` (new, ~300 lines)

---

#### 3.2 Build System Prompt Editor Panel

- [ ] Create multi-section editor UI
- [ ] Implement tab navigation
- [ ] Add text editors for each section
- [ ] Add live preview
- [ ] Add save/reset buttons
- [ ] Add version history viewer

**Files**:
- `src/frontend/js/panels/PromptEditorPanel.js` (new, ~400 lines)

---

#### 3.3 Build Context Config Panel

- [ ] Create token budget sliders
- [ ] Create query weight sliders
- [ ] Create top K inputs
- [ ] Create boost factor inputs
- [ ] Add real-time validation
- [ ] Add preset selector

**Files**:
- `src/frontend/js/panels/ContextConfigPanel.js` (new, ~350 lines)

---

#### 3.4 Build Vector Config Panel

- [ ] Create embedding config UI
- [ ] Create chunking config UI
- [ ] Create search config UI
- [ ] Create hybrid weights UI
- [ ] Add performance metrics display
- [ ] Add reindex button

**Files**:
- `src/frontend/js/panels/VectorConfigPanel.js` (new, ~400 lines)

---

#### 3.5 Build Debug View Panel

- [ ] Create turn selector
- [ ] Create context breakdown viewer
- [ ] Create expandable sections
- [ ] Add token count display
- [ ] Add export button
- [ ] Add copy button

**Files**:
- `src/frontend/js/panels/DebugViewPanel.js` (new, ~350 lines)

---

#### 3.6 Build Performance Monitor Panel

- [ ] Create metrics display
- [ ] Create graphs (Chart.js or similar)
- [ ] Create bottleneck detector
- [ ] Create optimization suggestions
- [ ] Add refresh button
- [ ] Add historical view

**Files**:
- `src/frontend/js/panels/PerformancePanel.js` (new, ~400 lines)

---

### Phase 4: Backend API Endpoints (3-4 hours)

#### 4.1 Add Config API Endpoints

- [ ] `GET /api/admin/prompts` - Get current prompts
- [ ] `PUT /api/admin/prompts` - Update prompts
- [ ] `POST /api/admin/prompts/reset` - Reset to default
- [ ] `GET /api/admin/context-config` - Get context config
- [ ] `PUT /api/admin/context-config` - Update context config
- [ ] `GET /api/admin/vector-config` - Get vector config
- [ ] `PUT /api/admin/vector-config` - Update vector config

**Files**:
- `src/backend/routes/admin.js` (new, ~300 lines)

---

#### 4.2 Add Debug API Endpoints

- [ ] `GET /api/admin/debug/turns/:conversationId` - Get turns
- [ ] `GET /api/admin/debug/turn/:conversationId/:turnNumber` - Get turn debug data
- [ ] `GET /api/admin/debug/export/:conversationId/:turnNumber` - Export debug data

**Files**:
- `src/backend/routes/admin.js` (add to existing)

---

#### 4.3 Add Performance API Endpoints

- [ ] `GET /api/admin/performance/metrics` - Get current metrics
- [ ] `GET /api/admin/performance/history` - Get historical metrics
- [ ] `GET /api/admin/performance/bottlenecks` - Get bottleneck analysis

**Files**:
- `src/backend/routes/admin.js` (add to existing)

---

### Phase 5: Testing & Documentation (2-3 hours)

#### 5.1 Create Integration Tests

- [ ] Test prompt editing flow
- [ ] Test context config flow
- [ ] Test vector config flow
- [ ] Test debug view
- [ ] Test performance monitoring

**Files**:
- `tests/admin-panel-tests.js` (new, ~400 lines)

---

#### 5.2 Create User Documentation

- [ ] Write admin panel user guide
- [ ] Document each configuration option
- [ ] Explain logic behind settings
- [ ] Provide optimization tips
- [ ] Include troubleshooting guide

**Files**:
- `docs/ADMIN_PANEL_GUIDE.md` (new, ~1000 lines)

---

#### 5.3 Create Developer Documentation

- [ ] Document config service APIs
- [ ] Document admin API endpoints
- [ ] Explain variable substitution
- [ ] Explain performance instrumentation

**Files**:
- `docs/ADMIN_PANEL_DEVELOPMENT.md` (new, ~500 lines)

---

## 🎯 PRIORITY & TIMELINE

### High Priority (Do First)

1. **PromptConfigService** (4 hours)
   - Most impactful for user customization
   - Enables prompt experimentation

2. **System Prompt Editor Panel** (4 hours)
   - User-facing benefit
   - Easy to understand

3. **Debug View Panel** (3 hours)
   - Critical for understanding system behavior
   - Helps with prompt tuning

### Medium Priority (Do Second)

4. **ContextConfigService** (3 hours)
   - Enables advanced tuning
   - Less critical than prompts

5. **Context Config Panel** (4 hours)
   - For power users
   - Optimization tool

6. **Performance Monitor Panel** (4 hours)
   - Helps identify issues
   - Guides optimization

### Lower Priority (Do Later)

7. **VectorConfigService** (3 hours)
   - Current settings work well
   - Only needed for scale

8. **Vector Config Panel** (4 hours)
   - Advanced feature
   - Fewer users will need

---

## 📊 ESTIMATED TOTAL TIME

**Total**: 35-45 hours

**Breakdown**:
- Configuration Services: 8-10 hours
- Service Integration: 2-3 hours
- Frontend Panels: 12-16 hours
- Backend APIs: 3-4 hours
- Testing & Docs: 4-6 hours
- Polish & Bug Fixes: 6-8 hours

**Timeline**: 1-2 weeks of focused development

---

## 🎓 KEY INSIGHTS

### Why This Matters

1. **Transparency**: Users can see exactly what context is being used
2. **Customization**: Users can tune AI behavior to their preferences
3. **Debugging**: Developers can diagnose issues quickly
4. **Optimization**: Performance bottlenecks become visible
5. **Trust**: Users understand how the system works

### Design Principles

1. **Progressive Disclosure**: Simple defaults, advanced options hidden
2. **Explain Everything**: Every setting has logic explanation
3. **Safe Defaults**: System works great out of the box
4. **Easy Reset**: Can always go back to defaults
5. **Real-time Feedback**: See impact of changes immediately

---

**End of Checklist**
