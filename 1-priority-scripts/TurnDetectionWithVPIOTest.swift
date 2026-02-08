/// TurnDetectionWithVPIOTest.swift
///
/// PURPOSE: Full turn detection state machine test with VPIO echo cancellation.
/// Implements the complete pipeline from instructions.mdc:
///   - 2-second silence timer (resets on each new word)
///   - Turn end detection → generate TTS echo-back "Turn N - [transcription]"
///   - Response caching (5-second window if user speaks before TTS plays)
///   - Interruption handling (2+ words while TTS is playing/generating → stop)
///   - VPIO AEC so the TTS echo-back doesn't contaminate the mic
///
/// Instead of calling an LLM, we echo back the transcription via `say` command
/// played through AVAudioPlayerNode (routed through VPIO for AEC).
///
/// Runs for 5 turns then exits with a summary.
///
/// HOW TO RUN:
///   ./run-turn-detection-test.sh
///
/// REQUIRES: macOS 26+, microphone permission, background audio from another device.
///
/// DESIGN: Built on the confirmed-working VPIO echo cancellation test foundation.
/// Uses a class with instance variables to prevent SpeechAnalyzer deallocation issues.
/// State transitions are logged with timestamps so you can trace the full pipeline.

import AVFoundation
import Foundation
import Speech

// MARK: - Utility

/// Ensure stdout flushes immediately so all prints appear in real-time.
/// Critical for command-line Swift tools where stdout is buffered by default.
func setStdoutUnbuffered() {
    setbuf(stdout, nil)
}

/// Returns seconds elapsed since a reference date, formatted to 1 decimal place.
/// Used for all log timestamps so you can trace the timeline of events.
func elapsed(since start: Date) -> String {
    String(format: "%.1f", Date().timeIntervalSince(start))
}

// MARK: - Turn Detection State Machine

/// The possible states of the turn detection pipeline.
/// Each state has specific rules about what happens when the user speaks
/// or stops speaking, per instructions.mdc sections 1-4.
///
/// State transitions:
///   listening → preparingToSpeak (silence timer fires, start generating TTS)
///   preparingToSpeak → speaking (TTS file ready, start playback)
///   preparingToSpeak → listening (user interrupts with 2+ words, cancel & cache)
///   speaking → listening (TTS finishes normally OR user interrupts with 2+ words)
///   listening → speaking (cache is valid when silence timer fires, skip generation)
enum TurnState: CustomStringConvertible {
    case listening
    case preparingToSpeak
    case speaking
    
    var description: String {
        switch self {
        case .listening: return "LISTENING"
        case .preparingToSpeak: return "PREPARING_TO_SPEAK"
        case .speaking: return "SPEAKING"
        }
    }
}

// MARK: - Main Test Class

/// TurnDetectionTest - Implements the full turn detection pipeline with VPIO AEC.
///
/// Architecture:
///   - AVAudioEngine with VPIO enabled (echo cancellation)
///   - AVAudioPlayerNode for TTS playback through the engine
///   - SpeechAnalyzer (macOS 26+) for transcription on the AEC-cleaned mic signal
///   - Custom state machine managing silence timers, caching, and interruption
///
/// The test listens to background audio (e.g., YouTube on a phone), detects 2-second
/// silences as turn ends, generates a TTS echo-back via `say`, plays it through
/// the engine (with VPIO AEC), and handles interruptions during playback.
@available(macOS 26.0, *)
class TurnDetectionTest {
    
    // MARK: - Audio Engine (copied from confirmed-working VPIO test)
    
    var audioEngine = AVAudioEngine()
    let playerNode = AVAudioPlayerNode()
    
    // MARK: - SpeechAnalyzer (copied from confirmed-working VPIO test)
    
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var continuation: AsyncStream<AnalyzerInput>.Continuation?
    var resultTask: Task<Void, Error>?
    var frameCount: Int64 = 0
    
    // MARK: - Turn Detection State
    
    /// Current state of the turn detection pipeline.
    var state: TurnState = .listening
    
    /// Which turn number we're on (1-5). Incremented when a turn ends.
    var currentTurnNumber = 0
    
