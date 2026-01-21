# BubbleVoice Mac - Product Intent

**Created:** January 19, 2026  
**Purpose:** Clear, focused product description for development and external communication  
**Status:** Active Reference Document

---

## What We're Building

**BubbleVoice is a personal AI companion for Mac that lets you think out loud about your life - your goals, your kids, your startup, your daily struggles - and have those conversations actually matter.**

Unlike productivity tools that focus on tasks, BubbleVoice focuses on **you as a person**. It's designed for people who need to process their thoughts, work through life decisions, reflect on their day, and feel like their AI conversations are actually being remembered and understood - not disappearing into a void.

---

## The Core Problem We're Solving

**"My AI conversations feel aimless and go into a void."**

People have meaningful conversations with AI about their lives - their kids, their goals, their worries, their growth - but:
- ❌ The AI forgets everything next session
- ❌ They have to re-explain context constantly
- ❌ There's no evidence the conversation mattered
- ❌ No way to see patterns or progress over time
- ❌ It feels like talking into nothingness

**BubbleVoice solves this by making AI conversations feel consequential:**
- ✅ The AI actually remembers your life across months
- ✅ Visual artifacts prove you're being heard and tracked
- ✅ Proactive bubbles show the AI is thinking about YOUR specific context
- ✅ Memory retrieval surfaces patterns you can't see yourself
- ✅ Conversations build on each other, creating ongoing relationship

**Result:** You can use AI as a genuine thinking partner for your personal life, not just a one-shot question-answering tool.

---

## Core Product Principles

### 1. Voice-First, Not Voice-Optional
- Speech is the primary input method
- Real-time transcription appears as you speak
- You can edit transcribed text before sending (like a sophisticated voice memo that you can refine)
- No typing required unless you want to correct something

### 2. Natural Conversation Flow
- Uses a sophisticated three-timer system (0.5s → 1.5s → 2.0s) for buffered response pipeline
- Enables natural turn-taking without awkward pauses or premature cutoffs
- Full interruption support - you can stop the AI mid-response by speaking
- Borrowed from battle-tested Accountability app voice system

### 3. Proactive Intelligence Through "Bubbles"
- AI generates contextual micro-prompts (≤7 words) during conversation
- Bubbles appear in real-time as you or the AI speaks
- Examples: "how's Emma doing?", "that startup worry?", "your sleep goal?"
- Tap to save/expand - these become conversation anchors
- Not random suggestions - contextually relevant to YOUR life and past conversations

### 4. Conversations Generate Artifacts (Evidence of Being Heard)
- Conversations produce persistent visual outputs that prove the AI is tracking what matters to you
- Artifacts are structured data rendered as native UI components
- Types: 
  - **Goal progress charts** ("show me my sleep goal over time")
  - **Life decision cards** (pros/cons for "should I quit my job?")
  - **Personal timelines** ("when did I last talk about my startup idea?")
  - **Reflection summaries** ("what have I said about Emma's school?")
- Artifacts update incrementally as your life evolves ("update my morning routine")
- Graceful failure: version control with revert capability if updates fail
- **Purpose:** Visual proof that your conversations aren't going into a void

### 5. Conversational Memory That Actually Works (Local RAG)
- Every conversation about your life is indexed locally using vector embeddings
- The AI **actually remembers** what you told it about your kids, your goals, your worries
- "What did we discuss about X?" retrieves relevant past conversations automatically
- No perceptible latency - context retrieval happens in background (<30ms)
- Privacy-first: all deeply personal data stays on your device
- Supports years of conversation history (100k+ chunks)
- **This is the core value:** You can have ongoing conversations about your life without re-explaining context every time

---

## Technical Architecture Overview

### Frontend & Distribution
- **Electron-based frontend** for rapid UI development and rich interactions
- **Xcode-wrapped macOS app** for DMG distribution, permissions, and native integration
- Menu bar presence with global hotkey (Cmd+Shift+Space)
- Floating conversation window (always-on-top option)
- iOS 26 Liquid Glass UI aesthetic

### Backend Logic
- **Node.js server** handling all business logic
- Sophisticated timer system for turn detection and response buffering
- Interruption handling with cached response management
- Multi-provider LLM integration (cloud + local fallback)

### Voice Pipeline
- **Speech-to-Text:** Apple's SFSpeechRecognizer / SpeechAnalyzer (macOS 16+)
- **LLM:** Primary cloud APIs (Gemini 2.5 Flash-Lite via Cloudflare AI Gateway)
- **TTS:** NSSpeechSynthesizer (184 system voices) + cloud options
- **Local Fallback:** MLX Swift for offline LLM inference (7B-14B models)

