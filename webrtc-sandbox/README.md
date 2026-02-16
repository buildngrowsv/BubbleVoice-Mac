# WebRTC Echo Cancellation Sandbox

> ## ⚠️ SUPERSEDED (2026-02-09)
>
> **WebRTC is NOT needed for echo cancellation on macOS.** VPIO provides hardware AEC at
> full output volume. See `1-priority-documents/SpeechAnalyzer-Definitive-Configuration.md`.
> This sandbox is kept for historical reference only.

## Purpose

Test the core WebRTC architecture for echo cancellation:
1. **AI Peer** generates TTS via `say` command, sends through WebRTC
2. **User Peer** receives TTS audio, plays to speakers
3. **User Peer** captures microphone (including any echo from speakers)
4. **User Peer** sends mic audio through WebRTC with AEC applied
5. **AI Peer** receives clean audio, feeds to SpeechAnalyzer for transcription

## Test Goals

✅ Verify TTS audio plays clearly through WebRTC  
✅ Verify SpeechAnalyzer transcribes environment speech while TTS is playing  
✅ Verify echo cancellation works (TTS audio doesn't appear in transcription)  
✅ Verify audio quality is acceptable (no compression artifacts)  
✅ Measure latency (TTS generation → playback → transcription)  

## Files

### Phase 1: Echo Detection Test (Start Here)
- `EchoTest.swift` - Audio level-based echo detection (no speech recognition needed)
- `run-echo-test.sh` - Quick compile and run
- **Recommended:** Run this first to verify if echo is present

### Phase 2: Full WebRTC (After confirming echo exists)
- `WebRTCSandbox.swift` - Complete 2-peer WebRTC implementation with AEC
- `Package.swift` - Swift package with WebRTC dependency
- `run.sh` - Build and run full WebRTC sandbox

### Other Files
- `MinimalTest.swift` - Minimal TTS playback test (debugging)
- `SimpleWebRTCTest.swift` - Speech recognition test (requires entitlements)

## Usage

### Quick Start (Recommended)

```bash
# Run echo detection test first
./run-echo-test.sh

# This will:
# 1. Measure baseline microphone levels (3 seconds of silence)
# 2. Generate and play TTS audio through speakers
# 3. Measure microphone levels during TTS playback
# 4. Compare levels to detect if echo is present
```

**What to expect:**
- If **echo detected**: Microphone picks up speaker output → WebRTC AEC is needed
- If **no echo**: Either AEC is working, or volume is too low, or using headphones

**Tips:**
- Use built-in speakers (not headphones) for testing
- Turn volume to 75-100%
- Place microphone close to speakers
- Be quiet during the test

### Full WebRTC Test (After confirming echo)

```bash
# Once echo is confirmed, test WebRTC implementation
./run.sh

# This sets up 2 local WebRTC peers with hardware AEC
```

## Expected Output

```
✅ TTS played successfully
✅ Transcription captured: "hello world" (from environment)
❌ Echo detected: "echo cancellation system" (BAD - means AEC failed)
✅ No echo detected (GOOD - means AEC working)
```

## Configuration

- **Sample Rate:** 48kHz (high quality, Apple Silicon optimized)
- **Codec:** Opus at highest bitrate
- **AEC:** Enabled on User Peer
- **Buffer Size:** 1024 samples (low latency)
