# Voice & Character Architecture Stack Analysis

**Date**: January 19, 2026  
**Purpose**: Understanding what's on-device vs streamed, how it's achieved, and character/persona architecture options

---

## 📊 Executive Summary

| Category | Best On-Device Option | Best Cloud Option | Recommendation |
|----------|----------------------|-------------------|----------------|
| **STT (Speech-to-Text)** | Whisper MLX (~500ms) | OpenAI Whisper API | Start with SFSpeechRecognizer, upgrade to Whisper MLX |
| **TTS (Text-to-Speech)** | MLX Kokoro (~100ms) | Gemini 2.5 TTS | Start with `say` command, upgrade to MLX Kokoro |
| **LLM (Chat/Reasoning)** | MLX Llama 3.2 (~1-2s) | Gemini Flash Lite (~1s) | Cloud for v1, local for privacy mode |
| **Character/Persona** | Local JSON + prompts | Vector DB + embeddings | Hybrid: local persona, cloud conversation |

---

## 🎙️ Speech-to-Text (STT) Architecture

### Option 1: Apple SFSpeechRecognizer (Built-in)

```
┌─────────────────────────────────────────────────────────┐
│                   SFSpeechRecognizer                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Microphone → AVAudioEngine → SFSpeechRecognizer        │
│                      ↓                                   │
│              On-Device Model (Apple Silicon)             │
│                      ↓                                   │
│              Real-time Transcription                     │
│                                                          │
│  ✅ On-Device: Yes (macOS 13+, Apple Silicon)           │
│  ⚡ Latency: ~100-300ms                                  │
│  💰 Cost: Free                                           │
│  🔒 Privacy: Full (no data leaves device)               │
│  📊 Accuracy: Good (80-90%)                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation (Swift)**:
```swift
import Speech

class SpeechRecognitionService {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    func startListening(onResult: @escaping (String) -> Void) {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        
        // On-device recognition (requires macOS 13+)
        if #available(macOS 13, *) {
            request.requiresOnDeviceRecognition = true
        }
        
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }
        
        recognitionTask = recognizer.recognitionTask(with: request) { result, error in
            if let result = result {
                onResult(result.bestTranscription.formattedString)
            }
        }
        
        audioEngine.prepare()
        try? audioEngine.start()
    }
}
```

### Option 2: Whisper MLX (Local, High Quality)

```
┌─────────────────────────────────────────────────────────┐
│                    Whisper MLX                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Microphone → WAV Buffer → Whisper Model (MLX)          │
│                      ↓                                   │
│         Apple Silicon Neural Engine                      │
│                      ↓                                   │
│            High-Accuracy Transcription                   │
│                                                          │
│  ✅ On-Device: Yes (100% local)                         │
│  ⚡ Latency: ~500-800ms                                  │
│  💰 Cost: Free (model download ~1-3GB)                  │
│  🔒 Privacy: Full                                        │
│  📊 Accuracy: Excellent (95%+)                          │
│                                                          │
│  Models: whisper-tiny, whisper-base, whisper-small      │
│  Framework: github.com/ml-explore/mlx-examples          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Option 3: Cloud STT (OpenAI Whisper API)

```
┌─────────────────────────────────────────────────────────┐
│                  OpenAI Whisper API                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Microphone → Audio File → HTTPS POST → OpenAI          │
│                                  ↓                       │
│                          Cloud Processing                │
│                                  ↓                       │
│                        JSON Response                     │
│                                                          │
│  ✅ On-Device: No (cloud required)                      │
│  ⚡ Latency: ~1000-2000ms                                │
│  💰 Cost: $0.006/minute                                  │
│  🔒 Privacy: Data sent to OpenAI                        │
│  📊 Accuracy: Best (98%+)                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔊 Text-to-Speech (TTS) Architecture

### Option 1: macOS `say` Command (Fastest)

```
┌─────────────────────────────────────────────────────────┐
│              macOS say Command / NSSpeechSynthesizer     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Text → NSSpeechSynthesizer → Audio Output              │
│              ↓                                           │
│      System Voice Engine (Apple)                         │
│              ↓                                           │
│         Immediate Playback                               │
│                                                          │
│  ✅ On-Device: Yes (100%)                               │
│  ⚡ Latency: ~50-100ms                                   │
│  💰 Cost: Free                                           │
│  🔒 Privacy: Full                                        │
│  🎭 Quality: Medium (robotic at times)                  │
│                                                          │
│  Voices: Samantha, Alex, Ava, Tom, etc.                 │
│  Command: say -v "Samantha" "Hello world"               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
```swift
import AppKit

class QuickTTSService {
    private let synthesizer = NSSpeechSynthesizer()
    
    func speak(_ text: String, voice: String = "com.apple.voice.enhanced.en-US.Samantha") {
        synthesizer.setVoice(NSSpeechSynthesizer.VoiceName(rawValue: voice))
        synthesizer.startSpeaking(text)
    }
    
    // Or via shell (even faster startup):
    func speakViaShell(_ text: String) {
        let task = Process()
        task.launchPath = "/usr/bin/say"
        task.arguments = ["-v", "Samantha", text]
        task.launch()
    }
}
```

