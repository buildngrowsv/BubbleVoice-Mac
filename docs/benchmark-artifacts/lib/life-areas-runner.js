#!/usr/bin/env node

/**
 * life-areas-runner.js
 * 
 * Benchmark runner for testing life areas system with Gemini 2.5 Flash Lite.
 * 
 * This runner:
 * 1. Initializes the life areas file system
 * 2. Injects the areas tree into each prompt
 * 3. Executes area actions from AI's structured output
 * 4. Tracks area operations in benchmark results
 * 5. Generates visualizations of area structure and operations
 * 
 * Usage:
 *   node life-areas-runner.js --scenario life_areas_emma_reading
 */

const fs = require('fs');
const path = require('path');
const { 
  initializeLifeAreas,
  generateAreasTree,
  createArea,
  appendEntry,
  updateSummary,
  promoteToSubproject,
  readForContext,
  LIFE_AREAS_DIR
} = require('./area-manager');
const { 
  LIFE_AREAS_RESPONSE_SCHEMA,
  LIFE_AREAS_SYSTEM_PROMPT
} = require('./life-areas-schema');

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ Error: GOOGLE_API_KEY environment variable not set');
  process.exit(1);
}

// =============================================================================
// GEMINI 2.5 FLASH LITE CONFIGURATION
// =============================================================================

const GEMINI_MODEL = {
  id: 'gemini-2.5-flash-lite',
  name: 'Gemini 2.5 Flash Lite',
  provider: 'google',
  
  buildRequest: (messages, systemPrompt, areasTree) => {
    // Inject areas tree into system prompt
    const fullSystemPrompt = systemPrompt.replace('{areas_tree}', areasTree);
    
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : m.role,
          parts: [{ text: m.content }]
        })),
        systemInstruction: { 
          parts: [{ text: fullSystemPrompt }] 
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseSchema: LIFE_AREAS_RESPONSE_SCHEMA
        }
      })
    };
  },
  
  parseResponse: (data) => {
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text);
  }
};

// =============================================================================
// MAIN RUNNER
// =============================================================================

