# Prompt Input Structure - Draft Design

**Date**: January 19, 2026  
**Purpose**: Define the complete input structure for each AI turn, including conversation context, vector search results, and dynamic context

---

## 🗂️ Conversation Storage Structure

### Folder Organization

```
user_data/
├── conversations/
│   ├── conv_20260119_143022/
│   │   ├── conversation.md              # Full conversation transcript
│   │   ├── conversation_summary.md      # AI-maintained summary
│   │   ├── conversation_ai_notes.md     # Hidden AI notes (top 500 lines read)
│   │   └── artifacts/
│   │       ├── artifact_1_progress_chart.html
│   │       ├── artifact_2_timeline.html
│   │       └── artifact_3_mindmap.html
│   └── conv_20260119_150045/
│       ├── conversation.md
│       ├── conversation_summary.md
│       ├── conversation_ai_notes.md
│       └── artifacts/
└── life_areas/
    └── [existing structure]
```

### Conversation Files

#### 1. `conversation.md`
Full transcript of the conversation with timestamps and metadata.

```markdown
# Conversation: Emma's Reading Discussion

**Started**: 2026-01-19 14:30:22  
**Last Updated**: 2026-01-19 14:45:33  
**Turns**: 8  
**Areas Touched**: Family/Emma_School, Personal_Growth/Parenting

---

## Turn 1 (14:30:22)

**User**: I'm really worried about Emma. She's struggling with reading and I don't know how to help her.

**AI**: I hear you. It can be really worrying when our children struggle with something as important as reading. Tell me more about what you've noticed. What does her struggle look like?

**Operations**:
- Created area: Family/Emma_School
- Created documents: reading_comprehension.md, teacher_communication.md
- Bubbles: "How old is Emma?", "What have you tried so far?"

---

## Turn 2 (14:31:45)

**User**: She's in 2nd grade. Her teacher said she can decode words but doesn't remember what she reads.

**AI**: It sounds like Emma has the foundational skills for reading, but the comprehension isn't clicking yet...

**Operations**:
- Appended entry: Family/Emma_School/reading_comprehension.md
- Bubbles: "What strategies have you tried?", "How does she feel about reading?"

---
```

#### 2. `conversation_summary.md`
AI-maintained high-level summary of the conversation.

```markdown
# Conversation Summary

**Last Updated**: 2026-01-19 14:45:33

## Key Topics
- Emma's reading comprehension struggles (2nd grade)
- Graphic novel breakthrough (Dog Man)
- Teacher meeting about learning differences testing
- User's concerns about labeling

## Emotional Arc
Started: Worried, anxious  
Middle: Hopeful (graphic novel success)  
Current: Anxious but prepared (upcoming meeting)

## Areas Created/Updated
- Family/Emma_School (created, 7 entries)
- Family/Emma_School/Learning_Differences (created, 1 entry)

## Artifacts Generated
- Turn 7: Reflection summary (Emma's reading journey)

## Next Steps
- User will have teacher meeting
- Follow up after meeting
- Continue exploring graphic novels
```

#### 3. `conversation_ai_notes.md`
Hidden notes for AI's internal context tracking. **Top 500 lines read** (newest first).

