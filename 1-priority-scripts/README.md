# Priority Scripts

Confirmed-working standalone scripts that demonstrate critical capabilities. These are separated from the larger test sandbox folders so they don't get lost among experimental/broken tests.

## CONFIRMED-WORKING-VPIOEchoCancellationTest.swift

**Status:** CONFIRMED WORKING (Feb 2026)

Proves that Apple's VPIO (Voice Processing IO) provides full acoustic echo cancellation on macOS. The `say` command generates a TTS audio file, plays it through `AVAudioPlayerNode` on an `AVAudioEngine` with VPIO enabled, and `SpeechAnalyzer` transcribes the AEC-cleaned microphone input. Zero TTS words leaked into transcription while background speech was captured cleanly.

**How to run:**
```bash
cd 1-priority-scripts
chmod +x run-vpio-test.sh
./run-vpio-test.sh
```

Or compile manually:
```bash
swiftc -parse-as-library -framework AVFoundation -framework Speech -framework CoreMedia -O -o /tmp/vpio_echo_test CONFIRMED-WORKING-VPIOEchoCancellationTest.swift
/tmp/vpio_echo_test
```

**Requires:** macOS 26+, microphone permission, background audio playing from another device to verify transcription works during TTS playback.

**Key finding:** VPIO alone is sufficient for AEC on macOS. No WebRTC dual-peer system needed. See `1-priority-documents/WebRTC-Echo-Cancellation-Architecture.md` for full details.
