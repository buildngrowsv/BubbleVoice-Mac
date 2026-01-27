# Session 4 Plan: Reach 100% CRUD Coverage
**Date:** 2026-01-26 (Continued)  
**Goal:** Fix MOCK_STORAGE persistence and reach 100% CRUD coverage  
**Estimated Time:** 1-2 hours

---

## 🎯 Primary Objective

Get all 6 CRUD tests passing when run together (currently 5/6 pass individually, 3/6 together)

---

## 🐛 Issue to Fix

### MOCK_STORAGE Persistence Problem

**Current Behavior:**
- Backend process stays alive across all tests
- MOCK_STORAGE accumulates conversations
- Tests interfere with each other
- Example: "2 active conversations" error in first test

**Evidence:**
```
Error: strict mode violation: locator('.conversation-item.active') resolved to 2 elements
```

**Root Cause:**
- Backend server spawned once for entire test suite
- MOCK_STORAGE is global and never cleared
- Each test adds conversations to the same Map

---

## 💡 Solution: Reset Mechanism

### Approach 1: IPC Reset Handler (Recommended)

**Implementation:**
1. Add IPC handler in main.js to reset MOCK_STORAGE
2. Call reset in test.beforeEach()
3. Verify all tests pass together

**Code:**
```javascript
// main.js
ipcMain.handle('test:reset-storage', async () => {
    if (process.env.SKIP_DATABASE === 'true') {
        const { MOCK_STORAGE } = require('../backend/services/IntegrationService');
        MOCK_STORAGE.reset();
        return { success: true };
    }
    return { success: false };
});

// preload.js
test: {
    resetStorage: () => ipcRenderer.invoke('test:reset-storage')
}

// test.beforeEach()
await window.electronAPI.test.resetStorage();
```

**Pros:**
- Clean and explicit
- Fast (no process restart)
- Works with existing architecture

**Cons:**
- Adds test-specific code to production
- Need to expose test API

### Approach 2: Restart Backend Between Tests

**Pros:**
- Complete isolation
- No test-specific code

**Cons:**
- Slow (1.2s startup per test)
- Complex to implement

### Approach 3: Unique Conversation IDs

**Pros:**
- No code changes needed

**Cons:**
- Doesn't solve accumulation
- Tests still interfere

---

## 📋 Implementation Steps

### Step 1: Add Reset Function (Already Done!)
```javascript
// IntegrationService.js
const MOCK_STORAGE = {
    conversations: new Map(),
    initialized: false,
    reset: function() {
        this.conversations.clear();
        this.initialized = false;
        console.log('[MOCK_STORAGE] Reset - all conversations cleared');
    }
};
```

### Step 2: Add IPC Handler
- Add handler in main.js
- Expose in preload.js
- Test manually

### Step 3: Update Test Helper
- Add reset call to ElectronAppHelper
- Call in beforeEach or provide method

### Step 4: Update Tests
- Call reset before each test
- Verify no interference

### Step 5: Run Full Suite
- All 6 CRUD tests should pass
- No "2 active conversations" errors
- Clean state between tests

---

## ✅ Success Criteria

1. All 6 CRUD tests pass when run together
2. No test interference
3. Clean MOCK_STORAGE between tests
4. Test execution time < 40s
5. No flaky tests

---

## 🧪 Testing Plan

### Test Sequence
1. Run single test: `should create new conversation`
2. Run single test: `should delete conversation`
3. Run all CRUD tests together
4. Run all tests (CRUD + frontend)
5. Run tests multiple times to verify stability

### Expected Results
- All tests pass consistently
- No "strict mode violation" errors
- No accumulated conversations
- Predictable test behavior

---

## 📊 Expected Outcome

**Before:**
- CRUD: 5/6 individually, 3/6 together
- Total: 14/17 (82%)

**After:**
- CRUD: 6/6 consistently
- Total: 15/17 (88%)

**Remaining:**
- Message isolation (backend fix needed)
- Settings close (animation timing)

---

## ⏱️ Time Estimate

- Add IPC handler: 15 min
- Update test helper: 15 min
- Test and debug: 30 min
- Documentation: 15 min
- **Total: ~1 hour**

---

## 🚀 Next Steps After This

1. Fix message isolation test (30 min)
2. Reach 16/17 passing (94%)
3. Write keyboard shortcut tests
4. Write error handling tests

---

**Status:** Ready to implement  
**Confidence:** 🟢 HIGH - Clear solution, straightforward implementation
