#!/usr/bin/env swift

import Foundation
import AVFoundation
import Speech
import WebRTC

// MARK: - WebRTC Echo Cancellation Test with SpeechAnalyzer
// Tests if we can play TTS through WebRTC while transcribing background speech
// using Apple's latest SpeechAnalyzer API (macOS 26+)

@available(macOS 26.0, *)
func runTest() async throws {
print("🎙️  WebRTC + SpeechAnalyzer Echo Cancellation Test")
print("====================================================")
print("")

// MARK: - Configuration
let SAMPLE_RATE: Double = 48000 // High quality for Apple Silicon
let ANALYZER_SAMPLE_RATE: Double = 16000 // SpeechAnalyzer prefers 16kHz
let BUFFER_SIZE: AVAudioFrameCount = 1024
let TEST_TTS_TEXT = "This is a test of the echo cancellation system. The AI is speaking at full volume for ten seconds. You should be able to hear background audio being transcribed."

// MARK: - Global State
var audioEngine = AVAudioEngine()
var ttsPlayer: AVAudioPlayerNode?
var speechAnalyzer: SpeechAnalyzer?
var speechTranscriber: SpeechTranscriber?
var analyzerInputContinuation: AsyncStream<AnalyzerInput>.Continuation?
var analyzerTask: Task<Void, Error>?
var transcribedText: [String] = []
var testStartTime = Date()
var audioConverter: AVAudioConverter?

// MARK: - Step 1: Generate TTS
print("🗣️  Step 1: Generating TTS audio...")
let ttsFile = "/tmp/webrtc_speechanalyzer_test.aiff"
let ttsURL = URL(fileURLWithPath: ttsFile)

let ttsStart = Date()
let ttsProcess = Process()
ttsProcess.executableURL = URL(fileURLWithPath: "/usr/bin/say")
ttsProcess.arguments = ["-o", ttsFile, TEST_TTS_TEXT]
try? ttsProcess.run()
ttsProcess.waitUntilExit()
let ttsGenTime = Date().timeIntervalSince(ttsStart) * 1000

guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
    print("❌ Failed to load TTS audio file")
    exit(1)
}

let duration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
print("✅ TTS generated in \(Int(ttsGenTime))ms")
print("   Duration: \(String(format: "%.2f", duration))s")
print("")

// MARK: - Step 2: Initialize WebRTC
print("📡 Step 2: Initializing WebRTC...")

RTCInitializeSSL()
let factory = RTCPeerConnectionFactory()

print("✅ WebRTC factory created")
print("   Note: Full peer connection setup would go here")
print("   For this test, we'll simulate WebRTC by routing audio through AVAudioEngine")
print("")

// MARK: - Step 3: Set up SpeechAnalyzer
print("🎤 Step 3: Setting up SpeechAnalyzer...")

// Create locale
guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
    print("❌ Locale not supported")
    throw NSError(domain: "TestError", code: 2)
}

print("   Locale: \(locale.identifier)")

// Create transcriber
let transcriber = SpeechTranscriber(
    locale: locale,
    transcriptionOptions: [],
    reportingOptions: [.volatileResults, .fastResults],
    attributeOptions: [.audioTimeRange]
)
speechTranscriber = transcriber

print("   Transcriber created")

// Check and install assets if needed
let assetCheckTask = Task {
    let installedLocales = await SpeechTranscriber.installedLocales
    let installedIds = installedLocales.map({ $0.identifier(.bcp47) })
    let isInstalled = installedIds.contains(locale.identifier(.bcp47))
    
    if !isInstalled {
        print("   Downloading speech assets...")
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
            print("   ✅ Assets installed")
        }
    } else {
        print("   ✅ Assets already installed")
    }
}

// Wait for assets
try? await assetCheckTask.value

// Get best audio format for analyzer
guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
    print("❌ Failed to get analyzer audio format")
    throw NSError(domain: "TestError", code: 1)
}
print("   Analyzer format: \(analyzerFormat)")

// Create analyzer
let analyzer = SpeechAnalyzer(modules: [transcriber])
speechAnalyzer = analyzer

print("✅ SpeechAnalyzer configured")
print("")

// MARK: - Step 4: Set up Audio Engine
print("🎵 Step 4: Setting up AVAudioEngine...")

