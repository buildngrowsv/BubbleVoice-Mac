# HTML Artifact Generation & Preservation Benchmark

## Current State: ❌ NOT TESTING WHAT YOU NEED

### What the Current Benchmark Tests:
- ✅ JSON data structure generation (goal_tracker, comparison_card, etc.)
- ✅ Conversational memory (recalls Emma's soccer, Jake's piano)
- ✅ Structured output compliance (user_response, internal_notes, artifact_action)
- ✅ Latency comparison (Gemini 1074ms vs Claude 4462ms)

### What You Actually Need Tested:
- ❌ **HTML artifact generation** (sophisticated, styled, standalone HTML)
- ❌ **User editing preservation** (user modifies HTML, AI preserves changes)
- ❌ **Visual diffs** (show what changed between versions visually)
- ❌ **JSON + HTML hybrid** (structured data + rendered view)
- ❌ **Artifact quality** (is the HTML impressive or basic?)

---

## The Real Challenge: HTML Artifact Management

### Problem Statement:
When you said "html type output with the occasional text to image" and "sophisticated and impressive views", you're describing a system where:

1. **AI generates standalone HTML artifacts** (not just JSON)
2. **User can edit the HTML directly** (in browser or app)
3. **AI must preserve user edits** when updating
4. **System tracks versions** with visual diffs

This is **WAY more complex** than JSON artifacts because:
- HTML has structure + style + content (3 dimensions to track)
- User edits can happen anywhere in the HTML
- AI needs to understand what changed and why
- Diffs need to be visual, not just text

---

## Proposed Solution: Hybrid JSON + HTML System

### Architecture:

```
Artifact = {
  "id": "job_comparison_v3",
  "type": "comparison_card",
  "data": {                    ← Structured data (source of truth)
    "job_a": { "title": "...", "salary": 180000, ... },
    "job_b": { "title": "...", "salary": 140000, ... },
    "user_priority": "work_life_balance"
  },
  "html": "<div>...</div>",    ← Rendered HTML (generated from data)
  "user_edits": {              ← Track user modifications
    "css_overrides": "...",
    "content_changes": [...]
  },
  "version": 3,
  "parent_version": 2
}
```

### Workflow:

1. **AI generates JSON data** (structured, editable by AI)
2. **Renderer converts to HTML** (client-side or AI-generated)
3. **User edits HTML** (in browser)
4. **System extracts edits** (diff HTML, extract CSS/content changes)
5. **AI updates JSON** (preserves user intent)
6. **Re-render with edits** (merge user changes + AI updates)

---

## What Models Can Actually Do

### Test 1: Can AI Generate Sophisticated HTML?

**Prompt:**
> "Create a visual comparison card for two job offers. Make it look professional with modern styling. Use inline CSS. Make it standalone HTML."

**Expected Output:**
```html
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.card { 
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 32px;
  border-radius: 16px;
  color: white;
}
/* ... sophisticated styling ... */
</style>
</head>
<body>
  <div class="comparison">
    <div class="card">...</div>
    <div class="card">...</div>
  </div>
</body>
</html>
```

**Evaluation Criteria:**
- Is it standalone? (no external deps)
- Is it styled? (not just plain HTML)
- Is it responsive? (works on different sizes)
- Is it impressive? (gradients, shadows, modern design)

### Test 2: Can AI Update HTML While Preserving Structure?

**Scenario:**
1. AI generates comparison card HTML
2. User says "add a section for 2-year projections"
3. AI must: add new section, keep existing styling, preserve data

**Challenge:**
- AI needs to understand HTML structure
- AI needs to maintain consistent styling
- AI needs to insert content in the right place

### Test 3: Can AI Understand User Edits?

**Scenario:**
1. AI generates HTML
2. User manually edits: changes color from blue to green
3. User says "now add a pros/cons section"
4. AI must: preserve green color, add pros/cons

