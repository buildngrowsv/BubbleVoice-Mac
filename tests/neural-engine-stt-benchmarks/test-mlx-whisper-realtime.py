#!/usr/bin/env python3
"""
============================================================
MLX-WHISPER REAL-TIME TRANSCRIPTION BENCHMARK
============================================================

Tests the mlx-whisper library for real-time speech-to-text
transcription on Apple Silicon, leveraging the MLX framework
for GPU-accelerated inference.

WHAT IS MLX-WHISPER:
mlx-whisper is a port of OpenAI's Whisper model to Apple's
MLX framework. MLX is Apple's machine learning framework
designed specifically for Apple Silicon, using unified memory
architecture for efficient GPU/CPU/Neural Engine inference.

KEY CHARACTERISTICS:
- Uses Apple's MLX framework (not CoreML directly)
- Optimized for Apple Silicon unified memory
- Supports all Whisper model sizes via HuggingFace
- FILE-BASED API — requires writing audio to disk, not
  true streaming. We work around this by recording short
  chunks and transcribing each.
- Models: mlx-community/whisper-tiny, whisper-base,
  distil-whisper-large-v3, whisper-turbo, etc.

WHY WE'RE TESTING THIS:
Our current STT uses Apple's SpeechAnalyzer (via the Swift
helper). We want to know if mlx-whisper can match or beat
SpeechAnalyzer for real-time transcription latency and
accuracy. mlx-whisper gives us more control over the model
and doesn't require the SpeechAnalyzer availability check.

INSTALL:
  pip install mlx-whisper pyaudio numpy soundfile
  brew install portaudio ffmpeg

MODELS (downloaded automatically from HuggingFace):
  - mlx-community/whisper-tiny.en      (~75MB, fastest)
  - mlx-community/whisper-base.en      (~140MB, good balance)
  - mlx-community/whisper-small.en     (~460MB, more accurate)
  - mlx-community/distil-whisper-large-v3  (~756MB, best accuracy)

RUN:
  python3 tests/neural-engine-stt-benchmarks/test-mlx-whisper-realtime.py

CREATED: 2026-02-07 from research on Neural Engine STT alternatives.
The user wanted to test models beyond Apple SpeechAnalyzer and
raw whisper.cpp for real-time transcription on Mac.
============================================================
"""

import os
import sys
import time
import tempfile
import threading
import subprocess

# Add parent path so we can import shared utils
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from shared_test_utils import (
    C, log, log_section, log_pass, log_fail, log_warn, log_info,
    say_and_wait, say_to_wav_file, say_async, say_to_aiff_and_play,
    word_accuracy, word_error_rate,
    record_audio_chunk, save_audio_to_wav,
    MarkdownResultWriter, BenchmarkScenario, STANDARD_SCENARIOS,
    RESULTS_DIR, MODELS_DIR, TMP_DIR, SAMPLE_RATE_WHISPER,
    ensure_directories, check_pyaudio_available, check_numpy_available,
    announce_completion, POST_SPEECH_WAIT
)


# ============================================================
# MLX-WHISPER SPECIFIC CONFIGURATION
# ============================================================

# Models to benchmark, in order of size/quality.
# Each tuple is (model_repo, display_name, description).
# The models auto-download from HuggingFace on first use.
# We test multiple sizes to find the speed/accuracy sweet spot.
MLX_MODELS = [
    (
        "mlx-community/whisper-tiny.en",
        "Tiny (English)",
        "Smallest model (~75MB). Fastest inference but lower accuracy. "
        "Good for testing if the pipeline works at all."
    ),
    (
        "mlx-community/whisper-base.en",
        "Base (English)",
        "Small model (~140MB). Good balance of speed and accuracy. "
        "This is roughly comparable to our ggml-base.en.bin whisper.cpp model."
    ),
    (
        "mlx-community/whisper-small.en",
        "Small (English)",
        "Medium model (~460MB). Noticeably more accurate than base, "
        "but inference takes longer. May not be real-time for short chunks."
    ),
    (
        "mlx-community/distil-whisper-large-v3",
        "Distil Large V3",
        "Distilled large model (~756MB). Best accuracy of the set. "
        "Uses knowledge distillation from large-v3 for faster inference "
        "while maintaining most of the accuracy. This is the recommended "
        "model for production use on Apple Silicon according to research."
    ),
]