### Option 2: MLX Kokoro TTS (Local, High Quality)

```
┌─────────────────────────────────────────────────────────┐
│                   MLX Kokoro TTS                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Text → Kokoro-82M Model → Neural Engine → WAV          │
│                      ↓                                   │
│         Apple Silicon Optimization                       │
│                      ↓                                   │
│           Natural Voice Output                           │
│                                                          │
│  ✅ On-Device: Yes (100%)                               │
│  ⚡ Latency: ~100-300ms                                  │
│  💰 Cost: Free (model ~500MB)                           │
│  🔒 Privacy: Full                                        │
│  🎭 Quality: High (natural, expressive)                 │
│                                                          │
│  Framework: github.com/Blaizzy/mlx-audio                │
│  Voices: Multiple, customizable                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Reference Apps Using MLX TTS**:
- [FonoX](https://reddit.com/r/macapps/comments/1q778yu/) - Native macOS, fully offline
- [Murmur](https://reddit.com/r/macmini/comments/1q4qouu/) - MLX framework, M-series optimized

### Option 3: Personal Voice (macOS 14+)

```
┌─────────────────────────────────────────────────────────┐
│                  Apple Personal Voice                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  User Records 150 Sentences (~15 min)                   │
│                      ↓                                   │
│  On-Device Training (overnight, while charging)          │
│                      ↓                                   │
│  Personal Voice Model (sounds like user!)                │
│                      ↓                                   │
│  Live Speech / Accessibility Integration                 │
│                                                          │
│  ✅ On-Device: Yes (training + inference)               │
│  ⚡ Latency: ~100-200ms                                  │
│  💰 Cost: Free                                           │
│  🔒 Privacy: Full (encrypted, optional iCloud sync)     │
│  🎭 Quality: High (user's own voice!)                   │
│                                                          │
│  Source: machinelearning.apple.com/research/personal-voice │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Option 4: Cloud TTS (Gemini / ElevenLabs)

```
┌─────────────────────────────────────────────────────────┐
│               Gemini 2.5 Flash TTS                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Text + Style Prompt → HTTPS → Google Cloud             │
│                              ↓                           │
│                    Neural TTS Model                      │
│                              ↓                           │
│            Streaming Audio Chunks                        │
│                                                          │
│  ✅ On-Device: No                                       │
│  ⚡ Latency: ~200-500ms (streaming)                      │
│  💰 Cost: ~$0.01/1000 chars                             │
│  🔒 Privacy: Data sent to Google                        │
│  🎭 Quality: Excellent (expressive, multi-speaker)      │
│                                                          │
│  Features: Tone control, pacing, emotion, multi-speaker │
│  Models: gemini-2.5-flash-tts, gemini-2.5-pro-tts       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🎭 Character/Persona Architecture

### How Character.AI Does It

```
┌─────────────────────────────────────────────────────────┐
│              Character.AI Architecture                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │  Character      │    │   Conversation  │             │
│  │  Definition     │    │     Memory      │             │
│  │                 │    │                 │             │
│  │ • Name          │    │ • Recent msgs   │             │
│  │ • Personality   │    │ • User facts    │             │
│  │ • Background    │    │ • Relationship  │             │
│  │ • Voice style   │    │ • Topics        │             │
│  │ • Behaviors     │    │                 │             │
│  └────────┬────────┘    └────────┬────────┘             │
│           │                      │                       │
│           └──────────┬───────────┘                       │
│                      ↓                                   │
│           ┌─────────────────────┐                        │
│           │   System Prompt     │                        │
│           │   Construction      │                        │
│           └──────────┬──────────┘                        │
│                      ↓                                   │
│           ┌─────────────────────┐                        │
│           │    LLM Inference    │                        │
│           │    (Cloud-based)    │                        │
│           └──────────┬──────────┘                        │
│                      ↓                                   │
│           ┌─────────────────────┐                        │
│           │   Voice Synthesis   │                        │
│           │   (Streaming TTS)   │                        │
│           └─────────────────────┘                        │
│                                                          │
│  Cloud Components: LLM, TTS, Memory Search              │
│  On-Device: Audio capture, UI, local cache              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Character Definition Schema**:
```json
{
  "character_id": "bubble_ai",
  "name": "Bubble",
  "tagline": "Your personal AI companion",
  "personality": {
    "traits": ["warm", "curious", "supportive", "patient"],
    "communication_style": "conversational, uses questions",
    "emotional_baseline": "calm, optimistic",
    "vocabulary_level": "accessible, avoids jargon"
  },
  "background": {
    "description": "A thoughtful AI that helps people process life",
    "expertise": ["personal growth", "emotional support", "goal tracking"],
    "limitations": ["no medical advice", "no financial advice"]
  },
  "voice": {
    "tts_voice": "Samantha",
    "speaking_pace": "moderate",
    "tone": "warm",
    "emotional_range": ["empathetic", "curious", "supportive"]
  },
  "behaviors": {
    "greeting": "Hey! What's on your mind?",
    "on_silence": "Take your time. I'm here when you're ready.",
    "on_emotion": "I hear you. That sounds {emotion}.",
    "memory_references": true
  }
}
```

### BubbleVoice Character Architecture (Recommended)

```
┌─────────────────────────────────────────────────────────┐
│            BubbleVoice Character System                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  LOCAL LAYER (On-Device)                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │  Character.json     User.json        Memory.db   │    │
│  │  (personality)      (preferences)    (SQLite)    │    │
│  │       ↓                  ↓               ↓       │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │         Context Assembly                 │    │    │
│  │  │                                          │    │    │
│  │  │  • Character personality traits          │    │    │
│  │  │  • User preferences & history            │    │    │
│  │  │  • Recent conversation (last 20 msgs)    │    │    │
│  │  │  • Retrieved memories (RAG)              │    │    │
│  │  │  • Current emotional state               │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  │                      ↓                           │    │
│  │           System Prompt (dynamic)                │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ↓                                │
│  CLOUD LAYER (Streaming)                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │     Gemini 2.5 Flash Lite (structured JSON)      │    │
│  │                      ↓                           │    │
│  │     {                                            │    │
│  │       "user_response": { "text": "...", "tone": "empathetic" },
│  │       "internal_notes": { "observations": "..." },
│  │       "artifact_action": { "action": "create", "data": {...} }
│  │     }                                            │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                         │                                │
│                         ↓                                │
│  LOCAL LAYER (Output)                                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │  TTS (say command) → Audio Output                │    │
│  │       ↓                                          │    │
│  │  Update Memory.db with internal_notes            │    │
│  │       ↓                                          │    │
│  │  Render Artifact (if any)                        │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 Memory & RAG Architecture

### Local Vector Search (MLX Embed)

```
┌─────────────────────────────────────────────────────────┐
│              Local RAG Architecture                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Conversation Turn                                       │
│        ↓                                                 │
│  MLX Embed (on-device embedding)                        │
│        ↓                                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │           ObjectBox / SQLite + FTS5              │    │
│  │                                                   │    │
│  │  conversations_table:                            │    │
│  │  ├── id, timestamp, user_input, ai_response      │    │
│  │  ├── embedding (BLOB)                            │    │
│  │  ├── summary (generated after conversation)      │    │
│  │  └── emotional_state, topics[], artifacts[]      │    │
│  │                                                   │    │
│  │  artifacts_table:                                │    │
│  │  ├── id, type, data_json, created_at             │    │
│  │  └── conversation_id (foreign key)               │    │
│  │                                                   │    │
│  │  user_facts_table:                               │    │
│  │  ├── id, fact, confidence, source_conversation   │    │
│  │  └── embedding                                    │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Retrieval Query:                                       │
│  1. Embed current user input                            │
│  2. Cosine similarity search (top 5 conversations)      │
│  3. Keyword search (FTS5) for names/entities            │
│  4. Merge & rank results                                │
│  5. Include in system prompt                            │
│                                                          │
│  ✅ On-Device: 100%                                     │
│  ⚡ Latency: ~50-100ms                                   │
│  💰 Cost: Free                                           │
│  🔒 Privacy: Full                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📱 Complete Voice Pipeline (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BubbleVoice Full Pipeline                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ 1. LISTEN│    │ 2. THINK │    │ 3. SPEAK │    │ 4. SHOW  │          │
│  │  (STT)   │    │  (LLM)   │    │  (TTS)   │    │ (Artifact)│          │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘          │
│       │               │               │               │                  │
│       ↓               ↓               ↓               ↓                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │SFSpeech  │    │Gemini    │    │say cmd   │    │SwiftUI   │          │
│  │Recognizer│    │Flash Lite│    │or MLX    │    │Component │          │
│  │(on-device)│   │(streaming)│   │Kokoro    │    │(local)   │          │
│  │          │    │          │    │(on-device)│   │          │          │
│  │~200ms    │    │~1000ms   │    │~100ms    │    │instant   │          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│                                                                          │
│  TOTAL LATENCY: ~1300-1500ms (user speaks → AI speaks)                  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Timer System (from Accountability)            │    │
│  │                                                                   │    │
│  │   User stops speaking                                            │    │
│  │         ↓                                                        │    │
│  │   0.5s Timer → Start LLM call (cache result)                    │    │
│  │         ↓                                                        │    │
│  │   1.5s Timer → Start TTS (on cached LLM result)                 │    │
│  │         ↓                                                        │    │
│  │   2.0s Timer → Play audio (if ready)                            │    │
│  │                                                                   │    │
│  │   If user speaks during any timer → Cancel all, restart          │    │
│  │                                                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Analysis (Per 100 Conversations/Day)

| Component | On-Device | Cloud | Hybrid (Recommended) |
|-----------|-----------|-------|----------------------|
| **STT** | $0 (SFSpeech) | $3.60/day (Whisper API) | $0 (local) |
| **LLM** | $0 (MLX Llama) | $0.50/day (Gemini Flash Lite) | $0.50/day (cloud) |
| **TTS** | $0 (say command) | $1.00/day (Gemini TTS) | $0 (local) |
| **RAG** | $0 (local SQLite) | $0.20/day (Pinecone) | $0 (local) |
| **TOTAL** | **$0/day** | **$5.30/day** | **$0.50/day** |

---

## 🎯 Recommended Stack for BubbleVoice v1

```
PRODUCTION STACK (Optimized for latency + cost)
================================================

STT:     SFSpeechRecognizer (on-device, ~200ms, free)
         ↓
LLM:     Gemini 2.5 Flash Lite (cloud, ~1000ms, $0.075/1M tokens)
         ↓
TTS:     macOS say command (on-device, ~50ms, free)
         ↓
Memory:  SQLite + FTS5 (on-device, ~50ms, free)

TOTAL:   ~1300ms response time, ~$0.50/day for heavy use


UPGRADE PATH
============

v1.1: Replace say → MLX Kokoro (better voice quality)
v1.2: Add Whisper MLX for STT (better accuracy)
v1.3: Add MLX Llama for privacy mode (fully offline)
v2.0: Add Personal Voice support (user's own voice!)
```

---

## 📚 References

- [Apple Personal Voice Research](https://machinelearning.apple.com/research/personal-voice)
- [Apple On-Device Neural Speech](https://machinelearning.apple.com/research/on-device-neural-speech)
- [MLX Audio Framework](https://github.com/Blaizzy/mlx-audio)
- [FonoX Native TTS](https://reddit.com/r/macapps/comments/1q778yu/)
- [Gemini TTS Documentation](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)
- [Apple Intelligence Architecture](https://apple.com/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac/)
