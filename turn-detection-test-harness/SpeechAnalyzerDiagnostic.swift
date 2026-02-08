/**
 * SPEECH ANALYZER DIAGNOSTIC — MULTI-TEST SUITE
 *
 * Runs multiple SpeechAnalyzer configurations in sequence to figure out
 * what combination actually produces transcription results from ambient/
 * background speech (e.g. a video playing on another device).
 *
 * TESTS (in order):
 *   5. Raw energy monitor — confirm mic hears something
 *   1. Bare SpeechAnalyzer — no VAD gate, no Voice Processing IO
 *   2. With Voice Processing IO (hardware AEC)
 *   3. With VAD gate (prod config)
 *   4. Legacy SFSpeechRecognizer (comparison)
 *
 * Each test runs 15 seconds, logs transcriptions and energy, then moves on.
 *
 * USAGE:
 *   swift SpeechAnalyzerDiagnostic.swift
 *
 * ASSUMES: Continuous speech in environment.
 */

import Foundation
@preconcurrency import Speech
@preconcurrency import AVFoundation
import CoreMedia

let TEST_DURATION: Double = 15.0
let VAD_THRESHOLD: Float = 0.008

func ts() -> String {
    let f = DateFormatter(); f.dateFormat = "HH:mm:ss.SSS"
    return f.string(from: Date())
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
    print("  Frames above VAD (\(VAD_THRESHOLD)): \(above)/\(samples.count) (\(Int(Double(above)/Double(samples.count)*100))%)")
}

/// Convert mic buffer (48kHz float32) to analyzer format (16kHz int16)
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

// ============================================================
// TEST 5: Raw energy
// ============================================================
func test5_Energy() async {
    header("TEST 5: Raw Audio Energy (no speech processing)")
    let engine = AVAudioEngine()
    let node = engine.inputNode
    var samples: [Float] = []
    var cnt = 0
    node.removeTap(onBus: 0)
    let fmt = node.outputFormat(forBus: 0)
    node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in
        let r = rms(buf); samples.append(r); cnt += 1
        if cnt % 6 == 0 {
            let bar = String(repeating: "█", count: min(50, Int(r*500)))
            log("RMS \(String(format:"%.5f",r))", bar)
        }
    }
    do { try engine.start(); log("STATUS","Monitoring...") } catch { log("ERR","\(error)"); return }
    try? await Task.sleep(for: .seconds(TEST_DURATION))
    engine.stop(); node.removeTap(onBus: 0)
    print("\n  ── TEST 5 SUMMARY ──"); energySummary(samples)
}

// ============================================================
// TEST 1: Bare SpeechAnalyzer
// ============================================================
func test1_Bare() async {
    header("TEST 1: Bare SpeechAnalyzer (no VPIO, no VAD gate)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []
    let engine = AVAudioEngine(); let node = engine.inputNode
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
                    log("TX", "\(result.isFinal ? "[F]" : "[V]") \"\(t)\"") }
            }
        }
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 4096, format: inFmt) { buf, _ in
            samples.append(rms(buf))
            guard let c = convertBuffer(buf, converter: conv) else { return }
            let st = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(16000))
            frames += UInt64(c.frameLength)
            continuation.yield(AnalyzerInput(buffer: c, bufferStartTime: st))
        }
        try engine.start(); log("STATUS","Listening (bare)...")
        try await analyzer.start(inputSequence: stream)
        try await Task.sleep(for: .seconds(TEST_DURATION))
        engine.stop(); node.removeTap(onBus: 0); continuation.finish(); rTask.cancel()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch { log("ERR","\(error)") }
    print("\n  ── TEST 1 SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
}

