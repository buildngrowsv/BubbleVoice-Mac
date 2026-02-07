# Turn Detection & Interruption Test Results

**Date**: 2026-02-07 16:12
**System**: macOS 26.1, Apple SpeechAnalyzer

## Timer Configuration Under Test

| Timer | Base Delay | Adaptive (≤3 words) | Adaptive (4-6 words) | Adaptive (>6 words) |
| --- | --- | --- | --- | --- |
| LLM Start | 1200ms | +600ms = 1800ms | +300ms = 1500ms | 1200ms |
| TTS Start | 2200ms | +600ms = 2800ms | +300ms = 2500ms | 2200ms |
| Playback | 3200ms | +600ms = 3800ms | +300ms = 3500ms | 3200ms |
| Silence Confirm | 800ms (for ≤6 words or <1.8s utterance) | — | — | — |

**Key timing**: Turn is considered complete when silence exceeds the LLM timer.
For short utterances, an additional 800ms confirmation window is added.

---

## Section 1: Turn Length Variations

Testing how different utterance lengths affect turn detection timing.

#### Single Word: 'Yes'
- **Said**: "Yes"
- **Total updates**: 0
- **Final segments**: 0
#### Two Words: 'OK sure'
- **Said**: "OK sure"
- **Total updates**: 5
- **First update latency**: 1.521s after speech start
- **Last update**: 1.532s after speech start
- **Final segments**: 1
  - `Yes.`
- **Last text received**: ` Okay,`
- **Audio timestamps (last 3)**: [(0, 1.98), (2.04, 4), (2.04, 4)]
- **Update timeline** (showing key moments):
  - ` 1.521s` [partial] Yes
  - ` 1.521s` [partial] Yes.
  - ` 1.531s` [FINAL  ] Yes.
  - ` 1.532s` [partial]  Okay
  - ` 1.532s` [partial]  Okay,
#### Short Phrase: 'I think so'
- **Said**: "I think so"
- **Total updates**: 8
- **First update latency**: 3.217s after speech start
- **Last update**: 3.244s after speech start
- **Final segments**: 2
  - ` Okay, sure.`
  - ` I think so.`
- **Last text received**: ` I think so.`
- **Audio timestamps (last 3)**: [(4.32, 7.8), (4.32, 7.8), (4.32, 6.36)]
- **Update timeline** (showing key moments):
  - ` 3.217s` [partial]  Okay, sure
  - ` 3.217s` [partial]  Okay, sure.
  - ` 3.231s` [FINAL  ]  Okay, sure.
  - ... (2 more partial updates) ...
  - ` 3.231s` [partial]  I think so
  - ` 3.231s` [partial]  I think so.
  - ` 3.244s` [FINAL  ]  I think so.
#### Medium Sentence (10 words)
- **Said**: "Can you tell me what the weather is like today"
- **Total updates**: 0
- **Final segments**: 0
#### Long Sentence (25+ words)
- **Said**: "I was thinking about going to the store later today to pick up some groceries and maybe stop by the pharmacy on the way back"
- **Total updates**: 29
- **First update latency**: 1.506s after speech start
- **Last update**: 5.407s after speech start
- **Final segments**: 1
  - ` Can you tell me what the weather is like today?`
- **Last text received**: ` I was thinking about going to the store later today to pick up some groceries a`
- **Audio timestamps (last 3)**: [(9.78, 15.5), (9.78, 15.5), (9.78, 15.5)]
- **Update timeline** (showing key moments):
  - ` 1.506s` [partial]  Can
  - ` 1.506s` [partial]  Can you
  - ` 1.506s` [partial]  Can you tell
  - ... (23 more partial updates) ...
  - ` 1.533s` [FINAL  ]  Can you tell me what the weather is like today?
  - ` 5.407s` [partial]  I was thinking about going to the store later tod
  - ` 5.407s` [partial]  I was thinking about going to the store later tod
  - ` 5.407s` [partial]  I was thinking about going to the store later tod
#### Two Sentences (should get 2 finals)
- **Said**: "The weather is nice today. I think I will go for a walk."
- **Total updates**: 15
- **First update latency**: 1.809s after speech start
- **Last update**: 1.897s after speech start
- **Final segments**: 1
  - ` I was thinking about going to the store later, today to pick up some groceries, and maybe stop by the pharmacy on the way back.`
