#!/usr/bin/env node

/**
 * runner.js
 * 
 * Benchmark runner for BubbleVoice artifact generation tests.
 * Executes conversation scenarios against AI models and captures:
 * - Model responses at each turn
 * - Artifacts created/updated
 * - Internal notes generated
 * - Latency metrics
 * - Diffs between artifact versions
 * 
 * Usage:
 *   node runner.js --scenario personal_goals_exercise --model gemini-2.0-flash-lite
 *   node runner.js --all
 *   node runner.js --model gpt-4o-mini --all-scenarios
 * 
 * Created: January 19, 2026
 */

const fs = require('fs');
const path = require('path');
const { MODELS, getApiKey, getModel } = require('./models');
const { scoreScenario, generateReport } = require('./scorer');
const { 
  SCHEMA_HTML_OFF, 
  SCHEMA_HTML_ON, 
  getSchemaForTurn, 
  shouldGenerateHTML,
  getSystemPromptWithToggle
} = require('./html-toggle-system');

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Load a scenario JSON file
 */
function loadScenario(scenarioId) {
  const files = fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
  const file = files.find(f => f.includes(scenarioId) || f.replace('.json', '') === scenarioId);
  
  if (!file) {
    throw new Error(`Scenario not found: ${scenarioId}. Available: ${files.join(', ')}`);
  }
  
  const content = fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8');
  return JSON.parse(content);
}

/**
 * List all available scenarios
 */
