#!/usr/bin/env python3
"""
============================================================
WHISPER.CPP WITH COREML BENCHMARK
============================================================

Tests whisper.cpp with CoreML acceleration for real-time
speech-to-text on Apple Silicon. CoreML can offload parts
of the model to the Apple Neural Engine (ANE), potentially
giving faster inference than CPU-only whisper.cpp.

WHAT IS WHISPER.CPP + COREML:
whisper.cpp is a C++ implementation of OpenAI's Whisper model.
It can optionally use CoreML models for the encoder, which
allows macOS to schedule inference on the Neural Engine or
GPU instead of just CPU. This gives ~2-3x speedup for the
encoder portion of the model.

HOW COREML ACCELERATION WORKS:
1. The Whisper encoder (which processes audio features) is
   converted to CoreML format (.mlmodelc)
2. whisper.cpp loads both the GGML decoder and CoreML encoder
3. During inference, the encoder runs on ANE/GPU via CoreML
   while the decoder runs on CPU
4. This hybrid approach leverages the Neural Engine for the
   compute-heavy encoder while keeping the lighter decoder
   on CPU

KEY CONSIDERATIONS:
- First-load compilation: CoreML models need compilation on
  first use, which can take 30-600+ seconds depending on model
  size. After compilation, the cached version loads in ~1-5s.
- Memory: CoreML models use more memory than pure GGML
- Accuracy: Same as standard whisper.cpp (same model, just
  different execution backend)
- Not true streaming: Still processes fixed audio chunks

WHAT WE ALREADY HAVE:
We already have whisper.cpp GGML models downloaded in
tmp/whisper-models/ (ggml-tiny.en.bin, ggml-base.en.bin,
ggml-small.en.bin). This test compares CoreML-accelerated
versions against the CPU-only versions.

INSTALL:
  # whisper.cpp needs to be built from source with CoreML support
  # See setup-models.sh for automated build
  brew install cmake
  git clone https://github.com/ggerganov/whisper.cpp
  cd whisper.cpp
  cmake -B build -DWHISPER_COREML=ON
  cmake --build build --config Release

MODELS:
  # Convert existing GGML models to CoreML
  cd whisper.cpp
  ./models/generate-coreml-model.sh base.en

RUN:
  python3 tests/neural-engine-stt-benchmarks/test-whisper-cpp-coreml.py

CREATED: 2026-02-07. We already use whisper.cpp GGML models
for comparison. This test adds CoreML/ANE acceleration to see
if it's significantly faster.
============================================================
"""

import os
import sys
import time
import subprocess
import wave
import json

# Add parent path for shared utils
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from shared_test_utils import (
    C, log, log_section, log_pass, log_fail, log_warn, log_info,
    say_and_wait, say_to_wav_file, say_async,
    word_accuracy, word_error_rate,
    record_audio_chunk, save_audio_to_wav,
    MarkdownResultWriter, STANDARD_SCENARIOS,
    RESULTS_DIR, TMP_DIR, MODELS_DIR, SAMPLE_RATE_WHISPER,
    ensure_directories, check_pyaudio_available, check_numpy_available,
    announce_completion
)


# ============================================================
# CONFIGURATION
# ============================================================

# Path to the whisper.cpp build with CoreML support
# This gets built by setup-models.sh
WHISPER_CPP_DIR = os.path.join(MODELS_DIR, "whisper.cpp")
WHISPER_CPP_BIN = os.path.join(WHISPER_CPP_DIR, "build", "bin", "whisper-cli")

# Existing GGML models (already downloaded for other tests)
EXISTING_MODELS_DIR = os.path.join(TMP_DIR, "whisper-models")

