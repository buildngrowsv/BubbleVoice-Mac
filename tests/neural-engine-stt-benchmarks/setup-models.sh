#!/bin/bash
# ============================================================
# NEURAL ENGINE STT BENCHMARK — MODEL SETUP
# ============================================================
#
# Downloads and prepares all models needed for the STT
# benchmark tests. Run this ONCE before running any tests.
#
# WHAT IT DOES:
# 1. Installs Python dependencies via pip
# 2. Downloads sherpa-onnx model files
# 3. Clones and builds whisper.cpp with CoreML support
# 4. Generates CoreML encoder models from existing GGML models
#
# PREREQUISITES:
#   brew install portaudio ffmpeg cmake
#   Python 3.10+ with pip
#
# USAGE:
#   bash tests/neural-engine-stt-benchmarks/setup-models.sh
#
# TIME ESTIMATE:
#   - pip install: 2-5 minutes
#   - sherpa-onnx models download: 1-3 minutes
#   - whisper.cpp build: 2-5 minutes
#   - CoreML conversion: 5-30 minutes (depends on model size)
#   Total: ~10-45 minutes
#
# CREATED: 2026-02-07 for Neural Engine STT research
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TESTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$TESTS_DIR/.." && pwd)"
TMP_DIR="$PROJECT_DIR/tmp"
MODELS_DIR="$TMP_DIR/neural-engine-models"
SHERPA_DIR="$MODELS_DIR/sherpa-onnx"
WHISPER_CPP_DIR="$MODELS_DIR/whisper.cpp"
EXISTING_WHISPER_MODELS="$TMP_DIR/whisper-models"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
    echo -e "${CYAN}[SETUP]${NC} $1"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_err() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================
# CREATE DIRECTORIES
# ============================================================

log "Creating directories..."
mkdir -p "$MODELS_DIR"
mkdir -p "$SHERPA_DIR"
mkdir -p "$SCRIPT_DIR/results"

# ============================================================
# STEP 1: CHECK SYSTEM DEPENDENCIES
# ============================================================

log "Checking system dependencies..."

MISSING_DEPS=""

if ! command -v brew &> /dev/null; then
    log_err "Homebrew not found. Install from https://brew.sh"
    exit 1
fi

if ! command -v cmake &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS cmake"
fi

if ! command -v ffmpeg &> /dev/null; then
    MISSING_DEPS="$MISSING_DEPS ffmpeg"
fi

# Check for portaudio (needed by pyaudio)
if ! brew list portaudio &> /dev/null 2>&1; then
    MISSING_DEPS="$MISSING_DEPS portaudio"
fi

if [ -n "$MISSING_DEPS" ]; then
    log "Installing missing brew dependencies:$MISSING_DEPS"
    brew install $MISSING_DEPS
fi

log_ok "System dependencies OK"

# ============================================================
# STEP 2: INSTALL PYTHON PACKAGES
# ============================================================

log "Installing Python packages..."
pip install -r "$SCRIPT_DIR/requirements.txt" 2>&1 | tail -n 10

log_ok "Python packages installed"

# ============================================================
# STEP 3: DOWNLOAD SHERPA-ONNX MODELS
# ============================================================

log "Downloading sherpa-onnx models..."

# Streaming Zipformer (English, 20M params)
# WHY this model: It's a small streaming model designed for
# real-time ASR. The streaming capability is the key advantage
# of sherpa-onnx over mlx-whisper.
ZIPFORMER_DIR="$SHERPA_DIR/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17"
if [ -d "$ZIPFORMER_DIR" ]; then
    log_ok "Streaming Zipformer already downloaded"
else
    log "Downloading Streaming Zipformer EN (20M)..."
    cd "$SHERPA_DIR"
    curl -L -o zipformer.tar.bz2 \
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2" \
        2>&1 | tail -n 3
    tar xjf zipformer.tar.bz2
    rm -f zipformer.tar.bz2
    if [ -d "$ZIPFORMER_DIR" ]; then
        log_ok "Streaming Zipformer downloaded"
    else
        log_err "Streaming Zipformer download failed"
    fi
fi

# Whisper Tiny EN (ONNX format)
# WHY: Direct comparison with mlx-whisper tiny model
# to see ONNX Runtime vs MLX performance on Apple Silicon
WHISPER_ONNX_DIR="$SHERPA_DIR/sherpa-onnx-whisper-tiny.en"
if [ -d "$WHISPER_ONNX_DIR" ]; then
    log_ok "Whisper Tiny EN (ONNX) already downloaded"
else
    log "Downloading Whisper Tiny EN (ONNX)..."
    cd "$SHERPA_DIR"
    curl -L -o whisper-tiny.tar.bz2 \
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2" \
        2>&1 | tail -n 3
    tar xjf whisper-tiny.tar.bz2
    rm -f whisper-tiny.tar.bz2
    if [ -d "$WHISPER_ONNX_DIR" ]; then
        log_ok "Whisper Tiny EN (ONNX) downloaded"
    else
        log_err "Whisper Tiny EN (ONNX) download failed"
    fi
fi

# ============================================================
# STEP 4: BUILD WHISPER.CPP WITH COREML SUPPORT
# ============================================================

log "Setting up whisper.cpp with CoreML..."

if [ -f "$WHISPER_CPP_DIR/build/bin/whisper-cli" ]; then
    log_ok "whisper.cpp already built"
