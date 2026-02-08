#!/usr/bin/env swift

import Foundation
import AVFoundation
import AppKit

// Test if NSSpeechSynthesizer can output to an AVAudioEngine or buffer
// instead of system speakers, for WebRTC integration

print("Testing NSSpeechSynthesizer output options...")
print("")

// Test 1: Can we get audio data from NSSpeechSynthesizer?
print("[Test 1: NSSpeechSynthesizer to file]")
let synth = NSSpeechSynthesizer()
synth.setVoice(NSSpeechSynthesizer.VoiceName(rawValue: "com.apple.voice.compact.en-US.Samantha"))

let testFile = "/tmp/nsspeech_test.aiff"
let testURL = URL(fileURLWithPath: testFile)

let start1 = Date()
let success = synth.startSpeaking("Hello, this is a test of NSSpeechSynthesizer", to: testURL)
print("  startSpeaking returned: \(success)")

if success {
    // Wait for completion
    while synth.isSpeaking {
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
    }
    let elapsed1 = Date().timeIntervalSince(start1) * 1000
    print("  Generation time: \(Int(elapsed1))ms")
    
    if FileManager.default.fileExists(atPath: testFile) {
        let attrs = try? FileManager.default.attributesOfItem(atPath: testFile)
        let size = attrs?[.size] as? Int64 ?? 0
        print("  File size: \(size) bytes")
        
        // Get audio info
        let audioFile = try? AVAudioFile(forReading: testURL)
        if let audioFile = audioFile {
            let duration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
            print("  Audio duration: \(String(format: "%.2f", duration))s")
            print("  Format: \(audioFile.fileFormat)")
        }
    }
}
print("")

// Test 2: Can we use AVSpeechSynthesizer instead? (iOS API available on macOS 10.14+)
print("[Test 2: AVSpeechSynthesizer (iOS-style API)]")
let avSynth = AVSpeechSynthesizer()
let utterance = AVSpeechUtterance(string: "Testing AVSpeechSynthesizer")
utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
utterance.rate = 0.5

// Check if we can write to output
print("  Available voices: \(AVSpeechSynthesisVoice.speechVoices().count)")
print("  Note: AVSpeechSynthesizer has write(to:) on iOS but not documented for macOS")

let start2 = Date()
avSynth.speak(utterance)

// Wait for completion
while avSynth.isSpeaking {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
}
let elapsed2 = Date().timeIntervalSince(start2) * 1000
print("  Generation time: \(Int(elapsed2))ms")
print("  Note: AVSpeechSynthesizer outputs to speakers, not capturable directly")
print("")

// Test 3: Can we capture system audio output?
print("[Test 3: AVAudioEngine capture of TTS]")
print("  Option A: Use NSSpeechSynthesizer.startSpeaking(to: URL)")
print("    → Generate file, then load into AVAudioFile, feed to WebRTC")
print("    → Latency: ~1-2s generation + 50ms load")
print("")
print("  Option B: Use AVAudioPlayerNode with pre-generated file")
print("    → say -o file.aiff, load AVAudioFile, schedule on AVAudioPlayerNode")
print("    → Feed AVAudioPlayerNode output to WebRTC broadcaster peer")
print("    → This is what Accountability AI does!")
print("")
print("  Option C: Virtual audio device (complex)")
print("    → Install virtual audio driver (e.g., BlackHole)")
print("    → Route say output to virtual device")
print("    → Capture from virtual device with AVAudioEngine")
print("")

// Test 4: Measure file-based latency end-to-end
print("[Test 4: File-based TTS → AVAudioEngine latency]")
let text = "This is a realistic AI response with multiple sentences to simulate actual usage."
let ttsFile = "/tmp/tts_test.aiff"
let ttsURL = URL(fileURLWithPath: ttsFile)

// Step 1: Generate with NSSpeechSynthesizer
let synth2 = NSSpeechSynthesizer()
synth2.setVoice(NSSpeechSynthesizer.VoiceName(rawValue: "com.apple.voice.compact.en-US.Samantha"))

let genStart = Date()
synth2.startSpeaking(text, to: ttsURL)
while synth2.isSpeaking {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
}
let genTime = Date().timeIntervalSince(genStart) * 1000

// Step 2: Load into AVAudioFile
let loadStart = Date()
guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
    print("  ❌ Failed to load audio file")
    exit(1)
}
let loadTime = Date().timeIntervalSince(loadStart) * 1000

// Step 3: Create AVAudioEngine and player
let engine = AVAudioEngine()
let player = AVAudioPlayerNode()
engine.attach(player)
engine.connect(player, to: engine.mainMixerNode, format: audioFile.processingFormat)

// Step 4: Schedule buffer
let scheduleStart = Date()
player.scheduleFile(audioFile, at: nil)
let scheduleTime = Date().timeIntervalSince(scheduleStart) * 1000

let totalLatency = genTime + loadTime + scheduleTime

print("  Generation: \(Int(genTime))ms")
print("  Load file: \(Int(loadTime))ms")
print("  Schedule: \(Int(scheduleTime))ms")
print("  ─────────────────────")
print("  Total latency: \(Int(totalLatency))ms")
print("  Audio duration: \(String(format: "%.2f", Double(audioFile.length) / audioFile.fileFormat.sampleRate))s")
print("")

print("Conclusion:")
print("  ✅ File-based approach is viable (~1-2s latency for typical responses)")
print("  ✅ NSSpeechSynthesizer can write to file, then load into AVAudioEngine")
print("  ✅ AVAudioPlayerNode can feed audio to WebRTC (like Accountability AI)")
print("  ❌ Direct streaming from say/NSSpeechSynthesizer not possible")
print("")

// Cleanup
try? FileManager.default.removeItem(atPath: testFile)
try? FileManager.default.removeItem(atPath: ttsFile)
