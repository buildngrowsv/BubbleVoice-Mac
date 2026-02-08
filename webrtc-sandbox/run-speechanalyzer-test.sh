#!/bin/bash

echo "🔨 Building WebRTC + SpeechAnalyzer Test..."
echo ""

cd "$(dirname "$0")"

# Clean previous build
rm -rf .build

# Build with WebRTC package
swift build -c release 2>&1 | grep -E "(Compiling|Linking|error|warning)" | tail -n 30

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "✅ Build successful"
echo ""
echo "🚀 Running test..."
echo ""
echo "📺 IMPORTANT: Make sure you have background audio playing from another device!"
echo "   (e.g., YouTube video, podcast, music from phone/tablet)"
echo ""
echo "Starting in 3 seconds..."
sleep 3
echo ""

# Run
.build/release/WebRTCSandbox
