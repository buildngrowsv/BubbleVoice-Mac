# Fixes Applied - 2026-01-23

## Issues Fixed

### 1. ✅ Backend Crash Loop
**Problem**: App kept crashing and reopening due to backend restart loop when ports were already in use.

**Root Cause**: When backend failed to start (EADDRINUSE error), it would restart up to 3 times, creating multiple instances.

**Solution**: Added check to prevent restart on port conflict (exit code 1):
```javascript
// Don't restart if port is already in use
if (code === 1 && backendRestartCount > 0) {
  console.error('[Main] Backend failed due to port conflict - not restarting to prevent loop');
  backendRestartCount = MAX_BACKEND_RESTARTS;
  return;
}
```

### 2. ✅ User Message Bubble
**Problem**: User's spoken message wasn't appearing as a sent bubble.

**Solution**: Added `sendUserMessageToFrontend()` method that sends user's transcription when Timer 3 fires (2s):
```javascript
// FIRST: Send the user's message as a sent bubble
this.sendUserMessageToFrontend(session, session.latestTranscription);

// THEN: Send the AI response
this.sendResponseToFrontend(session, session.cachedResponses.llm);
```

**Message Types**:
- `user_message`: Sent bubble with user's transcription
- `ai_response`: Response bubble with AI's reply

### 3. ✅ Response Timing
**Flow Now**:
1. User speaks: "Hello can you hear me"
2. User stops speaking
3. Timers reset on every word
4. After 0.5s of silence: LLM processes
5. After 2.0s total: **Both bubbles appear**:
   - User bubble: "Hello can you hear me"
   - AI bubble: "Response to: Hello can you hear me"

## Still TODO

### Chat Versioning & Sidebar
**Requirements**:
1. Chat list in sidebar
2. Each chat shows:
   - Editable title
   - Timestamp (minutes/hours/days ago)
   - Last user prompt (truncated preview)
3. Click to switch between chats
4. Auto-save conversations

**Implementation Plan**:
- Add ConversationService methods for chat management
- Add chat sidebar UI component
- Add timestamp formatting utility
- Add title editing functionality
- Persist chats to local storage or database

## Files Modified

1. **`src/electron/main.js`**
   - Fixed backend restart loop logic

2. **`src/backend/services/VoicePipelineService.js`**
   - Added `sendUserMessageToFrontend()` method
   - Updated Timer 3 to send both user and AI messages
   - Added timestamps to messages

## Testing

### Test Crash Fix
1. Start app
2. Kill app
3. Start again immediately
4. Should NOT create multiple instances
5. Should NOT enter restart loop

### Test Message Bubbles
1. Speak: "Hello can you hear me"
2. Stop speaking
3. Wait 2 seconds
4. Should see TWO bubbles:
   - Your message: "Hello can you hear me"
   - AI response: "Response to: Hello can you hear me"

## Next Steps

1. Implement chat versioning system
2. Add chat sidebar UI
3. Add conversation persistence
4. Connect to real LLM (currently using mock responses)
5. Add proper TTS playback
6. Add interruption during TTS playback
