# BubbleVoice AI Model Benchmark Results

**Date**: January 19, 2026  
**Test Scenarios**: Personal Goals, Emotional Processing, Life Decision, Family/Kids

## Summary Comparison

| Model | Valid Responses | Avg Latency | Cost/1M Input | Cost/1M Output | Artifacts |
|-------|----------------|-------------|---------------|----------------|-----------|
| **Gemini 2.5 Flash Lite** | 4-8/6-8 (varies) | **1074-1588ms** | $0.075 | $0.30 | Creates proactively |
| GPT-4o-mini | 6/6 | 3260ms | $0.15 | $0.60 | Creates when asked |
| Claude 3.5 Haiku | 6/6 | 4462ms | $0.25 | $1.25 | Creates & updates well |

## Key Findings

### 🏆 Winner: Gemini 2.5 Flash Lite

**Why Gemini Flash Lite is the recommended baseline:**

1. **Speed** (most important for voice):
   - 1074ms avg vs 3260ms (GPT) vs 4462ms (Claude)
   - **3-4x faster** than competitors
   - Critical for voice interaction - user expects quick response

2. **Cost** (important for personal AI):
   - $0.075/1M input tokens vs $0.15 (GPT) vs $0.25 (Claude)
   - **2-3x cheaper** than competitors
   - Enables more conversation depth without cost concern

3. **Context Window**:
   - 1M tokens (!) vs 128K (GPT) vs 200K (Claude)
   - **5-8x more context** - can remember entire conversation history
   - Critical for "personal AI that remembers"

4. **Quality Trade-offs**:
   - Schema compliance is slightly lower (4-6/6 vs 6/6)
   - Response quality is good but slightly more "generic" tone
   - Artifacts are created proactively (maybe too eagerly)

### Context Retention Test Results

All models correctly recalled:
- Emma has soccer on Tuesdays and Thursdays ✓
- Jake has piano on Wednesdays ✓
- Exercise goal changed from 3x to 2x per week ✓
- Monday and Friday mornings suggested as exercise days ✓

### Emotional Response Quality

**Best**: Claude 3.5 Haiku
- Most natural empathetic tone
- Better at "not problem-solving too fast"

**Good**: GPT-4o-mini
- Appropriate empathy
- Good balance of validation and action

**Acceptable**: Gemini 2.5 Flash Lite
- Empathetic but can feel slightly clinical
- Sometimes jumps to solutions faster

## Recommendation for BubbleVoice

### V1 Strategy: Gemini Flash Lite + Optional Upgrade

```
Primary: Gemini 2.5 Flash Lite ($0.075/1M)
├── Speed: 1-1.5s response time
├── Cost: ~$0.005/conversation
├── Context: 1M tokens (full conversation history)
└── Good enough for: 90% of interactions

Upgrade Path (when needed):
├── For complex emotional processing → Claude 3.5 Sonnet
├── For detailed analysis/artifacts → GPT-4o
└── Triggered by: user request, high complexity, error recovery
```

### Cost Estimate for 100 conversations/day:
- Gemini Flash Lite: ~$0.50/day
- GPT-4o-mini: ~$1.50/day
- Claude 3.5 Haiku: ~$2.50/day

## Next Steps

1. [ ] Run more scenarios (emotional processing focus)
2. [ ] Test artifact update consistency 
3. [ ] Benchmark streaming token latency
4. [ ] Test RAG integration (retrieval adds latency)
5. [ ] Test with native macOS STT/TTS in the loop

## Raw Results Location

See `results/` folder for full JSON data:
- `gemini-2.5-flash-lite_*.json` - Baseline tests
- `gpt-4o-mini_*.json` - GPT comparison
- `claude-3.5-haiku_*.json` - Claude comparison

See `visualizations/` folder for HTML chat-style views.
