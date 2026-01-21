# Local LLM on Mac - Implementation Guide

**Created:** 2026-01-15  
**Purpose:** Comprehensive guide for running local LLMs on macOS using MLX Swift.

---

## 📋 Executive Summary

Mac's unified memory architecture makes it **the best platform for local LLMs**:

| Model Size | RAM Needed | Mac Support | iPhone Support |
|------------|------------|-------------|----------------|
| 3B (4-bit) | ~2 GB | ✅ All Macs | ✅ iPhone 15 Pro+ |
| 7B (4-bit) | ~4 GB | ✅ All Macs | ⚠️ Limited |
| 14B (4-bit) | ~8 GB | ✅ 16GB+ Macs | ❌ No |
| 32B (4-bit) | ~18 GB | ✅ 32GB+ Macs | ❌ No |
| 70B (4-bit) | ~40 GB | ✅ 64GB+ Macs | ❌ No |

**Recommended:** MLX Swift with Llama 3.2 3B or Mistral 7B for voice AI.

---

## 🔧 MLX Swift Performance

### Speed Comparison (Tokens/Second)

| Model | M1 Pro | M2 Pro | M3 Pro | M4 Pro |
|-------|--------|--------|--------|--------|
| Llama 3.2 3B (4-bit) | ~35 | ~45 | ~55 | ~70 |
| Mistral 7B (4-bit) | ~20 | ~28 | ~35 | ~45 |
| Llama 3.1 8B (4-bit) | ~18 | ~25 | ~32 | ~42 |
| Qwen 2.5 14B (4-bit) | ~12 | ~16 | ~20 | ~28 |

**For voice AI, aim for 30+ tok/s** for responsive conversations.

### Time to First Token

| Model | TTFT |
|-------|------|
| 3B models | ~200ms |
| 7B models | ~400ms |
| 14B models | ~800ms |

---

## 🏗️ Implementation

### 1. MLX LLM Service

