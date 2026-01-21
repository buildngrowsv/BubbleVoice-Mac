# Life Areas Hierarchy System

## Overview

A dynamic folder-based system for organizing personal life information that the AI can read, create, edit, and restructure. This serves as the foundation for vector search and contextual memory.

**Key Principle**: Areas are organized hierarchically, with documents that grow from the top (newest first), below a summary section that the AI maintains.

---

## Folder Structure

```
user_data/
├── life_areas/
│   ├── _AREAS_INDEX.md              # Master index of all areas
│   ├── Family/
│   │   ├── _AREA_SUMMARY.md         # Overview of family area
│   │   ├── Emma_School/
│   │   │   ├── _AREA_SUMMARY.md     # Emma's school progress
│   │   │   ├── struggles.md         # Timestamped entries
│   │   │   ├── wins.md              # Timestamped entries
│   │   │   └── teacher_meetings.md  # Timestamped entries
│   │   ├── Max_Activities/
│   │   │   ├── _AREA_SUMMARY.md
│   │   │   └── soccer_season.md
│   │   └── family_time.md           # Endpoint document
│   ├── Work/
│   │   ├── _AREA_SUMMARY.md
│   │   ├── Startup/
│   │   │   ├── _AREA_SUMMARY.md
│   │   │   ├── Product/
│   │   │   │   ├── _AREA_SUMMARY.md
│   │   │   │   ├── feature_ideas.md
│   │   │   │   └── user_feedback.md
│   │   │   ├── fundraising.md
│   │   │   └── team_dynamics.md
│   │   └── work_life_balance.md
│   ├── Personal_Growth/
│   │   ├── _AREA_SUMMARY.md
│   │   ├── Exercise_Goals/
│   │   │   ├── _AREA_SUMMARY.md
│   │   │   ├── running.md
│   │   │   └── gym_routine.md
│   │   ├── Mental_Health/
│   │   │   ├── _AREA_SUMMARY.md
│   │   │   ├── therapy_notes.md
│   │   │   └── stress_patterns.md
│   │   └── learning.md
│   ├── Home/
│   │   ├── _AREA_SUMMARY.md
│   │   ├── Renovations/
│   │   │   ├── _AREA_SUMMARY.md
│   │   │   ├── kitchen_remodel.md
│   │   │   └── budget.md
│   │   ├── maintenance.md
│   │   └── chores.md
│   └── Relationships/
│       ├── _AREA_SUMMARY.md
│       ├── Partner/
│       │   ├── _AREA_SUMMARY.md
│       │   ├── date_nights.md
│       │   └── conflicts.md
│       └── friendships.md
```

---

## Document Structure

### 1. `_AREAS_INDEX.md` (Master Index)

```markdown
# Life Areas Index

**Last Updated**: 2026-01-19 14:32:00

## Active Areas (7)

### 🏠 Family
- **Path**: `Family/`
- **Subprojects**: 2 (Emma_School, Max_Activities)
- **Last Activity**: 2026-01-19 09:15:00
- **Summary**: Tracking Emma's school struggles (reading comprehension), Max's soccer season starting, planning family vacation

### 💼 Work
- **Path**: `Work/`
- **Subprojects**: 1 (Startup)
- **Last Activity**: 2026-01-18 22:30:00
- **Summary**: Startup product development, fundraising stress, team hiring challenges

### 🌱 Personal_Growth
- **Path**: `Personal_Growth/`
- **Subprojects**: 2 (Exercise_Goals, Mental_Health)
- **Last Activity**: 2026-01-19 07:00:00
- **Summary**: Running 3x/week goal (struggling), therapy helping with work stress

### 🏡 Home
- **Path**: `Home/`
- **Subprojects**: 1 (Renovations)
- **Last Activity**: 2026-01-17 18:00:00
- **Summary**: Kitchen remodel planning, budget concerns

### ❤️ Relationships
- **Path**: `Relationships/`
- **Subprojects**: 1 (Partner)
- **Last Activity**: 2026-01-16 21:00:00
- **Summary**: Date night ideas, need more quality time

## Recently Active (Last 7 Days)
1. Family/Emma_School - 5 entries
2. Work/Startup/Product - 8 entries
3. Personal_Growth/Exercise_Goals - 3 entries

## Statistics
- **Total Areas**: 7
- **Total Subprojects**: 15
- **Total Documents**: 42
- **Total Entries (Last 30 Days)**: 127
```

