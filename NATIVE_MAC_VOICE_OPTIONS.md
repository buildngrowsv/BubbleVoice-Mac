# Native Mac Voice AI Options for BubbleVoice

**Research Date**: January 19, 2026

## 🎯 Relevant for BubbleVoice: On-Device Voice Processing

### Built-in macOS Features

| Feature | Description | Relevance |
|---------|-------------|-----------|
| **Personal Voice** | Create a synthesized voice that sounds like you (Apple Silicon) | Could offer personalized TTS |
| **Siri Voices** | High-quality built-in voices via `NSSpeechSynthesizer` | Free, no API cost |
| **VoiceOver/Spoken Content** | System accessibility TTS | Fallback option |

### Native Mac Apps for Reference

| App | Type | On-Device? | Notes |
|-----|------|------------|-------|
| **[FonoX](https://reddit.com/r/macapps/comments/1q778yu/)** | TTS | ✅ 100% local | Natural voices, exports WAV/M4A |
| **[Spokenly](https://reddit.com/r/macapps/comments/1kfffhc/)** | STT Dictation | ✅ On-device Whisper | 29MB, works everywhere |
| **[PrivateVoice](https://reddit.com/r/macapps/comments/1k1cfdu/)** | STT | ✅ Local | Hotkey-activated, multi-language |
| **[On-Device AI: TTS, STT & Chat](https://apps.apple.com/il/app/on-device-ai-tts-stt-chat/id6497060890)** | All-in-one | ✅ Local mode | Runs Llama/Qwen locally |

### ⚠️ Important: ChatGPT Mac Voice Mode Discontinued

As of **January 15, 2026**, OpenAI removed voice mode from the ChatGPT Mac app. Voice features are still available on mobile/web/Windows. ([Source](https://timesofindia.indiatimes.com/technology/laptops-pc/openai-to-discontinue-voice-mode-from-chatgpt-mac-app-in-january-2026/articleshow/126191256.cms))

## 🔧 macOS APIs for BubbleVoice Implementation

### Speech-to-Text (STT)

```swift
// Option 1: SFSpeechRecognizer (Apple's API)
import Speech
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

// Option 2: Whisper via MLX Swift (local, more accurate)
// Uses whisper.cpp or mlx-community/whisper models
```

### Text-to-Speech (TTS)

```swift
// Option 1: NSSpeechSynthesizer (free, built-in)
let synth = NSSpeechSynthesizer()
synth.setVoice(NSSpeechSynthesizer.VoiceName(rawValue: "com.apple.voice.enhanced.en-US.Samantha"))
synth.startSpeaking("Hello!")

// Option 2: AVSpeechSynthesizer (iOS-compatible)
let utterance = AVSpeechUtterance(string: "Hello!")
utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
let synthesizer = AVSpeechSynthesizer()
synthesizer.speak(utterance)

// Option 3: osascript say (simplest, terminal-friendly)
// say -v "Samantha" "Hello world"
```

### Personal Voice (macOS 15+)

```swift
// Check availability
AVSpeechSynthesizer.personalVoiceAuthorizationStatus

// Request permission
AVSpeechSynthesizer.requestPersonalVoiceAuthorization { status in
    if status == .authorized {
        // Use personal voice
    }
}
```

## 📊 Comparison for BubbleVoice Strategy

| Approach | Latency | Cost | Quality | Privacy |
|----------|---------|------|---------|---------|
| **`say` command** | ~50ms | Free | Medium | ✅ Local |
| **NSSpeechSynthesizer** | ~100ms | Free | Medium-High | ✅ Local |
| **Whisper MLX (STT)** | ~500ms | Free | High | ✅ Local |
| **OpenAI Whisper API** | ~1000ms | $0.006/min | Very High | ❌ Cloud |
| **Gemini TTS** | ~200ms | Varies | High | ❌ Cloud |

## 🎯 Recommended Stack for BubbleVoice v1

```
STT (Speech-to-Text):
├── Primary: SFSpeechRecognizer (free, instant, good accuracy)
├── Upgrade: Whisper MLX (better accuracy, ~500ms extra)
└── Premium: OpenAI Whisper (best accuracy, cloud)

TTS (Text-to-Speech):
├── Primary: osascript say / NSSpeechSynthesizer (instant, free)
├── Upgrade: Personal Voice (user's own voice!)
└── Premium: Gemini 2.5 TTS or ElevenLabs (highest quality)
```

## 📝 Notes

- **Personal Voice** requires macOS 14+ and Apple Silicon
- **SFSpeechRecognizer** requires user permission (microphone + speech)
- **Whisper MLX** models are ~1-3GB download
- The `say` command is the fastest option for testing (~50ms)
