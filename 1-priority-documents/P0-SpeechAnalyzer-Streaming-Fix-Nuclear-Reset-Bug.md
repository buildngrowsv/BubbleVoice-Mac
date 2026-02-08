# P0 PRIORITY: SpeechAnalyzer Streams Real-Time — Our "Chunk Batch" Is a Self-Inflicted Bug

**Date**: 2026-02-08  
**Status**: CRITICAL — Root cause of most voice pipeline issues  
**Affects**: Turn detection latency, multi-turn failures, premature sends, conversation responsiveness  

---

## Executive Summary

**SpeechAnalyzer absolutely supports real-time, word-by-word streaming of volatile results — identical in behavior to SFSpeechRecognizer's partial results.** The "4-second chunk batch" behavior we observed and have been fighting is caused entirely by our implementation destroying and rebuilding the entire SpeechAnalyzer pipeline on every turn boundary using the wrong API method.

This single architectural mistake is the root cause of:
- Need for 4.5s silence timers (should be ~0.5-1s)
- VAD heartbeat system complexity
- Cascade epoch system
- Multi-turn test failures
- ~2-4 second dead zones between turns
- The general feeling that the app is "sluggish" and "choppy"

---

## The Bug: Nuclear Reset on Every Turn Boundary

### What Happens Now (WRONG)

Every `reset_recognition` command (sent after AI speaks, after interruption, after timer cascade) triggers:

```
resetSpeechAnalyzerSession()
  → stopListeningAsync()
      → audioEngine.stop()                          // STOP audio engine
      → inputNode.removeTap(onBus: 0)               // REMOVE audio tap
      → continuation.finish()                        // CLOSE input stream
      → speechAnalyzerTask.cancel()                  // CANCEL result consumer
      → analyzer.finalizeAndFinishThroughEndOfInput() // ⚠️ PERMANENTLY KILL ANALYZER
      → speechAnalyzer = nil                         // Nil EVERYTHING
      → speechTranscriber = nil
      → speechAnalyzerAudioFormat = nil
      → audioConverter = nil
  → Task.sleep(200ms)                               // Wait for audio to drain
  → startListeningInternal()
      → configureSpeechAnalyzerIfNeeded()
          → NEW SpeechTranscriber(...)               // Create NEW transcriber
          → NEW SpeechAnalyzer(modules: [...])       // Create NEW analyzer
          → bestAvailableAudioFormat(...)             // Query format AGAIN (async)
      → NEW AsyncStream<AnalyzerInput>.makeStream()  // New stream
      → startSpeechAnalyzerResultTask(...)           // New result consumer task
      → inputNode.removeTap(onBus: 0)               // Remove tap AGAIN
      → setVoiceProcessingEnabled(true)              // Re-enable AEC AGAIN
      → NEW AVAudioConverter(...)                    // New converter
      → inputNode.installTap(...)                    // Install NEW tap
      → audioEngine.prepare()                        // Prepare engine AGAIN
      → audioEngine.start()                          // Start engine AGAIN
      → analyzer.start(inputSequence: stream)        // Cold start analyzer
```

**That's 17+ heavyweight operations repeated on every single turn boundary.**

The critical mistake is `finalizeAndFinishThroughEndOfInput()`. From the Itsuki article (most detailed community documentation of SpeechAnalyzer):

> "This will make the analysis **finish** after the audio file has been fully processed... The modules' result streams will have ended and the modules will not accept further input... The analyzer will not be able to resume analysis with a different input sequence... most methods will do nothing."

This is the **permanent kill** method. It's meant for app shutdown, not turn boundaries.

### What Should Happen (CORRECT)

Apple provides a lighter method: `finalize(through:)` which finalizes the CURRENT INPUT but keeps the session alive. After finalization, you call `start(inputSequence:)` with a new stream, and the analyzer continues working.

```
resetSpeechAnalyzerSession() — FIXED:
  → continuation.finish()                           // Close current input stream
  → analyzer.finalize(through: lastTimestamp)        // Finalize current input ONLY
  → NEW AsyncStream<AnalyzerInput>.makeStream()      // Create new stream
  → analyzer.start(inputSequence: newStream)         // Start new input — INSTANT
```

**That's 4 lightweight operations.**

Everything else stays alive:
- ✅ Audio engine keeps running
- ✅ Audio tap stays installed (just swap which continuation it yields to)
- ✅ SpeechAnalyzer stays loaded (neural model warm)
- ✅ SpeechTranscriber stays attached (results stream continues)
- ✅ Voice Processing IO stays enabled
- ✅ Audio converter stays configured
- ✅ No 200ms stabilization delay needed
- ✅ No crash risk from tap installation race conditions

---

## Why This Explains Everything

### Why We Needed 4.5s Silence Timers
Each cold analyzer start takes ~1-2 seconds before the first volatile result. Plus 200ms stabilization delay. Plus audio engine restart. The "4-second chunk" was the cold-start latency, not a property of the API.

With a warm analyzer, volatile results stream every 200-500ms. We could use ~0.5-1.0s timers like Accountability v6.

