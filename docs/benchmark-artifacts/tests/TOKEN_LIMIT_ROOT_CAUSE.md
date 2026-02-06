# Token Limit Root Cause - FOUND!

**Date**: January 20, 2026  
**Issue**: MAX_TOKENS errors with 12K+ token responses  
**Root Cause**: **AI stuck in infinite loop repeating user_quote**

---

## The Smoking Gun

**File**: `results/debug/MAX_TOKENS_2026-01-20T01-54-40-156Z.txt`

**What happened**:
- User input: 2,528 characters (~632 tokens)
- AI response: 53,957 characters (~13,490 tokens)
- **The AI repeated the same text ~100 times in the `user_quote` field**

**The loop** (line 42 of debug file):
```
"user_quote": "My mom called yesterday asking about Thanksgiving plans and I haven't even thought that far ahead. I can barely think about next week. Oh and the kitchen renovation, we put that on hold obviously but every time I walk into that kitchen I'm reminded that it's not done and it's just another thing on the list of things I'm not dealing with. I feel like I'm dropping balls everywhere and I don't know which one to pick up first. Is this normal? Like, does everyone feel this overwhelmed or am I just bad at managing my life? My mom called yesterday asking about Thanksgiving plans and I haven't even thought that far ahead. I can barely think about next week. Oh and the kitchen renovation, we put that on hold obviously but every time I walk into that kitchen I'm reminded that it's not done and it's just another thing on the list of things I'm not dealing with. I feel like I'm dropping balls everywhere and I don't know which one to pick up first. Is this normal? Like, does everyone feel this overwhelmed or am I just bad at managing my life? My mom called yesterday asking about Thanksgiving plans and I haven't even thought that far ahead. I can barely think about next week. Oh and the kitchen renovation, we put that on hold obviously but every time I walk into that kitchen I'm reminded that it's not done and it's just another thing on the list of things I'm not dealing with. I feel like I'm dropping balls everywhere and I don't know which one to pick up first. Is this normal? Like, does everyone feel this overwhelmed or am I just bad at managing my life? [REPEATS ~100 TIMES]"
```

---

## Why This Happened

### 1. No Field Length Limits

**Current schema**:
```javascript
user_quote: { 
  type: "string", 
  description: "User's exact words (optional but valuable)" 
}
```

**Problem**: No `maxLength` constraint!

### 2. Gemini's Looping Behavior

When generating structured output with long string fields and no length limits, Gemini can get stuck in a repetition loop, especially with:
- Long user inputs
- Repetitive content
- No explicit stop signal

### 3. The Cascade Effect

1. AI tries to include user's full rambling quote
2. Hits some internal threshold
3. Starts repeating the same text
4. Continues until hitting `maxOutputTokens` limit
5. Response gets cut off with `MAX_TOKENS` error

---

## The Fix

### Add `maxLength` to All String Fields

```javascript
entry: {
  type: "object",
  properties: {
    timestamp: { type: "string" },
    context: { 
      type: "string", 
      description: "What prompted this entry",
      maxLength: 500  // ✅ ADD THIS
    },
    content: { 
      type: "string", 
      description: "The actual information to record (detailed, 2-3 sentences)",
      maxLength: 1000  // ✅ ADD THIS
    },
    user_quote: { 
      type: "string", 
      description: "User's exact words (optional but valuable)",
      maxLength: 200  // ✅ ADD THIS - CRITICAL!
    },
    ai_observation: { 
      type: "string", 
      description: "Your insights (optional but valuable)",
      maxLength: 300  // ✅ ADD THIS
    },
    sentiment: { 
      type: "string",
      maxLength: 50  // ✅ ADD THIS
    }
  },
  required: ["context", "content"]
}
```

### Why This Works

1. **Prevents loops**: AI can't repeat endlessly
2. **Forces conciseness**: AI must summarize, not copy
3. **Predictable token usage**: Max tokens per field = predictable total
4. **Better quality**: Short quotes are more impactful

---

## Token Budget with Limits

