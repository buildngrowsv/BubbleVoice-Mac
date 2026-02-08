# MLX-Whisper Real-Time Transcription Benchmark

**Generated**: 2026-02-07 18:08:53
**Engine**: mlx-whisper (Apple MLX Framework)
**Platform**: macOS on Apple Silicon
**Goal**: Evaluate real-time transcription capability via Neural Engine / MLX

---

**What**: Benchmarking mlx-whisper for real-time transcription on Apple Silicon.

**Why**: Evaluating if MLX-accelerated Whisper can match or beat Apple's SpeechAnalyzer for our voice AI app's STT pipeline. MLX uses Apple Silicon's unified memory and GPU for efficient inference without needing CoreML conversion.

**How**: Using macOS `say` command to generate speech through speakers, capturing via microphone, and measuring transcription latency and accuracy.


## Scenario C: Model Loading / First Inference Time

Time to load each model and run first inference. Models are cached locally after first download. This measures process-startup cold load, not download time.


| Model | Load + First Inference | Model Description |
| --- | --- | --- |
| Tiny (English) | FAILED | Smallest model (~75MB). Fastest inference but lower accuracy. Good for testing i |
| Base (English) | FAILED | Small model (~140MB). Good balance of speed and accuracy. This is roughly compar |
| Small (English) | FAILED | Medium model (~460MB). Noticeably more accurate than base, but inference takes l |
| Distil Large V3 | 33.6s | Distilled large model (~756MB). Best accuracy of the set. Uses knowledge distill |


## Model: Distil Large V3

**Repo**: `mlx-community/distil-whisper-large-v3`

**Description**: Distilled large model (~756MB). Best accuracy of the set. Uses knowledge distillation from large-v3 for faster inference while maintaining most of the accuracy. This is the recommended model for production use on Apple Silicon according to research.


## Scenario A: File-Based Transcription (Pure Inference)

Pre-recorded audio files transcribed by the model. This measures raw inference time without microphone capture overhead. Audio generated via macOS `say` command at 16kHz mono WAV.


| Scenario | Expected Text | Got | Word Accuracy | WER | Inference Time | Audio Duration | RTF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Short Word | `hello` | `Hello.` | 100% | 0.00 | 0.23s | 0.5s | 0.47 |
| Counting 1-10 | `one two three four five six seven eight nine ten` | `1, 2, 3, 4, 5, 6, 7, 8, 910.` | 0% | 1.00 | 0.26s | 3.3s | 0.08 |
| Common Sentence | `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog.` | 100% | 0.00 | 0.25s | 2.7s | 0.09 |
| Tongue Twister | `She sells seashells by the seashore` | `She sells seashells by the seashore.` | 100% | 0.00 | 0.25s | 1.9s | 0.13 |
| Long Sentence | `How much wood would a woodchuck chuck if a woodchu...` | `How much wood would a woodchuck chuck if a woodchu...` | 100% | 0.00 | 0.25s | 3.2s | 0.08 |
| Technical Terms | `The API returns a JSON response with status code 2...` | `The API returns a JSON response with status code 2...` | 100% | 0.00 | 0.26s | 3.8s | 0.07 |
| Long Paragraph | `Today is a beautiful day. The sun is shining and t...` | `Today is a beautiful day. The sun is shining and t...` | 100% | 0.00 | 0.28s | 10.9s | 0.03 |
| Fast Speech | `one two three four five six seven eight nine ten` | `1, 2, 3, 4, 5, 6, 7, 8, 910.` | 0% | 1.00 | 0.24s | 2.0s | 0.12 |

**RTF (Real-Time Factor)**: Inference time / audio duration. RTF < 1.0 means the model transcribes faster than real-time. RTF > 1.0 means it's slower than real-time and can't keep up with live audio.


## Scenario B: Chunked Real-Time Simulation (2.0s chunks)

Records 2.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 4.3s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 4.3s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 4.3s | 0.00s |


## Scenario B: Chunked Real-Time Simulation (3.0s chunks)

Records 3.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 5.3s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 5.4s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 5.3s | 0.00s |


## Scenario B: Chunked Real-Time Simulation (5.0s chunks)

Records 5.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 7.3s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 7.3s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 7.3s | 0.00s |


## Scenario B: Chunked Real-Time Simulation (2.0s chunks)

Records 2.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 4.3s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 4.3s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 4.3s | 0.00s |


## Scenario B: Chunked Real-Time Simulation (3.0s chunks)

Records 3.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 5.4s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 5.3s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 5.3s | 0.00s |


## Scenario B: Chunked Real-Time Simulation (5.0s chunks)

Records 5.0s audio chunks from mic, transcribes each. Measures end-to-end latency from speech start to transcription result. Uses macOS `say` command to generate test audio through speakers.


| Phrase | Expected | Got | Word Accuracy | Total Latency | Inference Time |
| --- | --- | --- | --- | --- | --- |
| `hello world` | `hello world` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 7.3s | 0.00s |
| `one two three four five` | `one two three four five` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 0% | 7.3s | 0.00s |
| `The quick brown fox jumps over the lazy dog` | `The quick brown fox jumps over the lazy dog` | `ERROR: 401 Client Error. (Request ID: Root=1-6987d` | 12% | 7.3s | 0.00s |


## Summary

**Key Questions Answered:**
1. Can mlx-whisper transcribe faster than real-time (RTF < 1.0)?
2. Which model size gives the best speed/accuracy tradeoff?
3. What chunk duration works best for pseudo-realtime?
4. How does latency compare to Apple SpeechAnalyzer (~1-3s first result)?

