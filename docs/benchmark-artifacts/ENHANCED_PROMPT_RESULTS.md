# Enhanced Emotional Prompt Results

## Goal
Optimize Gemini 2.5 Flash Lite to match Claude Sonnet 4.5's emotional sophistication while maintaining speed advantage.

## Strategy
1. **Provide inspirational examples** without biasing tone
2. **Show emotional spectrum** (neutral → analytical → supportive → empathetic → personal → crisis)
3. **Let AI choose** appropriate level based on context
4. **Support visual artifacts** (mind maps, venn diagrams, pathways) - non-editable, HTML-only
5. **Clarify data vs visual** artifacts - some have `data` field (editable), some don't (pure visualization)

---

## Enhanced Prompt Features

### 1. **Emotional Intelligence Spectrum**
Provides 5 emotional tones with examples:
- 🔵 **Neutral/Analytical**: "Decision Comparison", "Pros/Cons"
- 🟢 **Supportive/Encouraging**: "Your Progress", "Building Momentum"
- 🟡 **Empathetic/Validating**: "What You're Juggling", "This is hard because..."
- 🟠 **Personal/Intimate**: "Your Family's Future", first-person quotes
- 🔴 **Crisis/Grounding**: "Let's Take This One Step at a Time"

**Key**: AI chooses based on stakes, not defaulting to one style.

### 2. **Visual Artifact Support**
New non-editable artifact types:
- `mind_map`: Concept relationships
- `venn_diagram`: Overlapping categories
- `pathway_diagram`: Decision trees, flows
- `concept_visualization`: Abstract ideas
- `infographic`: Graphical information

**Structure**: HTML-only, no `data` field (can't be edited, only recreated)

### 3. **Data vs Visual Artifacts**
**Data Artifacts** (editable):
- Have both `data` and `html` fields
- Can be updated with `data_only`, `ui_only`, `data_and_ui`, `complete_overhaul`
- Examples: comparison_card, goal_tracker, stress_map

**Visual Artifacts** (non-editable):
- Have only `html` field
- Can only be recreated entirely
- Examples: mind_map, venn_diagram, pathway_diagram

### 4. **Visual Examples**
Provided complete HTML examples for:
- Mind map with central node + branches
- Venn diagram with SVG circles
- Comparison card with emotional language

---

## Current Issue: Gemini Not Generating HTML

### Problem
After implementing enhanced prompt, Gemini is generating `data` but NOT `html` field.

**Test Results:**
```
Turn 1: artifact_action has keys: ['action', 'artifact_id', 'artifact_type', 'data']
Missing: 'html' field
```

### Root Cause
Gemini's `responseMimeType: 'application/json'` with structured schema may be:
1. Stripping the `html` field because it's a large string
2. Not recognizing `html` as part of the schema
3. Prioritizing `data_json` over `html`

### Solution Options

**Option 1: Make HTML Required in Schema**
```javascript
artifact_action: {
  properties: {
    html: {
      type: "string",
      description: "REQUIRED: Complete standalone HTML with inline CSS"
    }
  },
  required: ["action", "html"]  // Force HTML generation
}
```

**Option 2: Use data_json for HTML**
Store HTML in `data_json` field (which Gemini already uses):
```javascript
{
  "data_json": JSON.stringify({
    html: "<div>...</div><style>...</style>",
    data: { /* structured data */ }
  })
}
```

**Option 3: Separate HTML Request**
Make two API calls:
1. First: Generate structured data
2. Second: Generate HTML from data

**Option 4: Use Claude for HTML, Gemini for Intelligence**
- Gemini handles conversation + artifact intelligence (fast, cheap)
- Claude generates HTML when artifact is created/updated (slow, expensive, but beautiful)

---

## Recommendations

### Immediate: Fix Gemini HTML Generation
1. Update schema to make `html` required
2. Test if Gemini respects it
3. If not, use Option 2 (store HTML in data_json)

### Short-term: Hybrid System
**For BubbleVoice Mac:**
1. **Gemini handles intelligence** (when to create, what to modify)
2. **Gemini OR Claude generates HTML** based on:
   - **Default**: Gemini (fast, good enough)
   - **Premium**: Claude (high-stakes decisions, user requests "enhanced")
   - **Trigger**: Detect keywords like "family", "future", "life decision"

### Long-term: Prompt Optimization
Continue enhancing Gemini's prompt with:
- More emotional language examples
- First-person quote patterns
- Reflection section templates
- Color psychology guidance

---

## Visual Artifact Types Added

### Mind Map
- Central concept with radiating branches
- Sub-nodes for details
- Color-coded by category
- Use: Brainstorming, concept exploration

### Venn Diagram
- Overlapping circles (SVG)
- Intersection shows commonalities
- Use: Finding overlap, sweet spots

### Pathway Diagram
- Decision trees
- Process flows
- Journey maps
- Use: Showing paths, choices, progressions

### Concept Visualization
- Abstract ideas made visual
- Metaphorical representations
- Use: Explaining complex concepts

### Infographic
- Information presented graphically
- Data visualization + design
- Use: Presenting facts, statistics, processes

---

## Key Insight: Not All Artifacts Need Data

**Old thinking**: Every artifact needs structured data for editing
**New thinking**: Some artifacts are pure visualizations

**Examples:**
- Mind map of career factors → No editable data, just visual
- Venn diagram of interests → No editable data, just visual
- Pathway diagram of life choices → No editable data, just visual

**Benefit**: Simpler, faster, more creative visual outputs

---

## Next Steps

1. ✅ **Done**: Enhanced prompt with emotional spectrum
2. ✅ **Done**: Added visual artifact types (mind map, venn, pathway)
3. ✅ **Done**: Clarified data vs visual artifacts
4. ⏭️ **Next**: Fix Gemini HTML generation (schema update)
5. ⏭️ **Next**: Test enhanced Gemini vs Claude on same scenario
6. ⏭️ **Next**: Implement hybrid system (Gemini + Claude)
7. ⏭️ **Next**: Create visual artifact test scenarios

---

## Bottom Line

**Enhanced prompt is ready** with:
- ✅ Emotional intelligence spectrum
- ✅ Visual artifact support
- ✅ Inspirational examples without bias
- ✅ Data vs visual artifact clarification

**But Gemini needs schema fix** to actually generate HTML.

Once fixed, we can test if enhanced prompt brings Gemini closer to Claude's emotional sophistication while maintaining 5.4x speed advantage.
