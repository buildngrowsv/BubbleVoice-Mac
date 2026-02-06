# Detailed AI Model Comparison for BubbleVoice

## What the Benchmark Actually Tests

The benchmark framework evaluates AI models on **conversational personal AI** capabilities:

### 1. **Structured Output Compliance**
- Models must return JSON with 3 parts:
  - `user_response`: What the AI says (text + tone)
  - `internal_notes`: Hidden observations for memory
  - `artifact_action`: Create/update visual artifacts

### 2. **Conversational Memory**
- Turn 2: User mentions "Emma has soccer Tue/Thu, Jake has piano Wed"
- Turn 5: User asks "What days did I say the kids have activities?"
- **Test**: Can the model recall specific details from earlier?

### 3. **Artifact Generation & Updates**
- Turn 3: User says "Can you make a simple goal tracker?"
- Turn 4: User says "Actually let's make it 2 times a week"
- **Test**: Can the model create structured data AND update it preserving context?

### 4. **Emotional Intelligence**
- Does the AI validate feelings before problem-solving?
- Does it match the user's emotional tone?
- Does it feel like a thinking partner vs a task bot?

---

## Results: What Each Model Actually Did

### 🏆 Claude 3.5 Haiku - **Best Artifact Quality**

**Latency**: 4587ms (slowest)  
**Valid Responses**: 6/6 (perfect)  
**Artifacts**: 2 created, 2 updated ✅

#### Artifact Example (Turn 3 → Turn 4):

**Turn 3 - Create:**
```json
{
  "goal_name": "Weekly Exercise",
  "target_frequency": 3,
  "frequency_unit": "per_week",
  "preferred_days": ["Monday", "Wednesday", "Saturday"],
  "constraints": ["Children's activities"],
  "progress": []
}
```

**Turn 4 - Update (user said "make it 2 times a week"):**
```json
{
  "goal_name": "Weekly Exercise",
  "target_frequency": 2,  ← UPDATED
  "frequency_unit": "per_week",
  "preferred_days": ["Monday", "Saturday"],  ← UPDATED (removed Wed)
  "constraints": ["Children's activities"],  ← PRESERVED
  "progress": []  ← PRESERVED
}
```

**✅ Claude correctly:**
- Changed frequency from 3 → 2
- Adjusted preferred days to match new frequency
- Preserved constraints and progress
- Maintained data structure integrity

**Memory Test (Turn 5):**
> "According to our previous conversation, Emma has soccer on Tuesdays and Thursdays, and Jake has piano on Wednesdays."

✅ Perfect recall with attribution ("According to our previous conversation")

---

### ⚡ Gemini 2.5 Flash Lite - **Best Speed & Cost**

**Latency**: 1074ms (3-4x faster!)  
**Valid Responses**: 4/6 (schema issues on 2 turns)  
**Artifacts**: 6 created, 0 updated ❌

#### What Gemini Did:

**Turn 3 - Create:**
```json
{
  "goal_name": "exercise",
  "target_frequency": 3,
  "frequency_unit": "per_week",
  "progress": []
}
```

**Turn 4 - Should Update, but created NEW artifact instead:**
```json
{
  "goal_name": "exercise",
  "target_frequency": 3,  ← DIDN'T UPDATE!
  "frequency_unit": "per_week",
  "progress": []
}
```

**❌ Gemini's artifact issues:**
- Created 6 separate artifacts instead of updating existing ones
- Lost context between artifact versions
- Simpler data structures (less detail)

**✅ But Gemini's memory was perfect:**
> "You mentioned that Emma has soccer on Tuesdays and Thursdays, and Jake has piano on Wednesdays."

**Why Gemini is still recommended:**
- **3-4x faster** (critical for voice)
- **2-3x cheaper** ($0.075 vs $0.25/1M tokens)
- **1M context window** (can hold entire conversation history)
- Memory/recall is perfect (the most important feature)
- Artifact issues can be fixed with better prompting

---

### 🎯 GPT-4o-mini - **Best Schema Compliance**

**Latency**: 3260ms (3x slower than Gemini)  
**Valid Responses**: 6/6 (perfect)  
**Artifacts**: 1 created, 0 updated ⚠️

#### What GPT Did:

**Turn 3 - Create:**
```json
{
  "goal_name": "Exercise Goal",
  "target_frequency": 3,
  "frequency_unit": "per_week",
  "constraints": ["Kids' schedules"],
  "progress": []
}
```

**Turn 4 - Should Update, but didn't:**
- GPT acknowledged the change in its response text
- But didn't create an updated artifact
- Artifact system less proactive than Claude

**✅ GPT's memory was perfect:**
> "You mentioned that Emma has soccer on Tuesdays and Thursdays, and Jake has piano on Wednesdays."

**Why GPT isn't recommended:**
- 3x slower than Gemini (bad for voice)
- 2x more expensive than Gemini
- Artifact generation is conservative (less helpful)
- But: Most reliable schema compliance

---

## Sophisticated HTML Visualizations

The framework generates **interactive HTML reports** for each benchmark run:

### Features:

1. **Metrics Dashboard**
   - Valid responses count
   - Average latency
   - Artifacts created/updated
   - Cost estimates

