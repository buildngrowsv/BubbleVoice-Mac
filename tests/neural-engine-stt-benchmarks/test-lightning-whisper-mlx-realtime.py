#!/usr/bin/env python3
"""
============================================================
LIGHTNING-WHISPER-MLX (vayu-whisper) BENCHMARK
============================================================

Tests the LightningWhisperMLX library for real-time speech
transcription on Apple Silicon. This is a FASTER variant of
mlx-whisper that uses batched decoding for 3-10x speedup.

WHAT IS LIGHTNING-WHISPER-MLX:
Built on top of mlx-whisper, LightningWhisperMLX (distributed
as the `vayu-whisper` pip package) adds batched beam search
decoding which dramatically speeds up transcription. It also
supports 4-bit quantization to reduce memory usage, making
large models viable on machines with less RAM.

KEY DIFFERENCES FROM MLX-WHISPER:
- 3-10x faster inference due to batched decoding
- 4-bit quantization support (lower memory, similar accuracy)
- Different API: uses LightningWhisperMLX class instead of
  a simple transcribe() function
- Supports word-level timestamps
- Same file-based limitation (no true streaming)

WHY WE'RE TESTING THIS:
If mlx-whisper is close to real-time but not quite fast enough,
Lightning-Whisper-MLX's batched decoding might push it over
the edge. The 3-10x speedup claim is significant — if true,
even the large model might be real-time viable.

INSTALL:
  pip install vayu-whisper pyaudio numpy soundfile
  python -m whisper_mlx.assets.download_assets
  brew install portaudio ffmpeg

MODELS (same HuggingFace repos as mlx-whisper, but with
batch_size and quantization control):
  - tiny.en with batch_size=24-32
  - base.en with batch_size=16-24
  - distil-large-v3 with batch_size=8-12
  - distil-large-v3 with 4bit quant, batch_size=12-16

RUN:
  python3 tests/neural-engine-stt-benchmarks/test-lightning-whisper-mlx-realtime.py

CREATED: 2026-02-07 from research showing LightningWhisperMLX
achieves 10x speedup over whisper.cpp on Apple Silicon.
============================================================
"""

import os
import sys
import time

# Add parent path so we can import shared utils
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from shared_test_utils import (
    C, log, log_section, log_pass, log_fail, log_warn, log_info,
    say_and_wait, say_to_wav_file, say_async,
    word_accuracy, word_error_rate,
    record_audio_chunk, save_audio_to_wav,
    MarkdownResultWriter, STANDARD_SCENARIOS,
    RESULTS_DIR, TMP_DIR, SAMPLE_RATE_WHISPER,
    ensure_directories, check_pyaudio_available, check_numpy_available,
    announce_completion, POST_SPEECH_WAIT
)


# ============================================================
# CONFIGURATION
# ============================================================

# Model configurations to test.
# Each is (model_name, batch_size, quant, display_name, description)
# batch_size controls how many tokens are decoded in parallel.
# Higher batch_size = faster but more memory.
# quant can be None (full precision) or "4bit" (quantized).
LIGHTNING_CONFIGS = [
    (
        "tiny.en", 32, None,
        "Tiny (batch=32, full precision)",
        "Smallest model with maximum batching. Should be extremely fast. "
        "This tests the lower bound of inference time."
    ),
    (
        "base.en", 24, None,
        "Base (batch=24, full precision)",
        "Small model with high batching. Good speed/accuracy balance. "
        "Comparable to our existing ggml-base.en whisper.cpp model."
    ),
    (
        "distil-large-v3", 12, None,
        "Distil-Large-V3 (batch=12, full precision)",
        "Large distilled model with moderate batching. Best accuracy "
        "at this speed tier. May need 8-16GB RAM."
    ),
    (
        "distil-large-v3", 12, "4bit",
        "Distil-Large-V3 (batch=12, 4-bit quantized)",
        "Same large model but quantized to 4-bit. Uses ~50% less memory "
        "with minimal accuracy loss. Good for machines with 8GB RAM."
    ),
]

RESULTS_FILE = os.path.join(RESULTS_DIR, "lightning-whisper-mlx-benchmark-results.md")


# ============================================================
# LIGHTNING-WHISPER-MLX ENGINE WRAPPER
# ============================================================

