/**
 * ============================================================
 * WHISPERKIT REAL-TIME + ECHO CANCELLATION BENCHMARK (V2)
 * ============================================================
 *
 * This benchmark evaluates WhisperKit (Argmax) for real-time speech
 * transcription on Apple Silicon with echo cancellation testing.
 *
 * TEST APPROACH (V2):
 * The user is playing an English learning video from an external device
 * (phone/tablet) near the Mac's microphone. This provides continuous
 * real human speech that we can capture and transcribe. This is better
 * than using `say` command because:
 *   - Real human speech (not synthetic TTS)
 *   - External audio source (not self-referential speaker→mic loop)
 *   - Continuous speech allows testing sustained transcription
 *   - We can test echo cancellation by playing `say` WHILE the
 *     external speech is happening (simulating AI responding)
 *
 * SCENARIOS:
 *
 * 1. PASSIVE LISTENING (baseline):
 *    Just record from mic for N seconds and transcribe. See what
 *    WhisperKit picks up from the external video.
 *
 * 2. FILE-BASED ACCURACY:
 *    Pre-rendered `say` audio transcribed from file (no mic, pure
 *    inference speed measurement).
 *
 * 3. ECHO CANCELLATION COMPARISON:
 *    For each AEC mode (none, VoiceProcessingIO, VAD gate):
 *    a) Record external speech (should be transcribed)
 *    b) Play `say` TTS while recording (echo test)
 *    c) Check: does AEC filter the `say` output while keeping
 *       the external speech? Or does it filter everything?
 *
 * 4. INTERRUPTION:
 *    While external speech is happening, play `say` TTS (simulating
 *    AI response), then stop TTS abruptly. Check if WhisperKit
 *    recovers and continues transcribing the external speech.
 *
 * 5. RAPID START/STOP:
 *    Rapid audio engine start/stop cycles, then verify STT
 *    still works afterward.
 *
 * CREATED: 2026-02-08 V2 rewrite. Previous version used `say` for
 * both test input AND echo testing which caused unreliable results
 * (the TTS voices playing during interruption tests confused the
 * user and contaminated results).
 * ============================================================
 */

import Foundation
import AVFoundation
import WhisperKit

// ============================================================
// MARK: - Configuration
// ============================================================

/// Models to test
let kModelsToTest: [(String, String)] = [
    ("tiny.en", "Tiny English — smallest/fastest, ~75MB, CoreML/ANE optimized"),
    ("base.en", "Base English — good balance, ~140MB, CoreML/ANE optimized"),
]

/// Echo cancellation modes
enum AECMode: String, CaseIterable, Sendable {
    case none = "No AEC (Raw Mic)"
    case voiceProcessingIO = "Apple Voice Processing IO"
    case energyVADGate = "Energy VAD Gate"
}

/// Energy threshold for VAD gating — same as our production Swift helper.
let kVADEnergyThreshold: Float = 0.008

/// How long to record ambient speech in each test (seconds).
/// The external English video should be playing continuously.
let kPassiveListenDuration: Double = 8.0

/// How long to record during echo tests (seconds).
let kEchoTestDuration: Double = 10.0

// ============================================================
// MARK: - Utility Functions
// ============================================================

func log(_ msg: String) {
    let f = DateFormatter()
    f.dateFormat = "HH:mm:ss.SSS"
    let line = "[\(f.string(from: Date()))] \(msg)"
    print(line)
    fflush(stdout)
}

func logSection(_ title: String) {
    print()
    print("============================================================")
    print("  \(title)")
    print("============================================================")
    fflush(stdout)
}

/// Calculate RMS energy of a float audio buffer segment.
func rmsEnergy(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    var sum: Float = 0
    for s in samples { sum += s * s }
    return sqrt(sum / Float(samples.count))
}

/// Calculate word accuracy (set intersection, case-insensitive).
func wordAccuracy(expected: String, got: String) -> Double {
    let clean: (String) -> Set<String> = { text in
        let stripped = text.lowercased()
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: ".", with: "")
            .replacingOccurrences(of: "?", with: "")
            .replacingOccurrences(of: "!", with: "")
        return Set(stripped.split(separator: " ").map(String.init))
    }
    let exp = clean(expected)
    let g = clean(got)
    guard !exp.isEmpty else { return 0 }
    return Double(exp.intersection(g).count) / Double(exp.count)
}

