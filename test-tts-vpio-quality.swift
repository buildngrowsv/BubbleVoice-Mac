#!/usr/bin/env swift

/**
 * TTS VPIO QUALITY TEST
 *
 * Tests different audio playback configurations to isolate the cause
 * of degraded TTS quality in the app. Each test announces itself so
 * you can compare audio quality by ear.
 *
 * TESTS:
 * 1. Baseline: Direct `say` command (no engine, no VPIO)
 * 2. AVAudioEngine without VPIO, format:nil (auto resampling)
 * 3. AVAudioEngine without VPIO, explicit high-quality resampling
 * 4. AVAudioEngine WITH VPIO, format:nil (current app behavior)
 * 5. AVAudioEngine WITH VPIO, explicit high-quality resampling
 *
 * RUN: swift test-tts-vpio-quality.swift
 */

import AVFoundation
import Foundation

let testText = "The quick brown fox jumps over the lazy dog. This is a test of audio quality."
let testRate = 200

print("🎤 TTS VPIO Quality Comparison Test")
print(String(repeating: "=", count: 70))
print("")
print("Listen carefully to each test and compare audio quality.")
print("Each test will announce its configuration before playing the test phrase.")
print("")

// Helper to generate TTS file
func generateTTSFile(text: String, rate: Int, outputPath: String) {
    let fileURL = URL(fileURLWithPath: outputPath)
    try? FileManager.default.removeItem(at: fileURL)
    
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    process.arguments = ["-o", fileURL.path, "-r", "\(rate)", text]
    try! process.run()
    process.waitUntilExit()
}

// Helper to measure resampling time
func measureResamplingTime(sourceFile: URL, targetSampleRate: Double) -> TimeInterval {
    let audioFile = try! AVAudioFile(forReading: sourceFile)
    let sourceFormat = audioFile.processingFormat
    
    let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: targetSampleRate,
        channels: 1,
        interleaved: false
    )!
    
    let converter = AVAudioConverter(from: sourceFormat, to: targetFormat)!
    converter.sampleRateConverterQuality = AVAudioQuality.max.rawValue
    
    // Read entire file
    let frameCount = AVAudioFrameCount(audioFile.length)
    let sourceBuffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: frameCount)!
    try! audioFile.read(into: sourceBuffer)
    
    // Measure conversion time
    let startTime = Date()
    
    let outputFrameCapacity = AVAudioFrameCount(Double(frameCount) * targetSampleRate / sourceFormat.sampleRate)
    let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputFrameCapacity)!
    
    var error: NSError?
    converter.convert(to: outputBuffer, error: &error) { inNumPackets, outStatus in
        outStatus.pointee = .haveData
        return sourceBuffer
    }
    
    let elapsed = Date().timeIntervalSince(startTime)
    return elapsed
}

// ============================================================
// GENERATE TEST FILES
// ============================================================
print("Generating test audio files...")

let tempDir = NSTemporaryDirectory()
let testFile = tempDir + "tts_test.aiff"

// Generate announcement files
generateTTSFile(text: "Test 1. Baseline. Direct say command with no audio engine and no V P I O.", rate: testRate, outputPath: tempDir + "announce1.aiff")
generateTTSFile(text: "Test 2. Audio engine without V P I O using format nil for automatic resampling.", rate: testRate, outputPath: tempDir + "announce2.aiff")
generateTTSFile(text: "Test 3. Audio engine without V P I O using explicit high quality resampling.", rate: testRate, outputPath: tempDir + "announce3.aiff")
generateTTSFile(text: "Test 4. Audio engine with V P I O enabled using format nil for automatic resampling. This is the current app behavior.", rate: testRate, outputPath: tempDir + "announce4.aiff")
generateTTSFile(text: "Test 5. Audio engine with V P I O enabled using explicit high quality resampling.", rate: testRate, outputPath: tempDir + "announce5.aiff")

// Generate main test phrase
generateTTSFile(text: testText, rate: testRate, outputPath: testFile)

print("✓ Files generated")
print("")

// Measure resampling overhead
print("Measuring resampling overhead...")
let resampleTime = measureResamplingTime(sourceFile: URL(fileURLWithPath: testFile), targetSampleRate: 48000)
print("  High-quality 22.05kHz → 48kHz resampling: \(String(format: "%.1f", resampleTime * 1000))ms")
print("")

Thread.sleep(forTimeInterval: 1.0)

// ============================================================
// TEST 1: Baseline - Direct say command
// ============================================================
print("▶ TEST 1: Baseline (direct say command)")
Thread.sleep(forTimeInterval: 1.0)

let announce1 = Process()
announce1.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
announce1.arguments = [tempDir + "announce1.aiff"]
try! announce1.run()
announce1.waitUntilExit()

Thread.sleep(forTimeInterval: 0.5)

let test1 = Process()
test1.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
test1.arguments = [testFile]
try! test1.run()
test1.waitUntilExit()

print("✓ Test 1 complete")
print("")
Thread.sleep(forTimeInterval: 2.0)