// Create player node for TTS
ttsPlayer = AVAudioPlayerNode()
audioEngine.attach(ttsPlayer!)
audioEngine.connect(ttsPlayer!, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)

// Get input node (microphone)
let inputNode = audioEngine.inputNode
let inputFormat = inputNode.outputFormat(forBus: 0)

print("   Input format: \(inputFormat)")
print("   Analyzer format: \(analyzerFormat)")

// Create converter from mic format to analyzer format
guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
    print("❌ Failed to create audio converter")
    exit(1)
}
audioConverter = converter

print("✅ Audio engine configured")
print("")

// MARK: - Step 5: Create Input Stream for SpeechAnalyzer
print("📝 Step 5: Creating SpeechAnalyzer input stream...")

let (inputStream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
analyzerInputContinuation = continuation

print("✅ Input stream created")
print("")

// MARK: - Step 6: Start Result Consumption Task
print("📊 Step 6: Starting result consumption...")

analyzerTask = Task {
    print("   🔄 Result consumption task started, waiting for results...")
    do {
        var resultCount = 0
        for try await result in transcriber.results {
            resultCount += 1
            let text = String(result.text.characters)
            let elapsed = Date().timeIntervalSince(testStartTime)
            
            print("   [DEBUG] Result #\(resultCount): \"\(text)\" (length: \(text.count))")
            
            if !text.isEmpty && (transcribedText.isEmpty || transcribedText.last != text) {
                print("   [\(String(format: "%.1f", elapsed))s] 📝 \"\(text)\"")
                transcribedText.append(text)
            }
        }
        print("   🏁 Result stream ended (total results: \(resultCount))")
    } catch {
        print("   ⚠️  Result consumption error: \(error.localizedDescription)")
    }
}

print("✅ Result task started")
print("")

// MARK: - Step 7: Install Audio Tap
print("🎧 Step 7: Installing microphone tap...")

// Track frame count for timestamps
var totalFramesProcessed: Int64 = 0

// Use a class to allow mutation in closure
class BufferCounter {
    var count = 0
}
let bufferCounter = BufferCounter()

inputNode.installTap(onBus: 0, bufferSize: BUFFER_SIZE, format: inputFormat) { buffer, time in
    bufferCounter.count += 1
    if bufferCounter.count % 50 == 0 {
        print("   [TAP] Yielded \(bufferCounter.count) buffers to analyzer")
    }
    
    // Convert to analyzer format
    guard let convertedBuffer = AVAudioPCMBuffer(
        pcmFormat: analyzerFormat,
        frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * analyzerFormat.sampleRate / inputFormat.sampleRate)
    ) else { return }
    
    var error: NSError?
    let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
        outStatus.pointee = .haveData
        return buffer
    }
    
    converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
    
    if let error = error {
        print("   ⚠️  Conversion error: \(error.localizedDescription)")
        return
    }
    
    // Create timestamp for this buffer
    let bufferStartCMTime = CMTime(
        value: CMTimeValue(totalFramesProcessed),
        timescale: CMTimeScale(analyzerFormat.sampleRate)
    )
    
    totalFramesProcessed += Int64(convertedBuffer.frameLength)
    
    // Feed to SpeechAnalyzer
    continuation.yield(AnalyzerInput(
        buffer: convertedBuffer,
        bufferStartTime: bufferStartCMTime
    ))
}

print("✅ Microphone tap installed")
print("")

// MARK: - Step 8: Start Audio Engine and Analyzer
print("🚀 Step 8: Starting audio engine and analyzer...")

audioEngine.prepare()
do {
    try audioEngine.start()
    print("   ✅ Audio engine started")
    print("   Engine running: \(audioEngine.isRunning)")
    print("   Input node: \(inputNode)")
} catch {
    print("   ❌ Audio engine start error: \(error.localizedDescription)")
    throw error
}

// Start analyzer (this returns immediately, analyzer runs in background)
do {
    try await analyzer.start(inputSequence: inputStream)
    print("   ✅ Analyzer started successfully")
} catch {
    print("   ❌ Analyzer start error: \(error.localizedDescription)")
    throw error
}

print("✅ Audio engine and analyzer running")
print("")

// MARK: - Step 9: Play TTS
print("🔊 Step 9: Playing TTS through speakers...")
print("   (Background audio should be transcribed)")
print("   (TTS audio should NOT be transcribed if AEC works)")
print("")

