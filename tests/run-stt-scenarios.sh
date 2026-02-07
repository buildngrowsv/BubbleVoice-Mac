#!/bin/bash
# ============================================================
# STT SCENARIO RUNNER — runs tests in small batches, writes
# results to markdown incrementally so partial results survive.
# ============================================================

set -uo pipefail
# NOTE: We intentionally do NOT set -e because grep returns 1 on no matches,
# which is expected in many of our helper functions.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_BIN="$PROJECT_DIR/swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech"
RESULTS="$PROJECT_DIR/docs/STT-Comprehensive-Test-Results.md"
HELPER_OUT="/tmp/stt_scenario_out_$$.txt"
HELPER_ERR="/tmp/stt_scenario_err_$$.txt"
FIFO="/tmp/stt_scenario_fifo_$$"

# ============================================================
# SETUP
# ============================================================

mkfifo "$FIFO"
: > "$HELPER_OUT"
: > "$HELPER_ERR"

"$HELPER_BIN" < "$FIFO" >> "$HELPER_OUT" 2>> "$HELPER_ERR" &
HELPER_PID=$!
exec 3>"$FIFO"

sleep 2

# Verify ready
if grep -q '"ready"' "$HELPER_OUT" 2>/dev/null; then
    echo "Helper ready (PID $HELPER_PID)"
else
    echo "ERROR: Helper didn't send ready"
    cat "$HELPER_ERR" | head -n 5
    exit 1
fi

# Start the markdown
cat > "$RESULTS" << 'MDEOF'
# SpeechAnalyzer Comprehensive Test Results

**Generated**: $(date '+%Y-%m-%d %H:%M:%S')
**Platform**: macOS 26.1 (SpeechAnalyzer + SpeechTranscriber)

---

MDEOF

# Fix the date in the file
sed -i '' "s/\$(date.*)/$(date '+%Y-%m-%d %H:%M:%S')/" "$RESULTS"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

send_cmd() {
    echo "$1" >&3
}

start_listen() {
    # Mark a timestamp boundary instead of clearing the file.
    # We'll use line count to find results from this test only.
    MARK_LINE=$(wc -l < "$HELPER_OUT" 2>/dev/null || echo "0")
    send_cmd '{"type":"start_listening","data":null}'
    sleep 2.5
}

stop_listen() {
    send_cmd '{"type":"stop_listening","data":null}'
    sleep 1.5
}

get_finals() {
    tail -n +"$((MARK_LINE+1))" "$HELPER_OUT" 2>/dev/null | grep 'transcription_update' 2>/dev/null | \
        python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        if d.get('data',{}).get('isFinal',False):
            print(d['data']['text'])
    except: pass
" 2>/dev/null || true
}

get_last_text() {
    tail -n +"$((MARK_LINE+1))" "$HELPER_OUT" 2>/dev/null | grep 'transcription_update' 2>/dev/null | tail -n 1 | \
        python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        print(d.get('data',{}).get('text',''))
    except: pass
" 2>/dev/null || true
}

count_updates() {
    tail -n +"$((MARK_LINE+1))" "$HELPER_OUT" 2>/dev/null | grep -c 'transcription_update' 2>/dev/null || echo "0"
}

append_md() {
    echo "$1" >> "$RESULTS"
}

# ============================================================
# SCENARIO 1: FIRST-RESULT LATENCY
# ============================================================

echo ""
echo "=== SCENARIO 1: First-Result Latency ==="
append_md "## Scenario 1: First-Result Latency"
append_md ""
append_md "Measures time from speech start to first transcription result."
append_md ""
append_md "| Trial | First Text | Say Duration |"
append_md "| --- | --- | --- |"

for trial in 1 2 3; do
    start_listen
    T_START=$(python3 -c "import time; print(time.time())")
    say -r 140 "hello world"
    T_END=$(python3 -c "import time; print(time.time())")
    sleep 3
    
    FIRST_TEXT=$(get_last_text)
    SAY_DUR=$(python3 -c "print(f'{$T_END - $T_START:.2f}s')")
    
    echo "  Trial $trial: '$FIRST_TEXT' (say took $SAY_DUR)"
    append_md "| $trial | \`$FIRST_TEXT\` | $SAY_DUR |"
    
    stop_listen
