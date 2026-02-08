# Whisper.cpp + CoreML Benchmark Results

**Generated**: 2026-02-07 18:15:48
**Engine**: whisper.cpp with CoreML/Neural Engine
**Platform**: macOS on Apple Silicon
**Goal**: Evaluate real-time transcription capability via Neural Engine / MLX

---

**What**: Benchmarking whisper.cpp with CoreML Neural Engine acceleration.

**Why**: We already use whisper.cpp GGML models. Adding CoreML support offloads the encoder to Apple's Neural Engine for ~2-3x speedup on the encoder portion. This is a direct upgrade path — same models, just faster execution.

**How**: Comparing CPU-only vs CoreML-accelerated inference on the same models (tiny, base, small) to quantify the Neural Engine benefit.

**Note**: CoreML models need first-time compilation which can take minutes. Subsequent loads use the cached compiled version.


## Model: Tiny EN (CPU only)

Smallest model, CPU-only baseline. Already available from prior testing.

| Scenario | Expected | Got | Accuracy | WER | Inference Time | Audio Duration | RTF | CoreML? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `` | 0% | 1.00 | 0.55s | 0.5s | 1.12 | Yes |
| Counting 1-10 | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.53s | 3.3s | 0.16 | Yes |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `` | 0% | 1.00 | 0.54s | 2.7s | 0.20 | Yes |
| Tongue Twister | `She sells seashells by the seashore` | `` | 0% | 1.00 | 0.53s | 1.9s | 0.28 | Yes |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `` | 0% | 1.00 | 0.54s | 3.2s | 0.17 | Yes |
| Technical Terms | `The API returns a JSON response with sta...` | `` | 0% | 1.00 | 0.53s | 3.8s | 0.14 | Yes |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `` | 0% | 1.00 | 0.55s | 10.9s | 0.05 | Yes |
| Fast Speech | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.54s | 2.0s | 0.27 | Yes |


## Chunked Realtime (3.0s)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `` | 0% | 5.9s | 0.55s |
| `one two three four five` | `` | 0% | 5.8s | 0.55s |
| `The quick brown fox jumps over the lazy dog` | `` | 0% | 5.8s | 0.54s |


## Tiny EN (CoreML/ANE) (SKIPPED — not available)

Model or binary not found. Run setup-models.sh to prepare.


## Model: Base EN (CPU only)

Small model, CPU-only baseline. Our current whisper.cpp test model.

| Scenario | Expected | Got | Accuracy | WER | Inference Time | Audio Duration | RTF | CoreML? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `` | 0% | 1.00 | 0.53s | 0.5s | 1.08 | Yes |
| Counting 1-10 | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.55s | 3.3s | 0.16 | Yes |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `` | 0% | 1.00 | 0.54s | 2.7s | 0.20 | Yes |
| Tongue Twister | `She sells seashells by the seashore` | `` | 0% | 1.00 | 0.54s | 1.9s | 0.29 | Yes |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `` | 0% | 1.00 | 0.54s | 3.2s | 0.17 | Yes |
| Technical Terms | `The API returns a JSON response with sta...` | `` | 0% | 1.00 | 0.54s | 3.8s | 0.14 | Yes |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `` | 0% | 1.00 | 0.54s | 10.9s | 0.05 | Yes |
| Fast Speech | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.54s | 2.0s | 0.27 | Yes |


## Chunked Realtime (3.0s)

| Phrase | Got | Accuracy | Total Latency | Inference |
| --- | --- | --- | --- | --- |
| `hello world` | `` | 0% | 5.8s | 0.55s |
| `one two three four five` | `` | 0% | 5.8s | 0.55s |
| `The quick brown fox jumps over the lazy dog` | `` | 0% | 5.9s | 0.56s |


## Base EN (CoreML/ANE) (SKIPPED — not available)

Model or binary not found. Run setup-models.sh to prepare.


## Model: Small EN (CPU only)

Medium model, CPU-only. Already available from prior testing.

| Scenario | Expected | Got | Accuracy | WER | Inference Time | Audio Duration | RTF | CoreML? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `` | 0% | 1.00 | 0.53s | 0.5s | 1.09 | Yes |
| Counting 1-10 | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.53s | 3.3s | 0.16 | Yes |
| Common Sentence | `The quick brown fox jumps over the lazy ...` | `` | 0% | 1.00 | 0.54s | 2.7s | 0.20 | Yes |
| Tongue Twister | `She sells seashells by the seashore` | `` | 0% | 1.00 | 0.54s | 1.9s | 0.29 | Yes |
| Long Sentence | `How much wood would a woodchuck chuck if...` | `` | 0% | 1.00 | 0.54s | 3.2s | 0.17 | Yes |
| Technical Terms | `The API returns a JSON response with sta...` | `` | 0% | 1.00 | 0.54s | 3.8s | 0.14 | Yes |
| Long Paragraph | `Today is a beautiful day. The sun is shi...` | `` | 0% | 1.00 | 0.54s | 10.9s | 0.05 | Yes |
| Fast Speech | `one two three four five six seven eight ...` | `` | 0% | 1.00 | 0.53s | 2.0s | 0.27 | Yes |


## Small EN (CoreML/ANE) (SKIPPED — not available)

Model or binary not found. Run setup-models.sh to prepare.


## CPU vs CoreML Comparison

**Key Questions:**
1. How much faster is CoreML/ANE vs CPU-only for each model size?
2. Is the first-load compilation time acceptable for an app?
3. Can CoreML whisper.cpp achieve RTF < 1.0 (real-time) for any model?
4. How does CoreML whisper.cpp compare to mlx-whisper and sherpa-onnx?