    /// Maximum number of turns before the test exits.
    let maxTurns = 5
    
    /// The accumulated transcription for the current turn.
    /// Reset when a new turn begins (after the previous turn's TTS finishes or is interrupted).
    /// SpeechAnalyzer gives progressive/volatile results, so we track the latest full text.
    var currentTurnTranscription = ""
    
    /// The word count from the last transcription result we processed.
    /// Used to detect when NEW words appear (word count increases → reset silence timer).
    /// We compare total words in the latest result, not incremental diffs.
    var lastKnownWordCount = 0
    
    /// Timestamp when the last new word was detected.
    /// The silence timer checks: (now - lastNewWordTime) >= 2.0 seconds → turn end.
    var lastNewWordTime = Date()
    
    /// The silence timer task. Gets cancelled and restarted every time a new word arrives.
    /// When it fires (survives 2 seconds without cancellation), it triggers turn end processing.
    var silenceTimerTask: Task<Void, Never>?
    
    /// How long to wait after the last word before declaring a turn end.
    /// Per instructions.mdc section 1: "When the timer hits 2 seconds with no new words"
    let silenceThresholdSeconds: Double = 2.0
    
    // MARK: - Response Caching
    
    /// The cached TTS response text, saved when the user interrupts before playback starts.
    /// Per instructions.mdc section 2: if user speaks after we decide to respond but before
    /// audio plays, we cache the response instead of discarding it.
    var cachedResponse: String?
    
    /// When the cache timer started. Cache expires after 5 seconds.
    /// Per instructions.mdc: "If the cache timer exceeds 5 seconds → discard the cached response"
    var cacheTimerStart: Date?
    
    /// How long a cached response remains valid.
    let cacheExpirySeconds: Double = 5.0
    
    // MARK: - TTS State
    
    /// The Process handle for the currently-running `say` command.
    /// We keep a reference so we can kill it if the user interrupts during file generation.
    var activeSayProcess: Process?
    
    /// Whether the playerNode is currently playing audio.
    /// Used by the interruption check to know if we're in active playback.
    var isPlayingTTS = false
    
    /// Word count at the moment we entered PREPARING_TO_SPEAK or SPEAKING state.
    /// Used to calculate total new words since the agent started its turn,
    /// rather than checking incremental deltas which can be +1 at a time
    /// due to SpeechAnalyzer's progressive/volatile result delivery.
    /// Without this, rapid single-word updates ("+1 word, +1 word, +1 word...")
    /// would never trigger the 2-word interruption threshold even though
    /// multiple words were clearly spoken.
    var wordCountAtAgentTurnStart = 0
    
    /// Timestamp when the test started. Used for all log timestamps.
    var testStartTime = Date()
    
    /// Completion continuation for signaling when all 5 turns are done.
    /// The main run() method awaits this so it doesn't exit prematurely.
    var completionContinuation: CheckedContinuation<Void, Never>?
    
    // MARK: - Logging
    
    /// Prints a timestamped, state-tagged log message.
    /// Format: [T+12.3s] [LISTENING] MESSAGE
    /// This makes it easy to trace the timeline of state transitions.
    func log(_ message: String) {
        let t = elapsed(since: testStartTime)
        print("[T+\(t)s] [\(state)] \(message)")
        fflush(stdout)
    }
    
    // MARK: - Main Entry Point
    
    func run() async throws {
        testStartTime = Date()
        
        print("============================================================")
        print("  Turn Detection Test with VPIO Echo Cancellation")
        print("  Runs for \(maxTurns) turns. Play audio from another device.")
        print("  2s silence = turn end → echoes back via TTS")
        print("  2+ words during TTS = interruption → stops playback")
        print("============================================================")
        print("")
        
        // --- AUDIO ENGINE SETUP (from confirmed-working VPIO test) ---
        
        log("Enabling VPIO...")
        try audioEngine.outputNode.setVoiceProcessingEnabled(true)
        log("VPIO enabled: \(audioEngine.outputNode.isVoiceProcessingEnabled)")
        
        // Connect mixer → output with the VPIO format (required to avoid error -10875)
        let outputFormat = audioEngine.outputNode.outputFormat(forBus: 0)
        audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outputFormat)
        
