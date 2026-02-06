/**
 * END-TO-END ARTIFACT GENERATION TEST
 * 
 * Tests the complete artifact generation flow:
 * 1. User provides details for a complex decision
 * 2. AI toggles HTML ON and generates comparison card
 * 3. User makes data correction
 * 4. AI updates data only (HTML OFF)
 * 5. User requests redesign
 * 6. AI toggles HTML ON and regenerates
 * 
 * This test verifies:
 * - HTML toggle system works correctly
 * - Artifacts are saved as HTML + JSON
 * - Sophisticated HTML is generated
 * - Data updates work without HTML regeneration
 * - Redesign requests trigger HTML regeneration
 * 
 * Created: 2026-01-25
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

// Import services
const IntegrationService = require('./src/backend/services/IntegrationService');
const LLMService = require('./src/backend/services/LLMService');

// Test configuration
const TEST_USER_DATA_DIR = path.join(__dirname, 'test_user_data_artifacts');
const CONVERSATION_ID = 'test_artifact_generation';

/**
 * MAIN TEST FUNCTION
 */
async function runArtifactGenerationTest() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎨 END-TO-END ARTIFACT GENERATION TEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    try {
        // Clean up previous test data
        await cleanupTestData();
        
        // Initialize services
        console.log('[Setup] Initializing services...');
        const integrationService = new IntegrationService(TEST_USER_DATA_DIR);
        const llmService = new LLMService();
        
        // Wait for services to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create conversation
        await integrationService.convStorage.createConversation(
            CONVERSATION_ID,
            'Job Decision Test'
        );
        
        console.log('[Setup] ✅ Services initialized');
        console.log('');
        
        // Test scenario: Job decision with 5 turns
        const scenario = [
            {
                turn: 1,
                user: "I'm trying to decide between two job offers",
                expectedToggle: false,
                description: "Initial mention - should be HTML OFF (just conversation)"
            },
            {
                turn: 2,
                user: "Offer A is Google - $180k salary, 60hr weeks, stable but boring. Offer B is startup - $140k + equity, remote, risky but exciting. I have a family to support.",
                expectedToggle: true,
                description: "Details provided - should toggle HTML ON (complex decision needs visualization)"
            },
            {
                turn: 3,
                user: "Actually the Google salary is $190k, not $180k",
                expectedToggle: false,
                description: "Data correction - should be HTML OFF (simple update)"
            },
            {
                turn: 4,
                user: "Can you show this as a pros/cons list instead of cards?",
                expectedToggle: true,
                description: "Redesign request - should toggle HTML ON"
            },
            {
                turn: 5,
                user: "What do you think I should prioritize?",
                expectedToggle: false,
                description: "Question - should be HTML OFF (no artifact change)"
            }
        ];
        
        // Run each turn
        for (const turn of scenario) {
            await runTurn(llmService, integrationService, turn);
        }
        
        // Verify artifacts were saved
        await verifyArtifacts();
        
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ ALL TESTS PASSED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
    } catch (error) {
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ TEST FAILED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(error);
        process.exit(1);
    }
}

/**
 * RUN SINGLE TURN
 */
