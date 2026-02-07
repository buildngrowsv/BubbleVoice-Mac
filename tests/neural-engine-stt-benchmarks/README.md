# Neural Engine STT Benchmark Suite

## Purpose

This benchmark suite evaluates **local speech-to-text engines** for real-time transcription on Apple Silicon, with a focus on Neural Engine / MLX / CoreML acceleration. The goal is to find the best alternative or complement to Apple's SpeechAnalyzer for our BubbleVoice-Mac voice AI app.

## Background & Research

We tested whisper.cpp with GGML models and Apple's SpeechAnalyzer (via our Swift helper). Both work, but we wanted to explore whether **Neural Engine optimized models** could achieve better real-time transcription performance.

### Research Findings (Feb 2026)

| Engine | Framework | Streaming | Neural Engine | Speed | Notes |
|--------|-----------|-----------|--------------|-------|-------|
| **Apple SpeechAnalyzer** | Native | Yes (partial) | Yes (ANE) | ~1-3s first result | Our current solution. Built into macOS 26+. |
| **MLX-Whisper** | Apple MLX | No (file-based) | No (GPU/CPU) | Varies by model | Apple's ML framework on unified memory. Good accuracy. |
| **Lightning-Whisper-MLX** | Apple MLX | No (file-based) | No (GPU/CPU) | 3-10x faster than mlx-whisper | Batched decoding + 4-bit quantization. |
| **Sherpa-ONNX** | ONNX Runtime | **Yes (true streaming)** | No (CPU) | Real-time viable | Only option with true streaming. Zipformer model. |
| **Whisper.cpp + CoreML** | CoreML/GGML | No (file-based) | **Yes (ANE for encoder)** | ~2-3x faster than CPU-only | Hybrid: CoreML encoder + GGML decoder. |
| **WhisperKit (Argmax)** | CoreML | Yes (streaming) | **Yes (ANE)** | Real-time capable | Swift-only, production-grade, CoreML native. |

### Key Insights

1. **Apple SpeechAnalyzer** (WWDC 2025) outperformed most Whisper variants in benchmarks (45s for a 34-min video vs 1:41 for MacWhisper Large V3 Turbo).

2. **MLX-Whisper** runs on Apple Silicon's unified memory via the MLX framework. It's file-based (no true streaming), so real-time requires chunked processing.

3. **Lightning-Whisper-MLX (vayu-whisper)** adds batched beam search decoding for 3-10x speedup over vanilla mlx-whisper. 4-bit quantization further reduces memory.

4. **Sherpa-ONNX** is the only option with TRUE streaming — it processes audio in ~100ms chunks and emits partial results incrementally, similar to SpeechAnalyzer.

5. **Whisper.cpp + CoreML** offloads the encoder to the Neural Engine for ~2-3x encoder speedup. First-load compilation can take minutes but is cached.

6. **WhisperKit** by Argmax is the most production-ready CoreML/ANE Whisper implementation. It's Swift-native and supports streaming. However, it requires Swift Package Manager integration (not a Python test).

## What We Test

For each engine, we measure:

- **RTF (Real-Time Factor)**: inference_time / audio_duration. RTF < 1.0 = faster than real-time.
- **First Partial Latency**: Time from speech start to first transcription output (streaming engines only).
- **Word Accuracy**: Percentage of expected words captured correctly.
- **WER (Word Error Rate)**: Standard ASR metric accounting for insertions, deletions, substitutions.
- **Model Load Time**: Cold-start time to load the model (important for app startup).

### Test Scenarios (consistent across all engines)

1. Single word ("hello")
2. Counting 1-10
3. Common sentence (pangram)
4. Tongue twister
5. Long sentence with repetition
6. Technical vocabulary
7. Multi-sentence paragraph
8. Fast speech (280 WPM)

These match our existing SpeechAnalyzer test scenarios in `test-stt-comprehensive.py` for direct comparison.

## Quick Start

### 1. Install System Dependencies

```bash
brew install portaudio ffmpeg cmake
```

### 2. Install Python Packages

