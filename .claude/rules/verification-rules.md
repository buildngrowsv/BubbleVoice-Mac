# Verification Rules

## Build Verification

### After Every Swift File Change

```bash
# Quick syntax check
timeout 30 swiftc -parse <changed_file.swift> 2>&1

# Full build verification
timeout 120 xcodebuild -scheme BubbleVoice-Mac -destination 'platform=macOS' build 2>&1 | tail -50
```

### Success Criteria
- Exit code 0
- Output contains "BUILD SUCCEEDED"
- No errors in output (warnings acceptable for now)

### On Failure
1. Read the error message carefully
2. Identify the specific line and issue
3. Fix the error
4. Re-run verification
5. Continue until success

## Code Quality Verification

### Before Considering Task Complete

1. **Comments Check**
   - Every new function has comprehensive comments
   - WHY/BECAUSE explanations included
   - Product context documented

2. **Naming Check**
   - Names are descriptive and self-documenting
   - No abbreviations unless universally understood
   - File names match class names

3. **Structure Check**
   - One function per class
   - Business logic separate from UI
   - No catch-all "Utils" or "Helpers"

## Ralph Wiggum Verification Loop

### Loop Configuration

```
MAX_ITERATIONS = 10
VERIFICATION_COMMAND = "xcodebuild -scheme BubbleVoice-Mac build"
SUCCESS_PATTERN = "BUILD SUCCEEDED"
```

### Loop Behavior

```
FOR iteration IN 1..MAX_ITERATIONS:
    1. Make changes
    2. Run VERIFICATION_COMMAND
    3. Check output for SUCCESS_PATTERN
    
    IF success:
        BREAK with success message
    ELSE:
        Parse error
        Plan fix
        CONTINUE to next iteration

IF iteration == MAX_ITERATIONS:
    Report partial progress
    List remaining issues
    EXIT with incomplete status
```

### Verification Types by Task

| Task Type | Verification Required |
|-----------|----------------------|
| New Feature | Build + Manual Test |
| Bug Fix | Build + Reproduce Fix |
| Refactor | Build + No Behavior Change |
| Documentation | N/A (no build needed) |
| UI Change | Build + Visual Check |

## Test Verification

### When Tests Exist

```bash
# Run all tests
timeout 120 swift test 2>&1 | tail -100

# Run specific test
timeout 60 swift test --filter TestClassName 2>&1
```

### Test Success Criteria
- All tests pass
- No test failures
- No test errors

## Git Verification

### Before Committing

```bash
# Check status
git status

# Check diff for sensitive data
git diff --cached | grep -i -E "(password|secret|key|token)" && echo "WARNING: Possible secrets in commit"

# Verify no .env or credential files
git diff --cached --name-only | grep -E "\.(env|pem|key)$" && echo "WARNING: Credential file in commit"
```

## Documentation Verification

### Comment Coverage Check

```bash
# Find functions without documentation
grep -n "func " *.swift | grep -v "///"
```

### Required Documentation Elements
- [ ] Function purpose
- [ ] Parameters described
- [ ] Return value explained
- [ ] Dependencies listed
- [ ] WHY/BECAUSE included
- [ ] Thread safety noted (if relevant)
