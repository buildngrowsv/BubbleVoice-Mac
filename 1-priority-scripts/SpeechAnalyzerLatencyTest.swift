/// SpeechAnalyzerLatencyTest.swift
///
/// PURPOSE: Measure SpeechAnalyzer's inherent result-delivery latency.
/// We run THREE tests back-to-back, each 30 seconds:
///
///   TEST A: Bare SpeechAnalyzer (no VPIO) — baseline latency
///   TEST B: SpeechAnalyzer + VPIO — does VPIO change delivery cadence?
///   TEST C: SpeechAnalyzer + VPIO + TTS mid-test — does TTS cause stalls?
///
/// For each test, we log every result with the gap (in seconds) since the
/// previous result. This tells us the actual batch cadence.
///
/// KEY QUESTION: Is the ~3.8s batch cadence inherent to SpeechAnalyzer,
/// or is it caused by our VPIO/TTS setup?
///
/// USAGE: swiftc -parse-as-library -framework AVFoundation -framework Speech \
///        -framework CoreMedia -O -o /tmp/latency_test SpeechAnalyzerLatencyTest.swift
///        /tmp/latency_test

import AVFoundation
import Foundation
import Speech

func setStdoutUnbuffered() { setbuf(stdout, nil) }

/// Shared timestamp helper. Returns seconds since testStart.
var globalTestStart = Date()
func ts() -> String { String(format: "%6.1f", Date().timeIntervalSince(globalTestStart)) }

/// Convert mic buffer to analyzer format.
/// The converter handles sample rate and format changes.
func convertBuffer(
    _ buffer: AVAudioPCMBuffer,
    converter: AVAudioConverter,
    targetFormat: AVAudioFormat
) -> AVAudioPCMBuffer? {
    let ratio = targetFormat.sampleRate / converter.inputFormat.sampleRate
    let cap = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
    guard let out = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: cap) else { return nil }
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
        status.pointee = .haveData
        return buffer
    }
    return (err == nil && out.frameLength > 0) ? out : nil
}

