# BubbleVoice-Mac Architecture Overhaul Checklist

**Created:** February 6, 2026  
**Purpose:** Comprehensive audit of the BubbleVoice-Mac codebase with actionable fixes, architectural improvements, and cleanup tasks.  
**Status:** Active - Working through items

---

## Critical Issues (App-Breaking)

### 1. Conversations Are In-Memory Only
- [x] **ConversationService uses `new Map()` — all conversations lost on restart** ✅ FIXED 2026-02-06
- ConversationService rewritten as write-through cache: in-memory Map for fast access + SQLite for persistence
- On startup, `loadFromDatabase()` restores conversations from SQLite into cache
- Every create/addMessage/delete writes through to database
- server.js wires IntegrationService's DatabaseService into ConversationService in `init()`
- Also fixed 3 missing `await` bugs in server.js (handleSwitchConversation, handleDeleteConversation, handleUpdateConversationTitle)
- Added title persistence to database on rename
- **Risk:** Resolved — conversations now survive restart

### 2. RAG Is Built But Not Connected
- [x] **ContextAssemblyService exists but is never called in the main message flow** ✅ FIXED 2026-02-06
- `ContextAssemblyService.js` has a sophisticated multi-query vector search (3-query strategy with weights)
- `IntegrationService.js` has `getContextForTurn()` that calls it
- BUT `server.js:handleUserMessage()` never calls context assembly — it sends messages to LLM without any memory retrieval
- The "core value" (AI remembers past conversations) is not functioning
- **Fix:** Before calling `this.llmService.generateResponse()`, call `this.integrationService.getContextForTurn()` and inject the results into the conversation context
- **Risk:** High — without this, the product literally doesn't deliver its primary feature

### 3. Two Parallel Conversation Systems (Unsynchronized)
- [x] **ConversationService (in-memory) and ConversationStorageService (persistent) exist side by side** ✅ FIXED 2026-02-06
- ConversationService is now the SINGLE SOURCE OF TRUTH with write-through to the same SQLite database
- Both server.js and IntegrationService share the same DatabaseService instance
- ConversationStorageService still exists for the 4-file structure (conversation.md, user_inputs.md, etc.) used by IntegrationService.processTurn()
- Future: ConversationStorageService could be simplified since message persistence is now handled by ConversationService
- **Risk:** Resolved — no more ghost conversations or data inconsistency

---

## Architectural Improvements (High Impact)

### 4. Artifact Context Only Works for Gemini
- [x] **`buildMessagesForAnthropic()` and `buildMessagesForOpenAI()` don't inject artifact context** ✅ FIXED 2026-02-06
- `buildMessagesForGemini()` (line 794) injects `[CURRENT ARTIFACT DISPLAYED]` context
- `buildMessagesForAnthropic()` (line 896) does NOT — just passes raw messages
- `buildMessagesForOpenAI()` (line 919) does NOT — just passes raw messages
- Switching to Claude or GPT breaks artifact editing completely (0% update rate)
- **Fix:** Extract artifact context injection into a shared method, call from all three builders
- **Risk:** Medium — affects anyone using non-Gemini providers

### 5. System Prompt Is ~300 Lines with CSS Instructions
- [x] **Burning thousands of tokens per request on visual design standards** ✅ FIXED 2026-02-06 (56% reduction: 8000→3520 chars, design prompt only injected with artifacts)
- The system prompt in `LLMService.js:buildSystemPrompt()` is ~300 lines
- Contains detailed CSS gradient values, box-shadow specs, color hex codes, font stacks
- This is sent with EVERY request, even casual chat that won't generate artifacts
- Costs extra tokens, increases latency, dilutes the AI's attention on actual conversation
- **Fix:** Split into base prompt (personality, behavior, tool instructions) and artifact design prompt (CSS, layout) that's only injected when `html_toggle.generate_html` is true
- Alternative: Move design standards into a separate prompt template loaded by PromptManagementService
- **Risk:** Low — purely additive improvement

