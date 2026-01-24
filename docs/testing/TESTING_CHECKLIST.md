# Turn Detection Testing Checklist

**Date**: 2026-01-21  
**Implementation Status**: ✅ COMPLETE  
**Build Status**: ✅ Swift helper builds successfully

---

## Pre-Testing Setup

- [x] Swift helper built successfully
- [ ] Backend server running
- [ ] Electron app running
- [ ] Microphone permissions granted
- [ ] Console logs visible for debugging

---

## Test 1: Basic Speech Recognition

**Goal**: Verify continuous speech recognition works

### Steps:
1. [ ] Start voice input
2. [ ] Speak: "Hello, can you hear me?"
3. [ ] Verify partial transcriptions appear in real-time
4. [ ] Stop speaking
5. [ ] Verify `isFinal: true` is received
6. [ ] **CRITICAL**: Verify recognition does NOT stop (check logs for "restarting recognition")

### Expected Behavior:
- ✅ Partial transcriptions appear as you speak
- ✅ Final transcription appears when you stop
- ✅ Console shows: "Got final transcription, restarting recognition for next utterance"
- ✅ Recognition continues running (no "Stopped listening" message)

### If Failed:
- Check Swift helper logs for errors
- Verify `restartRecognition()` is being called
- Check if recognition task is being cancelled and restarted

---

## Test 2: Timer Cascade (No Interruption)

**Goal**: Verify three-timer system works correctly

### Steps:
1. [ ] Speak: "What's the weather?"
2. [ ] Stop speaking and remain silent
3. [ ] Watch console logs for timer sequence
4. [ ] Wait at least 2.5 seconds
5. [ ] Verify all three timers fire in sequence

### Expected Behavior:
- ✅ At ~0.5s: "Timer 1 (LLM) fired"
- ✅ At ~1.5s: "Timer 2 (TTS) fired"
- ✅ At ~2.0s: "Timer 3 (Playback) fired"
- ✅ `isInResponsePipeline` set to `true` when timers start
- ✅ Mock response cached at each stage

### If Failed:
- Check if `handleSilenceDetected()` is being called
- Verify timer configuration (500ms, 1500ms, 2000ms)
- Check if timers are being cleared prematurely

---

## Test 3: Interrupt During Timer Cascade

**Goal**: Verify interruption works before playback starts

### Steps:
1. [ ] Speak: "Tell me about the weather"
2. [ ] Stop speaking
3. [ ] **Immediately** (within 1 second) speak again: "Actually, never mind"
4. [ ] Verify interruption is detected
5. [ ] Verify timers are cleared

### Expected Behavior:
- ✅ Console shows: "‼️ [VOICE INTERRUPT] User is speaking while AI is in response pipeline"
- ✅ Console shows: "Timer X cancelled by interruption" (for any unfired timers)
- ✅ `isInResponsePipeline` reset to `false`
- ✅ Cached responses cleared
- ✅ No stale audio plays

### If Failed:
- Check if partial transcriptions are triggering interruption detection
- Verify `isInResponsePipeline` is set correctly
- Check if `handleSpeechDetected()` is being called

---

## Test 4: Interrupt During TTS Playback

**Goal**: Verify interruption works during audio playback

### Steps:
1. [ ] Speak: "What's the weather?"
2. [ ] Wait for full timer cascade (2+ seconds)
3. [ ] Let TTS playback start (if implemented)
4. [ ] Speak during playback: "Stop, tell me about traffic"
5. [ ] Verify TTS stops immediately

### Expected Behavior:
- ✅ `isTTSPlaying` set to `true` when playback starts
- ✅ Interruption detected when user speaks
- ✅ `stopSpeaking()` called immediately
- ✅ TTS playback stops
- ✅ `isTTSPlaying` reset to `false`
- ✅ New transcription processed normally

### If Failed:
- Check if `isTTSPlaying` is being set correctly
- Verify `stopSpeaking()` is working
- Check if Swift helper is sending `speech_started` and `speech_ended` events

---

## Test 5: Multiple Rapid Interruptions

**Goal**: Verify system handles rapid interruptions cleanly

### Steps:
1. [ ] Speak: "What's the weather?"
2. [ ] Stop speaking (trigger timer cascade)
3. [ ] After 0.3s, speak: "Actually..."
4. [ ] Stop speaking (trigger new timer cascade)
5. [ ] After 0.3s, speak: "Wait, tell me about traffic"
6. [ ] Verify no stale responses play

### Expected Behavior:
- ✅ First interruption clears first timer cascade
- ✅ Second interruption clears second timer cascade
- ✅ Only the final request is processed
- ✅ No overlapping timers
- ✅ Clean state after each interruption

### If Failed:
- Check if `clearAllTimers()` is working properly
- Verify state is reset on each interruption
- Check for race conditions in timer handling

---

## Test 6: Long Pause (No Premature Cutoff)

**Goal**: Verify system allows natural pauses

