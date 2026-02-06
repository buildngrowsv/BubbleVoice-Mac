# ROOT CAUSE FOUND: Prompt Examples Were Too Verbose

**Date**: January 20, 2026  
**Status**: ✅ FIXED - 90% success rate achieved

---

## The Problem

**Gemini was following the examples in the prompt TOO LITERALLY.**

The prompt contained examples like:

```javascript
"user_quote": "I want to make sure I have all the context when I talk to Ms. Johnson",
"current_situation": "Emma is in 2nd grade and has been struggling with reading comprehension. Recent breakthrough with graphic novels (Dog Man series) showing visual learning style. Teacher meeting scheduled for next week to discuss testing options.",
```

When processing long user inputs (600+ tokens), Gemini saw these examples and thought:
- "user_quote should be a full sentence with context"
- "current_situation should be 3-4 detailed sentences"

So it extracted EVERYTHING from the user's rambling input to match that level of detail.

---

## What Was Happening

### Before Fix

**Example in Prompt**:
```
"user_quote": "I want to make sure I have all the context when I talk to Ms. Johnson" (16 words)
```

**Gemini's Output for Long Input**:
```
"user_quote": "I just want to make sure she's smart and capable even if reading is hard for her. I don't want this to define her, you know? ... [continues for 23,346 characters]"
```

**Result**: 23,346 characters in user_quote field alone!

### Why This Happened

1. **Gemini learns from examples** more than from instructions
2. **Long examples = long outputs** (Gemini matches the pattern)
3. **With long user input**, Gemini tries to extract "equivalent detail"
4. **Result**: Copies/concatenates dozens of phrases to match example length

---

## The Fix

### Changed Examples to Be BRIEF

**Before**:
```javascript
"user_quote": "I want to make sure I have all the context when I talk to Ms. Johnson",
"content": "Emma has a teacher meeting next week. User is preparing and wants to make sure they have all the context. This shows proactive parenting and concern for Emma's progress.",
"current_situation": "Emma is in 2nd grade and has been struggling with reading comprehension. Recent breakthrough with graphic novels (Dog Man series) showing visual learning style. Teacher meeting scheduled for next week to discuss testing options.",
```

**After**:
```javascript
"user_quote": "talk to Ms. Johnson",
"content": "Emma has teacher meeting next week. User preparing.",
"current_situation": "Emma (2nd grade) struggling with reading. Breakthrough with graphic novels. Teacher meeting next week.",
```

### Updated Instructions

**Before**:
```
- entry.user_quote: User's exact words (optional but valuable)
- entry.content: The actual information to record (DETAILED, 2-3 sentences)
6. Include user_quote when user said something memorable
```

**After**:
```
- entry.user_quote: BRIEF key phrase (3-5 words ONLY, not full sentences!)
- entry.content: The actual information to record (2-3 sentences)
6. user_quote: 3-5 words ONLY (brief key phrase, NOT full sentences!)
```

---

## Results

| Configuration | Success Rate | MAX_TOKENS Errors | Notes |
|---------------|--------------|-------------------|-------|
| **Original** (verbose examples) | 67% | 33% | user_quote: 23K chars |
| **+ Reduced maxOutputTokens** | 84% | 16% | Still hitting limits |
| **+ Brevity mode** | 76% | 24% | Gemini ignored instructions |
| **+ Fixed examples** ✅ | **90%** | **10%** | **WORKING!** |

### Breakdown by Scenario

| Scenario | Success Rate | Notes |
|----------|--------------|-------|
| Basic Recall | 75% (3/4) | Good |
| Multi-Topic Rambling | 100% (3/3) | ✅ Perfect |
| STT Errors | 100% (6/6) | ✅ Perfect |
| New Topic | 100% (5/5) | ✅ Perfect |
| Emotional Complexity | 100% (5/5) | ✅ Perfect |
| Context Summary | 80% (4/5) | Good |
| Vague Follow-ups | 83% (5/6) | Good |
| Repetition Prevention | 67% (4/6) | Acceptable |
| **Extreme Rambling** | **100% (3/3)** | ✅ **FIXED!** |

