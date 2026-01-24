# BubbleVoice Mac

**Your personal AI companion that remembers your life.**

BubbleVoice is a voice-first Mac app for having meaningful conversations about your personal life - your goals, your kids, your startup, your daily struggles - with an AI that actually remembers and understands your context.

---

## 📚 Documentation

- **[Build Checklist](COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md)** - Current status and roadmap (95% complete)
- **[Testing Guide](docs/TESTING_GUIDE.md)** - How to test the app
- **[Known Issues](docs/KNOWN_ISSUES.md)** - Current issues and workarounds
- **[Changelog](docs/CHANGELOG.md)** - Version history and fixes
- **[Latest Fixes](FIXES_AND_TESTS_2026-01-24.md)** - Recent bug fixes
- **[UI Layout Fix](UI_LAYOUT_FIX_2026-01-24.md)** - Critical UI fix details

---

## Features

- **Voice-First Interface**: Speak naturally, see real-time transcription, edit before sending
- **Unified Chat & Voice**: Voice button next to send button - seamlessly switch between modes
- **Three-Timer System**: Sophisticated turn detection for natural conversation flow
- **Proactive Bubbles**: Contextual suggestions that reference YOUR specific life context
- **Visual Artifacts**: Timelines, decision cards, goal trackers generated from conversations
- **Local-First Memory**: Your personal conversations stay on your device (RAG coming soon)
- **iOS 26 Liquid Glass UI**: Beautiful, modern interface with translucent effects

## Tech Stack

- **Frontend**: Electron + HTML/CSS/JS (Liquid Glass UI)
- **Backend**: Node.js + Express + WebSocket
- **LLM**: Gemini 2.5 Flash-Lite (primary), Claude Sonnet 4.5, GPT-5.2 (optional)
- **Speech**: Apple SFSpeechRecognizer (native macOS)
- **TTS**: NSSpeechSynthesizer (native macOS)
- **Memory**: ObjectBox + MLX Swift (coming soon)

## Project Structure

```
BubbleVoice-Mac/
├── src/
│   ├── electron/          # Electron main process
│   │   ├── main.js        # App lifecycle, window management
│   │   └── preload.js     # IPC bridge (secure)
│   ├── frontend/          # Frontend UI
│   │   ├── index.html     # Main UI
│   │   ├── styles/        # CSS (Liquid Glass aesthetic)
│   │   └── components/    # JS modules
│   │       ├── app.js                    # Main app controller
│   │       ├── conversation-manager.js   # Message display
│   │       ├── voice-controller.js       # Voice I/O
│   │       └── websocket-client.js       # Backend communication
│   └── backend/           # Node.js backend
│       ├── server.js      # Main server
│       └── services/      # Backend services
│           ├── LLMService.js              # LLM integration
│           ├── ConversationService.js     # Conversation management
│           ├── VoicePipelineService.js    # Voice pipeline
│           └── BubbleGeneratorService.js  # Bubble generation
├── package.json           # Dependencies
├── .env.example           # Environment variables template
└── README.md              # This file
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_API_KEY=your_google_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here  # Optional
OPENAI_API_KEY=your_openai_api_key_here        # Optional
```

Get API keys:
- **Google AI (Gemini)**: https://makersuite.google.com/app/apikey
- **Anthropic (Claude)**: https://console.anthropic.com/
- **OpenAI (GPT)**: https://platform.openai.com/api-keys

### 3. Run the App

Development mode (with dev tools):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

### 4. Build for Distribution

```bash
npm run build:mac
```

This creates a `.dmg` installer in the `dist/` folder.

## Usage

### Starting a Conversation

1. **Global Hotkey**: Press `⌘⇧Space` from anywhere to activate
2. **Voice Button**: Click the microphone button or press it
3. **Type**: Just start typing in the input field

### Voice Input

- **Hold/Click Voice Button**: Start speaking
- **Auto-send**: Automatically sends after you stop speaking (configurable)
- **Edit Before Sending**: Edit the transcribed text before sending
- **Interruption**: Start speaking to interrupt AI response

### Bubbles

- Contextual suggestions appear above the input
- Click a bubble to populate the input field
- Bubbles reference YOUR specific context (e.g., "how's Emma doing?")

### Settings

- **Model Selection**: Choose between Gemini, Claude, GPT
- **Voice Speed**: Adjust TTS playback speed
- **Auto-send**: Toggle automatic sending after voice input
- **Always on Top**: Keep window above other apps

## Architecture

### Three-Timer System

Sophisticated turn detection system ported from the Accountability app:

1. **Timer 1 (0.5s)**: Start LLM processing (cached, not visible)
2. **Timer 2 (1.5s)**: Start TTS generation (uses cached LLM result)
3. **Timer 3 (2.0s)**: Start audio playback

This creates a buffered pipeline that feels instant while allowing natural pauses without premature cutoffs.

### Interruption Handling

- User can interrupt AI response by speaking
- All timers are cleared
- Cached responses are discarded
- New input is processed immediately

### Voice Pipeline

```
User Speech → Apple SFSpeechRecognizer → Real-time Transcription → Frontend Display
                                                                    ↓
                                                              User Edits (optional)
                                                                    ↓
                                                              Send to Backend
                                                                    ↓
                                                    LLM Processing (Gemini/Claude/GPT)
                                                                    ↓
                                            Streaming Response + Bubbles + Artifacts
                                                                    ↓
                                                    TTS Generation (NSSpeechSynthesizer)
                                                                    ↓
                                                              Audio Playback
```

## Development Status

### ✅ Completed

- Electron app structure with menu bar integration
- Unified chat/voice UI with Liquid Glass design
- Node.js backend with WebSocket communication
- LLM integration (Gemini, Claude, GPT)
- Three-timer turn detection system
- Interruption handling
- Bubble generation system
- Conversation management

### 🚧 In Progress

- Speech recognition integration (Apple Speech APIs)
- TTS integration (NSSpeechSynthesizer)
- Swift helper process for native APIs

### 📋 Planned

- Local RAG with ObjectBox + MLX Swift
- Artifact generation (timelines, charts, cards)
- Conversation history and search
- Multi-device sync (optional, via Convex)
- DMG packaging and distribution

## Contributing

This is a personal project, but feedback and suggestions are welcome!

## License

MIT

## Credits

- Three-timer system inspired by the Accountability app
- Liquid Glass UI inspired by iOS 26 design language
- Built with love for people who want to think out loud about their lives

---

**Last Updated**: January 20, 2026
