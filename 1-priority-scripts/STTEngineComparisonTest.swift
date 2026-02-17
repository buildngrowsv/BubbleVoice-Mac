/// STTEngineComparisonTest.swift
///
/// PURPOSE: Compare SpeechAnalyzer vs SFSpeechRecognizer side-by-side
/// 
/// WHAT IT DOES:
/// - Runs BOTH engines simultaneously on the same audio input
/// - Logs every word-by-word update from each engine with precise timing
/// - Captures transcription evolution (how text builds up progressively)
/// - Records final results and timing differences
/// - Saves detailed log to /tmp/stt-comparison-TIMESTAMP.log
///
/// TEST DURATION: 60 seconds of listening to background audio
/// (Play English learning video from phone near Mac microphone)
///
/// USAGE:
/// swiftc -parse-as-library -framework AVFoundation -framework Speech \
///        -framework CoreMedia -O -o /tmp/stt_comparison STTEngineComparisonTest.swift
/// /tmp/stt_comparison
///
/// REQUIRES: macOS 26+, microphone permission, background audio source

import AVFoundation
import Foundation
import Speech

func setStdoutUnbuffered() { setbuf(stdout, nil) }

// MARK: - File Logging

var logFileHandle: FileHandle?
var logFilePath: String?

func initializeLogFile() {
    let timestamp = DateFormatter().then {
        $0.dateFormat = "yyyyMMdd_HHmmss"
    }.string(from: Date())
    logFilePath = "/tmp/stt-comparison-\(timestamp).log"
    
    FileManager.default.createFile(atPath: logFilePath!, contents: nil)
    logFileHandle = FileHandle(forWritingAtPath: logFilePath!)
    
    let header = """
    ================================================================
    STT ENGINE COMPARISON TEST - DETAILED LOG
    ================================================================
    Started: \(Date())
    Test: STTEngineComparisonTest.swift
    Purpose: Compare SpeechAnalyzer vs SFSpeechRecognizer word-by-word
    Duration: 60 seconds
    ================================================================
    
    """
    writeToLog(header)
    print("📝 Logging to: \(logFilePath!)")
}

func writeToLog(_ message: String) {
    guard let handle = logFileHandle,
          let data = (message + "\n").data(using: .utf8) else { return }
    handle.write(data)
}

func closeLogFile() {
    logFileHandle?.closeFile()
    if let path = logFilePath {
        print("\n📝 Detailed log saved to: \(path)")
        print("   Open with: cat \(path)")
    }
}

extension DateFormatter {
    func then(_ block: (DateFormatter) -> Void) -> DateFormatter {
        block(self)
        return self
    }
}

// MARK: - Test Result Structures

struct TranscriptionUpdate {
    let timestamp: Date
    let text: String
    let isFinal: Bool
    let wordCount: Int
    let deltaWords: Int
}

struct EngineResults {
    var updates: [TranscriptionUpdate] = []
    var firstResultTime: Date?
    var lastResultTime: Date?
    var totalUpdates: Int = 0
    var totalFinalResults: Int = 0
    var finalText: String = ""
    
    mutating func addUpdate(_ text: String, isFinal: Bool, timestamp: Date, previousWordCount: Int) {
        let words = text.split(separator: " ", omittingEmptySubsequences: true).count
        let delta = words - previousWordCount
        
        let update = TranscriptionUpdate(
            timestamp: timestamp,
            text: text,
            isFinal: isFinal,
            wordCount: words,
            deltaWords: delta
        )
        
        updates.append(update)
        totalUpdates += 1
        if isFinal {
            totalFinalResults += 1
            finalText = text
        }
        
        if firstResultTime == nil {
            firstResultTime = timestamp
        }
        lastResultTime = timestamp
    }
}

// MARK: - Main Test Class

@available(macOS 26.0, *)
class STTComparisonTest {
    let testStart = Date()
    let testDuration: Double = 60.0
    
