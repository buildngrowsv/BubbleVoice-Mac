# BubbleVoice Mac - Technical Specification

**Document Version:** 1.0  
**Created:** 2026-01-18  
**Author:** AI Engineering Team  
**Status:** Draft for Review

---

## 1. System Overview

### 1.1 Architecture Summary

BubbleVoice Mac is a native macOS application built with Swift/SwiftUI, designed for Apple Silicon. The system follows a modular architecture with clear separation between:

- **Voice Pipeline** - Audio capture, speech recognition, TTS playback
- **Conversation Engine** - Timer system, turn detection, interruption handling
- **Intelligence Layer** - LLM integration, RAG retrieval, agent coordination
- **Artifact System** - JSON schema, native rendering, versioning
- **Presentation Layer** - SwiftUI views, menu bar, floating window

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BUBBLEVOICE MAC ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │                         PRESENTATION LAYER                                 │ │
│   │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐│ │
│   │  │ Menu Bar    │  │ Conversation    │  │ Settings Window                 ││ │
│   │  │ Status Item │  │ Window          │  │                                 ││ │
│   │  └─────────────┘  │ ┌─────────────┐ │  └─────────────────────────────────┘│ │
│   │                   │ │ History     │ │                                     │ │
│   │                   │ │ Panel       │ │                                     │ │
│   │                   │ ├─────────────┤ │                                     │ │
│   │                   │ │ Artifact    │ │                                     │ │
│   │                   │ │ Viewer      │ │                                     │ │
│   │                   │ ├─────────────┤ │                                     │ │
│   │                   │ │ Voice       │ │                                     │ │
│   │                   │ │ Interface   │ │                                     │ │
│   │                   │ └─────────────┘ │                                     │ │
│   │                   └─────────────────┘                                     │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │                      CONVERSATION ENGINE                                   │ │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │ │
│   │  │ Conversation    │  │ Timer           │  │ Interruption           │   │ │
│   │  │ Orchestrator    │◄─┤ Manager         │◄─┤ Handler                │   │ │
│   │  │                 │  │ (0.5s/1.5s/2.0s)│  │                        │   │ │
│   │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘   │ │
│   │           │                                                               │ │
│   └───────────┼───────────────────────────────────────────────────────────────┘ │
│               │                                                                  │
│               ▼                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │                       VOICE PIPELINE                                       │ │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │ │
│   │  │ Audio Engine    │  │ Speech          │  │ TTS                     │   │ │
│   │  │ Manager         │─►│ Recognition     │  │ Playback                │   │ │
│   │  │ (AVAudioEngine) │  │ (SFSpeech)      │  │ Service                 │   │ │
│   │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘   │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │                       INTELLIGENCE LAYER                                   │ │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │ │
│   │  │ Agent           │  │ LLM             │  │ RAG                     │   │ │
│   │  │ Coordinator     │─►│ Provider        │  │ Service                 │   │ │
│   │  │                 │  │ (Local/Cloud)   │  │ (Vector Search)         │   │ │
│   │  │ ┌─────────────┐ │  └─────────────────┘  └─────────────────────────┘   │ │
│   │  │ │Conversation │ │                                                      │ │
│   │  │ │Agent        │ │                                                      │ │
│   │  │ ├─────────────┤ │                                                      │ │
│   │  │ │Bubble       │ │                                                      │ │
│   │  │ │Agent        │ │                                                      │ │
│   │  │ ├─────────────┤ │                                                      │ │
│   │  │ │Artifact     │ │                                                      │ │
│   │  │ │Agent        │ │                                                      │ │
│   │  │ └─────────────┘ │                                                      │ │
│   │  └─────────────────┘                                                      │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │                       DATA LAYER                                           │ │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │ │
│   │  │ Conversation    │  │ Vector          │  │ Artifact                │   │ │
│   │  │ Storage         │  │ Index           │  │ Storage                 │   │ │
│   │  │ (ObjectBox)     │  │ (HNSW)          │  │ (JSON Files)            │   │ │
│   │  └─────────────────┘  └─────────────────┘  └─────────────────────────┘   │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Core Technologies

| Component | Technology | Version | Notes |
|-----------|------------|---------|-------|
| **Language** | Swift | 6.0+ | Primary language |
| **UI Framework** | SwiftUI | macOS 15+ | Declarative UI |
| **Platform** | macOS | 15.0+ (Sequoia) | Apple Silicon only |
| **Audio** | AVFoundation | System | Audio capture/playback |
| **Speech** | Speech Framework | System | SFSpeechRecognizer |
| **Async** | Swift Concurrency | 6.0 | async/await, actors |

### 2.2 Dependencies

| Dependency | Purpose | Source | Version |
|------------|---------|--------|---------|
| **MLX Swift** | Local LLM inference | Apple GitHub | 0.20.0+ |
| **MLX Swift Examples** | LLMX, Embedders | Apple GitHub | main |
| **ObjectBox Swift** | Vector database | ObjectBox | 4.0.0+ |
| **HotKey** | Global keyboard shortcuts | soffes/HotKey | 0.2.0+ |
| **OpenAI Swift** | Cloud LLM API | MacPaw | 0.3.0+ |
| **AnthropicSwiftSDK** | Cloud LLM API | Community | 1.0.0+ |

