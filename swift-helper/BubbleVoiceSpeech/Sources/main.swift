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
    
    // ============================================================
    // TTS THROUGH AVAUDIOENGINE (2026-02-16)
    // ============================================================
    //
    // CRITICAL ARCHITECTURE CHANGE:
    // Previously, TTS used `say "text"` which plays directly to system
    // speakers, BYPASSING the AVAudioEngine. This meant VPIO's echo
    // cancellation had no reference signal — it didn't know what audio
    // was being played, so it couldn't subtract it from the mic input.
    // The result: the AI "heard itself" and we needed fragile software
    // echo suppression in the backend (shouldIgnoreEchoTranscription).
    //
    // NEW APPROACH:
    // TTS now uses `say -o file.aiff "text"` to generate audio files,
    // then plays them through an AVAudioPlayerNode connected to the
    // same AVAudioEngine where VPIO is enabled. This routes TTS audio
    // through outputNode → speakers, giving VPIO a reference signal
    // to subtract from the mic input. Echo cancellation now works at
    // the hardware level with zero software filtering needed.
    //
    // This was confirmed working in the VPIO echo cancellation test
    // (1-priority-scripts/CONFIRMED-WORKING-VPIOEchoCancellationTest.swift)
    // which showed ZERO TTS words leaking into transcription while
    // background speech was captured cleanly.
    //
    // AUDIO GRAPH WITH PLAYERNODE:
    //   say -o → .aiff file → AVAudioPlayerNode → mainMixerNode → outputNode → Speakers
    //                                                                   │
    //                                              VPIO reference signal (known output)
    //                                                                   │
    //   Microphone → inputNode → [AEC subtraction] → tap → SpeechAnalyzer (clean audio)
    //
    // CHUNKED PIPELINE:
    // Text is split into sentence-level chunks (min 7 words per chunk).
    // Each chunk is generated as a separate .aiff file. While chunk N
    // plays, chunk N+1 is being generated. This gives ~1s latency to
    // first speech, then continuous playback with no gaps.
    // ============================================================
    private let playerNode = AVAudioPlayerNode()
    
    /// Task that manages the generate→schedule→play pipeline for TTS chunks.
    /// Cancelled by stopSpeaking() when user interrupts or TTS completes.
    private var ttsGenerationTask: Task<Void, Never>?
    
    /// Reference to the currently running `say -o` process so stopSpeaking()
    /// can kill it immediately during interruption (no waiting for generation).
    private var currentSayProcess: Process?
    
    /// Flag checked by the TTS pipeline task to abort between chunks.
    /// Set to true by stopSpeaking(), checked before each chunk generation
    /// and before each schedule operation.
    private var isTTSCancelled = false
    
    // State
    private var isListening = false
    private var isSpeaking = false
    
    // RESET SERIALIZATION LOCK (2026-02-07, updated 2026-02-08):
    // Multiple reset_recognition commands can arrive in rapid succession
    // (from interruption + echo + speech_ended). This flag prevents
    // concurrent resets from racing.
    //
    // HISTORY: Originally this was CRITICAL because each reset destroyed
    // and rebuilt the entire audio pipeline (engine, tap, analyzer,
    // converter). Now with the lightweight input-rotation pattern
    // (2026-02-08 fix), resets are much cheaper and safer, but we still
    // serialize them to prevent continuation swap races.
    private var isResetting = false
    
    // ANALYZER SESSION PERSISTENCE (2026-02-08):
    // Track whether we have a live, reusable analyzer session. When true,
    // resetSpeechAnalyzerSession() uses the lightweight finalize → start
    // pattern instead of destroying everything. This is the KEY FIX for
    // the "chunk batch" bug — we keep the neural model warm and the audio
    // engine running across turn boundaries.
    //
    // WHY THIS MATTERS:
    // Previously, every reset called finalizeAndFinishThroughEndOfInput()
    // which PERMANENTLY killed the analyzer. Creating a new one took ~2-4
    // seconds (neural model load, asset check, audio engine restart),
    // which is why we observed "4-second chunk batches" instead of the
    // real-time word-by-word streaming that SpeechAnalyzer actually supports.
    //
    // With this flag, the first start_listening creates the full pipeline,
    // and subsequent resets just rotate the input stream — taking ~50ms
    // instead of ~2-4 seconds.
    private var hasLiveAnalyzerSession = false
    
    // LAST AUDIO TIMESTAMP (2026-02-08):
    // Tracks the CMTime of the last audio buffer fed to the analyzer.
    // Used by the lightweight reset to tell the analyzer "finalize
    // everything through this point" before starting a new input stream.
    // Without this, finalize(through:) doesn't know where the current
    // input ends, potentially causing incomplete finalization.
    private var lastAudioTimestamp: CMTime = .zero
    
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
    
    // REMOVED (2026-02-08): Single-word flush mechanism no longer needed.
    // With .fastResults flag enabled, SpeechAnalyzer streams results
    // word-by-word every 200-500ms. Short utterances now produce volatile
    // results immediately, so we don't need to flush the analyzer.
    
    // NOTE: All legacy restart / hang detection logic has been removed
    // because SpeechAnalyzer manages its own session lifecycle. This is
    // a core product bet: we trade complex home-grown recovery logic for
    // the stability of Apple's current, supported pipeline.
    
    init() {
        // Initialize audio engine only; SpeechAnalyzer is configured on demand.
        self.audioEngine = AVAudioEngine()
        
        // ATTACH PLAYER NODE EARLY (2026-02-16):
        // The playerNode must be attached to the engine before the engine starts.
        // We attach here in init and connect later in startListeningInternal()
        // after VPIO is enabled and output formats are known.
        // attach() just registers the node — it doesn't need format info.
        // connect() establishes audio connections with format negotiation.
        // Attaching here means the playerNode is always ready for TTS,
        // even across stop/start cycles of the engine.
        audioEngine?.attach(playerNode)
        
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
            
            // RESERVE LOCALE ASSETS (2026-02-08, added based on Apple docs):
            //
            // Explicitly reserve the locale's assets so the system won't
            // auto-evict them to free disk space. From Apple docs:
            //   "Add the locale to the app's current asset reservations"
            //
            // This is technically optional since AssetInventory does it
            // automatically during download, but explicitly reserving gives
            // us stronger guarantees that the model stays available across
            // the entire process lifetime. Itsuki's article also recommends
            // this for production apps that need reliable availability.
            //
            // Without this, if the user's disk is low, the system might
            // evict our speech model between sessions, causing a surprise
            // re-download on the next "start_listening" command.
            //
            // DECIDED BY AI (2026-02-08): Based on Apple docs and Itsuki's
            // article. Low risk, high reliability improvement.
            do {
                try await AssetInventory.reserve(locale: speechAnalyzerLocale)
                logError("Pre-warm: locale assets reserved for \(speechAnalyzerLocale.identifier(.bcp47))")
            } catch {
                // Non-fatal: reservation failure doesn't prevent usage,
                // just means the system might evict assets if disk is low.
                logError("Pre-warm: locale reservation failed (non-fatal): \(error.localizedDescription)")
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
            
            // ============================================================
            // HARDWARE ECHO CANCELLATION VIA VPIO (2026-02-16 REWRITE)
            // ============================================================
            //
            // Enable Apple's Voice Processing IO (VPIO) on the OUTPUT node.
            // Per Apple docs, enabling on either input or output node enables
            // it on both — they share the same VPIO audio unit. We use
            // outputNode to match the confirmed working test script
            // (CONFIRMED-WORKING-VPIOEchoCancellationTest.swift).
            //
            // WHAT VPIO PROVIDES:
            //   - Hardware-level Acoustic Echo Cancellation (AEC) at FULL volume
            //   - The outputNode knows what audio is going to speakers
            //   - The inputNode subtracts that speaker audio from mic input
            //   - Result: SpeechAnalyzer gets clean mic audio with no TTS echo
            //   - Also: noise suppression, automatic gain control
            //
            // WHY OUTPUTNODE INSTEAD OF INPUTNODE:
            // Previously (2026-02-08) we enabled on inputNode, which DOES
            // enable VPIO. But the confirmed working echo test uses outputNode
            // and explicitly connects mainMixer→output with the VPIO format.
            // This explicit connection is CRITICAL when a playerNode is
            // attached — without it, the engine fails with error -10875
            // because the auto-connection uses a format incompatible with VPIO.
            //
            // AUDIO GRAPH AFTER VPIO:
            //   playerNode → mainMixerNode → outputNode(VPIO) → Speakers
            //   Microphone → inputNode(VPIO, AEC applied) → tap → SpeechAnalyzer
            //
            // CONFIRMED: Zero TTS words leaked into transcription in the
            // VPIO echo test while background speech was captured cleanly.
            // This eliminates the need for the backend's fragile software
            // echo suppression (shouldIgnoreEchoTranscription).
            // ============================================================
            do {
                try audioEngine.outputNode.setVoiceProcessingEnabled(true)
                logError("VPIO enabled on outputNode (hardware AEC active)")
                
                // DISABLE VPIO AUDIO DUCKING (2026-02-16 BUGFIX):
                // ============================================================
                //
                // PROBLEM: When VPIO is enabled, macOS automatically "ducks"
                // (reduces volume of) ALL other system audio to ~1% volume.
                // This affected the user's YouTube playback — volume dropped
                // to nearly zero and STAYED that way even after stopping voice
                // input, because VPIO's ducking persists while the engine exists.
                //
                // ROOT CAUSE: VPIO assumes a phone-call-like use case where
                // you want to suppress background audio. Our voice AI app is
                // NOT a phone call — the user may be watching YouTube while
                // intermittently talking to the AI.
                //
                // FIX: Use AVAudioVoiceProcessingOtherAudioDuckingConfiguration
                // (available macOS 14+) to disable VPIO's automatic ducking.
                // Setting enableAdvancedDucking:true with duckingLevel:.min
                // overrides the default aggressive ducking with minimum ducking.
                //
                // enableAdvancedDucking:false would revert to the DEFAULT system
                // ducking (which is the aggressive behavior we want to avoid).
                // enableAdvancedDucking:true with .min gives us control.
                //
                // DISCOVERED: User reported YouTube video at ~1% volume during
                // and AFTER voice input session. Forum posts on Apple Developer
                // Forums (thread/664346, thread/733733) confirm this is a known
                // VPIO behavior with no workaround prior to this API.
                // ============================================================
                let noDuckingConfig = AVAudioVoiceProcessingOtherAudioDuckingConfiguration(
                    enableAdvancedDucking: true,
                    duckingLevel: .min
                )
                audioEngine.inputNode.voiceProcessingOtherAudioDuckingConfiguration = noDuckingConfig
                logError("VPIO ducking configured to minimum (other audio volume preserved)")
            } catch {
                // Non-fatal: If VPIO fails (e.g., on older hardware or
                // certain audio configurations), TTS echo will leak into
                // transcription. The backend's software echo suppression
                // can serve as a degraded fallback.
                logError("WARNING: VPIO failed: \(error.localizedDescription). Echo cancellation will not work for TTS.")
            }
            
            // EXPLICIT MIXER→OUTPUT CONNECTION (2026-02-16):
            // CRITICAL: When VPIO is enabled, the output node's format changes
            // to a VPIO aggregate device format. The auto-connection between
            // mainMixerNode and outputNode may use an incompatible format,
            // causing engine start failure (error -10875). We must explicitly
            // connect with the post-VPIO output format.
            //
            // This matches the confirmed working VPIO test which does:
            //   audioEngine.connect(audioEngine.mainMixerNode,
            //                       to: audioEngine.outputNode,
            //                       format: outputFormat)
            //
            // Without this explicit connection, scheduling audio on the
            // playerNode would fail because the format chain is broken.
            let outputFormat = audioEngine.outputNode.outputFormat(forBus: 0)
            audioEngine.connect(audioEngine.mainMixerNode, to: audioEngine.outputNode, format: outputFormat)
            logError("Connected mainMixer → output with VPIO format: \(outputFormat)")
            
            // CONNECT PLAYERNODE → MIXER (2026-02-16):
            // Route TTS audio through the engine so VPIO can echo-cancel it.
            // format:nil lets AVAudioEngine auto-convert from the .aiff file's
            // format to the engine's native format. This is important because
            // say -o generates files at 22.05kHz/32-bit while the engine may
            // run at 48kHz after VPIO is enabled.
            //
            // The playerNode was already attached in init(). Calling connect()
            // here is safe even if a connection already exists — it just updates.
            audioEngine.connect(playerNode, to: audioEngine.mainMixerNode, format: nil)
            logError("Connected playerNode → mainMixer (TTS audio will route through VPIO)")
            
            // TAP FORMAT FIX (2026-02-16 BUGFIX):
            // ============================================================
            //
            // PROBLEM: With VPIO enabled on the outputNode, the inputNode's
            // outputFormat(forBus: 0) returns a MULTICHANNEL VPIO aggregate
            // device format (e.g., 9 channels). Installing the tap with this
            // format, then trying to convert to mono 16kHz Int16 for the
            // SpeechAnalyzer, caused the audio converter to fail silently or
            // produce garbage — resulting in ZERO transcription results.
            //
            // ROOT CAUSE: The confirmed working VPIO echo cancellation test
            // (1-priority-scripts/CONFIRMED-WORKING-VPIOEchoCancellationTest.swift)
            // explicitly creates a MONO Float32 tap format:
            //   let tapFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
            //       sampleRate: inputFormat.sampleRate, channels: 1, interleaved: false)
            //
            // But main.swift was using inputFormat directly:
            //   inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat)
            //
            // When VPIO changes the input format to multichannel, this broke
            // the entire STT pipeline.
            //
            // FIX: Create an explicit mono Float32 tap format at the input's
            // sample rate. AVAudioEngine handles the downmix from multichannel
            // to mono internally when the tap format differs from the node's
            // output format. The converter then goes from mono Float32 → mono
            // Int16 16kHz, which is a simple rate conversion that works reliably.
            //
            // DISCOVERED: User reported "Didn't capture what I said" — no
            // transcription results at all. Console logs showed no transcription_update
            // events being emitted, confirming the tap/converter chain was broken.
            // ============================================================
            let rawInputFormat = inputNode.outputFormat(forBus: 0)
            logError("Raw inputNode format (may be multichannel with VPIO): \(rawInputFormat)")
            
            // Create explicit mono Float32 tap format matching the confirmed test
            guard let tapFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: rawInputFormat.sampleRate,
                channels: 1,
                interleaved: false
            ) else {
                sendError("Failed to create mono Float32 tap format")
                return
            }
            logError("Tap format (explicit mono Float32): \(tapFormat)")
            
            audioConverter = AVAudioConverter(from: tapFormat, to: analyzerFormat)
            if audioConverter == nil {
                sendError("Failed to create audio converter for SpeechAnalyzer format (tapFormat → analyzerFormat)")
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
            
            inputNode.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) { [weak self] buffer, _ in
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
                    if self.consecutiveSilentFrames <= self.maxConsecutiveSilentFrames {
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
                    
                    // REMOVED (2026-02-08): Single-word flush logic no longer needed
                    // with .fastResults enabled.
                    
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
                    
                    // TRACK LAST TIMESTAMP (2026-02-08):
                    // Record the end time of this buffer so that
                    // resetSpeechAnalyzerSession() can tell the analyzer
                    // "finalize everything through this point" when doing
                    // a lightweight input rotation. Without this, we'd
                    // have to pass nil to finalize(through:) which may
                    // not flush all buffered results.
                    let bufferEndCMTime = CMTime(
                        value: CMTimeValue(self.totalFramesProcessed),
                        timescale: CMTimeScale(self.audioSampleRate)
                    )
                    self.lastAudioTimestamp = bufferEndCMTime
                    
                    // YIELD TO CURRENT CONTINUATION (2026-02-08):
                    // We yield to self.speechAnalyzerInputContinuation
                    // (not the captured `continuation` variable) so that
                    // when resetSpeechAnalyzerSession() swaps the
                    // continuation, subsequent buffers go to the new
                    // stream without restarting the tap.
                    self.speechAnalyzerInputContinuation?.yield(AnalyzerInput(
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
            hasLiveAnalyzerSession = true
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
     * TRANSCRIBER OPTIONS (Updated 2026-02-08 based on demo repository analysis):
     * - transcriptionOptions: [] (default, no special modes)
     * - reportingOptions: [.volatileResults, .fastResults] — CRITICAL FIX
     *   (2026-02-08): Added .fastResults based on SwiftUI_SpeechAnalyzerDemo analysis.
     *   
     *   .volatileResults alone: Provides partial results but batches them (1-4s gaps)
     *   .volatileResults + .fastResults: Streams results word-by-word (200-500ms updates)
     *   
     *   This combination is what enables true real-time streaming. Without .fastResults,
     *   the analyzer waits for "enough confidence" before sending results, causing the
     *   "4-second chunk batch" behavior we've been fighting.
     *   
     *   The demo repository uses .timeIndexedProgressiveTranscription preset which
     *   includes both flags. This is the missing piece that explains why their
     *   implementation streams smoothly while ours was chunky.
     *   
     *   With this fix, we should be able to:
     *   - Reduce silence timers from 4.5s to 0.5-1.0s
     *   - Remove or simplify VAD heartbeat system
     *   - Remove single-word flush mechanism
     *   - Get true word-by-word streaming like SFSpeechRecognizer
     *
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
     *
     * REFERENCE: speechanalyzer-research/BUBBLEVOICE_VS_DEMO_COMPARISON.md
     */
    private func configureSpeechAnalyzerIfNeeded() async throws {
        let transcriber = SpeechTranscriber(
            locale: speechAnalyzerLocale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .fastResults],
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
        
        // ANALYZER OPTIONS (2026-02-08, added based on Apple docs review):
        //
        // priority: .userInitiated — Sets the TaskPriority for analysis work.
        //   Our voice app is real-time and user-facing, so we want high priority
        //   on the Neural Engine and CPU. Without this, analysis work runs at
        //   default priority and can be deprioritized by the system when other
        //   tasks are running (e.g., Spotlight indexing, background updates).
        //   Itsuki's SpeechAnalyzer article confirms this option is available
        //   and recommended for live transcription use cases.
        //
        // modelRetention: .processLifetime — Keeps the neural speech model
        //   loaded in memory for the ENTIRE lifetime of this process, even
        //   after the analyzer is deallocated. This is CRITICAL because:
        //   1) If our lightweight input rotation fallback triggers a full rebuild,
        //      the new analyzer can reuse the cached model instantly (~50ms)
        //      instead of re-loading it from disk (~1-2 seconds).
        //   2) Our Swift helper process is long-lived (singleton, kept alive
        //      between voice sessions). The model should stay warm for the
        //      entire session.
        //   3) Apple docs explicitly say: "To delay or prevent unloading an
        //      analyzer's resources — caching them for later use by a different
        //      analyzer instance — you can select a ModelRetention option."
        //   Without this, model resources are unloaded when the analyzer is
        //   deallocated, causing a cold-start penalty on the next creation.
        //
        // DECIDED BY AI (2026-02-08): Based on Apple documentation review and
        // Itsuki's Level Up Coding article confirming these options. The user's
        // complaint about "chunk batch" behavior traced partly to cold-start
        // model loading — these options ensure the model stays hot.
        let analyzerOptions = SpeechAnalyzer.Options(
            priority: .userInitiated,
            modelRetention: .processLifetime
        )
        let analyzer = SpeechAnalyzer(modules: [transcriber], options: analyzerOptions)
        speechAnalyzer = analyzer
        
        // AUDIO FORMAT SELECTION (2026-02-08, improved based on Apple docs):
        //
        // Apple provides TWO variants of bestAvailableAudioFormat:
        //   1) bestAvailableAudioFormat(compatibleWith:) — simple, no source info
        //   2) bestAvailableAudioFormat(compatibleWith:considering:) — takes the
        //      source audio's natural format into account
        //
        // The `considering:` variant lets the system pick an optimal intermediate
        // format that balances model quality with conversion efficiency. For
        // example, if our mic outputs 48kHz and the model prefers 16kHz, the
        // system might pick an intermediate that minimizes quality loss.
        //
        // Apple docs: "Retrieves the best-quality audio format that the specified
        // modules can work with, taking into account the natural format of the
        // audio and assets installed on the device."
        //
        // We read the mic's native format from AVAudioEngine's inputNode BEFORE
        // Voice Processing IO is enabled (which changes the format). The
        // inputNode.outputFormat(forBus:) is available even before engine.start().
        //
        // DECIDED BY AI (2026-02-08): Using the considering: variant is a direct
        // recommendation from Apple docs and Itsuki's article for better format
        // selection. Falls back to the simple variant if mic format is unavailable.
        let micNativeFormat: AVAudioFormat? = audioEngine?.inputNode.outputFormat(forBus: 0)
        
        let format: AVAudioFormat
        if let micFormat = micNativeFormat {
            guard let selectedFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
                compatibleWith: [transcriber],
                considering: micFormat
            ) else {
                throw NSError(
                    domain: "SpeechAnalyzer",
                    code: -101,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to obtain compatible audio format (with considering:)"]
                )
            }
            format = selectedFormat
            logError("Audio format selected with considering: mic=\(micFormat), selected=\(selectedFormat)")
        } else {
            // Fallback: no mic format available yet (shouldn't happen since
            // audioEngine is created in init, but defensive programming)
            guard let fallbackFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
                throw NSError(
                    domain: "SpeechAnalyzer",
                    code: -101,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to obtain compatible audio format"]
                )
            }
            format = fallbackFormat
            logError("Audio format selected without considering: (mic format unavailable), selected=\(fallbackFormat)")
        }
        speechAnalyzerAudioFormat = format
        
        // PREHEAT ANALYZER (2026-02-08):
        // Proactively load neural model resources so the first volatile
        // result arrives faster. Without this, the first result from a
        // cold analyzer can take ~1-2 seconds. With preheating, the model
        // is already loaded and ready to process audio immediately.
        //
        // From Itsuki's SpeechAnalyzer article:
        // "To proactively load system resources and 'preheat' the analyzer,
        //  we can call prepareToAnalyze(in:) after setting the modules.
        //  This may improve how quickly the modules return their first results."
        //
        // We pass nil for progressReadyHandler because we don't need progress
        // updates — we just want the model loaded.
        do {
            try await analyzer.prepareToAnalyze(in: format, withProgressReadyHandler: nil)
            logError("Analyzer preheated successfully — neural model loaded and ready")
        } catch {
            // Non-fatal: The analyzer will still work, just with slightly
            // slower first results. This can fail if resources are constrained.
            logError("Analyzer preheat failed (non-fatal): \(error.localizedDescription)")
        }
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
                    // DEBUG (2026-02-08): Log raw result to diagnose period-only issue
                    self.logError("🔍 RAW RESULT: isFinal=\(result.isFinal), text.characters.count=\(result.text.characters.count)")
                    self.logError("🔍 RAW TEXT: '\(result.text)'")
                    
                    let text = String(result.text.characters)
                    self.logError("🔍 EXTRACTED TEXT: '\(text)'")
                    
                    // REMOVED (2026-02-08): Flush tracking no longer needed
                    
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
     * Creates a clean transcription boundary for a new conversational turn.
     *
     * CALLED BY: "reset_recognition" command from backend at key lifecycle points:
     *   1) After AI finishes speaking (speech_ended)
     *   2) After an interruption is detected
     *   3) After the timer cascade completes (turn boundary)
     *
     * ============================================================
     * 2026-02-08 CRITICAL REWRITE — "LIGHTWEIGHT INPUT ROTATION"
     * ============================================================
     *
     * PREVIOUS BEHAVIOR (BUG):
     * Every reset called finalizeAndFinishThroughEndOfInput() which
     * PERMANENTLY KILLED the analyzer, then recreated the entire
     * pipeline from scratch (new transcriber, new analyzer, new audio
     * converter, restart audio engine, reinstall tap). This took ~2-4
     * seconds and caused the "4-second chunk batch" perception because
     * the neural model had to cold-start every time.
     *
     * NEW BEHAVIOR (FIX):
     * We keep the analyzer, transcriber, audio engine, audio tap, and
     * converter ALL alive. We only:
     *   1) Finish the current input stream (continuation.finish())
     *   2) Finalize the current input (analyzer.finalize(through:))
     *   3) Create a NEW AsyncStream
     *   4) Start the analyzer on the new stream (analyzer.start())
     *
     * This takes ~50ms instead of ~2-4 seconds. The neural model stays
     * warm, volatile results continue streaming word-by-word, and we
     * eliminate the dead zone between turns where no transcription
     * happened.
     *
     * FALLBACK: If the lightweight rotation fails for any reason, we
     * fall back to the old full-rebuild approach. This ensures we
     * never get stuck in a broken state.
     *
     * WHY THIS WORKS:
     * Apple's SpeechAnalyzer docs (confirmed by Itsuki's deep-dive
     * article) state that finalize(through:) finalizes the CURRENT
     * INPUT but keeps the session alive. After finalization, you can
     * call start(inputSequence:) again with new audio. The module's
     * results stream continues to work across input rotations.
     */
    private func resetSpeechAnalyzerSession() async {
        // SERIALIZATION CHECK:
        // Multiple resets can arrive within milliseconds (interruption + echo
        // + speech_ended). Prevent concurrent rotation races.
        guard !isResetting else {
            logError("Reset already in progress — skipping duplicate reset request")
            return
        }
        isResetting = true
        
        // LIGHTWEIGHT ROTATION PATH (2026-02-08):
        // If we have a live analyzer session, use the fast path that keeps
        // everything alive and just rotates the input stream.
        if hasLiveAnalyzerSession,
           let analyzer = speechAnalyzer,
           speechTranscriber != nil {
            
            logError("🔄 Lightweight input rotation — keeping analyzer warm")
            
            do {
                // Step 1: Close the current input stream.
                // This tells the analyzer "no more audio from this stream."
                // The audio tap keeps running but yields are temporarily
                // going to a nil continuation (harmless — they're just dropped).
                let oldContinuation = speechAnalyzerInputContinuation
                speechAnalyzerInputContinuation = nil  // Temporarily nil so tap drops buffers
                oldContinuation?.finish()
                
                // Step 2: Finalize the current input.
                // This tells the analyzer "process and emit final results for
                // everything you received so far." The session stays alive.
                //
                // UPDATED (2026-02-08): Use nil instead of lastAudioTimestamp.
                // The demo repository uses finalize(through: nil) which means
                // "finalize everything received so far." Using a timestamp can
                // cause incomplete finalization if:
                // - The timestamp is slightly behind the actual last buffer
                // - There's a race condition in timestamp tracking
                // - The analyzer has buffered audio beyond that timestamp
                //
                // With nil, the analyzer finalizes all buffered input, which is
                // what we want when rotating to a new turn.
                try await analyzer.finalize(through: nil)
                logError("✅ Finalized current input — analyzer session still alive")
                
                // Step 3: Reset tracking state for the new turn.
                // We keep totalFramesProcessed because the audio engine and
                // tap are still running — the timeline is continuous.
                consecutiveSilentFrames = 0
                
                // Step 4: Create a new input stream for the next turn.
                let (newStream, newContinuation) = AsyncStream<AnalyzerInput>.makeStream()
                speechAnalyzerInputContinuation = newContinuation
                
                // Step 5: Start the analyzer on the new input stream.
                // The module's results stream (transcriber.results) continues
                // working — the existing result consumption task picks up
                // results from the new input seamlessly.
                try await analyzer.start(inputSequence: newStream)
                
                logError("✅ Input rotation complete — analyzer ready for new turn (~50ms)")
                isResetting = false
                return
                
            } catch {
                // Lightweight rotation failed — fall back to full rebuild.
                // This should be rare but handles edge cases like the analyzer
                // being in an unexpected state after a crash or timeout.
                logError("⚠️ Lightweight rotation failed: \(error.localizedDescription) — falling back to full rebuild")
                hasLiveAnalyzerSession = false
                // Fall through to the full rebuild path below
            }
        }
        
        // FULL REBUILD PATH (FALLBACK):
        // Used on the first start, or if lightweight rotation fails.
        // This is the old behavior — destroy everything and start fresh.
        // It's slow (~2-4 seconds) but guaranteed to work.
        logError("🔧 Full rebuild path — destroying and recreating pipeline")
        
        await stopListeningAsync()
        
        // STABILIZATION DELAY:
        // Only needed for full rebuild because we're stopping/starting
        // the audio engine. Not needed for lightweight rotation.
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
        
        // DISABLE VPIO TO RESTORE SYSTEM AUDIO (2026-02-16 BUGFIX):
        // ============================================================
        //
        // CRITICAL: When VPIO is enabled, macOS ducks all other system audio.
        // Even after audioEngine.stop(), the VPIO state persists on the engine's
        // audio unit, keeping the ducking active. The user reported that YouTube
        // stayed at ~1% volume even after stopping voice input, only recovering
        // after quitting the entire app.
        //
        // FIX: Explicitly disable VPIO when stopping listening. This releases
        // the VPIO aggregate device and restores normal audio routing, allowing
        // other apps' audio to return to full volume immediately.
        //
        // We re-enable VPIO in startListeningInternal() when the user starts
        // a new voice session, so this is safe. The cost is that VPIO setup
        // happens each time listening starts (~10ms), which is negligible.
        // ============================================================
        if let engine = audioEngine {
            do {
                try engine.outputNode.setVoiceProcessingEnabled(false)
                logError("VPIO disabled on outputNode (system audio volume restored)")
            } catch {
                logError("WARNING: Failed to disable VPIO: \(error.localizedDescription)")
            }
        }
        
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
        
        isListening = false
        hasLiveAnalyzerSession = false
        lastAudioTimestamp = .zero
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
        
        // DISABLE VPIO TO RESTORE SYSTEM AUDIO (2026-02-16 BUGFIX):
        // Same fix as stopListeningAsync() — disable VPIO so other apps'
        // audio is no longer ducked. See the async version for full explanation
        // of the bug (YouTube at ~1% volume after stopping voice input).
        if let engine = audioEngine {
            do {
                try engine.outputNode.setVoiceProcessingEnabled(false)
                logError("VPIO disabled on outputNode (system audio volume restored)")
            } catch {
                logError("WARNING: Failed to disable VPIO: \(error.localizedDescription)")
            }
        }
        
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
        
        isListening = false
        hasLiveAnalyzerSession = false
        lastAudioTimestamp = .zero
        logError("Stopped listening (SpeechAnalyzer session finalized)")
    }
    
    // ============================================================
    // TTS PIPELINE: CHUNKED SAY -O → AVAUDIOPLAYERNODE
    // ============================================================
    //
    // This section implements the TTS pipeline that routes audio through
    // AVAudioEngine for VPIO echo cancellation. The pipeline:
    //
    // 1. Splits text into sentence-level chunks (min 7 words per chunk)
    // 2. For each chunk, generates an .aiff file via `say -o`
    // 3. Schedules the file on AVAudioPlayerNode for playback
    // 4. Pipelines: generates chunk N+1 while chunk N is playing
    //
    // This replaces the old `say "text"` direct approach which bypassed
    // the engine and broke echo cancellation.
    //
    // DESIGN REFERENCE:
    // - Architecture: 1-priority-documents/WebRTC-Echo-Cancellation-Architecture.md
    // - Confirmed test: 1-priority-scripts/CONFIRMED-WORKING-VPIOEchoCancellationTest.swift
    // - Chunking rules: min 7 words per chunk to avoid generation-time > play-time gaps
    // - Latency: ~1s for first chunk, then continuous (175% pipeline efficiency)
    // ============================================================
    
    /**
     * SPEAK — CHUNKED TTS THROUGH AVAUDIOENGINE
     *
     * Generates TTS audio as .aiff files and plays them through AVAudioPlayerNode
     * on the same AVAudioEngine where VPIO is enabled. This ensures hardware echo
     * cancellation works — the AI's voice is subtracted from the mic input.
     *
     * PIPELINE FLOW:
     *   1. Split text into sentence chunks (min 7 words each)
     *   2. Generate chunk 0 as .aiff file (~1s, user waits here)
     *   3. Schedule chunk 0 on playerNode → starts playing immediately
     *   4. While chunk 0 plays, generate chunk 1 as .aiff file
     *   5. Schedule chunk 1 → auto-queued after chunk 0 finishes
     *   6. Continue until all chunks are generated and played
     *
     * INTERRUPTION:
     *   If user speaks 2+ words during playback, the backend calls stop_speaking.
     *   stopSpeaking() kills the say process, stops playerNode, cancels the task.
     *   The audio engine stays running (mic tap continues).
     *
     * CALLED BY: handleCommand() when "speak" command arrives from backend.
     * DEPENDS ON: audioEngine must be running (startListeningInternal was called).
     *   If engine is not running, falls back to direct say (degraded, no AEC).
     *
     * @param text: Full text to speak (will be chunked into sentences)
     * @param voice: macOS voice name (e.g., "Samantha"), nil for system default
     * @param rate: Speech rate in words per minute (default: 200)
     */
    func speak(text: String, voice: String? = nil, rate: Int = 200) {
        // Stop any current speech first (handles rapid speak commands)
        stopSpeaking()
        
        isSpeaking = true
        isTTSCancelled = false
        sendResponse(type: "speech_started", data: nil)
        logError("TTS pipeline starting for text: \"\(text.prefix(80))...\"")
        
        // Split text into sentence-level chunks with minimum word count.
        // Short sentences are batched together because the say command has
        // ~900ms fixed overhead per file, which exceeds audio duration for
        // short phrases and causes audible gaps between chunks.
        let chunks = splitTextIntoSpeechChunks(text: text)
        logError("TTS split into \(chunks.count) chunk(s)")
        
        if chunks.isEmpty {
            isSpeaking = false
            sendResponse(type: "speech_ended", data: nil)
            return
        }
        
        // Check if audio engine is running (required for playerNode playback).
        // The engine should be running because speak is always called during
        // an active voice session (after startListening). But if somehow it's
        // not running, we fall back to direct say (no echo cancellation).
        guard let engine = audioEngine, engine.isRunning else {
            logError("WARNING: Audio engine not running — falling back to direct say (no AEC)")
            speakDirectFallback(text: text, voice: voice, rate: rate)
            return
        }
        
        // Launch the async TTS pipeline.
        // This Task generates .aiff files and schedules them on playerNode.
        // The generate→schedule loop is the pipeline: chunk N+1 generates
        // while chunk N plays through the engine.
        ttsGenerationTask = Task { [weak self] in
            guard let self = self else { return }
            
            var isFirstChunk = true
            var tempFiles: [URL] = []
            
            for (index, chunkText) in chunks.enumerated() {
                // Check cancellation before each chunk (user may have interrupted)
                guard !self.isTTSCancelled else {
                    self.logError("TTS cancelled before chunk \(index)")
                    break
                }
                
                // GENERATE: Run `say -o /tmp/bv_tts_chunk_N.aiff "text"` (~1s)
                // This is the only blocking step. For the first chunk, the user
                // waits ~1s. For subsequent chunks, this runs in parallel with
                // the previous chunk's playback (pipeline overlap).
                guard let fileURL = await self.generateChunkAudioFile(
                    text: chunkText,
                    chunkIndex: index,
                    voice: voice,
                    rate: rate
                ) else {
                    self.logError("Chunk \(index) generation failed, skipping")
                    continue
                }
                
                tempFiles.append(fileURL)
                
                // Check cancellation after generation (user may have spoken during say -o)
                guard !self.isTTSCancelled else {
                    self.logError("TTS cancelled after chunk \(index) generation")
                    break
                }
                
                // SCHEDULE: Add the audio file to playerNode's playback queue.
                // This is instant — the file is buffered into memory and queued.
                // If the node is already playing, the new file plays after the
                // current one finishes. If this is the first chunk, we call play().
                do {
                    let audioFile = try AVAudioFile(forReading: fileURL)
                    // IMPORTANT: We use the completion-handler overload with nil
                    // instead of the async version. The async version (`await
                    // scheduleFile`) blocks until the audio buffer is consumed
                    // from the schedule queue (effectively waiting for playback).
                    // This would KILL pipelining because we couldn't generate
                    // chunk N+1 while chunk N is playing.
                    //
                    // The non-async version with nil handler is INSTANT — it
                    // just buffers the audio data into memory and adds it to
                    // the playerNode's playback queue. This is what enables
                    // the pipeline: generate N+1 while N plays from queue.
                    self.playerNode.scheduleFile(audioFile, at: nil, completionHandler: nil)
                    
                    if isFirstChunk {
                        self.playerNode.play()
                        isFirstChunk = false
                        self.logError("TTS playback started (chunk 0)")
                    }
                    
                    self.logError("Scheduled chunk \(index)/\(chunks.count - 1) " +
                                  "(\(chunkText.split(separator: " ").count) words): " +
                                  "\"\(chunkText.prefix(60))\"")
                } catch {
                    self.logError("Failed to schedule chunk \(index): \(error.localizedDescription)")
                }
            }
            
            // WAIT FOR PLAYBACK TO FINISH:
            // All chunks are generated and scheduled. Now poll playerNode.isPlaying
            // until all audio has played through the engine. We poll every 100ms
            // which is fine — this is a background task and doesn't block anything.
            //
            // WHY POLLING: AVAudioPlayerNode doesn't have an async "wait for done"
            // API. The scheduleFile completion handler fires when the file is
            // consumed (not necessarily when audio finishes playing due to buffering).
            // Polling isPlaying is the reliable way to detect when all audio is done.
            while self.playerNode.isPlaying && !self.isTTSCancelled {
                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }
            
            // CLEANUP: Remove temporary .aiff files from /tmp
            for url in tempFiles {
                try? FileManager.default.removeItem(at: url)
            }
            
            // SIGNAL TTS COMPLETE:
            // Dispatch to main to match the threading model of other state changes.
            // Only send speech_ended if we're still marked as speaking (stopSpeaking
            // may have already sent it during an interruption).
            DispatchQueue.main.async {
                if self.isSpeaking {
                    self.isSpeaking = false
                    self.logError("TTS pipeline complete — all chunks played")
                    self.sendResponse(type: "speech_ended", data: nil)
                }
            }
        }
    }
    
    /**
     * GENERATE CHUNK AUDIO FILE
     *
     * Runs `say -o /tmp/bv_tts_chunk_N.aiff "text"` to generate an audio file
     * for one chunk of TTS text. This is an async wrapper that doesn't block
     * the Swift cooperative thread pool.
     *
     * LATENCY (tested on M4 Max):
     *   - 1 word: ~900ms generation, ~450ms audio
     *   - 5 words: ~1000ms generation, ~1400ms audio
     *   - 25 words: ~1400ms generation, ~5200ms audio
     *   - 70 words: ~2800ms generation, ~19000ms audio
     *
     * For sentences ≥7 words, generation time < audio duration, so the pipeline
     * can generate the next chunk while the current one plays (no gaps).
     *
     * @param text: The text for this chunk
     * @param chunkIndex: Index used for temp file naming
     * @param voice: macOS voice name (nil for system default)
     * @param rate: Speech rate in WPM
     * @returns: URL of the generated .aiff file, or nil if generation failed
     */
    private func generateChunkAudioFile(text: String, chunkIndex: Int, voice: String?, rate: Int) async -> URL? {
        let fileURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("bv_tts_chunk_\(chunkIndex).aiff")
        
        // Clean up any leftover file from a previous session
        try? FileManager.default.removeItem(at: fileURL)
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        
        var args = ["-o", fileURL.path]
        if let voice = voice { args += ["-v", voice] }
        args += ["-r", "\(rate)", text]
        process.arguments = args
        
        // Store reference so stopSpeaking() can kill it mid-generation
        self.currentSayProcess = process
        
        // Run asynchronously using terminationHandler + continuation.
        // This avoids blocking the cooperative thread pool (which
        // process.waitUntilExit() would do in an async context).
        let success: Bool = await withCheckedContinuation { continuation in
            process.terminationHandler = { proc in
                continuation.resume(returning: proc.terminationStatus == 0)
            }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: false)
            }
        }
        
        self.currentSayProcess = nil
        
        guard success, FileManager.default.fileExists(atPath: fileURL.path) else {
            logError("say -o failed for chunk \(chunkIndex)")
            return nil
        }
        
        return fileURL
    }
    
    /**
     * SPLIT TEXT INTO SPEECH CHUNKS
     *
     * Splits LLM response text into sentence-level chunks suitable for the
     * TTS pipeline. The chunking algorithm batches short sentences together
     * to meet a minimum word count per chunk.
     *
     * WHY 7 WORDS MINIMUM:
     * The `say -o` command has ~900ms fixed overhead per file generation.
     * For sentences <7 words, generation time exceeds audio duration:
     *   - "Yes." (1 word): 900ms gen > 450ms audio = audible gap
     *   - "I understand." (2 words): 950ms gen > 700ms audio = gap
     *   - "Let me explain the key concepts." (6 words): 1000ms gen < 1400ms audio = OK
     *
     * By batching short sentences (< 7 words) with their neighbors, we ensure
     * every chunk has enough audio duration to overlap with the next chunk's
     * generation time, giving gap-free continuous speech.
     *
     * ALGORITHM:
     *   1. Split by sentence boundaries: /[.!?]+\s+/
     *   2. If sentence < 7 words: add to buffer
     *   3. If sentence ≥ 7 words: flush buffer (if any), then this is its own chunk
     *   4. When buffer ≥ 7 words total: flush as one chunk
     *   5. If entire text < 7 words: single chunk (don't split)
     *   6. Remainder in buffer at end: flush as final chunk
     *
     * REFERENCE: 1-priority-documents/WebRTC-Echo-Cancellation-Architecture.md
     *
     * @param text: Full LLM response text
     * @returns: Array of text chunks, each ≥7 words (except possibly the last)
     */
    private func splitTextIntoSpeechChunks(text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        
        // If entire text is short, don't split at all
        let totalWords = trimmed.split(separator: " ").count
        if totalWords < 7 {
            return [trimmed]
        }
        
        // Split by sentence boundaries (period, exclamation, question mark followed by space)
        // We use a regex-like approach: split on punctuation + whitespace boundaries
        let sentencePattern = try! NSRegularExpression(pattern: "(?<=[.!?])\\s+", options: [])
        let range = NSRange(trimmed.startIndex..., in: trimmed)
        var sentences: [String] = []
        var lastEnd = trimmed.startIndex
        
        sentencePattern.enumerateMatches(in: trimmed, options: [], range: range) { match, _, _ in
            guard let match = match else { return }
            let matchRange = Range(match.range, in: trimmed)!
            let sentence = String(trimmed[lastEnd..<matchRange.lowerBound])
            if !sentence.trimmingCharacters(in: .whitespaces).isEmpty {
                sentences.append(sentence.trimmingCharacters(in: .whitespaces))
            }
            lastEnd = matchRange.upperBound
        }
        
        // Don't forget the remainder after the last sentence boundary
        let remainder = String(trimmed[lastEnd...]).trimmingCharacters(in: .whitespaces)
        if !remainder.isEmpty {
            sentences.append(remainder)
        }
        
        // If splitting produced nothing or just one sentence, return as single chunk
        if sentences.count <= 1 {
            return [trimmed]
        }
        
        // Batch short sentences together to meet the 7-word minimum
        let minWordsPerChunk = 7
        var chunks: [String] = []
        var buffer: [String] = []
        var bufferWordCount = 0
        
        for sentence in sentences {
            let sentenceWordCount = sentence.split(separator: " ").count
            
            if sentenceWordCount >= minWordsPerChunk {
                // This sentence is long enough on its own.
                // First, flush any buffered short sentences as a chunk.
                if !buffer.isEmpty {
                    chunks.append(buffer.joined(separator: " "))
                    buffer.removeAll()
                    bufferWordCount = 0
                }
                // Then add this sentence as its own chunk.
                chunks.append(sentence)
            } else {
                // Short sentence — add to buffer
                buffer.append(sentence)
                bufferWordCount += sentenceWordCount
                
                // Flush buffer if it's reached the minimum
                if bufferWordCount >= minWordsPerChunk {
                    chunks.append(buffer.joined(separator: " "))
                    buffer.removeAll()
                    bufferWordCount = 0
                }
            }
        }
        
        // Flush any remaining buffered sentences
        if !buffer.isEmpty {
            chunks.append(buffer.joined(separator: " "))
        }
        
        return chunks
    }
    
    /**
     * SPEAK DIRECT FALLBACK
     *
     * Fallback TTS that runs `say` directly (no AVAudioEngine routing).
     * Used ONLY when the audio engine is not running, which shouldn't happen
     * in normal operation but handles edge cases gracefully.
     *
     * WARNING: This bypasses VPIO echo cancellation. The AI's voice WILL
     * leak into the microphone and SpeechAnalyzer will transcribe it.
     * The backend's software echo suppression would need to handle this.
     *
     * @param text: Text to speak
     * @param voice: macOS voice name (nil for default)
     * @param rate: Speech rate in WPM
     */
    private func speakDirectFallback(text: String, voice: String? = nil, rate: Int = 200) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        
        var arguments = [String]()
        if let voice = voice {
            arguments.append(contentsOf: ["-v", voice])
        }
        arguments.append(contentsOf: ["-r", "\(rate)"])
        arguments.append(text)
        process.arguments = arguments
        
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if self.isSpeaking {
                    self.isSpeaking = false
                    self.logError("Speech ended (direct fallback)")
                    self.sendResponse(type: "speech_ended", data: nil)
                }
            }
        }
        
        do {
            currentSayProcess = process
            try process.run()
            logError("Started speaking (direct fallback, NO echo cancellation)")
        } catch {
            isSpeaking = false
            currentSayProcess = nil
            sendError("Failed to start speech: \(error.localizedDescription)")
        }
    }
    
    /**
     * STOP SPEAKING
     *
     * Immediately stops all TTS playback and generation. Called when:
     *   1. User interrupts (backend detects 2+ words during TTS)
     *   2. Backend explicitly stops speech
     *   3. New speak command arrives (speak() calls this first)
     *
     * STOPS THREE THINGS:
     *   1. playerNode playback (immediate audio silence)
     *   2. Running say -o process (kills file generation mid-flight)
     *   3. TTS pipeline task (prevents scheduling of remaining chunks)
     *
     * DOES NOT stop the audio engine — the mic tap continues running
     * so SpeechAnalyzer can transcribe the user's interrupting speech.
     */
    func stopSpeaking() {
        // Set cancellation flag FIRST — the pipeline task checks this
        // between every chunk generation and schedule operation
        isTTSCancelled = true
        
        // Stop playerNode playback immediately (audio goes silent)
        // reset() stops playback AND clears the schedule queue
        playerNode.stop()
        playerNode.reset()
        
        // Kill any running say -o process (file generation may be in progress)
        if let process = currentSayProcess, process.isRunning {
            process.terminate()
            logError("Killed say -o process during interruption")
        }
        currentSayProcess = nil
        
        // Cancel the pipeline task (it may be between chunks or awaiting)
        ttsGenerationTask?.cancel()
        ttsGenerationTask = nil
        
        // Update state and notify backend
        if isSpeaking {
            isSpeaking = false
            logError("Stopped speaking (all TTS cancelled)")
            sendResponse(type: "speech_ended", data: nil)
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
            
        case "cancel_old_audio":
            // INTERRUPTION OPTIMIZATION (2026-02-08, added based on Apple docs):
            //
            // Apple provides `cancelAnalysis(before:)` which tells the analyzer:
            // "Stop processing any audio that came before this timestamp."
            //
            // This is useful during INTERRUPTIONS: when the user starts speaking
            // over the AI, the audio from before the interruption is irrelevant
            // (it's just the AI's voice being echoed back). Instead of waiting
            // for the analyzer to finalize that old audio (which we'd discard
            // anyway), we cancel it immediately.
            //
            // From Apple docs: "Stops analyzing audio predating the given time."
            //
            // The backend sends this command with the approximate timestamp
            // of when the interruption was detected, so the analyzer skips
            // processing everything before that point and focuses on the
            // user's new speech.
            //
            // PRODUCT IMPACT: Faster interruption response. Instead of waiting
            // ~200ms for old audio to finalize (only to throw it away), the
            // analyzer immediately shifts focus to new audio.
            //
            // DECIDED BY AI (2026-02-08): Based on Apple docs review showing
            // cancelAnalysis(before:) exists specifically for this use case.
            logError("Received cancel_old_audio command — cancelling stale audio processing")
            if isListening, let analyzer = speechAnalyzer {
                Task { [weak self] in
                    guard let self = self else { return }
                    // Cancel all audio analysis before the current timestamp.
                    // This frees up the Neural Engine to process the user's
                    // new interrupting speech immediately.
                    let cancelBefore = self.lastAudioTimestamp
                    // NOTE: cancelAnalysis(before:) is non-throwing per the
                    // current API (macOS 26.1). If Apple changes this in a
                    // future release, we should add do/catch back.
                    await analyzer.cancelAnalysis(before: cancelBefore)
                    self.logError("✅ Cancelled analysis before \(cancelBefore.seconds)s — analyzer freed for new speech")
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

// ============================================================
// DEV MODE: Diagnostic Test
// ============================================================
// Set DEV_MODE_TEST environment variable to run diagnostic tests at startup
// Usage: DEV_MODE_TEST=1 ./BubbleVoiceSpeech
if ProcessInfo.processInfo.environment["DEV_MODE_TEST"] == "1" {
    helper.logError("🧪 DEV MODE: Running diagnostic tests...")
    helper.logError("🧪 This will test if SpeechAnalyzer produces transcription results")
    helper.logError("")
    
    Task {
        // Use the public command interface
        helper.logError("🧪 Sending start_listening command...")
        helper.handleCommand(Command(type: "start_listening", data: nil))
        
        // Wait for initialization
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        
        helper.logError("")
        helper.logError("🎤 MICROPHONE IS NOW LISTENING FOR 15 SECONDS")
        helper.logError("🎤 SPEAK INTO YOUR MICROPHONE NOW!")
        helper.logError("🎤 Say: 'Hello world this is a test'")
        helper.logError("")
        
        // Monitor for 15 seconds
        for i in 1...15 {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if i % 3 == 0 {
                helper.logError("⏱️  \(i) seconds elapsed...")
            }
        }
        
        helper.logError("")
        helper.logError("🧪 Test complete. Stopping...")
        helper.handleCommand(Command(type: "stop_listening", data: nil))
        
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        
        helper.logError("")
        helper.logError("============================================================")
        helper.logError("🧪 DIAGNOSTIC RESULTS:")
        helper.logError("============================================================")
        helper.logError("")
        helper.logError("Look at the output above for 'transcription_update' messages.")
        helper.logError("")
        helper.logError("✅ WORKING: You should see multiple transcription_update messages")
        helper.logError("   with the text you spoke.")
        helper.logError("")
        helper.logError("❌ BROKEN: If you see ZERO transcription_update messages,")
        helper.logError("   the SpeechAnalyzer is not producing results.")
        helper.logError("")
        helper.logError("You should also see 'vad_speech_active' heartbeats every 500ms")
        helper.logError("while you were speaking (this proves audio is flowing).")
        helper.logError("")
        helper.logError("============================================================")
        helper.logError("")
        
        // Exit dev mode
        helper.logError("🧪 DEV MODE: Exiting in 2 seconds...")
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        exit(0)
    }
}

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