# Model configurations to test.
# We test both CPU-only (GGML) and CoreML-accelerated versions
# of the same models for direct comparison.
WHISPER_CPP_CONFIGS = [
    {
        "name": "Tiny EN (CPU only)",
        "model_path_key": "ggml-tiny.en.bin",
        "coreml": False,
        "description": "Smallest model, CPU-only baseline. Already available from prior testing."
    },
    {
        "name": "Tiny EN (CoreML/ANE)",
        "model_path_key": "ggml-tiny.en.bin",
        "coreml": True,
        "coreml_model": "ggml-tiny.en-encoder.mlmodelc",
        "description": "Same tiny model with CoreML encoder on Neural Engine. "
                       "Tests if ANE gives meaningful speedup for tiny model."
    },
    {
        "name": "Base EN (CPU only)",
        "model_path_key": "ggml-base.en.bin",
        "coreml": False,
        "description": "Small model, CPU-only baseline. Our current whisper.cpp test model."
    },
    {
        "name": "Base EN (CoreML/ANE)",
        "model_path_key": "ggml-base.en.bin",
        "coreml": True,
        "coreml_model": "ggml-base.en-encoder.mlmodelc",
        "description": "Same base model with CoreML encoder on Neural Engine. "
                       "The encoder is the compute-heavy part, so this should "
                       "show the biggest improvement."
    },
    {
        "name": "Small EN (CPU only)",
        "model_path_key": "ggml-small.en.bin",
        "coreml": False,
        "description": "Medium model, CPU-only. Already available from prior testing."
    },
    {
        "name": "Small EN (CoreML/ANE)",
        "model_path_key": "ggml-small.en.bin",
        "coreml": True,
        "coreml_model": "ggml-small.en-encoder.mlmodelc",
        "description": "Medium model with CoreML encoder. Larger models benefit "
                       "more from ANE acceleration since the encoder is bigger."
    },
]

RESULTS_FILE = os.path.join(RESULTS_DIR, "whisper-cpp-coreml-benchmark-results.md")


# ============================================================
# WHISPER.CPP ENGINE WRAPPER
# ============================================================

class WhisperCppEngine:
    """
    Wraps the whisper.cpp CLI binary for benchmarking.
    
    WHY CLI instead of library binding:
    whisper.cpp provides a C library and Python bindings
    (pywhispercpp), but the CLI is the most reliable way to
    test CoreML support since it's guaranteed to use the same
    build configuration. The CLI also provides timing info
    in its output which we can parse.
    
    HOW IT WORKS:
    1. We render test audio to a 16kHz mono WAV file
    2. Call whisper-cli with the appropriate flags
    3. Parse the stdout for transcription text and timing
    4. Report metrics
    """
    
    def __init__(self, config):
        """
        Initialize with a model configuration dict.
        """
        self.config = config
        self.model_path = os.path.join(EXISTING_MODELS_DIR, config["model_path_key"])
        self.coreml = config.get("coreml", False)
    
    def is_available(self):
        """Check if the whisper.cpp binary and model files exist."""
        if not os.path.isfile(WHISPER_CPP_BIN):
            log_warn(f"whisper.cpp binary not found: {WHISPER_CPP_BIN}")
            log(f"  Run: bash tests/neural-engine-stt-benchmarks/setup-models.sh")
            return False
        
        if not os.path.isfile(self.model_path):
            log_warn(f"Model not found: {self.model_path}")
            return False
        
        if self.coreml:
            coreml_path = os.path.join(
                EXISTING_MODELS_DIR,
                self.config.get("coreml_model", "")
            )
            if not os.path.isdir(coreml_path):
                log_warn(f"CoreML model not found: {coreml_path}")
                log(f"  CoreML models need to be generated. See setup-models.sh")
                return False
        
        return True
    
    def transcribe_file(self, wav_path):
        """
        Transcribe a WAV file using whisper.cpp CLI.
        
        Returns (text, inference_time, timing_details).
        
        PARSING: whisper.cpp outputs transcription in a specific
        format with timestamps. We parse the text and also look
        for timing information in stderr.
        """
        cmd = [
            WHISPER_CPP_BIN,
            "-m", self.model_path,
            "-f", wav_path,
            "--language", "en",
            "--no-timestamps",     # Simpler output parsing
            "--print-progress",    # Show progress
            "-t", "4",             # 4 threads
        ]
        
        # No special flag needed for CoreML — whisper.cpp auto-detects
        # the .mlmodelc directory next to the GGML model if it was
        # built with WHISPER_COREML=ON. The CoreML encoder file must
        # be in the same directory as the GGML model with the naming
        # convention: ggml-{model}-encoder.mlmodelc
        
        start = time.time()
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )
            inference_time = time.time() - start
            
            # Parse output — whisper.cpp outputs transcription to stdout
            # Each line is typically: [timestamp] text
            # With --no-timestamps, it's just the text
            text = result.stdout.strip()
            
            # Clean up whisper.cpp output format
            # Remove any remaining timestamp markers
            import re
            text = re.sub(r'\[\d+:\d+:\d+\.\d+ --> \d+:\d+:\d+\.\d+\]', '', text)
            text = ' '.join(text.split()).strip()
            
            # Check for CoreML usage in stderr
            stderr_text = result.stderr
            coreml_used = "coreml" in stderr_text.lower() or "Core ML" in stderr_text
            
            # Parse timing from stderr if available
            timing_details = {
                "coreml_detected": coreml_used,
                "stderr_snippet": stderr_text[:200] if stderr_text else ""
            }
            
            return text, inference_time, timing_details
            
        except subprocess.TimeoutExpired:
            log_fail("whisper.cpp timed out (120s)")
            return "TIMEOUT", 120, {}
        except Exception as e:
            log_fail(f"whisper.cpp error: {e}")
            return f"ERROR: {e}", 0, {}


