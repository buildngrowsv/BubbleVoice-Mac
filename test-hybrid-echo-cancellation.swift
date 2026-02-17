/// test-hybrid-echo-cancellation.swift
///
/// PURPOSE: Tests if VPIO echo cancellation works when TTS is played via `afplay`
/// instead of routing through the AVAudioEngine. Also tests if we can disable
/// VPIO's audio ducking and AGC to preserve system audio volume.
///
/// ARCHITECTURE:
/// - AVAudioEngine with VPIO enabled on outputNode (for echo cancellation)
/// - AGC explicitly disabled via AudioUnit property
/// - Ducking set to minimum with advanced ducking enabled
/// - TTS played via `afplay` command (bypasses AVAudioEngine)
/// - SpeechAnalyzer + SFSpeechRecognizer both transcribe mic input
///
/// TEST PHASES:
/// 1. Phase 1 (10s): Baseline - listen to background audio (YouTube on Mac)
/// 2. Phase 2 (TTS + 3s): Play TTS via afplay while continuing to transcribe
/// 3. Phase 3 (8s): Listen after TTS ends
///
/// EXPECTED:
/// - Background audio (YouTube) should NOT be suppressed/ducked
/// - TTS should play at full quality/volume via afplay
/// - TTS words should NOT appear in transcription (if AEC works)
/// - Background audio should be transcribed throughout
///
/// HOW TO RUN:
/// swiftc -parse-as-library test-hybrid-echo-cancellation.swift -framework AVFoundation -framework Speech -o test-hybrid-echo && ./test-hybrid-echo

import AVFoundation
import AudioToolbox
import Foundation
import Speech

func setStdoutUnbuffered() {
    setbuf(stdout, nil)
}

func tlog(_ prefix: String, _ msg: String) {
    let ts = String(format: "%.2f", Date().timeIntervalSince1970.truncatingRemainder(dividingBy: 10000))
    print("[\(ts)] [\(prefix)] \(msg)")
    fflush(stdout)
}

@available(macOS 26.0, *)
class HybridEchoCancellationTest {
    // MARK: - Audio Engine
    var audioEngine = AVAudioEngine()
    
    // MARK: - SpeechAnalyzer (macOS 26+)
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var continuation: AsyncStream<AnalyzerInput>.Continuation?
    var resultTask: Task<Void, Error>?
    var analyzerFormat: AVAudioFormat?
    
    // MARK: - SFSpeechRecognizer (parallel verification)
    var sfRecognizer: SFSpeechRecognizer?
    var sfRequest: SFSpeechAudioBufferRecognitionRequest?
    var sfTask: SFSpeechRecognitionTask?
    
    // MARK: - Transcription State
    var analyzerTexts: [(phase: String, text: String, time: Date)] = []
    var sfTexts: [(phase: String, text: String, time: Date)] = []
    
    let ttsText = "The quick brown fox jumps over the lazy sleeping dog in the sunny meadow"
    var frameCount: Int64 = 0
    var currentPhase = "before"
    
