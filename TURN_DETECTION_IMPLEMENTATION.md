# Turn Detection Implementation - Accountability AI Pattern

**Date**: 2026-01-21  
**Status**: ✅ IMPLEMENTED

## Overview

This document describes the implementation of the sophisticated turn detection and interruption system from the Accountability AI app into BubbleVoice-Mac. The system enables natural conversation with immediate interruption detection.

## Core Architecture

### Three-Timer Cascade System

The system uses three coordinated timers to buffer the response pipeline:

1. **Timer 1 (0.5s)**: Start LLM processing (cached, not visible to user)
2. **Timer 2 (1.5s)**: Start TTS generation (uses cached LLM result)
3. **Timer 3 (2.0s)**: Start audio playback (uses cached TTS result)

This creates a buffered pipeline that feels instant while allowing natural pauses in conversation without premature cutoffs.

### Continuous Speech Recognition

**CRITICAL DIFFERENCE from previous implementation:**

- Speech recognition now runs **continuously**, even during AI responses
- Recognition is **restarted** after each final transcription (not stopped)
- This enables immediate detection of user interruptions

## Implementation Details

### 1. Swift Helper Changes (`main.swift`)

#### Added State Tracking

```swift
// Track whether we have any active timers or playback
private var hasActiveTimersOrPlayback = false
```

#### Continuous Recognition

**OLD BEHAVIOR** (lines 256-258):
```swift
if isFinal {
    self.stopListening()  // ❌ This stopped recognition!
}
```

**NEW BEHAVIOR**:
```swift
if isFinal {
    self.logError("Got final transcription, restarting recognition for next utterance")
    self.restartRecognition()  // ✅ Keep listening!
}
```

#### New `restartRecognition()` Method

- Cancels old recognition task
- Creates new recognition request
- Starts new task with same audio stream
- Audio engine keeps running continuously

#### Enhanced Transcription Updates

Now includes `isSpeaking` state with every transcription:

```swift
func sendTranscription(text: String, isFinal: Bool) {
    sendResponse(type: "transcription_update", data: [
        "text": AnyCodable(text),
        "isFinal": AnyCodable(isFinal),
        "isSpeaking": AnyCodable(isSpeaking)  // ✅ Added
    ])
}
```

### 2. VoicePipelineService Changes (`VoicePipelineService.js`)

#### Added Pipeline State Tracking

```javascript
// Session state now includes:
{
  isInResponsePipeline: false,  // Tracks if timers active or processing
  isTTSPlaying: false           // Tracks if TTS is currently playing
}
```

#### Interruption Detection Logic

**Location**: `handleSwiftResponse()` method

