#!/bin/bash

# Fix Native Modules Script
# Rebuilds better-sqlite3 for BOTH Electron and system Node.js
# Run this after code changes or npm install

echo "🔧 Fixing native modules for BubbleVoice-Mac..."
echo ""

# Step 1: Rebuild for system Node.js (backend server)
echo "📦 Step 1/2: Rebuilding for system Node.js (backend)..."
npm rebuild better-sqlite3
if [ $? -eq 0 ]; then
    echo "✅ System Node.js rebuild complete"
else
    echo "❌ System Node.js rebuild failed"
    exit 1
fi

echo ""

# Step 2: Rebuild for Electron (main process)
echo "⚡ Step 2/2: Rebuilding for Electron (main process)..."
npx electron-rebuild -f -w better-sqlite3
if [ $? -eq 0 ]; then
    echo "✅ Electron rebuild complete"
else
    echo "❌ Electron rebuild failed"
    exit 1
fi

echo ""
echo "🎉 All native modules fixed!"
echo ""
echo "Next steps:"
echo "1. Kill current app: pkill -f 'Electron.*BubbleVoice'"
echo "2. Restart app: npm run dev"
echo ""
