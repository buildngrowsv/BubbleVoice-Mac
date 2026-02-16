# SpeechAnalyzer Definitive Configuration & Findings

**Date**: 2026-02-09  
**Status**: SOURCE OF TRUTH — all other docs should reference this  
**Supersedes**: CRITICAL-STT-BUG-CONFIRMED.md, Turn-Detection-Learnings.md findings #2/#10/#11

---

## The One Configuration That Works

```swift
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [.volatileResults, .fastResults],  // ← BOTH required
    attributeOptions: [.audioTimeRange]
)

let options = SpeechAnalyzer.Options(
    priority: .userInitiated,
    modelRetention: .processLifetime
)
let analyzer = SpeechAnalyzer(modules: [transcriber], options: options)
```

### Why Each Flag Matters

| Flag | What it does | What breaks without it |
|------|-------------|----------------------|
| `.volatileResults` | Enables partial/progressive results (not just finals) | Only get sentence-final results, no real-time feedback |
| `.fastResults` | Streams results word-by-word at 200-500ms intervals | Results batch in ~3.8-second chunks, breaking 2s silence timers |
| `.audioTimeRange` | Attaches precise audio timestamps to each result | No timing info for speech segments |
| `.userInitiated` | Prioritizes neural engine work for our process | May be deprioritized behind system tasks |
| `.processLifetime` | Keeps neural model in memory across analyzer restarts | ~1-2 second cold-start delay per rebuild |

---

## The Root Cause of Every Major Bug

**Missing `.fastResults` was the single root cause of:**

1. **"4-second chunk batch" behavior** — SpeechAnalyzer batched results in ~3.8s windows
2. **False 2-second silence timer triggers** — The 3.8s gap between batches always exceeded 2s
3. **"25-second post-TTS stall"** — Without fast results, the analyzer took ~25s to resume after TTS playback; with `.fastResults`, recovery is 0.5s
4. **"SpeechAnalyzer is fundamentally broken" conclusion** — The API works perfectly with correct flags
5. **Need for 4.5s silence timers** — With `.fastResults`, a 2.0s timer works reliably
6. **Single-word utterances being missed** — Much less severe with `.fastResults` streaming

### How We Discovered This

