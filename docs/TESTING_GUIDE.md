# BubbleVoice Mac - Testing Guide

**Last Updated**: January 24, 2026  
**App Version**: 0.1.0 (MVP)

---

## 📋 Quick Links

- **Build Checklist**: [`../COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md`](../COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md)
- **Test Plan**: [`testing/MVP_COMPLETION_TEST_PLAN.md`](testing/MVP_COMPLETION_TEST_PLAN.md)
- **Test Checklist**: [`testing/TESTING_CHECKLIST.md`](testing/TESTING_CHECKLIST.md)
- **Known Issues**: [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)

---

## 🎯 Testing Overview

### Test Categories

1. **Unit Tests** - Individual component testing
2. **Integration Tests** - Component interaction testing
3. **E2E Tests** - Full user flow testing
4. **Manual Tests** - UI/UX verification

### Current Test Coverage

- ✅ **Frontend Components**: Manual testing
- ✅ **Backend Services**: Manual testing
- ✅ **WebSocket Communication**: Manual testing
- ⏳ **Voice Flow**: Requires API key
- ⏳ **TTS Audio**: Requires API key
- ❌ **Automated Tests**: Not implemented yet

---

## 🚀 Quick Start Testing

### Prerequisites

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Up API Keys** (for full testing):
   - Google API Key (for Gemini)
   - OpenAI API Key (optional)
   - Anthropic API Key (optional)

3. **Build Swift Helper**:
   ```bash
   cd swift-helper/BubbleVoiceSpeech
   swift build
   ```

### Run the App

```bash
npm run dev
```

---

## 🧪 Test Scenarios

### 1. App Startup Tests

**What to Test**:
- [ ] App launches without errors
- [ ] Backend server starts (ports 7482, 7483)
- [ ] WebSocket connection establishes
- [ ] UI renders correctly
- [ ] No console errors

**How to Test**:
1. Run `npm run dev`
2. Check terminal for "BubbleVoice backend initialized successfully"
3. Check browser console for "BubbleVoice initialized successfully"
4. Verify no red errors in console

**Expected Result**: App launches cleanly with all components initialized

---

### 2. UI Layout Tests

**What to Test**:
- [ ] Sidebar visible on left (280px)
- [ ] Conversation area visible on right
- [ ] Input container at bottom
- [ ] Welcome screen centered
- [ ] All buttons clickable

**How to Test**:
1. Visual inspection of layout
2. Try clicking all buttons
3. Resize window to test responsiveness
4. Toggle sidebar (⌘B)

**Expected Result**: Clean, responsive layout with all elements visible and clickable

---

### 3. Chat Sidebar Tests

**What to Test**:
- [ ] New conversation button works
- [ ] Conversation list displays
- [ ] Can switch between conversations
- [ ] Can delete conversations
- [ ] Sidebar toggle works (⌘B)
- [ ] Floating toggle button appears when collapsed

**How to Test**:
1. Click + button to create conversation
2. Create 2-3 more conversations
3. Click different conversations to switch
4. Hover over conversation and click delete
5. Press ⌘B to collapse sidebar
6. Click floating button to expand

**Expected Result**: All conversation management features work smoothly

---

### 4. Voice Input Tests (Requires Microphone Permission)

**What to Test**:
- [ ] Voice button clickable
- [ ] Microphone permission requested
- [ ] Voice visualization appears
- [ ] Transcription displays in real-time
- [ ] Can stop recording
- [ ] Transcription is editable

**How to Test**:
1. Click voice button (red microphone icon)
2. Grant microphone permission if prompted
3. Speak: "Hello, this is a test"
4. Watch transcription appear
5. Click voice button again to stop
6. Edit transcription text

**Expected Result**: Voice input works, transcription accurate, editable before sending

---

### 5. AI Response Tests (Requires API Key)

