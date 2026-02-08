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
@preconcurrency import Speech
@preconcurrency import AVFoundation
import CoreMedia

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

// SENDABLE DISCLAIMER:
// This helper is accessed from multiple threads (stdin reader, audio callback,
// Task-based async pipelines). We mark it as @unchecked Sendable to satisfy
// Swift 6's strict concurrency checks because the runtime model is already
// intentionally multi-threaded.
//
// WHY THIS IS ACCEPTABLE HERE:
// - The helper is process-local and not shared across processes.
// - We already rely on DispatchQueue / Task boundaries.
// - The alternative (full actor isolation) would require a large refactor
//   of the IPC loop and risks breaking the production flow.
final class SpeechHelper: @unchecked Sendable {
    // ============================================================
    // SPEECH ANALYZER (macOS 26+)
    // ============================================================
    //
    // We are migrating from the legacy SFSpeechRecognizer to the modern
    // SpeechAnalyzer + SpeechTranscriber pipeline. This is NOT just a
    // refactor — it's a product-quality upgrade that directly targets
    // the user's complaint ("only every other word coming through").
    //
    // WHY THIS CHANGE:
    // - SFSpeechRecognizer is now listed as "Legacy API" in Apple docs.
    // - SpeechAnalyzer is the current on-device model used by Notes,
    //   Voice Memos, Journal, and Apple Intelligence features.
    // - The new API is designed for long-form and conversational speech,
    //   which matches BubbleVoice's use-case.
    //
    // DESIGN GOAL:
    // Keep this helper as a headless process (no UI) while improving
    // transcription quality and stability. We only stream text and do
    // NOT attempt to own turn-taking logic here — that stays in Node.js.
    // ============================================================
    private var speechAnalyzer: SpeechAnalyzer?
    private var speechTranscriber: SpeechTranscriber?
    private var speechAnalyzerTask: Task<Void, Error>?
    private var speechAnalyzerInputContinuation: AsyncStream<AnalyzerInput>.Continuation?
    private var speechAnalyzerAudioFormat: AVAudioFormat?
    private var audioEngine: AVAudioEngine?
    private var audioConverter: AVAudioConverter?
    
    // LOCALE STRATEGY:
    // We default to en-US for now because that's what the previous
    // SFSpeechRecognizer was hard-coded to. We can make this dynamic
    // later if the frontend exposes locale selection.
    private var speechAnalyzerLocale: Locale = Locale(identifier: "en-US")
    
    // TTS process
    private var ttsProcess: Process?
    
    // State
    private var isListening = false
    private var isSpeaking = false
    
    // RESET SERIALIZATION LOCK (2026-02-07):
    // E2E testing revealed that multiple reset_recognition commands arriving
    // in rapid succession (from interruption + echo + speech_ended) cause a
    // FATAL crash: "required condition is false: nullptr == Tap()".
    // This happens because each reset calls stopListeningAsync() + startListeningInternal(),
    // and when they race, the second startListeningInternal tries to installTap
    // on a node that already has a tap from the first start.
    //
    // FIX: Use a boolean flag to serialize resets. If a reset is in progress,
    // subsequent reset requests are queued (or skipped with a log).
    private var isResetting = false
    
    // PRE-WARM STATE (2026-02-07):
    // Based on research showing 2-3 second startup delay for SpeechAnalyzer
    // creation + asset verification, we pre-warm the locale assets on init
    // so the first "start_listening" command doesn't have that cold-start cost.
    // The pre-warm downloads/verifies assets but does NOT create an analyzer
    // instance (those can't be reused once finalized).
    private var localeAssetsVerified = false
    
    // AUDIO TIMELINE TRACKING (2026-02-07):
    // Track the host time when the audio engine starts to compute correct
    // buffer timestamps for SpeechAnalyzer's timeline correlation feature.
    // This was identified as a gap in our implementation — we were passing
    // nil for bufferStartTime, which means the analyzer can't accurately
    // correlate audio timestamps with transcription results.
    // Research (WWDC 2025 session, Anton's Substack) confirmed that proper
    // timeline management enables precise word-level timing and better
    // finalization behavior.
    private var audioEngineStartHostTime: UInt64 = 0
    private var audioSampleRate: Double = 0
    private var totalFramesProcessed: UInt64 = 0
    
    // ENERGY-BASED VAD GATE (2026-02-07):
    // Research (our Quirks doc #14, production testing) showed SpeechAnalyzer
    // is extremely sensitive to ambient noise — it transcribes EVERYTHING the
    // mic picks up including TV, background conversations, etc.
    // This energy threshold filters silence and very quiet ambient noise
    // BEFORE feeding buffers to the analyzer, reducing false transcriptions
    // and saving processing power on the Neural Engine.
    //
    // Note: Apple's SpeechDetector module was supposed to do this but has a
    // known bug (doesn't conform to SpeechModule — Quirk #4), so we implement
    // a simple energy gate ourselves.
    //
    // The threshold is in RMS (root mean square) amplitude. Values below this
    // are considered "silence" and not sent to the analyzer.
    // 0.008 is conservative — catches dead silence and very quiet hum
    // without filtering soft speech. Based on testing where the `say` command
    // at normal volume produces RMS of ~0.05-0.2 and room silence is ~0.001-0.005.
    private let vadEnergyThreshold: Float = 0.008
    
    // Track consecutive silent frames to avoid cutting off speech at word boundaries.
    // We only stop feeding audio after sustained silence (not brief pauses between words).
    // TUNED (2026-02-07): Increased from 15 to 30 frames.
    // 30 consecutive silent frames at 4096 samples/48kHz ≈ 2.6 seconds of silence.
    // This covers natural sentence-boundary pauses in continuous speech (typically
    // 1-2 seconds). At 15 frames (1.3s), the grace period expired during pauses
    // like "coffee. [pause] Then I went..." causing premature timer firing.
    // At 30 frames (2.6s), we bridge all natural pauses while still cutting off
    // after genuine silence (user finished speaking).
    private var consecutiveSilentFrames: Int = 0
    private let maxConsecutiveSilentFrames: Int = 30
    
