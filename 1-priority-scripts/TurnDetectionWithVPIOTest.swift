/// TurnDetectionWithVPIOTest.swift
///
/// COMPLETE turn detection, caching, and interruption test with VPIO AEC.
/// Implements EVERY path from instructions.mdc:
///
///   PATH A (Normal):       silence 2s → generate TTS → play → finish → next turn
///   PATH B (Cache Hit):    silence 2s → generating → user 2+ words → cancel & cache
///                          → user stops 2s → cache < 5s → speak cached → finish
///   PATH C (Cache Expiry): silence 2s → generating → user 2+ words → cancel & cache
///                          → user keeps talking > 5s → cache expired → discard
///                          → next silence 2s → fresh response
///   PATH D (Playback Int): playing TTS → user 2+ words → stop playback → next turn
///
/// Instead of LLM, we echo back "Turn N: [transcription]" via `say`.
/// Runs for 5 completed turns (turns where TTS finishes or is interrupted during playback).
/// Maintains a conversation thread across all turns.
///
/// HOW TO RUN: ./run-turn-detection-test.sh
/// REQUIRES: macOS 26+, microphone permission, background audio from another device.

import AVFoundation
import Foundation
import Speech

func setStdoutUnbuffered() { setbuf(stdout, nil) }

// MARK: - File Logging

/// Global file handle for logging detailed test output
var logFileHandle: FileHandle?
var logFilePath: String?

