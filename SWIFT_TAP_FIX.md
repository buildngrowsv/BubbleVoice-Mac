# Swift Audio Tap Fix - Transcription Accumulation

**Date**: January 23, 2026  
**Status**: ✅ FIXED AND REBUILT  
**Severity**: High (transcription combining across turns)

---

## 🐛 The Problem

**User's transcription was combining with previous messages!**

Looking at the screenshot:
- First message: "Hello hello can you hear me I am speaking"
- Second message: "Hello hello can you hear me I am speaking fantastic nope just testing this voice app"

The second message **included the first message's text**! This is transcription accumulation.

---

## 🔍 Root Cause

### The Bug in Swift Helper

**File**: `swift-helper/BubbleVoiceSpeech/Sources/main.swift`

In `startListeningInternal()` (line 290), we install an audio tap:

```swift
inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
    recognitionRequest.append(buffer)  // ← Captures recognitionRequest!
}
```

The closure **captures the `recognitionRequest` variable** at the time the tap is installed.

Then in `restartRecognition()` (line 327), we create a **new** request:

```swift
recognitionRequest = SFSpeechAudioBufferRecognitionRequest()  // New request
```

**BUT**: The audio tap is still appending buffers to the **old** request!

### Why This Happens

Swift closures capture variables by reference at the time they're created. When we install the tap, it captures the current `recognitionRequest`. When we later assign a new request to that variable, the closure still holds a reference to the old one.

**Result**: Audio buffers go to the old request, which accumulates transcription across restarts!

---

## ✅ The Fix

### What Accountability AI Does

Looking at `CallManager.swift` lines 538-544:

```swift
if error != nil || result?.isFinal == true {
    self.stopSpeechRecognition()  // Stops EVERYTHING
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        try? self.startRecording()  // Restarts EVERYTHING
    }
}
```

Accountability AI **stops and restarts the entire recording**, including the audio tap!

### Our Fix

**Remove and reinstall the audio tap** when restarting recognition:

```swift
private func restartRecognition() {
    guard isListening else { return }
    guard let audioEngine = audioEngine else { return }
    
    // Cancel the old task
    recognitionTask?.cancel()
    recognitionTask = nil
    
    // CRITICAL: Remove the old audio tap
    let inputNode = audioEngine.inputNode
    inputNode.removeTap(onBus: 0)
    
    // Create a new recognition request
    recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    guard let recognitionRequest = recognitionRequest,
          let speechRecognizer = speechRecognizer else {
        sendError("Failed to create new recognition request")
        return
    }
    
    recognitionRequest.shouldReportPartialResults = true
    
    // Start a new recognition task
    recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { 
        // ... handler code ...
    }
    
    // CRITICAL: Reinstall the audio tap with the NEW recognitionRequest
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
        // Use self?.recognitionRequest to get the CURRENT request
        self?.recognitionRequest?.append(buffer)
    }
    
    logError("Audio tap reinstalled with new recognition request")
}
```

### Key Changes

1. **Remove old tap**: `inputNode.removeTap(onBus: 0)` before creating new request
2. **Reinstall tap**: After creating new request, install a new tap
3. **Use weak self**: `[weak self]` and `self?.recognitionRequest` to always get current request

---

## 📊 How It Works Now

### Before Fix

```
Turn 1:
- Install tap → Captures request1
- User speaks: "Hello"
- Tap appends to request1
- isFinal → restartRecognition()
- Create request2 (but tap still uses request1!)

Turn 2:
- User speaks: "World"
- Tap STILL appends to request1 (old request!)
- request1 accumulates: "Hello World"
- Result: "Hello World" (includes previous turn!)
```

### After Fix

```
Turn 1:
- Install tap → Captures request1
- User speaks: "Hello"
- Tap appends to request1
- isFinal → restartRecognition()
- Remove tap
- Create request2
- Install NEW tap → Captures request2

Turn 2:
- User speaks: "World"
- Tap appends to request2 (new request!)
- Result: "World" (clean, no accumulation!)
```