### Memory & Storage
- **Vector Storage:** ObjectBox with HNSW index for fast similarity search
- **Embeddings:** MLX Swift (local) for privacy
- **Metadata:** SQLite for conversation history, settings
- **Cloud Sync:** Optional (Convex) for multi-device future

---

## Why This Stack?

### Electron + Xcode Hybrid
- **Electron:** Rapid UI iteration, rich web-based interactions, cross-platform potential
- **Xcode Wrapper:** Native macOS app bundle, DMG installer, permissions requests (microphone, accessibility)
- **Node Backend:** Familiar ecosystem, easy to maintain complex voice pipeline logic

### Voice AI Stack
- **Apple Speech Recognition:** Zero cost, excellent quality, on-device privacy
- **Cloudflare AI Gateway:** API key hiding, caching (saves money), provider abstraction
- **Gemini 2.5 Flash-Lite:** $0.007 per 10-minute conversation, 1M context window, structured output support
- **MLX Swift:** Fastest local inference on Apple Silicon, 7B-14B models fit in 16GB RAM

### Storage Strategy
- **Local-first:** Works offline, fast, private, no recurring cloud costs
- **ObjectBox:** Native Swift, HNSW index, type-safe, production-proven
- **Optional Cloud:** Future-proofing for multi-device sync

---

## Types of Personal Conversations This Enables

### Life Reflection & Processing
- **Daily decompression:** "Today was rough with the kids..."
- **Decision-making:** "Should I take this job offer? Let me think through it..."
- **Relationship processing:** "I'm frustrated with how my partner handled..."
- **Parenting challenges:** "Emma's been struggling in school and I don't know if..."

### Goal Setting & Progress
- **Setting personal goals:** "I want to get better at exercise and sleep"
- **Progress check-ins:** "Show me how I've been doing with my morning routine"
- **Adjusting goals:** "That exercise goal isn't working, let's revise it"
- **Pattern recognition:** "Why do I always feel anxious on Sundays?"

### Startup / Work Life Balance
- **Founder therapy:** "The startup is consuming everything and I feel guilty about the kids"
- **Work-life decisions:** "How do I prioritize when everything feels urgent?"
- **Career pivots:** "I've been thinking about quitting and doing X instead"

### Personal Growth & Self-Understanding
- **Behavior patterns:** "Why do I keep procrastinating on this?"
- **Emotional processing:** "I've been feeling burned out and I can't pinpoint why"
- **Life satisfaction:** "What have I been most worried about lately?"
- **Self-reflection:** "Am I making progress on what matters to me?"

### Family & Relationships
- **Parenting concerns:** "How do I handle Emma's screen time habits?"
- **Relationship dynamics:** "My partner and I keep arguing about..."
- **Family planning:** "Thinking about our summer vacation options"
- **Extended family:** "My mom's health has been declining..."

### Home & Life Management
- **Home projects:** "Need to think through this kitchen renovation"
- **Life organization:** "How should I structure my mornings with the kids' schedules?"
- **Chore strategy:** "I hate grocery shopping, maybe there's a better system"

**The pattern:** These are ongoing, evolving concerns that benefit from continuous AI memory and relationship-building, not one-shot answers.

---

## Key User Flows

### Personal Reflection Conversation
1. Press **Cmd+Shift+Space** → Floating window appears, mic activates
2. **User speaks:** "I'm feeling overwhelmed with the kids' school stuff and the startup deadline"
   - Words appear in editable text field in real-time
   - Bubbles start appearing: "Emma's project?" "last startup talk?" "your sleep?"
3. **User pauses** (silence detected)
   - 0.5s: LLM processing starts (cached)
   - RAG retrieves: past conversations about kids, startup, sleep patterns
   - 1.5s: TTS generation starts (uses cached LLM result)
   - 2.0s: Audio playback begins
4. **AI responds** with voice + text
   - "Last week you mentioned Emma's science project was due Friday. And you were worried about the pitch deck deadline. Want to talk through prioritizing?"
   - More bubbles surface: "break it down?" "what's urgent?" "delegate anything?"
   - User taps "break it down?" bubble → Saves to context
5. **User interrupts:** "Wait, actually the pitch got moved to next month"
   - AI stops immediately (<100ms)
   - All cached responses cleared
   - Memory updated: pitch deadline moved
   - Ready for new input
