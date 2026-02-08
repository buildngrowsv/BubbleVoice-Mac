/**
 * COMPREHENSIVE SPEECH DIAGNOSTIC — ALL API APPROACHES
 *
 * Tests every known speech recognition approach on macOS 26 to find which
 * one(s) can transcribe background/distant speech (video on another device).
 *
 * INSIGHT: macOS built-in dictation (double-tap Command) works perfectly
 * for this use case. It uses DictationTranscriber internally, NOT
 * SpeechTranscriber. Our production code uses SpeechTranscriber.
 *
 * TESTS (each 20s):
 *   1. Raw energy baseline — with and without VPIO
 *   2. SpeechTranscriber (current prod) — bare, no filters
 *   3. SpeechTranscriber + VPIO (AGC boosts signal)
 *   4. SpeechTranscriber + software gain (amplify samples 10x)
 *   5. SpeechTranscriber + VPIO + software gain combo
 *   6. DictationTranscriber — what macOS dictation actually uses
 *   7. DictationTranscriber + VPIO
 *   8. SFSpeechRecognizer (legacy) — with gain boost
 *   9. SpeechTranscriber with larger buffer (8192)
 *  10. SpeechTranscriber + VPIO + max inputGain setting
 *
 * ASSUMES: Continuous speech in environment (video/podcast on another device).
 *
 * USAGE:
 *   swift ComprehensiveSpeechDiagnostic.swift 2>&1 | tee diagnostic-results.txt
 */

import Foundation
@preconcurrency import Speech
@preconcurrency import AVFoundation
import CoreMedia

// ============================================================
// CONFIG
// ============================================================
let TEST_DURATION: Double = 20.0
let VAD_THRESHOLD: Float = 0.008
let SOFTWARE_GAIN: Float = 10.0  // Multiply samples by this for software amplification tests

// ============================================================
// UTILITIES
// ============================================================
func ts() -> String {
    let f = DateFormatter(); f.dateFormat = "HH:mm:ss.SSS"; return f.string(from: Date())
}
func header(_ t: String) {
    print("\n╔══════════════════════════════════════════════════════════════╗")
    print("║  \(t.padding(toLength: 58, withPad: " ", startingAt: 0))║")
    print("╚══════════════════════════════════════════════════════════════╝\n")
}
func log(_ l: String, _ v: String) { print("  [\(ts())] \(l): \(v)") }

func rms(_ buf: AVAudioPCMBuffer) -> Float {
    guard let d = buf.floatChannelData else { return 0 }
    let n = Int(buf.frameLength); guard n > 0 else { return 0 }
    var s: Float = 0; for i in 0..<n { s += d[0][i]*d[0][i] }
    return sqrt(s/Float(n))
}

func energySummary(_ samples: [Float]) {
    guard !samples.isEmpty else { print("  No energy samples"); return }
    let mn = samples.min()!, mx = samples.max()!
    let av = samples.reduce(0,+)/Float(samples.count)
    let above = samples.filter { $0 >= VAD_THRESHOLD }.count
    print("  Energy — min: \(String(format:"%.5f",mn)), avg: \(String(format:"%.5f",av)), max: \(String(format:"%.5f",mx))")
    print("  Frames above VAD (\(VAD_THRESHOLD)): \(above)/\(samples.count) (\(Int(Double(above)/Double(max(1,samples.count))*100))%)")
}

/// Standard buffer converter: mic format → analyzer format (16kHz Int16)
func convertBuffer(_ buffer: AVAudioPCMBuffer, converter: AVAudioConverter) -> AVAudioPCMBuffer? {
    let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
    let cap = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
    guard let out = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: cap) else { return nil }
    nonisolated(unsafe) var provided = false
    var err: NSError?
    let st = converter.convert(to: out, error: &err) { _, status in
        if provided { status.pointee = .noDataNow; return nil }
        provided = true; status.pointee = .haveData; return buffer
    }
    return (st != .error && err == nil) ? out : nil
}

/// Software gain: amplify float samples in-place before conversion
func amplifyBuffer(_ buffer: AVAudioPCMBuffer, gain: Float) {
    guard let d = buffer.floatChannelData else { return }
    let n = Int(buffer.frameLength)
    for i in 0..<n {
        d[0][i] = max(-1.0, min(1.0, d[0][i] * gain))  // Clamp to prevent distortion
    }
}