else
    if [ ! -d "$WHISPER_CPP_DIR" ]; then
        log "Cloning whisper.cpp..."
        git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$WHISPER_CPP_DIR" 2>&1 | tail -n 3
    fi
    
    log "Building whisper.cpp with CoreML support..."
    cd "$WHISPER_CPP_DIR"
    
    # Build with CoreML enabled
    # WHY WHISPER_COREML=ON: This compiles whisper.cpp with CoreML
    # support so it can offload the encoder to the Neural Engine.
    # Without this flag, it only uses CPU.
    cmake -B build \
        -DWHISPER_COREML=ON \
        -DCMAKE_BUILD_TYPE=Release \
        2>&1 | tail -n 5
    
    cmake --build build --config Release -j$(sysctl -n hw.ncpu) \
        2>&1 | tail -n 5
    
    if [ -f "$WHISPER_CPP_DIR/build/bin/whisper-cli" ]; then
        log_ok "whisper.cpp built successfully"
    else
        # Try alternate binary name (older versions use 'main')
        if [ -f "$WHISPER_CPP_DIR/build/bin/main" ]; then
            ln -sf "$WHISPER_CPP_DIR/build/bin/main" "$WHISPER_CPP_DIR/build/bin/whisper-cli"
            log_ok "whisper.cpp built (linked main → whisper-cli)"
        else
            log_err "whisper.cpp build failed"
            log "  Check build output above for errors"
        fi
    fi
fi

# ============================================================
# STEP 5: GENERATE COREML MODELS FROM EXISTING GGML MODELS
# ============================================================
# NOTE: CoreML model generation requires the whisper.cpp
# Python scripts and can take a LONG time for larger models.
# The encoder is converted to CoreML format (.mlmodelc) which
# can then be loaded by the CoreML-enabled whisper.cpp binary.
#
# IMPORTANT: This step is OPTIONAL. The whisper.cpp CoreML test
# will skip CoreML models that aren't present and fall back to
# testing CPU-only configurations.

log ""
log "============================================================"
log "CoreML Model Generation (OPTIONAL — takes 5-30+ minutes)"
log "============================================================"
log ""
log "To generate CoreML encoder models from your existing GGML"
log "models, you need to:"
log ""
log "  cd $WHISPER_CPP_DIR"
log "  pip install ane_transformers coremltools openai-whisper"
log ""
log "Then for each model (tiny, base, small):"
log "  python models/convert-whisper-to-coreml.py --model tiny.en"
log "  python models/convert-whisper-to-coreml.py --model base.en"
log "  python models/convert-whisper-to-coreml.py --model small.en"
log ""
log "The generated .mlmodelc directories should be placed in:"
log "  $EXISTING_WHISPER_MODELS/"
log ""
log "This is optional — CPU-only tests will still work without them."
log ""

# ============================================================
# STEP 6: DOWNLOAD MLX MODELS (OPTIONAL)
# ============================================================
# mlx-whisper models download automatically from HuggingFace
# on first use. But we can pre-download them to avoid delays
# during testing.

log "============================================================"
log "MLX-Whisper Models (auto-download on first use)"
log "============================================================"
log ""
log "mlx-whisper models download from HuggingFace automatically."
log "To pre-download, run in Python:"
log ""
log "  from mlx_whisper import transcribe"
log "  transcribe('/dev/null', path_or_hf_repo='mlx-community/whisper-tiny.en')"
log "  transcribe('/dev/null', path_or_hf_repo='mlx-community/whisper-base.en')"
log ""

# ============================================================
# SUMMARY
# ============================================================

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  SETUP COMPLETE — SUMMARY${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo "Directories:"
echo "  Models: $MODELS_DIR"
echo "  Sherpa: $SHERPA_DIR"
echo "  whisper.cpp: $WHISPER_CPP_DIR"
echo "  Results: $SCRIPT_DIR/results"
echo ""

echo "Models downloaded:"
[ -d "$ZIPFORMER_DIR" ] && echo -e "  ${GREEN}✓${NC} Sherpa-ONNX Streaming Zipformer EN" || echo -e "  ${RED}✗${NC} Sherpa-ONNX Streaming Zipformer EN"
[ -d "$WHISPER_ONNX_DIR" ] && echo -e "  ${GREEN}✓${NC} Sherpa-ONNX Whisper Tiny EN" || echo -e "  ${RED}✗${NC} Sherpa-ONNX Whisper Tiny EN"
[ -f "$WHISPER_CPP_DIR/build/bin/whisper-cli" ] && echo -e "  ${GREEN}✓${NC} whisper.cpp (CoreML build)" || echo -e "  ${RED}✗${NC} whisper.cpp (CoreML build)"
echo ""

echo "Existing GGML models:"
for m in ggml-tiny.en.bin ggml-base.en.bin ggml-small.en.bin; do
    [ -f "$EXISTING_WHISPER_MODELS/$m" ] && echo -e "  ${GREEN}✓${NC} $m" || echo -e "  ${RED}✗${NC} $m"
done
echo ""

echo "To run benchmarks:"
echo "  python3 tests/neural-engine-stt-benchmarks/test-mlx-whisper-realtime.py"
echo "  python3 tests/neural-engine-stt-benchmarks/test-lightning-whisper-mlx-realtime.py"
echo "  python3 tests/neural-engine-stt-benchmarks/test-sherpa-onnx-realtime.py"
echo "  python3 tests/neural-engine-stt-benchmarks/test-whisper-cpp-coreml.py"
echo ""
echo "Or run all at once:"
echo "  bash tests/neural-engine-stt-benchmarks/run-all-benchmarks.sh"
echo ""
