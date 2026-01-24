# BubbleVoice Mac - MVP Completion Test Plan

**Date**: January 24, 2026  
**Status**: Ready for Testing  
**Prerequisites**: API key required

---

## 🎯 OBJECTIVE

Complete the Functional MVP by verifying:
1. ✅ Swift helper accumulation bug is fixed
2. ⏳ TTS audio playback works end-to-end
3. ⏳ Full conversation flow works seamlessly

**Estimated Time**: 1 hour  
**Current Progress**: 1/3 complete (33%)

---

## ✅ COMPLETED: Swift Helper Fix

### What Was Done
- **File**: `swift-helper/BubbleVoiceSpeech/Sources/main.swift`
- **Fix**: Added `removeTap()` before installing new audio tap in `restartRecognition()`
- **Lines**: 346, 398-403
- **Build**: Successfully rebuilt with `swift build`

### How It Works
```swift
// Remove old audio tap to prevent accumulation
inputNode.removeTap(onBus: 0)

// Add 50ms delay to flush audio pipeline
DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
    // Create fresh recognition request
    self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
    
    // Install new tap with NEW request
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
        self?.recognitionRequest?.append(buffer)
    }
}
```

### Expected Behavior
- Each voice session starts with empty transcription
- No accumulation of text from previous sessions
- Clean logs showing "restarting recognition for next utterance"

### Verification Steps
1. Start voice input (click mic or ⌘⇧Space)
2. Speak: "Hello world"
3. Wait for message to send
4. Start voice input again
5. Speak: "Testing again"
6. Verify transcription shows only "Testing again" (not "Hello world Testing again")

**Status**: ✅ Fix implemented and built

---

## ⏳ PENDING: TTS Audio Playback Testing

### Prerequisites
**REQUIRED**: API key must be configured

The app needs a valid API key to generate AI responses that trigger TTS. Without an API key, the LLM will fail and TTS will never be called.

### Setup Instructions

#### Step 1: Create .env File
```bash
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
cp .env.example .env
```

#### Step 2: Add API Key
Edit `.env` and add your Google API key:
```bash
GOOGLE_API_KEY=your_actual_key_here
```

Get a key at: https://makersuite.google.com/app/apikey

#### Step 3: Start the App
```bash
# Kill any existing instances
pkill -9 -f BubbleVoice
pkill -9 -f "node.*backend"

# Start app
npm run dev
```

### Test Cases

#### Test 1: Basic TTS Playback
**Goal**: Verify audio plays after AI response

**Steps**:
1. Start voice input (click mic or ⌘⇧Space)
2. Speak: "Tell me a joke"
3. Wait for turn detection (0.5s silence)
4. Wait for AI response (~3s)
5. Listen for TTS audio

**Expected Results**:
- ✅ User message appears as blue bubble
- ✅ AI response appears as gray bubble
- ✅ Audio plays through speakers
- ✅ Audio matches the AI response text
- ✅ Voice is clear and understandable

**Logs to Check**:
```
[VoicePipelineService] Timer 3 (Playback) fired for session-xxx
[VoicePipelineService] Sending messages to frontend
[VoicePipelineService] Generating TTS via Swift helper
```

**If Failed**:
- Check Swift helper logs for TTS errors
- Verify audio output device is working
- Check system volume is not muted
- Look for "speak" command in Swift helper stderr

---

#### Test 2: TTS Interruption
**Goal**: Verify user can interrupt AI speech

**Steps**:
1. Start voice input
2. Speak: "Tell me a long story about space exploration"
3. Wait for AI to start speaking
4. **Interrupt**: Start speaking again before AI finishes
5. Verify AI stops speaking immediately

**Expected Results**:
- ✅ AI starts speaking
- ✅ User speech is detected during playback
- ✅ AI stops speaking immediately
- ✅ User's new transcription is captured
- ✅ New response is generated

**Logs to Check**:
```
[VoicePipelineService] User is speaking while AI is in response pipeline - triggering interruption
[VoicePipelineService] Stopping TTS playback due to interruption
```

**If Failed**:
- Check if `isTTSPlaying` flag is set correctly
- Verify `stopSpeaking()` is being called
- Check Swift helper responds to stop command

---

#### Test 3: Voice Selection
**Goal**: Verify different voices work

**Steps**:
1. Open Settings panel (⚙️ icon)
2. Select a different voice (if available)
3. Save settings
4. Have a conversation
5. Verify voice changed