/// Runs a single test measuring SpeechAnalyzer result delivery gaps.
///
/// - Parameters:
///   - name: Display name for the test
///   - enableVPIO: Whether to turn on Voice Processing IO
///   - playTTSAt: If non-nil, play a TTS audio file N seconds into the test
///   - duration: How long to run the test
///
/// This function creates a fresh AVAudioEngine + SpeechAnalyzer for each run
/// to avoid any state leakage between tests.
@available(macOS 26.0, *)
func runTest(name: String, enableVPIO: Bool, playTTSAt: Double?, duration: Double = 30.0) async {
    print("")
    print("══════════════════════════════════════════════════════════════")
    print("  \(name)")
    print("  VPIO: \(enableVPIO ? "ON" : "OFF") | TTS: \(playTTSAt != nil ? "at \(Int(playTTSAt!))s" : "none") | Duration: \(Int(duration))s")
    print("══════════════════════════════════════════════════════════════")
    print("")
    
    let engine = AVAudioEngine()
    let playerNode = AVAudioPlayerNode()
    
    // ── Setup VPIO if requested ──
    if enableVPIO {
        do {
            try engine.outputNode.setVoiceProcessingEnabled(true)
            let outFmt = engine.outputNode.outputFormat(forBus: 0)
            engine.connect(engine.mainMixerNode, to: engine.outputNode, format: outFmt)
            engine.attach(playerNode)
            engine.connect(playerNode, to: engine.mainMixerNode, format: nil)
            print("[T+\(ts())s] VPIO enabled, output format: \(outFmt)")
        } catch {
            print("[T+\(ts())s] ERROR enabling VPIO: \(error)")
            return
        }
    }
    
    // ── Setup SpeechAnalyzer ──
    guard let locale = await SpeechTranscriber.supportedLocale(
        equivalentTo: Locale(identifier: "en-US")) else {
        print("  FATAL: en-US not supported"); return
    }
    
    // CRITICAL: Must use BOTH .volatileResults AND .fastResults together.
    // .volatileResults alone: SpeechAnalyzer batches results in ~3.8 second chunks.
    // .volatileResults + .fastResults: Streams word-by-word at 200-500ms intervals.
    // The .timeIndexedProgressiveTranscription preset maps to these exact flags.
    let transcriber = SpeechTranscriber(
        locale: locale,
        transcriptionOptions: [],
        reportingOptions: [.volatileResults, .fastResults],
        attributeOptions: [.audioTimeRange]
    )
    
    guard let aFmt = await SpeechAnalyzer.bestAvailableAudioFormat(
        compatibleWith: [transcriber]) else {
        print("  FATAL: no audio format"); return
    }
    
    print("[T+\(ts())s] Analyzer format: \(aFmt)")
    
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    
    // ── Setup audio tap ──
    let inNode = engine.inputNode
    let inFmt = inNode.outputFormat(forBus: 0)
    print("[T+\(ts())s] Input format: \(inFmt)")
    
    // Use mono float32 at input sample rate for tap, then convert to analyzer format
    let tapFmt = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: inFmt.sampleRate,
        channels: 1,
        interleaved: false
    )!
    
    guard let converter = AVAudioConverter(from: tapFmt, to: aFmt) else {
        print("  FATAL: can't create converter"); return
    }
    
    // Track buffer counts and energy
    var totalBuffers = 0
    var buffersSinceResult = 0
    var lastDiagLog = Date.distantPast
    var frameCount: Int64 = 0
    
    inNode.installTap(onBus: 0, bufferSize: 1024, format: tapFmt) { buf, _ in
        // RMS for diagnostics
        var rmsVal: Float = 0
        if let data = buf.floatChannelData?[0] {
            var s: Float = 0
            let n = Int(buf.frameLength)
            for i in 0..<n { s += data[i] * data[i] }
            rmsVal = sqrt(s / Float(max(n, 1)))
        }
        
        // Periodic diagnostic (every 5s to minimize noise)
        let now = Date()
        if now.timeIntervalSince(lastDiagLog) >= 5.0 {
            lastDiagLog = now
            let t = String(format: "%6.1f", now.timeIntervalSince(globalTestStart))
            print("[T+\(t)s] DIAG bufs_total=\(totalBuffers) bufs_since_result=\(buffersSinceResult) rms=\(String(format: "%.4f", rmsVal))")
            fflush(stdout)
        }
        
        // Convert and feed to analyzer
        let ratio = aFmt.sampleRate / tapFmt.sampleRate
        let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio)
        guard cap > 0, let out = AVAudioPCMBuffer(pcmFormat: aFmt, frameCapacity: cap) else { return }
        var err: NSError?
        converter.convert(to: out, error: &err) { _, s in s.pointee = .haveData; return buf }
        if err == nil && out.frameLength > 0 {
            let t = CMTime(value: CMTimeValue(frameCount), timescale: CMTimeScale(aFmt.sampleRate))
            frameCount += Int64(out.frameLength)
            continuation.yield(AnalyzerInput(buffer: out, bufferStartTime: t))
            totalBuffers += 1
            buffersSinceResult += 1
        }
    }
    
    // ── Start ──
    engine.prepare()
    do {
        try engine.start()
        try await analyzer.start(inputSequence: stream)
    } catch {
        print("[T+\(ts())s] ERROR starting: \(error)")
        return
    }
    
    let testStart = Date()
    print("[T+\(ts())s] Listening... (play background audio from phone)")
    fflush(stdout)
    
    // ── Result consumer — THIS IS THE KEY MEASUREMENT ──
    // We log the gap between each result delivery to see SpeechAnalyzer's cadence.
    var lastResultTime = Date()
    var resultCount = 0
    var gaps: [Double] = []
    
    let resultTask = Task {
        for try await result in transcriber.results {
            let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { continue }
            
            let now = Date()
            let gap = now.timeIntervalSince(lastResultTime)
            lastResultTime = now
            resultCount += 1
            
            // Only track gap for non-first results (first gap includes startup)
            if resultCount > 1 { gaps.append(gap) }
            
            let words = text.split(separator: " ").count
            let gapStr = resultCount == 1 ? "(first)" : String(format: "%.2fs gap", gap)
            let t = String(format: "%6.1f", now.timeIntervalSince(globalTestStart))
            print("[T+\(t)s] RESULT #\(resultCount) (\(gapStr), \(buffersSinceResult) bufs, \(words)w): \"\(text.prefix(80))\"")
            fflush(stdout)
            
            buffersSinceResult = 0
        }
    }
    
    // ── Optional TTS playback mid-test ──
    if let ttsDelay = playTTSAt {
        Task {
            try? await Task.sleep(for: .seconds(ttsDelay))
            print("[T+\(ts())s] === GENERATING TTS ===")
            fflush(stdout)
            
            let ttsPath = "/tmp/latency_test_tts.aiff"
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/usr/bin/say")
            proc.arguments = ["-o", ttsPath, "This is a test of the text to speech system during active listening."]
            try? proc.run()
            proc.waitUntilExit()
            
            print("[T+\(ts())s] === PLAYING TTS ===")
            fflush(stdout)
            
            guard let file = try? AVAudioFile(forReading: URL(fileURLWithPath: ttsPath)) else {
                print("[T+\(ts())s] TTS file error"); return
            }
            
            await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
                playerNode.scheduleFile(file, at: nil) { c.resume() }
                playerNode.play()
            }
            
            print("[T+\(ts())s] === TTS FINISHED ===")
            fflush(stdout)
        }
    }
    
    // ── Wait for test duration ──
    try? await Task.sleep(for: .seconds(duration))
    
    // ── Cleanup ──
    playerNode.stop()
    engine.stop()
    inNode.removeTap(onBus: 0)
    continuation.finish()
    resultTask.cancel()
    
    // ── Summary ──
    print("")
    print("── \(name) SUMMARY ──")
    print("  Total results: \(resultCount)")
    print("  Total buffers fed: \(totalBuffers)")
    if !gaps.isEmpty {
        let avgGap = gaps.reduce(0, +) / Double(gaps.count)
        let minGap = gaps.min()!
        let maxGap = gaps.max()!
        let medianGap = gaps.sorted()[gaps.count / 2]
        print("  Result gaps (excl. first):")
        print("    min: \(String(format: "%.2f", minGap))s")
        print("    avg: \(String(format: "%.2f", avgGap))s")
        print("    median: \(String(format: "%.2f", medianGap))s")
        print("    max: \(String(format: "%.2f", maxGap))s")
        print("    all: \(gaps.map { String(format: "%.1f", $0) })")
    }
    print("")
    fflush(stdout)
    
    // Brief pause between tests so audio system can reset
    try? await Task.sleep(for: .seconds(2))
}

