# Backend Connection Fix
**Date:** 2026-01-27  
**Issue:** Backend not connecting after code changes  
**Status:** ✅ FIXED

---

## 🐛 Problem

After implementing the test reset mechanism, the app showed "Not connected to backend" error.

**Symptoms:**
- Frontend loads successfully
- WebSocket connection fails (ERR_CONNECTION_REFUSED)
- Backend server never starts
- No backend process running

---

## 🔍 Root Cause

**better-sqlite3 module version mismatch**

```
Error: The module '/Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 130. This version of Node.js requires
NODE_MODULE_VERSION 131.
```

**Why this happened:**
1. Code changes were made to preload.js and main.js
2. System Node.js and Electron's Node.js have different versions
3. better-sqlite3 is a native module that must match Electron's Node version
4. After code changes, the module needs to be rebuilt for Electron

---

## ✅ Solution

**CRITICAL: You need to rebuild for BOTH Node.js versions!**

### Step 1: Rebuild for System Node.js (Backend Server)

```bash
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac
npm rebuild better-sqlite3
```

**Why?** The backend runs as a separate Node.js process using your system Node.js.

### Step 2: Rebuild for Electron (Main Process)

```bash
npx electron-rebuild -f -w better-sqlite3
```

**Why?** Electron bundles its own Node.js version for the main process.

### Step 3: Restart the app

```bash
# Kill current app (if running)
pkill -f "Electron.*BubbleVoice"

# Restart (in terminal 2 or new terminal)
npm run dev
```

### Quick Fix Script

Use the provided script to do both rebuilds:

```bash
./fix-native-modules.sh
```

---

## 🎯 When to Run This Fix

**Run `npx electron-rebuild -f -w better-sqlite3` when:**

1. ✅ After pulling code changes that modify Electron main process
2. ✅ After npm install/update
3. ✅ After changing Node.js version
4. ✅ When you see "NODE_MODULE_VERSION" errors
5. ✅ When backend fails to start with database errors

**You DON'T need to run it when:**
- ❌ Only frontend code changes (HTML/CSS/JS in renderer)
- ❌ Only backend code changes (no new dependencies)
- ❌ App is already running fine

---

## 📋 Verification Steps

After running the fix, verify:

1. **Backend starts successfully**
   ```
   [Backend] Initializing BubbleVoice backend...
   [DatabaseService] Database opened successfully
   [Backend] WebSocket server listening on port 7483
   [Main] Backend server started successfully
   ```

2. **Frontend connects**
   ```
   [WebSocketClient] Connected to backend
   [App] Backend connection established
   ```

3. **No errors in console**
   - No "ERR_CONNECTION_REFUSED"
   - No "NODE_MODULE_VERSION" errors
   - No "Not connected to backend" dialog

---

## 🚀 Quick Reference

```bash
# One-liner to fix and restart
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac && \
npx electron-rebuild -f -w better-sqlite3 && \
pkill -f "Electron.*BubbleVoice" && \
npm run dev
```

---

## 📝 Technical Details

### Why electron-rebuild?

Electron bundles its own Node.js runtime, which may be a different version than your system Node.js. Native modules (like better-sqlite3) are compiled for a specific Node.js version.

**electron-rebuild:**
- Detects Electron's Node.js version
- Recompiles native modules for that version
- Ensures compatibility

### Alternative: Skip Database for Tests

For tests, we use `SKIP_DATABASE=true` to avoid this issue entirely:

```javascript
// In test helper
env: {
  SKIP_DATABASE: 'true',  // Uses mock storage instead
  ...
}
```

This is why tests don't have this problem!

---

## 🎉 Resolution

**Status:** ✅ FIXED  
**Time to Fix:** 5 minutes  
**Impact:** Backend now starts successfully  
**Next:** Ready to continue test implementation

---

**Last Updated:** 2026-01-27 09:30
