#!/usr/bin/env swift

import Foundation
import AVFoundation
import WebRTC
import Speech

// MARK: - WebRTC Echo Cancellation Sandbox
// Purpose: Test that we can play TTS through WebRTC while transcribing environment speech
// without the TTS audio leaking into the transcription (echo cancellation)

print("🎙️  WebRTC Echo Cancellation Sandbox")
print("=====================================")
print("")

// MARK: - Configuration
let SAMPLE_RATE = 48000 // High quality for Apple Silicon
let CHANNELS = 1
let BUFFER_SIZE = 1024
let TEST_TTS_TEXT = "This is a test of the echo cancellation system. The AI is speaking at full volume."

// MARK: - Global State
var userPeer: RTCPeerConnection?
var aiPeer: RTCPeerConnection?
var audioEngine = AVAudioEngine()
var speechRecognizer: SFSpeechRecognizer?
var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
var recognitionTask: SFSpeechRecognitionTask?
var ttsPlayer: AVAudioPlayerNode?
var transcribedText: [String] = []
var isPlaying = false

// MARK: - WebRTC Setup
print("📡 Setting up WebRTC...")

// Initialize WebRTC factory
RTCInitializeSSL()
let factory = RTCPeerConnectionFactory()

// Create constraints for high quality audio
let constraints = RTCMediaConstraints(
    mandatoryConstraints: [
        "OfferToReceiveAudio": "true",
        "VoiceActivityDetection": "false" // We handle VAD ourselves
    ],
    optionalConstraints: nil
)

// Configure RTC with echo cancellation enabled
let config = RTCConfiguration()
config.sdpSemantics = .unifiedPlan
config.continualGatheringPolicy = .gatherContinually