    // MARK: - Run
    func run() async throws {
        setStdoutUnbuffered()
        
        print(String(repeating: "=", count: 70))
        print("  HYBRID Echo Cancellation Test")
        print("  VPIO on mic (AEC) + afplay for TTS (bypasses VPIO)")
        print("  AGC disabled, ducking minimized")
        print(String(repeating: "=", count: 70))
        print("")
        print("INSTRUCTIONS:")
        print("  1. Play a YouTube video WITH SPEECH on your Mac")
        print("  2. Set volume to a comfortable level")
        print("  3. Press Enter to start the test")
        print("")
        print("The test will:")
        print("  Phase 1 (10s): Listen to YouTube (verify transcription works)")
        print("  Phase 2 (~8s): Play TTS via afplay + continue listening")
        print("  Phase 3 (8s): Listen after TTS (verify recovery)")
        print("")
        print("Press Enter when YouTube is playing...")
        _ = readLine()
        print("")
        
        // ============================================================
        // STEP 1: Enable VPIO on outputNode
        // We enable on outputNode (not inputNode) to match the confirmed
        // working echo cancellation test. Enabling on either node enables
        // both — they share the same VPIO audio unit.
        // ============================================================
        tlog("SETUP", "Enabling VPIO on outputNode...")
        do {
            try audioEngine.outputNode.setVoiceProcessingEnabled(true)
            tlog("SETUP", "VPIO enabled: \(audioEngine.outputNode.isVoiceProcessingEnabled)")
        } catch {
            tlog("SETUP", "FAILED to enable VPIO: \(error)")
            return
        }
        
        // ============================================================
        // STEP 2: Disable AGC via AudioUnit property
        // VPIO's Automatic Gain Control compresses dynamic range and
        // can make audio sound "phone-like". Disabling it preserves
        // natural volume levels.
        //
        // We access the underlying AudioUnit from inputNode.audioUnit
        // and set kAUVoiceIOProperty_VoiceProcessingEnableAGC = 0.
        //
        // Source: stackoverflow.com/questions/15644871
        // Also: Apple Developer Forums thread/733733 confirms
        // "a slight gain change is expected" but AGC can be disabled.
        // ============================================================
        tlog("SETUP", "Disabling AGC on VPIO AudioUnit...")
        if let au = audioEngine.inputNode.audioUnit {
            var disableAGC: UInt32 = 0 // 0 = disable
            let status = AudioUnitSetProperty(
                au,
                kAUVoiceIOProperty_VoiceProcessingEnableAGC,
                kAudioUnitScope_Global,
                0,
                &disableAGC,
                UInt32(MemoryLayout<UInt32>.size)
            )
            if status == noErr {
                tlog("SETUP", "AGC disabled successfully")
            } else {
                tlog("SETUP", "WARNING: Failed to disable AGC, status: \(status)")
            }
        } else {
            tlog("SETUP", "WARNING: Could not access inputNode AudioUnit")
        }
        
        // ============================================================
        // STEP 3: Minimize ducking
        // enableAdvancedDucking:true = "only duck when voice activity
        // is detected from local/remote participants" (i.e., smart
        // ducking based on voice presence, not always-on).
        // duckingLevel:.min = minimum ducking amount.
        //
        // Without this, VPIO aggressively ducks ALL system audio to
        // ~1% volume. This was discovered when the user reported
        // YouTube volume dropping during and after voice sessions.
        // ============================================================
        tlog("SETUP", "Configuring ducking to minimum...")
        let duckingConfig = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
            enableAdvancedDucking: true,
            duckingLevel: .min
        )
        audioEngine.inputNode.voiceProcessingOtherAudioDuckingConfiguration = duckingConfig
        tlog("SETUP", "Ducking: advancedDucking=true, level=min")
        
        // ============================================================
        // STEP 4: Generate TTS audio file
        // ============================================================
        tlog("SETUP", "Generating TTS audio...")
        let ttsPath = "/tmp/hybrid_echo_test_tts.aiff"
        let ttsURL = URL(fileURLWithPath: ttsPath)
        try? FileManager.default.removeItem(at: ttsURL)
        
        let sayProcess = Process()
        sayProcess.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        sayProcess.arguments = ["-o", ttsPath, ttsText]
        try sayProcess.run()
        sayProcess.waitUntilExit()
        
        guard FileManager.default.fileExists(atPath: ttsPath) else {
            tlog("SETUP", "FAILED: TTS file not generated")
            return
        }
        
        let ttsAudioFile = try AVAudioFile(forReading: ttsURL)
        let ttsDuration = Double(ttsAudioFile.length) / ttsAudioFile.fileFormat.sampleRate
        tlog("SETUP", "TTS: \(String(format: "%.1f", ttsDuration))s, text: \"\(ttsText)\"")
        
        // ============================================================
        // STEP 5: Setup SpeechAnalyzer
        // ============================================================
        tlog("SETUP", "Setting up SpeechAnalyzer...")
        