        // Attach player node for TTS playback
        audioEngine.attach(playerNode)
        audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: nil)
        
        // --- SPEECH ANALYZER SETUP (from confirmed-working VPIO test) ---
        
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
            log("FATAL: en-US locale not supported")
            return
        }
        
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        self.transcriber = transcriber
        
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            log("FATAL: No compatible audio format")
            return
        }
        
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer
        
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = continuation
        
        // --- RESULT CONSUMER: processes every transcription result ---
        // This is the core of the turn detection system. Every time SpeechAnalyzer
        // produces a new transcription result, we check:
        //   1. Did new words appear? → Reset silence timer
        //   2. Are we in SPEAKING/PREPARING state with 2+ new words? → Interrupt
        resultTask = Task { [weak self] in
            guard let self = self else { return }
            for try await result in transcriber.results {
                let text = String(result.text.characters).trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { continue }
                
                await self.handleTranscriptionResult(text)
            }
        }
        
        // --- AUDIO TAP: feeds mic (with VPIO AEC) to SpeechAnalyzer ---
        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        let tapFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: inputFormat.sampleRate,
            channels: 1,
            interleaved: false
        )!
        
        guard let converter = AVAudioConverter(from: tapFormat, to: analyzerFormat) else {
            log("FATAL: Could not create audio converter")
            return
        }
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: tapFormat) { [weak self] buffer, time in
            guard let self = self else { return }
            
            let ratio = analyzerFormat.sampleRate / tapFormat.sampleRate
            let outputFrameCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
            guard outputFrameCapacity > 0,
                  let convertedBuffer = AVAudioPCMBuffer(
                    pcmFormat: analyzerFormat,
                    frameCapacity: outputFrameCapacity
                  ) else { return }
            
            var error: NSError?
            converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            
            if error == nil && convertedBuffer.frameLength > 0 {
                let cmTime = CMTime(value: CMTimeValue(self.frameCount), timescale: CMTimeScale(analyzerFormat.sampleRate))
                self.frameCount += Int64(convertedBuffer.frameLength)
                self.continuation?.yield(AnalyzerInput(buffer: convertedBuffer, bufferStartTime: cmTime))
            }
        }
        
        // --- START ---
        audioEngine.prepare()
        try audioEngine.start()
        try await analyzer.start(inputSequence: stream)
        
        log("Audio engine and SpeechAnalyzer started")
        log("Listening for background audio... speak or play something!")
        print("")
        
        // Wait for all 5 turns to complete, or timeout after 3 minutes
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            self.completionContinuation = cont
            
            // Safety timeout: 3 minutes max
            Task {
                try? await Task.sleep(for: .seconds(180))
                self.log("TIMEOUT: 3 minutes elapsed, ending test")
                self.completionContinuation?.resume()
                self.completionContinuation = nil
            }
        }
        
        // --- CLEANUP ---
        print("")
        log("Test complete! Cleaning up...")
        playerNode.stop()
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        self.continuation?.finish()
        resultTask?.cancel()
        
        print("")
        print("============================================================")
        print("  TEST FINISHED - \(currentTurnNumber) turns completed")
        print("============================================================")
    }
    
    // MARK: - Transcription Result Handler
    
    /// Called every time SpeechAnalyzer produces a new transcription result.
    /// This is the "brain" of the turn detection system. It decides what to do
    /// based on the current state and whether new words have appeared.
    ///
    /// Key behaviors per state:
    ///   LISTENING: Track words, manage silence timer, check cache validity
    ///   PREPARING_TO_SPEAK: Check for 2+ word interruption → cancel & cache
    ///   SPEAKING: Check for 2+ word interruption → stop playback
    func handleTranscriptionResult(_ text: String) async {
        let words = text.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        let wordCount = words.count
        
        // Detect if new words appeared by comparing to last known count.
        // SpeechAnalyzer gives progressive results like "Hello" → "Hello world" → "Hello world how".
        // When word count increases, new speech has been detected.
        let newWordsDetected = wordCount > lastKnownWordCount
        let newWordsDelta = wordCount - lastKnownWordCount
        
        if newWordsDetected {
            lastNewWordTime = Date()
            
            // Update the current turn's transcription with the latest full text.
            // We always keep the most recent complete text, not a diff.
            currentTurnTranscription = text
        }
        
        switch state {
        case .listening:
            if newWordsDetected {
                log("NEW WORDS (+\(newWordsDelta)): \"\(text)\"")
                lastKnownWordCount = wordCount
                
                // Reset the silence timer - user is still speaking.
                // The timer only fires if 2 full seconds pass without new words.
                startSilenceTimer()
            }
            
        case .preparingToSpeak:
            // Track total new words since agent turn started, not just the incremental delta.
            // SpeechAnalyzer delivers progressive results (+1 word at a time), so checking
            // individual deltas would never hit the 2-word threshold. Instead we compare
            // current total to the snapshot taken when we entered this state.
            let totalNewWordsSinceAgentTurn = wordCount - wordCountAtAgentTurnStart
            
            if newWordsDetected && totalNewWordsSinceAgentTurn >= 2 {
                log("INTERRUPT (during generation): \(totalNewWordsSinceAgentTurn) words since agent turn started")
                log("  User said: \"\(text)\"")
                await cancelTTSGeneration()
                // The response is already cached by generateAndPlayTTS when it sets state
                transitionTo(.listening)
                lastKnownWordCount = wordCount
                currentTurnTranscription = text
                startSilenceTimer()
            } else if newWordsDetected {
                log("SPEECH DETECTED (\(totalNewWordsSinceAgentTurn) word) during generation: \"\(text)\"")
                lastKnownWordCount = wordCount
                currentTurnTranscription = text
            }
            
        case .speaking:
            // Same approach: total new words since agent started speaking, not incremental.
            let totalNewWordsSinceAgentTurn = wordCount - wordCountAtAgentTurnStart
            
            if newWordsDetected && totalNewWordsSinceAgentTurn >= 2 {
                log("INTERRUPT (during playback): \(totalNewWordsSinceAgentTurn) words since agent turn started")
                log("  User said: \"\(text)\"")
                await stopTTSPlayback()
                transitionTo(.listening)
                lastKnownWordCount = wordCount
                currentTurnTranscription = text
                startSilenceTimer()
            } else if newWordsDetected {
                log("SPEECH DETECTED (\(totalNewWordsSinceAgentTurn) word) during playback: \"\(text)\" (not interrupting yet)")
                lastKnownWordCount = wordCount
            }
        }
    }
    
    // MARK: - State Transitions
    
    /// Transitions to a new state with logging.
    func transitionTo(_ newState: TurnState) {
        let oldState = state
        state = newState
        let t = elapsed(since: testStartTime)
        print("[T+\(t)s] STATE: \(oldState) → \(newState)")
        fflush(stdout)
    }
    
    // MARK: - Silence Timer
    
    /// Starts (or restarts) the 2-second silence timer.
    /// Every new word resets this timer. If it survives 2 seconds without being
    /// cancelled, it fires and triggers turn end processing.
    ///
    /// Per instructions.mdc section 1:
    /// "Every new word from speech transcription resets a 2-second silence timer.
    ///  When the timer hits 2 seconds with no new words, we treat that as a turn end."
    func startSilenceTimer() {
        // Cancel any existing timer
        silenceTimerTask?.cancel()
        
        silenceTimerTask = Task { [weak self] in
            guard let self = self else { return }
            
            // Wait 2 seconds
            try? await Task.sleep(for: .seconds(self.silenceThresholdSeconds))
            
            // If we weren't cancelled, the user has been silent for 2 seconds
            guard !Task.isCancelled else { return }
            guard self.state == .listening else { return }
            
            await self.handleTurnEnd()
        }
    }
    
    // MARK: - Turn End Processing
    
    /// Called when the silence timer fires (2 seconds of silence detected).
    /// This is where we decide what to "say back" and start the TTS pipeline.
    ///
    /// Handles two scenarios:
    ///   1. No cache: Generate new response ("Turn N - transcription")
    ///   2. Valid cache: Reuse the cached response (skip generation if cache < 5 seconds)
    func handleTurnEnd() async {
        let transcription = currentTurnTranscription.trimmingCharacters(in: .whitespaces)
        
        // Ignore empty turns (silence timer fired but no actual words were captured)
        guard !transcription.isEmpty else {
            log("SILENCE TIMER FIRED but no transcription captured, ignoring")
            return
        }
        
        // Check if we have a valid cached response
        if let cached = cachedResponse, let cacheStart = cacheTimerStart {
            let cacheAge = Date().timeIntervalSince(cacheStart)
            if cacheAge < cacheExpirySeconds {
                // Cache is still valid! Use it.
                log("TURN END (silence 2.0s) — CACHE HIT")
                log("  Cache age: \(String(format: "%.1f", cacheAge))s (< \(cacheExpirySeconds)s, still valid)")
                log("  Using cached response: \"\(cached)\"")
                log("  New speech since cache: \"\(transcription)\"")
                
                // Clear cache before speaking
                let responseText = cached
                cachedResponse = nil
                cacheTimerStart = nil
                
                await generateAndPlayTTS(responseText: responseText)
                return
            } else {
                // Cache expired
                log("TURN END (silence 2.0s) — CACHE EXPIRED")
                log("  Cache age: \(String(format: "%.1f", cacheAge))s (> \(cacheExpirySeconds)s, discarded)")
                cachedResponse = nil
                cacheTimerStart = nil
                // Fall through to generate new response
            }
        }
        
        // No cache (or expired cache) — generate new response
        currentTurnNumber += 1
        
        if currentTurnNumber > maxTurns {
            log("ALL \(maxTurns) TURNS COMPLETE")
            completionContinuation?.resume()
            completionContinuation = nil
            return
        }
        
        let responseText = "Turn \(currentTurnNumber). \(transcription)"
        
        log("TURN END (silence 2.0s) — Turn \(currentTurnNumber)/\(maxTurns)")
        log("  Transcription: \"\(transcription)\"")
        log("  Response: \"\(responseText)\"")
        
        await generateAndPlayTTS(responseText: responseText)
    }
    
    // MARK: - TTS Generation & Playback
    
    /// Generates a TTS audio file with `say` and plays it through the AVAudioEngine.
    /// This is the full pipeline: state transition → file generation → playback → cleanup.
    ///
    /// If the user interrupts during generation (2+ words detected in handleTranscriptionResult),
    /// the say process is killed and the response is cached for potential reuse.
    ///
    /// If the user interrupts during playback, the playerNode is stopped immediately.
    ///
    /// When playback finishes normally, we transition back to LISTENING and prepare
    /// for the next turn.
    func generateAndPlayTTS(responseText: String) async {
        // --- PHASE 1: Generate the audio file ---
        
        // Snapshot the current word count so we can detect 2+ new words
        // during generation/playback relative to this starting point.
        wordCountAtAgentTurnStart = lastKnownWordCount
        transitionTo(.preparingToSpeak)
        
        // Cache the response immediately so if we get interrupted during generation,
        // the response is already saved for potential reuse.
        cachedResponse = responseText
        cacheTimerStart = nil // Timer starts when user speaks, not now
        
        let ttsPath = "/tmp/turn_detection_tts_\(currentTurnNumber).aiff"
        let ttsURL = URL(fileURLWithPath: ttsPath)
        try? FileManager.default.removeItem(at: ttsURL)
        
        log("GENERATING TTS: \"\(responseText)\"")
        let genStart = Date()
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        process.arguments = ["-o", ttsPath, responseText]
        activeSayProcess = process
        
        do {
            try process.run()
        } catch {
            log("ERROR: Failed to run say command: \(error)")
            transitionTo(.listening)
            return
        }
        
        // Wait for say process to finish (or be killed by interruption)
        process.waitUntilExit()
        activeSayProcess = nil
        
        let genTime = Date().timeIntervalSince(genStart) * 1000
        
        // Check if we were interrupted during generation
        if state != .preparingToSpeak {
            log("TTS generation was interrupted after \(Int(genTime))ms")
            // Cache timer starts from when the user started speaking (already set in handleTranscriptionResult)
            cacheTimerStart = lastNewWordTime
            log("  Response cached. Cache timer started.")
            // Reset for next turn's transcription
            resetForNextListening()
            return
        }
        
        // Check if the file was generated successfully
        guard FileManager.default.fileExists(atPath: ttsPath) else {
            log("ERROR: TTS file was not generated (say process may have been killed)")
            transitionTo(.listening)
            resetForNextListening()
            return
        }
        
        log("TTS generated in \(Int(genTime))ms")
        
        // --- PHASE 2: Play the audio file ---
        guard let audioFile = try? AVAudioFile(forReading: ttsURL) else {
            log("ERROR: Could not read TTS audio file")
            transitionTo(.listening)
            resetForNextListening()
            return
        }
        
        let duration = Double(audioFile.length) / audioFile.fileFormat.sampleRate
        log("PLAYING TTS (\(String(format: "%.1f", duration))s)...")
        
        transitionTo(.speaking)
        isPlayingTTS = true
        
        // Clear the cache since we're actually speaking now (no longer "pre-playback")
        cachedResponse = nil
        cacheTimerStart = nil
        
        // Play and wait for completion
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            playerNode.scheduleFile(audioFile, at: nil) {
                cont.resume()
            }
            playerNode.play()
        }
        
        isPlayingTTS = false
        
        // Clean up the temp file
        try? FileManager.default.removeItem(at: ttsURL)
        
        // Check if we were interrupted during playback
        if state != .speaking {
            log("TTS playback was interrupted")
            // State was already changed to .listening by handleTranscriptionResult
            return
        }
        
        // Playback finished normally
        log("TTS playback finished normally")
        transitionTo(.listening)
        resetForNextListening()
        
        // Check if we've completed all turns
        if currentTurnNumber >= maxTurns {
            log("ALL \(maxTurns) TURNS COMPLETE")
            completionContinuation?.resume()
            completionContinuation = nil
        }
    }
    
    // MARK: - Interruption Helpers
    
    /// Kills the in-progress `say` process when the user interrupts during TTS generation.
    func cancelTTSGeneration() async {
        if let process = activeSayProcess, process.isRunning {
            log("KILLING say process (PID \(process.processIdentifier))")
            process.terminate()
            activeSayProcess = nil
        }
    }
    
    /// Stops the AVAudioPlayerNode when the user interrupts during TTS playback.
    func stopTTSPlayback() async {
        if isPlayingTTS {
            log("STOPPING playerNode playback")
            playerNode.stop()
            isPlayingTTS = false
        }
    }
    
    // MARK: - State Reset
    
    /// Resets the word tracking state for the next listening period.
    /// Called after a turn completes (normally or via interruption) so the next
    /// turn starts fresh without carrying over stale word counts.
    ///
    /// IMPORTANT: We do NOT reset lastKnownWordCount to 0 here because SpeechAnalyzer
    /// gives cumulative transcriptions within a session. The word count only ever
    /// increases. If we reset to 0, the next result (which still has the old high
    /// word count) would trigger a massive "+N words" delta and immediately restart
    /// the silence timer with stale text. Instead, we keep the current word count
    /// as the baseline and only react to genuinely NEW words going forward.
    func resetForNextListening() {
        currentTurnTranscription = ""
        // lastKnownWordCount is intentionally NOT reset — see comment above
    }
}


// MARK: - Entry Point

@main
struct TurnDetectionTestEntryPoint {
    static func main() {
        setStdoutUnbuffered()
        
        if #available(macOS 26.0, *) {
            Task {
                let test = TurnDetectionTest()
                do {
                    try await test.run()
                } catch {
                    print("Test failed with error: \(error)")
                }
                exit(0)
            }
            RunLoop.main.run()
        } else {
            print("Requires macOS 26+")
            exit(1)
        }
    }
}
