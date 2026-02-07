#!/bin/bash
# ============================================================
# NEURAL ENGINE STT — RUN ALL BENCHMARKS
# ============================================================
#
# Orchestrates running all STT benchmark tests sequentially
# and generates a combined summary comparing all engines.
#
# WHY sequential (not parallel): Each test uses the microphone
# and speakers for audio capture. Running them in parallel would
# cause audio conflicts and corrupt results.
#
# USAGE:
#   bash tests/neural-engine-stt-benchmarks/run-all-benchmarks.sh
#   bash tests/neural-engine-stt-benchmarks/run-all-benchmarks.sh mlx   # Just mlx-whisper
#   bash tests/neural-engine-stt-benchmarks/run-all-benchmarks.sh sherpa # Just sherpa-onnx
#
# PREREQUISITES:
#   bash tests/neural-engine-stt-benchmarks/setup-models.sh
#
# OUTPUT:
#   Results are written to tests/neural-engine-stt-benchmarks/results/
#   Each engine gets its own markdown file, plus a combined summary.
#
# CREATED: 2026-02-07 for Neural Engine STT benchmark research.
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
SUMMARY_FILE="$RESULTS_DIR/COMBINED-BENCHMARK-SUMMARY.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

# Parse args — optional filter for specific engine
ENGINE_FILTER="${1:-all}"

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  NEURAL ENGINE STT BENCHMARK SUITE${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo ""
echo -e "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "  Filter: $ENGINE_FILTER"
echo -e "  Results: $RESULTS_DIR"
echo ""

# Track timing and results
TOTAL_START=$(python3 -c "import time; print(time.time())")
declare -a ENGINE_RESULTS=()

run_engine_test() {
    local NAME="$1"
    local SCRIPT="$2"
    local SHORT="$3"
    
    # Check if this engine should be run
    if [ "$ENGINE_FILTER" != "all" ] && [ "$ENGINE_FILTER" != "$SHORT" ]; then
        echo -e "${YELLOW}SKIPPED: $NAME (filter=$ENGINE_FILTER)${NC}"
        return
    fi
    
    echo ""
    echo -e "${BOLD}${CYAN}────────────────────────────────────────${NC}"
    echo -e "${BOLD}${CYAN}  Running: $NAME${NC}"
    echo -e "${BOLD}${CYAN}────────────────────────────────────────${NC}"
    echo ""
    
    START=$(python3 -c "import time; print(time.time())")
    
    # Run the test with a timeout of 30 minutes per engine
    # WHY 30 min: Large model loading + CoreML compilation
    # can take significant time on first run.
    timeout 1800 python3 "$SCRIPT" 2>&1
    EXIT_CODE=$?
    
    END=$(python3 -c "import time; print(time.time())")
    DURATION=$(python3 -c "print(f'{$END - $START:.0f}')")
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✓ $NAME completed in ${DURATION}s${NC}"
        ENGINE_RESULTS+=("$NAME|PASS|${DURATION}s")
    elif [ $EXIT_CODE -eq 124 ]; then
        echo -e "${RED}✗ $NAME TIMED OUT (30 min limit)${NC}"
        ENGINE_RESULTS+=("$NAME|TIMEOUT|${DURATION}s")
    else
        echo -e "${RED}✗ $NAME FAILED (exit code $EXIT_CODE)${NC}"
        ENGINE_RESULTS+=("$NAME|FAIL|${DURATION}s")
    fi
}

# ============================================================
# RUN EACH ENGINE TEST
# ============================================================

# 1. MLX-Whisper — Apple MLX framework, GPU-accelerated Whisper
run_engine_test \
    "MLX-Whisper (Apple MLX)" \
    "$SCRIPT_DIR/test-mlx-whisper-realtime.py" \
    "mlx"

# 2. Lightning-Whisper-MLX — Batched decoding variant (3-10x faster)
run_engine_test \
    "Lightning-Whisper-MLX (vayu-whisper)" \
    "$SCRIPT_DIR/test-lightning-whisper-mlx-realtime.py" \
    "lightning"

# 3. Sherpa-ONNX — TRUE streaming via ONNX Runtime
run_engine_test \
    "Sherpa-ONNX (Streaming)" \
    "$SCRIPT_DIR/test-sherpa-onnx-realtime.py" \
    "sherpa"

# 4. Whisper.cpp + CoreML — CPU + Neural Engine hybrid
run_engine_test \
    "Whisper.cpp + CoreML" \
    "$SCRIPT_DIR/test-whisper-cpp-coreml.py" \
    "whisper-cpp"

# ============================================================
# GENERATE COMBINED SUMMARY
# ============================================================

TOTAL_END=$(python3 -c "import time; print(time.time())")
TOTAL_DURATION=$(python3 -c "print(f'{$TOTAL_END - $TOTAL_START:.0f}')")

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  BENCHMARK SUITE COMPLETE${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo ""
echo -e "  Total time: ${TOTAL_DURATION}s"
echo ""

# Write combined summary markdown
cat > "$SUMMARY_FILE" << MDEOF
# Neural Engine STT Benchmark — Combined Summary

**Generated**: $(date '+%Y-%m-%d %H:%M:%S')
**Total Runtime**: ${TOTAL_DURATION}s
**Platform**: macOS on Apple Silicon
**Filter**: ${ENGINE_FILTER}

---

## Engine Test Results

| Engine | Status | Duration |
| --- | --- | --- |
MDEOF

for result in "${ENGINE_RESULTS[@]}"; do
    NAME=$(echo "$result" | cut -d'|' -f1)
    STATUS=$(echo "$result" | cut -d'|' -f2)
    DURATION=$(echo "$result" | cut -d'|' -f3)
    
    STATUS_EMOJI="?"
    [ "$STATUS" = "PASS" ] && STATUS_EMOJI="PASS"
    [ "$STATUS" = "FAIL" ] && STATUS_EMOJI="FAIL"
    [ "$STATUS" = "TIMEOUT" ] && STATUS_EMOJI="TIMEOUT"
    
    echo "| $NAME | $STATUS_EMOJI | $DURATION |" >> "$SUMMARY_FILE"
    echo -e "  $NAME: ${STATUS} (${DURATION})"
done

cat >> "$SUMMARY_FILE" << 'MDEOF'

## Individual Results

See the detailed results for each engine:

- [MLX-Whisper Results](mlx-whisper-benchmark-results.md)
- [Lightning-Whisper-MLX Results](lightning-whisper-mlx-benchmark-results.md)
- [Sherpa-ONNX Results](sherpa-onnx-benchmark-results.md)
- [Whisper.cpp + CoreML Results](whisper-cpp-coreml-benchmark-results.md)

## Engine Comparison

### Speed Hierarchy (Expected)
1. **Lightning-Whisper-MLX** — Batched decoding on MLX, fastest Whisper inference
2. **MLX-Whisper** — Standard MLX Whisper, good speed
3. **Whisper.cpp + CoreML** — Neural Engine accelerated, competitive
4. **Sherpa-ONNX Zipformer** — True streaming, lowest first-partial latency
5. **Whisper.cpp (CPU only)** — Baseline, no acceleration

### Latency Hierarchy (Expected)
1. **Sherpa-ONNX Zipformer** — TRUE streaming, first partial in <0.5s
2. **Apple SpeechAnalyzer** — Our current solution, ~1-3s to first result
3. **Lightning-Whisper-MLX** — Chunked, latency = chunk_duration + fast_inference
4. **MLX-Whisper** — Chunked, latency = chunk_duration + inference
5. **Whisper.cpp** — Chunked, latency = chunk_duration + slower_inference

### Recommendation
Compare the RTF (Real-Time Factor) and first-partial-latency across engines
to determine the best candidate for replacing or supplementing SpeechAnalyzer
in the BubbleVoice-Mac voice pipeline.

MDEOF

echo ""
echo -e "  Summary saved to: $SUMMARY_FILE"
echo ""

# ============================================================
# AUDIO ANNOUNCEMENT
# ============================================================
# Soft spoken announcement that tests are done
# (user has accessibility needs per .cursorrules)

timeout 30 bash -c '
say -o /tmp/neural_stt_done.aiff "Neural Engine S T T benchmarks complete. Total time was '"$TOTAL_DURATION"' seconds. Check the results folder for detailed comparisons."
afplay -v 0.3 /tmp/neural_stt_done.aiff
' 2>/dev/null || true
