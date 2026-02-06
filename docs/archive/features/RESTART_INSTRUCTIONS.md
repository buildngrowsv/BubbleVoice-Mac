# 🚀 Restart Instructions
**Quick reference for restarting the app after native module fix**

---

## ✅ Fix Complete

Both native module rebuilds are done:
- ✅ System Node.js (backend server)
- ✅ Electron Node.js (main process)

---

## 📋 Action Required

### Step 1: Restart the app in terminal 2

```bash
npm run dev
```

### Step 2: Verify backend connects

Look for these log messages:

```
[Backend] Initializing BubbleVoice backend...
[DatabaseService] Database opened successfully
[Backend] WebSocket server listening on port 7483
[Main] Backend server started successfully
```

Frontend should show:
```
[WebSocketClient] Connected to backend
```

**No more "Not connected to backend" errors!**

---

## 🧪 Step 3: Run Tests

Once the backend is connected, run the test suite:

```bash
npx playwright test tests/playwright/conversation-crud.spec.js --workers=1
```

**Expected results:**
- ✅ 6/6 CRUD tests passing (up from 4/6)
- ✅ Reset mechanism working
- ✅ No "2 active conversations" errors
- ✅ Clean test isolation

---

## 🎯 What We're Testing

The reset mechanism we implemented:
- IPC handler to clear MOCK_STORAGE
- Automatic reset before each test
- Prevents test interference
- Should fix the "strict mode violation" errors

---

## 📊 Expected Progress

**Before:**
- CRUD: 4/6 passing (67%)
- Total: 14/17 passing (82%)

**After:**
- CRUD: 6/6 passing (100%) ✨
- Total: 16/17 passing (94%)

---

## 🐛 If Backend Still Doesn't Connect

Run the fix script again:

```bash
./fix-native-modules.sh
```

Then restart.

---

**Status:** Ready to restart  
**Time to complete:** ~5 minutes  
**Confidence:** 🟢 HIGH

---

**Last Updated:** 2026-01-27 09:55