// ============================================================
// TEST 2: AVAudioEngine without VPIO, format:nil
// ============================================================
print("▶ TEST 2: AVAudioEngine without VPIO (format:nil)")
Thread.sleep(forTimeInterval: 1.0)

let announce2 = Process()
announce2.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
announce2.arguments = [tempDir + "announce2.aiff"]
try! announce2.run()
announce2.waitUntilExit()

Thread.sleep(forTimeInterval: 0.5)

let engine2 = AVAudioEngine()
let player2 = AVAudioPlayerNode()

engine2.attach(player2)
engine2.connect(player2, to: engine2.mainMixerNode, format: nil) // Auto resampling
let outputFormat2 = engine2.outputNode.outputFormat(forBus: 0)
engine2.connect(engine2.mainMixerNode, to: engine2.outputNode, format: outputFormat2)

try! engine2.start()

let audioFile2 = try! AVAudioFile(forReading: URL(fileURLWithPath: testFile))
let duration2 = Double(audioFile2.length) / audioFile2.fileFormat.sampleRate

player2.scheduleFile(audioFile2, at: nil, completionHandler: nil)
player2.play()

// Wait for duration + buffer
Thread.sleep(forTimeInterval: duration2 + 0.5)

player2.stop()
engine2.stop()

print("✓ Test 2 complete")
print("")
Thread.sleep(forTimeInterval: 2.0)

// ============================================================
// TEST 3: AVAudioEngine without VPIO, explicit resampling
// ============================================================
print("▶ TEST 3: AVAudioEngine without VPIO (high-quality resampling)")
Thread.sleep(forTimeInterval: 1.0)

let announce3 = Process()
announce3.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
announce3.arguments = [tempDir + "announce3.aiff"]
try! announce3.run()
announce3.waitUntilExit()

Thread.sleep(forTimeInterval: 0.5)

let engine3 = AVAudioEngine()
let player3 = AVAudioPlayerNode()

engine3.attach(player3)

// Explicit high-quality resampling
let sourceFile3 = try! AVAudioFile(forReading: URL(fileURLWithPath: testFile))
let sourceFormat3 = sourceFile3.processingFormat

let targetFormat3 = AVAudioFormat(
    commonFormat: .pcmFormatFloat32,
    sampleRate: 48000,
    channels: 1,
    interleaved: false
)!

let converter3 = AVAudioConverter(from: sourceFormat3, to: targetFormat3)!
converter3.sampleRateConverterQuality = AVAudioQuality.max.rawValue

// Read source file
let frameCount3 = AVAudioFrameCount(sourceFile3.length)
let sourceBuffer3 = AVAudioPCMBuffer(pcmFormat: sourceFormat3, frameCapacity: frameCount3)!
try! sourceFile3.read(into: sourceBuffer3)

// Convert to 48kHz
let outputFrameCapacity3 = AVAudioFrameCount(Double(frameCount3) * 48000.0 / sourceFormat3.sampleRate)
let outputBuffer3 = AVAudioPCMBuffer(pcmFormat: targetFormat3, frameCapacity: outputFrameCapacity3)!

var error3: NSError?
converter3.convert(to: outputBuffer3, error: &error3) { inNumPackets, outStatus in
    outStatus.pointee = .haveData
    return sourceBuffer3
}

// Connect and play
engine3.connect(player3, to: engine3.mainMixerNode, format: targetFormat3)
let outputFormat3 = engine3.outputNode.outputFormat(forBus: 0)
engine3.connect(engine3.mainMixerNode, to: engine3.outputNode, format: outputFormat3)

try! engine3.start()

let duration3 = Double(outputBuffer3.frameLength) / targetFormat3.sampleRate

player3.scheduleBuffer(outputBuffer3, completionHandler: nil)
player3.play()

// Wait for duration + buffer
Thread.sleep(forTimeInterval: duration3 + 0.5)

player3.stop()
engine3.stop()

print("✓ Test 3 complete")
print("")
Thread.sleep(forTimeInterval: 2.0)

// ============================================================
// TEST 4: AVAudioEngine WITH VPIO, format:nil (current app)
// ============================================================
print("▶ TEST 4: AVAudioEngine WITH VPIO (format:nil) - CURRENT APP BEHAVIOR")
Thread.sleep(forTimeInterval: 1.0)

let announce4 = Process()
announce4.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
announce4.arguments = [tempDir + "announce4.aiff"]
try! announce4.run()
announce4.waitUntilExit()

Thread.sleep(forTimeInterval: 0.5)

let engine4 = AVAudioEngine()
let player4 = AVAudioPlayerNode()

engine4.attach(player4)

// Enable VPIO
try! engine4.outputNode.setVoiceProcessingEnabled(true)

// Configure ducking
if #available(macOS 14.0, *) {
    let duckingConfig = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
        enableAdvancedDucking: true,
        duckingLevel: .min
    )
    engine4.inputNode.voiceProcessingOtherAudioDuckingConfiguration = duckingConfig
}

// Connect with format:nil (auto resampling)
let outputFormat4 = engine4.outputNode.outputFormat(forBus: 0)
engine4.connect(engine4.mainMixerNode, to: engine4.outputNode, format: outputFormat4)
engine4.connect(player4, to: engine4.mainMixerNode, format: nil)

