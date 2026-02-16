/// PostTTSRecoveryStrategiesTest.swift
///
/// Tests FOUR strategies to solve a ~25-second SpeechAnalyzer stall after VPIO TTS playback.
///
/// RESOLUTION (2026-02-09):
/// The 25-second stall was caused by missing `.fastResults` in SpeechTranscriber's
/// reportingOptions, NOT by VPIO interaction. With `.fastResults` enabled, ALL strategies
/// (including baseline / do-nothing) recover in under 0.5 seconds. No special post-TTS
/// strategy is needed. See 1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md.
///
/// ORIGINAL PROBLEM (now resolved):
/// After TTS audio plays through AVAudioPlayerNode with VPIO echo cancellation,
/// SpeechAnalyzer stopped producing results for ~25 seconds. This was because without
/// `.fastResults`, the analyzer batched results in ~3.8s chunks and the post-TTS
/// "recalibration" took much longer.
///
/// STRATEGIES TESTED:
///   A) SILENT KEEPALIVE: After TTS finishes, immediately play a short silent audio buffer
///      on loop through the playerNode. Theory: VPIO's echo cancellation module "reconfigures"
///      when playback stops, and that transition confuses SpeechAnalyzer. By never truly
///      stopping playback, we avoid the state transition entirely.
///
///   B) ANALYZER RESTART: After TTS finishes, tear down the SpeechAnalyzer session and create
///      a fresh one. Theory: the stall is an internal SpeechAnalyzer state issue, and a quick
///      restart is faster than waiting 25s for self-recovery. We measure: how fast can we
///      restart and get new results?
///
///   C) SFSPEECH FALLBACK: Run SFSpeechRecognizer in parallel during and after TTS playback.
///      SFSpeechRecognizer is the older API and may not have the same VPIO stall issue.
///      If it can detect speech while SpeechAnalyzer is stalled, we can use it as a
///      "fallback interruption detector" — not for transcription, just for detecting
///      that the user is speaking (2+ words → interrupt).
///
///   D) BASELINE (no fix): Just play TTS and measure how long until SpeechAnalyzer recovers.
///      This is the control group for comparison.
///
/// Each strategy runs one TTS cycle and measures:
///   - Time from TTS end to first SpeechAnalyzer result ("recovery time")
///   - Whether the fallback (SFSpeech) detected speech during the gap
///   - Total buffers fed during the gap
///
/// HOW TO RUN:
///   swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia \
///          -O -o /tmp/recovery_test PostTTSRecoveryStrategiesTest.swift
///   /tmp/recovery_test
///
/// REQUIRES: macOS 26+, microphone permission, background audio from another device.

import AVFoundation
import Foundation
import Speech

func setStdoutUnbuffered() { setbuf(stdout, nil) }

// ── Global test start for timestamps ──
var gTestStart = Date()
func ts() -> String { String(format: "%6.1f", Date().timeIntervalSince(gTestStart)) }
func tlog(_ tag: String, _ msg: String) {
    print("[T+\(ts())s] [\(tag)] \(msg)")
    fflush(stdout)
}

// MARK: - Strategy Enum

/// The four strategies we're testing. Each handles the post-TTS period differently.
enum RecoveryStrategy: String, CaseIterable, CustomStringConvertible {
    /// Play TTS, then do nothing. Measure natural recovery time (baseline).
    case baseline = "D-BASELINE"
    /// Play TTS, then loop silent audio through playerNode to keep VPIO stable.
    case silentKeepalive = "A-SILENT-KEEPALIVE"
    /// Play TTS, then restart SpeechAnalyzer from scratch.
    case analyzerRestart = "B-ANALYZER-RESTART"
    /// Play TTS with SFSpeechRecognizer running in parallel as fallback detector.
    case sfSpeechFallback = "C-SFSPEECH-FALLBACK"
    
    var description: String { rawValue }
}

// MARK: - Test Result