- **Last text received**: ` The weather is nice`
- **Audio timestamps (last 3)**: [(16.68, 19.3), (16.68, 19.3), (16.68, 19.3)]
- **Update timeline** (showing key moments):
  - ` 1.809s` [partial]  I was thinking about going to the store later tod
  - ` 1.809s` [partial]  I was thinking about going to the store later tod
  - ` 1.809s` [partial]  I was thinking about going to the store later tod
  - ... (9 more partial updates) ...
  - ` 1.897s` [FINAL  ]  I was thinking about going to the store later, to
  - ` 1.897s` [partial]  The weather
  - ` 1.897s` [partial]  The weather is
  - ` 1.897s` [partial]  The weather is nice

---

## Section 2: Natural Speech Patterns

Testing realistic speech patterns: pauses, hesitations, corrections.

#### Question
- **Said**: "What time does the meeting start?"
- **Total updates**: 14
- **First update latency**: 1.477s after speech start
- **Last update**: 1.528s after speech start
- **Final segments**: 2
  - ` The weather is nice today.`
  - ` I think I will go for a walk.`
- **Last text received**: ` What`
- **Audio timestamps (last 3)**: [(19.5, 23.2), (19.5, 20.82), (20.94, 23.2)]
- **Update timeline** (showing key moments):
  - ` 1.477s` [partial]  The weather is nice today
  - ` 1.477s` [partial]  The weather is nice today.
  - ` 1.501s` [FINAL  ]  The weather is nice today.
  - ... (8 more partial updates) ...
  - ` 1.501s` [partial]  I think I will go for a walk.
  - ` 1.528s` [FINAL  ]  I think I will go for a walk.
  - ` 1.528s` [partial]  What
#### Mid-Sentence Pause (1.5s gap)
- **Said**: "I was going to say [1.5s pause] that I really like this approach"
- **Total updates**: 22
- **First update latency**: 1.603s after speech start
- **Last update**: 6.358s after speech start
- **Final segments**: 2
  - ` What time does the meeting start?`
  - ` I was going to say... that I really liked this approach.`
- **Last text received**: ` I was going to say... that I really liked this approach.`
- **Audio timestamps (last 3)**: [(23.82, 30.8), (23.82, 30.8), (23.82, 29.7)]
- **Update timeline** (showing key moments):
  - ` 1.603s` [partial]  What time
  - ` 1.603s` [partial]  What time does
  - ` 1.603s` [partial]  What time does the
  - ... (16 more partial updates) ...
  - ` 1.623s` [FINAL  ]  What time does the meeting start?
  - ` 6.311s` [partial]  I was going to say. that I really like this appro
  - ` 6.311s` [partial]  I was going to say. that I really like this appro
  - ` 6.358s` [FINAL  ]  I was going to say... that I really liked this ap
#### Hesitation with Filler Words
- **Said**: "Um, so like, I was thinking, you know, maybe we could try something different"
- **Total updates**: 10
- **First update latency**: 4.115s after speech start
- **Last update**: 4.116s after speech start
- **Final segments**: 0
- **Last text received**: ` Um So like I was thinking, you know,`
- **Audio timestamps (last 3)**: [(29.76, 34.7), (29.76, 34.7), (29.76, 34.7)]
- **Update timeline** (showing key moments):
  - ` 4.115s` [partial]  Um
  - ` 4.115s` [partial]  Um So
  - ` 4.115s` [partial]  Um So like
  - ... (4 more partial updates) ...
  - ` 4.116s` [partial]  Um So like I was thinking, you
  - ` 4.116s` [partial]  Um So like I was thinking, you know
  - ` 4.116s` [partial]  Um So like I was thinking, you know,
#### Rapid Correction (mind change)
- **Said**: "I want to go to the [0.3s] actually never mind, let's stay home"
- **Total updates**: 29
- **First update latency**: 1.681s after speech start
- **Last update**: 5.634s after speech start
- **Final segments**: 4
  - ` Um, so like, I was thinking, you know, maybe we could try something different.`
  - ` I want to go to the.`
  - ` Actually, never mind.`
  - ` Let's stay home.`
- **Last text received**: ` Let's stay home.`
- **Audio timestamps (last 3)**: [(40.68, 42.4), (40.68, 42.4), (40.68, 41.58)]
- **Update timeline** (showing key moments):
  - ` 1.681s` [partial]  Um So like I was thinking, you know, maybe
  - ` 1.681s` [partial]  Um So like I was thinking, you know, maybe we
  - ` 1.681s` [partial]  Um So like I was thinking, you know, maybe we cou
  - ... (23 more partial updates) ...
  - ` 1.735s` [FINAL  ]  Um, so like, I was thinking, you know, maybe we c
  - ` 5.607s` [FINAL  ]  I want to go to the.
  - ` 5.619s` [FINAL  ]  Actually, never mind.
  - ` 5.619s` [partial]  Let's stay home
  - ` 5.619s` [partial]  Let's stay home.
  - ` 5.634s` [FINAL  ]  Let's stay home.
