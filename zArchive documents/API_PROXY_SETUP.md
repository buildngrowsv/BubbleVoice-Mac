# API Proxy/Forwarding Setup for Bubble Voice

**Goal:** Hide your API keys from the client app, add usage tracking, enable model routing, and provide a single endpoint for all LLM providers.

---

## 🏆 Recommended: Cloudflare AI Gateway (Managed, Zero-Ops)

**Why this is the best choice:**
- ✅ **Zero infrastructure** to maintain
- ✅ **Built specifically for LLM proxying**
- ✅ Global edge network (low latency)
- ✅ Unified logging and analytics
- ✅ Caching support (saves money)
- ✅ Rate limiting and cost controls
- ✅ Streaming support (SSE)
- ✅ **Free tier available**

### Setup Steps:

#### 1. Create AI Gateway (5 minutes)

```bash
# Go to Cloudflare Dashboard
https://dash.cloudflare.com/

# Navigate to: AI > AI Gateway > Create Gateway
# Name: bubble-voice-gateway
# Copy your gateway URL (looks like):
https://gateway.ai.cloudflare.com/v1/{account_id}/bubble-voice-gateway
```

#### 2. Add Provider Keys

In Cloudflare Dashboard:
```
AI Gateway > Settings > Provider Keys

Add:
- OpenAI API Key (for GPT-5.2, GPT-5-mini, GPT-5-nano)
- Google API Key (for Gemini 2.5 Flash-Lite, Gemini 2.0 Flash)
- Anthropic API Key (for Claude 4.5 family)
```

#### 3. Update Your App Code

**Before (direct to OpenAI):**
```swift
let url = URL(string: "https://api.openai.com/v1/chat/completions")!
var request = URLRequest(url: url)
request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
```

**After (via Cloudflare AI Gateway):**
```swift
// Your gateway URL
let gatewayURL = "https://gateway.ai.cloudflare.com/v1/{account_id}/bubble-voice-gateway"

// For OpenAI models
let url = URL(string: "\(gatewayURL)/openai/v1/chat/completions")!
var request = URLRequest(url: url)
request.setValue("Bearer \(cloudflareGatewayToken)", forHTTPHeaderField: "Authorization")

// For Google Gemini models
let url = URL(string: "\(gatewayURL)/google-ai-studio/v1beta/models/gemini-2.5-flash-lite:generateContent")!
request.setValue("Bearer \(cloudflareGatewayToken)", forHTTPHeaderField: "Authorization")

// For Anthropic Claude models
let url = URL(string: "\(gatewayURL)/anthropic/v1/messages")!
request.setValue("Bearer \(cloudflareGatewayToken)", forHTTPHeaderField: "Authorization")
```

#### 4. Enable Features (Optional)

In Cloudflare Dashboard:

**Caching:**
```
AI Gateway > Caching > Enable
- Cache TTL: 1 hour (for repeated queries)
- Saves money on identical requests
```

**Rate Limiting:**
```
AI Gateway > Rate Limiting
- Per user: 100 requests/minute
- Per IP: 1000 requests/hour
```

**Cost Controls:**
```
AI Gateway > Budget Alerts
- Set monthly budget: $100
- Email alert at 80% usage
```

**Analytics:**
```
AI Gateway > Analytics (built-in)
- View requests/day
- Token usage by model
- Cost breakdown
- Latency metrics
```

---

## Alternative 1: Cloudflare Worker (Custom Logic)

**When to use:** You need custom authentication, request transformation, or business logic.

### Setup:

#### 1. Install Wrangler
```bash
npm install -g wrangler
wrangler login
```

#### 2. Create Worker

**wrangler.toml:**
```toml
name = "bubble-voice-proxy"
main = "src/index.ts"
compatibility_date = "2024-11-29"

[vars]
ALLOWED_ORIGINS = "https://yourapp.com"

# Secrets (set via: wrangler secret put SECRET_NAME)
# - OPENAI_API_KEY
# - GOOGLE_API_KEY
# - ANTHROPIC_API_KEY
# - CLIENT_AUTH_SECRET
```