### 2.3 Package.swift

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BubbleVoiceMac",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "BubbleVoiceMac", targets: ["BubbleVoiceMac"])
    ],
    dependencies: [
        // Apple MLX for local inference
        .package(url: "https://github.com/ml-explore/mlx-swift.git", from: "0.20.0"),
        .package(url: "https://github.com/ml-explore/mlx-swift-examples.git", branch: "main"),
        
        // Vector database
        .package(url: "https://github.com/objectbox/objectbox-swift.git", from: "4.0.0"),
        
        // Global hotkeys
        .package(url: "https://github.com/soffes/HotKey.git", from: "0.2.0"),
        
        // Cloud LLM providers
        .package(url: "https://github.com/MacPaw/OpenAI.git", from: "0.3.0"),
    ],
    targets: [
        .executableTarget(
            name: "BubbleVoiceMac",
            dependencies: [
                .product(name: "MLX", package: "mlx-swift"),
                .product(name: "MLXLLM", package: "mlx-swift-examples"),
                .product(name: "MLXEmbedders", package: "mlx-swift-examples"),
                .product(name: "ObjectBox", package: "objectbox-swift"),
                .product(name: "HotKey", package: "HotKey"),
                .product(name: "OpenAI", package: "OpenAI"),
            ],
            path: "Sources/BubbleVoiceMac"
        ),
        .testTarget(
            name: "BubbleVoiceMacTests",
            dependencies: ["BubbleVoiceMac"],
            path: "Tests/BubbleVoiceMacTests"
        ),
    ]
)
```

---

## 3. Project Structure

```
BubbleVoiceMac/
├── Sources/
│   └── BubbleVoiceMac/
│       ├── App/
│       │   ├── BubbleVoiceMacApp.swift          # @main entry point
│       │   ├── AppDelegate.swift                 # Menu bar, hotkeys, lifecycle
│       │   └── AppState.swift                    # Global observable state
│       │
│       ├── Core/
│       │   ├── Audio/
│       │   │   ├── AudioEngineManager.swift      # AVAudioEngine setup
│       │   │   ├── AudioPlaybackService.swift    # TTS audio playback
│       │   │   └── AudioBufferProcessor.swift    # Buffer handling
│       │   │
│       │   ├── Speech/
│       │   │   ├── SpeechRecognitionService.swift    # SFSpeechRecognizer wrapper
│       │   │   ├── WakeWordDetector.swift            # "Hey Turtle" detection
│       │   │   └── VoiceCommandParser.swift          # Command interpretation
│       │   │
│       │   ├── Conversation/
│       │   │   ├── ConversationOrchestrator.swift    # Main coordinator
│       │   │   ├── TimerManager.swift                # Three-timer system
│       │   │   ├── InterruptionHandler.swift         # Voice interruption
│       │   │   ├── ConversationState.swift           # State machine
│       │   │   └── TurnDetector.swift                # Silence detection
│       │   │
│       │   ├── LLM/
│       │   │   ├── LLMProviderProtocol.swift         # Abstract interface
│       │   │   ├── LocalMLXProvider.swift            # MLX Swift local
│       │   │   ├── OpenAIProvider.swift              # Cloud fallback
│       │   │   ├── AnthropicProvider.swift           # Cloud fallback
│       │   │   └── LLMRouter.swift                   # Provider selection
│       │   │
│       │   ├── TTS/
│       │   │   ├── TTSProviderProtocol.swift         # Abstract interface
│       │   │   ├── MacOSTTSProvider.swift            # NSSpeechSynthesizer
│       │   │   ├── CloudTTSProvider.swift            # ElevenLabs/PlayHT
│       │   │   └── TTSCacheManager.swift             # Audio caching
│       │   │
│       │   └── RAG/
│       │       ├── EmbeddingService.swift            # MLX embeddings
│       │       ├── VectorStoreService.swift          # ObjectBox HNSW
│       │       ├── ChunkingService.swift             # Text preprocessing
│       │       ├── RAGRetrievalService.swift         # Search orchestration
│       │       └── ContextBuilder.swift              # Prompt assembly
│       │
│       ├── Agents/
│       │   ├── AgentCoordinator.swift                # Agent orchestration
│       │   ├── ConversationAgent.swift               # Main response generation
│       │   ├── BubbleAgent.swift                     # Bubble generation
│       │   ├── ArtifactAgent.swift                   # Artifact generation
│       │   └── IntentClassifier.swift                # Input routing
│       │
│       ├── Artifacts/
│       │   ├── ArtifactTypes/
│       │   │   ├── Artifact.swift                    # Base protocol/enum
│       │   │   ├── ProgressChartArtifact.swift       # Progress tracking
│       │   │   ├── DataTableArtifact.swift           # Tabular data
│       │   │   ├── ComparisonCardArtifact.swift      # Pros/cons
│       │   │   ├── ChecklistArtifact.swift           # Action items
│       │   │   ├── TimelineArtifact.swift            # Project timeline
│       │   │   └── ImageArtifact.swift               # Generated images
│       │   │
│       │   ├── ArtifactManager.swift                 # CRUD, versioning
│       │   ├── ArtifactPatcher.swift                 # JSON patch operations
│       │   └── ArtifactValidator.swift               # Schema validation
│       │
│       ├── Features/
│       │   ├── Conversation/
│       │   │   ├── ConversationView.swift            # Main conversation UI
│       │   │   ├── TranscriptView.swift              # Message display
│       │   │   ├── EditableSpeechInput.swift         # Editable text field
│       │   │   ├── BubbleDisplayView.swift           # Bubble rendering
│       │   │   └── WaveformView.swift                # Audio visualization
│       │   │
│       │   ├── History/
│       │   │   ├── HistoryListView.swift             # Conversation list
│       │   │   ├── HistoryItemView.swift             # Single item
│       │   │   └── HistorySearchView.swift           # Search UI
│       │   │
│       │   ├── Artifacts/
│       │   │   ├── ArtifactViewerView.swift          # Main viewer
│       │   │   ├── ArtifactTabBar.swift              # Tab switching
│       │   │   └── ArtifactRenderers/
│       │   │       ├── ProgressChartView.swift       # Chart rendering
│       │   │       ├── DataTableView.swift           # Table rendering
│       │   │       ├── ComparisonCardView.swift      # Pros/cons rendering
│       │   │       ├── ChecklistView.swift           # Checklist rendering
│       │   │       └── TimelineView.swift            # Timeline rendering
│       │   │
│       │   └── Settings/
│       │       ├── SettingsView.swift                # Main settings
│       │       ├── LLMSettingsView.swift             # Model selection
│       │       ├── VoiceSettingsView.swift           # TTS settings
│       │       ├── MemorySettingsView.swift          # RAG settings
│       │       └── APIKeySettingsView.swift          # Key management
│       │
│       ├── UI/
│       │   ├── Components/
│       │   │   ├── StatusBarIconView.swift           # Menu bar icon
│       │   │   ├── FloatingWindowController.swift    # Window management
│       │   │   ├── MenuBarPopover.swift              # Quick actions
│       │   │   └── GlassButton.swift                 # Liquid glass style
│       │   │
│       │   └── Design/
│       │       ├── ColorTokens.swift                 # Color constants
│       │       ├── Typography.swift                  # Font styles
│       │       └── Spacing.swift                     # Layout constants
│       │
│       ├── Services/
│       │   ├── KeychainService.swift                 # Secure storage
│       │   ├── UserDefaultsService.swift             # Preferences
│       │   └── LoggingService.swift                  # OSLog wrapper
│       │
│       └── Models/
│           ├── Message.swift                         # Chat message
│           ├── Conversation.swift                    # Conversation entity
│           ├── Bubble.swift                          # Bubble model
│           ├── TranscriptEntry.swift                 # Transcript item
│           └── UserProfile.swift                     # User preferences
│
├── Tests/
│   └── BubbleVoiceMacTests/
│       ├── Core/
│       │   ├── TimerManagerTests.swift
│       │   ├── InterruptionHandlerTests.swift
│       │   └── RAGRetrievalTests.swift
│       │
│       ├── Agents/
│       │   ├── AgentCoordinatorTests.swift
│       │   └── IntentClassifierTests.swift
│       │
│       └── Artifacts/
│           ├── ArtifactPatcherTests.swift
│           └── ArtifactValidatorTests.swift
│
├── Resources/
│   ├── Assets.xcassets/                              # App icons, images
│   ├── Info.plist                                    # App configuration
│   └── BubbleVoiceMac.entitlements                   # Permissions
│
└── Documentation/
    ├── PRD_BUBBLEVOICE_MAC.md                        # Product requirements
    ├── TECHNICAL_SPEC_BUBBLEVOICE_MAC.md             # This document
    └── API_REFERENCE.md                              # Internal API docs
