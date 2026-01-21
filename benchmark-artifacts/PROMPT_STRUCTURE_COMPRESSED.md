# Prompt Structure - Compressed Reference

**Date**: January 19, 2026  
**Total Input Budget**: ~8,000-10,000 tokens per turn

---

## 📂 Conversation Storage

```
conversations/conv_[timestamp]/
├── conversation.md              # Full transcript with operations
├── conversation_summary.md      # AI-maintained high-level summary
├── conversation_ai_notes.md     # Hidden AI notes (top 500 lines read)
└── artifacts/*.html             # Generated visualizations
```

---

## 🎯 Input Structure (Per Turn)

### Static System Instruction (~1,300 tokens)
- Base system prompt (~300 tokens)
- Life areas instructions (~800 tokens)
- Structured output schema (~200 tokens)

### Dynamic Context (~5,000-6,000 tokens typical, ~8,600 max)

**1. AI Notes** (~1,500 tokens | top 500 lines)
- Source: `conversation_ai_notes.md` (newest first)
- Hidden from user, AI's internal context tracking
- Token ratio per turn: 30% of user input (min 50, max 200)
- Appends at TOP after each user response

**2. Knowledge Tree** (~300 tokens | 100 lines)
- Current life_areas/ folder structure
- Last activity timestamps, document counts

**3. Vector Matched Areas - Recent Entries** (~500 tokens | 50 lines)
- Last entries from top 5 vector-matched areas
- Timestamped with user quotes, AI observations, sentiment

**4. Vector Matched Areas - Summaries** (~500 tokens | 50 lines)
- _AREA_SUMMARY.md from top 5 matched areas
- Current situation, timeline highlights, AI notes

**5. Vector Matched Chunks** (~1,000 tokens | 100 lines)
- Top 10 semantically relevant chunks from any document
- With metadata: area, document, timestamp, score

**6. Vector Matched Files** (~500 tokens | 100 lines)
- Top 10 file paths with descriptions and hierarchy
- Matched on name, description, or content
- Format: `[MD]` or `[HTML]` indicator

**7. Vector Matched Artifacts** (~300 tokens | 50 lines)
- Top 5 artifacts from current conversation
- Type, description, creation turn

**8. Current Artifact** (~2,000 tokens | up to 2,000 lines)
- Full HTML if user is viewing/referencing one
- Only included when actively referenced

**9. Conversation History** (~2,000 tokens | 100 lines)
- Last 10-20 turns with user input, AI response, operations
- Includes: area actions, artifacts, bubbles

### Current Turn (~100-500 tokens)
- User's current input

---

## 🔍 Vector Search Strategy (Every Turn)

### Three Parallel Queries with Weighted Scoring

**Query 1: Last 2 User Responses** (Weight: 3x | 40% budget)
```javascript
const recentUser = [
  messages[messages.length - 1].content,  // Current
  messages[messages.length - 3]?.content  // Previous user turn
].join('\n\n');
```
- Highest priority, captures immediate intent
- ~400 tokens allocated

**Query 2: All User Inputs** (Weight: 1.5x | 40% budget)
```javascript
const allUser = messages
  .filter(m => m.role === 'user')
  .map(m => m.content)
  .join('\n\n');
```
- Broader context, catches earlier topics
- User's actual language (no AI interpretation)
- ~400 tokens allocated

**Query 3: Full Conversation (User + AI)** (Weight: 0.5x | 20% budget)
```javascript
const fullConv = messages
  .map(m => m.content)
  .join('\n\n');
```
- Safety net, prevents AI repetition
- Catches when AI is going off-course
- ~200 tokens allocated

### Result Merging
1. Run all 3 queries in parallel
2. Apply weights to scores
3. Deduplicate (keep highest score per chunk)
4. Sort by weighted score
5. Distribute to sections (areas, chunks, files, artifacts)

---

## 📊 Token Budget Priority System

### Priority 1 (Always Include) - ~5,100 tokens
1. System instruction (~1,300)
2. AI Notes (~1,500)
3. Knowledge Tree (~300)
4. Conversation History (~2,000)

### Priority 2 (Include if Relevant) - ~2,000 tokens
5. Vector Matched Chunks (~1,000)
6. Vector Matched Areas - Recent (~500)
7. Vector Matched Areas - Summaries (~500)

### Priority 3 (Include if Space) - ~800 tokens
8. Vector Matched Files (~500)
9. Vector Matched Artifacts (~300)

### Priority 4 (Only When Referenced) - ~2,000 tokens
10. Current Artifact (~2,000)

**Total Range**: 7,100-10,000 tokens

---

## 🔄 AI Notes System

### Structured Output for Notes
```json
{
  "ai_notes_append": {
    "content": "2-5 sentences of internal context",
    "emotional_state": "worried, hopeful",
    "key_context": "Emma's reading breakthrough with graphic novels",
    "watch_for": "Follow up after teacher meeting"
  }
}
```

