#!/bin/bash

################################################################################
# CLAUDE CODE MULTI-AGENT TEST AUTOMATION SCRIPT
#
# PURPOSE:
# This script runs multiple Claude Code CLI agents in parallel with full bypass
# permissions to automatically fix failing tests, write new UI tests, and
# ensure all tests pass.
#
# PRODUCT CONTEXT:
# BubbleVoice-Mac is a voice AI app that needs comprehensive test coverage.
# This script automates the testing and fixing process by delegating work
# to multiple AI agents running in parallel, each focused on specific tasks.
#
# TECHNICAL APPROACH:
# - Uses Claude Opus 4.5 (latest model) for maximum capability
# - Runs with --dangerously-skip-permissions for full automation
# - Uses --print mode for non-interactive execution
# - Logs all output to separate files for each agent
# - Runs agents in background and waits for all to complete
#
# USAGE:
# ./run-claude-agents.sh                    # Run all agents
# ./run-claude-agents.sh --test-single      # Test single agent first
# ./run-claude-agents.sh --agents 5         # Run 5 agents (default: 3)
#
# CREATED BY: AI Assistant
# DATE: 2026-01-21
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
CLAUDE_BIN="/Users/ak/.local/bin/claude"
PROJECT_DIR="/Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac"
LOGS_DIR="${PROJECT_DIR}/tmp/claude-agent-logs"
MODEL="opus" # Using opus (Claude Opus 4.5 - latest)
NUM_AGENTS=3
TEST_SINGLE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --test-single)
      TEST_SINGLE=true
      shift
      ;;
    --agents)
      NUM_AGENTS="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --test-single    Test single agent first"
      echo "  --agents N       Number of agents to run (default: 3)"
      echo "  --help           Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Create logs directory
mkdir -p "${LOGS_DIR}"

# Function to print colored output
print_color() {
  local color=$1
  local message=$2
  echo -e "${color}${message}${NC}"
}

# Function to print section header
print_header() {
  local title=$1
  echo ""
  print_color "${CYAN}" "═══════════════════════════════════════════════════════════════════"
  print_color "${CYAN}" "  ${title}"
  print_color "${CYAN}" "═══════════════════════════════════════════════════════════════════"
  echo ""
}

# Function to check if Claude CLI is available
check_claude_cli() {
  if [[ ! -f "${CLAUDE_BIN}" ]]; then
    print_color "${RED}" "ERROR: Claude CLI not found at ${CLAUDE_BIN}"
    print_color "${YELLOW}" "Please install Claude Code CLI first"
    exit 1
  fi
  
  print_color "${GREEN}" "✓ Claude CLI found at ${CLAUDE_BIN}"
}

# Function to test single agent run
test_single_agent() {
  print_header "TESTING SINGLE AGENT RUN"
  
  local test_log="${LOGS_DIR}/test-single-agent.log"
  local test_prompt="List all test files in the tests directory and summarize what each one tests. Be concise."
  
  print_color "${BLUE}" "Running test agent with prompt:"
  print_color "${YELLOW}" "  ${test_prompt}"
  echo ""
  
  print_color "${BLUE}" "Command:"
  print_color "${YELLOW}" "  ${CLAUDE_BIN} --print --dangerously-skip-permissions --model ${MODEL} \"${test_prompt}\""
  echo ""
  
  print_color "${BLUE}" "Executing..."
  
  # Run the agent and capture output
  if timeout 120 "${CLAUDE_BIN}" \
    --print \
    --dangerously-skip-permissions \
    --model "${MODEL}" \
    "${test_prompt}" \
    > "${test_log}" 2>&1; then
    
    print_color "${GREEN}" "✓ Test agent completed successfully"
    echo ""
    print_color "${BLUE}" "Output (first 50 lines):"
    print_color "${YELLOW}" "─────────────────────────────────────────────────────────────────"
    head -n 50 "${test_log}" | cut -c -200
    print_color "${YELLOW}" "─────────────────────────────────────────────────────────────────"
    echo ""
    print_color "${CYAN}" "Full log saved to: ${test_log}"
    
    return 0
  else
    local exit_code=$?
    print_color "${RED}" "✗ Test agent failed with exit code: ${exit_code}"
    echo ""
    print_color "${BLUE}" "Error output:"
    print_color "${RED}" "─────────────────────────────────────────────────────────────────"
    tail -n 30 "${test_log}"
    print_color "${RED}" "─────────────────────────────────────────────────────────────────"
    echo ""
    print_color "${CYAN}" "Full log saved to: ${test_log}"
    
    return 1
  fi
}