```

---

## 4. Core Component Specifications

### 4.1 Voice Pipeline

#### 4.1.1 AudioEngineManager

**Purpose:** Manages AVAudioEngine for audio capture and playback.

**Interface:**

```swift
/// Manages the AVAudioEngine for microphone input and audio output
///
/// This is the foundation of the voice pipeline. It handles:
/// - Microphone capture with configurable sample rate
/// - Audio buffer processing for speech recognition
/// - TTS audio playback through player node
/// - Session management for audio hardware
///
/// Architecture Notes:
/// - Uses AVAudioEngine (not AVAudioSession) for macOS
/// - Supports simultaneous input/output (full duplex)
/// - Buffers are 1024 samples for low latency
/// - Sample rate is 16kHz for speech recognition compatibility
///
/// Date: 2026-01-18
@MainActor
final class AudioEngineManager: ObservableObject {
    
    // MARK: - Published State
    
    /// Whether the audio engine is currently running
    @Published private(set) var isRunning = false
    
    /// Whether microphone input is active
    @Published private(set) var isCapturing = false
    
    /// Current audio level (0.0-1.0) for visualization
    @Published private(set) var audioLevel: Float = 0.0
    
    // MARK: - Audio Components
    
    private let audioEngine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private var inputNode: AVAudioInputNode { audioEngine.inputNode }
    private var outputNode: AVAudioOutputNode { audioEngine.outputNode }
    
    // MARK: - Configuration
    
    /// Audio format for speech recognition (16kHz mono)
    private let captureFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16000,
        channels: 1,
        interleaved: false
    )!
    
    /// Buffer size (1024 samples ≈ 64ms at 16kHz)
    private let bufferSize: AVAudioFrameCount = 1024
    
    // MARK: - Public Methods
    
    /// Start the audio engine and prepare for capture/playback
    func start() throws
    
    /// Stop the audio engine completely
    func stop()
    
    /// Begin capturing microphone input
    /// - Parameter handler: Called with each audio buffer
    func startCapture(handler: @escaping (AVAudioPCMBuffer, AVAudioTime) -> Void) throws
    
    /// Stop capturing microphone input
    func stopCapture()
    
    /// Play audio data through the speaker
    /// - Parameters:
    ///   - data: Audio data (PCM or compressed)
    ///   - format: Audio format of the data
    ///   - completion: Called when playback completes
    func play(data: Data, format: AVAudioFormat, completion: @escaping () -> Void)
    
    /// Stop current playback immediately
    /// Used for interruption handling - must be fast (<100ms)
    func stopPlayback()
}
```

**Implementation Notes:**
- Uses tap on inputNode for continuous capture
- Player node scheduled segments for TTS playback
- Audio level calculated via RMS of buffer samples
- Error recovery: auto-restart on engine failure

#### 4.1.2 SpeechRecognitionService

**Purpose:** Wraps SFSpeechRecognizer for continuous speech-to-text.

**Interface:**

```swift
/// Speech recognition service using Apple's Speech framework
///
/// Provides continuous speech recognition with:
/// - Partial results for real-time display
/// - Final results for processing
/// - Confidence scores for interruption detection
/// - On-device processing (privacy)
///
/// Architecture Notes:
/// - Uses SFSpeechRecognizer with on-device mode
/// - SpeechRecognitionTask is managed internally
/// - Supports macOS 15+ SpeechAnalyzer API when available
/// - Auto-restarts recognition on timeout (60s limit)
///
/// Known Limitations:
/// - 60 second recognition limit (Apple restriction)
/// - Must restart task periodically for long conversations
/// - On-device mode has lower accuracy than server
///
/// Date: 2026-01-18
final class SpeechRecognitionService: ObservableObject {
    
    // MARK: - Published State
    
    /// Current partial transcription (updates in real-time)
    @Published private(set) var partialTranscript: String = ""
    
    /// Most recent final transcription segment
    @Published private(set) var finalTranscript: String = ""
    
    /// Whether recognition is currently active
    @Published private(set) var isRecognizing = false
    
    /// Confidence of last recognized segment (0.0-1.0)
    @Published private(set) var confidence: Float = 0.0
    
    // MARK: - Delegate
    
    /// Callback for recognition results
    var onResult: ((SpeechRecognitionResult) -> Void)?
    
    // MARK: - Public Methods
    
    /// Request speech recognition authorization
    /// - Returns: Whether authorization was granted
    func requestAuthorization() async -> Bool
    
    /// Start speech recognition from audio buffer stream
    /// - Parameter audioBufferHandler: Provider of audio buffers
    func startRecognition(audioBufferHandler: @escaping () -> AVAudioPCMBuffer?) throws
    
    /// Stop speech recognition
    func stopRecognition()
    
    /// Feed an audio buffer to the recognizer
    /// - Parameter buffer: Audio buffer from AudioEngineManager
    func appendBuffer(_ buffer: AVAudioPCMBuffer)
}

/// Result from speech recognition
struct SpeechRecognitionResult {
    let text: String
    let isFinal: Bool
    let confidence: Float
    let timestamp: Date
    let segments: [SpeechSegment]
}

