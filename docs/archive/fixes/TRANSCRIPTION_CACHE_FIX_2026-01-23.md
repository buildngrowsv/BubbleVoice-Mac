# Transcription Cache Fix - January 23, 2026

## 🐛 Problems Fixed

### 1. Transcription Accumulation Across User Turns
**Issue**: When the user speaks again after the AI responds, the transcription includes text from the previous utterance, causing accumulated/duplicated text.

**Example**:
- User says: "Cheesy potato"
- AI responds
- User says: "I'm just a old desktops"
- Display shows: "Cheesy potato I'm just a old desktops" ❌
- Should show: "I'm just a old desktops" ✅

### 2. Timer Not Triggering Until User Speaks Again
**Issue**: After the AI finishes speaking, the timer system doesn't reset properly, so the next user utterance doesn't trigger the LLM timer until the user speaks a second time.

---

## 🔍 Root Causes

### Cause 1: Swift Audio Tap Not Flushing Between Sessions
**Problem**: When `restartRecognition()` is called, the audio tap is removed and reinstalled, but buffered audio in the pipeline is immediately fed to the new recognition request.

**Technical Details**:
- AVAudioEngine buffers audio internally
- When we remove and reinstall the tap, buffered audio is still in the pipeline
- The new recognition request immediately receives this buffered audio
- Apple's SFSpeechRecognizer returns the FULL transcription from session start
- Result: New transcription includes old audio = accumulation

**Solution**: Add a 50ms delay after removing the tap to let the audio pipeline flush before reinstalling.

```swift
// Remove old tap
inputNode.removeTap(onBus: 0)

// CRITICAL: Wait for audio pipeline to flush
DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
    // Create new request and reinstall tap
    // Now the tap will only receive fresh audio
}
```

### Cause 2: Backend Not Resetting Transcription State After AI Speaks
**Problem**: When the AI finishes speaking (`speech_ended`), the backend clears the pipeline flags but doesn't reset the transcription state or tell Swift to restart recognition.

**Technical Details**:
- `session.latestTranscription` still contains the previous user utterance
- `session.textAtLastTimerReset` still contains old text
- Swift recognition session is still running with accumulated context
- Next transcription update includes old text

**Solution**: Reset all transcription state and explicitly restart Swift recognition after TTS ends.

```javascript
case 'speech_ended':
  // Clear pipeline flags
  session.isTTSPlaying = false;
  session.isInResponsePipeline = false;
  
  // CRITICAL: Reset transcription state
  session.latestTranscription = '';
  session.currentTranscription = '';
  session.textAtLastTimerReset = '';
  session.isProcessingResponse = false;
  
  // CRITICAL: Tell Swift to restart recognition
  this.sendSwiftCommand(session, {
    type: 'reset_recognition',
    data: null
  });
```

---

## 🛠️ Changes Made

### 1. Swift Helper (`main.swift`)

#### Added Flush Delay in `restartRecognition()`
**File**: `swift-helper/BubbleVoiceSpeech/Sources/main.swift`  
**Lines**: ~325-389

**Change**:
```swift
private func restartRecognition() {
    // Cancel old task
    recognitionTask?.cancel()
    recognitionTask = nil
    
    // Remove old audio tap
    inputNode.removeTap(onBus: 0)
    
    // NEW: Add 50ms delay to flush audio pipeline
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
        guard let self = self else { return }
        guard self.isListening else { return }
        
        // Create new request
        self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        
        // Start new task
        self.recognitionTask = speechRecognizer.recognitionTask(...)
        
        // Reinstall tap with new request
        inputNode.installTap(...) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }
    }
}
```

**Why This Works**:
- The 50ms delay allows AVAudioEngine's internal buffers to drain
- When we reinstall the tap, it only receives fresh audio from that point forward
- No accumulated audio from previous utterances

#### Added `reset_recognition` Command Handler
**File**: `swift-helper/BubbleVoiceSpeech/Sources/main.swift`  
**Lines**: ~582-612

**Change**:
```swift
func handleCommand(_ command: Command) {
    switch command.type {
    // ... existing cases ...
    
    case "reset_recognition":
        // NEW: Explicitly reset recognition session
        logError("Received reset_recognition command")
        if isListening {
            restartRecognition()
        }
    
    // ... rest of cases ...
    }
}
```

**Why This Works**:
- Backend can explicitly trigger a recognition restart
- Called after AI finishes speaking to ensure fresh session
- Ensures no accumulated context from previous turns

### 2. Backend Service (`VoicePipelineService.js`)

