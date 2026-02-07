#!/usr/bin/env python3
"""
============================================================
SHERPA-ONNX REAL-TIME STREAMING TRANSCRIPTION BENCHMARK
============================================================

Tests the sherpa-onnx library for real-time streaming speech
recognition on macOS. Unlike mlx-whisper and lightning-whisper,
sherpa-onnx supports TRUE STREAMING — it can process audio
in small chunks without needing the full utterance.

WHAT IS SHERPA-ONNX:
sherpa-onnx is a speech recognition toolkit from k2-fsa
(Next-gen Kaldi) that uses ONNX Runtime for inference. It
supports multiple model architectures:
  - Whisper (converted to ONNX)
  - Conformer (streaming-native)
  - Zipformer (streaming-native)
  - Paraformer
  - SenseVoice

KEY ADVANTAGES OVER MLX-WHISPER:
- TRUE STREAMING: Process audio chunks incrementally, no need
  to wait for complete utterance. This means potentially
  much lower latency for first partial result.
- Cross-platform: Same code works on macOS, Linux, Windows,
  iOS, Android. Good for portability.
- Multiple model choices: Not limited to Whisper architecture.
  Conformer and Zipformer are designed for streaming from the
  ground up.
- Lower memory: ONNX models can be int8 quantized

KEY DISADVANTAGES:
- No Apple Neural Engine: ONNX Runtime on macOS uses CPU only
  (or CoreML execution provider, but it's not as optimized as
  native CoreML/MLX). May be slower than MLX-based approaches.
- Model management: Need to manually download model files
  (not auto-download from HuggingFace like mlx-whisper)

WHY WE'RE TESTING THIS:
sherpa-onnx's TRUE STREAMING capability is exactly what we
need for real-time voice AI. If it's fast enough on Apple
Silicon CPU, the streaming advantage may outweigh the lack
of MLX/Neural Engine acceleration. Conformer models designed
for streaming could give us sub-second latency.

INSTALL:
  pip install sherpa-onnx pyaudio numpy
  brew install portaudio

MODELS (manually downloaded — setup-models.sh handles this):
  - sherpa-onnx-streaming-zipformer-en (streaming, English)
  - sherpa-onnx-whisper-tiny.en (Whisper via ONNX)

RUN:
  python3 tests/neural-engine-stt-benchmarks/test-sherpa-onnx-realtime.py

CREATED: 2026-02-07. Research showed sherpa-onnx is the only
option in our test set with true streaming support, making it
potentially the best candidate for lowest-latency transcription.
============================================================
"""

import os
import sys
import time
import threading
import queue

# Add parent path for shared utils
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from shared_test_utils import (
    C, log, log_section, log_pass, log_fail, log_warn, log_info,
    say_and_wait, say_async, say_to_wav_file,
    word_accuracy, word_error_rate,
    save_audio_to_wav,
    MarkdownResultWriter, STANDARD_SCENARIOS,
    RESULTS_DIR, TMP_DIR, MODELS_DIR, SAMPLE_RATE_WHISPER,
    ensure_directories, check_pyaudio_available, check_numpy_available,
    announce_completion
)


# ============================================================
# CONFIGURATION
# ============================================================

# Where we store downloaded sherpa-onnx model files
SHERPA_MODELS_DIR = os.path.join(MODELS_DIR, "sherpa-onnx")

# Model configurations to test.
# Each is a dict with download URL, local path, and config.
# The setup-models.sh script downloads these.
SHERPA_CONFIGS = [
    {
        "name": "Zipformer Streaming EN (2024-06-24)",
        "description": (
            "Streaming Zipformer model trained for English ASR. "
            "Zipformer is a next-gen Conformer variant designed for "
            "streaming from the ground up. Should have the lowest "
            "latency of any model in this benchmark since it processes "
            "audio in tiny chunks incrementally."
        ),
        "model_dir": "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17",
        "download_url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2",
        "type": "streaming_zipformer",
    },
    {
        "name": "Whisper Tiny EN (ONNX)",
        "description": (
            "OpenAI Whisper Tiny model converted to ONNX format. "
            "Non-streaming — needs complete audio chunk before "
            "inference. Included for comparison with the MLX-based "
            "Whisper tests to see how ONNX Runtime compares to MLX "
            "on Apple Silicon."
        ),
        "model_dir": "sherpa-onnx-whisper-tiny.en",
        "download_url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2",
        "type": "whisper",
    },
]