---

## 🧪 Testing

### Test Case 1: Two Separate Messages
1. User speaks: "Hello"
2. Stops → Timer fires → Message sends
3. User speaks: "How are you"
4. Stops → Timer fires → Message sends
5. **Expected**: Two separate messages
6. **Before**: Second message includes first ("Hello How are you")
7. **After**: Second message is clean ("How are you") ✅

### Test Case 2: Multiple Turns
1. User speaks: "One"
2. User speaks: "Two"
3. User speaks: "Three"
4. **Expected**: Three separate messages
5. **Before**: "One", "One Two", "One Two Three"
6. **After**: "One", "Two", "Three" ✅

### Test Case 3: Long Conversation
1. Have a 5-turn conversation
2. **Expected**: Each turn has only its own text
3. **Before**: Each turn accumulated all previous text
4. **After**: Each turn is independent ✅

---

## 🎯 Impact

### User Experience

**Before**:
- ❌ Messages combine with previous ones
- ❌ Transcription gets longer and longer
- ❌ Confusing, unusable
- ❌ AI responds to accumulated text

**After**:
- ✅ Each message is separate
- ✅ Clean transcription per turn
- ✅ Natural conversation flow
- ✅ AI responds to current message only

### Technical Quality

**Before**:
- Memory leak (old requests never released)
- Audio tap pointing to wrong request
- Transcription accumulation

**After**:
- Clean memory management
- Audio tap always uses current request
- Fresh transcription per turn

---

## 🔧 Implementation Details

### Files Modified

**`swift-helper/BubbleVoiceSpeech/Sources/main.swift`**:
- Lines 306-365: `restartRecognition()` method
- Added tap removal before creating new request
- Added tap reinstallation after creating new request
- Changed closure to use `[weak self]` and `self?.recognitionRequest`

### Build Process

```bash
cd swift-helper/BubbleVoiceSpeech
swift build -c release
cp .build/release/BubbleVoiceSpeech ./BubbleVoiceSpeech
```

**Status**: ✅ Built and deployed

---

## 🎓 Lessons Learned

### 1. Swift Closures Capture by Reference

When you create a closure in Swift, it captures variables at that moment. If you later reassign the variable, the closure still holds the old value.

**Lesson**: When working with closures that need to use updated values, either:
- Recreate the closure (our approach)
- Use `[weak self]` and access via `self?.property` (also our approach)

### 2. Audio Taps are Persistent

Once you install an audio tap, it keeps running until explicitly removed. Creating a new recognition request doesn't affect the tap.

**Lesson**: Always remove and reinstall taps when restarting recognition.

### 3. Study Working Code

Accountability AI's approach of stopping and restarting everything is simpler and more reliable than trying to be clever about what to keep running.

**Lesson**: When in doubt, follow the proven pattern.

### 4. Test Multi-Turn Scenarios

This bug only appeared after multiple turns. Single-turn testing didn't reveal it.

**Lesson**: Always test the full user journey, not just individual features.

---

## 🚀 Current Status

**All Core Functionality Working**:
- ✅ Timer fires after silence (Accountability AI pattern)
- ✅ LLM response waits for completion (polling fix)
- ✅ Transcription doesn't accumulate (audio tap fix)
- ✅ Messages display as separate bubbles
- ✅ API keys configurable by user
- ✅ Model selection available

**BubbleVoice Mac is now fully functional!** 🎉

---

## 📝 Related Fixes

This completes the trilogy of critical fixes:

1. **Timer Fix** (`TIMER_FIX_FINAL.md`): Reset timer on every update (Accountability AI pattern)
2. **Race Condition Fix** (`TIMER_RACE_CONDITION_FIX.md`): Poll for LLM response in Timer 3
3. **Audio Tap Fix** (`SWIFT_TAP_FIX.md`): Remove and reinstall tap on restart ← This one!

All three were necessary to make the app work correctly.

---

**The app now has clean, separate messages for each turn!** ✅
