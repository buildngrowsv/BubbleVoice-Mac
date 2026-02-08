# E2E Voice Test - Bugs Found & Fixed (Round 3)

**Date**: 2026-02-07  
**Tests**: Full suite (6 scenarios)  
**Result**: 2 PASS (basic_roundtrip, long_utterance), 4 FAIL  
**Key Achievement**: Root cause of the #1 bug (premature send / long utterance cutoff) found and fixed.

---

## ROOT CAUSE ANALYSIS — Bug 5: Premature Send (THE FIX)

### The Problem

For 3 rounds of debugging, the most severe user-facing bug was "premature send" — the system
would cut off the user's speech mid-sentence and send an incomplete message to the LLM. This
manifested most clearly in the `long_utterance` test where a 7-sentence, 68-word utterance
would only send the first sentence.

### Previous Fix Attempts (Rounds 1-2)

1. **VAD heartbeats** — Swift sends `vad_speech_active` signals while mic detects energy
2. **Cascade epoch** — Counter to cancel stale timer callbacks
3. **Increased timer to 4.5s** — To span SpeechAnalyzer's processing window
4. **Adaptive delay** — Extra delay for short utterances

These all helped incrementally but didn't solve the root cause.

### Root Cause Found

**Two lines of code** in `VoicePipelineService.js` `handleSwiftResponse` for `transcription_update`:

```javascript
// BUG LINE 1: Including silence timer state in "is AI responding?" check
const hasActiveTimersBefore = session.silenceTimers.llm || ...;
const wasInResponsePipeline = ... || hasActiveTimersBefore;  // ← WRONG

// BUG LINE 2: Including silence timer state in "should we reset timer?" check
const hasActiveTimersAfter = session.silenceTimers.llm || ...;
const isCurrentlyInPipeline = ... || hasActiveTimersAfter;    // ← WRONG
```

**Bug 1 — False Interruption Detection:**

The silence timers (especially the 4.5s LLM timer) are a DETECTION mechanism — they watch
for silence to decide when to process. But the code treated them as a "response in progress"
indicator. The cascading failure:

1. First transcription "Hello" → starts 4.5s LLM timer
2. 3 seconds later, SpeechAnalyzer emits "Hello, I am" (next processing chunk)
3. LLM timer is still pending (has 1.5s left) → `hasActiveTimersBefore = true`
4. `wasInResponsePipeline = true` → **FALSE INTERRUPTION detected!**
5. `handleSpeechDetected()` clears everything, sends `reset_recognition` to Swift
6. Swift tears down the audio engine, destroys the SpeechAnalyzer instance
7. Audio is lost during the ~1-2 second restart
8. Only partial text ever gets sent to the LLM

**Bug 2 — Timer Never Resets:**

Similarly, `hasActiveTimersAfter` prevented `resetSilenceTimer()` from being called while
timers were running. This broke the core Accountability timer-reset pattern:

1. First transcription → starts 4.5s LLM timer
2. Later transcription → timers active → `isCurrentlyInPipeline = true`
3. `resetSilenceTimer()` is SKIPPED
4. Timer fires 4.5s after the FIRST transcription, not after the LAST one
5. Incomplete text is processed

### The Fix

Removed timer state from both pipeline activity checks:

```javascript
// FIXED: Only check actual response-in-progress flags
const wasInResponsePipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
const isCurrentlyInPipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
```

Genuine "AI is responding" indicators:
- `session.isInResponsePipeline` — Set when the LLM timer **fires** (i.e., `runLlmProcessing` starts)
- `session.isTTSPlaying` — Set when TTS audio starts playing
- `swiftIsSpeaking` — Real-time flag from Swift that the `say` process is active

### Verification

After the fix, the `long_utterance` test passes consistently:
- **Before fix**: 12% word capture (first sentence only)
- **After fix**: 100% word capture (all 7 sentences, all 68 words)

The `basic_roundtrip` test also passes consistently with full text capture.

---