```bash
pip install -r tests/neural-engine-stt-benchmarks/requirements.txt
```

### 3. Download Models & Build whisper.cpp

```bash
bash tests/neural-engine-stt-benchmarks/setup-models.sh
```

### 4. Run All Benchmarks

```bash
bash tests/neural-engine-stt-benchmarks/run-all-benchmarks.sh
```

Or run individual engines:

```bash
# MLX-Whisper (Apple MLX framework)
python3 tests/neural-engine-stt-benchmarks/test-mlx-whisper-realtime.py

# Lightning-Whisper-MLX (batched, 3-10x faster)
python3 tests/neural-engine-stt-benchmarks/test-lightning-whisper-mlx-realtime.py

# Sherpa-ONNX (true streaming)
python3 tests/neural-engine-stt-benchmarks/test-sherpa-onnx-realtime.py

# Whisper.cpp + CoreML (Neural Engine)
python3 tests/neural-engine-stt-benchmarks/test-whisper-cpp-coreml.py
```

### 5. View Results

Results are saved as markdown files in `tests/neural-engine-stt-benchmarks/results/`:

- `mlx-whisper-benchmark-results.md`
- `lightning-whisper-mlx-benchmark-results.md`
- `sherpa-onnx-benchmark-results.md`
- `whisper-cpp-coreml-benchmark-results.md`
- `COMBINED-BENCHMARK-SUMMARY.md`

## File Structure

```
tests/neural-engine-stt-benchmarks/
├── README.md                              # This file
├── requirements.txt                       # Python dependencies
├── setup-models.sh                        # Downloads models, builds whisper.cpp
├── run-all-benchmarks.sh                  # Orchestrator script
├── shared_test_utils.py                   # Common test infrastructure
├── test-mlx-whisper-realtime.py           # MLX-Whisper benchmark
├── test-lightning-whisper-mlx-realtime.py  # Lightning-Whisper-MLX benchmark
├── test-sherpa-onnx-realtime.py           # Sherpa-ONNX streaming benchmark
├── test-whisper-cpp-coreml.py             # Whisper.cpp + CoreML benchmark
└── results/                               # Generated benchmark results (markdown)
```

## Dependencies & Model Downloads

### What Gets Downloaded

| Item | Size | Where |
|------|------|-------|
| Sherpa-ONNX Streaming Zipformer | ~20MB | `tmp/neural-engine-models/sherpa-onnx/` |
| Sherpa-ONNX Whisper Tiny ONNX | ~75MB | `tmp/neural-engine-models/sherpa-onnx/` |
| whisper.cpp source + build | ~200MB | `tmp/neural-engine-models/whisper.cpp/` |
| MLX models (auto-download) | 75MB-756MB each | `~/.cache/huggingface/` |
| Existing GGML models | Already present | `tmp/whisper-models/` |

### What You Might Need Help With

- **CoreML model conversion**: Generating `.mlmodelc` files from GGML models requires additional Python packages (`ane_transformers`, `coremltools`, `openai-whisper`) and can take 5-30+ minutes per model. The setup script provides instructions but doesn't auto-run this step.

- **Large model downloads**: The `distil-whisper-large-v3` MLX model is ~756MB and downloads from HuggingFace on first use. Ensure you have good internet connectivity.

- **WhisperKit**: Not included in the Python benchmarks because it's Swift-native. If the benchmarks show promise for CoreML/ANE acceleration, WhisperKit would be the next step to evaluate as it provides a production-ready Swift API with streaming support.

## Relationship to Existing Tests

This benchmark suite complements our existing STT tests:

- `tests/test-stt-direct.py` — Tests the Swift helper + SpeechAnalyzer
- `tests/test-stt-comprehensive.py` — Comprehensive SpeechAnalyzer behavior tests
- `tests/run-stt-scenarios.sh` — Shell-based SpeechAnalyzer scenario runner
- `tests/neural-engine-stt-benchmarks/` — **THIS SUITE** — Tests alternative engines

The test scenarios and measurement methodology are consistent across all suites so results can be directly compared.
