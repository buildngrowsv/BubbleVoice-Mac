#!/bin/bash
# run-turn-detection-test.sh
# Compiles and runs the Turn Detection test with VPIO echo cancellation.
# Implements the full pipeline: silence timer, turn end, TTS echo-back, caching, interruption.
# Runs for 5 turns against background audio.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Compiling TurnDetectionWithVPIOTest.swift..."
echo ""

swiftc \
    -parse-as-library \
    -framework AVFoundation \
    -framework Speech \
    -framework CoreMedia \
    -O \
    -o /tmp/turn_detection_test \
    "$SCRIPT_DIR/TurnDetectionWithVPIOTest.swift"

echo "Compilation successful!"
echo ""
echo "Running turn detection test (5 turns)..."
echo "Play audio from your phone or another device."
echo "============================================"
echo ""

/tmp/turn_detection_test
