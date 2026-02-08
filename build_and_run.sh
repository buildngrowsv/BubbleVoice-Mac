#!/bin/bash
set -e

# Create build dir
mkdir -p quick_test_build

# Copy source
cp quick_speech.swift quick_test_build/main.swift

# Create Info.plist
cat > quick_test_build/Info.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>Need mic for speech test</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Need speech recognition for test</string>
    <key>CFBundleIdentifier</key>
    <string>com.example.quickspeech</string>
    <key>CFBundleName</key>
    <string>QuickSpeech</string>
</dict>
</plist>
EOF

# Create entitlements
cat > quick_test_build/entitlements.plist <<EOF
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

# Compile
echo "Compiling..."
cd quick_test_build
swiftc main.swift -o QuickSpeech

# Create Bundle
rm -rf QuickSpeech.app
mkdir -p QuickSpeech.app/Contents/MacOS
cp QuickSpeech QuickSpeech.app/Contents/MacOS/
cp Info.plist QuickSpeech.app/Contents/

# Sign
echo "Signing..."
codesign -s - --entitlements entitlements.plist --force QuickSpeech.app/Contents/MacOS/QuickSpeech

# Run
echo "Running... (Please grant microphone permission if prompted)"
./QuickSpeech.app/Contents/MacOS/QuickSpeech
