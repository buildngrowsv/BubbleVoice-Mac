# User Input Isolation Design

**Date**: January 19, 2026  
**Purpose**: Separate user inputs from full conversation for better vector search

---

## Problem

Currently, vector search queries against the full conversation (user + AI responses). This means:
- AI's interpretations can bias search results
- User's actual words get diluted
- Hard to find "what did I say about X?"
- AI responses dominate the embedding space

---

## Solution: Separate User Input Tracking

### Conversation Folder Structure

```
conversations/
├── conv_20260119_143022/
│   ├── conversation.md              # Full conversation (user + AI)
│   ├── conversation_summary.md      # AI-maintained summary
│   ├── conversation_ai_notes.md     # Hidden AI notes
│   ├── user_inputs.md               # USER INPUTS ONLY (NEW)
│   └── artifacts/
│       ├── artifact_1.html
│       └── artifact_2.html
```

### `user_inputs.md` Format

```markdown
# User Inputs - Conversation 20260119_143022

**Started**: 2026-01-19 14:30:22  
**Last Updated**: 2026-01-19 14:45:33  
**Total Inputs**: 8

---

## Turn 1 (14:30:22)

I'm really worried about Emma. She's struggling with reading and I don't know how to help her.

---

## Turn 2 (14:31:45)

She's in 2nd grade. Her teacher said she can decode words but doesn't remember what she reads.

---

## Turn 3 (14:33:10)

We try to read together every night but she gets so frustrated. Last night she threw her book and said "I'm stupid." It broke my heart.

---

## Turn 4 (14:35:22)

Actually, I just remembered - we tried a graphic novel yesterday and she loved it! She read for like 20 minutes straight without complaining.

---

[continues...]
```

---

## Vector Search Strategy

### Current (Single Source)
```
Query → Search full conversation → Results
```

### Enhanced (Dual Source)
```
Query → Search user inputs (weight 2.0) ─┐
     └→ Search full conversation (weight 1.0) ─┤
                                               └→ Merge & Deduplicate → Results
```

### Why Dual Search?

1. **User Input Search (Higher Weight)**
   - Captures user's actual words
   - No AI interpretation bias
   - Better for "what did I say?" queries
   - More authentic voice

2. **Full Conversation Search (Lower Weight)**
   - Captures AI's summaries and insights
   - Better for "what did we discuss?" queries
   - Includes context and connections

---

## Implementation

### 1. Track User Inputs Separately

```javascript
// In test runners
const userInputs = [];

// After each turn
userInputs.push({
  turn: turnNumber,
  timestamp: Date.now(),
  content: step.user_input
});

// Write to file
writeUserInputsFile(conversationId, userInputs);
```

### 2. Chunk User Inputs

```javascript
// Chunk user_inputs.md separately
const userInputChunks = chunkingService.chunkDocument(
  `conversations/${conversationId}/user_inputs.md`,
  userInputsContent,
  { 
    type: 'user_inputs',
    conversationId 
  }
);
```

### 3. Dual Vector Search

```javascript
async function dualSourceVectorSearch(query, messages) {
  // Search 1: User inputs only (higher weight)
  const userInputResults = await vectorStore.search(query, {
    topK: 10,
    filter: { type: 'user_inputs' }
  });
  
  // Search 2: Full conversation (lower weight)
  const fullConvResults = await vectorStore.search(query, {
    topK: 10,
    filter: { type: 'conversation' }
  });
  
  // Merge with weights
  const weighted = [
    ...userInputResults.map(r => ({ ...r, score: r.score * 2.0 })),
    ...fullConvResults.map(r => ({ ...r, score: r.score * 1.0 }))
  ];
  
  // Deduplicate and sort
  return deduplicateAndSort(weighted);
}
```

---

## Multi-Query Strategy (Enhanced)

### Current: 3 Queries
1. Recent user inputs (last 2) - weight 3.0
2. All user inputs - weight 1.5
3. Full conversation - weight 0.5

### Enhanced: 5 Queries

1. **Recent user inputs** (last 2) - weight 3.0
   - Source: Current conversation messages
   