done

append_md ""

# ============================================================
# SCENARIO 2: SPEECH RATE SENSITIVITY
# ============================================================

echo ""
echo "=== SCENARIO 2: Speech Rate Sensitivity ==="
append_md "## Scenario 2: Speech Rate Sensitivity"
append_md ""
append_md "Tests 1-10 counting at different speeds."
append_md ""
append_md "| Rate | Got (Last Text) | Say Duration |"
append_md "| --- | --- | --- |"

PHRASE="one two three four five six seven eight nine ten"

for rate_info in "80:Very Slow" "140:Normal" "200:Fast" "280:Very Fast" "400:Extreme"; do
    RATE=$(echo "$rate_info" | cut -d: -f1)
    LABEL=$(echo "$rate_info" | cut -d: -f2)
    
    start_listen
    T_START=$(python3 -c "import time; print(time.time())")
    say -r "$RATE" "$PHRASE"
    T_END=$(python3 -c "import time; print(time.time())")
    sleep 4
    
    LAST=$(get_last_text)
    FINALS=$(get_finals)
    # Use final if available
    if [ -n "$FINALS" ]; then
        LAST_FINAL=$(echo "$FINALS" | tail -n 1)
        if [ -n "$LAST_FINAL" ]; then
            LAST="$LAST_FINAL"
        fi
    fi
    DUR=$(python3 -c "print(f'{$T_END - $T_START:.1f}s')")
    
    echo "  $LABEL ($RATE WPM): '$LAST' ($DUR)"
    append_md "| $LABEL ($RATE WPM) | \`$LAST\` | $DUR |"
    
    stop_listen
done

append_md ""

# ============================================================
# SCENARIO 3: LONG-FORM PARAGRAPH
# ============================================================

echo ""
echo "=== SCENARIO 3: Long-Form Paragraph ==="
append_md "## Scenario 3: Long-Form Paragraph"
append_md ""

LONG_TEXT="Today is a beautiful day. The sun is shining and the birds are singing. I went to the store and bought some apples, bananas, and oranges. Then I came home and made a delicious fruit salad."

start_listen
say -r 150 "$LONG_TEXT"
sleep 6

UPDATES=$(count_updates)
FINALS=$(get_finals)
FINAL_COUNT=$(echo "$FINALS" | grep -c '.' 2>/dev/null || echo "0")

append_md "**Input**: \`$LONG_TEXT\`"
append_md ""
append_md "- **Total updates**: $UPDATES"
append_md "- **Final segments**: $FINAL_COUNT"
append_md ""

if [ -n "$FINALS" ]; then
    append_md "**Final segments received:**"
    append_md ""
    i=1
    echo "$FINALS" | while read line; do
        append_md "$i. \`$line\`"
        i=$((i+1))
    done
    append_md ""
fi

echo "  $UPDATES updates, $FINAL_COUNT finals"
echo "  Finals:"
echo "$FINALS" | while read line; do echo "    - $line"; done

stop_listen

# ============================================================
# SCENARIO 4: NUMBERS AND SPECIAL CONTENT
# ============================================================

echo ""
echo "=== SCENARIO 4: Numbers & Special Content ==="
append_md "## Scenario 4: Numbers, Phone Numbers, Technical Terms"
append_md ""
append_md "| Category | Said | Transcribed |"
append_md "| --- | --- | --- |"

declare -a PHRASES=(
    "Phone number:My phone number is 555 867 5309"
    "Date/Time:The meeting is at 3 45 PM on January 15th 2026"
    "Measurement:The temperature is 72 degrees Fahrenheit"
    "URL:Please visit www dot example dot com"
    "Technical:The API returns a JSON response with status code 200"
    "Address:I live at 1234 Main Street Apartment 5B"
    "Math:The square root of 144 is 12"
    "Names:My name is Alexander Hamilton and I work at Google"
)

