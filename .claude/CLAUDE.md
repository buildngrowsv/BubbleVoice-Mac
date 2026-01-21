# BubbleVoice-Mac - Claude Code Rules

> **Project**: BubbleVoice-Mac - Voice AI Application for macOS
> **Last Updated**: January 18, 2026
> **Stack**: Swift, SwiftUI, AVFoundation, iOS 26 Liquid Glass UI

---

## 🚨 CRITICAL RULES (NEVER VIOLATE)

**IMPORTANT:** These rules are ABSOLUTE and must NEVER be violated under ANY circumstances.

1. **NEVER use mock/fake/sample/hallucinated data**
   - All data must be real or clearly marked as test fixtures
   - Never generate placeholder API responses

2. **NEVER commit API keys, secrets, or credentials**
   - Use environment variables or secure storage
   - Check before every commit

3. **ALWAYS write extensive comments**
   - Every function needs detailed comments
   - Include WHY/BECAUSE explanations
   - Document product reasoning, not just technical details

4. **ALWAYS run builds after code changes**
   - Use `xcodebuild` to verify Swift changes compile
   - Fix all build errors before moving on

5. **ONE function per class/file**
   - Separate business logic from UI code
   - Keep files focused and manageable

---

## 📁 Project Structure

This project is located at:
`/Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac`

We are ONLY working in BubbleVoice-Mac folder. The Accountabilityv6-callkit folder is reference only for:
- Conversation handling patterns
- Interruption system design
- Timer/response pipeline buffering
- Memory and summarization approaches

---

## 💻 Terminal Command Rules

ALWAYS follow these patterns for terminal commands:

```bash
# Always use timeout
timeout 120 <command>

# Always limit output
| head -n 200 | cut -c1-200

# Tree command pattern
timeout 120 tree -L 3 -I "node_modules|.git|dist|downloads|build" -C | head -n 250 | cut -c1-100

# Build verification
timeout 120 xcodebuild -scheme BubbleVoice-Mac -destination 'platform=macOS' build 2>&1 | head -n 100
```

---

## 📝 Comment Style Requirements

Every comment block should include:

```swift
/// **Technical**: What this function does, parameters, return values
/// **Dependencies**: What this relies on, where it's called from
/// **Why/Because**: The reasoning behind this approach
/// **Product Context**: How this serves the user/feature
/// **History**: Any debugging notes or failed approaches
///
/// Example:
/// This function handles real-time speech transcription buffering.
/// It's called by AudioCaptureService when new audio chunks arrive.
/// 
/// WHY: We use a ring buffer here because the previous array-based approach
/// caused memory spikes during long conversations (discovered during testing
/// on 2025-04-15). The ring buffer caps memory at 30 seconds of audio.
///
/// PRODUCT: This enables the "natural conversation flow" feature where
/// users can speak freely without explicit push-to-talk.
///
/// HISTORY: Tried using AudioQueue first but AVAudioEngine gave us
/// better latency (sub-50ms vs 150ms with AudioQueue).
func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> TranscriptionChunk {
    // Implementation
}
```

---

## 🔧 Development Workflow

### Standard Flow
1. **Research codebase** - Search and read before changing
2. **Plan implementation** - Think through the approach
3. **Make changes** - Edit Swift files with extensive comments
4. **Build check** - Run xcodebuild to verify
5. **Fix errors** - Iterate until build succeeds
6. **Verify entitlements** - Check permissions are in place

### When Starting a Task
```
1. Run tree command to understand structure
2. Search codebase for related code
3. Read relevant files completely
4. Plan changes before editing
5. Make changes incrementally
6. Verify builds after each change
```

---

## 🎨 UI Design Principles

We are using **iOS 26 Liquid Glass UI** aesthetic:

- Translucent, glass-like surfaces
- Depth through layered transparency
- Subtle animations and micro-interactions
- Modern typography (avoid generic fonts)
- Rich gradients and atmospheric backgrounds

**For UI iterations**: Create standalone HTML files that replicate the UI 1:1, iterate quickly, then translate to SwiftUI.

---

## 📦 File Naming Conventions

Use **long, primitive, descriptive names**:

✅ Good:
- `UploadedVideoSpeechLocalTranscriptionService.swift`
- `RealTimeVoiceConversationInterruptionHandler.swift`
- `ConversationMemorySummarizationEngine.swift`

❌ Bad:
- `TranscriptionService.swift` (too vague)
- `Handler.swift` (meaningless)
- `Utils.swift` (catch-all anti-pattern)

---

## 🔍 Context7 Usage

For documentation lookups:
1. Start with 5000 tokens
2. Increase to 20000 if first search insufficient
3. Maximum 3 searches per topic
4. Fall back to `vibe-tools web` for Perplexity research

```
# Pattern for Context7 queries
mcp_context7_resolve-library-id: Find the library
mcp_context7_query-docs: Get specific documentation
```

---

## 🔊 Task Completion Announcement

After completing ANY task, run:

```bash
timeout 30 bash -c '
say -o /tmp/soft_say.aiff "For BubbleVoice Mac, I have completed [TASK]. The highlights are [SUMMARY]"
afplay -v 0.3 /tmp/soft_say.aiff
'
```

This is for accessibility - the user needs verbal summaries.

---

## 🚀 Ralph Wiggum Loop Pattern

When running iterative tasks:

```
COMPLETION_CRITERIA:
1. Build succeeds (xcodebuild exits 0)
2. No Swift compiler errors
3. All tests pass (if applicable)

MAX_ITERATIONS: 10

ON_EACH_ITERATION:
- Make targeted changes
- Run build verification
- Check completion criteria
- If not met, analyze failure and iterate

ON_MAX_ITERATIONS:
- Report progress made
- List remaining blockers
- Suggest next steps
```

---

## ⚠️ Common Pitfalls to Avoid

1. **Don't use default ports** - Pick random ports (e.g., 3847, 5923, 4156)
2. **Don't go to root** - Keep everything in the repo folder
3. **Don't over-engineer** - Minimum necessary complexity
4. **Don't skip builds** - Always verify Swift code compiles
5. **Don't assume** - Research before implementing
6. **Don't use stale docs** - It's 2026, verify documentation is current

---

## 📚 Reference Files

Look at these for patterns (but don't modify them):
- `Accountabilityv6-callkit/Accountabilityv6/Services/` - Voice conversation handling
- `Accountabilityv6-callkit/Accountabilityv6/Models/` - Data models
- `Accountabilityv6-callkit/Documentation/` - Architecture decisions

---

## 🎯 Current Project Focus

Building a voice AI Mac app WITHOUT:
- CallKit (that's iOS-only)
- WebRTC loopback system

MUST preserve from reference implementation:
- Sophisticated timer system for response pipeline buffering
- Interruption system for natural conversation flow
- Conversation memory and summarization
