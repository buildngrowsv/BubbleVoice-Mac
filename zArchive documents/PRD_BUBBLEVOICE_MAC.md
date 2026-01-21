# BubbleVoice Mac - Product Requirements Document (PRD)

**Document Version:** 1.0  
**Created:** 2026-01-18  
**Author:** AI Product Team  
**Status:** Draft for Review

---

## 1. Executive Summary

### 1.1 Product Vision

BubbleVoice Mac is a **voice-native AI companion** that transforms how people interact with AI assistants. Unlike traditional chatbots that require typing, BubbleVoice is designed around natural speech, enabling users to think out loud while receiving intelligent assistance through voice, visual artifacts, and contextual "bubbles" - real-time micro-prompts that surface during conversation.

### 1.2 Problem Statement

Current AI assistants suffer from:

| Problem | Impact |
|---------|--------|
| **Text-first interfaces** | Friction between thought and input; interrupts flow |
| **Rigid turn-taking** | Unnatural "speak → wait → respond" pattern |
| **Lost context** | Previous conversations forgotten or hard to retrieve |
| **Ephemeral outputs** | Valuable insights disappear after conversation |
| **No proactive assistance** | AI only responds, never suggests |

### 1.3 Solution Overview

BubbleVoice Mac addresses these problems through:

1. **Voice-First Design** - Speak naturally; see and edit your words in real-time
2. **Intelligent Turn Detection** - Three-timer system enables natural conversation flow
3. **Persistent Memory** - Local RAG ensures past conversations inform present ones
4. **Artifact Generation** - Conversations produce lasting visual outputs (charts, tables, summaries)
5. **Proactive Bubbles** - AI surfaces relevant thoughts and questions as you speak

### 1.4 Target Platform

**macOS 15+ (Sequoia)** on Apple Silicon (M1/M2/M3/M4)

**Rationale:**
- Full local LLM capability (7B-14B models)
- Always-on listening without iOS background restrictions
- Menu bar integration for accessibility
- Larger memory for sophisticated RAG
- Faster development iteration

---

## 2. Target Users

### 2.1 Primary Persona: "The Reflective Professional"

**Demographics:**
- Age: 28-55
- Occupation: Knowledge workers, entrepreneurs, creatives
- Technical comfort: Moderate to high
- Mac users (primary work machine)

**Behaviors:**
- Thinks out loud when problem-solving
- Juggles multiple projects and priorities
- Values deep work and reflection time
- Uses AI tools but frustrated by friction

**Pain Points:**
- "Typing breaks my train of thought"
- "I forget what I talked about last week"
- "AI responses feel disconnected from my life"
- "I have to re-explain context every time"

**Goals:**
- Process thoughts without typing friction
- Get personalized insights based on history
- Create lasting artifacts from conversations
- Stay organized across multiple threads

### 2.2 Secondary Persona: "The Productivity Optimizer"

**Demographics:**
- Age: 25-45
- Occupation: Executives, managers, consultants
- Technical comfort: High
- Heavy calendar and meeting load

**Behaviors:**
- Time-constrained, values efficiency
- Needs quick capture of ideas
- Uses voice notes and dictation
- Wants actionable outputs, not just chat

**Pain Points:**
- "Meetings generate ideas I never capture"
- "I need summaries, not conversations"
- "AI should help me track commitments"
- "Voice assistants feel like toys"

**Goals:**
- Quick voice capture during commute/transitions
- Automatic summarization and extraction
- Reminder scheduling through conversation
- Professional-grade output generation

### 2.3 Anti-Personas (Not Target Users)

- Users seeking real-time phone call transcription
- Users needing team collaboration features
- Users primarily on mobile (iOS version future)
- Users requiring multi-language support (v1 English only)

---

## 3. Product Requirements

### 3.1 Core Features (MVP - v1.0)

#### F1: Voice Conversation Engine

