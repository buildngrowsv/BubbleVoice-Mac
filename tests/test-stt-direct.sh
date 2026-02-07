#!/bin/bash
# ============================================================
# DIRECT STT TEST HARNESS
# ============================================================
#
# This script spawns the Swift helper binary directly (no Node.js,
# no Electron) and runs a battery of speech-to-text tests.
#
# It communicates with the helper via JSON over stdin/stdout,
# exactly like VoicePipelineService does in production.
#
# TESTS:
# 1) Startup latency — time from start_listening to first transcription
# 2) TTS-to-STT accuracy — play "say" while STT listens, check output
# 3) Session reset — stop + start, verify no text bleed
# 4) Echo test — play say while STT runs, see what leaks through
# 5) Sentence accuracy — specific sentences via say
# 6) Interactive — announce to user, capture their counting
#
# USAGE:
#   chmod +x tests/test-stt-direct.sh
#   ./tests/test-stt-direct.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER_BIN="$PROJECT_DIR/swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech"
LOG_FILE="$PROJECT_DIR/docs/stt-test-results.txt"

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================
# HELPER FUNCTIONS
# ============================================================

log() {
    local msg="[$(date '+%H:%M:%S.%3N')] $1"
    echo -e "$msg"
    echo "$msg" >> "$LOG_FILE"
}

log_section() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo "" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    echo "  $1" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
}

# Check if helper binary exists
if [ ! -f "$HELPER_BIN" ]; then
    echo -e "${RED}ERROR: Swift helper binary not found at $HELPER_BIN${NC}"
    echo "Building..."
    cd "$PROJECT_DIR/swift-helper/BubbleVoiceSpeech"
    swift build -c debug 2>&1 | tail -n 5
    cd "$PROJECT_DIR"
fi

# Clear log file
echo "STT Direct Test Results — $(date)" > "$LOG_FILE"
echo "Helper binary: $HELPER_BIN" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# ============================================================
# TEST 1: STARTUP LATENCY + BASIC TRANSCRIPTION
# ============================================================
# We start the helper, send start_listening, then immediately
# play "one two three four five" via say. We measure:
# - Time from start_listening to first transcription_update
# - Whether all words come through
# ============================================================

log_section "TEST 1: Startup Latency + Basic TTS-to-STT"

# Create a named pipe (FIFO) for sending commands to the helper
FIFO_IN=$(mktemp -u /tmp/stt_test_in.XXXXXX)
mkfifo "$FIFO_IN"

# Temp file to collect helper stdout
HELPER_OUT=$(mktemp /tmp/stt_test_out.XXXXXX)
HELPER_ERR=$(mktemp /tmp/stt_test_err.XXXXXX)

# Start the helper process
# stdin from our FIFO, stdout to our temp file, stderr to err file
cat "$FIFO_IN" | "$HELPER_BIN" > "$HELPER_OUT" 2>"$HELPER_ERR" &
HELPER_PID=$!
log "Helper started with PID $HELPER_PID"

# Give helper time to initialize and send "ready"
sleep 1

# Check if helper is still alive
if ! kill -0 "$HELPER_PID" 2>/dev/null; then
    log "${RED}FAIL: Helper died during startup${NC}"
    cat "$HELPER_ERR" | head -n 20
    rm -f "$FIFO_IN" "$HELPER_OUT" "$HELPER_ERR"
    exit 1
fi

# Check for ready signal
READY=$(grep -c '"ready"' "$HELPER_OUT" 2>/dev/null || true)
if [ "$READY" -gt 0 ]; then
    log "${GREEN}Helper sent ready signal${NC}"
else
    log "${YELLOW}WARNING: No ready signal found yet${NC}"
    log "Helper stdout so far:"
    cat "$HELPER_OUT" | head -n 5
fi

# Record time and send start_listening
START_TIME=$(python3 -c "import time; print(time.time())")
log "Sending start_listening at $START_TIME"
echo '{"type":"start_listening","data":null}' > "$FIFO_IN"

# Wait for listening to become active
sleep 2

# Check helper stderr for startup messages
log "Helper stderr (startup):"
cat "$HELPER_ERR" | tail -n 10 | while read line; do
    log "  [stderr] $line"
done

# Now play a test phrase via say while STT is running
log "Playing test phrase via say: 'one two three four five six seven eight nine ten'"
say -r 120 "one two three four five six seven eight nine ten" &
SAY_PID=$!

