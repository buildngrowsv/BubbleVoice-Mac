#!/bin/bash
# Run the comprehensive diagnostic from terminal (needs mic permission)
cd "$(dirname "$0")"
echo "Compiling and running... (takes ~4 minutes with 10 tests × 20s each)"
echo "Make sure background speech is playing."
echo ""
swift ComprehensiveSpeechDiagnostic.swift 2>&1 | tee diagnostic-results.txt
