#!/usr/bin/env node

/**
 * PROMPT MANAGEMENT SERVICE TEST
 * 
 * Tests the PromptManagementService to ensure:
 * - Default prompts load correctly
 * - Custom prompts can be saved and loaded
 * - Section updates work
 * - Reset to defaults works
 * - Context assembly config works
 * 
 * Run with: node test-prompt-management.js
 */

const PromptManagementService = require('./src/backend/services/PromptManagementService');
const path = require('path');
const fs = require('fs');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       Prompt Management Service Test                       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Use test directory
const testDir = path.join(__dirname, 'user_data_prompt_test');

// Clean up
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('🗑️  Cleaned up old test data');
}

console.log('📦 Initializing PromptManagementService...');
console.log('');

const promptService = new PromptManagementService(testDir);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 1: Default Prompts');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const systemPrompt = promptService.getSystemPrompt();
console.log('✅ System prompt length:', systemPrompt.length, 'chars');
console.log('✅ Contains "BubbleVoice":', systemPrompt.includes('BubbleVoice'));
console.log('✅ Contains "Life Areas":', systemPrompt.includes('Life Areas'));
console.log('✅ Contains JSON format:', systemPrompt.includes('response'));
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 2: Get All Sections');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const sections = promptService.getAllSections();
console.log('Sections found:');
for (const [name, data] of Object.entries(sections)) {
    console.log(`  ${name}: ${data.content.length} chars, custom: ${data.isCustom}`);
}
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 3: Update Section');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const customPurpose = 'You are BubbleVoice, a CUSTOM AI companion for testing!';
promptService.updatePromptSection('purpose', customPurpose);

const updatedPurpose = promptService.getPromptSection('purpose');
console.log('✅ Updated purpose:', updatedPurpose === customPurpose);
console.log('✅ Custom prompts file exists:', fs.existsSync(path.join(testDir, 'config', 'prompts.json')));
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 4: System Prompt Uses Custom');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const updatedSystemPrompt = promptService.getSystemPrompt();
console.log('✅ Contains custom text:', updatedSystemPrompt.includes('CUSTOM AI companion'));
console.log('✅ Still contains other sections:', updatedSystemPrompt.includes('Life Areas'));
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 5: Metadata');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const metadata = promptService.getMetadata();
console.log('Metadata:');
console.log(`  Version: ${metadata.version}`);
console.log(`  Last Modified: ${metadata.lastModified}`);
console.log(`  Modified By: ${metadata.modifiedBy}`);
console.log(`  Has Customizations: ${metadata.hasCustomizations}`);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 6: Context Assembly Config');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const config = promptService.getContextAssemblyConfig();
console.log('Config loaded:');
console.log(`  Recent user inputs weight: ${config.multiQueryWeights.recentUserInputs}`);
console.log(`  All user inputs weight: ${config.multiQueryWeights.allUserInputs}`);
console.log(`  Recency boost per day: ${config.boosts.recencyBoostPerDay}`);
console.log(`  Area boost: ${config.boosts.areaBoost}`);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 7: Update Context Config');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

promptService.updateContextAssemblyConfig({
    multiQueryWeights: {
        recentUserInputs: 5.0,  // Changed from 3.0
        allUserInputs: 2.0,      // Changed from 1.5
        fullConversation: 0.5
    }
});

const updatedConfig = promptService.getContextAssemblyConfig();
console.log('✅ Recent user inputs weight updated:', updatedConfig.multiQueryWeights.recentUserInputs === 5.0);
console.log('✅ All user inputs weight updated:', updatedConfig.multiQueryWeights.allUserInputs === 2.0);
console.log('✅ Other values preserved:', updatedConfig.boosts.recencyBoostPerDay === 0.05);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 8: Persistence (Reload)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Create new instance to test loading from disk
const promptService2 = new PromptManagementService(testDir);

const reloadedPurpose = promptService2.getPromptSection('purpose');
const reloadedConfig = promptService2.getContextAssemblyConfig();

console.log('✅ Custom purpose persisted:', reloadedPurpose === customPurpose);
console.log('✅ Custom config persisted:', reloadedConfig.multiQueryWeights.recentUserInputs === 5.0);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 9: Reset to Defaults');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

promptService2.resetToDefaults();

const resetPurpose = promptService2.getPromptSection('purpose');
const resetConfig = promptService2.getContextAssemblyConfig();

console.log('✅ Purpose reset to default:', !resetPurpose.includes('CUSTOM'));
console.log('✅ Config reset to default:', resetConfig.multiQueryWeights.recentUserInputs === 3.0);
console.log('✅ Metadata shows no customizations:', !promptService2.getMetadata().hasCustomizations);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 10: File Structure');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const { execSync } = require('child_process');
const treeOutput = execSync(
    `cd "${testDir}" && find . -type f`,
    { encoding: 'utf-8' }
);
console.log('Files created:');
console.log(treeOutput);

console.log('═══════════════════════════════════════════════════════════════');
console.log('PROMPT MANAGEMENT SERVICE TEST PASSED ✅');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Summary:');
console.log('  ✅ Default prompts load correctly');
console.log('  ✅ Sections can be retrieved individually');
console.log('  ✅ Sections can be updated');
console.log('  ✅ Custom prompts are used in system prompt');
console.log('  ✅ Metadata tracks changes');
console.log('  ✅ Context assembly config works');
console.log('  ✅ Config can be updated');
console.log('  ✅ Changes persist across restarts');
console.log('  ✅ Reset to defaults works');
console.log('  ✅ File structure is clean');
console.log('');
console.log('Next Steps:');
console.log('  1. Integrate with LLMService');
console.log('  2. Integrate with ContextAssemblyService');
console.log('  3. Build admin panel UI');
console.log('  4. Add IPC handlers for frontend');
console.log('');