/// Run macOS `say` synchronously. Returns duration.
func saySync(_ text: String, rate: Int = 140) -> Double {
    let start = Date()
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    p.arguments = ["-r", "\(rate)", text]
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run()
    p.waitUntilExit()
    return Date().timeIntervalSince(start)
}

/// Run macOS `say` asynchronously. Returns the Process.
func sayAsync(_ text: String, rate: Int = 140, voice: String? = nil) -> Process {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    var args = ["-r", "\(rate)"]
    if let v = voice { args += ["-v", v] }
    args.append(text)
    p.arguments = args
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    try? p.run()
    return p
}

/// Render text to 16kHz mono WAV. Returns file URL.
func sayToWav(_ text: String, rate: Int = 140) -> URL {
    let tmp = FileManager.default.temporaryDirectory
    let aiff = tmp.appendingPathComponent("wkb_\(ProcessInfo.processInfo.processIdentifier).aiff")
    let wav = tmp.appendingPathComponent("wkb_\(ProcessInfo.processInfo.processIdentifier).wav")
    
    let p1 = Process()
    p1.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    p1.arguments = ["-r", "\(rate)", "-o", aiff.path, text]
    p1.standardOutput = FileHandle.nullDevice
    p1.standardError = FileHandle.nullDevice
    try? p1.run(); p1.waitUntilExit()
    
    let p2 = Process()
    p2.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
    p2.arguments = ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff.path, wav.path]
    p2.standardOutput = FileHandle.nullDevice
    p2.standardError = FileHandle.nullDevice
    try? p2.run(); p2.waitUntilExit()
    
    try? FileManager.default.removeItem(at: aiff)
    return wav
}

// ============================================================
// MARK: - Markdown Writer
// ============================================================

class MarkdownWriter {
    let path: String
    
