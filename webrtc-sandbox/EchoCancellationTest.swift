import Foundation
import AVFoundation
import Speech

// MARK: - Echo Cancellation Test
// Tests if SpeechAnalyzer transcribes the say command audio coming from speakers
// while also transcribing background speech from another device.
//
// Phase 1: Transcribe background audio ONLY (no TTS) for 8 seconds
// Phase 2: Play TTS via say command while transcribing for 10 seconds
// Phase 3: Compare results - did TTS words leak into transcription?

@available(macOS 26.0, *)
class EchoCancellationTest {
    // Audio engine and nodes
    var audioEngine = AVAudioEngine()
    var ttsPlayer: AVAudioPlayerNode?
    
    // SpeechAnalyzer components
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var continuation: AsyncStream<AnalyzerInput>.Continuation?
    var resultTask: Task<Void, Error>?
    
    // Audio format conversion
    var converter: AVAudioConverter?
    var analyzerFormat: AVAudioFormat?
    
    // Results tracking
    var phase1Results: [String] = []  // Background audio only
    var phase2Results: [String] = []  // Background audio + TTS playing
    var currentPhase = 1
    var frameCount: Int64 = 0
    
    // TTS text - intentionally distinct words so we can detect echo
    let ttsText = "The magnificent purple elephant danced gracefully across the shimmering rainbow bridge while singing an ancient melody about crystalline waterfalls."
    
    func run() async throws {
        // Force stdout to flush immediately
        setbuf(stdout, nil)
        
        print("🎙️  Echo Cancellation Test")
        print("==========================")
        print("")
        print("This test will:")
        print("  Phase 1: Transcribe background audio only (8 seconds)")
        print("  Phase 2: Play TTS + transcribe simultaneously (12 seconds)")
        print("  Phase 3: Analyze if TTS words leaked into transcription")
        print("")
        print("Make sure background audio (speech) is playing from another device!")
        print("")
        fflush(stdout)
        
        // MARK: - Setup SpeechAnalyzer
        print("Setting up SpeechAnalyzer...")
        fflush(stdout)
        
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
        
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            print("❌ No analyzer format available")
            return
        }
        self.analyzerFormat = format
        
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer
        
        // Create input stream
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = continuation
        
        print("✅ SpeechAnalyzer ready (format: \(format))")
        print("")
        
        // MARK: - Setup Result Consumption
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
        
        // MARK: - Setup Audio Engine
        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        guard let converter = AVAudioConverter(from: inputFormat, to: format) else {
            print("❌ Cannot create audio converter")
            return
        }
        self.converter = converter
        
        // Install mic tap - feeds audio to SpeechAnalyzer
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
            guard let self = self,
                  let format = self.analyzerFormat else { return }
            
