# Turn Detection & Conversation Pipeline Learnings

**Date**: 2026-02-07  
**Source**: Automated test suite (`tests/test-turn-detection-scenarios.py`)

> ## ⚠️ CORRECTION (2026-02-09)
>
> **Findings #2, #10, and #11 below are OUTDATED.** They describe "4-second chunk batching"
> and "single words reliably fail" behaviors that were caused by missing `.fastResults` in the
> `SpeechTranscriber` configuration. With `reportingOptions: [.volatileResults, .fastResults]`,
> results stream word-by-word at 200-500ms intervals and these issues largely disappear.
>
> The timer recommendations (1.2s LLM timer, etc.) were calibrated for the 4-second batching.
> With `.fastResults`, a **2.0-second silence timer** works reliably for turn detection.
>
> **See:** `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md` for the current
> source of truth.

---

## Critical Finding #1: SpeechAnalyzer Accumulates Across a Session

**What we found**: When running multiple `say` commands in a single listening session, the SpeechAnalyzer treats ALL audio as one continuous stream. Previous test audio "bleeds" into subsequent tests.

**Evidence**:
- "Single Word: Yes" produced 0 results in its test window, but the "Yes." text appeared as a FINAL in the NEXT test's results
- "Medium Sentence" (10 words) showed 0 results, but its text appeared in the Long Sentence test
- The "Question" test showed finals for "The weather is nice today." and "I think I will go for a walk." which were from the PREVIOUS Two Sentences test

**What this means for the product**:
- The SpeechAnalyzer doesn't have a concept of "utterance boundaries" — it's a continuous stream processor
- Our `reset_recognition` command (stop + restart) is the ONLY way to create clean breaks
- The backend MUST send `reset_recognition` after each AI turn to prevent the new user turn from containing leftover text from the previous exchange
- This validates our current approach of resetting between turns

**Implication for timer system**: 
The timer cascade fires based on silence after the LAST transcription update. Since the analyzer processes continuously, a user's Turn 2 text will start accumulating into the same session as Turn 1 unless we explicitly reset. Our reset at turn completion is essential.

---

## Critical Finding #2: Results Arrive in Bursts, Not Steady Streams

**What we found**: Multiple partial updates arrive within the same millisecond (< 1ms apart). For example:
```
1.521s [partial] Yes
1.521s [partial] Yes.
1.531s [FINAL  ] Yes.
1.532s [partial]  Okay
1.532s [partial]  Okay,
```

**What this means**:
- The SpeechAnalyzer processes audio in chunks (likely 2-4 second windows) and emits multiple results at once
- The "progressive word-by-word" updates are real, but they arrive as a batch, not individually
- This means our debounced frontend update (260ms min interval, 650ms max wait) is correct — there's no point in updating the UI for each individual result when 10 arrive in 1ms
- The timer reset pattern (reset on EVERY update) still works because all these burst updates DO reset the timer, keeping it alive during speech

**Implication for timer system**:
Our 1.2s silence timer is appropriate because:
1. During speech: bursts of 5-15 updates arrive every ~500ms-2s
2. During silence: NO updates arrive
3. The gap between bursts can be 1-4 seconds for slow speech
4. But the LLM timer only fires after 1.2-1.8s of NO updates at all

---

## Critical Finding #3: Single Words CAN Be Missed

**What we found**: "Yes" (single word) produced **0 transcriptions** within the 3-second test window. The text appeared later in the next test.

**Why**: The SpeechAnalyzer needs enough audio context to commit to a transcription. A single word at normal speed (~0.3 seconds of audio) may sit in the analyzer's buffer without producing a result until more audio arrives.

**What this means for the product**:
- Users saying "yes", "no", "ok", "stop" might experience a delay before these appear
- The adaptive timer (+600ms for ≤3 words) helps but may not be enough
- We should consider: if the user says a single word and then silence, the result may not arrive until we reset the session

**Potential fix**: After extended silence (>2 seconds with no updates), we could send a "flush" by finishing the input stream briefly, which would force the analyzer to emit any buffered results.

---

## Critical Finding #4: Mid-Sentence Pause Handled Correctly