# ============================================================
# TEST SCENARIOS
# ============================================================

def run_file_benchmark(engine, md, scenarios):
    """
    SCENARIO A: File-Based Transcription Benchmark
    
    Same approach as the mlx-whisper test — pre-render audio,
    measure pure inference time. This gives us a direct
    comparison: whisper.cpp CPU vs whisper.cpp CoreML vs
    mlx-whisper vs lightning-whisper.
    """
    md.add_table_header([
        "Scenario", "Expected", "Got", "Accuracy",
        "WER", "Inference Time", "Audio Duration", "RTF", "CoreML?"
    ])
    
    for scenario in scenarios:
        log(f"\n  Testing: {scenario.name}")
        
        wav_path = os.path.join(TMP_DIR, f"wcpp_bench_{scenario.name.replace(' ', '_')}.wav")
        say_to_wav_file(scenario.text, wav_path, rate=scenario.rate)
        
        # Get audio duration
        with wave.open(wav_path, 'r') as wf:
            audio_duration = wf.getnframes() / wf.getframerate()
        
        # Transcribe
        text, inference_time, timing = engine.transcribe_file(wav_path)
        
        acc = word_accuracy(scenario.text, text)
        wer = word_error_rate(scenario.text, text)
        rtf = inference_time / audio_duration if audio_duration > 0 else 999
        coreml_str = "Yes" if timing.get("coreml_detected") else "No"
        
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        rtf_color = C.GREEN if rtf < 1.0 else C.YELLOW if rtf < 2.0 else C.RED
        log(f"    {acc_color}{acc*100:.0f}%{C.NC} | "
            f"{rtf_color}RTF={rtf:.2f}{C.NC} | "
            f"CoreML={coreml_str} | "
            f"'{text[:50]}'")
        
        md.add_table_row([
            scenario.name,
            f"`{scenario.text[:40]}{'...' if len(scenario.text) > 40 else ''}`",
            f"`{text[:40]}{'...' if len(text) > 40 else ''}`",
            f"{acc*100:.0f}%",
            f"{wer:.2f}",
            f"{inference_time:.2f}s",
            f"{audio_duration:.1f}s",
            f"{rtf:.2f}",
            coreml_str
        ])
        
        if os.path.exists(wav_path):
            os.unlink(wav_path)
    
    md.add_newline()


def run_chunked_realtime_test(engine, md, chunk_duration=3.0):
    """
    SCENARIO B: Chunked Real-Time Simulation
    
    Record from mic while say plays, transcribe the chunk.
    Same approach as the other tests for fair comparison.
    """
    md.add_section(f"Chunked Realtime ({chunk_duration}s)")
    md.add_table_header([
        "Phrase", "Got", "Accuracy", "Total Latency", "Inference"
    ])
    
    if not check_pyaudio_available():
        md.add_text("**SKIPPED**: PyAudio not available.")
        return
    
    test_phrases = [
        ("hello world", 140),
        ("one two three four five", 120),
        ("The quick brown fox jumps over the lazy dog", 140),
    ]
    
    for text, rate in test_phrases:
        log(f"  Chunked: '{text}' ({chunk_duration}s)")
        
        total_record_time = chunk_duration + 2.0
        speech_start = time.time()
        
        say_proc = say_async(text, rate=rate)
        
        try:
            audio = record_audio_chunk(total_record_time, SAMPLE_RATE_WHISPER)
            say_proc.wait(timeout=30)
            
            # Save to WAV for whisper.cpp CLI
            wav_path = os.path.join(TMP_DIR, f"wcpp_chunk_{os.getpid()}.wav")
            save_audio_to_wav(audio, wav_path)
            
            transcribed, inference_time, _ = engine.transcribe_file(wav_path)
            
            if os.path.exists(wav_path):
                os.unlink(wav_path)
        except Exception as e:
            log_fail(f"Error: {e}")
            transcribed = "ERROR"
            inference_time = 0
            say_proc.wait(timeout=10)
        
        total_latency = time.time() - speech_start
        acc = word_accuracy(text, transcribed)
        
        log(f"    {acc*100:.0f}% | Latency: {total_latency:.1f}s | '{transcribed[:50]}'")
        
        md.add_table_row([
            f"`{text}`",
            f"`{transcribed[:40]}`",
            f"{acc*100:.0f}%",
            f"{total_latency:.1f}s",
            f"{inference_time:.2f}s"
        ])
        
        time.sleep(1.0)
    
    md.add_newline()


