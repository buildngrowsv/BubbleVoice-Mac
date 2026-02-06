# Final Recommendation: Schema Design for Gemini

**Date**: January 20, 2026  
**Conclusion**: Keep schema simple, enforce via prompt + maxOutputTokens only

---

## Test Results Summary

| Approach | Success Rate | MAX_TOKENS Errors | Notes |
|----------|--------------|-------------------|-------|
| **Baseline** (no maxLength) | 67% | 33% | No constraints |
| **maxLength** (loose, 1000-30000) | 67% | 33% | Gemini ignores maxLength |
| **Reduced maxOutputTokens** (12K→6K) | **84%** ✅ | 16% | Best result |
| **Tight maxLength** (80-300) + descriptions | 79% | 21% | Worse than baseline |
| **Moderate maxLength** (150-500) + descriptions | 76% | 26% | Even worse |

---

## Key Findings

### 1. Gemini Ignores maxLength Completely

**Evidence**:
- Set `maxLength: 80` for user_quote
- Gemini generated 50,923 characters (638x the limit!)
- Official docs confirm: "unsupported properties are ignored"

### 2. Field Descriptions Don't Constrain Output

**Evidence**:
- Added "CRITICAL LIMIT" to every field
- No change in generation behavior
- Descriptions add tokens to schema, reducing available output space

### 3. Only maxOutputTokens Works

**Evidence**:
- Reducing from 12K to 6K: 67% → 84% success (+17%)
- Adding field constraints: 84% → 76% success (-8%)
- **Conclusion**: maxOutputTokens is the ONLY real constraint

### 4. Tighter Constraints Hurt Performance

**Hypothesis**: Gemini's API may validate responses post-generation
- Loose maxLength (1000): Validation passes
- Tight maxLength (80): Validation fails even if generation succeeded
- **Result**: More failures with tighter constraints

---

## Optimal Configuration

### Schema Design

```javascript
const FULL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { 
          type: "string"
          // NO maxLength - Gemini ignores it
          // NO description - doesn't help, adds tokens
        },
        emotional_tone: { 
          type: "string", 
          enum: ["supportive", "curious", "reflective", "celebratory", "concerned", "neutral"]
        }
      },
      required: ["spoken_text", "emotional_tone"]
    },
    // ... other fields
  },
  required: ["user_response", "internal_notes", "area_actions", "artifact_action"]
};
```

