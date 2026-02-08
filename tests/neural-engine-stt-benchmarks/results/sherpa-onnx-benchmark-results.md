# Sherpa-ONNX Streaming Transcription Benchmark

**Generated**: 2026-02-07 18:14:41
**Engine**: sherpa-onnx (ONNX Runtime)
**Platform**: macOS on Apple Silicon
**Goal**: Evaluate real-time transcription capability via Neural Engine / MLX

---

**What**: Benchmarking sherpa-onnx for real-time streaming transcription.

**Why**: sherpa-onnx is the ONLY engine in our test set with true streaming support. While it doesn't use Apple's Neural Engine (runs on CPU via ONNX Runtime), its streaming architecture means it can produce partial results with very low latency — potentially faster first-result than any Whisper-based approach.

**Key Advantage**: Streaming Zipformer model processes audio in ~100ms chunks and emits partial results incrementally, similar to Apple's SpeechAnalyzer but fully open source.


## Model: Zipformer Streaming EN (2024-06-24)

Streaming Zipformer model trained for English ASR. Zipformer is a next-gen Conformer variant designed for streaming from the ground up. Should have the lowest latency of any model in this benchmark since it processes audio in tiny chunks incrementally.


## Scenario A: Streaming Latency (First Partial Result)

Measures time to first partial transcription result. This is the most important metric for real-time voice AI. Audio is fed in 100ms chunks to simulate real-time input.


| Scenario | Expected | Got (Final) | Accuracy | First Partial At | Total Time | Num Partials |
| --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Counting 1-10 | `one two three four five six seven eight ...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Tongue Twister | `She sells seashells by the seashore` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Technical Terms | `The API returns a JSON response with sta...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |
| Fast Speech | `one two three four five six seven eight ...` | `ERROR: 'str' object has no attribute 'te...` | 0% | N/A | 0.00s | 0 |


## Scenario B: Live Microphone Streaming

Records from mic while `say` plays audio. The streaming recognizer processes audio chunks in real-time. This tests the full pipeline: speakers → mic → STT engine.


| Phrase | Got | Accuracy | First Partial | Total Partials | Total Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `ERROR` | 0% | N/A | 0 | 1.7s |
| `one two three four five` | `ERROR` | 0% | N/A | 0 | 2.7s |
| `The quick brown fox jumps over the lazy dog` | `ERROR` | 0% | N/A | 0 | 3.7s |


## Model: Whisper Tiny EN (ONNX)

OpenAI Whisper Tiny model converted to ONNX format. Non-streaming — needs complete audio chunk before inference. Included for comparison with the MLX-based Whisper tests to see how ONNX Runtime compares to MLX on Apple Silicon.


## Scenario A: Streaming Latency (First Partial Result)

Measures time to first partial transcription result. This is the most important metric for real-time voice AI. Audio is fed in 100ms chunks to simulate real-time input.


| Scenario | Expected | Got (Final) | Accuracy | First Partial At | Total Time | Num Partials |
| --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `Hello?` | 100% | 0.044s | 0.04s | 1 |
| Counting 1-10 | `one two three four five six seven eight ...` | `1-2-3-4-5-6-7-8-9-10` | 0% | 0.109s | 0.11s | 1 |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `quick brown fox jumps over the lazy dog.` | 100% | 0.073s | 0.07s | 1 |
| Tongue Twister | `She sells seashells by the seashore` | `she sells seashells by the seashore.` | 100% | 0.076s | 0.08s | 1 |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `How much would a wood-shuck of a wood-sh...` | 78% | 0.105s | 0.10s | 1 |
| Technical Terms | `The API returns a JSON response with sta...` | `The API returns a JSON response with sta...` | 100% | 0.082s | 0.08s | 1 |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `Today is a beautiful day. The sun is shi...` | 100% | 0.221s | 0.22s | 1 |
| Fast Speech | `one two three four five six seven eight ...` | `1-2-3-4-5-6` | 0% | 0.078s | 0.08s | 1 |


## Scenario B: Live Microphone Streaming

Records from mic while `say` plays audio. The streaming recognizer processes audio chunks in real-time. This tests the full pipeline: speakers → mic → STT engine.


| Phrase | Got | Accuracy | First Partial | Total Partials | Total Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `Hello world.` | 100% | 0.07s | 1 | 4.2s |
| `one two three four five` | `1, 2, 3, 4, 5 1, 2, 3, 4, 5 1, 2, 3, 4, ` | 0% | 0.18s | 1 | 6.3s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 0.10s | 1 | 8.3s |


## Summary

**Key Questions Answered:**
1. How fast is first-partial-result with streaming Zipformer?
2. How does streaming Zipformer accuracy compare to Whisper?
3. Is ONNX Runtime on CPU fast enough for real-time on Apple Silicon?
4. Does true streaming give meaningfully lower latency than chunked Whisper?