**Description:** Natural voice interaction with intelligent turn detection and interruption handling.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F1.1 | Continuous speech recognition with partial results | P0 | <100ms latency for display |
| F1.2 | Three-timer turn detection (0.5s/1.5s/2.0s) | P0 | From Accountability, battle-tested |
| F1.3 | Voice interruption support | P0 | User can interrupt AI anytime |
| F1.4 | Editable speech input | P1 | See and edit words before sending |
| F1.5 | High-quality TTS output | P0 | Local or cloud, <500ms first byte |
| F1.6 | Wake word activation | P1 | "Hey Turtle" / "Hey Rabbit" |
| F1.7 | Voice commands | P1 | Stop, pause, interrupt, etc. |

**Acceptance Criteria:**
- Speech appears on screen within 100ms of speaking
- Turn detection feels natural (not cutting off prematurely)
- Interruption stops AI speech within 100ms
- TTS quality comparable to Siri/Alexa

#### F2: Bubble System

**Description:** Real-time AI-generated micro-prompts that surface during conversation.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F2.1 | Generate bubbles in parallel with main response | P0 | Must not add latency |
| F2.2 | Maximum 7 words per bubble | P0 | Concise, glanceable |
| F2.3 | 3-5 bubbles per turn | P1 | Not overwhelming |
| F2.4 | Tap bubble to save/expand | P1 | Saves to context |
| F2.5 | Contextually relevant to conversation | P0 | Not random suggestions |
| F2.6 | Reference past conversations when relevant | P2 | Via RAG |

**Acceptance Criteria:**
- Bubbles appear within 500ms of user finishing speaking
- Bubbles feel relevant to conversation topic
- Tapping a bubble visibly saves it
- No more than 5 bubbles shown at once

#### F3: Artifact Generation

**Description:** Conversations produce persistent visual outputs rendered as native UI components.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F3.1 | Generate structured JSON artifacts | P0 | Type-safe, validated |
| F3.2 | Render native SwiftUI components | P0 | Not WebView/HTML |
| F3.3 | Support progress charts | P1 | Goals, metrics tracking |
| F3.4 | Support data tables | P1 | Structured information |
| F3.5 | Support comparison cards (pros/cons) | P1 | Decision support |
| F3.6 | Support checklists | P1 | Action items |
| F3.7 | Support timeline views | P2 | Project planning |
| F3.8 | Artifact versioning with revert | P1 | Graceful failure |
| F3.9 | Update artifacts via JSON patches | P1 | Not full regeneration |
| F3.10 | Image generation on request | P2 | FLUX.1 or similar |

**Acceptance Criteria:**
- Artifacts render correctly without hallucinated layouts
- User can request "show me a chart of X" and get one
- Artifacts persist between sessions
- Failed updates revert to last working state

#### F4: Conversational Memory (RAG)

**Description:** Local vector-based retrieval of past conversations to inform present ones.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F4.1 | Index all conversations locally | P0 | Privacy-first |
| F4.2 | Automatic context retrieval per prompt | P0 | 3-5 relevant chunks |
| F4.3 | On-demand deep retrieval (tool call) | P1 | 10-20 chunks |
| F4.4 | Hybrid search (vector + keyword) | P1 | Better precision |
| F4.5 | Query latency <30ms | P0 | Real-time interaction |
| F4.6 | Support 100k+ chunks | P1 | Years of conversations |
| F4.7 | Semantic chunking by paragraphs | P1 | Natural boundaries |

**Acceptance Criteria:**
- "What did we discuss about X?" retrieves relevant past conversation
- No perceptible delay from RAG retrieval
- Privacy: all data stays on device
- Index survives app updates

#### F5: User Interface

**Description:** macOS-native interface with menu bar integration and floating window.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F5.1 | Menu bar status icon | P0 | Always accessible |
| F5.2 | Floating conversation window | P0 | Always on top option |
| F5.3 | Global hotkey (Cmd+Shift+Space) | P0 | Quick activation |
| F5.4 | Three-panel layout (history/artifact/voice) | P1 | Desktop usage pattern |
| F5.5 | Conversation history list | P1 | Grouped by date |
| F5.6 | Artifact viewer with tabs | P1 | Switch between outputs |
| F5.7 | Liquid Glass UI styling | P2 | macOS 15+ aesthetic |
| F5.8 | Waveform visualization | P2 | Visual feedback |
| F5.9 | Settings window | P1 | Model selection, voice, etc. |

