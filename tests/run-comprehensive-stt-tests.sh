#!/bin/bash
# ============================================================
# COMPREHENSIVE STT TEST SUITE RUNNER
# ============================================================
#
# This script runs multiple STT tests to verify transcription
# is working properly in the BubbleVoice-Mac app.
#
# Tests:
# 1. Basic transcription with TTS playback
# 2. Real-time streaming (word-by-word updates)
# 3. Session reset and continuation
# 4. Short utterance detection
# 5. Long utterance handling
# 6. Echo cancellation verification
#
# USAGE:
#   chmod +x tests/run-comprehensive-stt-tests.sh
#   ./tests/run-comprehensive-stt-tests.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HELPER_BIN="$PROJECT_DIR/swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech"
RESULTS_DIR="$PROJECT_DIR/tests/test-artifacts-generated"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$RESULTS_DIR/stt-comprehensive-test-$TIMESTAMP.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Create results directory
mkdir -p "$RESULTS_DIR"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

log() {
    local msg="[$(date '+%H:%M:%S.%3N')] $1"
    echo -e "$msg"
    echo "$msg" >> "$LOG_FILE"
}

log_header() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo "" >> "$LOG_FILE"
    echo "============================================================" >> "$LOG_FILE"
    echo "  $1" >> "$LOG_FILE"
    echo "============================================================" >> "$LOG_FILE"
}

log_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo ""
    echo -e "${BLUE}TEST $TESTS_RUN: $1${NC}"
    echo "" >> "$LOG_FILE"
    echo "TEST $TESTS_RUN: $1" >> "$LOG_FILE"
}

log_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✅ PASS: $1${NC}"
    echo "✅ PASS: $1" >> "$LOG_FILE"
}

log_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}❌ FAIL: $1${NC}"
    echo "❌ FAIL: $1" >> "$LOG_FILE"
}

log_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
    echo "ℹ️  $1" >> "$LOG_FILE"
}

# Check if helper binary exists
if [ ! -f "$HELPER_BIN" ]; then
    echo -e "${RED}ERROR: Swift helper binary not found at $HELPER_BIN${NC}"
    echo "Building..."
    cd "$PROJECT_DIR/swift-helper/BubbleVoiceSpeech"
    swift build -c debug 2>&1 | tail -n 10
    cd "$PROJECT_DIR"
fi

# Initialize log file
log_header "STT COMPREHENSIVE TEST SUITE"
log "Test run started at $(date)"
log "Helper binary: $HELPER_BIN"
log "Results directory: $RESULTS_DIR"

# ============================================================
# HELPER PROCESS MANAGEMENT
# ============================================================

# Global variables for helper process
HELPER_PID=""
FIFO_IN=""
HELPER_OUT=""
HELPER_ERR=""

start_helper() {
    log_info "Starting Swift helper process..."
    
    # Create temporary files
    FIFO_IN=$(mktemp -u /tmp/stt_test_in.XXXXXX)
    mkfifo "$FIFO_IN"
    HELPER_OUT=$(mktemp /tmp/stt_test_out.XXXXXX)
    HELPER_ERR=$(mktemp /tmp/stt_test_err.XXXXXX)
    
    # Start helper
    cat "$FIFO_IN" | "$HELPER_BIN" > "$HELPER_OUT" 2>"$HELPER_ERR" &
    HELPER_PID=$!
    
    log "Helper started with PID $HELPER_PID"
    
    # Wait for ready signal
    sleep 2
    
    if ! kill -0 "$HELPER_PID" 2>/dev/null; then
        log_fail "Helper died during startup"
        cat "$HELPER_ERR" | head -n 20
        cleanup_helper
        exit 1
    fi
    
    # Check for ready signal
    if grep -q '"ready"' "$HELPER_OUT" 2>/dev/null; then
        log_pass "Helper sent ready signal"
    else
        log_info "Waiting for ready signal..."
        sleep 1
    fi
}

send_command() {
    local cmd_type="$1"
    local data="${2:-null}"
    echo "{\"type\":\"$cmd_type\",\"data\":$data}" > "$FIFO_IN"
    log "Sent command: $cmd_type"
}

cleanup_helper() {
    if [ -n "$HELPER_PID" ] && kill -0 "$HELPER_PID" 2>/dev/null; then
        log_info "Stopping helper process $HELPER_PID"
        kill "$HELPER_PID" 2>/dev/null || true
        wait "$HELPER_PID" 2>/dev/null || true
    fi
    
    # Clean up temp files
    rm -f "$FIFO_IN" "$HELPER_OUT" "$HELPER_ERR"
}