### 6. Vercel AI SDK Migration (Provider Unification)
- [x] **Replace 3 separate provider implementations with unified Vercel AI SDK** ✅ DONE 2026-02-06
- Current: `generateGeminiResponse()`, `generateAnthropicResponse()`, `generateOpenAIResponse()` — 3 separate streaming implementations (LLMService.js is 1053 lines)
- OpenCode pattern: Uses `streamText()` from `ai` package with provider-specific model constructors
- Benefits: Unified streaming, built-in tool calling, structured output, retry logic, abort signals

**DETAILED MIGRATION PLAN (2026-02-06):**

**Step 1: Install dependencies**
```
npm install ai @ai-sdk/google @ai-sdk/anthropic @ai-sdk/openai
```

**Step 2: Create new UnifiedLLMService.js alongside existing LLMService.js**
- Keep LLMService.js working as fallback during migration
- New file uses Vercel AI SDK's `streamText()` with provider-specific model constructors
- Map existing model names to SDK model constructors:
  - `gemini-2.5-flash-lite` → `google('gemini-2.5-flash-lite')`
  - `claude-sonnet-4.5` → `anthropic('claude-sonnet-4.5')`
  - `gpt-5.2-turbo` → `openai('gpt-5.2-turbo')`

**Step 3: Migrate core generate flow**
- Replace 3x `generateXxxResponse()` methods (~400 lines) with single `streamText()` call (~50 lines)
- Port `buildSystemPrompt()`, `buildSharedContextPrefix()`, `getArtifactDesignPrompt()` as-is
- Message format conversion becomes trivial — Vercel AI SDK handles role mapping
- Streaming: Use `for await (const chunk of result.textStream)` instead of 3 different streaming APIs
- Structured output: Use `generateObject()` with Zod schema instead of manual JSON.parse

**Step 4: Migrate callbacks**
- `onChunk` → iterate textStream
- `onBubbles`/`onArtifact`/`onAreaActions` → extract from structured output after stream completes
- OR use tool-calling pattern (Step 5) to handle these mid-stream