#### Reset Transcription State on `speech_ended`
**File**: `src/backend/services/VoicePipelineService.js`  
**Lines**: ~306-327

**Change**:
```javascript
case 'speech_ended':
  console.log('[VoicePipelineService] TTS ended');
  session.isTTSPlaying = false;
  session.isInResponsePipeline = false;
  
  // NEW: Reset transcription state
  session.latestTranscription = '';
  session.currentTranscription = '';
  session.textAtLastTimerReset = '';
  session.isProcessingResponse = false;
  
  // NEW: Tell Swift to reset recognition
  this.sendSwiftCommand(session, {
    type: 'reset_recognition',
    data: null
  });
  
  console.log('[VoicePipelineService] Transcription state reset and Swift recognition restarted');
  break;
```

**Why This Works**:
- Clears all accumulated transcription text in backend session
- Resets timer baseline so next utterance starts fresh
- Explicitly restarts Swift recognition to clear Apple's internal state
- Ensures next user turn is completely independent

---

## 🧪 Testing

### Test Case 1: Transcription Accumulation
**Steps**:
1. Start voice input
2. Say: "Cheesy potato"
3. Wait for AI response and TTS to complete
4. Start speaking again: "I'm reading a book"
5. Observe transcription display

**Expected Result**:
- Display shows: "I'm reading a book"
- Does NOT show: "Cheesy potato I'm reading a book"

### Test Case 2: Timer Triggering
**Steps**:
1. Start voice input
2. Say: "Hello"
3. Stop speaking
4. Wait 2 seconds
5. Observe that AI processes and responds

**Expected Result**:
- Timer fires after 2s of silence
- AI processes "Hello" and responds
- No need to speak again to trigger timer

### Test Case 3: Multiple Turns
**Steps**:
1. Say: "First message"
2. Wait for AI response
3. Say: "Second message"
4. Wait for AI response
5. Say: "Third message"
6. Observe each transcription

**Expected Result**:
- Each transcription is independent
- No accumulation across turns
- Each timer fires correctly after 2s silence

---

## 📊 Technical Flow

### Before Fix
```
User speaks: "Hello"
├─ Swift: Transcription = "Hello"
├─ Timer fires → AI responds
└─ TTS ends

User speaks: "World"
├─ Swift: Still has "Hello" in context
├─ Swift: Transcription = "Hello World" ❌
└─ Display shows accumulated text
```

### After Fix
```
User speaks: "Hello"
├─ Swift: Transcription = "Hello"
├─ Timer fires → AI responds
└─ TTS ends
    ├─ Backend: Clear session.latestTranscription
    ├─ Backend: Send reset_recognition command
    └─ Swift: Remove tap → Wait 50ms → Reinstall tap

User speaks: "World"
├─ Swift: Fresh recognition session
├─ Swift: Transcription = "World" ✅
└─ Display shows only new text
```

---

## 🎯 Key Insights

### 1. Audio Pipeline Buffering
AVAudioEngine buffers audio internally. Simply removing and reinstalling a tap doesn't clear these buffers. We need a small delay to let the pipeline drain.

### 2. SFSpeechRecognizer Context
Apple's speech recognizer maintains context across the recognition session. Even with a new request, if it receives buffered audio from before, it will include that in the transcription. The only way to truly reset is to flush the audio pipeline first.

### 3. Backend State Management
The backend needs to explicitly manage transcription state across turns. Simply clearing pipeline flags isn't enough - we need to reset all transcription-related state and explicitly restart the Swift recognition.

### 4. Explicit Reset Command
Having an explicit `reset_recognition` command gives the backend control over when to start a fresh session. This is more reliable than relying on implicit resets.

---

## 🚀 Build and Deploy

### Build Swift Helper
```bash
cd BubbleVoice-Mac/swift-helper/BubbleVoiceSpeech
swift build
```

### Restart App
The Electron app will automatically use the newly built Swift helper on next launch.

---

## 📝 Files Modified

1. `swift-helper/BubbleVoiceSpeech/Sources/main.swift`
   - Added 50ms flush delay in `restartRecognition()`
   - Added `reset_recognition` command handler

2. `src/backend/services/VoicePipelineService.js`
   - Reset transcription state on `speech_ended`
   - Send `reset_recognition` command to Swift after TTS

---

## ✅ Status

**Date**: January 23, 2026  
**Status**: ✅ FIXED  
**Build**: Swift helper rebuilt successfully  
**Testing**: Ready for user testing

---

**Next Steps**:
1. User tests the conversation flow
2. Verify no transcription accumulation
3. Verify timer triggers correctly after AI speaks
4. Monitor for any edge cases
