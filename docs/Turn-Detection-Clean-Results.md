# Turn Detection — Clean Test Results (Session Reset Between Tests)

**Date**: 2026-02-07 16:17
**Method**: Fresh SpeechAnalyzer session per test (stop → clear → start)

---

## 1. Turn Length Variations

### Single Word: 'Yes'

- **Speech duration**: 1.35s
- **Total updates**: 0
- **Finals**: 0 (no finalized segments)

### Single Word: 'Stop'

- **Speech duration**: 1.46s
- **Total updates**: 3
- **First update latency**: 6.222s
- **Last update**: 6.232s after speech start
- **Finals (1)**: 
  - `Stop.`
- **Last text**: `Stop.`
- **Timeline**:
  ```
    6.222s [partial] Stop [audio:0.0-4.0s]
    6.222s [partial] Stop. [audio:0.0-4.0s]
    6.232s [FINAL  ] Stop. [audio:0.0-2.2s]
  ```

### Two Words: 'OK sure'

- **Speech duration**: 1.6s
- **Total updates**: 0
- **Finals**: 0 (no finalized segments)

### Short Phrase: 'I think so' (3 words)

- **Speech duration**: 1.66s
- **Total updates**: 0
- **Finals**: 0 (no finalized segments)

### Medium: 'Can you help me with something' (6 words)

- **Speech duration**: 2.0s
- **Total updates**: 8
- **First update latency**: 3.413s
- **Last update**: 3.435s after speech start
- **Finals (1)**: 
  - `Can you help me with something?`
- **Last text**: `Can you help me with something?`
- **Timeline**:
  ```
    3.413s [partial] Can [audio:0.0-4.0s]
    3.413s [partial] Can you [audio:0.0-4.0s]
    3.413s [partial] Can you help [audio:0.0-4.0s]
    3.413s [partial] Can you help me [audio:0.0-4.0s]
    3.413s [partial] Can you help me with [audio:0.0-4.0s]
    3.413s [partial] Can you help me with something [audio:0.0-4.0s]
    3.413s [partial] Can you help me with something? [audio:0.0-4.0s]
    3.435s [FINAL  ] Can you help me with something? [audio:0.0-2.8s]
  ```

### Sentence: 'I need to schedule a meeting for tomorrow afternoon' (9 words)

- **Speech duration**: 3.21s
- **Total updates**: 9
- **First update latency**: 3.411s
- **Last update**: 3.412s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I need to schedule a meeting for tomorrow afternoon`
- **Timeline**:
  ```
    3.411s [partial] I [audio:0.0-4.0s]
    3.411s [partial] I need [audio:0.0-4.0s]
    3.411s [partial] I need to [audio:0.0-4.0s]
    3.411s [partial] I need to schedule [audio:0.0-4.0s]
  ... (1 more partials) ...
    3.412s [partial] I need to schedule a meeting [audio:0.0-4.0s]
    3.412s [partial] I need to schedule a meeting for [audio:0.0-4.0s]
    3.412s [partial] I need to schedule a meeting for tomorrow [audio:0.0-4.0s]
    3.412s [partial] I need to schedule a meeting for tomorrow afternoon [audio:0.0-4.0s]
  ```

### Long: 'I was thinking we could go to that new restaurant downtown since we have not been there yet' (18 words)

- **Speech duration**: 5.46s
- **Total updates**: 10
- **First update latency**: 3.41s
- **Last update**: 3.412s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I was thinking we could go to that new restaurant`
- **Timeline**:
  ```
    3.410s [partial] I [audio:0.0-4.0s]
    3.410s [partial] I was [audio:0.0-4.0s]
    3.410s [partial] I was thinking [audio:0.0-4.0s]
    3.411s [partial] I was thinking we [audio:0.0-4.0s]
  ... (2 more partials) ...
    3.411s [partial] I was thinking we could go to [audio:0.0-4.0s]
    3.411s [partial] I was thinking we could go to that [audio:0.0-4.0s]
    3.411s [partial] I was thinking we could go to that new [audio:0.0-4.0s]
    3.412s [partial] I was thinking we could go to that new restaurant [audio:0.0-4.0s]
  ```


---

## 2. Sentence Boundary Detection

### Two sentences: period