/// Print final test summary row for the comparison table
func printSummaryRow(_ testNum: Int, _ name: String, _ txCount: Int, _ samples: [Float]) {
    let avgE = samples.isEmpty ? 0 : samples.reduce(0,+)/Float(samples.count)
    let maxE = samples.max() ?? 0
    let above = samples.filter { $0 >= VAD_THRESHOLD }.count
    let pct = samples.isEmpty ? 0 : Int(Double(above)/Double(samples.count)*100)
    print("  \(String(format:"%2d",testNum)). \(name.padding(toLength: 42, withPad: " ", startingAt: 0)) | TX: \(String(format:"%3d",txCount)) | avgE: \(String(format:"%.4f",avgE)) | maxE: \(String(format:"%.4f",maxE)) | above VAD: \(pct)%")
}

// Global results collector for final comparison table
struct TestResult {
    let num: Int; let name: String; let txCount: Int; let samples: [Float]
    let transcriptions: [(String, String, Bool)]
}
var allResults: [TestResult] = []

// ============================================================
// TEST 1: Raw Energy Baseline (no VPIO vs VPIO)
// ============================================================
func test1_EnergyBaseline() async {
    header("TEST 1: Raw Energy Baseline (10s no VPIO + 10s VPIO)")

    // Phase A: No VPIO
    var samplesA: [Float] = []
    do {
        let engine = AVAudioEngine(); let node = engine.inputNode
        node.removeTap(onBus: 0)
        let fmt = node.outputFormat(forBus: 0)
        node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in samplesA.append(rms(buf)) }
        try engine.start(); log("STATUS","Phase A: No VPIO — monitoring 10s...")
        try await Task.sleep(for: .seconds(10))
        engine.stop(); node.removeTap(onBus: 0)
    } catch { log("ERR","\(error)") }
    print("  Phase A (no VPIO):"); energySummary(samplesA)

    // Phase B: With VPIO
    var samplesB: [Float] = []
    do {
        let engine = AVAudioEngine(); let node = engine.inputNode
        try node.setVoiceProcessingEnabled(true)
        node.removeTap(onBus: 0)
        let fmt = node.outputFormat(forBus: 0)
        node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in samplesB.append(rms(buf)) }
        try engine.start(); log("STATUS","Phase B: VPIO — monitoring 10s...")
        try await Task.sleep(for: .seconds(10))
        engine.stop(); node.removeTap(onBus: 0)
    } catch { log("ERR","\(error)") }
    print("  Phase B (VPIO):"); energySummary(samplesB)

    allResults.append(TestResult(num: 1, name: "Energy baseline (no VPIO)", txCount: 0, samples: samplesA, transcriptions: []))
    allResults.append(TestResult(num: 1, name: "Energy baseline (VPIO)", txCount: 0, samples: samplesB, transcriptions: []))
}

