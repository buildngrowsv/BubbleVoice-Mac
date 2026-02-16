# SpeechAnalyzer API Quirks and Gotchas

**Date**: 2026-02-07
**Applies to**: macOS 26.1, Swift 6.1, SpeechAnalyzer framework

This document captures hard-won knowledge about Apple's SpeechAnalyzer API that is NOT in the official documentation. These findings come from direct testing in a headless command-line helper process (no UI, no SwiftUI, no storyboard).

---

## 1. AVAudioConverter: The `.endOfStream` Trap

**Severity**: CRITICAL — will silently produce zero results

When converting audio from the mic format (48kHz Float32) to the analyzer format (16kHz Int16), the `AVAudioConverter.convert()` closure MUST use the `.haveData`/`.noDataNow` pattern:

```swift
// CORRECT:
nonisolated(unsafe) var bufferProvided = false
let status = converter.convert(to: output, error: &err) { _, inputStatus in
    if bufferProvided {
        inputStatus.pointee = .noDataNow
        return nil
    }
    bufferProvided = true
    inputStatus.pointee = .haveData
    return buffer
}

// WRONG — KILLS ALL TRANSCRIPTION:
let status = converter.convert(to: output, error: &err) { _, inputStatus in
    inputStatus.pointee = .endOfStream  // <-- THIS KILLS IT
    return buffer
}
```

**Why**: `.endOfStream` tells the converter "this is the last audio buffer that will ever exist." The converter may produce corrupted output or reset internal state. The analyzer receives garbage and silently discards it — no error, no warning, just zero results.

**How we found it**: Debugged by adding logging at every stage. Audio buffers were flowing (100+ per test), the analyzer started correctly, but `transcriber.results` produced 0 results. Community code examples all use `.haveData`/`.noDataNow`.

---

## 2. `primeMethod` Must Be `.none`

```swift
audioConverter?.primeMethod = .none
```

Without this, the converter uses "priming" samples that introduce timestamp drift. Over time, the converted audio drifts out of sync with the real audio, potentially causing the analyzer to lose track of speech timing.

Both Apple's own sample code and community implementations set this.

---

## 3. `analyzer.start(inputSequence:)` Returns Quickly

Despite being `async`, `analyzer.start(inputSequence:)` returns almost immediately. It does NOT block until all audio is processed. The actual processing happens in the background.

**Implications**:
- Code after `try await analyzer.start(...)` runs right away
- You must set up the `transcriber.results` consumer task BEFORE calling `start()`
- The `isListening = true` flag can be set immediately after `start()` returns

This is different from `analyzer.analyzeSequence(from: audioFile)` which IS blocking for file-based analysis.

---

## 4. `SpeechDetector` Doesn't Conform to `SpeechModule`

As of macOS 26.1, Apple documents `SpeechDetector` as a voice activity detection module that should work with `SpeechAnalyzer`, but it does NOT conform to the `SpeechModule` protocol. Attempting to use it:

```swift
let detector = SpeechDetector()
let analyzer = SpeechAnalyzer(modules: [detector])  // COMPILE ERROR
```

This is a confirmed Apple bug. You cannot use `SpeechDetector` with `SpeechAnalyzer` currently. VAD must be implemented manually if needed (e.g., energy-based detection in the audio tap callback).

---

## 5. `SpeechTranscriber.Preset` API Changes (UPDATED 2026-02-09)

The preset `.progressiveLiveTranscription` that appeared in early beta documentation may not exist in the release. Use explicit options instead:

```swift
// This may not compile:
let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveLiveTranscription)

// ✅ CORRECT — use this (UPDATED 2026-02-09):
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [.volatileResults, .fastResults],  // BOTH required!
    attributeOptions: [.audioTimeRange]
)
```

**CRITICAL (2026-02-09):** You MUST include `.fastResults` alongside `.volatileResults`.
- `.volatileResults` alone: Results arrive in ~3.8-second batches (the "chunk batch" behavior)
- `.volatileResults` + `.fastResults`: Results stream word-by-word at 200-500ms intervals

This was discovered by analyzing Apple's `SwiftUI_SpeechAnalyzerDemo` repo, which uses
the `.timeIndexedProgressiveTranscription` preset (maps to these exact flags). Without
`.fastResults`, the analyzer waits for "enough confidence" before sending results. With it,
you get true real-time streaming identical to `SFSpeechRecognizer`'s partial results.

**See:** `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md` for full details.

---

## 6. Headless Process Considerations

SpeechAnalyzer works in a headless command-line process (no UI) with these caveats:

- **Permissions**: The CLI process cannot show permission dialogs. The parent app (Electron in our case) must request microphone and speech recognition permissions. If permissions are missing, `AVAudioEngine.start()` will throw.
- **`SFSpeechRecognizer.requestAuthorization`**: Still needed even for SpeechAnalyzer. The underlying speech recognition permission is shared. But calling it from a headless process is unreliable — let the UI layer handle it.
- **No `AVAudioSession`**: On macOS, `AVAudioSession` is not available (it's iOS/tvOS only). Audio session configuration is not needed. `AVAudioEngine` works directly with the default input device.

---

## 7. `AsyncStream` Lifetime Management

The `AsyncStream<AnalyzerInput>` used to feed audio to the analyzer must be kept alive:

- Store the `continuation` as a strong reference (instance property)
- Call `continuation.finish()` when stopping — this signals the analyzer that no more audio is coming
- After `finish()`, call `analyzer.finalizeAndFinishThroughEndOfInput()` to properly close the session

If the continuation is deallocated without calling `finish()`, the behavior is undefined (may hang or produce incomplete results).

---

## 8. `@unchecked Sendable` for the Helper Class

Swift 6 strict concurrency requires types passed across concurrency domains to be `Sendable`. Our `SpeechHelper` class is accessed from:
- The main thread (command handling)
- Audio tap callback thread (buffer processing)
- Task-based async pipeline (result consumption)

Making it fully actor-isolated would require restructuring the entire IPC loop. Instead, we mark it as `final class SpeechHelper: @unchecked Sendable` with the understanding that:
- It's process-local (not shared across processes)
- Thread safety is managed via DispatchQueue/Task boundaries
- This pattern is common in Apple's own sample code for similar helpers

Also, `@preconcurrency import Speech` and `@preconcurrency import AVFoundation` are needed to suppress `Sendable` warnings from Apple's own frameworks that haven't been fully annotated yet.

---

## 9. `nonisolated(unsafe)` for Converter Callback

The converter callback closure is `@Sendable`, but the `.haveData`/`.noDataNow` pattern requires a mutable `bufferProvided` flag. Options:

1. **`nonisolated(unsafe) var bufferProvided = false`** — marks the variable as intentionally not isolated. Safe because the converter calls the closure synchronously on the same thread.
2. **`@unchecked Sendable` wrapper** — more verbose, same effect.
3. **Using `.endOfStream` instead** — **DON'T** (see Quirk #1).

---

## 10. isFinal Behavior: Sentence Boundaries, Not Utterance Boundaries

`isFinal=true` does NOT mean "the user stopped talking." It means "the model has committed to this segment of text." This happens at:

- Period (.)
- Question mark (?)
- Exclamation mark (!)
- Extended pause (~1-2 seconds of silence)

After `isFinal=true`, the analyzer immediately starts a new segment. You'll see partial updates for the next segment begin accumulating.

**For turn detection**: Do NOT use `isFinal` alone to decide the user's turn is over. Use it in combination with silence timers (the three-timer system).

---

## 11. Result Text Includes Formatting

The transcriber adds punctuation automatically:
- Periods at ends of sentences
- Commas between items in lists
- Question marks for interrogative sentences
- Capitalization of first words

Example: Saying "one two three four five" produces `"One, two, three, four, five."` with commas and a period.

This is generally helpful but means:
- Don't strip punctuation if you want natural text
- Word matching should be case-insensitive and punctuation-tolerant
- The LLM receives properly formatted text, which is good

---

## 12. Asset Management

Locale assets (speech models) are managed by the system:
- `SpeechTranscriber.supportedLocales` — all locales that CAN work (may need download)
- `SpeechTranscriber.installedLocales` — locales that are already downloaded
- `AssetInventory.assetInstallationRequest(supporting:)` — triggers download if needed
- Assets persist across app launches
- The system may clean up unused assets to free space

On first use with a new locale, there's a one-time download delay. After that, startup is fast.

---

## 13. Echo Cancellation via VPIO (CORRECTED 2026-02-09)

> **CORRECTION (2026-02-09):** The original text here said "No Built-In Echo Cancellation"
> and recommended tracking `isSpeaking` to filter transcriptions. That approach is OBSOLETE.
> VPIO provides hardware AEC that completely solves echo cancellation.

SpeechAnalyzer itself has no echo cancellation, BUT when you enable VPIO on the AVAudioEngine:

```swift
try audioEngine.outputNode.setVoiceProcessingEnabled(true)
```

...the `inputNode` output is automatically echo-cancelled at the hardware level. TTS audio
played through `AVAudioPlayerNode` on the same engine is subtracted from the mic input.
SpeechAnalyzer receives clean, echo-free audio and transcribes continuously through TTS
playback with zero TTS word leakage.

**No need to:** Track `isSpeaking`, filter transcriptions during TTS, or pause STT during TTS.

**See:** `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md` and
`1-priority-documents/WebRTC-Echo-Cancellation-Architecture.md` for full details and test results.

---

## 14. Ambient Noise Sensitivity

The transcriber processes ALL audio the microphone captures with no noise gate. In a noisy room:
- TV dialogue will be transcribed alongside user speech
- Multiple speakers are merged into one stream
- Background music may produce nonsensical transcriptions

**Mitigation options**:
1. Backend-side: Ignore very short transcriptions (< 2 words)
2. Backend-side: Use confidence scoring (if enabled in `attributeOptions`)
3. Swift-side: Add energy-based VAD to filter silence/noise before feeding to analyzer
4. Product-side: Guide users to use in a quiet environment or with headphones

---

## 15. SpeechAnalyzer.Options — Priority and ModelRetention (2026-02-08)

**Severity**: PERFORMANCE — missed optimization, significant impact

Apple docs reveal `SpeechAnalyzer` accepts an `Options` struct with two critical fields:

```swift
// CORRECT — production setup:
let options = SpeechAnalyzer.Options(
    priority: .userInitiated,
    modelRetention: .processLifetime
)
let analyzer = SpeechAnalyzer(modules: [transcriber], options: options)

// WRONG — missing options (our original code):
let analyzer = SpeechAnalyzer(modules: [transcriber])
```

**`priority: .userInitiated`**: Sets the Task priority for analysis work. Without this, analysis runs at default priority and can be deprioritized when other system tasks run (Spotlight, background updates). For a real-time voice app, this ensures the Neural Engine stays focused on our audio.

**`modelRetention: .processLifetime`**: Keeps the neural model loaded in memory for the entire process lifetime, even after the analyzer is deallocated. Without this, every full rebuild (our fallback path) has to re-load the model from disk (~1-2 seconds). With this, the model stays in memory and new analyzers reuse it instantly.

Itsuki's article confirms this exact pattern: `SpeechAnalyzer(modules: [transcriber], options: .init(priority: .userInitiated, modelRetention: .processLifetime))`

---

## 16. bestAvailableAudioFormat — The `considering:` Variant (2026-02-08)

**Severity**: QUALITY — may improve transcription accuracy

Apple provides two variants:
- `bestAvailableAudioFormat(compatibleWith:)` — simple, no source info
- `bestAvailableAudioFormat(compatibleWith:considering:)` — takes the mic's native format into account

From Apple docs: "Retrieves the best-quality audio format that the specified modules can work with, **taking into account the natural format of the audio** and assets installed on the device."

The `considering:` variant lets the system optimize format selection based on what the mic actually provides. For example, if the mic is 48kHz/Float32 and the model prefers 16kHz/Int16, the system might pick an intermediate that minimizes quality loss during conversion.

---

## 17. AssetInventory.reserve(locale:) — Asset Retention (2026-02-08)

**Severity**: RELIABILITY — prevents surprise re-downloads

Apple provides explicit locale reservation:
```swift
try await AssetInventory.reserve(locale: locale)
```

This tells the system "don't evict these speech model assets." Without it, the system may auto-remove assets when disk space is low, causing a surprise download on the next `start_listening`.

Itsuki's article recommends this for production apps. Technically optional (AssetInventory does it automatically during download), but explicit reservation provides stronger guarantees.

Corresponding cleanup: `await AssetInventory.release(reservedLocale: locale)` — but we don't call this since we want the model available for the entire process lifetime.

---

## 18. cancelAnalysis(before:) — Interruption Optimization (2026-02-08)

**Severity**: PERFORMANCE — faster interruption response

Apple provides `cancelAnalysis(before:)` which stops processing audio that predates a given timestamp. This is perfect for interruptions:

```swift
// When user interrupts, cancel old audio processing:
await analyzer.cancelAnalysis(before: lastAudioTimestamp)

// Then reset for new input:
continuation.finish()
try await analyzer.finalize(through: lastAudioTimestamp)
// ... create new stream, start analyzer
```

**Without this**: During an interruption, the analyzer continues processing old audio (AI echo, pre-interruption content) which we'll discard anyway. This wastes Neural Engine time.

**With this**: Old audio processing is cancelled immediately, freeing the Neural Engine to focus on the user's new speech. Makes interruptions feel ~100-200ms faster.

Note: `cancelAnalysis(before:)` is non-throwing in macOS 26.1 (unlike most other SpeechAnalyzer methods).

---

## 19. volatileRangeChangedHandler — Real-Time Analysis Tracking (2026-02-08)

**Severity**: LOW — informational, potential future use

Apple docs mention:
```swift
func setVolatileRangeChangedHandler(sending ((CMTimeRange, Bool, Bool) -> Void)?)
var volatileRange: CMTimeRange?
```

This callback fires when the "volatile range" changes — the range of audio that hasn't been finalized yet and may still produce different results. Could be useful for:
- Tracking what the analyzer is currently processing
- Knowing when results are "stable" vs "still changing"
- Implementing a progress indicator

Not currently implemented because our existing volatile/final result tracking is sufficient.

---

## 20. AnalysisContext — Custom Vocabulary (2026-02-08)

**Severity**: LOW — potential accuracy improvement, not yet implemented

Apple docs mention:
```swift
func setContext(AnalysisContext) async throws
var context: AnalysisContext
```

`AnalysisContext` can provide contextual information to improve analysis, like expected vocabulary or conversation topic. Potential use: feed conversation history context to improve recognition of domain-specific terms.

Not yet implemented because the standard recognition quality is sufficient for general conversation. Worth exploring if users report consistent misrecognition of specific terms.

---

## 21. Input Stream Rotation — Officially Supported Pattern (2026-02-08)

**Severity**: CRITICAL CONFIRMATION — validates our fix

Apple docs explicitly state:

> "While you can terminate the input sequence you created with a method such as `AsyncStream.Continuation.finish()`, **finishing the input sequence does not cause the analysis session to become finished**, and you can continue the session with a different input sequence."

This is the **official confirmation** that our lightweight input rotation pattern (finish continuation → finalize(through:) → new stream → start(inputSequence:)) is the correct, supported approach. The analyzer session survives input stream termination and can be restarted with a new stream.

---

## Summary: Production-Ready Setup (Updated 2026-02-09)

```swift
import Speech
import AVFoundation

// 1. Create transcriber with all recommended options
//    CRITICAL: .fastResults is REQUIRED for real-time streaming (see Quirk #5)
let transcriber = SpeechTranscriber(
    locale: Locale(identifier: "en-US"),
    transcriptionOptions: [],
    reportingOptions: [.volatileResults, .fastResults],  // BOTH required!
    attributeOptions: [.audioTimeRange]
)

// 2. Create analyzer WITH options for priority and model caching
let options = SpeechAnalyzer.Options(
    priority: .userInitiated,
    modelRetention: .processLifetime
)
let analyzer = SpeechAnalyzer(modules: [transcriber], options: options)

// 3. Reserve locale assets explicitly
try await AssetInventory.reserve(locale: Locale(identifier: "en-US"))

// 4. Get the target audio format (with mic format consideration)
let engine = AVAudioEngine()
let micFormat = engine.inputNode.outputFormat(forBus: 0)
let format = await SpeechAnalyzer.bestAvailableAudioFormat(
    compatibleWith: [transcriber],
    considering: micFormat
)!

// 5. Preheat the analyzer (load neural model proactively)
try await analyzer.prepareToAnalyze(in: format, withProgressReadyHandler: nil)

// 6. Create AsyncStream for audio input
let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()

// 7. Start consuming results (BEFORE calling start!)
Task {
    for try await result in transcriber.results {
        let text = String(result.text.characters)
        print(text, result.isFinal)
    }
}

// 8. Set up audio engine with converter
let converter = AVAudioConverter(from: micFormat, to: format)
converter?.primeMethod = .none  // CRITICAL

engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { buffer, _ in
    let converted = convertBuffer(buffer, to: format, using: converter!)
    continuation.yield(AnalyzerInput(buffer: converted))
}

// 9. Start everything
engine.prepare()
try engine.start()
try await analyzer.start(inputSequence: stream)

// 10. To rotate input (turn boundary — NOT shutdown):
continuation.finish()
try await analyzer.finalize(through: lastTimestamp)
let (newStream, newCont) = AsyncStream<AnalyzerInput>.makeStream()
try await analyzer.start(inputSequence: newStream)

// 11. During interruptions, cancel old audio first:
await analyzer.cancelAnalysis(before: lastTimestamp)

// 12. To fully stop (session end):
continuation.finish()
try await analyzer.finalizeAndFinishThroughEndOfInput()
engine.stop()
```
