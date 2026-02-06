#!/usr/bin/env node

/**
 * toggle-runner.js
 * 
 * Benchmark runner with HTML toggle system.
 * AI controls when to generate HTML vs just structured data.
 * 
 * Usage:
 *   node toggle-runner.js --scenario html_toggle_test --model gemini-2.5-flash-lite
 */

const fs = require('fs');
const path = require('path');
const { 
  SCHEMA_HTML_OFF, 
  SCHEMA_HTML_ON, 
  getSystemPromptWithToggle,
  shouldGenerateHTML
} = require('./html-toggle-system');

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Base system prompt (from enhanced-emotional-prompt.js)
const BASE_SYSTEM_PROMPT = require('./enhanced-emotional-prompt');

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

function buildGeminiRequest(messages, apiKey, useHTMLSchema) {
  const schema = useHTMLSchema ? SCHEMA_HTML_ON : SCHEMA_HTML_OFF;
  const systemPrompt = getSystemPromptWithToggle(BASE_SYSTEM_PROMPT);
  
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      })),
      systemInstruction: { 
        parts: [{ text: systemPrompt }] 
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseSchema: schema
      }
    })
  };
}

// =============================================================================
// RUNNER
// =============================================================================

async function runToggleTest(scenarioId, modelName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${scenarioId} with ${modelName}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Load scenario
  const scenarioPath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
  
  // Get API key
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set');
  }
  
  // Track conversation
  const messages = [];
  const results = {
    scenario: scenarioId,
    model: modelName,
    turns: [],
    stats: {
      total_turns: scenario.conversation_steps.length,
      html_on_count: 0,
      html_off_count: 0,
      avg_latency_html_off: 0,
      avg_latency_html_on: 0
    }
  };
  
  let previousResponse = null;
  
  // Run each turn
  for (let i = 0; i < scenario.conversation_steps.length; i++) {
    const step = scenario.conversation_steps[i];
    console.log(`\n--- Turn ${i + 1} ---`);
    console.log(`User: "${step.user_input.substring(0, 60)}..."`);
    
    // Add user message
    messages.push({
      role: 'user',
      content: step.user_input
    });
    
    // Determine which schema to use based on previous response
    // If previous response toggled HTML ON, use HTML schema this turn
    const useHTMLSchema = previousResponse && shouldGenerateHTML(previousResponse);
    
    console.log(`Schema: ${useHTMLSchema ? 'HTML_ON' : 'HTML_OFF'} (${useHTMLSchema ? 'visual mode' : 'fast mode'})`);
    
    // Build request
    const request = buildGeminiRequest(messages, apiKey, useHTMLSchema);
    
    // Call API
    const startTime = Date.now();
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Parse response
      const modelResponse = data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(modelResponse);
      
      // Track stats
      const htmlToggled = parsed.html_toggle?.generate_html === true;
      if (htmlToggled) {
        results.stats.html_on_count++;
      } else {
        results.stats.html_off_count++;
      }
      
      // Display results
      console.log(`Latency: ${latency}ms`);
      console.log(`AI: "${parsed.user_response.text.substring(0, 80)}..."`);
      console.log(`Tone: ${parsed.user_response.tone}`);
      console.log(`HTML Toggle: ${htmlToggled ? '🎨 ON' : '⚡ OFF (fast)'}`);
      if (htmlToggled) {
        console.log(`  Reason: ${parsed.html_toggle.reason}`);
      }
      console.log(`Artifact: ${parsed.artifact_action.action}`);
      if (parsed.artifact_action.action !== 'none') {
        console.log(`  Type: ${parsed.artifact_action.artifact_type || 'N/A'}`);
        console.log(`  Has HTML: ${!!parsed.artifact_action.html}`);
        if (parsed.artifact_action.html) {
          console.log(`  HTML length: ${parsed.artifact_action.html.length} chars`);
        }
      }
      
      // Check expectations
      const expectedToggle = step.expected_html_toggle;
      const actualToggle = htmlToggled;
      const toggleMatch = expectedToggle === actualToggle;
      
      console.log(`\nExpected HTML: ${expectedToggle ? '🎨 ON' : '⚡ OFF'}`);
      console.log(`Actual HTML: ${actualToggle ? '🎨 ON' : '⚡ OFF'}`);
      console.log(`Match: ${toggleMatch ? '✅' : '❌'}`);
      
      // Save turn
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        expected_html_toggle: expectedToggle,
        actual_html_toggle: actualToggle,
        toggle_match: toggleMatch,
        latency,
        model_response: parsed,
        reasoning: step.reasoning
      });
      
      // Add assistant message for next turn
      messages.push({
        role: 'assistant',
        content: modelResponse
      });
      
      // Save for next iteration
      previousResponse = parsed;
      
    } catch (error) {
      console.error(`Error: ${error.message}`);
      results.turns.push({
        turn: i + 1,
        user_input: step.user_input,
        error: error.message
      });
    }
  }
  
  // Calculate stats
  const htmlOnTurns = results.turns.filter(t => t.actual_html_toggle === true);
  const htmlOffTurns = results.turns.filter(t => t.actual_html_toggle === false);
  
  results.stats.avg_latency_html_on = htmlOnTurns.length > 0
    ? Math.round(htmlOnTurns.reduce((sum, t) => sum + t.latency, 0) / htmlOnTurns.length)
    : 0;
    
  results.stats.avg_latency_html_off = htmlOffTurns.length > 0
    ? Math.round(htmlOffTurns.reduce((sum, t) => sum + t.latency, 0) / htmlOffTurns.length)
    : 0;
  
  const toggleMatches = results.turns.filter(t => t.toggle_match).length;
  const toggleAccuracy = Math.round((toggleMatches / results.turns.length) * 100);
  
  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total turns: ${results.turns.length}`);
  console.log(`HTML ON: ${results.stats.html_on_count} turns (avg ${results.stats.avg_latency_html_on}ms)`);
  console.log(`HTML OFF: ${results.stats.html_off_count} turns (avg ${results.stats.avg_latency_html_off}ms)`);
  console.log(`Toggle accuracy: ${toggleAccuracy}% (${toggleMatches}/${results.turns.length})`);
  console.log(`Latency savings: ${results.stats.avg_latency_html_on - results.stats.avg_latency_html_off}ms when HTML OFF`);
  
  // Save results
  const timestamp = Date.now();
  const resultDir = path.join(RESULTS_DIR, `${modelName}_${scenarioId}_${timestamp}`);
  fs.mkdirSync(resultDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(resultDir, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log(`\nResults saved to: ${resultDir}`);
  
  return results;
}

// =============================================================================
// CLI
// =============================================================================

const args = process.argv.slice(2);
const scenarioArg = args.find(a => a.startsWith('--scenario='));
const modelArg = args.find(a => a.startsWith('--model='));

const scenario = scenarioArg ? scenarioArg.split('=')[1] : 'html_toggle_test';
const model = modelArg ? modelArg.split('=')[1] : 'gemini-2.5-flash-lite';

runToggleTest(scenario, model)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
