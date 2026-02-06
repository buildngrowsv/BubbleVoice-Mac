# Conversations Loading Fix

**Date**: 2026-01-25  
**Issue**: Infinite loading state in conversations sidebar  
**Status**: ✅ FIXED

## Problem

The conversations sidebar was showing an infinite "Loading conversations..." spinner and never displaying the conversation list or empty state.

## Root Cause

The IPC handler for `chat-history:get-conversations` in `src/electron/main.js` was calling a non-existent method:

```javascript
// WRONG - this method doesn't exist
const messages = db.getConversationMessages(conv.id, 1);
```

The `DatabaseService` class only provides `getMessages()`, not `getConversationMessages()`. This caused the IPC call to throw an error, which left the frontend waiting indefinitely for a response.

## Solution

Fixed the method name in two places in `src/electron/main.js`:

1. **Line 673** - `chat-history:get-conversations` handler:
   ```javascript
   // FIXED
   const messages = db.getMessages(conv.id, 1);
   ```

2. **Line 755** - `chat-history:get-conversation` handler:
   ```javascript
   // FIXED
   const messages = db.getMessages(conversationId);
   ```

Additionally, rebuilt `better-sqlite3` native module for Electron compatibility:
```bash
npx electron-rebuild -f -w better-sqlite3
```

## Verification

After the fix:
- ✅ Conversations load successfully
- ✅ Shows "No conversations yet" empty state when database is empty
- ✅ No infinite loading spinner
- ✅ IPC calls complete without errors
- ✅ Console shows: `[ChatHistorySidebar] Loaded 0 conversations`

## Technical Details

### Why This Happened

The method name mismatch likely occurred during development when the DatabaseService API was refactored. The IPC handlers weren't updated to match the new method names.

### How the Frontend Handles This

The `ChatHistorySidebar` component calls:
```javascript
this.conversations = await window.electronAPI.chatHistory.getConversations();
```

This triggers the IPC handler in main.js, which queries the database. When the handler threw an error, the promise never resolved, leaving the UI in a loading state.

### Database Service API

The correct method signature is:
```javascript
getMessages(conversationId, limit = 100, offset = 0)
```

Returns an array of message objects for the specified conversation.

## Related Files

- `src/electron/main.js` - IPC handlers (FIXED)
- `src/backend/services/DatabaseService.js` - Database API (correct)
- `src/frontend/components/chat-history-sidebar.js` - UI component (working correctly)

## Testing

Created `test-conversations-loading.js` to verify the fix with automated testing using Puppeteer.

## Notes

- The backend server has a separate issue with better-sqlite3 Node.js version compatibility, but this doesn't affect the conversations sidebar which uses Electron IPC directly.
- The fix is minimal and focused - only changed the method names to match the DatabaseService API.
- No changes needed to the frontend or database schema.
