# Changelog

All notable changes to BubbleVoice Mac will be documented in this file.

---

## [Unreleased]

### To Do
- [ ] Rebuild Swift helper with transcription fix
- [ ] Test TTS audio playback with API key
- [ ] Add persistent storage (SQLite)
- [ ] Implement artifact generation
- [ ] Add local RAG/memory system

---

## [0.1.0] - 2026-01-24 - MVP Release

### Added
- ✅ **Chat History Sidebar**
  - Conversation list with create/switch/delete
  - Floating toggle button when collapsed
  - Keyboard shortcuts (⌘B, ⌘N)
  - Smooth animations

- ✅ **Comprehensive Documentation**
  - Testing guide
  - Known issues document
  - Organized documentation structure
  - Archived historical fixes

### Fixed
- ✅ **UI Layout** (Critical)
  - Fixed conversation container structure
  - Messages now scroll properly
  - Input stays at bottom
  - Sidebar and conversation area side-by-side

- ✅ **Voice Button Clickability** (Critical)
  - Added min-height to input container
  - Fixed flex properties
  - Added z-index for proper layering

- ✅ **Chat Sidebar Integration** (High)
  - Fixed WebSocket method calls
  - Added missing event handlers
  - Fixed conversation management

### Changed
- Reorganized documentation into `docs/` folder
- Archived old fix documents
- Consolidated test documentation

---

## [0.0.9] - 2026-01-23

### Added
- ✅ **Core Voice Features**
  - Real-time speech recognition
  - Turn detection with timer system
  - Interruption handling
  - Transcription editing

- ✅ **AI Integration**
  - Multi-LLM support (Gemini, Claude, GPT)
  - Streaming responses
  - Context management

- ✅ **TTS Implementation**
  - Google TTS integration
  - Audio playback system
  - Volume control

- ✅ **UI/UX**
  - Liquid Glass design (iOS 26 aesthetic)
  - Message bubbles with animations
  - Settings panel
  - Status indicators

### Fixed
- ✅ **Timer System** (Multiple fixes)
  - Race condition in turn detection
  - Timer reset pattern
  - Response pipeline buffering

- ✅ **Transcription Issues**
  - Cache accumulation
  - Swift helper audio tap
  - Recognition request handling

- ✅ **API Integration**
  - Gemini API error handling
  - Response parsing
  - Error recovery

- ✅ **Settings**
  - Scroll behavior
  - Persistence
  - Validation

---

## [0.0.1] - 2026-01-20 - Initial Development

### Added
- Initial Electron app structure
- Basic UI layout
- WebSocket communication
- Voice input foundation

---

## Fix Categories

### Critical Fixes
Fixes that prevent app from functioning:
- UI layout issues
- Voice button not clickable
- WebSocket communication failures

### High Priority Fixes
Fixes that significantly impact UX:
- Chat sidebar integration
- Timer system race conditions
- Transcription accumulation

### Medium Priority Fixes
Fixes that improve stability:
- API error handling
- Settings persistence
- Memory management

### Low Priority Fixes
Fixes that improve polish:
- Animation timing
- Visual feedback
- Error messages

---

## Documentation Changes

### January 24, 2026
- Created `docs/TESTING_GUIDE.md`
- Created `docs/KNOWN_ISSUES.md`
- Created `docs/CHANGELOG.md`
- Moved test docs to `docs/testing/`
- Archived old fixes to `docs/archive/fixes/`

### January 23, 2026
- Created `COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md`
- Created multiple fix documentation files
- Created `MVP_COMPLETION_TEST_PLAN.md`

---

## Version History

| Version | Date | Status | Notes |
|---------|------|--------|-------|
| 0.1.0 | 2026-01-24 | MVP | Chat sidebar, UI fixes, docs |
| 0.0.9 | 2026-01-23 | Beta | Core features complete |
| 0.0.1 | 2026-01-20 | Alpha | Initial development |

---

**Last Updated**: January 24, 2026
