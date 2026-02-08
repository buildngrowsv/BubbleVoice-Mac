# Turn Detection Test Harness

A terminal-based test tool that exercises the **exact same voice pipeline logic** as BubbleVoice-Mac's `VoicePipelineService.js`, but replaces the LLM API call with a simple echo.

## What This Does

1. Spawns the same Swift helper (`BubbleVoiceSpeech`) that the main app uses
2. Listens to your microphone via Apple's SpeechAnalyzer pipeline
3. Uses the **same timer cascade system** (1.2s → 2.2s → 3.2s) for turn detection
4. Uses the **same VAD-aware gating** to prevent premature sends
5. Uses the **same interruption detection** logic
6. Uses the **same echo suppression** logic
7. Instead of calling an LLM, speaks back: **"Turn N - [what you said]"**

## Quick Start

```bash
cd BubbleVoice-Mac/turn-detection-test-harness
./run.sh
```

Or directly:

```bash
node TurnDetectionTestHarness.js
```

## Prerequisites

- macOS 26+ (for SpeechAnalyzer API)
- Swift helper must be built: `cd ../swift-helper/BubbleVoiceSpeech && swift build`
- Microphone permission granted to Terminal/iTerm
- Node.js installed

## What to Test

### Natural Turn-Taking
Speak a sentence naturally. After ~1.2-2s of silence, the system should detect your turn ended and speak back what you said.

### Long Utterances
Speak multiple sentences without stopping. The system should wait until you're truly done (VAD-aware gating prevents premature sends during natural pauses).

### Interruption
While the AI is speaking back your text, start talking again. The AI should:
- Stop immediately
- Listen to your new speech
- After you stop, echo your new speech as the next turn

### Short Utterances
Say something very short like "yes" or "hello". The system has special handling for short utterances (extra confirmation window).

### Echo Suppression
When the AI speaks, the mic may pick up the TTS audio. Watch the terminal output — echo fragments should be suppressed (not treated as user speech).

## Terminal Output Color Legend

| Color | Meaning |
|-------|---------|
| 🟦 Cyan | Partial transcription (volatile) |
| 🟩 Green | Final transcription (committed) |
| 🟨 Yellow | Timer events (cascade start/fire) |
| 🟥 Red | Interruption detected |
| 🟪 Magenta | TTS events (speak/stop) |
| ⬜ Dim | System events (Swift commands, etc.) |

## Architecture

This is a faithful port of the core logic from:
- `VoicePipelineService.js` — Timer cascade, interruption, echo suppression
- `BubbleVoiceSpeech/main.swift` — Speech recognition, TTS, VAD

The only change is replacing the LLM call with an instant echo response.
