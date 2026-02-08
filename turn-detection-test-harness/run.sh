#!/bin/bash

# ============================================================
# TURN DETECTION TEST HARNESS — RUN SCRIPT
# 
# Quick launcher that checks prerequisites and runs the test.
# 
# USAGE:
#   cd BubbleVoice-Mac/turn-detection-test-harness
#   ./run.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWIFT_HELPER="$SCRIPT_DIR/../swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech"

echo ""
echo "🔍 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi
echo "  ✅ Node.js: $(node --version)"

# Check Swift helper binary
if [ ! -f "$SWIFT_HELPER" ]; then
    echo "  ⚠️  Swift helper not built. Building now..."
    cd "$SCRIPT_DIR/../swift-helper/BubbleVoiceSpeech"
    swift build 2>&1 | tail -n 5
    cd "$SCRIPT_DIR"
    
    if [ ! -f "$SWIFT_HELPER" ]; then
        echo "❌ Swift helper build failed. Please build manually:"
        echo "   cd ../swift-helper/BubbleVoiceSpeech && swift build"
        exit 1
    fi
fi
echo "  ✅ Swift helper binary found"

# Check microphone permission hint
echo ""
echo "📋 Note: Make sure your terminal app has microphone permission."
echo "   System Settings → Privacy & Security → Microphone → [your terminal]"
echo ""

# Run the test harness
exec node "$SCRIPT_DIR/TurnDetectionTestHarness.js"