### Why Multi-Turn Tests Fail
Turn 1 works because the analyzer was pre-warmed. After Turn 1, the backend sends `reset_recognition`, which nukes the analyzer. Turn 2 has to cold-start a brand new analyzer, introducing a ~2-4 second dead zone where no transcription happens. The user speaks during this dead zone and the speech is lost.

### Why the VAD Heartbeat System Was Needed
The heartbeat system was invented to bridge the "processing gaps" — but those gaps were really the cold-start latency from recreating the analyzer. With a warm persistent analyzer, volatile results flow continuously and no heartbeat system is needed.

### Why We Had SIGTRAP Crashes
Rapidly stopping and starting the audio engine (stop → remove tap → install tap → start) created race conditions where the engine's internal thread was still draining callbacks. This is completely avoided by keeping the engine running and just swapping the AsyncStream.

---

## Comparison: Accountability v6 vs BubbleVoice (Current vs Fixed)

| Dimension | Accountability v6 | BubbleVoice (Current BUG) | BubbleVoice (Fixed) |
|---|---|---|---|
| STT API | SFSpeechRecognizer | SpeechAnalyzer | SpeechAnalyzer |
| Result delivery | Word-by-word (callback) | ~4s chunks (cold start) | Word-by-word (volatile stream) |
| Silence timer | 0.5s | 4.5s | ~0.5-1.0s |
| Reset method | stopRecognition → startRecording | NUKE everything → rebuild | finalize → start new stream |
| Reset cost | ~0.5s (new recognition task) | ~2-4s (full pipeline rebuild) | ~50ms (stream swap) |
| Audio engine | Stays running | Stop → 200ms → Restart | Stays running |
| Complexity | Simple | Massive (VAD, heartbeat, epochs) | Simple |

---

## The Fix: Implementation Plan

### Step 1: Refactor resetSpeechAnalyzerSession()
- Use `finalize(through:)` instead of `finalizeAndFinishThroughEndOfInput()`
- Keep analyzer, transcriber, audio engine, and converter alive
- Only create a new AsyncStream and swap the continuation
- Keep the results consumer task running (it reads from the same transcriber.results)

### Step 2: Add prepareToAnalyze Preheating
- After creating the analyzer in `configureSpeechAnalyzerIfNeeded()`, call `analyzer.prepareToAnalyze(in: format)` to preload neural model resources
- This eliminates first-result latency even on the initial cold start

### Step 3: Refactor Audio Tap to Swap Continuations
- Instead of removing/reinstalling the tap, use an atomic continuation reference
- The tap callback always yields to `self.speechAnalyzerInputContinuation`
- On reset, we just swap the continuation pointer after creating the new stream

### Step 4: Reduce Backend Timer Values
- After confirming streaming works, reduce `llmStart` from 4.5s toward 0.5-1.0s
- Remove or simplify the VAD heartbeat gate
- Remove cascade epoch system (may no longer be needed)
- Remove single-word flush mechanism (volatile results should capture short utterances)

### Step 5: Remove Stabilization Delay
- The 200ms `Task.sleep` was needed because we were stopping/starting the audio engine
- With the engine staying alive, no stabilization is needed

---

## Evidence / Sources

1. **Gemini analysis** (2026-02-08): Confirmed SpeechAnalyzer streams volatile results in real-time, word-by-word
2. **Itsuki article** (Level Up Coding): Documented `finalize` vs `finalizeAndFinishThroughEndOfInput` difference, showed analyzer reuse pattern
3. **Anton's Substack**: Confirmed SFSpeechRecognizer still works on macOS 26, migration is optional
4. **Apple WWDC 2025 Session 277**: SpeechAnalyzer designed for real-time and long-form transcription
5. **Our own research doc** (STT-Whisper-vs-SpeechAnalyzer-Research.md): "Progressive updates ~every 200-500ms (word-by-word)"
6. **Accountability v6 code** (CallManager.swift): Reference implementation showing direct streaming works with 0.5s timers
7. **Callstack blog**: Confirmed real-time streaming capability in React Native integration

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `finalize(through:)` may not work as documented for stream input | Test immediately; fall back to lightweight recreate (keep engine running, only recreate analyzer) |
| `transcriber.results` stream may close on finalize | Test; if so, create new result consumer task but keep everything else alive |
| Audio tap continuation swap may have race conditions | Use atomic/volatile reference pattern |
| SpeechAnalyzer may accumulate text across finalizations | Test; if so, we still need to track text offsets in backend |

---

## Files That Need Changes

1. **`swift-helper/BubbleVoiceSpeech/Sources/main.swift`** — Core fix: refactor reset, add preheating, keep engine alive
2. **`src/backend/services/VoicePipelineService.js`** — Reduce timer values, simplify/remove VAD heartbeat gate, reduce cascade complexity
3. **`tests/e2e-voice-conversation/voice-e2e-test-runner.js`** — Re-run tests to validate fix

---

*This document supersedes all previous timer tuning, VAD heartbeat, and cascade epoch fixes. Those were treating symptoms of this root cause.*
