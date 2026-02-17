#!/bin/bash
# Compile and run STT Engine Comparison Test

cd "$(dirname "$0")"

echo "================================================================"
echo "  STT ENGINE COMPARISON TEST"
echo "================================================================"
echo ""
echo "Compiling STTEngineComparisonTest.swift..."

swiftc -parse-as-library \
    -framework AVFoundation \
    -framework Speech \
    -framework CoreMedia \
    -O \
    -o /tmp/stt_comparison \
    STTEngineComparisonTest.swift

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Compiled successfully"
echo ""
echo "================================================================"
echo "  INSTRUCTIONS"
echo "================================================================"
echo ""
echo "1. Play an English learning video from your phone"
echo "2. Place phone near Mac microphone"
echo "3. Test will run for 60 seconds"
echo "4. Both engines will transcribe simultaneously"
echo "5. Results saved to /tmp/stt-comparison-TIMESTAMP.log"
echo ""
echo "Press ENTER to start..."
read

/tmp/stt_comparison

echo ""
echo "================================================================"
echo "  TEST COMPLETE"
echo "================================================================"
echo ""
echo "To view the log:"
echo "  cat /tmp/stt-comparison-*.log | less"
echo ""
echo "To compare side-by-side:"
echo "  grep 'ANALYZER' /tmp/stt-comparison-*.log > /tmp/analyzer.txt"
echo "  grep 'SFSPEECH' /tmp/stt-comparison-*.log > /tmp/sfspeech.txt"
echo "  diff -y /tmp/analyzer.txt /tmp/sfspeech.txt | less"
echo ""
