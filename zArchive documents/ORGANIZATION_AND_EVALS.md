# Bubble Voice - Organization System & Evaluation Framework

**Created:** 2026-01-16  
**Purpose:** Define organization/hierarchy for user content and outline self-running evaluation experiments.

---

## 📋 The Two Problems

1. **Organization Problem:** How does the user find/navigate their stuff?
2. **Evaluation Problem:** How do we know if changes improve quality?

Both need simple, clever solutions that work together.

---

## 🗂️ Organization Architecture

### The Simplest Thing That Works: Tags + Time + Type

Don't over-engineer. Three natural axes:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          ORGANIZATION MODEL                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   AXIS 1: TIME (Automatic)                                                                  │
│   ────────────────────────                                                                  │
│   Every item has a timestamp. Time-based views are free:                                    │
│   • Today / This Week / This Month                                                          │
│   • Timeline view                                                                           │
│   • "Last time we talked about X"                                                           │
│                                                                                              │
│   AXIS 2: TYPE (Automatic)                                                                  │
│   ────────────────────────                                                                  │
│   Each artifact has a type. Type-based filtering is free:                                   │
│   • All Charts / All Tables / All Images                                                    │
│   • Conversations vs Artifacts                                                              │
│   • Reminders / Notes / Decisions                                                           │
│                                                                                              │
│   AXIS 3: TAGS (AI-Suggested + User)                                                        │
│   ─────────────────────────────────                                                         │
│   Flexible categorization without rigid hierarchy:                                          │
│   • AI suggests tags from content                                                           │
│   • User can accept/reject/add                                                              │
│   • Tags are flat (not hierarchical)                                                        │
│   • Supports multiple tags per item                                                         │
│                                                                                              │
│   Example tags:                                                                              │
│   #work #health #family #project-alpha #finances #goals #decisions                          │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why Not Folders?

| Folders | Tags |
|---------|------|
| ❌ Item can only be in one place | ✅ Item can have multiple tags |
| ❌ User must decide where to put it | ✅ AI can suggest |
| ❌ Creates "where did I put it?" problem | ✅ Search by any tag |
| ❌ Deep hierarchies get lost | ✅ Flat, always visible |

### Implementation: Tag Schema

```typescript
interface Tag {
  id: string;
  name: string;              // Display name: "Work"
  slug: string;              // Normalized: "work"
  color?: string;            // Optional color coding
  aiGenerated: boolean;      // Was this suggested by AI?
  userConfirmed: boolean;    // Did user accept/create it?
  usageCount: number;        // How often used (for suggestions)
}

interface Taggable {
  id: string;
  tags: string[];            // Array of tag slugs
  suggestedTags?: string[];  // AI suggestions not yet confirmed
  timestamp: Date;
  type: string;              // Artifact type or "conversation"
}

// Tag suggestion happens automatically on save
async function suggestTags(content: string, existingTags: Tag[]): Promise<string[]> {
  const response = await llm.generate({
    messages: [{
      role: "system",
      content: `Given this content, suggest 1-3 relevant tags from the user's existing tags or suggest new ones.
      
Existing tags: ${existingTags.map(t => t.name).join(", ")}

Rules:
- Prefer existing tags when they fit
- Only suggest new tags if truly needed
- Keep tags simple (1-2 words)
- Return JSON array of tag slugs`
    }, {
      role: "user", 
      content: content.slice(0, 1000) // First 1000 chars is enough
    }],
    response_format: { type: "json_object" }
  });
  
  return JSON.parse(response).tags;
}
```

### Smart Collections (Virtual Folders)

Users can create saved searches that act like folders:

```typescript
interface SmartCollection {
  id: string;
  name: string;             // "Work Projects"
  query: CollectionQuery;
  icon?: string;
  pinned: boolean;
}

interface CollectionQuery {
  tags?: string[];          // Must have these tags
  excludeTags?: string[];   // Must NOT have these tags
  types?: string[];         // Artifact types to include
  timeRange?: {
    after?: Date;
    before?: Date;
    relative?: "today" | "week" | "month" | "year";
  };
  search?: string;          // Full-text search
}

// Example smart collections:
const defaultCollections: SmartCollection[] = [
  {
    name: "Recent",
    query: { timeRange: { relative: "week" } },
    pinned: true
  },
  {
    name: "Decisions",
    query: { types: ["comparison_card", "checklist"], tags: ["decision"] },
    pinned: true
  },
  {
    name: "Health Tracking",
    query: { tags: ["health", "fitness"] },
    pinned: false
  }
];
```

### UI: Left Sidebar