func initializeLogFile() {
    let timestamp = DateFormatter().then {
        $0.dateFormat = "yyyyMMdd_HHmmss"
    }.string(from: Date())
    logFilePath = "/tmp/turn-detection-test-\(timestamp).log"
    
    FileManager.default.createFile(atPath: logFilePath!, contents: nil)
    logFileHandle = FileHandle(forWritingAtPath: logFilePath!)
    
    let header = """
    ================================================================
    TURN DETECTION WITH VPIO TEST - DETAILED LOG
    ================================================================
    Started: \(Date())
    Test: TurnDetectionWithVPIOTest.swift
    Purpose: Compare SpeechAnalyzer word-by-word output with timing
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
        print("\n📝 Log saved to: \(path)")
    }
}

extension DateFormatter {
    func then(_ block: (DateFormatter) -> Void) -> DateFormatter {
        block(self)
        return self
    }
}

// MARK: - State Machine

/// Every possible state the agent can be in.
/// The state determines how we react to new transcription words.
enum AgentState: CustomStringConvertible {
    /// Listening for user speech. Silence timer runs when words are detected.
    case listening
    /// The `say` process is generating the TTS audio file (~1s).
    /// User 2+ words here → kill process, cache response, back to listening.
    case generatingTTS
    /// AVAudioPlayerNode is playing TTS audio through speakers.
    /// User 2+ words here → stop playback, back to listening.
    case playingTTS
    
    var description: String {
        switch self {
        case .listening: return "LISTENING"
        case .generatingTTS: return "GENERATING"
        case .playingTTS: return "PLAYING"
        }
    }
}

// MARK: - Conversation Turn Record

/// Record of a single conversation turn for the thread log.
/// We keep ALL turns, including interrupted ones, per instructions.mdc section 3:
/// "Never drop user speech from the thread, even if it happened mid-pipeline."
/// "Keep the full agent response in the conversation thread (do not trim it)."
struct ConversationTurn {
    let turnNumber: Int
    let userText: String
    let agentResponse: String
    let wasInterruptedDuringGeneration: Bool
    let wasInterruptedDuringPlayback: Bool
    let usedCache: Bool
}

// MARK: - Main Test

@available(macOS 26.0, *)
class TurnDetectionTest {
    
    // ── Audio engine (from confirmed-working VPIO test) ──
    var audioEngine = AVAudioEngine()
    let playerNode = AVAudioPlayerNode()
    
    // ── SpeechAnalyzer ──
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var continuation: AsyncStream<AnalyzerInput>.Continuation?
    var resultTask: Task<Void, Error>?
    var frameCount: Int64 = 0
    
    // ── State machine ──
    var state: AgentState = .listening
    let testStart = Date()
    
    // ── Turn tracking ──
    /// Completed turn count. We run until this reaches maxTurns.
    /// A "completed turn" = TTS finished playing OR was interrupted during playback.
    /// Interrupted-during-generation does NOT count as a completed turn (response was cached, not spoken).
    var completedTurns = 0
    let maxTurns = 5
    
    /// The full text of what the user said in the current turn so far.
    /// This is the NEW text since the last turn boundary, extracted by comparing
    /// the total transcription against `textLengthAtTurnStart`.
    var currentTurnText = ""
    
    /// The entire raw transcription from SpeechAnalyzer for the full session.
    /// SpeechAnalyzer gives progressive/volatile results. We always store the
    /// latest (longest) version. When it revises, we take the revision.
    var fullSessionTranscription = ""
    
    /// Character count of `fullSessionTranscription` at the start of the current turn.
    /// Everything after this point belongs to the current turn.
    var textLengthAtTurnStart = 0
    
    /// Word count of the latest transcription result. Used to detect new words.
    /// We compare successive results: if word count goes up, new words appeared.
    var lastResultWordCount = 0
    
    /// Timestamp of the most recent new-word detection. The silence timer measures from here.
    var lastNewWordTime = Date()
    
    // ── Silence timer ──
    var silenceTimerTask: Task<Void, Never>?
    let silenceThreshold: Double = 2.0
    
    // ── Response cache ──
    /// The cached response text. Set when user interrupts during TTS generation.
    /// Cleared when: (a) cache is used, (b) cache expires, (c) TTS plays successfully.
    var cachedResponse: String? = nil
    
    /// When the cache timer started. Per instructions.mdc section 2:
    /// "start a 5-second cache timer from the moment the user resumes speaking"
    var cacheTimerStart: Date? = nil
    
    let cacheExpiry: Double = 5.0
    
    // ── TTS control ──
    /// Handle to the running `say` process so we can kill it on interruption.
    var sayProcess: Process? = nil
    
    /// Flag: set true when we request cancellation of TTS generation.
    /// The generateAndPlay function checks this after waitUntilExit to know
    /// whether it was interrupted vs finished normally.
    var generationWasCancelled = false
    
    // ── Interruption detection ──
    /// Word count snapshot taken when agent enters generatingTTS or playingTTS.
    /// Interruption = (currentWordCount - this) >= 2.
    var wordCountAtAgentStart = 0
    
    // ── SpeechAnalyzer diagnostics ──
    // These track the health and behavior of SpeechAnalyzer to understand WHY
    // it has long gaps (3-57 seconds) between result batches even with continuous audio.
    //
    // HYPOTHESIS: VPIO zeros the mic input during TTS playback (echo cancellation).
    // This feeds near-zero audio to SpeechAnalyzer, which may confuse its internal
    // voice activity detector (VAD). After TTS stops, the VAD needs time to recalibrate,
    // causing the long gap before results resume.
    //
    // ALTERNATE HYPOTHESIS: SpeechAnalyzer accumulates internally and only delivers
    // when it has a confident sentence-level transcription, regardless of input quality.
    
    /// Total buffers yielded to SpeechAnalyzer's AsyncStream since the test started.
    var totalBuffersYielded: Int = 0
    
    /// Buffers yielded since the last SpeechAnalyzer result. Resets on each new result.
    /// If this is high (>200) when a result arrives, it means SpeechAnalyzer was processing
    /// for a long time before emitting anything.
    var buffersSinceLastResult: Int = 0
    
    /// Current RMS energy of the mic input, updated every tap callback.
    /// Used ONLY for diagnostics (not for silence detection — the user correctly noted
    /// that RMS picks up non-speech noise like music, ambient sound, etc.).
    var currentRMSEnergy: Float = 0.0
    
    /// Timestamp of last diagnostic log for periodic reporting.
    var lastDiagLogTime = Date.distantPast
    
    /// Timestamp of last SpeechAnalyzer result delivery, for measuring gaps.
    var lastResultDeliveryTime = Date.distantPast
    
    // ── Conversation thread ──
    var conversationThread: [ConversationTurn] = []
    
    // ── Completion signal ──
    var done: CheckedContinuation<Void, Never>?
    
    // MARK: - Logging
    
    func log(_ msg: String) {
        let t = String(format: "%6.1f", Date().timeIntervalSince(testStart))
        print("[T+\(t)s] [\(state)] \(msg)")
        fflush(stdout)
    }
    
    func logState(_ from: AgentState, _ to: AgentState) {
        let t = String(format: "%6.1f", Date().timeIntervalSince(testStart))
        print("[T+\(t)s] STATE: \(from) → \(to)")
        fflush(stdout)
    }
    
    // MARK: - Run
    
    func run() async throws {
        print("================================================================")
        print("  FULL Turn Detection + Caching + Interruption Test")
        print("  VPIO Echo Cancellation | \(maxTurns) completed turns")
        print("  Play audio from your phone as the 'user'")
        print("================================================================")
        print("")
        print("  Paths tested:")
        print("    A) Normal:    silence → generate → play → finish")
        print("    B) Cache hit: silence → generate → interrupt → cache → silence → speak cache")
        print("    C) Cache exp: silence → generate → interrupt → cache → >5s → discard → fresh")
        print("    D) Play int:  playing → user speaks → stop playback")
        print("")
        
        // Initialize log file
        initializeLogFile()
        
        // ── Setup audio engine with VPIO (from confirmed-working test) ──
        try audioEngine.outputNode.setVoiceProcessingEnabled(true)
        let outFmt = audioEngine.outputNode.outputFormat(forBus: 0)
        audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outFmt)
        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: nil)
        
        // ── Setup SpeechAnalyzer (from confirmed-working test) ──
        guard let locale = await SpeechTranscriber.supportedLocale(
            equivalentTo: Locale(identifier: "en-US")) else {
            log("FATAL: en-US not supported"); return
        }
        // CRITICAL: Must use BOTH .volatileResults AND .fastResults together.
        // .volatileResults alone: SpeechAnalyzer batches results in ~3.8 second chunks.
        // .volatileResults + .fastResults: Streams word-by-word at 200-500ms intervals.
        // This was discovered by analyzing the SwiftUI_SpeechAnalyzerDemo repo which uses
        // the .timeIndexedProgressiveTranscription preset (maps to these exact flags).
        // Without .fastResults, the 2-second silence timer ALWAYS false-triggers because
        // the 3.8s batch gap is longer than the 2.0s threshold.
        // Also adding .audioTimeRange for precise speech timing per result.
        let xscriber = SpeechTranscriber(
            locale: locale, transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
            attributeOptions: [.audioTimeRange])
        self.transcriber = xscriber
        guard let aFmt = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [xscriber]) else {
            log("FATAL: no audio format"); return
        }
        let xanalyzer = SpeechAnalyzer(modules: [xscriber])
        self.analyzer = xanalyzer
        let (stream, cont) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = cont
        
        // ── Result consumer task ──
        resultTask = Task { [weak self] in
            guard let self else { return }
            for try await result in xscriber.results {
                let raw = String(result.text.characters)
                let text = raw.trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                self.onTranscriptionResult(text)
            }
        }
        
        // ── Audio tap → SpeechAnalyzer (from confirmed-working test) ──
        let inNode = audioEngine.inputNode
        let inFmt = inNode.outputFormat(forBus: 0)
        let tapFmt = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                    sampleRate: inFmt.sampleRate, channels: 1, interleaved: false)!
        guard let conv = AVAudioConverter(from: tapFmt, to: aFmt) else {
            log("FATAL: no converter"); return
        }
        inNode.installTap(onBus: 0, bufferSize: 1024, format: tapFmt) { [weak self] buf, _ in
            guard let self else { return }
            
            // ── Calculate RMS energy for diagnostics only ──
            if let data = buf.floatChannelData?[0] {
                var sumSquares: Float = 0
                let count = Int(buf.frameLength)
                for i in 0..<count { sumSquares += data[i] * data[i] }
                self.currentRMSEnergy = sqrt(sumSquares / Float(max(count, 1)))
            }
            
            // ── Periodic diagnostic log (every 2s to reduce noise) ──
            // Shows: RMS energy of mic input, buffers fed since last SpeechAnalyzer result,
            // and time since last result delivery. This tells us whether SpeechAnalyzer is
            // getting audio and how long it's been "thinking" without delivering.
            let now = Date()
            if now.timeIntervalSince(self.lastDiagLogTime) >= 2.0 {
                self.lastDiagLogTime = now
                let rms = String(format: "%.4f", self.currentRMSEnergy)
                let t = String(format: "%6.1f", now.timeIntervalSince(self.testStart))
                let sinceResult = self.lastResultDeliveryTime == Date.distantPast
                    ? "never"
                    : String(format: "%.1fs ago", now.timeIntervalSince(self.lastResultDeliveryTime))
                let sinceWord = String(format: "%.1fs", now.timeIntervalSince(self.lastNewWordTime))
                print("[T+\(t)s] [\(self.state)] DIAG rms=\(rms) bufs_since_result=\(self.buffersSinceLastResult) total_bufs=\(self.totalBuffersYielded) last_result=\(sinceResult) last_word=\(sinceWord)")
                fflush(stdout)
            }
            
            // ── Feed to SpeechAnalyzer ──
            let ratio = aFmt.sampleRate / tapFmt.sampleRate
            let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio)
            guard cap > 0, let out = AVAudioPCMBuffer(pcmFormat: aFmt, frameCapacity: cap) else { return }
            var err: NSError?
            conv.convert(to: out, error: &err) { _, s in s.pointee = .haveData; return buf }
            if err == nil && out.frameLength > 0 {
                let t = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(aFmt.sampleRate))
                self.frameCount += Int64(out.frameLength)
                self.continuation?.yield(AnalyzerInput(buffer: out, bufferStartTime: t))
                self.totalBuffersYielded += 1
                self.buffersSinceLastResult += 1
            }
        }
        
        // ── Start ──
        audioEngine.prepare()
        try audioEngine.start()
        try await xanalyzer.start(inputSequence: stream)
        log("Engine + SpeechAnalyzer started. Listening...")
        print("")
        
        // ── Wait for completion or 3-minute timeout ──
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            self.done = c
            Task { try? await Task.sleep(for: .seconds(180)); self.finish("TIMEOUT 3min") }
        }
        
        // ── Cleanup ──
        playerNode.stop()
        audioEngine.stop()
        inNode.removeTap(onBus: 0)
        continuation?.finish()
        resultTask?.cancel()
        
        // ── Print conversation thread ──
        print("")
        print("================================================================")
        print("  CONVERSATION THREAD (\(conversationThread.count) turns)")
        print("================================================================")
        for turn in conversationThread {
            let flags = [
                turn.wasInterruptedDuringGeneration ? "INT-GEN/CACHED" : nil,
                turn.wasInterruptedDuringPlayback ? "INT-PLAY" : nil,
                turn.usedCache ? "FROM-CACHE" : nil
            ].compactMap { $0 }.joined(separator: ", ")
            let flagStr = flags.isEmpty ? "" : " [\(flags)]"
            print("  USER \(turn.turnNumber): \"\(turn.userText)\"")
            print("  AI   \(turn.turnNumber): \"\(turn.agentResponse)\"\(flagStr)")
            print("")
        }
        print("================================================================")
        print("  TEST FINISHED — \(completedTurns) completed turns")
        print("================================================================")
    }
    
    func finish(_ reason: String) {
        log("FINISH: \(reason)")
        done?.resume()
        done = nil
    }
    
    // MARK: - Transcription Result Handler
    
    /// Tracks the last time we logged a WORDS line, to debounce burst logging.
    /// SpeechAnalyzer delivers 5-15 progressive results at the exact same timestamp.
    /// Logging each one creates noise. Instead we log the first and set a debounce
    /// timer to log the final state of the burst 100ms later.
    var wordLogDebounceTask: Task<Void, Never>?
    
    /// Called for every progressive transcription result from SpeechAnalyzer.
    /// This is the central dispatch: it detects new words, manages the silence timer,
    /// and triggers interruptions based on the current agent state.
    func onTranscriptionResult(_ text: String) {
        // ── Detect new words ──
        let words = text.split(separator: " ", omittingEmptySubsequences: true)
        let wc = words.count
        let isNew = wc > lastResultWordCount
        let delta = wc - lastResultWordCount
        
        // Update the full session transcription and extract current turn text.
        // SpeechAnalyzer gives progressive results that may revise earlier text,
        // so we always take the latest version and slice from turnStart.
        fullSessionTranscription = text
        if text.count > textLengthAtTurnStart {
            let startIdx = text.index(text.startIndex,
                offsetBy: min(textLengthAtTurnStart, text.count))
            currentTurnText = String(text[startIdx...]).trimmingCharacters(in: .whitespaces)
        }
        
        guard isNew else { return } // No new words — nothing to do.
        
        // ── Diagnostic: how long did SpeechAnalyzer take between result batches? ──
        let now = Date()
        let gapSinceResult = lastResultDeliveryTime == Date.distantPast
            ? -1.0
            : now.timeIntervalSince(lastResultDeliveryTime)
        if gapSinceResult > 3.0 {
            // Log when SpeechAnalyzer had a long gap (>3s) — these are the problematic pauses.
            let msg = "⚠️ ANALYZER GAP: \(String(format: "%.1f", gapSinceResult))s since last result, \(buffersSinceLastResult) buffers fed during gap, rms_now=\(String(format: "%.4f", currentRMSEnergy))"
            log(msg)
            writeToLog(msg)
        }
        lastResultDeliveryTime = now
        buffersSinceLastResult = 0
        
        lastResultWordCount = wc
        lastNewWordTime = now
        
        // ── Route based on state ──
        switch state {
            
        case .listening:
            // Debounced logging: SpeechAnalyzer delivers 5-15 progressive results in
            // the same millisecond. We only log the FINAL state of each burst to keep
            // output readable. Cancel previous debounce and start a new 150ms timer.
            wordLogDebounceTask?.cancel()
            wordLogDebounceTask = Task { [weak self, currentText = currentTurnText, d = delta, fullText = text] in
                try? await Task.sleep(for: .milliseconds(150))
                guard !Task.isCancelled, let self else { return }
                let t = String(format: "%6.1f", Date().timeIntervalSince(self.testStart))
                self.log("WORDS (+\(d) in burst): \"\(currentText)\"")
                // Log to file with full details
                writeToLog("[T+\(t)s] [LISTENING] RESULT: wordCount=\(self.lastResultWordCount), delta=+\(d), text=\"\(fullText)\"")
            }
            restartSilenceTimer()
            
        case .generatingTTS:
            let sinceTurn = wc - wordCountAtAgentStart
            if sinceTurn >= 2 {
                // ── INTERRUPTION DURING GENERATION ──
                // Per instructions.mdc §4: kill say, cache response, back to listening.
                // Per §2: cache timer starts NOW (when user resumed speaking).
                log(">>> INTERRUPT DURING GENERATION (\(sinceTurn) words since agent start)")
                log("    User said: \"\(currentTurnText)\"")
                
                generationWasCancelled = true
                if let p = sayProcess, p.isRunning {
                    p.terminate()
                    log("    Killed say process (PID \(p.processIdentifier))")
                }
                // Cache is already set by generateAndPlayTTS before it started.
                // Set the cache timer to NOW.
                cacheTimerStart = Date()
                log("    Response cached. Cache timer started (\(cacheExpiry)s window).")
                
                let oldState = state
                state = .listening
                logState(oldState, state)
                
                // Start tracking this as a new turn segment.
                startNewTurnSegment()
                restartSilenceTimer()
            } else {
                log("SPEECH (\(sinceTurn) word) during generation: \"\(currentTurnText)\"")
            }
            
        case .playingTTS:
            let sinceTurn = wc - wordCountAtAgentStart
            if sinceTurn >= 2 {
                // ── INTERRUPTION DURING PLAYBACK ──
                // Per instructions.mdc §4: immediately stop playback, end agent turn.
                log(">>> INTERRUPT DURING PLAYBACK (\(sinceTurn) words since agent start)")
                log("    User said: \"\(currentTurnText)\"")
                
                playerNode.stop()
                log("    Stopped AVAudioPlayerNode")
                
                let oldState = state
                state = .listening
                logState(oldState, state)
                
                startNewTurnSegment()
                restartSilenceTimer()
            } else {
                log("SPEECH (\(sinceTurn) word) during playback: \"\(currentTurnText)\"")
            }
        }
    }
    
    // MARK: - Silence Timer
    
    /// Restarts the 2-second silence timer. Every new word calls this.
    /// When 2 seconds pass without cancellation, `onSilenceTimerFired` is called.
    ///
    /// NOTE: We previously tried an audio energy gate here to wait for RMS to drop,
    /// but the user correctly identified that RMS picks up non-speech sounds (music,
    /// ambient noise) and would prevent the timer from ever firing in noisy environments.
    ///
    /// RESOLVED (2026-02-09): The "bursty delivery" with 3-57 second gaps was caused by
    /// missing `.fastResults` in SpeechTranscriber's reportingOptions. With `.fastResults`
    /// enabled, results stream at 200-500ms intervals and the 2-second silence timer
    /// works reliably. See 1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md.
    func restartSilenceTimer() {
        silenceTimerTask?.cancel()
        silenceTimerTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(self?.silenceThreshold ?? 2.0))
            guard !Task.isCancelled, let self, self.state == .listening else { return }
            self.onSilenceTimerFired()
        }
    }
    
    // MARK: - Turn End
    
    /// Called when 2 seconds of silence are detected.
    /// Decides whether to use a cached response or generate a fresh one.
    func onSilenceTimerFired() {
        let turnText = currentTurnText.trimmingCharacters(in: .whitespaces)
        
        guard !turnText.isEmpty else {
            log("SILENCE 2s but empty transcription — ignoring")
            return
        }
        
        log("──── SILENCE 2.0s DETECTED ────")
        log("  Turn text: \"\(turnText)\"")
        
        // ── Check cache ──
        if let cached = cachedResponse, let cStart = cacheTimerStart {
            let age = Date().timeIntervalSince(cStart)
            if age < cacheExpiry {
                // ── PATH B: Cache hit ──
                log("  CACHE HIT — age \(String(format: "%.1f", age))s < \(cacheExpiry)s")
                log("  Speaking cached response: \"\(cached)\"")
                
                // Record this turn (the speech during cache window)
                conversationThread.append(ConversationTurn(
                    turnNumber: conversationThread.count + 1,
                    userText: turnText,
                    agentResponse: cached,
                    wasInterruptedDuringGeneration: false,
                    wasInterruptedDuringPlayback: false,
                    usedCache: true
                ))
                
                let response = cached
                cachedResponse = nil
                cacheTimerStart = nil
                
                Task { await self.generateAndPlayTTS(response: response, isCached: true) }
                return
            } else {
                // ── PATH C: Cache expired ──
                log("  CACHE EXPIRED — age \(String(format: "%.1f", age))s > \(cacheExpiry)s")
                log("  Discarding cached response. Will generate fresh.")
                cachedResponse = nil
                cacheTimerStart = nil
                // Fall through to generate fresh response
            }
        }
        
        // ── PATH A / fresh after PATH C: Generate new response ──
        completedTurns += 1
        let turnNum = completedTurns
        
        if turnNum > maxTurns {
            finish("ALL \(maxTurns) TURNS COMPLETE")
            return
        }
        
        let response = "Turn \(turnNum). \(turnText)"
        log("  NEW RESPONSE for turn \(turnNum)/\(maxTurns): \"\(response)\"")
        
        // Record in conversation thread
        conversationThread.append(ConversationTurn(
            turnNumber: turnNum,
            userText: turnText,
            agentResponse: response,
            wasInterruptedDuringGeneration: false,
            wasInterruptedDuringPlayback: false,
            usedCache: false
        ))
        
        Task { await self.generateAndPlayTTS(response: response, isCached: false) }
    }
    
    // MARK: - TTS Pipeline
    
    /// Full TTS pipeline: generate audio file with `say`, then play through AVAudioEngine.
    ///
    /// At any point, onTranscriptionResult may interrupt us by:
    ///   - During generation: setting generationWasCancelled=true and killing the process
    ///   - During playback: calling playerNode.stop() and setting state to .listening
    ///
    /// If interrupted during generation, the response was already set as cachedResponse
    /// before we started. The cache timer is set by onTranscriptionResult.
    ///
    /// If interrupted during playback, we mark the turn as interrupted in the thread.
    func generateAndPlayTTS(response: String, isCached: Bool) async {
        // ── PHASE 1: Generate TTS file ──
        generationWasCancelled = false
        wordCountAtAgentStart = lastResultWordCount
        
        // Pre-set cache so if interrupted, the response is already saved.
        // Only set cache for fresh responses. If this IS a cached response being spoken,
        // we don't re-cache it (it's already been cached once).
        if !isCached {
            cachedResponse = response
        } else {
            cachedResponse = nil
        }
        cacheTimerStart = nil // only set when user actually speaks
        
        let oldState = state
        state = .generatingTTS
        logState(oldState, .generatingTTS)
        
        let path = "/tmp/turn_tts_\(completedTurns)_\(Int(Date().timeIntervalSince1970)).aiff"
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.removeItem(at: url)
        
        let genStart = Date()
        log("GENERATING: \"\(response)\"")
        
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        proc.arguments = ["-o", path, response]
        sayProcess = proc
        
        do { try proc.run() } catch {
            log("ERROR: say failed: \(error)")
            state = .listening
            return
        }
        
        // This blocks until say finishes or is killed by the interrupt handler.
        proc.waitUntilExit()
        sayProcess = nil
        
        let genMs = Int(Date().timeIntervalSince(genStart) * 1000)
        
        // ── Check if we were interrupted during generation ──
        if generationWasCancelled || state != .generatingTTS {
            log("GENERATION INTERRUPTED after \(genMs)ms")
            // The interrupt handler already:
            //   - transitioned state to .listening
            //   - set cacheTimerStart
            //   - started silence timer
            //   - started new turn segment
            // We just need to record this interrupted turn.
            if !isCached, let lastTurn = conversationThread.last {
                // Update the last turn record to mark it as interrupted during gen
                conversationThread[conversationThread.count - 1] = ConversationTurn(
                    turnNumber: lastTurn.turnNumber,
                    userText: lastTurn.userText,
                    agentResponse: lastTurn.agentResponse,
                    wasInterruptedDuringGeneration: true,
                    wasInterruptedDuringPlayback: false,
                    usedCache: lastTurn.usedCache
                )
            }
            // completedTurns is NOT incremented — generation-interrupted turns don't count.
            // The response is cached and might be spoken on the next silence.
            if !isCached {
                // We already incremented completedTurns in onSilenceTimerFired, undo it
                completedTurns -= 1
            }
            try? FileManager.default.removeItem(at: url)
            return
        }
        
        // ── Generation succeeded, check file ──
        guard FileManager.default.fileExists(atPath: path),
              let file = try? AVAudioFile(forReading: url) else {
            log("ERROR: TTS file missing or unreadable")
            state = .listening
            return
        }
        
        let dur = Double(file.length) / file.fileFormat.sampleRate
        log("GENERATED in \(genMs)ms, duration \(String(format: "%.1f", dur))s")
        
        // ── PHASE 2: Play the TTS audio ──
        // Clear cache since we're actually playing now.
        cachedResponse = nil
        cacheTimerStart = nil
        
        // Reset the interruption word counter for the playback phase.
        wordCountAtAgentStart = lastResultWordCount
        
        let playOld = state
        state = .playingTTS
        logState(playOld, .playingTTS)
        log("PLAYING TTS (\(String(format: "%.1f", dur))s)...")
        
        // Play and wait for completion (or interruption).
        let playbackFinished = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            var resumed = false
            playerNode.scheduleFile(file, at: nil) {
                // This fires when the file finishes playing OR when .stop() is called.
                if !resumed {
                    resumed = true
                    c.resume(returning: true)
                }
            }
            playerNode.play()
        }
        
        try? FileManager.default.removeItem(at: url)
        
        // ── Check if interrupted during playback ──
        if state != .playingTTS {
            // Interrupted by onTranscriptionResult which already set state to .listening
            log("PLAYBACK INTERRUPTED")
            
            // Mark in conversation thread
            if let lastTurn = conversationThread.last {
                conversationThread[conversationThread.count - 1] = ConversationTurn(
                    turnNumber: lastTurn.turnNumber,
                    userText: lastTurn.userText,
                    agentResponse: lastTurn.agentResponse,
                    wasInterruptedDuringGeneration: lastTurn.wasInterruptedDuringGeneration,
                    wasInterruptedDuringPlayback: true,
                    usedCache: lastTurn.usedCache
                )
            }
            // Playback interruption DOES count as a completed turn
            // (the agent spoke, even if cut short).
            
            if completedTurns >= maxTurns {
                finish("ALL \(maxTurns) TURNS COMPLETE")
            }
            return
        }
        
        // ── Playback finished normally ──
        log("PLAYBACK FINISHED normally")
        let finOld = state
        state = .listening
        logState(finOld, .listening)
        
        startNewTurnSegment()
        
        if completedTurns >= maxTurns {
            finish("ALL \(maxTurns) TURNS COMPLETE")
        }
    }
    
    // MARK: - Turn Segmentation
    
    /// Marks the current position in the transcription stream as the start of a new turn.
    /// Everything transcribed after this point belongs to the next turn.
    func startNewTurnSegment() {
        textLengthAtTurnStart = fullSessionTranscription.count
        currentTurnText = ""
        // Do NOT reset lastResultWordCount — it's cumulative for the session.
        // Do NOT reset wordCountAtAgentStart — it's set fresh when agent starts.
    }
}

// MARK: - Entry Point

@main
struct TurnDetectionEntry {
    static func main() {
        setStdoutUnbuffered()
        guard #available(macOS 26.0, *) else { print("Requires macOS 26+"); exit(1) }
        Task {
            let test = TurnDetectionTest()
            do { try await test.run() }
            catch { print("FATAL: \(error)") }
            closeLogFile()
            exit(0)
        }
        RunLoop.main.run()
    }
}