**Expected Results**:
- ✅ Voice setting persists
- ✅ TTS uses selected voice
- ✅ Voice sounds different from default

**Note**: Voice selection UI may need implementation. Check if dropdown exists in settings panel.

---

#### Test 4: Speech Rate Adjustment
**Goal**: Verify speech rate control works

**Steps**:
1. Open Settings panel
2. Adjust speech rate (if slider exists)
3. Save settings
4. Have a conversation
5. Verify speech speed changed

**Expected Results**:
- ✅ Speech rate setting persists
- ✅ TTS speaks faster/slower as configured
- ✅ Audio quality remains good

**Note**: Speech rate UI may need implementation. Check if slider exists in settings panel.

---

#### Test 5: TTS Error Handling
**Goal**: Verify graceful handling of TTS failures

**Steps**:
1. Disconnect internet (or simulate TTS failure)
2. Have a conversation
3. Verify app doesn't crash

**Expected Results**:
- ✅ AI response still appears as text
- ✅ No audio plays (expected)
- ✅ App remains functional
- ✅ Error logged but not shown to user
- ✅ Next conversation works normally

---

### TTS Implementation Details

#### Backend (VoicePipelineService.js)
```javascript
// Timer 3 calls generateTTS()
async generateTTS(text, settings, session) {
  // Sends 'speak' command to Swift helper
  this.sendSwiftCommand(session, {
    type: 'speak',
    data: {
      text: text,
      voice: settings?.voice || null,
      rate: Math.round((settings?.voiceSpeed || 1.0) * 200)
    }
  });
  return 'swift';
}
```

#### Swift Helper (main.swift)
```swift
// Handles 'speak' command
case "speak":
    let text = data["text"] as? String ?? ""
    let voice = data["voice"] as? String
    let rate = data["rate"] as? Int ?? 200
    
    speakText(text: text, voice: voice, rate: rate)
```

#### Expected Flow
1. User speaks → transcription → silence detected
2. Timer 1 (0.5s): LLM processes (cached)
3. Timer 2 (1.5s): TTS prep (placeholder)
4. Timer 3 (2.0s): Sends speak command to Swift
5. Swift helper uses NSSpeechSynthesizer
6. Audio plays through system speakers
7. Swift sends `speech_ended` event when done

---

## ⏳ PENDING: End-to-End Testing

### Prerequisites
- ✅ Swift helper built
- ⏳ API key configured
- ⏳ TTS verified working

### Comprehensive Test Scenarios

#### Scenario 1: First-Time User Experience
**Goal**: Verify onboarding and setup flow

**Steps**:
1. Launch app for first time
2. Verify window appears correctly
3. Check tray icon is visible
4. Open settings panel
5. Enter API key
6. Save settings
7. Start first conversation

**Expected Results**:
- ✅ App launches without errors
- ✅ Window has proper styling (Liquid Glass)
- ✅ Tray icon visible in menu bar
- ✅ Settings panel opens smoothly
- ✅ API key saves successfully
- ✅ First conversation works

---

#### Scenario 2: Natural Conversation Flow
**Goal**: Verify multi-turn conversation

**Steps**:
1. Start voice input
2. Speak: "I'm feeling stressed about work"
3. Wait for AI response
4. Continue: "What should I do about it?"
5. Wait for AI response
6. Continue: "That's helpful, thanks"
7. Review conversation history

**Expected Results**:
- ✅ All messages appear in correct order
- ✅ Timestamps are accurate
- ✅ Bubbles have correct styling
- ✅ AI maintains context across turns
- ✅ Suggestion bubbles appear
- ✅ Auto-scroll works
- ✅ TTS plays for each AI response

---

#### Scenario 3: Interruption Handling
**Goal**: Verify sophisticated interruption system

**Steps**:
1. Speak: "Tell me about"
2. **Pause** 0.3s (thinking)
3. Continue: "quantum physics"
4. Verify system waits for complete thought
5. Then speak: "Actually, tell me about"
6. **Interrupt** before finishing
7. Speak: "Never mind"

**Expected Results**:
- ✅ System waits during natural pauses
- ✅ Captures full utterance: "Tell me about quantum physics"
- ✅ Interruption clears pending response
- ✅ New transcription starts fresh
- ✅ No stale responses play

---

#### Scenario 4: Rapid Back-and-Forth
**Goal**: Verify system handles quick exchanges

