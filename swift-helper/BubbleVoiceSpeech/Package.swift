// swift-tools-version: 5.9
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
 * - Uses Apple's SFSpeechRecognizer for STT
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
        .macOS(.v14) // macOS Sonoma or later
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
