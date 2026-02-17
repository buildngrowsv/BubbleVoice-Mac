#!/bin/bash
# Run TurnDetectionWithVPIOTest with file logging enabled

cd "$(dirname "$0")"

echo "Compiling TurnDetectionWithVPIOTest.swift..."
swiftc -parse-as-library \
    -framework AVFoundation \
    -framework Speech \
    -framework CoreMedia \
    -O \
    -o /tmp/turn_detection_test \
    TurnDetectionWithVPIOTest.swift

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Compiled successfully"
echo ""
echo "Running test... (will log to /tmp/turn-detection-test-*.log)"
echo "Speak into your microphone to test turn detection"
echo ""

/tmp/turn_detection_test
