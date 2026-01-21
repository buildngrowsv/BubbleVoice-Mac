# Model Behavior Learnings - Gemini 2.5 Flash-Lite

**Date**: January 20, 2026  
**Model**: Gemini 2.5 Flash-Lite  
**Context**: BubbleVoice structured output testing

---

## Critical Learnings

### 1. Schema Constraints > Prompt Instructions

**Discovery**: Gemini's structured output **ignores prompt-based guidance** and only respects **schema-level constraints**.

**Example**:
```
❌ Prompt: "user_quote: 50 tokens max, 1-2 sentences only"
   Result: AI generates 12,000+ tokens

✅ Schema: maxLength: 200
   Result: AI respects the limit
```

**Lesson**: For hard limits, use schema constraints (`maxLength`, `required`, `enum`), not prompt text.

---

### 2. Gemini Loops Without maxLength

**Discovery**: Without `maxLength` constraints, Gemini can get stuck **repeating the same text** until hitting `maxOutputTokens`.

**Example**:
```
Input: 632 tokens
Output: 12,278 tokens (hit limit)
Issue: Same 200-char phrase repeated ~100 times in user_quote field
```

**Trigger**: Long user inputs + no field length limits = repetition loop

**Lesson**: **Always add `maxLength` to string fields** in structured output schemas.

---

### 3. maxOutputTokens is a Hard Cutoff

**Discovery**: When response hits `maxOutputTokens`, it's **cut off mid-generation** with `finishReason: "MAX_TOKENS"`.

**Result**: Incomplete JSON → parse errors → failed responses

**Lesson**: Set `maxOutputTokens` high enough for worst-case response + buffer (~20%).

---

### 4. Character Limits ≠ Token Limits

**Discovery**: `maxLength` is in **characters**, not tokens. Ratio varies by content.

**Typical Ratio**: ~4 characters per token  
**Range**: 3-5 characters per token (varies by language, punctuation, etc.)

**Example**:
```
maxLength: 1000 chars
Expected: ~250 tokens
Actual: 200-300 tokens (varies)
```

**Lesson**: Set `maxLength` 20-30% lower than target tokens to account for variance.

---

### 5. Required Fields Must Be Explicit

**Discovery**: If a field is not in the `required` array, Gemini will **omit it** to save tokens, even if the prompt says it's important.

**Example**:
```javascript
// ❌ AI omits entry 85% of the time
required: ["action"]

// ✅ AI always includes entry
required: ["action", "path", "entry"]
```

**Lesson**: Make critical fields `required` in schema, don't rely on prompt emphasis.

---

### 6. First Turn Often Largest

**Discovery**: First turn of conversation typically generates **more tokens** than subsequent turns.

**Why**: More context to capture, more area operations, more comprehensive responses.

**Example**:
```
Turn 1: 12,276 tokens (hit limit)
Turn 2: 573 tokens ✅
Turn 3: 2,373 tokens ✅
```

**Lesson**: Budget for first turn being 2-3x larger than average.

---

### 7. Nested Fields Accumulate

**Discovery**: Multiple fields at their `maxLength` can cause total response to exceed `maxOutputTokens`.

**Example**:
```
7 area_actions × 500 tokens = 3,500 tokens
+ HTML artifact: 7,500 tokens
+ Other fields: 1,000 tokens
= 12,000 tokens (hits 12,288 limit)
```

**Lesson**: Total `maxLength` across all fields should be < `maxOutputTokens` - 20% buffer.

---

### 8. Structured Output is Literal

**Discovery**: Gemini follows structured output schemas **very literally**. No interpretation, no flexibility.

**Examples**:
- If `enum` says `["none", "create"]`, it won't generate `"skip"` or `"nothing"`
- If `maxLength: 200`, it cuts at exactly 200 chars (may cut mid-word)
- If field not `required`, it omits even if prompt says "always include"

**Lesson**: Design schemas carefully - Gemini won't "figure out what you meant."

---

### 9. Long Inputs Don't Cause Long Outputs (Usually)

**Discovery**: Long user inputs (800+ words) don't automatically cause long responses, **unless** the AI tries to quote or summarize extensively.

**Example**:
```
User input: 2,528 chars (632 tokens)
AI output: 12,278 tokens (looping on user_quote)
```

**Trigger**: Trying to capture "user's exact words" from long rambling input.

**Lesson**: Explicitly limit quote fields (`maxLength: 200`) to prevent AI from copying entire input.

---

### 10. Context Caching Helps

**Discovery**: Gemini's context caching reduces input token costs for repeated system prompts.

**Example**:
```
Turn 1: 4,551 input tokens (no cache)
Turn 2: 4,931 input tokens (4,408 cached)
Savings: 89% of system prompt tokens
```

**Lesson**: Use consistent system prompts to benefit from caching.

---

## Best Practices

### Schema Design

1. ✅ Add `maxLength` to **all** string fields
2. ✅ Set `maxLength` 25% lower than target tokens
3. ✅ Make critical fields `required`
4. ✅ Use `enum` for constrained choices
5. ✅ Calculate total max tokens across all fields

### Token Budgeting

1. ✅ Set `maxOutputTokens` = (max possible response) + 20% buffer
2. ✅ Budget for first turn being 2-3x larger
3. ✅ Account for character-to-token variance (3-5 chars/token)
4. ✅ Monitor actual token usage vs expected

### Error Handling

1. ✅ Save debug files on `MAX_TOKENS` errors
2. ✅ Log actual token usage per turn
3. ✅ Retry with simpler prompt if MAX_TOKENS hit
4. ✅ Gracefully handle incomplete responses

### Prompt Engineering

1. ❌ Don't rely on prompt text for hard limits
2. ✅ Use schema constraints for enforcement
3. ✅ Keep system prompt consistent for caching
4. ✅ Add examples for complex structures

---

## Model-Specific Notes

### Gemini 2.5 Flash-Lite

**Strengths**:
- Very fast (~2-3s per response)
- Excellent structured output compliance
- Good context caching
- Cost-effective ($0.0003/turn)
- 1M token context window

**Weaknesses**:
- Can loop without `maxLength`
- Ignores prompt-based token budgets
- Literal schema interpretation (no flexibility)
- First turn often oversized

**Compared to Others**:
- **GPT-4o**: Better at following prompt instructions, but more expensive
- **Claude**: More conservative, less likely to loop, but slower
- **Gemini**: Fastest and cheapest, but needs stricter schema constraints

---

## Quick Reference

### Preventing Token Overflow

```javascript
// ✅ Good Schema
{
  user_quote: {
    type: "string",
    description: "1-2 sentence quote",
    maxLength: 200  // ~50 tokens
  },
  content: {
    type: "string", 
    description: "2-3 sentences",
    maxLength: 1000  // ~250 tokens
  }
}

// ❌ Bad Schema
{
  user_quote: {
    type: "string",
    description: "Keep under 50 tokens"  // IGNORED!
  }
}
```

### Calculating Token Budget

```
Total maxLength (chars) ÷ 4 = Approximate tokens
Add 20% buffer for variance
Ensure total < maxOutputTokens
```

### When Gemini Loops

**Symptoms**: Response hits `maxOutputTokens` exactly, same text repeated

**Fix**: Add `maxLength` to the field that's looping (usually quote/content fields)

---

## Summary

**Key Insight**: Gemini's structured output is **schema-driven, not prompt-driven**. Use schema constraints for all hard requirements.

**Most Important**: Always add `maxLength` to string fields to prevent looping.

**Token Math**: `maxLength` chars ÷ 4 = approximate tokens (±20%)

**Production Ready**: Yes, with proper schema constraints and error handling.
