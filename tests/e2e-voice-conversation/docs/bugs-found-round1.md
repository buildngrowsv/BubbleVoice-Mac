# E2E Voice Test - Bugs Found (Round 1)

**Date**: 2026-02-07  
**Test**: basic_roundtrip  
**Status**: All 4 bugs are CRITICAL

## Bug 1: FATAL CRASH — Double tap installation on audio node

**Severity**: P0 (app crashes)  
**Symptom**: Swift helper crashes with:
```
*** Terminating app due to uncaught exception 'com.apple.coreaudio.avfaudio'
reason: 'required condition is false: nullptr == Tap()'
```

**Root Cause**: When the echo suppression fails (Bug 3) and triggers a false interruption, 
multiple `reset_recognition` commands are sent almost simultaneously:
1. From the interruption handler
2. From a second interruption (echo leaking through)
3. From `speech_ended` handler

Each calls `resetSpeechAnalyzerSession()` → `stopListeningAsync()` + `startListeningInternal()`.
These race with each other. The first one finishes and installs a tap. The second one tries to
install another tap on the same node → CRASH.

**Fix**: 
- Add a `isResetting` lock to prevent concurrent resets
- Remove existing tap before installing a new one in `startListeningInternal`
- Serialize all reset operations

## Bug 2: Transcription text accumulation — volatile results appended instead of replaced

**Severity**: P0 (user message is garbled)  
**Symptom**: User message sent to LLM is:
```
"Hello, I am testing the voice pipeline. Can Can you Can you tell Can you tell me..."
```
Instead of: `"Hello, I am testing the voice pipeline. Can you tell me what two plus two equals?"`

**Root Cause**: `mergeTranscriptionText()` doesn't understand volatile vs final results.
SpeechAnalyzer sends progressive volatile results for the current segment:
- "Can" → "Can you" → "Can you tell" → ...

Each volatile result REPLACES the previous volatile. But `mergeTranscriptionText()` treats each
as a new segment and APPENDS it because `incoming.startsWith(current)` is false.

**Fix**: Track finalized text separately from volatile text. Each new volatile update 
replaces the previous volatile portion, not appends.

## Bug 3: TTS echo leaks through and triggers false interruption

**Severity**: P1 (causes cascade to Bug 1)  
**Symptom**: After AI responds via TTS, the mic picks up "How are you feeling today"
which is the AI's own words. Echo suppression catches short fragments (" How", " How are")
but the longer fragment " How are you feeling" passes the echo check and triggers
a false interruption.

**Root Cause**: `shouldIgnoreEchoTranscription` only catches short fragments. Once the
echo transcription grows to 4+ words, it's treated as real user speech.

**Fix**: Compare against the full AI response text, not just check length.
Increase the echo comparison window.

## Bug 4: speech_started/speech_ended not reaching test client

**Severity**: P2 (test infrastructure issue)  
**Symptom**: The `waitForFullCycle` never completes because it waits for `speech_ended`
which is never forwarded to the WebSocket client.

**Root Cause**: Looking at the backend, `speech_started` and `speech_ended` are handled
internally by VoicePipelineService but not forwarded to the WebSocket client. The frontend
only receives `user_message` and `ai_response`.

**Fix**: Either forward speech lifecycle events to WS clients, or change the test to
detect cycle completion from `ai_response` + a timeout.
