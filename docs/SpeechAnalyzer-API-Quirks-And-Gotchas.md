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

## 5. `SpeechTranscriber.Preset` API Changes

The preset `.progressiveLiveTranscription` that appeared in early beta documentation may not exist in the release. Use explicit options instead:

```swift
// This may not compile:
let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveLiveTranscription)

// Use this instead:
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [.volatileResults],
    attributeOptions: []
)
```

The `.volatileResults` reporting option gives you progressive partial updates (essential for real-time transcription).

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

## 13. No Built-In Echo Cancellation

SpeechAnalyzer does not have any echo cancellation. If the device's speakers are playing audio (TTS, music, etc.), the microphone will capture it and the transcriber will transcribe it.

**Solution**: Track TTS state (`isSpeaking`) and filter out transcriptions received during TTS playback. This is what our helper does — every `transcription_update` includes `isSpeaking: true/false`.

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

## Summary: Minimum Viable Setup

```swift
import Speech
import AVFoundation

// 1. Create transcriber
let transcriber = SpeechTranscriber(
    locale: Locale(identifier: "en-US"),
    transcriptionOptions: [],
    reportingOptions: [.volatileResults],
    attributeOptions: []
)

// 2. Create analyzer
let analyzer = SpeechAnalyzer(modules: [transcriber])

// 3. Get the target audio format
let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])!

// 4. Create AsyncStream for audio input
let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()

// 5. Start consuming results (BEFORE calling start!)
Task {
    for try await result in transcriber.results {
        let text = String(result.text.characters)
        print(text, result.isFinal)
    }
}

// 6. Set up audio engine with converter
let engine = AVAudioEngine()
let converter = AVAudioConverter(from: engine.inputNode.outputFormat(forBus: 0), to: format)
converter?.primeMethod = .none  // CRITICAL

engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: nil) { buffer, _ in
    let converted = convertBuffer(buffer, to: format, using: converter!)
    continuation.yield(AnalyzerInput(buffer: converted))
}

// 7. Start everything
engine.prepare()
try engine.start()
try await analyzer.start(inputSequence: stream)

// 8. To stop:
continuation.finish()
try await analyzer.finalizeAndFinishThroughEndOfInput()
engine.stop()
```
