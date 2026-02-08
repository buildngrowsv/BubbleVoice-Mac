#!/bin/bash

echo "🔨 Compiling Echo Test..."
echo ""

cd "$(dirname "$0")"

swiftc -o /tmp/echo_test EchoTest.swift -framework AVFoundation

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Compilation successful"
echo ""
echo "🚀 Running test..."
echo ""

/tmp/echo_test

rm -f /tmp/echo_test
