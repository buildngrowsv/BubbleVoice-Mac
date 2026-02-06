/**
 * BUBBLEVOICE SPEECH HELPER - MAIN
 * 
 * Native macOS speech helper that provides STT and TTS to Node.js backend.
 * 
 * COMMUNICATION PROTOCOL:
 * - Receives JSON commands via stdin
 * - Sends JSON responses via stdout
 * - Logs to stderr for debugging
 * 
 * COMMANDS:
 * - start_listening: Start speech recognition
 * - stop_listening: Stop speech recognition
 * - speak: Speak text using say command
 * - stop_speaking: Stop current speech
 * - get_voices: Get available TTS voices
 * 
 * RESPONSES:
 * - transcription_update: Partial or final transcription
 * - speech_started: Speech playback started
 * - speech_ended: Speech playback ended
 * - error: Error occurred
 * - ready: Helper is ready
 * 
 * PRODUCT CONTEXT:
 * This helper enables high-quality, low-latency voice interaction
 * using Apple's native APIs, which are superior to web-based solutions.
 */

import Foundation
import Speech
import AVFoundation

// MARK: - Message Types

/**
 * MESSAGE STRUCTURES
 * 
 * These define the JSON message format for IPC communication.
 */

struct Command: Codable {
    let type: String
    let data: [String: AnyCodable]?
}

struct Response: Codable {
    let type: String
    let data: [String: AnyCodable]?
}

// Helper for encoding/decoding Any values
struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}

// MARK: - Speech Helper

/**
 * SPEECH HELPER CLASS
 * 
 * Main class that manages speech recognition and synthesis.
 * Coordinates between Apple APIs and Node.js backend.
 */

class SpeechHelper {
    // Speech recognition
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?
    
    // TTS process
    private var ttsProcess: Process?
    
    // State
    private var isListening = false
    private var isSpeaking = false
    
    // CRITICAL: Track whether we have any active timers or playback
    // This is used by the Node.js backend to determine if user speech
    // should trigger an interruption
    // We send this state with every transcription update
    private var hasActiveTimersOrPlayback = false
    
    // ============================================================
    // SESSION LIFECYCLE TRACKING
    // ============================================================
    //
    // WHY: Apple's SFSpeechRecognizer degrades in accuracy over long
    // sessions and can silently hang (no more results, no error).
    // Community experience on Apple Developer Forums and Stack Overflow
    // confirms that periodically restarting the recognition task
    // significantly improves accuracy and prevents hangs.
    //
    // WHAT WE TRACK:
    // - recognitionSessionStartTime: When the current recognition session started.
    //   Used to trigger a proactive restart after maxSessionDuration seconds.
    // - lastTranscriptionTime: When we last received ANY transcription result.
    //   Used to detect hangs — if we're "listening" but get no results for
    //   hangDetectionTimeout seconds, the recognizer is probably stuck.
    // - restartCount: How many times we've restarted in this listening session.
    //   Logged for debugging; helps diagnose performance issues.
    //
    // PRODUCT CONTEXT:
    // BubbleVoice runs speech recognition continuously (even while AI speaks,
    // for interruption detection). Long sessions are the norm, not the exception.
    // Without periodic restarts, users experience worsening accuracy and
    // occasional complete recognition freezes after 30-60 seconds.
    // ============================================================
    private var recognitionSessionStartTime: Date?
    private var lastTranscriptionTime: Date?
    private var restartCount: Int = 0
    
    // PERIODIC RESTART TIMER
    // This is a repeating timer that fires every few seconds to check
    // if the recognition session needs a proactive restart.
    // It checks two conditions:
    //   1. Session duration exceeded maxSessionDuration (proactive refresh)
    //   2. No transcription results for hangDetectionTimeout (hang recovery)
    //
    // WHY A TIMER INSTEAD OF INLINE CHECKS:
    // We can't rely on transcription callbacks to trigger checks because
    // the whole point of hang detection is that callbacks STOP coming.
    // A separate timer ensures we can detect and recover from silent hangs.
    private var periodicRestartTimer: Timer?
    