# ============================================================
# MAIN
# ============================================================

def main():
    log_section("WHISPER.CPP + COREML BENCHMARK")
    
    ensure_directories()
    
    # Check if whisper.cpp binary exists
    if not os.path.isfile(WHISPER_CPP_BIN):
        log_fail(f"whisper.cpp binary not found: {WHISPER_CPP_BIN}")
        print(f"\n{C.YELLOW}To build whisper.cpp with CoreML support:{C.NC}")
        print("  bash tests/neural-engine-stt-benchmarks/setup-models.sh")
        print(f"\n{C.YELLOW}Or build manually:{C.NC}")
        print(f"  cd {WHISPER_CPP_DIR}")
        print("  cmake -B build -DWHISPER_COREML=ON")
        print("  cmake --build build --config Release")
        sys.exit(1)
    
    log_pass(f"whisper.cpp binary found: {WHISPER_CPP_BIN}")
    
    # Check existing GGML models
    for model_file in ["ggml-tiny.en.bin", "ggml-base.en.bin", "ggml-small.en.bin"]:
        path = os.path.join(EXISTING_MODELS_DIR, model_file)
        if os.path.isfile(path):
            log(f"  Model found: {model_file}")
        else:
            log_warn(f"  Model missing: {model_file}")
    
    # Initialize results
    md = MarkdownResultWriter(
        RESULTS_FILE,
        "Whisper.cpp + CoreML Benchmark Results",
        "whisper.cpp with CoreML/Neural Engine"
    )
    
    md.add_text(
        "**What**: Benchmarking whisper.cpp with CoreML Neural Engine acceleration.\n\n"
        "**Why**: We already use whisper.cpp GGML models. Adding CoreML support offloads "
        "the encoder to Apple's Neural Engine for ~2-3x speedup on the encoder portion. "
        "This is a direct upgrade path — same models, just faster execution.\n\n"
        "**How**: Comparing CPU-only vs CoreML-accelerated inference on the same models "
        "(tiny, base, small) to quantify the Neural Engine benefit.\n\n"
        "**Note**: CoreML models need first-time compilation which can take minutes. "
        "Subsequent loads use the cached compiled version."
    )
    
    # Run benchmarks
    for config in WHISPER_CPP_CONFIGS:
        engine = WhisperCppEngine(config)
        
        if not engine.is_available():
            md.add_section(f"{config['name']} (SKIPPED — not available)")
            md.add_text(f"Model or binary not found. Run setup-models.sh to prepare.")
            continue
        
        md.add_section(f"Model: {config['name']}")
        md.add_text(config["description"])
        
        run_file_benchmark(engine, md, STANDARD_SCENARIOS)
        
        # Only run realtime test for tiny and base (faster models)
        if "tiny" in config["name"].lower() or "base" in config["name"].lower():
            run_chunked_realtime_test(engine, md, chunk_duration=3.0)
    
    # Summary comparison
    md.add_section("CPU vs CoreML Comparison")
    md.add_text(
        "**Key Questions:**\n"
        "1. How much faster is CoreML/ANE vs CPU-only for each model size?\n"
        "2. Is the first-load compilation time acceptable for an app?\n"
        "3. Can CoreML whisper.cpp achieve RTF < 1.0 (real-time) for any model?\n"
        "4. How does CoreML whisper.cpp compare to mlx-whisper and sherpa-onnx?"
    )
    
    log_section("BENCHMARK COMPLETE")
    log(f"Results saved to: {RESULTS_FILE}")
    
    announce_completion(
        "whisper dot C P P with core M L",
        "Compare C P U only versus core M L columns for speedup analysis."
    )


if __name__ == "__main__":
    main()
