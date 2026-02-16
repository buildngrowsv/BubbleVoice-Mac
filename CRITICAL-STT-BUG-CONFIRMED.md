# ~~CRITICAL: SpeechAnalyzer Not Producing Transcriptions~~ RESOLVED

**Date**: February 7, 2026  
**Status**: ✅ RESOLVED (2026-02-09) — Root cause was missing `.fastResults` flag  
**Priority**: ~~P0 - Blocks all voice functionality~~ CLOSED  

> ## RESOLUTION (2026-02-09)
>
> **This bug was NOT an API issue.** The SpeechAnalyzer API works correctly when configured with
> `reportingOptions: [.volatileResults, .fastResults]`. The original configuration only used
> `[.volatileResults]`, which causes the analyzer to batch results in ~3.8-second chunks.
> With very short test utterances, these batches often fell outside the test's observation window,
> making it appear that zero results were produced.
>
> Adding `.fastResults` enables word-by-word streaming at 200-500ms intervals. All test scenarios
> that previously "failed" now work correctly.
>
> **See:** `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md` for the complete
> source of truth on SpeechAnalyzer configuration.
>
> The conclusions and recommendations below are OBSOLETE. Keeping the original text for historical
> reference only.

---

## ~~Summary~~ (OBSOLETE — see resolution above)

The SpeechAnalyzer API in macOS 26.0 is ~~**NOT producing any transcription results**~~ in the BubbleVoice-Mac app. Multiple diagnostic tests confirm that audio is flowing correctly through the pipeline, but the `transcriber.results` AsyncSequence remains completely silent.

## Test Results

### ✅ What's Working
- Swift helper initialization
- Audio engine startup
- Microphone access and permissions
- Audio format conversion (48kHz Float32 → 16kHz Int16)
- SpeechAnalyzer initialization: "neural model loaded and ready"
- Voice Processing IO (hardware AEC)
- Audio tap installation and buffer flow
- VAD (Voice Activity Detection) heartbeats every 500ms
- Speech assets installed for en-US locale

### ❌ What's NOT Working
- **ZERO `transcription_update` messages produced**
- `transcriber.results` AsyncSequence yields nothing
- No text output despite continuous speech input
- Tested for 15+ seconds with clear speech - nothing

## Diagnostic Tests Run

### Test 1: Standalone Helper (DEV_MODE_TEST=1)
```bash
DEV_MODE_TEST=1 ./swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech
```
**Result**: 30+ VAD heartbeats, 0 transcriptions

### Test 2: In-App Test (Node.js spawned)
```bash
node src/backend/test-stt-in-app.js
```
**Result**: 23 VAD heartbeats, 0 transcriptions

### Test 3: Manual Interactive Test
```bash
./tests/test-stt-manual-interactive.sh
```
**Result**: 60+ VAD heartbeats over 30 seconds, 0 transcriptions

### Test 4: Automated Test Suite
```bash
./tests/run-comprehensive-stt-tests.sh
```
**Result**: All tests failed - no transcriptions received

## Evidence

### Successful Initialization
```
[SpeechHelper] Pre-warm: speech assets already installed for en-US
[SpeechHelper] Audio format selected with considering: 
  mic=<AVAudioFormat 0xc2ed09270:  3 ch,  48000 Hz, Float32, deinterleaved>
  selected=<AVAudioFormat 0xc2ed093b0:  1 ch,  16000 Hz, Int16>
[SpeechHelper] Analyzer preheated successfully — neural model loaded and ready
[SpeechHelper] Voice Processing IO enabled (hardware AEC active)
[SpeechHelper] Started listening (SpeechAnalyzer, format: <AVAudioFormat 0xc2ed093b0:  1 ch,  16000 Hz, Int16>)
```

### VAD Heartbeats (Proof Audio is Flowing)
```json
{"type":"vad_speech_active","data":{"timestamp":1770527568.240099,"rms":null}}
{"type":"vad_speech_active","data":{"timestamp":1770527568.741468,"rms":null}}
{"type":"vad_speech_active","data":{"timestamp":1770527569.232740,"rms":null}}
... (30+ more heartbeats)
```

### Missing Transcriptions (Expected but NOT Received)
```json
// EXPECTED:
{"type":"transcription_update","data":{"text":"hello","isFinal":false,...}}
{"type":"transcription_update","data":{"text":"hello world","isFinal":false,...}}
{"type":"transcription_update","data":{"text":"hello world this","isFinal":false,...}}

// ACTUAL:
(nothing - zero transcription_update messages)
```

## Code Analysis

### Result Consumer Task (Lines 977-1037)
```swift
private func startSpeechAnalyzerResultTask(transcriber: SpeechTranscriber) {
    speechAnalyzerTask = Task { [weak self] in
        guard let self = self else { return }
        do {
            for try await result in transcriber.results {  // ← This loop never executes
                let text = String(result.text.characters)
                self.sendTranscription(text: text, isFinal: result.isFinal, ...)
            }
            self.logError("Transcriber results stream ended")
        } catch {
            if !(error is CancellationError) {
                self.sendError("SpeechAnalyzer result stream error: \(error.localizedDescription)")
            }
        }
    }
}
```

**Observation**: The `for try await result in transcriber.results` loop never executes. The AsyncSequence appears to be empty/silent.

### SpeechTranscriber Configuration (Lines 789-850)
```swift
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [.volatileResults],  // Real-time partial results
    attributeOptions: [.audioTimeRange]
)
```

**Observation**: Configuration looks correct based on Apple documentation.

### Analyzer Start (Line 724)
```swift
try await analyzer.start(inputSequence: stream)
```

**Observation**: No error thrown, analyzer starts successfully.

## Possible Root Causes