RESULTS_FILE = os.path.join(RESULTS_DIR, "sherpa-onnx-benchmark-results.md")


# ============================================================
# SHERPA-ONNX ENGINE WRAPPER
# ============================================================

class SherpaOnnxStreamingEngine:
    """
    Wraps sherpa-onnx streaming recognizer for benchmarking.
    
    WHY STREAMING MATTERS:
    Unlike Whisper (which needs 30s of audio context), streaming
    models like Zipformer process audio in ~0.3s chunks and emit
    partial results immediately. This means:
    - First partial result: ~0.3-0.5s after speech starts
    - Progressive updates as more audio comes in
    - Final result shortly after speech ends
    
    This is conceptually similar to Apple's SpeechAnalyzer which
    also produces progressive partial results. The difference is
    sherpa-onnx runs on CPU (via ONNX Runtime) while SpeechAnalyzer
    uses the Neural Engine.
    """
    
    def __init__(self, config):
        """
        Initialize with a model configuration dict.
        
        Args:
            config: Dict with model_dir, type, etc.
        """
        self.config = config
        self.recognizer = None
        self.model_path = os.path.join(SHERPA_MODELS_DIR, config["model_dir"])
    
    def is_model_downloaded(self):
        """Check if the model files exist on disk."""
        return os.path.isdir(self.model_path)
    
    def setup(self):
        """
        Initialize the sherpa-onnx recognizer.
        
        Different model types need different configuration.
        Zipformer uses OnlineRecognizer (streaming).
        Whisper uses OfflineRecognizer (non-streaming).
        
        Returns True on success, False on failure.
        """
        try:
            import sherpa_onnx
        except ImportError:
            log_fail("sherpa-onnx not installed. Run: pip install sherpa-onnx")
            return False
        
        if not self.is_model_downloaded():
            log_fail(f"Model not downloaded: {self.model_path}")
            log(f"  Run: bash tests/neural-engine-stt-benchmarks/setup-models.sh")
            return False
        
        log(f"  Setting up: {self.config['name']}")
        
        try:
            if self.config["type"] == "streaming_zipformer":
                self.recognizer = self._setup_streaming_zipformer(sherpa_onnx)
            elif self.config["type"] == "whisper":
                self.recognizer = self._setup_whisper(sherpa_onnx)
            else:
                log_fail(f"Unknown model type: {self.config['type']}")
                return False
            
            log(f"  Recognizer ready")
            return True
            
        except Exception as e:
            log_fail(f"Setup failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _setup_streaming_zipformer(self, sherpa_onnx):
        """
        Configure a streaming Zipformer recognizer.
        
        Streaming recognizers process audio incrementally.
        They need:
        - encoder model (processes audio features)
        - decoder model (generates text tokens)
        - joiner model (connects encoder+decoder)
        - tokens file (vocabulary)
        """
        model_dir = self.model_path
        
        recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=os.path.join(model_dir, "tokens.txt"),
            encoder=os.path.join(model_dir, "encoder-epoch-99-avg-1.onnx"),
            decoder=os.path.join(model_dir, "decoder-epoch-99-avg-1.onnx"),
            joiner=os.path.join(model_dir, "joiner-epoch-99-avg-1.onnx"),
            num_threads=4,  # Use 4 CPU threads for inference
            sample_rate=SAMPLE_RATE_WHISPER,
            feature_dim=80,
            decoding_method="greedy_search",
            provider="cpu",  # ONNX Runtime CPU provider on macOS
        )
        
        return recognizer
    
    def _setup_whisper(self, sherpa_onnx):
        """
        Configure an offline Whisper recognizer (non-streaming).
        
        Whisper via ONNX is non-streaming — it needs the full
        audio before producing output. We include it to compare
        ONNX Runtime vs MLX for the same model architecture.
        """
        model_dir = self.model_path
        
        recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=os.path.join(model_dir, "tiny.en-encoder.onnx"),
            decoder=os.path.join(model_dir, "tiny.en-decoder.onnx"),
            tokens=os.path.join(model_dir, "tiny.en-tokens.txt"),
            num_threads=4,
            provider="cpu",
        )
        
        return recognizer
    
    def transcribe_streaming(self, audio_float32, callback=None):
        """
        Transcribe audio using the streaming recognizer.
        
        Feeds audio in small chunks and collects results.
        Optionally calls a callback with partial results for
        latency measurement.
        
        WHY chunk-by-chunk: This simulates true real-time behavior.
        In production, audio would come from the microphone in
        real-time. Here we feed pre-recorded audio in chunks to
        measure how quickly partial results appear.
        
        Args:
            audio_float32: numpy array of float32 audio at 16kHz
            callback: Optional fn(partial_text, time) called on each update
        
        Returns:
            dict with final_text, partials list, timing info
        """
        import numpy as np
        import sherpa_onnx
        
        if self.config["type"] != "streaming_zipformer":
            # Fall back to offline transcription for non-streaming models
            return self.transcribe_offline(audio_float32)
        
        stream = self.recognizer.create_stream()
        
        # Feed audio in small chunks (simulating real-time)
        # Zipformer typically processes ~320 samples at a time
        # at 16kHz that's 20ms per chunk
        chunk_size = int(SAMPLE_RATE_WHISPER * 0.1)  # 100ms chunks
        partials = []
        last_text = ""
        start_time = time.time()
        
        for i in range(0, len(audio_float32), chunk_size):
            chunk = audio_float32[i:i + chunk_size]
            stream.accept_waveform(SAMPLE_RATE_WHISPER, chunk.tolist())
            
            while self.recognizer.is_ready(stream):
                self.recognizer.decode_stream(stream)
            
            current_text = self.recognizer.get_result(stream).text.strip()
            
            if current_text and current_text != last_text:
                elapsed = time.time() - start_time
                partials.append({
                    "text": current_text,
                    "time": elapsed,
                    "audio_position": i / SAMPLE_RATE_WHISPER
                })
                last_text = current_text
                
                if callback:
                    callback(current_text, elapsed)
        
        # Flush remaining audio
        tail_paddings = np.zeros(int(SAMPLE_RATE_WHISPER * 0.5), dtype=np.float32)
        stream.accept_waveform(SAMPLE_RATE_WHISPER, tail_paddings.tolist())
        stream.input_finished()
        
        while self.recognizer.is_ready(stream):
            self.recognizer.decode_stream(stream)
        
        final_text = self.recognizer.get_result(stream).text.strip()
        total_time = time.time() - start_time
        
        if final_text and final_text != last_text:
            partials.append({
                "text": final_text,
                "time": total_time,
                "audio_position": len(audio_float32) / SAMPLE_RATE_WHISPER
            })
        
        return {
            "final_text": final_text,
            "partials": partials,
            "total_time": total_time,
            "first_partial_time": partials[0]["time"] if partials else None,
        }
    
    def transcribe_offline(self, audio_float32):
        """
        Transcribe using the offline (non-streaming) recognizer.
        Used for Whisper ONNX model.
        """
        import sherpa_onnx
        
        stream = self.recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE_WHISPER, audio_float32.tolist())
        
        start_time = time.time()
        self.recognizer.decode_stream(stream)
        total_time = time.time() - start_time
        
        text = stream.result.text.strip()
        
        return {
            "final_text": text,
            "partials": [{"text": text, "time": total_time}],
            "total_time": total_time,
            "first_partial_time": total_time,
        }
    
    def transcribe_file(self, wav_path):
        """
        Convenience method to transcribe a WAV file.
        Reads the file, converts to float32, and runs transcription.
        
        Returns (text, inference_time) for compatibility with
        the other engine wrappers.
        """
        import wave
        import numpy as np
        
        with wave.open(wav_path, 'r') as wf:
            audio_bytes = wf.readframes(wf.getnframes())
            audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_float = audio_int16.astype(np.float32) / 32768.0
        
        result = self.transcribe_streaming(audio_float)
        return result["final_text"], result["total_time"]