async function runLifeAreasTest(scenarioName) {
  console.log('\n' + '='.repeat(80));
  console.log('LIFE AREAS BENCHMARK - Gemini 2.5 Flash Lite');
  console.log('='.repeat(80) + '\n');
  
  // Initialize life areas system
  console.log('📁 Initializing life areas system...');
  const lifeAreasDir = initializeLifeAreas();
  console.log(`   ✅ Life areas directory: ${lifeAreasDir}\n`);
  
  // Load scenario
  const scenarioPath = path.join(SCENARIOS_DIR, `${scenarioName}.json`);
  if (!fs.existsSync(scenarioPath)) {
    console.error(`❌ Scenario not found: ${scenarioPath}`);
    process.exit(1);
  }
  
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  console.log(`📋 Scenario: ${scenario.scenario_name}`);
  console.log(`   ${scenario.description}\n`);
  
  // Create results directory
  const timestamp = Date.now();
  const resultsDir = path.join(RESULTS_DIR, `${GEMINI_MODEL.id}_${scenarioName}_${timestamp}`);
  fs.mkdirSync(resultsDir, { recursive: true });
  
  // Initialize conversation history
  const messages = [];
  const results = {
    scenario_name: scenario.scenario_name,
    model: GEMINI_MODEL.name,
    timestamp: new Date().toISOString(),
    turns: [],
    area_operations: [],
    final_structure: {}
  };
  
  // Run conversation turns
  for (let i = 0; i < scenario.conversation_steps.length; i++) {
    const step = scenario.conversation_steps[i];
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Turn ${i + 1}/${scenario.conversation_steps.length}`);
    console.log(`${'─'.repeat(80)}`);
    console.log(`👤 User: ${step.user_input}\n`);
    
    // Add user message to history
    messages.push({
      role: 'user',
      content: step.user_input
    });
    
    // Generate areas tree for this turn
    const areasTree = generateAreasTree();
    
    // Build request
    const request = GEMINI_MODEL.buildRequest(
      messages,
      LIFE_AREAS_SYSTEM_PROMPT,
      areasTree
    );
    
    // Call API
    const startTime = Date.now();
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Parse response
      const parsed = GEMINI_MODEL.parseResponse(data);
      
      // Log response
      console.log(`🤖 AI: ${parsed.user_response.spoken_text}`);
      console.log(`   Tone: ${parsed.user_response.emotional_tone || 'neutral'}`);
      console.log(`   Latency: ${latency}ms\n`);
      
      // Log internal notes
      if (parsed.internal_notes) {
        console.log(`📝 Internal Notes: ${parsed.internal_notes}\n`);
      }
      
      // Execute area actions
      const areaResults = [];
      if (parsed.area_actions && parsed.area_actions.length > 0) {
        console.log(`📁 Area Actions (${parsed.area_actions.length}):`);
        
        for (const action of parsed.area_actions) {
          const actionResult = await executeAreaAction(action);
          areaResults.push(actionResult);
          
          // Log action result
          if (actionResult.success) {
            console.log(`   ✅ ${action.action}: ${action.path || 'N/A'}`);
            if (action.action === 'create_area') {
              console.log(`      Created: ${actionResult.created_documents?.join(', ') || 'no documents'}`);
            } else if (action.action === 'append_entry') {
              console.log(`      Entry: ${action.entry?.timestamp || 'N/A'}`);
            }
          } else {
            console.log(`   ❌ ${action.action}: ${actionResult.error}`);
          }
        }
        console.log();
      }
      
      // Log proactive bubbles
      if (parsed.proactive_bubbles && parsed.proactive_bubbles.length > 0) {
        console.log(`💭 Proactive Bubbles (${parsed.proactive_bubbles.length}):`);
        for (const bubble of parsed.proactive_bubbles) {
          console.log(`   • "${bubble.text}" ${bubble.related_area ? `→ ${bubble.related_area}` : ''}`);
        }
        console.log();
      }
      
      // Log artifact action
      if (parsed.artifact_action && parsed.artifact_action.action !== 'none') {
        console.log(`🎨 Artifact: ${parsed.artifact_action.action} (${parsed.artifact_action.artifact_type || 'N/A'})`);
        if (parsed.artifact_action.html) {
          console.log(`   HTML length: ${parsed.artifact_action.html.length} chars`);
          
          // Save HTML artifact
          const artifactPath = path.join(resultsDir, `artifact_turn${i + 1}.html`);
          fs.writeFileSync(artifactPath, parsed.artifact_action.html, 'utf8');
          console.log(`   Saved: ${artifactPath}`);
        }
        console.log();
      }
      
      // Add assistant message to history
      messages.push({
        role: 'assistant',
        content: parsed.user_response.spoken_text
      });
      
      // Store turn results
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        model_response: parsed,
        area_results: areaResults,
        latency: latency,
        expected: {
          area_action: step.expected_area_action,
          area_path: step.expected_area_path,
          response_pattern: step.expected_response_pattern
        }
      });
      
      // Store area operations
      for (const action of parsed.area_actions || []) {
        results.area_operations.push({
          turn: i + 1,
          action: action.action,
          path: action.path,
          success: areaResults.find(r => r.action === action.action)?.success || false
        });
      }
      
    } catch (error) {
      console.error(`❌ Error on turn ${i + 1}:`, error.message);
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        error: error.message
      });
    }
  }
  
  // Capture final area structure
  console.log(`\n${'='.repeat(80)}`);
  console.log('FINAL AREA STRUCTURE');
  console.log(`${'='.repeat(80)}\n`);
  
  const finalTree = generateAreasTree();
  console.log(finalTree);
  
  results.final_structure = {
    tree: finalTree,
    life_areas_dir: LIFE_AREAS_DIR
  };
  
  // Save results
  const resultsPath = path.join(resultsDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n💾 Results saved: ${resultsPath}`);
  
  // Generate summary
  generateSummary(results, resultsDir);
  
  return results;
}

// =============================================================================
// AREA ACTION EXECUTION
// =============================================================================

async function executeAreaAction(action) {
  try {
    switch (action.action) {
      case 'none':
        return { success: true, action: 'none' };
      
      case 'create_area':
        return createArea({
          path: action.path,
          area_name: action.area_name,
          description: action.description,
          initial_documents: action.initial_documents
        });
      
      case 'append_entry':
        return appendEntry({
          path: action.path,
          entry: action.entry
        });
      
      case 'update_summary':
        return updateSummary({
          path: action.path,
          summary_updates: action.summary_updates
        });
      
      case 'promote_to_subproject':
        return promoteToSubproject({
          path: action.path,
          new_path: action.new_path,
          reason: action.reason,
          initial_substructure: action.initial_substructure
        });
      
      case 'read_for_context':
        const contextData = readForContext(action.paths || [action.path]);
        return { 
          success: true, 
          action: 'read_for_context',
          context: contextData 
        };
      
      default:
        return { 
          success: false, 
          action: action.action,
          error: `Unknown action: ${action.action}` 
        };
    }
  } catch (error) {
    return {
      success: false,
      action: action.action,
      error: error.message
    };
  }
}