### Steps:
1. [ ] Speak: "Tell me about..."
2. [ ] Pause for 1 second (thinking)
3. [ ] Continue: "...the weather forecast"
4. [ ] Verify system waits for full utterance

### Expected Behavior:
- ✅ Partial transcriptions continue during pause
- ✅ No timer cascade starts during pause
- ✅ Timer cascade only starts after final `isFinal: true`
- ✅ Full utterance is captured: "Tell me about the weather forecast"

### If Failed:
- Check if `isFinal` is being sent too early
- Verify speech recognizer settings
- May need to adjust recognizer timeout settings

---

## Test 7: State Synchronization

**Goal**: Verify state is synchronized correctly

### Steps:
1. [ ] Start voice input
2. [ ] Speak and trigger timer cascade
3. [ ] Check session state in console
4. [ ] Verify all state flags are correct

### Expected State During Timer Cascade:
```javascript
{
  isInResponsePipeline: true,
  isTTSPlaying: false,
  silenceTimers: {
    llm: [Timer object],
    tts: [Timer object],
    playback: [Timer object]
  }
}
```

### Expected State During TTS Playback:
```javascript
{
  isInResponsePipeline: true,
  isTTSPlaying: true,
  silenceTimers: {
    llm: null,
    tts: null,
    playback: null
  }
}
```

### Expected State After Interruption:
```javascript
{
  isInResponsePipeline: false,
  isTTSPlaying: false,
  silenceTimers: {
    llm: null,
    tts: null,
    playback: null
  },
  cachedResponses: {
    llm: null,
    tts: null
  }
}
```

---

## Test 8: Error Handling

**Goal**: Verify system handles errors gracefully

### Steps:
1. [ ] Trigger recognition error (disconnect mic?)
2. [ ] Verify error is logged
3. [ ] Verify state is reset
4. [ ] Verify system can recover

### Expected Behavior:
- ✅ Error logged to console
- ✅ State reset cleanly
- ✅ Can restart voice input
- ✅ No hanging timers or stale state

---

## Test 9: Swift Helper Communication

**Goal**: Verify IPC communication works correctly

### Steps:
1. [ ] Monitor Swift helper stderr logs
2. [ ] Monitor Node.js stdout/stderr
3. [ ] Verify messages are being sent/received
4. [ ] Check for JSON parsing errors

### Expected Logs:

**Swift Helper (stderr)**:
```
[SpeechHelper] Starting stdin reader loop
[SpeechHelper] Started listening
[SpeechHelper] Got final transcription, restarting recognition for next utterance
```

**Node.js (stdout)**:
```
[VoicePipelineService] Swift response: transcription_update
[VoicePipelineService] Transcription: "..." (final: true, swiftSpeaking: false)
[VoicePipelineService] Silence detected for session-123
[VoicePipelineService] Timer 1 (LLM) fired for session-123
```

---

## Test 10: Performance

**Goal**: Verify system is responsive

### Metrics to Check:
- [ ] Partial transcription latency: < 200ms
- [ ] Interruption detection latency: < 200ms
- [ ] Timer accuracy: ±50ms
- [ ] Memory usage: No leaks over time
- [ ] CPU usage: Reasonable during recognition

### Tools:
- Console timestamps for latency
- Activity Monitor for memory/CPU
- Long-running test (5+ minutes) for leak detection

---

## Common Issues and Solutions

### Issue: Recognition stops after isFinal
**Solution**: Check if `restartRecognition()` is being called. Verify Swift helper build is up to date.

### Issue: Interruption not detected
**Solution**: Check if `isInResponsePipeline` is being set. Verify partial transcriptions are being received.

### Issue: Timers fire after interruption
**Solution**: Check if timers are checking `isInResponsePipeline` before executing. Verify `clearAllTimers()` is working.

### Issue: Stale responses play
**Solution**: Check if cached responses are being cleared on interruption. Verify state is reset properly.

### Issue: Swift helper crashes
**Solution**: Check stderr logs for error messages. Verify microphone permissions. Check for JSON parsing errors.

---

## Success Criteria

All tests must pass for implementation to be considered complete:

- ✅ Continuous recognition works
- ✅ Timer cascade works
- ✅ Interruption detection works
- ✅ State management works
- ✅ No stale responses
- ✅ Clean error handling
- ✅ Good performance

---

## Next Steps After Testing

1. [ ] Fix any failing tests
2. [ ] Connect to real LLM service
3. [ ] Connect to real TTS service
4. [ ] Add WebSocket communication to frontend
5. [ ] Add UI indicators for pipeline state
6. [ ] Add audio visualization
7. [ ] User acceptance testing

---

## Notes

- Keep console logs visible during testing
- Test with different speech patterns (fast, slow, with pauses)
- Test with different interruption timings
- Test with background noise
- Test with multiple sessions (if applicable)

---

**Testing Date**: ___________  
**Tested By**: ___________  
**Results**: ___________  
**Issues Found**: ___________