#### Numbers and Data (formatting test)
- **Said**: "The total is $42.50 and my phone number is 555-123-4567"
- **Total updates**: 19
- **First update latency**: 3.738s after speech start
- **Last update**: 7.53s after speech start
- **Final segments**: 0
- **Last text received**: ` The total is $42.50 cents and my phone number is 555 one two3`
- **Audio timestamps (last 3)**: [(41.7, 50), (41.7, 50), (41.7, 50)]
- **Update timeline** (showing key moments):
  - ` 3.738s` [partial]  The
  - ` 3.738s` [partial]  The total
  - ` 3.738s` [partial]  The total is
  - ... (13 more partial updates) ...
  - ` 7.529s` [partial]  The total is $42.50 cents and my phone number is 
  - ` 7.529s` [partial]  The total is $42.50 cents and my phone number is 
  - ` 7.530s` [partial]  The total is $42.50 cents and my phone number is 

---

## Section 3: Speech Speed Variations

Testing how different speech rates affect detection.

#### Fast Speech (280 WPM)
- **Said**: "The quick brown fox jumps over the lazy dog and runs away"
- **Total updates**: 9
- **First update latency**: 1.918s after speech start
- **Last update**: 1.998s after speech start
- **Final segments**: 1
  - ` The total is $42.50, and my phone number is 555, one, two, three, 4567.`
- **Last text received**: ` The quick brown Fox John`
- **Audio timestamps (last 3)**: [(51.18, 53.9), (51.18, 53.9), (51.18, 53.9)]
- **Update timeline** (showing key moments):
  - ` 1.918s` [partial]  The total is $42.50 cents and my phone number is 
  - ` 1.918s` [partial]  The total is $42.50 cents and my phone number is 
  - ` 1.918s` [partial]  The total is $42.50 cents and my phone number is 
  - ` 1.997s` [FINAL  ]  The total is $42.50, and my phone number is 555, 
  - ` 1.998s` [partial]  The quick brown
  - ` 1.998s` [partial]  The quick brown Fox
  - ` 1.998s` [partial]  The quick brown Fox John
#### Slow Speech (80 WPM)
- **Said**: "I am speaking very slowly and carefully"
- **Total updates**: 16
- **First update latency**: 1.876s after speech start
- **Last update**: 1.922s after speech start
- **Final segments**: 1
  - ` The quick brown fox jumps over the lazy dog, and runs away.`
- **Last text received**: ` I am speaking`
- **Audio timestamps (last 3)**: [(54.96, 57.7), (54.96, 57.7), (54.96, 57.7)]
- **Update timeline** (showing key moments):
  - ` 1.876s` [partial]  The quick brown Fox Johns
  - ` 1.876s` [partial]  The quick brown Fox Johns over
  - ` 1.876s` [partial]  The quick brown Fox Johns over the
  - ... (10 more partial updates) ...
  - ` 1.921s` [FINAL  ]  The quick brown fox jumps over the lazy dog, and 
  - ` 1.922s` [partial]  I
  - ` 1.922s` [partial]  I am
  - ` 1.922s` [partial]  I am speaking

---

## Section 4: Edge Cases

Testing boundary conditions and special patterns.

#### Extended Silence Then Speech
- **Said**: "[3s silence] Now I am speaking after a long silence"
- **Total updates**: 9
- **First update latency**: 4.446s after speech start
- **Last update**: 4.477s after speech start
- **Final segments**: 1
  - ` I am speaking very slowly and carefully.`
- **Last text received**: ` Now`
- **Audio timestamps (last 3)**: [(54.96, 61.6), (54.96, 59.04), (59.16, 61.6)]
- **Update timeline** (showing key moments):
  - ` 4.446s` [partial]  I am speaking very
  - ` 4.446s` [partial]  I am speaking very slow
  - ` 4.446s` [partial]  I am speaking very slowly
  - ... (3 more partial updates) ...
  - ` 4.447s` [partial]  I am speaking very slowly and carefully.
  - ` 4.477s` [FINAL  ]  I am speaking very slowly and carefully.
  - ` 4.477s` [partial]  Now