# Chunk duration for pseudo-streaming.
# mlx-whisper is file-based, so we record audio in chunks
# and transcribe each chunk. Shorter chunks = lower latency
# but potentially worse accuracy (less context).
CHUNK_DURATIONS = [2.0, 3.0, 5.0]

# Results file path
RESULTS_FILE = os.path.join(RESULTS_DIR, "mlx-whisper-benchmark-results.md")


# ============================================================
# MLX-WHISPER ENGINE WRAPPER
# ============================================================

class MlxWhisperEngine:
    """
    Wraps the mlx_whisper library for our benchmark tests.
    
    WHY A WRAPPER: mlx-whisper has a simple API (transcribe a file),
    but we need to handle model loading time measurement, error
    handling, and the file-based workflow (record → save → transcribe).
    This class encapsulates all of that.
    
    LIMITATION: mlx-whisper does NOT support true streaming/realtime
    audio input. It transcribes complete audio files. We simulate
    realtime by recording short chunks and transcribing each one.
    This means our measured latency will include:
      audio_capture_time + file_write_time + inference_time
    """
    
    def __init__(self, model_repo):
        """
        Initialize with a HuggingFace model repo path.
        The model downloads automatically on first use.
        
        Args:
            model_repo: e.g. "mlx-community/whisper-tiny.en"
        """
        self.model_repo = model_repo
        self.model_loaded = False
        self.load_time = None
    
    def warmup(self):
        """
        Pre-load the model by doing a dummy transcription.
        
        WHY: First inference with mlx-whisper triggers model
        download (if needed) and compilation. This can take
        30-60+ seconds for large models. We do this before
        starting benchmarks so the load time doesn't pollute
        our transcription latency measurements.
        
        We still measure and report the load time because it's
        important for app startup UX.
        """
        try:
            from mlx_whisper import transcribe
        except ImportError:
            log_fail("mlx-whisper not installed. Run: pip install mlx-whisper")
            return False
        
        log(f"  Warming up model: {self.model_repo}")
        log(f"  (First run downloads the model — this may take a while)")
        
        # Create a tiny silent WAV file for the warmup transcription
        warmup_path = os.path.join(TMP_DIR, "mlx_warmup.wav")
        import numpy as np
        # 1 second of silence at 16kHz
        silence = np.zeros(SAMPLE_RATE_WHISPER, dtype=np.float32)
        save_audio_to_wav(silence, warmup_path)
        
        start = time.time()
        try:
            result = transcribe(
                warmup_path,
                path_or_hf_repo=self.model_repo,
                language="en",
                verbose=False
            )
            self.load_time = time.time() - start
            self.model_loaded = True
            log(f"  Model loaded in {self.load_time:.1f}s")
            return True
        except Exception as e:
            log_fail(f"Model warmup failed: {e}")
            return False
        finally:
            if os.path.exists(warmup_path):
                os.unlink(warmup_path)
    
    def transcribe_file(self, wav_path):
        """
        Transcribe a WAV file and return (text, inference_time).
        
        This is the core inference call. We measure just the
        transcription time (not file I/O) for accurate benchmarking.
        
        Args:
            wav_path: Path to a WAV file (16kHz mono recommended)
        
        Returns:
            tuple: (transcribed_text, inference_time_seconds)
        """
        from mlx_whisper import transcribe
        
        start = time.time()
        result = transcribe(
            wav_path,
            path_or_hf_repo=self.model_repo,
            language="en",
            verbose=False
        )
        inference_time = time.time() - start
        
        text = result.get("text", "").strip()
        return text, inference_time
    
    def transcribe_audio_array(self, audio_float32):
        """
        Transcribe a numpy float32 audio array.
        
        WHY: This is a convenience method that handles the
        file-based workflow internally. It saves the array
        to a temp WAV, transcribes, then cleans up.
        
        Args:
            audio_float32: numpy array of float32 samples at 16kHz
        
        Returns:
            tuple: (transcribed_text, inference_time_seconds)
        """
        tmp_path = os.path.join(TMP_DIR, f"mlx_chunk_{os.getpid()}.wav")
        save_audio_to_wav(audio_float32, tmp_path)
        
        try:
            text, inference_time = self.transcribe_file(tmp_path)
            return text, inference_time
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)