# Wait for say to finish + extra time for STT to process
wait $SAY_PID 2>/dev/null || true
sleep 3

# Capture all transcription results
log ""
log "=== TRANSCRIPTION RESULTS ==="
TRANSCRIPTIONS=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null || echo "NONE")
if [ "$TRANSCRIPTIONS" = "NONE" ]; then
    log "${RED}FAIL: No transcription updates received${NC}"
else
    echo "$TRANSCRIPTIONS" | while read line; do
        # Extract just the text field
        TEXT=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text','<no text>'))" 2>/dev/null || echo "$line")
        IS_FINAL=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('isFinal',False))" 2>/dev/null || echo "?")
        log "  Text: '$TEXT' | Final: $IS_FINAL"
    done
fi

# Check first transcription timing
FIRST_TRANSCRIPTION_LINE=$(grep -m1 'transcription_update' "$HELPER_OUT" 2>/dev/null || echo "")
if [ -n "$FIRST_TRANSCRIPTION_LINE" ]; then
    NOW_TIME=$(python3 -c "import time; print(time.time())")
    log "${GREEN}First transcription received (latency measured from say start, not precise)${NC}"
fi

# Stop listening
log ""
log "Sending stop_listening"
echo '{"type":"stop_listening","data":null}' > "$FIFO_IN"
sleep 1

# ============================================================
# TEST 2: SESSION RESET — TEXT BLEED CHECK
# ============================================================

log_section "TEST 2: Session Reset — Text Bleed Check"

# Clear the output file for this test
HELPER_OUT2=$(mktemp /tmp/stt_test_out2.XXXXXX)

# Restart listening
log "Sending start_listening (session 2)"
echo '{"type":"start_listening","data":null}' > "$FIFO_IN"
sleep 2

# Play a DIFFERENT phrase
log "Playing: 'banana chocolate strawberry'"
say -r 120 "banana chocolate strawberry" &
SAY_PID=$!
wait $SAY_PID 2>/dev/null || true
sleep 3

# Capture results from after the stop_listening
# We need to check the HELPER_OUT file for transcriptions AFTER the stop_listening
log "=== SESSION 2 TRANSCRIPTION RESULTS ==="
# Get all lines after the stop_listening command's effect
# Simple approach: get all transcription_update lines and show the last batch
TRANSCRIPTIONS2=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | tail -n 10 || echo "NONE")
if [ "$TRANSCRIPTIONS2" = "NONE" ]; then
    log "${RED}FAIL: No transcription updates in session 2${NC}"
else
    echo "$TRANSCRIPTIONS2" | while read line; do
        TEXT=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text','<no text>'))" 2>/dev/null || echo "$line")
        log "  Text: '$TEXT'"
        # Check for text bleed from session 1
        if echo "$TEXT" | grep -qi "one\|two\|three\|four\|five"; then
            log "${RED}  ⚠️ POSSIBLE TEXT BLEED from session 1!${NC}"
        fi
    done
fi

# Stop and clean up session 2
log "Sending stop_listening (session 2)"
echo '{"type":"stop_listening","data":null}' > "$FIFO_IN"
sleep 1

# ============================================================
# TEST 3: ECHO TEST — TTS WHILE STT RUNS
# ============================================================

log_section "TEST 3: Echo Test — TTS while STT runs"

log "Sending start_listening (session 3)"
echo '{"type":"start_listening","data":null}' > "$FIFO_IN"
sleep 2

# Use the helper's own speak command (which is what the app does)
log "Sending speak command: 'Hello I am the AI assistant how are you doing today'"
echo '{"type":"speak","data":{"text":"Hello I am the AI assistant how are you doing today","rate":180}}' > "$FIFO_IN"

# Wait for speech to complete
sleep 6

log "=== ECHO TEST RESULTS ==="
log "Checking what STT picked up while TTS was playing..."
ECHO_TRANSCRIPTIONS=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | tail -n 15 || echo "NONE")
if [ "$ECHO_TRANSCRIPTIONS" = "NONE" ]; then
    log "${GREEN}No echo detected (no transcriptions during TTS)${NC}"
else
    echo "$ECHO_TRANSCRIPTIONS" | while read line; do
        TEXT=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text','<no text>'))" 2>/dev/null || echo "$line")
        IS_SPEAKING=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('isSpeaking',False))" 2>/dev/null || echo "?")
        log "  Text: '$TEXT' | isSpeaking: $IS_SPEAKING"
    done
