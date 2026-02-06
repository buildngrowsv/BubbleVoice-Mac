# Prompt Structure Analysis & Optimization

**Date**: January 19, 2026  
**Purpose**: Analyze current prompt structure, identify gaps, and design comprehensive context management

---

## 🔍 Current Implementation Analysis

### What's Actually Being Sent to the AI

#### 1. **Conversation History** (messages array)
```javascript
messages = [
  { role: 'user', content: 'I'm worried about Emma...' },
  { role: 'assistant', content: 'I hear you. Tell me more...' },  // ⚠️ ONLY spoken text
  { role: 'user', content: 'She's in 2nd grade...' },
  { role: 'assistant', content: 'It sounds like...' },  // ⚠️ ONLY spoken text
  // ...
]
```

**❌ PROBLEM**: Only the `user_response.spoken_text` is added to conversation history!

**Missing from history**:
- ❌ Internal notes
- ❌ Area actions taken
- ❌ Artifact actions
- ❌ Proactive bubbles
- ❌ Previous structured outputs

**Impact**: AI has NO MEMORY of what operations it performed!

---

#### 2. **System Prompt** (injected once)
```javascript
LIFE_AREAS_SYSTEM_PROMPT + areas_tree
```

**What's included**:
- ✅ Instructions for life areas operations
- ✅ Current areas tree (regenerated each turn)
- ✅ When to create/update areas
- ✅ Document structure guidelines

**What's missing**:
- ❌ Previous operations history
- ❌ Recent entries created
- ❌ Artifacts generated
- ❌ Context from vector search (not implemented yet)

---

#### 3. **Areas Tree** (regenerated each turn)
```
- Family/ (1 subprojects, last active 0m ago)
  - Emma_School/ (1 subprojects, 2 documents, last active 0m ago)
```

**What's included**:
- ✅ Folder structure
- ✅ Last activity times
- ✅ Document counts

**What's missing**:
- ❌ Recent entries (just structure, not content)
- ❌ Area summaries
- ❌ Related areas

---

### ❌ What's NOT Happening

1. **NO Vector Search**: Not implemented yet (planned for Phase 2)
2. **NO Chunking**: Not implemented yet (planned for Phase 2)
3. **NO Context Retrieval**: `read_for_context` operation exists but doesn't inject content into next prompt
4. **NO Operation Memory**: AI doesn't know what it did in previous turns

---

## 🚨 Critical Issues

### Issue 1: AI Has No Memory of Its Own Actions