**Per area_action entry** (with maxLength):
- context: 500 chars = ~125 tokens
- content: 1,000 chars = ~250 tokens
- user_quote: 200 chars = ~50 tokens
- ai_observation: 300 chars = ~75 tokens
- sentiment: 50 chars = ~13 tokens
- **Total per entry**: ~513 tokens max

**For 7 area_actions**:
- 7 × 513 = ~3,591 tokens max
- Plus spoken_text (200 tokens)
- Plus internal_notes (100 tokens)
- Plus HTML (5,000 tokens)
- **Total**: ~8,891 tokens (fits in 12K limit!)

---

## Why Gemini Doesn't Respect Prompt Token Budgets

**We said in the prompt**:
```
⚠️  **TOKEN BUDGET - CRITICAL**:
- user_quote: 50 tokens max
```

**But Gemini ignored it** because:
1. **Prompt guidance is soft** - suggestions, not hard limits
2. **Schema constraints are hard** - enforced by API
3. **Gemini prioritizes schema** over prompt instructions
4. **No `maxLength` = no limit** in Gemini's view

**Lesson**: Use schema constraints, not prompt instructions, for hard limits.

---

## Other Models

### Does This Happen with Other Models?

**GPT-4**: Less likely - better at following prompt instructions  
**Claude**: Less likely - more conservative with repetition  
**Gemini**: **More likely** - aggressive with structured output, needs explicit schema limits

**Why Gemini**: Gemini's structured output is very literal - it follows the schema exactly, including the lack of limits.

---

## Testing the Fix

**Before** (no maxLength):
- Turn 1: 12,278 tokens (MAX_TOKENS)
- Turn 2: 49,137 tokens (MAX_TOKENS)
- Success rate: 0%

**After** (with maxLength):
- Expected: ~3,000-8,000 tokens per response
- Expected success rate: 95%+

---

## Implementation

### 1. Add maxLength to Schema ✅

```javascript
const FULL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        spoken_text: { 
          type: "string",
          maxLength: 1000  // ~250 tokens
        },
        emotional_tone: { 
          type: "string",
          maxLength: 50
        }
      },
      required: ["spoken_text", "emotional_tone"]
    },
    internal_notes: {
      type: "object",
      properties: {
        content: { 
          type: "string",
          maxLength: 500  // ~125 tokens
        },
        emotional_state: { 
          type: "string",
          maxLength: 100
        },
        key_context: { 
          type: "string",
          maxLength: 300
        },
        watch_for: { 
          type: "string",
          maxLength: 300
        }
      },
      required: ["content"]
    },
    area_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: [...] },
          path: { type: "string", maxLength: 200 },
          entry: {
            type: "object",
            properties: {
              context: { type: "string", maxLength: 500 },
              content: { type: "string", maxLength: 1000 },
              user_quote: { type: "string", maxLength: 200 },  // CRITICAL
              ai_observation: { type: "string", maxLength: 300 },
              sentiment: { type: "string", maxLength: 50 }
            },
            required: ["context", "content"]
          }
        },
        required: ["action", "path", "entry"]
      }
    },
    artifact_action: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...] },
        artifact_type: { type: "string", enum: [...] },
        artifact_id: { type: "string", maxLength: 100 },
        html: { 
          type: "string",
          maxLength: 30000  // ~7,500 tokens
        }
      },
      required: ["action"]
    }
  },
  required: ["user_response", "internal_notes", "area_actions", "artifact_action"]
};
```

### 2. Update Prompt Guidance

Remove soft token budgets, replace with:
```
⚠️  FIELD LENGTH LIMITS (ENFORCED BY SCHEMA):
- user_quote: 200 characters max (1-2 sentences)
- content: 1,000 characters max (2-3 sentences)
- html: 30,000 characters max (200-500 lines)

These are HARD LIMITS. Response will fail if exceeded.
```

---

## Summary

**Root Cause**: No `maxLength` in schema → Gemini loops on `user_quote` field → 12K+ token responses

**Fix**: Add `maxLength` to all string fields in schema

**Expected Result**: 95%+ success rate, predictable token usage

**Time to Implement**: 10 minutes

**Priority**: 🔴 Critical - this is the actual bug
