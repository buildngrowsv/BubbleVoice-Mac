# Bubble Voice Mac - Architecture Analysis

**Created:** 2026-01-15  
**Purpose:** Architecture analysis and implementation plan for Bubble Voice on macOS, adapted from Accountability app insights.

---

## 📋 Executive Summary

Building Bubble Voice for **Mac first** offers significant advantages:

| Advantage | Mac | iPhone |
|-----------|-----|--------|
| **Memory** | 8-128 GB | 4-8 GB |
| **Local LLM** | Full 7B-70B models | Limited to 3-4B |
| **MLX Performance** | 4x faster on M4/M5 | Good but constrained |
| **Development Speed** | Faster iteration | Requires device testing |
| **UI Complexity** | More flexible | Constrained |
| **Always Listening** | Natural (desktop) | Background restrictions |

**Recommended Approach:** Menu bar app with floating conversation window, fully local LLM + RAG.

---

## 🏗️ Mac-Specific Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Bubble Voice Mac Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐                                                             │
│  │ Menu Bar    │  ← Status item (mic icon, listening indicator)              │
│  │ Icon        │  ← Global hotkey (Cmd+Shift+Space)                          │
│  └──────┬──────┘                                                             │
│         │                                                                    │
│         ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Floating Conversation Window                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  Voice Waveform + Transcript Display (Liquid Glass UI)      │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  Control Bar: Interrupt | End | Settings | History          │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Core Voice Pipeline                            │    │
│  │                                                                      │    │
│  │   AVAudioEngine → SpeechAnalyzer/SFSpeechRecognizer                 │    │
│  │        │                    │                                        │    │
│  │        │              Transcription                                  │    │
│  │        │                    │                                        │    │
│  │        │                    ▼                                        │    │
│  │        │         ┌──────────────────┐                                │    │
│  │        │         │  Timer System    │  (from Accountability)         │    │
│  │        │         │  0.5s → LLM      │                                │    │
│  │        │         │  1.5s → TTS      │                                │    │
│  │        │         │  2.0s → Play     │                                │    │
│  │        │         └────────┬─────────┘                                │    │
│  │        │                  │                                          │    │
│  │        │                  ▼                                          │    │
│  │        │         ┌──────────────────┐                                │    │
│  │        │         │   RAG Retrieval  │                                │    │
│  │        │         │   (Local Memory) │                                │    │
│  │        │         └────────┬─────────┘                                │    │
│  │        │                  │                                          │    │
│  │        │                  ▼                                          │    │
│  │        │         ┌──────────────────┐                                │    │
│  │        │         │   Local LLM      │  (MLX Swift)                   │    │
│  │        │         │   or Cloud API   │                                │    │
│  │        │         └────────┬─────────┘                                │    │
│  │        │                  │                                          │    │
│  │        │                  ▼                                          │    │
│  │        │         ┌──────────────────┐                                │    │
│  │        │         │   Local TTS      │  (MLX / macOS / API)           │    │
│  │        │         └────────┬─────────┘                                │    │
│  │        │                  │                                          │    │
│  │        ◄──────────────────┘                                          │    │
│  │   AVAudioEngine.play()                                               │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ PRESERVED FROM ACCOUNTABILITY (Identical Logic)

### 1. Three-Timer Turn Detection System

**This is the heart of natural conversation flow - PRESERVE EXACTLY:**

```
User speaks → [0.5s LLM Timer] → [1.5s TTS Timer] → [2.0s Play Timer]
              Start processing    Use cached result   Play audio
```

```swift
class TimerManager: ObservableObject {
    @Published var llmTime: Timer?   // 0.5s - Start LLM processing
    @Published var ttsTime: Timer?   // 1.5s - Start TTS (or use cached)
    @Published var playTime: Timer?  // 2.0s - Play audio (or use cached)
    
    @Published var LLMResult: String?  // Cached LLM response
    @Published var TTSResult: Data?    // Cached TTS audio
    
    @Published var isLLMTimerFinished = false
    @Published var isTTSTimerFinished = false
    
    func invalidateTimer() {
        isLLMTimerFinished = false
        isTTSTimerFinished = false
        llmTime?.invalidate()
        ttsTime?.invalidate()
        playTime?.invalidate()
    }
}
```

### 2. Voice Interruption System

**Critical for natural conversation - user can interrupt anytime:**

