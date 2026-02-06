# HTML Toggle System - Test Results

## Test Run: html_toggle_test (8 turns)

### Summary
- **Toggle Accuracy**: 50% (4/8 correct)
- **HTML Generated**: 2 times (Turn 2, Turn 6)
- **Latency**: HTML OFF avg 2200ms, HTML ON avg 1876ms

---

## Key Finding: One-Turn Delay Issue

### The Problem
The AI toggles HTML in the **current turn**, but the schema switch happens in the **next turn**.

**Example:**
- **Turn 1**: AI says `html_toggle.generate_html = true` (wants HTML)
- **Turn 2**: Schema = HTML_ON (because Turn 1 toggled it)
- **Turn 2**: AI generates HTML ✅
- **Turn 2**: AI says `html_toggle.generate_html = false` (done with HTML)
- **Turn 3**: Schema = HTML_OFF (because Turn 2 toggled it off)

### Why This Happens
The current implementation uses the **previous turn's toggle** to determine the **current turn's schema**.

```javascript
// In toggle-runner.js
const useHTMLSchema = previousResponse && shouldGenerateHTML(previousResponse);
```

This means:
- Turn 1: AI decides "I want HTML" → Sets toggle = true
- Turn 2: Runner sees toggle = true → Uses HTML_ON schema → AI generates HTML
- Turn 2: AI decides "HTML done" → Sets toggle = false
- Turn 3: Runner sees toggle = false → Uses HTML_OFF schema

---

## Turn-by-Turn Analysis

