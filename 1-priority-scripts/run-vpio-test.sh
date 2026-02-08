#!/bin/bash
# run-vpio-test.sh
# Compiles and runs the VPIO Echo Cancellation Test
# This test checks if Apple's Voice Processing IO provides AEC on macOS
# No WebRTC dependency needed - just AVFoundation and Speech frameworks

set -e

echo "Compiling VPIOEchoCancellationTest.swift..."
echo "(No WebRTC needed - using system frameworks only)"
echo ""

# Compile with required frameworks
# -parse-as-library prevents treating @main as entry point
# -framework Speech for SpeechAnalyzer (macOS 26+)
# -framework AVFoundation for AVAudioEngine, AVAudioPlayerNode
# -framework CoreMedia for CMTime
swiftc \
    -parse-as-library \
    -framework AVFoundation \
    -framework Speech \
    -framework CoreMedia \
    -O \
    -o /tmp/vpio_echo_test \
    VPIOEchoCancellationTest.swift

echo "Compilation successful!"
echo ""
echo "Running test..."
echo "============================================"
echo ""

/tmp/vpio_echo_test