6. **User says:** "Show me what I've been stressed about lately"
   - Artifact generated: Timeline of stress topics over past 2 weeks
   - Appears in center panel: kids (40%), startup (35%), home repairs (15%), sleep (10%)
   - Conversation continues in right panel

### Life Memory Recall
1. **User:** "When did I last talk about wanting to exercise more?"
2. **System (behind scenes):**
   - Embeds query (15ms)
   - Vector search (10ms)
   - Retrieves 5 relevant chunks from past conversations about exercise, health goals, morning routines
   - Injects into LLM context
3. **AI Response:** "You mentioned it three times in the past month. Two weeks ago you said you wanted to start with 20-minute walks. Last Tuesday you were frustrated about not having time. And a month ago you set a goal to exercise 3x per week but said the kids' schedule made it hard. Want to revisit that goal?"
4. **Bubbles shown:** "what's blocking you?", "adjust the goal?", "show progress chart"
5. **User taps "show progress chart"** → Artifact loads showing exercise conversations over time, reveals pattern: always discussed on Sundays after feeling guilty

---

## What Makes This Different

### vs. ChatGPT Voice
- ✅ **Personal life focus** (not task/productivity focus)
- ✅ **Actually remembers your life** across months of conversations
- ✅ Generates personal artifacts about YOUR life patterns
- ✅ Proactive suggestions based on what matters to YOU
- ✅ Three-timer system for natural conversation flow
- ✅ Privacy: deeply personal conversations stay on your device

### vs. Siri
- ✅ **Designed for personal reflection**, not commands
- ✅ Conversational memory (Siri forgets everything)
- ✅ Understands your family, goals, struggles (not just facts)
- ✅ Generates persistent artifacts about your life
- ✅ Sophisticated voice interaction (editable transcription, interruption)

### vs. Replika / Character.AI
- ✅ **Functional personal AI**, not a friend simulator
- ✅ Generates actionable insights and artifacts (not just chat)
- ✅ Privacy-first local storage (not cloud conversations)
- ✅ Voice-native (not text-based roleplaying)