- **Speech duration**: 3.45s
- **Total updates**: 13
- **First update latency**: 3.414s
- **Last update**: 3.435s after speech start
- **Finals (1)**: 
  - `The sun is shining.`
- **Last text**: ` It is a beautiful day`
- **Timeline**:
  ```
    3.414s [partial] The [audio:0.0-4.0s]
    3.414s [partial] The sun [audio:0.0-4.0s]
    3.414s [partial] The sun is [audio:0.0-4.0s]
    3.414s [partial] The sun is sh [audio:0.0-4.0s]
  ... (5 more partials) ...
    3.434s [FINAL  ] The sun is shining. [audio:0.0-2.6s]
    3.435s [partial]  It is [audio:2.7-4.0s]
    3.435s [partial]  It is a [audio:2.7-4.0s]
    3.435s [partial]  It is a beautiful [audio:2.7-4.0s]
    3.435s [partial]  It is a beautiful day [audio:2.7-4.0s]
  ```

### Two sentences: question + statement

- **Speech duration**: 3.15s
- **Total updates**: 12
- **First update latency**: 3.522s
- **Last update**: 3.539s after speech start
- **Finals (1)**: 
  - `How are you doing?`
- **Last text**: ` I hope you are well.`
- **Timeline**:
  ```
    3.522s [partial] How [audio:0.0-4.0s]
    3.522s [partial] How are [audio:0.0-4.0s]
    3.522s [partial] How are you [audio:0.0-4.0s]
    3.522s [partial] How are you doing [audio:0.0-4.0s]
  ... (4 more partials) ...
    3.539s [FINAL  ] How are you doing? [audio:0.0-2.3s]
    3.539s [partial]  I hope you [audio:2.3-4.0s]
    3.539s [partial]  I hope you are [audio:2.3-4.0s]
    3.539s [partial]  I hope you are well [audio:2.3-4.0s]
    3.539s [partial]  I hope you are well. [audio:2.3-4.0s]
  ```

### Three sentences with exclamation

- **Speech duration**: 3.44s
- **Total updates**: 10
- **First update latency**: 3.513s
- **Last update**: 3.537s after speech start
- **Finals (1)**: 
  - `Wow, that is incredible.`
- **Last text**: ` I love`
- **Timeline**:
  ```
    3.513s [partial] Wow [audio:0.0-4.0s]
    3.513s [partial] Wow, [audio:0.0-4.0s]
    3.513s [partial] Wow, that [audio:0.0-4.0s]
    3.513s [partial] Wow, that is [audio:0.0-4.0s]
  ... (2 more partials) ...
    3.514s [partial] Wow, that is incredible. [audio:0.0-4.0s]
    3.537s [FINAL  ] Wow, that is incredible. [audio:0.0-3.1s]
    3.537s [partial]  I [audio:3.1-4.0s]
    3.537s [partial]  I love [audio:3.1-4.0s]
  ```

### Long compound sentence (no sentence break)

- **Speech duration**: 6.8s
- **Total updates**: 25
- **First update latency**: 3.422s
- **Last update**: 7.229s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I went to the store and bought some milk, and then I came home and made dinner, `
- **Timeline**:
  ```
    3.422s [partial] I [audio:0.0-4.0s]
    3.422s [partial] I went [audio:0.0-4.0s]
    3.422s [partial] I went to [audio:0.0-4.0s]
    3.422s [partial] I went to the [audio:0.0-4.0s]
  ... (17 more partials) ...
    7.228s [partial] I went to the store and bought some milk, and then I came ho [audio:0.0-7.8s]
    7.228s [partial] I went to the store and bought some milk, and then I came ho [audio:0.0-7.8s]
    7.228s [partial] I went to the store and bought some milk, and then I came ho [audio:0.0-7.8s]
    7.229s [partial] I went to the store and bought some milk, and then I came ho [audio:0.0-7.8s]
  ```


---

## 3. Pauses, Hesitations, and Corrections

These test whether the timer cascade would fire prematurely.

### 0.5s mid-sentence pause (below LLM timer)

- **Speech duration**: 3.73s
- **Total updates**: 6
- **First update latency**: 3.414s
- **Last update**: 3.428s after speech start
- **Finals (1)**: 
  - `I want to.`
- **Last text**: ` Go`
- **Timeline**:
  ```
    3.414s [partial] I [audio:0.0-4.0s]
    3.414s [partial] I want [audio:0.0-4.0s]
    3.414s [partial] I want to [audio:0.0-4.0s]
    3.414s [partial] I want to. [audio:0.0-4.0s]
    3.427s [FINAL  ] I want to. [audio:0.0-2.3s]
    3.428s [partial]  Go [audio:2.5-4.0s]
  ```

### 1.0s mid-sentence pause (below LLM timer)

- **Speech duration**: 4.28s
- **Total updates**: 4
- **First update latency**: 2.108s
- **Last update**: 2.108s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I want to.`
- **Timeline**:
  ```
    2.108s [partial] I [audio:0.0-4.0s]
    2.108s [partial] I want [audio:0.0-4.0s]
    2.108s [partial] I want to [audio:0.0-4.0s]
    2.108s [partial] I want to. [audio:0.0-4.0s]
  ```