### 1. SpeechTranscriber Configuration Issue ⚠️
- `reportingOptions` may need additional flags
- `transcriptionOptions` may require specific settings
- Missing required configuration for results stream

### 2. Audio Format Issue ⚠️
- Despite successful format conversion, analyzer may not accept the audio
- Buffer timestamps may be incorrect
- Sample rate conversion artifacts

### 3. Permissions Issue ⚠️
- Speech recognition permission not fully granted
- Assets not fully functional despite "installed" status
- Sandbox restrictions blocking neural model access

### 4. API Bug in macOS 26.0 🔴
- Known issue with SpeechAnalyzer in current macOS version
- Results stream broken in beta/early release
- Regression from previous versions

### 5. Initialization Sequence Issue ⚠️
- Result task may need to start BEFORE analyzer.start()
- Missing explicit activation step for results stream
- Timing issue with async initialization

## Comparison: Working vs Broken

### Accountability v6 (WORKING) - SFSpeechRecognizer
```swift
recognitionTask = recognizer.recognitionTask(with: request) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        // ✅ Immediate word-by-word results
    }
}
```
- Instant partial results
- Word-by-word streaming
- 0.5s silence timers work perfectly

### BubbleVoice-Mac (BROKEN) - SpeechAnalyzer
```swift
for try await result in transcriber.results {
    // ❌ This loop never executes
    let text = String(result.text.characters)
}
```
- Zero results
- AsyncSequence silent
- Cannot use for real-time transcription

## Next Steps

### Immediate Actions (Priority Order)

1. **Add Extensive Debug Logging** ✅ DONE
   - Added DEV_MODE_TEST environment variable
   - Created in-app diagnostic test
   - Confirmed issue with multiple test approaches

2. **Test Alternative Configurations**
   ```swift
   // Try different reportingOptions combinations:
   reportingOptions: [.volatileResults, .partialResults]
   reportingOptions: [.finalResults]
   reportingOptions: []  // Empty - use defaults
   
   // Try different transcriptionOptions:
   transcriptionOptions: [.voiceActivityDetection]
   transcriptionOptions: [.partialResults]
   ```

3. **Test with Audio File Input**
   - Create test with pre-recorded audio file
   - Eliminates mic/permission variables
   - Confirms if issue is live audio specific

4. **Fallback to SFSpeechRecognizer**
   - Implement parallel path using working API
   - Provides immediate functionality
   - Allows time to debug SpeechAnalyzer

5. **Apple Developer Forums / Bug Report**
   - Search for similar issues
   - File bug report with Apple
   - Request guidance from Apple engineers

### Code Changes to Try

#### Option 1: Explicit Result Stream Activation
```swift
// Start result consumption BEFORE analyzer.start()
startSpeechAnalyzerResultTask(transcriber: transcriber)
try await Task.sleep(nanoseconds: 100_000_000)  // 100ms delay
try await analyzer.start(inputSequence: stream)
```

#### Option 2: Manual Result Polling
```swift
// Instead of for-await loop, try manual polling
Task {
    while isListening {
        if let result = try? await transcriber.results.first(where: { _ in true }) {
            handleResult(result)
        }
        try? await Task.sleep(nanoseconds: 100_000_000)
    }
}
```

#### Option 3: Different Analyzer Options
```swift
let analyzerOptions = SpeechAnalyzer.Options(
    priority: .userInitiated,
    modelRetention: .processLifetime,
    // Try adding:
    bufferSize: 4096,  // If available
    processingMode: .realTime  // If available
)
```

## Impact Assessment

### Blocked Functionality
- ❌ All voice input
- ❌ Voice conversations
- ❌ Speech-to-text features
- ❌ Turn detection
- ❌ Interruption detection
- ❌ Real-time transcription display

### Working Functionality
- ✅ Text input/output
- ✅ LLM integration
- ✅ RAG/vector search
- ✅ Conversation management
- ✅ TTS (speech output)
- ✅ UI/frontend

**Severity**: The app is essentially a text-only chat app until this is fixed. All voice features are non-functional.

## Recommendations

### Short Term (This Week)
1. Implement fallback to `SFSpeechRecognizer` API
2. Test with audio file input to isolate issue
3. Try all configuration variations
4. File Apple bug report

### Medium Term (Next 2 Weeks)
1. Research community implementations
2. Contact Apple Developer Support
3. Consider hybrid approach (SFSpeechRecognizer for now, SpeechAnalyzer when fixed)
4. Implement comprehensive error handling and fallbacks

### Long Term
1. Monitor macOS updates for fixes
2. Maintain both API implementations
3. Add feature flags for A/B testing
4. Build robust testing infrastructure

## Test Artifacts

All test results and logs are available in:
- `/tests/TEST_RESULTS_2026-02-07.md` - Comprehensive test report
- `/tests/test-artifacts-generated/` - Test logs and outputs
- `/src/backend/test-stt-in-app.js` - In-app diagnostic test
- `/tests/run-comprehensive-stt-tests.sh` - Automated test suite
- `/tests/test-stt-manual-interactive.sh` - Manual interactive test

## ~~Conclusion~~ (OBSOLETE — see resolution at top)

~~The SpeechAnalyzer API is fundamentally broken in the current implementation.~~

**ACTUAL ROOT CAUSE (discovered 2026-02-09):** Missing `.fastResults` in `reportingOptions`.
The configuration `reportingOptions: [.volatileResults]` alone causes ~3.8s batching. Adding
`.fastResults` enables word-by-word streaming. The API is NOT broken — it was misconfigured.

**No SFSpeechRecognizer fallback needed.** SpeechAnalyzer works perfectly with the correct flags.

---

*Documented by: AI Agent*  
*Date: February 7-8, 2026*  
*Test Duration: 2+ hours*  
*Tests Run: 10+ different approaches*
