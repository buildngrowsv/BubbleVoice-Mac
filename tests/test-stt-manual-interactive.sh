#!/bin/bash
# ============================================================
# MANUAL INTERACTIVE STT TEST
# ============================================================
# This script starts the Swift helper and lets you speak
# into the microphone to test if transcription is working.
#
# USAGE:
#   chmod +x tests/test-stt-manual-interactive.sh
#   ./tests/test-stt-manual-interactive.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER_BIN="$PROJECT_DIR/swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  MANUAL INTERACTIVE STT TEST${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# Check if helper exists
if [ ! -f "$HELPER_BIN" ]; then
    echo "ERROR: Swift helper not found at $HELPER_BIN"
    exit 1
fi

# Create FIFO for commands
FIFO=$(mktemp -u /tmp/stt_manual_test.XXXXXX)
mkfifo "$FIFO"

# Start helper in background
echo -e "${YELLOW}Starting Swift helper...${NC}"
cat "$FIFO" | "$HELPER_BIN" &
HELPER_PID=$!

# Give it time to start
sleep 2

if ! kill -0 "$HELPER_PID" 2>/dev/null; then
    echo "ERROR: Helper died during startup"
    rm -f "$FIFO"
    exit 1
fi

echo -e "${GREEN}✓ Helper started (PID: $HELPER_PID)${NC}"
echo ""

# Start listening
echo -e "${YELLOW}Sending start_listening command...${NC}"
echo '{"type":"start_listening","data":null}' > "$FIFO"
sleep 2

echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${GREEN}🎤 MICROPHONE IS NOW LISTENING${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""
echo "Speak into your microphone now!"
echo ""
echo "Try saying:"
echo "  - 'Hello world'"
echo "  - 'Testing one two three'"
echo "  - 'This is a test of speech recognition'"
echo ""
echo -e "${YELLOW}The test will run for 30 seconds...${NC}"
echo ""
echo "Press Ctrl+C to stop early"
echo ""

# Wait for 30 seconds
sleep 30

# Stop listening
echo ""
echo -e "${YELLOW}Stopping...${NC}"
echo '{"type":"stop_listening","data":null}' > "$FIFO"
sleep 1

# Kill helper
kill "$HELPER_PID" 2>/dev/null || true
wait "$HELPER_PID" 2>/dev/null || true

# Cleanup
rm -f "$FIFO"

echo ""
echo -e "${GREEN}Test complete!${NC}"
echo ""
echo "Check the terminal output above for transcription results."
echo "Look for lines containing 'transcription_update'"
echo ""
