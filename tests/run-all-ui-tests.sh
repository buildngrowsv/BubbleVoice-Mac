#!/bin/bash

###############################################################################
# RUN ALL UI TESTS
#
# Purpose: Execute all UI tests in sequence
#
# Usage: ./tests/run-all-ui-tests.sh
#
# Created: 2026-01-25
###############################################################################

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          BubbleVoice UI Test Suite                         ║"
echo "║          Running All Tests                                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL_TESTS=4
PASSED_TESTS=0
FAILED_TESTS=0

# Test 1: Basic Rendering
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running Test 1: Basic Rendering"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node tests/test-ui-basic-rendering.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test 1 PASSED${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}❌ Test 1 FAILED${NC}"
    ((FAILED_TESTS++))
fi

echo ""
echo "Press Enter to continue to Test 2..."
read

# Test 2: Single Message
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running Test 2: Single Message"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node tests/test-ui-single-message.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test 2 PASSED${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}❌ Test 2 FAILED${NC}"
    ((FAILED_TESTS++))
fi

echo ""
echo "Press Enter to continue to Test 3..."
read

# Test 3: Conversation Chain
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running Test 3: Conversation Chain"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node tests/test-ui-conversation-chain.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test 3 PASSED${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}❌ Test 3 FAILED${NC}"
    ((FAILED_TESTS++))
fi

echo ""
echo "Press Enter to continue to Test 4..."
read

# Test 4: Artifacts
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running Test 4: Artifacts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

node tests/test-ui-artifacts.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test 4 PASSED${NC}"
    ((PASSED_TESTS++))
else
    echo -e "${RED}❌ Test 4 FAILED${NC}"
    ((FAILED_TESTS++))
fi

# Final results
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "FINAL RESULTS"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "Total Tests: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  SOME TESTS FAILED${NC}"
    echo ""
    exit 1
fi