# Function to run a single agent with a specific task
run_agent() {
  local agent_id=$1
  local agent_name=$2
  local agent_prompt=$3
  local log_file="${LOGS_DIR}/agent-${agent_id}-${agent_name}.log"
  
  print_color "${BLUE}" "[Agent ${agent_id}] Starting: ${agent_name}"
  print_color "${YELLOW}" "[Agent ${agent_id}] Log: ${log_file}"
  
  # Run agent in background
  # NO TIMEOUT - let Claude Code run as long as it needs
  (
    echo "═══════════════════════════════════════════════════════════════════" >> "${log_file}"
    echo "AGENT ${agent_id}: ${agent_name}" >> "${log_file}"
    echo "STARTED: $(date)" >> "${log_file}"
    echo "═══════════════════════════════════════════════════════════════════" >> "${log_file}"
    echo "" >> "${log_file}"
    echo "PROMPT:" >> "${log_file}"
    echo "${agent_prompt}" >> "${log_file}"
    echo "" >> "${log_file}"
    echo "═══════════════════════════════════════════════════════════════════" >> "${log_file}"
    echo "" >> "${log_file}"
    
    "${CLAUDE_BIN}" \
      --print \
      --dangerously-skip-permissions \
      --model "${MODEL}" \
      "${agent_prompt}" \
      >> "${log_file}" 2>&1
    
    local exit_code=$?
    
    echo "" >> "${log_file}"
    echo "═══════════════════════════════════════════════════════════════════" >> "${log_file}"
    echo "COMPLETED: $(date)" >> "${log_file}"
    echo "EXIT CODE: ${exit_code}" >> "${log_file}"
    echo "═══════════════════════════════════════════════════════════════════" >> "${log_file}"
    
    exit ${exit_code}
  ) &
  
  # Return the PID
  echo $!
}

