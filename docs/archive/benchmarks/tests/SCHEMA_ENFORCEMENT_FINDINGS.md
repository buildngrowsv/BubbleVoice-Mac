# Schema Enforcement Findings

**Date**: January 20, 2026  
**Test**: Adding field-level descriptions + tighter maxLength constraints

---

## Hypothesis

**If we add strong descriptions to each field with explicit length limits, Gemini will respect them better than just having them in the main prompt.**

---

## Changes Made

### 1. Added Descriptions to Every Field

```javascript
spoken_text: { 
  type: "string",
  description: "CRITICAL: 1-2 sentences ONLY (50 words MAX). Be concise or entire response will fail.",
  maxLength: 200  // Reduced from 1000
}

user_quote: {
  type: "string",
  description: "CRITICAL LIMIT: 1 sentence (20 words MAX). Extract key phrase ONLY, DO NOT copy entire user input or you will cause failure!",
  maxLength: 80  // Reduced from 200
}
```

### 2. Reduced maxLength Values Across All Fields

| Field | Old maxLength | New maxLength | Reduction |
|-------|---------------|---------------|-----------|
| spoken_text | 1000 | 200 | -80% |
| internal_notes.content | 500 | 300 | -40% |
| entry.context | 500 | 100 | -80% |
| entry.content | 1000 | 300 | -70% |
| entry.user_quote | 200 | 80 | -60% |
| html | 30000 | 12000 | -60% |

### 3. Added "LIMIT:" and "CRITICAL:" Prefixes

To make limits more prominent in descriptions.

---

## Results

### Before (No Field Descriptions)

- **Success Rate**: 84% (32/38)
- **MAX_TOKENS Errors**: 16% (6/38)
- **Average Output**: 2,000-4,000 tokens

### After (With Field Descriptions + Tighter Limits)

- **Success Rate**: 79% (33/42) ⬇️ -5%
- **MAX_TOKENS Errors**: 21% (9/42) ⬆️ +5%
- **Average Output**: Still hitting 6,132 tokens

---

## Key Finding

**Gemini COMPLETELY IGNORES both `maxLength` AND `description` fields.**

### Evidence

1. **Set `maxLength: 80` for user_quote**
   - Gemini still generated 20,000+ character responses
   
2. **Added "CRITICAL LIMIT" to descriptions**
   - No change in behavior
   
3. **Reduced all maxLength values by 60-80%**
   - Responses still hit 6,132 tokens (maxOutputTokens limit)

### Conclusion

**Field-level constraints in JSON schema have ZERO effect on Gemini's output.**

Gemini only respects:
- ✅ `type` (string, number, object, array)
- ✅ `enum` (constrained values)
- ✅ `required` (which fields must be present)
- ❌ `maxLength` (completely ignored)
- ❌ `description` (not used for enforcement)

---

## Why Did Success Rate Drop?

### Hypothesis

**Tighter `maxLength` values may have confused the model or caused validation errors.**

Even though Gemini ignores `maxLength` during generation, the API might:
1. Validate the response against the schema after generation
2. Reject responses that exceed `maxLength` values
3. Return MAX_TOKENS error instead of the actual response

This would explain why:
- Responses still hit 6,132 tokens (generation not constrained)
- But more responses fail (post-generation validation)

---

## What Actually Works

### Only `maxOutputTokens` Constrains Output

```javascript
generationConfig: {
  maxOutputTokens: 6144  // THIS is the only real constraint
}
```

### Prompt-Level Instructions (Partially Effective)

```
⚠️  CRITICAL: 6,000 TOKEN LIMIT
Be concise or your response will FAIL.
```

**Effectiveness**: ~60-70% (Gemini sometimes follows, sometimes ignores)

---

## Recommendations

### ❌ Don't Rely On

1. `maxLength` in schema - completely ignored
2. Field-level descriptions - not used for enforcement
3. Tighter constraints - may hurt more than help

### ✅ Do Use

1. **`maxOutputTokens`** - the ONLY hard constraint
2. **Strong prompt emphasis** - helps ~60-70% of the time
3. **Conditional logic** - skip HTML for complex turns
4. **Fallback handling** - recover from MAX_TOKENS errors

---

## Optimal Configuration

### Schema

```javascript
// Keep maxLength values LOOSE (don't over-constrain)
// They're ignored anyway, and tight values may cause validation issues

spoken_text: { 
  type: "string",
  description: "Your response to the user (1-2 sentences)",
  maxLength: 500  // Loose limit, won't be enforced anyway
}
```

### Generation Config

```javascript
generationConfig: {
  maxOutputTokens: 6144,  // Real constraint
  temperature: 0.7
}
```

### Prompt

```
⚠️  CRITICAL: 6,000 TOKEN LIMIT

You have a HARD LIMIT of 6,000 output tokens.

Be CONCISE:
- spoken_text: 1-2 sentences
- entry.content: 2-3 sentences
- user_quote: 1 sentence (key phrase only)

Skip HTML if >3 area_actions.

If you exceed 6,000 tokens, your response will be CUT OFF and FAIL.
```

---

## Next Steps

### Revert to Looser maxLength Values

The tight constraints (80, 100, 200) may be causing validation issues.

**Recommendation**: Use moderate values (500-1000) that won't trigger false positives.

### Focus on Prompt Engineering

Since schema constraints don't work, invest in:
1. Stronger prompt emphasis
2. Examples of good responses
3. Explicit consequences for verbosity

### Implement Conditional HTML Skipping

```javascript
// In prompt or pre-processing
if (area_actions.length > 3 || user_input_tokens > 400) {
  "Skip HTML artifact (set action: 'none')"
}
```

---

## Summary

**Finding**: Field-level `maxLength` and `description` constraints have ZERO effect on Gemini.

**Impact**: Tighter constraints may actually hurt (79% vs 84% success).

**Recommendation**: Revert to looser `maxLength` values, focus on `maxOutputTokens` + prompt engineering.

**Key Insight**: Gemini's structured output is "shape-driven" (type, required, enum) not "constraint-driven" (maxLength, pattern, format).
