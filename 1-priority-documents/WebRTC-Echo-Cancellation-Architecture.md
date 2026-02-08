# Echo Cancellation Architecture for BubbleVoice-Mac

## Critical Discovery: VPIO Provides AEC Without WebRTC

**Date:** February 2026  
**Status:** TESTED AND CONFIRMED

### What We Found

Apple's **Voice Processing IO (VPIO)** provides full Acoustic Echo Cancellation on macOS
without needing WebRTC's dual-peer system. A single call to
`audioEngine.outputNode.setVoiceProcessingEnabled(true)` enables hardware-level AEC.

### Test Results

**Test:** `VPIOEchoCancellationTest.swift` in `webrtc-sandbox/`

- TTS played through speakers: "The quick brown fox jumps over the lazy sleeping dog in the sunny meadow"
- Background audio from another device was playing simultaneously
- **SpeechAnalyzer transcribed the background audio cleanly**
- **ZERO distinctive TTS words leaked into the transcription**
- Words checked: brown, jumps, lazy, meadow, quick, sleeping, sunny → **none found**
- Background audio ("engineering genius doesn't stop at the plasma", "reactor wall", etc.) was captured perfectly

### How VPIO Works

When `setVoiceProcessingEnabled(true)` is called on `AVAudioEngine.outputNode`:

1. The `outputNode` and `inputNode` share a Voice Processing IO audio unit
2. The VPIO unit knows exactly what audio is going to the speakers
3. The VPIO unit subtracts that speaker audio from the microphone input
4. `inputNode` output = clean microphone signal with echo removed
5. This all happens at the hardware/OS level with minimal latency

### Accountability AI's Architecture Revisited

Looking at Accountability's `AVAudioEngineRTCAudioDevice.swift`, the actual AEC comes from VPIO:
```swift
try audioEngine.outputNode.setVoiceProcessingEnabled(useVoiceProcessingAudioUnit)
```
The WebRTC dual-peer system in Accountability serves a DIFFERENT purpose: it makes iOS treat
the audio as "call audio" so iOS doesn't suppress/duck it when other apps request audio focus.
**On macOS, we don't need this iOS audio classification trick.**

## Architecture: VPIO + AVAudioEngine (No WebRTC Needed)

```
┌──────────────────────────────────────────────────────┐
│                  AVAudioEngine (VPIO enabled)         │
│                                                      │
│  ┌──────────┐                                        │
│  │   say    │ generates                              │
│  │ command  │ .aiff file                             │
│  └────┬─────┘                                        │
│       ▼                                              │
│  ┌──────────────┐    ┌─────────────┐    ┌─────────┐ │
│  │ AVAudioPlayer│──→ │ mainMixer   │──→ │ output  │──→ Speakers
│  │    Node      │    │   Node      │    │  Node   │ │
│  └──────────────┘    └─────────────┘    └────┬────┘ │
│                                              │      │
│                              VPIO AEC reference     │
│                              signal (known output)  │
│                                              │      │
│                                              ▼      │
│  ┌──────────────┐                    ┌─────────┐    │
│  │ Speech       │◀── tap bus 0 ◀──── │ input   │◀── Microphone
│  │ Analyzer     │  (AEC-cleaned)     │  Node   │    │
│  └──────┬───────┘                    └─────────┘    │
│         ▼                                           │
│    Transcription (clean, no echo)                   │
│         ▼                                           │
│    Turn Detection / LLM Pipeline                    │
└──────────────────────────────────────────────────────┘
```

### Audio Flow:

1. **TTS Generation:** `say -o /tmp/chunk.aiff "response text"` generates audio file
2. **Playback:** `AVAudioPlayerNode` → `mainMixerNode` → `outputNode` → speakers
3. **VPIO Reference:** The output node provides the speaker audio as a reference signal
4. **Microphone:** `inputNode` captures mic audio with AEC applied (echo subtracted)
5. **Transcription:** Tap on `inputNode` feeds AEC-cleaned audio to `SpeechAnalyzer`

### Key Setup Code:

```swift
let audioEngine = AVAudioEngine()
let playerNode = AVAudioPlayerNode()

// Enable VPIO - this is the ONLY thing needed for AEC
try audioEngine.outputNode.setVoiceProcessingEnabled(true)

// Get formats (VPIO changes the audio unit config)
let outputFormat = audioEngine.outputNode.outputFormat(forBus: 0)

// Connect the audio graph
audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outputFormat)
audioEngine.attach(playerNode)
audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: nil) // auto-convert

// Tap input for transcription (this audio has AEC applied)
let inputNode = audioEngine.inputNode
inputNode.installTap(onBus: 0, bufferSize: 1024, format: tapFormat) { buffer, time in
    // Feed to SpeechAnalyzer - this audio is echo-cancelled
}

// Start engine
audioEngine.prepare()
try audioEngine.start()

// Play TTS
let audioFile = try AVAudioFile(forReading: ttsFileURL)
playerNode.scheduleFile(audioFile, at: nil)
playerNode.play()
```

## When Would WebRTC Still Be Needed?

WebRTC's dual-peer system would only be needed if:

1. **iOS deployment** - To classify audio as "call audio" so iOS doesn't suppress it
2. **VPIO is unavailable** - Some audio configurations may not support voice processing
3. **Remote peers** - If we ever need to send audio to a remote server for processing

For macOS-only BubbleVoice, VPIO alone is sufficient.

### RTCAudioDevice Header Fix (For Future Reference)

The `stasel/WebRTC` macOS binary (M125) does NOT include `RTCAudioDevice.h` in the macOS
umbrella header, but the symbols exist in the binary. To enable it:

