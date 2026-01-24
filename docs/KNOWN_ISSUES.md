# Known Issues & Fixes

**Last Updated**: January 24, 2026  
**App Version**: 0.1.0 (MVP)

---

## 🚨 Current Known Issues

### 1. Swift Helper Transcription Accumulation
**Status**: 🔧 Fix Ready, Needs Rebuild  
**Severity**: Medium  
**Discovered**: January 23, 2026

**Description**:
Transcription text accumulates across voice sessions instead of starting fresh each time.

**Symptoms**:
- Previous transcription appears when starting new voice input
- Transcription grows longer with each session
- "Hello" becomes "HelloHelloHello" after multiple sessions

**Root Cause**:
The Swift helper doesn't properly remove the audio tap before installing a new one, causing old audio buffers to be processed by the new recognition request.

**Fix**:
```swift
// In restartRecognition() method:
inputNode.removeTap(onBus: 0) // CRITICAL: Remove old tap

DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { // CRITICAL: Add delay
    // Create new recognition request
    self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    // ... rest of setup ...
    inputNode.installTap(onBus: 0, ...) // Install new tap
}
```

**Status**: Fix documented in `archive/fixes/SWIFT_TAP_FIX.md`, needs rebuild

**How to Apply**:
1. Open `swift-helper/BubbleVoiceSpeech/Sources/main.swift`
2. Verify fix is present in `restartRecognition()` method
3. Rebuild: `cd swift-helper/BubbleVoiceSpeech && swift build`
4. Restart app

---

### 2. UI Layout Issues (FIXED)
**Status**: ✅ Fixed  
**Severity**: Critical  
**Fixed**: January 24, 2026

**Description**:
UI layout was broken with messages and input floating in wrong positions.

**Fix Applied**:
- Moved `bubbles-container` and `input-container` inside `conversation-container`
- Fixed flex properties on all child elements
- Added proper min-height and z-index values

**Documentation**: `UI_LAYOUT_FIX_2026-01-24.md`

---

### 3. Chat Sidebar Integration Issues (FIXED)
**Status**: ✅ Fixed  
**Severity**: High  
**Fixed**: January 24, 2026

**Description**:
- Plus button didn't create conversations
- WebSocket communication broken
- No toggle button when sidebar collapsed

**Fix Applied**:
- Fixed WebSocket method calls (`send()` → `sendMessage()`)
- Added missing event handlers
- Added floating toggle button
- Fixed WebSocket client reference

**Documentation**: `FIXES_AND_TESTS_2026-01-24.md`

---

### 4. Voice Button Not Clickable (FIXED)
**Status**: ✅ Fixed  
**Severity**: Critical  
**Fixed**: January 24, 2026

**Description**:
Voice button was not clickable, preventing voice input.

**Fix Applied**:
- Added `min-height: 100px` to input-container
- Changed flex properties to ensure visibility
- Added `z-index: 10` to input-container

**Documentation**: Commit `ca0775b`

---

## ⏳ Pending Testing (Requires API Key)

### 1. TTS Audio Playback
**Status**: ⏳ Needs Testing  
**Severity**: Medium

**Description**:
TTS audio playback is implemented but hasn't been tested with real API key.

**What to Test**:
- Audio plays correctly
- Volume control works
- Can interrupt audio
- Audio quality is acceptable

**Test Plan**: `docs/testing/MVP_COMPLETION_TEST_PLAN.md`

---

### 2. End-to-End Conversation Flow
**Status**: ⏳ Needs Testing  
**Severity**: High

**Description**:
Full conversation flow (voice → transcription → AI → TTS) needs testing with API key.

**What to Test**:
- Complete voice conversation works
- Interruption handling works
- Turn detection accurate
- Response pipeline smooth

**Test Plan**: `docs/testing/MVP_COMPLETION_TEST_PLAN.md`

---

## 📝 Workarounds

### If Voice Input Doesn't Work
1. Check microphone permission in System Preferences
2. Restart app
3. Check console for Swift helper errors
4. Rebuild Swift helper if needed

### If AI Doesn't Respond
1. Verify API key is entered in settings
2. Check internet connection
3. Check console for API errors
4. Try different AI model

### If UI Looks Broken
1. Hard refresh (⌘⇧R)
2. Clear cache
3. Restart app
4. Check for console errors

---

## 🔍 Debugging Tips

### Enable Verbose Logging
Check browser console (⌘⌥I) for detailed logs:
- `[App]` - Main app events
- `[VoiceController]` - Voice input events
- `[WebSocketClient]` - Network events
- `[Backend]` - Server events

### Check Backend Logs
Terminal shows backend logs:
- Connection events
- Message handling
- API calls
- Errors

### Common Error Messages

**"Microphone permission denied"**
- Grant permission in System Preferences → Privacy & Security → Microphone

**"WebSocket connection failed"**
- Backend not running
- Port conflict (7483)
- Firewall blocking

**"API key invalid"**
- Check API key in settings
- Verify key has correct permissions
- Try regenerating key

---

## 📚 Historical Fixes

See `docs/archive/fixes/` for detailed documentation of all historical fixes:

- Timer system fixes (5 documents)
- Transcription fixes (2 documents)
- API integration fixes
- Settings fixes
- And more...

---

## 🆘 Getting Help

1. **Check this document** for known issues
2. **Review test plan** in `docs/testing/MVP_COMPLETION_TEST_PLAN.md`
3. **Check archived fixes** in `docs/archive/fixes/`
4. **Review build checklist** in `COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md`

---

**Last Updated**: January 24, 2026
