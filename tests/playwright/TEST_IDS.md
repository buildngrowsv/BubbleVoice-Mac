# BubbleVoice-Mac Test IDs Reference

> **Last Updated**: January 21, 2026
> **Purpose**: Complete reference of all `data-testid` attributes available for Playwright testing

---

## Overview

All interactive elements in the BubbleVoice-Mac frontend have been annotated with `data-testid` attributes for reliable test automation. This document lists every test ID and its purpose.

### Usage in Playwright

```javascript
// Basic selector
await page.locator('[data-testid="voice-button"]').click();

// Wait for element
await page.waitForSelector('[data-testid="messages-container"]');

// Get text content
const status = await page.locator('[data-testid="status-text"]').textContent();

// Check visibility
await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();
```

---

## Title Bar Elements

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `title-bar` | `<div>` | Custom window title bar (frameless window) |
| `app-title` | `<div>` | Application name text "BubbleVoice" |
| `title-bar-actions` | `<div>` | Container for window control buttons |
| `settings-button` | `<button>` | Opens the settings panel |
| `pin-button` | `<button>` | Toggles always-on-top window behavior |
| `minimize-button` | `<button>` | Minimizes the application window |
| `close-button` | `<button>` | Closes the application window |

### Example: Test Title Bar Buttons

```javascript
test('title bar buttons work', async ({ page }) => {
  // Open settings
  await page.locator('[data-testid="settings-button"]').click();
  await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();

  // Toggle pin
  const pinButton = page.locator('[data-testid="pin-button"]');
  await pinButton.click();
  await expect(pinButton).toHaveAttribute('aria-pressed', 'true');
});
```

---

## Main Content Area

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `main-container` | `<div>` | Primary content container below title bar |
| `conversation-container` | `<div>` | Container for all conversation content |

---

## Welcome Screen

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `welcome-state` | `<div>` | Initial welcome screen (visible before any conversation) |
| `welcome-icon` | `<div>` | Decorative icon on welcome screen |
| `welcome-title` | `<h1>` | Main heading "Welcome to BubbleVoice" |
| `welcome-subtitle` | `<p>` | Tagline describing the app purpose |
| `welcome-suggestions` | `<div>` | Container for quick-start suggestion buttons |
| `suggestion-chip-1` | `<button>` | First suggestion: "Tell me about your day" |
| `suggestion-chip-2` | `<button>` | Second suggestion: "Help me think through a decision" |
| `suggestion-chip-3` | `<button>` | Third suggestion: "Show me what I've been worried about" |
| `welcome-hint` | `<p>` | Keyboard shortcut hint for starting voice |

### Example: Test Welcome Screen

```javascript
test('welcome screen displays correctly', async ({ page }) => {
  await expect(page.locator('[data-testid="welcome-state"]')).toBeVisible();
  await expect(page.locator('[data-testid="welcome-title"]')).toHaveText('Welcome to BubbleVoice');

  // Click a suggestion chip
  await page.locator('[data-testid="suggestion-chip-1"]').click();
  // Welcome screen should hide after starting conversation
  await expect(page.locator('[data-testid="welcome-state"]')).toBeHidden();
});
```

---

## Conversation Area

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `messages-container` | `<div>` | Scrollable area where conversation messages appear |
| `bubbles-container` | `<div>` | Container for proactive AI suggestion bubbles |

### Dynamic Message Elements

Messages are added dynamically by JavaScript. Recommended pattern for testing:

```javascript
// Wait for a message to appear
await page.waitForSelector('[data-testid="messages-container"] .message');

// Count messages
const messageCount = await page.locator('[data-testid="messages-container"] .message').count();

// Get latest message
const latestMessage = page.locator('[data-testid="messages-container"] .message').last();
```

---

## Input Area

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `input-container` | `<div>` | The entire input section at the bottom |
| `input-wrapper` | `<div>` | Wrapper around text input and action buttons |
| `input-actions` | `<div>` | Container for voice and send buttons |
| `message-input` | `<div>` | Main text input field (contenteditable) |
| `voice-button` | `<button>` | Primary button to start/stop voice recording |
| `send-button` | `<button>` | Button to send the current message |

### Example: Test Sending a Message

