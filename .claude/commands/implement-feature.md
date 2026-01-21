# Command: Implement Feature

## Usage
```
/run implement-feature $FEATURE_NAME
```

## Template Prompt

You are implementing a new feature: **$ARGUMENTS**

Follow this workflow:

### Phase 1: Research (DO NOT SKIP)
1. Search codebase for related code
2. Read existing patterns in similar files
3. Check reference implementation in `Accountabilityv6-callkit/` if relevant
4. Look up documentation with Context7 if needed

### Phase 2: Plan
1. List all files that need to be created or modified
2. Describe the approach in detail
3. Identify potential challenges
4. Get user confirmation before proceeding

### Phase 3: Implement
For each file:
1. Create/edit with extensive comments
2. Include WHY/BECAUSE explanations
3. Follow one-function-per-class pattern
4. Use descriptive names

### Phase 4: Verify
1. Run build: `timeout 120 xcodebuild -scheme BubbleVoice-Mac build 2>&1 | tail -50`
2. Fix any errors
3. Repeat until build succeeds

### Phase 5: Announce
```bash
timeout 30 bash -c 'say -o /tmp/soft_say.aiff "Feature $ARGUMENTS implementation complete for BubbleVoice Mac" && afplay -v 0.3 /tmp/soft_say.aiff'
```

## Completion Criteria
- [ ] All files created with proper comments
- [ ] Build succeeds
- [ ] No Swift compiler errors
- [ ] Feature is functional