**Steps**:
1. Speak: "What's two plus two?"
2. Wait for response
3. Immediately speak: "What's five times three?"
4. Wait for response
5. Immediately speak: "What's ten divided by two?"
6. Review all exchanges

**Expected Results**:
- ✅ All questions answered correctly
- ✅ No responses skipped
- ✅ No overlapping audio
- ✅ Clean state between turns
- ✅ Fast response times (<4s per turn)

---

#### Scenario 5: Long-Form Response
**Goal**: Verify handling of lengthy AI responses

**Steps**:
1. Speak: "Explain the history of the internet in detail"
2. Wait for long AI response
3. Verify TTS handles long text
4. Test interruption mid-response

**Expected Results**:
- ✅ Long response displays correctly
- ✅ TTS plays entire response
- ✅ Can interrupt at any point
- ✅ Interruption stops audio immediately
- ✅ UI remains responsive

---

#### Scenario 6: Error Recovery
**Goal**: Verify graceful error handling

**Steps**:
1. Disconnect internet
2. Try to have conversation
3. Observe error handling
4. Reconnect internet
5. Verify recovery

**Expected Results**:
- ✅ Error message shown (not crash)
- ✅ App remains functional
- ✅ Can retry after reconnection
- ✅ No data loss
- ✅ Clean state after error

---

#### Scenario 7: Settings Persistence
**Goal**: Verify settings save and load correctly

**Steps**:
1. Open settings
2. Change model (e.g., Gemini → Claude)
3. Change voice settings
4. Save settings
5. Quit app
6. Relaunch app
7. Check settings

**Expected Results**:
- ✅ Model selection persists
- ✅ Voice settings persist
- ✅ API keys persist (encrypted)
- ✅ Settings apply on restart

---

#### Scenario 8: Global Hotkey
**Goal**: Verify keyboard shortcut works

**Steps**:
1. Switch to another app (e.g., Safari)
2. Press ⌘⇧Space
3. Verify BubbleVoice activates
4. Start speaking immediately
5. Verify transcription works

**Expected Results**:
- ✅ App activates from background
- ✅ Window comes to front
- ✅ Voice input starts automatically
- ✅ Transcription works immediately

---

#### Scenario 9: Menu Bar Integration
**Goal**: Verify tray icon functionality

**Steps**:
1. Click tray icon
2. Verify app shows/hides
3. Right-click tray icon
4. Check context menu
5. Test menu options

**Expected Results**:
- ✅ Click toggles window visibility
- ✅ Context menu appears
- ✅ Menu options work (Quit, Settings, etc.)
- ✅ Icon updates based on state

---

#### Scenario 10: Performance & Stability
**Goal**: Verify app runs smoothly over time

**Steps**:
1. Have 10+ conversations
2. Monitor memory usage
3. Monitor CPU usage
4. Check for memory leaks
5. Verify no slowdown

**Expected Results**:
- ✅ Memory usage stable (<200MB)
- ✅ CPU usage reasonable (<10% idle)
- ✅ No memory leaks
- ✅ Response times consistent
- ✅ No crashes or freezes

---

## 📊 TEST RESULTS TEMPLATE

### Test Session Information
- **Date**: ___________
- **Tester**: ___________
- **App Version**: ___________
- **macOS Version**: ___________
- **API Key Provider**: Gemini / Claude / GPT

### Test Results

#### Swift Helper Fix
- [ ] ✅ PASS - No transcription accumulation
- [ ] ❌ FAIL - Still accumulates (describe issue)

#### TTS Playback
- [ ] ✅ PASS - Audio plays correctly
- [ ] ❌ FAIL - No audio / errors (describe issue)

#### TTS Interruption
- [ ] ✅ PASS - Interruption works
- [ ] ❌ FAIL - Can't interrupt (describe issue)

#### Natural Conversation
- [ ] ✅ PASS - Multi-turn works smoothly
- [ ] ❌ FAIL - Issues (describe)

#### Interruption System
- [ ] ✅ PASS - Handles pauses and interrupts
- [ ] ❌ FAIL - Issues (describe)

#### Error Handling
- [ ] ✅ PASS - Graceful errors
- [ ] ❌ FAIL - Crashes or hangs (describe)

#### Settings Persistence
- [ ] ✅ PASS - Settings save/load
- [ ] ❌ FAIL - Settings lost (describe)

#### Global Hotkey
- [ ] ✅ PASS - ⌘⇧Space works
- [ ] ❌ FAIL - Hotkey issues (describe)