class LightningWhisperEngine:
    """
    Wraps the LightningWhisperMLX library for benchmarking.
    
    WHY A SEPARATE WRAPPER (vs reusing MlxWhisperEngine):
    LightningWhisperMLX has a different API — it uses a class
    instance with .transcribe() method rather than a standalone
    function. It also has batch_size and quant parameters that
    mlx-whisper doesn't. Different enough to warrant its own
    wrapper for clean testing.
    
    IMPORTANT: The vayu-whisper package installs as `whisper_mlx`
    in Python, NOT `vayu_whisper`. The import is:
      from whisper_mlx import LightningWhisperMLX
    """
    
    def __init__(self, model_name, batch_size=12, quant=None):
        """
        Initialize the Lightning Whisper engine.
        
        Args:
            model_name: Short model name (e.g. "tiny.en", "distil-large-v3")
            batch_size: Parallel decoding batch size (higher = faster, more RAM)
            quant: Quantization level (None or "4bit")
        """
        self.model_name = model_name
        self.batch_size = batch_size
        self.quant = quant
        self.whisper = None
        self.load_time = None
    
    def warmup(self):
        """
        Load the model and run a warmup inference.
        
        The LightningWhisperMLX constructor downloads and loads
        the model. First inference may also trigger compilation.
        We measure both to report cold-start time.
        """
        try:
            from whisper_mlx import LightningWhisperMLX
        except ImportError:
            log_fail("vayu-whisper not installed. Run: pip install vayu-whisper")
            log(f"  Then: python -m whisper_mlx.assets.download_assets")
            return False
        
        log(f"  Loading model: {self.model_name} (batch={self.batch_size}, quant={self.quant})")
        
        start = time.time()
        try:
            kwargs = {
                "model": self.model_name,
                "batch_size": self.batch_size,
            }
            if self.quant:
                kwargs["quant"] = self.quant
            
            self.whisper = LightningWhisperMLX(**kwargs)
            
            # Warmup inference with a tiny silent file
            warmup_path = os.path.join(TMP_DIR, "lightning_warmup.wav")
            import numpy as np
            silence = np.zeros(SAMPLE_RATE_WHISPER, dtype=np.float32)
            save_audio_to_wav(silence, warmup_path)
            
            self.whisper.transcribe(warmup_path, language="en")
            
            self.load_time = time.time() - start
            log(f"  Model ready in {self.load_time:.1f}s")
            
            if os.path.exists(warmup_path):
                os.unlink(warmup_path)
            
            return True
            
        except Exception as e:
            log_fail(f"Model load failed: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def transcribe_file(self, wav_path):
        """
        Transcribe a WAV file. Returns (text, inference_time).
        
        Uses the LightningWhisperMLX.transcribe() method which
        internally handles batched decoding for speed.
        """
        if not self.whisper:
            return "ERROR: Model not loaded", 0
        
        start = time.time()
        result = self.whisper.transcribe(
            wav_path,
            language="en"
        )
        inference_time = time.time() - start
        
        text = result.get("text", "").strip()
        return text, inference_time
    
    def transcribe_audio_array(self, audio_float32):
        """
        Transcribe from a numpy array by saving to temp file.
        Same file-based workaround as mlx-whisper.
        """
        tmp_path = os.path.join(TMP_DIR, f"lightning_chunk_{os.getpid()}.wav")
        save_audio_to_wav(audio_float32, tmp_path)
        
        try:
            return self.transcribe_file(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)


# ============================================================
# TEST SCENARIOS
# ============================================================

def run_file_benchmark(engine, md, display_name, scenarios):
    """
    File-based transcription benchmark — same approach as
    mlx-whisper test for direct comparison.
    
    Pre-renders speech to WAV via `say`, then measures pure
    inference time for each model configuration.
    """
    md.add_table_header([
        "Scenario", "Expected", "Got", "Accuracy",
        "WER", "Inference", "Audio Dur", "RTF"
    ])
    
    for scenario in scenarios:
        log(f"\n  Testing: {scenario.name}")
        
        wav_path = os.path.join(TMP_DIR, f"lightning_bench_{scenario.name.replace(' ', '_')}.wav")
        say_to_wav_file(scenario.text, wav_path, rate=scenario.rate)
        
        import wave
        with wave.open(wav_path, 'r') as wf:
            audio_duration = wf.getnframes() / wf.getframerate()
        
        try:
            text, inference_time = engine.transcribe_file(wav_path)
        except Exception as e:
            log_fail(f"Error: {e}")
            text = f"ERROR: {e}"
            inference_time = 0
        
        acc = word_accuracy(scenario.text, text)
        wer = word_error_rate(scenario.text, text)
        rtf = inference_time / audio_duration if audio_duration > 0 else 999
        
        acc_color = C.GREEN if acc >= 0.8 else C.YELLOW if acc >= 0.5 else C.RED
        rtf_color = C.GREEN if rtf < 1.0 else C.YELLOW if rtf < 2.0 else C.RED
        log(f"    {acc_color}{acc*100:.0f}% acc{C.NC} | "
            f"{rtf_color}RTF={rtf:.2f}{C.NC} | "
            f"'{text[:50]}'")
        
        md.add_table_row([
            scenario.name,
            f"`{scenario.text[:40]}{'...' if len(scenario.text) > 40 else ''}`",
            f"`{text[:40]}{'...' if len(text) > 40 else ''}`",
            f"{acc*100:.0f}%",
            f"{wer:.2f}",
            f"{inference_time:.2f}s",
            f"{audio_duration:.1f}s",
            f"{rtf:.2f}"
        ])
        
        if os.path.exists(wav_path):
            os.unlink(wav_path)
    
    md.add_newline()


def run_chunked_realtime(engine, md, chunk_duration=3.0):
    """
    Chunked real-time simulation — same approach as mlx-whisper
    test. Records audio from mic while say plays, transcribes
    the chunk, measures total latency.
    """
    md.add_section(f"Chunked Realtime ({chunk_duration}s chunks)")
    md.add_table_header([
        "Phrase", "Got", "Accuracy", "Total Latency", "Inference"
    ])
    
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
            transcribed, inference_time = engine.transcribe_audio_array(audio)
        except Exception as e:
            log_fail(f"Error: {e}")
            transcribed = f"ERROR"
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
    log_section("LIGHTNING-WHISPER-MLX (vayu-whisper) BENCHMARK")
    
    ensure_directories()
    
    # Check installation
    try:
        from whisper_mlx import LightningWhisperMLX
        log_pass("vayu-whisper (whisper_mlx) found")
    except ImportError:
        log_fail("vayu-whisper NOT installed.")
        print(f"\n{C.YELLOW}To install:{C.NC}")
        print("  pip install vayu-whisper")
        print("  python -m whisper_mlx.assets.download_assets")
        print("  brew install ffmpeg portaudio")
        print("  pip install pyaudio numpy soundfile")
        sys.exit(1)
    
    if not check_numpy_available():
        sys.exit(1)
    
    # Initialize results
    md = MarkdownResultWriter(
        RESULTS_FILE,
        "Lightning-Whisper-MLX Benchmark Results",
        "LightningWhisperMLX (vayu-whisper)"
    )
    
    md.add_text(
        "**What**: Benchmarking LightningWhisperMLX for real-time transcription.\n\n"
        "**Why**: LightningWhisperMLX adds batched decoding (3-10x faster than vanilla "
        "mlx-whisper) and 4-bit quantization. This could make even large Whisper models "
        "viable for real-time use on Apple Silicon.\n\n"
        "**Key Differentiator**: Batched beam search decoding — instead of decoding one "
        "token at a time, it decodes multiple tokens in parallel using Apple Silicon's "
        "GPU, dramatically reducing inference time."
    )
    
    # ========================================================
    # Model Loading Benchmark
    # ========================================================
    log_section("MODEL LOADING TIME")
    md.add_section("Model Loading Time")
    md.add_table_header(["Config", "Load Time", "Description"])
    
    for model_name, batch_size, quant, display_name, description in LIGHTNING_CONFIGS:
        log(f"\n  Loading: {display_name}")
        engine = LightningWhisperEngine(model_name, batch_size, quant)
        start = time.time()
        success = engine.warmup()
        load_time = time.time() - start
        
        if success:
            md.add_table_row([display_name, f"{load_time:.1f}s", description[:60]])
        else:
            md.add_table_row([display_name, "FAILED", description[:60]])
    
    md.add_newline()
    
    # ========================================================
    # File-Based Benchmark for each config
    # ========================================================
    for model_name, batch_size, quant, display_name, description in LIGHTNING_CONFIGS:
        log_section(f"FILE BENCHMARK: {display_name}")
        
        engine = LightningWhisperEngine(model_name, batch_size, quant)
        if not engine.warmup():
            log_warn(f"Skipping {display_name}")
            continue
        
        md.add_section(f"File Benchmark: {display_name}")
        md.add_text(f"Model: `{model_name}`, batch_size={batch_size}, quant={quant or 'none'}")
        md.add_text(description)
        
        run_file_benchmark(engine, md, display_name, STANDARD_SCENARIOS)
    
    # ========================================================
    # Chunked Realtime (tiny and base only)
    # ========================================================
    if check_pyaudio_available():
        for model_name, batch_size, quant, display_name, _ in LIGHTNING_CONFIGS[:2]:
            for chunk_dur in [2.0, 3.0, 5.0]:
                log_section(f"CHUNKED REALTIME: {display_name} ({chunk_dur}s)")
                engine = LightningWhisperEngine(model_name, batch_size, quant)
                engine.warmup()
                run_chunked_realtime(engine, md, chunk_duration=chunk_dur)
    else:
        md.add_section("Chunked Realtime (SKIPPED — no PyAudio)")
    
    # ========================================================
    # Summary
    # ========================================================
    md.add_section("Summary")
    md.add_text(
        "**Comparison Points:**\n"
        "1. Does batched decoding actually achieve the claimed 3-10x speedup vs mlx-whisper?\n"
        "2. Does 4-bit quantization meaningfully reduce quality?\n"
        "3. Can distil-large-v3 with batching achieve RTF < 1.0 (real-time)?\n"
        "4. What's the optimal batch_size for each model on this hardware?"
    )
    
    log_section("BENCHMARK COMPLETE")
    log(f"Results saved to: {RESULTS_FILE}")
    
    announce_completion(
        "Lightning Whisper M L X",
        "Compare with mlx-whisper results for speedup analysis."
    )


if __name__ == "__main__":
    main()
