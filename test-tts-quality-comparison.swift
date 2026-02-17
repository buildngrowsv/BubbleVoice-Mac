#!/usr/bin/env swift

/**
 * TTS QUALITY COMPARISON TEST
 *
 * Tests different approaches to playing TTS audio to identify why
 * the app's TTS sounds degraded compared to terminal `say` command.
 *
 * TESTS:
 * 1. Direct `say` command (baseline - sounds good)
 * 2. `say -o` + afplay (should match baseline)
 * 3. `say -o` + AVAudioPlayerNode WITHOUT VPIO (isolate VPIO effect)
 * 4. `say -o` + AVAudioPlayerNode WITH VPIO (current app behavior)
 *
 * HYPOTHESIS: VPIO's voice processing (noise suppression, AGC) is
 * degrading TTS quality because it's optimized for human voice, not
 * synthesized speech.
 *
 * RUN: swift test-tts-quality-comparison.swift
 */

import AVFoundation
import Foundation

let testText = "This is a test of audio quality. The quick brown fox jumps over the lazy dog."
let testRate = 200

print("🎤 TTS Quality Comparison Test")
print(String(repeating: "=", count: 60))
print("")

// ============================================================
// TEST 1: Direct `say` command (baseline)
// ============================================================
print("TEST 1: Direct `say` command (baseline)")
print("This should sound clear and natural.")
print("Playing in 2 seconds...")
Thread.sleep(forTimeInterval: 2.0)

let directSay = Process()
directSay.executableURL = URL(fileURLWithPath: "/usr/bin/say")
directSay.arguments = ["-r", "\(testRate)", testText]
try! directSay.run()
directSay.waitUntilExit()

print("✓ Test 1 complete")
print("")
Thread.sleep(forTimeInterval: 1.0)

// ============================================================
// TEST 2: `say -o` + afplay
// ============================================================
print("TEST 2: `say -o` + afplay")
print("This should match Test 1 (file playback via afplay).")
print("Playing in 2 seconds...")
Thread.sleep(forTimeInterval: 2.0)

let fileURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("tts_test.aiff")
try? FileManager.default.removeItem(at: fileURL)

let generateSay = Process()
generateSay.executableURL = URL(fileURLWithPath: "/usr/bin/say")
generateSay.arguments = ["-o", fileURL.path, "-r", "\(testRate)", testText]
try! generateSay.run()
generateSay.waitUntilExit()

let afplay = Process()
afplay.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
afplay.arguments = [fileURL.path]
try! afplay.run()
afplay.waitUntilExit()

print("✓ Test 2 complete")
print("")
Thread.sleep(forTimeInterval: 1.0)

// ============================================================
// TEST 3: AVAudioPlayerNode WITHOUT VPIO
// ============================================================
print("TEST 3: AVAudioPlayerNode WITHOUT VPIO")
print("This isolates AVAudioEngine playback without voice processing.")
print("Playing in 2 seconds...")
Thread.sleep(forTimeInterval: 2.0)

let engine3 = AVAudioEngine()
let player3 = AVAudioPlayerNode()

engine3.attach(player3)
engine3.connect(player3, to: engine3.mainMixerNode, format: nil)

// Connect mixer to output WITHOUT VPIO
let outputFormat3 = engine3.outputNode.outputFormat(forBus: 0)
engine3.connect(engine3.mainMixerNode, to: engine3.outputNode, format: outputFormat3)

try! engine3.start()

let audioFile3 = try! AVAudioFile(forReading: fileURL)
player3.scheduleFile(audioFile3, at: nil, completionHandler: nil)
player3.play()

// Wait for playback to finish
while player3.isPlaying {
    Thread.sleep(forTimeInterval: 0.1)
}

engine3.stop()

print("✓ Test 3 complete")
print("")
Thread.sleep(forTimeInterval: 1.0)

// ============================================================
// TEST 4: AVAudioPlayerNode WITH VPIO
// ============================================================
print("TEST 4: AVAudioPlayerNode WITH VPIO")
print("This matches the app's current behavior.")
print("Playing in 2 seconds...")
Thread.sleep(forTimeInterval: 2.0)

let engine4 = AVAudioEngine()
let player4 = AVAudioPlayerNode()

engine4.attach(player4)

// Enable VPIO on output node
try! engine4.outputNode.setVoiceProcessingEnabled(true)
print("  → VPIO enabled")

// Configure VPIO to minimize ducking (if available on this macOS version)
if #available(macOS 14.0, *) {
    let duckingConfig = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
        enableAdvancedDucking: true,
        duckingLevel: .min
    )
    engine4.inputNode.voiceProcessingOtherAudioDuckingConfiguration = duckingConfig
    print("  → Ducking minimized")
} else {
    print("  → Ducking config not available (macOS < 14)")
}

// Connect with VPIO format
let outputFormat4 = engine4.outputNode.outputFormat(forBus: 0)
engine4.connect(engine4.mainMixerNode, to: engine4.outputNode, format: outputFormat4)
engine4.connect(player4, to: engine4.mainMixerNode, format: nil)
print("  → Format: \(outputFormat4)")

try! engine4.start()

let audioFile4 = try! AVAudioFile(forReading: fileURL)
player4.scheduleFile(audioFile4, at: nil, completionHandler: nil)
player4.play()

// Wait for playback to finish
while player4.isPlaying {
    Thread.sleep(forTimeInterval: 0.1)
}

engine4.stop()

print("✓ Test 4 complete")
print("")

// ============================================================
// RESULTS
// ============================================================
print(String(repeating: "=", count: 60))
print("TEST COMPLETE")
print("")
print("EXPECTED RESULTS:")
print("  Test 1 (direct say): Clear, natural")
print("  Test 2 (say -o + afplay): Same as Test 1")
print("  Test 3 (AVAudioPlayerNode no VPIO): Same as Test 1-2")
print("  Test 4 (AVAudioPlayerNode + VPIO): Degraded/muffled if VPIO is the cause")
print("")
print("If Test 4 sounds worse than Tests 1-3, then VPIO is degrading TTS quality.")
print("")

// Cleanup
try? FileManager.default.removeItem(at: fileURL)