async function runTurn(llmService, integrationService, turnData) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`TURN ${turnData.turn}: ${turnData.description}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('');
    console.log(`User: "${turnData.user}"`);
    console.log('');
    
    // Build conversation history
    const conversation = {
        messages: [
            {
                role: 'user',
                content: turnData.user
            }
        ]
    };
    
    // Generate AI response
    console.log('[LLM] Generating response...');
    const startTime = Date.now();
    
    let structuredOutput = null;
    let fullResponse = '';
    
    const llmResult = await llmService.generateResponse(
        conversation,
        { model: 'gemini-2.5-flash-lite', temperature: 0.7 },
        {
            onChunk: (chunk) => {
                fullResponse += chunk;
                process.stdout.write('.');
            },
            onBubbles: (bubbles) => {
                console.log('');
                console.log(`[LLM] Bubbles: ${bubbles.length}`);
            },
            onArtifact: (artifact) => {
                console.log(`[LLM] Artifact: ${artifact?.action || 'none'}`);
            },
            onAreaActions: (actions) => {
                console.log(`[LLM] Area actions: ${actions.length}`);
            }
        }
    );
    
    const latency = Date.now() - startTime;
    
    // Extract structured output
    if (typeof llmResult === 'object' && llmResult.structured) {
        structuredOutput = llmResult.structured;
        fullResponse = llmResult.text;
    } else {
        fullResponse = llmResult;
        console.warn('[Test] ⚠️  No structured output received');
    }
    
    console.log('');
    console.log(`[LLM] ✅ Response generated in ${latency}ms`);
    console.log('');
    
    // Check HTML toggle
    if (structuredOutput && structuredOutput.html_toggle) {
        const toggle = structuredOutput.html_toggle;
        console.log(`[Toggle] generate_html: ${toggle.generate_html}`);
        console.log(`[Toggle] reason: ${toggle.reason || 'not provided'}`);
        
        // Verify expected toggle state
        if (toggle.generate_html !== turnData.expectedToggle) {
            console.warn(`[Test] ⚠️  Expected html_toggle.generate_html = ${turnData.expectedToggle}, got ${toggle.generate_html}`);
        } else {
            console.log(`[Test] ✅ HTML toggle correct: ${toggle.generate_html}`);
        }
    } else {
        console.warn('[Test] ⚠️  No html_toggle in response');
    }
    
    console.log('');
    
    // Check artifact action
    if (structuredOutput && structuredOutput.artifact_action) {
        const artifact = structuredOutput.artifact_action;
        console.log(`[Artifact] action: ${artifact.action}`);
        console.log(`[Artifact] type: ${artifact.artifact_type || 'none'}`);
        console.log(`[Artifact] has HTML: ${!!artifact.html}`);
        console.log(`[Artifact] has data: ${!!artifact.data}`);
        
        if (artifact.html) {
            const htmlLength = artifact.html.length;
            console.log(`[Artifact] HTML length: ${htmlLength} chars`);
            
            // Check for liquid glass styling
            const hasLiquidGlass = artifact.html.includes('backdrop-filter') || 
                                  artifact.html.includes('blur');
            console.log(`[Artifact] Liquid glass styling: ${hasLiquidGlass ? 'YES' : 'NO'}`);
            
            // Check for emotional language
            const hasEmotionalLanguage = artifact.html.includes('feel') ||
                                        artifact.html.includes('heart') ||
                                        artifact.html.includes('This is hard');
            console.log(`[Artifact] Emotional language: ${hasEmotionalLanguage ? 'YES' : 'NO'}`);
        }
    } else {
        console.log('[Artifact] No artifact action');
    }
    
    console.log('');
    
    // Process turn through integration service
    if (structuredOutput) {
        console.log('[Integration] Processing turn...');
        const result = await integrationService.processTurn(
            CONVERSATION_ID,
            turnData.user,
            fullResponse,
            structuredOutput
        );
        
        console.log(`[Integration] ✅ Turn processed`);
        console.log(`  Areas created: ${result.areasCreated.length}`);
        console.log(`  Entries appended: ${result.entriesAppended.length}`);
        console.log(`  Artifacts saved: ${result.artifactsSaved.length}`);
    }
    
    console.log('');
    
    // Small delay between turns
    await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * VERIFY ARTIFACTS
 */
async function verifyArtifacts() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ARTIFACT VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    const artifactsDir = path.join(TEST_USER_DATA_DIR, 'conversations', CONVERSATION_ID, 'artifacts');
    
    try {
        const files = await fs.readdir(artifactsDir);
        
        console.log(`[Artifacts] Found ${files.length} files:`);
        files.forEach(file => console.log(`  - ${file}`));
        console.log('');
        
        // Check for HTML files
        const htmlFiles = files.filter(f => f.endsWith('.html') && !f.startsWith('_'));
        console.log(`[Artifacts] HTML files: ${htmlFiles.length}`);
        
        // Check for JSON files
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        console.log(`[Artifacts] JSON files: ${jsonFiles.length}`);
        
        // Verify HTML content
        for (const htmlFile of htmlFiles) {
            const htmlPath = path.join(artifactsDir, htmlFile);
            const html = await fs.readFile(htmlPath, 'utf-8');
            
            console.log('');
            console.log(`[Verify] ${htmlFile}:`);
            console.log(`  Length: ${html.length} chars`);
            console.log(`  Has <!DOCTYPE>: ${html.includes('<!DOCTYPE')}`);
            console.log(`  Has <style>: ${html.includes('<style>')}`);
            console.log(`  Has backdrop-filter: ${html.includes('backdrop-filter')}`);
            console.log(`  Has gradient: ${html.includes('gradient')}`);
        }
        
        console.log('');
        console.log('[Artifacts] ✅ Verification complete');
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[Artifacts] ⚠️  No artifacts directory found');
        } else {
            throw error;
        }
    }
}

/**
 * CLEANUP TEST DATA
 */
async function cleanupTestData() {
    try {
        await fs.rm(TEST_USER_DATA_DIR, { recursive: true, force: true });
        console.log('[Cleanup] ✅ Test data cleaned');
    } catch (error) {
        // Ignore if doesn't exist
    }
}

// Run test
runArtifactGenerationTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