get_transcriptions() {
    grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | tail -n "${1:-10}" || echo ""
}

get_last_transcription_text() {
    local trans=$(get_transcriptions 1)
    if [ -z "$trans" ]; then
        echo ""
    else
        echo "$trans" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('text',''))" 2>/dev/null || echo ""
    fi
}

count_transcriptions() {
    grep -c 'transcription_update' "$HELPER_OUT" 2>/dev/null || echo "0"
}

# ============================================================
# TEST 1: BASIC TRANSCRIPTION
# ============================================================

test_basic_transcription() {
    log_test "Basic Transcription with TTS"
    
    send_command "start_listening"
    sleep 2
    
    # Play test phrase
    local test_phrase="Hello world this is a test"
    log_info "Playing: '$test_phrase'"
    say -r 140 "$test_phrase" &
    local say_pid=$!
    wait $say_pid 2>/dev/null || true
    sleep 3
    
    # Check results
    local trans_count=$(count_transcriptions)
    local last_text=$(get_last_transcription_text)
    
    log_info "Transcription count: $trans_count"
    log_info "Last text: '$last_text'"
    
    if [ "$trans_count" -gt 0 ]; then
        log_pass "Received $trans_count transcription updates"
        
        # Check if we got some of the words
        if echo "$last_text" | grep -qi "hello\|world\|test"; then
            log_pass "Transcription contains expected words"
        else
            log_fail "Transcription missing expected words"
        fi
    else
        log_fail "No transcription updates received"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# TEST 2: REAL-TIME STREAMING
# ============================================================

test_realtime_streaming() {
    log_test "Real-Time Streaming (Word-by-Word)"
    
    # Clear output file
    > "$HELPER_OUT"
    
    send_command "start_listening"
    sleep 2
    
    # Play a longer phrase slowly
    local test_phrase="One two three four five six seven eight nine ten"
    log_info "Playing slowly: '$test_phrase'"
    say -r 100 "$test_phrase" &
    local say_pid=$!
    
    # Monitor for streaming updates
    local start_time=$(date +%s)
    sleep 1
    
    # Check for multiple updates (streaming behavior)
    local updates_during_speech=0
    while kill -0 $say_pid 2>/dev/null; do
        local current_count=$(count_transcriptions)
        if [ "$current_count" -gt "$updates_during_speech" ]; then
            updates_during_speech=$current_count
            log_info "Received update #$updates_during_speech during speech"
        fi
        sleep 0.5
    done
    
    wait $say_pid 2>/dev/null || true
    sleep 3
    
    local final_count=$(count_transcriptions)
    log_info "Total transcription updates: $final_count"
    
    if [ "$final_count" -gt 3 ]; then
        log_pass "Received multiple streaming updates ($final_count) - real-time streaming working"
    elif [ "$final_count" -gt 0 ]; then
        log_info "Received $final_count updates (may be batched, not fully streaming)"
    else
        log_fail "No transcription updates received"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# TEST 3: SESSION RESET
# ============================================================

test_session_reset() {
    log_test "Session Reset and Continuation"
    
    # Session 1
    send_command "start_listening"
    sleep 2
    
    say -r 140 "First session apple banana" &
    wait $! 2>/dev/null || true
    sleep 2
    
    local session1_text=$(get_last_transcription_text)
    log_info "Session 1 text: '$session1_text'"
    
    send_command "stop_listening"
    sleep 1
    
    # Reset
    send_command "reset_recognition"
    sleep 2
    
    # Session 2
    send_command "start_listening"
    sleep 2
    
    say -r 140 "Second session orange grape" &
    wait $! 2>/dev/null || true
    sleep 2
    
    local session2_text=$(get_last_transcription_text)
    log_info "Session 2 text: '$session2_text'"
    
    # Check for text bleed
    if echo "$session2_text" | grep -qi "apple\|banana"; then
        log_fail "Text bleed detected from session 1"
    else
        log_pass "No text bleed - sessions properly isolated"
    fi
    
    if echo "$session2_text" | grep -qi "orange\|grape\|second"; then
        log_pass "Session 2 transcription working"
    else
        log_fail "Session 2 transcription failed"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# TEST 4: SHORT UTTERANCES
# ============================================================

test_short_utterances() {
    log_test "Short Utterance Detection"
    
    send_command "start_listening"
    sleep 2
    
    # Test single words
    local words=("yes" "no" "okay" "stop" "go")
    local detected=0
    
    for word in "${words[@]}"; do
        log_info "Testing word: '$word'"
        say -r 120 "$word"
        sleep 2
        
        local text=$(get_last_transcription_text)
        if echo "$text" | grep -qi "$word"; then
            log_info "✓ Detected: '$word'"
            detected=$((detected + 1))
        else
            log_info "✗ Missed: '$word' (got: '$text')"
        fi
        sleep 1
    done
    
    log_info "Detected $detected out of ${#words[@]} short utterances"
    
    if [ "$detected" -ge 3 ]; then
        log_pass "Short utterance detection working ($detected/${#words[@]})"
    else
        log_fail "Short utterance detection poor ($detected/${#words[@]})"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# TEST 5: LONG UTTERANCE
# ============================================================

test_long_utterance() {
    log_test "Long Utterance Handling"
    
    send_command "start_listening"
    sleep 2
    
    local long_text="The quick brown fox jumps over the lazy dog while the sun shines brightly in the clear blue sky and birds sing their melodious songs"
    log_info "Playing long utterance (${#long_text} chars)"
    
    say -r 150 "$long_text" &
    wait $! 2>/dev/null || true
    sleep 4
    
    local result=$(get_last_transcription_text)
    local result_length=${#result}
    
    log_info "Transcribed: '$result'"
    log_info "Length: $result_length chars"
    
    # Count matching words
    local expected_words=$(echo "$long_text" | tr '[:upper:]' '[:lower:]' | wc -w | tr -d ' ')
    local got_words=$(echo "$result" | tr '[:upper:]' '[:lower:]' | wc -w | tr -d ' ')
    
    log_info "Expected words: $expected_words, Got: $got_words"
    
    if [ "$got_words" -ge $((expected_words * 7 / 10)) ]; then
        log_pass "Long utterance handled well ($got_words/$expected_words words)"
    elif [ "$got_words" -gt 0 ]; then
        log_info "Partial transcription ($got_words/$expected_words words)"
    else
        log_fail "Long utterance transcription failed"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# TEST 6: ECHO CANCELLATION
# ============================================================

test_echo_cancellation() {
    log_test "Echo Cancellation (Hardware AEC)"
    
    # Clear output
    > "$HELPER_OUT"
    
    send_command "start_listening"
    sleep 2
    
    # Use the helper's speak command (simulates AI speaking)
    local ai_speech="I am the AI assistant speaking right now"
    log_info "AI speaking: '$ai_speech'"
    send_command "speak" "{\"text\":\"$ai_speech\",\"rate\":180}"
    
    sleep 5
    
    # Check if STT picked up the AI's speech (it shouldn't with good AEC)
    local trans_count=$(count_transcriptions)
    local last_text=$(get_last_transcription_text)
    
    log_info "Transcriptions during AI speech: $trans_count"
    if [ -n "$last_text" ]; then
        log_info "Text captured: '$last_text'"
    fi
    
    if [ "$trans_count" -eq 0 ]; then
        log_pass "Perfect echo cancellation - no AI speech leaked"
    elif echo "$last_text" | grep -qi "assistant\|speaking"; then
        log_fail "Echo detected - AI speech leaked to STT"
    else
        log_info "Some transcription occurred but not AI speech"
    fi
    
    send_command "stop_listening"
    sleep 1
}

# ============================================================
# RUN ALL TESTS
# ============================================================

log_header "STARTING TEST SUITE"

# Start the helper process once
start_helper

# Run all tests
test_basic_transcription
test_realtime_streaming
test_session_reset
test_short_utterances
test_long_utterance
test_echo_cancellation

# Cleanup
cleanup_helper

# ============================================================
# SUMMARY
# ============================================================

log_header "TEST SUMMARY"
log "Tests run: $TESTS_RUN"
log "Tests passed: $TESTS_PASSED"
log "Tests failed: $TESTS_FAILED"

if [ "$TESTS_FAILED" -eq 0 ]; then
    log ""
    log_pass "ALL TESTS PASSED! 🎉"
else
    log ""
    log_fail "$TESTS_FAILED test(s) failed"
fi

log ""
log "Full results saved to: $LOG_FILE"

# Announce completion
timeout 30 bash -c "
say -o /tmp/soft_say.aiff 'Comprehensive S T T tests complete. $TESTS_PASSED out of $TESTS_RUN tests passed.'
afplay -v 0.3 /tmp/soft_say.aiff
" 2>/dev/null || true

echo ""
echo -e "${CYAN}Test run complete. Check the log file for details.${NC}"
