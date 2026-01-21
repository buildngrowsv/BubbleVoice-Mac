# Bubble Voice Mac - Project Setup Guide

**Created:** 2026-01-15  
**Purpose:** Step-by-step guide to setting up the BubbleVoice-Mac Xcode project.

---

## 📋 Prerequisites

### Hardware
- Apple Silicon Mac (M1 or later) - required for MLX
- 16 GB RAM recommended (8 GB minimum)
- macOS 15+ (Sequoia) for latest SwiftUI features

### Software
- Xcode 16+
- Swift 6.0+
- Homebrew (for dependencies)

---

## 🚀 Quick Start

### 1. Create Xcode Project

```bash
# Navigate to folder
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# Create Xcode project via Xcode:
# File → New → Project → macOS → App
# Product Name: BubbleVoiceMac
# Team: Your Team
# Bundle Identifier: com.yourname.bubblevoice.mac
# Interface: SwiftUI
# Language: Swift
# Storage: None (we'll add Core Data/ObjectBox manually)
# Include Tests: Yes
```

### 2. Configure Project Settings

In Xcode, set these project settings:

**Deployment Target:**
- macOS 15.0 (for Liquid Glass, SpeechAnalyzer)

**Signing & Capabilities:**
- [x] App Sandbox
- [x] Hardened Runtime
- [x] Audio Input (Microphone)
- [x] Outgoing Connections (Client)
- [x] Incoming Connections (Server) - for local model server
- [x] Speech Recognition

**Info.plist additions:**

```xml
<!-- Microphone usage -->
<key>NSMicrophoneUsageDescription</key>
<string>Bubble Voice needs microphone access to hear your voice commands</string>

<!-- Speech recognition -->
<key>NSSpeechRecognitionUsageDescription</key>
<string>Bubble Voice uses speech recognition to understand your voice</string>

<!-- Network for model downloads -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### 3. Add Package Dependencies

File → Add Package Dependencies:

| Package | URL | Version |
|---------|-----|---------|
| MLX Swift | `https://github.com/ml-explore/mlx-swift.git` | 0.20.0+ |
| MLX Swift Examples | `https://github.com/ml-explore/mlx-swift-examples.git` | main |
| ObjectBox Swift | `https://github.com/objectbox/objectbox-swift.git` | 4.0.0+ |
| HotKey | `https://github.com/soffes/HotKey.git` | 0.2.0+ |

**Or via Package.swift:**

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "BubbleVoiceMac",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "BubbleVoiceMac", targets: ["BubbleVoiceMac"])
    ],
    dependencies: [
        .package(url: "https://github.com/ml-explore/mlx-swift.git", from: "0.20.0"),
        .package(url: "https://github.com/ml-explore/mlx-swift-examples.git", branch: "main"),
        .package(url: "https://github.com/objectbox/objectbox-swift.git", from: "4.0.0"),
        .package(url: "https://github.com/soffes/HotKey.git", from: "0.2.0"),
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
            ]
        ),
        .testTarget(
            name: "BubbleVoiceMacTests",
            dependencies: ["BubbleVoiceMac"]
        ),
    ]
)
```

### 4. Create Project Structure

```bash
mkdir -p BubbleVoiceMac/{App,Core/{Audio,Conversation,LLM,TTS,RAG},Features/{Conversation,History,Settings},UI/{Components,Design},Services/{APIClient,Storage},Models}
```

Resulting structure:
```
BubbleVoiceMac/
├── App/
│   ├── BubbleVoiceMacApp.swift
│   ├── AppDelegate.swift
│   └── AppState.swift
├── Core/
│   ├── Audio/
│   ├── Conversation/
│   ├── LLM/
│   ├── TTS/
│   └── RAG/
├── Features/
│   ├── Conversation/
│   ├── History/
│   └── Settings/
├── UI/
│   ├── Components/
│   └── Design/
├── Services/
│   ├── APIClient/
│   └── Storage/
└── Models/
```

---

## 🔧 Initial App Files

### BubbleVoiceMacApp.swift

```swift
import SwiftUI
import HotKey