2. **All user inputs (current conversation)** - weight 1.5
   - Source: Current conversation messages
   
3. **Historical user inputs** - weight 2.0 ⭐ NEW
   - Source: `user_inputs.md` from all conversations
   - Captures: "What did I say about X in past conversations?"
   
4. **Full current conversation** - weight 0.5
   - Source: Current conversation (user + AI)
   
5. **Historical conversations** - weight 0.3 ⭐ NEW
   - Source: `conversation.md` from all conversations
   - Captures: "What did we discuss about X before?"

---

## Benefits

### 1. Better "What Did I Say?" Queries
```
User: "What did I say about Emma's reading?"

With user_inputs.md:
✅ "She's in 2nd grade. Her teacher said she can decode words..."
✅ "She threw her book and said 'I'm stupid'"
✅ "We tried a graphic novel and she loved it!"

Without:
❌ AI's summaries dominate
❌ User's exact words buried
```

### 2. Authentic Voice Capture
- Preserves user's language, not AI's interpretation
- Better for emotional tone analysis
- Captures self-corrections and tangents

### 3. Reduced AI Bias
- AI interpretations don't dominate search results
- User's perspective stays primary
- Better balance in context

### 4. Historical Tracking
- "What have I said about X over time?"
- Track evolution of user's thinking
- Identify patterns in user's concerns

---

## Metadata Schema

### User Input Chunks
```javascript
{
  id: 'chunk_abc123',
  text: 'She threw her book and said "I\'m stupid"',
  metadata: {
    type: 'user_input',
    conversationId: 'conv_20260119_143022',
    turn: 3,
    timestamp: 1705681990000,
    areaPath: null,  // Not area-specific
    documentPath: 'conversations/conv_20260119_143022/user_inputs.md'
  }
}
```

### Full Conversation Chunks
```javascript
{
  id: 'chunk_def456',
  text: 'User: She threw her book...\nAI: That must have been heartbreaking...',
  metadata: {
    type: 'conversation',
    conversationId: 'conv_20260119_143022',
    turnStart: 3,
    turnEnd: 4,
    timestamp: 1705681990000,
    documentPath: 'conversations/conv_20260119_143022/conversation.md'
  }
}
```

---

## Implementation Phases

### Phase 1: Basic Tracking ✅ (Current Task)
- [x] Create `user_inputs.md` per conversation
- [x] Write user inputs separately from full conversation
- [x] Chunk user inputs independently

### Phase 2: Dual Search
- [ ] Add metadata filtering to vector store
- [ ] Implement dual-source search
- [ ] Weight and merge results

### Phase 3: Multi-Query Enhancement
- [ ] Add historical user input search
- [ ] Add historical conversation search
- [ ] Implement 5-query strategy

### Phase 4: Testing
- [ ] Test "what did I say?" queries
- [ ] Compare with/without user input isolation
- [ ] Measure quality improvement

---

## File Structure After Implementation

```
tests/
├── knowledge-base/
│   ├── life_areas/           # Life area documents
│   └── conversations/        # Conversation history
│       ├── conv_001/
│       │   ├── conversation.md          # Full transcript
│       │   ├── conversation_summary.md  # AI summary
│       │   ├── conversation_ai_notes.md # Hidden notes
│       │   └── user_inputs.md          # User only ⭐
│       └── conv_002/
│           ├── conversation.md
│           ├── conversation_summary.md
│           ├── conversation_ai_notes.md
│           └── user_inputs.md          # User only ⭐
```

---

## Next Steps

1. ✅ Create design document (this file)
2. ⏳ Update test runners to track user inputs separately
3. ⏳ Write `user_inputs.md` files during test runs
4. ⏳ Update chunking service to handle user input files
5. ⏳ Add metadata filtering to vector store
6. ⏳ Implement dual-source search
7. ⏳ Test and compare results

---

## Expected Outcomes

- **Better recall**: "What did I say?" queries return user's exact words
- **Less bias**: AI interpretations don't dominate results
- **Authentic voice**: User's language preserved
- **Historical tracking**: Track user's thinking over time
- **Improved relevance**: Higher quality context for AI responses