**What to Test**:
- [ ] Message sends to AI
- [ ] AI response appears
- [ ] Message bubbles display correctly
- [ ] Timestamps show
- [ ] Auto-scroll works

**How to Test**:
1. Add API key in settings
2. Type or speak a message
3. Click send or finish speaking
4. Wait for AI response
5. Verify response displays correctly

**Expected Result**: AI responds, messages display in conversation, smooth UX

---

### 6. TTS Audio Tests (Requires API Key)

**What to Test**:
- [ ] AI response triggers TTS
- [ ] Audio plays through speakers
- [ ] Can interrupt audio
- [ ] Volume control works
- [ ] Audio quality is good

**How to Test**:
1. Enable TTS in settings
2. Send message to AI
3. Listen for audio response
4. Try interrupting by speaking
5. Adjust volume if needed

**Expected Result**: AI response plays as audio, clear and natural-sounding

---

### 7. Settings Tests

**What to Test**:
- [ ] Settings panel opens (⚙️ button)
- [ ] Can enter API keys
- [ ] Can select AI model
- [ ] Can toggle TTS
- [ ] Settings persist after restart
- [ ] Settings panel closes

**How to Test**:
1. Click settings button
2. Enter API keys
3. Select different AI model
4. Toggle TTS on/off
5. Click save
6. Restart app
7. Verify settings saved

**Expected Result**: Settings save and persist across restarts

---

### 8. Keyboard Shortcuts Tests

**What to Test**:
- [ ] ⌘⇧Space - Activate voice input (global)
- [ ] ⌘B - Toggle sidebar
- [ ] ⌘N - New conversation
- [ ] ⌘, - Open settings
- [ ] ⌘W - Close window
- [ ] ⌘Q - Quit app

**How to Test**:
1. Try each keyboard shortcut
2. Verify expected action occurs
3. Test global hotkey from other apps

**Expected Result**: All keyboard shortcuts work as expected

---

### 9. Error Handling Tests

**What to Test**:
- [ ] Invalid API key shows error
- [ ] Network error shows message
- [ ] Microphone denied shows error
- [ ] Empty message doesn't send
- [ ] Long messages handle gracefully

**How to Test**:
1. Enter invalid API key, try to send message
2. Disconnect internet, try to send
3. Deny microphone permission
4. Try to send empty message
5. Send very long message (1000+ words)

**Expected Result**: Graceful error messages, no crashes

---

### 10. Performance Tests

**What to Test**:
- [ ] App startup time < 3 seconds
- [ ] Voice input latency < 500ms
- [ ] AI response time reasonable
- [ ] UI animations smooth (60fps)
- [ ] Memory usage stable
- [ ] No memory leaks

**How to Test**:
1. Time app startup
2. Measure voice input delay
3. Monitor CPU/memory in Activity Monitor
4. Use app for 30+ minutes
5. Check for memory growth

**Expected Result**: Fast, responsive, stable performance

---

## 🐛 Known Issues

See [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) for current known issues and workarounds.

---

## 📊 Test Results Template

```markdown
## Test Session: [Date]
**Tester**: [Name]
**Version**: [App Version]
**Platform**: macOS [Version]

### Tests Passed ✅
- [List passed tests]

### Tests Failed ❌
- [List failed tests with details]

### Issues Found 🐛
- [List new issues discovered]

### Notes
- [Any additional observations]
```

---

## 🔄 Continuous Testing

### Before Each Commit
1. Run app and verify no console errors
2. Test core features (voice, chat, settings)
3. Check for UI regressions

### Before Each Release
1. Run full test suite
2. Test on clean install
3. Verify all features work
4. Update documentation

---

## 📞 Support

For testing questions or issues:
1. Check [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md)
2. Review [`testing/MVP_COMPLETION_TEST_PLAN.md`](testing/MVP_COMPLETION_TEST_PLAN.md)
3. Check archived fixes in [`archive/fixes/`](archive/fixes/)

---

**Last Updated**: January 24, 2026