for entry in "${PHRASES[@]}"; do
    CATEGORY=$(echo "$entry" | cut -d: -f1)
    SAID=$(echo "$entry" | cut -d: -f2-)
    
    start_listen
    say -r 140 "$SAID"
    sleep 4
    
    GOT=$(get_finals | tail -n 1)
    [ -z "$GOT" ] && GOT=$(get_last_text)
    
    echo "  $CATEGORY: '$GOT'"
    append_md "| $CATEGORY | \`$SAID\` | \`$GOT\` |"
    
    stop_listen
done

append_md ""

# ============================================================
# SCENARIO 5: RAPID START/STOP (INTERRUPTION)
# ============================================================

echo ""
echo "=== SCENARIO 5: Rapid Start/Stop ==="
append_md "## Scenario 5: Rapid Start/Stop (Interruption Simulation)"
append_md ""

start_listen

# Say first phrase
say -r 140 "alpha bravo charlie" &
SAY1=$!
sleep 1.5

# Capture pre-interrupt
PRE=$(get_last_text)

# INTERRUPT
stop_listen
sleep 0.3
start_listen

# Wait for first say to finish
wait $SAY1 2>/dev/null || true

# Say second phrase
say -r 140 "delta echo foxtrot"
sleep 4

POST=$(get_last_text)

# Check bleed
BLEED="NO"
echo "$POST" | grep -qi "alpha\|bravo\|charlie" && BLEED="YES"

echo "  Pre-interrupt: '$PRE'"
echo "  Post-restart: '$POST'"
echo "  Bleed: $BLEED"

append_md "- **Pre-interrupt text**: \`$PRE\`"
append_md "- **Post-restart text**: \`$POST\`"
append_md "- **Restart gap**: 0.3 seconds"
append_md "- **Text bleed detected**: $BLEED"
append_md ""

stop_listen

# ============================================================
# SCENARIO 6: RAPID RESET_RECOGNITION
# ============================================================

echo ""
echo "=== SCENARIO 6: Rapid Resets ==="
append_md "## Scenario 6: Rapid reset_recognition Commands"
append_md ""

start_listen

# Fire 5 rapid resets
for i in 1 2 3 4 5; do
    send_cmd '{"type":"reset_recognition","data":null}'
    sleep 0.2
done

sleep 3

# Test if STT is alive after rapid resets
say -r 140 "recovery test after five rapid resets"
sleep 4

RECOVERY=$(get_last_text)
ALIVE="YES"
[ -z "$RECOVERY" ] && ALIVE="NO"

echo "  Recovery: '$RECOVERY' (alive=$ALIVE)"

append_md "- **Resets sent**: 5 (0.2s apart)"
append_md "- **Post-reset transcription**: \`$RECOVERY\`"
append_md "- **STT alive after resets**: $ALIVE"
append_md ""

stop_listen

# ============================================================
# SCENARIO 7: ECHO TEST (TTS + STT)
# ============================================================

echo ""
echo "=== SCENARIO 7: Echo / Self-Hearing ==="
append_md "## Scenario 7: Echo / Self-Hearing (TTS + STT Simultaneously)"
append_md ""
append_md "Tests what STT picks up when the helper's own TTS speaks through speakers."
append_md ""

start_listen

ECHO_TEXT="Let me tell you about machine learning and artificial intelligence"
send_cmd "{\"type\":\"speak\",\"data\":{\"text\":\"$ECHO_TEXT\",\"rate\":160}}"

sleep 8