### 1.5s mid-sentence pause (above base LLM timer!)

- **Speech duration**: 4.83s
- **Total updates**: 6
- **First update latency**: 4.513s
- **Last update**: 4.53s after speech start
- **Finals (1)**: 
  - `I want to.`
- **Last text**: ` Go`
- **Timeline**:
  ```
    4.513s [partial] I [audio:0.0-4.0s]
    4.513s [partial] I want [audio:0.0-4.0s]
    4.513s [partial] I want to [audio:0.0-4.0s]
    4.514s [partial] I want to. [audio:0.0-4.0s]
    4.530s [FINAL  ] I want to. [audio:0.0-2.3s]
    4.530s [partial]  Go [audio:2.4-4.0s]
  ```

### 2.0s mid-sentence pause (well above LLM timer)

- **Speech duration**: 5.44s
- **Total updates**: 5
- **First update latency**: 5.01s
- **Last update**: 5.024s after speech start
- **Finals (1)**: 
  - `I want to.`
- **Last text**: `I want to.`
- **Timeline**:
  ```
    5.010s [partial] I [audio:0.0-4.0s]
    5.010s [partial] I want [audio:0.0-4.0s]
    5.011s [partial] I want to [audio:0.0-4.0s]
    5.011s [partial] I want to. [audio:0.0-4.0s]
    5.024s [FINAL  ] I want to. [audio:0.0-2.3s]
  ```

### Hesitation with fillers

- **Speech duration**: 4.65s
- **Total updates**: 7
- **First update latency**: 3.411s
- **Last update**: 3.412s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `Um so like I was thinking maybe`
- **Timeline**:
  ```
    3.411s [partial] Um [audio:0.0-4.0s]
    3.411s [partial] Um so [audio:0.0-4.0s]
    3.412s [partial] Um so like [audio:0.0-4.0s]
    3.412s [partial] Um so like I [audio:0.0-4.0s]
    3.412s [partial] Um so like I was [audio:0.0-4.0s]
    3.412s [partial] Um so like I was thinking [audio:0.0-4.0s]
    3.412s [partial] Um so like I was thinking maybe [audio:0.0-4.0s]
  ```

### Quick correction

- **Speech duration**: 3.96s
- **Total updates**: 7
- **First update latency**: 3.415s
- **Last update**: 3.431s after speech start
- **Finals (1)**: 
  - `I want the red.`
- **Last text**: ` Now`
- **Timeline**:
  ```
    3.415s [partial] I [audio:0.0-4.0s]
    3.415s [partial] I want [audio:0.0-4.0s]
    3.415s [partial] I want the [audio:0.0-4.0s]
    3.415s [partial] I want the red [audio:0.0-4.0s]
    3.415s [partial] I want the red. [audio:0.0-4.0s]
    3.431s [FINAL  ] I want the red. [audio:0.0-2.5s]
    3.431s [partial]  Now [audio:2.6-4.0s]
  ```


---

## 4. Interruption Scenarios

Testing user speech while TTS is active (isSpeaking flag).

### Early interruption (1s into TTS)