**Acceptance Criteria:**
- App feels native to macOS
- Menu bar icon visible when app running
- Hotkey works from any app
- Window can be collapsed/expanded

#### F6: LLM Integration

**Description:** Flexible LLM backend supporting local and cloud options.

**Requirements:**

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| F6.1 | Local LLM via MLX Swift | P1 | 7B-14B models |
| F6.2 | Cloud fallback (OpenAI/Anthropic) | P0 | Required for quality |
| F6.3 | Streaming token responses | P0 | Low perceived latency |
| F6.4 | Structured output support | P0 | JSON mode |
| F6.5 | Provider switching in settings | P1 | User choice |
| F6.6 | API key management | P0 | Secure storage |

**Acceptance Criteria:**
- First token appears within 500ms
- Structured outputs are valid JSON
- Can switch providers without restart
- API keys stored in Keychain

---

### 3.2 Deferred Features (v2.0+)

| Feature | Rationale for Deferral |
|---------|------------------------|
| iOS/iPad version | Mac-first for development speed |
| Team collaboration | Focus on individual users first |
| Multi-language support | English optimization first |
| Custom wake words | Standard words sufficient for MVP |
| Plugin/extension system | Core functionality first |
| Calendar integration | Third-party integrations later |
| Email/messaging integration | Core voice experience first |
| Offline LLM-only mode | Cloud fallback acceptable for v1 |

---

## 4. User Flows

### 4.1 Quick Voice Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUICK VOICE INTERACTION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User presses Cmd+Shift+Space                               │
│      └─ Floating window appears, mic activates                  │
│                                                                  │
│   2. User speaks: "I need to think through the launch plan"     │
│      └─ Words appear in editable text field                     │
│      └─ Bubbles start appearing: "timeline?" "budget?" "team?"  │
│                                                                  │
│   3. User pauses (silence detected)                             │
│      └─ 0.5s: LLM processing starts (cached)                    │
│      └─ 1.5s: TTS generation starts (uses cached LLM)           │
│      └─ 2.0s: Audio plays                                       │
│                                                                  │
│   4. AI responds with voice + text                              │
│      └─ More bubbles surface as AI speaks                       │
│      └─ User taps "timeline?" bubble                            │
│      └─ Bubble saved to context for follow-up                   │
│                                                                  │
│   5. User interrupts: "Wait, let me rephrase"                   │
│      └─ AI stops immediately                                    │
│      └─ All cached responses cleared                            │
│      └─ Ready for new input                                     │
│                                                                  │
│   6. Conversation continues naturally...                        │
│                                                                  │
│   7. User says "Show me a timeline for this"                    │
│      └─ Artifact generated (timeline view)                      │
│      └─ Appears in center panel                                 │
│      └─ Conversation continues in right panel                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Memory Recall Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY RECALL FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User: "What did we discuss about the marketing budget?"    │
│                                                                  │
│   2. System (behind scenes):                                    │
│      └─ Embed query: 15ms                                       │
│      └─ Vector search: 10ms                                     │
│      └─ Retrieve 5 relevant chunks                              │
│      └─ Inject into LLM context                                 │
│                                                                  │
│   3. AI Response:                                               │
│      "Last Tuesday, you mentioned the marketing budget was      │
│       $50k, and you were considering allocating 40% to          │
│       digital ads. You also noted concerns about ROI tracking.  │
│       Would you like me to pull up the comparison card we       │
│       created?"                                                 │
│                                                                  │
│   4. Bubbles shown:                                             │
│      └─ "ROI concerns?"                                         │
│      └─ "digital vs traditional?"                               │
│      └─ "show the card"                                         │
│                                                                  │
│   5. User taps "show the card"                                  │
│      └─ Past artifact loaded into viewer                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Artifact Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   ARTIFACT GENERATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. User: "Create a pros and cons list for remote work"        │
│                                                                  │
│   2. System detects artifact intent                             │
│      └─ Routes to artifact agent                                │
│      └─ Generates JSON with type: "comparison_card"             │
│                                                                  │
│   3. JSON Generated:                                            │
│      {                                                          │
│        "type": "comparison_card",                               │
│        "title": "Remote Work Analysis",                         │
│        "pros": [                                                │
│          { "text": "No commute", "weight": 0.9 },              │
│          { "text": "Flexible schedule", "weight": 0.8 },       │
│          ...                                                    │
│        ],                                                       │
│        "cons": [                                                │
│          { "text": "Less collaboration", "weight": 0.7 },      │
│          ...                                                    │
│        ]                                                        │
│      }                                                          │
│                                                                  │
│   4. SwiftUI renders ComparisonCardView(data)                   │
│      └─ Appears in artifact viewer                              │
│      └─ Tabs show [Pros/Cons Card]                              │
│                                                                  │
│   5. User: "Add 'better focus' to the pros"                     │
│      └─ JSON patch generated                                    │
│      └─ UI updates instantly                                    │
│      └─ Version saved for revert                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Success Metrics