#### Performance
- [ ] ✅ PASS - Stable over time
- [ ] ❌ FAIL - Memory leaks / slowdown (describe)

### Overall Assessment
- [ ] ✅ **FUNCTIONAL MVP COMPLETE** - Ready for daily use
- [ ] ⚠️ **NEEDS FIXES** - Issues found (list below)
- [ ] ❌ **NOT READY** - Major blockers (list below)

### Issues Found
1. ___________
2. ___________
3. ___________

### Notes
___________
___________
___________

---

## 🐛 KNOWN ISSUES TO VERIFY

### Issue 1: Swift Accumulation (FIXED)
**Status**: Should be fixed after rebuild  
**Test**: Multiple voice sessions  
**Expected**: No accumulation

### Issue 2: TTS Not Tested
**Status**: Implemented but unverified  
**Test**: Full conversation with audio  
**Expected**: Audio plays correctly

---

## 📝 TESTING CHECKLIST

### Pre-Testing Setup
- [ ] Swift helper built successfully
- [ ] .env file created with API key
- [ ] Backend server not already running
- [ ] Microphone permissions granted
- [ ] Audio output working (test with music)
- [ ] No other apps using ports 7482/7483

### During Testing
- [ ] Console logs visible for debugging
- [ ] Monitor Swift helper stderr output
- [ ] Check backend logs in terminal
- [ ] Note any error messages
- [ ] Record response times
- [ ] Test edge cases

### Post-Testing
- [ ] Document all issues found
- [ ] Rate severity (Critical/High/Medium/Low)
- [ ] Suggest fixes if possible
- [ ] Update checklist status
- [ ] Commit test results

---

## 🚀 NEXT STEPS AFTER TESTING

### If All Tests Pass ✅
1. Mark Functional MVP as complete
2. Update BUILD_CHECKLIST
3. Commit and push changes
4. Move to Polished MVP tasks:
   - Chat history sidebar
   - Persistent storage
   - Error handling polish

### If Tests Fail ❌
1. Document failures in detail
2. Prioritize fixes (Critical first)
3. Fix issues one by one
4. Re-test after each fix
5. Repeat until all pass

---

## 💡 TESTING TIPS

### For Best Results
1. **Test in quiet environment** - Reduces speech recognition errors
2. **Speak clearly** - Better transcription accuracy
3. **Wait for visual feedback** - Don't rush between turns
4. **Check logs frequently** - Catch issues early
5. **Test edge cases** - Long pauses, interruptions, errors
6. **Monitor resources** - Watch for memory leaks

### Common Issues
- **No transcription**: Check mic permissions
- **Timer doesn't fire**: Check logs for timer events
- **No AI response**: Check API key is valid
- **No audio**: Check system volume and output device
- **App crashes**: Check console for errors

---

## 📞 SUPPORT

### If You Need Help
1. Check console logs first
2. Review error messages
3. Consult COMPREHENSIVE_BUILD_CHECKLIST.md
4. Check relevant documentation files
5. Search for similar issues in docs

### Log Locations
- **Backend logs**: Terminal where you ran `npm run dev`
- **Swift helper logs**: Same terminal (stderr)
- **Frontend logs**: Electron DevTools console
- **System logs**: Console.app → search "BubbleVoice"

---

## 🎯 SUCCESS CRITERIA

**Functional MVP is complete when**:
- ✅ Swift accumulation bug fixed
- ✅ TTS audio plays correctly
- ✅ Interruption works reliably
- ✅ Full conversation flow works
- ✅ No critical bugs
- ✅ Performance is acceptable
- ✅ Ready for daily personal use

**Time Estimate**: 1 hour of focused testing

---

**Ready to test! Just add your API key and run `npm run dev`** 🚀

---

## 📋 QUICK START TESTING

```bash
# 1. Setup
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY

# 2. Start app
pkill -9 -f BubbleVoice
npm run dev

# 3. Test basic flow
# - Click mic button
# - Speak: "Hello, how are you?"
# - Wait for response
# - Listen for audio
# - Verify everything works

# 4. Test interruption
# - Speak: "Tell me a long story"
# - Interrupt mid-response
# - Verify AI stops speaking

# 5. Test multiple turns
# - Have a 3-5 turn conversation
# - Verify no accumulation
# - Verify audio plays each time
```

---

**Last Updated**: January 24, 2026  
**Status**: Ready for Testing  
**Blocker**: API key required from user
