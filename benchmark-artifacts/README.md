# BubbleVoice Artifact Generation Benchmarks

**Created:** January 19, 2026  
**Purpose:** Test AI models on conversation-based personal artifact generation

---

## What We're Testing

Can AI models reliably:
1. Respond to personal conversations appropriately
2. Generate structured artifacts (JSON) when requested
3. Edit existing artifacts based on user instructions
4. Maintain internal notes without exposing them to user
5. Preserve user edits when updating artifacts

---

## Folder Structure

```
benchmark-artifacts/
├── scenarios/           # Test conversation sequences
│   └── *.json          # Each scenario = list of user turns
├── results/            # Raw outputs from model runs
│   └── {model}_{scenario}_{timestamp}/
├── visualizations/     # HTML visualizations of runs
│   └── *.html
├── lib/                # Shared code
│   ├── runner.js       # Benchmark runner
│   ├── models.js       # Model API configurations
│   └── visualizer.js   # Generate HTML visualizations
└── artifacts/          # Generated artifacts from runs
    └── {run_id}/
```

---

## Models Under Test

| Model | Provider | Model ID | Structured Output | Cost/1M tokens |
|-------|----------|----------|-------------------|----------------|
| **Gemini 2.0 Flash** | Google | `gemini-2.0-flash` | JSON Schema ✅ | $0.10 in / $0.40 out |
| **Gemini 2.0 Flash Lite** | Google | `gemini-2.0-flash-lite` | JSON Schema ✅ | $0.075 in / $0.30 out |
| **Gemini 1.5 Flash** | Google | `gemini-1.5-flash` | JSON Schema ✅ | $0.075 in / $0.30 out |
| **GPT-4o** | OpenAI | `gpt-4o` | response_format ✅ | $2.50 in / $10 out |
| **GPT-4o-mini** | OpenAI | `gpt-4o-mini` | response_format ✅ | $0.15 in / $0.60 out |
| **Claude 3.5 Sonnet** | Anthropic | `claude-3-5-sonnet-20241022` | Tool use ✅ | $3 in / $15 out |
| **Claude 3.5 Haiku** | Anthropic | `claude-3-5-haiku-20241022` | Tool use ✅ | $0.80 in / $4 out |

**Baseline:** Gemini 2.0 Flash Lite (cheapest with good structured output)

---

## Test Scenario Format

Each scenario is a JSON file with conversation turns:

```json
{
  "scenario_id": "personal_goals_001",
  "description": "User discusses exercise goals over multiple turns",
  "turns": [
    {
      "turn_id": 1,
      "user_says": "I've been thinking about getting more exercise but I keep failing",
      "expected_behavior": "acknowledge, ask clarifying questions, no artifact yet"
    },
    {
      "turn_id": 2,
      "user_says": "Yeah, I want to exercise 3 times a week but the kids' schedule makes it hard",
      "expected_behavior": "empathize, maybe suggest creating a goal artifact"
    },
    {
      "turn_id": 3,
      "user_says": "Can you make a simple goal tracker for this?",
      "expected_behavior": "create goal_tracker artifact with JSON"
    },
    {
      "turn_id": 4,
      "user_says": "Actually let's make it 2 times a week, that's more realistic",
      "expected_behavior": "update existing artifact, preserve structure"
    }
  ]
}
```

---

## Structured Output Schema

The AI must respond with this structure at every turn:

```json
{
  "user_response": {
    "text": "What I say to the user (spoken/displayed)",
    "tone": "empathetic|curious|supportive|neutral"
  },
  "internal_notes": {
    "observations": "What I noticed about the user's state (hidden from user)",
    "context_updates": "What to remember for future turns"
  },
  "artifact_action": {
    "action": "none|create|update",
    "artifact_id": "goal_tracker_001",
    "artifact_type": "goal_tracker|comparison_card|timeline|checklist|notes",
    "data": {
      // Artifact-specific JSON structure
    }
  }
}
```

---

## Metrics Tracked

| Metric | Description | Target |
|--------|-------------|--------|
| **Response Relevance** | Does response address user's actual concern? | 90%+ |
| **Artifact Accuracy** | Does artifact match user's request? | 95%+ |
| **Edit Preservation** | Are user edits preserved after AI updates? | 100% |
| **JSON Validity** | Is artifact JSON parseable and schema-valid? | 100% |
| **Internal Notes Quality** | Are notes useful and hidden from response? | 80%+ |
| **Tone Appropriateness** | Does tone match user's emotional state? | 85%+ |
| **Latency** | Time to first token | <500ms |

---

## How to Run

```bash
# Run all scenarios against all models
node lib/runner.js --all

# Run specific scenario against specific model
node lib/runner.js --scenario personal_goals_001 --model gemini-2.0-flash-lite

# Generate visualization for a run
node lib/visualizer.js --run results/gemini-2.0-flash-lite_personal_goals_001_20260119/
```

---

## Visualization Output

Each run generates an HTML visualization showing:
- User message bubbles (left, blue)
- AI response bubbles (right, green)
- Internal notes (collapsed, gray, expandable)
- Artifact panel (shows current artifact state, diff from previous)
- Metrics summary at bottom

---

## Next Steps

1. [ ] Create test scenarios (5-10 realistic conversations)
2. [ ] Build runner.js with all model APIs
3. [ ] Build visualizer.js for HTML output
4. [ ] Run baseline tests on Gemini Flash Lite
5. [ ] Compare across models
6. [ ] Document findings