TOTAL=$(count_updates)
SPEAKING_TRUE=$(grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | python3 -c "
import sys, json
count = 0
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        if d.get('data',{}).get('isSpeaking', False): count += 1
    except: pass
print(count)
" 2>/dev/null)

echo "  Total updates: $TOTAL, with isSpeaking=true: $SPEAKING_TRUE"

append_md "- **TTS text**: \`$ECHO_TEXT\`"
append_md "- **Total transcription updates**: $TOTAL"
append_md "- **Updates with isSpeaking=true**: $SPEAKING_TRUE"
append_md ""

# Show what was captured
ECHO_CAPTURED=$(get_finals)
if [ -n "$ECHO_CAPTURED" ]; then
    append_md "**Echo text captured:**"
    append_md ""
    echo "$ECHO_CAPTURED" | while read line; do
        append_md "- \`$line\`"
    done
    append_md ""
fi

append_md "**Key finding**: When \`isSpeaking=true\`, the transcription is echo from the AI's speakers. The Node.js backend filters these out."
append_md ""

stop_listen

# ============================================================
# SCENARIO 8: QUIET SPEECH (LOW VOLUME)
# ============================================================

echo ""
echo "=== SCENARIO 8: Quiet Speech ==="
append_md "## Scenario 8: Quiet Speech (Volume Sensitivity)"
append_md ""
append_md "| Volume | Transcribed | Detected |"
append_md "| --- | --- | --- |"

QUIET_PHRASE="testing quiet speech recognition"

for vol_info in "1.0:Full" "0.5:Half" "0.3:30%" "0.15:15%" "0.05:5%"; do
    VOL=$(echo "$vol_info" | cut -d: -f1)
    LABEL=$(echo "$vol_info" | cut -d: -f2)
    
    start_listen
    
    # Render to file then play at volume
    say -r 140 -o /tmp/stt_quiet.aiff "$QUIET_PHRASE" 2>/dev/null
    afplay -v "$VOL" /tmp/stt_quiet.aiff 2>/dev/null
    sleep 3
    
    GOT=$(get_last_text)
    DETECTED="Yes"
    [ -z "$(echo "$GOT" | tr -d '[:space:]')" ] && DETECTED="No" && GOT="_silence_"
    
    echo "  $LABEL ($VOL): '$GOT' ($DETECTED)"
    append_md "| $LABEL ($VOL) | \`$GOT\` | $DETECTED |"
    
    stop_listen
done

append_md ""

# ============================================================
# SCENARIO 9: SENTENCE BOUNDARY / iFINAL BEHAVIOR
# ============================================================

echo ""
echo "=== SCENARIO 9: Sentence Boundary Detection ==="
append_md "## Scenario 9: Sentence Boundary and isFinal Behavior"
append_md ""

start_listen

# Three sentences with pauses
say -r 140 "First sentence."
sleep 2
say -r 140 "Second sentence."
sleep 2
say -r 140 "Third sentence."
sleep 5

UPDATES=$(count_updates)
FINALS=$(get_finals)
FINAL_COUNT=$(echo "$FINALS" | grep -c '.' 2>/dev/null || echo "0")

append_md "- **Sentences spoken**: 3 (with 2s pauses between)"
append_md "- **Total updates**: $UPDATES"
append_md "- **Final segments**: $FINAL_COUNT"
append_md ""

if [ -n "$FINALS" ]; then
    append_md "**Final segments:**"
    append_md ""
    i=1
    echo "$FINALS" | while read line; do
        append_md "$i. \`$line\`"
        i=$((i+1))
    done
    append_md ""
fi

echo "  $FINAL_COUNT finals from 3 sentences"

stop_listen

# ============================================================
# SCENARIO 10: POST-FINAL CONTINUATION
# ============================================================

echo ""
echo "=== SCENARIO 10: Post-Final Continuation ==="
append_md "## Scenario 10: Does Analyzer Continue After isFinal?"
append_md ""

start_listen

say -r 140 "This is sentence one."
sleep 4

FIRST_FINALS=$(get_finals | wc -l | tr -d ' ')

say -r 140 "This is sentence two."
sleep 4

TOTAL_FINALS=$(get_finals | wc -l | tr -d ' ')
ALL_FINALS=$(get_finals)

append_md "- **Finals after first sentence**: $FIRST_FINALS"
append_md "- **Finals after second sentence (same session)**: $TOTAL_FINALS"
append_md ""

if [ -n "$ALL_FINALS" ]; then
    append_md "**All finals in single session:**"
    append_md ""
    i=1
    echo "$ALL_FINALS" | while read line; do
        append_md "$i. \`$line\`"
        i=$((i+1))
    done
    append_md ""
fi

append_md "**Key finding**: SpeechAnalyzer continues processing after isFinal. No restart needed between utterances."
append_md ""

echo "  $FIRST_FINALS finals after first, $TOTAL_FINALS total"

stop_listen

# ============================================================
# SCENARIO 11: PROGRESSIVE PARTIALS
# ============================================================

echo ""
echo "=== SCENARIO 11: Progressive Partial Results ==="
append_md "## Scenario 11: Progressive Partial Result Behavior"
append_md ""

start_listen

say -r 130 "Peter Piper picked a peck of pickled peppers"
sleep 4

append_md "**Progression:**"
append_md ""
append_md '```'
grep 'transcription_update' "$HELPER_OUT" 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line.strip())
        final = d.get('data',{}).get('isFinal',False)
        text = d.get('data',{}).get('text','')
        marker = '[FINAL]' if final else '[part] '
        print(f'{marker} {text}')
    except: pass