### 5.1 Engagement Metrics

| Metric | Target (v1.0) | Measurement |
|--------|---------------|-------------|
| Daily Active Users (DAU) | 1,000+ | Analytics |
| Sessions per user per day | 2.5+ | Analytics |
| Average session duration | 5+ minutes | Analytics |
| Voice vs text input ratio | 80%+ voice | Event tracking |
| Conversation completion rate | 90%+ | Not abandoned mid-sentence |

### 5.2 Quality Metrics

| Metric | Target (v1.0) | Measurement |
|--------|---------------|-------------|
| Turn detection accuracy | 95%+ | User feedback, testing |
| Interruption response time | <100ms | Instrumentation |
| RAG retrieval relevance | 85%+ relevant | User feedback |
| Artifact generation success | 95%+ valid JSON | Error logs |
| Speech recognition accuracy | 95%+ | Apple's baseline |

### 5.3 Performance Metrics

| Metric | Target (v1.0) | Measurement |
|--------|---------------|-------------|
| Speech-to-display latency | <100ms | Instrumentation |
| LLM first token latency | <500ms | Instrumentation |
| TTS first byte latency | <300ms | Instrumentation |
| RAG query latency | <30ms | Instrumentation |
| App memory usage | <4GB | Profiling |
| App launch time | <2s | Profiling |

### 5.4 Business Metrics (if monetized)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Conversion (free → paid) | 5%+ | Billing |
| Monthly churn | <5% | Billing |
| NPS | 50+ | Survey |
| Support tickets per user | <0.1/month | Support system |

---

## 6. Constraints & Assumptions

### 6.1 Technical Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Apple Silicon required | No Intel Mac support | 90%+ of new Macs are AS |
| macOS 15+ required | Older macOS excluded | Target early adopters |
| 8GB RAM minimum | Limits local LLM | Cloud fallback |
| 16GB RAM recommended | Best experience | Document clearly |
| Internet for cloud LLM | Not fully offline | Local LLM option |

### 6.2 Business Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| API costs | Per-conversation cost | Usage limits, local LLM |
| Not App Store | Manual distribution | DMG installer, Notarization |
| Single developer | Limited velocity | Prioritize ruthlessly |

### 6.3 Assumptions

| Assumption | Risk if Wrong | Validation |
|------------|---------------|------------|
| Users prefer voice to typing | Core value prop fails | User testing |
| Bubbles add value | Perceived as clutter | A/B testing |
| Local RAG sufficient | Privacy concerns or performance | Benchmark testing |
| Mac-first is correct | Mobile more important | Market research |
| Turn detection timings work | Feels unnatural | User testing |

---

## 7. Risks & Mitigations

