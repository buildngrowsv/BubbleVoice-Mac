# Claude Code Complete Guide: Ralph Wiggum, Parallel Instances & Rules Setup

> **Created**: January 18, 2026
> **Purpose**: Comprehensive guide for using Claude Code effectively with multiple parallel instances, verification loops, and custom rule sets

---

## Table of Contents
1. [What is Claude Code](#what-is-claude-code)
2. [Installation & Setup](#installation--setup)
3. [The Ralph Wiggum Technique](#the-ralph-wiggum-technique)
4. [Running Multiple Parallel Instances](#running-multiple-parallel-instances)
5. [CLAUDE.md Rules System](#claudemd-rules-system)
6. [Hooks for Automation](#hooks-for-automation)
7. [Headless Mode & Scripting](#headless-mode--scripting)
8. [Workflow Patterns](#workflow-patterns)
9. [Quick Reference Commands](#quick-reference-commands)

---

## What is Claude Code

Claude Code is Anthropic's terminal-based AI coding assistant. Unlike Cursor which runs in an IDE, Claude Code runs in your terminal and can:

- **Read and modify files** directly in your codebase
- **Run shell commands** (git, build tools, tests, etc.)
- **Integrate with tools** via MCP (Model Context Protocol)
- **Follow rule sets** defined in `CLAUDE.md` files
- **Use hooks** for automation and enforcement

**Key advantage over Cursor**: You can run multiple Claude Code instances simultaneously in different terminal windows/tabs, each working on different tasks.

---

## Installation & Setup

### Install Claude Code CLI

```bash
# Install via npm (recommended)
npm install -g @anthropic-ai/claude-code

# Or via Homebrew
brew install claude-code

# Verify installation
claude --version
```

### Authentication

```bash
# Login with your Anthropic API key
claude login

# Or set environment variable
export ANTHROPIC_API_KEY="your-api-key-here"
```

### First Run

```bash
# Start interactive session in current directory
claude

# Start with a specific prompt
claude -p "Explain the architecture of this project"

# Start in plan mode (think before acting)
claude --plan
```

---

## The Ralph Wiggum Technique

### What Is It?

**Ralph Wiggum** is a community technique/plugin that creates **persistent verification loops** in Claude Code. The name comes from the Simpsons character's catchphrase "I'm helping!" - the idea being Claude keeps trying to help until the task is actually done correctly.

### Core Concept

Instead of Claude stopping when it *thinks* it's done, Ralph Wiggum creates a loop that:

1. **Executes the task** (write code, fix bug, etc.)
2. **Runs verification** (tests, linting, type checking)
3. **Continues iterating** if verification fails
4. **Only exits** when a specific "completion promise" is met

### Three Verification Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **Test-Driven Verification** | Write tests first → run tests → fix until passing | Feature development, bug fixes |
| **Background Agent Verification** | Separate Claude instance reviews changes | Code review, architecture changes |
| **Stop Hooks** | Run build+tests+lint before allowing "done" | Any task requiring quality gates |

### Setting Up Ralph Wiggum Style Loops

**Method 1: Using Stop Hooks**

Create a hook that prevents Claude from exiting until tests pass:

```json
// .claude/hooks/StopHook.json
{
  "type": "PreExit",
  "command": "npm test && npm run lint",
  "onFailure": "prevent_exit",
  "message": "Tests or lint failed. Keep iterating."
}
```

**Method 2: Prompt-Based Loop**

Use explicit instructions in your prompt:

```
Continue working on this task until ALL of the following are true:
1. All tests pass (npm test exits with 0)
2. No TypeScript errors (tsc --noEmit exits with 0)
3. Lint is clean (npm run lint exits with 0)

Do NOT ask for permission to continue. Keep iterating automatically.
Check these conditions after every code change.
```

**Method 3: Max Iterations with Completion Promise**

```bash
# In CLAUDE.md or prompt
MAX_ITERATIONS: 10
COMPLETION_PROMISE: "All tests pass and build succeeds"
ON_MAX_ITERATIONS: "Report progress and blockers"
```

### Best Practices for Ralph Wiggum

| Practice | Why |
|----------|-----|
| **Set max iterations** | Prevents runaway loops and excessive API costs |
| **Define clear completion criteria** | Claude knows exactly when to stop |
| **Keep scope small** | Easier to verify, faster convergence |
| **Always review diffs** | Never blindly accept loop output |
| **Avoid high-judgment tasks** | Loops work best for mechanical tasks |

---

## Running Multiple Parallel Instances

This is THE killer feature of Claude Code vs Cursor - you can run multiple instances simultaneously!

### Strategy 1: Different Terminal Windows

```bash
# Terminal 1 - Feature development
cd ~/project
claude -p "Implement the new authentication flow"

# Terminal 2 - Bug fixing
cd ~/project
claude -p "Fix the race condition in the cache service"

# Terminal 3 - Code review
cd ~/project
claude -p "Review all changes made today, check for issues"
```

### Strategy 2: Git Worktrees (Recommended for Isolation)

Git worktrees let you have multiple working copies of the same repo:

```bash
# Create worktrees for parallel work
git worktree add ../project-feature-auth feature/auth
git worktree add ../project-bugfix-cache bugfix/cache
git worktree add ../project-review main

# Now run Claude in each worktree
# Terminal 1
cd ../project-feature-auth
claude

# Terminal 2
cd ../project-bugfix-cache
claude

# Terminal 3
cd ../project-review
claude
```

### Strategy 3: Role-Based Parallel Agents

```bash
# Agent 1: Implementer
claude -p "You are the IMPLEMENTER. Write the new payment module. 
Do NOT review, only implement."

# Agent 2: Reviewer (different terminal)
claude -p "You are the REVIEWER. Watch for changes in src/payment/. 
Review each change, suggest improvements. Do NOT implement."

# Agent 3: Tester (different terminal)
claude -p "You are the TESTER. Run tests after any file change. 
Report failures immediately. Do NOT fix code, only report."
```

### Monitoring Pattern: "Fire and Check"

```bash
# Script: start_claude_task.sh
#!/bin/bash
TASK_NAME=$1
TASK_PROMPT=$2
LOG_FILE="/tmp/claude_$TASK_NAME.log"

# Start Claude in background, log output
claude -p "$TASK_PROMPT" > "$LOG_FILE" 2>&1 &
CLAUDE_PID=$!

echo "Started Claude task '$TASK_NAME' (PID: $CLAUDE_PID)"
echo "Log: $LOG_FILE"
echo "Check status: tail -f $LOG_FILE"
```

```bash
# Usage: Fire off multiple tasks
./start_claude_task.sh auth "Implement OAuth2 flow"
./start_claude_task.sh api "Add rate limiting to API endpoints"
./start_claude_task.sh docs "Update API documentation"

# Check on them periodically
tail -f /tmp/claude_auth.log
```

---

## CLAUDE.md Rules System

The `CLAUDE.md` file is automatically loaded by Claude Code at the start of every session. This is where you define project-wide rules, similar to Cursor's rules.

### Location Hierarchy

```
~/.claude/CLAUDE.md           # Global rules (all projects)
~/project/CLAUDE.md           # Project rules (this repo)
~/project/src/CLAUDE.md       # Directory rules (this folder)
```

### Example CLAUDE.md Structure

```markdown
# Project: BubbleVoice-Mac

## CRITICAL RULES (NEVER VIOLATE)
- NEVER use mock/fake/sample data
- NEVER commit API keys or secrets
- ALWAYS write tests for new features
- ALWAYS use TypeScript strict mode

## Project Context
- This is a macOS voice AI application
- Target: iOS 26 liquid glass UI
- Stack: Swift, SwiftUI, AVFoundation

## Coding Style
- Use descriptive variable names (e.g., `uploadedVideoSpeechLocalTranscriptionService`)
- One function per file/class
- Extensive comments explaining WHY, not just WHAT
- Include "because" notes in comments

## Testing Requirements
- Run `swift test` before any commit
- Coverage must stay above 80%
- Integration tests required for all API endpoints

## Git Workflow
- Branch naming: feature/*, bugfix/*, refactor/*
- Commit messages: conventional commits format
- Never push directly to main

## Common Commands
- Build: `xcodebuild -scheme BubbleVoice-Mac`
- Test: `swift test`
- Lint: `swiftlint`
```

### Converting Cursor Rules to CLAUDE.md

Your existing Cursor rules can be directly translated:

```markdown
# Converted from Cursor Rules

## WHEN USER SENDS A PROMPT
Execute immediately. Edit files, run builds, debug until complete.

## TERMINAL COMMANDS
- Always use `timeout 120` prefix
- Always pipe through `head -n 200`
- Limit output with `| cut -c1-200`

## COMMENTS
Write extensive comments that include:
- Technical details (what the function does, dependencies)
- WHY/BECAUSE notes (reasoning behind decisions)
- Product context (feature relevance)
- History (debugging notes, what didn't work)

## FILE ORGANIZATION
- One function per class
- Long descriptive names (e.g., `UploadedVideoSpeechLocalTranscriptionService`)
- Separate business logic from UI code

## CONTEXT7 USAGE
Use Context7 MCP for documentation lookups:
- Start with 5000 tokens
- Increase to 20000 if needed
- Max 3 searches per topic
```

---

## Hooks for Automation

Hooks let you run scripts at specific points in Claude's workflow.

### Hook Types

| Hook | When It Fires | Use Case |
|------|---------------|----------|
| `SessionStart` | When Claude session begins | Inject context, check environment |
| `UserPromptSubmit` | Before processing user prompt | Validate prompts, add context |
| `PreToolUse` | Before any tool (file edit, bash) | Block dangerous operations |
| `PostToolUse` | After tool completes | Log actions, verify changes |
| `SubagentStart` | When spawning sub-agent | Configure sub-agent rules |
| `SubagentStop` | When sub-agent completes | Verify sub-agent output |
| `PreExit` | Before session ends | Final verification, cleanup |

### Hook Configuration

```json
// .claude/hooks/PreToolUse.json
{
  "type": "PreToolUse",
  "tools": ["bash", "write_file"],
  "command": "./scripts/validate_action.sh",
  "onFailure": "block",
  "message": "Action blocked by safety hook"
}
```

```json
// .claude/hooks/PostToolUse.json
{
  "type": "PostToolUse",
  "tools": ["write_file"],
  "command": "npm run lint --fix && npm test",
  "onFailure": "warn"
}
```

### Useful Hook Scripts

**Prevent Production Writes:**
```bash
#!/bin/bash
# hooks/prevent_prod_writes.sh
if [[ "$CLAUDE_FILE_PATH" == *"production"* ]]; then
  echo "BLOCKED: Cannot write to production files"
  exit 1
fi
```

**Auto-Format on Save:**
```bash
#!/bin/bash
# hooks/auto_format.sh
if [[ "$CLAUDE_FILE_PATH" == *.swift ]]; then
  swiftformat "$CLAUDE_FILE_PATH"
fi
```

---

## Headless Mode & Scripting

Claude Code can run non-interactively for automation.

### Basic Headless Commands

```bash
# Single prompt, get response
claude -p "Explain what this function does" --file src/auth.swift

# With JSON output
claude -p "List all TODO comments" --output json

# Pipe input
cat error.log | claude -p "Analyze this error and suggest fixes"

# Headless with full permissions (dangerous but useful for CI)
claude -p "Run all tests and fix failures" --dangerously-skip-permissions
```

### CI/CD Integration

```yaml
# .github/workflows/claude-review.yml
name: Claude Code Review
on: pull_request

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Claude Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "Review changes in this PR. Focus on:
            1. Security issues
            2. Performance problems
            3. Code style violations
            Output as GitHub review comments format."
```

### Batch Processing Script

```bash
#!/bin/bash
# batch_claude.sh - Process multiple tasks

TASKS=(
  "Update all deprecated API calls in src/"
  "Add error handling to all async functions"
  "Generate JSDoc for all exported functions"
)

for task in "${TASKS[@]}"; do
  echo "=== Starting: $task ==="
  timeout 300 claude -p "$task" --dangerously-skip-permissions
  echo "=== Completed: $task ==="
  sleep 5  # Rate limiting
done
```

---

## Workflow Patterns

### Pattern 1: Explore → Plan → Execute → Verify

```
Step 1 (Explore): "Analyze the codebase structure. What are the main modules?"
Step 2 (Plan): "Create a plan to implement feature X. Don't write code yet."
Step 3 (Execute): "Implement the plan from step 2"
Step 4 (Verify): "Run tests and fix any issues"
```

### Pattern 2: TDD Loop

```
1. "Write failing tests for the new user registration feature"
2. "Run tests, confirm they fail"
3. "Implement minimum code to pass tests"
4. "Run tests, iterate until all pass"
5. "Refactor while keeping tests green"
```

### Pattern 3: Dual-Agent Review

```bash
# Terminal 1: Implementer
claude -p "Implement the caching layer. Write to src/cache/"

# Terminal 2: Reviewer (watching)
claude -p "Watch src/cache/ for changes. After each change:
1. Review for bugs
2. Check for security issues
3. Verify test coverage
Report issues but do NOT fix them."
```

### Pattern 4: Documentation Sprint

```bash
# Run multiple doc generators in parallel
claude -p "Generate README for src/auth/" &
claude -p "Generate API docs for src/api/" &
claude -p "Generate architecture diagram for src/core/" &
wait
echo "All documentation generated"
```

---

## Quick Reference Commands

### Essential Commands

```bash
# Start session
claude                          # Interactive mode
claude -p "prompt"              # Single prompt
claude --plan                   # Plan mode (think first)

# Context management
/clear                          # Clear conversation context
/context                        # Show current context
@filename                       # Reference specific file

# Permissions
/permissions                    # Show current permissions
/permissions allow bash         # Allow bash commands
/permissions deny write_file    # Deny file writes

# Session control
/exit                           # End session
/save                           # Save session state
/load session_id                # Load saved session
```

### Model Selection

```bash
claude --model opus             # Use Opus (most capable)
claude --model sonnet           # Use Sonnet (balanced)
claude --model haiku            # Use Haiku (fastest)
```

### Thinking/Planning

```bash
# In prompt, use these keywords:
"think"                         # Basic thinking
"think step by step"            # Detailed reasoning
"think harder"                  # Extended thinking
"think deeply about..."         # Maximum consideration
```

---

## Setting Up Your Rules Folder

I've created a complete `.claude` folder structure in this project. See:

- `.claude/CLAUDE.md` - Main rules file
- `.claude/settings.json` - Permissions and tool configuration
- `.claude/hooks/` - Automation hooks
- `.claude/commands/` - Reusable command templates
- `.claude/rules/` - Modular rule sets

To use with Claude Code:

```bash
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
claude
```

Claude will automatically load all rules from the `.claude` folder.

---

## Summary: The "Fire and Check" Workflow

Here's the pattern you asked about - setting off Claude Code to do something and checking periodically while running other instances:

```bash
# Terminal 1: Start main task
cd ~/project
claude -p "Implement feature X. Write tests. Keep iterating until all tests pass." &
MAIN_PID=$!

# Terminal 2: Start secondary task  
cd ~/project-worktree-2
claude -p "Refactor module Y for better performance." &
SECOND_PID=$!

# Terminal 3: Monitor (optional)
watch -n 30 "git status; npm test"

# Check on tasks
ps -p $MAIN_PID    # Is main task still running?
ps -p $SECOND_PID  # Is second task still running?

# View logs
tail -f ~/.claude/logs/session_*.log
```

This gives you the parallel workflow capability that makes Claude Code uniquely powerful for vibe coding!