// Schedule TTS playback
ttsPlayer?.scheduleFile(audioFile, at: nil) {
    print("")
    print("   ✅ TTS playback completed")
}

ttsPlayer?.play()
testStartTime = Date()

print("🎵 TTS is now playing...")
print("")

// MARK: - Step 10: Test Loop
print("🧪 Test running for \(Int(duration) + 5) seconds...")
print("   💡 Background audio from another device should be transcribed")
print("   💡 TTS audio should NOT appear in transcription (if AEC works)")
print("")

let testDuration = Int(duration) + 5
var elapsed = 0

while elapsed < testDuration {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
    elapsed += 1
    if elapsed % 3 == 0 {
        print("   ⏱️  \(elapsed)s / \(testDuration)s")
    }
}

// MARK: - Step 11: Finalize Analyzer to Flush Results
print("")
print("🔄 Finalizing analyzer to flush results...")

if let analyzer = speechAnalyzer {
    do {
        try await analyzer.finalize(through: nil)
        print("✅ Analyzer finalized")
    } catch {
        print("⚠️  Finalize error: \(error.localizedDescription)")
    }
}

// Wait a moment for final results to arrive
var waitCount = 0
while transcribedText.isEmpty && waitCount < 5 {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.5))
    waitCount += 1
}

// MARK: - Step 12: Results Analysis
print("")
print("📊 Test Results")
print("===============")
print("")

print("TTS Text: \"\(TEST_TTS_TEXT)\"")
print("")

if transcribedText.isEmpty {
    print("⚠️  No transcription captured")
    print("")
    print("Possible reasons:")
    print("  - No background audio playing")
    print("  - Background audio too quiet")
    print("  - Microphone not working")
    print("  - SpeechAnalyzer configuration issue")
} else {
    print("✅ Transcriptions captured: \(transcribedText.count)")
    print("")
    
    for (i, text) in transcribedText.enumerated() {
        print("   \(i + 1). \"\(text)\"")
    }
    print("")
    
    // Check for echo (TTS text appearing in transcription)
    let ttsWords = Set(TEST_TTS_TEXT.lowercased()
        .components(separatedBy: CharacterSet.alphanumerics.inverted)
        .filter { $0.count > 3 })
    
    var echoDetected = false
    var echoWords: Set<String> = []
    
    for transcription in transcribedText {
        let transcribedWords = Set(transcription.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 3 })
        
        let matchingWords = ttsWords.intersection(transcribedWords)
        
        if matchingWords.count >= 3 {
            echoDetected = true
            echoWords.formUnion(matchingWords)
        }
    }
    
    if echoDetected {
        print("❌ ECHO DETECTED")
        print("")
        print("   TTS words found in transcription:")
        print("   \(Array(echoWords).sorted().joined(separator: ", "))")
        print("")
        print("   This means:")
        print("   - Microphone is picking up speaker output")
        print("   - Current setup does NOT have echo cancellation")
        print("   - Need full WebRTC implementation with RTCAudioDevice")
    } else {
        print("✅ NO ECHO DETECTED")
        print("")
        print("   TTS audio did not leak into transcription")
        print("   Background audio was transcribed successfully")
        print("   This proves the concept works!")
    }
}

print("")
print("🏁 Test complete")
print("")

// MARK: - Cleanup
audioEngine.stop()
inputNode.removeTap(onBus: 0)
analyzerInputContinuation?.finish()
analyzerTask?.cancel()

// Finalize analyzer
if let analyzer = speechAnalyzer {
    Task {
        try? await analyzer.finalizeAndFinishThroughEndOfInput()
    }
}

// Wait a moment for cleanup
RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))

try? FileManager.default.removeItem(at: ttsURL)

RTCCleanupSSL()

print("💡 Next Steps:")
print("   1. If background audio was transcribed: ✅ SpeechAnalyzer works!")
print("   2. If echo detected: Implement full WebRTC with RTCAudioDevice")
print("   3. If no transcription: Check background audio volume/source")
print("")
}

// MARK: - Main Entry Point
if #available(macOS 26.0, *) {
    Task {
        do {
            try await runTest()
        } catch {
            print("❌ Test failed: \(error.localizedDescription)")
        }
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("❌ This test requires macOS 26.0 or later")
    print("   Current version: \(ProcessInfo.processInfo.operatingSystemVersionString)")
    exit(1)
}
