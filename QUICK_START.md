# BubbleVoice Mac - Quick Start Guide

**Get up and running in 5 minutes!**

---

## Prerequisites

- macOS 14+ (Sonoma or later)
- Node.js 20+ installed
- A Google AI API key (free tier available)

---

## Step 1: Get Your API Key (2 minutes)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

**Cost**: Free tier includes generous usage. Typical 10-minute conversation costs ~$0.007.

---

## Step 2: Configure the App (1 minute)

```bash
# Navigate to the project
cd /Users/ak/UserRoot/Github/researching-callkit-repos/BubbleVoice-Mac

# Copy the environment template
cp .env.example .env

# Open .env in your editor
nano .env
# OR
open -e .env
```

Add your API key:
```env
GOOGLE_API_KEY=AIzaSy...your_actual_key_here
```

Save and close the file.

---

## Step 3: Run the App (1 minute)

```bash
# Start in development mode (with dev tools)
npm run dev
```

**The app will launch!** 🎉

You should see:
- Beautiful Liquid Glass window
- Menu bar icon (top right of your screen)
- Welcome screen with suggestions

---

## Step 4: Test It Out (1 minute)

### Test Text Input (Works Now)

1. Click in the input field at the bottom
2. Type: "Tell me about your day"
3. Click the send button (✈️) or press Enter
4. Watch the AI response stream in!

### Test Voice Input (Mock Mode)

1. Click the voice button (🎤)
2. You'll see mock transcription appear
3. This demonstrates the UI flow
4. **Note**: Real voice requires Swift helper (see below)

### Test Settings

1. Click the ⚙️ icon in the title bar
2. Settings panel slides in from the right
3. Try changing the model or voice speed
4. Settings persist across restarts

### Test Global Hotkey

1. Hide the app (click × or minimize)
2. Press `⌘⇧Space` from anywhere
3. App appears instantly!

---

## What Works Right Now

✅ **Beautiful UI**: iOS 26 Liquid Glass design  
✅ **Text Chat**: Full conversation with AI  
✅ **Streaming Responses**: See AI think in real-time  
✅ **Bubble Suggestions**: Contextual prompts appear  
✅ **Settings**: Model selection, voice speed, etc.  
✅ **Menu Bar**: Quick access from anywhere  
✅ **Global Hotkey**: `⌘⇧Space` to activate  

⚠️ **Voice Input**: Shows mock transcription (needs Swift helper)  
⚠️ **TTS Output**: No audio yet (needs Swift helper)

---

## Troubleshooting

### App Won't Start

**Error**: `Cannot find module '@google/generative-ai'`

**Fix**:
```bash
npm install
```

---

### No AI Responses

**Error**: "Failed to process message"

**Check**:
1. Is your API key correct in `.env`?
2. Is the backend server running? (It starts automatically)
3. Check the terminal for error messages

**Test API Key**:
```bash
# Quick test
curl -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=YOUR_API_KEY"
```

---

### WebSocket Connection Failed

**Error**: "Disconnected" status indicator

**Fix**:
1. Backend might not have started
2. Check terminal for backend logs
3. Try restarting the app

---

### Port Already in Use

**Error**: `EADDRINUSE: address already in use`

**Fix**:
```bash
# Kill processes on ports 7482 and 7483
lsof -ti:7482 | xargs kill -9
lsof -ti:7483 | xargs kill -9

# Restart app
npm run dev
```

---

## Next Steps

### Want Real Voice Input?

You'll need to build the Swift helper for Apple Speech APIs.

**See**: `IMPLEMENTATION_STATUS.md` section 1 for detailed instructions.

**Time**: 4-6 hours with Xcode  
**Result**: Full voice input with real-time transcription

---

### Want to Customize?

**Change the UI theme**:
- Edit `src/frontend/styles/liquid-glass.css`
- Modify the CSS custom properties (`:root` section)

**Change the AI personality**:
- Edit `src/backend/services/LLMService.js`
- Modify the `buildSystemPrompt()` method

**Change keyboard shortcuts**:
- Edit `src/electron/main.js`
- Modify the `GLOBAL_HOTKEY` constant

---

### Want to Build for Distribution?

```bash
# Build DMG installer
npm run build:mac

# Output will be in dist/
```

**Note**: You'll need to create an app icon first:
- Create `assets/icon.icns` (512x512 icon)
- Or use a placeholder for testing

---

## Usage Tips

### Best Practices

1. **Start with Text**: Test the AI responses with text first
2. **Try Different Models**: Compare Gemini, Claude, GPT in settings
3. **Use Bubbles**: Click suggested bubbles to continue conversations
4. **Edit Transcriptions**: Voice input can be edited before sending
5. **Use Hotkey**: `⌘⇧Space` is faster than clicking

### Conversation Ideas

Try these to see the AI in action:

- "I'm feeling overwhelmed with work and family balance"
- "Help me think through a career decision"
- "I want to set some personal goals"
- "Tell me what I've been worried about lately" (after a few messages)

### Settings Recommendations

**For Speed**:
- Model: Gemini 2.5 Flash-Lite
- Voice Speed: 1.2x

**For Quality**:
- Model: Claude Sonnet 4.5
- Voice Speed: 1.0x

**For Cost**:
- Model: Gemini 2.5 Flash-Lite (cheapest)

---

## Getting Help

### Check the Docs

- **README.md** - Full documentation
- **IMPLEMENTATION_STATUS.md** - What's implemented and what's not
- **BUILD_SUMMARY.md** - Detailed build information

### Common Questions

**Q: Why isn't voice input working?**  
A: Real voice requires a Swift helper for Apple's speech APIs. Text input works fully.

**Q: Can I use this without an API key?**  
A: No, you need an API key for the LLM. But Google's free tier is generous.

**Q: Does this work offline?**  
A: Not yet. Local LLM support is planned but not implemented.

**Q: Where is my conversation data stored?**  
A: Currently in memory (lost on restart). Persistent storage is planned.

**Q: Can I use my own API keys for Claude or GPT?**  
A: Yes! Add them to `.env` and select the model in settings.

---

## Quick Reference

### Keyboard Shortcuts

- `⌘⇧Space` - Activate app (global)
- `⌘K` - Focus input field
- `⌘,` - Open settings
- `Enter` - Send message
- `Shift+Enter` - New line in input
- `Escape` - Close settings / Stop voice

### File Locations

- **Config**: `.env` (API keys)
- **Settings**: localStorage (in app)
- **Logs**: Terminal output
- **Code**: `src/` directory

### Ports

- **HTTP**: 7482
- **WebSocket**: 7483

---

## Success! 🎉

You should now have BubbleVoice running with:
- Beautiful Liquid Glass UI
- Working text chat with AI
- Streaming responses
- Contextual bubbles
- Persistent settings

**Enjoy your personal AI companion!**

---

**Need help?** Check the detailed docs or the implementation status document.

**Ready for voice?** See the Swift helper implementation guide.

**Happy chatting!** 💬✨
