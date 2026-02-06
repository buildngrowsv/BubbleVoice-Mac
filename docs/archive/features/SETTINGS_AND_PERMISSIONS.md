# BubbleVoice Settings & Permissions

## Overview

BubbleVoice now includes comprehensive settings management with target folder selection and macOS permissions handling. This document explains how these features work and how to use them.

## Features Added

### 1. Target Folder Selection

Users can now choose where their conversation data, recordings, and other files are saved.

**Benefits:**
- Save to Dropbox, iCloud Drive, or any custom location
- Organize data by project or context
- Easy backup and sync across devices
- Full control over data storage

**How it works:**
1. Open Settings (⌘,)
2. Navigate to "Data Storage" section
3. Click "Choose Folder" button
4. Select desired folder in native macOS picker
5. Path is saved and persists across sessions

**Technical Implementation:**
- Uses Electron's `dialog.showOpenDialog` for native folder picker
- IPC handler: `select-target-folder`
- Stored in localStorage as `targetFolder`
- Accessible via `window.electronAPI.selectTargetFolder()`

### 2. Permissions Management

Visual interface for checking and managing macOS system permissions.

**Permissions Tracked:**

#### Microphone Access
- **Required:** Yes
- **Purpose:** Voice input for conversations
- **Status:** Can be requested programmatically
- **UI:** Shows "Granted ✓" or "Not Granted" with "Grant Access" button

#### Accessibility
- **Required:** For global hotkeys (⌘⇧Space)
- **Purpose:** System-wide keyboard shortcuts
- **Status:** Must be enabled manually in System Preferences
- **UI:** Shows status with "Open Settings" button to launch System Preferences

**How it works:**
1. Open Settings (⌘,)
2. Navigate to "Permissions" section
3. View current permission status
4. Click action buttons to grant permissions
5. Status updates automatically

**Technical Implementation:**
- Uses `systemPreferences.getMediaAccessStatus()` for microphone
- Uses `systemPreferences.isTrustedAccessibilityClient()` for accessibility
- IPC handlers:
  - `check-microphone-permission`
  - `request-microphone-permission`
  - `check-accessibility-permission`
  - `open-accessibility-settings`

## Files Modified

### Electron Main Process
**File:** `src/electron/main.js`

Added:
- Import of `dialog` and `systemPreferences` from Electron
- IPC handler for folder selection
- IPC handlers for permission checking and requesting
- Comprehensive comments explaining each permission

### Electron Preload Script
**File:** `src/electron/preload.js`

Added:
- `selectTargetFolder()` method
- `permissions` object with:
  - `checkMicrophone()`
  - `requestMicrophone()`
  - `checkAccessibility()`
  - `openAccessibilitySettings()`

### Frontend UI
**File:** `src/frontend/index.html`

Added:
- Data Storage section with folder selector
- Permissions section with:
  - Microphone permission item
  - Accessibility permission item
  - Status badges
  - Action buttons
- Helper text and descriptions

### Frontend Logic
**File:** `src/frontend/components/app.js`

Added:
- `targetFolder` to settings object
- Folder selection button handler
- `setupPermissionsUI()` method
- `updatePermissionStatus()` method
- Permission checking on settings open
- Visual feedback for permission states

### Styles
**File:** `src/frontend/styles/main.css`

Added:
- `.folder-selector` - Folder picker UI
- `.settings-button` - Action button style
- `.settings-hint` - Helper text style
- `.permission-item` - Permission card layout
- `.permission-info` - Permission details
- `.permission-title` - Permission name with icon
- `.permission-description` - Permission explanation
- `.permission-status` - Status badge container
- `.permission-badge` - Status indicator with color coding
  - `.granted` - Green for granted permissions
  - `.denied` - Red for denied permissions
  - `.error` - Orange for errors

## New Files Created

### Entitlements
**File:** `entitlements.mac.plist`

Defines macOS entitlements for:
- Microphone access (`com.apple.security.device.audio-input`)
- User-selected file access (`com.apple.security.files.user-selected.read-write`)
- Network client/server
- JIT compilation
- Library validation

### Info.plist
**File:** `Info.plist`

Provides user-facing descriptions for permission requests:
- `NSMicrophoneUsageDescription` - Why microphone is needed
- `NSSpeechRecognitionUsageDescription` - Why speech recognition is needed
- `NSDocumentsFolderUsageDescription` - Why file access is needed