```swift
func processSpeechRecognitionResult(transcription: String) {
    // Check if audio is currently playing
    let isAudioActive = ttsPlayerNode.isPlaying || isSpeaking
    
    if isAudioActive {
        print("‼️ User interrupted - stopping playback")
        
        // 1. Stop audio immediately
        ttsPlayerNode.stop()
        ttsPlayerNode.reset()
        
        // 2. Update state
        isSpeaking = false
        
        // 3. Cancel all timers
        timerManager.invalidateTimer()
        
        // 4. ⚠️ CRITICAL: Clear ALL cached results
        timerManager.LLMResult = nil
        timerManager.TTSResult = nil
        
        // 5. Reset processing state
        isProcessingResponse = false
    }
    
    // Continue with new input
    latestTranscription = transcription
    resetSilenceTimer()
}
```

### 3. Multi-Provider API Client

**Preserve the flexibility to switch providers:**

| Type | Providers |
|------|-----------|
| **LLM** | Local MLX, OpenAI, Anthropic, Google, Groq |
| **TTS** | Local (macOS Speech), Deepgram, ElevenLabs, PlayHT |

### 4. Structured Output for Analysis

**Preserve JSON schema patterns for post-conversation analysis:**
- Transcript categorization
- Metrics extraction
- Reminder extraction
- User profile updates

---

## 🆕 MAC-SPECIFIC ENHANCEMENTS

### 1. Full Local LLM via MLX Swift

**Mac can run serious models locally:**

| Model | Size | Memory Needed | Speed (M3 Pro) |
|-------|------|---------------|----------------|
| Llama 3.2 3B | ~2 GB | 4 GB | ~50 tok/s |
| Mistral 7B 4-bit | ~4 GB | 8 GB | ~30 tok/s |
| Llama 3.1 8B 4-bit | ~5 GB | 10 GB | ~25 tok/s |
| Qwen 2.5 14B 4-bit | ~8 GB | 16 GB | ~15 tok/s |

```swift
import MLX
import MLXLLM

class LocalLLMService {
    private var model: LLM?
    private var tokenizer: Tokenizer?
    
    func setup() async throws {
        // Load quantized model - fits in memory alongside other apps
        let modelId = "mlx-community/Llama-3.2-3B-Instruct-4bit"
        model = try await LLM.load(from: modelId)
        tokenizer = try await Tokenizer.load(from: modelId)
    }
    
    func generate(prompt: String, maxTokens: Int = 500) async -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                guard let model = model, let tokenizer = tokenizer else {
                    continuation.finish()
                    return
                }
                
                let tokens = tokenizer.encode(prompt)
                
                for await token in model.generate(tokens, maxTokens: maxTokens) {
                    let text = tokenizer.decode([token])
                    continuation.yield(text)
                }
                
                continuation.finish()
            }
        }
    }
}
```

### 2. Menu Bar + Floating Window UI

**macOS-native interaction pattern:**

```swift
@main
struct BubbleVoiceMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject var conversationManager = ConversationManager()
    
    var body: some Scene {
        // Floating conversation window
        WindowGroup("Bubble Voice") {
            ConversationWindowView()
                .environmentObject(conversationManager)
        }
        .windowLevel(.floating)
        .windowResizability(.contentSize)
        .defaultSize(width: 400, height: 500)
        
        // Settings window
        Settings {
            SettingsView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var popover: NSPopover?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()
        setupGlobalHotkey()
    }
    
    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "waveform.circle", 
                                  accessibilityDescription: "Bubble Voice")
            button.action = #selector(toggleConversation)
        }
    }
    
    func setupGlobalHotkey() {
        // Cmd+Shift+Space to toggle
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
            if event.modifierFlags.contains([.command, .shift]) && 
               event.keyCode == 49 { // Space
                self.toggleConversation()
            }
        }
    }
    
    @objc func toggleConversation() {
        // Toggle floating window visibility
        if let window = NSApp.windows.first(where: { $0.title == "Bubble Voice" }) {
            if window.isVisible {
                window.orderOut(nil)
            } else {
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }
}
```

### 3. Larger Local RAG (More Memory = More Context)

**Mac can store and search much more:**

| Storage | iPhone (8GB RAM) | Mac (16GB+) |
|---------|-----------------|-------------|
| Vector index | ~100k vectors | ~1M+ vectors |
| Context window | 4-8k tokens | 32-128k tokens |
| Model + Index | ~500 MB | ~4+ GB |