1. Copy `RTCAudioDevice.h` from the iOS/Catalyst slice to the macOS headers
2. Add `#import <WebRTC/RTCAudioDevice.h>` to `WebRTC.h`
3. This was tested and confirmed to compile successfully

This fix is already applied in our local `.build` artifacts.

## TTS Pipeline: Say Command → Chunked Playback

### Step-by-Step:

1. **LLM generates response text** → Backend receives streaming response
2. **Chunk text by sentences** (see chunking rules below)
3. **For each chunk:**
   - Generate: `say -o /tmp/chunk_N.aiff "chunk text"`
   - Load: `AVAudioFile(forReading: chunkURL)`
   - Schedule: `AVAudioPlayerNode.scheduleFile(audioFile)`
   - Audio flows: `AVAudioPlayerNode` → `mainMixerNode` → `outputNode` → speakers
4. **Add 200ms pause** between chunks for natural speech flow
5. **Pipeline:** Generate chunk N+1 while playing chunk N (parallel processing)

### Why File-Based?

- `say` command cannot stream directly (tested: pipes fail, stdout fails)
- File generation is fast: ~1-2 seconds for typical AI responses
- Allows chunking and parallel generation/playback

## Text Chunking Rules

**Goal:** Avoid playback gaps by batching short sentences (which have high generation overhead).

### Algorithm:

1. Split LLM response by sentences: `/[.!?]+\s+/`
2. For each sentence:
   - If **< 7 words**: Add to current chunk buffer
   - If **≥ 7 words**: Flush buffer (if any), then process this sentence as new chunk
3. When buffer reaches **≥ 7 words total**: Flush as one chunk
4. If **entire response < 7 words**: Generate as single chunk (don't split)
5. Add **200ms pause** between chunks

### Why 7 Words?

Testing shows:
- **1-5 word sentences:** Generation time (900-1000ms) > Audio duration (400-900ms) → **Causes gaps**
- **6+ word sentences:** Generation time < Audio duration → **No gaps**

Batching short sentences amortizes the ~900ms generation overhead.

### Examples:

| Input | Output Chunks |
|-------|---------------|
| `"Yes."` (1 word) | Single chunk: `"Yes."` |
| `"Yes. I see."` (4 words) | Single chunk: `"Yes. I see."` |
| `"Yes. I see. That makes sense."` (6 words) | Single chunk: `"Yes. I see. That makes sense."` |
| `"Yes. Let me explain the key concepts."` (7 words) | Single chunk: `"Yes. Let me explain the key concepts."` (batched to 8 words) |
| `"Let me explain the key concepts behind this approach."` (9 words) | Single chunk (already ≥ 7 words) |
| `"Yes. I understand what you're asking. Let me break this down."` | Chunk 1: `"Yes. I understand what you're asking."` (7 words)<br>Chunk 2: `"Let me break this down."` (5 words) |

## Latency Characteristics

### File Generation (M4 Max, tested):
- **Short (1 word):** 904ms generation, 448ms audio = 2.0x realtime
- **Medium (5 words):** 1023ms generation, 1361ms audio = 0.75x realtime
- **Long (25 words):** 1425ms generation, 5152ms audio = 0.28x realtime
- **Very Long (70 words):** 2831ms generation, 19128ms audio = 0.15x realtime

### User-Facing Latency:
- **First chunk:** User waits ~1 second (generation time)
- **Subsequent chunks:** Generated during previous chunk's playback → **No additional wait**

### Pipeline Efficiency:
- With proper chunking: **175% efficiency** (more audio time than generation time)
- User experiences ~1 second initial latency, then continuous speech

## Interruption Handling

When user speaks during AI response:

1. **Detect:** `SpeechAnalyzer` transcribes 2+ words while `isTTSPlaying === true`
2. **Stop playback:** Cancel current `AVAudioPlayerNode` playback
3. **Cancel pending:** Stop generating remaining chunks
4. **Resume listening:** Restart silence timers for next turn

## Key Benefits

- **Hardware AEC via VPIO:** No WebRTC complexity needed on macOS
- **Full volume AI speech:** No need to lower volume for transcription
- **Natural interruption:** User can interrupt mid-sentence like a real conversation
- **Clean audio to SpeechAnalyzer:** No echo artifacts in transcription
- **Siri voice quality:** Uses macOS `say` command (not inferior synthesizers)
- **Low latency:** ~1 second to first speech, then continuous
- **Simple architecture:** Single AVAudioEngine, no peer connections

## Implementation Notes

- VPIO is available on macOS via `AVAudioEngine.outputNode.setVoiceProcessingEnabled(true)`
- When VPIO is enabled, `inputNode` reports a multichannel format (e.g., 9ch) - use mono tap format
- Connect `mainMixerNode` → `outputNode` explicitly with the output format before starting engine
- Use `format: nil` when connecting `playerNode` to mixer for automatic sample rate conversion
- `SpeechAnalyzer` requires macOS 26+ and format conversion from mic format (48kHz) to 16kHz mono
- Tested on M4 Max; M2/M1 should work identically as VPIO is an OS-level feature

## References

- **VPIO AEC test:** `webrtc-sandbox/VPIOEchoCancellationTest.swift` (confirmed working)
- **RTCAudioDevice header fix:** Applied to `.build/artifacts/` in webrtc-sandbox
- **Accountability reference:** `zAccountabilityv6-callkit/.../AVAudioEngineRTCAudioDevice.swift`
- **Testing scripts:** `turn-detection-test-harness/test-chunked-tts-pipeline.sh`
- **Latency analysis:** `turn-detection-test-harness/test-say-latency.sh`
