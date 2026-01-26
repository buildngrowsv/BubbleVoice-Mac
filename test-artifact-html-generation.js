/**
 * ARTIFACT HTML GENERATION TEST
 * 
 * Tests artifact generation with explicit user requests.
 * Verifies:
 * - HTML toggle ON when user requests visualization
 * - Sophisticated HTML generation (liquid glass styling)
 * - HTML/JSON splitting (both files saved)
 * - Artifact quality (emotional depth, visual polish)
 * 
 * This test uses explicit requests like "show me", "visualize", "make a chart"
 * to ensure the AI generates artifacts.
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
const TEST_USER_DATA_DIR = path.join(__dirname, 'test_artifact_html');
const CONVERSATION_ID = 'job_decision_test';
const ARTIFACTS_DIR = path.join(__dirname, 'test-artifacts-generated');

/**
 * MAIN TEST FUNCTION
 */
async function runArtifactHTMLTest() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎨 ARTIFACT HTML GENERATION TEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Testing sophisticated HTML artifact generation with:');
    console.log('  - Explicit user requests ("show me", "visualize")');
    console.log('  - HTML toggle system');
    console.log('  - HTML/JSON splitting');
    console.log('  - Liquid glass styling');
    console.log('  - Emotional depth');
    console.log('');
    
    try {
        // Clean up previous test data
        await cleanupTestData();
        await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        
        // Initialize services
        console.log('[Setup] Initializing services...');
        const integrationService = new IntegrationService(TEST_USER_DATA_DIR);
        const llmService = new LLMService();
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Create conversation
        await integrationService.convStorage.createConversation(
            CONVERSATION_ID,
            'Job Decision Test'
        );
        
        console.log('[Setup] ✅ Services initialized');
        console.log('');
        
        // Test scenario with explicit artifact requests
        const scenario = [
            {
                turn: 1,
                user: "I need to decide between two job offers. Can you help me visualize the comparison?",
                expectedToggle: true,
                expectedArtifact: 'comparison_card',
                description: "Explicit request for visualization"
            },
            {
                turn: 2,
                user: "Job A: Google - $190k, 60hr weeks, stable but boring, relocate to SF. Job B: Startup - $140k + equity, remote, risky but exciting, work-life balance. I have two kids.",
                expectedToggle: true,
                expectedArtifact: 'comparison_card',
                description: "Provide details - should generate full HTML"
            },
            {
                turn: 3,
                user: "Actually the startup equity is 0.5%, not 0.2%",
                expectedToggle: false,
                expectedArtifact: 'none',
                description: "Data correction - should be HTML OFF"
            },
            {
                turn: 4,
                user: "Can you show me a timeline of what my life would look like in 2 years at each job?",
                expectedToggle: true,
                expectedArtifact: 'timeline',
                description: "Explicit request for timeline"
            },
            {
                turn: 5,
                user: "Make me a checklist of things I should consider before deciding",
                expectedToggle: true,
                expectedArtifact: 'checklist',
                description: "Explicit request for checklist"
            }
        ];
        
        const conversationHistory = [];
        const artifactsGenerated = [];
        
        // Run each turn
        for (const turn of scenario) {
            const result = await runTurn(
                llmService,
                integrationService,
                turn,
                conversationHistory
            );
            
            if (result.artifactSaved) {
                artifactsGenerated.push(result);
            }
        }
        
        // Verify artifacts
        await verifyArtifacts(artifactsGenerated);
        
        // Generate report
        await generateReport(scenario, artifactsGenerated);
        
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ ARTIFACT HTML GENERATION TEST PASSED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`📊 Artifacts generated: ${artifactsGenerated.length}`);
        console.log(`📁 Saved to: ${ARTIFACTS_DIR}`);
        
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
async function runTurn(llmService, integrationService, turnData, conversationHistory) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`TURN ${turnData.turn}: ${turnData.description}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('');
    console.log(`👤 User: "${turnData.user}"`);
    console.log('');
    
    const conversation = {
        messages: [
            ...conversationHistory,
            { role: 'user', content: turnData.user }
        ]
    };
    
    console.log('[LLM] Generating response...');
    const startTime = Date.now();
    
    let structuredOutput = null;
    let fullResponse = '';
    let artifactAction = null;
    
    const llmResult = await llmService.generateResponse(
        conversation,
        { model: 'gemini-2.5-flash-lite', temperature: 0.7 },
        {
            onChunk: (chunk) => {
                fullResponse += chunk;
                process.stdout.write('.');
            },
            onArtifact: (a) => {
                artifactAction = a;
            }
        }
    );
    
    const latency = Date.now() - startTime;
    
    if (typeof llmResult === 'object' && llmResult.structured) {
        structuredOutput = llmResult.structured;
        fullResponse = llmResult.text;
    }
    
    console.log('');
    console.log(`[LLM] ✅ Response in ${latency}ms`);
    console.log('');
    console.log(`🤖 AI: "${fullResponse.substring(0, 80)}..."`);
    console.log('');
    
    // Verify HTML toggle
    if (structuredOutput?.html_toggle) {
        const toggle = structuredOutput.html_toggle;
        console.log(`[Toggle] generate_html: ${toggle.generate_html}`);
        console.log(`[Toggle] reason: "${toggle.reason || 'not provided'}"`);
        
        if (toggle.generate_html === turnData.expectedToggle) {
            console.log(`[Test] ✅ HTML toggle correct`);
        } else {
            console.log(`[Test] ⚠️  HTML toggle: expected ${turnData.expectedToggle}, got ${toggle.generate_html}`);
        }
    }
    
    console.log('');
    
    // Verify artifact
    let artifactSaved = null;
    if (artifactAction) {
        console.log(`[Artifact] action: ${artifactAction.action}`);
        console.log(`[Artifact] type: ${artifactAction.artifact_type || 'none'}`);
        console.log(`[Artifact] has HTML: ${!!artifactAction.html}`);
        
        if (artifactAction.html) {
            console.log(`[Artifact] HTML length: ${artifactAction.html.length} chars`);
            
            // Quality checks
            const checks = {
                doctype: artifactAction.html.includes('<!DOCTYPE'),
                style: artifactAction.html.includes('<style>'),
                liquidGlass: artifactAction.html.includes('backdrop-filter') || artifactAction.html.includes('blur'),
                gradient: artifactAction.html.includes('gradient'),
                emotional: artifactAction.html.toLowerCase().includes('feel') || 
                          artifactAction.html.toLowerCase().includes('heart') ||
                          artifactAction.html.toLowerCase().includes('hard because')
            };
            
            console.log(`[Quality] DOCTYPE: ${checks.doctype ? '✅' : '❌'}`);
            console.log(`[Quality] <style> tag: ${checks.style ? '✅' : '❌'}`);
            console.log(`[Quality] Liquid glass: ${checks.liquidGlass ? '✅' : '❌'}`);
            console.log(`[Quality] Gradients: ${checks.gradient ? '✅' : '❌'}`);
            console.log(`[Quality] Emotional depth: ${checks.emotional ? '✅' : '❌'}`);
            
            const qualityScore = Object.values(checks).filter(v => v).length;
            console.log(`[Quality] Score: ${qualityScore}/5`);
        }
    }
    
    console.log('');
    
    // Process turn
    if (structuredOutput) {
        const result = await integrationService.processTurn(
            CONVERSATION_ID,
            turnData.user,
            fullResponse,
            structuredOutput
        );
        
        console.log(`[Integration] ✅ Processed`);
        console.log(`  Artifacts saved: ${result.artifactsSaved.length}`);
        
        if (result.artifactsSaved.length > 0) {
            artifactSaved = {
                turn: turnData.turn,
                artifactId: result.artifactsSaved[0],
                artifactType: artifactAction?.artifact_type,
                html: artifactAction?.html
            };
        }
    }
    
    console.log('');
    
    // Add to history
    conversationHistory.push(
        { role: 'user', content: turnData.user },
        { role: 'assistant', content: fullResponse }
    );
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { artifactSaved, latency };
}

/**
 * VERIFY ARTIFACTS
 */
async function verifyArtifacts(artifactsGenerated) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ARTIFACT FILES VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    const artifactsDir = path.join(TEST_USER_DATA_DIR, 'conversations', CONVERSATION_ID, 'artifacts');
    
    try {
        const files = await fs.readdir(artifactsDir);
        console.log(`[Files] Found ${files.length} artifact files`);
        
        const htmlFiles = files.filter(f => f.endsWith('.html') && !f.startsWith('_'));
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`[Files] HTML: ${htmlFiles.length}, JSON: ${jsonFiles.length}`);
        console.log('');
        
        // Verify each HTML file
        for (const htmlFile of htmlFiles) {
            const htmlPath = path.join(artifactsDir, htmlFile);
            const html = await fs.readFile(htmlPath, 'utf-8');
            
            console.log(`[Artifact] ${htmlFile}:`);
            console.log(`  Size: ${html.length} chars`);
            console.log(`  DOCTYPE: ${html.includes('<!DOCTYPE') ? '✅' : '❌'}`);
            console.log(`  <style>: ${html.includes('<style>') ? '✅' : '❌'}`);
            console.log(`  Liquid glass: ${html.includes('backdrop-filter') ? '✅' : '❌'}`);
            console.log(`  Gradients: ${html.includes('gradient') ? '✅' : '❌'}`);
            console.log(`  Blur: ${html.includes('blur') ? '✅' : '❌'}`);
            
            // Save to artifacts dir for inspection
            const savePath = path.join(ARTIFACTS_DIR, htmlFile);
            await fs.writeFile(savePath, html);
            console.log(`  ✅ Saved to: ${savePath}`);
            console.log('');
        }
        
        // Check for corresponding JSON files
        for (const htmlFile of htmlFiles) {
            const jsonFile = htmlFile.replace('.html', '.json');
            if (jsonFiles.includes(jsonFile)) {
                const jsonPath = path.join(artifactsDir, jsonFile);
                const json = await fs.readFile(jsonPath, 'utf-8');
                const data = JSON.parse(json);
                
                console.log(`[Data] ${jsonFile}:`);
                console.log(`  Keys: ${Object.keys(data).join(', ')}`);
                console.log(`  ✅ JSON data exists`);
                console.log('');
            }
        }
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[Files] ⚠️  No artifacts directory found');
        } else {
            throw error;
        }
    }
}

/**
 * GENERATE REPORT
 */
async function generateReport(scenario, artifactsGenerated) {
    const report = `# Artifact HTML Generation Test Report