## Additional Bugs Fixed in Round 3

### Bug 10: `ws.send is not a function` crash in speech_energy_silence handler

**Severity**: P1 (crashes Swift helper IPC, breaks all subsequent voice input)  
**Root Cause**: The `speech_energy_silence` handler iterated over `this.server.connections.values()`,
which gives `connectionState` objects, not WebSocket objects. Calling `.send()` on a connectionState
throws, and the error propagation killed the Swift response parsing pipeline.

**Fix**: Changed to iterate with `[ws, connectionState]` entries and use `this.server.sendMessage(ws, ...)`.

### Bug 11: Destructive `reset_recognition` on speech_energy_silence with no text

**Severity**: P0 (causes SIGTRAP crash and total audio loss)  
**Root Cause**: When Swift's VAD detected speech energy followed by silence, and no transcription
text existed (common with ambient noise triggering the VAD during pre-speech wait), the backend
sent `reset_recognition` to Swift. This tore down the active recognition session:

1. User presses mic button → recognition starts
2. 2-second stabilization wait (ambient noise can trigger VAD during this)
3. VAD fires `speech_energy_silence` (false positive from ambient noise)
4. Backend sends `reset_recognition` → Swift stops + restarts recognition
5. If user starts speaking during the restart, audio is lost
6. In some cases, the rapid stop-start cycle triggered a **SIGTRAP crash** that killed the Swift helper entirely

**Fix**: Removed the `reset_recognition` call from the "no text + idle" branch of the
`speech_energy_silence` handler. The recognition session is already active and will capture
the next utterance without any reset. We still send the `speech_not_captured` notification
to the frontend for user feedback.

### Bug 12: SIGTRAP crash on rapid SpeechAnalyzer reset

**Severity**: P0 (kills Swift helper, no recovery possible)  
**Root Cause**: Even with the `isResetting` serialization lock, the AVAudioEngine's internal
audio thread can still be draining callbacks when a new tap is installed. The 0ms gap between
`stopListeningAsync()` and `startListeningInternal()` wasn't sufficient.

**Fix**: Added a 200ms stabilization delay in `resetSpeechAnalyzerSession()` between stop and
start. This gives the audio system time to fully quiesce (200ms covers 2+ buffer cycles at
4096 samples/48kHz). Also acts as a safeguard against the `nullptr == Tap()` crash.

---

## Test Results — Round 3

| Test | Result | Notes |
|------|--------|-------|
| `basic_roundtrip` | **PASS** ✅ | Full text captured, AI responded correctly |
| `long_utterance` | **PASS** ✅ | 68 words / 7 sentences captured without premature send |
| `multi_turn` | FAIL | Turn 1 works, turns 2-3 produce no transcriptions |
| `interruption` | FAIL | Turn 1 works, interruption speech not captured |
| `rapid_fire` | FAIL | Turn 1 works, turns 2-4 produce no transcriptions |
| `short_utterances` | FAIL | Expected — SpeechAnalyzer's 4s processing window swallows short words |

### Analysis of Remaining Failures

**Common pattern**: Turn 1 always works. Subsequent turns after TTS playback produce ZERO
transcription updates. This strongly suggests:

1. **Swift helper crash after TTS**: The `speech_ended` handler sends `reset_recognition`.
   Despite the 200ms stabilization delay, the stop-start cycle may still be fragile under
   certain timing conditions, causing a silent crash or hang in the Swift helper.

2. **Audio engine not recovering**: After `reset_recognition`, the AVAudioEngine is stopped
   and restarted. The new audio tap may not properly connect to the microphone in some cases,
   especially if the audio route changed (e.g., TTS switched output devices).

3. **Echo suppression over-filtering**: The `lastSpokenText` and `lastSpokenAt` are not fully
   reset after `speech_ended` (only transcription state is reset). If the next utterance
   arrives within the 15-second echo suppression window, and any fragment matches the AI's
   previous response, it could be silently filtered.

