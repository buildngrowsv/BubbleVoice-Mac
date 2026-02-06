# Critical Issue: user_quote Field Looping

**Date**: January 20, 2026  
**Status**: 🔴 CRITICAL - Blocking 100% success rate

---

## The Problem

**Gemini is copying the ENTIRE user input (or multiple quotes) into the `user_quote` field, even with explicit brevity instructions.**

### Evidence

**Brevity Mode Instruction**:
```
entry.user_quote: 5-10 words MAX (key phrase only!)
```

**Actual Output**:
```
"user_quote": "I just want to make sure she's smart and capable even if reading is hard for her. I don't want this to define her, you know? ... But I also don't want to ignore it if she needs help. I'm just scared of making the wrong choice. With the testing, with the investors, with everything. What if I mess it all up?\", \"I think the Emma thing is probably the most urgent because that teacher meeting is next week.\", \"Max will be so disappointed if I'm not there but this investor could be really important for the company.\", \"It's like I can't win.\", \"She's so creative and funny and kind. The reading thing is just one thing.\", \"She threw her book and said I'm stupid. That just broke my heart.\", \"Maybe I should have noticed sooner that she was having trouble.\", \"Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that.\", \"On one hand I want to help Emma in every way possible but on the other hand I don't want her to feel like there's something wrong with her. She's already so hard on herself.\", \"the reading thing is just one thing.\", \"I'm just scared of making the wrong choice.\", \"What if I mess it all up?\", \"It's like I can't win.\", \"I think the Emma thing is probably the most urgent because that teacher meeting is next week.\", \"But also I'm worried about the investor call conflicting with Max's game.\", \"Max will be so disappointed if I'm not there but this investor could be really important for the company.\", \"And if the company fails then what? Then I've sacrificed all this family time for nothing.\", \"But if I don't take the investor seriously then maybe we don't get funding and the company fails anyway.\", \"And Emma, I just want to make sure she knows she's smart and capable even if reading is hard for her.\", \"I don't want this to define her, you know?\", \"She's so creative and funny and kind. The reading thing is just one thing.\", \"But I also don't want to ignore it if she needs help. I'm just scared of making the wrong choice. With the testing, with the investors, with everything. What if I mess it all up?\"
```

**Length**: 23,346 characters (~5,836 tokens)

**Expected**: 5-10 words (~10-20 characters)

**Ratio**: 1,167x over the limit!

---

## Why This Happens

### Gemini's Behavior with Long User Inputs

When the user input is very long (600+ tokens), Gemini tries to "capture" the user's words by:

1. **Extracting multiple quotes** from different parts of the input
2. **Concatenating them** with `\", \"` separators
3. **Repeating quotes** that appear multiple times in the input
4. **Ignoring brevity instructions** completely

### Why Brevity Mode Doesn't Help

Even with:
```
🚨 BREVITY MODE ACTIVATED 🚨
entry.user_quote: 5-10 words MAX (key phrase only!)
```

Gemini still generates 23K+ character `user_quote` fields because:
- It prioritizes "capturing the user's voice" over following length limits
- It doesn't understand that multiple quotes should be ONE quote
- It loops through the input extracting phrases

---

## Impact

| Scenario | User Input Tokens | user_quote Length | Total Output | Result |
|----------|-------------------|-------------------|--------------|--------|
| Normal conversation | 50-100 | 50-100 chars | 2,000-4,000 tokens | ✅ Success |
| Long input | 400-600 | 23,000+ chars | 6,132 tokens | ❌ MAX_TOKENS |
| Extreme rambling | 600+ | 23,000+ chars | 6,132 tokens | ❌ MAX_TOKENS |

**Success Rate Impact**:
- Normal scenarios: 90-95% success
- Long input scenarios: 0% success
- **Overall**: 76-84% success (down from potential 95%+)

---

## Solutions

### Option 1: Remove user_quote Field Entirely

**Approach**: Don't ask for user quotes at all

**Schema Change**:
```javascript
entry: {
  properties: {
    context: { ... },
    content: { ... },
    // user_quote: REMOVED
    ai_observation: { ... },
    sentiment: { ... }
  }
}
```

**Pros**:
- Eliminates the looping issue completely
- Saves 5,000+ tokens per turn
- Simpler schema

**Cons**:
- Loses user's exact words (which can be valuable)
- Less personal/authentic entries

**Expected Result**: 95%+ success rate

---

### Option 2: Make user_quote Optional + Skip for Long Inputs