// ============================================================
// GENERIC SpeechTranscriber test runner
// ============================================================
func runSpeechTranscriberTest(
    testNum: Int,
    name: String,
    enableVPIO: Bool,
    softwareGain: Float?,
    bufferSize: AVAudioFrameCount = 4096,
    tryInputGain: Bool = false
) async {
    header("TEST \(testNum): \(name)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []

    let engine = AVAudioEngine(); let node = engine.inputNode

    if enableVPIO {
        do { try node.setVoiceProcessingEnabled(true); log("STATUS","VPIO enabled") }
        catch { log("WARN","VPIO fail: \(error)") }
    }

    if tryInputGain {
        // macOS doesn't support AVAudioSession.setInputGain — it's iOS only.
        // Instead, we try software gain as a fallback.
        log("STATUS","inputGain unavailable on macOS — using 20x software gain instead")
    }

    do {
        let transcriber = SpeechTranscriber(
            locale: Locale(identifier: "en-US"),
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let aFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        let inFmt = node.outputFormat(forBus: 0)
        let conv = AVAudioConverter(from: inFmt, to: aFmt)!; conv.primeMethod = .none
        var frames: UInt64 = 0

        let rTask = Task {
            for try await result in transcriber.results {
                let t = String(result.text.characters)
                if !t.isEmpty { txCount += 1; txs.append((ts(),t,result.isFinal))
                    log("TX","\(result.isFinal ? "[F]":"[V]") \"\(t)\"") }
            }
        }
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: bufferSize, format: inFmt) { buf, _ in
            // Software gain amplification if requested
            if let gain = softwareGain, gain != 1.0 {
                amplifyBuffer(buf, gain: gain)
            }
            samples.append(rms(buf))
            guard let c = convertBuffer(buf, converter: conv) else { return }
            let st = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(16000))
            frames += UInt64(c.frameLength)
            continuation.yield(AnalyzerInput(buffer: c, bufferStartTime: st))
        }
        try engine.start(); log("STATUS","Listening...")
        try await analyzer.start(inputSequence: stream)
        try await Task.sleep(for: .seconds(TEST_DURATION))
        engine.stop(); node.removeTap(onBus: 0); continuation.finish(); rTask.cancel()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch { log("ERR","\(error)") }

    print("\n  ── TEST \(testNum) SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
    allResults.append(TestResult(num: testNum, name: name, txCount: txCount, samples: samples, transcriptions: txs))
}

// ============================================================
// GENERIC DictationTranscriber test runner
// ============================================================
func runDictationTranscriberTest(
    testNum: Int,
    name: String,
    enableVPIO: Bool,
    softwareGain: Float? = nil
) async {
    header("TEST \(testNum): \(name)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []

    let engine = AVAudioEngine(); let node = engine.inputNode

    if enableVPIO {
        do { try node.setVoiceProcessingEnabled(true); log("STATUS","VPIO enabled") }
        catch { log("WARN","VPIO fail: \(error)") }
    }

    do {
        // DictationTranscriber — what macOS dictation actually uses
        // contentHints is required — empty set means no content hints
        let transcriber = DictationTranscriber(
            locale: Locale(identifier: "en-US"),
            contentHints: [],
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let aFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        let inFmt = node.outputFormat(forBus: 0)
        let conv = AVAudioConverter(from: inFmt, to: aFmt)!; conv.primeMethod = .none
        var frames: UInt64 = 0

        let rTask = Task {
            for try await result in transcriber.results {
                let t = String(result.text.characters)
                if !t.isEmpty { txCount += 1; txs.append((ts(),t,result.isFinal))
                    log("TX","\(result.isFinal ? "[F]":"[V]") \"\(t)\"") }
            }
        }
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 4096, format: inFmt) { buf, _ in
            if let gain = softwareGain, gain != 1.0 {
                amplifyBuffer(buf, gain: gain)
            }
            samples.append(rms(buf))
            guard let c = convertBuffer(buf, converter: conv) else { return }
            let st = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(16000))
            frames += UInt64(c.frameLength)
            continuation.yield(AnalyzerInput(buffer: c, bufferStartTime: st))
        }
        try engine.start(); log("STATUS","Listening...")
        try await analyzer.start(inputSequence: stream)
        try await Task.sleep(for: .seconds(TEST_DURATION))
        engine.stop(); node.removeTap(onBus: 0); continuation.finish(); rTask.cancel()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch { log("ERR","\(error)") }

    print("\n  ── TEST \(testNum) SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
    allResults.append(TestResult(num: testNum, name: name, txCount: txCount, samples: samples, transcriptions: txs))
}

// ============================================================
// TEST 8: Legacy SFSpeechRecognizer + software gain
// ============================================================
func test8_LegacyWithGain() async {
    header("TEST 8: SFSpeechRecognizer + software gain (10x)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []
    let engine = AVAudioEngine(); let node = engine.inputNode

    guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
        log("ERR","SFSpeechRecognizer not available"); return
    }
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.shouldReportPartialResults = true
    if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true; log("STATUS","On-device") }

    let task = rec.recognitionTask(with: req) { result, error in
        if let r = result {
            let t = r.bestTranscription.formattedString
            if !t.isEmpty { txCount += 1; txs.append((ts(),t,r.isFinal))
                log("TX","\(r.isFinal ? "[F]":"[V]") \"\(t)\"") }
        }
    }
    let fmt = node.outputFormat(forBus: 0)
    node.removeTap(onBus: 0)
    node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in
        amplifyBuffer(buf, gain: SOFTWARE_GAIN)
        samples.append(rms(buf))
        req.append(buf)
    }
    do { try engine.start(); log("STATUS","Listening (SFSpeech + 10x gain)...") } catch { log("ERR","\(error)"); return }
    try? await Task.sleep(for: .seconds(TEST_DURATION))
    engine.stop(); node.removeTap(onBus: 0); req.endAudio(); task.cancel()

    print("\n  ── TEST 8 SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
    allResults.append(TestResult(num: 8, name: "SFSpeechRecognizer + 10x gain", txCount: txCount, samples: samples, transcriptions: txs))
}

// ============================================================
// TEST 9: SFSpeechRecognizer + VPIO (AGC)
// ============================================================
func test9_LegacyVPIO() async {
    header("TEST 9: SFSpeechRecognizer + VPIO (AGC)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []
    let engine = AVAudioEngine(); let node = engine.inputNode

    do { try node.setVoiceProcessingEnabled(true); log("STATUS","VPIO enabled") }
    catch { log("WARN","VPIO fail: \(error)") }

    guard let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
        log("ERR","SFSpeechRecognizer not available"); return
    }
    let req = SFSpeechAudioBufferRecognitionRequest()
    req.shouldReportPartialResults = true
    if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true; log("STATUS","On-device") }

    let task = rec.recognitionTask(with: req) { result, error in
        if let r = result {
            let t = r.bestTranscription.formattedString
            if !t.isEmpty { txCount += 1; txs.append((ts(),t,r.isFinal))
                log("TX","\(r.isFinal ? "[F]":"[V]") \"\(t)\"") }
        }
    }
    let fmt = node.outputFormat(forBus: 0)
    node.removeTap(onBus: 0)
    node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in
        samples.append(rms(buf))
        req.append(buf)
    }
    do { try engine.start(); log("STATUS","Listening (SFSpeech + VPIO)...") } catch { log("ERR","\(error)"); return }
    try? await Task.sleep(for: .seconds(TEST_DURATION))
    engine.stop(); node.removeTap(onBus: 0); req.endAudio(); task.cancel()

    print("\n  ── TEST 9 SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
    allResults.append(TestResult(num: 9, name: "SFSpeechRecognizer + VPIO", txCount: txCount, samples: samples, transcriptions: txs))
}

// ============================================================
// MAIN
// ============================================================
header("COMPREHENSIVE SPEECH DIAGNOSTIC — 10 TESTS")
print("  Each test: \(Int(TEST_DURATION))s. Total: ~\(Int(TEST_DURATION * 10 + 30))s")
print("  Ensure background speech (video/podcast) is playing on another device.\n")

Task {
    // Test 1: Energy baseline
    await test1_EnergyBaseline()

    // Test 2: SpeechTranscriber bare
    await runSpeechTranscriberTest(testNum: 2, name: "SpeechTranscriber (bare, no filters)", enableVPIO: false, softwareGain: nil)

    // Test 3: SpeechTranscriber + VPIO
    await runSpeechTranscriberTest(testNum: 3, name: "SpeechTranscriber + VPIO", enableVPIO: true, softwareGain: nil)

    // Test 4: SpeechTranscriber + software gain 10x
    await runSpeechTranscriberTest(testNum: 4, name: "SpeechTranscriber + 10x software gain", enableVPIO: false, softwareGain: SOFTWARE_GAIN)

    // Test 5: SpeechTranscriber + VPIO + software gain
    await runSpeechTranscriberTest(testNum: 5, name: "SpeechTranscriber + VPIO + 10x gain", enableVPIO: true, softwareGain: SOFTWARE_GAIN)

    // Test 6: DictationTranscriber bare
    await runDictationTranscriberTest(testNum: 6, name: "DictationTranscriber (bare)", enableVPIO: false)

    // Test 7: DictationTranscriber + VPIO
    await runDictationTranscriberTest(testNum: 7, name: "DictationTranscriber + VPIO", enableVPIO: true)

    // Test 8: SFSpeechRecognizer + gain
    await test8_LegacyWithGain()

    // Test 9: SFSpeechRecognizer + VPIO
    await test9_LegacyVPIO()

    // Test 10: SpeechTranscriber + VPIO + extreme software gain (20x)
    await runSpeechTranscriberTest(testNum: 10, name: "SpeechTranscriber + VPIO + 20x gain", enableVPIO: true, softwareGain: 20.0, tryInputGain: false)

    // ============================================================
    // FINAL COMPARISON TABLE
    // ============================================================
    header("FINAL COMPARISON TABLE")
    print("  #   Name                                           | TX     | avgE     | maxE     | above VAD")
    print("  ─── ────────────────────────────────────────────── │ ────── │ ──────── │ ──────── │ ─────────")
    for r in allResults {
        printSummaryRow(r.num, r.name, r.txCount, r.samples)
    }

    // Print all transcriptions from any test that got results
    let withTx = allResults.filter { $0.txCount > 0 }
    if withTx.isEmpty {
        print("\n  ⚠️  NO TRANSCRIPTIONS from any test. The background speech")
        print("     may be too quiet or the mic may not be picking it up.")
    } else {
        print("\n  ✅ Tests with transcriptions:")
        for r in withTx {
            print("    Test \(r.num) (\(r.name)): \(r.txCount) transcriptions")
            for t in r.transcriptions.prefix(5) {
                print("      \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1.prefix(80))\"")
            }
        }
    }
    print("")

    exit(0)
}
RunLoop.main.run()