// =============================================================================
// SUMMARY GENERATION
// =============================================================================

function generateSummary(results, resultsDir) {
  const totalTurns = results.turns.length;
  const successfulTurns = results.turns.filter(t => !t.error).length;
  const avgLatency = results.turns
    .filter(t => t.latency)
    .reduce((sum, t) => sum + t.latency, 0) / successfulTurns;
  
  const areaOperations = results.area_operations;
  const successfulOps = areaOperations.filter(op => op.success).length;
  
  const operationsByType = {};
  for (const op of areaOperations) {
    operationsByType[op.action] = (operationsByType[op.action] || 0) + 1;
  }
  
  let summary = `# Life Areas Benchmark Results\n\n`;
  summary += `**Scenario**: ${results.scenario_name}\n`;
  summary += `**Model**: ${results.model}\n`;
  summary += `**Date**: ${results.timestamp}\n\n`;
  summary += `---\n\n`;
  summary += `## Summary\n\n`;
  summary += `- **Successful Turns**: ${successfulTurns}/${totalTurns} (${Math.round(successfulTurns/totalTurns*100)}%)\n`;
  summary += `- **Average Latency**: ${Math.round(avgLatency)}ms\n`;
  summary += `- **Area Operations**: ${areaOperations.length} (${successfulOps} successful)\n\n`;
  summary += `### Operations by Type\n\n`;
  
  for (const [type, count] of Object.entries(operationsByType)) {
    summary += `- **${type}**: ${count}\n`;
  }
  
  summary += `\n---\n\n`;
  summary += `## Final Area Structure\n\n`;
  summary += `\`\`\`\n${results.final_structure.tree}\`\`\`\n\n`;
  summary += `**Life Areas Directory**: \`${results.final_structure.life_areas_dir}\`\n\n`;
  summary += `---\n\n`;
  summary += `## Turn-by-Turn Results\n\n`;
  
  for (const turn of results.turns) {
    summary += `### Turn ${turn.turn}\n\n`;
    summary += `**User**: ${turn.user_input}\n\n`;
    
    if (turn.error) {
      summary += `❌ **Error**: ${turn.error}\n\n`;
    } else {
      summary += `**AI**: ${turn.model_response.user_response.spoken_text}\n\n`;
      summary += `**Latency**: ${turn.latency}ms\n\n`;
      
      if (turn.area_results && turn.area_results.length > 0) {
        summary += `**Area Actions**:\n`;
        for (const result of turn.area_results) {
          summary += `- ${result.success ? '✅' : '❌'} ${result.action}`;
          if (result.area_path) summary += ` → \`${result.area_path}\``;
          if (result.error) summary += ` (${result.error})`;
          summary += `\n`;
        }
        summary += `\n`;
      }
      
      if (turn.model_response.proactive_bubbles && turn.model_response.proactive_bubbles.length > 0) {
        summary += `**Bubbles**: ${turn.model_response.proactive_bubbles.map(b => `"${b.text}"`).join(', ')}\n\n`;
      }
    }
  }
  
  const summaryPath = path.join(resultsDir, 'SUMMARY.md');
  fs.writeFileSync(summaryPath, summary, 'utf8');
  console.log(`📄 Summary saved: ${summaryPath}\n`);
}

// =============================================================================
// CLI
// =============================================================================

const args = process.argv.slice(2);
const scenarioArg = args.find(arg => arg.startsWith('--scenario='));

if (!scenarioArg) {
  console.error('Usage: node life-areas-runner.js --scenario=<scenario_name>');
  console.error('Example: node life-areas-runner.js --scenario=life_areas_emma_reading');
  process.exit(1);
}

const scenarioName = scenarioArg.split('=')[1];

runLifeAreasTest(scenarioName)
  .then(() => {
    console.log('✅ Benchmark complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  });
