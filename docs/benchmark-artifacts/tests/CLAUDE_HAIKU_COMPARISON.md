# Claude Haiku 4.5 vs 3.5: Price & Schema Conformance

**Date**: January 20, 2026

---

## Price Comparison

| Model | Input Cost | Output Cost | vs 3.5 |
|-------|------------|-------------|--------|
| **Claude 3.5 Haiku** | $0.80 / 1M | $4.00 / 1M | Baseline |
| **Claude 4.5 Haiku** | $1.00 / 1M | $5.00 / 1M | +25% more expensive |

### Cost for BubbleVoice (4K input + 2K output per turn)

| Model | Per Turn | Per 10K Turns | vs Gemini 2.5 |
|-------|----------|---------------|---------------|
| **Claude 3.5 Haiku** | $0.0032 + $0.008 = **$0.0112** | **$112.00** | 12.4x more |
| **Claude 4.5 Haiku** | $0.004 + $0.010 = **$0.014** | **$140.00** | 15.6x more |

**Comparison**:
- Gemini 2.5 Flash-Lite: $9 per 10K
- Claude 3.5 Haiku: $112 per 10K (+$103)
- Claude 4.5 Haiku: $140 per 10K (+$131)

---

## Schema Conformance

### What Both Models Support

**✅ Structured Outputs (Beta)**:
- Available on both 3.5 and 4.5 Haiku
- Enforces JSON structure, field types, required fields
- Prevents extra properties
- Header: `structured-outputs-2025-11-13`

**✅ What IS Enforced**:
- `type` (string, number, object, array, boolean)
- `required` (required fields)
- `properties` (object structure)
- `items` (array structure)
- `enum` (constrained values)

**❌ What IS NOT Enforced** (Both Models):
- `maxLength` / `minLength` - **NOT enforced at generation time**
- `maximum` / `minimum` - **NOT enforced**
- `pattern` (regex) - **NOT enforced**
- `format` (email, date, etc.) - **NOT enforced**

**Important**: These constraints are retained in the schema description and can be validated **client-side** (your code), but Claude does NOT enforce them during generation.

---

## Key Differences

### Output Token Limits

| Model | Max Output Tokens | Context Window |
|-------|-------------------|----------------|
| **Claude 3.5 Haiku** | 8,192 tokens | 200K |
| **Claude 4.5 Haiku** | 64,000 tokens | 200K |

**Haiku 4.5 can generate 8x longer outputs** than 3.5.

### Known Issues

**⚠️ Bug in Claude 4.5 Haiku**:
- Some platforms (e.g., Claude Code) incorrectly limit Haiku 4.5 to 8,192 tokens
- This is the old 3.5 limit, not the advertised 64K limit
- Affects certain API endpoints/tools
- May be fixed by time you read this

### Performance Improvements (4.5 vs 3.5)

**Claude 4.5 Haiku**:
- ✅ Better reasoning ("extended thinking")
- ✅ Improved tool use & code generation
- ✅ Safer default constraints
- ✅ 8x larger output capacity
- ❌ 25% more expensive

**Claude 3.5 Haiku**:
- ✅ 25% cheaper
- ✅ Faster for simple tasks
- ❌ Limited to 8K output tokens
- ❌ Weaker reasoning

---

## Schema Enforcement Reality

### What the Docs Say

From Anthropic's documentation:

> "Certain schema constraints like `minLength`, `maxLength`, `minimum`, `maximum` are **not supported** in the schema Claude sees. They are retained in descriptions and validated client-side rather than by Claude itself."

### What This Means

**Both Claude 3.5 and 4.5 Haiku**:
1. Will NOT enforce `maxLength` during generation
2. May generate fields longer than specified
3. Require **client-side validation** after generation

**However**:
- Claude models are generally **better at following prompt instructions** than Gemini
- With good prompts, they tend to respect length guidelines even without schema enforcement
- Less likely to "loop" or generate massive fields like Gemini does

---

## Practical Comparison

### For BubbleVoice Use Case

**Scenario**: 4K input + 2K output, need `maxLength` enforcement

