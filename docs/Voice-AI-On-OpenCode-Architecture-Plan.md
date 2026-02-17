# Voice AI on OpenCode — Architecture Plan, Limitations, and Possibilities

> **Date**: February 13, 2026
> **Context**: Evaluating whether to build BubbleVoice's voice AI layer on top of OpenCode's agentic coding engine rather than maintaining a custom LLM/tool/editing pipeline.

---

## Table of Contents

1. [What OpenCode Already Provides](#what-opencode-already-provides)
2. [Proposed Architecture](#proposed-architecture)
3. [How Step Modulation Works](#how-step-modulation-works)
4. [What We Keep from BubbleVoice-Mac](#what-we-keep-from-bubblevoice-mac)
5. [What We Drop from BubbleVoice-Mac](#what-we-drop-from-bubblevoice-mac)
6. [What Needs to Be Built](#what-needs-to-be-built)
7. [OpenCode's File Editing System — Why It's Better](#opencodes-file-editing-system)
8. [How SSE Streaming Enables Voice](#how-sse-streaming-enables-voice)
9. [Limitations and Risks](#limitations-and-risks)
10. [What's Possible That Wasn't Before](#whats-possible-that-wasnt-before)
11. [Decision Points](#decision-points)
12. [Implementation Phases](#implementation-phases)

---

## What OpenCode Already Provides

OpenCode is a fully operational agentic coding engine with an HTTP API. Here's what it ships with out of the box:

### File Editing — 9-Layer Fuzzy Matching
The core `edit.ts` tool uses `{oldString, newString}` replacement with a cascade of 9 fuzzy replacers that fire in order until one matches:

| Layer | Replacer | What It Handles |
|-------|----------|-----------------|
| 1 | SimpleReplacer | Exact substring match |
| 2 | LineTrimmedReplacer | Line-by-line whitespace trimming |
| 3 | BlockAnchorReplacer | First/last line anchors + Levenshtein distance for middle |
| 4 | WhitespaceNormalizedReplacer | Collapses `\s+` to single space |
| 5 | IndentationFlexibleReplacer | Strips minimum indent before comparing |
| 6 | EscapeNormalizedReplacer | Unescapes `\n`, `\t`, etc. |
| 7 | TrimmedBoundaryReplacer | Tries trimmed oldString if original fails |
| 8 | ContextAwareReplacer | First/last line anchors, 50%+ middle lines must match |
| 9 | MultiOccurrenceReplacer | Handles `replaceAll` for multiple exact matches |

This is credited as drawing from **Cline's diff-edits** and **Google Gemini CLI's editCorrector**. It also has a separate `apply_patch` tool (used for GPT models) with 4-pass line matching (exact → trimEnd → trim → Unicode normalization).

### Tool System
- **Built-in tools**: bash, read, glob, grep, edit, write, apply_patch, task (subagents), web_fetch, web_search, code_search, todo_write, todo_read, skill
- **Custom tools**: Drop a `.ts` file in `.opencode/tool/` and it's auto-registered
- **Plugin tools**: Via the plugin system
- **MCP tools**: Via MCP server integration
- **Tool filtering**: Per-model and per-agent tool availability

### Session Management
- Persistent sessions with message history
- Session forking (branch a conversation)
- Session compaction (summarize old messages to save context)
- Session abort (stop agent mid-run)

### Provider Support
- OpenAI, Anthropic, Google, Azure, Bedrock, OpenRouter, xAI, Mistral, Groq, DeepInfra, Cerebras, Cohere, TogetherAI, Perplexity, GitHub Copilot, GitLab
- Dynamic provider loading and credential management
- Provider-specific schema/message transformations

### HTTP API (the key integration surface)
Runs on Hono (Bun-compatible). Key endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/session` | Create new session |
| GET | `/session/:id` | Get session info |
| POST | `/session/:id/message` | Send prompt (sync, streams response) |
| POST | `/session/:id/prompt_async` | Send prompt (async, returns immediately) |
| POST | `/session/:id/abort` | Abort current agent run |
| GET | `/session/:id/messages` | Get all messages |
| GET | `/event` | SSE event stream (real-time updates) |
| POST | `/session/:id/command` | Execute a slash command |
| POST | `/session/:id/shell` | Run shell command |

### SDK
`@opencode-ai/sdk` provides:
- `createOpencodeClient()` — HTTP client for the API
- `createOpencodeServer()` — Spawn a server process programmatically
- `createOpencode()` — Both client and server

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Voice Layer (Swift macOS)                   │
│                                                               │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │ Mic+VPIO │──→│ SpeechAnalyzer│──→│ Turn Detection       │  │
│  │ Echo     │   │ STT          │   │ - 2s silence timer    │  │
│  │ Cancel   │   │ (on-device)  │   │ - 5s cache timer      │  │
│  └──────────┘   └──────────────┘   │ - 2-word interrupt    │  │
│       ↑                             └──────────┬───────────┘  │
│       │                                        │               │
│  ┌──────────┐   ┌──────────────┐               │               │
│  │ AVAudio  │←──│ TTS Chunked  │               │               │
│  │ Player   │   │ Pipeline     │               │               │
│  │ Node     │   │ (say -o)     │               │               │
│  └──────────┘   └──────┬───────┘               │               │
│                         │                       │               │
└─────────────────────────┼───────────────────────┼───────────────┘
                          │                       │
                          │                       │
┌─────────────────────────┼───────────────────────┼───────────────┐
│              Bridge Layer (Node.js or Swift HTTP)              │
│                          │                       │               │
│  ┌───────────────────────┴──┐   ┌───────────────┴────────────┐  │
│  │ SSE Event Listener       │   │ OpenCode SDK Client        │  │
│  │ - message.part.updated   │   │ - session.create()         │  │
│  │ - assistant text parts   │   │ - session.prompt()         │  │
│  │ → routes to TTS pipeline │   │ - session.abort()          │  │
│  └──────────────────────────┘   └────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step Modulation Controller                                │   │
│  │ - Picks agent (voice-quick / voice-deep / voice-unlimited)│   │
│  │ - Monitors step count via events                          │   │
│  │ - Calls abort when enough response is ready               │   │
│  │ - Manages response cache for turn detection               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                    HTTP (localhost)
                               │
┌──────────────────────────────┴───────────────────────────────────┐
│                     OpenCode Server (Bun)                         │
│                                                                   │
│  ┌─────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │ HTTP API │  │ Session Mgr  │  │ Agent Loop                  │  │
│  │ (Hono)  │  │ - persist    │  │ - while(true) { step++ }    │  │
│  │         │  │ - compact    │  │ - maxSteps from agent config │  │
│  │         │  │ - fork       │  │ - LLM stream → tool calls   │  │
│  └─────────┘  └──────────────┘  │ - tool execution → results  │  │
│                                  │ - abort signal check        │  │
│  ┌─────────────────────────┐    └─────────────────────────────┘  │
│  │ Tools                    │                                     │
│  │ - edit (9-layer fuzzy)  │    ┌─────────────────────────────┐  │
│  │ - write (full replace)  │    │ Providers                   │  │
│  │ - apply_patch           │    │ - OpenAI, Anthropic, Google │  │
│  │ - bash, grep, glob      │    │ - 16+ providers supported   │  │
│  │ - web_fetch, web_search │    └─────────────────────────────┘  │
│  │ - task (subagents)      │                                     │
│  │ - custom: voice_notify  │    ┌─────────────────────────────┐  │
│  └─────────────────────────┘    │ SSE Event Bus               │  │
│                                  │ - message.updated           │  │
│                                  │ - message.part.updated      │  │
│                                  │ - session.updated           │  │
│                                  └─────────────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## How Step Modulation Works

This is the key innovation for voice: **controlling how much work the agent does per voice turn**. OpenCode's agent loop (`session/prompt.ts`) already has a step counter and a configurable `agent.steps` limit. When the limit is reached, tools are disabled and the model must respond with a text-only summary.

### Approach 1: Multiple Voice Agents with Different Step Budgets

Define agents in `.opencode/opencode.jsonc`:

```jsonc
{
  "agent": {
    "voice-quick": {
      "description": "Quick voice response. Read a file, answer a question, make a small edit.",
      "steps": 3,
      "prompt": "You are a voice-controlled coding assistant. Be concise — the user will hear your response spoken aloud. Prioritize direct answers over exhaustive research. When editing files, make targeted changes.",
      "mode": "primary"
    },
    "voice-deep": {
      "description": "Deep coding task. Multi-file refactor, debugging, implementation.",
      "steps": 20,
      "prompt": "You are a voice-controlled coding assistant handling a complex task. Be thorough but periodically summarize progress. The user hears your text responses spoken aloud.",
      "mode": "primary"
    },
    "voice-unlimited": {
      "description": "No step limit. Big refactors, full feature implementation.",
      "prompt": "You are a voice-controlled coding assistant. Complete the full task. Use the voice_notify tool to give the user progress updates.",
      "mode": "primary"
    }
  }
}
```

The voice layer selects which agent to use. Could be:
- **Keyword-based**: "quick edit" → voice-quick, "refactor the entire auth module" → voice-deep
- **LLM classifier**: A fast/cheap model classifies complexity before dispatching
- **User explicit**: "go deep on this" or "just a quick one"
- **Default escalation**: Start with voice-quick, if it hits max steps and says "more work needed", auto-escalate to voice-deep

### Approach 2: Dynamic Abort via API

The bridge monitors SSE events in real-time. When it sees the assistant produce enough text for a meaningful voice response, it can call `POST /session/:id/abort` to stop the agent. The agent's work up to that point is preserved in the session.

Use cases:
- User asks "what does this function do?" — Agent reads the file, starts exploring callers. After the first text response explaining the function, abort — don't need the caller exploration.
- User says "stop" or interrupts — Immediate abort, speak what we have.

### Approach 3: Prompt-Level Soft Limits

Inject into the system prompt: "Aim to complete in N tool calls. If you need more, summarize what you've done so far and ask if the user wants you to continue."

This is a soft limit — the model will try to respect it but isn't forced. Works well in combination with the hard `steps` limit.

### Approach 4: Streaming Interleaved Speech

Don't wait for the agent to finish. As `message.part.updated` events arrive with assistant text, chunk them into sentences and start TTS immediately. The agent keeps running tools in the background. The user hears updates as they happen:

```
[Agent reads file] → "I can see the function is in utils.ts, it handles..."
[Agent greps for callers] → (user hears first part while this runs)
[Agent finds issue] → "...and I found a bug on line 42 where..."
```

If the user interrupts (2+ words), abort the session. The conversation thread preserves everything.

---

## What We Keep from BubbleVoice-Mac

These are the audio/voice components that OpenCode doesn't have and that we've already built and tested:

| Component | What It Does | Key Files |
|-----------|-------------|-----------|
| **VPIO Echo Cancellation** | `audioEngine.outputNode.setVoiceProcessingEnabled(true)` — hardware AEC so the mic doesn't pick up TTS playback | swift-helper/BubbleVoiceSpeech/ |
| **SpeechAnalyzer STT** | Apple's on-device speech-to-text framework, streaming transcription | swift-helper/BubbleVoiceSpeech/ |
| **Turn Detection** | 2-second silence timer (turn end), 5-second cache timer (response reuse), 2-word interrupt threshold | Timers in the voice client |
| **TTS Chunked Pipeline** | `say -o file.aiff` batched by sentence (min 7 words per chunk), pipelined (generate N+1 while playing N) | Audio playback system |
| **AVAudioPlayerNode** | Plays TTS audio through the same AVAudioEngine where VPIO is enabled (required for echo cancellation) | swift-helper/BubbleVoiceSpeech/ |
| **Response Caching** | If user starts speaking after LLM response but before playback, cache the response for 5 seconds in case user stops quickly | Turn detection logic |

---

## What We Drop from BubbleVoice-Mac

These are replaced by OpenCode's equivalents:

| Dropped Component | OpenCode Replacement |
|---|---|
| `UnifiedLLMService` | OpenCode's provider system (16+ providers, AI SDK based) |
| `IntegrationService` | OpenCode's session/prompt pipeline |
| Custom tool definitions | OpenCode's tool registry (built-in + custom `.opencode/tool/`) |
| Artifact patching (5-step fuzzy) | OpenCode's edit tool (9-step fuzzy) + write + apply_patch |
| `ContextCompactionService` | OpenCode's built-in `SessionCompaction` |
| `ArtifactManagerService` | Direct file editing via OpenCode tools |
| Electron + Node.js backend | OpenCode server (`opencode serve`) |
| WebSocket message protocol | OpenCode's HTTP API + SSE events |

---

## What Needs to Be Built

### 1. Voice Client (Swift, ~1000 lines estimated)

A macOS app (or CLI process) that handles all audio:
- Microphone capture with VPIO echo cancellation
- SpeechAnalyzer streaming transcription
- Turn detection state machine (silence timer, cache timer, interrupt detection)
- TTS chunked pipeline (sentence batching, `say -o`, AVAudioPlayerNode)
- HTTP client for OpenCode API (or communicates with bridge layer via local socket)

Most of this code already exists in BubbleVoice-Mac's `swift-helper/`. It needs to be extracted and rewired to talk to OpenCode instead of the Electron backend.

### 2. Bridge Layer (TypeScript/Node.js or Swift, ~500 lines estimated)

Sits between the voice client and OpenCode:
- Creates/resumes OpenCode sessions
- Sends transcribed text as prompts via SDK
- Listens to SSE events and routes assistant text to TTS
- Implements step modulation (agent selection, abort timing)
- Manages the response cache for the turn detection system

Could be implemented in:
- **TypeScript** using `@opencode-ai/sdk` — cleanest, since the SDK is JS-native
- **Swift** using URLSession for HTTP — keeps everything in one process
- **Both** — Swift for audio, Node.js bridge for OpenCode SDK (communicate via local HTTP or Unix socket)

### 3. Custom Voice Tool (TypeScript, ~30 lines)

A custom OpenCode tool at `.opencode/tool/voice_notify.ts` that lets the agent speak to the user mid-task:

```typescript
import z from "zod"

export default {
  description: "Send a short voice message to the user while continuing work. Use this to give progress updates during long tasks.",
  args: {
    message: z.string().describe("Short message to speak (1-2 sentences max)")
  },
  async execute(args) {
    await fetch("http://localhost:VOICE_PORT/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: args.message })
    })
    return "Voice notification sent to user"
  }
}
```

### 4. Configuration (JSON, ~50 lines)

Custom agent definitions in `.opencode/opencode.jsonc` for voice-specific step limits and prompts.

---

## OpenCode's File Editing System

### Why It's Better Than What We Have

BubbleVoice-Mac's artifact-sidebar has a 5-step fuzzy cascade for patching HTML. OpenCode has a **9-layer cascade** for editing **any file type**, plus additional safety:

**Safety features we'd gain:**
- **FileTime** — "read before edit" enforcement. The agent can't edit a file it hasn't read in this session. Prevents blind edits.
- **File locking** — Serializes concurrent writes to the same file via `FileTime.withLock()`.
- **LSP diagnostics** — After every edit, OpenCode runs LSP checks and feeds errors back to the model so it can self-correct.
- **Permission system** — Per-agent tool permissions. Voice-quick could be read-only, voice-deep could have full edit access.
- **Doom loop detection** — If the agent makes the same tool call 3 times in a row with identical input, it's flagged and stopped.
- **Diff generation** — Every edit produces a unified diff for audit/display.

**Editing modes:**
- `edit` — String replacement with 9-layer fuzzy matching (for Anthropic, Google models)
- `apply_patch` — Custom patch format with 4-pass line matching (for OpenAI/GPT models)
- `write` — Full file overwrite (for new files or complete rewrites)
- `multiedit` — Multiple edits on one file in a single tool call

---

## How SSE Streaming Enables Voice

OpenCode publishes events via an event bus that's exposed through SSE at `GET /event`. The voice layer subscribes to this and reacts in real-time:

### Key Events for Voice

| Event | What It Contains | Voice Layer Action |
|-------|-----------------|-------------------|
| `message.part.updated` | Assistant text parts with `delta` (incremental text) | Buffer text, chunk into sentences, start TTS |
| `message.updated` | Full message metadata (role, finish reason) | Detect when agent turn ends |
| `session.updated` | Session status changes | Know when agent is busy vs idle |

### Streaming Flow

```
1. User stops talking (2s silence)
2. Bridge sends POST /session/:id/message with transcribed text
3. OpenCode starts agent loop
4. SSE fires message.part.updated events as the LLM streams text
5. Bridge buffers text, splits into sentences (min 7 words)
6. First sentence ready → start `say -o chunk1.aiff` generation (~1s)
7. More text arrives via SSE, buffer for next chunk
8. chunk1.aiff ready → play via AVAudioPlayerNode
9. While playing chunk1, generate chunk2 from buffered text
10. Continue pipelining until agent finishes or user interrupts
```

### Interrupt Flow

```
1. User says 2+ words while TTS is playing or agent is running
2. Voice client immediately:
   a. Kills any `say` process generating audio
   b. Stops AVAudioPlayerNode playback
   c. Discards queued chunks
3. Bridge calls POST /session/:id/abort
4. OpenCode cancels the agent loop (abort signal fires)
5. All work done so far is preserved in the session
6. Turn detection resumes — if user stops talking for 2s, new prompt sent
```

---

## Limitations and Risks

### 1. Latency Overhead

**Risk**: OpenCode adds an HTTP hop between the voice client and the LLM. Direct LLM calls would be faster for first-token latency.

**Measured expectations**:
- Direct LLM API call: ~200-500ms to first token (depending on model/provider)
- Through OpenCode: ~300-700ms (adds system prompt construction, tool resolution, HTTP overhead)
- The ~100-200ms overhead is likely acceptable for voice (human speech pauses are ~200ms minimum)

**Mitigation**: SSE streaming means the overhead only affects the *first* token. After that, tokens stream at wire speed.

### 2. Bun Dependency

**Risk**: OpenCode runs on Bun, not Node.js. Bun needs to be installed on macOS.

**Status**: Bun has a stable macOS installer (`curl -fsSL https://bun.sh/install | bash`). It's a single binary. This is a minor friction point but not a blocker.

### 3. Upstream Changes

**Risk**: OpenCode is actively developed. API changes could break our integration.

**Options**:
- **Fork and pin** — Fork the repo, pin to a specific commit. Manually merge upstream changes.
- **Track upstream** — Use latest, but have integration tests that catch breaking changes.
- **SDK stability** — The `@opencode-ai/sdk` package has a versioned API (`v2`). This is more stable than internal code.

**Recommendation**: Use the SDK for the bridge layer. Pin the OpenCode server to a specific version. Update deliberately.

### 4. No Built-in Voice Understanding

**Limitation**: OpenCode has no concept of voice. It treats all input as text. This means:
- No understanding of tone, urgency, or emotion in voice
- No ability to distinguish "ummm" pauses from intentional silence
- No voice-native features (voice commands like "undo that")

**Mitigation**: The voice client layer handles all voice-specific logic before text hits OpenCode. OpenCode just sees clean text prompts.

### 5. Session Model Mismatch

**Limitation**: OpenCode sessions are designed for long coding sessions (hours). Voice conversations might be brief (seconds to minutes) but frequent.

**Considerations**:
- Many short sessions could create storage overhead
- Or use one long-running session per "work context" and keep appending voice turns
- Context compaction handles the long session case well

### 6. No Native macOS App Packaging

**Limitation**: OpenCode is a CLI/server tool. Packaging it as part of a polished macOS app requires wrapping the server process.

**Approach**: The Swift voice client could spawn `opencode serve` as a child process, manage its lifecycle, and present a native macOS UI (menu bar icon, notifications, etc.).

### 7. Concurrent Voice and TUI

**Limitation**: If you want to use OpenCode's TUI alongside voice, they'd share the same session. The TUI might show tool calls/diffs that the voice user doesn't need to see.

**Mitigation**: Run the TUI in a separate terminal for visual monitoring while voice handles interaction. Or skip the TUI entirely and build a minimal SwiftUI status overlay.

### 8. Tool Permissions for Voice

**Risk**: Voice commands are easier to misfire than typed commands. A misheard "delete that file" could be destructive.

**Mitigation**: OpenCode's permission system is per-agent. The voice-quick agent could deny destructive operations:
```jsonc
{
  "voice-quick": {
    "permission": {
      "bash": "ask",
      "edit": { "*": "allow", "*.env*": "deny" }
    }
  }
}
```

---

## What's Possible That Wasn't Before

### 1. Voice-Controlled Agentic Coding

Say "refactor the authentication module to use JWT" and the agent reads files, plans changes, edits multiple files, runs tests — all while giving voice updates.

### 2. Interleaved Voice + Tool Execution

The agent can speak to you ("I found 3 files that need changes, starting with auth.ts") while simultaneously editing files. You hear progress in real-time.

### 3. Custom Voice Tools

The `voice_notify` tool lets the agent proactively speak mid-task. Combined with the `task` tool (subagents), the agent could spawn a background task and narrate what it's doing.

### 4. Multi-Model Voice Routing

Voice-quick could use a fast/cheap model (GPT-4o-mini, Gemini Flash). Voice-deep could use a powerful model (Claude Sonnet 4.5, GPT-5). The step limit + model choice are both per-agent.

### 5. Session Continuity

"Continue what you were working on" — OpenCode sessions persist. The voice layer can resume a previous session and the agent has full context of prior work.

### 6. Shared Sessions with TUI

Work on a task via voice, then switch to the TUI for detailed review of diffs. Same session, same context. Or have a colleague review your voice session in the TUI.

### 7. Plugin Ecosystem

OpenCode's plugin system means community tools become available to the voice interface automatically. A new MCP server, a new code search provider — all available to voice with zero voice-layer changes.

---

## Decision Points

These need to be decided before implementation:

### 1. Bridge Layer Language
- **TypeScript** (uses `@opencode-ai/sdk` natively, familiar ecosystem)
- **Swift** (single process, no Node.js dependency, native macOS integration)
- **Hybrid** (Swift for audio, TypeScript bridge for SDK — communicate via local HTTP)

### 2. App Packaging
- **Standalone Swift app** that spawns `opencode serve` as a subprocess
- **Menu bar utility** — minimal UI, just a tray icon with status
- **Full SwiftUI app** — with a visual chat view alongside voice
- **CLI only** — voice runs in terminal, no GUI

### 3. OpenCode Relationship
- **Fork and customize** — own the code, add voice-specific features to the server
- **Use as dependency** — treat it as a black box, interact only via SDK/API
- **Contribute upstream** — add voice-friendly features to OpenCode itself (e.g., a voice mode)

### 4. Step Modulation Strategy
- **Static agents** — fixed step budgets per agent type
- **Dynamic classification** — LLM classifies request complexity, picks agent
- **User-controlled** — explicit voice commands ("go deep", "quick answer")
- **Adaptive** — start quick, escalate if agent reports more work needed

### 5. Visual Feedback
- **None** — pure voice, no screen needed
- **Minimal overlay** — floating status indicator (listening / thinking / speaking)
- **Full UI** — show agent progress, file diffs, tool calls alongside voice
- **TUI coexistence** — voice + OpenCode TUI in split terminal

---

## Implementation Phases

### Phase 0: Validate (1-2 days)
- Install Bun, run `opencode serve` on macOS
- Use `curl` or a script to hit the API: create session, send prompt, get response
- Measure first-token latency through the API vs. direct LLM call
- Verify SSE events stream correctly

### Phase 1: Minimal Voice-to-OpenCode Bridge (3-5 days)
- Extract VPIO + SpeechAnalyzer + TTS pipeline from BubbleVoice-Mac's swift-helper
- Build a minimal bridge that:
  - Creates an OpenCode session on startup
  - Sends transcribed text via `POST /session/:id/message`
  - Subscribes to SSE events
  - Speaks assistant text responses via TTS
- No step modulation yet — just voice in, text out, voice out

### Phase 2: Turn Detection Integration (2-3 days)
- Wire up the full turn detection system:
  - 2-second silence timer → send prompt
  - 5-second response cache → reuse if user stops quickly
  - 2-word interrupt → abort session + kill TTS
- Test with real voice conversations

### Phase 3: Step Modulation (2-3 days)
- Create voice agent configs (quick / deep / unlimited)
- Build the agent selection logic in the bridge
- Implement dynamic abort (stop when enough text for voice)
- Test with varying complexity tasks

### Phase 4: Custom Voice Tool (1 day)
- Create `.opencode/tool/voice_notify.ts`
- Test agent proactively speaking mid-task
- Tune prompts so the agent uses it appropriately

### Phase 5: Polish and Package (3-5 days)
- macOS app packaging (menu bar utility or standalone app)
- Error handling, reconnection logic
- Permission configuration for voice safety
- User-facing settings (model selection, step budget, voice speed)

**Total estimated effort: 12-19 days**

---

## Summary

Building voice on OpenCode means we get a battle-tested agentic coding engine for free — file editing, tool execution, session management, multi-provider LLM support — and we focus exclusively on what makes voice unique: audio capture, speech-to-text, turn detection, text-to-speech, and the UX of conversational coding. Step modulation is achievable through OpenCode's existing `agent.steps` config, the abort API, and streaming interleaved speech. The main risks are latency overhead (~100-200ms per turn) and the Bun dependency, both of which are manageable.