### 4. Always-On Listening (Desktop Advantage)

**No background restrictions like iOS:**

```swift
class AlwaysOnListener {
    private let audioEngine = AVAudioEngine()
    private var isListening = false
    
    func startListening() {
        // macOS doesn't have iOS background audio restrictions
        // Can run indefinitely while app is open
        
        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, time in
            // Feed to speech recognizer continuously
            self.processAudioBuffer(buffer)
        }
        
        try? audioEngine.start()
        isListening = true
    }
    
    func stopListening() {
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        isListening = false
    }
}
```

### 5. SpeechAnalyzer (macOS 16+ / 2025)

**New API for better real-time transcription:**

```swift
import Speech

class ModernSpeechService {
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    
    func setup() async throws {
        // SpeechAnalyzer provides better streaming results
        transcriber = SpeechTranscriber(
            locale: .current,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],  // Low-latency partial results
            attributeOptions: [.audioTimeRange]
        )
        
        analyzer = SpeechAnalyzer(modules: [transcriber!])
    }
    
    func startTranscribing() -> AsyncStream<TranscriptionResult> {
        AsyncStream { continuation in
            Task {
                guard let analyzer = analyzer else { return }
                
                for try await result in analyzer.transcriberResults {
                    continuation.yield(TranscriptionResult(
                        text: result.transcript,
                        isFinal: result.isFinalized
                    ))
                }
            }
        }
    }
}
```

---

## 🗂️ Proposed Mac Project Structure

```
BubbleVoice-Mac/
├── BubbleVoiceMac/
│   ├── App/
│   │   ├── BubbleVoiceMacApp.swift          # Main app entry
│   │   ├── AppDelegate.swift                 # Menu bar + hotkeys
│   │   └── AppState.swift                    # Global state
│   │
│   ├── Core/
│   │   ├── Audio/
│   │   │   ├── AudioEngineManager.swift      # AVAudioEngine setup
│   │   │   ├── SpeechRecognitionService.swift # SF/SpeechAnalyzer
│   │   │   └── AudioPlaybackService.swift    # TTS playback
│   │   │
│   │   ├── Conversation/
│   │   │   ├── ConversationManager.swift     # Main orchestrator
│   │   │   ├── TimerManager.swift            # Three-timer system (from Accountability)
│   │   │   ├── InterruptionHandler.swift     # Voice interrupt (from Accountability)
│   │   │   └── ConversationState.swift       # State machine
│   │   │
│   │   ├── LLM/
│   │   │   ├── LLMProviderProtocol.swift     # Abstract interface
│   │   │   ├── LocalMLXProvider.swift        # MLX Swift local inference
│   │   │   ├── OpenAIProvider.swift          # Cloud fallback
│   │   │   └── AnthropicProvider.swift       # Cloud fallback
│   │   │
│   │   ├── TTS/
│   │   │   ├── TTSProviderProtocol.swift     # Abstract interface
│   │   │   ├── LocalMacTTSProvider.swift     # NSSpeechSynthesizer
│   │   │   ├── LocalMLXTTSProvider.swift     # MLX TTS models
│   │   │   └── CloudTTSProvider.swift        # ElevenLabs/PlayHT
│   │   │
│   │   └── RAG/
│   │       ├── EmbeddingService.swift        # Local embeddings
│   │       ├── VectorStore.swift             # ObjectBox/SQLite
│   │       ├── RAGRetriever.swift            # Context retrieval
│   │       └── MemoryIndexer.swift           # Conversation indexing
│   │
│   ├── Features/
│   │   ├── Conversation/
│   │   │   ├── ConversationWindowView.swift  # Main floating window
│   │   │   ├── TranscriptView.swift          # Chat display
│   │   │   ├── WaveformView.swift            # Audio visualization
│   │   │   └── ControlBarView.swift          # Buttons
│   │   │
│   │   ├── History/
│   │   │   ├── HistoryView.swift
│   │   │   └── TranscriptDetailView.swift
│   │   │
│   │   └── Settings/
│   │       ├── SettingsView.swift
│   │       ├── LLMSettingsView.swift         # Model selection
│   │       ├── VoiceSettingsView.swift       # TTS selection
│   │       └── MemorySettingsView.swift      # RAG settings
│   │
│   ├── UI/
│   │   ├── Components/
│   │   │   ├── StatusBarIcon.swift
│   │   │   ├── FloatingWindow.swift
│   │   │   └── GlassButton.swift             # Liquid Glass style
│   │   │
│   │   └── Design/
│   │       ├── ColorTokens.swift
│   │       └── Typography.swift
│   │
│   ├── Services/
│   │   ├── APIClient/
│   │   │   └── APIClient.swift               # Cloud API calls
│   │   │
│   │   └── Storage/
│   │       ├── ConversationStorage.swift
│   │       └── UserProfileStorage.swift
│   │
│   └── Models/
│       ├── Message.swift
│       ├── ConversationStep.swift
│       ├── TranscriptAnalysis.swift
│       └── UserProfile.swift
│
├── BubbleVoiceMac.xcodeproj/
│
└── Documentation/
    ├── ARCHITECTURE_ANALYSIS_MAC.md          # This file
    ├── LOCAL_RAG_MAC.md                      # RAG implementation
    └── LOCAL_LLM_MAC.md                      # LLM setup
```