```
┌─────────────────────────────────────┐
│  🔍 Search...                       │
├─────────────────────────────────────┤
│  📅 RECENT                          │
│  ├── Today (3)                      │
│  ├── This Week (12)                 │
│  └── This Month (45)                │
├─────────────────────────────────────┤
│  ⭐ PINNED                          │
│  ├── Work Projects                  │
│  ├── Decisions                      │
│  └── Health Tracking                │
├─────────────────────────────────────┤
│  🏷️ TAGS                            │
│  ├── #work (28)                     │
│  ├── #health (15)                   │
│  ├── #project-alpha (8)             │
│  ├── #family (7)                    │
│  └── + 12 more...                   │
├─────────────────────────────────────┤
│  📊 BY TYPE                         │
│  ├── Conversations (89)             │
│  ├── Charts (12)                    │
│  ├── Tables (8)                     │
│  ├── Images (23)                    │
│  └── Reminders (5)                  │
└─────────────────────────────────────┘
```

---

## 🧪 Evaluation Framework

### The Problem with Evals

- Infinite permutations of inputs × models × prompts
- Subjective quality is hard to measure
- Human evaluation doesn't scale
- But AI evaluation can be biased

### Solution: Staged Evaluation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          EVALUATION PIPELINE                                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   STAGE 1: AUTOMATED CHECKS (Fast, Run Always)                                              │
│   ──────────────────────────────────────────────                                            │
│   • Schema validation - does output match expected type?                                    │
│   • Length constraints - within token limits?                                               │
│   • Required fields present?                                                                │
│   • No obvious errors (empty arrays, null required fields)?                                 │
│                                                                                              │
│   Pass rate: Should be 99%+                                                                  │
│   Action: Block deployment if <95%                                                          │
│                                                                                              │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│   STAGE 2: AI JUDGE (Fast, Run on Sample)                                                   │
│   ──────────────────────────────────────────                                                │
│   • Separate "judge" model scores outputs                                                   │
│   • Scores on predefined rubric                                                             │
│   • Compares A vs B (pairwise comparison)                                                   │
│   • Catches regressions quickly                                                             │
│                                                                                              │
│   Sample: 20% of test cases                                                                 │
│   Action: Flag for human review if score drops                                              │
│                                                                                              │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│   STAGE 3: HUMAN CALIBRATION (Slow, Run Periodically)                                       │
│   ─────────────────────────────────────────────────────                                     │
│   • Human rates sample of outputs                                                           │
│   • Calibrates AI judge accuracy                                                            │
│   • Identifies blind spots in automated checks                                              │
│   • Updates rubric based on findings                                                        │
│                                                                                              │
│   Frequency: Weekly, or after major changes                                                 │
│   Sample: 50-100 cases per session                                                          │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Defining "Good" - The Rubric

```typescript
interface EvalRubric {
  component: string;        // What we're evaluating
  dimensions: EvalDimension[];
}

interface EvalDimension {
  name: string;
  weight: number;           // 0-1, sum to 1
  criteria: string;         // What to look for
  scoringGuide: {
    1: string;              // Terrible
    3: string;              // Acceptable  
    5: string;              // Excellent
  };
}

const BUBBLE_RUBRIC: EvalRubric = {
  component: "bubbles",
  dimensions: [
    {
      name: "relevance",
      weight: 0.4,
      criteria: "Is the bubble related to what was just said?",
      scoringGuide: {
        1: "Completely off-topic or generic",
        3: "Somewhat related but obvious/shallow",
        5: "Highly relevant, adds value, surfaces non-obvious angle"
      }
    },
    {
      name: "conciseness",
      weight: 0.3,
      criteria: "Is it ≤7 words and well-phrased?",
      scoringGuide: {
        1: "Too long, awkward phrasing, or truncated mid-thought",
        3: "Right length but generic phrasing",
        5: "Crisp, natural, exactly right length"
      }
    },
    {
      name: "actionability",
      weight: 0.3,
      criteria: "Would tapping this lead somewhere useful?",
      scoringGuide: {
        1: "Dead end, no clear follow-up",
        3: "Could lead somewhere but vague",
        5: "Clear value in exploring this thread"
      }
    }
  ]
};

const ARTIFACT_RUBRIC: EvalRubric = {
  component: "artifact",
  dimensions: [
    {
      name: "correctness",
      weight: 0.4,
      criteria: "Does the data accurately reflect what was discussed?",
      scoringGuide: {
        1: "Wrong data, misunderstood intent",
        3: "Mostly correct with minor errors",
        5: "Perfectly captures the information"
      }
    },
    {
      name: "appropriate_type",
      weight: 0.3,
      criteria: "Is this the right component type for the content?",
      scoringGuide: {
        1: "Wrong type entirely (e.g., table for single metric)",
        3: "Works but another type might be better",
        5: "Perfect type choice for this content"
      }
    },
    {
      name: "completeness",
      weight: 0.3,
      criteria: "Does it include all relevant information?",
      scoringGuide: {
        1: "Missing key information",
        3: "Has the basics but misses details",
        5: "Complete, nothing important missing"
      }
    }
  ]
};
```

