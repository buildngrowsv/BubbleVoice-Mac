# BubbleVoice-Mac Architecture Overhaul Checklist

**Created:** February 6, 2026  
**Purpose:** Comprehensive audit of the BubbleVoice-Mac codebase with actionable fixes, architectural improvements, and cleanup tasks.  
**Status:** Active - Working through items

---

## Critical Issues (App-Breaking)

### 1. Conversations Are In-Memory Only
- [ ] **ConversationService uses `new Map()` — all conversations lost on restart**
- The product's core promise is "the AI actually remembers your life"
- `ConversationService.js` stores everything in a JS Map that dies with the process
- `ConversationStorageService.js` exists with persistent SQLite storage but is NOT used by `server.js`
- `server.js:handleUserMessage()` calls `this.conversationService` (in-memory) not `this.integrationService.convStorage` (persistent)
- **Fix:** Merge the two systems — make ConversationService a facade over ConversationStorageService, or replace it entirely
- **Risk:** High — this is the #1 user-facing bug (conversations vanish on restart)

### 2. RAG Is Built But Not Connected
- [x] **ContextAssemblyService exists but is never called in the main message flow** ✅ FIXED 2026-02-06
- `ContextAssemblyService.js` has a sophisticated multi-query vector search (3-query strategy with weights)
- `IntegrationService.js` has `getContextForTurn()` that calls it
- BUT `server.js:handleUserMessage()` never calls context assembly — it sends messages to LLM without any memory retrieval
- The "core value" (AI remembers past conversations) is not functioning
- **Fix:** Before calling `this.llmService.generateResponse()`, call `this.integrationService.getContextForTurn()` and inject the results into the conversation context
- **Risk:** High — without this, the product literally doesn't deliver its primary feature

### 3. Two Parallel Conversation Systems (Unsynchronized)
- [ ] **ConversationService (in-memory) and ConversationStorageService (persistent) exist side by side**
- `server.js` uses ConversationService for message management
- `IntegrationService` uses ConversationStorageService for structured data (area actions, artifacts)
- They don't share state — messages saved in one are invisible to the other
- Area actions and artifacts get saved to disk, but the conversation messages they came from don't persist
- **Fix:** Unify into a single conversation system backed by persistent storage
- **Risk:** Medium — causes data inconsistency and ghost conversations

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
- [ ] **Replace 3 separate provider implementations with unified Vercel AI SDK**
- Current: `generateGeminiResponse()`, `generateAnthropicResponse()`, `generateOpenAIResponse()` — 3 separate streaming implementations (~700 lines)
- OpenCode pattern: Uses `streamText()` from `ai` package with provider-specific model constructors
- Benefits: Unified streaming, built-in tool calling, structured output, retry logic, abort signals
- **Plan:**
  1. `npm install ai @ai-sdk/google @ai-sdk/anthropic @ai-sdk/openai`
  2. Replace `generateResponse()` with single `streamText()` call
  3. Convert structured JSON output to tool-calling pattern
  4. Remove individual SDK dependencies (`@google/generative-ai`, `@anthropic-ai/sdk`, `openai`)
- **Risk:** Medium — significant refactor but clear migration path
- **Dependency:** This enables item #7 (tool-calling pattern)

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
- [ ] **No mechanism for handling long conversations**
- BubbleVoice conversations are designed to be long (ongoing personal reflection)
- Currently sends ALL messages to LLM — will hit context limits
- OpenCode has `SessionCompaction` that summarizes old messages when context overflows
- **Fix:** Implement compaction: when conversation exceeds N tokens, summarize oldest turns into a compact context block
- **Risk:** Medium — needed before long conversations are practical

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
- [ ] **`BubbleGeneratorService.js` is instantiated but never called**
- `server.js` creates `this.bubbleGeneratorService` but never uses it
- Bubbles come from LLM structured output, not from BubbleGeneratorService
- **Fix:** Either integrate it (for proactive bubble generation independent of LLM) or remove it to reduce confusion
- **Risk:** None — dead code

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

**Phase 2 — Strengthen Foundation (Next Session)**
6. Merge conversation systems (#1, #3)
7. Slim system prompt (#5)
8. Remove dead code (#13)
9. Consolidate archived docs (#10)

**Phase 3 — Architecture Evolution (Future Sessions)**
10. Install Vercel AI SDK (#6)
11. Convert to tool-calling pattern (#7)
12. Add context compaction (#8)
13. WebSocket session recovery (#14)
14. Swift helper distribution (#16)

---

**Last Updated:** February 6, 2026  
**Next Review:** After Phase 1 completion
