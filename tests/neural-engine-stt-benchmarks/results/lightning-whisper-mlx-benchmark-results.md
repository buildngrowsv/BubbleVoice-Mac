# Lightning-Whisper-MLX Benchmark Results

**Generated**: 2026-02-07 18:11:49
**Engine**: LightningWhisperMLX (vayu-whisper)
**Platform**: macOS on Apple Silicon
**Goal**: Evaluate real-time transcription capability via Neural Engine / MLX

---

**What**: Benchmarking LightningWhisperMLX for real-time transcription.

**Why**: LightningWhisperMLX adds batched decoding (3-10x faster than vanilla mlx-whisper) and 4-bit quantization. This could make even large Whisper models viable for real-time use on Apple Silicon.

**Key Differentiator**: Batched beam search decoding — instead of decoding one token at a time, it decodes multiple tokens in parallel using Apple Silicon's GPU, dramatically reducing inference time.


## Model Loading Time

| Config | Load Time | Description |
| --- | --- | --- |
| Tiny (batch=32, full precision) | 2.8s | Smallest model with maximum batching. Should be extremely fa |
| Base (batch=24, full precision) | 2.8s | Small model with high batching. Good speed/accuracy balance. |
| Distil-Large-V3 (batch=12, full precision) | 0.6s | Large distilled model with moderate batching. Best accuracy  |
| Distil-Large-V3 (batch=12, 4-bit quantized) | FAILED | Same large model but quantized to 4-bit. Uses ~50% less memo |


## File Benchmark: Tiny (batch=32, full precision)

Model: `tiny.en`, batch_size=32, quant=none

Smallest model with maximum batching. Should be extremely fast. This tests the lower bound of inference time.

| Scenario | Expected | Got | Accuracy | WER | Inference | Audio Dur | RTF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `Hello.` | 100% | 0.00 | 0.04s | 0.5s | 0.09 |
| Counting 1-10 | `one two three four five six seven eight ...` | `1-2-3-4-5-6-7-8-9-10.` | 0% | 1.00 | 0.06s | 3.3s | 0.02 |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `quick brown fox jumps over the lazy dog.` | 100% | 0.11 | 0.05s | 2.7s | 0.02 |
| Tongue Twister | `She sells seashells by the seashore` | `she sells seashells by the seashore.` | 100% | 0.00 | 0.05s | 1.9s | 0.03 |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `How much woodwood or wood chuck of a woo...` | 67% | 0.54 | 0.06s | 3.2s | 0.02 |
| Technical Terms | `The API returns a JSON response with sta...` | `The API returns a JSON response with sta...` | 100% | 0.00 | 0.05s | 3.8s | 0.01 |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `Today is a beautiful day. The sun is shi...` | 100% | 0.00 | 0.10s | 10.9s | 0.01 |
| Fast Speech | `one two three four five six seven eight ...` | `1-2-3-4-5-6-7-8-9-10.` | 0% | 1.00 | 0.07s | 2.0s | 0.03 |


## File Benchmark: Base (batch=24, full precision)

Model: `base.en`, batch_size=24, quant=none

Small model with high batching. Good speed/accuracy balance. Comparable to our existing ggml-base.en whisper.cpp model.

| Scenario | Expected | Got | Accuracy | WER | Inference | Audio Dur | RTF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `Hello.` | 100% | 0.00 | 0.05s | 0.5s | 0.10 |
| Counting 1-10 | `one two three four five six seven eight ...` | `1 2 3 4 5 6 7 8 9 10` | 0% | 1.00 | 0.06s | 3.3s | 0.02 |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `The quick brown fox jumps over the lazy ...` | 100% | 0.00 | 0.06s | 2.7s | 0.02 |
| Tongue Twister | `She sells seashells by the seashore` | `She sells seashells by the seashore.` | 100% | 0.00 | 0.06s | 1.9s | 0.03 |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `How much would would a woodchuck chuck o...` | 89% | 0.15 | 0.07s | 3.2s | 0.02 |
| Technical Terms | `The API returns a JSON response with sta...` | `The API returns a JSON response with Sta...` | 100% | 0.00 | 0.06s | 3.8s | 0.02 |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `Today is a beautiful day. The sun is shi...` | 100% | 0.00 | 0.11s | 10.9s | 0.01 |
| Fast Speech | `one two three four five six seven eight ...` | `1-2-3-4-5-6-7-8-9-10.` | 0% | 1.00 | 0.08s | 2.0s | 0.04 |


## File Benchmark: Distil-Large-V3 (batch=12, full precision)

Model: `distil-large-v3`, batch_size=12, quant=none

Large distilled model with moderate batching. Best accuracy at this speed tier. May need 8-16GB RAM.

| Scenario | Expected | Got | Accuracy | WER | Inference | Audio Dur | RTF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `Hello.` | 100% | 0.00 | 0.23s | 0.5s | 0.47 |
| Counting 1-10 | `one two three four five six seven eight ...` | `1, 2, 3, 4, 5, 6, 7, 8, 910.` | 0% | 1.00 | 0.25s | 3.3s | 0.08 |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `The quick brown fox jumps over the lazy ...` | 100% | 0.00 | 0.25s | 2.7s | 0.09 |
| Tongue Twister | `She sells seashells by the seashore` | `She sells seashells by the seashore.` | 100% | 0.00 | 0.24s | 1.9s | 0.13 |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `How much wood would a woodchuck chuck if...` | 100% | 0.00 | 0.25s | 3.2s | 0.08 |
| Technical Terms | `The API returns a JSON response with sta...` | `The API returns a JSON response with sta...` | 100% | 0.00 | 0.24s | 3.8s | 0.06 |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `Today is a beautiful day. The sun is shi...` | 100% | 0.00 | 0.27s | 10.9s | 0.03 |
| Fast Speech | `one two three four five six seven eight ...` | `1, 2, 3, 4, 5, 6, 7, 8, 910.` | 0% | 1.00 | 0.26s | 2.0s | 0.13 |


## Chunked Realtime (2.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world!` | 100% | 4.3s | 0.05s |
| `one two three four five` | `1, 2, 3, 4, 5` | 0% | 4.3s | 0.06s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 4.3s | 0.07s |


## Chunked Realtime (3.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world.` | 100% | 5.3s | 0.06s |
| `one two three four five` | `1, 2, 3, 4, 5` | 0% | 5.4s | 0.07s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 5.3s | 0.06s |


## Chunked Realtime (5.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world.` | 100% | 7.3s | 0.06s |
| `one two three four five` | `1, 2, 3, 4, 5` | 0% | 7.4s | 0.08s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 7.3s | 0.07s |


## Chunked Realtime (2.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world!` | 100% | 4.3s | 0.05s |
| `one two three four five` | `1 2 3 4 5` | 0% | 4.3s | 0.07s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 4.3s | 0.08s |


## Chunked Realtime (3.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world!` | 100% | 5.3s | 0.06s |
| `one two three four five` | `1, 2, 3, 4, 5.` | 0% | 5.4s | 0.07s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 5.4s | 0.08s |


## Chunked Realtime (5.0s chunks)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `Hello world!` | 100% | 7.3s | 0.07s |
| `one two three four five` | `1, 2, 3, 4, 5.` | 0% | 7.3s | 0.06s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy ` | 100% | 7.4s | 0.08s |


## Summary

**Comparison Points:**
1. Does batched decoding actually achieve the claimed 3-10x speedup vs mlx-whisper?
2. Does 4-bit quantization meaningfully reduce quality?
3. Can distil-large-v3 with batching achieve RTF < 1.0 (real-time)?
4. What's the optimal batch_size for each model on this hardware?

