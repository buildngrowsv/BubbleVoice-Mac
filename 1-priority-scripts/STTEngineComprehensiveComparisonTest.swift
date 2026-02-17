/// STTEngineComprehensiveComparisonTest.swift
///
/// PURPOSE: Comprehensive comparison of SpeechAnalyzer vs SFSpeechRecognizer
/// with restart scenarios, staggered restart testing, and longer duration.
///
/// PHASES:
///   Phase 1 (120s): Both engines run simultaneously, normal operation
///   Phase 2 (30s):  Restart SpeechAnalyzer mid-stream, SFSpeech keeps running
///                   → Measures: words lost during restart, recovery time
///   Phase 3 (30s):  Restart SFSpeechRecognizer mid-stream, Analyzer keeps running
///                   → Measures: words lost during restart, recovery time
///   Phase 4 (30s):  Staggered restart: restart Analyzer, wait 2s, restart SFSpeech
///                   → Measures: combined coverage gap
///
/// TOTAL: ~210 seconds (3.5 minutes)
///
/// OUTPUT: Detailed log to /tmp/stt-comprehensive-TIMESTAMP.log
///
/// USAGE:
/// swiftc -parse-as-library -framework AVFoundation -framework Speech \
///        -framework CoreMedia -O -o /tmp/stt_comprehensive STTEngineComprehensiveComparisonTest.swift
/// /tmp/stt_comprehensive
///
/// REQUIRES: macOS 26+, microphone permission, background audio source (e.g. English video)

import AVFoundation
import Foundation
import Speech

func setStdoutUnbuffered() { setbuf(stdout, nil) }

// MARK: - File Logging

var logFileHandle: FileHandle?
var logFilePath: String?

func initLogFile() {
    let df = DateFormatter()
    df.dateFormat = "yyyyMMdd_HHmmss"
    logFilePath = "/tmp/stt-comprehensive-\(df.string(from: Date())).log"
    FileManager.default.createFile(atPath: logFilePath!, contents: nil)
    logFileHandle = FileHandle(forWritingAtPath: logFilePath!)
    
    let hdr = """
    ================================================================
    STT COMPREHENSIVE COMPARISON TEST
    ================================================================
    Started: \(Date())
    Phases:
      1) Normal operation (120s) — both engines side-by-side
      2) Restart SpeechAnalyzer (30s) — measure word loss
      3) Restart SFSpeechRecognizer (30s) — measure word loss
      4) Staggered restart (30s) — combined coverage
    ================================================================
    
    """
    wlog(hdr)
    print("📝 Log: \(logFilePath!)")
}

func wlog(_ msg: String) {
    guard let h = logFileHandle, let d = (msg + "\n").data(using: .utf8) else { return }
    h.write(d)
}

func closeLog() {
    logFileHandle?.closeFile()
    if let p = logFilePath { print("\n📝 Full log: \(p)") }
}

// MARK: - Result Tracking

/// Tracks every transcription update from an engine
struct EngineLog {
    var name: String
    var updates: [(time: Double, text: String, isFinal: Bool, wordCount: Int)] = []
    var firstResultTime: Double?
    var lastWordCount = 0
    var finalSegments: [String] = []
    var totalWords = 0
    var restartCount = 0
    var wordsLostDuringRestart = 0
    var restartGapSeconds: Double = 0
    
    mutating func record(_ text: String, isFinal: Bool, t: Double) {
        let wc = text.split(separator: " ").count
        updates.append((time: t, text: text, isFinal: isFinal, wordCount: wc))
        if firstResultTime == nil { firstResultTime = t }
        if isFinal { finalSegments.append(text) }
        totalWords = max(totalWords, wc)
        lastWordCount = wc
    }
}

// MARK: - Main Test

@available(macOS 26.0, *)
class ComprehensiveTest {
    let testStart = Date()
    
    // Audio
    let audioEngine = AVAudioEngine()
    
    // SpeechAnalyzer
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var analyzerContinuation: AsyncStream<AnalyzerInput>.Continuation?
    var analyzerTask: Task<Void, Error>?
    var analyzerFormat: AVAudioFormat?
    var analyzerConverter: AVAudioConverter?
    var analyzerFrameCount: Int64 = 0
    var analyzerLocale: Locale?
    
