# WebRTC Sandbox Testing Guide

## Overview

This sandbox tests the core hypothesis: **Can we play TTS through WebRTC while transcribing environment speech without echo?**

## Test Progression

### Test 1: Echo Detection (Audio Level Analysis)
**File:** `EchoTest.swift`  
**Run:** `./run-echo-test.sh`

**Purpose:** Determine if echo is present in the current setup by measuring microphone audio levels.

**How it works:**
1. Measures baseline mic levels during 3 seconds of silence
2. Plays TTS audio through speakers
3. Measures mic levels during TTS playback
4. Compares levels: if mic levels spike during TTS, echo is present

**Expected Results:**
- **With built-in speakers at high volume:** Echo detected (mic picks up speakers)
- **With headphones:** No echo (nothing to cancel)
- **With Bluetooth speakers:** Possible echo + latency issues

**Why this matters:** Confirms we need WebRTC's AEC for the full-volume interruption feature.

---

### Test 2: Full WebRTC Implementation
**File:** `WebRTCSandbox.swift`  
**Run:** `./run.sh`

**Purpose:** Implement 2-peer local WebRTC connection with hardware AEC.

**Architecture:**
```
User Audio Peer                    AI Processing Peer
├─ Mic input                      ├─ Receives clean audio
├─ WebRTC send (with AEC)         ├─ SpeechAnalyzer transcription
├─ WebRTC receive                 ├─ TTS generation (say command)
└─ Speaker output                 └─ WebRTC send (TTS audio)
```

**How it works:**
1. Creates 2 local WebRTC peer connections
2. User Peer captures mic, applies AEC, sends to AI Peer
3. AI Peer generates TTS, sends to User Peer
4. User Peer plays TTS through speakers
5. AEC subtracts known TTS audio from mic input

**Expected Results:**
- TTS plays clearly through speakers
- Microphone captures environment speech
- TTS audio does NOT leak into transcription
- User can "interrupt" AI by speaking during TTS

---

## Testing Scenarios

### Scenario 1: Built-in Speakers (Primary Use Case)
**Setup:**
- MacBook built-in speakers at 75% volume
- Built-in microphone
- Quiet environment

**Test Steps:**
1. Run `./run-echo-test.sh`
2. Confirm echo is detected
3. Run `./run.sh` (WebRTC version)
4. Verify echo is eliminated

**Success Criteria:**
- ✅ Echo test shows significant mic level increase
- ✅ WebRTC test shows no echo in transcription
- ✅ Can speak during TTS and be transcribed

---

### Scenario 2: External Speakers
**Setup:**
- USB or 3.5mm external speakers
- Built-in or external microphone
- Speakers positioned near mic

**Test Steps:**
1. Run echo test to confirm echo
2. Run WebRTC test
3. Verify AEC works with external audio

**Success Criteria:**
- ✅ Echo eliminated even with external speakers
- ✅ No additional latency

---

### Scenario 3: Bluetooth Speakers (Edge Case)
**Setup:**
- Bluetooth speaker
- Built-in microphone

**Expected Issues:**
- Bluetooth adds 100-200ms latency
- AEC reference signal is delayed
- Echo cancellation may fail

**Test Steps:**
1. Run echo test (should detect echo + latency)
2. Run WebRTC test
3. Document if AEC works or fails

**Mitigation:**
- Detect Bluetooth devices
- Warn user or adjust AEC timing
- Recommend wired speakers for best experience

---

### Scenario 4: Headphones (No Echo)
**Setup:**
- Wired or Bluetooth headphones
- Built-in microphone

**Expected:**
- No echo to cancel (audio doesn't reach mic)
- AEC not needed but shouldn't hurt

**Test Steps:**
1. Run echo test (should show no echo)
2. Run WebRTC test
3. Verify normal operation

**Success Criteria:**
- ✅ No performance degradation
- ✅ Transcription works normally

---

## Metrics to Capture

### Audio Quality
- [ ] TTS audio clarity (compare direct vs WebRTC)
- [ ] Transcription accuracy (with and without TTS playing)
- [ ] Compression artifacts (if any)

### Latency
- [ ] TTS generation time
- [ ] WebRTC encode/decode latency
- [ ] End-to-end: text → audible speech
- [ ] Interruption response time

### Resource Usage
- [ ] CPU usage (idle vs active TTS + transcription)
- [ ] Memory usage
- [ ] Battery impact (if on laptop)

### Reliability
- [ ] WebRTC connection stability
- [ ] Peer reconnection handling
- [ ] Chunk generation failure recovery
- [ ] Long conversation stability (30+ minutes)

---

## Troubleshooting

### Echo test shows no echo (but using speakers)
**Possible causes:**
- Volume too low
- Microphone too far from speakers
- Microphone sensitivity too low
- System audio routing issue

**Solutions:**
- Increase volume to 75-100%
- Move mic closer to speakers
- Check System Preferences → Sound → Input levels

### WebRTC test fails to connect
**Possible causes:**
- WebRTC library not installed
- Signaling issue
- ICE candidate exchange failure

**Solutions:**
- Run `swift package resolve`
- Check console logs for errors
- Verify both peers are created

### Transcription doesn't work
**Possible causes:**
- Speech recognition not authorized
- Microphone permissions denied
- Audio format incompatibility

**Solutions:**
- Grant microphone and speech recognition permissions
- Check System Preferences → Privacy & Security
- Restart test after granting permissions

---

## Next Steps After Testing

### If Echo Test Shows Echo (Expected)
1. ✅ Confirms need for WebRTC AEC
2. Proceed with full WebRTC implementation
3. Integrate into main BubbleVoice-Mac app

### If WebRTC Successfully Eliminates Echo
1. ✅ Architecture validated
2. Implement TTS chunking (7+ word batches)
3. Integrate with existing voice pipeline
4. Add interruption handling
5. Test with real LLM responses

### If Issues Remain
1. Try Voice Processing I/O (VPIO) audio unit
2. Research alternative AEC implementations
3. Consider hybrid approach (text-based + audio-based echo suppression)
4. Test on different Mac models (M1, M2, M3, M4)

---

## Performance Targets

Based on testing with `say` command:

| Metric | Target | Acceptable | Notes |
|--------|--------|------------|-------|
| First chunk latency | < 1s | < 1.5s | Time to first audible speech |
| Chunk generation | < 1s | < 1.5s | For 7-15 word chunks |
| WebRTC latency | < 100ms | < 200ms | Encode + transmit + decode |
| Interruption response | < 200ms | < 500ms | Stop TTS after user speaks |
| CPU usage | < 30% | < 50% | During active TTS + transcription |
| Memory | < 200MB | < 500MB | For WebRTC + audio buffers |

---

## Success Criteria Summary

✅ **Phase 1 (Echo Detection):**
- Confirms echo is present with speakers at high volume
- Quantifies echo magnitude (mic level increase)

✅ **Phase 2 (WebRTC AEC):**
- TTS plays clearly through speakers
- User can speak and be transcribed during TTS
- TTS audio does NOT appear in transcription
- Latency < 200ms end-to-end
- Stable for 30+ minute conversations

✅ **Phase 3 (Integration):**
- Works with existing voice pipeline
- Supports TTS chunking (7+ words)
- Handles interruptions gracefully
- Production-ready performance