---

## 🤖 Self-Running Experiments

### The Clever Bit: AI Designs and Runs Experiments

Instead of testing every permutation, AI identifies the **minimum viable experiment set**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                    SELF-RUNNING EXPERIMENT SYSTEM                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   STEP 1: AI GENERATES TEST CASES                                                           │
│   ───────────────────────────────                                                           │
│                                                                                              │
│   Input: Component description + rubric + a few examples                                    │
│                                                                                              │
│   AI generates diverse test cases covering:                                                 │
│   • Happy path (typical usage)                                                              │
│   • Edge cases (empty input, very long input, etc.)                                         │
│   • Adversarial (confusing input, contradictions)                                           │
│   • Domain coverage (different topics the user might discuss)                               │
│                                                                                              │
│   Output: 20-50 test cases per component                                                    │
│                                                                                              │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│   STEP 2: RUN BASELINE                                                                      │
│   ────────────────────                                                                      │
│                                                                                              │
│   Run all test cases through current production system                                      │
│   Store outputs as baseline                                                                  │
│   AI Judge scores all outputs                                                               │
│   Human reviews sample for calibration                                                      │
│                                                                                              │
│   Output: Baseline scores per test case                                                     │
│                                                                                              │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│   STEP 3: RUN CANDIDATE                                                                     │
│   ─────────────────────                                                                     │
│                                                                                              │
│   Change one thing (model, prompt, parameter)                                               │
│   Run same test cases through candidate                                                     │
│   AI Judge scores all outputs                                                               │
│   Compare to baseline                                                                        │
│                                                                                              │
│   Output: Delta scores + statistical significance                                           │
│                                                                                              │
│   ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                              │
│   STEP 4: DECIDE                                                                            │
│   ──────────────                                                                            │
│                                                                                              │
│   If candidate > baseline by significant margin → Flag for promotion                        │
│   If candidate ≈ baseline → Note for context (maybe cheaper?)                              │
│   If candidate < baseline → Reject                                                          │
│                                                                                              │
│   Human makes final call on flagged candidates                                              │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: The Experiment Runner

```typescript
interface TestCase {
  id: string;
  input: {
    conversationHistory: Message[];
    currentMessage: string;
    ragContext?: string;
  };
  metadata: {
    category: string;       // "happy_path", "edge_case", etc.
    domain: string;         // "health", "work", etc.
    complexity: "simple" | "medium" | "complex";
  };
  // For regression testing, we can store expected output
  goldenOutput?: any;
}

interface ExperimentConfig {
  name: string;
  description: string;
  component: "bubbles" | "artifact" | "conversation" | "tags";
  baseline: {
    model: string;
    prompt: string;
    params: Record<string, any>;
  };
  candidate: {
    model: string;
    prompt: string;
    params: Record<string, any>;
  };
  testCases: TestCase[];
  rubric: EvalRubric;
}

interface ExperimentResult {
  config: ExperimentConfig;
  baseline: {
    outputs: Map<string, any>;
    scores: Map<string, number>;
    avgScore: number;
    passRate: number;
  };
  candidate: {
    outputs: Map<string, any>;
    scores: Map<string, number>;
    avgScore: number;
    passRate: number;
  };
  comparison: {
    deltaAvg: number;
    pValue: number;          // Statistical significance
    recommendation: "promote" | "neutral" | "reject";
    regressions: string[];   // Test case IDs where candidate < baseline
    improvements: string[];  // Test case IDs where candidate > baseline
  };
}

class ExperimentRunner {
  private judge: AIJudge;
  
  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    console.log(`🧪 Starting experiment: ${config.name}`);
    
    // Run baseline
    console.log("📊 Running baseline...");
    const baselineOutputs = await this.runAll(config.baseline, config.testCases);
    const baselineScores = await this.scoreAll(baselineOutputs, config.rubric);
    
    // Run candidate
    console.log("🔬 Running candidate...");
    const candidateOutputs = await this.runAll(config.candidate, config.testCases);
    const candidateScores = await this.scoreAll(candidateOutputs, config.rubric);
    
    // Compare
    const comparison = this.compare(baselineScores, candidateScores);
    
    // Generate report
    return {
      config,
      baseline: {
        outputs: baselineOutputs,
        scores: baselineScores,
        avgScore: this.average(baselineScores),
        passRate: this.passRate(baselineScores)
      },
      candidate: {
        outputs: candidateOutputs,
        scores: candidateScores,
        avgScore: this.average(candidateScores),
        passRate: this.passRate(candidateScores)
      },
      comparison
    };
  }
  
  private compare(
    baseline: Map<string, number>,
    candidate: Map<string, number>
  ): ExperimentResult["comparison"] {
    const deltas: number[] = [];
    const regressions: string[] = [];
    const improvements: string[] = [];
    
    for (const [id, baseScore] of baseline) {
      const candScore = candidate.get(id) || 0;
      const delta = candScore - baseScore;
      deltas.push(delta);
      
      if (delta < -0.5) regressions.push(id);
      if (delta > 0.5) improvements.push(id);
    }
    
    const deltaAvg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const pValue = this.tTest(deltas);
    
    let recommendation: "promote" | "neutral" | "reject";
    if (deltaAvg > 0.3 && pValue < 0.05 && regressions.length === 0) {
      recommendation = "promote";
    } else if (deltaAvg < -0.2 || regressions.length > deltas.length * 0.1) {
      recommendation = "reject";
    } else {
      recommendation = "neutral";
    }
    
    return { deltaAvg, pValue, recommendation, regressions, improvements };
  }
}
```

