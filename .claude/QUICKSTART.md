# Claude Code Quick Start Cheat Sheet

## 🚀 Installation

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

## 💻 Basic Commands

```bash
# Start interactive session
claude

# Single prompt
claude -p "Your task here"

# Plan mode (think first)
claude --plan

# With specific model
claude --model opus
```

## 🔁 Ralph Wiggum Loop (Verification Loop)

The killer hack: Make Claude iterate until task is actually done.

```
In your prompt, include:
"Continue until ALL of these are true:
1. Build succeeds (xcodebuild exits 0)
2. No errors in output
3. [Your specific criteria]

Do NOT ask permission. Keep iterating automatically."
```

## 🔀 Multiple Parallel Instances

### Quick Setup
```bash
# Terminal 1: Main task
cd ~/project && claude -p "Implement feature X"

# Terminal 2: Different task
cd ~/project && claude -p "Fix bug Y"

# Terminal 3: Review
cd ~/project && claude -p "Review all changes"
```

### Pro Setup (Git Worktrees)
```bash
# Create isolated workspaces
git worktree add ../project-feature feature/name
git worktree add ../project-bugfix bugfix/name

# Run Claude in each
cd ../project-feature && claude
cd ../project-bugfix && claude
```

## 📝 Rules Location

```
~/.claude/CLAUDE.md           # Global (all projects)
~/project/.claude/CLAUDE.md   # Project-specific
~/project/CLAUDE.md           # Also works
```

## 🎯 Commands (in this folder)

```bash
/run implement-feature [name]    # Guided feature implementation
/run fix-bug [description]       # Bug fix with verification
/run review-code [path]          # Code review
/run ralph-wiggum-loop [task]    # Iterative verification loop
```

## ⚡ Key Shortcuts

| Action | Command |
|--------|---------|
| Clear context | `/clear` |
| Reference file | `@filename` |
| Think deeper | Add "think harder" to prompt |
| Exit | `/exit` |

## 🔐 Permissions

```bash
/permissions                    # Show current
/permissions allow bash        # Allow bash
/permissions deny write_file   # Deny writes
```

## 📊 Fire and Check Pattern

```bash
# Start in background
claude -p "Long task here" > /tmp/claude_task.log 2>&1 &

# Check on it
tail -f /tmp/claude_task.log

# Check if running
ps aux | grep claude
```

## 🎤 Task Completion Announcement

```bash
timeout 30 bash -c 'say -o /tmp/soft_say.aiff "Task complete" && afplay -v 0.3 /tmp/soft_say.aiff'
```

---

**Full guide**: See `CLAUDE_CODE_GUIDE.md` in the project root.
