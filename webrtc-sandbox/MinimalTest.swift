#!/usr/bin/env swift

import Foundation
import AVFoundation

print("Starting minimal test...")

// Just test TTS generation and playback
let ttsFile = "/tmp/minimal_test.aiff"
let ttsText = "This is a minimal test"

print("Generating TTS...")
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
process.arguments = ["-o", ttsFile, ttsText]
try? process.run()
process.waitUntilExit()

print("TTS generated")

guard let audioFile = try? AVAudioFile(forReading: URL(fileURLWithPath: ttsFile)) else {
    print("Failed to load audio file")
    exit(1)
}

print("Audio file loaded")

let audioEngine = AVAudioEngine()
let player = AVAudioPlayerNode()

audioEngine.attach(player)
audioEngine.connect(player, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)

print("Audio engine configured")

player.scheduleFile(audioFile, at: nil) {
    print("Playback completed")
}

audioEngine.prepare()
try? audioEngine.start()

print("Starting playback...")
player.play()

// Wait for playback
RunLoop.current.run(until: Date(timeIntervalSinceNow: 5.0))

print("Test complete")

audioEngine.stop()
try? FileManager.default.removeItem(atPath: ttsFile)
