# Bubble Voice: Conversation Cost Calculator

**Model: Gemini 2.5 Flash-Lite (Default)**
- Input: $0.10 per 1M tokens
- Output: $0.40 per 1M tokens
- Context Window: 1M tokens

---

## Token Estimation Methodology

### Rule of Thumb:
- **English text**: ~0.75 tokens per word (or ~1.3 words per token)
- **Spoken conversation**: ~150 words per minute (average speaking pace)
- **Tokens per minute of speech**: ~112 tokens (150 words × 0.75)

### Per Turn Breakdown (15 seconds each):

```
USER TURN (15 seconds):
- Speaking time: 15 seconds
- Words spoken: ~37 words (150 words/min ÷ 4)
- Tokens: ~28 tokens

AI TURN (15 seconds):
- Speaking time: 15 seconds  
- Words spoken: ~37 words
- Tokens: ~28 tokens

TOTAL PER CYCLE (30 seconds): ~56 tokens
CYCLES PER MINUTE: 2 cycles
CONVERSATION TOKENS PER MINUTE: ~112 tokens
```

---

## Static Context (Sent Every Request)

### System Prompt & Instructions:
```
Tool instructions:        200 lines × ~10 words/line = 2,000 words = ~1,500 tokens
User context/profile:     100 lines × ~10 words/line = 1,000 words = ~750 tokens
Indexed RAG context:      100 lines × ~10 words/line = 1,000 words = ~750 tokens

TOTAL STATIC CONTEXT: ~3,000 tokens per request
```

### With Context Caching (Gemini):
Gemini supports **context caching** - static prefix is cached and costs **90% less** on subsequent requests:
```
First request:  3,000 tokens at $0.10/M = $0.0003
Next requests:  3,000 tokens at $0.01/M = $0.00003 (cached)
```

**Assumption for calculations below:** We'll use **cached pricing** for static context after the first turn.

---

## Conversation Growth Per Minute

### Scenario: 1 Minute of Conversation (4 cycles)

**Turn 1 (0-15s):**
```
Input tokens:
- Static context: 3,000 tokens (full price, first request)
- User speech: 28 tokens
Total input: 3,028 tokens

Output tokens:
- AI response: 28 tokens
- Structured output (bubbles): ~50 tokens
Total output: 78 tokens

Cost:
- Input: 3,028 × $0.10/1M = $0.0003028
- Output: 78 × $0.40/1M = $0.0000312
Turn 1 cost: $0.0003340
```

**Turn 2 (15-30s):**
```
Input tokens:
- Static context: 3,000 tokens (CACHED at $0.01/M)
- Conversation history: 106 tokens (turn 1 user + AI)
- User speech: 28 tokens
Total input: 3,134 tokens

Output tokens:
- AI response: 28 tokens
- Structured output (bubbles): ~50 tokens
Total output: 78 tokens

Cost:
- Input (cached): 3,000 × $0.01/1M = $0.00003
- Input (new): 134 × $0.10/1M = $0.0000134
- Output: 78 × $0.40/1M = $0.0000312
Turn 2 cost: $0.0000746
```

**Turn 3 (30-45s):**
```
Input tokens:
- Static context: 3,000 tokens (CACHED)
- Conversation history: 212 tokens (turns 1-2)
- User speech: 28 tokens
Total input: 3,240 tokens

Output tokens: 78 tokens

Cost:
- Input (cached): 3,000 × $0.01/1M = $0.00003
- Input (new): 240 × $0.10/1M = $0.000024
- Output: 78 × $0.40/1M = $0.0000312
Turn 3 cost: $0.0000852
```

**Turn 4 (45-60s):**
```
Input tokens:
- Static context: 3,000 tokens (CACHED)
- Conversation history: 318 tokens (turns 1-3)
- User speech: 28 tokens
Total input: 3,346 tokens

Output tokens: 78 tokens

Cost:
- Input (cached): 3,000 × $0.01/1M = $0.00003
- Input (new): 346 × $0.10/1M = $0.0000346
- Output: 78 × $0.40/1M = $0.0000312
Turn 4 cost: $0.0000958
```

---

## Summary: Cost Per Minute

### First Minute (includes initial context load):
```
Turn 1: $0.0003340
Turn 2: $0.0000746
Turn 3: $0.0000852
Turn 4: $0.0000958

TOTAL FIRST MINUTE: $0.0005896 (~0.06 cents)
```