```javascript
test('can send a text message', async ({ page }) => {
  const input = page.locator('[data-testid="message-input"]');
  const sendButton = page.locator('[data-testid="send-button"]');

  // Type a message
  await input.fill('Hello, BubbleVoice!');

  // Send button should be enabled
  await expect(sendButton).toBeEnabled();

  // Send the message
  await sendButton.click();

  // Message should appear in conversation
  await expect(page.locator('[data-testid="messages-container"]')).toContainText('Hello, BubbleVoice!');
});
```

---

## Voice Visualization

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `voice-visualization` | `<div>` | Audio waveform visualization container (shown during recording) |
| `voice-wave-1` | `<div>` | First wave bar in visualization |
| `voice-wave-2` | `<div>` | Second wave bar in visualization |
| `voice-wave-3` | `<div>` | Third wave bar in visualization |
| `voice-wave-4` | `<div>` | Fourth wave bar in visualization |
| `voice-wave-5` | `<div>` | Fifth wave bar in visualization |

### Example: Test Voice Recording State

```javascript
test('voice visualization appears when recording', async ({ page }) => {
  const voiceButton = page.locator('[data-testid="voice-button"]');
  const visualization = page.locator('[data-testid="voice-visualization"]');

  // Before recording - visualization should be hidden
  await expect(visualization).toBeHidden();

  // Start recording (hold button)
  await voiceButton.dispatchEvent('mousedown');

  // Visualization should appear
  await expect(visualization).toBeVisible();

  // Stop recording
  await voiceButton.dispatchEvent('mouseup');
});
```

---

## Status Indicator

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `status-indicator` | `<div>` | Container showing current connection/processing status |
| `status-dot` | `<span>` | Visual indicator dot (color changes based on status) |
| `status-text` | `<span>` | Text description of current status |

### Example: Test Status Changes

```javascript
test('status indicator shows connection state', async ({ page }) => {
  const statusText = page.locator('[data-testid="status-text"]');

  // Initially should show "Ready"
  await expect(statusText).toHaveText('Ready');

  // During processing, might show "Thinking..."
  // Check after sending a message
});
```

---

## Settings Panel

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `settings-panel` | `<div>` | The slide-out settings panel container |
| `settings-header` | `<div>` | Header of the settings panel |
| `settings-title` | `<h2>` | Settings panel heading |
| `close-settings-button` | `<button>` | Button to close the settings panel |
| `settings-content` | `<div>` | Scrollable content area for settings |

### Settings Sections

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `settings-section-model` | `<div>` | AI model selection section |
| `settings-section-voice` | `<div>` | Voice and audio settings section |
| `settings-section-storage` | `<div>` | Data storage location settings |
| `settings-section-permissions` | `<div>` | System permissions section |
| `settings-section-appearance` | `<div>` | UI appearance settings |
| `settings-section-api-keys` | `<div>` | API key configuration section |

---

## Model Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `model-select` | `<select>` | Dropdown to select AI model |

### Example: Test Model Selection

```javascript
test('can change AI model', async ({ page }) => {
  await page.locator('[data-testid="settings-button"]').click();

  const modelSelect = page.locator('[data-testid="model-select"]');
  await modelSelect.selectOption('claude-sonnet-4.5');

  await expect(modelSelect).toHaveValue('claude-sonnet-4.5');
});
```

---

## Voice Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `microphone-select` | `<select>` | Dropdown to select input microphone |
| `voice-select` | `<select>` | Dropdown to select TTS voice |
| `voice-speed-slider` | `<input type="range">` | Slider to adjust TTS playback speed |
| `voice-speed-value` | `<span>` | Display of current speed value (e.g., "1.0x") |
| `auto-send-checkbox` | `<input type="checkbox">` | Toggle for automatic message sending after voice |

---

## Data Storage Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `folder-selector` | `<div>` | Container for folder selection controls |
| `target-folder-path` | `<input>` | Display of selected folder path (readonly) |
| `select-folder-button` | `<button>` | Button to open folder picker dialog |
| `folder-hint` | `<small>` | Helper text for folder selection |

---

## Permissions Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `permission-microphone` | `<div>` | Microphone permission status container |
| `microphone-permission-status` | `<span>` | Badge showing microphone permission state |
| `request-microphone-button` | `<button>` | Button to request microphone permission |
| `permission-accessibility` | `<div>` | Accessibility permission status container |
| `accessibility-permission-status` | `<span>` | Badge showing accessibility permission state |
| `open-accessibility-button` | `<button>` | Button to open system accessibility settings |
| `permissions-hint` | `<small>` | Helper text for permissions section |