    // CONFIGURATION CONSTANTS
    // These values are tuned based on observed SFSpeechRecognizer behavior
    // on macOS. Apple's recognizer tends to degrade around 30-60 seconds
    // and can hang silently. These are conservative values that balance
    // accuracy improvement vs. the brief gap during restart.
    //
    // maxSessionDuration: 30 seconds.
    //   After 30s of continuous recognition, force a restart.
    //   This is well within the ~60s limit Apple imposes on some devices
    //   and catches accuracy degradation before it becomes noticeable.
    //
    // hangDetectionTimeout: 5 seconds.
    //   If we're "listening" and haven't received any result (not even
    //   partial) for 5 seconds, something is wrong. Restart immediately.
    //   Normal speech produces partial results every ~100-300ms.
    //   Even silence should produce empty partials within a few seconds.
    //
    // periodicCheckInterval: 3 seconds.
    //   How often the watchdog timer fires. Frequent enough to catch
    //   hangs within ~3s of the hangDetectionTimeout, but not so frequent
    //   that it wastes CPU checking constantly.
    private let maxSessionDuration: TimeInterval = 30.0
    private let hangDetectionTimeout: TimeInterval = 5.0
    private let periodicCheckInterval: TimeInterval = 3.0
    
    init() {
        // Initialize speech recognizer for US English
        self.speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        self.audioEngine = AVAudioEngine()
        
        // Request authorization
        requestAuthorization()
    }
    
    /**
     * REQUEST AUTHORIZATION
     * 
     * Requests permission to use speech recognition.
     * Required by Apple for privacy.
     * 
     * CRITICAL FIX:
     * Don't request authorization at startup - it causes crashes.
     * Only check status and request when actually starting to listen.
     */
    func requestAuthorization() {
        // Send ready immediately so Node.js knows we're alive
        self.sendReady()
        
        // Just log the current status, don't request yet
        let status = SFSpeechRecognizer.authorizationStatus()
        self.logError("Speech recognition status: \(status.rawValue)")
        
        // Don't call requestAuthorization here - it can cause crashes
        // We'll request it when actually starting to listen
    }
    
    /**
     * START LISTENING
     * 
     * Starts speech recognition using SFSpeechRecognizer.
     * Captures audio from microphone and streams transcription.
     * 
     * CRITICAL FIX (2026-01-21):
     * Speech recognition on macOS uses the MICROPHONE TCC permission, not a separate
     * speech recognition permission. The Electron app already requests microphone
     * permission, which covers speech recognition.
     * 
     * However, SFSpeechRecognizer still has its own authorization status that needs
     * to be checked. If not authorized, we just proceed anyway since the microphone
     * permission is what actually matters for TCC.
     * 
     * TECHNICAL NOTES:
     * - DO NOT call SFSpeechRecognizer.requestAuthorization() from a command-line tool
     *   as it will crash (SIGABRT) trying to show a UI dialog
     * - The microphone permission (already granted by Electron) is sufficient
     * - We log the status but proceed regardless
     * - If there's an actual permission issue, the audio engine will fail with a clear error
     */
    func startListening() {
        // Check authorization status but don't block on it
        let authStatus = SFSpeechRecognizer.authorizationStatus()
        logError("Speech recognition authorization status: \(authStatus.rawValue)")
        
        // Log a warning if not authorized, but proceed anyway
        // The microphone permission (from Electron) is what actually matters
        if authStatus != .authorized {
            logError("Note: SFSpeechRecognizer status is not .authorized, but proceeding anyway since microphone permission is granted by Electron app")
        }
        
        // Start listening regardless of SFSpeechRecognizer auth status
        // If there's a real permission issue, the audio engine will fail
        startListeningInternal()
    }
    
    /**
     * START LISTENING INTERNAL
     * 
     * Internal method that actually starts the speech recognition.
     * This is called after authorization is confirmed.
     * 
     * TECHNICAL NOTES:
     * - Assumes authorization is already granted
     * - Sets up audio engine and recognition task
     * - Streams partial and final transcriptions to Node.js backend
     */
    private func startListeningInternal() {
        
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            sendError("Speech recognizer not available. Make sure you have an internet connection.")
            return
        }
        
        if isListening {
            logError("Already listening")
            return
        }
        
