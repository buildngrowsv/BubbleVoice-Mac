# Neural Engine STT Benchmark — Combined Summary

**Generated**: 2026-02-07 18:17:24
**Total Runtime**: 516s
**Platform**: macOS on Apple Silicon
**Filter**: all

---

## Engine Test Results

| Engine | Status | Duration |
| --- | --- | --- |
| MLX-Whisper (Apple MLX) | PASS | 180s |
| Lightning-Whisper-MLX (vayu-whisper) | PASS | 172s |
| Sherpa-ONNX (Streaming) | PASS | 68s |
| Whisper.cpp + CoreML | PASS | 95s |

## Individual Results

See the detailed results for each engine:

- [MLX-Whisper Results](mlx-whisper-benchmark-results.md)
- [Lightning-Whisper-MLX Results](lightning-whisper-mlx-benchmark-results.md)
- [Sherpa-ONNX Results](sherpa-onnx-benchmark-results.md)
- [Whisper.cpp + CoreML Results](whisper-cpp-coreml-benchmark-results.md)

## Engine Comparison

### Speed Hierarchy (Expected)
1. **Lightning-Whisper-MLX** — Batched decoding on MLX, fastest Whisper inference
2. **MLX-Whisper** — Standard MLX Whisper, good speed
3. **Whisper.cpp + CoreML** — Neural Engine accelerated, competitive
4. **Sherpa-ONNX Zipformer** — True streaming, lowest first-partial latency
5. **Whisper.cpp (CPU only)** — Baseline, no acceleration

### Latency Hierarchy (Expected)
1. **Sherpa-ONNX Zipformer** — TRUE streaming, first partial in <0.5s
2. **Apple SpeechAnalyzer** — Our current solution, ~1-3s to first result
3. **Lightning-Whisper-MLX** — Chunked, latency = chunk_duration + fast_inference
4. **MLX-Whisper** — Chunked, latency = chunk_duration + inference
5. **Whisper.cpp** — Chunked, latency = chunk_duration + slower_inference

### Recommendation
Compare the RTF (Real-Time Factor) and first-partial-latency across engines
to determine the best candidate for replacing or supplementing SpeechAnalyzer
in the BubbleVoice-Mac voice pipeline.