#### Exclamations (3 sentences with '!')
- **Said**: "Oh my God! That is amazing! I can not believe it!"
- **Total updates**: 27
- **First update latency**: 1.307s after speech start
- **Last update**: 5.16s after speech start
- **Final segments**: 3
  - ` Now I am speaking after a long silence.`
  - ` Oh, my God, that is amazing.`
  - ` I cannot believe it.`
- **Last text received**: ` I cannot believe it.`
- **Audio timestamps (last 3)**: [(66.42, 69.2), (66.42, 69.2), (66.42, 67.62)]
- **Update timeline** (showing key moments):
  - ` 1.307s` [partial]  Now I
  - ` 1.307s` [partial]  Now I am
  - ` 1.307s` [partial]  Now I am speaking
  - ... (21 more partial updates) ...
  - ` 1.336s` [FINAL  ]  Now I am speaking after a long silence.
  - ` 5.144s` [FINAL  ]  Oh, my God, that is amazing.
  - ` 5.144s` [partial]  I cannot not believe it
  - ` 5.144s` [partial]  I cannot not believe it.
  - ` 5.160s` [FINAL  ]  I cannot believe it.

---

## Section 5: Interruption Detection

Testing user speaking while AI TTS is active.

#### Interruption (user speaks over TTS)
- **Said**: "[TTS playing] + 'Wait, stop, I have a question'"
- **Total updates**: 21
- **First update latency**: 3.988s after speech start
- **Last update**: 4.031s after speech start
- **Final segments**: 2
  - ` Let me explain the process to you in detail.`
  - ` Wait, stop.`
- **Last text received**: ` I have a question`
- **Audio timestamps (last 3)**: [(72.48, 73.1), (72.48, 73.1), (72.48, 73.1)]
- **Update timeline** (showing key moments):
  - ` 3.988s` [partial]  Let
  - ` 3.988s` [partial]  Let me
  - ` 3.988s` [partial]  Let me explain
  - ... (15 more partial updates) ...
  - ` 4.020s` [FINAL  ]  Let me explain the process to you in detail.
  - ` 4.031s` [FINAL  ]  Wait, stop.
  - ` 4.031s` [partial]  I have
  - ` 4.031s` [partial]  I have a
  - ` 4.031s` [partial]  I have a question
- **isSpeaking flags during transcription**:
  - `3.988s` [not speaking]  Let
  - `3.988s` [not speaking]  Let me
  - `3.988s` [not speaking]  Let me explain
  - `3.988s` [not speaking]  Let me explain the
  - `3.988s` [not speaking]  Let me explain the process
  - `3.988s` [not speaking]  Let me explain the process to
  - `3.988s` [not speaking]  Let me explain the process to you
  - `3.989s` [not speaking]  Let me explain the process to you in
  - `3.989s` [not speaking]  Let me explain the process to you in det
  - `3.989s` [not speaking]  Let me explain the process to you in detail


---

## Section 6: Back-to-Back Turns (Session Reset)

Testing consecutive turns with reset_recognition between them.

#### Back-to-Back Turn 1
- **Said**: "Hello, how are you doing today"
- **Total updates**: 12
- **First update latency**: 3.124s after speech start
- **Last update**: 3.164s after speech start
- **Final segments**: 3
  - ` I have a question.`
  - ` Hello.`
  - ` How are you doing today?`
- **Last text received**: ` How are you doing today?`
- **Audio timestamps (last 3)**: [(74.94, 76.9), (74.94, 76.9), (74.94, 75.9)]
- **Update timeline** (showing key moments):
  - ` 3.124s` [partial]  I have a question.
  - ` 3.139s` [FINAL  ]  I have a question.
  - ` 3.139s` [partial]  Hello
  - ... (6 more partial updates) ...
  - ` 3.147s` [FINAL  ]  Hello.
  - ` 3.148s` [partial]  How are you doing today
  - ` 3.148s` [partial]  How are you doing today?
  - ` 3.164s` [FINAL  ]  How are you doing today?
#### Back-to-Back Turn 2 (after reset)
- **Said**: "That's great, tell me more about it"
- **Total updates**: 13
- **First update latency**: 3.467s after speech start
- **Last update**: 3.504s after speech start
- **Final segments**: 2
  - `That's great.`
  - ` Tell me more about it.`