struct SpeechSegment {
    let text: String
    let confidence: Float
    let duration: TimeInterval
}
```

#### 4.1.3 TimerManager

**Purpose:** Implements the three-timer turn detection system from Accountability.

**Interface:**

```swift
/// Three-timer turn detection system
///
/// This is the CRITICAL component for natural conversation flow.
/// Ported directly from Accountability app where it was battle-tested.
///
/// Timer Sequence:
/// 1. User speaks → timers reset on each speech input
/// 2. Silence detected → timers start counting
/// 3. 0.5s silence → LLM processing begins (result cached)
/// 4. 1.5s silence → TTS generation begins (uses cached LLM result)
/// 5. 2.0s silence → Audio playback begins (uses cached TTS)
///
/// Why This Works:
/// - Speculative processing reduces perceived latency
/// - If user resumes speaking, timers reset and caches clear
/// - Results in natural "thinking pause" feeling
/// - Typical perceived latency: ~500ms (feels instant)
///
/// CRITICAL: Do not modify these timings without extensive user testing.
/// The 0.5s/1.5s/2.0s values were arrived at through iteration.
///
/// Date: 2026-01-18
@MainActor
final class TimerManager: ObservableObject {
    
    // MARK: - Timer Configuration
    
    /// Silence duration before starting LLM processing
    /// Shorter = faster response but may cut off user mid-thought
    static let llmTimerDelay: TimeInterval = 0.5
    
    /// Silence duration before starting TTS generation
    /// Must be > llmTimerDelay to use cached LLM result
    static let ttsTimerDelay: TimeInterval = 1.5
    
    /// Silence duration before playing audio
    /// Must be > ttsTimerDelay to use cached TTS result
    static let playTimerDelay: TimeInterval = 2.0
    
    // MARK: - Published State
    
    /// Cached LLM response text
    @Published var llmResult: String?
    
    /// Cached TTS audio data
    @Published var ttsResult: Data?
    
    /// Whether LLM timer has fired
    @Published var isLLMTimerFinished = false
    
    /// Whether TTS timer has fired
    @Published var isTTSTimerFinished = false
    
    /// Whether play timer has fired
    @Published var isPlayTimerFinished = false
    
    // MARK: - Timers
    
    private var llmTimer: Timer?
    private var ttsTimer: Timer?
    private var playTimer: Timer?
    
    // MARK: - Callbacks
    
    var onLLMTimerFired: (() -> Void)?
    var onTTSTimerFired: (() -> Void)?
    var onPlayTimerFired: (() -> Void)?
    
    // MARK: - Public Methods
    
    /// Reset all timers (called when user speaks)
    /// This is called on EVERY speech input to restart the sequence
    func resetTimers()
    
    /// Start the timer sequence (called when silence begins)
    func startTimers()
    
    /// Invalidate all timers without clearing caches
    func pauseTimers()
    
    /// Invalidate all timers AND clear all caches
    /// CRITICAL: Must be called on interruption
    func invalidateAndClearAll()
    
    /// Clear cached results only
    func clearCaches()
}
```

**Implementation:**

```swift
extension TimerManager {
    
    func resetTimers() {
        // Invalidate existing timers
        llmTimer?.invalidate()
        ttsTimer?.invalidate()
        playTimer?.invalidate()
        
        // Reset state
        isLLMTimerFinished = false
        isTTSTimerFinished = false
        isPlayTimerFinished = false
        
        // DO NOT clear caches here - user might still be building on previous thought
    }
    
    func startTimers() {
        // LLM timer - fires at 0.5s
        llmTimer = Timer.scheduledTimer(withTimeInterval: Self.llmTimerDelay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.isLLMTimerFinished = true
                self?.onLLMTimerFired?()
            }
        }
        
        // TTS timer - fires at 1.5s
        ttsTimer = Timer.scheduledTimer(withTimeInterval: Self.ttsTimerDelay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.isTTSTimerFinished = true
                self?.onTTSTimerFired?()
            }
        }
        
        // Play timer - fires at 2.0s
        playTimer = Timer.scheduledTimer(withTimeInterval: Self.playTimerDelay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.isPlayTimerFinished = true
                self?.onPlayTimerFired?()
            }
        }
    }
    
    func invalidateAndClearAll() {
        // Stop timers
        llmTimer?.invalidate()
        ttsTimer?.invalidate()
        playTimer?.invalidate()
        
        // Reset state
        isLLMTimerFinished = false
        isTTSTimerFinished = false
        isPlayTimerFinished = false
        
        // Clear ALL cached results
        // This is CRITICAL for interruption - stale responses must not play
        llmResult = nil
        ttsResult = nil
    }
}
```

---

### 4.2 Intelligence Layer

#### 4.2.1 AgentCoordinator

**Purpose:** Orchestrates multiple specialized agents for different tasks.

**Interface:**

```swift
/// Agent coordinator for BubbleVoice Mac
///
/// Orchestrates specialized agents for different aspects of response:
/// - ConversationAgent: Main response generation
/// - BubbleAgent: Afterthought bubble generation (parallel)
/// - ArtifactAgent: Visual artifact generation (conditional)
///
/// Architecture Decision:
/// We use a hybrid approach - custom coordination (not LangGraph/AgentScope)
/// because voice interaction has unique requirements:
/// - Real-time latency constraints
/// - Interruption handling integration
/// - Timer system integration
/// - Native SwiftUI output
///
/// The coordinator implements framework PATTERNS but not full frameworks.
///
/// Date: 2026-01-18
@MainActor
final class AgentCoordinator {
    
    // MARK: - Dependencies
    
    private let conversationAgent: ConversationAgent
    private let bubbleAgent: BubbleAgent
    private let artifactAgent: ArtifactAgent
    private let ragService: RAGRetrievalService
    private let intentClassifier: IntentClassifier
    
    // MARK: - State
    
    private var conversationState: ConversationState
    
    // MARK: - Configuration
    
    /// Whether to run bubble generation in parallel
    let parallelBubbles: Bool = true
    
    /// Maximum RAG chunks for automatic injection
    let autoRAGLimit: Int = 5
    
    /// Maximum RAG chunks for on-demand retrieval
    let expandedRAGLimit: Int = 20
    
    // MARK: - Public Methods
    
    /// Process user input and coordinate agent responses
    /// - Parameter input: User's transcribed speech
    /// - Returns: Coordinated response with text, bubbles, artifacts
    func processInput(_ input: String) async -> AgentResponse
    
    /// Reset processing state (for interruption)
    func resetProcessing()
    
    /// Update conversation state with message
    func addMessage(_ message: Message)
}