    // Audio engine
    let audioEngine = AVAudioEngine()
    
    // SpeechAnalyzer components
    var speechAnalyzer: SpeechAnalyzer?
    var speechTranscriber: SpeechTranscriber?
    var analyzerContinuation: AsyncStream<AnalyzerInput>.Continuation?
    var analyzerTask: Task<Void, Error>?
    var analyzerFormat: AVAudioFormat?
    var analyzerConverter: AVAudioConverter?
    var analyzerFrameCount: Int64 = 0
    
    // SFSpeechRecognizer components
    var sfRecognizer: SFSpeechRecognizer?
    var sfRequest: SFSpeechAudioBufferRecognitionRequest?
    var sfTask: SFSpeechRecognitionTask?
    
    // Results tracking
    var speechAnalyzerResults = EngineResults()
    var sfSpeechResults = EngineResults()
    var speechAnalyzerLastWordCount = 0
    var sfSpeechLastWordCount = 0
    
    // Diagnostics
    var totalBuffersProcessed = 0
    var currentRMS: Float = 0.0
    
    func log(_ msg: String) {
        let t = String(format: "%6.1f", Date().timeIntervalSince(testStart))
        let output = "[T+\(t)s] \(msg)"
        print(output)
        writeToLog(output)
        fflush(stdout)
    }
    