**Recommended next investigation**:
- Add logging to confirm whether the Swift helper is still alive after turn 1's TTS ends
- Check if `speech_ended` event is even received (TTS playback may hang or not fire termination)
- Verify the audio engine state after reset (is the input node producing buffers?)
- Consider resetting `lastSpokenText` in the `speech_ended` handler

---

## Files Modified in Round 3

### `src/backend/services/VoicePipelineService.js`
- **Lines ~793-822**: Removed `hasActiveTimersBefore` from `wasInResponsePipeline` check (ROOT CAUSE FIX)
- **Lines ~858-880**: Removed `hasActiveTimersAfter` from `isCurrentlyInPipeline` check (ROOT CAUSE FIX)
- **Lines ~826-829**: Updated interruption log to not reference removed variable
- **Lines ~982-1015**: Replaced destructive `reset_recognition` with log-only in `speech_energy_silence` handler
- **Lines ~982**: Fixed `ws.send is not a function` crash (use `server.sendMessage` instead)

### `swift-helper/BubbleVoiceSpeech/Sources/main.swift`
- **Lines ~957-975**: Added 200ms stabilization delay in `resetSpeechAnalyzerSession()` between stop and start

---

## Timeline of Round 3 Debugging Session

1. **Identified root cause** by tracing backend log showing `VOICE INTERRUPT` firing during normal speech
2. **Traced the logic** showing `hasActiveTimersBefore` was `true` whenever the LLM timer was pending
3. **Fixed both pipeline checks** — removed timer state from interruption detection and timer reset gating
4. **First test**: basic_roundtrip PASSED but app crashed (SIGTERM from timeout + `ws.send` bug)
5. **Fixed ws.send bug** in `speech_energy_silence` handler
6. **Second test**: basic_roundtrip PASSED, long_utterance FAILED (SIGTRAP crash from premature reset)
7. **Removed destructive reset** from `speech_energy_silence` handler
8. **Added 200ms delay** in Swift's `resetSpeechAnalyzerSession()` for audio pipeline stability
9. **Third test**: basic_roundtrip PASS, long_utterance PASS (full 68-word capture!)
10. **Full suite**: 2/6 PASS, remaining failures are turn-transition issues (not premature send)

---

## Summary of All Bugs Found Across 3 Rounds

| # | Bug | Severity | Status | Round |
|---|-----|----------|--------|-------|
| 1 | FATAL CRASH — Double tap installation | P0 | ✅ Fixed (Round 1) | 1 |
| 2 | Transcription garbling (volatile append) | P0 | ✅ Fixed (Round 1) | 1 |
| 3 | TTS echo false interruption | P1 | ✅ Fixed (Round 1) | 1 |
| 4 | speech_ended not reaching test client | P2 | ✅ Fixed (Round 1) | 1 |
| 5 | **Premature send (long utterances)** | **P0** | **✅ ROOT CAUSE FIXED (Round 3)** | 2→3 |
| 6 | Empty AI responses from Gemini | P1 | ✅ Fixed (Round 2, retry logic) | 2 |
| 7 | Interruption doesn't complete | P1 | ⚠️ Partially fixed (needs investigation) | 2 |
| 8 | SpeechAnalyzer 4s delay misalignment | P2 | ℹ️ Known limitation of Apple API | 2 |
| 9 | Short utterances swallowed | P2 | ℹ️ Known limitation of Apple API | 2 |
| 10 | `ws.send is not a function` crash | P1 | ✅ Fixed (Round 3) | 3 |
| 11 | Destructive reset on ambient noise | P0 | ✅ Fixed (Round 3) | 3 |
| 12 | SIGTRAP on rapid SpeechAnalyzer reset | P0 | ✅ Mitigated (Round 3, 200ms delay) | 3 |
| 13 | Turn transitions fail after TTS | P1 | 🔴 Open — needs investigation | 3 |

**Overall**: 9 bugs fixed, 1 mitigated, 1 known Apple limitation, 1 open for investigation.
