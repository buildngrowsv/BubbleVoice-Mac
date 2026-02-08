# WhisperKit + Echo Cancellation Benchmark

**Generated**: 2026-02-07 19:24:57
**Engine**: WhisperKit (Argmax) — CoreML / Neural Engine
**Platform**: macOS on Apple Silicon
**Test Method**: External English video playing nearby as speech source

---

**Test method**: An English learning video plays from an external device near the Mac's microphone, providing continuous real human speech. This avoids the `say` command contamination issue from V1 tests where TTS voices playing during echo/interruption tests produced unreliable results.

**Echo test approach**: While external video speech plays (representing user), `say` TTS plays distinctive phrases (representing AI response). Good echo cancellation should filter the `say` output while keeping the external video speech.


## Model: tiny.en

Tiny English — smallest/fastest, ~75MB, CoreML/ANE optimized

- **Load time**: 29.0s


## Scenario 1: File-Based Inference Speed

Pre-rendered `say` audio transcribed from WAV files. No mic involved. Measures pure CoreML/Neural Engine inference speed.

| Test | Expected | Got | Accuracy | Time | RTF |
| --- | --- | --- | --- | --- | --- |
| Short | `hello` | `` | 0% | 0.32s | 0.66 |
| Counting | `one two three four five six seven e` | `1-2-3-4-5-6-7-8-9-10.` | 0% | 0.09s | 0.03 |
| Sentence | `The quick brown fox jumps over the ` | `quick brown fox jumps over the lazy` | 100% | 0.05s | 0.02 |
| Technical | `The API returns a JSON response wit` | `The API returns a JSON response wit` | 100% | 0.05s | 0.01 |
| Paragraph | `Today is a beautiful day. The sun i` | `Today is a beautiful day. The sun i` | 100% | 0.09s | 0.01 |


## Scenario 2: Passive Listening (External Video)

Records ambient speech from external English video for 8s per test. No `say` TTS playing. Tests if each AEC mode affects external audio pickup.

| AEC Mode | Transcribed Text | Word Count | Inference Time |
| --- | --- | --- | --- |
| No AEC (Raw Mic) | `or Pittsburgh, but by the time my great grandma came, they w` | 14 | 0.10s |
| Apple Voice Processing IO | `Can you help me to find a new wife from our hometown that wi` | 28 | 0.11s |
| Energy VAD Gate | ERROR: The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error -10868.) | 0 | N/A |

**Key question**: Does Voice Processing IO filter out the external video speech? If so, it may be too aggressive for our use case where the 'user' audio comes through external speakers.


## Scenario 3: Echo Cancellation — TTS During External Speech

External video plays (simulating user speech) while `say` TTS plays simultaneously (simulating AI response). For each AEC mode, we check:
- Does the transcription contain the TTS text? (echo = BAD)
- Does the transcription contain external video speech? (user = GOOD)
- Is the transcription empty/blank? (too aggressive = BAD)

- **TTS text played during test**: `The capital of France is Paris and the capital of Japan is Tokyo`

| AEC Mode | Transcribed | TTS Echo Found? | External Speech Found? | Assessment |
| --- | --- | --- | --- | --- |
| No AEC (Raw Mic) | ERROR | N/A | N/A | FAILED |
| Apple Voice Processing IO | `In the US, the right size and everything for his f` | NO | YES (20 words) | IDEAL — echo filtered, external speech kept |
| Energy VAD Gate | ERROR | N/A | N/A | FAILED |


## Scenario 4: Interruption — AI Stops Mid-Response

External video plays continuously. `say` TTS starts (AI responding), then TTS is killed after 3 seconds (user interrupts). We record the whole sequence and check what was transcribed.

**Ideal**: External speech captured throughout, TTS echo filtered.


#### No AEC (Raw Mic)

- **Full transcription**: ``
- **Word count**: 0
- **AI echo detected**: NO (good)
- **Has meaningful content**: NO
- **Inference time**: 0.00s


#### Apple Voice Processing IO

- **Full transcription**: `window and a woman walked by and he said, "Oh, that's the woman I want to marry." Was that his mail order bride?`
- **Word count**: 23
- **AI echo detected**: NO (good)
- **Has meaningful content**: YES
- **Inference time**: 0.12s


#### Energy VAD Gate

- **Full transcription**: `that it was not a sister. Let me explain in detail how machine learned. She said, "Oh, it's all."`
- **Word count**: 19
- **AI echo detected**: YES: machine
- **Has meaningful content**: YES
- **Inference time**: 0.12s


## Scenario 5: Rapid Start/Stop Resilience

5 rapid audio engine start→stop cycles (200ms each). Tests if WhisperKit + AVAudioEngine crashes. Our production SpeechAnalyzer helper had SIGTRAP crashes from this pattern.

| Cycle | Result |
| --- | --- |
| 1 | OK |
| 2 | OK |
| 3 | OK |
| 4 | OK |
| 5 | OK |