### 2. `_AREA_SUMMARY.md` (Area Overview)

Every folder has this file. It's the AI's maintained summary of the area.

```markdown
# Emma's School - Area Summary

**Created**: 2026-01-10  
**Last Updated**: 2026-01-19 09:15:00  
**Parent Area**: Family  
**Status**: Active - Needs Attention

---

## Current Situation

Emma (7yo, 2nd grade) is struggling with reading comprehension. She can decode words but doesn't retain what she reads. Teacher (Ms. Johnson) concerned. We're trying 15min/day reading together before bed. Some progress but inconsistent.

**Key Concerns**:
- Reading comprehension below grade level
- Confidence issues when reading aloud
- Comparing herself to classmates

**What's Working**:
- Graphic novels (more engaged)
- Reading together vs. alone
- Praise for effort, not just results

---

## Timeline Highlights

- **2026-01-19**: Tried new graphic novel series (Dog Man) - she loved it, read 20min straight
- **2026-01-17**: Parent-teacher conference - discussed testing for learning differences
- **2026-01-15**: Breakthrough moment - she asked to read an extra chapter
- **2026-01-12**: Frustration meltdown during homework
- **2026-01-10**: Teacher email about reading concerns

---

## Related Areas
- `Family/Emma_School/struggles.md` - Detailed struggle entries
- `Family/Emma_School/wins.md` - Success moments
- `Family/Emma_School/teacher_meetings.md` - School communication

---

## AI Notes
- User feels guilty about not catching this sooner
- Worried about Emma's self-esteem
- Considering educational testing but hesitant about labeling
- Wants strategies that don't make Emma feel "different"
```

### 3. Endpoint Documents (e.g., `struggles.md`)

These are time-ordered logs. **Newest entries at the top** (below summary).