# ============================================================
# TEST SCENARIOS
# ============================================================

def run_streaming_latency_test(engine, md, scenarios):
    """
    SCENARIO A: Streaming First-Partial Latency
    
    This is the KEY TEST for sherpa-onnx. We measure how quickly
    the streaming recognizer produces its FIRST partial result.
    This is what determines perceived latency in a voice AI app.
    
    For comparison:
    - Apple SpeechAnalyzer: ~1-3s to first partial
    - Non-streaming Whisper: full audio duration + inference time
    - Streaming Zipformer: potentially < 0.5s to first partial
    
    We pre-render audio to WAV, then feed it chunk-by-chunk
    to simulate real-time input.
    """
    md.add_section("Scenario A: Streaming Latency (First Partial Result)")
    md.add_text(
        "Measures time to first partial transcription result. "
        "This is the most important metric for real-time voice AI. "
        "Audio is fed in 100ms chunks to simulate real-time input."
    )
    md.add_newline()
    md.add_table_header([
        "Scenario", "Expected", "Got (Final)", "Accuracy",
        "First Partial At", "Total Time", "Num Partials"
    ])
    
    for scenario in scenarios:
        log(f"\n  Testing: {scenario.name}")
        
        # Pre-render audio
        wav_path = os.path.join(TMP_DIR, f"sherpa_bench_{scenario.name.replace(' ', '_')}.wav")
        say_to_wav_file(scenario.text, wav_path, rate=scenario.rate)
        
        # Read the audio
        import wave
        import numpy as np
        with wave.open(wav_path, 'r') as wf:
            audio_bytes = wf.readframes(wf.getnframes())
            audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_float = audio_int16.astype(np.float32) / 32768.0
            audio_duration = wf.getnframes() / wf.getframerate()
        
        # Transcribe with streaming
        partials_log = []
        def on_partial(text, elapsed):
            partials_log.append((text, elapsed))
        
        try:
            result = engine.transcribe_streaming(audio_float, callback=on_partial)
            final_text = result["final_text"]
            first_partial = result["first_partial_time"]
            total_time = result["total_time"]
            num_partials = len(result["partials"])
        except Exception as e:
            log_fail(f"Error: {e}")
            final_text = f"ERROR: {e}"
            first_partial = None
            total_time = 0
            num_partials = 0
        
        acc = word_accuracy(scenario.text, final_text)
        
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        fp_str = f"{first_partial:.3f}s" if first_partial else "N/A"
        log(f"    {acc_color}{acc*100:.0f}% acc{C.NC} | "
            f"First partial: {fp_str} | "
            f"{num_partials} partials | "
            f"'{final_text[:50]}'")
        
        # Show partial progression
        if partials_log:
            for pt, pe in partials_log[:5]:  # Show first 5 partials
                log(f"      [{pe:.3f}s] '{pt}'")
            if len(partials_log) > 5:
                log(f"      ... ({len(partials_log) - 5} more)")
        
        md.add_table_row([
            scenario.name,
            f"`{scenario.text[:40]}{'...' if len(scenario.text) > 40 else ''}`",
            f"`{final_text[:40]}{'...' if len(final_text) > 40 else ''}`",
            f"{acc*100:.0f}%",
            fp_str,
            f"{total_time:.2f}s",
            str(num_partials)
        ])
        
        if os.path.exists(wav_path):
            os.unlink(wav_path)
    
    md.add_newline()