```swift
import MLX
import MLXLLM
import Foundation

/// Local LLM service using MLX Swift
/// Runs entirely on Apple Silicon GPU/Neural Engine
/// No internet required, full privacy
///
/// Recommended Models for Voice AI:
/// - mlx-community/Llama-3.2-3B-Instruct-4bit (fast, good quality)
/// - mlx-community/Mistral-7B-Instruct-v0.3-4bit (better quality, slower)
/// - mlx-community/Qwen2.5-7B-Instruct-4bit (strong reasoning)
///
/// Date: 2026-01-15
class LocalLLMService: ObservableObject {
    
    // MARK: - Properties
    
    /// The loaded MLX model
    private var model: LLM?
    
    /// Tokenizer for the model
    private var tokenizer: Tokenizer?
    
    /// Model configuration
    private var config: ModelConfiguration?
    
    /// Whether model is loaded and ready
    @Published private(set) var isReady = false
    
    /// Currently loading progress
    @Published private(set) var loadProgress: Double = 0
    
    /// Model ID for downloads
    private(set) var modelId: String = ""
    
    // MARK: - Model Loading
    
    /// Load a model from Hugging Face Hub
    /// Models are cached locally after first download
    ///
    /// - Parameter modelId: Hugging Face model ID (e.g., "mlx-community/Llama-3.2-3B-Instruct-4bit")
    func loadModel(_ modelId: String) async throws {
        self.modelId = modelId
        await MainActor.run { self.loadProgress = 0 }
        
        print("📥 Loading model: \(modelId)")
        
        // MLX handles downloading and caching
        let modelConfig = try await ModelConfiguration.from(modelId)
        self.config = modelConfig
        
        await MainActor.run { self.loadProgress = 0.3 }
        
        // Load model weights
        let loadedModel = try await LLM.load(configuration: modelConfig) { progress in
            Task { @MainActor in
                self.loadProgress = 0.3 + (progress * 0.7)
            }
        }
        
        self.model = loadedModel
        self.tokenizer = try await Tokenizer.load(configuration: modelConfig)
        
        await MainActor.run {
            self.loadProgress = 1.0
            self.isReady = true
        }
        
        print("✅ Model loaded: \(modelId)")
    }
    
    /// Unload model to free memory
    func unloadModel() {
        model = nil
        tokenizer = nil
        config = nil
        isReady = false
        loadProgress = 0
        print("🗑️ Model unloaded")
    }
    
    // MARK: - Generation
    
    /// Generation parameters
    struct GenerationConfig {
        var maxTokens: Int = 500
        var temperature: Float = 0.7
        var topP: Float = 0.9
        var stopTokens: [String] = []
        
        static let conversational = GenerationConfig(
            maxTokens: 300,
            temperature: 0.7,
            topP: 0.9,
            stopTokens: ["User:", "Human:", "\n\n\n"]
        )
        
        static let precise = GenerationConfig(
            maxTokens: 500,
            temperature: 0.3,
            topP: 0.95,
            stopTokens: []
        )
    }
    
    /// Generate text with streaming output
    /// Returns an AsyncStream of generated tokens
    func generateStream(
        prompt: String,
        config: GenerationConfig = .conversational
    ) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                guard let model = model, let tokenizer = tokenizer else {
                    print("❌ Model not loaded")
                    continuation.finish()
                    return
                }
                
                // Tokenize input
                let inputTokens = tokenizer.encode(prompt)
                
                // Generate with streaming
                var generatedText = ""
                
                for await output in model.generate(
                    inputTokens,
                    maxTokens: config.maxTokens,
                    temperature: config.temperature,
                    topP: config.topP
                ) {
                    let tokenText = tokenizer.decode([output.token])
                    generatedText += tokenText
                    
                    // Check stop tokens
                    if config.stopTokens.contains(where: { generatedText.contains($0) }) {
                        // Trim the stop token from output
                        for stopToken in config.stopTokens {
                            if let range = generatedText.range(of: stopToken) {
                                generatedText = String(generatedText[..<range.lowerBound])
                            }
                        }
                        continuation.yield(tokenText)
                        break
                    }
                    
                    continuation.yield(tokenText)
                }
                
                continuation.finish()
            }
        }
    }
    
    /// Generate complete text (non-streaming)
    /// Use when you need the full response at once
    func generate(
        prompt: String,
        config: GenerationConfig = .conversational
    ) async -> String {
        var result = ""
        
        for await token in generateStream(prompt: prompt, config: config) {
            result += token
        }
        
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    
    // MARK: - Conversation Helper
    
    /// Format messages into a chat prompt
    /// Handles different model prompt formats
    func formatChatPrompt(
        messages: [(role: String, content: String)],
        systemPrompt: String? = nil
    ) -> String {
        // Detect model type from modelId
        let isLlama = modelId.lowercased().contains("llama")
        let isMistral = modelId.lowercased().contains("mistral")
        let isQwen = modelId.lowercased().contains("qwen")
        
        if isLlama {
            return formatLlamaPrompt(messages: messages, systemPrompt: systemPrompt)
        } else if isMistral {
            return formatMistralPrompt(messages: messages, systemPrompt: systemPrompt)
        } else if isQwen {
            return formatQwenPrompt(messages: messages, systemPrompt: systemPrompt)
        } else {
            // Generic ChatML format
            return formatChatMLPrompt(messages: messages, systemPrompt: systemPrompt)
        }
    }
    
    // MARK: - Prompt Formatters
    
    private func formatLlamaPrompt(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> String {
        var prompt = "<|begin_of_text|>"
        
        if let system = systemPrompt {
            prompt += "<|start_header_id|>system<|end_header_id|>\n\n\(system)<|eot_id|>"
        }
        
        for message in messages {
            let role = message.role == "assistant" ? "assistant" : "user"
            prompt += "<|start_header_id|>\(role)<|end_header_id|>\n\n\(message.content)<|eot_id|>"
        }
        
        prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n"
        return prompt
    }
    
    private func formatMistralPrompt(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> String {
        var prompt = "<s>"
        
        // Mistral folds system into first user message
        var systemText = systemPrompt ?? ""
        
        for (index, message) in messages.enumerated() {
            if message.role == "user" {
                var content = message.content
                if index == 0 && !systemText.isEmpty {
                    content = "\(systemText)\n\n\(content)"
                    systemText = ""
                }
                prompt += "[INST] \(content) [/INST]"
            } else {
                prompt += "\(message.content)</s>"
            }
        }
        
        return prompt
    }
    
    private func formatQwenPrompt(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> String {
        var prompt = "<|im_start|>system\n\(systemPrompt ?? "You are a helpful assistant.")<|im_end|>\n"
        
        for message in messages {
            let role = message.role == "assistant" ? "assistant" : "user"
            prompt += "<|im_start|>\(role)\n\(message.content)<|im_end|>\n"
        }
        
        prompt += "<|im_start|>assistant\n"
        return prompt
    }
    
    private func formatChatMLPrompt(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> String {
        var prompt = ""
        
        if let system = systemPrompt {
            prompt += "<|system|>\n\(system)</s>\n"
        }
        
        for message in messages {
            let role = message.role == "assistant" ? "assistant" : "user"
            prompt += "<|\(role)|>\n\(message.content)</s>\n"
        }
        
        prompt += "<|assistant|>\n"
        return prompt
    }
}
```

