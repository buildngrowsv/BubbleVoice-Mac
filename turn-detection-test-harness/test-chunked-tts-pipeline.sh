#!/bin/bash

# Test chunked sentence-by-sentence TTS pipeline timing
# Goal: Determine if we can generate sentence N+1 while playing sentence N
# without causing gaps/delays

echo "=========================================="
echo "Chunked TTS Pipeline Latency Analysis"
echo "=========================================="
echo ""

# Test sentences of varying lengths
declare -a sentences=(
    "Yes."
    "I see."
    "That makes sense."
    "Let me think about that."
    "I understand what you're asking."
    "That's a really interesting question you've raised."
    "Let me explain the key concepts behind this approach."
    "I think the best way to handle this situation is to break it down into smaller steps."
    "When you're dealing with complex systems like this, it's important to consider both the immediate effects and the long-term implications."
)

declare -a labels=(
    "Tiny (1 word)"
    "Very Short (2 words)"
    "Short (3 words)"
    "Medium-Short (5 words)"
    "Medium (6 words)"
    "Medium-Long (9 words)"
    "Long (11 words)"
    "Very Long (19 words)"
    "Extra Long (24 words)"
)

echo "Phase 1: Individual Sentence Timing"
echo "===================================="
echo ""

results_file="/tmp/tts_results.txt"
rm -f "$results_file"