---

## 📊 Mac vs iPhone Comparison

| Feature | Mac Implementation | iPhone (Future) |
|---------|-------------------|-----------------|
| **LLM** | MLX local (7B-14B) | Cloud API or 3B local |
| **TTS** | MLX local or cloud | Cloud API |
| **Embeddings** | MLX local (768-dim) | NLEmbedding (512-dim) |
| **Vector DB** | ObjectBox (1M+ vectors) | ObjectBox (100k vectors) |
| **UI** | Menu bar + floating window | Full-screen call view |
| **Listening** | Always-on capable | Background restricted |
| **Memory** | 16+ GB available | 4-8 GB shared |

---

## 🎯 Implementation Phases (Mac)

### Phase 1: Core Audio + Conversation (Week 1)
- [ ] AVAudioEngine setup for mic input
- [ ] SpeechRecognizer/SpeechAnalyzer integration
- [ ] Three-timer turn detection (port from Accountability)
- [ ] Voice interruption handling (port from Accountability)
- [ ] Basic audio playback (AVAudioPlayerNode)

### Phase 2: LLM Integration (Week 1-2)
- [ ] Cloud API providers (OpenAI/Anthropic) as baseline
- [ ] MLX Swift local LLM setup
- [ ] Streaming token response
- [ ] Provider switching logic

### Phase 3: Local RAG (Week 2)
- [ ] ObjectBox or sqlite-vector setup
- [ ] MLX embedding model integration
- [ ] Conversation memory indexing
- [ ] Semantic search retrieval
- [ ] Context builder for prompts

### Phase 4: TTS (Week 2-3)
- [ ] macOS NSSpeechSynthesizer (fallback)
- [ ] Cloud TTS integration (ElevenLabs/PlayHT)
- [ ] MLX local TTS (optional)
- [ ] Audio caching for repeated phrases

### Phase 5: UI Polish (Week 3-4)
- [ ] Menu bar status item
- [ ] Floating conversation window
- [ ] Global hotkey (Cmd+Shift+Space)
- [ ] Liquid Glass styling (macOS 16+)
- [ ] Waveform visualization
- [ ] Settings window

### Phase 6: Post-Conversation Analysis (Week 4)
- [ ] Structured output for transcript analysis
- [ ] Category extraction
- [ ] User profile updates
- [ ] Reminder extraction

---

## 🚀 Quick Start Commands

```bash
# Create Xcode project
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# Initialize with Xcode (manual) or use:
# swift package init --type executable --name BubbleVoiceMac

# Key dependencies (Package.swift)
# - MLX Swift: https://github.com/ml-explore/mlx-swift
# - ObjectBox: https://github.com/objectbox/objectbox-swift
# - HotKey: https://github.com/soffes/HotKey (for global shortcuts)
```

---

## 📝 Notes

- **Start with cloud APIs** for fastest iteration, add local later
- **Menu bar pattern** is natural for always-available voice assistant
- **Floating window** allows use alongside other apps
- **Global hotkey** enables quick activation without mouse
- **MLX on Mac** is mature and well-optimized for Apple Silicon
- **Port timer/interruption logic exactly** from Accountability - it's battle-tested
- **More RAM = bigger models + more context** - take advantage of Mac hardware