- **Post-cycle alive**: YES
- **Post-cycle transcription**: `little vague because this is going back quite sometimes. Exc`


## Model: base.en

Base English — good balance, ~140MB, CoreML/ANE optimized

- **Load time**: 2.1s


## Scenario 1: File-Based Inference Speed

Pre-rendered `say` audio transcribed from WAV files. No mic involved. Measures pure CoreML/Neural Engine inference speed.

| Test | Expected | Got | Accuracy | Time | RTF |
| --- | --- | --- | --- | --- | --- |
| Short | `hello` | `` | 0% | 0.33s | 0.67 |
| Counting | `one two three four five six seven e` | `1-2-3-4-5-6-7-8-9-10` | 0% | 0.10s | 0.03 |
| Sentence | `The quick brown fox jumps over the ` | `The quick brown fox jumps over the ` | 100% | 0.07s | 0.03 |
| Technical | `The API returns a JSON response wit` | `The API returns a JSON response wit` | 100% | 0.07s | 0.02 |
| Paragraph | `Today is a beautiful day. The sun i` | `Today is a beautiful day. The sun i` | 100% | 0.15s | 0.02 |


## Scenario 2: Passive Listening (External Video)

Records ambient speech from external English video for 8s per test. No `say` TTS playing. Tests if each AEC mode affects external audio pickup.

| AEC Mode | Transcribed Text | Word Count | Inference Time |
| --- | --- | --- | --- |
| No AEC (Raw Mic) | `supposed to be wife. So he married her. Her name was Antoine` | 25 | 0.19s |
| Apple Voice Processing IO | `Farmers, I'm sure that was a really hard life and that could` | 26 | 0.15s |
| Energy VAD Gate | ERROR: The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error -10868.) | 0 | N/A |

**Key question**: Does Voice Processing IO filter out the external video speech? If so, it may be too aggressive for our use case where the 'user' audio comes through external speakers.


## Scenario 3: Echo Cancellation — TTS During External Speech

External video plays (simulating user speech) while `say` TTS plays simultaneously (simulating AI response). For each AEC mode, we check:
- Does the transcription contain the TTS text? (echo = BAD)
- Does the transcription contain external video speech? (user = GOOD)
- Is the transcription empty/blank? (too aggressive = BAD)

- **TTS text played during test**: `The capital of France is Paris and the capital of Japan is Tokyo`

| AEC Mode | Transcribed | TTS Echo Found? | External Speech Found? | Assessment |
| --- | --- | --- | --- | --- |
| No AEC (Raw Mic) | ERROR | N/A | N/A | FAILED |
| Apple Voice Processing IO | `Because otherwise I would not be here. That's a or` | NO | YES (28 words) | IDEAL — echo filtered, external speech kept |
| Energy VAD Gate | `The capital of France is Paris and the capital of ` | YES (paris, tokyo, france, japan, capital) | YES (13 words) | NO ECHO CANCEL — both captured |


## Scenario 4: Interruption — AI Stops Mid-Response

External video plays continuously. `say` TTS starts (AI responding), then TTS is killed after 3 seconds (user interrupts). We record the whole sequence and check what was transcribed.

**Ideal**: External speech captured throughout, TTS echo filtered.


#### No AEC (Raw Mic)

- **Full transcription**: `"Viers hurt. Oh, she was so amazing. Oh, yeah, she just had so much fun." Let me explain in detail how she was learning. "She was a survivor."`
- **Word count**: 28
- **AI echo detected**: YES: learning
- **Has meaningful content**: YES
- **Inference time**: 0.20s


#### Apple Voice Processing IO

- **Full transcription**: `Emily, I'm sure everyone has those as well, so I want to ask you the same question. Let us know in the comments what's an interesting story or an interesting story.`
- **Word count**: 31
- **AI echo detected**: NO (good)
- **Has meaningful content**: YES
- **Inference time**: 0.19s


#### Energy VAD Gate

- **Result**: FAILED: The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error -10868.)

## Scenario 5: Rapid Start/Stop Resilience

5 rapid audio engine start→stop cycles (200ms each). Tests if WhisperKit + AVAudioEngine crashes. Our production SpeechAnalyzer helper had SIGTRAP crashes from this pattern.

| Cycle | Result |
| --- | --- |
| 1 | OK |
| 2 | OK |
| 3 | OK |
| 4 | OK |
| 5 | OK |

- **Post-cycle alive**: YES
- **Post-cycle transcription**: `It's something that you did as a child that you`


## Summary & Recommendations

**Key findings to compare:**
1. WhisperKit file-based RTF vs Lightning-Whisper-MLX (both use CoreML)
2. Voice Processing IO: Does it effectively cancel `say` TTS while keeping external speech?
3. Energy VAD gate: Does it provide any echo reduction vs raw mic?
4. Rapid start/stop: Any crashes? (Our SpeechAnalyzer helper had SIGTRAP issues)
5. Overall: Is WhisperKit viable as a SpeechAnalyzer replacement?

