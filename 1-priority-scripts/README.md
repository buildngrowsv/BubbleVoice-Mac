# Priority Scripts

Confirmed-working standalone scripts that demonstrate critical capabilities. These are separated from the larger test sandbox folders so they don't get lost among experimental/broken tests.

**Source of truth for SpeechAnalyzer configuration:** `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md`

---

## CONFIRMED-WORKING-VPIOEchoCancellationTest.swift

**Status:** CONFIRMED WORKING (Feb 2026)

Proves that Apple's VPIO (Voice Processing IO) provides full acoustic echo cancellation on macOS. The `say` command generates a TTS audio file, plays it through `AVAudioPlayerNode` on an `AVAudioEngine` with VPIO enabled, and `SpeechAnalyzer` transcribes the AEC-cleaned microphone input. Zero TTS words leaked into transcription while background speech was captured cleanly.

```bash
swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia -O -o /tmp/vpio_echo_test CONFIRMED-WORKING-VPIOEchoCancellationTest.swift && /tmp/vpio_echo_test
```

**Key finding:** VPIO alone is sufficient for AEC on macOS. No WebRTC needed.

---

## TurnDetectionWithVPIOTest.swift

**Status:** CONFIRMED WORKING (Feb 2026)

Full turn detection + response caching + interruption test with VPIO AEC. Implements all 4 paths from `instructions.mdc`: normal turn, cache hit, cache expiry, playback interruption. Echoes back user speech via `say` instead of calling an LLM. Runs for 5 completed turns.

```bash
swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia -O -o /tmp/turn_test TurnDetectionWithVPIOTest.swift && /tmp/turn_test
```

**Key finding:** With `.fastResults` enabled, the 2-second silence timer works reliably and transcription continues through TTS playback.

---

## SpeechAnalyzerLatencyTest.swift

**Status:** DIAGNOSTIC TOOL (Feb 2026)

Measures SpeechAnalyzer result delivery latency under 3 conditions: bare (no VPIO), with VPIO, and with VPIO + TTS playback. Used to diagnose the `.fastResults` fix.

```bash
swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia -O -o /tmp/latency_test SpeechAnalyzerLatencyTest.swift && /tmp/latency_test
```

**Key finding:** `.fastResults` reduces delivery gaps from ~3.8s to ~1.0s.

---

## PostTTSRecoveryStrategiesTest.swift

**Status:** DIAGNOSTIC TOOL (Feb 2026) — RESOLVED: no fix needed

Tests 4 strategies for post-TTS SpeechAnalyzer recovery: baseline, silent keepalive, analyzer restart, SFSpeechRecognizer fallback. All recovered in under 1 second with `.fastResults` enabled.

```bash
swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia -O -o /tmp/recovery_test PostTTSRecoveryStrategiesTest.swift && /tmp/recovery_test
```

**Key finding:** The "25-second stall" was caused by missing `.fastResults`, not VPIO. Baseline recovery is 0.5s — no special strategy needed.

---

## All scripts require

- macOS 26+
- Microphone permission
- Background audio from another device (for testing transcription during TTS)
