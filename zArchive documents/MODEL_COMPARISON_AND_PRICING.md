# Model Comparison: Apple Models vs Cloud APIs for Bubble Voice

**Last Updated: January 16, 2026**

## Executive Summary

**The answer is NOT Apple's on-device model for your primary use case.**

Apple's ~3B parameter on-device model is great for simple tasks (summarization, extraction) but insufficient for:
- Large context windows (long conversations) - **only ~4K tokens**
- Complex structured output with multiple nested schemas
- Sophisticated agentic reasoning

**Recommended Stack (LATEST MODELS):**
1. **Primary**: Gemini 2.0 Flash ($0.30/M input, $2.50/M output) - **1M context window**, excellent structured output
2. **Budget Champion**: Gemini 2.5 Flash-Lite ($0.10/M input, $0.40/M output) - cheapest with 1M context
3. **Premium Quality**: GPT-5.2 ($1.75/M input, $14/M output) - 400K context, best reasoning
4. **Local offline**: Apple Foundation Models for basic tasks only (~4K context)

---

## Apple's On-Device Models

### Foundation Models Framework (macOS 26+)

**What it is:**
- ~3B parameter multimodal LLM running locally on Apple Silicon (M1+)
- Accessed via Swift's Foundation Models framework
- Zero per-token cost (runs on device)
- Automatic fallback to Private Cloud Compute (PCC) for heavier tasks

**Capabilities:**
```swift
// Example: Guided generation for structured output
import FoundationModels

@Generable
struct UIArtifact {
    @Guide(description: "Type of UI component")
    var componentType: String
    
    @Guide(description: "JSON data for the component")
    var data: String
}

let session = LanguageModelSession()
let result = try await session.generate(UIArtifact.self, prompt: userMessage)
```

**Context Window:**
- **Confirmed: ~4,096 tokens** (developer documentation and community confirmed)
- This is **critically insufficient** for long conversations with artifacts

**Structured Output:**
- ✅ Supports "Guided Generation" with `@Generable` macros
- ✅ Supports tool calling
- ⚠️ Limited to simpler schemas compared to cloud models
- ⚠️ No JSON Schema enforcement like OpenAI's Structured Outputs

**Verdict on Apple Models:**
| Aspect | Rating | Notes |
|--------|--------|-------|
| Context Window | ❌ Poor | ~4K tokens, way too small |
| Structured Output | ⚠️ Basic | Guided generation works but limited |
| Quality | ⚠️ Basic | 3B model = basic reasoning |
| Cost | ✅ Free | Zero token cost |
| Offline | ✅ Yes | Works without internet |
| Privacy | ✅ Excellent | Never leaves device (unless PCC) |

**Important Note:** Apple has a multi-year deal with Google - Gemini will power next-gen Siri and future Apple Intelligence server-side features via Private Cloud Compute (starting iOS 26.4 in 2026).

**Use Apple Models For:**
- Quick summarization of short text
- Simple extraction tasks
- Basic tool calls
- Offline fallback mode

**Don't Use Apple Models For:**
- Long conversations
- Complex structured output
- Sophisticated reasoning
- Primary production use

---

## Cloud Models Comparison (LATEST - January 2026)

### The Big Picture