## Usage Examples

### Selecting a Target Folder

```javascript
// In frontend code
const result = await window.electronAPI.selectTargetFolder();

if (result.success && result.path) {
  console.log('Folder selected:', result.path);
  // Save to settings
  settings.targetFolder = result.path;
  localStorage.setItem('bubblevoice_settings', JSON.stringify(settings));
}
```

### Checking Microphone Permission

```javascript
// In frontend code
const micResult = await window.electronAPI.permissions.checkMicrophone();

if (micResult.granted) {
  console.log('Microphone access granted');
} else {
  console.log('Microphone access denied');
  // Request permission
  const requestResult = await window.electronAPI.permissions.requestMicrophone();
  if (requestResult.granted) {
    console.log('Permission granted!');
  }
}
```

### Checking Accessibility Permission

```javascript
// In frontend code
const accResult = await window.electronAPI.permissions.checkAccessibility();

if (!accResult.granted) {
  // Open System Preferences for user to enable manually
  await window.electronAPI.permissions.openAccessibilitySettings();
}
```

## UI/UX Design

### Visual Hierarchy
1. **Data Storage** - First section, emphasizes user control
2. **Permissions** - Second section, shows system requirements
3. **Appearance** - Third section, customization options
4. **API Keys** - Last section, advanced configuration

### Permission Status Colors
- **Green** (#4ade80) - Granted, everything working
- **Red** (#f87171) - Not granted, action required
- **Orange** (#fb923c) - Error state, needs attention

### Interactive Elements
- Folder selector has read-only input + button
- Permission cards show status + action button
- Buttons provide visual feedback (hover, active states)
- Success feedback when folder selected ("Folder Selected ✓")

## Testing

Run the test suite to verify implementation:

```bash
node test-settings-features.js
```

Tests verify:
- ✅ IPC handlers are registered
- ✅ Preload API is exposed
- ✅ UI elements are present
- ✅ Settings persistence works
- ✅ Styles are defined
- ✅ Entitlements file exists
- ✅ Info.plist has descriptions

## Security Considerations

### Sandboxing
- App uses Electron's sandbox for security
- Entitlements define exact permissions needed
- User must explicitly grant permissions

### Data Privacy
- Folder selection uses native macOS picker (secure)
- No automatic access to file system
- User chooses exactly where data is saved
- Permissions clearly explained to user

### Permission Requests
- Microphone: Requested when needed, with clear explanation
- Accessibility: Cannot be requested programmatically (security feature)
- File access: Granted only for user-selected folders

## Troubleshooting

### Microphone Permission Not Working
1. Check Info.plist has `NSMicrophoneUsageDescription`
2. Check entitlements.mac.plist has `com.apple.security.device.audio-input`
3. Restart app after changing permissions
4. Check System Preferences > Security & Privacy > Microphone

### Accessibility Permission Not Working
1. Open System Preferences > Security & Privacy > Privacy > Accessibility
2. Add BubbleVoice to the list
3. Enable the checkbox next to BubbleVoice
4. Restart app

### Folder Selection Not Saving
1. Check localStorage is not disabled
2. Check browser console for errors
3. Verify settings are being saved in `loadSettings()`
4. Check folder path is valid

## Future Enhancements

Potential improvements for future versions:

1. **Additional Permissions**
   - Camera access (for video calls)
   - Screen recording (for screen sharing)
   - Calendar access (for scheduling)

2. **Storage Options**
   - Cloud storage integration (Dropbox, Google Drive)
   - Automatic backup configuration
   - Storage usage statistics

3. **Permission Presets**
   - "Recommended" preset for most users
   - "Minimal" preset for privacy-focused users
   - "Full Access" preset for power users

4. **Visual Improvements**
   - Animated permission status changes
   - Progress indicators for permission requests
   - Tooltips with more detailed explanations

## References

- [Electron Dialog API](https://www.electronjs.org/docs/latest/api/dialog)
- [Electron System Preferences API](https://www.electronjs.org/docs/latest/api/system-preferences)
- [macOS Entitlements](https://developer.apple.com/documentation/bundleresources/entitlements)
- [macOS Info.plist Keys](https://developer.apple.com/documentation/bundleresources/information_property_list)