    func run() async throws {
        print("")
        print("================================================================")
        print("  STT ENGINE COMPARISON TEST")
        print("================================================================")
        print("")
        print("  Comparing: SpeechAnalyzer vs SFSpeechRecognizer")
        print("  Duration: \(Int(testDuration)) seconds")
        print("  Instructions: Play English learning video from phone near mic")
        print("")
        
        initializeLogFile()
        
        // ── Setup SpeechAnalyzer ──
        log("Setting up SpeechAnalyzer...")
        
        guard let locale = await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: "en-US")) else {
            log("FATAL: en-US not supported")
            return
        }
        
        // Use .volatileResults + .fastResults for word-by-word streaming
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange]
        )
        self.speechTranscriber = transcriber
        
        guard let aFmt = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber]) else {
            log("FATAL: No compatible audio format")
            return
        }
        self.analyzerFormat = aFmt
        
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.speechAnalyzer = analyzer
        
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzerContinuation = cont
        
        // Start SpeechAnalyzer result consumer
        analyzerTask = Task { [weak self] in
            guard let self else { return }
            for try await result in transcriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                
                let now = Date()
                let t = String(format: "%6.1f", now.timeIntervalSince(self.testStart))
                let prevCount = self.speechAnalyzerLastWordCount
                
                self.speechAnalyzerResults.addUpdate(
                    text,
                    isFinal: result.isFinal,
                    timestamp: now,
                    previousWordCount: prevCount
                )
                
                let words = text.split(separator: " ").count
                let delta = words - prevCount
                self.speechAnalyzerLastWordCount = words
                
                let finalFlag = result.isFinal ? "[FINAL]" : "[partial]"
                self.log("ANALYZER \(finalFlag) +\(delta)w (total:\(words)w): \"\(text.prefix(80))\"")
                
                // Detailed log
                writeToLog("  └─ Full text: \"\(text)\"")
            }
        }
        
        log("✅ SpeechAnalyzer ready")
        
        // ── Setup SFSpeechRecognizer ──
        log("Setting up SFSpeechRecognizer...")
        
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
              recognizer.isAvailable else {
            log("FATAL: SFSpeechRecognizer not available")
            return
        }
        self.sfRecognizer = recognizer
        
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
            log("  Using on-device recognition")
        }
        self.sfRequest = request
        
        sfTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self, let result = result else { return }
            
            let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return }
            
            let now = Date()
            let t = String(format: "%6.1f", now.timeIntervalSince(self.testStart))
            let prevCount = self.sfSpeechLastWordCount
            
            self.sfSpeechResults.addUpdate(
                text,
                isFinal: result.isFinal,
                timestamp: now,
                previousWordCount: prevCount
            )
            
            let words = text.split(separator: " ").count
            let delta = words - prevCount
            self.sfSpeechLastWordCount = words
            
            let finalFlag = result.isFinal ? "[FINAL]" : "[partial]"
            self.log("SFSPEECH \(finalFlag) +\(delta)w (total:\(words)w): \"\(text.prefix(80))\"")
            
            // Detailed log
            writeToLog("  └─ Full text: \"\(text)\"")
        }
        
        log("✅ SFSpeechRecognizer ready")
        
        // ── Setup audio tap ──
        let inNode = audioEngine.inputNode
        let inFmt = inNode.outputFormat(forBus: 0)
        let tapFmt = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: inFmt.sampleRate,
            channels: 1,
            interleaved: false
        )!
        
        guard let conv = AVAudioConverter(from: tapFmt, to: aFmt) else {
            log("FATAL: Cannot create audio converter")
            return
        }
        self.analyzerConverter = conv
        
        log("Installing audio tap...")
        inNode.installTap(onBus: 0, bufferSize: 1024, format: tapFmt) { [weak self] buf, _ in
            guard let self else { return }
            
            self.totalBuffersProcessed += 1
            
            // Calculate RMS for diagnostics
            if let data = buf.floatChannelData?[0] {
                var sumSquares: Float = 0
                let count = Int(buf.frameLength)
                for i in 0..<count { sumSquares += data[i] * data[i] }
                self.currentRMS = sqrt(sumSquares / Float(max(count, 1)))
            }
            
            // Feed to SFSpeechRecognizer (uses original buffer)
            self.sfRequest?.append(buf)
            
            // Convert and feed to SpeechAnalyzer
            guard let aFmt = self.analyzerFormat,
                  let conv = self.analyzerConverter else { return }
            
            let ratio = aFmt.sampleRate / tapFmt.sampleRate
            let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio)
            guard cap > 0,
                  let out = AVAudioPCMBuffer(pcmFormat: aFmt, frameCapacity: cap) else { return }
            
            var err: NSError?
            conv.convert(to: out, error: &err) { _, status in
                status.pointee = .haveData
                return buf
            }
            
            if err == nil && out.frameLength > 0 {
                let t = CMTime(
                    value: CMTimeValue(self.analyzerFrameCount),
                    timescale: CMTimeScale(aFmt.sampleRate)
                )
                self.analyzerFrameCount += Int64(out.frameLength)
                self.analyzerContinuation?.yield(AnalyzerInput(buffer: out, bufferStartTime: t))
            }
        }
        
        // ── Start engines ──
        log("Starting audio engine...")
        audioEngine.prepare()
        try audioEngine.start()
        
        log("Starting SpeechAnalyzer...")
        try await analyzer.start(inputSequence: stream)
        
        log("")
        log("🎤 LISTENING FOR \(Int(testDuration)) SECONDS")
        log("   Play background audio (English video from phone) near microphone")
        log("")
        
        // ── Listen for test duration ──
        let startTime = Date()
        var lastDiagTime = Date()
        
        while Date().timeIntervalSince(startTime) < testDuration {
            try await Task.sleep(for: .seconds(1))
            
            let now = Date()
            if now.timeIntervalSince(lastDiagTime) >= 5.0 {
                lastDiagTime = now
                let elapsed = Int(now.timeIntervalSince(startTime))
                let remaining = Int(testDuration) - elapsed
                log("⏱️  \(elapsed)s elapsed, \(remaining)s remaining | RMS: \(String(format: "%.4f", currentRMS)) | Buffers: \(totalBuffersProcessed)")
            }
        }
        
        log("")
        log("⏹️  Test duration complete, finalizing...")
        
        // ── Finalize ──
        sfRequest?.endAudio()
        try await analyzer.finalize(through: nil)
        
        // Wait for final results
        try await Task.sleep(for: .seconds(2))
        
        // ── Generate comparison report ──
        generateReport()
        
        closeLogFile()
    }
    
    func generateReport() {
        log("")
        log("================================================================")
        log("  COMPARISON RESULTS")
        log("================================================================")
        log("")
        
        // SpeechAnalyzer stats
        log("SpeechAnalyzer:")
        log("  Total updates: \(speechAnalyzerResults.totalUpdates)")
        log("  Final results: \(speechAnalyzerResults.totalFinalResults)")
        if let first = speechAnalyzerResults.firstResultTime {
            let latency = first.timeIntervalSince(testStart)
            log("  First result: \(String(format: "%.2f", latency))s after start")
        }
        if let last = speechAnalyzerResults.lastResultTime {
            let duration = last.timeIntervalSince(speechAnalyzerResults.firstResultTime ?? testStart)
            log("  Active duration: \(String(format: "%.1f", duration))s")
        }
        log("  Final text: \"\(speechAnalyzerResults.finalText.prefix(100))...\"")
        log("  Word count: \(speechAnalyzerResults.finalText.split(separator: " ").count)")
        log("")
        
        // SFSpeechRecognizer stats
        log("SFSpeechRecognizer:")
        log("  Total updates: \(sfSpeechResults.totalUpdates)")
        log("  Final results: \(sfSpeechResults.totalFinalResults)")
        if let first = sfSpeechResults.firstResultTime {
            let latency = first.timeIntervalSince(testStart)
            log("  First result: \(String(format: "%.2f", latency))s after start")
        }
        if let last = sfSpeechResults.lastResultTime {
            let duration = last.timeIntervalSince(sfSpeechResults.firstResultTime ?? testStart)
            log("  Active duration: \(String(format: "%.1f", duration))s")
        }
        log("  Final text: \"\(sfSpeechResults.finalText.prefix(100))...\"")
        log("  Word count: \(sfSpeechResults.finalText.split(separator: " ").count)")
        log("")
        
        // Timing comparison
        if let saFirst = speechAnalyzerResults.firstResultTime,
           let sfFirst = sfSpeechResults.firstResultTime {
            let diff = sfFirst.timeIntervalSince(saFirst)
            let faster = diff > 0 ? "SpeechAnalyzer" : "SFSpeechRecognizer"
            log("⚡ First result: \(faster) was \(String(format: "%.2f", abs(diff)))s faster")
        }
        
        // Update frequency
        let saDuration = (speechAnalyzerResults.lastResultTime ?? testStart)
            .timeIntervalSince(speechAnalyzerResults.firstResultTime ?? testStart)
        let sfDuration = (sfSpeechResults.lastResultTime ?? testStart)
            .timeIntervalSince(sfSpeechResults.firstResultTime ?? testStart)
        
        if saDuration > 0 {
            let saFreq = Double(speechAnalyzerResults.totalUpdates) / saDuration
            log("  SpeechAnalyzer: \(String(format: "%.1f", saFreq)) updates/sec")
        }
        if sfDuration > 0 {
            let sfFreq = Double(sfSpeechResults.totalUpdates) / sfDuration
            log("  SFSpeechRecognizer: \(String(format: "%.1f", sfFreq)) updates/sec")
        }
        
        log("")
        log("📊 Detailed timing data saved to log file")
        log("   Analyze with: grep 'ANALYZER\\|SFSPEECH' \(logFilePath ?? "")")
    }
}

// MARK: - Entry Point

@main
struct ComparisonEntry {
    static func main() {
        setStdoutUnbuffered()
        guard #available(macOS 26.0, *) else {
            print("❌ Requires macOS 26.0+")
            exit(1)
        }
        
        Task {
            let test = STTComparisonTest()
            do {
                try await test.run()
            } catch {
                print("❌ FATAL: \(error)")
            }
            exit(0)
        }
        
        RunLoop.main.run()
    }
}
