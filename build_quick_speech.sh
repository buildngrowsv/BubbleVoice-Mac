#!/bin/bash

# Build quick_speech.swift as a proper executable with entitlements
# This allows it to request microphone and speech recognition permissions

set -e

echo "🔨 Building quick_speech executable..."

cd "$(dirname "$0")"

# Create entitlements file
cat > /tmp/quick_speech_entitlements.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.microphone</key>
    <true/>
</dict>
</plist>
EOF

# Create Info.plist with usage descriptions
cat > /tmp/quick_speech_info.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>This script needs microphone access to transcribe your speech.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>This script uses speech recognition to transcribe audio.</string>
</dict>
</plist>
EOF

# Compile the Swift file
echo "📦 Compiling Swift code..."
swiftc quick_speech.swift \
    -o /tmp/quick_speech_bin \
    -target arm64-apple-macos26.0 \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker /tmp/quick_speech_info.plist

echo "🔐 Code signing with entitlements..."
codesign --force --sign - \
    --entitlements /tmp/quick_speech_entitlements.plist \
    --timestamp=none \
    /tmp/quick_speech_bin

echo "✅ Build complete!"
echo ""
echo "To run:"
echo "  /tmp/quick_speech_bin"
echo ""
echo "Note: On first run, macOS will ask for microphone and speech recognition permissions."
echo ""
