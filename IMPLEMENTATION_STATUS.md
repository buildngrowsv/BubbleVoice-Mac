# BubbleVoice Mac - Implementation Status

**Last Updated**: January 20, 2026

## Overview

This document tracks the implementation status of BubbleVoice Mac and outlines the remaining work needed to complete the MVP.

---

## ✅ Completed Components

### Frontend (Electron + Web)

- [x] **Electron Main Process** (`src/electron/main.js`)
  - Window management with frameless design
  - Menu bar integration with tray icon
  - Global hotkey support (⌘⇧Space)
  - IPC communication setup
  - Graceful shutdown handling

- [x] **Preload Script** (`src/electron/preload.js`)
  - Secure IPC bridge with contextBridge
  - Window control APIs
  - Event listener setup

- [x] **Main UI** (`src/frontend/index.html`)
  - Unified chat/voice interface
  - Voice button next to send button
  - Real-time transcription display area
  - Bubble suggestions container
  - Settings panel (slide-in)
  - Custom title bar with window controls

- [x] **Liquid Glass Styles** (`src/frontend/styles/`)
  - iOS 26 Liquid Glass aesthetic
  - Glass card components
  - Bubble animations
  - Message bubbles (user/AI)
  - Voice visualization
  - Responsive layouts

- [x] **App Controller** (`src/frontend/components/app.js`)
  - Main application state management
  - Event handling and routing
  - Settings persistence (localStorage)
  - Connection state management
  - Keyboard shortcuts

- [x] **Conversation Manager** (`src/frontend/components/conversation-manager.js`)
  - Message display and rendering
  - Streaming message support
  - Artifact rendering
  - Auto-scroll to latest message
  - Message formatting (markdown-like)

- [x] **Voice Controller** (`src/frontend/components/voice-controller.js`)
  - Voice input start/stop
  - Transcription display
  - Audio playback for AI responses
  - Interruption handling

- [x] **WebSocket Client** (`src/frontend/components/websocket-client.js`)
  - Real-time backend communication
  - Automatic reconnection with exponential backoff
  - Message queuing when disconnected
  - Event routing to app components

### Backend (Node.js)

- [x] **Main Server** (`src/backend/server.js`)
  - Express HTTP server
  - WebSocket server for real-time communication
  - Connection management
  - Message routing
  - Graceful shutdown
  - Health check endpoints

- [x] **LLM Service** (`src/backend/services/LLMService.js`)
  - Multi-provider support (Gemini, Claude, GPT)
  - Streaming response generation
  - Structured output (JSON mode)
  - System prompt for personal AI companion
  - Conversation context management

- [x] **Conversation Service** (`src/backend/services/ConversationService.js`)
  - Conversation creation and management
  - Message storage (in-memory)
  - Conversation history retrieval
  - Metadata tracking

- [x] **Voice Pipeline Service** (`src/backend/services/VoicePipelineService.js`)
  - Three-timer turn detection system
  - Interruption handling
  - Timer cascade (0.5s → 1.5s → 2.0s)
  - Response caching for buffered pipeline
  - Session management

- [x] **Bubble Generator Service** (`src/backend/services/BubbleGeneratorService.js`)
  - Bubble validation (≤7 words)
  - Repetition prevention
  - Generic fallback bubbles
  - Contextual bubble generation

### Project Infrastructure

- [x] **Package Configuration** (`package.json`)
  - All dependencies specified
  - Build scripts configured
  - Electron builder setup

- [x] **Environment Variables** (`.env.example`)
  - API key configuration template
  - Server port configuration

- [x] **Documentation** (`README.md`)
  - Setup instructions
  - Architecture overview
  - Usage guide
  - Development status

---

## 🚧 In Progress / Needs Implementation

### Critical Path Items

#### 1. Speech Recognition Integration (Native macOS)

**Status**: Not implemented (mock in place)

**What's Needed**:
- Swift helper process for Apple SFSpeechRecognizer
- IPC communication between Node.js and Swift
- Real-time transcription streaming
- Silence detection
- Audio level monitoring