```markdown
# AI Notes (Hidden from User)

**Note**: Entries are added at TOP. Only top 500 lines are read into context.

---

## Turn 8 (14:45:33)

User feels more prepared for teacher meeting after our summary. They appreciated having all the context organized. Will follow up after the meeting happens. Important to check in about how it went and how they're feeling about next steps.

**Emotional State**: Determined, prepared  
**Key Context**: Teacher meeting upcoming, user has summary of journey  
**Watch For**: Follow-up after meeting, potential anxiety about testing results

---

## Turn 7 (14:43:12)

User asked for comprehensive summary of Emma discussions. This indicates they're preparing for something (teacher meeting mentioned earlier). Generated reflection summary artifact with timeline, strategies tried, and insights. User seemed relieved to have everything organized.

**Emotional State**: Overwhelmed → Organized  
**Key Context**: Preparing for teacher meeting  
**Pattern**: User needs organization when facing important decisions/meetings

---

## Turn 6 (14:40:55)

Teacher wants to schedule meeting about testing for learning differences. User is worried about "labeling" Emma. This is a sensitive topic - user wants to help but fears stigma. Created Learning_Differences subproject to track this thread separately from general reading struggles.

**Emotional State**: Anxious, protective  
**Key Context**: Testing discussion is new and sensitive  
**Important**: Frame testing as "learning how Emma's brain works best" not "finding what's wrong"

---

## Turn 5 (14:38:22)

User had insight: "Maybe we've been pushing chapter books too hard?" This is significant - they're recognizing that their approach might need adjustment. Dog Man (graphic novel) was the breakthrough. Visual learning hypothesis is strengthening.

**Emotional State**: Hopeful, insightful  
**Key Context**: Graphic novels = breakthrough  
**Strategy**: Encourage more visual/illustrated books, celebrate this discovery

---

## Turn 4 (14:36:10)

Positive update! Emma read graphic novel (Dog Man) for 20 minutes straight without complaining. This is a major breakthrough compared to the frustration in Turn 3. User seemed excited sharing this. This is the kind of win we need to celebrate and build on.

**Emotional State**: Excited, hopeful  
**Key Context**: First sustained positive reading experience  
**Pattern**: Visual elements help Emma engage

---

## Turn 3 (14:34:05)

Emotional moment: Emma threw book and said "I'm stupid." User's heart broke. This is significant - Emma's self-esteem is being affected. User feels helpless. Need to address both the reading issue AND Emma's emotional well-being. This is about more than just reading skills.

**Emotional State**: Heartbroken, helpless  
**Key Context**: Emma's self-esteem at risk  
**Critical**: Must help user support Emma's confidence while addressing reading

---

## Turn 2 (14:31:45)

User provided specifics: Emma is 2nd grade, can decode but doesn't retain (comprehension issue). Teacher has noticed and communicated this. User seems concerned but not yet showing guilt (that might come later). This is a specific, diagnosable issue which is actually good - it's not vague.

**Emotional State**: Concerned, seeking understanding  
**Key Context**: Comprehension vs. decoding distinction is important  
**Teacher**: Involved and observant (positive sign)

---

## Turn 1 (14:30:22)

First mention of Emma's reading struggles. User is worried and feels unsure how to help. This is a significant parenting concern - created Family/Emma_School area to track. Need to gather more details about what specifically is happening and what's been tried.

**Emotional State**: Worried, uncertain  
**Key Context**: First mention, need more details  
**Created**: Family/Emma_School area
```

---

## 📊 Input Structure per Turn

### Token vs. Line Considerations

**Lines Approach**:
- ✅ Simple to implement (read first N lines)
- ✅ Predictable (always same structure)
- ❌ Variable token count (some lines are long, some short)
- ❌ May cut off mid-sentence/paragraph

**Token Chunk Approach**:
- ✅ Consistent token budget
- ✅ More efficient use of context window
- ❌ More complex to implement (need tokenizer)
- ❌ May still cut off mid-paragraph