# ============================================================
# TEST SCENARIOS
# ============================================================

def run_file_transcription_benchmark(engine, md, scenarios):
    """
    SCENARIO A: File-Based Transcription Benchmark
    
    Pre-record audio files using `say`, then transcribe them.
    This measures PURE INFERENCE TIME without any mic capture
    overhead. Useful for comparing raw model speed.
    
    WHY: Separating mic capture from inference helps us
    understand where the bottleneck is. If inference alone
    is too slow for realtime, there's no point optimizing
    the audio capture pipeline.
    """
    md.add_section("Scenario A: File-Based Transcription (Pure Inference)")
    md.add_text(
        "Pre-recorded audio files transcribed by the model. "
        "This measures raw inference time without microphone capture overhead. "
        "Audio generated via macOS `say` command at 16kHz mono WAV."
    )
    md.add_newline()
    md.add_table_header([
        "Scenario", "Expected Text", "Got", "Word Accuracy",
        "WER", "Inference Time", "Audio Duration", "RTF"
    ])
    
    for scenario in scenarios:
        log(f"\n  Testing: {scenario.name}")
        
        # Pre-render the audio to a WAV file
        wav_path = os.path.join(TMP_DIR, f"mlx_bench_{scenario.name.replace(' ', '_')}.wav")
        say_to_wav_file(scenario.text, wav_path, rate=scenario.rate)
        
        # Measure the audio duration from the WAV file
        import wave
        with wave.open(wav_path, 'r') as wf:
            audio_duration = wf.getnframes() / wf.getframerate()
        
        # Transcribe
        try:
            text, inference_time = engine.transcribe_file(wav_path)
        except Exception as e:
            log_fail(f"Transcription error: {e}")
            text = f"ERROR: {e}"
            inference_time = 0
        
        # Calculate metrics
        acc = word_accuracy(scenario.text, text)
        wer = word_error_rate(scenario.text, text)
        # RTF = Real-Time Factor = inference_time / audio_duration
        # RTF < 1.0 means faster than real-time
        rtf = inference_time / audio_duration if audio_duration > 0 else 999
        
        # Log to terminal
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        rtf_color = C.GREEN if rtf < 1.0 else C.YELLOW if rtf < 2.0 else C.RED
        log(f"    Accuracy: {acc_color}{acc*100:.0f}%{C.NC} | "
            f"RTF: {rtf_color}{rtf:.2f}{C.NC} | "
            f"Got: '{text[:60]}...' " if len(text) > 60 else f"    Accuracy: {acc_color}{acc*100:.0f}%{C.NC} | RTF: {rtf_color}{rtf:.2f}{C.NC} | Got: '{text}'")
        
        # Log to markdown
        md.add_table_row([
            scenario.name,
            f"`{scenario.text[:50]}{'...' if len(scenario.text) > 50 else ''}`",
            f"`{text[:50]}{'...' if len(text) > 50 else ''}`",
            f"{acc*100:.0f}%",
            f"{wer:.2f}",
            f"{inference_time:.2f}s",
            f"{audio_duration:.1f}s",
            f"{rtf:.2f}"
        ])
        
        # Clean up WAV file
        if os.path.exists(wav_path):
            os.unlink(wav_path)
    
    md.add_newline()
    md.add_text(
        "**RTF (Real-Time Factor)**: Inference time / audio duration. "
        "RTF < 1.0 means the model transcribes faster than real-time. "
        "RTF > 1.0 means it's slower than real-time and can't keep up "
        "with live audio."
    )