/// Collected metrics for one strategy run.
struct StrategyResult {
    let strategy: RecoveryStrategy
    /// Time in seconds from TTS playback end to first SpeechAnalyzer result.
    let recoveryTime: Double
    /// Time in seconds from TTS playback end to first SFSpeechRecognizer result (if applicable).
    let sfSpeechRecoveryTime: Double?
    /// Number of audio buffers fed to SpeechAnalyzer during the recovery gap.
    let buffersDuringGap: Int
    /// Whether SpeechAnalyzer produced any result within 5 seconds of TTS ending.
    let recoveredWithin5s: Bool
    /// Whether SFSpeechRecognizer detected speech during the gap (strategy C only).
    let sfSpeechDetectedDuringGap: Bool
    /// First text detected after TTS (from whichever engine detected it first).
    let firstTextAfterTTS: String
}

// MARK: - Main Test Runner

@available(macOS 26.0, *)
class PostTTSRecoveryTest {
    
    // ── Audio engine ──
    var audioEngine: AVAudioEngine!
    var playerNode: AVAudioPlayerNode!
    
    // ── SpeechAnalyzer ──
    var analyzer: SpeechAnalyzer?
    var speechTranscriber: SpeechTranscriber?
    var analyzerContinuation: AsyncStream<AnalyzerInput>.Continuation?
    var analyzerResultTask: Task<Void, Error>?
    var frameCount: Int64 = 0
    
    // ── SFSpeechRecognizer (for strategy C) ──
    var sfRecognizer: SFSpeechRecognizer?
    var sfRequest: SFSpeechAudioBufferRecognitionRequest?
    var sfTask: SFSpeechRecognitionTask?
    
    // ── Shared audio format for SpeechAnalyzer ──
    var analyzerFormat: AVAudioFormat?
    var tapFormat: AVAudioFormat?
    var converter: AVAudioConverter?
    
    // ── Measurement state ──
    /// Set to true when TTS playback ends.
    var ttsDidEnd = false
    /// Timestamp of when TTS playback ended.
    var ttsEndTime = Date.distantFuture
    /// Set to true when first SpeechAnalyzer result arrives after TTS.
    var analyzerRecoveredAfterTTS = false
    /// Exact timestamp of when the analyzer recovered (for precise measurement).
    var analyzerRecoveryTime = Date.distantFuture
    /// The first text from SpeechAnalyzer after TTS ended.
    var firstAnalyzerTextAfterTTS = ""
    /// Buffers fed to analyzer between TTS end and first result.
    var buffersSinceTTSEnd = 0
    /// Whether SFSpeech detected anything during the gap.
    var sfSpeechDetectedDuringGap = false
    /// Timestamp of first SFSpeech result after TTS.
    var sfSpeechFirstResultTime = Date.distantFuture
    /// First text from SFSpeech after TTS.
    var sfSpeechFirstText = ""
    /// Current strategy being tested.
    var currentStrategy: RecoveryStrategy = .baseline
    /// Diagnostic: current RMS energy.
    var currentRMS: Float = 0.0
    /// Diagnostic: last diag log time.
    var lastDiagTime = Date.distantPast
    /// Total buffers yielded in this strategy's run.
    var totalBuffers = 0
    
    // ── For silent keepalive ──
    /// A short (0.5s) silent audio file used to keep the playerNode active.
    var silentFileURL: URL?
    /// Whether we're currently looping silence.
    var isPlayingSilence = false
    
    // ── Collected results ──
    var results: [StrategyResult] = []
    
    // MARK: - Setup / Teardown
    