// MARK: - Entry Point

@main
struct LatencyTestEntry {
    static func main() {
        setStdoutUnbuffered()
        guard #available(macOS 26.0, *) else { print("Requires macOS 26+"); exit(1) }
        
        globalTestStart = Date()
        
        print("================================================================")
        print("  SpeechAnalyzer Latency Comparison Test")
        print("  3 tests × 30s each = ~90s total")
        print("  PLAY BACKGROUND AUDIO FROM PHONE throughout all tests!")
        print("================================================================")
        
        Task {
            // TEST A: Pure SpeechAnalyzer, no VPIO, no TTS
            // This gives us the INHERENT latency of SpeechAnalyzer
            if #available(macOS 26.0, *) {
                await runTest(
                    name: "TEST A: Bare SpeechAnalyzer (no VPIO)",
                    enableVPIO: false,
                    playTTSAt: nil,
                    duration: 30.0
                )
            }
            
            // TEST B: SpeechAnalyzer + VPIO, no TTS
            // Shows if VPIO changes the delivery cadence
            if #available(macOS 26.0, *) {
                await runTest(
                    name: "TEST B: SpeechAnalyzer + VPIO (no TTS)",
                    enableVPIO: true,
                    playTTSAt: nil,
                    duration: 30.0
                )
            }
            
            // TEST C: SpeechAnalyzer + VPIO + TTS at 10s mark
            // Shows if TTS playback causes stalls or longer gaps
            if #available(macOS 26.0, *) {
                await runTest(
                    name: "TEST C: SpeechAnalyzer + VPIO + TTS at 10s",
                    enableVPIO: true,
                    playTTSAt: 10.0,
                    duration: 30.0
                )
            }
            
            print("================================================================")
            print("  ALL TESTS COMPLETE")
            print("================================================================")
            exit(0)
        }
        RunLoop.main.run()
    }
}
