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
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
                        self.logError("Recognition task cancelled (normal)")
                        return
                    }
                    
                    self.sendError("Recognition error: \(error.localizedDescription)")
                    self.stopListening()
                    return
                }
                
                if let result = result {
                    let transcription = result.bestTranscription.formattedString
                    let isFinal = result.isFinal
                    
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
            
        } catch {
            sendError("Failed to start listening: \(error.localizedDescription)")
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
    private func restartRecognition() {
        guard isListening else { return }
        guard let audioEngine = audioEngine else { return }
        
        logError("Restarting recognition task for continuous listening")
        
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
            
            // Create a new recognition request
            self.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest = self.recognitionRequest,
                  let speechRecognizer = self.speechRecognizer else {
                self.sendError("Failed to create new recognition request")
                return
            }
            
            recognitionRequest.shouldReportPartialResults = true
            
            // Start a new recognition task
            self.recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
                guard let self = self else { return }
                
                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 216 {
                        self.logError("Recognition task cancelled (normal)")
                        return
                    }
                    
                    self.sendError("Recognition error: \(error.localizedDescription)")
                    self.stopListening()
                    return
                }
                
                if let result = result {
                    let transcription = result.bestTranscription.formattedString
                    let isFinal = result.isFinal
                    
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
            
            self.logError("Audio tap reinstalled with new recognition request after flush delay")
        }
    }
    
    /**
     * STOP LISTENING
     * 
     * Stops speech recognition and cleans up resources.
     */
    func stopListening() {
        guard isListening else { return }
        
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        
        isListening = false
        logError("Stopped listening")
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
            // This is called by the backend after the AI finishes speaking
            // to ensure a fresh transcription session for the next user utterance
            logError("Received reset_recognition command")
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