**Files to Create**:
- `swift-helper/BubbleVoiceSpeech/` (Swift project)
  - `SpeechRecognizer.swift` - Wrapper for SFSpeechRecognizer
  - `AudioEngine.swift` - Audio capture and monitoring
  - `IPCBridge.swift` - JSON communication via stdin/stdout
  - `main.swift` - Entry point

**Integration Points**:
- `VoicePipelineService.js` currently has mock implementation
- Replace mock with actual Swift process spawning
- Parse JSON messages from Swift helper

**Estimated Effort**: 4-6 hours

---

#### 2. TTS Integration (Native macOS)

**Status**: Not implemented (mock in place)

**What's Needed**:
- Swift helper for NSSpeechSynthesizer
- Audio file generation
- Playback coordination
- Voice selection

**Files to Create**:
- `swift-helper/BubbleVoiceSpeech/TTSSynthesizer.swift`
- Audio file output to temp directory
- Return file URL to Node.js backend

**Integration Points**:
- `VoicePipelineService.generateTTS()` currently returns mock URL
- Replace with actual TTS generation

**Estimated Effort**: 2-3 hours

---

#### 3. Tray Icon

**Status**: Placeholder SVG in place

**What's Needed**:
- Create actual PNG icon (22x22 for menu bar)
- Template image for dark/light mode
- Icon design that represents BubbleVoice

**Files to Create/Update**:
- `assets/tray-icon-template.png` (replace placeholder)
- `assets/tray-icon-template@2x.png` (retina)

**Estimated Effort**: 1 hour (design) or use placeholder

---

### Important But Not Blocking MVP

#### 4. Local RAG (Memory System)

**Status**: Not started

**What's Needed**:
- ObjectBox integration for vector storage
- MLX Swift for local embeddings
- Chunking service for conversation indexing
- Vector search for context retrieval
- Integration with LLM context

**Files to Create**:
- `src/backend/services/RAGService.js`
- `src/backend/services/EmbeddingService.js`
- `src/backend/services/VectorStoreService.js`
- Swift helper for MLX embeddings

**Estimated Effort**: 8-12 hours

---

#### 5. Artifact Generation

**Status**: Structure in place, needs implementation

**What's Needed**:
- HTML templates for each artifact type
- Data visualization components
- Artifact rendering in frontend
- Artifact persistence

**Artifact Types**:
- Timeline (life events over time)
- Decision Card (pros/cons)
- Goal Tracker (progress visualization)
- Stress Map (topic breakdown)
- Checklist (actionable items)

**Files to Create**:
- `src/frontend/components/artifacts/` (artifact renderers)
- `src/backend/services/ArtifactGeneratorService.js`

**Estimated Effort**: 6-8 hours

---

#### 6. Persistent Storage

**Status**: In-memory only

**What's Needed**:
- SQLite for conversation history
- Migration from in-memory to persistent
- Conversation search
- Export/import functionality

**Files to Create**:
- `src/backend/services/DatabaseService.js`
- Database schema and migrations

**Estimated Effort**: 4-6 hours

---

#### 7. Error Handling & Polish

**Status**: Basic error handling in place

**What's Needed**:
- Better error UI (not just alerts)
- Retry logic for API failures
- Offline mode handling
- Loading states and spinners
- Toast notifications

**Estimated Effort**: 3-4 hours

---

## 🧪 Testing Needs

### Manual Testing Checklist

- [ ] App launches successfully
- [ ] Window appears with correct styling
- [ ] Menu bar icon works
- [ ] Global hotkey activates app
- [ ] WebSocket connection establishes
- [ ] Voice button shows correct states
- [ ] Text input works
- [ ] Send button enables/disables correctly
- [ ] Settings panel opens/closes
- [ ] Settings persist across restarts
- [ ] Backend server starts and responds
- [ ] LLM integration works (with API key)
- [ ] Streaming responses display correctly
- [ ] Bubbles appear and are clickable
- [ ] Conversation history displays
- [ ] App quits gracefully