try! engine4.start()

let audioFile4 = try! AVAudioFile(forReading: URL(fileURLWithPath: testFile))
let duration4 = Double(audioFile4.length) / audioFile4.fileFormat.sampleRate

player4.scheduleFile(audioFile4, at: nil, completionHandler: nil)
player4.play()

// Wait for duration + buffer
Thread.sleep(forTimeInterval: duration4 + 0.5)

player4.stop()
engine4.stop()

print("✓ Test 4 complete")
print("")
Thread.sleep(forTimeInterval: 2.0)

// ============================================================
// TEST 5: AVAudioEngine WITH VPIO, explicit resampling
// ============================================================
print("▶ TEST 5: AVAudioEngine WITH VPIO (high-quality resampling)")
Thread.sleep(forTimeInterval: 1.0)

let announce5 = Process()
announce5.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
announce5.arguments = [tempDir + "announce5.aiff"]
try! announce5.run()
announce5.waitUntilExit()

Thread.sleep(forTimeInterval: 0.5)

let engine5 = AVAudioEngine()
let player5 = AVAudioPlayerNode()

engine5.attach(player5)

// Enable VPIO
try! engine5.outputNode.setVoiceProcessingEnabled(true)

// Configure ducking
if #available(macOS 14.0, *) {
    let duckingConfig = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
        enableAdvancedDucking: true,
        duckingLevel: .min
    )
    engine5.inputNode.voiceProcessingOtherAudioDuckingConfiguration = duckingConfig
}

// Explicit high-quality resampling
let sourceFile5 = try! AVAudioFile(forReading: URL(fileURLWithPath: testFile))
let sourceFormat5 = sourceFile5.processingFormat

let targetFormat5 = AVAudioFormat(
    commonFormat: .pcmFormatFloat32,
    sampleRate: 48000,
    channels: 1,
    interleaved: false
)!

let converter5 = AVAudioConverter(from: sourceFormat5, to: targetFormat5)!
converter5.sampleRateConverterQuality = AVAudioQuality.max.rawValue

// Read source file
let frameCount5 = AVAudioFrameCount(sourceFile5.length)
let sourceBuffer5 = AVAudioPCMBuffer(pcmFormat: sourceFormat5, frameCapacity: frameCount5)!
try! sourceFile5.read(into: sourceBuffer5)

// Convert to 48kHz
let outputFrameCapacity5 = AVAudioFrameCount(Double(frameCount5) * 48000.0 / sourceFormat5.sampleRate)
let outputBuffer5 = AVAudioPCMBuffer(pcmFormat: targetFormat5, frameCapacity: outputFrameCapacity5)!

var error5: NSError?
converter5.convert(to: outputBuffer5, error: &error5) { inNumPackets, outStatus in
    outStatus.pointee = .haveData
    return sourceBuffer5
}

// Connect and play
engine5.connect(player5, to: engine5.mainMixerNode, format: targetFormat5)
let outputFormat5 = engine5.outputNode.outputFormat(forBus: 0)
engine5.connect(engine5.mainMixerNode, to: engine5.outputNode, format: outputFormat5)

try! engine5.start()

let duration5 = Double(outputBuffer5.frameLength) / targetFormat5.sampleRate

player5.scheduleBuffer(outputBuffer5, completionHandler: nil)
player5.play()

// Wait for duration + buffer
Thread.sleep(forTimeInterval: duration5 + 0.5)

player5.stop()
engine5.stop()

print("✓ Test 5 complete")
print("")

// ============================================================
// SUMMARY
// ============================================================
print(String(repeating: "=", count: 70))
print("TEST COMPLETE")
print("")
print("RESULTS TO COMPARE:")
print("  Test 1: Baseline (direct say) - should sound best")
print("  Test 2: Engine no VPIO, auto resample - compare to Test 1")
print("  Test 3: Engine no VPIO, HQ resample - compare to Test 2")
print("  Test 4: Engine + VPIO, auto resample - CURRENT APP - compare to Tests 1-3")
print("  Test 5: Engine + VPIO, HQ resample - compare to Test 4")
print("")
print("KEY QUESTIONS:")
print("  • Did Tests 2-3 sound as good as Test 1? (isolates engine overhead)")
print("  • Did Test 4 sound worse than Tests 1-3? (isolates VPIO degradation)")
print("  • Did Test 5 sound better than Test 4? (isolates resampling quality)")
print("")
print("Resampling overhead: \(String(format: "%.1f", resampleTime * 1000))ms per chunk")
print("")

// Cleanup
try? FileManager.default.removeItem(atPath: testFile)
try? FileManager.default.removeItem(atPath: tempDir + "announce1.aiff")
try? FileManager.default.removeItem(atPath: tempDir + "announce2.aiff")
try? FileManager.default.removeItem(atPath: tempDir + "announce3.aiff")
try? FileManager.default.removeItem(atPath: tempDir + "announce4.aiff")
try? FileManager.default.removeItem(atPath: tempDir + "announce5.aiff")