### Example: Test Permission Status

```javascript
test('shows permission statuses', async ({ page }) => {
  await page.locator('[data-testid="settings-button"]').click();

  const micStatus = page.locator('[data-testid="microphone-permission-status"]');
  const accessStatus = page.locator('[data-testid="accessibility-permission-status"]');

  // Should show some status (Granted, Denied, or Checking...)
  await expect(micStatus).toBeVisible();
  await expect(accessStatus).toBeVisible();
});
```

---

## Appearance Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `always-on-top-checkbox` | `<input type="checkbox">` | Toggle for window always-on-top behavior |
| `show-bubbles-checkbox` | `<input type="checkbox">` | Toggle for proactive bubble suggestions |

---

## API Key Settings

| Test ID | Element Type | Description |
|---------|--------------|-------------|
| `google-api-key-input` | `<input type="password">` | Input for Google API key |
| `anthropic-api-key-input` | `<input type="password">` | Input for Anthropic API key |
| `openai-api-key-input` | `<input type="password">` | Input for OpenAI API key |

### Example: Test API Key Input

```javascript
test('can enter API keys', async ({ page }) => {
  await page.locator('[data-testid="settings-button"]').click();

  const googleKeyInput = page.locator('[data-testid="google-api-key-input"]');
  await googleKeyInput.fill('test-api-key-12345');

  // Verify the input received the value (type="password" so we check value attribute)
  await expect(googleKeyInput).toHaveValue('test-api-key-12345');
});
```

---

## Complete Test ID List (Alphabetical)

```
accessibility-permission-status
always-on-top-checkbox
anthropic-api-key-input
app-title
auto-send-checkbox
bubbles-container
close-button
close-settings-button
conversation-container
folder-hint
folder-selector
google-api-key-input
input-actions
input-container
input-wrapper
main-container
message-input
messages-container
microphone-permission-status
microphone-select
minimize-button
model-select
open-accessibility-button
openai-api-key-input
permission-accessibility
permission-microphone
permissions-hint
pin-button
request-microphone-button
select-folder-button
send-button
settings-button
settings-content
settings-header
settings-panel
settings-section-api-keys
settings-section-appearance
settings-section-model
settings-section-permissions
settings-section-storage
settings-section-voice
settings-title
show-bubbles-checkbox
status-dot
status-indicator
status-text
suggestion-chip-1
suggestion-chip-2
suggestion-chip-3
target-folder-path
title-bar
title-bar-actions
voice-button
voice-select
voice-speed-slider
voice-speed-value
voice-visualization
voice-wave-1
voice-wave-2
voice-wave-3
voice-wave-4
voice-wave-5
welcome-hint
welcome-icon
welcome-state
welcome-subtitle
welcome-suggestions
welcome-title
```

---

## ARIA Attributes Added

In addition to test IDs, the following ARIA attributes were added for accessibility:

### Roles
- `role="banner"` - Title bar
- `role="main"` - Main content container
- `role="dialog"` - Settings panel
- `role="log"` - Messages container (conversation log)
- `role="status"` - Status indicators
- `role="textbox"` - Message input
- `role="group"` - Button groups
- `role="complementary"` - Bubble suggestions

### Live Regions
- `aria-live="polite"` - Messages container, status text, speed value
- `aria-live="assertive"` - Voice visualization (when recording starts)

### Other Attributes
- `aria-pressed` - Toggle buttons (pin, voice)
- `aria-hidden="true"` - Decorative SVG icons
- `aria-label` - Buttons, inputs
- `aria-labelledby` - Form controls linked to labels
- `aria-describedby` - Form controls linked to descriptions
- `aria-modal="true"` - Settings panel
- `aria-multiline="true"` - Message input

---

## Best Practices for Test Authors

1. **Always use test IDs** - Never rely on CSS classes or tag names
2. **Wait for elements** - Use `waitForSelector` before interacting
3. **Check visibility** - Verify elements are visible before clicking
4. **Test state changes** - Verify `aria-pressed`, `disabled`, etc.
5. **Use semantic assertions** - `toHaveText`, `toBeVisible`, `toBeEnabled`

```javascript
// Good
await page.locator('[data-testid="voice-button"]').click();

// Bad - fragile, will break if class changes
await page.locator('.voice-button').click();
```