function listScenarios() {
  return fs.readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Make an API call to a model
 */
async function callModel(modelConfig, messages) {
  const apiKey = getApiKey(modelConfig.provider);
  
  if (!apiKey) {
    throw new Error(`Missing API key for ${modelConfig.provider}. Set ${modelConfig.provider.toUpperCase()}_API_KEY env var.`);
  }
  
  const request = modelConfig.buildRequest(messages, apiKey);
  
  const startTime = Date.now();
  
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  
  const latencyMs = Date.now() - startTime;
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  const parsed = modelConfig.parseResponse(data);
  
  return {
    raw_response: data,
    parsed,
    latency_ms: latencyMs
  };
}

/**
 * Compute a simple diff between two objects
 */
function computeDiff(before, after) {
  if (!before) return { type: 'created', data: after };
  if (!after) return { type: 'deleted', data: before };
  
  const changes = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
  for (const key of allKeys) {
    const beforeVal = JSON.stringify(before[key]);
    const afterVal = JSON.stringify(after[key]);
    
    if (beforeVal !== afterVal) {
      changes.push({
        key,
        before: before[key],
        after: after[key]
      });
    }
  }
  
  return { type: 'modified', changes };
}

/**
 * Normalize response to expected schema format
 * Models may return slightly different structures, this normalizes them
 */
function normalizeResponse(response) {
  if (!response) return null;
  
  const normalized = {};
  
  // Normalize user_response
  // May be: { user_response: { text, tone } } OR { response: "text" } OR { response: { text, tone } }
  const userResp = response.user_response || response.response;
  if (userResp) {
    if (typeof userResp === 'string') {
      // Model returned response as plain string
      normalized.user_response = {
        text: userResp,
        tone: 'neutral'
      };
    } else {
      // Model returned response as object
      normalized.user_response = {
        text: userResp.text || userResp.message || '',
        tone: userResp.tone || userResp.emotion_tone || userResp.emotional_tone || 'neutral'
      };
    }
  }
  
  // Normalize internal_notes
  const notes = response.internal_notes || response.notes || response.private_notes;
  if (notes) {
    // Notes might be an object with various structures
    let observations = '';
    if (typeof notes === 'string') {
      observations = notes;
    } else if (notes.observations) {
      observations = notes.observations;
    } else if (notes.user_state) {
      observations = `User state: ${notes.user_state}`;
    } else if (notes.user_concerns) {
      observations = `Concerns: ${JSON.stringify(notes.user_concerns)}`;
    } else {
      observations = JSON.stringify(notes);
    }
    
    normalized.internal_notes = {
      observations: observations,
      context_updates: notes.context_updates || (notes.user_goals ? JSON.stringify(notes.user_goals) : ''),
      reasoning: notes.reasoning || ''
    };
  } else {
    normalized.internal_notes = { observations: '[none captured]' };
  }
  
  // Normalize artifact_action
  // May be: { artifact_action: { action, data } } OR { artifact_action: "none" } OR { artifact: { data } }
  const artifact = response.artifact_action || response.artifact;
  if (artifact) {
    if (typeof artifact === 'string') {
      // Model returned artifact_action as plain string like "none"
      normalized.artifact_action = {
        action: artifact,
        artifact_id: undefined,
        artifact_type: undefined,
        data: undefined
      };
    } else {
      // Model returned artifact as object
      let action = artifact.action || 'none';
      if (!artifact.action && (artifact.data || artifact.data_json || artifact.artifact_type)) {
        action = 'create'; // Has data but no action specified = create
      }
      
      // Parse data_json if it's a string (Claude/Gemini may use this)
      let data = artifact.data;
      if (artifact.data_json && typeof artifact.data_json === 'string') {
        try {
          data = JSON.parse(artifact.data_json);
        } catch (e) {
          console.error('Failed to parse data_json:', e.message);
          data = artifact.data_json; // Keep as string if parse fails
        }
      }
      
      normalized.artifact_action = {
        action: action,
        modification_type: artifact.modification_type || undefined,
        artifact_id: artifact.artifact_id || artifact.id || (action !== 'none' ? 'auto_' + Date.now() : undefined),
        artifact_type: artifact.artifact_type || artifact.type,
        data: data,
        html: artifact.html || undefined,
        reasoning: artifact.reasoning || undefined
      };
    }
  } else {
    normalized.artifact_action = { action: 'none' };
  }
  
  return normalized;
}

/**
 * Validate that a response matches the expected schema
 */
function validateResponse(response) {
  const errors = [];
  
  // First normalize the response
  const normalized = normalizeResponse(response);
  
  if (!normalized) {
    return { valid: false, errors: ['Response is null or undefined'], normalized: null };
  }
  
  if (!normalized.user_response) {
    errors.push('Missing user_response');
  } else {
    if (!normalized.user_response.text) errors.push('Missing user_response.text');
  }
  
  if (!normalized.internal_notes) {
    errors.push('Missing internal_notes');
  }
  
  if (!normalized.artifact_action) {
    errors.push('Missing artifact_action');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

// =============================================================================
// MAIN RUNNER
// =============================================================================

/**
 * Run a single scenario against a model
 */
async function runScenario(scenarioId, modelId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${scenarioId} with ${modelId}`);
  console.log('='.repeat(60));
  
  const scenario = loadScenario(scenarioId);
  const model = getModel(modelId);
  
  if (!model) {
    throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(MODELS).join(', ')}`);
  }
  
  // Initialize run state
  const runId = `${modelId}_${scenarioId}_${Date.now()}`;
  const runDir = path.join(RESULTS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  
  const results = {
    run_id: runId,
    scenario_id: scenarioId,
    model_id: modelId,
    model_display_name: model.display_name,
    started_at: new Date().toISOString(),
    turns: [],
    artifacts: {},
    metrics: {
      total_latency_ms: 0,
      avg_latency_ms: 0,
      json_valid_count: 0,
      json_invalid_count: 0,
      artifact_creates: 0,
      artifact_updates: 0
    }
  };
  
  // Build conversation history (for multi-turn context)
  const messages = [];
  
  // Run each turn
  for (const turn of scenario.turns) {
    console.log(`\n--- Turn ${turn.turn_id} ---`);
    console.log(`User: "${turn.user_says}"`);
    
    // Add user message to history
    messages.push({
      role: 'user',
      content: turn.user_says
    });
    
    // Call model
    let response, latency, parseError;
    try {
      const result = await callModel(model, messages);
      response = result.parsed;
      latency = result.latency_ms;
      console.log(`Latency: ${latency}ms`);
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
      parseError = err.message;
      latency = 0;
    }
    
    // Validate and normalize response
    const validation = response ? validateResponse(response) : { valid: false, errors: ['Parse failed'], normalized: null };
    const normalizedResponse = validation.normalized;
    
    if (!validation.valid) {
      console.log(`Validation errors: ${validation.errors.join(', ')}`);
    } else {
      console.log(`AI: "${normalizedResponse?.user_response?.text?.substring(0, 100)}..."`);
      console.log(`Tone: ${normalizedResponse?.user_response?.tone || 'unknown'}`);
      console.log(`Notes: ${normalizedResponse?.internal_notes?.observations?.substring(0, 80) || '[none]'}`);
      console.log(`Artifact: ${normalizedResponse?.artifact_action?.action || 'none'}`);
    }
    
    // Track artifact changes using normalized response
    let artifactDiff = null;
    if (normalizedResponse?.artifact_action?.action === 'create') {
      const artifactId = normalizedResponse.artifact_action.artifact_id || `artifact_${turn.turn_id}`;
      results.artifacts[artifactId] = {
        type: normalizedResponse.artifact_action.artifact_type,
        versions: [{
          version: 1,
          turn_id: turn.turn_id,
          data: normalizedResponse.artifact_action.data
        }]
      };
      artifactDiff = computeDiff(null, normalizedResponse.artifact_action.data);
      results.metrics.artifact_creates++;
      console.log(`  → Created artifact: ${artifactId} (${normalizedResponse.artifact_action.artifact_type})`);
      
    } else if (normalizedResponse?.artifact_action?.action === 'update') {
      const artifactId = normalizedResponse.artifact_action.artifact_id;
      if (results.artifacts[artifactId]) {
        const currentVersion = results.artifacts[artifactId].versions.length;
        const previousData = results.artifacts[artifactId].versions[currentVersion - 1].data;
        
        results.artifacts[artifactId].versions.push({
          version: currentVersion + 1,
          turn_id: turn.turn_id,
          data: normalizedResponse.artifact_action.data
        });
        
        artifactDiff = computeDiff(previousData, normalizedResponse.artifact_action.data);
        results.metrics.artifact_updates++;
        console.log(`  → Updated artifact: ${artifactId}`);
      }
    }
    
    // Record turn results (store both raw and normalized)
    results.turns.push({
      turn_id: turn.turn_id,
      user_input: turn.user_says,
      expected_behavior: turn.expected_behavior,
      model_response_raw: response,
      model_response: normalizedResponse,
      latency_ms: latency,
      validation: { valid: validation.valid, errors: validation.errors },
      artifact_diff: artifactDiff,
      parse_error: parseError
    });
    
    // Update metrics
    results.metrics.total_latency_ms += latency;
    if (validation.valid) {
      results.metrics.json_valid_count++;
    } else {
      results.metrics.json_invalid_count++;
    }
    
    // Add assistant response to history for next turn (use raw response to preserve model's format)
    if (response) {
      messages.push({
        role: 'assistant',
        content: JSON.stringify(response)
      });
    }
    
    // Small delay between turns to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Finalize metrics
  results.metrics.avg_latency_ms = results.metrics.total_latency_ms / scenario.turns.length;
  results.completed_at = new Date().toISOString();
  
  // Score the scenario (if it has expected behaviors)
  let scores = null;
  let report = null;
  if (scenario.turns && scenario.turns.some(t => t.expected_behavior)) {
    scores = scoreScenario(results, scenario);
    results.scores = scores;
    report = generateReport(modelId, scenario, results, scores);
    
    // Save report
    const reportPath = path.join(runDir, 'report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);
  }
  
  // Save results
  const resultsPath = path.join(runDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${resultsPath}`);
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total turns: ${scenario.turns.length}`);
  console.log(`Valid responses: ${results.metrics.json_valid_count}/${scenario.turns.length}`);
  console.log(`Avg latency: ${results.metrics.avg_latency_ms.toFixed(0)}ms`);
  console.log(`Artifacts created: ${results.metrics.artifact_creates}`);
  console.log(`Artifacts updated: ${results.metrics.artifact_updates}`);
  
  if (scores) {
    console.log(`\nARTIFACT INTELLIGENCE SCORE: ${scores.percentage}% (${scores.total_points}/${scores.max_points})`);
    console.log('\nCapability Breakdown:');
    Object.entries(scores.summary).forEach(([capability, stats]) => {
      if (stats.total > 0) {
        const pct = Math.round((stats.passed / stats.total) * 100);
        const status = pct === 100 ? '✅' : pct >= 50 ? '⚠️' : '❌';
        console.log(`  ${status} ${capability}: ${stats.passed}/${stats.total} (${pct}%)`);
      }
    });
  }
  
  // Print full report if available
  if (report) {
    console.log('\n');
    console.log(report);
  }
  
  return results;
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let scenario = null;
  let modelId = null;
  let runAll = false;
  let allScenarios = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      scenario = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      modelId = args[++i];
    } else if (args[i] === '--all') {
      runAll = true;
    } else if (args[i] === '--all-scenarios') {
      allScenarios = true;
    } else if (args[i] === '--list-models') {
      console.log('Available models:');
      Object.entries(MODELS).forEach(([id, m]) => {
        console.log(`  ${id} (${m.display_name}) - $${m.cost_per_1m_input}/$${m.cost_per_1m_output} per 1M tokens`);
      });
      return;
    } else if (args[i] === '--list-scenarios') {
      console.log('Available scenarios:');
      listScenarios().forEach(s => console.log(`  ${s}`));
      return;
    } else if (args[i] === '--help') {
      console.log(`
BubbleVoice Benchmark Runner

Usage:
  node runner.js --scenario <id> --model <id>   Run one scenario with one model
  node runner.js --all                          Run all scenarios with all models
  node runner.js --model <id> --all-scenarios   Run all scenarios with one model
  node runner.js --list-models                  List available models
  node runner.js --list-scenarios               List available scenarios

Environment Variables:
  GOOGLE_API_KEY      For Gemini models
  OPENAI_API_KEY      For GPT models
  ANTHROPIC_API_KEY   For Claude models
      `);
      return;
    }
  }
  
  // Run based on arguments
  if (runAll) {
    // Run all scenarios with all models
    const scenarios = listScenarios();
    const models = Object.keys(MODELS);
    
    for (const s of scenarios) {
      for (const m of models) {
        try {
          await runScenario(s, m);
        } catch (err) {
          console.error(`Failed: ${s} with ${m}: ${err.message}`);
        }
      }
    }
    
  } else if (allScenarios && modelId) {
    // Run all scenarios with one model
    const scenarios = listScenarios();
    
    for (const s of scenarios) {
      try {
        await runScenario(s, modelId);
      } catch (err) {
        console.error(`Failed: ${s} with ${modelId}: ${err.message}`);
      }
    }
    
  } else if (scenario && modelId) {
    // Run one scenario with one model
    await runScenario(scenario, modelId);
    
  } else {
    console.log('Please specify --scenario and --model, or use --all. Run with --help for usage.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