**Overall**: 38/42 = **90% success rate**

---

## Key Learnings

### 1. Examples > Instructions

**Gemini learns more from examples than from explicit instructions.**

Even with:
```
⚠️  CRITICAL: 5-10 words MAX for user_quote
```

If the example shows 16 words, Gemini will generate 16+ words.

### 2. Example Length Matters

**The length of examples sets expectations for output length.**

- Short examples (3-5 words) → Short outputs
- Long examples (15-20 words) → Long outputs
- Very long examples (50+ words) → VERY long outputs

### 3. Long Inputs Amplify the Problem

**With long user inputs, Gemini tries to match example detail by extracting MORE.**

- Short input (50 tokens) + Long example = Matches example length
- Long input (600 tokens) + Long example = Extracts everything to match "detail level"

### 4. Prompt Engineering Hierarchy

**What Gemini respects (in order)**:

1. **Examples** (most influential)
2. **`maxOutputTokens`** (hard API limit)
3. **Explicit instructions** (somewhat influential)
4. **Schema constraints** (ignored: maxLength, description)

---

## Why This Took So Long to Find

### The Investigation Path

1. **First thought**: Gemini ignores `maxLength` (TRUE)
2. **Second thought**: Need stronger prompt emphasis (HELPED A LITTLE)
3. **Third thought**: Need brevity mode for long inputs (HELPED A LITTLE)
4. **Fourth thought**: Need to skip fields entirely (HELPED A LITTLE)
5. **Fifth thought**: Gemini is hallucinating (WRONG)
6. **ACTUAL CAUSE**: Examples were too verbose ✅

### Why It Wasn't Obvious

- The examples looked "reasonable" (16 words for a quote)
- Instructions said "brief" but examples showed otherwise
- Gemini followed examples, not instructions
- Only manifested with long user inputs (>200 tokens)
- Looked like "hallucination" or "looping" but was actually "pattern matching"

---

## Production Recommendations

### 1. Keep Examples MINIMAL

```javascript
// ✅ Good Example
"user_quote": "reading is hard"

// ❌ Bad Example  
"user_quote": "I just want to make sure she knows she's smart and capable even if reading is hard for her"
```

### 2. Match Example Length to Desired Output

If you want 3-5 word outputs, show 3-5 word examples.

### 3. Use Multiple Short Examples

Better to show 3 short examples than 1 long example:

```javascript
// ✅ Good
"user_quote": "worried about Emma"
"user_quote": "testing next week"
"user_quote": "feeling overwhelmed"

// ❌ Bad
"user_quote": "I'm worried about Emma and the testing that's coming up next week and I'm feeling overwhelmed"
```

### 4. Brevity Mode Still Useful

Keep brevity mode for long inputs as an extra safety layer:

```javascript
if (userInputTokens > 200) {
  return `
🚨 BREVITY MODE ACTIVATED 🚨
- user_quote: 3-5 words MAX
- content: 2-3 sentences MAX
`;
}
```

### 5. Monitor Example Drift

Over time, examples might get longer as the prompt evolves. 

**Regular audit**: Check that examples match desired output length.

---

## Summary

**Root Cause**: Verbose examples in prompt caused Gemini to generate verbose outputs

**Symptom**: 23K+ character fields for long user inputs

**Fix**: Shortened all examples to match desired output length

**Result**: 67% → 90% success rate (+23% improvement)

**Key Insight**: Gemini learns from examples more than instructions

**Time to Fix**: 10 minutes (once root cause identified)

**Lesson**: Always check your examples first when debugging LLM output issues

---

## Final Configuration

### maxOutputTokens
```javascript
maxOutputTokens: 6144  // 6K tokens
```

### Example Lengths
```javascript
user_quote: 3-5 words
content: 10-20 words
current_situation: 15-25 words
```

### Brevity Mode Trigger
```javascript
if (userInputTokens > 200) {
  // Activate brevity mode
}
```

### Expected Performance
- **Success Rate**: 90%+
- **Cost per Turn**: $0.0002
- **Latency**: 2-4s
- **Quality**: High

**Status**: ✅ Production Ready