- **Speech duration**: 3.92s
- **Total updates**: 12
- **First update latency**: 3.404s
- **Last update**: 3.405s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `Let me tell you about the weather forecast for this I already`
- **Timeline**:
  ```
    3.404s [partial] Let [audio:0.0-4.0s]
    3.404s [partial] Let me [audio:0.0-4.0s]
    3.404s [partial] Let me tell [audio:0.0-4.0s]
    3.404s [partial] Let me tell you [audio:0.0-4.0s]
  ... (4 more partials) ...
    3.405s [partial] Let me tell you about the weather forecast for [audio:0.0-4.0s]
    3.405s [partial] Let me tell you about the weather forecast for this [audio:0.0-4.0s]
    3.405s [partial] Let me tell you about the weather forecast for this I [audio:0.0-4.0s]
    3.405s [partial] Let me tell you about the weather forecast for this I alread [audio:0.0-4.0s]
  ```

### Late interruption (3s into TTS)

- **Speech duration**: 5.91s
- **Total updates**: 9
- **First update latency**: 3.404s
- **Last update**: 3.405s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `The process involves several steps that we need`
- **Timeline**:
  ```
    3.404s [partial] The [audio:0.0-4.0s] [TTS-ACTIVE]
    3.404s [partial] The process [audio:0.0-4.0s] [TTS-ACTIVE]
    3.404s [partial] The process invol [audio:0.0-4.0s] [TTS-ACTIVE]
    3.404s [partial] The process involves [audio:0.0-4.0s] [TTS-ACTIVE]
  ... (1 more partials) ...
    3.404s [partial] The process involves several steps [audio:0.0-4.0s] [TTS-ACTIVE]
    3.404s [partial] The process involves several steps that [audio:0.0-4.0s] [TTS-ACTIVE]
    3.405s [partial] The process involves several steps that we [audio:0.0-4.0s] [TTS-ACTIVE]
    3.405s [partial] The process involves several steps that we need [audio:0.0-4.0s] [TTS-ACTIVE]
  ```

  **isSpeaking=true transcriptions**: 9
  - `The` at audio 0.0-4.0s
  - `The process` at audio 0.0-4.0s
  - `The process invol` at audio 0.0-4.0s
  - `The process involves` at audio 0.0-4.0s
  - `The process involves several` at audio 0.0-4.0s

### Immediate overlap (0.5s into TTS)

- **Speech duration**: 3.48s
- **Total updates**: 13
- **First update latency**: 3.516s
- **Last update**: 3.553s after speech start
- **Finals (1)**: 
  - `Here is what I think we should do about this situation.`
- **Last text**: `Here is what I think we should do about this situation.`
- **Timeline**:
  ```
    3.516s [partial] Here [audio:0.0-4.0s]
    3.516s [partial] Here' [audio:0.0-4.0s]
    3.516s [partial] Here' what [audio:0.0-4.0s]
    3.516s [partial] Here' what I [audio:0.0-4.0s]
  ... (5 more partials) ...
    3.517s [partial] Here' what I think we should do about this [audio:0.0-4.0s]
    3.517s [partial] Here' what I think we should do about this situation [audio:0.0-4.0s]
    3.517s [partial] Here' what I think we should do about this situation. [audio:0.0-4.0s]
    3.553s [FINAL  ] Here is what I think we should do about this situation. [audio:0.0-3.5s]
  ```


---

## 5. Consecutive Turn Simulation

Simulates a full conversation exchange: user speaks → AI responds → user speaks again.

### Conversation Turn 1 (user)

- **Speech duration**: 2.4s
- **Total updates**: 10
- **First update latency**: 3.413s
- **Last update**: 3.44s after speech start
- **Finals (1)**: 
  - `Tell me about quantum computing.`
- **Last text**: `Tell me about quantum computing.`
- **Timeline**:
  ```
    3.413s [partial] Tell [audio:0.0-4.0s]
    3.413s [partial] Tell me [audio:0.0-4.0s]
    3.413s [partial] Tell me about [audio:0.0-4.0s]
    3.413s [partial] Tell me about qu [audio:0.0-4.0s]
  ... (2 more partials) ...
    3.413s [partial] Tell me about quantum comput [audio:0.0-4.0s]
    3.413s [partial] Tell me about quantum computing [audio:0.0-4.0s]
    3.413s [partial] Tell me about quantum computing. [audio:0.0-4.0s]
    3.440s [FINAL  ] Tell me about quantum computing. [audio:0.0-3.2s]
  ```