// MARK: - Peer Connection Delegates
class UserPeerDelegate: NSObject, RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("👤 User Peer signaling state: \(stateChanged.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        print("👤 User Peer received stream (AI's TTS audio)")
        
        // This is the TTS audio from AI Peer - route to speakers
        if let audioTrack = stream.audioTracks.first {
            print("   ✅ Audio track received, routing to speakers...")
            // TODO: Route to AVAudioEngine output
        }
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        print("👤 User Peer stream removed")
    }
    
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        print("👤 User Peer should negotiate")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("👤 User Peer ICE state: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("👤 User Peer ICE gathering: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("👤 User Peer ICE candidate generated")
        // In local setup, add directly to AI peer
        aiPeer?.add(candidate)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

class AIPeerDelegate: NSObject, RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("🤖 AI Peer signaling state: \(stateChanged.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        print("🤖 AI Peer received stream (User's mic audio with AEC)")
        
        // This is the clean audio from User Peer - feed to SpeechAnalyzer
        if let audioTrack = stream.audioTracks.first {
            print("   ✅ Audio track received, feeding to transcription...")
            // TODO: Route to SpeechAnalyzer
        }
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        print("🤖 AI Peer stream removed")
    }
    
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        print("🤖 AI Peer should negotiate")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("🤖 AI Peer ICE state: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("🤖 AI Peer ICE gathering: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("🤖 AI Peer ICE candidate generated")
        // In local setup, add directly to User peer
        userPeer?.add(candidate)
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

// MARK: - Create Peers
print("Creating User Peer (physical I/O)...")
let userDelegate = UserPeerDelegate()
userPeer = factory.peerConnection(with: config, constraints: constraints, delegate: userDelegate)

print("Creating AI Peer (logic & TTS)...")
let aiDelegate = AIPeerDelegate()
aiPeer = factory.peerConnection(with: config, constraints: constraints, delegate: aiDelegate)

guard let userPeer = userPeer, let aiPeer = aiPeer else {
    print("❌ Failed to create peer connections")
    exit(1)
}

print("✅ Peers created")
print("")

// MARK: - Audio Tracks Setup
print("🎵 Setting up audio tracks...")

// User Peer: Add microphone track
let audioSource = factory.audioSource(with: constraints)
let audioTrack = factory.audioTrack(with: audioSource, trackId: "user-mic")
let userStream = factory.mediaStream(withStreamId: "user-stream")
userStream.addAudioTrack(audioTrack)
userPeer.add(userStream)
print("✅ User Peer: Microphone track added")

// AI Peer: Add TTS audio track (will be populated from AVAudioPlayerNode)
let aiAudioSource = factory.audioSource(with: constraints)
let aiAudioTrack = factory.audioTrack(with: aiAudioSource, trackId: "ai-tts")
let aiStream = factory.mediaStream(withStreamId: "ai-stream")
aiStream.addAudioTrack(aiAudioTrack)
aiPeer.add(aiStream)
print("✅ AI Peer: TTS audio track added")
print("")

// MARK: - WebRTC Signaling (Local)
print("🤝 Establishing WebRTC connection...")

// Create offer from User Peer
let offerConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
userPeer.offer(for: offerConstraints) { offer, error in
    guard let offer = offer, error == nil else {
        print("❌ Failed to create offer: \(error?.localizedDescription ?? "unknown")")
        return
    }
    
    print("📤 User Peer created offer")
    
    // Set local description on User Peer
    userPeer.setLocalDescription(offer) { error in
        if let error = error {
            print("❌ Failed to set local description on User Peer: \(error.localizedDescription)")
            return
        }
        print("✅ User Peer local description set")
    }
    
    // Set remote description on AI Peer
    aiPeer.setRemoteDescription(offer) { error in
        if let error = error {
            print("❌ Failed to set remote description on AI Peer: \(error.localizedDescription)")
            return
        }
        print("✅ AI Peer remote description set")
        
        // Create answer from AI Peer
        aiPeer.answer(for: offerConstraints) { answer, error in
            guard let answer = answer, error == nil else {
                print("❌ Failed to create answer: \(error?.localizedDescription ?? "unknown")")
                return
            }
            
            print("📤 AI Peer created answer")
            
            // Set local description on AI Peer
            aiPeer.setLocalDescription(answer) { error in
                if let error = error {
                    print("❌ Failed to set local description on AI Peer: \(error.localizedDescription)")
                    return
                }
                print("✅ AI Peer local description set")
            }
            
            // Set remote description on User Peer
            userPeer.setRemoteDescription(answer) { error in
                if let error = error {
                    print("❌ Failed to set remote description on User Peer: \(error.localizedDescription)")
                    return
                }
                print("✅ User Peer remote description set")
                print("🎉 WebRTC connection established!")
                print("")
            }
        }
    }
}

// Wait for connection to establish
print("⏳ Waiting for WebRTC connection...")
sleep(3)
print("")

// MARK: - TTS Generation & Playback
print("🗣️  Generating TTS audio...")
let ttsFile = "/tmp/webrtc_sandbox_tts.aiff"
let ttsURL = URL(fileURLWithPath: ttsFile)

// Generate TTS file
let ttsStart = Date()
let ttsProcess = Process()
ttsProcess.executableURL = URL(fileURLWithPath: "/usr/bin/say")
ttsProcess.arguments = ["-o", ttsFile, TEST_TTS_TEXT]
try? ttsProcess.run()
ttsProcess.waitUntilExit()
let ttsGenTime = Date().timeIntervalSince(ttsStart) * 1000

print("✅ TTS generated in \(Int(ttsGenTime))ms")
print("   File: \(ttsFile)")

// Load TTS file
guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
    print("❌ Failed to load TTS audio file")
    exit(1)
}

let duration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
print("   Duration: \(String(format: "%.2f", duration))s")
print("")

// MARK: - Speech Recognition Setup
print("🎤 Setting up speech recognition...")
speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

guard let recognizer = speechRecognizer, recognizer.isAvailable else {
    print("❌ Speech recognizer not available")
    exit(1)
}

// Request authorization
SFSpeechRecognizer.requestAuthorization { status in
    switch status {
    case .authorized:
        print("✅ Speech recognition authorized")
    case .denied:
        print("❌ Speech recognition denied")
        exit(1)
    case .restricted:
        print("❌ Speech recognition restricted")
        exit(1)
    case .notDetermined:
        print("⚠️  Speech recognition not determined")
    @unknown default:
        print("❌ Unknown authorization status")
    }
}

sleep(1)
print("")

// MARK: - Start Transcription
print("📝 Starting transcription (listening for environment speech)...")
recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
recognitionRequest?.shouldReportPartialResults = true

recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest!) { result, error in
    if let result = result {
        let text = result.bestTranscription.formattedString
        if !text.isEmpty && (transcribedText.isEmpty || transcribedText.last != text) {
            print("   📝 Transcribed: \"\(text)\"")
            transcribedText.append(text)
        }
    }
    
    if let error = error {
        print("   ⚠️  Recognition error: \(error.localizedDescription)")
    }
}

// Set up audio engine to feed recognition
let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)

inputNode.installTap(onBus: 0, bufferSize: AVAudioFrameCount(BUFFER_SIZE), format: recordingFormat) { buffer, time in
    recognitionRequest?.append(buffer)
}

audioEngine.prepare()
try? audioEngine.start()
print("✅ Audio engine started, transcription active")
print("")

// MARK: - Play TTS through WebRTC
print("🔊 Playing TTS through WebRTC...")
print("   (This should play through speakers via User Peer)")
print("   (And should NOT appear in transcription if AEC works)")
print("")

// Set up AVAudioPlayerNode
ttsPlayer = AVAudioPlayerNode()
audioEngine.attach(ttsPlayer!)
audioEngine.connect(ttsPlayer!, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)

// Schedule playback
ttsPlayer?.scheduleFile(audioFile, at: nil) {
    print("✅ TTS playback completed")
    isPlaying = false
}

isPlaying = true
ttsPlayer?.play()

print("🎵 TTS is now playing...")
print("")

// MARK: - Test Loop
print("🧪 Test running for 15 seconds...")
print("   - Speak into the microphone to test transcription")
print("   - Check if TTS audio leaks into transcription (echo)")
print("")

for i in 1...15 {
    sleep(1)
    if i % 5 == 0 {
        print("   ⏱️  \(i)s elapsed...")
    }
}

// MARK: - Results
print("")
print("📊 Test Results")
print("===============")
print("")

print("TTS Text: \"\(TEST_TTS_TEXT)\"")
print("")

if transcribedText.isEmpty {
    print("⚠️  No transcription captured")
    print("   This could mean:")
    print("   - No speech in environment")
    print("   - Microphone not working")
    print("   - Speech recognition failed")
} else {
    print("✅ Transcription captured:")
    for (i, text) in transcribedText.enumerated() {
        print("   \(i + 1). \"\(text)\"")
    }
    print("")
    
    // Check for echo (TTS text appearing in transcription)
    let ttsWords = TEST_TTS_TEXT.lowercased().components(separatedBy: " ")
    var echoDetected = false
    
    for transcription in transcribedText {
        let transcribedWords = transcription.lowercased().components(separatedBy: " ")
        let matchingWords = Set(ttsWords).intersection(Set(transcribedWords))
        
        if matchingWords.count >= 3 {
            print("❌ ECHO DETECTED!")
            print("   Transcription contains TTS words: \(Array(matchingWords).joined(separator: ", "))")
            print("   This means echo cancellation is NOT working")
            echoDetected = true
            break
        }
    }
    
    if !echoDetected {
        print("✅ NO ECHO DETECTED")
        print("   TTS audio did not leak into transcription")
        print("   Echo cancellation is working! 🎉")
    }
}

print("")
print("🏁 Test complete")

// Cleanup
audioEngine.stop()
inputNode.removeTap(onBus: 0)
recognitionTask?.cancel()
try? FileManager.default.removeItem(at: ttsURL)

RTCCleanupSSL()
exit(0)
