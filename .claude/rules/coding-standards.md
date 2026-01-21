# Coding Standards Rules

## File Organization

### One Function Per Class
Every class should have a single responsibility and typically one main public function.

```swift
// ✅ GOOD: Single responsibility
class AudioBufferProcessor {
    func processBuffer(_ buffer: AVAudioPCMBuffer) -> ProcessedAudio {
        // Implementation
    }
}

// ❌ BAD: Multiple responsibilities
class AudioManager {
    func processBuffer() { }
    func playAudio() { }
    func recordAudio() { }
    func convertFormat() { }
}
```

### Naming Conventions

Use **long, primitive, descriptive names** that are self-documenting:

```swift
// ✅ GOOD
class UploadedVideoSpeechLocalTranscriptionService { }
class RealTimeVoiceConversationInterruptionHandler { }
class ConversationMemorySummarizationEngine { }
func calculateAverageResponseLatencyInMilliseconds() -> Double { }

// ❌ BAD
class TransService { }
class Handler { }
class Engine { }
func calcLatency() -> Double { }
```

### File Naming
Match file name to class name exactly:
- `UploadedVideoSpeechLocalTranscriptionService.swift`
- `RealTimeVoiceConversationInterruptionHandler.swift`

## Comment Requirements

### Every Function Must Have

```swift
/// **Technical**: Processes incoming audio buffer and extracts speech segments
/// for real-time transcription. Uses VAD (Voice Activity Detection) to identify
/// speech boundaries.
///
/// **Parameters**:
/// - buffer: Raw PCM audio data from AVAudioEngine tap
/// - sensitivity: VAD sensitivity (0.0-1.0, default 0.5)
///
/// **Returns**: Array of speech segments with timestamps
///
/// **Dependencies**:
/// - Called by `AudioCaptureService.handleAudioBuffer()`
/// - Depends on `VADProcessor` for voice detection
///
/// **Why/Because**: We process in 100ms chunks because longer chunks
/// introduce noticeable latency in the transcription pipeline. Shorter
/// chunks (50ms) caused too many false VAD triggers.
///
/// **Product Context**: This enables the real-time transcription overlay
/// feature where users see their speech converted to text instantly.
///
/// **History**: 
/// - 2026-01-10: Switched from WebRTC VAD to custom implementation
///   because WebRTC VAD had licensing issues for App Store
/// - 2025-12-15: Reduced chunk size from 200ms to 100ms after user
///   feedback about transcription feeling "laggy"
func extractSpeechSegments(
    from buffer: AVAudioPCMBuffer,
    sensitivity: Float = 0.5
) -> [SpeechSegment] {
    // Implementation
}
```

### Inline Comments

```swift
// WHY: We use a ring buffer here instead of a growing array because
// the previous array-based approach caused memory spikes during long
// conversations. Ring buffer caps memory at 30 seconds of audio data.
private let audioRingBuffer = RingBuffer<Float>(capacity: 30 * sampleRate)

// BECAUSE: Apple's AudioQueue API had 150ms latency vs 50ms with
// AVAudioEngine. This was discovered during A/B testing in beta.
private let audioEngine = AVAudioEngine()

// HISTORY: This timeout was increased from 5s to 10s after users
// reported timeouts on slower network connections (ticket #1234)
private let networkTimeout: TimeInterval = 10.0
```

## Error Handling

```swift
// ✅ GOOD: Explicit error handling with context
do {
    let result = try await transcriptionService.transcribe(audio)
    // Process result
} catch TranscriptionError.networkTimeout {
    // WHY: We retry once on timeout because transient network issues
    // are common, but we don't want infinite retries
    logger.warning("Transcription timeout, retrying once")
    return try await transcriptionService.transcribe(audio)
} catch TranscriptionError.invalidAudio(let reason) {
    // BECAUSE: Invalid audio usually means a bug in our pipeline,
    // so we log extensively for debugging
    logger.error("Invalid audio: \(reason)", metadata: ["buffer": buffer.description])
    throw TranscriptionError.invalidAudio(reason)
}

// ❌ BAD: Swallowing errors
do {
    try something()
} catch {
    // Silent failure - never do this
}
```

## Thread Safety

```swift
// ✅ GOOD: Clear thread expectations
/// **Thread Safety**: Must be called on main thread. Updates UI elements.
@MainActor
func updateTranscriptionDisplay(_ text: String) {
    transcriptionLabel.text = text
}

/// **Thread Safety**: Safe to call from any thread. Uses internal queue.
func processAudioAsync(_ buffer: AVAudioPCMBuffer) {
    processingQueue.async { [weak self] in
        self?.processAudioInternal(buffer)
    }
}
```

## Memory Management

```swift
// ✅ GOOD: Explicit weak/unowned with reasoning
audioEngine.inputNode.installTap(onBus: 0, ...) { [weak self] buffer, time in
    // WHY weak self: This closure is retained by the audio engine,
    // which may outlive this view controller. Using weak prevents
    // a retain cycle that would leak memory.
    guard let self = self else { return }
    self.handleAudioBuffer(buffer)
}
```