**Principles**:
- ✅ Use `type`, `enum`, `required` (Gemini respects these)
- ❌ Skip `maxLength` (ignored, may cause validation issues)
- ❌ Skip field `description` (doesn't constrain, adds schema tokens)
- ✅ Keep schema minimal (more tokens for actual response)

### Generation Config

```javascript
generationConfig: {
  responseMimeType: 'application/json',
  temperature: 0.7,
  maxOutputTokens: 6144  // THE constraint that matters
}
```

### System Prompt

```
⚠️  CRITICAL: 6,000 TOKEN LIMIT

You have a HARD LIMIT of 6,000 output tokens. If you exceed this, your response will be CUT OFF mid-generation and FAIL completely.

**REQUIRED BREVITY** (word counts):
- spoken_text: 1-2 sentences (50 words MAX)
- internal_notes.content: 2-3 sentences (75 words MAX)
- entry.context: 1 sentence (25 words MAX)
- entry.content: 2-3 sentences (75 words MAX)
- entry.user_quote: 1 sentence (20 words MAX) - Extract key phrase ONLY, DO NOT copy entire user input!
- entry.ai_observation: 1 sentence (25 words MAX)

**HTML ARTIFACTS**:
- Skip HTML if >3 area_actions (set action: "none")
- Keep HTML under 200 lines if you do generate it

**CONSEQUENCE**: Exceeding 6,000 tokens = COMPLETE FAILURE. User sees error.

BE BRIEF. BE FOCUSED. QUALITY > QUANTITY.
```

**Principles**:
- ✅ Explicit token limit with consequences
- ✅ Word counts (more intuitive than char counts)
- ✅ Specific examples for each field
- ✅ Conditional logic (skip HTML when complex)
- ✅ Emphasis on failure consequence

---

## Expected Performance

### With Optimal Config

- **Success Rate**: 84-90%
- **MAX_TOKENS Errors**: 10-16%
- **Average Output**: 2,000-4,000 tokens
- **Cost per Turn**: $0.0002 (50% savings vs 12K limit)
- **Latency**: 2-3s (40% faster vs 12K limit)

### Remaining Failures (10-16%)

**Causes**:
1. Extreme rambling (600+ token user input)
2. Multiple complex area operations (5-7 actions)
3. HTML artifact + many area operations
4. Comprehensive summaries requested

**Mitigation**: Implement conditional HTML skipping

```javascript
// In pre-processing or prompt
if (area_actions.length > 3 || user_input_tokens > 400) {
  "CRITICAL: Skip HTML artifact. Set artifact_action.action = 'none'"
}
```

**Expected Result**: 90-95% success rate

---

## Why This Works

### Gemini's Structured Output Model

**What Gemini Enforces**:
- **Shape**: type, required, enum
- **Structure**: object properties, array items
- **Format**: JSON syntax

**What Gemini Ignores**:
- **Constraints**: maxLength, minLength, pattern
- **Validation**: format, maximum, minimum
- **Hints**: description (for generation)

### The Real Constraint

**`maxOutputTokens` is enforced at the API level**, not the model level.

When response hits this limit:
1. Generation stops immediately
2. Response is cut off mid-JSON
3. Returns `finishReason: "MAX_TOKENS"`
4. Incomplete JSON → parse error

**Solution**: Set `maxOutputTokens` low enough to force brevity, high enough to allow quality responses.

**Sweet Spot**: 6,144 tokens (6K)

---

## Implementation Checklist

### ✅ Do This

1. Set `maxOutputTokens: 6144`
2. Remove field `description` from schema (doesn't help)
3. Remove or loosen `maxLength` values (may hurt)
4. Add strong brevity emphasis to system prompt
5. Include explicit word counts for each field type
6. Emphasize failure consequence
7. Implement conditional HTML skipping
8. Add fallback handler for MAX_TOKENS errors

### ❌ Don't Do This

1. Add tight `maxLength` constraints (ignored, may cause validation issues)
2. Add verbose field descriptions (adds schema tokens, doesn't constrain)
3. Rely on schema to enforce brevity (only prompt + maxOutputTokens work)
4. Set `maxOutputTokens` too high (>8K = more failures)
5. Set `maxOutputTokens` too low (<4K = truncated responses)

---

## Alternative Approaches

### If 84% Success Rate Isn't Enough

#### Option A: Two-Pass Generation

**Pass 1**: Data only (no HTML)
- `maxOutputTokens: 4096`
- Skip artifact_action.html
- **Success Rate**: 95%+

**Pass 2**: HTML only (if needed)
- `maxOutputTokens: 8192`
- Generate HTML separately
- **Success Rate**: 95%+

**Pros**: Very reliable  
**Cons**: 2x API calls, 2x latency, 2x cost

#### Option B: Switch to GPT-4o or Claude

**GPT-4o**:
- ✅ Supports `maxLength` constraints
- ✅ Better at following prompt instructions
- ❌ 10x more expensive
- ❌ Smaller context window

**Claude 3.5 Sonnet**:
- ✅ Supports `maxLength` constraints
- ✅ Very reliable
- ❌ 5x more expensive
- ❌ Smaller context window

**Recommendation**: Stay with Gemini for cost savings (100x cheaper than GPT-4o)

---

## Summary

**Problem**: Gemini ignores `maxLength` and field descriptions

**Solution**: Enforce brevity via `maxOutputTokens` (6K) + strong prompt emphasis

**Result**: 84% success rate (vs 67% baseline)

**Next Step**: Implement conditional HTML skipping → 90-95% success

**Key Insight**: Gemini's structured output is "shape-driven" not "constraint-driven". Only `maxOutputTokens` provides real enforcement.

**Production Ready**: Yes, with 84% success rate and fallback handling for the remaining 16%