### vs. Therapy Apps / Journaling Apps
- ✅ **Voice-first** (speak naturally, don't type)
- ✅ AI responds and engages (not passive journaling)
- ✅ Proactive memory retrieval (AI connects patterns you miss)
- ✅ Visual artifacts show your life patterns over time

---

## Success Criteria

### Technical Performance
- Speech-to-display latency: **<100ms**
- LLM first token: **<500ms**
- TTS first byte: **<300ms**
- RAG query: **<30ms**
- Interruption response: **<100ms**

### User Experience
- Turn detection accuracy: **95%+**
- Voice vs. text input ratio: **80%+ voice**
- Artifact generation success: **95%+ valid**
- RAG retrieval relevance: **85%+ relevant**

### Business (if monetized)
- Cost per conversation (10 min): **<$0.01**
- App memory usage: **<4GB**
- App launch time: **<2 seconds**

---

## Development Priorities

### Phase 1: Foundation (Weeks 1-2)
- Electron app shell with Xcode wrapper
- Node backend with audio pipeline
- Speech recognition integration
- Basic LLM integration (cloud)
- TTS playback

### Phase 2: Conversation (Weeks 3-4)
- Three-timer system (port from Accountability)
- Interruption handling (port from Accountability)
- Bubble system (structured output in parallel)
- Editable transcription UI

### Phase 3: Intelligence (Weeks 5-6)
- Local RAG setup (ObjectBox + MLX embeddings)
- Artifact generation system (JSON → native renders)
- Conversation history and retrieval

### Phase 4: Polish (Weeks 7-8)
- Liquid Glass UI implementation
- Animations and transitions
- Settings and model selection
- DMG packaging and distribution

---

## Non-Goals (v1.0)

These are explicitly deferred to focus on core personal AI experience:

- ❌ **Task management / to-do lists** (this is not a productivity tool)
- ❌ **Calendar / email integration** (keep it personal, not work-focused)
- ❌ **Action-taking** (AI eventually may take action, but v1 is listening & remembering)
- ❌ Mobile version (Mac-first MVP, private space for personal conversations)
- ❌ Multi-user / sharing (deeply personal, single-user by design)
- ❌ Multi-language support (English only for v1)
- ❌ Custom wake words
- ❌ Plugin / extension system
- ❌ 100% offline mode (cloud LLM is acceptable for better understanding)

---

## Cost Economics

### Infrastructure
- **Cloudflare AI Gateway:** $0-7/month (free tier: 10K req/day)
- **Development:** Standard Mac dev tools (Xcode, Node, VS Code)
- **No cloud hosting** required (local-first)

### Per-User API Costs (Gemini 2.5 Flash-Lite)
| Usage Level | Minutes/Month | Cost/Month |
|-------------|---------------|------------|
| Light       | 50 min        | $0.02      |
| Regular     | 300 min       | $0.10      |
| Heavy       | 1,000 min     | $0.34      |
| Power       | 3,000 min     | $1.02      |

**Conclusion:** LLM costs are negligible. Focus is on product experience, not infrastructure cost optimization.

---

## Reference Implementation

The **Accountabilityv6-callkit** app serves as the reference for:
- ✅ Three-timer turn detection system
- ✅ Voice interruption handling
- ✅ Multi-provider API client structure
- ✅ Sophisticated conversation state management
- ✅ Structured output patterns for analysis

**Key preservation:** The timer system is battle-tested and should be ported with minimal changes. It's the heart of natural conversation flow.

---

## Why Electron + Xcode (Not Pure Swift)?

### The Case for Hybrid:
1. **UI Development Speed:** Web-based UI is faster to iterate, especially for novel interactions
2. **Rich Interactions:** HTML/CSS/JS for artifact rendering is more flexible than SwiftUI
3. **Node Backend Familiarity:** Voice pipeline logic is complex - Node ecosystem is mature
4. **Native Integration:** Xcode wrapper provides DMG, permissions, menu bar, global hotkeys
5. **Future Platform Flexibility:** Electron app could expand to Windows/Linux

### Trade-offs Accepted:
- ⚠️ Larger app size (~50MB vs ~5MB pure Swift)
- ⚠️ Higher memory usage (~200MB vs ~50MB pure Swift)
- ✅ But: Worth it for development velocity and UI flexibility
- ✅ Mac users have 16GB+ RAM typically
- ✅ 50MB download is negligible on modern connections

---

## Market Positioning

### Target User: "The Overwhelmed Human"
- Age: 28-55
- Life Stage: Juggling family, career, personal growth
- Occupation: Parents, entrepreneurs, professionals trying to balance it all
- Behavior: 
  - Thinks out loud when processing life decisions
  - Has ongoing concerns (kids, health, relationships, career) that need continuous reflection
  - Wants to work on personal goals but struggles with consistency
  - Feels like conversations with AI are aimless or forgotten
- Pain Points:
  - "I've told ChatGPT about my situation 10 times and it never remembers"
  - "I need to process my thoughts but typing feels too slow and formal"
  - "My AI conversations feel like they go into a void"
  - "I have goals but no system to actually track if I'm making progress"
  - "I want to reflect on my life but journaling apps feel like work"
- Goal: 
  - Have ongoing conversations about life that actually build on each other
  - Feel heard and remembered by an AI companion
  - See patterns in their life they can't see themselves
  - Work through personal challenges with a thinking partner

### Pricing Strategy (TBD)
- **Option 1:** Free (user provides own API keys)
- **Option 2:** Freemium (free with usage limits, paid for unlimited)
- **Option 3:** One-time purchase (DMG distribution, no subscription)
- **Option 4:** Subscription ($5-10/month, includes API costs)

**Recommendation:** Start with Option 1 (user API keys) to validate demand, then evaluate monetization.

---

## Open Questions

| Question | Decision Date | Notes |
|----------|---------------|-------|
| Final app name? | Week 1 | BubbleVoice vs alternatives |
| Monetization model? | Week 4 | After initial user feedback |
| TestFlight vs direct DMG? | Week 6 | Distribution strategy |
| Analytics approach? | Week 4 | Privacy-preserving telemetry |
| Multi-device sync in v1? | Week 2 | Convex integration or defer |

---

## Summary

**BubbleVoice is a personal AI companion for Mac that actually remembers your life - your kids, your goals, your struggles - and helps you work through them over time.**

**Core promise: Your voice conversations about your personal life won't go into a void. The AI remembers, connects patterns, generates artifacts, and becomes a genuine thinking partner for your life.**

**Technical approach: Electron frontend + Xcode wrapper, Node backend, cloud LLM with local fallback, local-first RAG (privacy for personal data), marketing-polished Liquid Glass UI.**

**Primary differentiation: Personal life focus + actually functional memory + evidence-based artifacts + proactive life context = a personal companion, not a productivity tool or chat toy.**

---

**This document serves as the north star for development decisions, external communication, and feature prioritization.**

---

**Last Updated:** January 19, 2026  
**Next Review:** After Phase 1 completion (Week 2)