| Aspect | Claude 3.5 Haiku | Claude 4.5 Haiku | Gemini 2.5 Flash-Lite |
|--------|------------------|------------------|----------------------|
| **Cost per 10K** | $112 | $140 | $9 |
| **maxLength Enforcement** | ❌ No (client-side only) | ❌ No (client-side only) | ❌ No |
| **Prompt Adherence** | ✅ Good | ✅ Better | ⚠️ Requires careful examples |
| **Max Output** | 8,192 tokens | 64,000 tokens | 65,536 tokens |
| **Success Rate (Est.)** | 92-95% | 93-96% | 90% (with fixes) |
| **Speed** | Good | Good | 1,000 TPS (faster) |

---

## The Truth About `maxLength`

### Neither Claude Model Enforces It

**From Anthropic's docs**:
```
"maxLength", "minLength", "maximum", "minimum" are not supported 
in the schema Claude sees. They are retained in descriptions and 
validated client-side.
```

**This means**:
1. You must validate `maxLength` in your code after Claude responds
2. Claude may generate longer fields than specified
3. No different from Gemini in this regard

### But Claude Is Still Better

**Why Claude might work better despite no `maxLength` enforcement**:

1. **Better prompt following**: Claude models are trained to follow instructions more precisely
2. **Less looping**: Less likely to repeat/concatenate like Gemini does
3. **Structured outputs**: Better JSON structure compliance overall
4. **Reasoning**: Better at understanding "brief" vs "detailed"

**Expected behavior**:
- With good prompts: 92-96% success (vs 90% for Gemini)
- Without schema enforcement: Still need client-side validation
- Cost: 12-15x more expensive

---

## Recommendation

### For BubbleVoice

**❌ Do NOT use Claude Haiku** (either version):

**Reasons**:
1. **12-15x more expensive** than Gemini 2.5 ($112-140 vs $9 per 10K)
2. **No `maxLength` enforcement** (same limitation as Gemini)
3. **Only 2-6% better success rate** (not worth 12-15x cost)
4. **Slower than Gemini** (good speed, but not 1,000 TPS)

**Better alternatives**:
1. **Gemini 2.5 Flash-Lite** ($9 per 10K) - Current, 90% success
2. **GPT-4o-mini** ($18 per 10K) - 2x cost, 95%+ success, **DOES enforce maxLength**
3. **Groq Llama 4 Scout** ($11.20 per 10K) - 1.24x cost, 85-90% success, partial enforcement

---

## When Claude Haiku Makes Sense

### Use Claude 3.5 Haiku If:
- ✅ Quality is more important than cost
- ✅ You need very reliable prompt following
- ✅ Outputs are <8K tokens
- ✅ Budget allows 12x cost increase

### Use Claude 4.5 Haiku If:
- ✅ Need outputs >8K tokens (up to 64K)
- ✅ Need best reasoning in Haiku tier
- ✅ Budget allows 15x cost increase
- ✅ Quality is critical

### Don't Use Either If:
- ❌ Cost is a concern (use Gemini or Groq)
- ❌ Need guaranteed `maxLength` enforcement (use GPT-4o-mini)
- ❌ Need maximum speed (use Gemini)
- ❌ Outputs are <8K tokens (3.5 is enough)

---

## Summary

### Price
- **Claude 3.5 Haiku**: $112 per 10K turns
- **Claude 4.5 Haiku**: $140 per 10K turns (+25% vs 3.5)
- **Both are 12-15x more expensive than Gemini 2.5**

### Schema Conformance
- **Both models**: ❌ Do NOT enforce `maxLength` at generation time
- **Both models**: ✅ Enforce structure, types, required fields
- **Both models**: Require client-side validation for length constraints

### Key Difference
- **4.5 can generate 8x longer outputs** (64K vs 8K tokens)
- **4.5 has better reasoning** and tool use
- **4.5 costs 25% more** than 3.5

### Verdict for BubbleVoice
**❌ Skip both Claude Haiku models**:
- Too expensive (12-15x vs Gemini)
- No `maxLength` enforcement advantage
- Only marginally better success rate
- Better alternatives exist (GPT-4o-mini for reliability, Groq for value)

**Use Claude only if**:
- Quality is paramount
- Cost is not a concern
- Need >8K token outputs (use 4.5)
- Need best-in-class prompt following

Otherwise, stick with **Gemini 2.5** ($9) or upgrade to **GPT-4o-mini** ($18) for guaranteed `maxLength` enforcement.
