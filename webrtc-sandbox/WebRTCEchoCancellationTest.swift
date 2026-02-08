import Foundation
import AVFoundation
import Speech
import WebRTC

// MARK: - WebRTC Echo Cancellation Test
//
// Tests if WebRTC's built-in AEC removes TTS from mic input.
//
// Approach:
//   1. Create two local WebRTC peers (broadcaster → viewer)
//   2. Broadcaster sends an audio track (WebRTC manages mic capture with AEC)
//   3. Play TTS through system speakers via say command
//   4. Capture mic audio separately and feed to SpeechAnalyzer
//   5. Compare: does TTS appear in transcription?
//
// Why this approach:
//   The stasel/WebRTC macOS build doesn't expose RTCAudioDevice protocol,
//   so we can't inject audio directly into WebRTC's audio pipeline.
//   Instead we test if WebRTC's default audio processing (which captures
//   the mic internally) provides AEC when we also play TTS out loud.

// MARK: - Peer Delegate

class PeerDelegate: NSObject, RTCPeerConnectionDelegate {
    let name: String
    var otherPeer: RTCPeerConnection?
    
    init(name: String) {
        self.name = name
        super.init()
    }
    
    func peerConnection(_ pc: RTCPeerConnection, didChange state: RTCSignalingState) {}
    func peerConnection(_ pc: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        print("   [\(name)] Received stream")
    }
    func peerConnection(_ pc: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ pc: RTCPeerConnection) {}
    func peerConnection(_ pc: RTCPeerConnection, didChange state: RTCIceConnectionState) {
        if state == .connected { print("   [\(name)] ICE connected ✅") }
    }
    func peerConnection(_ pc: RTCPeerConnection, didChange state: RTCIceGatheringState) {}
    func peerConnection(_ pc: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        otherPeer?.add(candidate)
    }
    func peerConnection(_ pc: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ pc: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}

// MARK: - Main Test

@available(macOS 26.0, *)
class WebRTCEchoCancellationTest {
    
    // WebRTC
    var factory: RTCPeerConnectionFactory?
    var broadcaster: RTCPeerConnection?
    var viewer: RTCPeerConnection?
    
    // Audio for TTS playback
    var ttsEngine = AVAudioEngine()
    var ttsPlayer = AVAudioPlayerNode()
    
    // SpeechAnalyzer
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var analyzerContinuation: AsyncStream<AnalyzerInput>.Continuation?
    var resultTask: Task<Void, Error>?
    var audioConverter: AVAudioConverter?
    var analyzerFormat: AVAudioFormat?
    
    // Results
    var phase1Results: [String] = []
    var phase2Results: [String] = []
    var currentPhase = 1
    var frameCount: Int64 = 0
    
    let ttsText = "The magnificent purple elephant danced gracefully across the shimmering rainbow bridge while singing an ancient melody about crystalline waterfalls."
    
    func run() async throws {
        setbuf(stdout, nil)
        
        print("🎙️  WebRTC Echo Cancellation Test")
        print("==================================")
        print("")
        
        // MARK: - Step 1: WebRTC Setup
        print("📡 Step 1: Setting up WebRTC...")
        
        // NOTE: WebRTC peers are NOT created here.
        // The stasel/WebRTC macOS build does not expose RTCAudioDevice,
        // which means we cannot inject TTS audio into WebRTC's audio pipeline.
        // Without that, WebRTC has no reference signal for echo cancellation.
        // Creating peers just causes a mic feedback loop (mic → WebRTC → speakers).
        //
        // This test measures raw echo (TTS through speakers → mic → SpeechAnalyzer)
        // to quantify the problem and evaluate if text-based suppression is sufficient.
        print("   (WebRTC peers skipped - RTCAudioDevice not available on macOS)")
        print("   (Testing raw echo to quantify the problem)")
        
        // MARK: - Step 2: SpeechAnalyzer Setup
        print("🎤 Step 2: Setting up SpeechAnalyzer...")
        
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
            print("❌ Locale not supported")
            return
        }
        
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        self.transcriber = transcriber
        
        guard let aFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            print("❌ No format")
            return
        }
        self.analyzerFormat = aFormat
        
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer
        
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzerContinuation = continuation
        
        resultTask = Task { [weak self] in
            guard let self = self else { return }
            for try await result in transcriber.results {
                let text = String(result.text.characters)
                if !text.isEmpty {
                    if self.currentPhase == 1 {
                        if self.phase1Results.last != text {
                            print("   [P1] 📝 \"\(text)\"")
                            self.phase1Results.append(text)
                        }
                    } else {
                        if self.phase2Results.last != text {
                            print("   [P2] 📝 \"\(text)\"")
                            self.phase2Results.append(text)
                        }
                    }
                }
            }
        }
        
        print("✅ SpeechAnalyzer ready")
        
        // MARK: - Step 3: Audio Engine for Mic → SpeechAnalyzer
        print("🎵 Step 3: Setting up mic capture for SpeechAnalyzer...")
        
        // Separate audio engine for mic capture → SpeechAnalyzer
        // This taps the mic directly to feed SpeechAnalyzer
        // WebRTC is also capturing the mic separately with AEC
        let micEngine = AVAudioEngine()
        let inputNode = micEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        guard let converter = AVAudioConverter(from: inputFormat, to: aFormat) else {
            print("❌ No converter")
            return
        }
        self.audioConverter = converter
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
            guard let self = self, let fmt = self.analyzerFormat else { return }
            