### 2. LLM Provider Protocol

```swift
import Foundation

/// Protocol for LLM providers (local and cloud)
/// Allows seamless switching between MLX, OpenAI, Anthropic, etc.
///
/// Design Rationale:
/// - Unified interface for voice conversation flow
/// - Easy A/B testing between providers
/// - Graceful fallback from local to cloud
///
/// Date: 2026-01-15
protocol LLMProvider {
    /// Whether the provider is ready to generate
    var isReady: Bool { get }
    
    /// Provider name for logging
    var providerName: String { get }
    
    /// Generate response with streaming
    func generateStream(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> AsyncStream<String>
    
    /// Generate complete response
    func generate(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) async -> String
}

/// Local MLX provider wrapper
class LocalMLXProvider: LLMProvider {
    private let llmService: LocalLLMService
    
    var isReady: Bool { llmService.isReady }
    var providerName: String { "MLX Local (\(llmService.modelId))" }
    
    init(llmService: LocalLLMService) {
        self.llmService = llmService
    }
    
    func generateStream(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> AsyncStream<String> {
        let prompt = llmService.formatChatPrompt(messages: messages, systemPrompt: systemPrompt)
        return llmService.generateStream(prompt: prompt, config: .conversational)
    }
    
    func generate(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) async -> String {
        let prompt = llmService.formatChatPrompt(messages: messages, systemPrompt: systemPrompt)
        return await llmService.generate(prompt: prompt, config: .conversational)
    }
}

/// Cloud OpenAI provider
class OpenAIProvider: LLMProvider {
    private let apiKey: String
    private let model: String
    
    var isReady: Bool { !apiKey.isEmpty }
    var providerName: String { "OpenAI (\(model))" }
    
    init(apiKey: String, model: String = "gpt-4o-mini") {
        self.apiKey = apiKey
        self.model = model
    }
    
    func generateStream(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) -> AsyncStream<String> {
        AsyncStream { continuation in
            Task {
                // Implementation would use URLSession with SSE
                // For brevity, delegating to generate()
                let response = await generate(messages: messages, systemPrompt: systemPrompt)
                continuation.yield(response)
                continuation.finish()
            }
        }
    }
    
    func generate(
        messages: [(role: String, content: String)],
        systemPrompt: String?
    ) async -> String {
        // Build OpenAI API request
        var apiMessages: [[String: String]] = []
        
        if let system = systemPrompt {
            apiMessages.append(["role": "system", "content": system])
        }
        
        for msg in messages {
            apiMessages.append(["role": msg.role, "content": msg.content])
        }
        
        // Call API (simplified)
        let url = URL(string: "https://api.openai.com/v1/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "model": model,
            "messages": apiMessages,
            "max_tokens": 500,
            "temperature": 0.7
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let choices = json["choices"] as? [[String: Any]],
               let first = choices.first,
               let message = first["message"] as? [String: Any],
               let content = message["content"] as? String {
                return content
            }
        } catch {
            print("❌ OpenAI error: \(error)")
        }
        
        return ""
    }
}
```