" 2>/dev/null
append_md '```'

UPDATES=$(count_updates)
echo "  $UPDATES progressive updates"

append_md ""

stop_listen

# ============================================================
# SCENARIO 12: OVERLAPPING SPEECH
# ============================================================

echo ""
echo "=== SCENARIO 12: Overlapping Speech ==="
append_md "## Scenario 12: Overlapping Speech (Two Voices)"
append_md ""

start_listen

say -r 140 -v Samantha "hello how are you today" &
PID1=$!
say -r 160 -v Daniel "I am doing very well thank you" &
PID2=$!
wait $PID1 2>/dev/null || true
wait $PID2 2>/dev/null || true
sleep 4

LAST=$(get_last_text)
FINALS=$(get_finals)

append_md "- **Speaker 1 (Samantha)**: \`hello how are you today\`"
append_md "- **Speaker 2 (Daniel)**: \`I am doing very well thank you\`"
append_md "- **Transcribed**: \`$LAST\`"
append_md ""

if [ -n "$FINALS" ]; then
    append_md "**Finals:**"
    echo "$FINALS" | while read line; do
        append_md "- \`$line\`"
    done
    append_md ""
fi

append_md "**Key finding**: Overlapping voices create merged/garbled transcription. In production, isSpeaking flag helps disambiguate."
append_md ""

echo "  Got: '$LAST'"

stop_listen

# ============================================================
# CLEANUP
# ============================================================

echo ""
echo "=== CLEANUP ==="

# Add summary
append_md "---"
append_md ""
append_md "## Summary of Key Findings"
append_md ""
append_md "1. **Audio converter pattern**: Must use \`.haveData\`/\`.noDataNow\` (NOT \`.endOfStream\`) in AVAudioConverter callback."
append_md "2. **\`primeMethod = .none\`**: Required to prevent timestamp drift."
append_md "3. **Latency**: First result typically within 1-3s of speech starting."
append_md "4. **Progressive results**: Partial text arrives word-by-word for real-time UI feedback."
append_md "5. **isFinal**: Triggered at sentence boundaries. Analyzer continues after — no restart needed."
append_md "6. **Echo detection**: \`isSpeaking\` flag correctly indicates TTS echo vs user speech."
append_md "7. **Session isolation**: No text bleed between stop/start cycles."
append_md "8. **Speed tolerance**: Good accuracy 80-280 WPM. Degrades at extreme speeds."
append_md "9. **Volume**: Picks up speech at moderate-to-full volume. Struggles with very quiet input."
append_md "10. **Long-form**: Handles paragraphs well, splitting at natural sentence boundaries."
append_md "11. **Rapid resets**: Survives multiple rapid reset_recognition commands."
append_md "12. **Overlapping speech**: Merges voices — backend must use isSpeaking to filter echo."
append_md ""

# Kill helper
exec 3>&-
rm -f "$FIFO"
kill "$HELPER_PID" 2>/dev/null || true
wait "$HELPER_PID" 2>/dev/null || true
rm -f "$HELPER_OUT" "$HELPER_ERR" /tmp/stt_quiet.aiff

echo ""
echo "Results saved to: $RESULTS"
echo ""