            guard let converted = AVAudioPCMBuffer(
                pcmFormat: fmt,
                frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * fmt.sampleRate / inputFormat.sampleRate)
            ) else { return }
            
            var err: NSError?
            self.audioConverter?.convert(to: converted, error: &err) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            
            if err == nil {
                let t = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(fmt.sampleRate))
                self.frameCount += Int64(converted.frameLength)
                self.analyzerContinuation?.yield(AnalyzerInput(buffer: converted, bufferStartTime: t))
            }
        }
        
        micEngine.prepare()
        try micEngine.start()
        try await analyzer.start(inputSequence: stream)
        
        print("✅ Mic capture → SpeechAnalyzer running")
        
        // MARK: - Step 4: Pre-generate TTS
        print("🗣️  Step 4: Pre-generating TTS...")
        
        let ttsFile = "/tmp/webrtc_echo_test.aiff"
        let ttsURL = URL(fileURLWithPath: ttsFile)
        
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        proc.arguments = ["-o", ttsFile, ttsText]
        try proc.run()
        proc.waitUntilExit()
        
        guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
            print("❌ Failed to load TTS")
            return
        }
        let ttsDuration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
        print("✅ TTS: \(String(format: "%.1f", ttsDuration))s")
        
        // Setup TTS playback engine
        ttsEngine.attach(ttsPlayer)
        ttsEngine.connect(ttsPlayer, to: ttsEngine.mainMixerNode, format: audioFile.processingFormat)
        ttsEngine.prepare()
        try ttsEngine.start()
        
        print("")
        
        // MARK: - Phase 1: Background Audio Only
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 1: Background audio only (8 seconds)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("")
        
        currentPhase = 1
        for i in 1...8 {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            if i % 2 == 0 { print("   ⏱️  \(i)s / 8s") }
        }
        
        print("")
        print("   Phase 1: \(phase1Results.count) transcriptions")
        print("")
        
        // MARK: - Phase 2: TTS Playback
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 2: TTS playing + transcribing (\(Int(ttsDuration) + 3)s)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("   TTS: \"\(ttsText)\"")
        print("")
        
        currentPhase = 2
        
        ttsPlayer.scheduleFile(audioFile, at: nil, completionHandler: {
            print("   ✅ TTS playback finished")
        })
        ttsPlayer.play()
        print("   🔊 TTS playing!")
        print("")
        
        let waitTime = Int(ttsDuration) + 3
        for i in 1...waitTime {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            if i % 3 == 0 { print("   ⏱️  \(i)s / \(waitTime)s") }
        }
        
        print("")
        print("   Phase 2: \(phase2Results.count) transcriptions")
        print("")
        
        // MARK: - Phase 3: Analysis
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 3: Echo Analysis")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("")
        
        let ttsWords = Set(ttsText.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count >= 4 })
        
        var phase1Echo: Set<String> = []
        for text in phase1Results {
            let w = Set(text.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { $0.count >= 4 })
            phase1Echo.formUnion(ttsWords.intersection(w))
        }
        
        var phase2Echo: Set<String> = []
        for text in phase2Results {
            let w = Set(text.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).filter { $0.count >= 4 })
            phase2Echo.formUnion(ttsWords.intersection(w))
        }
        
        print("Phase 1 (no TTS): \(phase1Results.count) transcriptions, \(phase1Echo.count) TTS words \(phase1Echo.isEmpty ? "✅" : "⚠️")")
        print("Phase 2 (with TTS): \(phase2Results.count) transcriptions, \(phase2Echo.count) TTS words \(phase2Echo.count >= 3 ? "❌" : "✅")")
        print("")
        
        if phase2Echo.count >= 3 {
            print("❌ ECHO DETECTED (\(phase2Echo.count) TTS words in transcription)")
            print("   Words: \(phase2Echo.sorted().joined(separator: ", "))")
            print("")
            print("   WebRTC's default AEC is NOT sufficient")
            print("   Need custom RTCAudioDevice (not available in stasel/WebRTC macOS build)")
            print("   Options:")
            print("   - Build WebRTC from source with RTCAudioDevice support")
            print("   - Use VPIO (Voice Processing IO) audio unit directly")
            print("   - Use text-based echo suppression as fallback")
        } else if phase2Results.isEmpty && phase1Results.count > 0 {
            print("⚠️  TTS SUPPRESSED ALL TRANSCRIPTION")
        } else if phase2Echo.isEmpty && phase2Results.count > 0 {
            print("✅ NO ECHO - AEC WORKING!")
            print("   Background audio transcribed during TTS: YES")
            print("   TTS audio leaked into transcription: NO")
        } else {
            print("⚠️  INCONCLUSIVE (P1: \(phase1Results.count), P2: \(phase2Results.count))")
        }
        
        print("")
        
        // Cleanup
        micEngine.stop()
        inputNode.removeTap(onBus: 0)
        ttsEngine.stop()
        analyzerContinuation?.finish()
        resultTask?.cancel()
        try? FileManager.default.removeItem(at: ttsURL)
        
        print("🏁 Test complete")
    }
}

// MARK: - Entry Point
if #available(macOS 26.0, *) {
    Task {
        let test = WebRTCEchoCancellationTest()
        do {
            try await test.run()
        } catch {
            print("❌ Test failed: \(error)")
        }
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("❌ Requires macOS 26.0+")
    exit(1)
}