### Subsequent Minutes (all context cached):
```
Average per turn: ~$0.000085
4 turns per minute: $0.00034

TOTAL PER MINUTE (after first): $0.00034 (~0.034 cents)
```

---

## Conversation Growth Analysis

### Token Growth Per Minute:
```
Conversation history grows by: ~112 tokens/minute
(56 tokens per cycle × 2 cycles)

After 10 minutes: ~1,120 conversation tokens
After 30 minutes: ~3,360 conversation tokens
After 60 minutes: ~6,720 conversation tokens
```

### Input Token Breakdown Over Time:

| Time | Static Context | Conversation History | Total Input | Cost/Turn (avg) |
|------|----------------|---------------------|-------------|-----------------|
| 1 min | 3,000 (cached) | ~112 tokens | ~3,112 | $0.00009 |
| 5 min | 3,000 (cached) | ~560 tokens | ~3,560 | $0.00010 |
| 10 min | 3,000 (cached) | ~1,120 tokens | ~4,120 | $0.00011 |
| 30 min | 3,000 (cached) | ~3,360 tokens | ~6,360 | $0.00015 |
| 60 min | 3,000 (cached) | ~6,720 tokens | ~9,720 | $0.00020 |

---

## Cost Projections

### Per Conversation Length:

| Duration | Turns | Total Input Tokens | Total Output Tokens | Total Cost |
|----------|-------|-------------------|---------------------|------------|
| 1 min | 4 | ~12,500 | ~312 | **$0.00059** |
| 5 min | 20 | ~70,000 | ~1,560 | **$0.0013** |
| 10 min | 40 | ~150,000 | ~3,120 | **$0.0027** |
| 30 min | 120 | ~500,000 | ~9,360 | **$0.0087** |
| 60 min | 240 | ~1,100,000 | ~18,720 | **$0.018** |

### Monthly Cost Estimates:

**Scenario 1: Light User**
- 5 conversations/day
- 10 minutes each
- Daily: 5 × $0.0027 = **$0.0135/day**
- Monthly: **$0.41/month**

**Scenario 2: Regular User**
- 10 conversations/day
- 15 minutes each
- Daily: 10 × $0.004 = **$0.04/day**
- Monthly: **$1.20/month**

**Scenario 3: Heavy User**
- 20 conversations/day
- 20 minutes each
- Daily: 20 × $0.0055 = **$0.11/day**
- Monthly: **$3.30/month**

**Scenario 4: Power User**
- 30 conversations/day
- 30 minutes each
- Daily: 30 × $0.0087 = **$0.26/day**
- Monthly: **$7.80/month**

---

## Structured Output Impact

### Current Calculation Includes:
```
Per AI turn:
- Spoken response: ~28 tokens
- Bubbles (structured output): ~50 tokens
  Example: 3 bubbles × ~15 tokens each
  {
    "bubbles": [
      {"text": "What about X?", "type": "question"},
      {"text": "Consider Y", "type": "suggestion"},
      {"text": "Remember Z", "type": "reminder"}
    ]
  }

Total output per turn: ~78 tokens
```

### If Adding UI Artifacts:
```
Simple artifact (chart data): +200 tokens
Complex artifact (table): +500 tokens
HTML artifact: +1,000 tokens

Impact on 10-min conversation with 2 artifacts:
- Without artifacts: $0.0027
- With 2 simple artifacts: $0.0027 + (400 × $0.40/1M) = $0.00286
- With 2 complex artifacts: $0.0027 + (1,000 × $0.40/1M) = $0.00310
```

**Artifact cost is minimal** because output tokens are cheap relative to the base conversation.

---

## Context Window Limits

### When Do We Hit the 1M Token Limit?

```
Static context: 3,000 tokens (constant)
Conversation growth: 112 tokens/minute

Time to fill 1M context:
(1,000,000 - 3,000) / 112 = ~8,902 minutes = ~148 hours

Practically: You'll NEVER hit the limit in a single conversation.
```

### Realistic Limit (Performance/Cost):
```
Recommended max conversation length: 60-90 minutes
At 60 minutes:
- Total context: ~9,720 tokens
- Cost: $0.018
- Still only ~1% of context window used
```

---

## Comparison: Gemini 2.5 Flash-Lite vs Alternatives

### 10-Minute Conversation Cost:

| Model | Input $/M | Output $/M | Cost/10min | Notes |
|-------|-----------|------------|------------|-------|
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | **$0.0027** | Best value |
| Gemini 2.0 Flash | $0.30 | $2.50 | $0.0084 | 3x more expensive |
| GPT-5-nano | $0.05 | $0.40 | $0.0020 | Cheaper but 128K limit |
| GPT-5-mini | $0.25 | $2.00 | $0.0070 | 2.6x more expensive |
| GPT-5.2 | $1.75 | $14.00 | $0.0488 | 18x more expensive |

### When to Upgrade:

**Stick with Flash-Lite when:**
- Conversation < 30 minutes
- Standard reasoning tasks
- Budget is priority

**Upgrade to GPT-5.2 when:**
- Complex multi-step reasoning needed
- Critical structured output (strict mode)
- Coding/technical tasks
- User is on premium tier

---

## Optimization Strategies

### 1. Context Caching (Already Included)
```
Savings: ~90% on static context after first turn
Impact: Reduces cost from $0.0009 to $0.0006 per minute
```

### 2. Compress Old Conversation History
```
After 30 minutes, summarize first 20 minutes:
- Original: 2,240 tokens
- Summarized: ~300 tokens
- Savings: ~1,940 tokens input per turn
- Cost reduction: ~$0.0002 per turn
```

### 3. Lazy-Load RAG Context
```
Instead of: 100 lines (750 tokens) every turn
Use: Only inject when tool call triggers RAG
Savings: 750 tokens × 4 turns = 3,000 tokens/minute
Cost reduction: ~$0.0003 per minute
```

### 4. Batch Bubble Generation
```
Instead of: Generating bubbles every turn
Use: Generate 5 bubbles every 5 turns
Reduces structured output overhead by 80%
Cost reduction: ~$0.0001 per minute
```

---

## Real-World Cost Examples

### Example 1: Morning Planning Session
```
Duration: 15 minutes
Turns: 60
Topics: Review calendar, set priorities, create tasks
Artifacts: 2 task lists (400 tokens each)

Cost breakdown:
- Conversation: $0.004
- Artifacts: $0.0003
Total: $0.0043 (~0.4 cents)
```

### Example 2: Deep Work Session
```
Duration: 45 minutes
Turns: 180
Topics: Brainstorming, problem-solving, note-taking
Artifacts: 5 note cards (300 tokens each)

Cost breakdown:
- Conversation: $0.012
- Artifacts: $0.0006
Total: $0.0126 (~1.3 cents)
```

### Example 3: Daily Check-ins (30 days)
```
Per day: 3 conversations × 10 minutes = $0.0081
Monthly: $0.24

This is INCREDIBLY cheap for unlimited AI conversations.
```

---

## Revenue Model Implications

### Free Tier:
```
Allowance: 100 minutes/month
Cost to you: 100 × $0.00034 = $0.034 (~3.4 cents)
Margin: Can afford to give away for user acquisition
```

### Paid Tier ($9.99/month):
```
Allowance: Unlimited (assume 1,000 min/month average)
Cost to you: 1,000 × $0.00034 = $0.34 (~34 cents)
Margin: $9.65 profit per user (96.6% margin!)
```

### Premium Tier ($29.99/month):
```
Allowance: Unlimited + GPT-5.2 access
Assume: 500 min Flash-Lite + 100 min GPT-5.2
Cost to you: 
  - Flash-Lite: 500 × $0.00034 = $0.17
  - GPT-5.2: 100 × $0.0020 = $0.20
  - Total: $0.37
Margin: $29.62 profit per user (98.8% margin!)
```

**Conclusion: LLM costs are NOT your bottleneck. You can be very generous with usage limits.**

---

## Key Takeaways

1. **Cost per minute is TINY**: ~$0.00034 with Gemini 2.5 Flash-Lite
2. **Context caching is critical**: Saves 90% on static context
3. **1M context window is overkill**: Even 60-min conversations use <1%
4. **Structured output is cheap**: Bubbles/artifacts add minimal cost
5. **You can afford generous free tiers**: 100 min/month costs you 3.4 cents
6. **Profit margins are huge**: 96%+ margin even at $9.99/month

## Recommendation

**Use Gemini 2.5 Flash-Lite as default** with these settings:
- Enable context caching for static prompts
- Lazy-load RAG context (only when needed)
- Compress conversation history after 30 minutes
- Reserve GPT-5.2 for premium users or complex tasks

**This gives you:**
- Excellent quality for 99% of use cases
- 1M context window (no summarization needed for hours)
- ~$0.34 per 1,000 minutes
- Ability to offer very generous free/paid tiers