            guard let convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / inputFormat.sampleRate)
            ) else { return }
            
            var error: NSError?
            self.converter?.convert(to: convertedBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            
            if error == nil {
                let cmTime = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(format.sampleRate))
                self.frameCount += Int64(convertedBuffer.frameLength)
                self.continuation?.yield(AnalyzerInput(buffer: convertedBuffer, bufferStartTime: cmTime))
            }
        }
        
        // Pre-generate TTS file before starting engine so we can attach player
        print("Pre-generating TTS...")
        let ttsFile = "/tmp/echo_test_tts.aiff"
        let ttsURL = URL(fileURLWithPath: ttsFile)
        
        let genStart = Date()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        process.arguments = ["-o", ttsFile, ttsText]
        try process.run()
        process.waitUntilExit()
        let genTime = Date().timeIntervalSince(genStart) * 1000
        
        guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
            print("❌ Failed to load TTS file")
            return
        }
        let ttsDuration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
        print("   TTS pre-generated: \(Int(genTime))ms, duration: \(String(format: "%.1f", ttsDuration))s")
        
        // Attach player node BEFORE starting engine
        ttsPlayer = AVAudioPlayerNode()
        audioEngine.attach(ttsPlayer!)
        audioEngine.connect(ttsPlayer!, to: audioEngine.mainMixerNode, format: audioFile.processingFormat)
        
        // Start audio engine
        audioEngine.prepare()
        try audioEngine.start()
        
        // Start analyzer
        try await analyzer.start(inputSequence: stream)
        
        print("✅ Audio engine and analyzer running")
        print("")
        
        // MARK: - Phase 1: Background Audio Only
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 1: Transcribing background audio only")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("   (8 seconds - NO TTS playing)")
        print("")
        
        currentPhase = 1
        for i in 1...8 {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            if i % 2 == 0 { print("   ⏱️  \(i)s / 8s") }
        }
        
        print("")
        print("   Phase 1 complete: \(phase1Results.count) transcriptions")
        print("")
        
        // MARK: - Phase 2: TTS + Background Audio
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 2: Playing TTS + transcribing")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("   TTS: \"\(ttsText)\"")
        print("")
        
        currentPhase = 2
        
        print("   TTS duration: \(String(format: "%.1f", ttsDuration))s")
        
        // Schedule and play (already attached to engine)
        ttsPlayer?.scheduleFile(audioFile, at: nil, completionHandler: {
            print("   ✅ TTS playback finished")
        })
        ttsPlayer?.play()
        
        print("   🔊 TTS playing through speakers NOW!")
        print("")
        
        // Wait for TTS to finish + extra time
        let waitTime = Int(ttsDuration) + 3
        for i in 1...waitTime {
            try await Task.sleep(nanoseconds: 1_000_000_000)
            if i % 3 == 0 { print("   ⏱️  \(i)s / \(waitTime)s") }
        }
        
        print("")
        print("   Phase 2 complete: \(phase2Results.count) transcriptions")
        print("")
        
        // MARK: - Phase 3: Analysis
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Phase 3: Echo Analysis")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("")
        
        // Extract significant TTS words (4+ chars, unique)
        let ttsWords = Set(ttsText.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count >= 4 })
        
        print("TTS signature words: \(ttsWords.sorted().joined(separator: ", "))")
        print("")
        
        // Check Phase 1 for any accidental TTS words (should be 0)
        var phase1Echo: Set<String> = []
        for text in phase1Results {
            let words = Set(text.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count >= 4 })
            phase1Echo.formUnion(ttsWords.intersection(words))
        }
        
        // Check Phase 2 for TTS words (if echo, these will appear)
        var phase2Echo: Set<String> = []
        for text in phase2Results {
            let words = Set(text.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count >= 4 })
            phase2Echo.formUnion(ttsWords.intersection(words))
        }
        
        print("Phase 1 (no TTS):")
        print("  Transcriptions: \(phase1Results.count)")
        print("  TTS words found: \(phase1Echo.count) \(phase1Echo.isEmpty ? "✅" : "⚠️  \(phase1Echo.sorted().joined(separator: ", "))")")
        print("")
        
        print("Phase 2 (TTS playing):")
        print("  Transcriptions: \(phase2Results.count)")
        print("  TTS words found: \(phase2Echo.count) \(phase2Echo.isEmpty ? "✅" : "❌ \(phase2Echo.sorted().joined(separator: ", "))")")
        print("")
        
        // Final verdict
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("VERDICT")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("")
        
        if phase2Echo.count >= 3 {
            print("❌ ECHO DETECTED")
            print("   \(phase2Echo.count) TTS words appeared in transcription during playback")
            print("   Words: \(phase2Echo.sorted().joined(separator: ", "))")
            print("")
            print("   → WebRTC echo cancellation IS NEEDED")
            print("   → The microphone is picking up speaker output")
            print("   → SpeechAnalyzer cannot distinguish user speech from TTS")
        } else if phase2Results.isEmpty && phase1Results.count > 0 {
            print("⚠️  TTS SUPPRESSED ALL TRANSCRIPTION")
            print("   Background audio was transcribed in Phase 1 but not Phase 2")
            print("   TTS playback may be overwhelming the microphone or SpeechAnalyzer")
            print("")
            print("   → WebRTC echo cancellation IS NEEDED")
            print("   → Even without echo, TTS is blocking transcription")
        } else if phase2Results.isEmpty && phase1Results.isEmpty {
            print("⚠️  NO TRANSCRIPTION IN EITHER PHASE")
            print("   No background audio was detected")
            print("   Make sure speech is playing from another device!")
        } else if phase2Echo.count > 0 {
            print("⚠️  MINOR ECHO DETECTED")
            print("   \(phase2Echo.count) TTS word(s) appeared: \(phase2Echo.sorted().joined(separator: ", "))")
            print("   This could be coincidence or minor echo leakage")
            print("")
            print("   → WebRTC echo cancellation RECOMMENDED")
        } else {
            print("✅ NO ECHO DETECTED")
            print("   Background audio was transcribed in both phases")
            print("   TTS words did NOT leak into transcription")
            print("")
            print("   → Echo cancellation may not be needed!")
            print("   → But test with higher volume to be sure")
        }
        
        print("")
        
        // MARK: - Cleanup
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        self.continuation?.finish()
        resultTask?.cancel()
        try? FileManager.default.removeItem(at: ttsURL)
        
        print("🏁 Test complete")
    }
}

// MARK: - Entry Point
if #available(macOS 26.0, *) {
    Task {
        let test = EchoCancellationTest()
        do {
            try await test.run()
        } catch {
            print("❌ Test failed: \(error.localizedDescription)")
        }
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("❌ Requires macOS 26.0+")
    exit(1)
}
