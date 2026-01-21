# Command: Ralph Wiggum Loop

## Usage
```
/run ralph-wiggum-loop $TASK_DESCRIPTION
```

## Description
This command runs a task in a persistent verification loop, continuing until completion criteria are met or max iterations reached.

## Template Prompt

**TASK**: $ARGUMENTS

**MODE**: Ralph Wiggum Verification Loop

### Rules
1. **DO NOT** ask for permission to continue
2. **DO NOT** stop until completion criteria are met
3. **DO** iterate automatically after each attempt
4. **DO** check verification after every code change

### Completion Criteria
The task is ONLY complete when ALL of the following are true:
1. ✅ Build succeeds: `xcodebuild -scheme BubbleVoice-Mac build` exits 0
2. ✅ No compiler errors in output
3. ✅ No compiler warnings (if strict mode)
4. ✅ Task objective is achieved

### Loop Structure

```
ITERATION = 0
MAX_ITERATIONS = 10

WHILE ITERATION < MAX_ITERATIONS:
    ITERATION += 1
    
    1. Analyze current state
    2. Make targeted changes
    3. Run verification:
       - Build check
       - Error analysis
    4. If ALL criteria met:
       - BREAK (exit loop)
    5. If criteria NOT met:
       - Analyze failure
       - Plan next attempt
       - CONTINUE (next iteration)

IF ITERATION >= MAX_ITERATIONS:
    Report progress
    List remaining blockers
    Suggest next steps
```

### Verification Command
```bash
timeout 120 xcodebuild -scheme BubbleVoice-Mac -destination 'platform=macOS' build 2>&1 | tail -100
```

### On Success
```bash
timeout 30 bash -c 'say -o /tmp/soft_say.aiff "Ralph Wiggum loop complete after [N] iterations. Task accomplished." && afplay -v 0.3 /tmp/soft_say.aiff'
```

### On Max Iterations
```bash
timeout 30 bash -c 'say -o /tmp/soft_say.aiff "Ralph Wiggum loop reached maximum iterations. Progress report follows." && afplay -v 0.3 /tmp/soft_say.aiff'
```

Report:
1. What was accomplished
2. What's still blocking
3. Recommended next steps