/// Coordinated response from all agents
struct AgentResponse {
    let text: String                    // Main response text (for TTS)
    let bubbles: [Bubble]?              // Afterthought bubbles
    let artifacts: [Artifact]?          // Generated artifacts
    let ragContext: [RAGChunk]?         // Retrieved context (for debugging)
    let processingTime: TimeInterval    // Total processing time
}
```

#### 4.2.2 RAGRetrievalService

**Purpose:** Manages vector search and context retrieval.

**Interface:**

```swift
/// RAG retrieval service for semantic memory
///
/// Implements two-tier retrieval strategy:
/// 1. Automatic: Every prompt gets 3-5 relevant chunks injected
/// 2. On-demand: Agent can request expanded retrieval (10-20 chunks)
///
/// Uses hybrid search combining:
/// - Dense vectors (semantic similarity)
/// - Sparse/keyword matching (exact terms)
/// - Reciprocal Rank Fusion for merging
///
/// Performance Targets (Apple Silicon M3):
/// - Single query: <15ms (P50)
/// - Multi-paragraph: <30ms
/// - 100k chunks indexed
///
/// Date: 2026-01-18
final class RAGRetrievalService {
    
    // MARK: - Dependencies
    
    private let embeddingService: EmbeddingService
    private let vectorStore: VectorStoreService
    
    // MARK: - Configuration
    
    /// HNSW parameters optimized for Apple Silicon
    struct HNSWConfig {
        static let M: Int = 24
        static let efConstruction: Int = 150
        static let efSearch: Int = 80
    }
    
    /// Default similarity threshold
    let defaultThreshold: Float = 0.7
    
    // MARK: - Public Methods
    
    /// Automatic context retrieval for every prompt
    /// - Parameters:
    ///   - query: User's input text
    ///   - limit: Maximum chunks to retrieve
    /// - Returns: Most relevant chunks
    func autoRetrieve(query: String, limit: Int = 5) async throws -> [RAGChunk]
    
    /// Expanded retrieval for specific memory queries
    /// - Parameters:
    ///   - query: Search query
    ///   - limit: Maximum chunks
    ///   - timeRange: Optional time filter
    /// - Returns: Relevant chunks with scores
    func expandedRetrieve(
        query: String, 
        limit: Int = 20, 
        timeRange: DateInterval? = nil
    ) async throws -> [RAGChunk]
    
    /// Multi-paragraph query (combines results)
    /// - Parameters:
    ///   - paragraphs: Multiple text segments to match
    ///   - limit: Maximum total results
    /// - Returns: Merged and deduplicated results
    func multiParagraphRetrieve(paragraphs: [String], limit: Int = 10) async throws -> [RAGChunk]
    
    /// Index a new conversation
    /// - Parameter conversation: Conversation to index
    func indexConversation(_ conversation: Conversation) async throws
    
    /// Remove conversation from index
    /// - Parameter conversationId: ID to remove
    func removeConversation(_ conversationId: String) async throws
}

/// Single retrieved chunk from vector search
struct RAGChunk: Identifiable {
    let id: String
    let text: String
    let conversationId: String
    let timestamp: Date
    let similarityScore: Float
    let metadata: [String: Any]?
}
```

---

### 4.3 Artifact System

#### 4.3.1 Artifact Types

**Base Protocol:**

```swift
/// Base protocol for all artifact types
///
/// Artifacts are JSON-serializable data structures that get rendered
/// by native SwiftUI components. The LLM generates the JSON data,
/// and the app renders it deterministically.
///
/// Why JSON → Native UI (not HTML):
/// - No layout hallucination from LLM
/// - Consistent with app design system
/// - Type-safe with validation
/// - Better performance (no WebView)
/// - Easier persistence and versioning
///
/// Date: 2026-01-18
protocol ArtifactProtocol: Codable, Identifiable, Equatable {
    var id: String { get }
    var type: ArtifactType { get }
    var title: String { get }
    var createdAt: Date { get }
    var updatedAt: Date { get }
    var version: Int { get }
}

/// Discriminated union of artifact types
enum ArtifactType: String, Codable {
    case progressChart
    case dataTable
    case comparisonCard
    case checklist
    case timeline
    case summaryCard
    case image
}

/// Type-erased artifact container
enum Artifact: Codable, Identifiable, Equatable {
    case progressChart(ProgressChartArtifact)
    case dataTable(DataTableArtifact)
    case comparisonCard(ComparisonCardArtifact)
    case checklist(ChecklistArtifact)
    case timeline(TimelineArtifact)
    case summaryCard(SummaryCardArtifact)
    case image(ImageArtifact)
    
    var id: String {
        switch self {
        case .progressChart(let a): return a.id
        case .dataTable(let a): return a.id
        case .comparisonCard(let a): return a.id
        case .checklist(let a): return a.id
        case .timeline(let a): return a.id
        case .summaryCard(let a): return a.id
        case .image(let a): return a.id
        }
    }
}
```

**Progress Chart:**

```swift
/// Progress chart artifact for goal/metric tracking
struct ProgressChartArtifact: ArtifactProtocol {
    let id: String
    let type: ArtifactType = .progressChart
    var title: String
    let createdAt: Date
    var updatedAt: Date
    var version: Int
    
    // Progress-specific fields
    var progress: Double           // 0.0 - 1.0
    var goal: String               // Description of goal
    var unit: String?              // e.g., "miles", "hours"
    var currentValue: Double?      // Current numeric value
    var targetValue: Double?       // Target numeric value
    var milestones: [Milestone]?   // Progress milestones
    var color: String?             // Hex color for theming
    
    struct Milestone: Codable, Equatable {
        let label: String
        let value: Double
        var completed: Bool
    }
}
```

**Comparison Card:**

```swift
/// Pros/cons comparison artifact for decision support
struct ComparisonCardArtifact: ArtifactProtocol {
    let id: String
    let type: ArtifactType = .comparisonCard
    var title: String
    let createdAt: Date
    var updatedAt: Date
    var version: Int
    
    // Comparison-specific fields
    var pros: [ComparisonItem]
    var cons: [ComparisonItem]
    var verdict: String?          // Optional recommendation
    var leftLabel: String?        // Custom label (default "Pros")
    var rightLabel: String?       // Custom label (default "Cons")
    