**src/index.ts:**
```typescript
export default {
  async fetch(req: Request, env: any): Promise<Response> {
    const url = new URL(req.url);
    
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Model-Provider",
        },
      });
    }

    // Verify client auth
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    const clientToken = auth.slice(7);
    // TODO: Verify clientToken against your user database
    // For now, check against a shared secret:
    if (clientToken !== env.CLIENT_AUTH_SECRET) {
      return new Response("Invalid token", { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const model = body.model || "";

    // Route to provider based on model prefix
    let provider: "openai" | "google" | "anthropic";
    let upstreamURL: string;
    let upstreamHeaders: Record<string, string>;

    if (model.startsWith("gpt")) {
      provider = "openai";
      upstreamURL = "https://api.openai.com/v1/chat/completions";
      upstreamHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      };
    } else if (model.startsWith("gemini")) {
      provider = "google";
      upstreamURL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${env.GOOGLE_API_KEY}`;
      upstreamHeaders = {
        "Content-Type": "application/json",
      };
      // Transform OpenAI-style to Gemini-style
      body.contents = body.messages?.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      delete body.messages;
      delete body.model;
    } else if (model.startsWith("claude")) {
      provider = "anthropic";
      upstreamURL = "https://api.anthropic.com/v1/messages";
      upstreamHeaders = {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      };
    } else {
      return new Response("Unknown model", { status: 400 });
    }

    // Forward request
    try {
      const response = await fetch(upstreamURL, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(body),
      });

      // Stream response back
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      return new Response(`Upstream error: ${error}`, { status: 502 });
    }
  },
};
```

#### 3. Deploy

```bash
# Set secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put CLIENT_AUTH_SECRET

# Deploy
wrangler deploy

# Your worker will be at:
# https://bubble-voice-proxy.{your-subdomain}.workers.dev
```

#### 4. Use in App

```swift
let proxyURL = "https://bubble-voice-proxy.{your-subdomain}.workers.dev"
var request = URLRequest(url: URL(string: proxyURL)!)
request.setValue("Bearer \(clientAuthSecret)", forHTTPHeaderField: "Authorization")
request.setValue("application/json", forHTTPHeaderField: "Content-Type")

let body: [String: Any] = [
    "model": "gemini-2.5-flash-lite",
    "messages": [
        ["role": "user", "content": "Hello!"]
    ]
]
request.httpBody = try! JSONSerialization.data(withJSONObject: body)
```

---

## Alternative 2: Convex Backend (If You're Using Convex)

**When to use:** You're already using Convex for your backend, want type-safe API calls.

### Setup:

#### 1. Create Convex Action

**convex/llm.ts:**
```typescript
"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";