### AI Test Case Generator

```typescript
class TestCaseGenerator {
  async generate(
    component: string,
    rubric: EvalRubric,
    examples: TestCase[],
    count: number = 30
  ): Promise<TestCase[]> {
    
    const prompt = `
You are generating test cases for evaluating a ${component} component.

RUBRIC (what we measure):
${rubric.dimensions.map(d => `- ${d.name}: ${d.criteria}`).join('\n')}

EXAMPLE TEST CASES:
${JSON.stringify(examples.slice(0, 3), null, 2)}

Generate ${count} diverse test cases covering:
1. Happy path (40%): Typical, straightforward usage
2. Edge cases (30%): Empty input, very long input, unusual formats
3. Adversarial (10%): Confusing, contradictory, or tricky inputs
4. Domain coverage (20%): Different topics (health, work, family, finances, etc.)

For each test case, vary:
- Conversation length (1 message to 10+ messages)
- User tone (casual, formal, emotional, factual)
- Topic complexity

Output JSON array of test cases.
`;

    const response = await this.llm.generate({
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response).testCases;
  }
}
```

### AI Judge

```typescript
class AIJudge {
  async score(
    output: any,
    rubric: EvalRubric,
    testCase: TestCase
  ): Promise<number> {
    
    const prompt = `
You are evaluating the quality of an AI output.

TEST INPUT:
${JSON.stringify(testCase.input, null, 2)}

OUTPUT TO EVALUATE:
${JSON.stringify(output, null, 2)}

RUBRIC:
${rubric.dimensions.map(d => `
${d.name} (weight: ${d.weight}):
${d.criteria}
1 = ${d.scoringGuide[1]}
3 = ${d.scoringGuide[3]}
5 = ${d.scoringGuide[5]}
`).join('\n')}

Score each dimension 1-5, then compute weighted average.
Output JSON: { scores: { dimension: score }, overall: number, reasoning: string }
`;

    const response = await this.judgeModel.generate({
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response);
    return result.overall;
  }
  
  // Pairwise comparison is often more reliable
  async compareAB(
    outputA: any,
    outputB: any,
    rubric: EvalRubric,
    testCase: TestCase
  ): Promise<"A" | "B" | "tie"> {
    
    const prompt = `
Compare two AI outputs for the same input.

INPUT:
${JSON.stringify(testCase.input, null, 2)}

OUTPUT A:
${JSON.stringify(outputA, null, 2)}

OUTPUT B:
${JSON.stringify(outputB, null, 2)}

Based on this rubric:
${rubric.dimensions.map(d => `- ${d.name}: ${d.criteria}`).join('\n')}

Which output is better? Output JSON: { winner: "A" | "B" | "tie", reasoning: string }
`;

    const response = await this.judgeModel.generate({
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(response).winner;
  }
}
```

---

## 🚀 Where to Start