    struct ComparisonItem: Codable, Equatable, Identifiable {
        let id: String
        var text: String
        var weight: Double?       // 0.0-1.0 importance
        var note: String?         // Additional context
    }
}
```

#### 4.3.2 ArtifactManager

**Purpose:** Manages artifact CRUD operations and versioning.

**Interface:**

```swift
/// Artifact manager for CRUD and versioning
///
/// Handles artifact lifecycle:
/// - Creation from LLM JSON output
/// - Updates via JSON patches
/// - Version history for revert
/// - Persistence to disk
///
/// Versioning Strategy:
/// - Each update creates a new version
/// - Keep last 10 versions per artifact
/// - Automatic revert on validation failure
///
/// Date: 2026-01-18
@MainActor
final class ArtifactManager: ObservableObject {
    
    // MARK: - Published State
    
    /// All artifacts for current conversation
    @Published private(set) var artifacts: [Artifact] = []
    
    /// Currently selected artifact
    @Published var selectedArtifactId: String?
    
    // MARK: - Version History
    
    private var versionHistory: [String: [Artifact]] = [:]
    private let maxVersions = 10
    
    // MARK: - Public Methods
    
    /// Create a new artifact from JSON
    /// - Parameter json: JSON string from LLM
    /// - Returns: Created artifact
    func createArtifact(from json: String) throws -> Artifact
    
    /// Apply a JSON patch to an artifact
    /// - Parameters:
    ///   - artifactId: ID of artifact to update
    ///   - patches: Array of patch operations
    /// - Returns: Updated artifact
    func applyPatches(to artifactId: String, patches: [JSONPatch]) throws -> Artifact
    
    /// Revert artifact to previous version
    /// - Parameter artifactId: ID of artifact to revert
    /// - Returns: Reverted artifact, or nil if no history
    func revert(artifactId: String) -> Artifact?
    
    /// Delete an artifact
    /// - Parameter artifactId: ID to delete
    func delete(artifactId: String)
    
    /// Get artifact by ID
    /// - Parameter artifactId: ID to find
    /// - Returns: Artifact if found
    func get(artifactId: String) -> Artifact?
    
    /// Save all artifacts to disk
    func persist() throws
    
    /// Load artifacts from disk
    func load() throws
}

/// JSON Patch operation (RFC 6902)
struct JSONPatch: Codable {
    let op: PatchOperation
    let path: String
    let value: AnyCodable?
    
    enum PatchOperation: String, Codable {
        case add
        case remove
        case replace
        case move
        case copy
        case test
    }
}
```

---

## 5. Data Models

### 5.1 Conversation Model

```swift
/// Conversation entity stored in ObjectBox
///
/// Represents a single conversation session with all messages,
/// generated artifacts, and metadata.
///
/// Date: 2026-01-18
@Entity
final class Conversation: Identifiable, ObservableObject {
    
    // MARK: - ObjectBox Fields
    
    var id: Id = 0
    
    // MARK: - Identifiers
    
    @Unique var uuid: String = UUID().uuidString
    
    // MARK: - Content
    
    /// All messages in the conversation
    var messages: ToMany<Message> = ToMany()
    
    /// Title (auto-generated or user-set)
    @Published var title: String = "New Conversation"
    
    /// Summary for context compression
    @Published var summary: String?
    
    // MARK: - Metadata
    
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    
    /// Estimated token count for context management
    var tokenCount: Int = 0
    
    /// Whether conversation is archived
    var isArchived: Bool = false
    
    // MARK: - Relationships
    
    /// Artifacts generated in this conversation
    var artifactIds: [String] = []
    
    /// Bubbles saved by user
    var savedBubbles: [Bubble] = []
    
    // MARK: - Computed Properties
    
    var displayDate: String {
        // Format relative to now
    }
    
    var lastMessage: Message? {
        messages.sorted(by: { $0.timestamp < $1.timestamp }).last
    }
}
```

### 5.2 Message Model

```swift
/// Single message in a conversation
///
/// Date: 2026-01-18
@Entity
final class Message: Identifiable {
    
    var id: Id = 0
    
    @Unique var uuid: String = UUID().uuidString
    
    /// "user" or "assistant"
    var role: String = ""
    
    /// Message content
    var content: String = ""
    
    /// Timestamp
    var timestamp: Date = Date()
    
    /// Token count for context budgeting
    var tokenCount: Int = 0
    
    /// Audio data if this was voice input (for replay)
    var audioData: Data?
    
    /// Parent conversation
    var conversation: ToOne<Conversation> = ToOne()
}
```

### 5.3 Bubble Model

```swift
/// AI-generated afterthought bubble
///
/// Bubbles are short prompts (≤7 words) that surface during conversation
/// to prompt exploration of related topics.
///
/// Date: 2026-01-18
struct Bubble: Codable, Identifiable, Equatable {
    let id: String
    let text: String               // Max 7 words
    let type: BubbleType
    let confidence: Float          // 0.0-1.0
    let timestamp: Date
    let vectorContext: String?     // What memory triggered this
    
    enum BubbleType: String, Codable {
        case question               // "What about X?"
        case probe                  // "Tell me more about..."
        case memory                 // "You mentioned before..."
        case suggestion             // "Maybe consider..."
        case action                 // "Should we..."
    }
}
```

---

## 6. API Contracts

### 6.1 LLM Provider Protocol

```swift
/// Protocol for LLM providers (local and cloud)
///
/// Abstraction layer allowing seamless switching between:
/// - Local MLX inference
/// - OpenAI API
/// - Anthropic API
/// - Other providers
///
/// Date: 2026-01-18
protocol LLMProvider {
    
    /// Provider identifier
    var id: String { get }
    
    /// Display name
    var name: String { get }
    
    /// Whether provider is available
    var isAvailable: Bool { get }
    
    /// Generate a completion (non-streaming)
    /// - Parameters:
    ///   - prompt: Full prompt text
    ///   - maxTokens: Maximum tokens to generate
    ///   - temperature: Sampling temperature
    /// - Returns: Generated text
    func generate(
        prompt: String,
        maxTokens: Int,
        temperature: Double
    ) async throws -> String
    
    /// Generate a streaming completion
    /// - Parameters:
    ///   - prompt: Full prompt text
    ///   - maxTokens: Maximum tokens
    ///   - temperature: Sampling temperature
    /// - Returns: AsyncStream of tokens
    func generateStream(
        prompt: String,
        maxTokens: Int,
        temperature: Double
    ) -> AsyncThrowingStream<String, Error>
    