*[Simulating AI response via TTS...]*

### Conversation Turn 2 (user follow-up after AI)

- **Speech duration**: 3.47s
- **Total updates**: 12
- **First update latency**: 3.404s
- **Last update**: 3.419s after speech start
- **Finals (1)**: 
  - `That is interesting.`
- **Last text**: ` Tell me more about superpos`
- **Timeline**:
  ```
    3.404s [partial] That
    3.404s [partial] That is
    3.404s [partial] That is interesting
    3.405s [partial] That is interesting.
    3.419s [FINAL  ] That is interesting.
    3.419s [partial]  Tell me more about
    3.419s [partial]  Tell me more about super
    3.419s [partial]  Tell me more about superp
    3.419s [partial]  Tell me more about superpos
  ```

### Conversation Turn 3 (quick follow-up: 'Yes')

- **Speech duration**: 1.31s
- **Total updates**: 0
- **Finals**: 0 (no finalized segments)


---

## 6. Speech Speed Variations

### Very fast (300 WPM)

- **Speech duration**: 2.92s
- **Total updates**: 14
- **First update latency**: 3.416s
- **Last update**: 3.417s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I need you to quickly find the answer to my question about the project`
- **Timeline**:
  ```
    3.416s [partial] I [audio:0.0-4.0s]
    3.416s [partial] I need [audio:0.0-4.0s]
    3.416s [partial] I need you [audio:0.0-4.0s]
    3.416s [partial] I need you to [audio:0.0-4.0s]
  ... (6 more partials) ...
    3.417s [partial] I need you to quickly find the answer to my question [audio:0.0-4.0s]
    3.417s [partial] I need you to quickly find the answer to my question about [audio:0.0-4.0s]
    3.417s [partial] I need you to quickly find the answer to my question about t [audio:0.0-4.0s]
    3.417s [partial] I need you to quickly find the answer to my question about t [audio:0.0-4.0s]
  ```

### Normal (180 WPM)

- **Speech duration**: 3.88s
- **Total updates**: 16
- **First update latency**: 3.415s
- **Last update**: 7.266s after speech start
- **Finals (1)**: 
  - `I need you to quickly find the answer to my question about the project.`
- **Last text**: `I need you to quickly find the answer to my question about the project.`
- **Timeline**:
  ```
    3.415s [partial] I [audio:0.0-4.0s]
    3.415s [partial] I need [audio:0.0-4.0s]
    3.415s [partial] I need you [audio:0.0-4.0s]
    3.415s [partial] I need you to [audio:0.0-4.0s]
  ... (8 more partials) ...
    7.215s [partial] I need you to quickly find the answer to my question about t [audio:0.0-7.8s]
    7.215s [partial] I need you to quickly find the answer to my question about t [audio:0.0-7.8s]
    7.215s [partial] I need you to quickly find the answer to my question about t [audio:0.0-7.8s]
    7.266s [FINAL  ] I need you to quickly find the answer to my question about t [audio:0.0-4.6s]
  ```

### Slow (100 WPM)

- **Speech duration**: 2.89s
- **Total updates**: 9
- **First update latency**: 3.414s
- **Last update**: 3.414s after speech start
- **Finals**: 0 (no finalized segments)
- **Last text**: `I need you to quickly find the answer.`
- **Timeline**:
  ```
    3.414s [partial] I [audio:0.0-4.0s]
    3.414s [partial] I need [audio:0.0-4.0s]
    3.414s [partial] I need you [audio:0.0-4.0s]
    3.414s [partial] I need you to [audio:0.0-4.0s]
  ... (1 more partials) ...
    3.414s [partial] I need you to quickly find [audio:0.0-4.0s]
    3.414s [partial] I need you to quickly find the [audio:0.0-4.0s]
    3.414s [partial] I need you to quickly find the answer [audio:0.0-4.0s]
    3.414s [partial] I need you to quickly find the answer. [audio:0.0-4.0s]
  ```


---

## Summary Table

| Scenario | Updates | First Latency | Finals | Turn Duration |
| --- | --- | --- | --- | --- |
*(See individual results above for detailed timing)*

