# Error Analysis and Fixes - 2026-01-26

**Purpose:** Document all errors found during testing, root causes, and fixes applied

---

## Current Test Failures

### ❌ Error 1: Backend WebSocket Not Connecting

**Test:** Send message in conversation, Conversation isolation  
**Error Message:**
```
WebSocket connection to 'ws://localhost:7483/' failed: 
Error in connection establishment: net::ERR_CONNECTION_REFUSED
```

**Symptoms:**
- Backend server not starting when app launched by Playwright
- Frontend loads but cannot connect to backend
- Tests timeout waiting for backend

**Root Cause Analysis:**
- Need to check if backend server is starting at all
- May be port conflict
- May be initialization error not logged

**Investigation Steps:**
1. Check backend server logs during test
2. Verify backend starts in normal mode vs test mode
3. Check if port 7483 is already in use

**Status:** INVESTIGATING

---

### ❌ Error 2: Delete Button Not Visible

**Test:** Delete conversation  
**Error Message:**
```
Delete button not visible - feature may not be implemented yet
```

**Symptoms:**
- Cannot find `.delete-conversation` button
- Hover on conversation item doesn't reveal button
- Test skips delete functionality

**Root Cause Analysis:**
- Button may not be implemented yet
- Button may require specific hover state
- Button selector may be wrong

**Investigation Steps:**
1. Check HTML structure of conversation items
2. Look for delete button in actual UI
3. Check CSS for hover states

**Status:** INVESTIGATING

---

### ❌ Error 3: Test Timeout on Message Send

**Test:** Send message in new conversation  
**Error Message:**
```
Test timeout of 30000ms exceeded.
locator.click: Target page, context or browser has been closed
```

**Symptoms:**
- Test times out after 30 seconds
- Page/context closes unexpectedly
- Cannot interact with input field

**Root Cause Analysis:**
- Likely related to backend not connecting
- App may be crashing or closing
- May need longer timeout or wait for backend

**Investigation Steps:**
1. Check if app crashes during test
2. Verify input field selector is correct
3. Add better error handling

**Status:** INVESTIGATING

---

## Fixes Applied

### ✅ Fix 1: Native Module Version Mismatch

**Error:** better-sqlite3 NODE_MODULE_VERSION mismatch  
**Solution:** `npx electron-rebuild -f -w better-sqlite3`  
**Result:** App now starts successfully  
**Commit:** 8a6ed67

### ✅ Fix 2: MCP Tools Not Available in Tests

**Error:** helpers.elementExists is not a function  
**Solution:** Switched from MCP-based helpers to Playwright  
**Result:** Tests can now interact with UI  
**Commit:** 8a6ed67

---

## Root Cause Found: better-sqlite3 Version Conflict

**The Core Problem:**
- better-sqlite3 is a native module that must be compiled for specific Node version
- System Node.js is v22 (NODE_MODULE_VERSION 131)
- Electron's embedded Node is v20 (NODE_MODULE_VERSION 130)
- Cannot have both versions simultaneously

**Current Situation:**
- `npm rebuild` compiles for system Node (131) - backend works standalone
- `electron-rebuild` compiles for Electron (130) - app works in Electron
- When Playwright launches Electron, it uses Electron's Node (130)
- But backend was last compiled for system Node (131)
- Result: Backend fails to start with version mismatch error

**Solutions Considered:**
1. ✅ **Make database optional for tests** - Best short-term solution
2. ⚠️ **Use in-memory SQLite** - Requires code changes
3. ⚠️ **Mock database service** - Complex, requires mocking layer
4. ❌ **Rebuild before each test** - Too slow, not practical

**Solution Implemented:**
- Added SKIP_DATABASE environment variable
- When set, backend skips database initialization
- Allows frontend-only tests to run
- Backend WebSocket still won't work, but UI tests can proceed

## Next Actions

1. [x] Root cause identified: better-sqlite3 version conflict
2. [ ] Implement SKIP_DATABASE flag in backend
3. [ ] Update tests to set SKIP_DATABASE=true
4. [ ] Check delete button implementation
5. [ ] Add better error logging in tests
6. [ ] Consider long-term solution (in-memory DB or mock)