```markdown
# Emma's School Struggles

**Area**: Family/Emma_School  
**Document Type**: Time-Ordered Log  
**Created**: 2026-01-10

---

## Summary (AI-Maintained)

Emma's reading struggles are the primary concern. Pattern: she gets frustrated when she can't remember what she just read, leading to avoidance. Breakthrough with graphic novels suggests visual learning style. User feels guilty and worried about long-term impact.

**Frequency**: 3-4 entries/week  
**Sentiment Trend**: Cautiously optimistic (was anxious 2 weeks ago)  
**Action Items**: Schedule educational testing, find more graphic novels, celebrate small wins

---

## Entries (Newest First)

### 2026-01-19 09:15:00
**Conversation Context**: Morning check-in about weekend

User mentioned trying Dog Man graphic novel series last night. Emma read for 20 minutes straight without prompting - longest reading session in weeks. She laughed out loud at the jokes and could retell the story afterward. This is a huge win.

**User Quote**: "I think we've been pushing chapter books too hard. The pictures help her stay engaged and remember the story."

**AI Observation**: Visual learning style hypothesis strengthening. Recommend exploring more graphic novels and illustrated chapter books.

---

### 2026-01-17 18:30:00
**Conversation Context**: Post parent-teacher conference debrief

Parent-teacher conference with Ms. Johnson. Teacher recommended educational testing to rule out learning differences (dyslexia, ADHD). User feels conflicted - wants to help Emma but worried about labeling her or making her feel "broken."

**User Quote**: "What if we test her and it's nothing? Or what if it's something and she feels like she's not smart?"

**AI Observation**: User's guilt and worry are high. Needs reassurance that testing is information-gathering, not labeling. Suggested framing it as "learning about how Emma's brain works best."

**Related**: `Family/Emma_School/teacher_meetings.md` - Full meeting notes

---

### 2026-01-15 20:00:00
**Conversation Context**: Evening reflection

Breakthrough moment during bedtime reading. Emma asked to read "just one more chapter" of her book. First time she's initiated extra reading. User was emotional about it.

**User Quote**: "I almost cried. She never asks to read more. She usually tries to get out of it."

**AI Observation**: Positive reinforcement working. The book was "Ivy & Bean" - similar reading level but more engaging topic (friendship drama vs. generic school stories).

---

### 2026-01-12 16:45:00
**Conversation Context**: After-school homework meltdown

Emma had a meltdown during reading homework. Threw her book and said "I'm stupid." User tried to comfort her but Emma shut down. Homework took 2 hours (should be 20 minutes).

**User Quote**: "I don't know how to help her. I feel like I'm making it worse by pushing."

**AI Observation**: User's frustration and helplessness are high. Suggested taking a break from homework and doing something fun together. Also recommended talking to teacher about homework load.

**Sentiment**: High stress, guilt, worry

---

### 2026-01-10 14:20:00
**Conversation Context**: Initial discussion about teacher email

Teacher (Ms. Johnson) sent email expressing concern about Emma's reading comprehension. Emma can decode words but struggles to remember or explain what she read. Teacher wants to schedule a meeting.

**User Quote**: "I thought she was doing fine. How did I miss this?"

**AI Observation**: User's initial reaction is guilt and self-blame. Needs reassurance that this is common and catchable. Suggested scheduling meeting and starting daily reading practice.

**Action Taken**: Created this area to track Emma's school progress

---
```

---

## AI Operations on Life Areas

The AI can perform these operations via structured output:

### 1. **Read Area Tree** (Context Injection)
Before each conversation turn, inject the areas tree into the prompt:

```
LIFE AREAS CONTEXT:
- Family/ (2 subprojects, last active 2h ago)
  - Emma_School/ (3 documents, last active 2h ago)
  - Max_Activities/ (1 document, last active 3d ago)
- Work/ (1 subproject, last active 1d ago)
  - Startup/ (3 subprojects, last active 1d ago)
- Personal_Growth/ (2 subprojects, last active 12h ago)
- Home/ (1 subproject, last active 3d ago)
- Relationships/ (1 subproject, last active 4d ago)
```

### 2. **Create New Area**
```json
{
  "area_action": {
    "action": "create_area",
    "path": "Family/Emma_School",
    "area_name": "Emma's School",
    "description": "Tracking Emma's reading struggles and school progress",
    "initial_documents": ["struggles.md", "wins.md", "teacher_meetings.md"]
  }
}
```

### 3. **Append to Document** (Newest at Top)
```json
{
  "area_action": {
    "action": "append_entry",
    "path": "Family/Emma_School/struggles.md",
    "entry": {
      "timestamp": "2026-01-19 09:15:00",
      "conversation_context": "Morning check-in about weekend",
      "content": "User mentioned trying Dog Man graphic novel series...",
      "user_quote": "I think we've been pushing chapter books too hard...",
      "ai_observation": "Visual learning style hypothesis strengthening...",
      "sentiment": "hopeful",
      "related_paths": []
    }
  }
}
```

### 4. **Update Area Summary**
```json
{
  "area_action": {
    "action": "update_summary",
    "path": "Family/Emma_School/_AREA_SUMMARY.md",
    "summary_updates": {
      "current_situation": "Emma is showing progress with graphic novels...",
      "timeline_highlight": {
        "date": "2026-01-19",
        "event": "Tried new graphic novel series (Dog Man) - she loved it"
      },
      "ai_notes": "User feels more hopeful after breakthrough with visual learning approach"
    }
  }
}
```

