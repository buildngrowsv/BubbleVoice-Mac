# Artifact Intelligence Testing Framework

## What This Tests (The Real Requirements)

### 1. **Proactive Creation** (25 points)
- AI creates artifacts for complex problems WITHOUT being asked
- Example: User lists 5 overwhelming concerns → AI creates stress map
- NOT: User says "I'm thinking about X" → AI waits for complexity

### 2. **Restraint** (20 points)  
- AI does NOT create artifacts for casual conversation
- Example: "Thanks, this helps" → No artifact
- Example: "What do you think?" → No artifact

### 3. **Data-Only Updates** (15 points)
- AI changes ONLY data, preserves ALL styling/UI
- Example: "Emma's project is Thursday not Friday" → Change deadline only
- Test: Did styling/colors/layout stay identical?

### 4. **UI-Only Updates** (15 points)
- AI changes ONLY styling/emphasis, preserves ALL data
- Example: "Make startup stuff stand out more" → Bold/highlight only
- Test: Did data stay identical?

### 5. **Combined Updates** (10 points)
- AI changes both data AND UI when appropriate
- Example: "Launch pushed to next month" → Update deadline + reduce urgency styling

### 6. **Complete Overhaul** (10 points)
- AI rebuilds entire artifact while preserving data
- Example: "Show as calendar instead of matrix" → New structure, same data

### 7. **Preservation** (5 points)
- AI leaves artifact unchanged when user doesn't request changes
- Example: User asks question about artifact → Answer, don't modify

---

## Test Scenarios Created

### 1. `artifact_intelligence_test.json`
**8 turns testing all modification types:**
- Turn 1: Casual → No artifact (restraint)
- Turn 2: Complex overwhelm → CREATE stress map (proactive)
- Turn 3: "Due Thursday not Friday" → Data-only update
- Turn 4: "Make startup stand out" → UI-only update
- Turn 5: "Launch pushed to next month" → Data + UI update
- Turn 6: "What should I focus on?" → No change (preservation)
- Turn 7: "Redesign as calendar" → Complete overhaul
- Turn 8: "Thanks" → No change (restraint)

### 2. `artifact_casual_vs_complex.json`
**Tests when to create vs when not to:**
- "I'm thinking about getting a dog" → No artifact (too casual)
- "But I work long hours, have kids, apartment, never had dog, cost, training..." → CREATE decision framework (complexity threshold)
- Tests AI's judgment on complexity

---

## Enhanced System Prompt

Created `enhanced-system-prompt.js` with:

### Teaches AI:
1. **WHEN to create** (complexity threshold, decision with tradeoffs, timeline tracking)
2. **WHEN NOT to create** (casual conversation, single-factor, questions)
3. **HOW to modify** (data-only, UI-only, both, overhaul, none)
4. **Modification types** with explicit examples

### Key Sections:
- ✅ CREATE artifacts when: (4 criteria with examples)
- ❌ DO NOT create when: (4 criteria with examples)
- 5 modification types with JSON examples
- 6 artifact types with use cases
- 4 complete examples showing reasoning

---

## What's Different from Current Benchmark

### Current Benchmark Tests:
- ✅ Memory (recalls Emma/Jake)
- ✅ Latency (Gemini 1074ms)
- ✅ JSON generation
- ❌ NOT artifact intelligence
- ❌ NOT modification precision
- ❌ NOT proactive creation judgment

### New Benchmark Tests:
- ✅ Proactive creation (does AI create when helpful?)
- ✅ Restraint (does AI avoid over-creating?)
- ✅ Modification precision (data-only vs UI-only vs both)
- ✅ Preservation (does AI leave alone when appropriate?)
- ✅ Timeliness (right moment in conversation)

---

## Next Steps to Run This

1. **Update runner.js** to:
   - Use enhanced system prompt
   - Track modification_type in results
   - Score based on criteria (100 point scale)

2. **Add evaluation logic**:
   - Did AI create artifact at right time?
   - Did AI preserve when it should?
   - Did modification match request type?

3. **Run tests**:
   ```bash
   node lib/runner.js --scenario artifact_intelligence_test --model gemini-2.5-flash-lite
   node lib/runner.js --scenario artifact_intelligence_test --model claude-3.5-haiku
   node lib/runner.js --scenario artifact_intelligence_test --model gpt-4o-mini
   ```

4. **Compare scores**:
   - Which model has best proactive judgment?
   - Which model has best modification precision?
   - Which model shows best restraint?

---

## Expected Findings

**Hypothesis:**
- **Claude** will have best artifact intelligence (nuanced judgment)
- **Gemini** will over-create artifacts (too eager)
- **GPT** will under-create artifacts (too conservative)

**Key metrics:**
- Proactive creation score (did it create at turn 2?)
- Restraint score (did it avoid creating at turns 1, 6, 8?)
- Precision score (data-only vs UI-only accuracy)

This is the **real test** you need.