**What we found**: A 1.5-second pause in the middle of "I was going to say [pause] that I really liked this approach" was handled beautifully. The analyzer produced:
```
FINAL: "I was going to say... that I really liked this approach."
```

The analyzer:
1. Recognized the pause and added "..." (ellipsis)
2. Kept the full sentence as ONE segment (didn't split at the pause)
3. Changed "like" to "liked" in the final (context-aware correction)

**What this means**:
- Our 1.2s LLM timer is the RIGHT value — the analyzer internally handles mid-sentence pauses
- The 1.5s pause did NOT produce any premature transcription updates that would have fired our timer
- Apple's model understands conversational rhythm and doesn't treat every pause as an end of turn

---

## Critical Finding #5: Sentence Boundaries Work Well

**What we found**: The exclamation test produced exactly 3 finals:
```
FINAL: "Oh, my God, that is amazing."
FINAL: "I cannot believe it."
```

The rapid correction produced 3 finals:
```
FINAL: "I want to go to the."
FINAL: "Actually, never mind."
FINAL: "Let's stay home."
```

**What this means**:
- isFinal accurately marks sentence boundaries (., ?, !)
- Multiple sentences in a single turn correctly produce multiple finals
- The backend's approach of using isFinal for display segmentation is correct
- However, isFinal should NOT be used for turn detection (confirmed by Quirk #10)

---

## Critical Finding #6: Auto-Formatting is Inconsistent for Numbers

**What we found**:
- "$42.50" → `$42.50` (perfect dollar formatting)
- "555-123-4567" → `555, one, two, three, 4567` (mixed digits and words!)

**What this means**:
- Currency formatting works great
- Phone number formatting is unreliable — the analyzer may spell out digits or group them inconsistently
- The backend should NOT depend on consistent number formatting
- For data-heavy use cases (dictating numbers), post-processing may be needed

---

## Critical Finding #7: Interruption isSpeaking Flag Timing

**What we found**: During the interruption test, ALL transcriptions had `isSpeaking = false`, even though TTS was playing.

**Why**: There's a timing issue. The Swift helper's `say` command (TTS) and our test's `say` command (user simulation) both use the system's `say` binary. The helper's TTS may finish before the user's speech is transcribed, or the `isSpeaking` flag update races with the transcription output.

**What this means for production**:
- In production, this race condition is less likely because TTS plays longer sentences
- But for short AI responses, the TTS may finish before user speech is transcribed
- The backend's 7-second echo suppression window is correct insurance against this race
- We should verify this works correctly in the actual app (Electron → Node → Swift), not just in isolated tests

---

## Critical Finding #8: Back-to-Back Turns Work After Reset

**What we found**: Turn 2 after `reset_recognition` worked correctly:
- Audio timestamps reset to ~0 (fresh session)
- "That's great." and "Tell me more about it." came through as 2 clean finals
- No contamination from Turn 1's text

**What this means**:
- The `reset_recognition` → `stopListeningAsync()` → `startListeningInternal()` flow works correctly
- The proper await of `finalizeAndFinishThroughEndOfInput()` (our fix from earlier) ensures clean state
- Audio timeline tracking correctly resets between sessions

---

## Critical Finding #9: First Update Latency Varies Widely

| Scenario | First Update Latency |
| --- | --- |
| Exclamations | 1.307s |
| Question | 1.477s |
| Long Sentence | 1.506s |
| Two Words | 1.521s |
| Mid-Sentence Pause | 1.603s |
| Rapid Correction | 1.681s |
| Two Sentences | 1.809s |
| Slow Speech | 1.876s |
| Fast Speech | 1.918s |
| Short Phrase | 3.217s |
| Numbers/Data | 3.738s |
| Hesitation | 4.115s |
| Extended Silence Then Speech | 4.446s |

**Observations**:
- Most results arrive within 1.3-1.9 seconds (consistent with our earlier findings)
- The outliers (3-4+ seconds) are from test bleed — the previous test's audio was still being processed
- In a clean session (like Turn 2 of back-to-back), latency is ~3.5 seconds from test start which includes the 2-second warm-up wait
- **True first-word latency is ~1.3-1.9 seconds** from speech onset

---

## Recommendations for Timer Configuration

Based on these findings:

### Current Configuration (Looks Correct)
| Timer | Value | Assessment |
| --- | --- | --- |
| LLM Start | 1200ms | **Good** — long enough to survive mid-sentence pauses |
| Adaptive +600ms (≤3 words) | 1800ms total | **May need increase** — single words may not produce results in time |
| Adaptive +300ms (4-6 words) | 1500ms total | **Good** |
| Silence Confirmation | 800ms | **Good** — catches premature triggers |
| Min Utterance | 1800ms | **Good** — prevents firing on ultra-short inputs |

### Potential Improvements
1. **Single-word handling**: Consider a "flush" mechanism — if silence exceeds 3 seconds with no transcription updates but we know audio was captured, force-restart the session to flush buffered results
2. **Burst handling**: Since 10+ updates arrive in 1ms, the timer resets 10 times in 1ms which is wasteful. Consider a "coalesced reset" that only resets the timer once per 50ms window
3. **Audio timestamp integration**: Use `audioEndTime` instead of `Date.now()` for silence measurement — this would be more accurate since it reflects when speech actually ended in the audio stream, not when the IPC message arrived

---

---

## Clean Test Results (Session Reset Between Tests)

A second test run with fresh sessions per test confirmed and refined the findings above.

### NEW Finding #10: The 4-Second Processing Window

**CRITICAL**: SpeechAnalyzer processes audio in **~4-second chunks**. All initial results show audio timestamps of `[0.0-4.0s]`, meaning the analyzer waits for 4 seconds of audio before producing its first batch of results.

**Evidence**: Every single test in the clean run showed first results arriving at ~3.4 seconds (2.0s warmup + 1.4s processing latency). All initial audio ranges were `[0.0-4.0s]`.

**Impact on timer system**:
- The first burst of transcription updates arrives after ~1.4 seconds of actual speech
- For short utterances (< 4 seconds of audio), ALL results arrive in a single burst
- For longer utterances, a second burst arrives at ~7-8 seconds (when the next 4-second chunk is processed)

**Implication**: Our LLM timer (1.2s) starts counting from the LAST transcription update. Since updates come in 4-second-window bursts, the timer effectively measures the gap between processing windows, not between spoken words.

### NEW Finding #11: Single Words Reliably Fail

**CRITICAL**: Single-word utterances are unreliable with SpeechAnalyzer.

| Utterance | Result |
| --- | --- |
| "Yes" (Session 1) | **0 updates** — completely missed |
| "Stop" (Session 2) | 3 updates, FINAL "Stop." at 6.2s latency |
| "OK sure" | **0 updates** — completely missed |
| "I think so" | **0 updates** — completely missed |
| "Yes" (Turn 3) | **0 updates** — completely missed |

"Yes" was tested twice (separate sessions), and BOTH times produced 0 transcriptions. "Stop" worked once but with a 6.2-second latency.

**Root cause**: The analyzer needs enough audio context (~4 seconds) to produce results. A word that lasts 0.3-0.5 seconds leaves ~3.5 seconds of silence in the 4-second window. The analyzer may not have enough signal to commit to a transcription.

**Impact on product**: Users saying "yes", "no", "ok", "stop", "go" as quick responses will experience:
- No visual feedback in the input field
- The silence timer will never start (no transcription to trigger it)
- The turn will hang until the user speaks more or the session times out

**MUST FIX**: This is a significant UX issue for conversational AI. Possible solutions:
1. **Flush mechanism**: If the VAD gate detects speech energy then silence for >2 seconds, force-flush the analyzer by finishing and restarting the input stream
2. **Shorter processing window**: Investigate if `bufferSize` affects the chunk window
3. **Hybrid approach**: Use the energy-based VAD to detect when short speech followed by silence occurs, and send a "user probably finished" signal to the backend even without transcription
4. **Workaround**: Pre-fill common single-word responses ("yes", "no", "ok") via the VAD energy pattern rather than waiting for the transcription

### NEW Finding #12: Mid-Sentence Pauses Cause Incorrect Finalization

**IMPORTANT**: When users pause mid-sentence, the analyzer adds punctuation and finalizes early.

| Test | Said | Analyzer Produced |
| --- | --- | --- |
| 0.5s pause | "I want to [0.5s] go to the store" | FINAL: "I want to." + partial: "Go" |
| 1.0s pause | "I want to [1.0s] go to the store" | partial: "I want to." (no final in time) |
| 1.5s pause | "I want to [1.5s] go to the store" | FINAL: "I want to." + partial: "Go" |
| 2.0s pause | "I want to [2.0s] go to the store" | FINAL: "I want to." only (continuation missed) |

**What's happening**: The analyzer interprets a pause after "I want to" as a sentence ending, adds a period, and finalizes "I want to." as a complete segment. The continuation "go to the store" starts as a NEW segment.

**Impact on product**: This is actually GOOD for our timer system because:
1. The "I want to." final creates a transcription update that keeps the timer alive
2. The continuation "Go to the store" creates more updates, continuing to reset the timer
3. The backend merges these into one turn via `mergeTranscriptionText()`
4. The user's complete utterance ("I want to go to the store") is preserved

**But**: If the backend's timer fires between the final and the continuation (1.2s gap), it would send "I want to" as the complete utterance. The adaptive delay (+600ms for ≤3 words) helps prevent this.

### NEW Finding #13: isSpeaking Flag Works Correctly in TTS Overlap

**CONFIRMED**: The `isSpeaking` flag is correctly set during TTS playback:

- "Late interruption (3s into TTS)": ALL 9 transcriptions had `[TTS-ACTIVE]`
- "Early interruption (1s into TTS)": Transcriptions did NOT have the flag (TTS finished before transcriptions arrived due to the 4-second processing window)

**Implication**: The isSpeaking flag works reliably ONLY when TTS is still playing at the time transcription results are emitted (after the ~4-second processing window). For short AI responses that finish before 4 seconds, the flag may not be set on user speech transcriptions.

**Fix needed**: The backend should also check `timeSinceSpoken` (currently 7000ms window) as a backup for when `isSpeaking` misses the timing.

### NEW Finding #14: Conversation Flow Works Cleanly

The full conversation simulation (Turn 1 → AI TTS → reset → Turn 2) worked perfectly:
- Turn 1: "Tell me about quantum computing." → FINAL with clean text
- AI Response via TTS
- Reset recognition
- Turn 2: "That is interesting." (FINAL) + "Tell me more about superposition" (partials)
- Audio timestamps correctly reset to 0 for Turn 2

**This validates**: Our entire pipeline design (start → listen → timer cascade → LLM → TTS → reset → listen again) is architecturally sound.

---

## Updated Recommendations

### Critical Issues to Address

1. **Single-word utterance handling** (Finding #11):
   - Implement a "speech energy then silence" detector that sends a flush/notification to the backend after ~2 seconds of silence following detected speech
   - This would handle "yes", "no", "ok" and other quick responses

2. **Timer coalescing** (Finding #2):
   - Since 10+ updates arrive in 1ms, avoid resetting the timer 10 times — coalesce within a 50ms window

3. **Echo timing alignment** (Finding #13):
   - For short AI responses (< 4 seconds of TTS), the isSpeaking flag may not cover user speech transcriptions
   - Rely on the 7-second `timeSinceSpoken` window as primary echo detection

### Configuration That Looks Correct

- LLM timer: 1200ms — correct (4-second processing window means bursts are 3-4 seconds apart during speech, and no updates during silence)
- Adaptive delay for short utterances: +600ms — helps but doesn't solve the single-word issue
- Silence confirmation: 800ms — good safety net
- Min utterance: 1800ms — appropriate
- Echo suppression window: 7000ms — needed given the 4-second processing delay

---

## Test Methodology Notes

### Volume-Zero Issue
Earlier testing had the Mac volume at zero, which meant `say` commands were inaudible and the STT captured only room noise. All tests in this document were run with volume confirmed working.

### Session Bleed
Many tests show results from PREVIOUS tests because SpeechAnalyzer accumulates within a session. To get clean results per test, each test should reset the session. A follow-up test run should use `reset_recognition` between tests.

### Environment
Tests run in a home office with typical ambient noise (AC, refrigerator). The VAD energy gate correctly filtered silence (0 transcriptions during 5 seconds of silence in the dedicated test).
