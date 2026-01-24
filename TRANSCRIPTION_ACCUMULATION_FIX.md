# Transcription Accumulation Fix

**Date**: January 23, 2026  
**Status**: ⚠️ Partial Fix Applied  
**Remaining**: Swift helper needs update

---

## 🐛 Problem

**Transcriptions accumulate across voice sessions** - When the user clicks the mic button to start a new voice session, the previous transcription text is appended to the new one instead of starting fresh.

### User Experience
1. User says: "Hello"
2. Clicks mic again
3. User says: "How are you"
4. Result shows: "Hello How are you" (accumulated)
5. Expected: "How are you" (fresh)

---

## 🔍 Root Causes

### 1. Frontend Not Clearing Input ✅ FIXED
**Problem**: The `startListening()` method in `voice-controller.js` didn't clear the input field when starting a new voice session.

**Fix Applied**:
```javascript
async startListening() {
  // ... existing code ...
  
  // CRITICAL: Clear the input field when starting new voice session
  const inputField = this.app.elements.inputField;
  if (inputField) {
    inputField.textContent = '';
    inputField.style.opacity = '1.0';
  }
  
  // ... rest of code ...
}
```

**File**: `src/frontend/components/voice-controller.js`

---

### 2. Swift Helper Audio Tap Issue ⚠️ NEEDS FIX

**Problem**: The Swift helper's `restartRecognition()` method creates a new `recognitionRequest` and `recognitionTask`, but the audio tap on line 291 continues appending buffers to the OLD request.

**Code Flow**:
```swift
// Line 230: Create initial recognition request
recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

// Line 290-292: Install audio tap (captures audio)
inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
    recognitionRequest.append(buffer)  // <- This captures the OLD request!
}

// Line 327: Later, when restarting...
recognitionRequest = SFSpeechAudioBufferRecognitionRequest()  // NEW request

// But the audio tap closure still references the OLD request!
// So audio keeps appending to the old request, causing accumulation
```

**Why This Happens**:
- Swift closures capture variables by reference
- The closure on line 291 captures `recognitionRequest` when the tap is installed
- When we create a new `recognitionRequest` on line 327, the closure still holds the old one
- Audio buffers continue appending to the old request
- The new request never gets audio, so it times out
- The old request accumulates all audio across sessions

**Fix Needed**:
```swift
private func restartRecognition() {
    // ... existing code ...
    
    // CRITICAL: Reinstall the audio tap with the NEW request
    // Remove old tap
    audioEngine?.inputNode.removeTap(onBus: 0)
    
    // Install new tap with new request
    let inputNode = audioEngine!.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
        self?.recognitionRequest?.append(buffer)  // Use weak self and optional chaining
    }
    
    // ... rest of code ...
}
```

**File**: `swift-helper/BubbleVoiceSpeech/Sources/main.swift`  
**Lines**: 317-365 (restartRecognition method)

---

## 🎯 Current Status

### ✅ Frontend Fix Applied
- Input field now clears when starting new voice session
- This prevents the UI from showing accumulated text

### ⚠️ Backend/Swift Fix Needed
- Swift helper still accumulates transcription internally
- Audio tap needs to be reinstalled with new recognition request
- This requires rebuilding the Swift helper

---

## 🧪 Testing

### With Frontend Fix Only (Current State)
1. Click mic
2. Say "Hello"
3. Wait for response
4. Click mic again
5. Say "How are you"

**Expected**: Input field starts empty, shows "How are you"  
**Actual**: Input field starts empty, but Swift helper may still send accumulated text

### With Both Fixes (After Swift Update)
**Expected**: Clean transcription, no accumulation

---

## 🔧 Implementation Steps

### Step 1: Frontend Fix ✅ DONE
- Modified `voice-controller.js` to clear input on `startListening()`
- App restarted with this fix

### Step 2: Swift Helper Fix ⏳ PENDING
1. Update `restartRecognition()` method in `main.swift`
2. Remove old audio tap before creating new one
3. Reinstall tap with new recognition request
4. Use weak self in closure to prevent memory leaks
5. Rebuild Swift helper: `cd swift-helper/BubbleVoiceSpeech && swift build`
6. Restart app

---

## 📝 Technical Details

### Why Closures Capture by Reference
In Swift, closures capture variables from their surrounding context. When we write:
```swift
inputNode.installTap(...) { buffer, _ in
    recognitionRequest.append(buffer)
}
```

The closure captures `recognitionRequest` **by reference**. This means it holds a pointer to the current value of `recognitionRequest`. When we later assign a new value to `recognitionRequest`, the closure still holds the old one.

### Solution: Reinstall Tap
The only way to fix this is to remove the old tap and install a new one with the new request. This ensures the closure captures the correct request.

---

## 🚀 Next Steps

1. ✅ Test frontend fix (input clearing)
2. ⏳ Implement Swift helper fix
3. ⏳ Rebuild Swift helper
4. ⏳ Test end-to-end with both fixes
5. ⏳ Verify no accumulation across sessions

---

**Status**: Frontend fix applied, Swift fix documented and ready to implement.