fi

log "Sending stop_listening (session 3)"
echo '{"type":"stop_listening","data":null}' > "$FIFO_IN"
sleep 1

# ============================================================
# TEST 4: SENTENCE ACCURACY
# ============================================================

log_section "TEST 4: Sentence Accuracy"

log "Sending start_listening (session 4)"
echo '{"type":"start_listening","data":null}' > "$FIFO_IN"
sleep 2

TEST_SENTENCE="The quick brown fox jumps over the lazy dog"
log "Playing: '$TEST_SENTENCE'"
say -r 140 "$TEST_SENTENCE" &
SAY_PID=$!
wait $SAY_PID 2>/dev/null || true
sleep 4

log "=== SENTENCE ACCURACY RESULTS ==="
SENT_TRANSCRIPTIONS=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | tail -n 10 || echo "NONE")
if [ "$SENT_TRANSCRIPTIONS" = "NONE" ]; then
    log "${RED}FAIL: No transcription updates${NC}"
else
    LAST_TEXT=$(echo "$SENT_TRANSCRIPTIONS" | tail -n 1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text','<no text>'))" 2>/dev/null || echo "")
    log "  Expected: '$TEST_SENTENCE'"
    log "  Got:      '$LAST_TEXT'"
    
    # Simple word overlap check
    EXPECTED_WORDS=$(echo "$TEST_SENTENCE" | tr '[:upper:]' '[:lower:]' | tr ' ' '\n' | sort)
    GOT_WORDS=$(echo "$LAST_TEXT" | tr '[:upper:]' '[:lower:]' | tr ' ' '\n' | sort)
    MATCHED=$(comm -12 <(echo "$EXPECTED_WORDS") <(echo "$GOT_WORDS") | wc -l | tr -d ' ')
    TOTAL=$(echo "$TEST_SENTENCE" | wc -w | tr -d ' ')
    log "  Word match: $MATCHED / $TOTAL"
fi

log "Sending stop_listening (session 4)"
echo '{"type":"stop_listening","data":null}' > "$FIFO_IN"
sleep 1

# ============================================================
# TEST 5: INTERACTIVE — USER COUNTING TEST
# ============================================================

log_section "TEST 5: Interactive — User Counting"

log "Sending start_listening (session 5)"
echo '{"type":"start_listening","data":null}' > "$FIFO_IN"
sleep 2

# Announce to user
log "${YELLOW}=== ANNOUNCING TO USER ===${NC}"
say -r 160 "Start counting now. One number per second." &
SAY_ANNOUNCE_PID=$!
wait $SAY_ANNOUNCE_PID 2>/dev/null || true

# Give user 12 seconds to count 1-10
log "${YELLOW}Listening for 12 seconds... count 1 through 10, one per second${NC}"
sleep 12

log "=== USER COUNTING RESULTS ==="
USER_TRANSCRIPTIONS=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | tail -n 20 || echo "NONE")
if [ "$USER_TRANSCRIPTIONS" = "NONE" ]; then
    log "${RED}FAIL: No transcription updates during user counting${NC}"
else
    echo "$USER_TRANSCRIPTIONS" | while read line; do
        TEXT=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text','<no text>'))" 2>/dev/null || echo "$line")
        IS_FINAL=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('isFinal',False))" 2>/dev/null || echo "?")
        log "  Text: '$TEXT' | Final: $IS_FINAL"
    done
fi

log "Sending stop_listening (session 5)"
echo '{"type":"stop_listening","data":null}' > "$FIFO_IN"
sleep 1

# ============================================================
# CLEANUP
# ============================================================

log_section "CLEANUP"

# Kill the helper process
log "Killing helper process $HELPER_PID"
kill "$HELPER_PID" 2>/dev/null || true
wait "$HELPER_PID" 2>/dev/null || true

# Show full helper stderr for debugging
log ""
log "=== FULL HELPER STDERR ==="
cat "$HELPER_ERR" | while read line; do
    log "  [stderr] $line"
done

# Cleanup temp files
rm -f "$FIFO_IN" "$HELPER_OUT" "$HELPER_OUT2" "$HELPER_ERR"

log ""
log_section "TESTS COMPLETE"
log "Full results saved to: $LOG_FILE"

# Summary announcement
say -o /tmp/soft_say.aiff "S T T tests complete. Check the terminal for results."
afplay -v 0.3 /tmp/soft_say.aiff &