        let locale = Locale(identifier: "en-US")
        let xTranscriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange]
        )
        self.transcriber = xTranscriber
        
        guard let bestFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [xTranscriber]) else {
            tlog("SETUP", "FAILED: no audio format")
            return
        }
        self.analyzerFormat = bestFormat
        tlog("SETUP", "Analyzer format: \(bestFormat)")
        
        let xAnalyzer = SpeechAnalyzer(modules: [xTranscriber])
        self.analyzer = xAnalyzer
        
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = cont
        
        // Result consumer
        resultTask = Task { [weak self] in
            guard let self else { return }
            for try await result in xTranscriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                let words = text.split(separator: " ").count
                let phase = self.currentPhase
                self.analyzerTexts.append((phase: phase, text: text, time: Date()))
                tlog("ANALYZER", "(\(phase)) \(words)w: \"\(text)\"")
            }
        }
        tlog("SETUP", "SpeechAnalyzer configured")
        
        // ============================================================
        // STEP 6: Setup SFSpeechRecognizer
        // ============================================================
        tlog("SETUP", "Setting up SFSpeechRecognizer...")
        
        if let rec = SFSpeechRecognizer(locale: locale), rec.isAvailable {
            self.sfRecognizer = rec
            
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            if rec.supportsOnDeviceRecognition {
                req.requiresOnDeviceRecognition = true
                tlog("SETUP", "SFSpeech: on-device mode")
            }
            self.sfRequest = req
            
            sfTask = rec.recognitionTask(with: req) { [weak self] result, error in
                guard let self, let r = result else { return }
                let text = r.bestTranscription.formattedString
                guard !text.isEmpty else { return }
                let words = text.split(separator: " ").count
                let phase = self.currentPhase
                self.sfTexts.append((phase: phase, text: text, time: Date()))
                tlog("SFSPEECH", "(\(phase)) \(words)w: \"\(text)\"")
            }
            tlog("SETUP", "SFSpeechRecognizer configured")
        } else {
            tlog("SETUP", "SFSpeechRecognizer not available")
        }
        
        // ============================================================
        // STEP 7: Setup mic tap
        // ============================================================
        tlog("SETUP", "Setting up mic tap...")
        
        let inputNode = audioEngine.inputNode
        let rawInputFormat = inputNode.outputFormat(forBus: 0)
        tlog("SETUP", "Raw input format: \(rawInputFormat)")
        
        // VPIO may return multichannel format — force mono Float32
        guard let tapFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: rawInputFormat.sampleRate,
            channels: 1,
            interleaved: false
        ) else {
            tlog("SETUP", "FAILED: Could not create tap format")
            return
        }
        
        guard let converter = AVAudioConverter(from: tapFormat, to: bestFormat) else {
            tlog("SETUP", "FAILED: Could not create converter")
            return
        }
        converter.primeMethod = .none
        
        tlog("SETUP", "Tap: \(tapFormat.sampleRate)Hz → \(bestFormat.sampleRate)Hz")
        
        // Explicit mixer → output connection (required with VPIO)
        let outputFormat = audioEngine.outputNode.outputFormat(forBus: 0)
        audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outputFormat)
        tlog("SETUP", "Mixer → Output connected: \(outputFormat)")
        
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) { [weak self] buffer, time in
            guard let self else { return }
            
            let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
            let outputCapacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * ratio))
            guard outputCapacity > 0,
                  let converted = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: outputCapacity)
            else { return }
            
            var error: NSError?
            var consumed = false
            converter.convert(to: converted, error: &error) { _, outStatus in
                if consumed {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                consumed = true
                outStatus.pointee = .haveData
                return buffer
            }
            
            guard error == nil, converted.frameLength > 0 else { return }
            
            let ts = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(bestFormat.sampleRate))
            self.frameCount += Int64(converted.frameLength)
            self.continuation?.yield(AnalyzerInput(buffer: converted, bufferStartTime: ts))
            
            // Also feed SFSpeechRecognizer
            self.sfRequest?.append(buffer)
        }
        tlog("SETUP", "Mic tap installed")
        
        // ============================================================
        // STEP 8: Start engine
        // ============================================================
        tlog("SETUP", "Starting audio engine...")
        audioEngine.prepare()
        try audioEngine.start()
        tlog("SETUP", "Engine running: \(audioEngine.isRunning)")
        tlog("SETUP", "VPIO enabled: \(audioEngine.outputNode.isVoiceProcessingEnabled)")
        
        try await xAnalyzer.start(inputSequence: stream)
        tlog("SETUP", "SpeechAnalyzer started")
        
        // ============================================================
        // PHASE 1: Baseline (10 seconds)
        // ============================================================
        print("")
        print(String(repeating: "=", count: 70))
        tlog("PHASE1", "BASELINE - Listening for 10 seconds WITHOUT TTS")
        tlog("PHASE1", "YouTube audio should be transcribed")
        tlog("PHASE1", "If YouTube volume dropped, ducking is NOT disabled")
        print(String(repeating: "=", count: 70))
        currentPhase = "before"
        try await Task.sleep(for: .seconds(10))
        
        // ============================================================
        // PHASE 2: TTS via afplay
        // ============================================================
        print("")
        print(String(repeating: "=", count: 70))
        tlog("PHASE2", "TTS PLAYING via afplay (\(String(format: "%.1f", ttsDuration))s + 3s buffer)")
        tlog("PHASE2", "TTS: \"\(ttsText)\"")
        tlog("PHASE2", "Playing through SYSTEM AUDIO (afplay), NOT through engine")
        tlog("PHASE2", "If AEC works: TTS should NOT appear in transcription")
        tlog("PHASE2", "YouTube should still be transcribed")
        print(String(repeating: "=", count: 70))
        currentPhase = "during"
        
        let afplayProcess = Process()
        afplayProcess.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        afplayProcess.arguments = [ttsPath]
        try afplayProcess.run()
        tlog("PHASE2", ">> afplay started")
        
        try await Task.sleep(for: .seconds(ttsDuration + 3.0))
        tlog("PHASE2", ">> Phase 2 complete")
        
        // ============================================================
        // PHASE 3: Post-TTS (8 seconds)
        // ============================================================
        print("")
        print(String(repeating: "=", count: 70))
        tlog("PHASE3", "POST-TTS - Listening for 8 seconds")
        tlog("PHASE3", "YouTube should still be transcribed")
        print(String(repeating: "=", count: 70))
        currentPhase = "after"
        try await Task.sleep(for: .seconds(8))
        
        // ============================================================
        // ANALYSIS
        // ============================================================
        print("")
        print(String(repeating: "=", count: 70))
        tlog("RESULTS", "TEST ANALYSIS")
        print(String(repeating: "=", count: 70))
        print("")
        
        // Phase counts
        let beforeCount = analyzerTexts.filter { $0.phase == "before" }.count
        let duringCount = analyzerTexts.filter { $0.phase == "during" }.count
        let afterCount = analyzerTexts.filter { $0.phase == "after" }.count
        let sfDuringCount = sfTexts.filter { $0.phase == "during" }.count
        
        tlog("RESULTS", "SpeechAnalyzer transcriptions: before=\(beforeCount) during=\(duringCount) after=\(afterCount)")
        tlog("RESULTS", "SFSpeech transcriptions during TTS: \(sfDuringCount)")
        print("")
        
        // Echo check
        let ttsWords = Set(ttsText.lowercased().split(separator: " ").map(String.init))
        // Remove common words that would match anything
        let commonWords: Set<String> = ["the", "in", "a", "an", "is", "it", "to", "and", "of", "for"]
        let distinctiveTTSWords = ttsWords.subtracting(commonWords)
        
        var analyzerEchoWords: Set<String> = []
        for entry in analyzerTexts where entry.phase == "during" {
            let words = Set(entry.text.lowercased().split(separator: " ").map(String.init))
            analyzerEchoWords.formUnion(words.intersection(distinctiveTTSWords))
        }
        
        var sfEchoWords: Set<String> = []
        for entry in sfTexts where entry.phase == "during" {
            let words = Set(entry.text.lowercased().split(separator: " ").map(String.init))
            sfEchoWords.formUnion(words.intersection(distinctiveTTSWords))
        }
        
        tlog("RESULTS", "Distinctive TTS words checked: \(Array(distinctiveTTSWords).sorted().joined(separator: ", "))")
        tlog("RESULTS", "SpeechAnalyzer echo words: \(analyzerEchoWords.isEmpty ? "NONE" : Array(analyzerEchoWords).sorted().joined(separator: ", "))")
        tlog("RESULTS", "SFSpeech echo words: \(sfEchoWords.isEmpty ? "NONE" : Array(sfEchoWords).sorted().joined(separator: ", "))")
        print("")
        
        // VERDICT
        print(String(repeating: "=", count: 70))
        
        if beforeCount == 0 {
            tlog("VERDICT", "WARNING: No transcriptions in Phase 1")
            tlog("VERDICT", "  YouTube may not be playing, or volume too low, or ducking killed it")
        }
        
        if analyzerEchoWords.count >= 3 || sfEchoWords.count >= 3 {
            tlog("VERDICT", "ECHO DETECTED - Hybrid AEC FAILED")
            tlog("VERDICT", "  VPIO cannot cancel echo from afplay (system audio)")
            tlog("VERDICT", "  Must route TTS through AVAudioEngine for AEC")
        } else if analyzerEchoWords.count > 0 || sfEchoWords.count > 0 {
            tlog("VERDICT", "PARTIAL ECHO - Minor leakage")
            tlog("VERDICT", "  A few TTS words leaked, hybrid AEC is partially effective")
        } else if duringCount > 0 || sfDuringCount > 0 {
            tlog("VERDICT", "NO ECHO DETECTED - Hybrid AEC WORKS!")
            tlog("VERDICT", "  Zero distinctive TTS words in transcription")
            tlog("VERDICT", "  Background audio was transcribed during TTS")
            tlog("VERDICT", "  Can use afplay for TTS + VPIO on mic for AEC!")
        } else {
            tlog("VERDICT", "INCONCLUSIVE - No transcriptions during TTS")
            tlog("VERDICT", "  Need louder background audio to confirm")
        }
        
        print(String(repeating: "=", count: 70))
        
        // Cleanup
        print("")
        tlog("CLEANUP", "Stopping engine...")
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        self.continuation?.finish()
        resultTask?.cancel()
        sfTask?.cancel()
        sfRequest?.endAudio()
        try? FileManager.default.removeItem(at: ttsURL)
        tlog("CLEANUP", "Test complete.")
    }
}

@main
struct HybridEchoTestEntryPoint {
    static func main() {
        if #available(macOS 26.0, *) {
            Task {
                do {
                    let test = HybridEchoCancellationTest()
                    try await test.run()
                } catch {
                    print("Test failed: \(error)")
                }
                exit(0)
            }
            RunLoop.main.run()
        } else {
            print("Requires macOS 26.0+")
            exit(1)
        }
    }
}
