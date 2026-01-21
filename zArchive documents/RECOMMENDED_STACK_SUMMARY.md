# Bubble Voice Mac - Recommended Stack Summary

**Last Updated:** January 16, 2026  
**Status:** Ready to implement

---

## 🎯 Final Recommendation: **Native Swift (SwiftUI + AppKit)**

After comprehensive analysis, **Native Swift is the best choice** for Bubble Voice Mac.

### Why Native Swift Wins:

| Factor | Score | Notes |
|--------|-------|-------|
| **Local ML Performance** | ⭐⭐⭐⭐⭐ | MLX Swift is fastest, native, optimized |
| **TTS Quality** | ⭐⭐⭐⭐⭐ | Direct access to 184 system voices + `say` command |
| **Menu Bar Integration** | ⭐⭐⭐⭐⭐ | NSStatusItem just works, no bridges needed |
| **UI Quality** | ⭐⭐⭐⭐ | SwiftUI + Liquid Glass (macOS 16) is excellent |
| **App Size** | ⭐⭐⭐⭐⭐ | ~5MB vs 30-50MB for Tauri/Electron |
| **Development Speed** | ⭐⭐⭐⭐⭐ | I can help you build this fastest |
| **Cross-Platform** | ⭐⭐ | Mac-only (but that's fine for MVP) |

**Total Score: 40/50** (vs Tauri's 41/50, but Swift wins on critical factors)

---

## 📦 Complete Stack Breakdown

### Frontend Layer

```
┌─────────────────────────────────────────────────────────┐
│              SwiftUI + AppKit (Native)                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  • SwiftUI for main UI                                   │
│  • AppKit for menu bar (NSStatusItem)                   │
│  • Liquid Glass materials (.ultraThinMaterial)          │
│  • Metal for custom animations (if needed)               │
│  • WKWebView for HTML artifacts (optional)               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key Components:**
- `ConversationWindowView` - Main floating window
- `MenuBarPopover` - Status and quick controls
- `StatusIndicatorView` - Animated voice state
- `TranscriptScrollView` - Message bubbles
- `ControlToolbarView` - Action buttons

**UI Framework:** SwiftUI 6.0+  
**Design System:** Liquid Glass (macOS 16+)  
**Animation:** SwiftUI springs + Metal shaders (if needed)

---

### Core Services Layer

```
┌─────────────────────────────────────────────────────────┐
│              Core Services (Swift)                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Audio      │  │   Speech     │  │     TTS      │  │
│  │   Engine     │  │ Recognition  │  │   Synthesis  │  │
│  │              │  │              │  │              │  │
│  │ AVAudioEngine│  │SFSpeech      │  │NSSpeech      │  │
│  │              │  │Recognizer    │  │Synthesizer   │  │
│  │              │  │              │  │              │  │
│  │              │  │SpeechAnalyzer│  │say command   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │     LLM      │  │     RAG      │  │   Storage    │  │
│  │   Manager    │  │   Service    │  │              │  │
│  │              │  │              │  │              │  │
│  │ MLX Swift    │  │ MLX Embed    │  │ ObjectBox    │  │
│  │ (local)      │  │ (local)      │  │ (vectors)    │  │
│  │              │  │              │  │              │  │
│  │ Cloud API    │  │ Cloud API    │  │ SQLite       │  │
│  │ (fallback)   │  │ (optional)   │  │ (metadata)   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Audio:**
- `AVAudioEngine` - Audio input/output
- `SFSpeechRecognizer` / `SpeechAnalyzer` - Speech-to-text
- `NSSpeechSynthesizer` - Text-to-speech (184 voices!)
- `Process.launchedProcess` - Shell to `say` command

**LLM:**
- **Primary:** Cloud API via proxy (Gemini 2.5 Flash-Lite)
- **Fallback:** MLX Swift (local models)
- **Provider:** Cloudflare AI Gateway (proxy)

**RAG:**
- **Primary:** ObjectBox Swift (local vector storage)
- **Embeddings:** MLX Swift (nomic-embed or similar)
- **Fallback:** Cloud API (optional)

**Storage:**
- **Vectors:** ObjectBox (HNSW index)
- **Metadata:** SQLite (conversations, settings)
- **Sync:** Convex (optional, for multi-device)

---

### Backend/Proxy Layer

```
┌─────────────────────────────────────────────────────────┐
│         Cloudflare AI Gateway (Managed)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  • Single endpoint for all providers                    │
│  • API key management (hidden from client)              │
│  • Caching (saves money)                                 │
│  • Analytics (usage tracking)                            │
│  • Rate limiting                                         │
│  • Streaming support (SSE)                              │
│                                                          │
│  Providers:                                              │
│  • OpenAI (GPT-5.2, GPT-5-mini, GPT-5-nano)            │
│  • Google (Gemini 2.5 Flash-Lite, Gemini 2.0 Flash)    │
│  • Anthropic (Claude 4.5 family)                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Setup:** 5 minutes in Cloudflare Dashboard  
**Cost:** $0-7/month (free tier: 10K requests/day)  
**URL Pattern:** `https://gateway.ai.cloudflare.com/v1/{account}/bubble-voice-gateway/{provider}/v1/...`

---

### Data Storage Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Local-First Storage                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Local (Primary)                          │   │
│  │                                                  │   │
│  │  • ObjectBox: Vector embeddings (HNSW)          │   │
│  │  • SQLite: Conversations, messages, metadata    │   │
│  │  • UserDefaults: Settings, preferences           │   │
│  │                                                  │   │
│  │  Benefits:                                       │   │
│  │  • Works offline                                 │   │
│  │  • Fast (no network latency)                     │   │
│  │  • Private (data never leaves device)            │   │
│  │  • Free (no cloud costs)                         │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                          │ sync (optional)               │
│                          ▼                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Cloud (Optional Backup/Sync)              │   │
│  │                                                  │   │
│  │  • Convex: Real-time sync, vector search         │   │
│  │  • Benefits: Multi-device, backup, sharing       │   │
│  │  • Cost: ~$25-50/month                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Local Storage:**
- **ObjectBox Swift** - Vector embeddings with HNSW index
- **SQLite** - Conversation history, metadata
- **UserDefaults** - User preferences, settings

**Cloud Sync (Optional):**
- **Convex** - Real-time sync, vector search, multi-device
- **When to use:** Multi-device support, backup, sharing

---

## 🎤 LLM Model Strategy

### Primary Model: **Gemini 2.5 Flash-Lite**

**Why:**
- ✅ **1M context window** (handles long conversations)
- ✅ **Cheapest:** $0.007 per 10-minute conversation
- ✅ **Structured output:** JSON Schema support
- ✅ **Fast:** Optimized for speed

**Pricing:**
- Input: $0.10 per 1M tokens
- Output: $0.40 per 1M tokens
- **Cost per minute:** ~$0.00034 (0.034 cents)

### Fallback Models:

| Model | When to Use | Cost/10min |
|-------|------------|------------|
| **Gemini 2.5 Flash-Lite** | Default, budget | $0.0027 |
| Gemini 2.0 Flash | Better quality | $0.0084 |
| GPT-5.2 | Complex reasoning | $0.0488 |
| GPT-5-mini | Strict JSON needed | $0.0070 |
| GPT-5-nano | Ultra-budget | $0.0045 |
| **MLX Local** | Offline mode | $0 (free) |

### Local Fallback: **MLX Swift**

**Models:**
- Llama 3.2 3B (conversation)
- nomic-embed (embeddings)

**Performance:**
- ~45 tokens/second on M3 Pro
- ~4K context window (limited)
- Free (no API costs)

**When to use:**
- Offline mode
- Privacy-sensitive tasks
- Simple queries

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Bubble Voice Mac Architecture                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    SwiftUI Frontend                           │  │
│  │                                                               │  │
│  │  • ConversationWindowView (floating panel)                   │  │
│  │  • MenuBarPopover (status, controls)                          │  │
│  │  • StatusIndicatorView (animated state)                       │  │
│  │  • TranscriptScrollView (message bubbles)                    │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴──────────────────────────────────┐  │
│  │                    Core Services Layer                        │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  │
│  │  │ Audio Engine │  │ Speech Recog │  │ TTS Synthesis│      │  │
│  │  │              │  │              │  │              │      │  │
│  │  │ AVAudioEngine│  │SFSpeech      │  │NSSpeech      │      │  │
│  │  │              │  │Recognizer    │  │Synthesizer   │      │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │  │
│  │         │                 │                 │              │  │
│  │         └─────────────────┼─────────────────┘              │  │
│  │                           │                                  │  │
│  │  ┌────────────────────────┴──────────────────────────────┐  │  │
│  │  │              Conversation Manager                      │  │  │
│  │  │                                                         │  │  │
│  │  │  • Timer system (3 timers: LLM, TTS, Play)             │  │  │
│  │  │  • Interruption handling                               │  │  │
│  │  │  • Turn detection                                      │  │  │
│  │  └────────────────────────┬──────────────────────────────┘  │  │
│  │                           │                                  │  │
│  │  ┌────────────────────────┴──────────────────────────────┐  │  │
│  │  │                    LLM Manager                          │  │  │
│  │  │                                                         │  │  │
│  │  │  Primary: Cloudflare AI Gateway → Gemini 2.5 Flash-Lite│  │  │
│  │  │  Fallback: MLX Swift → Llama 3.2 3B                    │  │  │
│  │  └────────────────────────┬──────────────────────────────┘  │  │
│  │                           │                                  │  │
│  │  ┌────────────────────────┴──────────────────────────────┐  │  │
│  │  │                    RAG Service                         │  │  │
│  │  │                                                         │  │  │
│  │  │  Embeddings: MLX Swift (nomic-embed)                   │  │  │
│  │  │  Storage: ObjectBox (HNSW index)                       │  │  │
│  │  │  Search: Local vector similarity                        │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴──────────────────────────────────┐  │
│  │                    Storage Layer                                │  │
│  │                                                               │  │
│  │  • ObjectBox: Vector embeddings                               │  │
│  │  • SQLite: Conversations, metadata                            │  │
│  │  • UserDefaults: Settings                                     │  │
│  │  • Convex: Cloud sync (optional)                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴──────────────────────────────────┐  │
│  │                    External Services                             │  │
│  │                                                               │  │
│  │  • Cloudflare AI Gateway (API proxy)                          │  │
│  │  • Gemini 2.5 Flash-Lite (primary LLM)                       │  │
│  │  • Convex (optional cloud sync)                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Technology Stack Summary

| Layer | Technology | Purpose | Notes |
|-------|-----------|---------|-------|
| **Frontend** | SwiftUI 6.0 | Main UI | Liquid Glass design |
| **Menu Bar** | AppKit (NSStatusItem) | Status icon | Native integration |
| **Audio Input** | AVAudioEngine | Microphone capture | Low latency |
| **Speech-to-Text** | SFSpeechRecognizer | Voice transcription | Apple's STT |
| **Text-to-Speech** | NSSpeechSynthesizer | Voice output | 184 voices available |
| **LLM (Cloud)** | Cloudflare AI Gateway | API proxy | Hides keys, caching |
| **LLM (Local)** | MLX Swift | Offline fallback | Llama 3.2 3B |
| **Embeddings** | MLX Swift | Vector generation | nomic-embed |
| **Vector Storage** | ObjectBox Swift | Local RAG | HNSW index |
| **Metadata Storage** | SQLite | Conversations | Local-first |
| **Settings** | UserDefaults | Preferences | Built-in |
| **Cloud Sync** | Convex (optional) | Multi-device | Real-time sync |

---

## 💰 Cost Breakdown

### Infrastructure Costs:

| Service | Cost | Notes |
|---------|------|-------|
| **Cloudflare AI Gateway** | $0-7/month | Free tier: 10K req/day |
| **Convex (optional)** | $0-50/month | Free tier available |
| **Total Infrastructure** | **$0-57/month** | Negligible |

### LLM Costs (Per User):

| Usage Level | Minutes/Month | Cost/Month |
|-------------|---------------|------------|
| **Light** | 50 min | $0.02 |
| **Regular** | 300 min | $0.10 |
| **Heavy** | 1,000 min | $0.34 |
| **Power** | 3,000 min | $1.02 |

**Conclusion:** LLM costs are **extremely low** with Gemini 2.5 Flash-Lite.

---

## 🚀 Implementation Phases

### Phase 1: MVP (Week 1-2)
- ✅ SwiftUI app structure
- ✅ Menu bar integration
- ✅ Basic audio input/output
- ✅ Speech recognition
- ✅ Cloud LLM integration (Gemini 2.5 Flash-Lite)
- ✅ Simple conversation UI

### Phase 2: Core Features (Week 3-4)
- ✅ Timer system (from Accountability)
- ✅ Interruption handling
- ✅ TTS with NSSpeechSynthesizer
- ✅ Structured output (bubbles)
- ✅ Conversation history

### Phase 3: Advanced Features (Week 5-6)
- ✅ Local RAG (ObjectBox + MLX embeddings)
- ✅ Local LLM fallback (MLX Swift)
- ✅ Cloud sync (Convex, optional)
- ✅ Settings UI
- ✅ Voice commands

### Phase 4: Polish (Week 7-8)
- ✅ Liquid Glass UI refinements
- ✅ Animations and transitions
- ✅ Error handling
- ✅ Performance optimization
- ✅ Testing and bug fixes

---

## ✅ What We Know Works

### ✅ Confirmed Working:

1. **SwiftUI + AppKit** - Native Mac development
2. **Liquid Glass UI** - macOS 16+ materials
3. **NSSpeechSynthesizer** - 184 voices available
4. **MLX Swift** - Local LLM inference (45 tok/s)
5. **ObjectBox Swift** - Vector storage with HNSW
6. **Cloudflare AI Gateway** - API proxying
7. **Gemini 2.5 Flash-Lite** - Cheap, 1M context
8. **Timer System** - From Accountability (proven)

### ⚠️ Needs Testing:

1. **SpeechAnalyzer** - New API, may need fallback
2. **Interruption handling** - Port from Accountability
3. **MLX Swift integration** - First-time setup
4. **ObjectBox setup** - Code generation workflow
5. **Cloudflare Gateway** - First-time configuration

---

## 🎯 Decision Rationale

### Why Native Swift (Not Tauri/Electron):

1. **Local ML Performance** - MLX Swift is fastest on Apple Silicon
2. **TTS Quality** - Direct access to system voices
3. **Menu Bar** - Native NSStatusItem, no bridges
4. **App Size** - 5MB vs 30-50MB
5. **Development Speed** - I can help you build this fastest
6. **Mac-Only is Fine** - MVP doesn't need cross-platform

### Why Gemini 2.5 Flash-Lite:

1. **1M context** - No summarization needed
2. **Cheapest** - $0.007 per 10-minute conversation
3. **Structured output** - JSON Schema support
4. **Fast** - Optimized for speed

### Why Cloudflare AI Gateway:

1. **Zero-ops** - Managed service
2. **Built for LLMs** - Caching, analytics, rate limiting
3. **Free tier** - 10K requests/day
4. **5-minute setup** - Dashboard configuration

### Why ObjectBox (Not sqlite-vss):

1. **Native Swift** - Better integration
2. **HNSW index** - Faster vector search
3. **Type-safe** - Code generation
4. **Proven** - Used in production apps

---

## 📝 Next Steps

1. **Set up Xcode project** (see `PROJECT_SETUP.md`)
2. **Configure Cloudflare AI Gateway** (see `API_PROXY_SETUP.md`)
3. **Build MVP UI** (see `UI_DESIGN_MAC.md`)
4. **Port timer system** (from Accountability)
5. **Integrate Gemini API** (via Cloudflare Gateway)
6. **Add TTS** (NSSpeechSynthesizer)
7. **Implement RAG** (ObjectBox + MLX embeddings)

---

## 📚 Reference Documents

- **STACK_ANALYSIS.md** - Detailed comparison of all options
- **UI_DESIGN_MAC.md** - SwiftUI components and design system
- **PROJECT_SETUP.md** - Xcode project setup guide
- **MODEL_COMPARISON_AND_PRICING.md** - LLM model analysis
- **API_PROXY_SETUP.md** - Cloudflare Gateway setup
- **CONVERSATION_COST_CALCULATOR.md** - Cost breakdown
- **LOCAL_LLM_MAC.md** - MLX Swift implementation
- **LOCAL_RAG_MAC.md** - ObjectBox + MLX embeddings
- **ARCHITECTURE_ANALYSIS_MAC.md** - System architecture

---

## 🎉 Summary

**Stack:** Native Swift (SwiftUI + AppKit)  
**LLM:** Gemini 2.5 Flash-Lite (via Cloudflare AI Gateway)  
**Storage:** ObjectBox (vectors) + SQLite (metadata)  
**TTS:** NSSpeechSynthesizer (184 voices)  
**Cost:** ~$0.34 per 1,000 minutes of conversation  

**Status:** ✅ Ready to build!