/// Main app entry point for Bubble Voice Mac
/// Uses menu bar + floating window pattern common for voice assistants
///
/// Architecture:
/// - Menu bar icon for status and quick access
/// - Floating conversation window (always on top when active)
/// - Global hotkey (Cmd+Shift+Space) for quick activation
/// - Settings accessible from menu bar and dock
///
/// Date: 2026-01-15
@main
struct BubbleVoiceMacApp: App {
    
    // App delegate handles menu bar and global shortcuts
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    // Global app state
    @StateObject private var appState = AppState.shared
    
    var body: some Scene {
        // Main conversation window - floating, compact
        WindowGroup("Bubble Voice", id: "conversation") {
            ConversationWindowView()
                .environmentObject(appState)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultSize(width: 380, height: 500)
        .defaultPosition(.topTrailing)
        .windowLevel(.floating)
        
        // Settings window
        Settings {
            SettingsView()
                .environmentObject(appState)
        }
        
        // Menu bar extra with popover
        MenuBarExtra {
            MenuBarPopover()
                .environmentObject(appState)
        } label: {
            Image(systemName: appState.isListening ? "waveform.circle.fill" : "waveform.circle")
                .symbolRenderingMode(.hierarchical)
        }
        .menuBarExtraStyle(.window)
    }
}
```

### AppDelegate.swift

```swift
import AppKit
import HotKey

/// App delegate for Bubble Voice Mac
/// Handles menu bar status item and global hotkey registration
///
/// Responsibilities:
/// - Global hotkey (Cmd+Shift+Space) to toggle conversation
/// - Status item updates (listening state)
/// - App lifecycle events
///
/// Date: 2026-01-15
class AppDelegate: NSObject, NSApplicationDelegate {
    
    // MARK: - Properties
    
    /// Global hotkey for toggling conversation
    private var hotKey: HotKey?
    
    // MARK: - Lifecycle
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        setupGlobalHotkey()
        setupMenuBarBehavior()
        
        // Initialize services in background
        Task {
            await AppState.shared.initialize()
        }
        
        print("✅ Bubble Voice Mac launched")
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        // Cleanup
        hotKey = nil
    }
    
    // MARK: - Setup
    
    /// Register Cmd+Shift+Space as global hotkey
    /// This allows activation from anywhere on the system
    private func setupGlobalHotkey() {
        hotKey = HotKey(key: .space, modifiers: [.command, .shift])
        
        hotKey?.keyDownHandler = { [weak self] in
            self?.toggleConversationWindow()
        }
        
        print("⌨️ Global hotkey registered: Cmd+Shift+Space")
    }
    
    /// Configure app to stay in menu bar even when window closed
    private func setupMenuBarBehavior() {
        // Keep app running when window closed (menu bar app behavior)
        NSApp.setActivationPolicy(.accessory)
    }
    
    // MARK: - Actions
    
    /// Toggle the main conversation window visibility
    @objc func toggleConversationWindow() {
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == "conversation" }) {
            if window.isVisible {
                window.orderOut(nil)
            } else {
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
        } else {
            // Open new window if none exists
            NSWorkspace.shared.open(URL(string: "bubblevoice://conversation")!)
        }
    }
}
```

### AppState.swift

```swift
import SwiftUI
import Combine

/// Global application state for Bubble Voice Mac
/// Single source of truth for app-wide settings and status
///
/// Observable properties trigger UI updates automatically
/// Persists user preferences to UserDefaults
///
/// Date: 2026-01-15
@MainActor
class AppState: ObservableObject {
    
    // MARK: - Singleton
    
    static let shared = AppState()
    
    // MARK: - Published State
    
    /// Whether the app is currently listening for speech
    @Published var isListening = false
    
    /// Whether the assistant is currently speaking
    @Published var isSpeaking = false
    
    /// Current conversation transcript
    @Published var transcript: [TranscriptMessage] = []
    
    /// Initialization status
    @Published var isInitialized = false
    
    /// Error message if any
    @Published var errorMessage: String?
    
    // MARK: - Settings (Persisted)
    
    @AppStorage("preferLocalLLM") var preferLocalLLM = true
    @AppStorage("selectedLLMModel") var selectedLLMModel = "mlx-community/Llama-3.2-3B-Instruct-4bit"
    @AppStorage("selectedTTSVoice") var selectedTTSVoice = "samantha"
    @AppStorage("enableRAG") var enableRAG = true
    