### 3. LLM Manager

```swift
import Foundation

/// Manages LLM providers with automatic fallback
/// Tries local first, falls back to cloud if needed
///
/// Priority Order:
/// 1. Local MLX (fastest, private, free)
/// 2. Groq (fast cloud, cheap)
/// 3. OpenAI (reliable fallback)
///
/// Date: 2026-01-15
class LLMManager: ObservableObject {
    
    // MARK: - Properties
    
    @Published private(set) var currentProvider: String = "None"
    @Published private(set) var isLocalReady = false
    
    private var localProvider: LocalMLXProvider?
    private var cloudProviders: [LLMProvider] = []
    
    private let localLLM = LocalLLMService()
    
    // MARK: - Setup
    
    /// Setup local and cloud providers
    func setup(
        localModelId: String = "mlx-community/Llama-3.2-3B-Instruct-4bit",
        openAIKey: String? = nil,
        groqKey: String? = nil
    ) async {
        // Try to load local model
        do {
            try await localLLM.loadModel(localModelId)
            localProvider = LocalMLXProvider(llmService: localLLM)
            await MainActor.run {
                self.isLocalReady = true
                self.currentProvider = "MLX Local"
            }
        } catch {
            print("⚠️ Local model failed to load: \(error)")
        }
        
        // Setup cloud fallbacks
        if let key = openAIKey, !key.isEmpty {
            cloudProviders.append(OpenAIProvider(apiKey: key))
        }
        
        // Add other cloud providers as needed
    }
    
    // MARK: - Generation
    
    /// Get the best available provider
    var bestProvider: LLMProvider? {
        // Prefer local if ready
        if let local = localProvider, local.isReady {
            return local
        }
        
        // Fall back to first available cloud
        return cloudProviders.first { $0.isReady }
    }
    
    /// Generate with automatic provider selection
    func generateStream(
        messages: [(role: String, content: String)],
        systemPrompt: String?,
        preferLocal: Bool = true
    ) -> AsyncStream<String> {
        guard let provider = preferLocal ? (localProvider ?? bestProvider) : bestProvider else {
            return AsyncStream { $0.finish() }
        }
        
        Task { @MainActor in
            self.currentProvider = provider.providerName
        }
        
        return provider.generateStream(messages: messages, systemPrompt: systemPrompt)
    }
    
    /// Generate complete response
    func generate(
        messages: [(role: String, content: String)],
        systemPrompt: String?,
        preferLocal: Bool = true
    ) async -> String {
        guard let provider = preferLocal ? (localProvider ?? bestProvider) : bestProvider else {
            return ""
        }
        
        await MainActor.run {
            self.currentProvider = provider.providerName
        }
        
        return await provider.generate(messages: messages, systemPrompt: systemPrompt)
    }
}
```

---

## 📦 Recommended Models

### For Voice AI (Fast Response)

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| Llama 3.2 3B | 2 GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | General voice assistant |
| Phi-3 Mini | 2 GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Reasoning tasks |
| Qwen 2.5 3B | 2 GB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Multilingual |

### For Quality (More RAM)

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| Mistral 7B | 4 GB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Balanced performance |
| Llama 3.1 8B | 5 GB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Best quality at 8GB |
| Qwen 2.5 14B | 8 GB | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Complex reasoning |

### MLX Community Hub IDs