**Approach**: Only include `user_quote` for short inputs

**Implementation**:
```javascript
function getBrevityOverride(userInput, messages) {
  const userInputTokens = estimateTokens(userInput);
  
  if (userInputTokens > 200) {  // ~800 chars
    return `
🚨 BREVITY MODE ACTIVATED 🚨

**CRITICAL**: DO NOT include "user_quote" field in entries. 
Set it to empty string "" or omit entirely.

The user input is too long to quote safely.
`;
  }
  
  return '';
}
```

**Schema Change**:
```javascript
user_quote: { 
  type: "string",
  description: "OPTIONAL: 1 sentence (20 words MAX). Omit if user input is long.",
  maxLength: 150
}
// Remove from required array
```

**Pros**:
- Keeps user_quote for short inputs (where it works)
- Eliminates looping for long inputs
- Flexible solution

**Cons**:
- Inconsistent (sometimes has quotes, sometimes doesn't)
- Gemini might still include it anyway

**Expected Result**: 90-95% success rate

---

### Option 3: Post-Process Truncation

**Approach**: Truncate `user_quote` after generation

**Implementation**:
```javascript
function truncateUserQuotes(response) {
  if (response.area_actions) {
    response.area_actions.forEach(action => {
      if (action.entry?.user_quote && action.entry.user_quote.length > 150) {
        // Find first sentence
        const firstSentence = action.entry.user_quote.split(/[.!?]/)[0];
        action.entry.user_quote = firstSentence.substring(0, 150) + '...';
        console.warn(`   ⚠️  Truncated user_quote from ${action.entry.user_quote.length} to 150 chars`);
      }
    });
  }
  return response;
}
```

**Pros**:
- Keeps the field
- Prevents MAX_TOKENS errors
- Works regardless of Gemini's behavior

**Cons**:
- Wastes tokens during generation
- Still hits MAX_TOKENS before we can truncate
- Doesn't actually solve the problem

**Expected Result**: 76-84% success rate (no improvement)

---

## Recommended Solution

### Hybrid: Option 2 (Skip for Long Inputs) + Option 1 Fallback

**Implementation**:

1. **Update Brevity Mode**:
```javascript
if (userInputTokens > 200) {
  return `
🚨 BREVITY MODE: LONG INPUT DETECTED 🚨

**CRITICAL OVERRIDE**:
- DO NOT include "user_quote" in any entries
- If you must capture user's words, put them in "content" field (1 sentence max)
- entry.user_quote: SKIP THIS FIELD ENTIRELY

User input is ${userInputTokens} tokens. You MUST be extremely concise.
`;
}
```

2. **Make user_quote Optional in Schema**:
```javascript
user_quote: { 
  type: "string",
  description: "OPTIONAL: Brief quote (20 words MAX). SKIP if user input is long.",
  maxLength: 150
}
// Remove from required fields
```

3. **Add Recovery Handler**:
```javascript
function handleMaxTokensError(data) {
  // ... existing recovery logic ...
  
  // If recovered, strip out user_quote fields
  if (recovered.area_actions) {
    recovered.area_actions.forEach(action => {
      if (action.entry?.user_quote) {
        delete action.entry.user_quote;
      }
    });
  }
  
  return { recovered: true, data: recovered };
}
```

**Expected Result**: 95%+ success rate

---

## Why This is So Hard

### Gemini's Fundamental Limitation

**Gemini cannot reliably follow field-level length constraints**, especially for:
1. Fields that ask for "user's exact words"
2. Long user inputs (>400 tokens)
3. Multiple quotes/phrases

**Root Cause**: Gemini's training prioritizes "capturing user intent" over "following length limits"

When asked to extract a quote from a 600-token rambling input, Gemini:
1. Identifies 20+ relevant phrases
2. Extracts all of them
3. Concatenates them into one field
4. Ignores the "5-10 words MAX" instruction

**This is a model behavior issue, not a prompt engineering issue.**

---

## Summary

**Problem**: `user_quote` field causes 23K+ character outputs for long inputs, hitting MAX_TOKENS

**Root Cause**: Gemini extracts and concatenates multiple quotes, ignoring length limits

**Impact**: 0% success on long input scenarios, 76-84% overall success

**Solution**: Skip `user_quote` field for inputs >200 tokens

**Expected Result**: 95%+ success rate

**Implementation Time**: 10 minutes

**Priority**: 🔴 CRITICAL - Must fix before production