### Automated Testing

**Status**: Not implemented

**What's Needed**:
- Unit tests for services
- Integration tests for WebSocket communication
- E2E tests for critical flows

**Estimated Effort**: 6-8 hours

---

## 📦 Distribution

### DMG Packaging

**Status**: electron-builder configured, not tested

**What's Needed**:
- Test `npm run build:mac`
- Create app icon (`.icns` file)
- Code signing setup (for distribution)
- Notarization (for macOS Gatekeeper)

**Files Needed**:
- `assets/icon.icns`
- `entitlements.mac.plist`

**Estimated Effort**: 2-3 hours (excluding code signing setup)

---

## 🎯 MVP Definition

**Minimum Viable Product includes**:

1. ✅ Electron app that launches
2. ✅ Unified chat/voice UI
3. ⚠️ **Speech recognition** (CRITICAL - needs Swift helper)
4. ✅ LLM integration with streaming
5. ⚠️ **TTS output** (CRITICAL - needs Swift helper)
6. ✅ Three-timer turn detection
7. ✅ Bubble suggestions
8. ✅ Settings persistence
9. ⚠️ Basic error handling (needs polish)
10. ⚠️ DMG distribution (needs testing)

**Not Required for MVP**:
- Local RAG (can use API-only mode)
- Artifact generation (can add post-MVP)
- Persistent storage (in-memory is fine for testing)
- Automated tests (manual testing sufficient for MVP)

---

## 🚀 Next Steps (Priority Order)

### Immediate (Required for MVP)

1. **Create Swift Helper for Speech Recognition** (4-6 hours)
   - Most critical missing piece
   - Blocks voice input functionality
   - See detailed plan in section 1 above

2. **Create Swift Helper for TTS** (2-3 hours)
   - Required for voice output
   - Simpler than speech recognition
   - See detailed plan in section 2 above

3. **Test End-to-End Flow** (2 hours)
   - Verify all components work together
   - Fix integration issues
   - Test with real API keys

4. **Create Proper Tray Icon** (1 hour)
   - Replace placeholder
   - Can use simple design for MVP

### Short-term (Polish for MVP)

5. **Improve Error Handling** (3-4 hours)
   - Better error UI
   - Graceful degradation
   - User-friendly messages

6. **Test DMG Build** (2-3 hours)
   - Verify electron-builder works
   - Create app icon
   - Test installation

### Medium-term (Post-MVP)

7. **Implement Local RAG** (8-12 hours)
   - Add memory capabilities
   - Vector search integration

8. **Add Artifact Generation** (6-8 hours)
   - Visual outputs for conversations
   - Data visualization

9. **Add Persistent Storage** (4-6 hours)
   - SQLite integration
   - Conversation history

---

## 💡 Notes

### Why Swift Helper is Needed

Apple's speech APIs (SFSpeechRecognizer, NSSpeechSynthesizer) are native macOS APIs that require Swift or Objective-C. Node.js cannot directly access these APIs. The solution is to create a Swift helper process that Node.js spawns and communicates with via stdin/stdout (IPC).

### Alternative Approaches Considered

1. **Use Web Speech API**: Not reliable enough, requires browser context
2. **Use third-party speech services**: Adds cost, latency, privacy concerns
3. **Use node-native modules**: Complex to build and maintain

**Chosen approach**: Swift helper process is the cleanest solution.

### Development Environment

- **Node.js**: v20+
- **Electron**: v33+
- **macOS**: 14+ (for latest speech APIs)
- **Xcode**: 15+ (for Swift compilation)

---

## 📞 Questions for User

1. Do you have Xcode installed for Swift development?
2. Do you have API keys for Gemini/Claude/GPT?
3. What's the priority: MVP ASAP or polished experience?
4. Should we use a placeholder for speech/TTS initially and add later?

---

**End of Status Document**