    // MARK: - Services
    
    private(set) var llmManager: LLMManager?
    private(set) var ragService: RAGService?
    
    // MARK: - Initialization
    
    private init() {}
    
    /// Initialize all services
    /// Call once at app startup
    func initialize() async {
        print("🚀 Initializing Bubble Voice...")
        
        do {
            // Initialize LLM
            llmManager = LLMManager()
            await llmManager?.setup(localModelId: selectedLLMModel)
            
            // Initialize RAG
            if enableRAG {
                ragService = RAGService()
                try await ragService?.setup()
            }
            
            isInitialized = true
            print("✅ Initialization complete")
            
        } catch {
            errorMessage = "Failed to initialize: \(error.localizedDescription)"
            print("❌ Initialization failed: \(error)")
        }
    }
}

/// Single message in the conversation transcript
struct TranscriptMessage: Identifiable {
    let id = UUID()
    let role: String  // "user" or "assistant"
    let content: String
    let timestamp: Date
}
```

---

## 📝 Entitlements

Create `BubbleVoiceMac.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- App Sandbox required for App Store -->
    <key>com.apple.security.app-sandbox</key>
    <true/>
    
    <!-- Microphone access for voice input -->
    <key>com.apple.security.device.audio-input</key>
    <true/>
    
    <!-- Speech recognition -->
    <key>com.apple.security.personal-information.speech-recognition</key>
    <true/>
    
    <!-- Network for model downloads and cloud fallback -->
    <key>com.apple.security.network.client</key>
    <true/>
    
    <!-- Local server for potential model serving -->
    <key>com.apple.security.network.server</key>
    <true/>
    
    <!-- Metal GPU access for MLX -->
    <key>com.apple.security.device.metal</key>
    <true/>
    
    <!-- Read/write to app's container -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

---

## 🧪 Verify Setup

### Build Test

```bash
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# If using SPM
swift build

# If using Xcode
xcodebuild -scheme BubbleVoiceMac -configuration Debug build
```

### Run Test

1. Open project in Xcode
2. Select "My Mac" as destination
3. Press Cmd+R to build and run
4. Verify:
   - Menu bar icon appears
   - Cmd+Shift+Space shows/hides window
   - No sandbox errors in console

---

## 📁 Git Setup

```bash
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# Initialize git if not already
git init

# Add .gitignore
cat > .gitignore << 'EOF'
# Xcode
xcuserdata/
*.xccheckout
*.moved-aside
*.xcuserstate
*.xcscmblueprint
*.xcworkspace

# Build
build/
DerivedData/
*.ipa
*.dSYM.zip
*.dSYM

# Swift Package Manager
.build/
Packages/

# CocoaPods (if used)
Pods/

# Carthage (if used)
Carthage/Build/
Carthage/Checkouts/

# OS
.DS_Store
*.swp
*~

# Secrets
*.env
Secrets/
credentials.json

# Large model files (download at runtime)
Models/*.mlx
Models/*.bin
*.gguf

# ObjectBox generated files
objectbox-model.json.bak
EOF

# Initial commit
git add .
git commit -m "Initial BubbleVoice-Mac project setup"
```

---

## 🔜 Next Steps

1. **Implement Core Audio** - `AudioEngineManager.swift`
2. **Implement Speech Recognition** - `SpeechRecognitionService.swift`
3. **Port Timer System** - `TimerManager.swift` from Accountability
4. **Port Interruption Handling** - From `CallManager.swift`
5. **Implement LLM Integration** - Using docs from `LOCAL_LLM_MAC.md`
6. **Implement RAG** - Using docs from `LOCAL_RAG_MAC.md`
7. **Build UI** - `ConversationWindowView.swift`

---

## 📝 Notes

- **Start with cloud APIs** for faster iteration - add local MLX later
- **Test audio permissions early** - macOS sandboxing can be tricky
- **Use `.accessory` activation policy** for menu bar app behavior
- **MLX models download on first use** - ~2GB for 3B model
- **ObjectBox needs code generation** - run `objectbox-generator` after model changes
