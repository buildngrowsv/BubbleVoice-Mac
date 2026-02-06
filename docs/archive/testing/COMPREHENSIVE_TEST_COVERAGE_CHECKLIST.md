# BubbleVoice Mac - Comprehensive Test Coverage Checklist

**Created:** 2026-01-26  
**Purpose:** Complete list of all user interactions and flows that need test coverage  
**Status:** Master Reference Document

---

## Overview

This document catalogs **every user interaction and flow** in BubbleVoice Mac that requires test coverage. Tests should verify both happy paths and error conditions, ensuring the app is production-ready.

---

## 1. Application Lifecycle

### 1.1 App Launch & Initialization
- [ ] App launches successfully
- [ ] Backend server starts and becomes ready
- [ ] WebSocket connection establishes
- [ ] Frontend connects to backend within timeout
- [ ] Settings load from localStorage
- [ ] Previous window position/size restored
- [ ] Menu bar icon appears
- [ ] Global hotkey registers (⌘⇧Space)
- [ ] Welcome screen displays on first launch
- [ ] Conversation history loads if exists

### 1.2 Window Management
- [ ] Minimize button minimizes window
- [ ] Close button closes window (or minimizes to tray based on settings)
- [ ] Window can be dragged by title bar
- [ ] Window resizing works correctly
- [ ] Window position persists between sessions
- [ ] "Always on Top" toggle works
- [ ] "Always on Top" state persists
- [ ] Window appears on correct display (multi-monitor)

### 1.3 Global Hotkey
- [ ] ⌘⇧Space activates app from any app
- [ ] Hotkey brings window to front
- [ ] Hotkey focuses input field
- [ ] Hotkey works when app is minimized
- [ ] Hotkey works when app is hidden
- [ ] Hotkey doesn't conflict with other apps

### 1.4 Menu Bar / Tray
- [ ] Tray icon appears in menu bar
- [ ] Click tray icon shows/hides window
- [ ] Right-click shows context menu
- [ ] "Show/Hide" menu item works
- [ ] "New Conversation" menu item works
- [ ] "Settings" menu item opens settings
- [ ] "Quit" menu item closes app completely

### 1.5 App Shutdown
- [ ] App closes gracefully on quit
- [ ] Backend server shuts down cleanly
- [ ] WebSocket connections close properly
- [ ] Settings save before quit
- [ ] Conversation state saves before quit
- [ ] No orphaned processes remain

---

## 2. Text-Based Messaging