// ============================================================
// TEST 2: With Voice Processing IO
// ============================================================
func test2_VPIO() async {
    header("TEST 2: SpeechAnalyzer WITH Voice Processing IO")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []
    let engine = AVAudioEngine(); let node = engine.inputNode
    do { try node.setVoiceProcessingEnabled(true); log("STATUS","VPIO enabled") } catch { log("WARN","VPIO fail: \(error)") }
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
        node.installTap(onBus: 0, bufferSize: 4096, format: inFmt) { buf, _ in
            samples.append(rms(buf))
            guard let c = convertBuffer(buf, converter: conv) else { return }
            let st = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(16000))
            frames += UInt64(c.frameLength)
            continuation.yield(AnalyzerInput(buffer: c, bufferStartTime: st))
        }
        try engine.start(); log("STATUS","Listening (VPIO)...")
        try await analyzer.start(inputSequence: stream)
        try await Task.sleep(for: .seconds(TEST_DURATION))
        engine.stop(); node.removeTap(onBus: 0); continuation.finish(); rTask.cancel()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch { log("ERR","\(error)") }
    print("\n  ── TEST 2 SUMMARY ──")
    print("  Transcriptions: \(txCount)"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
}

// ============================================================
// TEST 3: With VAD gate (prod config)
// ============================================================
func test3_VAD() async {
    header("TEST 3: SpeechAnalyzer + VAD gate (production config)")
    var txCount = 0; var txs: [(String,String,Bool)] = []; var samples: [Float] = []
    var gated = 0; var passed = 0
    let engine = AVAudioEngine(); let node = engine.inputNode
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
        node.installTap(onBus: 0, bufferSize: 4096, format: inFmt) { buf, _ in
            let r = rms(buf); samples.append(r)
            if r < VAD_THRESHOLD { gated += 1; return }
            passed += 1
            guard let c = convertBuffer(buf, converter: conv) else { return }
            let st = CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(16000))
            frames += UInt64(c.frameLength)
            continuation.yield(AnalyzerInput(buffer: c, bufferStartTime: st))
        }
        try engine.start(); log("STATUS","Listening (VAD gate)...")
        try await analyzer.start(inputSequence: stream)
        try await Task.sleep(for: .seconds(TEST_DURATION))
        engine.stop(); node.removeTap(onBus: 0); continuation.finish(); rTask.cancel()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    } catch { log("ERR","\(error)") }
    print("\n  ── TEST 3 SUMMARY ──")
    print("  Transcriptions: \(txCount)")
    print("  VAD: \(passed) passed, \(gated) blocked"); energySummary(samples)
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
}

// ============================================================
// TEST 4: Legacy SFSpeechRecognizer
// ============================================================
func test4_Legacy() async {
    header("TEST 4: Legacy SFSpeechRecognizer (comparison)")
    var txCount = 0; var txs: [(String,String,Bool)] = []
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
        if let e = error { log("ERR","\(e.localizedDescription)") }
    }
    let fmt = node.outputFormat(forBus: 0)
    node.removeTap(onBus: 0)
    node.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in req.append(buf) }
    do { try engine.start(); log("STATUS","Listening (SFSpeech)...") } catch { log("ERR","\(error)"); return }
    try? await Task.sleep(for: .seconds(TEST_DURATION))
    engine.stop(); node.removeTap(onBus: 0); req.endAudio(); task.cancel()
    print("\n  ── TEST 4 SUMMARY ──")
    print("  Transcriptions: \(txCount)")
    for t in txs { print("    \(t.0) \(t.2 ? "[F]":"[V]") \"\(t.1)\"") }
}

// ============================================================
// MAIN
// ============================================================
header("SPEECH ANALYZER DIAGNOSTIC SUITE")
print("  5 tests × \(Int(TEST_DURATION))s = ~\(Int(TEST_DURATION*5+15))s total")
print("  Ensure background speech is playing.\n")

Task {
    await test5_Energy()
    await test1_Bare()
    await test2_VPIO()
    await test3_VAD()
    await test4_Legacy()
    header("ALL TESTS COMPLETE")
    exit(0)
}
RunLoop.main.run()