    // VAD HEARTBEAT (2026-02-07):
    // E2E testing revealed that the backend's 1.2s silence timer fires during
    // SpeechAnalyzer's 4-second processing gaps, causing premature sends.
    // FIX: While VAD detects speech energy, send periodic "vad_speech_active"
    // heartbeats to the backend. The backend delays its timer while heartbeats
    // are arriving, and only fires the timer after both:
    //   1. No transcription updates for 1.2s, AND
    //   2. No VAD heartbeats for 1.2s (i.e., user actually stopped speaking)
    //
    // Heartbeat interval: 300ms — frequent enough that the backend's 1.2s timer
    // never fires during processing gaps, infrequent enough to not spam.
    private var lastVadHeartbeatTime: UInt64 = 0
    // TUNED (2026-02-07): 300ms interval was too infrequent — word-gap pauses
    // could cause the backend's 1.5s VAD silence check to expire between heartbeats.
    // 150ms ensures at least 10 heartbeats per 1.5s window.
    private let vadHeartbeatIntervalFrames: UInt64 = 7200  // ~150ms at 48kHz
    
    // SINGLE-WORD FLUSH MECHANISM (2026-02-07):
    // Testing revealed that single-word utterances ("yes", "no", "ok") RELIABLY
    // produce ZERO transcription results because SpeechAnalyzer processes audio
    // in ~4-second chunks. A 0.3-second word leaves too little signal in the
    // 4-second window for the analyzer to commit to a transcription.
    //
    // FIX: Track whether we detected speech energy (via VAD) and then silence.
    // If we saw speech followed by sustained silence (>2 seconds), we "flush"
    // the analyzer by finishing the input stream and immediately restarting.
    // This forces the analyzer to emit any buffered results.
    //
    // Without this fix, users saying "yes" or "no" get:
    //   - No visual feedback in the input field
    //   - The silence timer never starts (no transcription to trigger it)
    //   - The turn hangs until they speak more or the session times out
    private var speechEnergyDetectedSinceLastResult = false
    private var flushCheckTimer: Task<Void, Never>?
    // How many silent frames after speech before we flush.
    // 25 frames at 4096 samples/48kHz ≈ 2.1 seconds — long enough
    // to confirm the user actually stopped, short enough to not feel laggy.
    private let flushAfterSilentFrames: Int = 25
    private var silentFramesSinceSpeech: Int = 0
    
    // NOTE: All legacy restart / hang detection logic has been removed
    // because SpeechAnalyzer manages its own session lifecycle. This is
    // a core product bet: we trade complex home-grown recovery logic for
    // the stability of Apple's current, supported pipeline.
    
    init() {
        // Initialize audio engine only; SpeechAnalyzer is configured on demand.
        self.audioEngine = AVAudioEngine()
        
        // Send ready signal (no permission prompt here).
        requestAuthorization()
        
        // PRE-WARM LOCALE ASSETS (2026-02-07):
        // Research showed 2-3 second startup delay for asset verification.
        // By doing this eagerly on init (while the app is loading), the first
        // "start_listening" command skips the asset check entirely.
        // This is a product improvement: the user presses the mic button and
        // transcription starts immediately instead of after a noticeable pause.
        Task {
            await self.preWarmLocaleAssets()
        }
    }
    
    /**
     * REQUEST AUTHORIZATION
     *
     * We intentionally do NOT request permissions here.
     *
     * WHY:
     * - This helper is a headless process (no UI).
     * - Permission prompts must be shown by the Electron app.
     * - Requesting from a CLI process is unreliable and can crash.
     *
     * WHAT WE DO:
     * - Send "ready" immediately so Node.js can proceed.
     * - Log a reminder that permissions are handled in the app layer.
     */
    func requestAuthorization() {
        self.sendReady()
        self.logError("Speech helper ready; microphone permission must be granted by Electron app")
    }
    