| Model | Context Window | Input $/M | Output $/M | Structured Output | Best For |
|-------|---------------|-----------|------------|-------------------|----------|
| **Gemini 2.0 Flash** | **1M tokens** | $0.30 | $2.50 | ✅ JSON Schema | **Long conversations** |
| **Gemini 2.5 Flash-Lite** | **1M tokens** | **$0.10** | **$0.40** | ✅ JSON Schema | **Budget champion** |
| Gemini 3 Flash (preview) | 1M+ tokens | $0.50 | $3.00 | ✅ JSON Schema | Newest, more capable |
| Gemini 3 Pro (preview) | 1M+ tokens | $2.00 | $12.00 | ✅ JSON Schema | Premium reasoning |
| **GPT-5.2** | **400K tokens** | **$1.75** | **$14.00** | ✅ Structured Outputs | **Best reasoning** |
| GPT-5-mini | 128K tokens | $0.25 | $2.00 | ✅ Structured Outputs | Good balance |
| GPT-5-nano | 128K tokens | $0.05 | $0.40 | ✅ Structured Outputs | Ultra-budget |
| Claude 4.5 Opus | 200K tokens | $5.00 | $25.00 | ✅ Structured Outputs | Premium quality |
| Claude 4.5 Sonnet | 200K tokens | $3.00 | $15.00 | ✅ Structured Outputs | Balanced premium |
| Claude 4.5 Haiku | 200K tokens | $1.00 | $5.00 | ✅ Structured Outputs | Fast + capable |

---

### Detailed Analysis

#### 🏆 RECOMMENDED: Gemini 2.0 Flash (or 2.5 Flash-Lite for budget)

**Why Gemini 2.0/2.5 Flash is your answer:**

```
Gemini 2.0 Flash:
Context Window: 1,000,000 tokens (1M!)
Input Cost:     $0.30 per million tokens
Output Cost:    $2.50 per million tokens

Gemini 2.5 Flash-Lite (CHEAPEST):
Context Window: 1,000,000 tokens (1M!)
Input Cost:     $0.10 per million tokens
Output Cost:    $0.40 per million tokens

For a 50K token conversation with 5K token response:
2.0 Flash: (50,000 × $0.30/1M) + (5,000 × $2.50/1M) = $0.0275 (~2.75 cents)
2.5 Flash-Lite: (50,000 × $0.10/1M) + (5,000 × $0.40/1M) = $0.007 (~0.7 cents!)
```

**Structured Output Support:**
```json
// Gemini supports JSON Schema directly
{
  "response_mime_type": "application/json",
  "response_schema": {
    "type": "object",
    "properties": {
      "bubbles": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "text": { "type": "string", "maxLength": 50 },
            "type": { "enum": ["question", "suggestion", "insight"] }
          }
        }
      },
      "ui_component": {
        "type": "object",
        "properties": {
          "type": { "enum": ["chart", "table", "timeline", "card"] },
          "data": { "type": "object" }
        }
      }
    }
  }
}
```

**Pros:**
- ✅ **1M context window** - can hold entire conversation history
- ✅ Native JSON Schema enforcement
- ✅ Fast (optimized for speed)
- ✅ Good structured output reliability
- ✅ Multimodal (can handle images too)

**Cons:**
- ⚠️ Slightly more expensive than DeepSeek
- ⚠️ Google API can be quirky

---

#### 🚀 NEW: Gemini 3 Flash & Pro (Preview)

**Gemini 3 Flash:**
```
Context Window: 1,000,000+ tokens
Input Cost:     $0.50 per million tokens
Output Cost:    $3.00 per million tokens

50K conversation cost:
= (50,000 × $0.50/1M) + (5,000 × $3.00/1M)
= $0.025 + $0.015
= $0.04 per exchange (~4 cents)
```

**Gemini 3 Pro:**
```
Context Window: 1,000,000+ tokens
Input Cost:     $2.00 per million (≤200K context)
                $4.00 per million (>200K context)
Output Cost:    $12.00 per million (≤200K)
                $18.00 per million (>200K)
```

**When to use Gemini 3:**
- Need latest capabilities
- More complex reasoning than 2.0/2.5
- Willing to pay slightly more for quality
- Preview features (parallel tool calling, MCP support)

---

#### 🎯 PREMIUM QUALITY: GPT-5.2

**Pricing (January 2026):**
```
Context Window:     400K tokens (up to 128K output)
Input Cost:         $1.75 per million
Input (cached):     $0.175 per million (90% discount!)
Output Cost:        $14.00 per million

GPT-5.2-Pro (even better reasoning):
Input:              $21.00 per million
Output:             $168.00 per million
```