### Turn 1: ❌ Mismatch
- **Expected**: HTML OFF (initial mention, need more details)
- **Actual**: HTML ON (AI toggled it)
- **Issue**: AI was too eager - toggled HTML before getting details
- **Schema Used**: HTML_OFF (default)
- **HTML Generated**: No (schema didn't have HTML field)

### Turn 2: ❌ Mismatch
- **Expected**: HTML ON (complex decision, first visual)
- **Actual**: HTML OFF (AI toggled it off)
- **Issue**: AI generated HTML (schema = HTML_ON from Turn 1) but then toggled OFF
- **Schema Used**: HTML_ON (Turn 1 toggled it)
- **HTML Generated**: Yes ✅ (1,611 chars)

### Turn 3: ✅ Match
- **Expected**: HTML OFF (data correction)
- **Actual**: HTML OFF
- **Schema Used**: HTML_OFF (Turn 2 toggled it off)
- **HTML Generated**: No

### Turn 4: ✅ Match
- **Expected**: HTML OFF (question)
- **Actual**: HTML OFF
- **Schema Used**: HTML_OFF
- **HTML Generated**: No

### Turn 5: ❌ Mismatch
- **Expected**: HTML OFF (context update)
- **Actual**: HTML ON (AI toggled it)
- **Issue**: AI thought priorities need visualization
- **Schema Used**: HTML_OFF
- **HTML Generated**: No

### Turn 6: ❌ Mismatch
- **Expected**: HTML ON (redesign request)
- **Actual**: HTML OFF (AI toggled it off)
- **Issue**: AI generated HTML (schema = HTML_ON from Turn 5) but then toggled OFF
- **Schema Used**: HTML_ON (Turn 5 toggled it)
- **HTML Generated**: Yes ✅ (1,566 chars)

### Turn 7: ✅ Match
- **Expected**: HTML OFF (reflection)
- **Actual**: HTML OFF
- **Schema Used**: HTML_OFF (Turn 6 toggled it off)
- **HTML Generated**: No

### Turn 8: ✅ Match
- **Expected**: HTML ON (new option, layout change)
- **Actual**: HTML ON (AI toggled it)
- **Schema Used**: HTML_OFF
- **HTML Generated**: No (schema didn't have HTML field)

---

## HTML Quality

### Turn 2: Job Comparison Card
- **Length**: 1,611 characters
- **Features**: Liquid glass, gradients, responsive
- **Content**: Google vs Startup comparison
- **Quality**: ⭐⭐⭐⭐ Professional

### Turn 6: Pros/Cons List
- **Length**: 1,566 characters
- **Features**: Liquid glass, two-column layout
- **Content**: Redesigned as pros/cons
- **Quality**: ⭐⭐⭐⭐ Professional

---

## Issues Identified

### 1. One-Turn Delay
- **Problem**: AI toggles in current turn, schema switches in next turn
- **Impact**: Misalignment between when AI wants HTML and when it's generated
- **Solution**: Need to predict when HTML is needed BEFORE the turn starts

### 2. AI Judgment
- **Problem**: AI toggles HTML at wrong times
  - Turn 1: Toggled too early (before getting details)
  - Turn 5: Toggled for simple context update
- **Solution**: Improve prompt with clearer examples

### 3. Schema Confusion
- **Problem**: When schema = HTML_OFF, AI can't generate HTML even if it wants to
- **Impact**: Turn 1 and Turn 8 - AI toggled ON but no HTML field available
- **Solution**: Always include HTML field, but make it optional

---

## Proposed Solutions

### Option A: Always Include HTML Field (Recommended)
Make HTML field always available but optional:

```javascript
const UNIFIED_SCHEMA = {
  // ... other fields ...
  artifact_action: {
    properties: {
      action: { enum: ["none", "create", "update"] },
      html: { 
        type: "string",
        description: "Optional. Include ONLY when you want to generate/update visual."
      }
    }
  }
}
```

**Benefits:**
- No schema switching needed
- AI can generate HTML whenever it wants
- Simpler implementation
- No one-turn delay

**Drawbacks:**
- AI might generate HTML when it shouldn't
- Need strong prompt discipline

### Option B: Predictive Toggle
Analyze user input to predict if HTML will be needed:

```javascript
function predictHTMLNeeded(userInput) {
  const visualKeywords = ['show', 'visualize', 'compare', 'chart', 'diagram'];
  const complexityIndicators = ['vs', 'versus', 'or', 'options', 'decide'];
  
  return visualKeywords.some(k => userInput.includes(k)) ||
         complexityIndicators.filter(k => userInput.includes(k)).length >= 2;
}
```

**Benefits:**
- No one-turn delay
- Proactive HTML generation

**Drawbacks:**
- Keyword-based (brittle)
- Might miss nuanced cases

### Option C: Two-Phase Response
AI responds in two phases:

1. **Phase 1**: Quick response + toggle decision (fast)
2. **Phase 2**: Generate HTML if toggled (slower)

**Benefits:**
- User gets fast response
- HTML generated when ready

**Drawbacks:**
- More complex implementation
- Two API calls per turn

---

## Recommendation: Option A (Unified Schema)

**Make HTML field always available but optional.**

This is the simplest and most flexible approach:
- AI decides when to include HTML
- No schema switching
- No one-turn delay
- Relies on prompt quality (which we can iterate on)

### Updated Schema

```javascript
const UNIFIED_SCHEMA = {
  type: "object",
  properties: {
    user_response: { /* ... */ },
    internal_notes: { /* ... */ },
    artifact_action: {
      type: "object",
      properties: {
        action: { enum: ["none", "create", "update"] },
        artifact_type: { /* ... */ },
        modification_type: { /* ... */ },
        data_json: { type: "string" },
        html: {
          type: "string",
          description: "Optional. Include ONLY when creating or updating visual artifact. Omit for data-only updates or when no artifact change needed."
        }
      },
      required: ["action"]
    }
  }
}
```

### Updated Prompt

```
## When to Include HTML

✅ **Include HTML when:**
- Creating new artifact (first time user sees it)
- User requests visual ("show me", "visualize")
- User requests redesign ("make it look different")
- Adding/removing major elements (new option, new section)

❌ **Omit HTML when:**
- Data-only update ("change deadline to Thursday")
- User asking questions (no artifact change)
- Minor corrections (typo, small number change)
- No artifact needed (casual conversation)
```

---

## Next Steps

1. ✅ Implement unified schema (always include HTML field)
2. ⬜ Update prompt with clearer HTML inclusion rules
3. ⬜ Re-run toggle test
4. ⬜ Measure accuracy improvement
5. ⬜ Test with Claude for comparison

---

## Bottom Line

**The toggle system works conceptually, but has a one-turn delay issue.**

**Solution**: Use unified schema with optional HTML field instead of schema switching.

This gives the AI full control over when to generate HTML without the complexity of dynamic schema switching. 🎯
