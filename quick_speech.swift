
import Foundation
import Speech
import AVFoundation
import CoreMedia

// Disable buffering
setbuf(stdout, nil)
setbuf(stderr, nil)

print("Process started.")

// Simplified Speech Helper for quick testing
@available(macOS 26.0, *)
final class QuickSpeechHelper: @unchecked Sendable {
    private var speechAnalyzer: SpeechAnalyzer?
    private var speechTranscriber: SpeechTranscriber?
    private var audioEngine: AVAudioEngine?
    private var audioConverter: AVAudioConverter?
    private var speechAnalyzerInputContinuation: AsyncStream<AnalyzerInput>.Continuation?
    private var speechAnalyzerTask: Task<Void, Error>?
    
    // Use en-US locale
    private var locale = Locale(identifier: "en-US")
    
    init() {
        print("Initializing AVAudioEngine...")
        audioEngine = AVAudioEngine()
        print("AVAudioEngine initialized.")
    }
    
    func start() async {
        // STEP 1: Request microphone permission first
        print("🎤 Requesting microphone access...")
        let micPermission = await requestMicrophonePermission()
        
        if !micPermission {
            print("❌ ERROR: Microphone permission denied!")
            print("")
            print("To fix this:")
            print("1. Go to System Settings → Privacy & Security → Microphone")
            print("2. Enable microphone access for 'swift-frontend' or your terminal app")
            print("3. Run this script again")
            print("")
            exit(1)
        }
        
        print("✅ Microphone access granted")
        
        // STEP 2: Request speech recognition permission
        print("🗣️  Requesting speech recognition authorization...")
        let authStatus = await requestSpeechAuthorization()
        
        if authStatus != .authorized {
            print("❌ ERROR: Speech recognition not authorized: \(authStatus)")
            print("")
            print("To fix this:")
            print("1. Go to System Settings → Privacy & Security → Speech Recognition")
            print("2. Enable speech recognition for 'swift-frontend' or your terminal app")
            print("3. Run this script again")
            print("")
            exit(1)
        }
        
        print("✅ Speech recognition authorized")
        
        // STEP 3: Configure and start
        print("⚙️  Configuring Speech Analyzer...")
        do {
            try await configureAnalyzer()
            try await startListening()
            print("")
            print("🎙️  LISTENING... Speak into the microphone.")
            print("   Press Ctrl+C to stop.")
            print("")
            
            // Keep running
            while true {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        } catch {
            print("❌ Error: \(error)")
            exit(1)
        }
    }
    
    // Request microphone permission by trying to access the audio engine
    // On macOS, there's no explicit API to request permission - it's triggered
    // automatically when you try to access the microphone. The system will show
    // a dialog if permission hasn't been granted yet.
    private func requestMicrophonePermission() async -> Bool {
        // On macOS, we check if we can access the input node
        // If permission is denied, accessing it will fail
        guard let engine = audioEngine else { return false }
        
        do {
            let inputNode = engine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            
            // If we can get the format, we have permission
            if format.sampleRate > 0 {
                return true
            }
            return false
        } catch {
            print("Microphone access check failed: \(error)")
            return false
        }
    }
    
    // Request speech recognition authorization
    private func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }
    
    private func configureAnalyzer() async throws {
        print("Creating transcriber...")
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults], // Real-time results
            attributeOptions: []
        )
        self.speechTranscriber = transcriber
        
        // Check assets
        print("Checking assets for \(locale.identifier)...")
        let isInstalled = await SpeechTranscriber.installedLocales.contains { $0.identifier(.bcp47) == locale.identifier(.bcp47) }
        
        if !isInstalled {
            print("Downloading assets...")
            if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                try await request.downloadAndInstall()
                print("Assets installed.")
            }
        } else {
            print("Assets already installed.")
        }
        
        let analyzerOptions = SpeechAnalyzer.Options(
            priority: .userInitiated,
            modelRetention: .processLifetime
        )
        
        print("Creating SpeechAnalyzer...")
        self.speechAnalyzer = SpeechAnalyzer(modules: [transcriber], options: analyzerOptions)
        print("SpeechAnalyzer created.")
    }
    
    private func startListening() async throws {
        guard let audioEngine = audioEngine,
              let analyzer = speechAnalyzer,
              let transcriber = speechTranscriber else {
            throw NSError(domain: "QuickSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not configured"])
        }
        
        print("Getting input node...")
        let inputNode = audioEngine.inputNode
        print("Getting input format...")
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        print("Input format: \(inputFormat)")
        
        // Use best available format
        print("Getting best available format...")
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber],
            considering: inputFormat
        ) else {
            throw NSError(domain: "QuickSpeech", code: 2, userInfo: [NSLocalizedDescriptionKey: "No compatible format"])
        }
        
        print("Analyzer format: \(analyzerFormat)")
        
        print("Creating audio converter...")
        audioConverter = AVAudioConverter(from: inputFormat, to: analyzerFormat)
        audioConverter?.primeMethod = .none
        
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.speechAnalyzerInputContinuation = continuation
        
        // Handle results
        speechAnalyzerTask = Task {
            print("Result task started. Waiting for results...")
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    let isFinal = result.isFinal
                    print("\rTranscription: \(text) [Final: \(isFinal)]", terminator: "")
                    if isFinal {
                        print("") // New line for final
                    }
                    fflush(stdout)
                }
            } catch {
                print("Transcriber error: \(error)")
            }
        }
        
        // Install tap
        print("Installing tap...")
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, time in
            guard let self = self else { return }
            
            do {
                let converted = try self.convertBuffer(buffer, targetFormat: analyzerFormat)
                self.speechAnalyzerInputContinuation?.yield(AnalyzerInput(buffer: converted))
            } catch {
                print("Conversion error: \(error)")
            }
        }
        
        print("Starting audio engine...")
        audioEngine.prepare()
        try audioEngine.start()
        print("Starting analyzer...")
        try await analyzer.start(inputSequence: stream)
        print("Analyzer started.")
    }
    
    private func convertBuffer(_ buffer: AVAudioPCMBuffer, targetFormat: AVAudioFormat) throws -> AVAudioPCMBuffer {
        guard let converter = audioConverter else { fatalError("No converter") }
        
        if buffer.format == targetFormat { return buffer }
        
        let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio)
        
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity) else {
            throw NSError(domain: "QuickSpeech", code: 3, userInfo: nil)
        }
        
        var error: NSError?
        var haveData = true
        
        converter.convert(to: outputBuffer, error: &error) { _, status in
            if haveData {
                status.pointee = .haveData
                haveData = false
                return buffer
            } else {
                status.pointee = .noDataNow
                return nil
            }
        }
        
        if let error = error { throw error }
        return outputBuffer
    }
}

if #available(macOS 26.0, *) {
    print("Starting QuickSpeechHelper...")
    let helper = QuickSpeechHelper()
    await helper.start()
} else {
    print("❌ ERROR: Requires macOS 26.0+ (macOS Sequoia)")
    print("SpeechAnalyzer API is only available on macOS 26.0 and later.")
    exit(1)
}