        do {
            // Cancel any existing task
            recognitionTask?.cancel()
            recognitionTask = nil
            
            // Note: AVAudioSession is iOS-only. On macOS, audio configuration
            // is handled automatically by the system.
            
            // Create recognition request
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest = recognitionRequest else {
                sendError("Unable to create recognition request")
                return
            }
            
            recognitionRequest.shouldReportPartialResults = true
            
            // Get audio input node
            guard let audioEngine = audioEngine else {
                sendError("Audio engine not available")
                return
            }
            
            let inputNode = audioEngine.inputNode
            
            // LIFECYCLE TRACKING: Record when this recognition session started
            // and initialize the "last transcription" time so the hang detector
            // doesn't immediately fire on a fresh session (it would see zero
            // time since last transcription and think we're hung).
            recognitionSessionStartTime = Date()
            lastTranscriptionTime = Date()
            restartCount = 0
            
            // Start recognition task
            // CRITICAL CHANGE (2026-01-21): Keep recognition running continuously
            // This enables interruption detection - if user speaks while AI is responding,
            // we'll get partial transcription results that trigger interruption
            recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
                guard let self = self else { return }
                
                if let error = error {
                    // Only stop on actual errors, not on normal completion
                    let nsError = error as NSError
                    // Error code 216 is "speech recognition cancelled" - this is normal
                    // when we cancel the task ourselves (e.g., during restart)
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
                        self.logError("Recognition task cancelled (normal)")
                        return
                    }
                    
                    // Error 301 = "speech recognition request was canceled" (also normal during restart)
                    // Error 203 = "Retry" from Apple's server-side recognition
                    // Error 209 = "No speech detected" (normal during silence)
                    // These are transient errors that should NOT stop listening entirely.
                    // Instead of tearing down the whole pipeline, we restart recognition.
                    //
                    // WHY: Previously, ANY recognition error called stopListening(), which
                    // killed the audio engine and required a full re-initialization from
                    // the backend. This caused the voice pipeline to "die" on transient
                    // errors that could have been recovered by simply restarting the
                    // recognition task.
                    //
                    // BECAUSE: Apple's speech recognition sends various transient errors
                    // (network glitches, temporary server issues, etc.) that resolve on
                    // their own. We should only fully stop on unrecoverable errors.
                    let recoverableCodes = [301, 203, 209, 1110]
                    if nsError.domain == "kAFAssistantErrorDomain" && recoverableCodes.contains(nsError.code) {
                        self.logError("Recoverable recognition error (code \(nsError.code)): \(error.localizedDescription) — restarting recognition")
                        self.restartRecognition()
                        return
                    }
                    
                    self.sendError("Recognition error: \(error.localizedDescription)")
                    self.stopListening()
                    return
                }
                