```swift
// Fast models (< 4GB RAM)
"mlx-community/Llama-3.2-3B-Instruct-4bit"
"mlx-community/Phi-3-mini-4k-instruct-4bit"
"mlx-community/Qwen2.5-3B-Instruct-4bit"

// Quality models (8+ GB RAM)
"mlx-community/Mistral-7B-Instruct-v0.3-4bit"
"mlx-community/Meta-Llama-3.1-8B-Instruct-4bit"
"mlx-community/Qwen2.5-14B-Instruct-4bit"

// Large models (32+ GB RAM)
"mlx-community/Qwen2.5-32B-Instruct-4bit"
"mlx-community/Meta-Llama-3.1-70B-Instruct-4bit"
```

---

## ⚡ Optimization Tips

### 1. Warm Up the Model

```swift
// Call during app launch to warm up caches
func warmupModel() async {
    _ = await localLLM.generate(prompt: "Hello", config: GenerationConfig(maxTokens: 5))
    print("🔥 Model warmed up")
}
```

### 2. Keep Context Short

```swift
// For voice, keep conversation context to last 5-10 messages
// Trim older messages to reduce generation time
let recentMessages = Array(allMessages.suffix(10))
```

### 3. Use Stop Tokens

```swift
// Stop generation early when appropriate
let config = GenerationConfig(
    maxTokens: 300,
    stopTokens: ["\n\n", "User:", "---"]  // Stop at natural breaks
)
```

### 4. Stream Tokens for Low Latency

```swift
// Start audio as soon as first sentence is ready
var buffer = ""
for await token in llm.generateStream(prompt: prompt) {
    buffer += token
    
    // Check for sentence boundary
    if buffer.hasSuffix(".") || buffer.hasSuffix("!") || buffer.hasSuffix("?") {
        // Send to TTS immediately
        await tts.speak(buffer)
        buffer = ""
    }
}
```

### 5. Memory Management

```swift
// Unload model when not in use (e.g., when app goes to background)
func applicationDidResignActive() {
    if shouldConserveMemory {
        localLLM.unloadModel()
    }
}

// Reload when needed
func applicationWillBecomeActive() {
    if !localLLM.isReady {
        Task { try await localLLM.loadModel(savedModelId) }
    }
}
```

---

## 🔧 Setup

### Package.swift

```swift
dependencies: [
    .package(url: "https://github.com/ml-explore/mlx-swift.git", from: "0.20.0"),
    .package(url: "https://github.com/ml-explore/mlx-swift-examples.git", branch: "main"),
]

targets: [
    .target(
        name: "BubbleVoiceMac",
        dependencies: [
            .product(name: "MLX", package: "mlx-swift"),
            .product(name: "MLXLLM", package: "mlx-swift-examples"),
        ]
    )
]
```

### Info.plist (for network access to download models)

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### Entitlements

```xml
<!-- For network model downloads -->
<key>com.apple.security.network.client</key>
<true/>

<!-- For Metal GPU access -->
<key>com.apple.security.device.metal</key>
<true/>
```

---

## 📊 Latency Budget for Voice AI

For natural conversation, total response time should be < 2 seconds:

| Stage | Target Time | Notes |
|-------|-------------|-------|
| Speech recognition | ~500ms | Real-time, overlaps |
| LLM TTFT | ~200-400ms | Time to first token |
| LLM generation | ~1000ms | ~50 tokens at 50 tok/s |
| TTS synthesis | ~200ms | First audio chunk |
| **Total** | **~1.5-2s** | Acceptable for voice |

### Meeting the Budget

1. **Start LLM while user is finishing** (timer system from Accountability)
2. **Stream LLM tokens to TTS** (don't wait for complete response)
3. **Use smaller models** (3B is plenty for conversation)
4. **Cache common responses** (greetings, clarifications)

---

## 📝 Notes

- **MLX is Apple's official framework** - best optimized for M-series chips
- **Unified memory** means no CPU↔GPU transfer overhead
- **4-bit quantization** gives 90%+ quality with 4x less memory
- **Local = private** - no data leaves the device
- **Local = free** - no API costs after model download
- **Download once, use forever** - models cached locally