    /// Generate structured JSON output
    /// - Parameters:
    ///   - prompt: Full prompt text
    ///   - schema: JSON schema for validation
    ///   - maxTokens: Maximum tokens
    /// - Returns: JSON string conforming to schema
    func generateStructured(
        prompt: String,
        schema: JSONSchema,
        maxTokens: Int
    ) async throws -> String
}

/// JSON Schema definition for structured output
struct JSONSchema: Codable {
    let type: String
    let properties: [String: PropertySchema]
    let required: [String]?
    let definitions: [String: PropertySchema]?
}

struct PropertySchema: Codable {
    let type: String?
    let description: String?
    let enumValues: [String]?
    let items: PropertySchema?
    let ref: String?
    let properties: [String: PropertySchema]?
}
```

### 6.2 TTS Provider Protocol

```swift
/// Protocol for TTS providers
///
/// Supports:
/// - macOS NSSpeechSynthesizer
/// - Cloud TTS (ElevenLabs, PlayHT)
/// - Future: Local MLX TTS
///
/// Date: 2026-01-18
protocol TTSProvider {
    
    /// Provider identifier
    var id: String { get }
    
    /// Display name
    var name: String { get }
    
    /// Available voices
    var availableVoices: [TTSVoice] { get }
    
    /// Generate speech audio from text
    /// - Parameters:
    ///   - text: Text to synthesize
    ///   - voice: Voice to use
    ///   - speed: Speech rate (0.5-2.0, 1.0 = normal)
    /// - Returns: Audio data (PCM or compressed)
    func synthesize(
        text: String,
        voice: TTSVoice,
        speed: Double
    ) async throws -> TTSResult
    
    /// Generate streaming speech
    /// - Parameters:
    ///   - text: Text to synthesize
    ///   - voice: Voice to use
    /// - Returns: AsyncStream of audio chunks
    func synthesizeStream(
        text: String,
        voice: TTSVoice
    ) -> AsyncThrowingStream<Data, Error>
}

struct TTSVoice: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let language: String
    let gender: String?
    let preview: URL?
}

struct TTSResult {
    let audioData: Data
    let format: AVAudioFormat
    let duration: TimeInterval
}
```

---

## 7. Error Handling

### 7.1 Error Types

```swift
/// BubbleVoice error types
///
/// Organized by domain for clear error handling.
///
/// Date: 2026-01-18
enum BubbleVoiceError: Error, LocalizedError {
    
    // MARK: - Audio Errors
    case audioEngineStartFailed(underlying: Error)
    case microphoneNotAvailable
    case audioPlaybackFailed(underlying: Error)
    
    // MARK: - Speech Errors
    case speechRecognitionNotAuthorized
    case speechRecognitionFailed(underlying: Error)
    case speechRecognitionTimeout
    
    // MARK: - LLM Errors
    case llmProviderNotAvailable(provider: String)
    case llmGenerationFailed(underlying: Error)
    case llmTimeout
    case llmRateLimited(retryAfter: TimeInterval)
    case llmInvalidResponse
    
    // MARK: - TTS Errors
    case ttsProviderNotAvailable(provider: String)
    case ttsSynthesisFailed(underlying: Error)
    case ttsTimeout
    
    // MARK: - RAG Errors
    case ragIndexingFailed(underlying: Error)
    case ragQueryFailed(underlying: Error)
    case ragEmbeddingFailed(underlying: Error)
    
    // MARK: - Artifact Errors
    case artifactValidationFailed(reason: String)
    case artifactPatchFailed(reason: String)
    case artifactNotFound(id: String)
    
    // MARK: - Storage Errors
    case storageFailed(underlying: Error)
    case dataCorrupted(reason: String)
    
    var errorDescription: String? {
        switch self {
        case .audioEngineStartFailed(let error):
            return "Failed to start audio engine: \(error.localizedDescription)"
        case .microphoneNotAvailable:
            return "Microphone not available. Please check System Preferences."
        // ... etc
        }
    }
    
    var recoverySuggestion: String? {
        switch self {
        case .speechRecognitionNotAuthorized:
            return "Go to System Preferences > Privacy & Security > Speech Recognition"
        // ... etc
        }
    }
}
```

### 7.2 Error Recovery Strategy

| Error Type | Recovery Action | User Notification |
|------------|-----------------|-------------------|
| Audio engine failure | Auto-restart engine | Toast notification |
| Speech timeout | Restart recognition task | None (seamless) |
| LLM timeout | Retry with fallback provider | "Trying again..." |
| LLM rate limit | Queue and retry | "Please wait..." |
| TTS failure | Use backup voice | None (use fallback) |
| RAG query failure | Continue without context | None |
| Artifact validation | Revert to previous version | "Couldn't update, reverted" |

---

## 8. Security Considerations

### 8.1 Data Storage

| Data Type | Storage Location | Encryption |
|-----------|------------------|------------|
| Conversations | ObjectBox (App Container) | At-rest via FileVault |
| API Keys | Keychain | Keychain encryption |
| Vector Index | App Container | At-rest via FileVault |
| Audio Cache | Temp directory | None (ephemeral) |
| User Preferences | UserDefaults | None (non-sensitive) |

### 8.2 Privacy

- **On-device processing:** Speech recognition uses on-device mode
- **No telemetry:** No usage data sent to external servers
- **Local RAG:** All conversation memory stored locally
- **Cloud LLM opt-in:** User must explicitly enable cloud providers
- **API key protection:** Keys stored in Keychain, never logged

### 8.3 Entitlements

```xml
<!-- BubbleVoiceMac.entitlements -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Sandbox -->
    <key>com.apple.security.app-sandbox</key>
    <true/>
    
    <!-- Microphone for voice input -->
    <key>com.apple.security.device.audio-input</key>
    <true/>
    
    <!-- Speech recognition -->
    <key>com.apple.security.personal-information.speech-recognition</key>
    <true/>
    
    <!-- Network for cloud LLM/TTS -->
    <key>com.apple.security.network.client</key>
    <true/>
    
    <!-- Metal for MLX inference -->
    <key>com.apple.security.device.metal</key>
    <true/>
    
    <!-- File access for model downloads -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

---

## 9. Performance Requirements

### 9.1 Latency Budgets