                if let result = result {
                    let transcription = result.bestTranscription.formattedString
                    let isFinal = result.isFinal
                    
                    // LIFECYCLE TRACKING: Update the last transcription time
                    // This is used by the hang detector to know we're still
                    // receiving results. ANY result (partial or final) resets
                    // the hang detection clock.
                    self.lastTranscriptionTime = Date()
                    
                    // Send transcription with current speaking state
                    // This allows backend to detect interruptions
                    self.sendTranscription(text: transcription, isFinal: isFinal)
                    
                    // CRITICAL: DO NOT stop listening on isFinal
                    // We need to keep listening to detect user interruptions
                    // The backend will manage the turn detection via timers
                    
                    // Instead, if isFinal, we restart recognition to get a fresh session
                    // This prevents the recognizer from timing out
                    if isFinal {
                        self.logError("Got final transcription, restarting recognition for next utterance")
                        self.restartRecognition()
                    }
                }
            }
            
            // Configure audio tap
            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
                recognitionRequest.append(buffer)
            }
            
            // Start audio engine
            audioEngine.prepare()
            try audioEngine.start()
            
            isListening = true
            logError("Started listening")
            
            // START THE PERIODIC RESTART WATCHDOG TIMER
            // This timer runs every periodicCheckInterval seconds and checks:
            //   1. Has the session been running too long? (maxSessionDuration)
            //   2. Has recognition gone silent / hung? (hangDetectionTimeout)
            // If either condition is met, it proactively restarts recognition.
            //
            // WHY: We can't rely solely on isFinal to trigger restarts because:
            //   - SFSpeechRecognizer may never produce isFinal if it hangs
            //   - Long sessions degrade accuracy even if results keep coming
            //   - Some edge cases (background noise, etc.) can keep the
            //     recognizer "alive" but producing garbage results
            //
            // IMPORTANT: Must be scheduled on RunLoop.main because Timer
            // requires a run loop, and our main.swift uses RunLoop.main.run()
            startPeriodicRestartTimer()
            
        } catch {
            sendError("Failed to start listening: \(error.localizedDescription)")
        }
    }
    
    // ============================================================
    // PERIODIC RESTART TIMER (WATCHDOG)
    // ============================================================
    //
    // This timer is the core of the "restart after each step" strategy.
    // It fires every periodicCheckInterval seconds and checks two conditions:
    //
    // CONDITION 1 — SESSION TOO OLD (proactive accuracy refresh):
    //   If recognitionSessionStartTime is older than maxSessionDuration,
    //   restart to get a fresh session. This is the primary mechanism for
    //   improving accuracy: Apple's recognizer builds up internal state
    //   that degrades over time. A fresh session starts clean.
    //
    // CONDITION 2 — HANG DETECTION (recovery from silent failure):
    //   If lastTranscriptionTime is older than hangDetectionTimeout,
    //   the recognizer is probably stuck. This happens in practice when:
    //   - The audio engine disconnects silently (rare but observed)
    //   - Apple's server-side recognition fails without error callback
    //   - The recognition task enters a bad state after an error
    //
    // Both conditions trigger restartRecognition(), which cleanly tears
    // down the old session and creates a fresh one, keeping the audio
    // engine running so there's minimal gap.
    //
    // PRODUCT CONTEXT:
    // Users of BubbleVoice have reported that after ~30-60 seconds of
    // continuous listening, the recognizer "stops working" or produces
    // increasingly inaccurate results. This watchdog prevents both issues.
    // ============================================================
    
    /**
     * START PERIODIC RESTART TIMER
     *
     * Creates and schedules the watchdog timer on the main run loop.
     * Called once when listening starts. Automatically invalidated
     * when listening stops.
     */
    private func startPeriodicRestartTimer() {
        // Invalidate any existing timer first (safety)
        stopPeriodicRestartTimer()
        
        logError("Starting periodic restart watchdog (check every \(periodicCheckInterval)s, max session \(maxSessionDuration)s, hang detect \(hangDetectionTimeout)s)")
        
        // Create a repeating timer on the main run loop
        // WHY main run loop: Our Swift helper uses RunLoop.main.run()
        // as its event loop. Timers must be on an active run loop to fire.
        periodicRestartTimer = Timer.scheduledTimer(withTimeInterval: periodicCheckInterval, repeats: true) { [weak self] _ in
            self?.checkAndRestartIfNeeded()
        }
    }
    
    /**
     * STOP PERIODIC RESTART TIMER
     *
     * Invalidates and clears the watchdog timer.
     * Called when listening stops or before creating a new timer.
     */
    private func stopPeriodicRestartTimer() {
        periodicRestartTimer?.invalidate()
        periodicRestartTimer = nil
    }
    
    /**
     * CHECK AND RESTART IF NEEDED
     *
     * The watchdog check that runs every periodicCheckInterval seconds.
     * Evaluates both conditions (session age and hang detection) and
     * restarts recognition if either is met.
     *
     * CRITICAL: This method must be safe to call repeatedly and must
     * handle the case where a restart is already in progress (the
     * restartRecognition method handles this via the isListening guard).
     *
     * LOGGING: We log every check at debug level and every restart at
     * info level so we can diagnose issues from the Swift stderr logs.
     */
    private func checkAndRestartIfNeeded() {
        guard isListening else { return }
        
        let now = Date()
        
        // CONDITION 1: Session too old — proactive accuracy refresh
        // WHY 30 seconds: Apple's recognizer starts losing accuracy
        // around 30-60 seconds. 30s is conservative and catches the
        // problem before users notice degraded results.
        if let sessionStart = recognitionSessionStartTime {
            let sessionAge = now.timeIntervalSince(sessionStart)
            if sessionAge >= maxSessionDuration {
                logError("⏰ Periodic restart: Session aged out at \(String(format: "%.1f", sessionAge))s (max \(maxSessionDuration)s) — restarting for accuracy (restart #\(restartCount + 1))")
                
                // Notify the backend that we're proactively restarting
                // This is informational — the backend doesn't need to do anything,
                // but it helps with debugging and logging on the Node.js side
                sendResponse(type: "recognition_restarted", data: [
                    "reason": AnyCodable("session_aged_out"),
                    "sessionAge": AnyCodable(sessionAge),
                    "restartCount": AnyCodable(restartCount + 1)
                ])
                
                restartRecognition()
                return
            }
        }
        
        // CONDITION 2: Hang detection — no results for too long
        // WHY 5 seconds: Normal speech produces partial results every
        // ~100-300ms. Even during silence, the recognizer typically
        // sends empty partials within 1-2 seconds. 5 seconds of complete
        // silence from the recognizer strongly suggests it's hung.
        //
        // NOTE: We only check this if we have a lastTranscriptionTime.
        // On a fresh session that hasn't received any results yet, we
        // rely on the session age check instead (which will catch it
        // at maxSessionDuration).
        if let lastTranscription = lastTranscriptionTime {
            let timeSinceLastResult = now.timeIntervalSince(lastTranscription)
            if timeSinceLastResult >= hangDetectionTimeout {
                logError("🔄 Hang detection: No results for \(String(format: "%.1f", timeSinceLastResult))s (threshold \(hangDetectionTimeout)s) — restarting recognition (restart #\(restartCount + 1))")
                
                // Notify the backend about the hang recovery
                sendResponse(type: "recognition_restarted", data: [
                    "reason": AnyCodable("hang_detected"),
                    "timeSinceLastResult": AnyCodable(timeSinceLastResult),
                    "restartCount": AnyCodable(restartCount + 1)
                ])
                
                restartRecognition()
                return
            }
        }
    }
    
    /**
     * RESTART RECOGNITION
     * 
     * Restarts speech recognition after a final result.
     * This keeps the recognition running continuously to detect interruptions.
     * 
     * CRITICAL FIX (2026-01-23):
     * The audio tap captures the recognitionRequest variable at install time.
     * When we create a new recognitionRequest, the tap is still appending to the OLD one!
     * This causes transcription accumulation across restarts.
     * 
     * SOLUTION: Remove and reinstall the audio tap with the new request.
     * This is what Accountability AI does - it stops and restarts the entire recording.
     * 
     * ADDITIONAL FIX (2026-01-23):
     * Apple's SFSpeechRecognizer returns the FULL transcription from the start of
     * the recognition session, not incremental text. Even with a fresh request,
     * we need to ensure we're not getting accumulated text from the audio buffer.
     * 
     * The solution is to add a small delay after removing the tap to let the
     * audio pipeline flush, then reinstall with a completely fresh request.
     * 
     * PRODUCT CONTEXT:
     * In the Accountability app, speech recognition runs continuously even while
     * the AI is speaking. This allows immediate detection of user interruptions.
     * We restart the recognition task AND the audio tap to get a fresh session.
     */
    /**
     * RESTART RECOGNITION
     *
     * Tears down the current recognition task and audio tap, then creates
     * a fresh session after a brief pipeline flush delay.
     *
     * This is the CORE method for the periodic restart strategy. It's called:
     *   1. After every isFinal result (natural utterance boundary)
     *   2. By the periodic watchdog timer (session age / hang detection)
     *   3. By the backend's reset_recognition command (after AI finishes speaking)
     *   4. On recoverable recognition errors (transient server issues)
     *
     * CRITICAL FIX (2026-01-23):
     * The audio tap captures the recognitionRequest variable at install time.
     * When we create a new recognitionRequest, the tap is still appending to the OLD one!
     * This causes transcription accumulation across restarts.
     *
     * SOLUTION: Remove and reinstall the audio tap with the new request.
     * This is what Accountability AI does - it stops and restarts the entire recording.
     *
     * ADDITIONAL FIX (2026-01-23):
     * Apple's SFSpeechRecognizer returns the FULL transcription from the start of
     * the recognition session, not incremental text. Even with a fresh request,
     * we need to ensure we're not getting accumulated text from the audio buffer.
     *
     * The solution is to add a small delay after removing the tap to let the
     * audio pipeline flush, then reinstall with a completely fresh request.
     *
     * ROBUSTNESS IMPROVEMENTS (2026-02-06):
     * - Tracks restart count and session start time for lifecycle monitoring
     * - Handles errors in the new recognition task with the same recoverable
     *   error logic as the initial task (prevents cascading failures)
     * - Resets lastTranscriptionTime so the hang detector doesn't immediately
     *   fire on the fresh session
     * - Logs the restart reason trail for debugging
     *
     * PRODUCT CONTEXT:
     * In the Accountability app, speech recognition runs continuously even while
     * the AI is speaking. This allows immediate detection of user interruptions.
     * We restart the recognition task AND the audio tap to get a fresh session.
     */
    private func restartRecognition() {
        guard isListening else { return }
        guard let audioEngine = audioEngine else { return }
        
        // INCREMENT RESTART COUNTER
        // This counter tracks total restarts in the current listening session.
        // Useful for debugging: if restartCount is unusually high, it may
        // indicate a problem (e.g., recognizer immediately failing after restart).
        restartCount += 1
        logError("Restarting recognition task (restart #\(restartCount)) for continuous listening")
        
        // Cancel the old task
        recognitionTask?.cancel()
        recognitionTask = nil
        
        // CRITICAL: Remove the old audio tap
        // This prevents it from appending to the old recognitionRequest
        let inputNode = audioEngine.inputNode
        inputNode.removeTap(onBus: 0)
        
        // CRITICAL: Add a small delay to let the audio pipeline flush
        // This prevents accumulated audio from being processed by the new request
        // WHY: The audio engine may have buffered audio that hasn't been processed yet
        // BECAUSE: Without this delay, the new tap immediately starts receiving
        // buffered audio from before the restart, causing accumulation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self = self else { return }
            guard self.isListening else { return }
            
            // LIFECYCLE: Reset the session start time for this fresh session
            // This is critical — without this, the watchdog timer would see
            // the OLD start time and immediately trigger another restart.
            self.recognitionSessionStartTime = Date()
            self.lastTranscriptionTime = Date()
            
            // Create a new recognition request
            self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest = self.recognitionRequest,
                  let speechRecognizer = self.speechRecognizer else {
                self.sendError("Failed to create new recognition request")
                return
            }
            
            recognitionRequest.shouldReportPartialResults = true
            
            // Start a new recognition task
            // CRITICAL: Use the SAME error handling logic as startListeningInternal
            // so that recoverable errors trigger another restart instead of killing
            // the entire listening pipeline.
            self.recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
                guard let self = self else { return }
                
                if let error = error {
                    let nsError = error as NSError
                    
                    // Error 216 = "speech recognition cancelled" — normal during restart
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
                        self.logError("Recognition task cancelled (normal)")
                        return
                    }
                    
                    // RECOVERABLE ERRORS: Same list as in startListeningInternal
                    // Instead of killing the pipeline, restart to get a fresh session.
                    // WHY: Transient errors (server blips, "retry", "no speech detected")
                    // resolve on their own. Killing the pipeline is overkill.
                    let recoverableCodes = [301, 203, 209, 1110]
                    if nsError.domain == "kAFAssistantErrorDomain" && recoverableCodes.contains(nsError.code) {
                        self.logError("Recoverable recognition error in restarted task (code \(nsError.code)): \(error.localizedDescription) — restarting again")
                        self.restartRecognition()
                        return
                    }
                    
                    self.sendError("Recognition error: \(error.localizedDescription)")
                    self.stopListening()
                    return
                }
                
                if let result = result {
                    let transcription = result.bestTranscription.formattedString
                    let isFinal = result.isFinal
                    
                    // LIFECYCLE: Update last transcription time for hang detection
                    self.lastTranscriptionTime = Date()
                    
                    self.sendTranscription(text: transcription, isFinal: isFinal)
                    
                    if isFinal {
                        self.logError("Got final transcription, restarting recognition for next utterance")
                        self.restartRecognition()
                    }
                }
            }
            
            // CRITICAL: Reinstall the audio tap with the NEW recognitionRequest
            // This ensures audio buffers go to the new request, not the old one
            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
                // Use self?.recognitionRequest to get the CURRENT request
                // This way if we restart again, it will use the new one
                self?.recognitionRequest?.append(buffer)
            }
            
            self.logError("Audio tap reinstalled with new recognition request after flush delay (restart #\(self.restartCount))")
        }
    }
    
    /**
     * STOP LISTENING
     * 
     * Stops speech recognition and cleans up resources.
     */
    func stopListening() {
        guard isListening else { return }
        
        // CRITICAL: Stop the periodic restart watchdog FIRST
        // If we don't, it could fire after we've stopped and try to restart
        // a recognition session that we're intentionally shutting down.
        stopPeriodicRestartTimer()
        
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        
        isListening = false
        
        // LIFECYCLE: Log the session summary for debugging
        // This helps diagnose issues by showing how many restarts occurred
        // and how long the total listening session lasted.
        logError("Stopped listening (total restarts in session: \(restartCount))")
    }
    
    /**
     * SPEAK
     * 
     * Speaks text using the macOS `say` command.
     * This provides high-quality TTS with many voice options.
     * 
     * @param text: Text to speak
     * @param voice: Voice name (optional, uses default if not specified)
     * @param rate: Speech rate in words per minute (default: 200)
     */
    func speak(text: String, voice: String? = nil, rate: Int = 200) {
        // Stop any current speech
        stopSpeaking()
        
        // Create process for `say` command
        ttsProcess = Process()
        ttsProcess?.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        
        // Build arguments
        var arguments = [String]()
        
        // Add voice if specified
        if let voice = voice {
            arguments.append(contentsOf: ["-v", voice])
        }
        
        // Add rate
        arguments.append(contentsOf: ["-r", "\(rate)"])
        
        // Add text
        arguments.append(text)
        
        ttsProcess?.arguments = arguments
        
        // Handle completion on main thread
        ttsProcess?.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isSpeaking = false
                self.logError("Speech ended")
                self.sendResponse(type: "speech_ended", data: nil)
            }
        }
        
        do {
            try ttsProcess?.run()
            isSpeaking = true
            sendResponse(type: "speech_started", data: nil)
            logError("Started speaking")
        } catch {
            sendError("Failed to start speech: \(error.localizedDescription)")
        }
    }
    
    /**
     * STOP SPEAKING
     * 
     * Stops current TTS playback.
     */
    func stopSpeaking() {
        if let process = ttsProcess, process.isRunning {
            process.terminate()
            isSpeaking = false
            logError("Stopped speaking")
        }
    }
    
    /**
     * GET AVAILABLE VOICES
     * 
     * Returns list of available TTS voices from the `say` command.
     * 
     * CRITICAL FIX:
     * Use async dispatch to avoid blocking the main thread.
     */
    func getAvailableVoices() {
        logError("Getting available voices...")
        
        // Run `say -v ?` to get list of voices
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        process.arguments = ["-v", "?"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe() // Capture stderr too
        
        // Set up termination handler instead of waitUntilExit
        process.terminationHandler = { [weak self] process in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                guard process.terminationStatus == 0 else {
                    self.sendError("say command failed with status \(process.terminationStatus)")
                    return
                }
                
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                guard let output = String(data: data, encoding: .utf8) else {
                    self.sendError("Failed to decode voices output")
                    return
                }
                
                // Parse voice list
                let lines = output.components(separatedBy: "\n")
                var voices: [[String: String]] = []
                
                for line in lines {
                    if line.isEmpty { continue }
                    
                    // Format: "VoiceName   language   # Description"
                    let parts = line.components(separatedBy: "#")
                    if parts.count >= 2 {
                        let nameAndLang = parts[0].trimmingCharacters(in: .whitespaces)
                        let description = parts[1].trimmingCharacters(in: .whitespaces)
                        
                        let components = nameAndLang.components(separatedBy: .whitespaces)
                        if let name = components.first {
                            voices.append([
                                "name": name,
                                "description": description
                            ])
                        }
                    }
                }
                
                self.logError("Found \(voices.count) voices")
                
                // Try to send the response
                do {
                    let voicesArray = voices.map { voice -> [String: Any] in
                        return [
                            "name": voice["name"] ?? "",
                            "description": voice["description"] ?? ""
                        ]
                    }
                    
                    // Manual JSON construction to avoid AnyCodable issues
                    let jsonObject: [String: Any] = [
                        "type": "voices_list",
                        "data": [
                            "voices": voicesArray,
                            "count": voices.count
                        ]
                    ]
                    
                    let jsonData = try JSONSerialization.data(withJSONObject: jsonObject)
                    if let jsonString = String(data: jsonData, encoding: .utf8) {
                        print(jsonString)
                        fflush(stdout)
                        self.logError("Voices sent successfully")
                    }
                } catch {
                    self.logError("Failed to encode voices: \(error.localizedDescription)")
                    self.sendError("Failed to encode voices list")
                }
            }
        }
        
        do {
            try process.run()
            logError("Started say -v ? process")
        } catch {
            sendError("Failed to start say process: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Message Handling
    
    /**
     * HANDLE COMMAND
     * 
     * Processes commands received from Node.js via stdin.
     */
    func handleCommand(_ command: Command) {
        switch command.type {
        case "start_listening":
            startListening()
            
        case "stop_listening":
            stopListening()
            
        case "reset_recognition":
            // CRITICAL: Explicitly reset the recognition session
            // This is called by the backend at several lifecycle points:
            //   1. After the AI finishes speaking (speech_ended) — ensures fresh
            //      session for the next user utterance
            //   2. After an interruption is detected — gives the recognizer a
            //      clean slate so the interrupting speech is captured accurately
            //   3. After the timer cascade completes — prepares for next turn
            //
            // WHY THIS EXISTS (separate from periodic restart):
            // The periodic restart runs on a fixed timer and doesn't know about
            // the conversation turn structure. This command is the backend's way
            // of saying "a logical conversation boundary just happened, start fresh."
            //
            // TOGETHER, they cover both scenarios:
            // - Periodic restart: handles long continuous listening (accuracy + hang)
            // - reset_recognition: handles turn boundaries (clean transcription state)
            logError("Received reset_recognition command from backend (restart #\(restartCount + 1))")
            if isListening {
                restartRecognition()
            }
            
        case "speak":
            guard let data = command.data,
                  let textValue = data["text"],
                  let text = textValue.value as? String else {
                sendError("Missing text parameter for speak command")
                return
            }
            
            let voice = (data["voice"]?.value as? String)
            let rate = (data["rate"]?.value as? Int) ?? 200
            
            speak(text: text, voice: voice, rate: rate)
            
        case "stop_speaking":
            stopSpeaking()
            
        case "get_voices":
            getAvailableVoices()
            
        default:
            sendError("Unknown command: \(command.type)")
        }
    }
    
    // MARK: - Response Sending
    
    func sendReady() {
        sendResponse(type: "ready", data: nil)
    }
    
    func sendTranscription(text: String, isFinal: Bool) {
        // CRITICAL: Include isSpeaking state with every transcription
        // This allows the backend to detect interruptions
        // If isSpeaking is true and we get a transcription, it means
        // the user is interrupting the AI's response
        sendResponse(type: "transcription_update", data: [
            "text": AnyCodable(text),
            "isFinal": AnyCodable(isFinal),
            "isSpeaking": AnyCodable(isSpeaking)
        ])
    }
    
    func sendError(_ message: String) {
        sendResponse(type: "error", data: ["message": AnyCodable(message)])
    }
    
    func sendResponse(type: String, data: [String: AnyCodable]?) {
        do {
            let response = Response(type: type, data: data)
            let encoder = JSONEncoder()
            let jsonData = try encoder.encode(response)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
                fflush(stdout)
            }
        } catch {
            logError("Failed to encode response: \(error.localizedDescription)")
            // Send a simple error response without complex encoding
            let simpleError = "{\"type\":\"error\",\"data\":{\"message\":\"Encoding error\"}}"
            print(simpleError)
            fflush(stdout)
        }
    }
    
    func logError(_ message: String) {
        fputs("[SpeechHelper] \(message)\n", stderr)
        fflush(stderr)
    }
}

// MARK: - Main

/**
 * MAIN ENTRY POINT
 * 
 * Reads commands from stdin and processes them.
 * Runs in a loop until stdin is closed.
 */

let helper = SpeechHelper()

// Read commands from stdin in background
DispatchQueue.global(qos: .userInitiated).async {
    helper.logError("Starting stdin reader loop")
    
    while let line = readLine() {
        guard !line.isEmpty else { continue }
        
        helper.logError("Received command: \(line.prefix(50))...")
        
        do {
            let decoder = JSONDecoder()
            let data = line.data(using: .utf8)!
            let command = try decoder.decode(Command.self, from: data)
            DispatchQueue.main.async {
                helper.handleCommand(command)
            }
        } catch {
            helper.logError("Failed to parse command: \(error.localizedDescription)")
            DispatchQueue.main.async {
                helper.sendError("Failed to parse command: \(error.localizedDescription)")
            }
        }
    }
    
    // stdin closed
    helper.logError("stdin closed")
    
    // Don't exit immediately - let the run loop continue
    // The parent process will kill us when needed
    // This prevents crashes when child processes are still running
}

// Keep the run loop alive
RunLoop.main.run()
