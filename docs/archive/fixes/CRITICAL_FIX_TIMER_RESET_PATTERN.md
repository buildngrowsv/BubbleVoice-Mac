# CRITICAL FIX: Timer-Reset Pattern for Turn Detection

**Date**: 2026-01-23  
**Issue**: Turn detection not working - app didn't understand when user stopped speaking  
**Root Cause**: Misunderstanding of Accountability's turn detection pattern

---

## The Problem

Our initial implementation waited for `isFinal: true` from the speech recognizer to start the timer cascade. This is **WRONG** and doesn't match Accountability's pattern.

### What We Did Wrong ❌

```javascript
// WRONG: Only trigger on isFinal
if (isFinal && !isInResponsePipeline) {
  this.handleSilenceDetected(session);
}
```

This meant:
- We only started timers when speech recognizer said "final"
- Speech recognizer's `isFinal` is unreliable and slow
- Doesn't create natural turn detection

---

## The Correct Pattern (Accountability)

Accountability uses a **TIMER-RESET pattern**, not an isFinal pattern!

### How Accountability Works ✅

```swift
// From CallManager.swift:575-638
private func processSpeechRecognitionResult(transcription: String) {
    // ... interruption check ...
    
    // CRITICAL: Called on EVERY transcription (even partial)
    self.latestTranscription = transcription
    self.resetSilenceTimer()  // ← KEY LINE
}

private func resetSilenceTimer() {
    // Always invalidate existing timers
    timerManager.invalidateTimer()
    
    // Start new timer cascade
    // These fire if NO NEW transcriptions come
    timerManager.llmTime = Timer.scheduledTimer(
        withTimeInterval: 0.5, repeats: false
    ) { ... }
}
```

### Key Insights

1. **Every transcription resets the timer** - even partial, even empty
2. **Silence is detected by ABSENCE** - when transcriptions stop coming
3. **Timer fires after 0.5s of no transcriptions** - this is actual silence
4. **Natural turn detection** - based on real audio silence, not recognizer state

---

## The Fix

### Changed: `handleSwiftResponse()` in VoicePipelineService.js

**BEFORE** ❌:
```javascript
// Only processed isFinal
if (isFinal && !isInResponsePipeline) {
  this.handleSilenceDetected(session);
}
```

**AFTER** ✅:
```javascript
// Process EVERY transcription
if (!isInResponsePipeline) {
  // Store latest transcription
  session.latestTranscription = text;
  
  // Reset the timer - called on EVERY transcription
  // Silence is detected when this stops being called
  this.resetSilenceTimer(session);
}
```

### Added: `resetSilenceTimer()` method

```javascript
resetSilenceTimer(session) {
  console.log(`[VoicePipelineService] Resetting silence timer for ${session.id}`);
  
  // Clear any existing timers (like Accountability's timerManager.invalidateTimer())
  this.clearAllTimers(session);
  
  // Start the timer cascade
  // These timers will fire if no new transcriptions come in
  this.startTimerCascade(session);
}
```

### Renamed: `handleSilenceDetected()` → `startTimerCascade()`

More accurate name - we're not "detecting" silence, we're starting timers that will fire if silence continues.

---

## How It Works Now

### Flow Diagram

```
User speaks: "What's the weather?"
    ↓
Partial: "What's"
    → resetSilenceTimer() → Clear old timers, start new ones
    ↓
Partial: "What's the"
    → resetSilenceTimer() → Clear old timers, start new ones
    ↓
Partial: "What's the weather"
    → resetSilenceTimer() → Clear old timers, start new ones
    ↓
Partial: "What's the weather?"
    → resetSilenceTimer() → Clear old timers, start new ones
    ↓
[User stops speaking - NO MORE TRANSCRIPTIONS]
    ↓
0.5s passes with no transcriptions
    ↓
LLM Timer fires! → Start processing
    ↓
1.5s total → TTS Timer fires
    ↓
2.0s total → Playback Timer fires
```

### Key Points

1. **Every transcription resets ALL timers** - prevents premature firing
2. **Timers only complete if user actually stops speaking** - natural turn detection
3. **0.5s of actual silence** triggers LLM processing - feels responsive
4. **User can pause mid-sentence** - timer resets when they continue

---

## Comparison

### Accountability Pattern (Correct) ✅

```
Transcription → Reset Timer → Transcription → Reset Timer → [Silence] → Timer Fires
```

- Silence detected by **absence of transcriptions**
- Timer fires after **actual silence in audio**
- Natural and responsive

### Our Old Pattern (Wrong) ❌

```
Transcription → Transcription → isFinal → Start Timer
```

- Waited for speech recognizer's `isFinal` flag
- `isFinal` is slow and unreliable
- Doesn't feel natural

---

## Additional Fixes

### 1. Added `isProcessingResponse` flag

Prevents duplicate LLM calls if timer fires multiple times:

```javascript
if (session.isProcessingResponse) {
  console.log('[VoicePipelineService] Already processing response, skipping LLM');
  return;
}
session.isProcessingResponse = true;
```

### 2. Reset processing state on interruption

```javascript
handleSpeechDetected(session) {
  // ... clear timers and cache ...
  session.isProcessingResponse = false;  // ← Added
}
```

### 3. Store latest transcription

```javascript
session.latestTranscription = text;  // Used by LLM processing
```

---

## Testing

### Test 1: Basic Turn Detection

1. Speak: "What's the weather?"
2. Stop speaking
3. **Expected**: After 0.5s, you should see "Timer 1 (LLM) fired"
4. **Expected**: Timers 2 and 3 fire at 1.5s and 2.0s

### Test 2: Mid-Sentence Pause

1. Speak: "Tell me about..."
2. Pause for 0.3s (thinking)
3. Continue: "...the weather"
4. **Expected**: Timer resets when you continue, no premature firing

### Test 3: Rapid Speech

1. Speak quickly: "What's the weather today in San Francisco?"
2. **Expected**: Timers reset on every partial transcription
3. **Expected**: Only fire after you actually stop

---

## Impact

### Before Fix ❌

- Turn detection didn't work
- App didn't know when user stopped speaking
- Had to rely on unreliable `isFinal` flag
- Felt unnatural and broken

### After Fix ✅

- Natural turn detection based on actual silence
- Responsive (0.5s after user stops)
- Allows mid-sentence pauses
- Matches Accountability's proven pattern

---

## Files Modified

1. **`src/backend/services/VoicePipelineService.js`**
   - Changed `handleSwiftResponse()` to call `resetSilenceTimer()` on every transcription
   - Added `resetSilenceTimer()` method
   - Renamed `handleSilenceDetected()` to `startTimerCascade()`
   - Added `isProcessingResponse` flag
   - Added `latestTranscription` storage

---

## Lessons Learned

1. **Read the source code carefully** - Don't assume patterns, verify them
2. **Timer-reset pattern is powerful** - Detect events by absence, not presence
3. **Every transcription matters** - Even partials are signals
4. **Silence = absence of transcriptions** - Not a flag from the recognizer

---

## Next Steps

1. ✅ Rebuild Swift helper
2. ⏳ Restart app and test
3. ⏳ Verify timer resets on every transcription
4. ⏳ Verify timers fire after actual silence
5. ⏳ Test interruption still works
6. ⏳ Test mid-sentence pauses

---

**Status**: Ready for testing