| Operation | Target P50 | Target P95 | Maximum |
|-----------|-----------|-----------|---------|
| Speech-to-display | 50ms | 100ms | 200ms |
| Turn detection (timer fire) | N/A | N/A | Exactly as configured |
| RAG query | 10ms | 20ms | 50ms |
| LLM first token (local) | 200ms | 400ms | 1000ms |
| LLM first token (cloud) | 300ms | 600ms | 1500ms |
| TTS first byte | 100ms | 200ms | 500ms |
| Artifact render | 16ms | 32ms | 100ms |

### 9.2 Memory Budgets

| Component | Target | Maximum | Notes |
|-----------|--------|---------|-------|
| Base app | 200MB | 500MB | Without models |
| Local LLM (7B) | 4GB | 6GB | 4-bit quantized |
| Local LLM (3B) | 2GB | 3GB | 4-bit quantized |
| Vector index (100k) | 300MB | 500MB | HNSW with 768D |
| Embedding model | 500MB | 1GB | MLX embeddings |
| Audio buffers | 50MB | 100MB | Recording + playback |
| **Total (7B local)** | 5GB | 8GB | |
| **Total (cloud-only)** | 1GB | 2GB | |

### 9.3 Battery & Thermal

- **Idle (menu bar only):** <1% CPU, minimal battery impact
- **Active conversation:** <30% CPU (mostly LLM inference)
- **Local LLM inference:** Uses Neural Engine when possible
- **Audio capture:** Efficient (~2% CPU)
- **Background:** No activity when not in conversation

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Component | Coverage Target | Focus Areas |
|-----------|-----------------|-------------|
| TimerManager | 95% | Timer sequencing, cancellation |
| InterruptionHandler | 90% | State transitions, cache clearing |
| ArtifactPatcher | 95% | Patch operations, validation |
| IntentClassifier | 80% | Classification accuracy |
| ChunkingService | 85% | Boundary detection, overlap |

### 10.2 Integration Tests

| Flow | Test Cases |
|------|------------|
| Voice-to-response | Speech → LLM → TTS → Playback |
| Interruption | Mid-response interruption handling |
| RAG retrieval | Query → Embed → Search → Inject |
| Artifact generation | Intent → JSON → Render → Display |
| Conversation persistence | Create → Update → Load |

### 10.3 Performance Tests

| Test | Measurement | Pass Criteria |
|------|-------------|---------------|
| RAG query latency | P95 latency | <20ms |
| LLM streaming | Time to first token | <500ms |
| Memory under load | Peak memory | <8GB |
| Audio latency | Input → Output | <100ms |
| UI responsiveness | Frame rate | 60fps |

### 10.4 User Acceptance Tests

| Scenario | Success Criteria |
|----------|------------------|
| Natural conversation | Feels like talking to a person |
| Turn detection | No cutting off, no awkward pauses |
| Interruption | AI stops within 100ms |
| Memory recall | Correctly recalls past conversations |
| Artifact creation | Useful, correctly formatted output |

---

## 11. Deployment

### 11.1 Build Configuration

```
Scheme: BubbleVoiceMac
Configuration: Release
Architecture: arm64 (Apple Silicon only)
Deployment Target: macOS 15.0
Code Signing: Developer ID Application
Notarization: Required for distribution
```

### 11.2 Distribution

**Method:** Direct download (DMG installer)

**Rationale:**
- Avoids App Store review delays
- Allows use of private APIs if needed
- Simpler update process
- No 30% App Store cut

**Process:**
1. Build with Release configuration
2. Code sign with Developer ID
3. Notarize with Apple
4. Create DMG installer
5. Upload to distribution server

### 11.3 Updates

**Method:** Sparkle framework (automatic updates)

```swift
// Sparkle configuration
let updater = SPUStandardUpdaterController(
    startingUpdater: true,
    updaterDelegate: nil,
    userDriverDelegate: nil
)

// Appcast URL
let appcastURL = URL(string: "https://bubblevoice.app/appcast.xml")!
```

---

## 12. Monitoring & Observability

### 12.1 Logging

```swift
import OSLog

extension Logger {
    static let audio = Logger(subsystem: "com.bubblevoice.mac", category: "audio")
    static let speech = Logger(subsystem: "com.bubblevoice.mac", category: "speech")
    static let llm = Logger(subsystem: "com.bubblevoice.mac", category: "llm")
    static let rag = Logger(subsystem: "com.bubblevoice.mac", category: "rag")
    static let agent = Logger(subsystem: "com.bubblevoice.mac", category: "agent")
    static let artifact = Logger(subsystem: "com.bubblevoice.mac", category: "artifact")
}

// Usage
Logger.llm.info("LLM generation started", metadata: ["provider": provider.id])
Logger.llm.error("LLM generation failed", metadata: ["error": error.localizedDescription])
```

### 12.2 Metrics (Local Only)

```swift
/// Local metrics collection for debugging
/// No data leaves the device
struct MetricsCollector {
    
    func recordLatency(_ operation: String, duration: TimeInterval)
    func recordCount(_ event: String)
    func recordGauge(_ name: String, value: Double)
    
    // Export for debugging
    func exportReport() -> String
}

// Tracked metrics
// - llm_latency_seconds
// - tts_latency_seconds
// - rag_query_latency_seconds
// - conversation_count
// - artifact_count
// - interruption_count
// - error_count_by_type
```

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Artifact** | Persistent visual output generated from conversation (JSON → SwiftUI) |
| **Bubble** | Short AI-generated afterthought (≤7 words) shown during conversation |
| **HNSW** | Hierarchical Navigable Small World graph - vector search algorithm |
| **MLX** | Apple's ML framework optimized for Apple Silicon |
| **RAG** | Retrieval-Augmented Generation - using past data to inform responses |
| **Timer System** | Three-timer (0.5s/1.5s/2.0s) approach for turn detection |
| **Turn Detection** | Determining when user has finished speaking |

---

## 14. References

### Internal Documents
- PRD_BUBBLEVOICE_MAC.md - Product requirements
- VISION_INTERPRETATION.md - Original vision
- ARCHITECTURE_ANALYSIS_MAC.md - Initial architecture
- VECTOR_SEARCH_AND_AGENTIC_ARCHITECTURE.md - RAG and agent design

### External References
- [MLX Swift Documentation](https://github.com/ml-explore/mlx-swift)
- [ObjectBox Swift](https://objectbox.io/swift-ios-on-device-vector-database)
- [Apple Speech Framework](https://developer.apple.com/documentation/speech)
- [AVAudioEngine](https://developer.apple.com/documentation/avfaudio/avaudioengine)

---

**Document History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-18 | AI Engineering | Initial draft |

---

**End of Technical Specification**