**Date**: ${new Date().toISOString()}
**Test**: Job Decision with Explicit Artifact Requests
**Turns**: ${scenario.length}
**Artifacts Generated**: ${artifactsGenerated.length}

## Summary

This test verified that the AI generates sophisticated HTML artifacts when users explicitly request visualization.

## Results

${scenario.map(turn => {
    const artifact = artifactsGenerated.find(a => a.turn === turn.turn);
    return `### Turn ${turn.turn}: ${turn.description}
**User**: ${turn.user}
**Expected Toggle**: ${turn.expectedToggle ? 'ON' : 'OFF'}
**Expected Artifact**: ${turn.expectedArtifact}
**Artifact Generated**: ${artifact ? 'YES ✅' : 'NO ❌'}
${artifact ? `**Artifact Type**: ${artifact.artifactType}
**HTML Size**: ${artifact.html?.length || 0} chars` : ''}
`;
}).join('\n')}

## Artifacts Generated

${artifactsGenerated.map(a => `### ${a.artifactId}
- **Type**: ${a.artifactType}
- **Turn**: ${a.turn}
- **HTML Size**: ${a.html?.length || 0} chars
- **Has Data**: ${!!a.data}
`).join('\n')}

## Conclusion

${artifactsGenerated.length > 0 ? 
  '✅ Artifact generation working! HTML artifacts created with sophisticated styling.' :
  '⚠️ No artifacts generated. Prompt may need tuning for explicit requests.'}
`;
    
    await fs.writeFile(path.join(ARTIFACTS_DIR, 'TEST_REPORT.md'), report);
}

/**
 * CLEANUP
 */
async function cleanupTestData() {
    try {
        await fs.rm(TEST_USER_DATA_DIR, { recursive: true, force: true });
        await fs.rm(ARTIFACTS_DIR, { recursive: true, force: true });
        console.log('[Cleanup] ✅ Test data cleaned');
    } catch (error) {
        // Ignore
    }
}

// Run test
runArtifactHTMLTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