2. **Chat-Style Conversation View**
   - User messages in blue bubbles
   - AI responses in green bubbles with tone badges
   - Latency shown per response
   - Expandable internal notes (hidden from user in real app)

3. **Artifact Cards**
   - Shows CREATE/UPDATE badges
   - JSON diff highlighting (what changed)
   - Artifact type and ID
   - Version history

4. **Expected Behavior Validation**
   - Each turn shows what the AI *should* have done
   - Highlights memory test requirements
   - Shows artifact preservation expectations

### Example Visualization Structure:

```
┌─────────────────────────────────────────────┐
│ personal_goals_exercise                      │
│ Model: Claude 3.5 Haiku                     │
│                                              │
│ ┌──────┐ ┌──────────┐ ┌────────┐ ┌────────┐│
│ │ 6/6  │ │ 4462ms   │ │ 2      │ │ 2      ││
│ │Valid │ │Latency   │ │Created │ │Updated ││
│ └──────┘ └──────────┘ └────────┘ └────────┘│
└─────────────────────────────────────────────┘

TURN 1
┌─────────────────────────────────────────────┐
│ User                                         │
│ ┌─────────────────────────────────────────┐ │
│ │ I've been thinking about getting more   │ │
│ │ exercise but I keep failing at it       │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Bubble AI                          4196ms   │
│ ┌─────────────────────────────────────────┐ │
│ │ It sounds like exercise has been a      │ │
│ │ challenging goal for you...             │ │
│ │                        [supportive]     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ 🧠 Internal Notes (hidden from user)        │
│    User wants to exercise but struggles... │
│                                              │
│ ✅ Expected: acknowledge struggle, empathy  │
└─────────────────────────────────────────────┘

TURN 3
┌─────────────────────────────────────────────┐
│ User                                         │
│ ┌─────────────────────────────────────────┐ │
│ │ Can you make a simple goal tracker?     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Bubble AI                          1628ms   │
│ ┌─────────────────────────────────────────┐ │
│ │ I've created a goal tracker...          │ │
│ │                        [supportive]     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ [CREATED] goal_tracker • exercise_plan  │ │
│ │                                          │ │
│ │ {                                        │ │
│ │   "goal_name": "Weekly Exercise",       │ │
│ │   "target_frequency": 3,                │ │
│ │   "frequency_unit": "per_week",         │ │
│ │   "preferred_days": ["Mon", "Fri"],     │ │
│ │   "constraints": ["Kids' activities"]   │ │
│ │ }                                        │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

TURN 4
┌─────────────────────────────────────────────┐
│ User                                         │
│ ┌─────────────────────────────────────────┐ │
│ │ Actually let's make it 2 times a week   │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ Bubble AI                          4609ms   │
│ ┌─────────────────────────────────────────┐ │
│ │ Good call. Adjusting to 2 times...      │ │
│ │                        [supportive]     │ │
│ └─────────────────────────────────────────┘ │
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ [UPDATED] goal_tracker • exercise_plan  │ │
│ │                                          │ │
│ │ Changes:                                 │ │
│ │   target_frequency: 3 → 2               │ │
│ │   preferred_days: ["Mon","Fri","Sat"]   │ │
│ │                 → ["Mon","Sat"]         │ │
│ │                                          │ │
│ │ Preserved: goal_name, constraints       │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Key Insights

### What Works Well:

1. **All models have perfect memory** - they can recall specific details from earlier in the conversation
2. **Claude has the best artifact management** - creates, updates, preserves context
3. **Gemini is 3-4x faster** - critical for voice interaction UX
4. **Structured output works** - all models can follow JSON schemas (with proper prompting)

### What Needs Improvement:

1. **Gemini's artifact updates** - creates new instead of updating existing
2. **GPT's artifact proactivity** - too conservative, doesn't create unless explicitly asked
3. **Latency for voice** - Only Gemini is fast enough (<1.5s) for natural voice UX

### Recommendation:

**Use Gemini 2.5 Flash Lite with artifact prompt engineering:**
- Speed is non-negotiable for voice AI
- Memory/recall is perfect (most important)
- Artifact issues can be fixed with better prompts (add artifact ID tracking in system prompt)
- Cost savings enable deeper conversations

**Upgrade to Claude for:**
- Complex emotional processing
- Multi-step artifact workflows
- When user explicitly requests "detailed analysis"

---

## Next Steps for BubbleVoice

1. **Improve Gemini's artifact prompting**
   - Add explicit artifact ID tracking in system prompt
   - Provide examples of update vs create
   - Test with more complex scenarios

2. **Test streaming latency**
   - Current tests measure full response time
   - Voice AI needs first-token latency (time to start speaking)
   - Gemini's streaming may be even faster

3. **Add RAG integration**
   - Test how retrieval affects latency
   - Benchmark with real conversation history
   - Measure context window usage

4. **Test with native macOS STT/TTS**
   - Add audio pipeline latency
   - Measure end-to-end user experience
   - Compare to premium TTS (ElevenLabs, etc.)

5. **Build artifact renderers**
   - Create SwiftUI components for each artifact type
   - Test user editing and preservation
   - Implement diff visualization in app