    /**
     * PRE-WARM LOCALE ASSETS
     *
     * Downloads and verifies speech model assets for the configured locale
     * BEFORE the user ever starts listening. This eliminates the 2-3 second
     * cold-start delay on the first "start_listening" command.
     *
     * PRODUCT IMPACT:
     * Without pre-warming, the user presses the mic button and waits 2-3
     * seconds before transcription begins. With pre-warming, the delay is
     * eliminated because assets are already verified/downloaded.
     *
     * CALLED FROM: init() — runs asynchronously in the background while
     * the app is still loading. Does not block the ready signal.
     *
     * WHY NOT CREATE THE ANALYZER HERE:
     * SpeechAnalyzer instances can't be reused after finalization (Quirk doc).
     * We only pre-verify assets; the analyzer itself is created fresh per session.
     */
    private func preWarmLocaleAssets() async {
        do {
            // Check if locale is supported
            let supportedLocales = await SpeechTranscriber.supportedLocales
            let supportedIds = supportedLocales.map({ $0.identifier(.bcp47) })
            
            guard supportedIds.contains(speechAnalyzerLocale.identifier(.bcp47)) else {
                logError("Pre-warm: locale not supported: \(speechAnalyzerLocale.identifier(.bcp47))")
                return
            }
            
            // Check if assets are already installed
            let installedLocales = await SpeechTranscriber.installedLocales
            let installedIds = installedLocales.map({ $0.identifier(.bcp47) })
            let isInstalled = installedIds.contains(speechAnalyzerLocale.identifier(.bcp47))
            
            if !isInstalled {
                logError("Pre-warm: downloading speech assets for \(speechAnalyzerLocale.identifier(.bcp47))...")
                // Create a temporary transcriber just for the asset download
                let tempTranscriber = SpeechTranscriber(
                    locale: speechAnalyzerLocale,
                    transcriptionOptions: [],
                    reportingOptions: [],
                    attributeOptions: []
                )
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [tempTranscriber]) {
                    try await request.downloadAndInstall()
                    logError("Pre-warm: speech assets installed successfully")
                }
            } else {
                logError("Pre-warm: speech assets already installed for \(speechAnalyzerLocale.identifier(.bcp47))")
            }
            
            localeAssetsVerified = true
        } catch {
            logError("Pre-warm: asset verification failed (non-fatal): \(error.localizedDescription)")
            // Non-fatal: configureSpeechAnalyzerIfNeeded will retry
        }
    }
    
    /**
     * START LISTENING
     *
     * Starts speech recognition using SpeechAnalyzer (macOS 26+).
     * Captures audio from microphone and streams transcription.
     *
     * PERMISSIONS STRATEGY:
     * We do NOT request permissions here. This helper is a headless process.
     * The Electron app must request microphone permission in the UI layer.
     * If permissions are missing, AVAudioEngine will fail and we report the error.
     */
    func startListening() {
        // Start asynchronously because SpeechAnalyzer uses async/await APIs.
        Task { [weak self] in
            await self?.startListeningInternal()
        }
    }
    
    /**
     * START LISTENING INTERNAL
     *
     * This uses the new SpeechAnalyzer pipeline:
     * - Prepare SpeechTranscriber + SpeechAnalyzer
     * - Install a mic tap and convert audio to analyzer format
     * - Stream AnalyzerInput buffers into the analyzer
     * - Consume transcriber results asynchronously
     */
    private func startListeningInternal() async {
        if isListening {
            logError("Already listening")
            return
        }
        
        do {
            // Ensure analyzer + assets are ready before touching the mic.
            try await configureSpeechAnalyzerIfNeeded()
            
            guard let audioEngine = audioEngine,
                  let transcriber = speechTranscriber,
                  let analyzer = speechAnalyzer,
                  let analyzerFormat = speechAnalyzerAudioFormat else {
                sendError("Speech analyzer not configured correctly")
                return
            }
            
            // Build the input stream for live audio.
            // The AsyncStream bridges the synchronous audio tap callback
            // to the async SpeechAnalyzer pipeline.
            let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
            speechAnalyzerInputContinuation = continuation
            
            // Start task that consumes results.
            startSpeechAnalyzerResultTask(transcriber: transcriber)
            
            // Install audio tap.
            // The tap captures raw PCM from the mic, converts it to the
            // analyzer's required format (16kHz Int16), and yields it
            // into the AsyncStream for analysis.
            let inputNode = audioEngine.inputNode
            
            // SAFETY: Remove any existing tap before installing a new one.
            // E2E testing (2026-02-07) showed that if a previous session's tap
            // wasn't fully cleaned up (e.g., due to race conditions in rapid resets),
            // installing a second tap crashes with:
            //   "required condition is false: nullptr == Tap()"
            // By defensively removing first, we prevent this crash entirely.
            inputNode.removeTap(onBus: 0)
            
            // HARDWARE ECHO CANCELLATION (2026-02-08):
            // Enable Apple's Voice Processing IO on the input node. This
            // activates hardware-level Acoustic Echo Cancellation (AEC)
            // which subtracts the Mac's speaker output from the mic input.
            //
            // WHY THIS MATTERS:
            // Without AEC, when the AI speaks through the speakers, the mic
            // picks up that audio and SpeechAnalyzer transcribes it — the AI
            // "hears itself." The backend currently handles this via string-
            // matching in shouldIgnoreEchoTranscription(), which is fragile.
            //
            // With Voice Processing IO, the echo is cancelled at the hardware
            // level BEFORE it reaches SpeechAnalyzer. Our benchmark tests
            // (whisperkit-echo-benchmark-results.md) confirmed this works:
            //   - Raw mic: TTS echo fully transcribed (BAD)
            //   - Voice Processing IO: TTS echo filtered, external speech
            //     preserved (IDEAL result in all tests)
            //
            // Voice Processing IO also provides:
            //   - Noise suppression (reduces background hum/fan noise)
            //   - Automatic Gain Control (normalizes volume levels)
            //
            // IMPORTANT: Must be enabled BEFORE reading inputNode.outputFormat
            // because it changes the node's format (e.g., from 1ch to 9ch).
            // The audio converter is created from the post-VoiceProcessing
            // format, so the pipeline stays consistent.
            //
            // DECIDED BY AI (2026-02-08): Based on benchmark results showing
            // Voice Processing IO scored "IDEAL" on echo tests while energy
            // VAD gate scored "NO ECHO CANCEL — both captured." The backend's
            // text-matching echo suppression remains as a secondary safety net.
            do {
                try inputNode.setVoiceProcessingEnabled(true)
                logError("Voice Processing IO enabled (hardware AEC active)")
            } catch {
                // Non-fatal: If Voice Processing IO fails (e.g., on older
                // hardware or in certain audio configurations), we fall back
                // to the existing backend text-matching echo suppression.
                // The app still works, just without hardware AEC.
                logError("WARNING: Voice Processing IO failed: \(error.localizedDescription). Falling back to software echo suppression.")
            }
            
            let inputFormat = inputNode.outputFormat(forBus: 0)
            
            audioConverter = AVAudioConverter(from: inputFormat, to: analyzerFormat)
            if audioConverter == nil {
                sendError("Failed to create audio converter for SpeechAnalyzer format")
                return
            }
            // CRITICAL: Set primeMethod to .none to avoid timestamp drift.
            // Without this, the converter may prepend silence or use a "priming"
            // frame that shifts all subsequent audio, causing the analyzer to
            // receive misaligned samples and produce garbage or nothing.
            // Both the Apple sample code and community examples set this.
            audioConverter?.primeMethod = .none
            
            // AUDIO TIMELINE SETUP (2026-02-07):
            // Record the audio engine's sample rate so we can compute proper
            // buffer start times for the SpeechAnalyzer timeline. This enables
            // audioTimeRange on results, which we use for precise turn detection
            // and echo suppression timing in the backend.
            audioSampleRate = analyzerFormat.sampleRate
            totalFramesProcessed = 0
            consecutiveSilentFrames = 0
            
            inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
                guard let self = self else { return }
                
                // ENERGY-BASED VAD GATE (2026-02-07):
                // Filter out silence and very quiet ambient noise BEFORE feeding
                // to the analyzer. This was added because our research (Quirk #14)
                // showed SpeechAnalyzer transcribes ALL audio including TV,
                // background conversations, etc. By gating on energy, we reduce
                // false transcriptions without affecting real speech.
                //
                // Note: We still feed audio after a brief silent gap (up to
                // maxConsecutiveSilentFrames) to avoid cutting off speech at
                // natural word boundaries where energy briefly drops.
                let rms = self.computeRMSEnergy(buffer: buffer)
                
                if rms < self.vadEnergyThreshold {
                    self.consecutiveSilentFrames += 1
                    
                    // VAD HEARTBEAT DURING GRACE PERIOD (2026-02-07):
                    // Even during short silence gaps (word boundaries, sentence pauses),
                    // continue sending heartbeats if we're within the grace period.
                    // This prevents the backend's silence timer from firing during
                    // natural 1-2 second pauses between sentences in continuous speech.
                    //
                    // WITHOUT THIS: Say "First I woke up early. Then I went for a walk."
                    // → The 1.5s pause after "early." causes VAD silence → timer fires
                    // → only "First I woke up early" gets sent to LLM (Bug 5)
                    //
                    // WITH THIS: Heartbeats continue during the grace period (up to
                    // maxConsecutiveSilentFrames frames ≈ 1.3s), keeping the backend
                    // timer gate open through natural pauses.
                    if self.consecutiveSilentFrames <= self.maxConsecutiveSilentFrames
                       && self.speechEnergyDetectedSinceLastResult {
                        let framesSinceLastHeartbeat = self.totalFramesProcessed - self.lastVadHeartbeatTime
                        if framesSinceLastHeartbeat >= self.vadHeartbeatIntervalFrames {
                            self.lastVadHeartbeatTime = self.totalFramesProcessed
                            self.sendResponse(type: "vad_speech_active", data: [
                                "rms": AnyCodable(rms),
                                "inGracePeriod": AnyCodable(true),
                                "timestamp": AnyCodable(Date().timeIntervalSince1970)
                            ])
                        }
                    }
                    
                    // SINGLE-WORD FLUSH (2026-02-07):
                    // If we previously detected speech energy but haven't received
                    // any transcription results, and we've now been silent long enough,
                    // force the analyzer to flush by resetting the session.
                    // This handles "yes", "no", "ok" and other quick responses
                    // that the 4-second processing window would otherwise swallow.
                    if self.speechEnergyDetectedSinceLastResult {
                        self.silentFramesSinceSpeech += 1
                        
                        if self.silentFramesSinceSpeech >= self.flushAfterSilentFrames {
                            self.logError("VAD: Speech then silence detected (\(self.silentFramesSinceSpeech) silent frames) — flushing analyzer for possible short utterance")
                            self.speechEnergyDetectedSinceLastResult = false
                            self.silentFramesSinceSpeech = 0
                            
                            // Notify backend that we detected "speech then silence"
                            // so it can handle short-utterance fallback behavior
                            // (e.g., start a shorter timer to wait for the delayed result)
                            self.sendResponse(type: "speech_energy_silence", data: [
                                "silentFrames": AnyCodable(self.flushAfterSilentFrames),
                                "estimatedSilenceDurationMs": AnyCodable(Int(Double(self.flushAfterSilentFrames) * 4096.0 / 48000.0 * 1000.0))
                            ])
                        }
                    }
                    
                    // Still feed audio during brief pauses (word boundaries)
                    // but stop after sustained silence to save processing.
                    if self.consecutiveSilentFrames > self.maxConsecutiveSilentFrames {
                        // TIMESTAMP FIX (2026-02-07):
                        // Even though we're not feeding this buffer to the analyzer,
                        // we MUST still count its frames for timeline accuracy.
                        // Without this, the next speech buffer would have a timestamp
                        // that "jumped back" to the time of the PREVIOUS speech,
                        // confusing the analyzer's audioTimeRange correlation.
                        //
                        // Example without this fix:
                        //   Buffer 100 (speech) → totalFrames = 409600 → time = 8.53s
                        //   Buffer 101-130 (silence, skipped) → totalFrames stays 409600
                        //   Buffer 131 (speech) → time = 8.53s ← WRONG, should be ~11.2s
                        self.totalFramesProcessed += UInt64(buffer.frameLength)
                        return
                    }
                } else {
                    // Speech detected — reset the silence counter
                    self.consecutiveSilentFrames = 0
                    
                    // SINGLE-WORD FLUSH TRACKING (2026-02-07):
                    // Mark that we've seen speech energy so the flush mechanism
                    // knows to activate when silence returns.
                    self.speechEnergyDetectedSinceLastResult = true
                    self.silentFramesSinceSpeech = 0
                    
                    // VAD HEARTBEAT (2026-02-07):
                    // Send periodic heartbeat to backend while user is speaking.
                    // This prevents the backend's silence timer from firing during
                    // SpeechAnalyzer's 4-second processing gaps (which cause >1.2s
                    // gaps in transcription updates even though user is still speaking).
                    //
                    // Without this, a 7-sentence utterance gets cut off after the
                    // first sentence because the timer fires during the processing gap.
                    let framesSinceLastHeartbeat = self.totalFramesProcessed - self.lastVadHeartbeatTime
                    if framesSinceLastHeartbeat >= self.vadHeartbeatIntervalFrames {
                        self.lastVadHeartbeatTime = self.totalFramesProcessed
                        self.sendResponse(type: "vad_speech_active", data: [
                            "rms": AnyCodable(rms),
                            "timestamp": AnyCodable(Date().timeIntervalSince1970)
                        ])
                    }
                }
                
                do {
                    let converted = try self.convertBufferForAnalyzer(buffer, targetFormat: analyzerFormat)
                    
                    // BUFFER TIMESTAMP (2026-02-07):
                    // Compute the audio timeline position for this buffer as a CMTime.
                    // Previously we passed nil, which means the analyzer couldn't
                    // accurately correlate audio timestamps with results.
                    // Now we track cumulative frames processed and compute
                    // the time in the analyzer's format sample rate.
                    // This enables audioTimeRange on transcription results,
                    // which we send to the backend for precise timing.
                    //
                    // CMTime is Apple's precise time representation used throughout
                    // AV frameworks. We use the frame count as the value and the
                    // sample rate as the timescale for maximum precision.
                    let bufferStartCMTime = CMTime(
                        value: CMTimeValue(self.totalFramesProcessed),
                        timescale: CMTimeScale(self.audioSampleRate)
                    )
                    self.totalFramesProcessed += UInt64(converted.frameLength)
                    
                    continuation.yield(AnalyzerInput(
                        buffer: converted,
                        bufferStartTime: bufferStartCMTime
                    ))
                } catch {
                    self.logError("Audio buffer conversion failed: \(error.localizedDescription)")
                }
            }
            
            // Start the audio engine and analyzer.
            // NOTE: analyzer.start() returns quickly — it schedules
            // processing in the background. Results arrive asynchronously
            // via the transcriber.results AsyncSequence.
            audioEngine.prepare()
            try audioEngine.start()
            try await analyzer.start(inputSequence: stream)
            
            isListening = true
            logError("Started listening (SpeechAnalyzer, format: \(analyzerFormat))")
            
            // Notify frontend for visual mic feedback.
            sendResponse(type: "listening_active", data: ["status": AnyCodable("listening")])
            
        } catch {
            sendError("Failed to start listening: \(error.localizedDescription)")
        }
    }
    
    // ============================================================
    // SPEECH ANALYZER SUPPORT UTILITIES
    // ============================================================
    //
    // These utilities replace the legacy restart/watchdog logic. SpeechAnalyzer
    // owns its own lifecycle and handles long-form transcription internally.
    //
    // Our responsibility is to:
    // 1) Ensure assets are installed for the chosen locale
    // 2) Provide a correctly formatted audio stream
    // 3) Consume transcription results and forward them to Node.js
    // ============================================================
    
    /**
     * CONFIGURE SPEECH ANALYZER IF NEEDED
     *
     * Creates a fresh SpeechTranscriber + SpeechAnalyzer for each session.
     * We always re-create rather than reuse because:
     *   - SpeechAnalyzer docs state that once finished, it can't be reused
     *   - Fresh instances give us clean, deterministic state per turn
     *   - The creation cost is negligible vs. the quality benefit
     *
     * ASSET MANAGEMENT:
     * On first use, the locale's speech model may need downloading.
     * This is handled via AssetInventory, which downloads on-device
     * models from Apple's servers. Once installed, they persist.
     *
     * TRANSCRIBER OPTIONS (Updated 2026-02-07 based on deep research):
     * - transcriptionOptions: [] (default, no special modes)
     * - reportingOptions: [.volatileResults] — gives us real-time partial
     *   results that update progressively as the user speaks. Research confirmed
     *   volatile results are "rough, real-time guesses; iteratively refined" that
     *   get replaced by final results. This is what powers the live transcription
     *   display in the frontend (shown at 0.7 opacity until finalized).
     * - attributeOptions: [.audioTimeRange] — ADDED based on research.
     *   This gives us per-result audio timestamp ranges that tell us EXACTLY
     *   when speech occurred in the audio timeline. This is critical for:
     *     1) Precise turn detection: We can compute the actual audio time of
     *        the last spoken word, not just "when we received the update."
     *     2) Echo suppression: We can correlate transcription timestamps with
     *        TTS playback timing to distinguish user speech from mic bleed.
     *     3) Frontend word timing: Enables potential word-by-word animation.
     *   WWDC 2025 demo and community posts (Davide Dmiston) confirm this is
     *   how production apps handle timeline synchronization.
     *
     * NOTE ON PRESETS:
     * Our Quirks doc (Quirk #5) notes that .progressiveLiveTranscription
     * preset may not compile in the release. We use explicit options which
     * is equivalent and more reliable. The research confirmed this approach
     * matches what community implementations use.
     */
    private func configureSpeechAnalyzerIfNeeded() async throws {
        let transcriber = SpeechTranscriber(
            locale: speechAnalyzerLocale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        speechTranscriber = transcriber
        
        // FAST PATH (2026-02-07): If pre-warm already verified assets, skip
        // the async locale/asset check entirely. This eliminates 2-3 seconds
        // of startup delay on the first listen command.
        if !localeAssetsVerified {
            // Ensure locale is supported and assets are installed.
            let supportedLocales = await SpeechTranscriber.supportedLocales
            let supportedIds = supportedLocales.map({ $0.identifier(.bcp47) })
            
            if !supportedIds.contains(speechAnalyzerLocale.identifier(.bcp47)) {
                throw NSError(
                    domain: "SpeechAnalyzer",
                    code: -100,
                    userInfo: [NSLocalizedDescriptionKey: "Locale not supported: \(speechAnalyzerLocale.identifier)"]
                )
            }
            
            // Download locale assets if not already installed.
            // The system manages these models — once downloaded, they persist
            // across app launches until the user or system cleans them up.
            let installedLocales = await SpeechTranscriber.installedLocales
            let installedIds = installedLocales.map({ $0.identifier(.bcp47) })
            let isInstalled = installedIds.contains(speechAnalyzerLocale.identifier(.bcp47))
            
            if !isInstalled {
                logError("Downloading speech assets for locale: \(speechAnalyzerLocale.identifier(.bcp47))")
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    try await request.downloadAndInstall()
                    logError("Speech assets installed successfully")
                }
            }
            
            localeAssetsVerified = true
        } else {
            logError("Skipping asset check (pre-warmed)")
        }
        
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        speechAnalyzer = analyzer
        
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw NSError(
                domain: "SpeechAnalyzer",
                code: -101,
                userInfo: [NSLocalizedDescriptionKey: "Failed to obtain compatible audio format"]
            )
        }
        speechAnalyzerAudioFormat = format
    }
    
    /**
     * START SPEECH ANALYZER RESULT TASK
     *
     * Creates a background Task that consumes the transcriber.results
     * AsyncSequence. Each result is forwarded to Node.js as a
     * transcription_update message via stdout.
     *
     * LIFECYCLE:
     * - The task runs until the results stream ends (analyzer finalized)
     *   or it's cancelled (stopListening called).
     * - CancellationError is expected and silenced.
     * - Any other error is reported to the backend.
     *
     * PRODUCT NOTE:
     * The volatile results (.volatileResults in reportingOptions) give
     * us real-time partial text that updates progressively as the user
     * speaks. This is what powers the live transcription display.
     * Final results come when the analyzer detects a natural pause or
     * sentence boundary.
     *
     * AUDIO TIME RANGE (2026-02-07):
     * With .audioTimeRange in attributeOptions, each result now includes
     * timing information that tells us when in the audio stream the speech
     * occurred. We extract this and send it to the backend as audioStartTime
     * and audioEndTime. The backend uses these for:
     *   1) Precise silence detection (time since last spoken word in audio,
     *      not time since last IPC message arrived)
     *   2) Echo suppression (correlate speech timestamps with TTS playback)
     *   3) Future: word-level timing for frontend animations
     */
    private func startSpeechAnalyzerResultTask(transcriber: SpeechTranscriber) {
        speechAnalyzerTask?.cancel()
        speechAnalyzerTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    
                    // RESET FLUSH TRACKING (2026-02-07):
                    // We got a transcription result, so the analyzer DID process
                    // the speech. No need to flush — clear the "speech detected" flag.
                    // This prevents redundant flushes when the analyzer already
                    // emitted results for the speech it heard.
                    self.speechEnergyDetectedSinceLastResult = false
                    self.silentFramesSinceSpeech = 0
                    
                    // EXTRACT AUDIO TIMESTAMPS (2026-02-07):
                    // The audioTimeRange attribute gives us the precise audio
                    // timeline range where this speech occurred. We send these
                    // to the backend for timing-aware turn detection and echo
                    // suppression. If the attribute is not available (e.g., the
                    // result doesn't have timing info), we send -1 as a sentinel.
                    var audioStartTime: Double = -1
                    var audioEndTime: Double = -1
                    
                    // Access audioTimeRange from the result's text attributes.
                    // The AttributedString may contain .audioTimeRange attributes
                    // on character runs. We extract the overall range.
                    //
                    // CMTimeRange has .start (CMTime) and .duration (CMTime).
                    // End time = start + duration. We convert to seconds (Double)
                    // for JSON transmission to the Node.js backend.
                    let attrString = result.text
                    for run in attrString.runs {
                        if let timeRange = run.audioTimeRange {
                            let startSec = CMTimeGetSeconds(timeRange.start)
                            let endSec = CMTimeGetSeconds(timeRange.start + timeRange.duration)
                            if audioStartTime < 0 || startSec < audioStartTime {
                                audioStartTime = startSec
                            }
                            if endSec > audioEndTime {
                                audioEndTime = endSec
                            }
                        }
                    }
                    
                    self.sendTranscription(
                        text: text,
                        isFinal: result.isFinal,
                        audioStartTime: audioStartTime,
                        audioEndTime: audioEndTime
                    )
                }
                self.logError("Transcriber results stream ended")
            } catch {
                if !(error is CancellationError) {
                    self.sendError("SpeechAnalyzer result stream error: \(error.localizedDescription)")
                }
            }
        }
    }
    
    /**
     * CONVERT BUFFER FOR ANALYZER
     *
     * Converts an AVAudioPCMBuffer from the mic's native format (typically
     * 48kHz Float32) to the SpeechAnalyzer's required format (16kHz Int16).
     *
     * CRITICAL FIX (2026-02-07):
     * Previously used .endOfStream as the inputStatus, which tells the
     * converter that the entire audio source is done. This caused the
     * converter to either produce empty/corrupted output or reset its
     * internal state on every call, leading to ZERO transcription results.
     *
     * The correct pattern (from Apple's sample code and multiple working
     * implementations) is:
     *   - First callback invocation: .haveData + return the buffer
     *   - Subsequent invocations: .noDataNow + return nil
     *
     * This tells the converter "here's one buffer, no more right now" without
     * signaling that the stream itself is over.
     *
     * Also added primeMethod = .none on the converter (set at creation time)
     * to prevent timestamp drift from priming samples.
     */
    private func convertBufferForAnalyzer(_ buffer: AVAudioPCMBuffer, targetFormat: AVAudioFormat) throws -> AVAudioPCMBuffer {
        guard let converter = audioConverter else {
            throw NSError(
                domain: "SpeechAnalyzer",
                code: -102,
                userInfo: [NSLocalizedDescriptionKey: "Audio converter not configured"]
            )
        }
        
        if buffer.format == targetFormat {
            return buffer
        }
        
        let sampleRateRatio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
        let scaledInputFrameLength = Double(buffer.frameLength) * sampleRateRatio
        let frameCapacity = AVAudioFrameCount(scaledInputFrameLength.rounded(.up))
        
        guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: frameCapacity) else {
            throw NSError(
                domain: "SpeechAnalyzer",
                code: -103,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create conversion buffer"]
            )
        }
        
        var conversionError: NSError?
        // CRITICAL: We use a nonisolated(unsafe) flag to track whether the
        // buffer has already been provided. This is the pattern used in Apple's
        // own sample code and confirmed working by community implementations.
        //
        // WHY nonisolated(unsafe):
        // The closure passed to converter.convert is @Sendable, but the
        // converter calls it synchronously on the same thread. Using
        // nonisolated(unsafe) is safe here because there is no actual
        // concurrent access — the closure is invoked sequentially by the
        // converter within this single function call.
        nonisolated(unsafe) var bufferProvided = false
        let status = converter.convert(to: convertedBuffer, error: &conversionError) { _, inputStatus in
            if bufferProvided {
                // Already gave the converter our buffer; no more data right now.
                inputStatus.pointee = .noDataNow
                return nil
            }
            bufferProvided = true
            inputStatus.pointee = .haveData
            return buffer
        }
        
        if status == .error {
            throw conversionError ?? NSError(
                domain: "SpeechAnalyzer",
                code: -104,
                userInfo: [NSLocalizedDescriptionKey: "Audio conversion failed"]
            )
        }
        
        return convertedBuffer
    }
    
    /**
     * COMPUTE RMS ENERGY
     *
     * Computes the Root Mean Square energy of an audio buffer.
     * Used for the energy-based VAD gate to filter silence/noise.
     *
     * WHY RMS:
     * RMS is the standard measure of audio signal power. It's more
     * representative of perceived loudness than peak amplitude because
     * it accounts for the full waveform shape, not just spikes.
     *
     * RETURNS:
     * Float in range [0, 1] where 0 is perfect silence and 1 is max volume.
     * Typical values:
     *   - Room silence: 0.001 - 0.005
     *   - Soft background: 0.005 - 0.02
     *   - Normal speech (say command): 0.05 - 0.2
     *   - Loud speech (close to mic): 0.2 - 0.5
     */
    private func computeRMSEnergy(buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData else { return 0.0 }
        
        let channelDataPointer = channelData[0]
        let frameLength = Int(buffer.frameLength)
        
        guard frameLength > 0 else { return 0.0 }
        
        var sumOfSquares: Float = 0.0
        for i in 0..<frameLength {
            let sample = channelDataPointer[i]
            sumOfSquares += sample * sample
        }
        
        return sqrt(sumOfSquares / Float(frameLength))
    }
    
    /**
     * RESET SPEECH ANALYZER SESSION
     *
     * Cleanly stops the current session and starts a fresh one.
     *
     * CALLED BY: "reset_recognition" command from backend at key lifecycle points:
     *   1) After AI finishes speaking (speech_ended)
     *   2) After an interruption is detected
     *   3) After the timer cascade completes (turn boundary)
     *
     * FIX (2026-02-07): Previously this called the synchronous stopListening()
     * followed by startListeningInternal(). Now we use stopListeningAsync()
     * which properly awaits the analyzer finalization before starting a new
     * session. This prevents race conditions where the old analyzer is still
     * cleaning up when the new one starts, which could cause audio tap conflicts.
     */
    private func resetSpeechAnalyzerSession() async {
        // SERIALIZATION CHECK (2026-02-07):
        // E2E testing showed that 3 reset commands can arrive within milliseconds
        // (interruption + echo detection + speech_ended). Without this guard,
        // concurrent resets race and crash on double tap installation.
        guard !isResetting else {
            logError("Reset already in progress — skipping duplicate reset request")
            return
        }
        isResetting = true
        
        // WHY: We want a clean transcription boundary after AI speech or interruptions.
        // This mirrors the old "restart recognition" behavior but uses the new
        // SpeechAnalyzer pipeline: stop everything, then start fresh.
        await stopListeningAsync()
        
        // STABILIZATION DELAY (2026-02-07):
        // E2E testing revealed SIGTRAP crashes when the stop-start cycle happens
        // too quickly. The AVAudioEngine's internal audio thread may still be
        // draining the last few tap callbacks when we try to install a new tap.
        // This 200ms delay gives the audio system time to fully quiesce before
        // we set up a new session.
        //
        // WHY 200ms: Long enough for the audio thread to drain (audio buffers at
        // 48kHz / 4096 samples = ~85ms per buffer, so 200ms covers 2+ buffer cycles).
        // Short enough that the user doesn't notice any delay (human perception
        // threshold for audio delay is ~100-200ms).
        try? await Task.sleep(nanoseconds: 200_000_000)
        
        await startListeningInternal()
        
        isResetting = false
    }
    
    /**
     * STOP LISTENING (ASYNC)
     *
     * Async version that properly awaits analyzer finalization.
     * Used by resetSpeechAnalyzerSession to ensure clean teardown
     * before starting a new session.
     *
     * FIX (2026-02-07): The old synchronous stopListening() used a
     * fire-and-forget Task for finalization, which meant the analyzer
     * might still be cleaning up when a new session starts. This caused
     * intermittent issues where the audio tap from the old session
     * conflicted with the new one.
     */
    private func stopListeningAsync() async {
        guard isListening else { return }
        
        // Stop feeding audio to the analyzer.
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        
        // Finish the input stream and cancel result consumption.
        speechAnalyzerInputContinuation?.finish()
        speechAnalyzerInputContinuation = nil
        
        speechAnalyzerTask?.cancel()
        speechAnalyzerTask = nil
        
        // PROPERLY AWAIT FINALIZATION (2026-02-07):
        // This ensures the analyzer has fully cleaned up before we nil it out.
        // The old code used Task { try? await ... } which was fire-and-forget.
        if let analyzer = speechAnalyzer {
            do {
                try await analyzer.finalizeAndFinishThroughEndOfInput()
            } catch {
                logError("Analyzer finalization error (non-fatal): \(error.localizedDescription)")
            }
        }
        
        speechAnalyzer = nil
        speechTranscriber = nil
        speechAnalyzerAudioFormat = nil
        audioConverter = nil
        
        // Reset audio timeline tracking for the next session
        totalFramesProcessed = 0
        consecutiveSilentFrames = 0
        
        // Reset single-word flush tracking
        speechEnergyDetectedSinceLastResult = false
        silentFramesSinceSpeech = 0
        flushCheckTimer?.cancel()
        flushCheckTimer = nil
        
        isListening = false
        logError("Stopped listening (SpeechAnalyzer session fully finalized)")
    }
    
    /**
     * STOP LISTENING (SYNC)
     *
     * Synchronous stop for use from non-async contexts (handleCommand).
     * Uses fire-and-forget for finalization since we can't await here.
     * For clean session transitions, use stopListeningAsync() instead.
     */
    func stopListening() {
        guard isListening else { return }
        // Stop feeding audio to the analyzer.
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        
        // Finish the input stream and cancel result consumption.
        speechAnalyzerInputContinuation?.finish()
        speechAnalyzerInputContinuation = nil
        
        speechAnalyzerTask?.cancel()
        speechAnalyzerTask = nil
        
        // Finalize the analyzer session asynchronously.
        // NOTE: This is fire-and-forget because we're in a sync context.
        // For session resets (start->stop->start), use stopListeningAsync()
        // which properly awaits finalization.
        if let analyzer = speechAnalyzer {
            Task {
                try? await analyzer.finalizeAndFinishThroughEndOfInput()
            }
        }
        
        speechAnalyzer = nil
        speechTranscriber = nil
        speechAnalyzerAudioFormat = nil
        audioConverter = nil
        
        // Reset audio timeline tracking
        totalFramesProcessed = 0
        consecutiveSilentFrames = 0
        
        // Reset single-word flush tracking
        speechEnergyDetectedSinceLastResult = false
        silentFramesSinceSpeech = 0
        flushCheckTimer?.cancel()
        flushCheckTimer = nil
        
        isListening = false
        logError("Stopped listening (SpeechAnalyzer session finalized)")
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
            // CRITICAL: Explicitly reset the recognition session.
            //
            // This is called by the backend at key lifecycle points:
            //   1) After AI finishes speaking (speech_ended)
            //   2) After an interruption is detected
            //   3) After the timer cascade completes (turn boundary)
            //
            // With SpeechAnalyzer, we implement this as a clean stop + restart.
            logError("Received reset_recognition command from backend (SpeechAnalyzer reset)")
            if isListening {
                Task { [weak self] in
                    await self?.resetSpeechAnalyzerSession()
                }
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
    
    /**
     * SEND TRANSCRIPTION
     *
     * Sends a transcription_update message to Node.js via stdout.
     *
     * FIELDS (2026-02-07 — expanded based on research):
     * - text: The transcribed text (may be partial/volatile or final)
     * - isFinal: Whether this is a finalized segment (sentence boundary)
     * - isSpeaking: Whether TTS is currently active (for echo suppression)
     * - audioStartTime: Audio timeline start of this speech segment (seconds, -1 if unavailable)
     * - audioEndTime: Audio timeline end of this speech segment (seconds, -1 if unavailable)
     *
     * The audio timestamps enable the backend to:
     *   1) Compute precise silence duration (audioEndTime vs current time)
     *   2) Correlate with TTS playback timing for echo filtering
     *   3) Track conversation pacing and response times
     *
     * These were added after research showed that timer-based silence detection
     * (measuring time between IPC messages) is less reliable than audio-timeline-
     * based detection (measuring time since last spoken word in the audio stream).
     */
    func sendTranscription(text: String, isFinal: Bool, audioStartTime: Double = -1, audioEndTime: Double = -1) {
        // CRITICAL: Include isSpeaking state with every transcription
        // This allows the backend to detect interruptions
        // If isSpeaking is true and we get a transcription, it means
        // the user is interrupting the AI's response
        sendResponse(type: "transcription_update", data: [
            "text": AnyCodable(text),
            "isFinal": AnyCodable(isFinal),
            "isSpeaking": AnyCodable(isSpeaking),
            "audioStartTime": AnyCodable(audioStartTime),
            "audioEndTime": AnyCodable(audioEndTime)
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
    DispatchQueue.main.async {
        helper.logError("Starting stdin reader loop")
    }
    
    while let line = readLine() {
        guard !line.isEmpty else { continue }
        
        DispatchQueue.main.async {
            helper.logError("Received command: \(line.prefix(50))...")
        }
        
        do {
            let decoder = JSONDecoder()
            let data = line.data(using: .utf8)!
            let command = try decoder.decode(Command.self, from: data)
            DispatchQueue.main.async {
                helper.handleCommand(command)
            }
        } catch {
            DispatchQueue.main.async {
                helper.logError("Failed to parse command: \(error.localizedDescription)")
                helper.sendError("Failed to parse command: \(error.localizedDescription)")
            }
        }
    }
    
    // stdin closed
    DispatchQueue.main.async {
        helper.logError("stdin closed")
    }
    
    // Don't exit immediately - let the run loop continue
    // The parent process will kill us when needed
    // This prevents crashes when child processes are still running
}

// Keep the run loop alive
RunLoop.main.run()