def run_live_mic_streaming_test(engine, md):
    """
    SCENARIO B: Live Microphone Streaming
    
    The REAL TEST — records from the mic while `say` speaks,
    and the streaming recognizer processes audio in real-time.
    
    This is as close to production behavior as we can get
    without the actual app. We measure:
    - Time from speech start to first partial result
    - Progressive partial result quality
    - Final accuracy after speech ends
    """
    md.add_section("Scenario B: Live Microphone Streaming")
    md.add_text(
        "Records from mic while `say` plays audio. The streaming "
        "recognizer processes audio chunks in real-time. This tests "
        "the full pipeline: speakers → mic → STT engine."
    )
    md.add_newline()
    
    if not check_pyaudio_available():
        md.add_text("**SKIPPED**: PyAudio not available.")
        return
    
    import pyaudio
    import numpy as np
    
    test_phrases = [
        ("hello world", 140, 4.0),
        ("one two three four five", 120, 6.0),
        ("The quick brown fox jumps over the lazy dog", 140, 8.0),
    ]
    
    md.add_table_header([
        "Phrase", "Got", "Accuracy", "First Partial",
        "Total Partials", "Total Time"
    ])
    
    for text, rate, record_duration in test_phrases:
        log(f"\n  Live mic test: '{text}'")
        
        # Setup mic recording
        p = pyaudio.PyAudio()
        stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=SAMPLE_RATE_WHISPER,
            input=True,
            frames_per_buffer=1024
        )
        
        # We'll collect audio and feed to recognizer in a thread
        import sherpa_onnx
        
        if engine.config["type"] == "streaming_zipformer":
            rec_stream = engine.recognizer.create_stream()
        else:
            # For offline models, collect all audio first
            all_audio = []
        
        partials = []
        speech_start = time.time()
        last_text = ""
        
        # Start say in background
        say_proc = say_async(text, rate=rate)
        
        # Record and process in real-time
        chunks_read = 0
        total_chunks = int(SAMPLE_RATE_WHISPER / 1024 * record_duration)
        
        try:
            for _ in range(total_chunks):
                data = stream.read(1024, exception_on_overflow=False)
                audio_chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                
                if engine.config["type"] == "streaming_zipformer":
                    rec_stream.accept_waveform(SAMPLE_RATE_WHISPER, audio_chunk.tolist())
                    
                    while engine.recognizer.is_ready(rec_stream):
                        engine.recognizer.decode_stream(rec_stream)
                    
                    current = engine.recognizer.get_result(rec_stream).text.strip()
                    if current and current != last_text:
                        elapsed = time.time() - speech_start
                        partials.append({"text": current, "time": elapsed})
                        last_text = current
                else:
                    all_audio.append(audio_chunk)
            
            # Flush for streaming
            if engine.config["type"] == "streaming_zipformer":
                tail = np.zeros(int(SAMPLE_RATE_WHISPER * 0.5), dtype=np.float32)
                rec_stream.accept_waveform(SAMPLE_RATE_WHISPER, tail.tolist())
                rec_stream.input_finished()
                while engine.recognizer.is_ready(rec_stream):
                    engine.recognizer.decode_stream(rec_stream)
                final_text = engine.recognizer.get_result(rec_stream).text.strip()
            else:
                # Offline: transcribe collected audio
                full_audio = np.concatenate(all_audio)
                result = engine.transcribe_offline(full_audio)
                final_text = result["final_text"]
                partials = [{"text": final_text, "time": result["total_time"]}]
        
        except Exception as e:
            log_fail(f"Error: {e}")
            final_text = f"ERROR"
        
        finally:
            stream.stop_stream()
            stream.close()
            p.terminate()
            say_proc.wait(timeout=10)
        
        total_time = time.time() - speech_start
        acc = word_accuracy(text, final_text)
        first_partial_time = partials[0]["time"] if partials else None
        
        fp_str = f"{first_partial_time:.2f}s" if first_partial_time else "N/A"
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        log(f"    {acc_color}{acc*100:.0f}%{C.NC} | "
            f"First partial: {fp_str} | "
            f"'{final_text[:50]}'")
        
        if partials:
            for p_entry in partials[:5]:
                log(f"      [{p_entry['time']:.2f}s] '{p_entry['text']}'")
        
        md.add_table_row([
            f"`{text}`",
            f"`{final_text[:40]}`",
            f"{acc*100:.0f}%",
            fp_str,
            str(len(partials)),
            f"{total_time:.1f}s"
        ])
        
        time.sleep(1.5)
    
    md.add_newline()


