#!/usr/bin/env swift

import Foundation
import AVFoundation

// MARK: - Echo Cancellation Test (Audio Level Based)
// Tests if microphone picks up speaker output by measuring audio levels

print("🎙️  Echo Cancellation Test (Audio Level Analysis)")
print("==================================================")
print("")

// MARK: - Configuration
let SAMPLE_RATE: Double = 48000
let BUFFER_SIZE: AVAudioFrameCount = 1024
let TEST_TTS_TEXT = "This is a test of the echo cancellation system. The AI is speaking at full volume for ten seconds."

// MARK: - Global State
var audioEngine = AVAudioEngine()
var ttsPlayer: AVAudioPlayerNode?
var micLevelsDuringTTS: [Float] = []
var micLevelsBeforeTTS: [Float] = []
var isRecording = false

// MARK: - Helper: Calculate RMS from audio buffer
func calculateRMS(buffer: AVAudioPCMBuffer) -> Float {
    guard let channelData = buffer.floatChannelData else { return 0.0 }
    let channelDataValue = channelData.pointee
    let frameLength = Int(buffer.frameLength)
    
    var sum: Float = 0.0
    for i in 0..<frameLength {
        let sample = channelDataValue[i]
        sum += sample * sample
    }
    
    let rms = sqrt(sum / Float(frameLength))
    return rms
}

// MARK: - Step 1: Generate TTS
print("🗣️  Step 1: Generating TTS audio...")
let ttsFile = "/tmp/echo_test.aiff"
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

// MARK: - Step 2: Set up Audio Engine
print("🎵 Step 2: Setting up AVAudioEngine...")

// Create player node for TTS
ttsPlayer = AVAudioPlayerNode()
audioEngine.attach(ttsPlayer!)
audioEngine.connect(ttsPlayer!, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)

// Get input node (microphone)
let inputNode = audioEngine.inputNode
let inputFormat = inputNode.outputFormat(forBus: 0)

print("   Input format: \(inputFormat)")
print("   Sample rate: \(inputFormat.sampleRate) Hz")
print("")

// Install tap to measure microphone levels
inputNode.installTap(onBus: 0, bufferSize: BUFFER_SIZE, format: inputFormat) { buffer, time in
    if isRecording {
        let rms = calculateRMS(buffer: buffer)
        micLevelsDuringTTS.append(rms)
    }
}

// Start audio engine
audioEngine.prepare()
do {
    try audioEngine.start()
    print("✅ Audio engine started")
} catch {
    print("❌ Failed to start audio engine: \(error.localizedDescription)")
    exit(1)
}

print("")

// MARK: - Step 3: Measure Baseline (Silence)
print("📊 Step 3: Measuring baseline microphone levels (3 seconds of silence)...")
print("   Please be quiet...")
print("")

isRecording = true
for i in 1...3 {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
    print("   \(i)s...")
}

micLevelsBeforeTTS = micLevelsDuringTTS
micLevelsDuringTTS = []

let baselineAvg = micLevelsBeforeTTS.reduce(0, +) / Float(micLevelsBeforeTTS.count)
let baselineMax = micLevelsBeforeTTS.max() ?? 0.0

print("   Baseline average: \(String(format: "%.6f", baselineAvg))")
print("   Baseline max: \(String(format: "%.6f", baselineMax))")
print("")

// MARK: - Step 4: Play TTS and Measure
print("🔊 Step 4: Playing TTS and measuring microphone levels...")
print("   (If echo cancellation works, mic levels should stay near baseline)")
print("   (If echo cancellation fails, mic levels will spike)")
print("")

// Schedule TTS playback
ttsPlayer?.scheduleFile(audioFile, at: nil) {
    print("   ✅ TTS playback completed")
}

ttsPlayer?.play()

// Measure during TTS
let measureDuration = Int(duration) + 1
for i in 1...measureDuration {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
    if i % 2 == 0 {
        print("   \(i)s / \(measureDuration)s")
    }
}

isRecording = false

print("")

// MARK: - Step 5: Analyze Results
print("📊 Step 5: Analyzing results...")
print("")

let duringAvg = micLevelsDuringTTS.reduce(0, +) / Float(micLevelsDuringTTS.count)
let duringMax = micLevelsDuringTTS.max() ?? 0.0

print("Results:")
print("───────────────────────────────")
print("Baseline (silence):")
print("  Average RMS: \(String(format: "%.6f", baselineAvg))")
print("  Max RMS:     \(String(format: "%.6f", baselineMax))")
print("")
print("During TTS playback:")
print("  Average RMS: \(String(format: "%.6f", duringAvg))")
print("  Max RMS:     \(String(format: "%.6f", duringMax))")
print("")

// Calculate ratio
let avgRatio = duringAvg / baselineAvg
let maxRatio = duringMax / baselineMax

print("Ratios (during/baseline):")
print("  Average: \(String(format: "%.2f", avgRatio))x")
print("  Max:     \(String(format: "%.2f", maxRatio))x")
print("")

// Determine if echo is present
if avgRatio > 3.0 || maxRatio > 5.0 {
    print("❌ ECHO DETECTED")
    print("")
    print("   Microphone levels increased significantly during TTS playback")
    print("   This means the microphone is picking up speaker output")
    print("   Echo cancellation is NOT working with current setup")
    print("")
    print("   Recommendations:")
    print("   - Implement WebRTC with RTCAudioDevice for hardware AEC")
    print("   - Use Voice Processing I/O (VPIO) audio unit")
    print("   - Route audio through WebRTC peers for built-in AEC")
} else if avgRatio > 1.5 {
    print("⚠️  POSSIBLE ECHO")
    print("")
    print("   Microphone levels increased moderately")
    print("   Some echo may be present, but not severe")
    print("   Consider testing with louder volume or closer microphone")
} else {
    print("✅ NO SIGNIFICANT ECHO")
    print("")
    print("   Microphone levels remained near baseline during TTS")
    print("   This could mean:")
    print("   - Echo cancellation is working")
    print("   - OR: Volume is too low / mic too far to pick up echo")
    print("   - OR: Using headphones (no echo to cancel)")
    print("")
    print("   To verify: Increase speaker volume and test again")
}

print("")
print("🏁 Test complete")
print("")

// MARK: - Cleanup
audioEngine.stop()
inputNode.removeTap(onBus: 0)
try? FileManager.default.removeItem(at: ttsURL)

print("💡 Next Steps:")
print("   1. If echo detected: Implement full WebRTC with AEC")
print("   2. Test with different volumes and mic positions")
print("   3. Test with headphones vs speakers")
print("   4. Test with Bluetooth devices")
print("")

exit(0)