**Why GPT-5.2 matters:**
- Latest OpenAI flagship (knowledge cutoff: August 31, 2025)
- Best-in-class reasoning and coding
- Structured Outputs with `strict: true` guarantee
- 400K context (not 1M, but very large)

**50K conversation cost:**
```
= (50,000 × $1.75/1M) + (5,000 × $14/1M)
= $0.0875 + $0.07
= $0.1575 per exchange (~16 cents)
```

**When to use:**
- Complex reasoning tasks
- Multi-step agentic workflows
- When JSON reliability is critical
- Coding/technical tasks

---

#### 💰 BUDGET OPTIONS: GPT-5-mini & GPT-5-nano

**GPT-5-mini:**
```
Context Window: 128K tokens
Input Cost:     $0.25 per million
Output Cost:    $2.00 per million
```

**GPT-5-nano (ULTRA-CHEAP):**
```
Context Window: 128K tokens
Input Cost:     $0.05 per million
Output Cost:    $0.40 per million
```

**Structured Outputs (Schema Enforcement):**
```python
# OpenAI's Structured Outputs guarantee schema compliance
response = client.chat.completions.create(
    model="gpt-5-mini",  # or "gpt-5-nano"
    messages=[...],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "ui_response",
            "strict": True,  # <-- Key: guarantees valid JSON
            "schema": your_schema
        }
    }
)
```

**Why OpenAI's `strict: true` matters:**
- 100% valid JSON every time
- Schema is enforced at the token generation level
- No need for retry logic

**When to use:**
- GPT-5-mini: Good balance of quality and cost
- GPT-5-nano: Ultra-budget, simple tasks
- Both: When you need OpenAI's strict JSON guarantee

---

#### 🎭 CLAUDE 4.5 FAMILY

**Claude 4.5 Opus:**
```
Context Window: 200K tokens
Input Cost:     $5.00 per million
Output Cost:    $25.00 per million
```

**Claude 4.5 Sonnet:**
```
Context Window: 200K tokens
Input Cost:     $3.00 per million
Output Cost:    $15.00 per million
```

**Claude 4.5 Haiku:**
```
Context Window: 200K tokens
Input Cost:     $1.00 per million
Output Cost:    $5.00 per million
```

**Structured Output:**
- ✅ Structured outputs (JSON schema) in beta
- ✅ Strict tool use mode
- ✅ Reliable for complex schemas

**When to use:**
- Need 200K context (more than GPT-5 mini/nano)
- Strong reasoning at mid-tier pricing
- Alternative to OpenAI/Google ecosystem

---

### Cost Comparison Table (UPDATED JANUARY 2026)

For a **50K input + 5K output** exchange:

| Model | Cost per Exchange | Monthly (1000 exchanges) | Context Window |
|-------|-------------------|-------------------------|----------------|
| GPT-5-nano | $0.0045 | $4.50 | 128K |
| **Gemini 2.5 Flash-Lite** | **$0.007** | **$7** | **1M** ⭐ |
| GPT-5-mini | $0.0225 | $22.50 | 128K |
| **Gemini 2.0 Flash** | **$0.0275** | **$27.50** | **1M** ⭐ |
| Gemini 3 Flash | $0.040 | $40 | 1M+ |
| Claude 4.5 Haiku | $0.075 | $75 | 200K |
| **GPT-5.2** | **$0.1575** | **$157.50** | **400K** |
| Claude 4.5 Sonnet | $0.225 | $225 | 200K |
| Gemini 3 Pro (≤200K) | $0.160 | $160 | 1M+ |
| Claude 4.5 Opus | $0.375 | $375 | 200K |
| GPT-5.2-Pro | $1.89 | $1,890 | 400K |

⭐ = Best value for long-context conversations

---

## Context Window: Why 1M Matters

### Conversation Length Math