# ============================================================
# MAIN
# ============================================================

def main():
    log_section("SHERPA-ONNX STREAMING TRANSCRIPTION BENCHMARK")
    
    ensure_directories()
    os.makedirs(SHERPA_MODELS_DIR, exist_ok=True)
    
    # Check installation
    try:
        import sherpa_onnx
        log_pass(f"sherpa-onnx found: {sherpa_onnx.__file__}")
    except ImportError:
        log_fail("sherpa-onnx NOT installed.")
        print(f"\n{C.YELLOW}To install:{C.NC}")
        print("  pip install sherpa-onnx")
        print("  pip install pyaudio numpy")
        print("  brew install portaudio")
        print(f"\n{C.YELLOW}Also download models:{C.NC}")
        print("  bash tests/neural-engine-stt-benchmarks/setup-models.sh")
        sys.exit(1)
    
    if not check_numpy_available():
        sys.exit(1)
    
    # Initialize results
    md = MarkdownResultWriter(
        RESULTS_FILE,
        "Sherpa-ONNX Streaming Transcription Benchmark",
        "sherpa-onnx (ONNX Runtime)"
    )
    
    md.add_text(
        "**What**: Benchmarking sherpa-onnx for real-time streaming transcription.\n\n"
        "**Why**: sherpa-onnx is the ONLY engine in our test set with true streaming support. "
        "While it doesn't use Apple's Neural Engine (runs on CPU via ONNX Runtime), its streaming "
        "architecture means it can produce partial results with very low latency — potentially "
        "faster first-result than any Whisper-based approach.\n\n"
        "**Key Advantage**: Streaming Zipformer model processes audio in ~100ms chunks and emits "
        "partial results incrementally, similar to Apple's SpeechAnalyzer but fully open source."
    )
    
    # Run benchmarks for each model
    for config in SHERPA_CONFIGS:
        engine = SherpaOnnxStreamingEngine(config)
        
        if not engine.is_model_downloaded():
            log_warn(f"Model not downloaded: {config['name']}")
            log(f"  Run: bash tests/neural-engine-stt-benchmarks/setup-models.sh")
            md.add_section(f"Model: {config['name']} (SKIPPED — not downloaded)")
            md.add_text(f"Download with: `bash tests/neural-engine-stt-benchmarks/setup-models.sh`")
            continue
        
        if not engine.setup():
            md.add_section(f"Model: {config['name']} (FAILED to load)")
            continue
        
        md.add_section(f"Model: {config['name']}")
        md.add_text(config['description'])
        
        # Scenario A: Streaming latency with pre-rendered audio
        run_streaming_latency_test(engine, md, STANDARD_SCENARIOS)
        
        # Scenario B: Live mic streaming
        run_live_mic_streaming_test(engine, md)
    
    # Summary
    md.add_section("Summary")
    md.add_text(
        "**Key Questions Answered:**\n"
        "1. How fast is first-partial-result with streaming Zipformer?\n"
        "2. How does streaming Zipformer accuracy compare to Whisper?\n"
        "3. Is ONNX Runtime on CPU fast enough for real-time on Apple Silicon?\n"
        "4. Does true streaming give meaningfully lower latency than chunked Whisper?"
    )
    
    log_section("BENCHMARK COMPLETE")
    log(f"Results saved to: {RESULTS_FILE}")
    
    announce_completion(
        "sherpa onnx",
        "Check streaming latency results — key metric is first partial time."
    )


if __name__ == "__main__":
    main()
