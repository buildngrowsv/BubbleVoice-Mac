# Quick Reference: Settings & Permissions

## 🚀 Quick Start

### Open Settings
- Click the ⚙️ button in the title bar
- Or press `⌘,` (Command + Comma)

### Select Target Folder
1. Navigate to **Data Storage** section
2. Click **Choose Folder** button
3. Select your desired location
4. Done! Path is saved automatically

### Check Permissions
1. Navigate to **Permissions** section
2. View status badges:
   - 🟢 **Granted ✓** = Working
   - 🔴 **Not Granted** = Action needed
3. Click action buttons to grant permissions

## 📋 Settings Sections

### Data Storage
**What:** Choose where conversations are saved  
**Why:** Control your data location  
**How:** Click "Choose Folder" button

### Permissions
**What:** Manage system permissions  
**Why:** Required for app features  
**How:** View status and click action buttons

#### Microphone
- **Required:** Yes
- **For:** Voice input
- **Action:** Click "Grant Access"

#### Accessibility
- **Required:** For global hotkeys
- **For:** ⌘⇧Space shortcut
- **Action:** Click "Open Settings"

### Voice
**What:** Configure voice input/output  
**Options:** Microphone, speaker, speed, auto-send

### Appearance
**What:** UI customization  
**Options:** Always on top, show bubbles

### API Keys
**What:** Configure AI services  
**Required:** Google API Key (minimum)

## 🎯 Common Tasks

### Change Save Location
```
Settings → Data Storage → Choose Folder
```

### Grant Microphone Permission
```
Settings → Permissions → Microphone → Grant Access
```

### Enable Global Hotkeys
```
Settings → Permissions → Accessibility → Open Settings
→ System Preferences → Enable BubbleVoice
```

### Check Permission Status
```
Settings → Permissions → View badges
```

## 🔍 Troubleshooting

### Microphone Not Working
1. Check Settings → Permissions → Microphone
2. If "Not Granted", click "Grant Access"
3. Restart app if needed

### Global Hotkey Not Working
1. Check Settings → Permissions → Accessibility
2. Click "Open Settings"
3. Enable BubbleVoice in System Preferences
4. Restart app

### Folder Selection Not Saving
1. Check folder path is valid
2. Ensure you have write permissions
3. Try selecting a different folder

## 💡 Tips

- **Dropbox/iCloud:** Select folders in cloud storage for automatic sync
- **Organization:** Create dedicated folder for BubbleVoice data
- **Backup:** Choose location that's backed up regularly
- **Permissions:** Grant all permissions for best experience

## 🔐 Security

- **Folder Access:** Only folders you select are accessible
- **Microphone:** Only used when you activate voice input
- **Permissions:** Can be revoked in System Preferences anytime
- **Data:** Saved only to your chosen location

## 📱 Keyboard Shortcuts

- `⌘,` - Open Settings
- `⌘⇧Space` - Activate voice input (requires Accessibility)
- `⌘K` - Focus input field
- `Esc` - Close settings / Stop voice

## 🎨 UI Elements

### Status Badges
- 🟢 **Green** - Permission granted
- 🔴 **Red** - Permission denied
- 🟠 **Orange** - Error state

### Buttons
- **Choose Folder** - Opens native folder picker
- **Grant Access** - Requests microphone permission
- **Open Settings** - Launches System Preferences

## 📚 More Information

- Full documentation: `SETTINGS_AND_PERMISSIONS.md`
- Implementation details: `IMPLEMENTATION_SUMMARY.md`
- Visual mockup: `settings-ui-mockup.html`
- Run tests: `node test-settings-features.js`

## 🆘 Support

If you encounter issues:
1. Check this guide first
2. Review full documentation
3. Verify System Preferences settings
4. Restart app after permission changes
5. Check console for errors

---

**Last Updated:** January 21, 2026  
**Version:** 0.1.0
