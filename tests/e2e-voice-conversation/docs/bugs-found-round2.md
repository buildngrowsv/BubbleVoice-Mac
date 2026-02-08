# E2E Voice Test - Bugs Found (Round 2)

**Date**: 2026-02-07  
**Tests**: Full suite (6 scenarios)  
**Result**: 1 PASS, 5 FAIL

## Wins from Round 1 Fixes
- **Merge fix WORKS**: Transcriptions are clean — "What is the capital of France?", 
  "My name is Alexander", "Can you tell me what 2 plus to equals?" — no more garbling
- **No crashes**: The serialization lock and defensive removeTap prevent the fatal crash
- **Basic round-trip works**: Full cycle completes in ~14 seconds

## Bug 5: PREMATURE SEND for long utterances (P0)

**Severity**: P0 (user messages get cut off mid-sentence)  
**Test**: long_utterance — 12% word capture ratio  
**Symptom**: User says 7 sentences but only "First I woke up early and made coffee." gets sent

**Root Cause**: Timer fires during SpeechAnalyzer's 4-second processing gap.
- User speaks continuously for 20 seconds
- SpeechAnalyzer processes first ~4s chunk, emits transcription
- Between chunks, there's a gap > 1.2s with no transcription updates
- Timer fires during this gap, sends incomplete text to LLM

**Fix Plan**: Send VAD heartbeats from Swift to backend. If VAD detects speech energy,
backend delays timer indefinitely. Only fire when BOTH:
1. No transcription updates for 1.2s
2. Swift VAD reports silence

## Bug 6: Empty AI responses from Gemini (P1)

**Tests**: multi_turn (turn 2), rapid_fire (turns 2, 3)  
**Symptom**: "AI response was empty. Please try again."

**Root Cause**: Gemini API returns empty response for some prompts. Could be:
- Rate limiting
- Context window issues
- Model quirk with short prompts

**Fix Plan**: Add retry logic in LLM service for empty responses.

## Bug 7: Interruption doesn't complete (P1)

**Test**: interruption  
**Symptom**: After interrupting AI with "Stop! I want to change the topic", the 
text is transcribed but no AI response comes back within 45s timeout.

**Root Cause**: After interruption + TTS stop + recognition reset, the new session
may not properly process the interrupted speech. The interruption handler clears
all state including the already-captured transcription.

**Fix Plan**: Preserve the interruption text before clearing state.

## Bug 8: SpeechAnalyzer 4-second delay causes turn misalignment (P2)

**Test**: rapid_fire  
**Symptom**: Transcriptions arrive one turn late:
- Turn 1: "What is five times three?" → no transcription
- Turn 2: "What color is the sky?" → transcription says "What is 5 times 3?"

**Root Cause**: SpeechAnalyzer processes audio in ~4-second chunks. Turn 1's audio
sits in the buffer, and the transcription arrives while turn 2's audio is being spoken.

**Fix Plan**: This is an inherent SpeechAnalyzer limitation. Increasing the turn
gap (wait for silence + transcription) would fix it but slow down conversation.

## Bug 9: Short utterances still swallowed (P2)

**Test**: short_utterances  
**Symptom**: "Yes" (0 transcriptions), "OK sure thing" (0 transcriptions)
Only "No I don't think so" (4 words) worked.

**Root Cause**: Single-word and 3-word phrases don't generate enough signal
in the 4-second processing window. The speech_energy_silence fallback
didn't trigger (no speech_not_captured event received).

**Fix Plan**: Debug the speech_energy_silence mechanism; may need lower threshold.