    /// Creates a fresh AVAudioEngine with VPIO, playerNode, and input tap.
    /// Called once at the start. The engine persists across all strategy runs.
    func setupAudioEngine() throws {
        audioEngine = AVAudioEngine()
        playerNode = AVAudioPlayerNode()
        
        // Enable VPIO for echo cancellation.
        try audioEngine.outputNode.setVoiceProcessingEnabled(true)
        let outFmt = audioEngine.outputNode.outputFormat(forBus: 0)
        audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outFmt)
        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: nil)
        
        // Determine tap format (mono float32 at input sample rate).
        let inNode = audioEngine.inputNode
        let inFmt = inNode.outputFormat(forBus: 0)
        tapFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: inFmt.sampleRate,
            channels: 1,
            interleaved: false
        )!
        
        tlog("SETUP", "VPIO enabled. Input: \(inFmt.sampleRate)Hz, \(inFmt.channelCount)ch")
    }
    
    /// Creates (or recreates) the SpeechAnalyzer and its result consumer task.
    /// Called at the start of each strategy run (and mid-run for strategy B restart).
    func setupSpeechAnalyzer() async throws {
        // Tear down previous if any.
        analyzerResultTask?.cancel()
        analyzerContinuation?.finish()
        
        guard let locale = await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: "en-US")) else {
            tlog("SETUP", "FATAL: en-US not supported"); return
        }
        
        // CRITICAL: .fastResults for ~1s delivery cadence (not 3.8s batches).
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange]
        )
        self.speechTranscriber = transcriber
        
        guard let aFmt = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber]) else {
            tlog("SETUP", "FATAL: no audio format"); return
        }
        self.analyzerFormat = aFmt
        
        // Create converter if needed (or if format changed).
        if converter == nil || converter?.outputFormat != aFmt {
            guard let tapFmt = tapFormat else { return }
            converter = AVAudioConverter(from: tapFmt, to: aFmt)
        }
        
        let xanalyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = xanalyzer
        
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzerContinuation = cont
        self.frameCount = 0
        
        // Result consumer: detects when SpeechAnalyzer delivers after TTS.
        analyzerResultTask = Task { [weak self] in
            guard let self else { return }
            for try await result in transcriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                
                let now = Date()
                let words = text.split(separator: " ").count
                
                // If TTS has ended and we haven't flagged recovery yet, this is the first result.
                if self.ttsDidEnd && !self.analyzerRecoveredAfterTTS {
                    self.analyzerRecoveredAfterTTS = true
                    self.analyzerRecoveryTime = now
                    self.firstAnalyzerTextAfterTTS = text
                    let recovery = now.timeIntervalSince(self.ttsEndTime)
                    tlog(self.currentStrategy.rawValue, "✅ ANALYZER RECOVERED in \(String(format: "%.1f", recovery))s: \"\(text.prefix(80))\"")
                } else if !self.ttsDidEnd {
                    // Pre-TTS result (during listening phase).
                    tlog(self.currentStrategy.rawValue, "WORDS (\(words)w): \"\(text.prefix(60))\"")
                }
            }
        }
        
        // Start the analyzer with the stream.
        try await xanalyzer.start(inputSequence: stream)
        tlog("SETUP", "SpeechAnalyzer started (fresh session)")
    }
    
    /// Sets up SFSpeechRecognizer for strategy C.
    /// Runs in parallel alongside SpeechAnalyzer.
    func setupSFSpeechRecognizer() {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              rec.isAvailable else {
            tlog("SETUP", "SFSpeechRecognizer not available!")
            return
        }
        sfRecognizer = rec
        
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if rec.supportsOnDeviceRecognition {
            req.requiresOnDeviceRecognition = true
            tlog("SETUP", "SFSpeechRecognizer: on-device mode")
        }
        sfRequest = req
        
        sfTask = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self, let r = result else { return }
            let text = r.bestTranscription.formattedString
            guard !text.isEmpty else { return }
            
            let now = Date()
            // If TTS has ended, track when SFSpeech first detects speech.
            if self.ttsDidEnd && !self.sfSpeechDetectedDuringGap {
                self.sfSpeechDetectedDuringGap = true
                self.sfSpeechFirstResultTime = now
                self.sfSpeechFirstText = text
                let gap = now.timeIntervalSince(self.ttsEndTime)
                tlog(self.currentStrategy.rawValue, "🔵 SFSPEECH DETECTED in \(String(format: "%.1f", gap))s: \"\(text.prefix(80))\"")
            }
        }
        tlog("SETUP", "SFSpeechRecognizer started")
    }
    
    /// Tears down SFSpeechRecognizer.
    func teardownSFSpeech() {
        sfTask?.cancel()
        sfRequest?.endAudio()
        sfTask = nil
        sfRequest = nil
        sfRecognizer = nil
    }
    
    /// Installs the audio tap on inputNode. Feeds buffers to SpeechAnalyzer
    /// (and optionally SFSpeechRecognizer for strategy C).
    func installAudioTap() {
        let inNode = audioEngine.inputNode
        guard let tapFmt = tapFormat else { return }
        
        inNode.removeTap(onBus: 0)
        inNode.installTap(onBus: 0, bufferSize: 1024, format: tapFmt) { [weak self] buf, _ in
            guard let self else { return }
            
            // ── RMS for diagnostics ──
            if let data = buf.floatChannelData?[0] {
                var s: Float = 0
                let n = Int(buf.frameLength)
                for i in 0..<n { s += data[i] * data[i] }
                self.currentRMS = sqrt(s / Float(max(n, 1)))
            }
            
            // ── Periodic diagnostic ──
            let now = Date()
            if now.timeIntervalSince(self.lastDiagTime) >= 3.0 {
                self.lastDiagTime = now
                let rms = String(format: "%.4f", self.currentRMS)
                if self.ttsDidEnd && !self.analyzerRecoveredAfterTTS {
                    let gap = String(format: "%.1f", now.timeIntervalSince(self.ttsEndTime))
                    tlog(self.currentStrategy.rawValue, "DIAG rms=\(rms) bufs_since_tts=\(self.buffersSinceTTSEnd) waiting=\(gap)s")
                }
            }
            
            // ── Feed to SpeechAnalyzer ──
            if let aFmt = self.analyzerFormat, let conv = self.converter {
                let ratio = aFmt.sampleRate / tapFmt.sampleRate
                let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio)
                if cap > 0, let out = AVAudioPCMBuffer(pcmFormat: aFmt, frameCapacity: cap) {
                    var err: NSError?
                    conv.convert(to: out, error: &err) { _, s in s.pointee = .haveData; return buf }
                    if err == nil && out.frameLength > 0 {
                        let t = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(aFmt.sampleRate))
                        self.frameCount += Int64(out.frameLength)
                        self.analyzerContinuation?.yield(AnalyzerInput(buffer: out, bufferStartTime: t))
                        self.totalBuffers += 1
                        if self.ttsDidEnd && !self.analyzerRecoveredAfterTTS {
                            self.buffersSinceTTSEnd += 1
                        }
                    }
                }
            }
            
            // ── Feed to SFSpeechRecognizer (strategy C only) ──
            if let sfReq = self.sfRequest {
                sfReq.append(buf)
            }
        }
    }
    
    /// Generates a ~3 second TTS audio file for testing.
    func generateTTSFile() -> URL? {
        let path = "/tmp/recovery_test_tts.aiff"
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.removeItem(at: url)
        
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        proc.arguments = ["-o", path, "This is a test of the voice response system. The analyzer should recover quickly after this."]
        try? proc.run()
        proc.waitUntilExit()
        
        guard FileManager.default.fileExists(atPath: path) else { return nil }
        return url
    }
    
    /// Creates a short silent .aiff file for the keepalive strategy.
    func createSilentFile() -> URL? {
        let path = "/tmp/recovery_test_silence.aiff"
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.removeItem(at: url)
        
        // Generate 0.5 seconds of silence via `say` with an empty string.
        // Actually, let's create it programmatically — a 0.5s PCM buffer of zeros.
        let sampleRate: Double = 44100
        let duration: Double = 0.5
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)!
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return nil }
        buffer.frameLength = frameCount
        // Buffer is already zeroed (silence).
        
        // Write to file.
        do {
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            try file.write(from: buffer)
            return url
        } catch {
            tlog("SETUP", "Failed to create silent file: \(error)")
            return nil
        }
    }
    
    // MARK: - Run One Strategy
    
    /// Runs a single strategy test cycle:
    /// 1. Wait for SpeechAnalyzer to produce at least one result (confirms it's alive)
    /// 2. Play TTS audio (~3 seconds)
    /// 3. Apply the strategy's post-TTS fix
    /// 4. Wait up to 30 seconds for SpeechAnalyzer to produce a result
    /// 5. Record metrics
    func runStrategy(_ strategy: RecoveryStrategy) async -> StrategyResult {
        currentStrategy = strategy
        
        print("")
        print("══════════════════════════════════════════════════════════════")
        print("  STRATEGY \(strategy.rawValue)")
        print("══════════════════════════════════════════════════════════════")
        
        // ── Reset measurement state ──
        ttsDidEnd = false
        ttsEndTime = Date.distantFuture
        analyzerRecoveredAfterTTS = false
        analyzerRecoveryTime = Date.distantFuture
        firstAnalyzerTextAfterTTS = ""
        buffersSinceTTSEnd = 0
        sfSpeechDetectedDuringGap = false
        sfSpeechFirstResultTime = Date.distantFuture
        sfSpeechFirstText = ""
        totalBuffers = 0
        isPlayingSilence = false
        
        // ── Setup SpeechAnalyzer (fresh for each strategy) ──
        do {
            try await setupSpeechAnalyzer()
        } catch {
            tlog(strategy.rawValue, "FATAL: setupSpeechAnalyzer failed: \(error)")
            return StrategyResult(strategy: strategy, recoveryTime: -1, sfSpeechRecoveryTime: nil,
                                  buffersDuringGap: 0, recoveredWithin5s: false,
                                  sfSpeechDetectedDuringGap: false, firstTextAfterTTS: "SETUP FAILED")
        }
        
        // ── Install audio tap ──
        installAudioTap()
        
        // ── Setup SFSpeech for strategy C ──
        if strategy == .sfSpeechFallback {
            setupSFSpeechRecognizer()
        }
        
        // ── Start engine if not running ──
        // The engine persists across all strategies. We only start it once.
        // Subsequent strategies just reinstall the tap.
        if !audioEngine.isRunning {
            audioEngine.prepare()
            do {
                try audioEngine.start()
                tlog(strategy.rawValue, "Engine started")
            } catch {
                tlog(strategy.rawValue, "FATAL: engine start failed: \(error)")
                return StrategyResult(strategy: strategy, recoveryTime: -1, sfSpeechRecoveryTime: nil,
                                      buffersDuringGap: 0, recoveredWithin5s: false,
                                      sfSpeechDetectedDuringGap: false, firstTextAfterTTS: "ENGINE FAILED")
            }
        } else {
            tlog(strategy.rawValue, "Engine already running (reusing)")
        }
        
        // ── Phase 1: Wait for SpeechAnalyzer to confirm it's alive (up to 8s) ──
        tlog(strategy.rawValue, "Waiting for SpeechAnalyzer to produce first result...")
        var waitedForAlive: Double = 0
        while waitedForAlive < 8.0 {
            // We're just waiting for the engine to settle and results to flow.
            // Since ttsDidEnd is false, the result task just logs "WORDS" — that's fine.
            try? await Task.sleep(for: .seconds(0.5))
            waitedForAlive += 0.5
        }
        tlog(strategy.rawValue, "Listening established (waited \(String(format: "%.1f", waitedForAlive))s)")
        
        // ── Let it listen for 3 seconds to establish a baseline of results flowing ──
        tlog(strategy.rawValue, "Listening for 3s before TTS...")
        try? await Task.sleep(for: .seconds(3))
        
        // ── Phase 2: Play TTS ──
        guard let ttsURL = generateTTSFile(),
              let ttsFile = try? AVAudioFile(forReading: ttsURL) else {
            tlog(strategy.rawValue, "FATAL: TTS file generation failed")
            return StrategyResult(strategy: strategy, recoveryTime: -1, sfSpeechRecoveryTime: nil,
                                  buffersDuringGap: 0, recoveredWithin5s: false,
                                  sfSpeechDetectedDuringGap: false, firstTextAfterTTS: "TTS FAILED")
        }
        let ttsDuration = Double(ttsFile.length) / ttsFile.fileFormat.sampleRate
        tlog(strategy.rawValue, "PLAYING TTS (\(String(format: "%.1f", ttsDuration))s)...")
        
        // Reset the recovery flag — we want to measure recovery AFTER this TTS.
        analyzerRecoveredAfterTTS = false
        firstAnalyzerTextAfterTTS = ""
        
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            playerNode.scheduleFile(ttsFile, at: nil) { c.resume() }
            playerNode.play()
        }
        
        // ── TTS just finished. Mark the end time. ──
        ttsDidEnd = true
        ttsEndTime = Date()
        buffersSinceTTSEnd = 0
        tlog(strategy.rawValue, "TTS ENDED. Applying post-TTS strategy...")
        
        // ── Phase 3: Apply strategy-specific fix ──
        switch strategy {
        case .baseline:
            // Do nothing. Just wait.
            tlog(strategy.rawValue, "BASELINE: No fix applied. Waiting for natural recovery...")
            
        case .silentKeepalive:
            // Immediately start playing silent audio on loop to keep VPIO's playback path active.
            if let silURL = silentFileURL, let silFile = try? AVAudioFile(forReading: silURL) {
                tlog(strategy.rawValue, "Starting silent keepalive playback...")
                isPlayingSilence = true
                // Schedule the silent buffer, then loop it via the completion handler.
                func scheduleLoop() {
                    guard self.isPlayingSilence,
                          let f = try? AVAudioFile(forReading: silURL) else { return }
                    self.playerNode.scheduleFile(f, at: nil) {
                        // Re-schedule when this one finishes (creates a loop).
                        scheduleLoop()
                    }
                }
                scheduleLoop()
                playerNode.play()
                tlog(strategy.rawValue, "Silent keepalive active")
            } else {
                tlog(strategy.rawValue, "WARNING: Could not create silent file, falling back to baseline")
            }
            
        case .analyzerRestart:
            // Tear down and restart the SpeechAnalyzer session.
            tlog(strategy.rawValue, "Restarting SpeechAnalyzer...")
            let restartStart = Date()
            do {
                try await setupSpeechAnalyzer()
                let restartMs = Int(Date().timeIntervalSince(restartStart) * 1000)
                tlog(strategy.rawValue, "SpeechAnalyzer restarted in \(restartMs)ms")
            } catch {
                tlog(strategy.rawValue, "RESTART FAILED: \(error)")
            }
            
        case .sfSpeechFallback:
            // SFSpeech is already running (set up before TTS).
            // Just log that we're waiting for both engines.
            tlog(strategy.rawValue, "SFSpeech running in parallel. Waiting for either engine to detect speech...")
        }
        
        // ── Phase 4: Wait up to 30 seconds for recovery ──
        let maxWait: Double = 30.0
        var elapsed: Double = 0
        let pollInterval: Double = 0.5
        
        while elapsed < maxWait {
            if analyzerRecoveredAfterTTS {
                tlog(strategy.rawValue, "SpeechAnalyzer recovered!")
                break
            }
            try? await Task.sleep(for: .seconds(pollInterval))
            elapsed += pollInterval
        }
        
        // ── Phase 5: Collect results ──
        let recoveryTime: Double
        if analyzerRecoveredAfterTTS {
            // Use the exact timestamp stored by the result task.
            recoveryTime = analyzerRecoveryTime.timeIntervalSince(ttsEndTime)
        } else {
            recoveryTime = maxWait // Never recovered.
            tlog(strategy.rawValue, "⚠️ ANALYZER DID NOT RECOVER within \(Int(maxWait))s")
        }
        
        let sfRecoveryTime: Double?
        if strategy == .sfSpeechFallback {
            if sfSpeechDetectedDuringGap {
                sfRecoveryTime = sfSpeechFirstResultTime.timeIntervalSince(ttsEndTime)
            } else {
                sfRecoveryTime = nil
            }
        } else {
            sfRecoveryTime = nil
        }
        
        // ── Cleanup for this strategy ──
        if isPlayingSilence {
            isPlayingSilence = false
            playerNode.stop()
        }
        if strategy == .sfSpeechFallback {
            teardownSFSpeech()
        }
        // Remove tap before next strategy re-installs it.
        audioEngine.inputNode.removeTap(onBus: 0)
        // IMPORTANT: Do NOT stop the engine between strategies!
        // Stopping + restarting the engine breaks the playerNode connections.
        // The playerNode was attached/connected in setupAudioEngine() and those
        // connections are invalidated by engine.stop(). Instead, we just remove
        // the tap and reinstall it for the next strategy. The engine keeps running.
        
        let result = StrategyResult(
            strategy: strategy,
            recoveryTime: recoveryTime,
            sfSpeechRecoveryTime: sfRecoveryTime,
            buffersDuringGap: buffersSinceTTSEnd,
            recoveredWithin5s: recoveryTime <= 5.0,
            sfSpeechDetectedDuringGap: sfSpeechDetectedDuringGap,
            firstTextAfterTTS: firstAnalyzerTextAfterTTS.isEmpty ? "(none)" : String(firstAnalyzerTextAfterTTS.prefix(80))
        )
        results.append(result)
        
        try? FileManager.default.removeItem(at: URL(fileURLWithPath: "/tmp/recovery_test_tts.aiff"))
        
        // Brief pause between strategies.
        tlog(strategy.rawValue, "Strategy complete. Pausing 3s before next...")
        try? await Task.sleep(for: .seconds(3))
        
        return result
    }
    
    // MARK: - Run All
    
    func runAll() async {
        print("================================================================")
        print("  Post-TTS SpeechAnalyzer Recovery Strategy Test")
        print("  4 strategies tested sequentially")
        print("  PLAY BACKGROUND AUDIO FROM PHONE throughout all tests!")
        print("================================================================")
        print("")
        
        // ── One-time setup ──
        do {
            try setupAudioEngine()
        } catch {
            tlog("SETUP", "FATAL: \(error)")
            return
        }
        
        // Create the silent file once for strategy A.
        silentFileURL = createSilentFile()
        if silentFileURL != nil {
            tlog("SETUP", "Silent keepalive file created")
        }
        
        // ── Run each strategy ──
        // Run baseline first so we have a control measurement.
        // Then strategies A, B, C.
        let order: [RecoveryStrategy] = [.baseline, .silentKeepalive, .analyzerRestart, .sfSpeechFallback]
        
        for strategy in order {
            _ = await runStrategy(strategy)
        }
        
        // ── Print summary ──
        print("")
        print("================================================================")
        print("  RESULTS SUMMARY")
        print("================================================================")
        print("")
        for r in results {
            let status = r.recoveredWithin5s ? "✅" : "❌"
            print("  \(status) \(r.strategy.rawValue)")
            print("     Recovery time: \(String(format: "%.1f", r.recoveryTime))s")
            print("     Buffers during gap: \(r.buffersDuringGap)")
            print("     First text: \"\(r.firstTextAfterTTS)\"")
            if let sf = r.sfSpeechRecoveryTime {
                print("     SFSpeech detected: \(String(format: "%.1f", sf))s after TTS")
                print("     SFSpeech text: \"\(r.firstTextAfterTTS)\"")
            }
            if r.strategy == .sfSpeechFallback {
                print("     SFSpeech detected during gap: \(r.sfSpeechDetectedDuringGap)")
            }
            print("")
        }
        
        // ── Recommendation ──
        if let best = results.filter({ $0.recoveredWithin5s }).min(by: { $0.recoveryTime < $1.recoveryTime }) {
            print("  RECOMMENDATION: \(best.strategy.rawValue) (recovered in \(String(format: "%.1f", best.recoveryTime))s)")
        } else {
            print("  RECOMMENDATION: None recovered within 5s. Need further investigation.")
        }
        print("")
        print("================================================================")
        
        // Cleanup.
        if let url = silentFileURL {
            try? FileManager.default.removeItem(at: url)
        }
    }
}

// MARK: - Entry Point

@main
struct PostTTSRecoveryEntry {
    static func main() {
        setStdoutUnbuffered()
        guard #available(macOS 26.0, *) else { print("Requires macOS 26+"); exit(1) }
        
        gTestStart = Date()
        
        Task {
            if #available(macOS 26.0, *) {
                let test = PostTTSRecoveryTest()
                await test.runAll()
            }
            exit(0)
        }
        RunLoop.main.run()
    }
}