### 5. **Convert Document to Subproject** (Promote to Folder)
```json
{
  "area_action": {
    "action": "promote_to_subproject",
    "path": "Work/startup_idea.md",
    "new_path": "Work/Startup/",
    "reason": "Startup idea is now active project with multiple workstreams",
    "initial_substructure": {
      "folders": ["Product", "Fundraising", "Team"],
      "documents": ["product_ideas.md", "investor_outreach.md", "hiring.md"]
    }
  }
}
```

### 6. **Read from Area** (For Next Turn Context)
```json
{
  "area_action": {
    "action": "read_for_context",
    "paths": [
      "Family/Emma_School/_AREA_SUMMARY.md",
      "Family/Emma_School/struggles.md"
    ],
    "reason": "User mentioned Emma's reading - need recent context"
  }
}
```

### 7. **Vector Search from Areas**
```json
{
  "area_action": {
    "action": "vector_search",
    "query": "Emma reading comprehension struggles",
    "scope": "Family/Emma_School/",
    "max_results": 5,
    "reason": "User asked 'what have we tried for Emma's reading?'"
  }
}
```

---

## Structured Output Schema

```javascript
{
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { type: "string" },
        emotional_tone: { type: "string", enum: ["supportive", "curious", "reflective", "celebratory", "concerned"] }
      },
      required: ["spoken_text"]
    },
    
    internal_notes: {
      type: "string",
      description: "1-2 sentences for AI's own context tracking (hidden from user)"
    },
    
    area_actions: {
      type: "array",
      description: "Operations to perform on life areas (can be multiple per turn)",
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "none",
              "create_area",
              "append_entry",
              "update_summary",
              "promote_to_subproject",
              "read_for_context",
              "vector_search"
            ]
          },
          path: { type: "string" },
          // ... action-specific fields
        },
        required: ["action"]
      }
    },
    
    artifact_action: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["none", "create", "update"] },
        html: { type: "string" },
        // ... existing artifact fields
      }
    },
    
    proactive_bubbles: {
      type: "array",
      description: "Contextual micro-prompts (≤7 words) for user to tap",
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
}
```

---

## Vector Search Integration

### Embedding Strategy

1. **Chunk by Entry** (not by arbitrary token count)
   - Each timestamped entry in a document = 1 chunk
   - Each area summary = 1 chunk
   - Preserves semantic boundaries

2. **Metadata for Each Chunk**
   ```json
   {
     "chunk_id": "family_emma_school_struggles_20260119_091500",
     "area_path": "Family/Emma_School",
     "document": "struggles.md",
     "timestamp": "2026-01-19 09:15:00",
     "entry_type": "time_ordered_log",
     "sentiment": "hopeful",
     "user_quote": "I think we've been pushing chapter books too hard...",
     "ai_observation": "Visual learning style hypothesis strengthening...",
     "related_areas": [],
     "embedding": [0.123, 0.456, ...]
   }
   ```

3. **Hybrid Search**
   - **Vector search**: Semantic similarity (primary)
   - **Keyword search**: Exact matches (fallback)
   - **Recency boost**: Recent entries weighted higher
   - **Area boost**: Current conversation area weighted higher

4. **Context Assembly**
   When user mentions "Emma's reading":
   - Vector search: "Emma reading comprehension struggles"
   - Returns top 5 chunks with metadata
   - AI receives:
     - Area path: `Family/Emma_School`
     - Summary: `_AREA_SUMMARY.md` content
     - Recent entries: Last 3 entries from `struggles.md`
     - Related: Relevant entries from `wins.md`

---

## Organizing Framework

### Default Life Areas (Suggested Starting Structure)

1. **Family** - Kids, partner, extended family, family time
2. **Work** - Career, startup, projects, work-life balance
3. **Personal Growth** - Goals, learning, mental health, physical health
4. **Home** - House projects, maintenance, chores, living space
5. **Relationships** - Partner, friends, social life
6. **Finances** - Budget, savings, investments, financial goals
7. **Hobbies** - Interests, creative projects, leisure