**Current behavior**:
- Turn 1: AI creates `Family/Emma_School`
- Turn 2: AI creates `Family/Emma_School` AGAIN (doesn't remember it already created it)
- Turn 3: AI creates `Family/Emma_School` AGAIN

**Why**: Only spoken text is in conversation history, not the structured output.

**Solution**: Add operation summaries to conversation history.

---

### Issue 2: No Context from Previous Entries

**Current behavior**:
- User: "What have we discussed about Emma's reading?"
- AI: Calls `read_for_context` but the content is NOT injected into the prompt
- AI: Responds based on conversation history alone (not the actual entries)

**Why**: `read_for_context` executes but doesn't modify the next prompt.

**Solution**: Inject retrieved context into next turn's prompt.

---

### Issue 3: No Vector Search or Semantic Retrieval

**Current behavior**:
- AI can only reference what's in the conversation history
- No ability to search across all entries
- No semantic matching

**Why**: Vector search not implemented yet.

**Solution**: Implement embedding + hybrid search (Phase 2).

---

## 📋 Proposed Prompt Structure

### Complete Prompt Anatomy (Per Turn)

```
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM INSTRUCTION                                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Base System Prompt (role, capabilities, guidelines)     │
│ 2. Life Areas Instructions (operations, when to use)       │
│ 3. Current Areas Tree (structure, last activity)           │
│ 4. Recent Operations Summary (what AI did in last 3 turns) │
│ 5. Vector Search Results (if query triggered search)       │
│ 6. Retrieved Context (if read_for_context was called)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CONVERSATION HISTORY                                        │
├─────────────────────────────────────────────────────────────┤
│ Turn 1:                                                     │
│   User: "I'm worried about Emma..."                        │
│   Assistant: "I hear you..."                               │
│   [Operations: Created Family/Emma_School]                 │
│                                                             │
│ Turn 2:                                                     │
│   User: "She's in 2nd grade..."                            │
│   Assistant: "It sounds like..."                           │
│   [Operations: Appended entry to reading_comprehension.md] │
│                                                             │
│ Turn 3:                                                     │
│   User: "We try to read together..."                       │
│   Assistant: "Oh, that's so tough..."                      │
│   [Operations: Appended entry to struggles.md]             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CURRENT TURN                                                │
├─────────────────────────────────────────────────────────────┤
│ User: "What have we discussed about Emma's reading?"       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Detailed Prompt Sections

### Section 1: Base System Prompt
**Purpose**: Define AI's role and core capabilities  
**Token Budget**: ~300 tokens  
**Update Frequency**: Static (never changes)

```markdown
You are a personal AI companion for BubbleVoice Mac. You help users think through 
their life - goals, family, work, personal growth. You are:

- **Empathetic**: Understand and validate emotions
- **Thoughtful**: Capture context and patterns
- **Persistent**: Remember conversations across sessions
- **Proactive**: Suggest relevant topics via bubbles
- **Organized**: Structure information hierarchically

Your responses are spoken aloud via TTS, so be conversational and natural.
```

---

### Section 2: Life Areas Instructions
**Purpose**: Teach AI how to use the life areas system  
**Token Budget**: ~800 tokens  
**Update Frequency**: Static (rarely changes)

```markdown
LIFE AREAS SYSTEM:

You have access to a hierarchical folder system that organizes the user's 
personal information. This is your memory.

OPERATIONS:
1. create_area: Create new folder when significant topic emerges
2. append_entry: Add timestamped entry at TOP of document
3. update_summary: Refresh area summary with new insights
4. promote_to_subproject: Convert document to folder when complex
5. read_for_context: Retrieve specific areas for next turn

WHEN TO USE:
✅ create_area: First mention of significant personal topic (2+ sentences)
✅ append_entry: User shares updates about existing areas
✅ update_summary: Major insight or pattern emerges
✅ promote_to_subproject: Document has 10+ entries, needs sub-organization
✅ read_for_context: User asks "what have we discussed about X?"

IMPORTANT:
- Check CURRENT AREAS TREE before creating (avoid duplicates!)
- Entries go at TOP (newest first)
- Capture: timestamp, context, content, quotes, observations, sentiment
- Write as if leaving notes for your future self
```

---

### Section 3: Current Areas Tree
**Purpose**: Show AI what areas exist (avoid duplicates)  
**Token Budget**: ~100-300 tokens (grows with areas)  
**Update Frequency**: Every turn (regenerated after operations)

```markdown
CURRENT AREAS TREE:
- Family/ (1 subprojects, last active 2h ago)
  - Emma_School/ (3 documents, last active 2h ago)
    - reading_comprehension.md (last active 2h ago)
    - teacher_communication.md (last active 1d ago)
    - Learning_Differences/ (3 documents, last active 5h ago)
- Work/ (1 subproject, last active 1d ago)
  - Startup/ (2 documents, last active 1d ago)
- Personal_Growth/ (2 subprojects, last active 12h ago)
```

---

### Section 4: Recent Operations Summary ⭐ NEW
**Purpose**: Give AI memory of what it did recently  
**Token Budget**: ~200-400 tokens  
**Update Frequency**: Every turn (last 3-5 operations)

```markdown
RECENT OPERATIONS (Last 3 turns):

Turn 6:
  - Created: Family/Emma_School/Learning_Differences/
  - Appended: parent_concerns.md (timestamp: 2026-01-19 10:30:00)
  - Entry: User worried about testing and labeling Emma

Turn 5:
  - Appended: reading_comprehension.md (timestamp: 2026-01-19 10:15:00)
  - Entry: Dog Man graphic novel breakthrough - Emma read 20min straight

Turn 4:
  - Appended: reading_comprehension.md (timestamp: 2026-01-19 10:00:00)
  - Entry: Emma frustrated, threw book, said "I'm stupid"
```

**Why this matters**:
- AI knows what areas already exist
- AI knows what entries were just created
- AI can reference recent context
- Prevents duplicate operations

---

### Section 5: Vector Search Results ⭐ NEW (Phase 2)
**Purpose**: Inject semantically relevant context from past conversations  
**Token Budget**: ~500-1000 tokens (top 5-10 chunks)  
**Update Frequency**: When user query triggers search

```markdown
RELEVANT CONTEXT (Vector Search):

Query: "Emma reading comprehension struggles"
Found 5 relevant entries:

[1] Family/Emma_School/reading_comprehension.md (2026-01-19 10:15:00)
    Sentiment: hopeful
    "Dog Man graphic novel breakthrough - Emma read 20min straight without 
    complaining. Visual learning style hypothesis strengthening."
    
[2] Family/Emma_School/struggles.md (2026-01-19 10:00:00)
    Sentiment: heartbroken
    User quote: "She threw her book and said 'I'm stupid.' It broke my heart."
    
[3] Family/Emma_School/reading_comprehension.md (2026-01-19 09:45:00)
    Sentiment: concerned
    "Teacher noted she can decode words but doesn't retain what she reads. 
    Comprehension issue, not decoding."
    
[4] Family/Emma_School/_AREA_SUMMARY.md
    "Emma (2nd grade) struggling with reading comprehension. Can decode but 
    doesn't retain. Breakthrough with graphic novels suggests visual learning."
    
[5] Family/Emma_School/teacher_meetings.md (2026-01-17 18:30:00)
    "Parent-teacher conference scheduled to discuss testing for learning 
    differences. User conflicted about labeling."
```

**Why this matters**:
- AI can answer "what have we discussed?" accurately
- AI can spot patterns across time
- AI can reference specific past moments
- User never has to re-explain context

---

### Section 6: Retrieved Context ⭐ NEW
**Purpose**: Inject full content when AI calls `read_for_context`  
**Token Budget**: ~500-1500 tokens (depends on what's read)  
**Update Frequency**: When AI explicitly requests context

```markdown
RETRIEVED CONTEXT (Requested by AI):

[Family/Emma_School/_AREA_SUMMARY.md]
# Emma's School - Area Summary

**Created**: 2026-01-10
**Last Updated**: 2026-01-19 10:30:00
**Status**: Active - Needs Attention

## Current Situation
Emma (7yo, 2nd grade) struggling with reading comprehension. Can decode words 
but doesn't retain what she reads. Breakthrough with graphic novels (Dog Man) 
suggests visual learning style. Teacher wants to discuss testing for learning 
differences.

## Timeline Highlights
- 2026-01-19: Dog Man graphic novel - read 20min straight
- 2026-01-17: Parent-teacher conference scheduled
- 2026-01-15: Asked to read extra chapter (first time!)
- 2026-01-12: Frustration meltdown, threw book
- 2026-01-10: Teacher email about reading concerns

---

[Family/Emma_School/reading_comprehension.md] (First 5 entries)
### 2026-01-19 10:15:00
**Conversation Context**: User shared positive reading experience
Emma had breakthrough with Dog Man graphic novel. Read 20 minutes straight...

### 2026-01-19 10:00:00
**Conversation Context**: Initial discussion about reading struggles
Emma is in 2nd grade. Can decode but struggles with comprehension...
```

**Why this matters**:
- AI has full context for generating summaries
- AI can create accurate artifacts
- AI can reference specific details
- Supports "show me everything about X" queries

---

### Section 7: Conversation History (Enhanced) ⭐ MODIFIED
**Purpose**: Track dialogue AND operations  
**Token Budget**: ~1000-2000 tokens (last 10-20 turns)  
**Update Frequency**: Every turn

**Current format** (BAD):
```javascript
messages = [
  { role: 'user', content: 'I'm worried about Emma...' },
  { role: 'assistant', content: 'I hear you. Tell me more...' },
]
```

**Proposed format** (GOOD):
```javascript
messages = [
  { 
    role: 'user', 
    content: 'I'm worried about Emma. She's struggling with reading...' 
  },
  { 
    role: 'assistant', 
    content: `I hear you. Tell me more about what you've noticed.
    
[Operations performed:
- Created area: Family/Emma_School
- Created documents: reading_comprehension.md, teacher_communication.md
- Generated bubbles: "How old is Emma?", "What have you tried?"]` 
  },
]
```

**Why this matters**:
- AI knows what it already did
- Prevents duplicate operations
- Maintains operation context
- Enables self-correction

---

### Section 8: Artifacts Generated ⭐ NEW
**Purpose**: Track HTML artifacts created  
**Token Budget**: ~100-200 tokens  
**Update Frequency**: When artifacts are created

```markdown
ARTIFACTS GENERATED:

Turn 7: reflection_summary (artifact_turn7.html)
  Type: Reflection summary of Emma's reading journey
  HTML length: 3,245 chars
  Includes: Timeline, key insights, strategies tried, next steps
```

**Why this matters**:
- AI knows what visualizations exist
- AI can reference artifacts in conversation
- AI can update existing artifacts
- Prevents duplicate artifact creation

---

## 🎯 Proposed Implementation

### Enhanced Runner with Full Context

```javascript
// Initialize context tracking
const contextManager = {
  recentOperations: [],
  artifacts: [],
  retrievedContext: null,
  vectorSearchResults: null
};

// For each turn:
for (let i = 0; i < scenario.conversation_steps.length; i++) {
  const step = scenario.conversation_steps[i];
  
  // 1. Add user message
  messages.push({
    role: 'user',
    content: step.user_input
  });
  
  // 2. Build enhanced system prompt
  const systemPrompt = buildEnhancedSystemPrompt({
    basePrompt: LIFE_AREAS_SYSTEM_PROMPT,
    areasTree: generateAreasTree(),
    recentOperations: contextManager.recentOperations.slice(-5),
    retrievedContext: contextManager.retrievedContext,
    vectorSearchResults: contextManager.vectorSearchResults,
    artifacts: contextManager.artifacts
  });
  
  // 3. Call API
  const response = await callAPI(messages, systemPrompt);
  
  // 4. Execute operations
  const operationResults = await executeOperations(response.area_actions);
  
  // 5. Handle read_for_context
  if (response.area_actions.some(a => a.action === 'read_for_context')) {
    contextManager.retrievedContext = await retrieveContext(response.area_actions);
  }
  
  // 6. Track operations
  contextManager.recentOperations.push({
    turn: i + 1,
    operations: operationResults,
    timestamp: new Date().toISOString()
  });
  
  // 7. Track artifacts
  if (response.artifact_action.action !== 'none') {
    contextManager.artifacts.push({
      turn: i + 1,
      type: response.artifact_action.artifact_type,
      id: response.artifact_action.artifact_id
    });
  }
  
  // 8. Add assistant message WITH operations
  messages.push({
    role: 'assistant',
    content: formatAssistantMessage(response, operationResults)
  });
  
  // 9. Clear one-time context
  contextManager.retrievedContext = null;
  contextManager.vectorSearchResults = null;
}
```

---

## 🧪 Testing Scenarios Needed

### Test 1: Operation Memory
**Goal**: Verify AI remembers what it did

**Scenario**:
- Turn 1: Create `Family/Emma_School`
- Turn 2: User mentions Emma again
- **Expected**: AI should append to existing area, NOT create again
- **Current**: AI creates duplicate (FAILS)

---

### Test 2: Context Retrieval
**Goal**: Verify retrieved context is used

**Scenario**:
- Turn 1-5: Build up entries about Emma
- Turn 6: User asks "What have we discussed about Emma?"
- **Expected**: AI reads areas and generates accurate summary with specific details
- **Current**: AI responds from conversation history only (PARTIAL)

---

### Test 3: Long Rambling Input
**Goal**: Test AI's ability to extract signal from noise

**Scenario**:
```
User: "So yeah I was thinking about Emma and like you know she's been 
struggling with reading but also I'm worried about work and the startup 
and we need to hire someone but anyway back to Emma she threw her book 
last night and said she's stupid which broke my heart but also Max has 
soccer practice and I need to figure out the schedule and oh yeah Emma's 
teacher wants to meet about testing but I don't know if I want to label 
her you know what I mean?"
```

**Expected**:
- Create/append to `Family/Emma_School` (reading struggles, book throwing)
- Create/append to `Work/Startup` (hiring)
- Create/append to `Family/Max_Activities` (soccer)
- Generate bubbles: "Emma's reading?", "startup hiring?", "testing concerns?"

---

### Test 4: STT Mistranscriptions
**Goal**: Test AI's robustness to transcription errors

**Scenario**:
```
User (intended): "Emma's reading comprehension is struggling"
User (transcribed): "Emma's reading compression is struggling"

User (intended): "She can decode words but doesn't retain them"
User (transcribed): "She can the code words but doesn't return them"
```

**Expected**:
- AI should infer correct meaning from context
- AI should still create appropriate entries
- AI might note ambiguity in internal notes

---

### Test 5: Multi-Topic Conversation
**Goal**: Test AI's ability to track multiple simultaneous topics

**Scenario**:
- Turn 1: Emma's reading
- Turn 2: Startup fundraising
- Turn 3: Emma's reading again
- Turn 4: Exercise goals
- Turn 5: Emma's reading again
- Turn 6: Startup fundraising again

**Expected**:
- Correctly append to appropriate areas
- Don't mix topics
- Maintain context for each thread

---

### Test 6: Emotional Complexity
**Goal**: Test AI's emotional intelligence with mixed emotions

**Scenario**:
```
User: "I'm proud of Emma for trying but also frustrated that it's so hard 
for her and guilty that I didn't notice sooner and worried about what this 
means for her future but also hopeful because of the graphic novel thing."
```

**Expected**:
- Sentiment: mixed (proud, frustrated, guilty, worried, hopeful)
- Entry captures emotional complexity
- AI response validates all emotions
- Internal notes flag this as emotionally significant

---

## 📊 Evaluation Metrics

### 1. Operation Accuracy
- **Duplicate Prevention**: % of turns where AI correctly avoids duplicate creation
- **Correct Operation**: % of turns where AI chooses right operation type
- **Required Fields**: % of operations with all required fields present

**Target**: > 95% for all metrics

---

### 2. Context Utilization
- **Retrieved Context Used**: % of turns where retrieved context appears in response
- **Specific References**: % of summaries that include specific dates/quotes
- **Pattern Recognition**: % of turns where AI spots patterns across entries

**Target**: > 90% for all metrics

---

### 3. Robustness
- **Rambling Input Handling**: % of long/rambling inputs correctly parsed
- **STT Error Tolerance**: % of mistranscribed inputs correctly interpreted
- **Multi-Topic Tracking**: % of multi-topic turns with correct area routing

**Target**: > 85% for all metrics

---

### 4. Emotional Intelligence
- **Sentiment Accuracy**: % of entries with appropriate sentiment labels
- **Emotional Validation**: % of responses that validate user's emotions
- **Complex Emotions**: % of mixed-emotion entries that capture nuance

**Target**: > 90% for all metrics

---

### 5. Quality Metrics
- **Entry Completeness**: % of entries with context, content, quote, observation
- **Summary Currency**: % of summaries that reflect recent insights
- **Bubble Relevance**: % of bubbles that are contextually appropriate

**Target**: > 90% for all metrics

---

## 🚀 Implementation Priority

### Phase 1: Fix Current Issues (Week 1)
1. ✅ Add operation summaries to conversation history
2. ✅ Implement context injection for `read_for_context`
3. ✅ Add recent operations section to system prompt
4. ✅ Test with existing Emma scenario

### Phase 2: Enhanced Context (Week 2)
1. ✅ Implement vector search (embeddings + hybrid search)
2. ✅ Add vector search results section to prompt
3. ✅ Test with "what have we discussed?" queries
4. ✅ Measure context utilization metrics

### Phase 3: Robustness Testing (Week 3)
1. ✅ Create rambling input test scenarios
2. ✅ Create STT error test scenarios
3. ✅ Create multi-topic test scenarios
4. ✅ Measure robustness metrics

### Phase 4: Quality Optimization (Week 4)
1. ✅ Refine prompts based on test results
2. ✅ Add more examples to system prompt
3. ✅ Optimize token usage
4. ✅ Measure quality metrics

---

## 📝 Token Budget Analysis

### Current Usage (Per Turn)
- Base system prompt: ~300 tokens
- Life areas instructions: ~800 tokens
- Areas tree: ~100-300 tokens
- Conversation history: ~1000-2000 tokens
- **Total Input**: ~2200-3400 tokens

### Proposed Usage (Per Turn)
- Base system prompt: ~300 tokens
- Life areas instructions: ~800 tokens
- Areas tree: ~100-300 tokens
- Recent operations: ~200-400 tokens ⭐ NEW
- Vector search results: ~500-1000 tokens ⭐ NEW (when triggered)
- Retrieved context: ~500-1500 tokens ⭐ NEW (when requested)
- Artifacts list: ~100-200 tokens ⭐ NEW
- Conversation history: ~1000-2000 tokens
- **Total Input**: ~3500-6500 tokens

### Cost Impact
- **Current**: ~3000 tokens/turn × $0.075/1M = $0.000225/turn
- **Proposed**: ~5000 tokens/turn × $0.075/1M = $0.000375/turn
- **Increase**: +$0.00015/turn (+67%)
- **Per 10-turn conversation**: +$0.0015 (still < $0.01 total)

**Verdict**: Cost increase is acceptable for significantly better context and accuracy.

---

## ✅ Summary

### Current State
- ❌ AI has no memory of its own operations
- ❌ Retrieved context not injected into prompts
- ❌ No vector search or semantic retrieval
- ❌ Conversation history only includes spoken text

### Proposed State
- ✅ AI tracks recent operations (last 5 turns)
- ✅ Retrieved context injected when requested
- ✅ Vector search results injected when triggered
- ✅ Conversation history includes operations
- ✅ Artifacts tracked and referenced
- ✅ Full context for accurate responses

### Next Steps
1. Implement enhanced context manager
2. Update conversation history format
3. Add recent operations section
4. Implement context injection for `read_for_context`
5. Test with existing scenarios
6. Create new test scenarios (rambling, STT errors, multi-topic)
7. Measure and optimize

**Ready to implement!** 🚀