    // SFSpeechRecognizer
    var sfRecognizer: SFSpeechRecognizer?
    var sfRequest: SFSpeechAudioBufferRecognitionRequest?
    var sfTask: SFSpeechRecognitionTask?
    
    // State
    var analyzerLog = EngineLog(name: "SpeechAnalyzer")
    var sfLog = EngineLog(name: "SFSpeechRecognizer")
    var analyzerActive = false
    var sfActive = false
    var totalBuffers = 0
    var currentRMS: Float = 0
    var currentPhase = ""
    
    // Tap format (set once during setup)
    var tapFormat: AVAudioFormat?
    
    func elapsed() -> Double { Date().timeIntervalSince(testStart) }
    
    func log(_ msg: String) {
        let t = String(format: "%6.1f", elapsed())
        let out = "[T+\(t)s] [\(currentPhase)] \(msg)"
        print(out)
        wlog(out)
        fflush(stdout)
    }
    
    // MARK: - Setup
    
    func setupAnalyzer() async throws {
        guard let locale = await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: "en-US")) else {
            log("FATAL: en-US not supported")
            return
        }
        self.analyzerLocale = locale
        
        let xscriber = SpeechTranscriber(
            locale: locale, transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange])
        self.transcriber = xscriber
        
        guard let aFmt = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [xscriber]) else {
            log("FATAL: no analyzer format")
            return
        }
        self.analyzerFormat = aFmt
        
        let xanalyzer = SpeechAnalyzer(modules: [xscriber])
        self.analyzer = xanalyzer
        
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzerContinuation = cont
        
        // Result consumer
        analyzerTask = Task { [weak self] in
            guard let self else { return }
            for try await result in xscriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                guard self.analyzerActive else { continue }
                
                let t = self.elapsed()
                let prevWC = self.analyzerLog.lastWordCount
                self.analyzerLog.record(text, isFinal: result.isFinal, t: t)
                
                let wc = text.split(separator: " ").count
                let delta = wc - prevWC
                let flag = result.isFinal ? "[FINAL]" : "[partial]"
                self.log("ANALYZER \(flag) +\(delta)w (\(wc)w): \"\(text.prefix(80))\"")
                wlog("  └─ Full: \"\(text)\"")
            }
        }
        
        // Start
        try await xanalyzer.start(inputSequence: stream)
        analyzerActive = true
        log("✅ SpeechAnalyzer started")
    }
    
    func setupSFSpeech() {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              rec.isAvailable else {
            log("FATAL: SFSpeechRecognizer not available")
            return
        }
        sfRecognizer = rec
        
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if rec.supportsOnDeviceRecognition {
            req.requiresOnDeviceRecognition = true
        }
        sfRequest = req
        
        sfTask = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self, let result = result else { return }
            guard self.sfActive else { return }
            
            let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return }
            
            let t = self.elapsed()
            let prevWC = self.sfLog.lastWordCount
            self.sfLog.record(text, isFinal: result.isFinal, t: t)
            
            let wc = text.split(separator: " ").count
            let delta = wc - prevWC
            let flag = result.isFinal ? "[FINAL]" : "[partial]"
            self.log("SFSPEECH \(flag) +\(delta)w (\(wc)w): \"\(text.prefix(80))\"")
            wlog("  └─ Full: \"\(text)\"")
        }
        sfActive = true
        log("✅ SFSpeechRecognizer started")
    }
    
    // MARK: - Restart Methods
    
    /// Tear down and rebuild SpeechAnalyzer. Measures how long until first result.
    func restartAnalyzer() async throws {
        let restartStart = elapsed()
        log("🔄 RESTARTING SpeechAnalyzer...")
        
        // Teardown
        analyzerActive = false
        analyzerTask?.cancel()
        analyzerContinuation?.finish()
        try? await analyzer?.finalize(through: nil)
        analyzer = nil
        transcriber = nil
        analyzerContinuation = nil
        analyzerTask = nil
        
        log("   Analyzer torn down in \(String(format: "%.2f", elapsed() - restartStart))s")
        
        // Small delay to simulate real-world restart
        try await Task.sleep(for: .milliseconds(100))
        
        // Rebuild
        let rebuildStart = elapsed()
        
        guard let locale = analyzerLocale else {
            log("FATAL: no locale for restart")
            return
        }
        
        let xscriber = SpeechTranscriber(
            locale: locale, transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange])
        self.transcriber = xscriber
        
        let xanalyzer = SpeechAnalyzer(modules: [xscriber])
        self.analyzer = xanalyzer
        
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzerContinuation = cont
        
        // New result consumer
        analyzerTask = Task { [weak self] in
            guard let self else { return }
            // Reset word count for the new session
            self.analyzerLog.lastWordCount = 0
            for try await result in xscriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                guard self.analyzerActive else { continue }
                
                let t = self.elapsed()
                let prevWC = self.analyzerLog.lastWordCount
                self.analyzerLog.record(text, isFinal: result.isFinal, t: t)
                
                let wc = text.split(separator: " ").count
                let delta = wc - prevWC
                let flag = result.isFinal ? "[FINAL]" : "[partial]"
                self.log("ANALYZER \(flag) +\(delta)w (\(wc)w): \"\(text.prefix(80))\"")
                wlog("  └─ Full: \"\(text)\"")
            }
        }
        
        try await xanalyzer.start(inputSequence: stream)
        analyzerActive = true
        
        let restartTotal = elapsed() - restartStart
        analyzerLog.restartCount += 1
        analyzerLog.restartGapSeconds += restartTotal
        
        log("   ✅ Analyzer restarted in \(String(format: "%.2f", restartTotal))s (rebuild: \(String(format: "%.2f", elapsed() - rebuildStart))s)")
    }
    
    /// Tear down and rebuild SFSpeechRecognizer.
    func restartSFSpeech() {
        let restartStart = elapsed()
        log("🔄 RESTARTING SFSpeechRecognizer...")
        
        // Teardown
        sfActive = false
        sfTask?.cancel()
        sfRequest?.endAudio()
        sfTask = nil
        sfRequest = nil
        sfRecognizer = nil
        
        log("   SFSpeech torn down in \(String(format: "%.2f", elapsed() - restartStart))s")
        
        // Reset word count for new session
        sfLog.lastWordCount = 0
        
        // Rebuild
        let rebuildStart = elapsed()
        setupSFSpeech()
        
        let restartTotal = elapsed() - restartStart
        sfLog.restartCount += 1
        sfLog.restartGapSeconds += restartTotal
        
        log("   ✅ SFSpeech restarted in \(String(format: "%.2f", restartTotal))s (rebuild: \(String(format: "%.2f", elapsed() - rebuildStart))s)")
    }
    
    // MARK: - Audio Tap
    
    func installTap() {
        let inNode = audioEngine.inputNode
        let inFmt = inNode.outputFormat(forBus: 0)
        let tFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                  sampleRate: inFmt.sampleRate, channels: 1, interleaved: false)!
        self.tapFormat = tFmt
        
        guard let aFmt = analyzerFormat,
              let conv = AVAudioConverter(from: tFmt, to: aFmt) else {
            log("FATAL: converter failed")
            return
        }
        self.analyzerConverter = conv
        
        inNode.installTap(onBus: 0, bufferSize: 1024, format: tFmt) { [weak self] buf, _ in
            guard let self else { return }
            self.totalBuffers += 1
            
            // RMS
            if let d = buf.floatChannelData?[0] {
                var s: Float = 0
                let n = Int(buf.frameLength)
                for i in 0..<n { s += d[i] * d[i] }
                self.currentRMS = sqrt(s / Float(max(n, 1)))
            }
            
            // Feed SFSpeech (original buffer)
            if self.sfActive { self.sfRequest?.append(buf) }
            
            // Feed SpeechAnalyzer (converted buffer)
            if self.analyzerActive, let aFmt = self.analyzerFormat, let conv = self.analyzerConverter {
                let ratio = aFmt.sampleRate / tFmt.sampleRate
                let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio)
                guard cap > 0, let out = AVAudioPCMBuffer(pcmFormat: aFmt, frameCapacity: cap) else { return }
                var err: NSError?
                conv.convert(to: out, error: &err) { _, st in st.pointee = .haveData; return buf }
                if err == nil && out.frameLength > 0 {
                    let t = CMTime(value: CMTimeValue(self.analyzerFrameCount),
                                   timescale: CMTimeScale(aFmt.sampleRate))
                    self.analyzerFrameCount += Int64(out.frameLength)
                    self.analyzerContinuation?.yield(AnalyzerInput(buffer: out, bufferStartTime: t))
                }
            }
        }
    }
    
    // MARK: - Run
    
    func run() async throws {
        print("")
        print("================================================================")
        print("  STT COMPREHENSIVE COMPARISON TEST")
        print("================================================================")
        print("  Phase 1: Normal (120s) | Phase 2: Restart Analyzer (30s)")
        print("  Phase 3: Restart SFSpeech (30s) | Phase 4: Staggered (30s)")
        print("  Total: ~3.5 minutes")
        print("================================================================")
        print("")
        print("  🎤 Play English video from phone near Mac microphone")
        print("")
        
        initLogFile()
        
        // Setup
        log("Setting up engines...")
        try await setupAnalyzer()
        setupSFSpeech()
        installTap()
        
        audioEngine.prepare()
        try audioEngine.start()
        
        // ════════════════════════════════════════════
        // PHASE 1: Normal operation (120 seconds)
        // ════════════════════════════════════════════
        currentPhase = "PHASE1-NORMAL"
        log("═══ PHASE 1: Normal operation (120s) ═══")
        wlog("\n═══════════════════════════════════════════════════════════")
        wlog("PHASE 1: NORMAL OPERATION (120 seconds)")
        wlog("Both engines running simultaneously, no restarts")
        wlog("═══════════════════════════════════════════════════════════\n")
        
        var phaseStart = Date()
        while Date().timeIntervalSince(phaseStart) < 120 {
            try await Task.sleep(for: .seconds(1))
            let el = Int(Date().timeIntervalSince(phaseStart))
            if el % 15 == 0 && el > 0 {
                log("⏱️  Phase 1: \(el)s / 120s | RMS: \(String(format: "%.4f", currentRMS)) | Bufs: \(totalBuffers)")
            }
        }
        
        // Snapshot counts after phase 1
        let p1AnalyzerUpdates = analyzerLog.updates.count
        let p1SFUpdates = sfLog.updates.count
        log("Phase 1 complete: Analyzer=\(p1AnalyzerUpdates) updates, SFSpeech=\(p1SFUpdates) updates")
        
        // ════════════════════════════════════════════
        // PHASE 2: Restart SpeechAnalyzer (30 seconds)
        // ════════════════════════════════════════════
        currentPhase = "PHASE2-RESTART-ANALYZER"
        log("")
        log("═══ PHASE 2: Restart SpeechAnalyzer (30s) ═══")
        wlog("\n═══════════════════════════════════════════════════════════")
        wlog("PHASE 2: RESTART SPEECHANALYZER (30 seconds)")
        wlog("SFSpeech keeps running as reference for words missed")
        wlog("═══════════════════════════════════════════════════════════\n")
        
        let preRestartSFCount = sfLog.updates.count
        
        // Wait 5 seconds to establish baseline
        try await Task.sleep(for: .seconds(5))
        
        // Restart analyzer
        try await restartAnalyzer()
        
        // Listen for remaining time
        phaseStart = Date()
        while Date().timeIntervalSince(phaseStart) < 25 {
            try await Task.sleep(for: .seconds(1))
        }
        
        let p2AnalyzerUpdates = analyzerLog.updates.count - p1AnalyzerUpdates
        let p2SFUpdates = sfLog.updates.count - preRestartSFCount
        log("Phase 2 complete: Analyzer=\(p2AnalyzerUpdates) new updates, SFSpeech=\(p2SFUpdates) new updates")
        
        // ════════════════════════════════════════════
        // PHASE 3: Restart SFSpeechRecognizer (30 seconds)
        // ════════════════════════════════════════════
        currentPhase = "PHASE3-RESTART-SFSPEECH"
        log("")
        log("═══ PHASE 3: Restart SFSpeechRecognizer (30s) ═══")
        wlog("\n═══════════════════════════════════════════════════════════")
        wlog("PHASE 3: RESTART SFSPEECHRECOGNIZER (30 seconds)")
        wlog("SpeechAnalyzer keeps running as reference for words missed")
        wlog("═══════════════════════════════════════════════════════════\n")
        
        let preP3AnalyzerCount = analyzerLog.updates.count
        let preP3SFCount = sfLog.updates.count
        
        // Wait 5 seconds to establish baseline
        try await Task.sleep(for: .seconds(5))
        
        // Restart SFSpeech
        restartSFSpeech()
        
        // Listen for remaining time
        phaseStart = Date()
        while Date().timeIntervalSince(phaseStart) < 25 {
            try await Task.sleep(for: .seconds(1))
        }
        
        let p3AnalyzerUpdates = analyzerLog.updates.count - preP3AnalyzerCount
        let p3SFUpdates = sfLog.updates.count - preP3SFCount
        log("Phase 3 complete: Analyzer=\(p3AnalyzerUpdates) new updates, SFSpeech=\(p3SFUpdates) new updates")
        
        // ════════════════════════════════════════════
        // PHASE 4: Staggered restart (30 seconds)
        // ════════════════════════════════════════════
        currentPhase = "PHASE4-STAGGERED"
        log("")
        log("═══ PHASE 4: Staggered restart (30s) ═══")
        wlog("\n═══════════════════════════════════════════════════════════")
        wlog("PHASE 4: STAGGERED RESTART (30 seconds)")
        wlog("Restart Analyzer, wait 2s, restart SFSpeech")
        wlog("Tests if at least one engine always has coverage")
        wlog("═══════════════════════════════════════════════════════════\n")
        
        let preP4AnalyzerCount = analyzerLog.updates.count
        let preP4SFCount = sfLog.updates.count
        
        // Wait 5 seconds baseline
        try await Task.sleep(for: .seconds(5))
        
        // Restart Analyzer first
        try await restartAnalyzer()
        log("   Waiting 2s before restarting SFSpeech...")
        try await Task.sleep(for: .seconds(2))
        
        // Now restart SFSpeech
        restartSFSpeech()
        
        // Listen for remaining time
        phaseStart = Date()
        while Date().timeIntervalSince(phaseStart) < 23 {
            try await Task.sleep(for: .seconds(1))
        }
        
        let p4AnalyzerUpdates = analyzerLog.updates.count - preP4AnalyzerCount
        let p4SFUpdates = sfLog.updates.count - preP4SFCount
        log("Phase 4 complete: Analyzer=\(p4AnalyzerUpdates) new updates, SFSpeech=\(p4SFUpdates) new updates")
        
        // ════════════════════════════════════════════
        // FINALIZE AND REPORT
        // ════════════════════════════════════════════
        currentPhase = "REPORT"
        log("")
        log("⏹️  All phases complete, finalizing...")
        
        sfRequest?.endAudio()
        try? await analyzer?.finalize(through: nil)
        try await Task.sleep(for: .seconds(2))
        
        generateReport()
        closeLog()
    }
    
    // MARK: - Report
    
    func generateReport() {
        let divider = "════════════════════════════════════════════════════════════"
        
        log("")
        log(divider)
        log("  COMPREHENSIVE COMPARISON RESULTS")
        log(divider)
        
        // Overall stats
        log("")
        log("── OVERALL STATS ──")
        log("SpeechAnalyzer:")
        log("  Total updates: \(analyzerLog.updates.count)")
        log("  Final segments: \(analyzerLog.finalSegments.count)")
        log("  Restarts: \(analyzerLog.restartCount)")
        log("  Total restart gap: \(String(format: "%.2f", analyzerLog.restartGapSeconds))s")
        if let first = analyzerLog.firstResultTime {
            log("  First result at: \(String(format: "%.2f", first))s")
        }
        log("")
        log("SFSpeechRecognizer:")
        log("  Total updates: \(sfLog.updates.count)")
        log("  Final segments: \(sfLog.finalSegments.count)")
        log("  Restarts: \(sfLog.restartCount)")
        log("  Total restart gap: \(String(format: "%.2f", sfLog.restartGapSeconds))s")
        if let first = sfLog.firstResultTime {
            log("  First result at: \(String(format: "%.2f", first))s")
        }
        
        // Behavioral differences
        log("")
        log("── KEY BEHAVIORAL DIFFERENCES ──")
        log("")
        log("SpeechAnalyzer segments into sentences with FINAL markers:")
        log("  Final segments count: \(analyzerLog.finalSegments.count)")
        for (i, seg) in analyzerLog.finalSegments.prefix(10).enumerated() {
            log("    [\(i+1)] \"\(seg.prefix(80))\"")
        }
        if analyzerLog.finalSegments.count > 10 {
            log("    ... and \(analyzerLog.finalSegments.count - 10) more")
        }
        
        log("")
        log("SFSpeechRecognizer keeps one continuous stream (rarely sends FINAL):")
        log("  Final segments count: \(sfLog.finalSegments.count)")
        for (i, seg) in sfLog.finalSegments.prefix(5).enumerated() {
            log("    [\(i+1)] \"\(seg.prefix(80))\"")
        }
        
        // Turn detection impact
        log("")
        log("── TURN DETECTION IMPACT ──")
        log("")
        log("SpeechAnalyzer FINAL events per minute: ~\(String(format: "%.1f", Double(analyzerLog.finalSegments.count) / (elapsed() / 60.0)))")
        log("  → These trigger word-count resets to 0 in the app")
        log("  → Backend's mergeTranscriptionText appends final to finalizedText")
        log("  → New volatile results start fresh after each FINAL")
        log("  → Silence timer sees word count DROP (e.g., 22w → 1w) on FINAL")
        log("")
        log("SFSpeechRecognizer FINAL events per minute: ~\(String(format: "%.1f", Double(sfLog.finalSegments.count) / (elapsed() / 60.0)))")
        log("  → Word count grows monotonically (never resets)")
        log("  → No sentence segmentation — all text accumulates")
        log("  → Silence detection only sees word count stop growing")
        
        // Restart impact
        log("")
        log("── RESTART IMPACT ──")
        log("")
        log("SpeechAnalyzer restart:")
        log("  Total gap: \(String(format: "%.2f", analyzerLog.restartGapSeconds))s across \(analyzerLog.restartCount) restarts")
        log("  Average: \(String(format: "%.2f", analyzerLog.restartCount > 0 ? analyzerLog.restartGapSeconds / Double(analyzerLog.restartCount) : 0))s per restart")
        log("")
        log("SFSpeechRecognizer restart:")
        log("  Total gap: \(String(format: "%.2f", sfLog.restartGapSeconds))s across \(sfLog.restartCount) restarts")
        log("  Average: \(String(format: "%.2f", sfLog.restartCount > 0 ? sfLog.restartGapSeconds / Double(sfLog.restartCount) : 0))s per restart")
        
        // Update frequency comparison
        log("")
        log("── UPDATE FREQUENCY (Phase 1 only, first 120s) ──")
        let p1Updates = analyzerLog.updates.filter { $0.time < 120 }
        let p1SFUpdates = sfLog.updates.filter { $0.time < 120 }
        if p1Updates.count > 1 {
            let gaps = zip(p1Updates.dropFirst(), p1Updates).map { $0.time - $1.time }
            let avgGap = gaps.reduce(0, +) / Double(gaps.count)
            log("SpeechAnalyzer: \(p1Updates.count) updates, avg gap: \(String(format: "%.2f", avgGap))s")
        }
        if p1SFUpdates.count > 1 {
            let gaps = zip(p1SFUpdates.dropFirst(), p1SFUpdates).map { $0.time - $1.time }
            let avgGap = gaps.reduce(0, +) / Double(gaps.count)
            log("SFSpeechRecognizer: \(p1SFUpdates.count) updates, avg gap: \(String(format: "%.2f", avgGap))s")
        }
        
        log("")
        log(divider)
        log("  END OF REPORT")
        log(divider)
    }
}

// MARK: - Entry

@main
struct ComprehensiveEntry {
    static func main() {
        setStdoutUnbuffered()
        guard #available(macOS 26.0, *) else { print("Requires macOS 26+"); exit(1) }
        Task {
            let test = ComprehensiveTest()
            do { try await test.run() }
            catch { print("FATAL: \(error)") }
            exit(0)
        }
        RunLoop.main.run()
    }
}