### When to Create a Subproject

**Promote a document to a folder when:**
- ✅ It has 10+ entries and growing
- ✅ Multiple distinct workstreams emerge
- ✅ User talks about it 3+ times in different contexts
- ✅ It needs sub-categorization (e.g., Emma's reading → struggles, wins, meetings)

**Keep as a document when:**
- ❌ Infrequent mentions (< 5 entries)
- ❌ Single-threaded topic
- ❌ Short-term concern (resolved within weeks)

### Document Types

1. **Time-Ordered Logs** (e.g., `struggles.md`, `wins.md`)
   - Newest entries at top (below summary)
   - Timestamped entries
   - Conversational context preserved

2. **Reference Documents** (e.g., `teacher_info.md`, `budget.md`)
   - Static information
   - Updated in place (not appended)
   - No timestamps

3. **Task Lists** (e.g., `home_projects.md`)
   - Checkbox format
   - Dated when added
   - Moved to "completed" section when done

---

## System Prompt Addition

```
LIFE AREAS SYSTEM:

You have access to the user's life areas - a hierarchical folder system that organizes their personal information. This is the foundation of your memory.

CURRENT AREAS TREE:
{areas_tree_here}

OPERATIONS YOU CAN PERFORM:
1. **Create Area**: When user mentions a new significant life topic (e.g., "Emma's school struggles")
2. **Append Entry**: Add timestamped entry to existing document (ALWAYS at top, below summary)
3. **Update Summary**: Refresh area summary with new insights
4. **Promote to Subproject**: Convert document to folder when it needs sub-organization
5. **Read for Context**: Pull specific areas into next turn's context
6. **Vector Search**: Search across areas for relevant past conversations

WHEN TO CREATE/UPDATE AREAS:
- ✅ User shares significant personal information (family, goals, struggles, projects)
- ✅ Recurring topic mentioned 2+ times
- ✅ User asks "remember when I told you about X?"
- ❌ Casual mentions without depth
- ❌ Generic questions (no personal context)
- ❌ One-off facts

DOCUMENT STRUCTURE:
- Every document has AI-maintained summary at top
- Entries are timestamped and added at TOP (newest first)
- Include: conversation context, user quote, AI observation, sentiment
- Link related areas when relevant

AREA NAMING:
- Use clear, human-readable names (e.g., "Emma_School" not "emma_s")
- Use underscores for spaces
- Keep folder depth ≤ 3 levels when possible

REMEMBER:
- This is the user's personal life - be respectful and thoughtful
- Every entry you create will be vector-searched later
- Write entries as if you're leaving notes for your future self
- Capture emotional context, not just facts
```

---

## Example Conversation Flow

**User**: "I'm really worried about Emma. She's struggling with reading and I don't know how to help her."

**AI Response**:
```json
{
  "user_response": {
    "spoken_text": "I hear you. Tell me more about what's happening with Emma's reading. What have you noticed?",
    "emotional_tone": "supportive"
  },
  
  "internal_notes": "User is worried about daughter Emma's reading. First mention of this topic - need to create area to track.",
  
  "area_actions": [
    {
      "action": "create_area",
      "path": "Family/Emma_School",
      "area_name": "Emma's School",
      "description": "Tracking Emma's reading struggles and school progress",
      "initial_documents": ["struggles.md", "progress.md"]
    }
  ],
  
  "artifact_action": {
    "action": "none"
  },
  
  "proactive_bubbles": [
    { "text": "how old is Emma?", "related_area": "Family/Emma_School" },
    { "text": "teacher's feedback?", "related_area": "Family/Emma_School" },
    { "text": "tried any strategies?", "related_area": "Family/Emma_School" }
  ]
}
```

**Next Turn - User**: "She's in 2nd grade. Her teacher said she can decode words but doesn't remember what she reads."

**AI Response**:
```json
{
  "user_response": {
    "spoken_text": "That's actually a really specific and helpful observation from her teacher. It sounds like Emma's decoding skills are solid, but the comprehension piece needs support. That's something we can definitely work on. What does Emma say about reading?",
    "emotional_tone": "supportive"
  },
  
  "internal_notes": "Emma is 7yo, 2nd grade. Reading comprehension issue (not decoding). Teacher involved. User likely feeling guilty/worried.",
  
  "area_actions": [
    {
      "action": "append_entry",
      "path": "Family/Emma_School/struggles.md",
      "entry": {
        "timestamp": "2026-01-19 14:30:00",
        "conversation_context": "Initial discussion about Emma's reading",
        "content": "Emma (2nd grade, ~7yo) struggling with reading comprehension. Teacher (name unknown) noted she can decode words but doesn't retain what she reads. This is a comprehension issue, not a decoding issue.",
        "user_quote": "Her teacher said she can decode words but doesn't remember what she reads.",
        "ai_observation": "Specific diagnosis from teacher is helpful. User seems worried but hasn't mentioned guilt yet. Need to explore Emma's perspective and what's been tried.",
        "sentiment": "concerned"
      }
    },
    {
      "action": "update_summary",
      "path": "Family/Emma_School/_AREA_SUMMARY.md",
      "summary_updates": {
        "current_situation": "Emma (2nd grade) struggling with reading comprehension. Can decode but doesn't retain. Teacher has noticed and communicated concern.",
        "key_concerns": ["Reading comprehension below grade level", "Retention issues"],
        "timeline_highlight": {
          "date": "2026-01-19",
          "event": "Initial discussion about reading struggles"
        }
      }
    }
  ],
  
  "artifact_action": {
    "action": "none"
  },
  
  "proactive_bubbles": [
    { "text": "Emma's feelings?", "related_area": "Family/Emma_School" },
    { "text": "reading at home?", "related_area": "Family/Emma_School" },
    { "text": "teacher meeting?", "related_area": "Family/Emma_School" }
  ]
}
```

---

## Benefits of This System

### 1. **Persistent Memory**
- Every conversation about Emma's reading is captured
- AI can retrieve "what have we tried?" instantly
- User never has to re-explain context

### 2. **Hierarchical Organization**
- Start simple (single document)
- Grow organically (promote to subproject when needed)
- Mirrors how humans think about life areas

### 3. **Vector Search Optimized**
- Chunks are semantically meaningful (entries, not arbitrary tokens)
- Metadata enables hybrid search (vector + keyword + recency + area)
- Area summaries provide high-level context

### 4. **AI-Friendly Structure**
- Clear operations (create, append, update, promote)
- Structured output schema
- Areas tree injected into every prompt

### 5. **User-Friendly**
- Human-readable folder names
- Newest entries at top (easy to scan)
- Summaries provide quick context

### 6. **Scalable**
- Can handle years of conversations
- Folder depth limits prevent over-complexity
- Promotion system prevents document bloat

---

## Next Steps

1. **Build Area Manager** (`lib/area-manager.js`)
   - File system operations
   - Document templates
   - Area tree generation

2. **Update Runner** (`lib/runner.js`)
   - Inject areas tree into prompts
   - Execute area actions from structured output
   - Track area operations in benchmark results

3. **Create Test Scenario** (`scenarios/life_areas_test.json`)
   - Multi-turn conversation about Emma's reading
   - Tests: create area, append entries, update summary, promote to subproject
   - Validates: proper structure, newest-first ordering, summary maintenance

4. **Vector Search Integration** (future)
   - Embed all entries
   - Hybrid search implementation
   - Context assembly for prompts

5. **Benchmark Metrics**
   - Area creation accuracy (right time, right structure)
   - Entry quality (captures context, quotes, observations)
   - Summary maintenance (stays current, concise)
   - Promotion judgment (when to convert doc → folder)