1. Analyzed the `SwiftUI_SpeechAnalyzerDemo` repo (Apple's reference implementation)
2. Found it uses the `.timeIndexedProgressiveTranscription` preset
3. That preset maps to `[.volatileResults, .fastResults]` + `[.audioTimeRange]`
4. Added `.fastResults` to our test scripts → immediate fix
5. Confirmed via `SpeechAnalyzerLatencyTest.swift`: delivery gaps went from 3.8s → ~1.0s

---

## Echo Cancellation: VPIO Solves It Completely

**SpeechAnalyzer does NOT need its own echo cancellation because VPIO provides hardware AEC.**

```swift
try audioEngine.outputNode.setVoiceProcessingEnabled(true)
```

This one line enables:
- Hardware-level acoustic echo cancellation at **full output volume** (no need to lower TTS volume)
- The `inputNode` output = clean mic signal with speaker audio subtracted
- SpeechAnalyzer receives echo-free audio via the tap
- Continuous transcription THROUGH TTS playback (no gaps, no pausing)
- 0.5s recovery after TTS ends (confirmed by PostTTSRecoveryStrategiesTest)
- **No WebRTC needed** — VPIO is a single API call, no dual-peer connection required
- **No `isSpeaking` flag filtering needed** — the audio is already clean before SpeechAnalyzer sees it
- **No backend echo suppression needed** — VPIO handles it at the hardware level

### What This Replaced

Earlier docs suggested:
- "Track `isSpeaking` and filter transcriptions during TTS" — **NOT NEEDED** with VPIO
- "Backend filters transcriptions that match recent TTS output" — **NOT NEEDED** with VPIO
- "WebRTC dual-peer for AEC" — **NOT NEEDED** on macOS; VPIO provides it directly
- "Pause TTS during STT" — **NOT NEEDED**; simultaneous TTS+STT works with VPIO

### Architecture

```
┌─────────────────────────────────────────────────────┐
│               AVAudioEngine (VPIO enabled)           │
│                                                     │
│  say command → .aiff file → AVAudioPlayerNode       │
│       → mainMixerNode → outputNode → Speakers       │
│                              │                      │
│                    VPIO AEC reference signal         │
│                              │                      │
│  Microphone → inputNode → [AEC subtraction]         │
│       → tap (mono float32) → converter              │
│       → SpeechAnalyzer (clean audio, no echo)       │
│       → transcriber.results → turn detection        │
└─────────────────────────────────────────────────────┘
```

---

## Post-TTS Recovery: No Special Strategy Needed

Tested 4 strategies (PostTTSRecoveryStrategiesTest.swift, 2026-02-09):

| Strategy | Recovery Time | Notes |
|----------|-------------|-------|
| **Baseline (do nothing)** | **0.5s** | Just wait — works fine with `.fastResults` |
| Silent keepalive | 0.4s | Marginal, not worth the complexity |
| Analyzer restart | 1.0s | Actually slowest due to restart overhead |
| SFSpeechRecognizer fallback | 0.5s | SFSpeech detects at 0.1s but not needed |

**Conclusion**: With `.fastResults`, no special post-TTS recovery strategy is needed.

The "25-second stall" that prompted this investigation was caused by missing `.fastResults`, not by VPIO interaction. Once `.fastResults` is enabled, the analyzer recovers in 0.5s after TTS ends.

---

## Turn Detection Timers (Validated Values)

With `.fastResults` enabled, these timers work correctly:

| Timer | Value | Why |
|-------|-------|-----|
| Silence threshold | 2.0s | Results stream at 200-500ms; 2s gap = definite silence |
| Cache expiry | 5.0s | Window to reuse a cached LLM response after user interrupts |
| Interruption threshold | 2 words | Minimum new words to count as user interruption |

These values are per `instructions.mdc` in the parent repo.

---

## Continuous Transcription During TTS

SpeechAnalyzer transcribes **continuously through TTS playback**:
- The mic tap feeds audio buffers to the analyzer non-stop
- VPIO echo-cancels the TTS output so the analyzer only sees user speech
- New words appear during TTS (confirmed: words detected 3.2s into a 4.9s TTS clip)
- Interruption detection works during TTS — user speaks 2+ words → stop playback

This is NOT "pausing STT during TTS." It is true full-duplex voice.

---

## Test Scripts That Confirm All of This

All in `1-priority-scripts/`:

| Script | What It Proves |
|--------|---------------|
| `CONFIRMED-WORKING-VPIOEchoCancellationTest.swift` | VPIO AEC works, zero TTS echo leaks |
| `TurnDetectionWithVPIOTest.swift` | Full turn detection + caching + interruption pipeline |
| `SpeechAnalyzerLatencyTest.swift` | `.fastResults` reduces delivery from 3.8s → 1.0s |
| `PostTTSRecoveryStrategiesTest.swift` | Post-TTS recovery is 0.5s, no special fix needed |

---

## Documents That Conflict With This (and corrections)

All documents below have been updated with correction headers pointing back to this doc.

### Configuration / API Issues

| Document | What It Says (WRONG) | What's Actually True |
|----------|---------------------|---------------------|
| `CRITICAL-STT-BUG-CONFIRMED.md` | "SpeechAnalyzer API is fundamentally broken" | Works perfectly with `.fastResults` |
| `SpeechAnalyzer-API-Quirks-And-Gotchas.md` §5 | Uses `[.volatileResults]` only | Must use `[.volatileResults, .fastResults]` |
| `Turn-Detection-Learnings.md` #2, #10 | "4-second chunk batching" | Only without `.fastResults`; with it, 200-500ms streaming |
| `Turn-Detection-Learnings.md` #11 | "Single words reliably fail" | Much less severe with `.fastResults` |
| `PostTTSRecoveryStrategiesTest.swift` header | "25-second stall from VPIO" | Stall was from missing `.fastResults` |

### Echo Cancellation / Volume Issues

| Document | What It Says (WRONG) | What's Actually True |
|----------|---------------------|---------------------|
| `SpeechAnalyzer-API-Quirks-And-Gotchas.md` §13 | "No built-in echo cancellation" | VPIO provides hardware AEC at full volume |
| `STT-Whisper-vs-SpeechAnalyzer-Research.md` | "No echo cancellation", lists WebRTC as workaround | VPIO provides it, no WebRTC needed |
| `STT-Comprehensive-Test-Results.md` | "Filter transcriptions where isSpeaking=true", "echo suppression is critical" | VPIO handles AEC at hardware level, no filtering needed |
| `Turn-Detection-Learnings.md` #7 | "7-second echo suppression window is correct" | Not needed with VPIO AEC |
| `webrtc-sandbox/TESTING_GUIDE.md` | "Confirms we need WebRTC's AEC" | VPIO provides AEC, WebRTC not needed on macOS |
| `webrtc-sandbox/README.md` | "WebRTC AEC is needed" | Superseded by VPIO |
| `turn-detection-test-harness/README.md` | "mic may pick up TTS audio", echo suppression logic | VPIO prevents echo at hardware level |

---

*This document is the single source of truth for SpeechAnalyzer configuration in BubbleVoice-Mac.*
*All other documents should be read in context of the corrections listed above.*
*Last updated: 2026-02-09*