**Challenge:**
- AI doesn't see the user edit (it's in browser)
- System must send back the edited HTML
- AI must diff and understand what changed
- AI must respect user's aesthetic choices

---

## Recommended Approach for BubbleVoice

### Option A: JSON Artifacts + Pre-built Renderers (RECOMMENDED)

**How it works:**
- AI generates structured JSON (like current system)
- SwiftUI/HTML renderers convert to visuals
- User edits update the JSON (not HTML directly)
- AI updates JSON, renderer re-renders

**Pros:**
- ✅ Reliable (AI is good at JSON)
- ✅ Editable (JSON is structured)
- ✅ Preservable (clear data model)
- ✅ Fast (no HTML parsing)

**Cons:**
- ❌ Less flexible (limited to pre-built components)
- ❌ AI can't create custom visuals

### Option B: AI-Generated HTML + Diff Tracking (COMPLEX)

**How it works:**
- AI generates full HTML artifacts
- System tracks user edits via HTML diff
- AI receives edited HTML + update request
- AI generates new HTML preserving edits

**Pros:**
- ✅ Flexible (AI can create any visual)
- ✅ Impressive (unique designs per artifact)

**Cons:**
- ❌ Unreliable (AI might break HTML)
- ❌ Complex (HTML diff is hard)
- ❌ Slow (HTML generation is verbose)
- ❌ Expensive (more tokens)

### Option C: Hybrid (BEST OF BOTH)

**How it works:**
- AI generates JSON + HTML template
- Renderer uses template + data
- User edits update JSON or CSS overrides
- AI updates JSON, template re-applies

**Pros:**
- ✅ Flexible (AI can customize templates)
- ✅ Reliable (JSON is source of truth)
- ✅ Preservable (edits are structured)

**Cons:**
- ⚠️ Complex to build
- ⚠️ Requires template system

---

## What to Benchmark Next

### Immediate Tests (Can Do Now):

1. **HTML Generation Quality**
   - Prompt: "Create a standalone HTML comparison card"
   - Evaluate: Is it sophisticated? Styled? Standalone?
   - Compare: Gemini vs GPT vs Claude

2. **HTML Update Consistency**
   - Turn 1: Generate HTML
   - Turn 2: "Add a new section"
   - Evaluate: Did it preserve styling? Structure? Data?

3. **JSON + HTML Together**
   - Prompt: "Create both JSON data and HTML rendering"
   - Evaluate: Does HTML match JSON? Is it in sync?

### Advanced Tests (Need Infrastructure):

4. **User Edit Preservation**
   - Requires: HTML diff system
   - Requires: Edit extraction logic
   - Requires: Merge strategy

5. **Visual Diff Visualization**
   - Requires: HTML rendering in test
   - Requires: Screenshot comparison
   - Requires: Highlight changed elements

---

## Honest Assessment

**Current benchmark is valuable but incomplete:**
- ✅ Tests core AI capabilities (memory, structure, speed)
- ✅ Shows Gemini is fastest (critical for voice)
- ✅ Shows Claude has best artifact management
- ❌ Doesn't test HTML generation
- ❌ Doesn't test user edit preservation
- ❌ Doesn't test visual quality

**To properly test what you need:**
1. Add HTML generation scenarios
2. Build HTML diff/merge system
3. Add visual quality evaluation
4. Test edit preservation workflows

**Recommendation:**
- Keep current JSON benchmark (it's useful)
- Add HTML generation test (simple: can it make good HTML?)
- Don't build full edit preservation yet (too complex for v1)
- Use JSON artifacts + SwiftUI renderers for v1
- Evolve to HTML artifacts in v2 if needed

---

## Next Steps

Want me to:
1. **Add HTML generation test** to current benchmark?
2. **Build a simple HTML quality evaluator**?
3. **Create example HTML artifacts** to show what "sophisticated" means?
4. **Design the JSON + HTML hybrid system** in detail?
