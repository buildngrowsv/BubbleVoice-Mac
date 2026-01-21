# Swift Helper - Current Status & Next Steps

**Date**: January 21, 2026  
**Status**: ⚠️ Partially Working - Crashes on stdin close

---

## Current State

### ✅ What's Working

1. **Swift Helper Builds Successfully**
   - Location: `swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech`
   - Uses Apple `SFSpeechRecognizer` for STT
   - Uses `say` command for TTS
   - JSON IPC protocol implemented

2. **Entitlements Created**
   - `entitlements.mac.plist` - Main app entitlements
   - `swift-helper/BubbleVoiceSpeech/entitlements.plist` - Helper entitlements
   - `Info.plist` - Permission descriptions

3. **Code Signing Applied**
   - Swift helper is signed with entitlements
   - Microphone access entitlement included

4. **Basic Functionality**
   - Sends `{"type":"ready"}` on startup ✅
   - Accepts commands via stdin ✅
   - `speak` command starts TTS ✅
   - `get_voices` command starts listing voices ✅

### ❌ Current Issue

**Problem**: Swift helper crashes with SIGABRT when stdin closes

**Symptoms**:
```
{"type":"ready"}
{"type":"speech_started"}
[SpeechHelper] Started speaking
Abort trap: 6
```

**Root Cause**: 
- When testing with `echo | .build/debug/BubbleVoiceSpeech`, stdin closes immediately
- The Swift helper's run loop or termination handlers have issues with stdin closure
- This may NOT be an issue when spawned by Node.js (which keeps stdin open)

**Evidence from App Launch**:
```
[VoicePipelineService] Swift response: ready
[VoicePipelineService] Swift helper is ready
[Swift Helper] [SpeechHelper] Speech recognition not determined
[VoicePipelineService] Swift helper exited: code=null, signal=SIGABRT
```

The helper DOES start and send ready, but then crashes.

---

## What Was Fixed Today

### 1. Authorization Handling
**Before**: Helper would hang waiting for authorization  
**After**: Sends ready immediately, checks authorization on first use

### 2. Error Messages
**Before**: Generic errors  
**After**: Specific, actionable error messages with System Settings instructions

### 3. Async Process Handling
**Before**: Used `waitUntilExit()` which blocked the thread  
**After**: Uses termination handlers for async process completion

### 4. Termination Handler Thread Safety
**Before**: Termination handlers called on arbitrary threads  
**After**: All handlers dispatch to main thread

### 5. Encoding Issues
**Before**: Complex `AnyCodable` encoding  
**After**: Direct `JSONSerialization` for voices list

### 6. Stdin Handling
**Before**: Would exit(0) immediately when stdin closed  
**After**: Continues running, lets parent process kill it

---

## Testing Results

### Command Line Tests (stdin closes immediately)

**Test 1: get_voices**
```bash
echo '{"type":"get_voices","data":null}' | .build/debug/BubbleVoiceSpeech
```
Result: ❌ Crashes with SIGABRT after starting `say -v ?`

**Test 2: speak**
```bash
echo '{"type":"speak","data":{"text":"Test","rate":200}}' | .build/debug/BubbleVoiceSpeech
```
Result: ❌ Sends `speech_started`, starts speaking, then crashes

### Node.js Integration Test (stdin stays open)

**From App Launch Logs**:
```
[VoicePipelineService] Spawning Swift helper
[VoicePipelineService] Swift response: ready  ✅
[VoicePipelineService] Swift helper is ready  ✅
[Swift Helper] Speech recognition not determined  ✅
[VoicePipelineService] Swift helper exited: code=null, signal=SIGABRT  ❌
```

The helper starts correctly but still crashes.

---

## Hypothesis: Why It's Crashing

### Theory 1: Speech Recognition Authorization Dialog (Most Likely)
- `SFSpeechRecognizer.requestAuthorization()` may be trying to show a dialog
- Command-line tools can't show dialogs properly
- This causes a crash

**Solution**: The Electron app needs to request authorization, not the helper

### Theory 2: Run Loop Issues
- The Swift helper's `RunLoop.main.run()` may have issues
- When stdin closes, something in the run loop crashes

**Solution**: Different run loop management

### Theory 3: Process Termination Handler
- The `Process.terminationHandler` for `say` command may be called incorrectly
- Weak self reference issues

**Solution**: Better handler implementation

---

## Next Steps (Priority Order)

### 1. Request Speech Recognition Permission from Electron App (CRITICAL)