export const chat = action({
  args: {
    model: v.string(),
    messages: v.array(v.object({
      role: v.string(),
      content: v.string(),
    })),
    stream: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { model, messages, stream } = args;
    
    // Get API keys from environment
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // Route based on model
    let url: string;
    let headers: Record<string, string>;
    let body: any;

    if (model.startsWith("gpt")) {
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      };
      body = { model, messages, stream };
    } else if (model.startsWith("gemini")) {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`;
      headers = { "Content-Type": "application/json" };
      body = {
        contents: messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      };
    } else if (model.startsWith("claude")) {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey!,
        "anthropic-version": "2023-06-01",
      };
      body = {
        model,
        messages,
        max_tokens: 1024,
        stream,
      };
    } else {
      throw new Error("Unknown model");
    }

    // Make request
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    // For non-streaming, return JSON
    if (!stream) {
      return await response.json();
    }

    // For streaming, return text (client handles SSE)
    return await response.text();
  },
});
```

#### 2. Set Environment Variables

```bash
# In Convex dashboard or via CLI
npx convex env set OPENAI_API_KEY "sk-..."
npx convex env set GOOGLE_API_KEY "AIza..."
npx convex env set ANTHROPIC_API_KEY "sk-ant-..."
```

#### 3. Call from Swift

```swift
import ConvexMobile

let client = ConvexClient(deploymentUrl: "https://your-project.convex.cloud")

// Call the action
let result = try await client.action(
    "llm:chat",
    args: [
        "model": "gemini-2.5-flash-lite",
        "messages": [
            ["role": "user", "content": "Hello!"]
        ]
    ]
)
```

**Pros:**
- Type-safe
- Integrated with your backend
- Easy to add usage tracking, rate limiting
- Can store conversation history in Convex

**Cons:**
- Convex actions have timeout limits (5 minutes)
- Streaming is more complex
- Not as optimized for LLM proxying as AI Gateway

---

## Alternative 3: Vercel Edge Functions (If Using Vercel)

**When to use:** You're deploying a web frontend on Vercel, want integrated backend.

### Setup:

#### 1. Create Edge Function

**api/proxy.ts:**
```typescript
export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  // Verify auth
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const model = body.model || "";

  // Route to provider
  let url: string;
  let headers: Record<string, string>;

  if (model.startsWith("gpt")) {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    };
  } else if (model.startsWith("gemini")) {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
    headers = { "Content-Type": "application/json" };
    // Transform body...
  } else {
    return new Response("Unknown model", { status: 400 });
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

#### 2. Set Environment Variables

```bash
# In Vercel dashboard or via CLI
vercel env add OPENAI_API_KEY
vercel env add GOOGLE_API_KEY
vercel env add ANTHROPIC_API_KEY
```

#### 3. Deploy

```bash
vercel deploy
```

---

## Comparison Table

| Solution | Setup Time | Maintenance | Features | Cost | Best For |
|----------|-----------|-------------|----------|------|----------|
| **Cloudflare AI Gateway** | 5 min | Zero | Analytics, caching, rate limiting | Free tier + usage | **Recommended default** |
| Cloudflare Worker | 15 min | Low | Full control, custom logic | $5/month + usage | Custom auth/routing |
| Convex Actions | 10 min | Low | Type-safe, integrated backend | Convex pricing | Already using Convex |
| Vercel Edge | 10 min | Low | Integrated with Vercel | Vercel pricing | Already on Vercel |
| LiteLLM Proxy | 30 min | Medium | 100+ providers, admin UI | Self-hosted | Need multi-provider |

---

## Recommended Setup for Bubble Voice

### Phase 1: MVP (Use Cloudflare AI Gateway)
```
1. Create Cloudflare AI Gateway (5 min)
2. Add provider keys in dashboard
3. Update app to use gateway URL
4. Enable caching and analytics

Benefits:
- Zero code to maintain
- Built-in analytics
- Caching saves money
- Rate limiting included
```

### Phase 2: Custom Logic (Add Cloudflare Worker)
```
When you need:
- User authentication
- Usage tracking per user
- Custom rate limiting
- Request/response transformation

Add a Worker in front of AI Gateway:
Client → Worker (auth) → AI Gateway → Providers
```

### Phase 3: Advanced (Add Convex for State)
```
When you need:
- Conversation history storage
- User profiles and preferences
- Usage quotas and billing
- Real-time updates

Architecture:
Client → Convex (state) → Worker → AI Gateway → Providers
```

---

## Cost Breakdown

### Cloudflare AI Gateway:
```
Free tier: 10,000 requests/day
Paid: $0.01 per 1,000 requests after free tier

For 1M requests/month:
- First 300K: Free
- Next 700K: $7
Total: $7/month
```

### Cloudflare Worker:
```
Free tier: 100,000 requests/day
Paid: $5/month for 10M requests

For most apps: Free tier is enough
```

### Total Infrastructure Cost:
```
MVP (AI Gateway only): $0-7/month
With Worker: $5-12/month
With Convex: +$25/month (Convex Pro)

Compare to LLM costs: $0.34 per 1,000 minutes
Infrastructure is negligible!
```

---

## Security Best Practices

### 1. Never Expose Provider Keys in Client
```swift
// ❌ BAD
let apiKey = "sk-proj-..." // Hardcoded in app

// ✅ GOOD
let proxyURL = "https://gateway.ai.cloudflare.com/..."
let clientToken = "your-app-specific-token"
```

### 2. Implement Rate Limiting
```typescript
// In Worker or AI Gateway
const rateLimit = {
  free: 100,      // requests per hour
  paid: 1000,
  premium: 10000,
};
```

### 3. Validate Requests
```typescript
// Check model is allowed
const allowedModels = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gpt-5-mini",
];

if (!allowedModels.includes(body.model)) {
  return new Response("Model not allowed", { status: 403 });
}
```

### 4. Log Usage (Without PII)
```typescript
// Log metadata only
await logRequest({
  userId: hash(userId),  // Hash, don't store raw
  model: body.model,
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  latency: Date.now() - startTime,
  status: response.status,
  // Don't log: messages, content, user data
});
```

---

## Next Steps

1. **Set up Cloudflare AI Gateway** (5 minutes)
   - Create gateway in dashboard
   - Add provider keys
   - Get gateway URL

2. **Update app code** (10 minutes)
   - Replace direct API calls with gateway URL
   - Test with each provider (OpenAI, Google, Anthropic)

3. **Enable features** (5 minutes)
   - Turn on caching
   - Set rate limits
   - Configure budget alerts

4. **Monitor** (ongoing)
   - Check analytics dashboard
   - Review costs weekly
   - Adjust rate limits as needed

**Total setup time: ~20 minutes**

---

## Document History

- **Created**: January 16, 2026
- **Purpose**: Set up API proxy/forwarding for Bubble Voice
- **Recommendation**: Start with Cloudflare AI Gateway (zero-ops, built for LLMs)
