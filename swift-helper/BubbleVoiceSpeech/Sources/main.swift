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
    
    // NOTE: All legacy restart / hang detection logic has been removed
    // because SpeechAnalyzer manages its own session lifecycle. This is
    // a core product bet: we trade complex home-grown recovery logic for
    // the stability of Apple's current, supported pipeline.
    
    init() {
        // Initialize audio engine only; SpeechAnalyzer is configured on demand.
        self.audioEngine = AVAudioEngine()
        
        // Send ready signal (no permission prompt here).
        requestAuthorization()
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
            
            inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
                guard let self = self else { return }
                do {
                    let converted = try self.convertBufferForAnalyzer(buffer, targetFormat: analyzerFormat)
                    continuation.yield(AnalyzerInput(buffer: converted, bufferStartTime: nil))
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
     * TRANSCRIBER OPTIONS:
     * - transcriptionOptions: [] (default, no special modes)
     * - reportingOptions: [.volatileResults] — gives us real-time partial
     *   results that update progressively as the user speaks
     * - attributeOptions: [] — we don't need confidence scores or timing
     *   since the Node.js backend handles turn detection via timers
     */
    private func configureSpeechAnalyzerIfNeeded() async throws {
        let transcriber = SpeechTranscriber(
            locale: speechAnalyzerLocale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        speechTranscriber = transcriber
        
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
     */
    private func startSpeechAnalyzerResultTask(transcriber: SpeechTranscriber) {
        speechAnalyzerTask?.cancel()
        speechAnalyzerTask = Task { [weak self] in
            guard let self = self else { return }
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    self.sendTranscription(text: text, isFinal: result.isFinal)
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
    
    private func resetSpeechAnalyzerSession() async {
        // WHY: We want a clean transcription boundary after AI speech or interruptions.
        // This mirrors the old "restart recognition" behavior but uses the new
        // SpeechAnalyzer pipeline: stop everything, then start fresh.
        stopListening()
        await startListeningInternal()
    }
    
    /**
     * STOP LISTENING
     * 
     * Stops speech recognition and cleans up resources.
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
        if let analyzer = speechAnalyzer {
            Task {
                try? await analyzer.finalizeAndFinishThroughEndOfInput()
            }
        }
        
        speechAnalyzer = nil
        speechTranscriber = nil
        speechAnalyzerAudioFormat = nil
        audioConverter = nil
        
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
