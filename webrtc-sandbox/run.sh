#!/bin/bash

echo "🔨 Building WebRTC Sandbox..."
echo ""

cd "$(dirname "$0")"

# Clean previous build
rm -rf .build

# Build
swift build -c release 2>&1 | tail -n 20

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "✅ Build successful"
echo ""
echo "🚀 Running sandbox..."
echo ""

# Run
.build/release/WebRTCSandbox