- **Last text received**: ` Tell me more about it.`
- **Audio timestamps (last 3)**: [(1.98, 4), (1.98, 4), (1.98, 3.18)]
- **Update timeline** (showing key moments):
  - ` 3.467s` [partial] That
  - ` 3.467s` [partial] That'
  - ` 3.467s` [partial] That's
  - ... (7 more partial updates) ...
  - ` 3.487s` [FINAL  ] That's great.
  - ` 3.487s` [partial]  Tell me more about it
  - ` 3.487s` [partial]  Tell me more about it.
  - ` 3.504s` [FINAL  ]  Tell me more about it.

---

## Analysis & Findings

### First Update Latency

- **Average**: 2.550s
- **Fastest**: 1.307s (Exclamations (3 sentences with '!'))
- **Slowest**: 4.446s (Extended Silence Then Speech)

### Sentence Boundary Detection (isFinal)

- **Two Words: 'OK sure'**: 1 final(s) — ['Yes.']
- **Short Phrase: 'I think so'**: 2 final(s) — [' Okay, sure.', ' I think so.']
- **Long Sentence (25+ words)**: 1 final(s) — [' Can you tell me what the weather is like today?']
- **Two Sentences (should get 2 finals)**: 1 final(s) — [' I was thinking about going to the store later, today to pick up some groceries, and maybe stop by the pharmacy on the way back.']
- **Question**: 2 final(s) — [' The weather is nice today.', ' I think I will go for a walk.']
- **Mid-Sentence Pause (1.5s gap)**: 2 final(s) — [' What time does the meeting start?', ' I was going to say... that I really liked this approach.']
- **Rapid Correction (mind change)**: 4 final(s) — [' Um, so like, I was thinking, you know, maybe we could try something different.', ' I want to go to the.', ' Actually, never mind.']
- **Fast Speech (280 WPM)**: 1 final(s) — [' The total is $42.50, and my phone number is 555, one, two, three, 4567.']
- **Slow Speech (80 WPM)**: 1 final(s) — [' The quick brown fox jumps over the lazy dog, and runs away.']
- **Extended Silence Then Speech**: 1 final(s) — [' I am speaking very slowly and carefully.']
- **Exclamations (3 sentences with '!')**: 3 final(s) — [' Now I am speaking after a long silence.', ' Oh, my God, that is amazing.', ' I cannot believe it.']
- **Interruption (user speaks over TTS)**: 2 final(s) — [' Let me explain the process to you in detail.', ' Wait, stop.']
- **Back-to-Back Turn 1**: 3 final(s) — [' I have a question.', ' Hello.', ' How are you doing today?']
- **Back-to-Back Turn 2 (after reset)**: 2 final(s) — ["That's great.", ' Tell me more about it.']

### Turn End Timing (last update relative to speech start)

This tells us how long after speech starts the last transcription arrives.
The timer cascade starts AFTER this point.

| Scenario | Last Update | Word Count | Expected Timer |
| --- | --- | --- | --- |
| Two Words: 'OK sure' | 1.532s | 2 | 1.8s + 0.8s confirm = 2.6s |
| Short Phrase: 'I think so' | 3.244s | 3 | 1.8s + 0.8s confirm = 2.6s |
| Long Sentence (25+ words) | 5.407s | 25 | 1.2s (no confirm) |
| Two Sentences (should get 2 finals) | 1.897s | 13 | 1.2s (no confirm) |
| Question | 1.528s | 6 | 1.5s + 0.8s confirm = 2.3s |
| Mid-Sentence Pause (1.5s gap) | 6.358s | 13 | 1.2s (no confirm) |
| Hesitation with Filler Words | 4.116s | 14 | 1.2s (no confirm) |
| Rapid Correction (mind change) | 5.634s | 13 | 1.2s (no confirm) |
| Numbers and Data (formatting test) | 7.530s | 10 | 1.2s (no confirm) |
| Fast Speech (280 WPM) | 1.998s | 12 | 1.2s (no confirm) |
| Slow Speech (80 WPM) | 1.922s | 7 | 1.2s (no confirm) |
| Extended Silence Then Speech | 4.477s | 10 | 1.2s (no confirm) |
| Exclamations (3 sentences with '!') | 5.160s | 11 | 1.2s (no confirm) |
| Interruption (user speaks over TTS) | 4.031s | 9 | 1.2s (no confirm) |
| Back-to-Back Turn 1 | 3.164s | 6 | 1.5s + 0.8s confirm = 2.3s |
| Back-to-Back Turn 2 (after reset) | 3.504s | 7 | 1.2s (no confirm) |