```
Average user turn:     100-500 tokens
Average AI response:   500-2000 tokens  
UI artifact JSON:      500-1000 tokens
Bubble suggestions:    50-100 tokens

Per exchange total: ~2,000-4,000 tokens

With 128K context:
- Max exchanges before truncation: ~32-64 turns
- Roughly 15-30 minute conversation

With 1M context:
- Max exchanges: ~250-500 turns
- Hours of conversation with full history
- Room for RAG context injection
```

### The Summarization Problem

With smaller context:
1. Need to summarize older conversation
2. Summarization loses nuance
3. UI artifacts may reference lost context
4. "Bubbles" might not connect to earlier topics

**Gemini's 1M context avoids this entirely for most use cases.**

---

## Recommended Architecture (UPDATED FOR 2026)

### Three-Tier Model Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1: LOCAL (FREE)                      │
│  Apple Foundation Models (iOS/macOS 26+)                     │
│  - Offline mode fallback                                     │
│  - Simple summarization                                      │
│  - Privacy-sensitive tasks                                   │
│  Context: ~4K | Cost: $0                                     │
│  Note: Apple using Gemini for PCC server-side (2026)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               TIER 2: PRIMARY CLOUD (CHEAP)                  │
│  Gemini 2.5 Flash-Lite ($0.007/exchange)                    │
│  - Main conversation handler                                 │
│  - Structured output for UI components                       │
│  - Bubble generation                                         │
│  Context: 1M tokens | Cost: ~$0.007/exchange               │
│                                                              │
│  Alternative: Gemini 2.0 Flash ($0.028/exchange)            │
│  - Slightly better quality                                   │
│  - Still 1M context                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TIER 3: PREMIUM CLOUD (QUALITY)                 │
│  GPT-5.2 ($0.16/exchange)                                   │
│  - Complex reasoning tasks                                   │
│  - Critical structured output (strict: true)                 │
│  - Multi-step agentic workflows                              │
│  - Coding/technical tasks                                    │
│  Context: 400K tokens | Cost: ~$0.16/exchange              │
│                                                              │
│  Alternative: Claude 4.5 Haiku ($0.075/exchange)            │
│  - Good middle ground                                        │
│  - 200K context                                              │
└─────────────────────────────────────────────────────────────┘
```

### Provider Selection Logic (UPDATED)

```swift
// Pseudocode for model selection
func selectModel(for task: Task, userTier: UserTier) -> ModelProvider {
    switch task {
    case .offline, .simpleExtraction:
        return .appleFoundationModels  // Free, local, ~4K context
        
    case .conversation, .bubbleGeneration:
        if userTier == .free || userTier == .budget {
            return .gemini25FlashLite  // $0.007/exchange, 1M context
        } else {
            return .gemini20Flash      // $0.028/exchange, 1M context
        }
        
    case .complexUI, .criticalJSON:
        if userTier == .premium {
            return .gpt52              // $0.16/exchange, best reasoning
        } else {
            return .gpt5Mini           // $0.02/exchange, good balance
        }
        
    case .multiStepAgent, .complexReasoning:
        return .gpt52                  // Best reasoning, 400K context
        
    case .ultraBudget:
        return .gpt5Nano               // $0.004/exchange, basic tasks
    }
}
```

---

## Implementation: BYOK (Bring Your Own Key)

Since you want users to provide their own API keys:

```swift
// Settings model
struct APIKeySettings: Codable {
    var googleAPIKey: String?      // For Gemini
    var openAIAPIKey: String?      // For GPT-4o-mini
    var anthropicAPIKey: String?   // For Claude
    var deepSeekAPIKey: String?    // For DeepSeek
    
    var preferredProvider: ModelProvider = .geminiFlash
}