### Token Ratio Rules
- **Minimum**: 50 tokens (always write something)
- **Maximum**: 200 tokens (don't write essays)
- **Ratio**: ~30% of user input length
  - User 100 tokens → AI writes ~30-50 tokens
  - User 500 tokens → AI writes ~150-200 tokens

### Reading Strategy
- Read from TOP (newest first)
- Stop at 500 lines or ~1,500 tokens
- Paragraph boundary breaking (no mid-paragraph cuts)

---

## 📋 File Type Indicators

**Markdown** `[MD]`: Life areas documents, conversation logs, AI notes  
**HTML** `[HTML]`: Artifacts (charts, timelines, visualizations)

Example in prompt:
```
[MD] Family/Emma_School/reading_comprehension.md
     "Emma had breakthrough with graphic novel..."

[HTML] artifact_7_reflection_summary.html
       Type: reflection_summary | Created: Turn 7
       "Comprehensive summary of Emma's reading journey..."
```

---

## 🎯 Example Use Cases

### Case 1: Multi-Topic Rambling
**User**: "Emma's reading is tough but also startup hiring and Max's soccer and I'm exhausted..."

- Query 1 (recent): Matches all topics equally
- Query 2 (all user): Shows Emma discussed extensively → prioritize
- Query 3 (full conv): Shows AI hasn't discussed hiring → new topic
- **Result**: Balanced context for multi-topic response

### Case 2: Vague Question
**User**: "So what should I do?"

- Query 1 (recent): Previous was "teacher wants to discuss testing"
- Query 2 (all user): Full Emma's reading journey context
- Query 3 (full conv): What AI already suggested
- **Result**: AI understands context without re-explaining

### Case 3: AI Going Off-Course
**Scenario**: User mentioned exercise 5 turns ago, AI keeps bringing it up

- Query 1 (recent): User focused on Emma now
- Query 2 (all user): Exercise was casual mention
- Query 3 (full conv): AI already covered exercise extensively
- **Result**: AI should NOT bring up exercise again

---

## 🚀 Implementation Pseudocode

```javascript
// For each turn:
async function buildPrompt(messages, userInput) {
  // 1. Run vector search (3 queries in parallel)
  const vectorResults = await runMultiQueryVectorSearch(messages);
  
  // 2. Build context sections
  const context = {
    aiNotes: readAINotesTop500Lines(),
    knowledgeTree: generateAreasTree(),
    vectorAreas: vectorResults.areas.slice(0, 5),
    vectorChunks: vectorResults.chunks.slice(0, 10),
    vectorFiles: vectorResults.files.slice(0, 10),
    vectorArtifacts: vectorResults.artifacts.slice(0, 5),
    currentArtifact: userReferencesArtifact ? getArtifactHTML() : null,
    conversationHistory: messages.slice(-20)
  };
  
  // 3. Apply token budget with priority system
  const prompt = buildWithTokenBudget(context, {
    maxTokens: 10000,
    priorities: [1, 2, 3, 4]
  });
  
  // 4. Add current user input
  prompt.addUserInput(userInput);
  
  return prompt;
}

// After AI response:
async function processResponse(response) {
  // 1. Execute area operations
  await executeAreaActions(response.area_actions);
  
  // 2. Save artifacts
  if (response.artifact_action.action !== 'none') {
    await saveArtifact(response.artifact_action);
  }
  
  // 3. Append AI notes (at TOP)
  if (response.ai_notes_append) {
    await appendAINotesAtTop(response.ai_notes_append);
  }
  
  // 4. Update conversation history
  await updateConversation(response);
}
```

---

## 📐 Token Estimation

**Use tiktoken** for accurate counts:
```javascript
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4');
const tokens = enc.encode(text);
const tokenCount = tokens.length;
```

**Quick approximation**: ~4 characters per token

**Paragraph boundary breaking**:
```javascript
function getTokenChunk(text, maxTokens) {
  const paragraphs = text.split('\n\n');
  let chunk = '';
  let tokenCount = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (tokenCount + paraTokens > maxTokens) break;
    chunk += para + '\n\n';
    tokenCount += paraTokens;
  }
  return chunk;
}
```

---

## ⚡ Performance Targets

**Latency**:
- Vector search: ~100-150ms (3 parallel queries)
- Context assembly: ~50ms
- Total overhead: ~150-200ms
- **Target**: < 2s total per turn (including LLM)

**Cost** (Gemini 2.5 Flash Lite):
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens
- Per turn: ~$0.0005-0.0008 (half a cent)
- Per 10-turn conversation: ~$0.005-0.008 (less than a penny)

**Accuracy Targets**:
- Operation accuracy: > 95%
- Context utilization: > 90%
- Robustness (rambling/STT errors): > 85%
- Emotional intelligence: > 90%

---

## 🧪 Testing Priorities

1. **Operation Memory**: Verify no duplicate area creation
2. **Context Retrieval**: Verify vector search results used in responses
3. **Long Rambling Input**: Extract signal from noise
4. **STT Mistranscriptions**: Handle transcription errors gracefully
5. **Multi-Topic Tracking**: Route to correct areas
6. **Emotional Complexity**: Capture mixed emotions accurately

---

## 📝 Next Implementation Steps

**Week 1**: Fix current issues
- Add operation summaries to conversation history
- Implement AI notes system with token ratio
- Add recent operations to system prompt

**Week 2**: Vector search
- Set up local MLX embeddings
- Implement 3-query strategy
- Test with real conversations

**Week 3**: Robustness testing
- Create test scenarios for edge cases
- Measure accuracy metrics
- Optimize token budgets

**Week 4**: Production integration
- Integrate with Electron frontend
- Voice interaction testing
- User acceptance testing

---

**Status**: Architecture complete, ready for implementation 🚀
