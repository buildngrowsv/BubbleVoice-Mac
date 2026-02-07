// swift-tools-version: 6.1
// The swift-tools-version declares the minimum version of Swift required to build this package.

/**
 * BUBBLEVOICE SPEECH HELPER - SWIFT PACKAGE
 * 
 * This Swift package provides native macOS speech recognition (STT) and
 * text-to-speech (TTS) capabilities to the Node.js backend.
 * 
 * ARCHITECTURE:
 * - Runs as a separate process spawned by Node.js
 * - Communicates via JSON over stdin/stdout
 * - Uses Apple's SpeechAnalyzer + SpeechTranscriber for STT
 * - Uses `say` command for TTS (or NSSpeechSynthesizer)
 * 
 * PRODUCT CONTEXT:
 * Native Apple APIs provide the best quality and lowest latency
 * for speech on macOS. This helper bridges the gap between Node.js
 * and native APIs.
 */

import PackageDescription

let package = Package(
    name: "BubbleVoiceSpeech",
    platforms: [
        .macOS("26") // macOS 26 or later (SpeechAnalyzer)
    ],
    products: [
        .executable(
            name: "BubbleVoiceSpeech",
            targets: ["BubbleVoiceSpeech"]
        )
    ],
    targets: [
        .executableTarget(
            name: "BubbleVoiceSpeech",
            dependencies: []
        )
    ]
)