def run_chunked_realtime_simulation(engine, md, chunk_duration=3.0):
    """
    SCENARIO B: Chunked Real-Time Simulation
    
    Records audio from the mic in chunks, transcribes each chunk,
    and measures the end-to-end latency. This simulates what a
    real-time app would do with mlx-whisper (since it doesn't
    support true streaming).
    
    FLOW:
    1. Start listening (mic capture in background thread)
    2. Play a test phrase via `say`
    3. After say finishes, wait for STT to complete
    4. Measure total time from speech start to transcription
    
    WHY chunk_duration matters:
    - Shorter chunks (2s) = lower latency but less context
      for the model, potentially worse accuracy
    - Longer chunks (5s) = better accuracy but higher latency
    - We test multiple chunk durations to find the sweet spot
    """
    md.add_section(f"Scenario B: Chunked Real-Time Simulation ({chunk_duration}s chunks)")
    md.add_text(
        f"Records {chunk_duration}s audio chunks from mic, transcribes each. "
        f"Measures end-to-end latency from speech start to transcription result. "
        f"Uses macOS `say` command to generate test audio through speakers."
    )
    md.add_newline()
    md.add_table_header([
        "Phrase", "Expected", "Got", "Word Accuracy",
        "Total Latency", "Inference Time"
    ])
    
    # We test a subset of scenarios to keep runtime reasonable
    test_phrases = [
        ("hello world", 140),
        ("one two three four five", 120),
        ("The quick brown fox jumps over the lazy dog", 140),
    ]
    
    for text, rate in test_phrases:
        log(f"\n  Chunked test: '{text}' (chunk={chunk_duration}s)")
        
        # Record audio while say plays — we capture slightly longer
        # than the say duration to ensure we get all the audio.
        # We run say in background and record simultaneously.
        total_record_time = chunk_duration + 2.0  # Extra buffer
        
        # Start recording in background
        import numpy as np
        
        collected_text = ""
        total_inference = 0.0
        speech_start = time.time()
        
        # Play the test phrase
        say_proc = say_async(text, rate=rate)
        
        # Record a chunk
        try:
            audio = record_audio_chunk(total_record_time, SAMPLE_RATE_WHISPER)
            
            # Wait for say to finish
            say_proc.wait(timeout=30)
            
            # Transcribe the chunk
            transcribed, inference_time = engine.transcribe_audio_array(audio)
            collected_text = transcribed
            total_inference = inference_time
        except Exception as e:
            log_fail(f"Error: {e}")
            collected_text = f"ERROR: {e}"
            say_proc.wait(timeout=10)
        
        total_latency = time.time() - speech_start
        acc = word_accuracy(text, collected_text)
        
        # Log
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        log(f"    {acc_color}{acc*100:.0f}% accuracy{C.NC} | "
            f"Latency: {total_latency:.1f}s | "
            f"Inference: {total_inference:.2f}s | "
            f"Got: '{collected_text[:60]}'")
        
        md.add_table_row([
            f"`{text}`",
            f"`{text}`",
            f"`{collected_text[:50]}`",
            f"{acc*100:.0f}%",
            f"{total_latency:.1f}s",
            f"{total_inference:.2f}s"
        ])
        
        time.sleep(1.0)  # Gap between tests
    
    md.add_newline()


def run_model_loading_benchmark(md):
    """
    SCENARIO C: Model Loading Time
    
    Measures cold-start model loading time for each model size.
    This is important for app startup UX — if a model takes
    30+ seconds to load, we need to handle that gracefully
    (preload at startup, show a loading indicator, etc.)
    
    NOTE: After the first load, models are cached by HuggingFace
    in ~/.cache/huggingface/. So "cold start" really means
    "first inference after process start" not "first download".
    """
    md.add_section("Scenario C: Model Loading / First Inference Time")
    md.add_text(
        "Time to load each model and run first inference. "
        "Models are cached locally after first download. "
        "This measures process-startup cold load, not download time."
    )
    md.add_newline()
    md.add_table_header(["Model", "Load + First Inference", "Model Description"])
    
    for model_repo, display_name, description in MLX_MODELS:
        log(f"\n  Loading: {display_name} ({model_repo})")
        
        engine = MlxWhisperEngine(model_repo)
        start = time.time()
        success = engine.warmup()
        load_time = time.time() - start
        
        if success:
            log(f"    Loaded in {load_time:.1f}s")
            md.add_table_row([
                display_name,
                f"{load_time:.1f}s",
                description[:80]
            ])
        else:
            log_fail(f"Failed to load {display_name}")
            md.add_table_row([
                display_name,
                "FAILED",
                description[:80]
            ])
    
    md.add_newline()


# ============================================================
# MAIN TEST RUNNER
# ============================================================

