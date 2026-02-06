# BubbleVoice Test Suite

## Overview

Testing framework to compare **SIMPLE** vs **FULL** context management approaches.

```
tests/
├── lib/
│   ├── knowledge-base-manager.js  # Pre-populated user knowledge
│   ├── simple-runner.js           # Simple approach (~4K tokens)
│   ├── full-runner.js             # Full approach (~8-10K tokens)
│   ├── vector-search-mock.js      # Keyword-based mock (no embeddings)
│   └── test-harness.js            # Main test runner
├── scenarios/
│   ├── 01-basic-recall.js         # Recall existing knowledge
│   ├── 02-multi-topic-rambling.js # Multiple topics at once
│   ├── 03-stt-errors.js           # Transcription errors
│   ├── 04-new-topic.js            # Introducing new topics
│   ├── 05-emotional-complexity.js # Mixed emotions
│   ├── 06-summary-request.js      # "What have we discussed?"
│   ├── 07-vague-followups.js      # "Yeah", "So what should I do?"
│   └── 08-repetition-prevention.js # Don't repeat yourself
├── knowledge-base/                # Generated user data
└── results/                       # Test outputs
```

---

## Approaches Compared

### SIMPLE (~4,000 tokens/turn)
```
- System prompt (~1,000 tokens)
- Areas tree (~300 tokens)
- Conversation history with operations (~2,000 tokens)
- Single vector search on current input (~500 tokens)
```

**NO**: AI notes, multi-query search, priority system, retrieved context

### FULL (~8,000-10,000 tokens/turn)
```
- System prompt (~1,300 tokens)
- AI Notes (hidden, top 500 lines, ~1,500 tokens)
- Knowledge tree (~300 tokens)
- Vector matched areas - recent entries (~500 tokens)
- Vector matched areas - summaries (~500 tokens)
- Vector matched chunks (~1,000 tokens)
- Vector matched files (~500 tokens)
- Conversation history (~2,000 tokens)
```

**YES**: AI notes, multi-query search (3 queries), full context injection

---

## Knowledge Base

Pre-populated with a realistic user's accumulated knowledge:

| Area | Topics |
|------|--------|
| **Family/Emma_School** | Reading comprehension struggles, graphic novel breakthrough, teacher meeting |
| **Family/Max_Activities** | Soccer season, games, schedule conflicts |
| **Work/Startup** | Fundraising, investor meetings, hiring, product dev |
| **Personal_Growth/Exercise_Goals** | Running 3x/week goal, struggling, one good week |
| **Personal_Growth/Mental_Health** | Therapy with Dr. Chen, guilt, stress |
| **Home/Kitchen_Renovation** | $45K quote, on hold due to uncertainty |
| **Relationships/Partner** | Jordan, date nights, quality time needed |

---

## Running Tests

### Setup
```bash
cd benchmark-artifacts/tests
export GOOGLE_API_KEY="your-api-key"
```

### Run All Tests (Both Approaches)
```bash
node lib/test-harness.js --scenario=all
```

### Run Single Scenario (Both Approaches)
```bash
node lib/test-harness.js --scenario=01-basic-recall
```

### Run Single Approach
```bash
node lib/test-harness.js --approach=simple --scenario=all
node lib/test-harness.js --approach=full --scenario=01-basic-recall
```

---

## Test Scenarios

### 01-basic-recall.js
**Goal**: Test recall of existing knowledge  
**Inputs**: "How's Emma's reading?", "Remind me about fundraising", etc.  
**Expected**: AI references specific details from knowledge base

### 02-multi-topic-rambling.js
**Goal**: Handle multiple topics in one breath  
**Inputs**: "Emma had a good day but I'm exhausted and the startup..."  
**Expected**: AI acknowledges all topics, prioritizes or asks

### 03-stt-errors.js
**Goal**: Handle transcription errors  
**Inputs**: "reading compression", "dock or chen", "saucer" (soccer)  
**Expected**: AI infers correct meaning from context

### 04-new-topic.js
**Goal**: Recognize genuinely new topics  
**Inputs**: MBA consideration, mom's health issues  
**Expected**: AI creates areas for significant new topics, ignores casual mentions

### 05-emotional-complexity.js
**Goal**: Handle mixed emotions  
**Inputs**: "Proud but frustrated but guilty but hopeful"  
**Expected**: AI validates all emotions, doesn't oversimplify

### 06-summary-request.js
**Goal**: Summarize past conversations  
**Inputs**: "Summary of Emma's reading?", "Show me running progress"  
**Expected**: AI provides comprehensive, specific summaries with artifacts

### 07-vague-followups.js
**Goal**: Understand vague questions using context  
**Inputs**: "So what should I do?", "Yeah", "hmm"  
**Expected**: AI uses context, doesn't ask "about what?" every time

### 08-repetition-prevention.js
**Goal**: Avoid repeating itself  
**Inputs**: Conversation that circles back to same topics  
**Expected**: AI builds on previous discussion, doesn't rehash

---

## Evaluation Metrics

| Metric | Description |
|--------|-------------|
| **Latency** | Average response time in ms |
| **Success Rate** | % of turns that completed without error |
| **Area Actions** | Number of create/append/update operations |
| **Artifacts** | Number of HTML artifacts generated |
| **AI Notes** | Number of internal notes generated (FULL only) |
| **Vector Time** | Time spent on vector search |

---

## Expected Results

### Where SIMPLE should win:
- ⚡ **Latency**: Less context = faster
- 💰 **Cost**: Fewer tokens = cheaper
- 🎯 **Simple scenarios**: Basic recall, direct questions

### Where FULL should win:
- 🧠 **Repetition prevention**: AI notes track what was said
- 🔍 **Complex context**: Multi-query catches more
- 📝 **Summary requests**: More context = better summaries
- 💭 **Vague questions**: Better context inference

### Unknown (need to test):
- Do AI notes actually help?
- Is multi-query worth the overhead?
- Does FULL accuracy justify the latency cost?

---

## Adding New Scenarios

Create a new file in `scenarios/`:

```javascript
// scenarios/09-my-test.js
module.exports = {
  name: 'My Test Name',
  description: 'What this tests',
  
  steps: [
    {
      user_input: "What the user says",
      expected: {
        should_reference: ['keyword1', 'keyword2'],
        should_create_area: false,
        emotional_tone: 'supportive'
      }
    },
    // ... more steps
  ]
};
```

Then run:
```bash
node lib/test-harness.js --scenario=09-my-test
```

---

## Results Output

Results are saved to `results/test_run_[timestamp]/`:
- `raw_results.json` - Full JSON data
- `REPORT.md` - Human-readable markdown report

---

## TODO

- [ ] Replace mock vector search with real embeddings
- [ ] Add automated evaluation (not just manual review)
- [ ] Add scoring system for response quality
- [ ] Add latency breakdown (API vs vector vs context assembly)
- [ ] Add token counting per section