    init(path: String, title: String) {
        self.path = path
        let dir = (path as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let timestamp = f.string(from: Date())
        
        let header = """
        # \(title)
        
        **Generated**: \(timestamp)
        **Engine**: WhisperKit (Argmax) — CoreML / Neural Engine
        **Platform**: macOS on Apple Silicon
        **Test Method**: External English video playing nearby as speech source
        
        ---
        
        
        """
        try? header.write(toFile: path, atomically: true, encoding: .utf8)
    }
    
    func w(_ t: String) {
        if let h = FileHandle(forWritingAtPath: path) {
            h.seekToEndOfFile()
            h.write(t.data(using: .utf8)!)
            h.closeFile()
        }
    }
    
    func section(_ t: String, level: Int = 2) { w("\n\(String(repeating: "#", count: level)) \(t)\n\n") }
    func text(_ t: String) { w("\(t)\n\n") }
    func result(_ l: String, _ v: String) { w("- **\(l)**: \(v)\n") }
    func tableHeader(_ cols: [String]) {
        w("| " + cols.joined(separator: " | ") + " |\n")
        w("| " + cols.map { _ in "---" }.joined(separator: " | ") + " |\n")
    }
    func tableRow(_ cols: [String]) { w("| " + cols.joined(separator: " | ") + " |\n") }
    func nl() { w("\n") }
}

// ============================================================
// MARK: - Audio Capture
// ============================================================

/// Thread-safe audio capture engine with configurable AEC mode.
///
/// CRASH FIX (V2): The V1 version crashed with "Failed to create
/// tap due to format mismatch" when switching between VoiceProcessingIO
/// and normal mode. This happened because VoiceProcessingIO changes
/// the input node's format (e.g. from 1ch to 9ch) and we were passing
/// a stale format to installTap.
///
/// FIX: Always query the format AFTER enabling/disabling voice
/// processing, and pass nil as format to installTap so AVAudioEngine
/// uses the node's current output format automatically.
class AudioCapture: @unchecked Sendable {
    private var engine: AVAudioEngine?
    private var samples: [Float] = []
    private var capturing = false
    private let mode: AECMode
    private var gatedCount = 0
    private var totalCount = 0
    var capturedSampleRate: Double = 48000
    
    init(mode: AECMode) {
        self.mode = mode
    }
    
    func start() throws {
        let eng = AVAudioEngine()
        engine = eng
        let input = eng.inputNode
        
        // Configure Voice Processing BEFORE querying format.
        // VoiceProcessingIO changes the node's format so we must
        // enable it first, then read the output format.
        if mode == .voiceProcessingIO {
            do {
                try input.setVoiceProcessingEnabled(true)
                log("    AEC: Voice Processing IO enabled")
            } catch {
                log("    AEC: Voice Processing IO FAILED: \(error.localizedDescription)")
            }
        }
        
        // Read the format AFTER any voice processing changes.
        // Pass nil to installTap so it uses the node's native format.
        // This avoids the format mismatch crash from V1.
        let fmt = input.outputFormat(forBus: 0)
        capturedSampleRate = fmt.sampleRate
        
        samples = []
        gatedCount = 0
        totalCount = 0
        capturing = true
        
        // Install tap with nil format — lets AVAudioEngine pick the right one.
        // This is the critical fix: V1 passed an explicit format that could be
        // stale after VoiceProcessingIO changes the node configuration.
        input.installTap(onBus: 0, bufferSize: 4096, format: nil) { [weak self] buffer, _ in
            guard let self = self, self.capturing else { return }
            self.totalCount += 1
            
            guard let cd = buffer.floatChannelData else { return }
            let frames = Int(buffer.frameLength)
            
            // VAD gate: discard quiet buffers
            if self.mode == .energyVADGate {
                var sum: Float = 0
                let d = cd[0]
                for i in 0..<frames { sum += d[i] * d[i] }
                let rms = sqrt(sum / Float(frames))
                if rms < kVADEnergyThreshold {
                    self.gatedCount += 1
                    return
                }
            }
            
            // Extract mono channel 0 samples
            let d = cd[0]
            var buf = [Float](repeating: 0, count: frames)
            for i in 0..<frames { buf[i] = d[i] }
            self.samples.append(contentsOf: buf)
        }
        
        try eng.start()
        log("    Audio started (mode: \(mode.rawValue), \(fmt.channelCount)ch, \(Int(fmt.sampleRate))Hz)")
    }
    
    func stop() -> [Float] {
        capturing = false
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        
        let result = samples
        let dur = Double(result.count) / capturedSampleRate
        log("    Captured \(result.count) samples (\(String(format: "%.1f", dur))s)")
        if mode == .energyVADGate && totalCount > 0 {
            log("    VAD gated \(gatedCount)/\(totalCount) buffers (\(gatedCount * 100 / max(totalCount, 1))%)")
        }
        
        samples = []
        return result
    }
    
    /// Resample from capture rate to 16kHz for WhisperKit.
    func resampleTo16k(_ input: [Float]) -> [Float] {
        let ratio = capturedSampleRate / 16000.0
        if abs(ratio - 1.0) < 0.01 { return input }
        let outLen = Int(Double(input.count) / ratio)
        var out = [Float](repeating: 0, count: outLen)
        for i in 0..<outLen {
            let src = Double(i) * ratio
            let idx = Int(src)
            let frac = Float(src - Double(idx))
            if idx + 1 < input.count {
                out[i] = input[idx] * (1.0 - frac) + input[idx + 1] * frac
            } else if idx < input.count {
                out[i] = input[idx]
            }
        }
        return out
    }
}

// ============================================================
// MARK: - WhisperKit Engine
// ============================================================

actor WKEngine {
    var pipe: WhisperKit?
    var loadTime: Double = 0
    let model: String
    
    init(model: String) { self.model = model }
    
    func warmup() async -> Bool {
        log("  Loading model: \(model)...")
        let t = Date()
        do {
            let cfg = WhisperKitConfig(model: model, verbose: false, logLevel: .none)
            pipe = try await WhisperKit(cfg)
            loadTime = Date().timeIntervalSince(t)
            log("  Loaded in \(String(format: "%.1f", loadTime))s")
            return true
        } catch {
            log("  FAIL: \(error.localizedDescription)")
            return false
        }
    }
    
    func transcribeFile(_ url: URL) async -> (String, Double) {
        guard let p = pipe else { return ("NOT LOADED", 0) }
        nonisolated(unsafe) let up = p
        let t = Date()
        do {
            let r = try await up.transcribe(audioPath: url.path)
            let dur = Date().timeIntervalSince(t)
            let text = r.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            return (text, dur)
        } catch { return ("ERROR: \(error)", Date().timeIntervalSince(t)) }
    }
    
    func transcribeAudio(_ samples: [Float]) async -> (String, Double) {
        guard let p = pipe else { return ("NOT LOADED", 0) }
        nonisolated(unsafe) let up = p
        let t = Date()
        do {
            let r = try await up.transcribe(audioArray: samples)
            let dur = Date().timeIntervalSince(t)
            let text = r.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            return (text, dur)
        } catch { return ("ERROR: \(error)", Date().timeIntervalSince(t)) }
    }
}

// ============================================================
// MARK: - Test Scenarios
// ============================================================

/// SCENARIO 1: File-Based Transcription (pure inference speed)
func testFileBased(_ eng: WKEngine, _ md: MarkdownWriter) async {
    md.section("Scenario 1: File-Based Inference Speed")
    md.text("Pre-rendered `say` audio transcribed from WAV files. No mic involved. Measures pure CoreML/Neural Engine inference speed.")
    
    let phrases: [(String, String, Int)] = [
        ("Short", "hello", 140),
        ("Counting", "one two three four five six seven eight nine ten", 120),
        ("Sentence", "The quick brown fox jumps over the lazy dog", 140),
        ("Technical", "The API returns a JSON response with status code 200", 140),
        ("Paragraph", "Today is a beautiful day. The sun is shining and the birds are singing. I went to the store and bought some apples bananas and oranges.", 150),
    ]
    
    md.tableHeader(["Test", "Expected", "Got", "Accuracy", "Time", "RTF"])
    
    for (name, text, rate) in phrases {
        log("  File: \(name)")
        let wav = sayToWav(text, rate: rate)
        var audioDur = 0.0
        if let f = try? AVAudioFile(forReading: wav) { audioDur = Double(f.length) / f.fileFormat.sampleRate }
        
        let (got, inf) = await eng.transcribeFile(wav)
        let acc = wordAccuracy(expected: text, got: got)
        let rtf = audioDur > 0 ? inf / audioDur : 999
        
        log("    \(String(format: "%.0f%%", acc*100)) | RTF=\(String(format: "%.2f", rtf)) | '\(String(got.prefix(50)))'")
        
        md.tableRow([name, "`\(String(text.prefix(35)))`", "`\(String(got.prefix(35)))`",
                     String(format: "%.0f%%", acc*100), String(format: "%.2fs", inf), String(format: "%.2f", rtf)])
        try? FileManager.default.removeItem(at: wav)
    }
    md.nl()
}

/// SCENARIO 2: Passive Listening (external video speech)
///
/// Just records from the mic for N seconds and transcribes.
/// The external English video provides the speech source.
/// Tests each AEC mode to see if they affect external audio pickup.
func testPassiveListening(_ eng: WKEngine, _ md: MarkdownWriter) async {
    md.section("Scenario 2: Passive Listening (External Video)")
    md.text("Records ambient speech from external English video for \(Int(kPassiveListenDuration))s per test. No `say` TTS playing. Tests if each AEC mode affects external audio pickup.")
    md.tableHeader(["AEC Mode", "Transcribed Text", "Word Count", "Inference Time"])
    
    for mode in AECMode.allCases {
        log("  Passive (\(mode.rawValue))...")
        let cap = AudioCapture(mode: mode)
        
        do {
            try cap.start()
        } catch {
            log("    FAIL: \(error)")
            md.tableRow([mode.rawValue, "ERROR: \(error.localizedDescription)", "0", "N/A"])
            continue
        }
        
        // Listen for the specified duration
        try? await Task.sleep(for: .seconds(kPassiveListenDuration))
        
        let raw = cap.stop()
        let resampled = cap.resampleTo16k(raw)
        
        let (text, inf) = await eng.transcribeAudio(resampled)
        let words = text.split(separator: " ").count
        
        log("    \(words) words | \(String(format: "%.2f", inf))s | '\(String(text.prefix(60)))'")
        md.tableRow([mode.rawValue, "`\(String(text.prefix(60)))`", "\(words)", String(format: "%.2fs", inf)])
        
        try? await Task.sleep(for: .seconds(1.5))
    }
    md.nl()
    md.text("**Key question**: Does Voice Processing IO filter out the external video speech? If so, it may be too aggressive for our use case where the 'user' audio comes through external speakers.")
}

/// SCENARIO 3: Echo Test — `say` TTS while external speech plays
///
/// The external video provides continuous speech (representing the
/// "user" talking). We play `say` TTS (representing the "AI response")
/// while recording. Good AEC should:
///   - KEEP the external video speech (user)
///   - CANCEL the `say` TTS output (AI echo)
///
/// Bad AEC would either:
///   - Cancel everything (too aggressive)
///   - Cancel nothing (no echo reduction)
func testEchoCancellation(_ eng: WKEngine, _ md: MarkdownWriter) async {
    md.section("Scenario 3: Echo Cancellation — TTS During External Speech")
    md.text(
        "External video plays (simulating user speech) while `say` TTS plays simultaneously "
        + "(simulating AI response). For each AEC mode, we check:\n"
        + "- Does the transcription contain the TTS text? (echo = BAD)\n"
        + "- Does the transcription contain external video speech? (user = GOOD)\n"
        + "- Is the transcription empty/blank? (too aggressive = BAD)"
    )
    
    // The TTS text we'll play — something very distinctive so we
    // can check if it appears in the transcription
    let ttsText = "The capital of France is Paris and the capital of Japan is Tokyo"
    
    md.result("TTS text played during test", "`\(ttsText)`")
    md.nl()
    md.tableHeader(["AEC Mode", "Transcribed", "TTS Echo Found?", "External Speech Found?", "Assessment"])
    
    for mode in AECMode.allCases {
        log("  Echo test (\(mode.rawValue))...")
        let cap = AudioCapture(mode: mode)
        
        do {
            try cap.start()
        } catch {
            log("    FAIL: \(error)")
            md.tableRow([mode.rawValue, "ERROR", "N/A", "N/A", "FAILED"])
            continue
        }
        
        // Wait a moment for audio engine to settle
        try? await Task.sleep(for: .seconds(1.0))
        
        // Play TTS while external video continues
        // Use default voice at normal volume — this is what the AI would sound like
        log("    Playing TTS: '\(String(ttsText.prefix(40)))...'")
        let _ = saySync(ttsText, rate: 150)
        
        // Keep recording a bit after TTS ends to capture any trailing audio
        try? await Task.sleep(for: .seconds(3.0))
        
        let raw = cap.stop()
        let resampled = cap.resampleTo16k(raw)
        
        let (text, _) = await eng.transcribeAudio(resampled)
        
        // Check for TTS echo: do we see distinctive words from the TTS text?
        let ttsMarkers = ["paris", "tokyo", "france", "japan", "capital"]
        let gotLower = text.lowercased()
        let echoWords = ttsMarkers.filter { gotLower.contains($0) }
        let echoFound = echoWords.count >= 2
        
        // Check if there's any substantial text at all (external speech)
        let wordCount = text.split(separator: " ").count
        let hasExternalSpeech = wordCount > 3 && !text.contains("[BLANK_AUDIO]")
        
        // Assessment
        let assessment: String
        if !echoFound && hasExternalSpeech {
            assessment = "IDEAL — echo filtered, external speech kept"
        } else if !echoFound && !hasExternalSpeech {
            assessment = "TOO AGGRESSIVE — everything filtered"
        } else if echoFound && hasExternalSpeech {
            assessment = "NO ECHO CANCEL — both captured"
        } else {
            assessment = "BAD — echo captured, external speech lost"
        }
        
        log("    Echo: \(echoFound ? "YES (\(echoWords.joined(separator: ",")))" : "NO") | External: \(hasExternalSpeech ? "YES" : "NO") | \(assessment)")
        
        md.tableRow([
            mode.rawValue,
            "`\(String(text.prefix(50)))`",
            echoFound ? "YES (\(echoWords.joined(separator: ", ")))" : "NO",
            hasExternalSpeech ? "YES (\(wordCount) words)" : "NO",
            assessment
        ])
        
        try? await Task.sleep(for: .seconds(2.0))
    }
    md.nl()
}

/// SCENARIO 4: Interruption — TTS starts and stops mid-external-speech
///
/// External video plays continuously. We start TTS (AI responding),
/// then STOP TTS abruptly after 3 seconds (simulating user interruption
/// causing the AI to shut up). We record through the whole thing and
/// check if WhisperKit captures the audio correctly throughout.
func testInterruption(_ eng: WKEngine, _ md: MarkdownWriter) async {
    md.section("Scenario 4: Interruption — AI Stops Mid-Response")
    md.text(
        "External video plays continuously. `say` TTS starts (AI responding), "
        + "then TTS is killed after 3 seconds (user interrupts). We record the whole "
        + "sequence and check what was transcribed.\n\n"
        + "**Ideal**: External speech captured throughout, TTS echo filtered."
    )
    
    let aiResponse = "Let me explain in detail how machine learning algorithms work. First we need to understand the concept of neural networks and how they process information through multiple layers of interconnected nodes"
    
    for mode in AECMode.allCases {
        log("  Interruption test (\(mode.rawValue))...")
        md.section("\(mode.rawValue)", level: 4)
        
        let cap = AudioCapture(mode: mode)
        do {
            try cap.start()
        } catch {
            log("    FAIL: \(error)")
            md.result("Result", "FAILED: \(error.localizedDescription)")
            continue
        }
        
        // Phase 1: Record external speech only (2s)
        log("    Phase 1: External speech only (2s)")
        try? await Task.sleep(for: .seconds(2.0))
        
        // Phase 2: Start AI TTS (it will talk over the external speech)
        log("    Phase 2: AI TTS starts")
        let ttsProc = sayAsync(aiResponse, rate: 150)
        try? await Task.sleep(for: .seconds(3.0))
        
        // Phase 3: INTERRUPT — kill TTS (simulating user interruption)
        log("    Phase 3: INTERRUPT — killing TTS")
        ttsProc.terminate()
        ttsProc.waitUntilExit()
        
        // Phase 4: Post-interruption recording (3s) — should capture external speech
        log("    Phase 4: Post-interruption (3s)")
        try? await Task.sleep(for: .seconds(3.0))
        
        let raw = cap.stop()
        let resampled = cap.resampleTo16k(raw)
        
        let (text, inf) = await eng.transcribeAudio(resampled)
        
        // Check for AI echo markers
        let aiMarkers = ["machine", "learning", "algorithms", "neural", "networks", "interconnected"]
        let gotLower = text.lowercased()
        let echoWords = aiMarkers.filter { gotLower.contains($0) }
        
        let wordCount = text.split(separator: " ").count
        let hasContent = wordCount > 3 && !text.contains("[BLANK_AUDIO]")
        
        md.result("Full transcription", "`\(text)`")
        md.result("Word count", "\(wordCount)")
        md.result("AI echo detected", echoWords.isEmpty ? "NO (good)" : "YES: \(echoWords.joined(separator: ", "))")
        md.result("Has meaningful content", hasContent ? "YES" : "NO")
        md.result("Inference time", String(format: "%.2fs", inf))
        md.nl()
        
        log("    \(wordCount) words | echo: \(echoWords.isEmpty ? "NO" : echoWords.joined(separator: ",")) | '\(String(text.prefix(60)))'")
        
        try? await Task.sleep(for: .seconds(2.0))
    }
}

/// SCENARIO 5: Rapid Start/Stop Resilience
func testRapidStartStop(_ eng: WKEngine, _ md: MarkdownWriter) async {
    md.section("Scenario 5: Rapid Start/Stop Resilience")
    md.text("5 rapid audio engine start→stop cycles (200ms each). Tests if WhisperKit + AVAudioEngine crashes. Our production SpeechAnalyzer helper had SIGTRAP crashes from this pattern.")
    
    var results: [(Int, String)] = []
    
    for i in 1...5 {
        let cap = AudioCapture(mode: .none)
        do {
            try cap.start()
            try? await Task.sleep(for: .milliseconds(200))
            let _ = cap.stop()
            try? await Task.sleep(for: .milliseconds(100))
            results.append((i, "OK"))
            log("  Cycle \(i)/5: OK")
        } catch {
            results.append((i, "FAIL: \(error.localizedDescription)"))
            log("  Cycle \(i)/5: FAIL")
        }
    }
    
    // Post-cycle transcription test
    log("  Post-cycle: recording 3s...")
    let cap = AudioCapture(mode: .none)
    do {
        try cap.start()
        try? await Task.sleep(for: .seconds(3.0))
        let raw = cap.stop()
        let resampled = cap.resampleTo16k(raw)
        let (text, _) = await eng.transcribeAudio(resampled)
        
        md.tableHeader(["Cycle", "Result"])
        for (i, r) in results { md.tableRow(["\(i)", r]) }
        md.nl()
        md.result("Post-cycle alive", !text.contains("[BLANK_AUDIO]") && text.split(separator: " ").count > 0 ? "YES" : "UNCLEAR")
        md.result("Post-cycle transcription", "`\(String(text.prefix(60)))`")
    } catch {
        md.result("Post-cycle test", "FAILED: \(error.localizedDescription)")
    }
    md.nl()
}

// ============================================================
// MARK: - Main
// ============================================================

@main
struct WhisperKitBenchmark {
    static func main() async {
        // Force unbuffered stdout so output appears in real-time.
        setbuf(stdout, nil)
        setbuf(stderr, nil)
        
        logSection("WHISPERKIT + ECHO CANCELLATION BENCHMARK V2")
        log("NOTE: An English learning video should be playing nearby!")
        log("      This provides external speech for the tests.")
        log("")
        
        // Build results path relative to the binary location
        let resultsDir: String = {
            // Try to find the results dir by navigating from the script's CWD
            let cwd = FileManager.default.currentDirectoryPath
            let candidates = [
                cwd + "/results",
                cwd + "/../results",
                cwd + "/../../../results",
                (cwd as NSString).deletingLastPathComponent + "/results",
            ]
            for c in candidates {
                if FileManager.default.fileExists(atPath: (c as NSString).deletingLastPathComponent) {
                    try? FileManager.default.createDirectory(atPath: c, withIntermediateDirectories: true)
                    return c
                }
            }
            // Fallback: use /tmp
            return "/tmp/whisperkit-benchmark-results"
        }()
        
        try? FileManager.default.createDirectory(atPath: resultsDir, withIntermediateDirectories: true)
        let mdPath = resultsDir + "/whisperkit-echo-benchmark-results.md"
        log("Results will be saved to: \(mdPath)")
        
        let md = MarkdownWriter(path: mdPath, title: "WhisperKit + Echo Cancellation Benchmark")
        
        md.text(
            "**Test method**: An English learning video plays from an external device near the Mac's "
            + "microphone, providing continuous real human speech. This avoids the `say` command "
            + "contamination issue from V1 tests where TTS voices playing during echo/interruption "
            + "tests produced unreliable results.\n\n"
            + "**Echo test approach**: While external video speech plays (representing user), "
            + "`say` TTS plays distinctive phrases (representing AI response). Good echo cancellation "
            + "should filter the `say` output while keeping the external video speech."
        )
        
        for (modelName, modelDesc) in kModelsToTest {
            logSection("MODEL: \(modelName)")
            md.section("Model: \(modelName)")
            md.text(modelDesc)
            
            let eng = WKEngine(model: modelName)
            guard await eng.warmup() else {
                md.text("**FAILED TO LOAD** — skipping.")
                continue
            }
            md.result("Load time", String(format: "%.1fs", await eng.loadTime))
            md.nl()
            
            // Run all scenarios
            await testFileBased(eng, md)
            await testPassiveListening(eng, md)
            await testEchoCancellation(eng, md)
            await testInterruption(eng, md)
            await testRapidStartStop(eng, md)
        }
        
        // Summary
        md.section("Summary & Recommendations")
        md.text(
            "**Key findings to compare:**\n"
            + "1. WhisperKit file-based RTF vs Lightning-Whisper-MLX (both use CoreML)\n"
            + "2. Voice Processing IO: Does it effectively cancel `say` TTS while keeping external speech?\n"
            + "3. Energy VAD gate: Does it provide any echo reduction vs raw mic?\n"
            + "4. Rapid start/stop: Any crashes? (Our SpeechAnalyzer helper had SIGTRAP issues)\n"
            + "5. Overall: Is WhisperKit viable as a SpeechAnalyzer replacement?"
        )
        
        logSection("COMPLETE")
        log("Results: \(mdPath)")
        
        // Soft announcement
        let p1 = Process()
        p1.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        p1.arguments = ["-o", "/tmp/wk_done.aiff", "Whisper Kit echo cancellation benchmark complete."]
        p1.standardOutput = FileHandle.nullDevice; p1.standardError = FileHandle.nullDevice
        try? p1.run(); p1.waitUntilExit()
        let p2 = Process()
        p2.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
        p2.arguments = ["-v", "0.3", "/tmp/wk_done.aiff"]
        p2.standardOutput = FileHandle.nullDevice; p2.standardError = FileHandle.nullDevice
        try? p2.run(); p2.waitUntilExit()
    }
}
