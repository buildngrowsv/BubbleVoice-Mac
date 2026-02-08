#!/usr/bin/env swift

import Foundation
import AVFoundation

// Quick test to see if microphone is capturing audio at all

print("🎤 Microphone Audio Level Test")
print("===============================")
print("")

let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode
let inputFormat = inputNode.outputFormat(forBus: 0)

print("Input format: \(inputFormat)")
print("Sample rate: \(inputFormat.sampleRate) Hz")
print("Channels: \(inputFormat.channelCount)")
print("")

var audioLevels: [Float] = []
var frameCount = 0

// Calculate RMS from buffer
func calculateRMS(buffer: AVAudioPCMBuffer) -> Float {
    guard let channelData = buffer.floatChannelData else { return 0.0 }
    let channelDataValue = channelData.pointee
    let frameLength = Int(buffer.frameLength)
    
    var sum: Float = 0.0
    for i in 0..<frameLength {
        let sample = channelDataValue[i]
        sum += sample * sample
    }
    
    return sqrt(sum / Float(frameLength))
}

// Install tap
inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { buffer, time in
    let rms = calculateRMS(buffer: buffer)
    audioLevels.append(rms)
    frameCount += 1
    
    // Print every 10 frames (~0.2 seconds at 48kHz)
    if frameCount % 10 == 0 {
        let avg = audioLevels.suffix(10).reduce(0, +) / 10.0
        let max = audioLevels.suffix(10).max() ?? 0.0
        
        // Visual bar
        let barLength = Int(max * 50)
        let bar = String(repeating: "█", count: min(barLength, 50))
        
        print("[\(String(format: "%05d", frameCount))] RMS: \(String(format: "%.6f", avg)) Max: \(String(format: "%.6f", max)) \(bar)")
    }
}

print("Starting audio engine...")
audioEngine.prepare()
try? audioEngine.start()

print("✅ Listening for 10 seconds...")
print("   💡 Make some noise, speak, or play audio near the microphone")
print("")

for i in 1...10 {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 1.0))
    if i % 2 == 0 {
        print("   \(i)s...")
    }
}

print("")
print("📊 Summary")
print("==========")

let overallAvg = audioLevels.reduce(0, +) / Float(audioLevels.count)
let overallMax = audioLevels.max() ?? 0.0

print("Total frames: \(frameCount)")
print("Average RMS: \(String(format: "%.6f", overallAvg))")
print("Max RMS: \(String(format: "%.6f", overallMax))")
print("")

if overallMax < 0.001 {
    print("❌ NO AUDIO DETECTED")
    print("   Microphone might be:")
    print("   - Muted or disabled")
    print("   - Not granted permission")
    print("   - Not working")
} else if overallMax < 0.01 {
    print("⚠️  VERY LOW AUDIO")
    print("   Audio is being captured but very quiet")
    print("   Try speaking louder or closer to mic")
} else {
    print("✅ AUDIO DETECTED")
    print("   Microphone is working!")
}

audioEngine.stop()
inputNode.removeTap(onBus: 0)