def main():
    """
    Main entry point for the mlx-whisper benchmark.
    
    Runs all scenarios across all model sizes and writes
    results to a markdown file. Does NOT run if mlx-whisper
    is not installed — prints installation instructions instead.
    """
    log_section("MLX-WHISPER REAL-TIME TRANSCRIPTION BENCHMARK")
    
    # Pre-flight checks
    ensure_directories()
    
    # Check if mlx-whisper is installed
    try:
        import mlx_whisper
        log_pass(f"mlx-whisper found: {mlx_whisper.__file__}")
    except ImportError:
        log_fail("mlx-whisper is NOT installed.")
        print(f"\n{C.YELLOW}To install:{C.NC}")
        print("  pip install mlx-whisper")
        print("  brew install ffmpeg  (if not already installed)")
        print(f"\n{C.YELLOW}Also needed for mic capture:{C.NC}")
        print("  pip install pyaudio numpy soundfile")
        print("  brew install portaudio")
        sys.exit(1)
    
    if not check_numpy_available():
        sys.exit(1)
    
    # Initialize results markdown
    md = MarkdownResultWriter(
        RESULTS_FILE,
        "MLX-Whisper Real-Time Transcription Benchmark",
        "mlx-whisper (Apple MLX Framework)"
    )
    
    md.add_text(
        "**What**: Benchmarking mlx-whisper for real-time transcription on Apple Silicon.\n\n"
        "**Why**: Evaluating if MLX-accelerated Whisper can match or beat Apple's SpeechAnalyzer "
        "for our voice AI app's STT pipeline. MLX uses Apple Silicon's unified memory and GPU "
        "for efficient inference without needing CoreML conversion.\n\n"
        "**How**: Using macOS `say` command to generate speech through speakers, capturing via "
        "microphone, and measuring transcription latency and accuracy."
    )
    
    # ========================================================
    # SCENARIO C: Model Loading (run first because it warms up models)
    # ========================================================
    log_section("SCENARIO C: Model Loading Time")
    run_model_loading_benchmark(md)
    
    # ========================================================
    # SCENARIO A: File-Based Benchmark (for each model)
    # ========================================================
    for model_repo, display_name, description in MLX_MODELS:
        log_section(f"SCENARIO A: File-Based Benchmark — {display_name}")
        
        engine = MlxWhisperEngine(model_repo)
        if not engine.warmup():
            log_warn(f"Skipping {display_name} — failed to load")
            continue
        
        md.add_section(f"Model: {display_name}", level=2)
        md.add_text(f"**Repo**: `{model_repo}`\n\n**Description**: {description}")
        
        run_file_transcription_benchmark(engine, md, STANDARD_SCENARIOS)
    
    # ========================================================
    # SCENARIO B: Chunked Real-Time Simulation (best model only)
    # ========================================================
    # We only run the realtime simulation with tiny and base
    # models since larger models are likely too slow for chunks.
    if check_pyaudio_available():
        for model_repo, display_name, _ in MLX_MODELS[:2]:
            for chunk_dur in CHUNK_DURATIONS:
                log_section(
                    f"SCENARIO B: Chunked Realtime — {display_name} ({chunk_dur}s)"
                )
                engine = MlxWhisperEngine(model_repo)
                engine.warmup()
                run_chunked_realtime_simulation(engine, md, chunk_duration=chunk_dur)
    else:
        md.add_section("Scenario B: Chunked Real-Time (SKIPPED)")
        md.add_text("PyAudio not available. Install: `pip install pyaudio && brew install portaudio`")
    
    # ========================================================
    # SUMMARY
    # ========================================================
    md.add_section("Summary")
    md.add_text(
        "**Key Questions Answered:**\n"
        "1. Can mlx-whisper transcribe faster than real-time (RTF < 1.0)?\n"
        "2. Which model size gives the best speed/accuracy tradeoff?\n"
        "3. What chunk duration works best for pseudo-realtime?\n"
        "4. How does latency compare to Apple SpeechAnalyzer (~1-3s first result)?"
    )
    
    log_section("BENCHMARK COMPLETE")
    log(f"Results saved to: {RESULTS_FILE}")
    
    announce_completion("mlx-whisper", "Check results markdown for details.")


if __name__ == "__main__":
    main()
