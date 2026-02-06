#!/usr/bin/env node

/**
 * DATABASE SERVICE TEST SCRIPT
 * 
 * Quick test to verify DatabaseService works correctly.
 * Run with: node test-database.js
 */

const DatabaseService = require('./src/backend/services/DatabaseService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║          DatabaseService Test Script                       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test database
const testDbPath = path.join(__dirname, 'user_data', 'test.db');

// Clean up old test database
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('🗑️  Removed old test database');
}

// Initialize database
console.log('📦 Initializing DatabaseService...');
const db = new DatabaseService(testDbPath);
db.initialize();

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 1: Conversations');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Create conversation
const conv = db.createConversation('conv_test_123', 'Test Conversation', { test: true });
console.log('✅ Created conversation:', conv.id);

// Get conversation
const retrieved = db.getConversation('conv_test_123');
console.log('✅ Retrieved conversation:', retrieved.title);

// Update conversation
const updated = db.updateConversation('conv_test_123', { title: 'Updated Title' });
console.log('✅ Updated conversation:', updated.title);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 2: Messages');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Add messages
db.addMessage('conv_test_123', 'user', 'Hello, how are you?');
console.log('✅ Added user message');

db.addMessage('conv_test_123', 'assistant', 'I am doing well, thank you!');
console.log('✅ Added assistant message');

// Get messages
const messages = db.getMessages('conv_test_123');
console.log(`✅ Retrieved ${messages.length} messages`);

// Get message count
const count = db.getMessageCount('conv_test_123');
console.log(`✅ Message count: ${count}`);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 3: Life Areas');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Create area
const area = db.createArea('Family/Emma_School', 'Emma\'s School', 'Family', 'Tracking Emma\'s reading progress');
console.log('✅ Created area:', area.path);

// Get area
const retrievedArea = db.getArea('Family/Emma_School');
console.log('✅ Retrieved area:', retrievedArea.name);

// Get all areas
const allAreas = db.getAllAreas();
console.log(`✅ Total areas: ${allAreas.length}`);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 4: Area Entries');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Add entry
const entry = db.addEntry('Family/Emma_School', 'reading_comprehension.md', {
    timestamp: new Date().toISOString(),
    content: 'Emma had a breakthrough with graphic novels today!',
    user_quote: 'She read for 20 minutes straight without complaining.',
    ai_observation: 'Visual learning style hypothesis strengthening.',
    sentiment: 'hopeful',
    conversation_id: 'conv_test_123'
});
console.log('✅ Added entry:', entry.id);

// Get entries
const entries = db.getEntries('Family/Emma_School', 'reading_comprehension.md');
console.log(`✅ Retrieved ${entries.length} entries`);

// Get recent entries
const recent = db.getRecentEntries(10);
console.log(`✅ Retrieved ${recent.length} recent entries`);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 5: Artifacts');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Save artifact
const artifact = db.saveArtifact('conv_test_123', {
    artifact_id: 'test_artifact_123',
    artifact_type: 'stress_map',
    html: '<html><body><h1>Test Artifact</h1></body></html>',
    data: { test: true },
    turn_number: 1
});
console.log('✅ Saved artifact:', artifact.id);

// Get artifact
const retrievedArtifact = db.getArtifact('test_artifact_123');
console.log('✅ Retrieved artifact:', retrievedArtifact.artifact_type);

// Get artifacts by conversation
const artifacts = db.getArtifactsByConversation('conv_test_123');
console.log(`✅ Retrieved ${artifacts.length} artifacts for conversation`);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 6: Settings');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Set setting
db.setSetting('test_key', 'test_value');
console.log('✅ Set setting: test_key');

// Get setting
const value = db.getSetting('test_key');
console.log('✅ Retrieved setting:', value);

// Get all settings
const allSettings = db.getAllSettings();
console.log(`✅ Total settings: ${Object.keys(allSettings).length}`);

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 7: Foreign Key Constraints');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Try to add message to non-existent conversation (should fail)
try {
    db.addMessage('non_existent_conv', 'user', 'This should fail');
    console.log('❌ FAIL: Should have thrown foreign key error');
} catch (error) {
    console.log('✅ Foreign key constraint working (message rejected)');
}

// Delete conversation (should cascade delete messages)
const messagesBefore = db.getMessages('conv_test_123');
console.log(`📊 Messages before delete: ${messagesBefore.length}`);

db.deleteConversation('conv_test_123');
console.log('✅ Deleted conversation (cascade)');

const messagesAfter = db.getMessages('conv_test_123');
console.log(`📊 Messages after delete: ${messagesAfter.length}`);

if (messagesAfter.length === 0) {
    console.log('✅ Cascade delete working correctly');
} else {
    console.log('❌ FAIL: Messages not deleted');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 8: Database Integrity');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Run integrity check
const integrityCheck = db.db.prepare('PRAGMA integrity_check').get();
console.log('✅ Integrity check:', integrityCheck.integrity_check);

// Check foreign keys
const fkCheck = db.db.prepare('PRAGMA foreign_key_check').all();
if (fkCheck.length === 0) {
    console.log('✅ No foreign key violations');
} else {
    console.log('❌ Foreign key violations found:', fkCheck.length);
}

// Close database
db.close();
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('ALL TESTS COMPLETE ✅');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`Test database created at: ${testDbPath}`);
console.log('You can inspect it with: sqlite3 user_data/test.db');
console.log('');