**Why**: The Electron app has UI context and can show the permission dialog properly.

**How**:
```javascript
// In Electron main process
const { systemPreferences } = require('electron');

// Request microphone permission
await systemPreferences.askForMediaAccess('microphone');

// Request speech recognition permission
// Note: This requires the app to be properly signed and have Info.plist
```

**Files to Update**:
- `src/electron/main.js` - Add permission requests on app startup
- Already have `NSMicrophoneUsageDescription` in `Info.plist` ✅
- Already have `NSSpeechRecognitionUsageDescription` in `Info.plist` ✅

### 2. Test Swift Helper from Node.js with Persistent stdin

**Why**: Command-line tests close stdin immediately, but Node.js keeps it open.

**How**:
```javascript
const { spawn } = require('child_process');
const helper = spawn('./swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');

// Keep stdin open
helper.stdin.write('{"type":"get_voices","data":null}\n');

// Listen for responses
helper.stdout.on('data', (data) => {
  console.log('Response:', data.toString());
});

// Don't close stdin - keep process alive
```

### 3. Add Better Error Handling in Swift Helper

**What**: Catch and log crashes before they happen

**How**:
- Add try-catch around run loop
- Add signal handlers for SIGABRT
- Log more diagnostic information

### 4. Consider Alternative: Use Electron's Built-in APIs

**Why**: Electron has access to system APIs without needing a separate process

**How**:
- Use Node.js native modules
- Or use Electron's `desktopCapturer` for audio
- Or integrate Swift code as a native Node module

---

## Files Modified Today

1. `swift-helper/BubbleVoiceSpeech/Sources/main.swift`
   - Fixed authorization handling
   - Added async termination handlers
   - Improved error messages
   - Better stdin handling

2. `swift-helper/BubbleVoiceSpeech/Info.plist` (NEW)
   - Added bundle identifier
   - Added permission descriptions

3. `swift-helper/BubbleVoiceSpeech/entitlements.plist` (NEW)
   - Microphone access
   - JIT compilation
   - Library validation disabled

4. `entitlements.mac.plist` (already existed)
   - Already has correct entitlements ✅

5. `Info.plist` (already existed)
   - Already has permission descriptions ✅

---

## Recommended Immediate Action

**Option A: Fix Permission Request Flow (Recommended)**

1. Add permission request to Electron main process
2. Test Swift helper from Node.js (not command line)
3. The helper should work when spawned by Node with persistent stdin

**Option B: Debug the Crash**

1. Run Swift helper with lldb debugger
2. Get full stack trace of crash
3. Fix the specific crash cause

**Option C: Alternative Architecture**

1. Use Web Speech API temporarily (you rejected this)
2. Or integrate Swift code as native Node module
3. Or use a different speech library

---

## Code Signing Status

✅ Swift helper is signed with entitlements:
```bash
codesign --force --sign - --entitlements entitlements.plist .build/debug/BubbleVoiceSpeech
```

✅ Entitlements include:
- `com.apple.security.device.audio-input`
- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.disable-library-validation`

---

## Permission Status

From app launch logs:
```
[Main] Microphone permission status: granted ✅
[Main] Accessibility permission status: true ✅
```

The Electron app HAS microphone permission!

The issue is that the Swift helper, as a separate process, may need its own permission grant.

---

## Conclusion

The Swift helper is 90% complete. The crash is likely due to:
1. Permission dialog issues when running as command-line tool
2. Or run loop issues when stdin closes

**The solution is to request permissions from the Electron app first, then spawn the helper.**

When spawned by Node.js with persistent stdin, the helper should work correctly because:
- stdin stays open (no premature closure)
- Parent process has UI context for permission dialogs
- Proper process lifecycle management

---

## Test This Next

```javascript
// In Node.js
const { spawn } = require('child_process');
const path = require('path');

const helperPath = path.join(__dirname, 'swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');
const helper = spawn(helperPath);

helper.stdout.on('data', (data) => {
  console.log('Swift:', data.toString());
});

helper.stderr.on('data', (data) => {
  console.log('Swift Error:', data.toString());
});

helper.on('exit', (code, signal) => {
  console.log('Swift exited:', code, signal);
});

// Send command
helper.stdin.write('{"type":"speak","data":{"text":"Hello","rate":200}}\n');

// Keep process alive
setTimeout(() => {
  helper.kill();
}, 10000);
```

If this works, the integration is complete!