# Function to wait for all agents and report results
wait_for_agents() {
  local pids=("$@")
  local num_agents=${#pids[@]}
  local completed=0
  local failed=0
  
  print_header "WAITING FOR ${num_agents} AGENTS TO COMPLETE"
  
  for i in "${!pids[@]}"; do
    local pid=${pids[$i]}
    local agent_num=$((i + 1))
    
    print_color "${BLUE}" "Waiting for Agent ${agent_num} (PID: ${pid})..."
    
    if wait ${pid}; then
      print_color "${GREEN}" "✓ Agent ${agent_num} completed successfully"
      ((completed++))
    else
      print_color "${RED}" "✗ Agent ${agent_num} failed"
      ((failed++))
    fi
  done
  
  echo ""
  print_header "AGENT EXECUTION SUMMARY"
  
  print_color "${BLUE}" "Total agents: ${num_agents}"
  print_color "${GREEN}" "Completed successfully: ${completed}"
  print_color "${RED}" "Failed: ${failed}"
  
  echo ""
  print_color "${CYAN}" "All logs saved to: ${LOGS_DIR}"
  
  if [[ ${failed} -gt 0 ]]; then
    return 1
  else
    return 0
  fi
}

# Function to run all agents
run_all_agents() {
  print_header "RUNNING ${NUM_AGENTS} CLAUDE CODE AGENTS"
  
  # Define agent tasks
  # Each agent gets a specific, focused task to avoid conflicts
  
  local agent_pids=()
  
  # Agent 1: Fix existing tests
  local prompt_1="You are working in the BubbleVoice-Mac directory. Your task:

1. Run all existing tests: node tests/run-all-tests.js
2. Identify any failing tests
3. Fix the failing tests by updating the test files or the source code
4. Re-run tests until all pass
5. Document what you fixed in a file: tmp/agent-1-fixes.md

Focus ONLY on fixing existing tests. Do not create new tests."
  
  agent_pids+=($(run_agent 1 "fix-existing-tests" "${prompt_1}"))
  
  # Agent 2: Create new Playwright UI tests
  local prompt_2="You are working in the BubbleVoice-Mac directory. Your task:

1. Review the frontend components in src/frontend/components/
2. Create comprehensive Playwright UI tests for components that don't have tests yet
3. Create new Playwright test files in tests/playwright/
4. Focus on: button interactions, state changes, error handling, visual feedback, accessibility
5. Use Playwright for real browser testing - NOT mocks
6. Run the new Playwright tests to verify they work
7. Document what tests you added in: tmp/agent-2-playwright-tests.md

Focus ONLY on creating new Playwright UI tests. Use real browser automation."
  
  agent_pids+=($(run_agent 2 "create-playwright-ui-tests" "${prompt_2}"))
  
  # Agent 3: Create integration tests
  local prompt_3="You are working in the BubbleVoice-Mac directory. Your task:

1. Review the integration test file: tests/integration-tests.js
2. Add more comprehensive integration tests covering:
   - Settings persistence and loading
   - Voice input/output edge cases
   - Error recovery scenarios
   - Multi-user scenarios
3. Run the new tests to verify they work
4. Document what tests you added in: tmp/agent-3-integration-tests.md

Focus ONLY on adding integration tests. Do not modify other test files."
  
  if [[ ${NUM_AGENTS} -ge 3 ]]; then
    agent_pids+=($(run_agent 3 "create-integration-tests" "${prompt_3}"))
  fi
  
  # Agent 4: Playwright E2E tests (if requested)
  if [[ ${NUM_AGENTS} -ge 4 ]]; then
    local prompt_4="You are working in the BubbleVoice-Mac directory. Your task:

1. Create Playwright E2E tests in tests/playwright/
2. Test complete user workflows with real browser:
   - App launch and initialization
   - Voice input activation and interaction
   - Settings changes and persistence
   - Error scenarios and recovery
3. Use Playwright for real browser automation
4. Run the tests to verify they work
5. Document results in: tmp/agent-4-playwright-e2e.md

Focus ONLY on Playwright E2E testing with real browser."
    
    agent_pids+=($(run_agent 4 "playwright-e2e-tests" "${prompt_4}"))
  fi
  
  # Agent 5: Playwright visual and accessibility tests (if requested)
  if [[ ${NUM_AGENTS} -ge 5 ]]; then
    local prompt_5="You are working in the BubbleVoice-Mac directory. Your task:

1. Create Playwright visual regression and accessibility tests in tests/playwright/
2. Add tests for:
   - Visual regression (screenshot comparison)
   - Accessibility (ARIA labels, keyboard navigation, screen reader support)
   - Responsive design (different window sizes)
   - Dark mode and theme switching
3. Use Playwright for real browser testing
4. Run the tests to verify they work
5. Document scenarios in: tmp/agent-5-playwright-visual-a11y.md

Focus ONLY on Playwright visual and accessibility testing."
    
    agent_pids+=($(run_agent 5 "playwright-visual-a11y" "${prompt_5}"))
  fi
  
  echo ""
  print_color "${GREEN}" "All ${#agent_pids[@]} agents started"
  echo ""
  
  # Wait for all agents to complete
  wait_for_agents "${agent_pids[@]}"
}

# Function to run final test verification
run_final_verification() {
  print_header "FINAL TEST VERIFICATION"
  
  print_color "${BLUE}" "Running all tests to verify everything passes..."
  echo ""
  
  cd "${PROJECT_DIR}"
  
  if timeout 120 node tests/run-all-tests.js 2>&1 | tee "${LOGS_DIR}/final-test-run.log"; then
    print_color "${GREEN}" "✓ All tests passed!"
    return 0
  else
    print_color "${RED}" "✗ Some tests still failing"
    print_color "${YELLOW}" "Check logs in ${LOGS_DIR} for details"
    return 1
  fi
}

# Main execution
main() {
  print_header "CLAUDE CODE MULTI-AGENT TEST AUTOMATION"
  
  print_color "${BLUE}" "Project: BubbleVoice-Mac"
  print_color "${BLUE}" "Model: ${MODEL}"
  print_color "${BLUE}" "Agents: ${NUM_AGENTS}"
  print_color "${BLUE}" "Logs: ${LOGS_DIR}"
  echo ""
  
  # Check prerequisites
  check_claude_cli
  
  # Change to project directory
  cd "${PROJECT_DIR}"
  print_color "${GREEN}" "✓ Changed to project directory: ${PROJECT_DIR}"
  echo ""
  
  # Test single agent if requested
  if [[ "${TEST_SINGLE}" == "true" ]]; then
    if test_single_agent; then
      print_color "${GREEN}" "✓ Single agent test passed"
      echo ""
      print_color "${YELLOW}" "Ready to run multiple agents. Run without --test-single flag."
      exit 0
    else
      print_color "${RED}" "✗ Single agent test failed"
      print_color "${YELLOW}" "Fix the issues before running multiple agents"
      exit 1
    fi
  fi
  
  # Run all agents
  if run_all_agents; then
    print_color "${GREEN}" "✓ All agents completed successfully"
  else
    print_color "${YELLOW}" "⚠ Some agents failed, but continuing to verification..."
  fi
  
  echo ""
  
  # Run final verification
  if run_final_verification; then
    print_header "SUCCESS!"
    print_color "${GREEN}" "All tests are passing!"
    exit 0
  else
    print_header "PARTIAL SUCCESS"
    print_color "${YELLOW}" "Agents completed but some tests still failing"
    print_color "${YELLOW}" "Review agent logs and run again if needed"
    exit 1
  fi
}

# Run main function
main
