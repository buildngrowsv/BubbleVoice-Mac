#!/usr/bin/env swift

import Foundation
import AVFoundation
import Speech

@available(macOS 26.0, *)
class TranscriptionTest {
    var audioEngine = AVAudioEngine()
    var analyzer: SpeechAnalyzer?
    var transcriber: SpeechTranscriber?
    var continuation: AsyncStream<AnalyzerInput>.Continuation?
    var task: Task<Void, Error>?
    var results: [String] = []
    
    func run() async throws {
        print("🎤 Simple Transcription Test")
        print("============================")
        print("")
        
        // Setup transcriber
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en-US")) else {
            print("❌ Locale not supported")
            return
        }
        
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )
        self.transcriber = transcriber
        
        print("✅ Transcriber created")
        
        // Get format
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            print("❌ No format")
            return
        }
        
        print("✅ Format: \(format)")
        
        // Create analyzer
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        self.analyzer = analyzer
        
        // Create input stream
        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
        self.continuation = continuation
        
        print("✅ Stream created")
        
        // Start result task
        task = Task {
            print("📝 Waiting for results...")
            for try await result in transcriber.results {
                let text = String(result.text.characters)
                print("   📝 \"\(text)\"")
                self.results.append(text)
            }
            print("📝 Results ended")
        }
        
        // Setup audio
        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        
        guard let converter = AVAudioConverter(from: inputFormat, to: format) else {
            print("❌ No converter")
            return
        }
        
        print("✅ Converter created")
        
        var frameCount: Int64 = 0
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] buffer, time in
            guard let self = self else { return }
            
            guard let convertedBuffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(Double(buffer.frameLength) * format.sampleRate / inputFormat.sampleRate)
            ) else { return }
            
            var error: NSError?
            converter.convert(to: convertedBuffer, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            
            if error == nil {
                let cmTime = CMTime(value: CMTimeValue(frameCount), timescale: CMTimeScale(format.sampleRate))
                frameCount += Int64(convertedBuffer.frameLength)
                self.continuation?.yield(AnalyzerInput(buffer: convertedBuffer, bufferStartTime: cmTime))
            }
        }
        
        print("✅ Tap installed")
        
        // Start engine
        audioEngine.prepare()
        try audioEngine.start()
        
        print("✅ Engine started")
        
        // Start analyzer
        try await analyzer.start(inputSequence: stream)
        
        print("✅ Analyzer started")
        print("")
        print("🎤 Speak into the microphone for 10 seconds...")
        print("")
        
        // Wait
        try await Task.sleep(for: .seconds(10))
        
        // Finalize
        try await analyzer.finalize(through: nil)
        
        print("")
        print("📊 Results: \(results.count) transcriptions")
        for (i, text) in results.enumerated() {
            print("   \(i+1). \(text)")
        }
        
        // Cleanup
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        self.continuation?.finish()
        task?.cancel()
    }
}

if #available(macOS 26.0, *) {
    Task {
        let test = TranscriptionTest()
        try? await test.run()
        exit(0)
    }
    RunLoop.main.run()
} else {
    print("Requires macOS 26+")
    exit(1)
}