**Recommendation**: Use **token chunks** with paragraph boundaries.
- Set token budget per section
- Break at paragraph boundaries (don't cut mid-paragraph)
- Track actual tokens used, not lines

---

## 🎯 Complete Input Structure (Per Turn)

### Section Breakdown

```
┌─────────────────────────────────────────────────────────────────────┐
│ SYSTEM INSTRUCTION (Static)                                         │
│ - Base system prompt                                   ~300 tokens  │
│ - Life areas instructions                              ~800 tokens  │
│ - Structured output schema instructions               ~200 tokens  │
│                                                                      │
│ Subtotal: ~1,300 tokens                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DYNAMIC CONTEXT (Updated Each Turn)                                │
├─────────────────────────────────────────────────────────────────────┤
│ 1. AI Notes (conversation_ai_notes.md, top 500 lines)              │
│    - Most recent internal notes                       ~1,500 tokens│
│    - Emotional tracking                                             │
│    - Pattern observations                                           │
│    - Context for future turns                                       │
├─────────────────────────────────────────────────────────────────────┤
│ 2. Knowledge Tree (life_areas structure)                           │
│    - Current folder structure                          ~300 tokens │
│    - Last activity timestamps                                       │
│    - Document counts                                                │
├─────────────────────────────────────────────────────────────────────┤
│ 3. Vector Matched Areas - Recent Entries (top 5 areas)             │
│    - Last entries from matched areas                   ~500 tokens │
│    - Timestamped, with context                                      │
│    - User quotes and AI observations                                │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Vector Matched Areas - Summaries (top 5 areas)                  │
│    - Area summaries (_AREA_SUMMARY.md)                ~500 tokens │
│    - Current situation, timeline, AI notes                          │
├─────────────────────────────────────────────────────────────────────┤
│ 5. Vector Matched Chunks (from all documents)                      │
│    - Semantically relevant chunks                     ~1,000 tokens│
│    - From any document in life_areas                                │
│    - With metadata (area, document, timestamp)                      │
├─────────────────────────────────────────────────────────────────────┤
│ 6. Vector Matched Files (names + descriptions)                     │
│    - File paths with descriptions                      ~500 tokens │
│    - Matched on name, description, or content                      │
│    - Hierarchy/location info                                        │
├─────────────────────────────────────────────────────────────────────┤
│ 7. Vector Matched Artifacts (names + descriptions)                 │
│    - Artifact IDs and descriptions                     ~300 tokens │
│    - HTML artifacts from this conversation                          │
│    - Type and purpose                                               │
├─────────────────────────────────────────────────────────────────────┤
│ 8. Current Artifact (if user is viewing one)                       │
│    - Full HTML of currently viewed artifact          ~2,000 tokens │
│    - Only included if user references it                            │
├─────────────────────────────────────────────────────────────────────┤
│ 9. Conversation History (last 10-20 turns)                         │
│    - User inputs and AI responses                    ~2,000 tokens │
│    - With operation summaries                                       │
│    - Emotional context                                              │
│                                                                      │
│ Subtotal: ~8,600 tokens (max)                                       │
│ Typical: ~5,000-6,000 tokens (when not all sections active)        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ CURRENT TURN                                                        │
│ - User's current input                                ~100-500 tokens│
└─────────────────────────────────────────────────────────────────────┘

TOTAL INPUT: ~7,000-10,000 tokens per turn
```

---

## 📝 Detailed Section Specifications

### 1. AI Notes (Top 500 Lines / ~1,500 Tokens)

**Source**: `conversations/[conv_id]/conversation_ai_notes.md`  
**Reading Strategy**: Read from top (newest first) until token budget exhausted  
**Format**: Markdown with structured entries

**Content Structure**:
```markdown
## Turn N (timestamp)

[2-5 sentences of context, observations, emotional state]

**Emotional State**: [emotion keywords]
**Key Context**: [critical info to remember]
**Pattern/Watch For**: [observations, things to track]
```

**Token Budget**: ~1,500 tokens (approximately 500 lines)

**Why Top-Down Reading**:
- Most recent context is most relevant
- Older notes become less important over time
- Natural decay of relevance

**AI's Structured Output for Notes**:
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

**Token Ratio Rule**:
- **Minimum**: 50 tokens (always write something meaningful)
- **Maximum**: 200 tokens (don't write essays)
- **Ratio**: ~30% of user input length
  - User says 100 tokens → AI writes ~30-50 tokens of notes
  - User says 500 tokens → AI writes ~150-200 tokens of notes

---

### 2. Knowledge Tree (~300 Tokens)

**Source**: Generated from `life_areas/` folder structure  
**Format**: Compact tree view with metadata

```
LIFE AREAS STRUCTURE:

- Family/ (2 subprojects, last active 2h ago)
  - Emma_School/ (1 subproject, 3 documents, last active 2h ago)
    - reading_comprehension.md (7 entries, last: 2h ago)
    - teacher_communication.md (2 entries, last: 1d ago)
    - Learning_Differences/ (3 documents, last active 5h ago)
      - parent_concerns.md (1 entry, last: 5h ago)
      - teacher_meeting.md (0 entries)
      - testing_information.md (0 entries)
  - Max_Activities/ (1 document, last active 3d ago)
    - soccer_season.md (3 entries, last: 3d ago)

- Work/ (1 subproject, last active 1d ago)
  - Startup/ (2 documents, last active 1d ago)
    - fundraising.md (5 entries, last: 1d ago)
    - team_hiring.md (3 entries, last: 2d ago)

- Personal_Growth/ (2 subprojects, last active 12h ago)
  - Exercise_Goals/ (2 documents, last active 12h ago)
  - Mental_Health/ (1 document, last active 3d ago)
```

**Token Budget**: ~300 tokens

---

### 3. Vector Matched Areas - Recent Entries (~500 Tokens)

**Source**: Last entries from top 5 vector-matched areas  
**Vector Match**: Based on current user input + conversation context  
**Format**: Abbreviated entries with key info

```
RECENT ENTRIES (Top 5 Matched Areas):

[1] Family/Emma_School/reading_comprehension.md
    2026-01-19 10:15:00 | Sentiment: hopeful
    "Dog Man graphic novel breakthrough - Emma read 20min straight. 
    Visual learning style hypothesis strengthening."

[2] Family/Emma_School/struggles.md
    2026-01-19 10:00:00 | Sentiment: heartbroken
    User quote: "She threw her book and said 'I'm stupid.'"
    Emma's self-esteem being affected by reading struggles.

[3] Family/Emma_School/reading_comprehension.md
    2026-01-19 09:45:00 | Sentiment: concerned
    "Teacher noted she can decode words but doesn't retain. 
    Comprehension issue, not decoding."

[4] Personal_Growth/Parenting/guilt.md
    2026-01-18 14:20:00 | Sentiment: guilty
    "Feeling like I should have noticed Emma's struggles sooner."

[5] Family/Emma_School/teacher_communication.md
    2026-01-17 18:30:00 | Sentiment: anxious
    "Teacher wants to schedule meeting about learning differences testing."
```

**Token Budget**: ~500 tokens (100 tokens per area × 5 areas)

---

### 4. Vector Matched Areas - Summaries (~500 Tokens)

**Source**: `_AREA_SUMMARY.md` from top 5 vector-matched areas  
**Format**: Abbreviated summaries with key sections

```
AREA SUMMARIES (Top 5 Matched):

[1] Family/Emma_School
    Status: Active - Needs Attention
    Emma (7yo, 2nd grade) struggling with reading comprehension. Can decode 
    but doesn't retain. Breakthrough with graphic novels suggests visual 
    learning. Teacher wants to discuss testing for learning differences.
    Timeline: 10 days of tracking, 7 entries, 2 breakthroughs

[2] Family/Emma_School/Learning_Differences
    Status: New - Just Created
    Teacher recommended testing for learning differences. User conflicted 
    about labeling Emma but wants to help. Meeting scheduled.
    Timeline: 1 day of tracking, 1 entry

[3] Personal_Growth/Parenting
    Status: Active
    User processing parenting challenges, guilt about not noticing issues 
    sooner, balancing work and family time.
    Timeline: 2 weeks of tracking, 12 entries

[4] Work/Startup
    Status: Active - High Stress
    Fundraising challenges, team hiring, product development pressure.
    Timeline: 3 weeks of tracking, 18 entries

[5] Personal_Growth/Exercise_Goals
    Status: Active - Struggling
    Running 3x/week goal, struggling with consistency, fatigue after work.
    Timeline: 2 weeks of tracking, 5 entries
```

**Token Budget**: ~500 tokens (100 tokens per area × 5 areas)

---

### 5. Vector Matched Chunks (~1,000 Tokens)

**Source**: Any document in `life_areas/`, chunked by entry or paragraph  
**Vector Match**: Semantic similarity to current user input  
**Format**: Chunks with metadata

```
RELEVANT CHUNKS (Semantic Match):

[1] Score: 0.92 | Family/Emma_School/reading_comprehension.md
    Entry: 2026-01-19 10:15:00
    "Emma had a breakthrough with a graphic novel last week. She was engaged 
    and read for approximately 20 minutes without any frustration. This 
    indicates that visual elements and a different format might significantly 
    improve her reading engagement and potentially her comprehension."

[2] Score: 0.89 | Family/Emma_School/struggles.md
    Entry: 2026-01-19 10:00:00
    "Emma had a meltdown during reading homework. Threw her book and said 
    'I'm stupid.' User tried to comfort her but Emma shut down. Homework 
    took 2 hours (should be 20 minutes). User feels helpless."

[3] Score: 0.87 | Personal_Growth/Parenting/strategies.md
    Entry: 2026-01-15 09:30:00
    "Tried positive reinforcement approach - praising effort not results. 
    Emma responded well. She asked to read an extra chapter (first time!). 
    The book was 'Ivy & Bean' - similar level but more engaging topic."

[4] Score: 0.85 | Family/Emma_School/_AREA_SUMMARY.md
    Section: What's Working
    "Graphic novels (more engaged), Reading together vs. alone, Praise for 
    effort not just results. Key insight: Visual learning style may be 
    Emma's strength."

[5] Score: 0.83 | Family/Emma_School/teacher_communication.md
    Entry: 2026-01-17 18:30:00
    "Parent-teacher conference scheduled. Teacher recommended educational 
    testing to rule out learning differences (dyslexia, ADHD). User feels 
    conflicted - wants to help but worried about labeling."

[... up to 10 chunks total]
```

**Token Budget**: ~1,000 tokens (100 tokens per chunk × 10 chunks)

---

### 6. Vector Matched Files (~500 Tokens)

**Source**: All files in `life_areas/`, matched by name, description, or content  
**Format**: File paths with descriptions and hierarchy

```
RELEVANT FILES (Name/Content Match):

[1] Family/Emma_School/reading_comprehension.md
    Location: Family > Emma_School
    Description: Time-ordered log of Emma's reading comprehension journey
    Entries: 7 | Last updated: 2h ago
    Match: Content similarity to "reading comprehension struggles"

[2] Family/Emma_School/struggles.md
    Location: Family > Emma_School
    Description: Emotional and behavioral struggles during reading
    Entries: 4 | Last updated: 2h ago
    Match: Content similarity to "frustration, self-esteem"

[3] Family/Emma_School/Learning_Differences/parent_concerns.md
    Location: Family > Emma_School > Learning_Differences
    Description: User's concerns about testing and labeling
    Entries: 1 | Last updated: 5h ago
    Match: Content similarity to "testing, learning differences"

[4] Personal_Growth/Parenting/strategies.md
    Location: Personal_Growth > Parenting
    Description: Parenting strategies tried and their effectiveness
    Entries: 8 | Last updated: 3d ago
    Match: Content similarity to "parenting approaches, positive reinforcement"

[5] Work/Startup/work_life_balance.md
    Location: Work > Startup
    Description: Struggles balancing startup demands with family time
    Entries: 6 | Last updated: 1d ago
    Match: Related to "guilt about not spending enough time with kids"

[... up to 10 files total]
```

**Token Budget**: ~500 tokens (50 tokens per file × 10 files)

---

### 7. Vector Matched Artifacts (~300 Tokens)

**Source**: HTML artifacts from current conversation  
**Format**: Artifact metadata with descriptions

```
ARTIFACTS IN THIS CONVERSATION:

[1] artifact_7_reflection_summary.html
    Type: reflection_summary
    Created: Turn 7 (2026-01-19 14:43:12)
    Description: Comprehensive summary of Emma's reading journey with timeline, 
    strategies tried, breakthroughs, and next steps. Includes visual timeline 
    and key insights section.
    Match: "summary of Emma discussions"

[2] artifact_3_progress_chart.html
    Type: progress_chart
    Created: Turn 3 (2026-01-19 14:34:05)
    Description: Chart showing Emma's reading time per session over 2 weeks. 
    Highlights the 20-minute graphic novel session as a breakthrough.
    Match: "progress tracking, visual representation"

[... up to 5 artifacts total]
```

**Token Budget**: ~300 tokens (60 tokens per artifact × 5 artifacts)

---

### 8. Current Artifact (~2,000 Tokens)

**Source**: Full HTML of artifact user is currently viewing  
**Included When**: User references "this chart" or "update this" or UI indicates artifact is open  
**Format**: Complete HTML

```
CURRENT ARTIFACT (User is viewing):

artifact_7_reflection_summary.html:
<!DOCTYPE html>
<html>
<head>
    <title>Emma's Reading Journey - Summary</title>
    <style>
        /* Liquid glass styling */
        body { background: linear-gradient(...); }
        .timeline { ... }
    </style>
</head>
<body>
    <h1>Emma's Reading Journey</h1>
    <div class="timeline">
        <div class="event">
            <span class="date">Jan 19</span>
            <span class="title">Graphic Novel Breakthrough</span>
            <p>Emma read Dog Man for 20 minutes straight...</p>
        </div>
        <!-- ... more content ... -->
    </div>
</body>
</html>
```

**Token Budget**: ~2,000 tokens (only when user is actively viewing/referencing)

---

### 9. Conversation History (~2,000 Tokens)

**Source**: `conversations/[conv_id]/conversation.md`  
**Format**: Last 10-20 turns with operations

```
CONVERSATION HISTORY:

Turn 7 (14:43:12):
  User: "What have we discussed about Emma's reading? I want to make sure 
  I'm remembering everything for the teacher meeting."
  
  AI: "I can help with that. It sounds like you're feeling a bit overwhelmed 
  with the upcoming meeting and want to be prepared. Let's review what we've 
  discussed about Emma's reading so far."
  
  Operations:
  - read_for_context: Family/Emma_School (all documents)
  - create_artifact: reflection_summary (artifact_7_reflection_summary.html)
  - Bubbles: "meeting prep?", "questions for teacher?"

Turn 6 (14:40:55):
  User: "Her teacher wants to schedule a meeting to discuss testing for 
  learning differences. I'm worried about labeling her."
  
  AI: "It's completely understandable to feel worried about testing and 
  labeling. You want what's best for Emma, and it's natural to want to 
  protect her."
  
  Operations:
  - create_area: Family/Emma_School/Learning_Differences
  - append_entry: parent_concerns.md (sentiment: anxious)
  - Bubbles: "What are your main concerns?", "What info do you need?"

[... last 10-20 turns ...]
```

**Token Budget**: ~2,000 tokens (200 tokens per turn × 10 turns)

---

## 🔄 Dynamic Token Allocation

### Priority System

When approaching token limits, prioritize sections:

**Priority 1** (Always include):
1. System instruction (~1,300 tokens)
2. AI Notes (~1,500 tokens)
3. Knowledge Tree (~300 tokens)
4. Conversation History (~2,000 tokens)

**Priority 2** (Include if relevant):
5. Vector Matched Chunks (~1,000 tokens)
6. Vector Matched Areas - Recent Entries (~500 tokens)
7. Vector Matched Areas - Summaries (~500 tokens)

**Priority 3** (Include if space allows):
8. Vector Matched Files (~500 tokens)
9. Vector Matched Artifacts (~300 tokens)

**Priority 4** (Include only when user references):
10. Current Artifact (~2,000 tokens)

### Total Budget Management

**Target**: 8,000-10,000 tokens per turn  
**Maximum**: 12,000 tokens per turn (with current artifact)

**Typical Breakdown**:
- System instruction: 1,300 tokens (13%)
- AI Notes: 1,500 tokens (15%)
- Knowledge Tree: 300 tokens (3%)
- Conversation History: 2,000 tokens (20%)
- Vector Search Results: 2,500 tokens (25%)
- Current Turn: 100-500 tokens (5%)
- **Total**: ~8,000 tokens

---

## 📊 File Type Indicators

### Markdown vs. HTML

**Markdown Files** (`.md`):
- Life areas documents (entries, summaries)
- Conversation transcripts
- AI notes
- Knowledge tree representation

**HTML Files** (`.html`):
- Artifacts (charts, timelines, visualizations)
- Current artifact being viewed
- Artifact descriptions include `[HTML]` tag

**In Prompt**:
```
[MD] Family/Emma_School/reading_comprehension.md
     "Emma had breakthrough with graphic novel..."

[HTML] artifact_7_reflection_summary.html
       Type: reflection_summary
       "Comprehensive summary of Emma's reading journey..."
```

---

## 🎯 Implementation Considerations

### Paragraph Boundary Breaking

**Problem**: Token chunks might cut mid-paragraph

**Solution**: Break at paragraph boundaries
```javascript
function getTokenChunk(text, maxTokens) {
  const paragraphs = text.split('\n\n');
  let chunk = '';
  let tokenCount = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (tokenCount + paraTokens > maxTokens) {
      break;
    }
    chunk += para + '\n\n';
    tokenCount += paraTokens;
  }
  
  return chunk;
}
```

### Token Estimation

**Use**: tiktoken library (OpenAI's tokenizer)
```javascript
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('gpt-4');
const tokens = enc.encode(text);
const tokenCount = tokens.length;
```

**Approximation**: ~4 characters per token (for quick estimates)

---

## 🧪 Testing Scenarios

### Test 1: Token Budget Adherence
- Verify each section stays within budget
- Test with varying conversation lengths
- Ensure priority system works

### Test 2: Paragraph Boundary Breaking
- Verify no mid-paragraph cuts
- Test with long paragraphs
- Ensure readability

### Test 3: Dynamic Allocation
- Test with all sections active
- Test with minimal sections (early conversation)
- Test with current artifact included

### Test 4: Vector Search Quality
- Verify top matches are relevant
- Test with ambiguous queries
- Test with multi-topic conversations

---

## 📋 Open Questions

1. **AI Notes Token Ratio**: Is 30% of user input the right ratio? Should it be fixed (e.g., always 100 tokens)?

2. **Vector Search Trigger**: When do we trigger vector search?
   - Every turn? (expensive)
   - Only when user asks questions? (too limited)
   - When conversation shifts topics? (how to detect?)

3. **Current Artifact Detection**: How do we know when user is viewing an artifact?
   - UI sends flag?
   - User explicitly references it?
   - Always include last artifact?

4. **Token Budget Flexibility**: Should we have different budgets for different conversation types?
   - Quick check-in: 5,000 tokens
   - Deep discussion: 10,000 tokens
   - Summary request: 12,000 tokens

5. **Conversation Summary Update Frequency**: How often should `conversation_summary.md` be updated?
   - Every turn? (expensive)
   - Every 5 turns? (might miss important shifts)
   - When conversation ends? (too late for context)

---

## ✅ RESOLVED: Vector Search Strategy

### Multi-Query Vector Search (Every Turn)

**Decision**: Run vector search on EVERY turn with multiple queries at different scopes.

**Why**: 
- Recent context is most important (user's immediate needs)
- Full conversation provides broader context (prevents repetition)
- AI responses matter (catch when AI is going off-course)

### Query Strategy

Run **3 separate vector searches** per turn:

#### Query 1: Last 2 User Responses (Highest Weight)
**Purpose**: Capture immediate user intent and recent topics  
**Scope**: Last 2 user inputs only (excluding AI responses)  
**Weight**: 3x (highest priority)  
**Token Budget**: ~400 tokens (40% of vector search budget)

```javascript
// Example
const recentUserInputs = [
  messages[messages.length - 1].content,  // Current turn
  messages[messages.length - 3]?.content  // Previous user turn
].filter(Boolean).join('\n\n');

const query1Results = await vectorSearch(recentUserInputs, {
  weight: 3.0,
  topK: 10
});
```

**Example**:
```
Query: "Her teacher wants to schedule a meeting to discuss testing for 
learning differences. I'm worried about labeling her."

+ Previous: "It was Dog Man. She thought it was hilarious. Maybe we've 
been pushing chapter books too hard?"

Results:
- Family/Emma_School/Learning_Differences/* (NEW topic, high relevance)
- Family/Emma_School/reading_comprehension.md (graphic novels)
- Personal_Growth/Parenting/concerns.md (labeling anxiety)
```

---

#### Query 2: Full Conversation (User Inputs Only) (Medium Weight)
**Purpose**: Broader context, catch topics mentioned earlier  
**Scope**: All user inputs from current conversation (no AI responses)  
**Weight**: 1.5x (medium priority)  
**Token Budget**: ~400 tokens (40% of vector search budget)

```javascript
// Example
const allUserInputs = messages
  .filter(m => m.role === 'user')
  .map(m => m.content)
  .join('\n\n');

const query2Results = await vectorSearch(allUserInputs, {
  weight: 1.5,
  topK: 10
});
```

**Why User-Only**:
- User's words reflect their actual concerns
- Avoids AI's interpretations biasing the search
- User's language is what they'll remember and reference

**Example**:
```
Query: All user inputs from conversation (8 turns)
- "I'm worried about Emma..."
- "She's in 2nd grade..."
- "We try to read together..."
- "Actually, I just remembered - graphic novel..."
- "It was Dog Man..."
- "Her teacher wants to schedule a meeting..."
- "What have we discussed about Emma's reading?"
- "Thanks, that's really helpful..."

Results:
- Family/Emma_School/* (all documents, comprehensive match)
- Personal_Growth/Parenting/* (parenting concerns)
- Work/Startup/work_life_balance.md (guilt about time)
```

---

#### Query 3: Full Conversation (Including AI) (Low Weight)
**Purpose**: Catch when AI is about to repeat itself or go off-course  
**Scope**: All messages (user + AI) from current conversation  
**Weight**: 0.5x (low priority, safety net)  
**Token Budget**: ~200 tokens (20% of vector search budget)

```javascript
// Example
const fullConversation = messages
  .map(m => m.content)
  .join('\n\n');

const query3Results = await vectorSearch(fullConversation, {
  weight: 0.5,
  topK: 5
});
```

**Why Include AI Responses**:
- AI might have mentioned related topics user didn't
- Prevents AI from rehashing what it already said
- Catches when AI is about to go in circles

**Example**:
```
Query: Full conversation including AI responses

AI previously said: "It sounds like Emma has the foundational skills for 
reading, but the comprehension isn't clicking yet. That's a common challenge..."

If user now says: "Yeah, so what should I do?"

This query helps AI realize:
- Already discussed comprehension vs. decoding
- Already validated user's concern
- Should move to solutions, not repeat diagnosis
```

---

### Result Merging & Deduplication

**Process**:
1. Run all 3 queries in parallel
2. Apply weights to scores
3. Merge results with deduplication
4. Sort by weighted score
5. Take top N results per section

```javascript
async function runMultiQueryVectorSearch(messages) {
  // Extract queries
  const recentUser = getRecentUserInputs(messages, 2);
  const allUser = getAllUserInputs(messages);
  const fullConv = getFullConversation(messages);
  
  // Run searches in parallel
  const [results1, results2, results3] = await Promise.all([
    vectorSearch(recentUser, { topK: 10 }),
    vectorSearch(allUser, { topK: 10 }),
    vectorSearch(fullConv, { topK: 5 })
  ]);
  
  // Apply weights and merge
  const weighted = [
    ...results1.map(r => ({ ...r, score: r.score * 3.0, source: 'recent' })),
    ...results2.map(r => ({ ...r, score: r.score * 1.5, source: 'all_user' })),
    ...results3.map(r => ({ ...r, score: r.score * 0.5, source: 'full_conv' }))
  ];
  
  // Deduplicate (keep highest score per chunk)
  const deduped = deduplicateByChunkId(weighted);
  
  // Sort by weighted score
  deduped.sort((a, b) => b.score - a.score);
  
  // Organize by section
  return {
    areas: extractTopAreas(deduped, 5),
    chunks: extractTopChunks(deduped, 10),
    files: extractTopFiles(deduped, 10),
    artifacts: extractTopArtifacts(deduped, 5)
  };
}
```

---

### Scoring Example

**Scenario**: User says "Her teacher wants to discuss testing"

**Chunk**: `Family/Emma_School/Learning_Differences/parent_concerns.md`

**Scores**:
- Query 1 (recent user): 0.95 × 3.0 = **2.85**
- Query 2 (all user): 0.70 × 1.5 = **1.05**
- Query 3 (full conv): 0.60 × 0.5 = **0.30**

**Final Score**: 2.85 (takes highest from Query 1)

**Why This Works**:
- Recent mention = highest relevance
- Also appears in broader context (validates importance)
- Mentioned in full conversation (AI already discussed it)
- Clear signal: This is the most relevant chunk right now

---

### Edge Case Handling

#### Case 1: User Rambles About Multiple Topics

**Input**: "So Emma's reading is tough but also I need to hire someone for the startup and Max has soccer and I'm exhausted from not exercising..."

**Query 1 (Recent)**: Matches all topics equally
- Family/Emma_School/reading_comprehension.md
- Work/Startup/team_hiring.md
- Family/Max_Activities/soccer_season.md
- Personal_Growth/Exercise_Goals/running.md

**Query 2 (All User)**: Provides historical context for each
- Shows Emma's reading has been discussed extensively (prioritize)
- Startup hiring is newer topic (also important)
- Max's soccer is casual mention (lower priority)
- Exercise is recurring struggle (medium priority)

**Query 3 (Full Conv)**: Safety check
- AI hasn't discussed hiring yet (new topic, should address)
- AI has discussed Emma extensively (can reference previous insights)

**Result**: Balanced context for multi-topic response

---

#### Case 2: User Asks Vague Question

**Input**: "So what should I do?"

**Query 1 (Recent)**: Too vague, low scores
- Previous user input: "Her teacher wants to discuss testing"
- Matches: Learning_Differences/* (high relevance)

**Query 2 (All User)**: Provides full context
- Emma's reading struggles
- Graphic novel breakthrough
- Testing concerns
- Matches: All Emma_School/* (comprehensive)

**Query 3 (Full Conv)**: Shows what AI already suggested
- AI suggested: "Testing is information-gathering, not labeling"
- AI suggested: "Continue with graphic novels"
- Prevents repetition

**Result**: AI understands "what should I do" refers to testing decision + reading strategies

---

#### Case 3: AI Going Off-Course

**Scenario**: 
- User mentioned exercise goals 5 turns ago
- AI keeps bringing it up even though user moved on to Emma's reading

**Query 1 (Recent)**: Emma's reading (high scores)
**Query 2 (All User)**: Emma's reading + exercise mention (mixed scores)
**Query 3 (Full Conv)**: Shows AI already discussed exercise extensively

**Result**: 
- Query 3 flags that exercise was already covered
- Query 1 shows user is focused on Emma now
- AI should NOT bring up exercise again

---

### Token Budget Allocation

**Total Vector Search Budget**: ~1,000 tokens

**Distribution**:
- Query 1 (Recent User): 400 tokens (40%)
- Query 2 (All User): 400 tokens (40%)
- Query 3 (Full Conv): 200 tokens (20%)

**Why This Split**:
- Recent context is most valuable (40%)
- Broader user context prevents missing topics (40%)
- Full conversation is safety net (20%)

---

### Implementation

```javascript
// In life-areas-runner.js

async function getVectorSearchContext(messages) {
  // 1. Extract queries
  const recentUserQuery = messages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content)
    .join('\n\n');
  
  const allUserQuery = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n\n');
  
  const fullConvQuery = messages
    .map(m => m.content)
    .join('\n\n');
  
  // 2. Run multi-query search
  const results = await runMultiQueryVectorSearch({
    recentUser: recentUserQuery,
    allUser: allUserQuery,
    fullConv: fullConvQuery
  });
  
  // 3. Format for prompt
  return formatVectorSearchResults(results, {
    areas: 5,
    chunks: 10,
    files: 10,
    artifacts: 5
  });
}

// Add to prompt building
const systemPrompt = buildEnhancedSystemPrompt({
  basePrompt: LIFE_AREAS_SYSTEM_PROMPT,
  areasTree: generateAreasTree(),
  recentOperations: contextManager.recentOperations.slice(-5),
  vectorSearchResults: await getVectorSearchContext(messages), // ⭐ NEW
  retrievedContext: contextManager.retrievedContext,
  artifacts: contextManager.artifacts
});
```

---

### Benefits of This Approach

✅ **Recent Context Prioritized**: Last 2 user inputs weighted 3x  
✅ **Broader Context Available**: Full user history weighted 1.5x  
✅ **Repetition Prevention**: Full conversation (with AI) weighted 0.5x  
✅ **Multi-Topic Handling**: All queries run, results merged intelligently  
✅ **Vague Query Support**: Broader context fills in the gaps  
✅ **Off-Course Detection**: AI responses help catch circular discussions  

---

### Performance Considerations

**Latency**:
- 3 vector searches run in parallel (not sequential)
- Each search: ~50-100ms (local MLX model)
- Total overhead: ~100-150ms per turn
- Acceptable for voice AI (< 2s total latency target)

**Cost**:
- Vector search is local (no API cost)
- Only cost is embedding generation (one-time per entry)
- Negligible compared to LLM API calls

**Optimization**:
- Cache recent embeddings
- Use smaller embedding model for speed (e.g., MiniLM-L6)
- Batch embed new entries

---

## 🚀 Next Steps

1. **Implement Context Manager**
   - Build token-aware section reader
   - Implement paragraph boundary breaking
   - Add priority-based allocation

2. **Implement AI Notes System**
   - Add `ai_notes_append` to structured output
   - Implement top-down reading
   - Test token ratio rules

3. **Implement Vector Search**
   - Set up embeddings (MLX local model)
   - Implement hybrid search
   - Build context assembly

4. **Test with Real Scenarios**
   - Long rambling inputs
   - Multi-topic conversations
   - Summary requests
   - Artifact references

5. **Optimize Token Usage**
   - Measure actual token counts
   - Adjust budgets based on results
   - Implement dynamic allocation

---

**Status**: Draft design ready for review and refinement  
**Next**: Discuss open questions and finalize token budgets