for i in "${!sentences[@]}"; do
    sentence="${sentences[$i]}"
    label="${labels[$i]}"
    outfile="/tmp/sentence_$i.aiff"
    
    echo "[$label]"
    echo "  Text: \"$sentence\""
    
    # Generate
    gen_start=$(python3 -c "import time; print(time.time())")
    say -o "$outfile" "$sentence" 2>/dev/null
    gen_end=$(python3 -c "import time; print(time.time())")
    gen_time=$(python3 -c "print(int(($gen_end - $gen_start) * 1000))")
    
    # Get audio duration
    duration=$(afinfo "$outfile" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
    duration_ms=$(python3 -c "print(int(float('$duration') * 1000))")
    
    # Calculate gap (negative = we're ahead, positive = we're behind)
    gap=$(python3 -c "print($gen_time - $duration_ms)")
    
    echo "  Generation: ${gen_time}ms"
    echo "  Audio duration: ${duration_ms}ms"
    echo "  Gap: ${gap}ms $([ $gap -lt 0 ] && echo '(✅ ahead by '$((-gap))'ms)' || echo '(⚠️  behind by '${gap}'ms)')"
    
    # Save for analysis
    echo "$i|$label|$gen_time|$duration_ms|$gap" >> "$results_file"
    echo ""
done

echo ""
echo "Phase 2: Simulated Pipeline (Generate N+1 while playing N)"
echo "==========================================================="
echo ""

# Simulate a multi-sentence response
declare -a response_sentences=(
    "That's a great question."
    "Let me break this down for you."
    "First, you need to understand the core concept."
    "Then we can explore the practical applications."
    "Finally, I'll show you how to implement it."
)

echo "Response: ${#response_sentences[@]} sentences"
echo ""

total_gen_time=0
total_audio_time=0
cumulative_delay=0
max_delay=0

for i in "${!response_sentences[@]}"; do
    sentence="${response_sentences[$i]}"
    outfile="/tmp/pipeline_$i.aiff"
    
    echo "[Sentence $((i+1))/${#response_sentences[@]}]: \"$sentence\""
    
    # Generate
    gen_start=$(python3 -c "import time; print(time.time())")
    say -o "$outfile" "$sentence" 2>/dev/null
    gen_end=$(python3 -c "import time; print(time.time())")
    gen_time=$(python3 -c "print(int(($gen_end - $gen_start) * 1000))")
    
    # Get audio duration
    duration=$(afinfo "$outfile" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
    duration_ms=$(python3 -c "print(int(float('$duration') * 1000))")
    
    total_gen_time=$((total_gen_time + gen_time))
    total_audio_time=$((total_audio_time + duration_ms))
    
    if [ $i -eq 0 ]; then
        # First sentence: user waits for generation
        echo "  Initial latency: ${gen_time}ms (user waits)"
        cumulative_delay=$gen_time
    else
        # Subsequent sentences: did we finish generating before previous finished playing?
        prev_duration=$(afinfo "/tmp/pipeline_$((i-1)).aiff" 2>/dev/null | grep "estimated duration" | awk '{print $3}')
        prev_duration_ms=$(python3 -c "print(int(float('$prev_duration') * 1000))")
        
        # Add 200ms pause between sentences
        available_time=$((prev_duration_ms + 200))
        
        if [ $gen_time -le $available_time ]; then
            echo "  ✅ Generated in ${gen_time}ms (had ${available_time}ms available)"
            echo "  Spare time: $((available_time - gen_time))ms"
        else
            gap=$((gen_time - available_time))
            echo "  ⚠️  Generated in ${gen_time}ms (only had ${available_time}ms available)"
            echo "  User waits extra: ${gap}ms"
            cumulative_delay=$((cumulative_delay + gap))
            [ $gap -gt $max_delay ] && max_delay=$gap
        fi
    fi
    
    echo "  Audio duration: ${duration_ms}ms"
    echo ""
done

echo "Pipeline Summary:"
echo "─────────────────"
echo "  Total generation time: ${total_gen_time}ms"
echo "  Total audio time: ${total_audio_time}ms"
echo "  Total pauses (200ms × $((${#response_sentences[@]} - 1))): $(( (${#response_sentences[@]} - 1) * 200 ))ms"
echo "  Cumulative user-facing delay: ${cumulative_delay}ms"
echo "  Max single delay: ${max_delay}ms"
echo "  Efficiency: $(python3 -c "print(f'{($total_audio_time / $total_gen_time * 100):.1f}%')")"
echo ""

echo ""
echo "Phase 3: Batching Analysis (2 sentences at a time)"
echo "==================================================="
echo ""

# Test generating 2 sentences at once
echo "Testing: Generate 2 sentences as one chunk vs separate"
echo ""

sent1="That's a great question."
sent2="Let me break this down for you."
combined="$sent1 $sent2"

# Separate
sep_start=$(python3 -c "import time; print(time.time())")
say -o /tmp/sep1.aiff "$sent1" 2>/dev/null
say -o /tmp/sep2.aiff "$sent2" 2>/dev/null
sep_end=$(python3 -c "import time; print(time.time())")
sep_time=$(python3 -c "print(int(($sep_end - $sep_start) * 1000))")

dur1=$(afinfo /tmp/sep1.aiff 2>/dev/null | grep "estimated duration" | awk '{print $3}')
dur2=$(afinfo /tmp/sep2.aiff 2>/dev/null | grep "estimated duration" | awk '{print $3}')
sep_audio=$(python3 -c "print(int((float('$dur1') + float('$dur2')) * 1000))")

# Combined
comb_start=$(python3 -c "import time; print(time.time())")
say -o /tmp/combined.aiff "$combined" 2>/dev/null
comb_end=$(python3 -c "import time; print(time.time())")
comb_time=$(python3 -c "print(int(($comb_end - $comb_start) * 1000))")

comb_dur=$(afinfo /tmp/combined.aiff 2>/dev/null | grep "estimated duration" | awk '{print $3}')
comb_audio=$(python3 -c "print(int(float('$comb_dur') * 1000))")

echo "Separate (2 calls):"
echo "  Generation: ${sep_time}ms"
echo "  Audio: ${sep_audio}ms"
echo "  Gap: $((sep_time - sep_audio))ms"
echo ""
echo "Combined (1 call):"
echo "  Generation: ${comb_time}ms"
echo "  Audio: ${comb_audio}ms"
echo "  Gap: $((comb_time - comb_audio))ms"
echo ""
echo "Savings: $((sep_time - comb_time))ms ($((100 - (comb_time * 100 / sep_time)))% faster)"
echo ""

echo ""
echo "Phase 4: Recommendations"
echo "========================"
echo ""

# Analyze results
short_behind=$(awk -F'|' '$5 > 0 && $3 < 1000' "$results_file" | wc -l | tr -d ' ')
total_short=$(awk -F'|' '$3 < 1000' "$results_file" | wc -l | tr -d ' ')

echo "Analysis from Phase 1:"
echo "  Short sentences (<1000ms gen): $total_short tested"
echo "  Behind schedule: $short_behind"
echo ""

if [ "$short_behind" -gt 0 ]; then
    echo "⚠️  RECOMMENDATION: Use adaptive batching"
    echo ""
    echo "Strategy:"
    echo "  1. If sentence < 8 words → batch with next sentence"
    echo "  2. If sentence ≥ 8 words → generate solo"
    echo "  3. Always maintain 200ms pause between logical breaks"
    echo ""
    echo "Why:"
    echo "  - Very short sentences have high overhead (generation > audio duration)"
    echo "  - Batching 2-3 short sentences amortizes the overhead"
    echo "  - Longer sentences already generate faster than realtime"
else
    echo "✅ RECOMMENDATION: Sentence-by-sentence is viable"
    echo ""
    echo "Strategy:"
    echo "  1. Split by sentence"
    echo "  2. Generate N+1 while playing N"
    echo "  3. 200ms pause between sentences"
fi

echo ""
echo "For slower machines (M2, M1):"
echo "  - Add 20-30% safety margin to generation time estimates"
echo "  - Consider minimum 6-word threshold for solo sentences"
echo "  - Pre-generate first 2 sentences before starting playback"
echo ""

# Cleanup
rm -f /tmp/sentence_*.aiff /tmp/pipeline_*.aiff /tmp/sep*.aiff /tmp/combined.aiff
rm -f "$results_file"

echo "Done."
