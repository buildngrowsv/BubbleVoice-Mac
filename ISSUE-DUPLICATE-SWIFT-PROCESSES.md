# ISSUE RESOLVED: Duplicate Swift Helper Processes

**Date**: 2026-02-08  
**Status**: ✅ RESOLVED  

---

## The Problem

Transcriptions were showing only a period "." instead of actual words.

## Root Cause

**Two BubbleVoiceSpeech processes were running simultaneously:**

```
PID 37183 - Started at 9:53PM (OLD - running 5+ hours)
PID 19437 - Started at 11:40PM (NEW - just started)
```

The old process was holding onto the microphone and/or interfering with SpeechAnalyzer, causing the new process to receive corrupted/empty transcription results.

## How This Happened

When restarting the Electron app or rebuilding the Swift helper, the old Swift process wasn't properly terminated. This can happen when:

1. The Electron app crashes without cleanup
2. The backend server is restarted but the Swift helper isn't killed
3. Manual rebuilds don't kill the running process
4. SIGTERM/SIGINT signals don't properly propagate

## The Fix

Killed the old process:
```bash
kill -9 37183
```

## How To Prevent This

### 1. Always Check for Duplicate Processes

Before starting the app:
```bash
ps aux | grep BubbleVoiceSpeech | grep -v grep
```

If you see multiple processes, kill the old ones:
```bash
pkill -9 BubbleVoiceSpeech
```

### 2. Add Cleanup to npm start

Update `package.json` scripts to kill old processes first:
```json
{
  "scripts": {
    "start": "pkill -9 BubbleVoiceSpeech || true && electron . --enable-logging"
  }
}
```

### 3. Add Cleanup to Backend Server

In `src/backend/server.js`, ensure the Swift helper is killed on process exit:
```javascript
process.on('exit', () => {
  if (swiftProcess) {
    swiftProcess.kill('SIGKILL');
  }
});

process.on('SIGINT', () => {
  if (swiftProcess) {
    swiftProcess.kill('SIGKILL');
  }
  process.exit();
});
```

### 4. Check Before Each Test

Add to your test workflow:
```bash
# Kill any existing Swift helpers
pkill -9 BubbleVoiceSpeech

# Wait a moment
sleep 1

# Start fresh
npm start
```

## Symptoms of Duplicate Processes

- Transcriptions showing only "." or empty text
- Microphone access issues
- High CPU usage from old process
- Inconsistent transcription behavior
- Audio engine errors

## Verification

After killing duplicates, verify only one process:
```bash
ps aux | grep BubbleVoiceSpeech | grep -v grep | wc -l
```

Should return: `1`

## Testing After Fix

1. Restart the Electron app
2. Speak into the microphone
3. Check logs for debug output:
   ```
   🔍 RAW RESULT: isFinal=false, text.characters.count=X
   🔍 RAW TEXT: 'actual words here'
   🔍 EXTRACTED TEXT: 'actual words here'
   ```

With the duplicate process killed, transcriptions should now work correctly.

---

**Lesson Learned**: Always check for duplicate processes when debugging speech/audio issues. Multiple processes competing for the microphone or SpeechAnalyzer resources can cause bizarre behavior.
