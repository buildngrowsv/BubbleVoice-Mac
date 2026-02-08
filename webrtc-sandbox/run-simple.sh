#!/bin/bash

echo "🔨 Running Simple WebRTC Test..."
echo ""

cd "$(dirname "$0")"

# Compile and run directly (no package needed for simple test)
swiftc -o /tmp/simple_webrtc_test SimpleWebRTCTest.swift -framework AVFoundation -framework Speech

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Compilation successful"
echo ""

# Run
/tmp/simple_webrtc_test

# Cleanup
rm -f /tmp/simple_webrtc_test
