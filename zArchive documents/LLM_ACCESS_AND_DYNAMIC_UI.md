# Bubble Voice - LLM Access, Monetization & Dynamic UI Generation

**Created:** 2026-01-16  
**Purpose:** Strategy for LLM API access, pricing, dynamic UI generation (HTML), and real-time image generation.

---

## 📋 Executive Summary

| Question | Answer |
|----------|--------|
| **How to give access to premium models?** | BYOK (Bring Your Own Key) + optional hosted tier |
| **Cheapest good models?** | DeepSeek ($0.07/M), Gemini Flash ($0.15/M), GPT-4o mini ($2.25/M) |
| **Best for structured output?** | All modern models support it; Gemini Flash best value |
| **Can LLM generate HTML UI?** | Yes - render in WKWebView (native) or iframe (web) |
| **Image generation cost?** | FLUX.1 dev ~$0.015/image, Stable Diffusion ~$0.03/image |
| **Can we do both UI + images?** | Absolutely - they're complementary, not mutually exclusive |

---

## 💰 LLM API Access Strategy

### Option 1: BYOK (Bring Your Own Key) - Recommended

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BYOK Architecture                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User                                                                       │
│     │                                                                        │
│     │  1. Settings → Enter API Key                                          │
│     │     (OpenAI / Anthropic / Google / DeepSeek)                          │
│     │                                                                        │
│     ▼                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Bubble Voice App                              │   │
│   │                                                                      │   │
│   │   • Stores key in Keychain (encrypted)                               │   │
│   │   • Calls API directly from user's device                            │   │
│   │   • User pays their own API bill                                     │   │
│   │   • No middleman = no markup                                         │   │
│   │                                                                      │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    Provider APIs (Direct)                            │   │
│   │                                                                      │   │
│   │   OpenAI    Anthropic    Google    DeepSeek    Groq                 │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Benefits:                                                                  │
│   ✅ No backend infrastructure needed                                        │
│   ✅ User controls their spending                                            │
│   ✅ Privacy (data doesn't touch your servers)                               │
│   ✅ Power users already have API keys                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Option 2: Hybrid - BYOK + Hosted Tier

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Hybrid Access Model                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Free Tier (Local)                                                          │
│   ├── Ollama local LLM (Llama 3.2 3B)                                       │
│   ├── Local embeddings                                                       │
│   └── macOS `say` for TTS                                                   │
│                                                                              │
│   BYOK Tier (User's Keys)                                                   │
│   ├── GPT-4o / Claude / Gemini                                              │
│   ├── ElevenLabs / PlayHT TTS                                               │
│   └── FLUX / DALL-E images                                                  │
│                                                                              │
│   Pro Tier ($X/month - Your Revenue)                                        │
│   ├── Your proxy with pooled API keys                                       │
│   ├── Rate limiting per user                                                │
│   ├── Premium features (more context, faster models)                        │
│   └── You mark up 20-50% over API cost                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💵 Current LLM Pricing (2026)

### "Too Cheap to Meter" Models

| Model | Input $/1M | Output $/1M | Structured Output | Best For |
|-------|-----------|-------------|-------------------|----------|
| **DeepSeek V3** | $0.028 | $0.042 | ✅ Native | Cheapest, good quality |
| **Gemini 2.5 Flash** | $0.10 | $0.40 | ✅ Native | Best value, multimodal |
| **GPT-4o mini** | $0.25 | $2.00 | ✅ Native | Reliable, fast |
| **Claude 3.5 Haiku** | $0.25 | $1.25 | ✅ Native | Fast, good reasoning |
| **Groq (Llama 3.3 70B)** | $0.30 | $0.50 | ✅ Via tools | Fastest inference |

### Cost Per Conversation (~2K tokens in, 1K tokens out)

| Model | Cost/Conversation | 1000 Convos/Day | Month |
|-------|------------------|-----------------|-------|
| **DeepSeek** | $0.0001 | $0.10 | **$3** |
| **Gemini Flash** | $0.0006 | $0.60 | **$18** |
| **GPT-4o mini** | $0.0025 | $2.50 | **$75** |
| **GPT-4o** | $0.015 | $15.00 | **$450** |

**Reality:** For a voice assistant, DeepSeek or Gemini Flash is **nearly free**.

---

## 🎯 Structured Output Support

All modern models support structured output:

```typescript
// OpenAI - Response Format
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [...],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "ui_response",
      schema: {
        type: "object",
        properties: {
          thinking: { type: "string" },
          html_ui: { type: "string" },
          image_prompts: { 
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  }
});

// Google Gemini - Native JSON Mode
const result = await model.generateContent({
  contents: [...],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: schema
  }
});

// Claude - Tool Use for Structured Output
const response = await anthropic.messages.create({
  model: "claude-3-5-sonnet-20241022",
  tools: [{
    name: "generate_ui",
    description: "Generate UI response",
    input_schema: schema
  }],
  tool_choice: { type: "tool", name: "generate_ui" }
});
```

---

## 🎨 Dynamic UI Generation: HTML vs Structured

### Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **Structured (JSON → Native)** | Type-safe, native look, fast | Limited flexibility, more dev work |
| **HTML (LLM → WebView)** | Infinite flexibility, LLM excels at HTML | Styling consistency, security |
| **Hybrid (Both)** | Best of both worlds | More complexity |

### Why HTML Works Great

1. **LLMs are trained on HTML** - They're really good at it
2. **Claude Artifacts** already does this successfully
3. **v0.dev** generates React/HTML from prompts
4. **WKWebView** renders HTML natively on iOS/macOS
5. **Sandboxed** - Safe to render untrusted HTML

---

## 🖼️ HTML UI Generation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dynamic HTML UI Generation                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User: "Show me a comparison of my sleep data this week"                   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         LLM Request                                  │   │
│   │                                                                      │   │
│   │   System: You are a UI-generating assistant. Output HTML/CSS/JS     │   │
│   │           that renders beautiful, interactive visualizations.        │   │
│   │           Use Chart.js for charts. Use Tailwind for styling.        │   │
│   │           Return JSON with: { html, image_prompts[], voice_text }   │   │
│   │                                                                      │   │
│   │   Context: User's sleep data: [7.2h, 6.8h, 8.1h, 5.5h, 7.0h, ...]  │   │
│   │                                                                      │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      LLM Response (JSON)                             │   │
│   │                                                                      │   │
│   │   {                                                                  │   │
│   │     "html": "<div class='sleep-chart'>...</div>",                   │   │
│   │     "voice_text": "Your sleep averaged 7 hours this week...",       │   │
│   │     "image_prompts": ["peaceful bedroom at night, soft lighting"]   │   │
│   │   }                                                                  │   │
│   │                                                                      │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│              ┌───────────────┴───────────────┐                              │
│              │                               │                               │
│              ▼                               ▼                               │
│   ┌─────────────────────┐      ┌─────────────────────┐                      │
│   │  WKWebView Render   │      │  Image Generation   │                      │
│   │                     │      │                     │                      │
│   │  • Inject Tailwind  │      │  FLUX.1: $0.015/img │                      │
│   │  • Inject Chart.js  │      │  ~2s generation     │                      │
│   │  • Sandbox JS       │      │                     │                      │
│   │  • Native feel      │      │  Display alongside  │                      │
│   └─────────────────────┘      └─────────────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: WKWebView HTML Renderer

```swift
import SwiftUI
import WebKit

/// Dynamic HTML renderer for LLM-generated UI
/// Safely sandboxes HTML/CSS/JS in a WKWebView
/// Injects common libraries (Tailwind, Chart.js) automatically
///
/// Why HTML instead of native UI:
/// - LLMs are excellent at generating HTML
/// - Infinite flexibility for visualizations
/// - Charts, tables, diagrams all work
/// - User can't break the app with bad output
///
/// Date: 2026-01-16
struct DynamicHTMLView: UIViewRepresentable {
    let html: String
    let onLinkClick: ((URL) -> Void)?
    
    // Common CSS/JS to inject
    static let baseHTML = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                padding: 16px;
                background: transparent;
                color: #1a1a1a;
            }
            @media (prefers-color-scheme: dark) {
                body { color: #f0f0f0; }
            }
            .card {
                background: rgba(255,255,255,0.1);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                padding: 16px;
            }
        </style>
    </head>
    <body>
        {{CONTENT}}
    </body>
    </html>
    """
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        
        // Sandbox: Disable dangerous features
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.isFraudulentWebsiteWarningEnabled = true
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        let fullHTML = Self.baseHTML.replacingOccurrences(of: "{{CONTENT}}", with: html)
        webView.loadHTMLString(fullHTML, baseURL: nil)
    }
}

// Usage in conversation view
struct ConversationUIView: View {
    let llmResponse: LLMUIResponse
    
    var body: some View {
        VStack {
            // Voice response text
            Text(llmResponse.voiceText)
                .font(.body)
            
            // Generated HTML UI
            if let html = llmResponse.html {
                DynamicHTMLView(html: html, onLinkClick: nil)
                    .frame(height: 300)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            
            // Generated images
            ForEach(llmResponse.images, id: \.self) { imageURL in
                AsyncImage(url: URL(string: imageURL)) { image in
                    image.resizable().aspectRatio(contentMode: .fit)
                } placeholder: {
                    ProgressView()
                }
            }
        }
    }
}
```

### Tauri/React Implementation

```tsx
import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';

interface LLMUIResponse {
  html: string;
  voiceText: string;
  imagePrompts: string[];
}

// Sandboxed HTML renderer using iframe
function DynamicHTMLRenderer({ html }: { html: string }) {
  const sanitizedHTML = DOMPurify.sanitize(html, {
    ADD_TAGS: ['script'],
    ADD_ATTR: ['onclick'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|data):)/i,
  });

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { 
          font-family: system-ui; 
          padding: 16px;
          background: transparent;
        }
      </style>
    </head>
    <body>${sanitizedHTML}</body>
    </html>
  `;

  return (
    <iframe
      srcDoc={fullHTML}
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-80 border-0 rounded-xl bg-white/10 backdrop-blur"
    />
  );
}

// Or use dangerouslySetInnerHTML with sanitization for simpler cases
function InlineHTMLRenderer({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html);
  
  return (
    <div 
      className="llm-ui-content"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
```

---

## 🖼️ Real-Time Image Generation

### Pricing Reality Check

| Provider | Price/Image | 1000 Images | Speed |
|----------|-------------|-------------|-------|
| **FLUX.1 Kontext** | $0.015 | $15 | ~2-3s |
| **FLUX.1 Pro** | $0.04 | $40 | ~3-5s |
| **Stable Diffusion** | $0.03 | $30 | ~2-4s |
| **DALL-E 3** | $0.04 | $40 | ~5-10s |
| **Midjourney** | $0.05 | $50 | ~10-20s |

**For voice AI:** Generate 1-2 images per conversation = **$0.03-0.08/conversation**

### Architecture: Image as User/AI Speaks

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Real-Time Image Generation Flow                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User speaks: "Tell me about the ocean sunset I mentioned yesterday"       │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      LLM Processing                                  │   │
│   │                                                                      │   │
│   │   1. Retrieve context (RAG: "user loves ocean sunsets")             │   │
│   │   2. Generate response text (streaming)                              │   │
│   │   3. Extract image prompt: "breathtaking ocean sunset, golden hour, │   │
│   │      waves crashing on rocks, vibrant orange and purple sky"        │   │
│   │                                                                      │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│              ┌───────────────┴───────────────┐                              │
│              │                               │                               │
│              ▼                               ▼                               │
│   ┌─────────────────────┐      ┌─────────────────────┐                      │
│   │   TTS + Playback    │      │  Image Generation   │ (parallel)           │
│   │   (streaming)       │      │                     │                      │
│   │                     │      │  FLUX.1 API call    │                      │
│   │   "The sunset you   │      │  ~2 seconds         │                      │
│   │   mentioned was..." │      │                     │                      │
│   └─────────────────────┘      └──────────┬──────────┘                      │
│              │                            │                                  │
│              │                            ▼                                  │
│              │              ┌─────────────────────────┐                      │
│              │              │   Image Appears in UI   │                      │
│              │              │   (fades in smoothly)   │                      │
│              │              └─────────────────────────┘                      │
│              │                            │                                  │
│              └────────────────────────────┘                                  │
│                              │                                               │
│                              ▼                                               │
│              ┌─────────────────────────────────────┐                        │
│              │  Combined Experience:               │                        │
│              │  Voice + Image + HTML UI together   │                        │
│              └─────────────────────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// Parallel generation: Text + Image
async function generateResponse(userMessage: string, context: RAGContext) {
  // Single LLM call that outputs structured response
  const llmResponse = await llm.generate({
    messages: [...],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "multimodal_response",
        schema: {
          type: "object",
          properties: {
            voice_text: { type: "string" },
            html_ui: { type: "string" },
            image_prompt: { type: "string" },
            should_generate_image: { type: "boolean" }
          }
        }
      }
    }
  });

  const response = JSON.parse(llmResponse.content);

  // Start TTS immediately
  const ttsPromise = textToSpeech(response.voice_text);

  // Start image generation in parallel (if requested)
  let imagePromise = null;
  if (response.should_generate_image && response.image_prompt) {
    imagePromise = generateImage(response.image_prompt);
  }

  // Return immediately for streaming UI updates
  return {
    voiceText: response.voice_text,
    html: response.html_ui,
    ttsAudio: ttsPromise,
    generatedImage: imagePromise,
  };
}

// Image generation API call
async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'black-forest-labs/flux-schnell',
      input: {
        prompt: prompt,
        aspect_ratio: '16:9',
        output_format: 'webp',
      }
    })
  });

  const prediction = await response.json();
  // Poll for completion or use webhook
  return prediction.output[0]; // Image URL
}
```

---

## 🧪 Prompt & Model Benchmarking System

### Human-in-the-Loop Development

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Benchmark & Optimization System                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. DEFINE TEST CASES                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  test_cases.json                                                     │   │
│   │                                                                      │   │
│   │  [                                                                   │   │
│   │    {                                                                 │   │
│   │      "id": "sleep_chart_001",                                       │   │
│   │      "input": "Show me my sleep patterns this week",                │   │
│   │      "context": { "sleep_data": [7.2, 6.8, ...] },                  │   │
│   │      "expected_output_type": "html_chart",                          │   │
│   │      "quality_criteria": ["has_chart", "correct_data", "readable"]  │   │
│   │    },                                                                │   │
│   │    ...                                                               │   │
│   │  ]                                                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   2. RUN AGAINST MODELS                                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   for test_case in test_cases:                                      │   │
│   │       for model in [gpt4o_mini, gemini_flash, deepseek, claude]:    │   │
│   │           for prompt_variant in prompt_variants:                     │   │
│   │               result = run_test(model, prompt_variant, test_case)   │   │
│   │               store_result(result)                                   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   3. HUMAN RATING UI                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   ┌──────────────────────────────────────────────────────────────┐  │   │
│   │   │  Test: "Show me my sleep patterns"                           │  │   │
│   │   │                                                              │  │   │
│   │   │  Model A Output:        Model B Output:                      │  │   │
│   │   │  [Rendered HTML]        [Rendered HTML]                      │  │   │
│   │   │                                                              │  │   │
│   │   │  Rate: ⭐⭐⭐⭐☆           Rate: ⭐⭐⭐☆☆                      │  │   │
│   │   │                                                              │  │   │
│   │   │  Issues: [ ] Wrong data  [ ] Ugly  [ ] Broken JS             │  │   │
│   │   │                                                              │  │   │
│   │   │  [Next Test →]                                               │  │   │
│   │   └──────────────────────────────────────────────────────────────┘  │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   4. ANALYTICS & ITERATION                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   Results:                                                           │   │
│   │   ┌────────────────┬───────┬───────┬─────────┬──────────┐          │   │
│   │   │ Model          │ Avg   │ Cost  │ Latency │ Best For │          │   │
│   │   ├────────────────┼───────┼───────┼─────────┼──────────┤          │   │
│   │   │ GPT-4o mini    │ 4.2/5 │ $0.003│ 1.2s    │ Charts   │          │   │
│   │   │ Gemini Flash   │ 4.0/5 │ $0.001│ 0.8s    │ Tables   │          │   │
│   │   │ DeepSeek       │ 3.8/5 │ $0.0001│ 1.5s   │ Text     │          │   │
│   │   │ Claude Haiku   │ 4.3/5 │ $0.002│ 1.0s    │ Complex  │          │   │
│   │   └────────────────┴───────┴───────┴─────────┴──────────┘          │   │
│   │                                                                      │   │
│   │   → Use Gemini Flash for simple requests                            │   │
│   │   → Route to GPT-4o mini for charts                                 │   │
│   │   → Route to Claude for complex reasoning                           │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Benchmark Script

```typescript
// benchmark/run_benchmarks.ts
interface TestCase {
  id: string;
  input: string;
  context: any;
  expectedType: 'html_chart' | 'html_table' | 'html_card' | 'text_only';
}

interface BenchmarkResult {
  testCaseId: string;
  model: string;
  promptVariant: string;
  output: string;
  latencyMs: number;
  costUsd: number;
  humanRating?: number;
  autoChecks: {
    validHTML: boolean;
    hasExpectedElements: boolean;
    jsExecutes: boolean;
  };
}

async function runBenchmark(testCases: TestCase[]) {
  const models = [
    { name: 'gpt-4o-mini', provider: 'openai' },
    { name: 'gemini-2.5-flash', provider: 'google' },
    { name: 'deepseek-chat', provider: 'deepseek' },
    { name: 'claude-3-5-haiku', provider: 'anthropic' },
  ];

  const promptVariants = [
    { name: 'v1_basic', systemPrompt: SYSTEM_PROMPT_V1 },
    { name: 'v2_detailed', systemPrompt: SYSTEM_PROMPT_V2 },
    { name: 'v3_examples', systemPrompt: SYSTEM_PROMPT_V3 },
  ];

  const results: BenchmarkResult[] = [];

  for (const testCase of testCases) {
    for (const model of models) {
      for (const variant of promptVariants) {
        const start = Date.now();
        
        const output = await callModel(model, variant.systemPrompt, testCase);
        
        const result: BenchmarkResult = {
          testCaseId: testCase.id,
          model: model.name,
          promptVariant: variant.name,
          output: output.content,
          latencyMs: Date.now() - start,
          costUsd: calculateCost(model, output.tokens),
          autoChecks: await runAutoChecks(output.content, testCase),
        };

        results.push(result);
        await saveResult(result);
      }
    }
  }

  return results;
}

// Auto-checks for output quality
async function runAutoChecks(html: string, testCase: TestCase) {
  return {
    validHTML: isValidHTML(html),
    hasExpectedElements: checkExpectedElements(html, testCase.expectedType),
    jsExecutes: await testJSExecution(html),
  };
}
```

---

## 🚀 Combined Architecture: Everything Together

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Full Bubble Voice Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User speaks: "What's my progress on the fitness goals?"                   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  1. Speech Recognition (Local: macOS SpeechAnalyzer)                │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  2. RAG Retrieval (Local: sqlite-vss / ObjectBox)                   │   │
│   │     → Retrieve: fitness goals, recent workouts, metrics             │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│                              ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  3. LLM Generation (BYOK: Gemini Flash / GPT-4o mini)               │   │
│   │                                                                      │   │
│   │     Output (JSON):                                                   │   │
│   │     {                                                                │   │
│   │       "voice_text": "You're doing great! You've completed...",      │   │
│   │       "html_ui": "<div class='progress-card'>...</div>",            │   │
│   │       "image_prompt": "person celebrating fitness milestone...",    │   │
│   │       "generate_image": true                                        │   │
│   │     }                                                                │   │
│   │                                                                      │   │
│   └──────────────────────────┬──────────────────────────────────────────┘   │
│                              │                                               │
│              ┌───────────────┼───────────────┐                              │
│              │               │               │                               │
│              ▼               ▼               ▼                               │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│   │  4. TTS      │  │  5. HTML UI  │  │  6. Image    │                      │
│   │  (say cmd)   │  │  (WKWebView) │  │  (FLUX.1)    │                      │
│   │              │  │              │  │              │                      │
│   │  Stream      │  │  Chart.js    │  │  $0.015      │                      │
│   │  playback    │  │  progress    │  │  ~2 seconds  │                      │
│   │              │  │  bars        │  │              │                      │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                      │
│          │                 │                 │                               │
│          └─────────────────┼─────────────────┘                               │
│                            │                                                 │
│                            ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  7. Combined UI Display                                             │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │  🎙️ Voice: "You're doing great! You've completed 4 of 5..." │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │  📊 HTML UI: Progress bars, charts, goal tracker            │   │   │
│   │  │  [═══════════════════════░░░░░] 80% Complete                │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │  🖼️ Generated Image: Person celebrating, confetti            │   │   │
│   │  │  [AI-generated celebration image fades in]                   │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Cost per interaction:                                                      │
│   • LLM (Gemini Flash): ~$0.0006                                            │
│   • TTS (say cmd): $0.00                                                    │
│   • Image (FLUX.1): ~$0.015                                                 │
│   • TOTAL: ~$0.016 (~$16 per 1000 conversations with images)               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📱 HTML Rendering: Mobile vs Desktop

| Platform | Method | Notes |
|----------|--------|-------|
| **macOS (Swift)** | WKWebView | Native, fast, full JS support |
| **macOS (Tauri)** | WebView (built-in) | Already a WebView, just render |
| **iOS (Swift)** | WKWebView | Same as macOS, works great |
| **iOS (React Native)** | react-native-webview | Widely used, performant |
| **Web (React)** | iframe / dangerouslySetInnerHTML | Sandbox with iframe for safety |
| **Android** | WebView | Same concept, different API |

**Bottom line:** HTML rendering works everywhere. It's a universal solution.

---

## 📝 Summary

| Question | Answer |
|----------|--------|
| **API Access** | BYOK is simplest; add hosted tier for revenue |
| **Cheapest Model** | DeepSeek ($0.07/M) or Gemini Flash ($0.15/M) |
| **Structured Output** | All modern models support it natively |
| **HTML UI** | Yes! WKWebView on native, iframe on web |
| **Image Generation** | FLUX.1 at $0.015/image is very affordable |
| **Both UI + Images** | Absolutely - they work in parallel |
| **Benchmarking** | Build human-in-the-loop rating system |
| **Cost/Conversation** | ~$0.02 with image, ~$0.001 without |

**Key Insight:** HTML generation is actually *easier* than structured UI types because:
1. LLMs are trained on tons of HTML
2. WKWebView handles rendering
3. Tailwind + Chart.js cover 90% of cases
4. It's infinitely flexible
5. Security via sandboxing