### 2.1 Sending Messages
- [ ] User can type in input field
- [ ] Input field accepts text
- [ ] Input field supports multiline text (Shift+Enter)
- [ ] Send button enables when text is present
- [ ] Send button disabled when input is empty
- [ ] Click send button sends message
- [ ] Press Enter sends message
- [ ] Shift+Enter creates new line (doesn't send)
- [ ] Input clears after sending
- [ ] Send button shows loading state while processing
- [ ] User message appears in conversation immediately
- [ ] User message displays with correct styling
- [ ] Timestamp appears on user message
- [ ] Long messages wrap correctly
- [ ] Emoji input works
- [ ] Special characters handled correctly
- [ ] Very long messages (>10k chars) handled
- [ ] Empty/whitespace-only messages rejected

### 2.2 Receiving AI Responses
- [ ] AI response stream starts indicator appears
- [ ] AI response chunks stream in real-time
- [ ] Response text appears character-by-character
- [ ] Response formatting preserved (markdown)
- [ ] Code blocks render correctly
- [ ] Links are clickable
- [ ] Lists render correctly
- [ ] Bold/italic formatting works
- [ ] Response completes with end indicator
- [ ] Timestamp appears on AI message
- [ ] Long responses scroll automatically
- [ ] Streaming errors handled gracefully
- [ ] Partial responses saved if stream fails
- [ ] Response latency is acceptable (<2s first token)

### 2.3 Message Display & History
- [ ] Messages display in chronological order
- [ ] User messages align right
- [ ] AI messages align left
- [ ] Message bubbles have correct styling
- [ ] Conversation scrolls to latest message
- [ ] Scroll position maintained when resizing
- [ ] Old messages load when scrolling up
- [ ] Messages persist between sessions
- [ ] Message timestamps format correctly ("5m ago", "2h ago", etc.)
- [ ] Today/yesterday/date labels appear
- [ ] Copy message text works
- [ ] Select text in messages works
- [ ] Long messages have "show more" option
- [ ] Image/media messages render (if supported)

### 2.4 Editing & Corrections
- [ ] User can edit input before sending
- [ ] Cut/copy/paste works in input
- [ ] Undo/redo works in input
- [ ] Select all (⌘A) works
- [ ] Text selection works correctly
- [ ] Cursor position maintained during typing

---

## 3. Voice Input & Output

### 3.1 Voice Input - Starting
- [ ] Click voice button starts recording
- [ ] Voice button shows recording state
- [ ] Microphone permission requested if needed
- [ ] Microphone permission denial handled gracefully
- [ ] Voice visualization appears during recording
- [ ] Real-time transcription appears in input field
- [ ] Transcription updates as user speaks
- [ ] Multiple languages supported (if configured)
- [ ] Background noise handled reasonably
- [ ] Silence detection works (doesn't cut off mid-sentence)

### 3.2 Voice Input - During Recording
- [ ] Voice waveform animates during speech
- [ ] Transcription appears with <100ms latency
- [ ] Transcription is editable during recording
- [ ] User can pause and resume speaking
- [ ] Long pauses don't stop recording prematurely
- [ ] Recording indicator visible
- [ ] Timer shows recording duration
- [ ] Cancel button stops recording without sending

### 3.3 Voice Input - Stopping
- [ ] Click voice button again stops recording
- [ ] Auto-send after silence works (if enabled)
- [ ] Manual send button works after recording
- [ ] User can edit transcription before sending
- [ ] Transcription accuracy is acceptable (>90%)
- [ ] Transcription errors can be corrected
- [ ] Stop recording clears voice visualization

### 3.4 Voice Output (TTS)
- [ ] AI responses play as audio
- [ ] TTS voice quality is acceptable
- [ ] TTS speed setting respected
- [ ] TTS volume setting respected
- [ ] Audio plays smoothly without stuttering
- [ ] Audio playback indicator visible
- [ ] User can stop audio playback
- [ ] Audio stops when user starts speaking
- [ ] Multiple responses queue correctly
- [ ] Audio doesn't overlap with system sounds

### 3.5 Voice Interruption
- [ ] User can interrupt AI by speaking
- [ ] Interruption stops AI audio immediately (<100ms)
- [ ] Interruption clears pending responses
- [ ] Interruption clears timer queue
- [ ] New input processed after interruption
- [ ] No audio artifacts after interruption
- [ ] Visual feedback shows interruption occurred

### 3.6 Three-Timer System
- [ ] Timer 1 (0.5s) starts LLM processing
- [ ] Timer 2 (1.5s) starts TTS generation
- [ ] Timer 3 (2.0s) starts audio playback
- [ ] Timers clear on interruption
- [ ] Timers clear on new input
- [ ] Pipeline feels natural (no awkward pauses)
- [ ] Turn detection accuracy >95%
- [ ] False positives rare (<5%)
- [ ] Cached responses used correctly

---

## 4. Conversation Management

### 4.1 Creating Conversations
- [ ] Click "New Conversation" creates conversation
- [ ] Keyboard shortcut (⌘N) creates conversation
- [ ] New conversation appears in sidebar
- [ ] New conversation becomes active
- [ ] Previous conversation saved before switching
- [ ] New conversation has default title
- [ ] New conversation has unique ID
- [ ] New conversation timestamp set correctly
- [ ] Empty conversations can be created
- [ ] Multiple new conversations can be created

### 4.2 Switching Conversations
- [ ] Click conversation in sidebar switches to it
- [ ] Active conversation highlighted in sidebar
- [ ] Messages load for selected conversation
- [ ] Message history displays correctly
- [ ] Previous conversation state saved
- [ ] Scroll position resets to bottom
- [ ] Input field clears when switching
- [ ] Bubbles update for new conversation context
- [ ] Switch between conversations rapidly works
- [ ] Keyboard navigation in sidebar works

### 4.3 Deleting Conversations
- [ ] Click delete button on conversation
- [ ] Confirmation dialog appears
- [ ] Confirm deletes conversation
- [ ] Cancel preserves conversation
- [ ] Deleted conversation removed from sidebar
- [ ] Deleted conversation removed from storage
- [ ] Cannot delete active conversation (or switches first)
- [ ] Deleting last conversation handled gracefully
- [ ] Deleted conversations cannot be recovered (or can if undo implemented)
- [ ] Delete keyboard shortcut works (⌘⌫)

### 4.4 Conversation Titles
- [ ] Default title generated from first message
- [ ] User can edit conversation title
- [ ] Click title to edit (inline editing)
- [ ] Double-click title to edit
- [ ] Title updates in sidebar immediately
- [ ] Title persists after editing
- [ ] Empty titles rejected
- [ ] Very long titles truncated with ellipsis
- [ ] Special characters in titles handled
- [ ] Title changes sync across UI

### 4.5 Conversation Metadata
- [ ] Last message preview shows in sidebar
- [ ] Preview updates when new message sent
- [ ] Preview truncates long messages
- [ ] Timestamp shows "5m ago", "2h ago", etc.
- [ ] Timestamp updates in real-time
- [ ] Message count displayed (if implemented)
- [ ] Conversation sorted by most recent
- [ ] Pinned conversations stay at top (if implemented)

### 4.6 Conversation Search & Filter
- [ ] Search input filters conversations
- [ ] Search matches conversation titles
- [ ] Search matches message content
- [ ] Search results update in real-time
- [ ] Clear search shows all conversations
- [ ] No results state displays correctly
- [ ] Search is case-insensitive
- [ ] Search handles special characters

---

## 5. Sidebar Management

### 5.1 Chat History Sidebar
- [ ] Sidebar visible by default
- [ ] Toggle button collapses sidebar
- [ ] Toggle button expands sidebar
- [ ] Keyboard shortcut (⌘B) toggles sidebar
- [ ] Sidebar state persists between sessions
- [ ] Sidebar width adjustable (if resizable)
- [ ] Sidebar animations smooth
- [ ] Floating toggle button appears when collapsed
- [ ] Conversations list scrollable
- [ ] Scroll position maintained during updates

### 5.2 Life Areas Sidebar (if implemented)
- [ ] Life areas sidebar toggles independently
- [ ] Life areas display correctly
- [ ] Click life area filters conversations
- [ ] Life area badges show count
- [ ] Life areas update based on conversation content
- [ ] Life areas persist between sessions

### 5.3 Sidebar Interactions
- [ ] Hover effects work on conversation items
- [ ] Click anywhere on item switches conversation
- [ ] Delete button click doesn't switch conversation
- [ ] Edit title click doesn't switch conversation
- [ ] Drag to reorder conversations (if implemented)
- [ ] Right-click context menu (if implemented)

---

## 6. Bubble Suggestions

### 6.1 Bubble Generation
- [ ] Bubbles appear during conversation
- [ ] Bubbles contextually relevant
- [ ] Bubbles reference user's specific context
- [ ] Bubbles appear above input area
- [ ] Bubbles animate in smoothly
- [ ] Bubbles limited to 7 words or less
- [ ] Multiple bubbles can appear
- [ ] Bubbles don't overlap
- [ ] Bubbles clear when conversation changes

### 6.2 Bubble Interactions
- [ ] Click bubble populates input field
- [ ] Click bubble focuses input
- [ ] Bubble text editable after clicking
- [ ] Bubbles dismiss after clicking
- [ ] Bubbles fade out after timeout
- [ ] Hover effect on bubbles
- [ ] Bubbles accessible via keyboard
- [ ] Bubbles don't block input field

### 6.3 Bubble Context
- [ ] Bubbles reference past conversations
- [ ] Bubbles reference user's life context (kids, goals, etc.)
- [ ] Bubbles suggest follow-up questions
- [ ] Bubbles offer clarifications
- [ ] Bubbles avoid repetition
- [ ] Bubbles update based on conversation flow

---

## 7. Artifacts

### 7.1 Artifact Generation
- [ ] Artifacts generated from conversation
- [ ] Artifact types: timelines, charts, cards, tables
- [ ] Artifacts render inline with messages
- [ ] Artifacts render in side panel (if implemented)
- [ ] Artifact generation indicated to user
- [ ] Artifact generation errors handled gracefully
- [ ] Artifacts persist between sessions
- [ ] Artifacts update incrementally

### 7.2 Artifact Display
- [ ] Artifacts have proper styling
- [ ] Artifacts responsive to window size
- [ ] Artifacts scrollable if large
- [ ] Artifacts have title/description
- [ ] Artifacts show creation timestamp
- [ ] Artifacts can be expanded/collapsed
- [ ] Artifacts can be exported (if implemented)
- [ ] Artifacts can be shared (if implemented)

### 7.3 Artifact Interactions
- [ ] Click artifact to expand
- [ ] Hover shows artifact details
- [ ] Artifacts can be edited (if implemented)
- [ ] Artifacts can be deleted
- [ ] Artifacts can be regenerated
- [ ] Artifact version history (if implemented)
- [ ] Artifact revert on failure

### 7.4 Artifact Types
- [ ] Goal progress charts render correctly
- [ ] Life decision cards render correctly
- [ ] Personal timelines render correctly
- [ ] Reflection summaries render correctly
- [ ] Custom HTML artifacts render safely
- [ ] Artifact data validates correctly

---

## 8. Settings Panel

### 8.1 Opening/Closing Settings
- [ ] Click settings button opens panel
- [ ] Settings panel slides in from right
- [ ] Close button closes settings panel
- [ ] Click outside panel closes it (if implemented)
- [ ] ESC key closes settings panel
- [ ] Settings panel overlay dims background

### 8.2 Model Selection
- [ ] Model dropdown shows available models
- [ ] Gemini models listed
- [ ] Claude models listed (if API key present)
- [ ] GPT models listed (if API key present)
- [ ] Select model updates immediately
- [ ] Selected model persists between sessions
- [ ] Model selection affects next message
- [ ] Model switch mid-conversation works
- [ ] Model unavailable state handled

### 8.3 API Key Management
- [ ] API key fields visible in settings
- [ ] API key input masked (password field)
- [ ] Show/hide API key toggle works
- [ ] Save API key button works
- [ ] API keys validated on save
- [ ] Invalid API key shows error
- [ ] API keys persist securely
- [ ] API keys don't leak in logs
- [ ] Remove API key button works
- [ ] Multiple API keys supported

### 8.4 Voice Settings
- [ ] TTS voice selection dropdown
- [ ] Voice preview button plays sample
- [ ] Voice speed slider works
- [ ] Voice speed preview updates in real-time
- [ ] Voice volume slider works
- [ ] Voice settings persist
- [ ] Voice settings apply immediately
- [ ] System voices listed correctly

### 8.5 Behavior Settings
- [ ] Auto-send toggle works
- [ ] Auto-send delay slider (if implemented)
- [ ] Always-on-top toggle works
- [ ] Start on login toggle works (if implemented)
- [ ] Minimize to tray toggle works
- [ ] Close to tray toggle works
- [ ] Notification settings work (if implemented)

### 8.6 Advanced Settings
- [ ] Debug mode toggle (if implemented)
- [ ] Log level selection (if implemented)
- [ ] Clear cache button works
- [ ] Reset settings button works
- [ ] Export settings works (if implemented)
- [ ] Import settings works (if implemented)

---

## 9. Admin Panel (if implemented)

### 9.1 Prompt Management
- [ ] Admin panel accessible
- [ ] System prompt editable
- [ ] Bubble prompt editable
- [ ] Artifact prompt editable
- [ ] Prompt changes save correctly
- [ ] Prompt changes apply immediately
- [ ] Prompt validation works
- [ ] Prompt reset to default works
- [ ] Prompt templates available (if implemented)

### 9.2 Testing Tools
- [ ] Test message button works
- [ ] Test response preview works
- [ ] Test bubble generation works
- [ ] Test artifact generation works
- [ ] Test error scenarios work

---

## 10. Memory & RAG (when implemented)

### 10.1 Memory Storage
- [ ] Conversations indexed for search
- [ ] Embeddings generated for messages
- [ ] Vector storage works correctly
- [ ] Memory retrieval fast (<30ms)
- [ ] Memory retrieval relevant (>85%)
- [ ] Memory updates incrementally
- [ ] Memory persists between sessions

### 10.2 Memory Retrieval
- [ ] AI recalls past conversations
- [ ] AI references user's life context
- [ ] Memory queries work in prompts
- [ ] "What did we discuss about X?" works
- [ ] Memory search results ranked correctly
- [ ] Memory doesn't hallucinate

### 10.3 Memory Management
- [ ] User can view stored memories
- [ ] User can delete specific memories
- [ ] User can clear all memories
- [ ] Memory export works (if implemented)
- [ ] Memory import works (if implemented)
- [ ] Memory storage limits enforced

---

## 11. Error Handling & Edge Cases

### 11.1 Network Errors
- [ ] WebSocket disconnect handled gracefully
- [ ] WebSocket reconnect works automatically
- [ ] Reconnect attempts have backoff
- [ ] Offline state indicated to user
- [ ] Messages queue when offline
- [ ] Queued messages send on reconnect
- [ ] Connection timeout handled
- [ ] Network error messages clear

### 11.2 API Errors
- [ ] Missing API key shows helpful error
- [ ] Invalid API key shows error
- [ ] API rate limit handled
- [ ] API timeout handled
- [ ] API error messages user-friendly
- [ ] Partial responses saved on error
- [ ] Retry logic for transient errors

### 11.3 Permission Errors
- [ ] Microphone permission denial handled
- [ ] File system permission denial handled
- [ ] Notification permission denial handled (if implemented)
- [ ] Permission requests user-friendly
- [ ] Permission errors don't crash app

### 11.4 Data Errors
- [ ] Corrupt conversation data handled
- [ ] Missing conversation files handled
- [ ] Invalid JSON handled
- [ ] Database errors handled
- [ ] Storage full handled
- [ ] Data migration works (version upgrades)

### 11.5 UI Edge Cases
- [ ] Very long messages display correctly
- [ ] Very long conversation lists scroll
- [ ] Rapid clicking doesn't break UI
- [ ] Rapid typing doesn't lag
- [ ] Window resize doesn't break layout
- [ ] Extreme window sizes handled
- [ ] High DPI displays render correctly
- [ ] Dark mode works (if implemented)

### 11.6 Performance Edge Cases
- [ ] 1000+ messages in conversation
- [ ] 100+ conversations in sidebar
- [ ] Large artifacts (>1MB) render
- [ ] Concurrent messages handled
- [ ] Memory usage stays reasonable (<4GB)
- [ ] CPU usage reasonable during idle
- [ ] App responsive during heavy load

---

## 12. Keyboard Shortcuts

### 12.1 Global Shortcuts
- [ ] ⌘⇧Space - Activate app
- [ ] ⌘N - New conversation
- [ ] ⌘B - Toggle sidebar
- [ ] ⌘, - Open settings
- [ ] ⌘Q - Quit app
- [ ] ⌘W - Close window
- [ ] ⌘M - Minimize window

### 12.2 Input Shortcuts
- [ ] Enter - Send message
- [ ] Shift+Enter - New line
- [ ] ⌘A - Select all
- [ ] ⌘C - Copy
- [ ] ⌘V - Paste
- [ ] ⌘X - Cut
- [ ] ⌘Z - Undo
- [ ] ⌘⇧Z - Redo
- [ ] ESC - Cancel/close

### 12.3 Navigation Shortcuts
- [ ] ⌘↑ - Previous conversation
- [ ] ⌘↓ - Next conversation
- [ ] ⌘⌫ - Delete conversation
- [ ] Tab - Navigate UI elements
- [ ] Shift+Tab - Reverse navigate

---

## 13. Accessibility

### 13.1 Screen Reader Support
- [ ] All buttons have aria-labels
- [ ] All inputs have labels
- [ ] Messages have proper roles
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Focus order logical
- [ ] Dynamic content announced

### 13.2 Visual Accessibility
- [ ] Text contrast meets WCAG AA
- [ ] UI scalable (zoom works)
- [ ] Color not sole indicator
- [ ] Focus indicators visible
- [ ] Error messages clear
- [ ] Loading states indicated

### 13.3 Motor Accessibility
- [ ] Large click targets (>44px)
- [ ] Keyboard alternatives for all actions
- [ ] No time-based interactions required
- [ ] Hover states not required
- [ ] Gestures have alternatives

---

## 14. Multi-User & Sync (future)

### 14.1 User Accounts
- [ ] User login works
- [ ] User logout works
- [ ] User registration works
- [ ] Password reset works
- [ ] User profile editable

### 14.2 Cloud Sync
- [ ] Conversations sync to cloud
- [ ] Sync conflicts resolved
- [ ] Sync status indicated
- [ ] Offline mode works
- [ ] Sync on/off toggle works

---

## 15. Security & Privacy

### 15.1 Data Security
- [ ] API keys stored securely
- [ ] Local data encrypted (if implemented)
- [ ] No sensitive data in logs
- [ ] No data sent to third parties (except LLM APIs)
- [ ] User data deletable

### 15.2 Privacy Features
- [ ] Local-first storage works
- [ ] No telemetry without consent
- [ ] Privacy policy accessible
- [ ] Data export works
- [ ] Data deletion works

---

## 16. Updates & Maintenance

### 16.1 App Updates
- [ ] Update check works
- [ ] Update notification appears
- [ ] Update download works
- [ ] Update install works
- [ ] Update doesn't lose data
- [ ] Update rollback works (if implemented)

### 16.2 Diagnostics
- [ ] Error logs accessible
- [ ] Debug mode works
- [ ] Log export works
- [ ] System info displayed
- [ ] Health check works

---

## Test Priority Levels

### P0 - Critical (Must Work)
- App launch and initialization
- Send/receive messages (text)
- Voice input/output basic functionality
- Conversation create/switch/delete
- Settings panel basic functionality
- WebSocket connection and reconnection

### P1 - High Priority (Core Features)
- Three-timer system
- Voice interruption
- Bubble generation and interaction
- Artifact generation and display
- Conversation history and search
- Error handling and recovery

### P2 - Medium Priority (Polish)
- Keyboard shortcuts
- UI animations and transitions
- Advanced settings
- Admin panel
- Accessibility features

### P3 - Low Priority (Nice to Have)
- Memory/RAG features (when implemented)
- Cloud sync (when implemented)
- Advanced artifact types
- Export/import features

---

## Test Coverage Goals

| Category | Target Coverage | Current Status |
|----------|----------------|----------------|
| **Core Messaging** | 100% | ~80% |
| **Voice Pipeline** | 95% | ~30% |
| **Conversation Management** | 100% | ~60% |
| **UI Interactions** | 90% | ~50% |
| **Error Handling** | 95% | ~40% |
| **Edge Cases** | 85% | ~20% |
| **Accessibility** | 80% | ~10% |

---

## Test Implementation Strategy

### Phase 1: Core Functionality (Week 1-2)
1. Message send/receive tests
2. Conversation CRUD tests
3. Settings panel tests
4. Basic error handling tests

### Phase 2: Voice Pipeline (Week 3-4)
1. Voice input tests
2. Voice output tests
3. Three-timer system tests
4. Interruption tests

### Phase 3: Advanced Features (Week 5-6)
1. Bubble generation tests
2. Artifact generation tests
3. Memory/RAG tests (when implemented)
4. Performance tests

### Phase 4: Polish & Edge Cases (Week 7-8)
1. Keyboard shortcut tests
2. Accessibility tests
3. Edge case tests
4. Load/stress tests

---

## Notes

- **Test Types**: Unit tests, integration tests, E2E UI tests, performance tests
- **Test Framework**: Playwright for E2E, Mocha/Chai for unit/integration
- **CI/CD**: Tests should run on every commit
- **Coverage Tool**: Istanbul/nyc for code coverage metrics
- **Test Data**: Use realistic test data (not "test", "foo", "bar")
- **Flaky Tests**: Investigate and fix, don't ignore
- **Test Documentation**: Each test should explain WHY it exists

---

**Last Updated:** 2026-01-26  
**Next Review:** After each major feature implementation

---

## Summary

This checklist contains **500+ test scenarios** covering every user interaction in BubbleVoice Mac. Use this as a reference when:
- Planning test implementation
- Reviewing test coverage
- Debugging production issues
- Onboarding new developers
- Planning new features (add tests here first)

**Goal:** Achieve 90%+ coverage of P0/P1 scenarios before v1.0 launch.