**Logic** (mirrors Accountability's `processSpeechRecognitionResult`):

```javascript
// Check if we're in the response pipeline
const hasActiveTimers = session.silenceTimers.llm || 
                       session.silenceTimers.tts || 
                       session.silenceTimers.playback;
const isInResponsePipeline = session.isInResponsePipeline || 
                             session.isTTSPlaying || 
                             hasActiveTimers;

// If user speaks while AI is responding, it's an interruption
if (isInResponsePipeline && text.trim().length > 0) {
  console.log('‼️ [VOICE INTERRUPT] User is speaking - triggering interruption');
  this.handleSpeechDetected(session);  // Stop everything
}
```

#### Enhanced `handleSilenceDetected()`

- Sets `isInResponsePipeline = true` when timers start
- Each timer checks if interrupted before executing
- Prevents stale operations from running after interruption

#### Enhanced `handleSpeechDetected()`

Now properly handles interruption:

```javascript
handleSpeechDetected(session) {
  // 1. Clear all timers
  this.clearAllTimers(session);
  
  // 2. Clear cached responses
  session.cachedResponses.llm = null;
  session.cachedResponses.tts = null;
  
  // 3. Reset pipeline state
  session.isInResponsePipeline = false;
  
  // 4. Stop TTS playback
  if (session.isTTSPlaying) {
    this.stopSpeaking(session);
    session.isTTSPlaying = false;
  }
}
```

## Flow Diagrams

### Normal Turn Detection Flow

```
User speaks → Partial transcriptions → User stops speaking
    ↓
isFinal: true → Recognition restarts (keeps listening)
    ↓
handleSilenceDetected() → isInResponsePipeline = true
    ↓
Timer 1 (0.5s) → LLM processing → Cache result
    ↓
Timer 2 (1.5s) → TTS generation → Cache audio
    ↓
Timer 3 (2.0s) → Audio playback → isTTSPlaying = true
    ↓
Playback ends → isInResponsePipeline = false
```

### Interruption Flow

```
AI is speaking (isInResponsePipeline = true)
    ↓
User starts speaking → Partial transcription received
    ↓
Interruption detected! (text.length > 0 && isInResponsePipeline)
    ↓
handleSpeechDetected() called:
  - Clear all timers
  - Clear cached responses
  - Stop TTS playback
  - Set isInResponsePipeline = false
    ↓
User continues speaking → Normal transcription
    ↓
User stops → New turn detection cycle begins
```

## Key Differences from Accountability

### Similarities ✅

1. **Three-timer cascade** - Same timing (0.5s, 1.5s, 2.0s)
2. **Continuous recognition** - Keeps listening during AI response
3. **Interruption detection** - Checks every transcription update
4. **State management** - Tracks pipeline state and playback
5. **Cache clearing** - Discards stale responses on interruption

### Differences 🔄

1. **Architecture**: Accountability uses Swift/CallKit, BubbleVoice uses Electron/Node.js
2. **IPC**: Accountability is single-process, BubbleVoice uses child process communication
3. **Audio**: Accountability uses AVAudioPlayerNode, BubbleVoice uses `say` command
4. **State location**: Accountability tracks in CallManager, BubbleVoice tracks in session object

## Testing Checklist

- [ ] Build Swift helper successfully ✅
- [ ] Start voice input and verify continuous recognition
- [ ] Speak and verify transcription appears
- [ ] Stop speaking and verify timer cascade starts
- [ ] Interrupt during timer cascade (before playback)
- [ ] Interrupt during TTS playback
- [ ] Verify timers are cleared on interruption
- [ ] Verify cached responses are cleared
- [ ] Verify new turn detection starts after interruption
- [ ] Test multiple rapid interruptions

## Files Modified

1. **`swift-helper/BubbleVoiceSpeech/Sources/main.swift`**
   - Added continuous recognition with `restartRecognition()`
   - Enhanced transcription updates with `isSpeaking` state
   - Removed auto-stop on `isFinal`

2. **`src/backend/services/VoicePipelineService.js`**
   - Added pipeline state tracking
   - Implemented interruption detection in `handleSwiftResponse()`
   - Enhanced `handleSilenceDetected()` with state management
   - Enhanced `handleSpeechDetected()` with proper cleanup

## Critical Implementation Notes

### Why Restart Recognition?

Apple's `SFSpeechRecognizer` has a timeout after final results. To keep listening continuously, we:

1. Get final transcription
2. Cancel old recognition task
3. Create new recognition request
4. Start new task with same audio stream

The audio engine keeps running - we only restart the recognition task.

### Why Check Every Transcription?

Interruption can happen at any time:

- During timer cascade (before playback)
- During TTS playback
- During LLM processing

We check **every** transcription update (partial or final) to detect interruptions immediately.

### Why Track Pipeline State?

We need to know if we're "busy" responding:

- `isInResponsePipeline`: Any part of the response pipeline is active
- `isTTSPlaying`: TTS is currently playing audio
- `hasActiveTimers`: Any of the three timers are pending

If any of these are true and user speaks, it's an interruption.

## Product Impact

This implementation enables:

1. **Natural conversation** - Users can pause to think without premature cutoffs
2. **Immediate interruption** - Users can interrupt AI at any time
3. **Responsive feel** - Buffered pipeline feels instant
4. **No stale audio** - Interrupted responses are discarded
5. **Continuous listening** - Always ready for user input

## Next Steps

1. ✅ Build and test Swift helper
2. ⏳ Integration testing with full app
3. ⏳ Connect to real LLM service (replace mock)
4. ⏳ Connect to real TTS service (replace mock)
5. ⏳ Add WebSocket communication to frontend
6. ⏳ Add UI indicators for pipeline state
7. ⏳ Add audio visualization during playback

## References

- **Accountability Implementation**: `zAccountabilityv6-callkit/Accountabilityv6/Services/Managers/CallManager.swift`
- **Timer System**: Lines 641-701 (resetSilenceTimer)
- **Interruption Logic**: Lines 575-639 (processSpeechRecognitionResult)
- **Documentation**: `Documentation/Rebuild-Analysis/05-Critical-Logic-To-Preserve.md`