// Cost transparency UI
struct CostEstimator {
    static func estimate(
        inputTokens: Int,
        outputTokens: Int,
        provider: ModelProvider
    ) -> (cost: Double, formatted: String) {
        let pricing = provider.pricing
        let cost = (Double(inputTokens) * pricing.input / 1_000_000) +
                   (Double(outputTokens) * pricing.output / 1_000_000)
        return (cost, String(format: "$%.4f", cost))
    }
}
```

---

## Final Recommendations (JANUARY 2026)

### 🏆 For Long Conversations + Structured Output:

**Primary Choice: Gemini 2.5 Flash-Lite**
- 1M context window handles everything
- Excellent structured output with JSON Schema
- **Cheapest option: ~$0.007/exchange**
- Perfect for budget-conscious users

**Step-Up: Gemini 2.0 Flash**
- Same 1M context
- Better quality than Flash-Lite
- Still cheap: ~$0.028/exchange

**Premium: Gemini 3 Flash (Preview)**
- Latest capabilities
- 1M+ context
- ~$0.04/exchange

### 🎯 For Most Reliable JSON + Best Reasoning:

**Choice: GPT-5.2 with `strict: true`**
- Guaranteed valid JSON every time
- Best reasoning and coding capabilities
- 400K context (huge, but not 1M)
- ~$0.16/exchange

**Budget Alternative: GPT-5-mini**
- Still has `strict: true` guarantee
- 128K context
- ~$0.02/exchange

### 💰 For Maximum Savings:

**Choice: GPT-5-nano**
- Ultra-cheap: ~$0.004/exchange
- Still has structured outputs
- 128K context
- Good for simple tasks

**Alternative: Gemini 2.5 Flash-Lite**
- Slightly more expensive but 1M context
- Better for long conversations
- ~$0.007/exchange

### 🔒 Local Fallback:

**Apple Foundation Models**
- Use for offline mode only
- ~4K context (very limited)
- Simple tasks and privacy-sensitive operations
- Don't rely on it for primary functionality
- **Note:** Apple partnering with Google Gemini for server-side AI (2026)

---

## Appendix: API Examples

### Gemini Structured Output

```python
import google.generativeai as genai

genai.configure(api_key="YOUR_KEY")

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash-latest",
    generation_config={
        "response_mime_type": "application/json",
        "response_schema": {
            "type": "object",
            "properties": {
                "response": {"type": "string"},
                "bubbles": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {"type": "string"},
                            "type": {"type": "string"}
                        }
                    }
                },
                "artifact": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "data": {"type": "object"}
                    }
                }
            },
            "required": ["response"]
        }
    }
)
```

### OpenAI Structured Outputs

```python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": user_message}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "bubble_voice_response",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "spoken_response": {"type": "string"},
                    "bubbles": {
                        "type": "array",
                        "maxItems": 5,
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string", "maxLength": 50},
                                "bubble_type": {
                                    "type": "string",
                                    "enum": ["question", "suggestion", "insight", "reminder"]
                                }
                            },
                            "required": ["text", "bubble_type"]
                        }
                    }
                },
                "required": ["spoken_response"],
                "additionalProperties": False
            }
        }
    }
)
```

### DeepSeek JSON Mode

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_DEEPSEEK_KEY",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "Return JSON matching this schema: ..."},
        {"role": "user", "content": user_message}
    ],
    response_format={"type": "json_object"}
)
```

---

## Document History

- **Created**: January 16, 2026
- **Last Updated**: January 16, 2026
- **Purpose**: Compare LLM options for Bubble Voice Mac
- **Decision**: 
  - **Budget/Primary**: Gemini 2.5 Flash-Lite (1M context, $0.007/exchange)
  - **Premium**: GPT-5.2 (400K context, best reasoning, $0.16/exchange)
  - **Local**: Apple Foundation Models (4K context, free, offline only)

## Key Takeaways

1. **Apple's on-device model is NOT sufficient** for your use case (only ~4K context)
2. **Gemini 2.5 Flash-Lite is the budget champion** - 1M context for $0.007/exchange
3. **GPT-5.2 is the quality champion** - 400K context, best reasoning, $0.16/exchange
4. **All major models now support structured output** (JSON Schema or strict mode)
5. **1M context window is critical** for long conversations without summarization
6. **Apple is partnering with Google Gemini** for server-side AI features (2026)
