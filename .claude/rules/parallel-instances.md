# Parallel Claude Instances Rules

## Overview

Running multiple Claude Code instances allows you to:
- Work on multiple tasks simultaneously
- Have one agent implement while another reviews
- Process different parts of the codebase in parallel
- Create verification loops with background agents

## Setup Patterns

### Pattern 1: Git Worktrees (Recommended)

Create isolated working directories for each Claude instance:

```bash
# Create worktrees for parallel work
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# Feature development worktree
git worktree add ../BubbleVoice-Mac-feature feature/new-feature

# Bug fix worktree
git worktree add ../BubbleVoice-Mac-bugfix bugfix/issue-123

# Review worktree (stays on main)
git worktree add ../BubbleVoice-Mac-review main
```

Then in separate terminals:
```bash
# Terminal 1
cd ../BubbleVoice-Mac-feature && claude

# Terminal 2
cd ../BubbleVoice-Mac-bugfix && claude

# Terminal 3
cd ../BubbleVoice-Mac-review && claude
```

### Pattern 2: Role-Based Agents

```bash
# Terminal 1: IMPLEMENTER
claude -p "You are the IMPLEMENTER. Your job is to write code.
- Focus on implementation only
- Do NOT review or critique
- Do NOT run tests (that's the tester's job)
- Write extensive comments
Current task: [TASK DESCRIPTION]"

# Terminal 2: REVIEWER
claude -p "You are the REVIEWER. Your job is to review changes.
- Watch for file changes in src/
- Review each change for bugs, security, style
- Suggest improvements
- Do NOT make changes yourself
- Report issues to the implementer"

# Terminal 3: TESTER
claude -p "You are the TESTER. Your job is to verify.
- Run builds after file changes
- Run tests
- Report failures
- Do NOT fix code (that's the implementer's job)
- Track test coverage"
```

### Pattern 3: Fire and Check

Start a task and check on it periodically:

```bash
# Start task in background
nohup claude -p "Implement feature X. Keep iterating until build succeeds." > /tmp/claude_feature_x.log 2>&1 &
TASK_PID=$!

# Check on it
tail -f /tmp/claude_feature_x.log

# Or check status
ps -p $TASK_PID  # Is it still running?
```

## Coordination Rules

### File Locking
When multiple instances work on the same repo:
- Assign different files/modules to each instance
- Use git worktrees for true isolation
- Avoid concurrent edits to the same file

### Communication Pattern
If agents need to coordinate:
1. Use a shared status file: `.claude/status/task_status.json`
2. Each agent updates their status
3. Other agents can read to understand state

```json
// .claude/status/task_status.json
{
  "implementer": {
    "status": "working",
    "current_file": "src/AudioProcessor.swift",
    "last_update": "2026-01-18T10:30:00Z"
  },
  "reviewer": {
    "status": "waiting",
    "pending_reviews": ["src/AudioProcessor.swift"],
    "last_update": "2026-01-18T10:28:00Z"
  },
  "tester": {
    "status": "testing",
    "last_build_result": "success",
    "last_update": "2026-01-18T10:29:00Z"
  }
}
```

## Resource Management

### API Rate Limits
- Each Claude instance uses API quota
- Monitor usage with multiple instances
- Consider staggering intensive operations

### Memory/CPU
- Each instance consumes resources
- On limited machines, run 2-3 instances max
- Close inactive instances

## Best Practices

### Do
- ✅ Use worktrees for file isolation
- ✅ Assign clear roles to each instance
- ✅ Log output for later review
- ✅ Set timeouts on long-running tasks
- ✅ Check instance status periodically

### Don't
- ❌ Have multiple instances edit same file
- ❌ Run unlimited instances (API costs)
- ❌ Forget to clean up worktrees
- ❌ Leave instances running indefinitely

## Example Workflow: Feature Development

```bash
# Step 1: Create worktree
git worktree add ../BV-feature-voice feature/voice-input

# Step 2: Start implementer
cd ../BV-feature-voice
claude -p "Implement voice input feature following the patterns in 
Accountabilityv6-callkit. Focus on AudioCaptureService."

# Step 3: In another terminal, start reviewer
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
claude -p "Review changes in ../BV-feature-voice/. Check for:
- Memory leaks
- Thread safety
- Proper error handling
Report issues but don't fix."

# Step 4: Check on both periodically
# Step 5: When done, merge:
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
git merge feature/voice-input
git worktree remove ../BV-feature-voice
```

## Monitoring Script

```bash
#!/bin/bash
# monitor_claude_instances.sh

echo "=== Active Claude Instances ==="
pgrep -a claude | while read pid cmd; do
  echo "PID: $pid"
  echo "Command: $cmd"
  echo "---"
done

echo ""
echo "=== Recent Logs ==="
ls -la /tmp/claude_*.log 2>/dev/null || echo "No log files found"
```
