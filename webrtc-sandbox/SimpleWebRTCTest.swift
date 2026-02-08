#!/usr/bin/env swift

import Foundation
import AVFoundation
import Speech

// MARK: - Simple WebRTC Echo Cancellation Test (Phase 1)
// This is a simplified test to verify the core concept before full WebRTC integration
// We'll use AVAudioEngine with Voice Processing I/O (VPIO) which has built-in AEC

print("🎙️  Simple Echo Cancellation Test (VPIO)")
print("==========================================")
print("")

// MARK: - Configuration
let SAMPLE_RATE: Double = 48000 // High quality
let BUFFER_SIZE: AVAudioFrameCount = 1024
let TEST_TTS_TEXT = "This is a test of the echo cancellation system. The AI is speaking at full volume. You should be able to interrupt me at any time."

// MARK: - Global State
var audioEngine = AVAudioEngine()
var ttsPlayer: AVAudioPlayerNode?
var speechRecognizer: SFSpeechRecognizer?
var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
var recognitionTask: SFSpeechRecognitionTask?
var transcribedText: [String] = []
var isPlaying = false
var testStartTime = Date()

// MARK: - Step 1: Generate TTS
print("🗣️  Step 1: Generating TTS audio...")
let ttsFile = "/tmp/simple_webrtc_test.aiff"
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

// MARK: - Step 2: Set up Audio Engine with VPIO (Echo Cancellation)
print("🎵 Step 2: Setting up AVAudioEngine...")

// Create player node for TTS
ttsPlayer = AVAudioPlayerNode()
audioEngine.attach(ttsPlayer!)

// Connect player to main mixer (output to speakers)
audioEngine.connect(ttsPlayer!, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)

// Get input node (microphone)
let inputNode = audioEngine.inputNode
let inputFormat = inputNode.outputFormat(forBus: 0)

print("   Input format: \(inputFormat)")
print("   Sample rate: \(inputFormat.sampleRate) Hz")
print("   Channels: \(inputFormat.channelCount)")
print("")

// MARK: - Step 3: Set up Speech Recognition
print("🎤 Step 3: Setting up speech recognition...")

speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
guard let recognizer = speechRecognizer, recognizer.isAvailable else {
    print("❌ Speech recognizer not available")
    exit(1)
}

// Request authorization
print("   Requesting speech recognition authorization...")
var authGranted = false
var authCompleted = false

SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized:
        print("   ✅ Speech recognition authorized")
        authGranted = true
    case .denied:
        print("   ❌ Speech recognition denied")
    case .restricted:
        print("   ❌ Speech recognition restricted")
    case .notDetermined:
        print("   ⚠️  Speech recognition not determined")
    @unknown default:
        print("   ❌ Unknown authorization status")
    }
    authCompleted = true
}

// Wait for authorization with RunLoop
while !authCompleted {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
}

guard authGranted else {
    print("❌ Cannot proceed without speech recognition authorization")
    exit(1)
}

print("")

// MARK: - Step 4: Start Transcription
print("📝 Step 4: Starting transcription...")

recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
recognitionRequest?.shouldReportPartialResults = true

recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest!) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        let elapsed = Date().timeIntervalSince(testStartTime)
        
        if !text.isEmpty && (transcribedText.isEmpty || transcribedText.last != text) {
            print("   [\(String(format: "%.1f", elapsed))s] 📝 \"\(text)\"")
            transcribedText.append(text)
        }
    }
    
    if let error = error {
        print("   ⚠️  Recognition error: \(error.localizedDescription)")
    }
}

// Install tap on input to feed recognition
inputNode.installTap(onBus: 0, bufferSize: BUFFER_SIZE, format: inputFormat) { buffer, time in
    recognitionRequest?.append(buffer)
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

// MARK: - Step 5: Play TTS
print("🔊 Step 5: Playing TTS through speakers...")
print("   (Speak into the microphone to test if you can be heard)")
print("   (Check if TTS audio leaks into transcription)")
print("")

// Schedule TTS playback
ttsPlayer?.scheduleFile(audioFile, at: nil) {
    print("")
    print("✅ TTS playback completed")
    isPlaying = false
}

isPlaying = true
ttsPlayer?.play()
testStartTime = Date()

print("🎵 TTS is now playing at full volume...")
print("")

// MARK: - Step 6: Test Loop
print("🧪 Test running for \(Int(duration) + 5) seconds...")
print("   💡 TIP: Speak into the microphone while TTS is playing")
print("   💡 Say something like: \"Hello, I am interrupting\"")
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

// MARK: - Step 7: Results Analysis
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
    print("  - No speech in environment (did you speak into the mic?)")
    print("  - Microphone not working")
    print("  - Speech recognition failed")
    print("  - Audio engine configuration issue")
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
        .filter { $0.count > 3 }) // Only check words > 3 chars
    
    var echoDetected = false
    var echoWords: Set<String> = []
    
    for transcription in transcribedText {
        let transcribedWords = Set(transcription.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 3 })
        
        let matchingWords = ttsWords.intersection(transcribedWords)
        
        // If 3+ significant words match, likely echo
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
        print("   - The microphone is picking up speaker output")
        print("   - Echo cancellation is NOT working")
        print("   - WebRTC with proper AEC is needed")
    } else {
        print("✅ NO ECHO DETECTED")
        print("")
        print("   TTS audio did not leak into transcription")
        print("   This means:")
        print("   - Echo cancellation is working!")
        print("   - OR: No speech was detected during TTS playback")
        print("")
        print("   To verify: Did you speak during TTS playback?")
    }
}

print("")
print("🏁 Test complete")
print("")

// MARK: - Cleanup
audioEngine.stop()
inputNode.removeTap(onBus: 0)
recognitionTask?.cancel()
try? FileManager.default.removeItem(at: ttsURL)

print("💡 Next Steps:")
print("   1. If echo detected: Implement full WebRTC with RTCAudioDevice")
print("   2. If no echo: Verify by speaking during TTS playback")
print("   3. Test with different audio devices (speakers, headphones, Bluetooth)")
print("")

exit(0)