**Step 5 (Future - item #7): Convert to tool-calling**
- Define tools with Zod schemas using `tool()` helper
- Let the model call `create_life_area`, `append_memory_entry`, `create_artifact` etc. naturally
- Eliminates the complex JSON structured output parsing

**What gets deleted:** ~700 lines (3 provider-specific generate methods, 3 message builder methods)
**What gets added:** ~200 lines (unified generate, model registry, Zod schemas)
**Net reduction:** ~500 lines in LLMService

**Step 6: Remove old SDKs**
```
npm uninstall @google/generative-ai @anthropic-ai/sdk openai
```

- **Risk:** Medium — significant refactor but clear migration path
- **Dependency:** This enables item #7 (tool-calling pattern)
- **Estimated effort:** 2-3 focused sessions

### 7. Convert Structured JSON to Tool-Calling Pattern
- [ ] **Define BubbleVoice actions as LLM tools instead of monolithic JSON schema**
- Current: System prompt asks LLM to output `{response, bubbles, area_actions, artifact_action, html_toggle}` as one JSON blob
- Problems: Fragile JSON parsing, 300-line prompt for schema, truncation errors, model-specific schema enforcement quirks
- OpenCode pattern: Define tools with Zod schemas, LLM calls them naturally
- Proposed tools:
  - `create_life_area(area_path, name, description)` — Create new life area
  - `append_memory_entry(area_path, document, content, sentiment, user_quote)` — Add entry to area
  - `update_area_summary(area_path, updates)` — Update area summary
  - `search_memory(query)` — Vector search past conversations
  - `create_artifact(type, html, data)` — Create new visual artifact
  - `patch_artifact(artifact_id, patches)` — Edit existing artifact
  - `update_artifact(artifact_id, html, data)` — Replace artifact HTML
- Benefits: Smaller system prompt, schema validation per-tool, natural tool execution, easier to add new capabilities
- **Risk:** High — fundamental architecture change, needs careful testing
- **Dependency:** Requires item #6 (Vercel AI SDK) first

### 8. Add Context Compaction
- [x] **No mechanism for handling long conversations** ✅ FIXED 2026-02-06
- Created ContextCompactionService with configurable thresholds (default: compact at 60 messages, keep 20 recent)
- Uses gemini-2.0-flash for fast/cheap summarization of older messages
- Summary preserves personal names, emotional context, life area details, and commitments
- Fallback to extractive summary when no LLM available
- Summary cache prevents re-summarizing the same messages
- Integrated into UnifiedLLMService.buildMessages() — transparent to callers
- **Risk:** Resolved — long conversations now handled gracefully

---

## Documentation Cleanup (MD Pruning)

### 9. Prune 80+ Root-Level MD Files
- [x] **Move session logs, fix notes, status updates to `docs/archive/sessions/`** ✅ DONE 2026-02-06 (81→5 root MDs, 78 files archived across 7 categories)
- 81 MD files in root directory — makes the project feel chaotic and hard to navigate
- Categories to archive:
  - **Session logs** (17 files): `SESSION_*`, `BUILD_SESSION_*`, `BUILD_PROGRESS_*`
  - **Fix/bug notes** (18 files): `*_FIX*.md`, `ERROR_*.md`, `FIXES_*.md`, `BUG_*.md`
  - **Status snapshots** (10 files): `*_STATUS*.md`, `CURRENT_STATUS.md`, `FINAL_STATUS_*`
  - **Implementation completion notes** (8 files): `*_COMPLETE*.md`, `*_IMPLEMENTATION*.md`
  - **Test logs** (10 files): `TEST_*.md`, `TESTING_*.md`, `COMPREHENSIVE_TEST_*`
  - **One-off feature notes** (15+ files): `ADMIN_PANEL_*`, `API_KEY_*`, `GEMINI_*`, etc.
- **Keep in root:**
  - `README.md` — Project overview
  - `PRODUCT_INTENT.md` — North star document
  - `QUICK_START.md` — How to run
  - `ARCHITECTURE_OVERHAUL_CHECKLIST.md` — This file (active work)
  - `User thoughts.md` — User's original vision notes (important context)
- **Move benchmark-artifacts/ to docs/benchmarks/**
- **Clean up tmp/ — remove stale agent logs and test outputs**
- **Risk:** None — purely organizational

### 10. Consolidate Useful Information from Archived MDs
- [ ] **Before archiving, extract any still-relevant technical decisions into code comments or KNOWN_ISSUES.md**
- Some archived MDs contain valuable context (e.g., `CRITICAL_FIX_TIMER_RESET_PATTERN.md`, `TURN_DETECTION_BEFORE_AFTER.md`)
- These insights are already captured in code comments (VoicePipelineService.js has excellent narrative comments)
- Verify key insights are in code before archiving their standalone docs
- **Risk:** Low — verify before moving

---

## Code Quality Issues

### 11. IntegrationService Mock Pattern Is Complex and Risky
- [ ] **~200 lines of mock implementations inline in the constructor**
- When `SKIP_DATABASE=true`, IntegrationService creates inline mock objects for every service
- These mocks can drift from real implementations (already happened — missing `saveConversationTurn`)
- **Fix:** Either use a proper mock library, or remove the skip-database path and always use SQLite (even for tests)
- **Risk:** Low-Medium — causes test/prod behavior divergence

### 12. VoicePipelineService Creates Its Own LLMService and ConversationService
- [x] **Separate instances of LLMService and ConversationService inside VoicePipelineService** ✅ FIXED 2026-02-06 (now uses server's shared instances)
- `VoicePipelineService` constructor creates `new LLMService()` and `new ConversationService()` (line 56-57)
- These are DIFFERENT instances from the ones in `BackendServer`
- Voice-created conversations exist in VoicePipelineService's ConversationService but not the server's
- Settings changes (API keys, model selection) applied to server's LLMService don't affect voice pipeline's LLMService
- **Fix:** Pass server's service instances to VoicePipelineService instead of creating new ones
- **Risk:** Medium — causes silent bugs where voice and text paths behave differently

### 13. Bubbles Are Defined but Not Connected to Anything
- [x] **`BubbleGeneratorService.js` is instantiated but never called** ✅ FIXED 2026-02-06
- Removed import and instantiation from server.js (service file preserved for future use)
- Also moved 24 stale test files and 5 test data directories from root into tests/archive/
- Moved benchmark-artifacts/ into docs/
- Cleaned tmp/ of stale agent logs and test outputs
- **Risk:** None — dead code removed, root decluttered from 46→13 files

---

## Future Considerations (Plan, Don't Execute Yet)

### 14. Consider Persistent WebSocket Session Recovery
- [ ] **WebSocket disconnects lose all conversation context**
- If the WebSocket drops (network hiccup, app backgrounded), the connection state is lost
- No reconnection logic or session resumption in `websocket-client.js`
- **Plan:** Add session tokens and reconnection with state recovery
- **Priority:** Low — address after core issues

### 15. Consider Streaming for Anthropic and OpenAI Structured Output
- [ ] **Anthropic/OpenAI paths stream raw text, not structured JSON**
- Gemini path uses `responseMimeType: 'application/json'` with schema — gets structured output natively
- Anthropic path streams raw text, then tries to `JSON.parse()` the full response — fragile
- OpenAI path uses `response_format: { type: 'json_object' }` — better but no schema enforcement
- **Plan:** Tool-calling migration (item #7) eliminates this problem entirely
- **Priority:** Low — blocked by item #6 and #7

### 16. Swift Helper Build/Distribution
- [ ] **Swift helper path is hardcoded to debug build**
- `VoicePipelineService.js:130` points to `.build/debug/BubbleVoiceSpeech`
- No build script or CI for the Swift helper
- **Plan:** Add build step to package.json and handle binary distribution
- **Priority:** Low — works in dev, needs attention for prod

---

## Work Priority Order

**Phase 1 — Fix What's Broken (This Session)** ✅ COMPLETE
1. ~~Create this checklist~~ ✅
2. ~~Prune MD files (#9)~~ ✅ 81→5 root MDs
3. ~~Wire RAG into main message flow (#2)~~ ✅ ContextAssemblyService now called in handleUserMessage
4. ~~Fix artifact context for all providers (#4)~~ ✅ Shared buildSharedContextPrefix for Gemini/Anthropic/OpenAI
5. ~~Fix VoicePipelineService separate instances (#12)~~ ✅ Now uses server's shared services
6. ~~Slim system prompt (#5)~~ ✅ 56% reduction, design prompt only with artifacts

**Phase 2 — Strengthen Foundation** ✅ IN PROGRESS
6. ~~Merge conversation systems (#1, #3)~~ ✅ Write-through cache with SQLite persistence, 3 await bugfixes
7. ~~Slim system prompt (#5)~~ ✅ Already done in Phase 1
8. ~~Remove dead code (#13)~~ ✅ BubbleGeneratorService removed from server.js, 24 test files archived, test data dirs moved
9. Consolidate archived docs (#10)

**Phase 3 — Architecture Evolution** ✅ COMPLETE
10. ~~Install Vercel AI SDK (#6)~~ ✅ UnifiedLLMService.js replaces 3 provider implementations with single generateObject() call
11. ~~Convert to tool-calling pattern (#7)~~ ✅ DONE — UnifiedLLMService uses generateText + 4 tools
12. ~~Add context compaction (#8)~~ ✅ ContextCompactionService summarizes older messages, keeps recent 20 intact

**Phase 4 — Tool Calling & Production ✅ IN PROGRESS**
13. ~~Convert to tool-calling pattern (#7)~~ ✅ UnifiedLLMService now uses generateText() + tools instead of generateObject(). 4 tools defined: suggest_bubbles, remember_info, create_artifact, update_artifact. Old monolithic BubbleVoiceResponseSchema removed. Backwards-compatible structured output preserved.
14. ~~Clean up old provider SDKs~~ ✅ Removed @google/generative-ai, @anthropic-ai/sdk, openai. Archived LLMService.js and BubbleGeneratorService.js.
15. ~~Added gemini-2.5-flash, gemini-2.5-pro~~ ✅ to model registry (now 12 models)
16. WebSocket session recovery (#14) — deferred
17. Swift helper distribution (#16) — deferred

---

**Last Updated:** February 6, 2026 (Phase 4 — tool-calling pattern complete)  
**Next Review:** After WebSocket session recovery and Swift helper distribution
