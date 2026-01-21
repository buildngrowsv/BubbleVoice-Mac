# Command: Fix Bug

## Usage
```
/run fix-bug $BUG_DESCRIPTION
```

## Template Prompt

You are fixing a bug: **$ARGUMENTS**

Follow the Ralph Wiggum verification loop pattern:

### Phase 1: Reproduce & Understand
1. Search codebase for related code
2. Understand the current behavior
3. Identify the root cause (not just symptoms)
4. Document your findings

### Phase 2: Plan Fix
1. Describe the fix approach
2. List files to modify
3. Identify potential side effects
4. Get user confirmation

### Phase 3: Implement Fix
1. Make targeted changes
2. Add comments explaining:
   - What was wrong
   - Why this fix works
   - What we tried that didn't work (if applicable)
3. Include "BUGFIX:" prefix in commit-worthy comments

### Phase 4: Verify (LOOP UNTIL PASSING)
```bash
# Run build
timeout 120 xcodebuild -scheme BubbleVoice-Mac build 2>&1 | tail -50

# If tests exist, run them
timeout 60 swift test 2>&1 | tail -30
```

**Continue iterating until:**
- Build succeeds
- Tests pass (if applicable)
- Bug is verified fixed

**Max iterations: 10**

### Phase 5: Document & Announce
1. Add comment documenting the fix
2. Announce completion:
```bash
timeout 30 bash -c 'say -o /tmp/soft_say.aiff "Bug fix complete for BubbleVoice Mac. The issue was [brief description]" && afplay -v 0.3 /tmp/soft_say.aiff'
```

## Completion Criteria
- [ ] Root cause identified
- [ ] Fix implemented with documentation
- [ ] Build succeeds
- [ ] Bug verified fixed
