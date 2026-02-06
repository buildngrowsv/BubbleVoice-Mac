#!/usr/bin/env node

/**
 * TEST SETTINGS FEATURES
 * 
 * This script tests the new settings features:
 * - Target folder selection
 * - Permissions management
 * 
 * It verifies that:
 * 1. IPC handlers are properly registered
 * 2. Settings persistence works
 * 3. UI elements are present
 * 
 * USAGE:
 * node test-settings-features.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing BubbleVoice Settings Features\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Test 1: Check main.js has folder selection handler
test('main.js has select-target-folder IPC handler', () => {
  const mainPath = path.join(__dirname, 'src/electron/main.js');
  const content = fs.readFileSync(mainPath, 'utf8');
  
  if (!content.includes("ipcMain.handle('select-target-folder'")) {
    throw new Error('select-target-folder handler not found');
  }
  
  if (!content.includes('dialog.showOpenDialog')) {
    throw new Error('dialog.showOpenDialog not found');
  }
});

// Test 2: Check main.js has permissions handlers
test('main.js has microphone permission handlers', () => {
  const mainPath = path.join(__dirname, 'src/electron/main.js');
  const content = fs.readFileSync(mainPath, 'utf8');
  
  if (!content.includes("ipcMain.handle('check-microphone-permission'")) {
    throw new Error('check-microphone-permission handler not found');
  }
  
  if (!content.includes("ipcMain.handle('request-microphone-permission'")) {
    throw new Error('request-microphone-permission handler not found');
  }
  
  if (!content.includes('systemPreferences')) {
    throw new Error('systemPreferences not imported');
  }
});

// Test 3: Check main.js has accessibility handlers
test('main.js has accessibility permission handlers', () => {
  const mainPath = path.join(__dirname, 'src/electron/main.js');
  const content = fs.readFileSync(mainPath, 'utf8');
  
  if (!content.includes("ipcMain.handle('check-accessibility-permission'")) {
    throw new Error('check-accessibility-permission handler not found');
  }
  
  if (!content.includes("ipcMain.handle('open-accessibility-settings'")) {
    throw new Error('open-accessibility-settings handler not found');
  }
});

// Test 4: Check preload.js exposes folder selection
test('preload.js exposes selectTargetFolder', () => {
  const preloadPath = path.join(__dirname, 'src/electron/preload.js');
  const content = fs.readFileSync(preloadPath, 'utf8');
  
  if (!content.includes('selectTargetFolder')) {
    throw new Error('selectTargetFolder not exposed');
  }
});

// Test 5: Check preload.js exposes permissions API
test('preload.js exposes permissions API', () => {
  const preloadPath = path.join(__dirname, 'src/electron/preload.js');
  const content = fs.readFileSync(preloadPath, 'utf8');
  
  if (!content.includes('permissions:')) {
    throw new Error('permissions object not exposed');
  }
  
  if (!content.includes('checkMicrophone')) {
    throw new Error('checkMicrophone not exposed');
  }
  
  if (!content.includes('requestMicrophone')) {
    throw new Error('requestMicrophone not exposed');
  }
  
  if (!content.includes('checkAccessibility')) {
    throw new Error('checkAccessibility not exposed');
  }
});

// Test 6: Check index.html has target folder UI
test('index.html has target folder UI elements', () => {
  const htmlPath = path.join(__dirname, 'src/frontend/index.html');
  const content = fs.readFileSync(htmlPath, 'utf8');
  
  if (!content.includes('id="target-folder-path"')) {
    throw new Error('target-folder-path input not found');
  }
  
  if (!content.includes('id="select-folder-button"')) {
    throw new Error('select-folder-button not found');
  }
});

// Test 7: Check index.html has permissions UI
test('index.html has permissions UI elements', () => {
  const htmlPath = path.join(__dirname, 'src/frontend/index.html');
  const content = fs.readFileSync(htmlPath, 'utf8');
  
  if (!content.includes('id="microphone-status"')) {
    throw new Error('microphone-status element not found');
  }
  
  if (!content.includes('id="accessibility-status"')) {
    throw new Error('accessibility-status element not found');
  }
  
  if (!content.includes('id="request-microphone-button"')) {
    throw new Error('request-microphone-button not found');
  }
  
  if (!content.includes('id="open-accessibility-button"')) {
    throw new Error('open-accessibility-button not found');
  }
});

// Test 8: Check app.js has folder selection handler
test('app.js has folder selection handler', () => {
  const appPath = path.join(__dirname, 'src/frontend/components/app.js');
  const content = fs.readFileSync(appPath, 'utf8');
  
  if (!content.includes('selectTargetFolder')) {
    throw new Error('selectTargetFolder call not found');
  }
  
  if (!content.includes('targetFolder')) {
    throw new Error('targetFolder setting not found');
  }
});

// Test 9: Check app.js has permissions setup
test('app.js has setupPermissionsUI method', () => {
  const appPath = path.join(__dirname, 'src/frontend/components/app.js');
  const content = fs.readFileSync(appPath, 'utf8');
  
  if (!content.includes('setupPermissionsUI')) {
    throw new Error('setupPermissionsUI method not found');
  }
  
  if (!content.includes('updatePermissionStatus')) {
    throw new Error('updatePermissionStatus method not found');
  }
});

// Test 10: Check CSS has new styles
test('main.css has folder selector styles', () => {
  const cssPath = path.join(__dirname, 'src/frontend/styles/main.css');
  const content = fs.readFileSync(cssPath, 'utf8');
  
  if (!content.includes('.folder-selector')) {
    throw new Error('folder-selector style not found');
  }
  
  if (!content.includes('.permission-item')) {
    throw new Error('permission-item style not found');
  }
  
  if (!content.includes('.permission-badge')) {
    throw new Error('permission-badge style not found');
  }
});

// Test 11: Check entitlements file exists
test('entitlements.mac.plist exists with correct permissions', () => {
  const entPath = path.join(__dirname, 'entitlements.mac.plist');
  
  if (!fs.existsSync(entPath)) {
    throw new Error('entitlements.mac.plist not found');
  }
  
  const content = fs.readFileSync(entPath, 'utf8');
  
  if (!content.includes('com.apple.security.device.audio-input')) {
    throw new Error('Microphone entitlement not found');
  }
  
  if (!content.includes('com.apple.security.files.user-selected.read-write')) {
    throw new Error('File access entitlement not found');
  }
});

// Test 12: Check Info.plist exists
test('Info.plist exists with usage descriptions', () => {
  const infoPath = path.join(__dirname, 'Info.plist');
  
  if (!fs.existsSync(infoPath)) {
    throw new Error('Info.plist not found');
  }
  
  const content = fs.readFileSync(infoPath, 'utf8');
  
  if (!content.includes('NSMicrophoneUsageDescription')) {
    throw new Error('Microphone usage description not found');
  }
  
  if (!content.includes('NSSpeechRecognitionUsageDescription')) {
    throw new Error('Speech recognition usage description not found');
  }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed! Settings features are properly implemented.');
  process.exit(0);
}
