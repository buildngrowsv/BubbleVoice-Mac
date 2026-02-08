#!/bin/bash

echo "Testing say command audio file generation latency..."
echo ""

declare -a texts=(
    "Yes"
    "Hello, how are you today?"
    "I understand what you're saying. Let me think about that for a moment and provide you with a thoughtful response."
    "This is a longer response that simulates what an AI assistant might say during a typical conversation. It includes multiple sentences and covers several different points. The goal is to see how the say command performs with realistic response lengths that you might encounter in actual usage. This should give us a good baseline for understanding the latency characteristics."
)

declare -a labels=("Short (1 word)" "Medium (5 words)" "Long (25 words)" "Very Long (70 words)")

for i in "${!texts[@]}"; do
    text="${texts[$i]}"
    label="${labels[$i]}"
    outfile="/tmp/say_test_$i.aiff"
    
    echo "[$label]"
    echo "  Text: \"${text:0:60}...\""
    
    start=$(python3 -c "import time; print(int(time.time() * 1000))")
    say -o "$outfile" "$text" 2>/dev/null
    end=$(python3 -c "import time; print(int(time.time() * 1000))")
    elapsed=$((end - start))
    
    size=$(ls -lh "$outfile" | awk '{print $5}')
    duration=$(afinfo "$outfile" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
    
    echo "  Generation time: ${elapsed}ms"
    echo "  File size: $size"
    echo "  Audio duration: ${duration}s"
    if [ -n "$duration" ] && [ "$duration" != "0" ]; then
        ratio=$(python3 -c "print(f'{$elapsed / ($duration * 1000):.2f}')")
        echo "  Ratio: ${ratio}x realtime"
    fi
    echo ""
done

echo "Testing: Can say output to different formats/streams?"
echo ""

echo "[Test 1: say -o /dev/stdout]"
timeout 2 say -o /dev/stdout "test" 2>&1 | head -c 50
echo ""
echo ""

echo "[Test 2: say with --data-format flag]"
say --data-format=LEF32@16000 -o /tmp/test_fmt.caf "test" 2>&1
if [ -f /tmp/test_fmt.caf ]; then
    echo "  ✅ Custom format works"
    afinfo /tmp/test_fmt.caf 2>&1 | grep -E "format|rate" | head -n 5
    rm /tmp/test_fmt.caf
fi
echo ""

echo "[Test 3: Available say data formats]"
say --help 2>&1 | grep -A 20 "data-format" | head -n 15
echo ""

echo "Cleanup..."
rm -f /tmp/say_test_*.aiff
echo "Done."