### Phase 0: Foundation (Week 1)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 1: Build the Eval Harness                                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  Day 1-2: Define schemas                                                                     │
│  ─────────────────────────                                                                  │
│  • Artifact type definitions (progress_chart, data_table, etc.)                             │
│  • Bubble output schema                                                                      │
│  • Tag schema                                                                                │
│  • Validation functions                                                                      │
│                                                                                              │
│  Day 3-4: Create rubrics + golden test cases                                                │
│  ─────────────────────────────────────────────                                              │
│  • Write rubrics for each component (see above)                                             │
│  • Manually create 10 "golden" test cases each                                              │
│  • These are your ground truth                                                               │
│                                                                                              │
│  Day 5-6: Build experiment runner                                                           │
│  ───────────────────────────────                                                            │
│  • ExperimentRunner class                                                                   │
│  • AIJudge class                                                                            │
│  • TestCaseGenerator class                                                                  │
│  • Basic CLI to run experiments                                                             │
│                                                                                              │
│  Day 7: Calibrate                                                                           │
│  ─────────────────                                                                          │
│  • Run golden test cases                                                                    │
│  • Human-score them                                                                         │
│  • Compare to AI judge scores                                                               │
│  • Adjust rubric wording until AI agrees with human                                        │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Phase 1: Expand Test Coverage (Week 2)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  WEEK 2: Generate Comprehensive Test Set                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  Use AI to generate test cases:                                                              │
│  • 50 test cases for bubbles                                                                │
│  • 50 test cases for artifacts                                                               │
│  • 30 test cases for tag suggestions                                                        │
│  • 20 test cases for conversation quality                                                   │
│                                                                                              │
│  Human review:                                                                               │
│  • Sanity check generated test cases                                                        │
│  • Remove duplicates/nonsensical ones                                                       │
│  • Add any gaps AI missed                                                                   │
│                                                                                              │
│  Establish baseline:                                                                         │
│  • Pick initial models/prompts                                                              │
│  • Run full test suite                                                                       │
│  • Record baseline scores                                                                   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Iterate (Ongoing)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  ONGOING: Experiment Loop                                                                    │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│  1. Hypothesis                                                                               │
│     "I think changing X will improve Y"                                                     │
│                                                                                              │
│  2. Create experiment config                                                                │
│     - baseline: current                                                                     │
│     - candidate: with change X                                                              │
│                                                                                              │
│  3. Run experiment                                                                          │
│     ./run-experiment --config experiment-x.json                                             │
│                                                                                              │
│  4. Review results                                                                          │
│     - If "promote": deploy change                                                           │
│     - If "neutral": consider other factors (cost, speed)                                   │
│     - If "reject": try different approach                                                  │
│                                                                                              │
│  5. Update baseline                                                                         │
│     After deploying changes, new scores become baseline                                    │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Minimum Viable Experiment Set

Instead of infinite permutations, test these **key dimensions**:

### For Bubbles

| Experiment | What We're Testing |
|------------|---------------------|
| **Model comparison** | Gemini Flash vs GPT-4o-mini vs Claude Haiku |
| **Prompt length** | Minimal vs detailed system prompt |
| **Context amount** | 3 recent messages vs 10 vs full convo |
| **Temperature** | 0.3 vs 0.7 vs 1.0 |

### For Artifacts

| Experiment | What We're Testing |
|------------|---------------------|
| **Model comparison** | Gemini vs GPT-4o vs Claude |
| **Type selection** | Single-pass vs two-pass (choose type, then fill) |
| **Update strategy** | Full regeneration vs JSON patch |
| **Schema strictness** | Loose vs strict validation |

### For Tags

| Experiment | What We're Testing |
|------------|---------------------|
| **Model** | Fast/cheap vs smart |
| **Context** | Content only vs content + existing tags |
| **Suggestion count** | 1-2 vs 3-5 tags |

---

## 📝 Summary

### Organization: Keep It Simple

```
TIME (automatic) + TYPE (automatic) + TAGS (AI-suggested)
```

- No folders, no hierarchy
- Tags are flat, multiple per item
- Smart Collections = saved searches
- AI suggests tags, user confirms

### Evals: Self-Running with Human Checkpoints

```
1. Define rubrics (what "good" looks like)
2. Generate test cases (AI + human review)
3. Establish baseline (current scores)
4. Run experiments (change one thing)
5. AI judges + human calibrates
6. Promote winners
```

### Starting Point

1. **Week 1:** Build eval harness + 10 golden test cases per component
2. **Week 2:** AI-generate 50+ test cases, establish baseline
3. **Ongoing:** Hypothesis → Experiment → Decide → Deploy

The key insight: **AI can both generate test cases AND judge outputs**, but humans must calibrate and make final decisions on changes. This scales evaluation without infinite human time.