### 7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Local LLM quality insufficient | Medium | High | Cloud fallback default |
| RAG retrieval latency too high | Low | High | Optimize HNSW, reduce chunks |
| Turn detection feels wrong | Medium | High | User-adjustable timers |
| TTS quality not acceptable | Low | Medium | Multiple TTS providers |
| Memory usage too high | Medium | Medium | Lazy loading, limits |

### 7.2 Product Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bubbles feel gimmicky | Medium | Medium | Test different UX, make optional |
| Artifacts not useful | Low | Medium | Focus on core types first |
| Too complex for users | Medium | High | Simple default mode |
| Privacy concerns | Low | High | All local, clear messaging |

### 7.3 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API costs unsustainable | Medium | High | Usage caps, local priority |
| No market demand | Low | Critical | Validate with beta users |
| Competition launches similar | Medium | Medium | Speed to market, differentiation |

---

## 8. Timeline & Milestones

### 8.1 Development Phases

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Foundation** | 2 weeks | Audio engine, speech recognition, basic UI |
| **Phase 2: Conversation** | 2 weeks | Timer system, LLM integration, TTS |
| **Phase 3: Intelligence** | 2 weeks | RAG setup, bubble system, routing |
| **Phase 4: Artifacts** | 2 weeks | JSON schema, native components, versioning |
| **Phase 5: Polish** | 2 weeks | UI refinement, settings, optimization |
| **Phase 6: Beta** | 2 weeks | TestFlight, bug fixes, iteration |

**Total: ~12 weeks to v1.0 beta**

### 8.2 Key Milestones

| Milestone | Date | Criteria |
|-----------|------|----------|
| M1: Voice Works | Week 2 | Can speak → see text → hear response |
| M2: Feels Natural | Week 4 | Turn detection + interruption smooth |
| M3: Remembers | Week 6 | RAG retrieves relevant past conversations |
| M4: Creates Value | Week 8 | Artifacts generated and useful |
| M5: Beta Ready | Week 10 | Feature complete, stable |
| M6: Launch | Week 12 | Public release |

---

## 9. Open Questions

| Question | Owner | Due Date |
|----------|-------|----------|
| Final wake word choice? | Product | Week 1 |
| Monetization model (subscription/usage/free)? | Business | Week 4 |
| App name finalized (BubbleVoice vs alternatives)? | Product | Week 2 |
| TestFlight distribution or direct? | Engineering | Week 6 |
| Privacy policy & terms needed? | Legal | Week 8 |
| Analytics provider selection? | Engineering | Week 4 |

---

## 10. Appendix

### 10.1 Competitive Landscape

| Competitor | Strengths | Weaknesses | BubbleVoice Differentiation |
|------------|-----------|------------|----------------------------|
| Siri | Native, free | No memory, rigid | Memory, artifacts, bubbles |
| ChatGPT Voice | Quality responses | No Mac app, no memory | Native Mac, local RAG |
| Otter.ai | Transcription quality | Not conversational | Real-time AI conversation |
| Notion AI | Artifact creation | Text-first | Voice-native |
| Raycast AI | Mac-native | Text-first | Voice-native, bubbles |

### 10.2 Glossary

| Term | Definition |
|------|------------|
| **Bubble** | Short (≤7 word) AI-generated prompt/question shown during conversation |
| **Artifact** | Persistent visual output (chart, table, etc.) generated from conversation |
| **Turn Detection** | System for determining when user has finished speaking |
| **RAG** | Retrieval-Augmented Generation - using past data to inform AI responses |
| **Timer System** | Three-timer approach (0.5s/1.5s/2.0s) for buffered response pipeline |

### 10.3 References

- VISION_INTERPRETATION.md - Original vision document
- ARCHITECTURE_ANALYSIS_MAC.md - Technical architecture
- VECTOR_SEARCH_AND_AGENTIC_ARCHITECTURE.md - RAG and agent design
- Accountability app - Reference implementation for timer/interruption

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-18 | AI Product Team | Initial draft |

---

**Approval:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | | | |
| Engineering Lead | | | |
| Design Lead | | | |

---

**End of PRD**