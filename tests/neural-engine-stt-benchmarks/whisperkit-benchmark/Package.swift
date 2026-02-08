// swift-tools-version: 6.1

/**
 * WHISPERKIT BENCHMARK — SWIFT PACKAGE
 *
 * Standalone benchmark for WhisperKit (Argmax) real-time transcription
 * on Apple Silicon with CoreML/Neural Engine acceleration.
 *
 * TESTS:
 * 1. Basic transcription accuracy + latency (file-based and streaming)
 * 2. Echo cancellation comparison:
 *    a) No echo cancellation (raw mic)
 *    b) Apple Voice Processing IO (hardware AEC)
 *    c) Energy-based VAD gating (what our app currently does)
 * 3. Interruption performance:
 *    a) Rapid start/stop cycles
 *    b) TTS playing while STT listens (echo scenario)
 *    c) User "interrupting" the AI mid-speech
 *
 * WHY WHISPERKIT:
 * WhisperKit is the most production-ready CoreML/Neural Engine Whisper
 * implementation. It supports true streaming, has built-in VAD, and is
 * used by production apps. It's the strongest candidate for replacing
 * or supplementing Apple's SpeechAnalyzer in BubbleVoice-Mac.
 *
 * BUILD:
 *   cd tests/neural-engine-stt-benchmarks/whisperkit-benchmark
 *   swift build -c release
 *
 * RUN:
 *   .build/release/WhisperKitBenchmark
 *
 * CREATED: 2026-02-08
 */

import PackageDescription

let package = Package(
    name: "WhisperKitBenchmark",
    platforms: [
        // WhisperKit requires macOS 14+ for CoreML features.
        // We use macOS 15 to also get Voice Processing IO improvements.
        .macOS(.v15)
    ],
    dependencies: [
        // WhisperKit by Argmax — CoreML/Neural Engine optimized Whisper.
        // This is the main library under test.
        .package(url: "https://github.com/argmaxinc/WhisperKit.git", from: "0.12.0"),
    ],
    targets: [
        .executableTarget(
            name: "WhisperKitBenchmark",
            dependencies: ["WhisperKit"],
            path: "Sources"
        )
    ]
)
