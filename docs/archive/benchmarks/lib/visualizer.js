#!/usr/bin/env node

/**
 * visualizer.js
 * 
 * Generates HTML visualizations of benchmark run results.
 * Shows conversation flow with:
 * - User message bubbles (left, blue)
 * - AI response bubbles (right, green)
 * - Internal notes (expandable, gray)
 * - Artifact panels (shows current state, diffs)
 * - Metrics summary
 * 
 * Usage:
 *   node visualizer.js --run results/gemini-2.0-flash-lite_personal_goals_001_20260119/
 *   node visualizer.js --all    # Generate for all runs
 * 
 * Created: January 19, 2026
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const VISUALIZATIONS_DIR = path.join(__dirname, '..', 'visualizations');

// =============================================================================
// HTML TEMPLATE
// =============================================================================

function generateHTML(results) {
  const { run_id, scenario_id, model_display_name, turns, artifacts, metrics } = results;
  
  // Generate turn HTML
  const turnsHTML = turns.map(turn => {
    const response = turn.model_response;
    const hasArtifact = response?.artifact_action?.action !== 'none';
    const artifactHTML = hasArtifact ? generateArtifactHTML(turn) : '';
    const notesHTML = response?.internal_notes ? generateNotesHTML(response.internal_notes) : '';
    
    return `
      <div class="turn" data-turn-id="${turn.turn_id}">
        <div class="turn-header">Turn ${turn.turn_id}</div>
        
        <!-- User Message -->
        <div class="message user-message">
          <div class="message-label">User</div>
          <div class="message-bubble user-bubble">
            ${escapeHTML(turn.user_input)}
          </div>
        </div>
        
        <!-- AI Response -->
        <div class="message ai-message">
          <div class="message-label">Bubble AI <span class="latency">${turn.latency_ms}ms</span></div>
          <div class="message-bubble ai-bubble ${!turn.validation.valid ? 'invalid' : ''}">
            ${response?.user_response?.text ? escapeHTML(response.user_response.text) : '<em class="error">Parse error</em>'}
            ${response?.user_response?.tone ? `<span class="tone-badge">${response.user_response.tone}</span>` : ''}
          </div>
        </div>
        
        ${notesHTML}
        ${artifactHTML}
        
        <!-- Expected vs Actual -->
        <details class="expected-section">
          <summary>Expected Behavior</summary>
          <pre>${JSON.stringify(turn.expected_behavior, null, 2)}</pre>
        </details>
        
        ${!turn.validation.valid ? `
          <div class="validation-errors">
            <strong>Validation Errors:</strong> ${turn.validation.errors.join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('\n');
  
  // Generate final artifacts summary
  const artifactsSummaryHTML = Object.entries(artifacts).map(([id, artifact]) => {
    const latestVersion = artifact.versions[artifact.versions.length - 1];
    return `
      <div class="artifact-summary">
        <h4>${id} (${artifact.type})</h4>
        <pre>${JSON.stringify(latestVersion.data, null, 2)}</pre>
        <div class="version-count">${artifact.versions.length} version(s)</div>
      </div>
    `;
  }).join('\n');
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Benchmark: ${scenario_id} - ${model_display_name}</title>
  <style>
    :root {
      --bg-dark: #0d1117;
      --bg-card: #161b22;
      --bg-card-hover: #21262d;
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --accent-blue: #58a6ff;
      --accent-green: #3fb950;
      --accent-yellow: #d29922;
      --accent-red: #f85149;
      --border-color: #30363d;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg-dark);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid var(--border-color);
    }
    
    header h1 {
      font-size: 1.5rem;
      margin-bottom: 8px;
    }
    
    header .meta {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    
    .metrics-bar {
      display: flex;
      gap: 24px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    
    .metric {
      background: var(--bg-dark);
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }
    
    .metric-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: var(--accent-green);
    }
    
    .metric-label {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    .conversation {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    
    .turn {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border-color);
    }
    
    .turn-header {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .message {
      margin-bottom: 16px;
    }
    
    .message-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .latency {
      background: var(--bg-dark);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
    }
    
    .message-bubble {
      padding: 12px 16px;
      border-radius: 12px;
      max-width: 85%;
      position: relative;
    }
    
    .user-bubble {
      background: var(--accent-blue);
      color: white;
      margin-right: auto;
    }
    
    .ai-bubble {
      background: #1a3d2e;
      border: 1px solid var(--accent-green);
      margin-left: auto;
    }
    
    .ai-bubble.invalid {
      background: #3d1a1a;
      border-color: var(--accent-red);
    }
    
    .tone-badge {
      display: inline-block;
      background: var(--bg-dark);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      margin-left: 8px;
      color: var(--text-secondary);
    }
    
    .notes-section {
      background: var(--bg-dark);
      border-radius: 8px;
      padding: 12px 16px;
      margin: 12px 0;
      border-left: 3px solid var(--text-secondary);
    }
    
    .notes-section summary {
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 0.8rem;
    }
    
    .notes-content {
      margin-top: 8px;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    
    .notes-content strong {
      color: var(--text-primary);
    }
    
    .artifact-section {
      background: linear-gradient(135deg, #1a2a3a 0%, #1a3a2a 100%);
      border-radius: 8px;
      padding: 16px;
      margin: 12px 0;
      border: 1px solid var(--accent-green);
    }
    
    .artifact-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .artifact-badge {
      background: var(--accent-green);
      color: var(--bg-dark);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .artifact-type {
      color: var(--text-secondary);
      font-size: 0.8rem;
    }
    
    .artifact-data {
      background: var(--bg-dark);
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
    }
    
    .artifact-data pre {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8rem;
      margin: 0;
      white-space: pre-wrap;
    }
    
    .diff-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed var(--border-color);
    }
    
    .diff-section h5 {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    
    .diff-change {
      font-size: 0.8rem;
      padding: 4px 8px;
      background: var(--bg-dark);
      border-radius: 4px;
      margin-bottom: 4px;
    }
    
    .diff-key {
      color: var(--accent-yellow);
    }
    
    .expected-section {
      margin-top: 12px;
      font-size: 0.8rem;
    }
    
    .expected-section summary {
      cursor: pointer;
      color: var(--text-secondary);
    }
    
    .expected-section pre {
      background: var(--bg-dark);
      padding: 12px;
      border-radius: 6px;
      margin-top: 8px;
      overflow-x: auto;
      font-size: 0.75rem;
    }
    
    .validation-errors {
      background: #3d1a1a;
      border: 1px solid var(--accent-red);
      border-radius: 8px;
      padding: 12px;
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--accent-red);
    }
    
    .error {
      color: var(--accent-red);
    }
    
    .artifacts-final {
      background: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
      border: 1px solid var(--border-color);
    }
    
    .artifacts-final h2 {
      margin-bottom: 16px;
    }
    
    .artifact-summary {
      background: var(--bg-dark);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    
    .artifact-summary h4 {
      color: var(--accent-green);
      margin-bottom: 8px;
    }
    
    .artifact-summary pre {
      font-size: 0.8rem;
      overflow-x: auto;
    }
    
    .version-count {
      margin-top: 8px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🫧 ${escapeHTML(scenario_id)}</h1>
      <div class="meta">
        Model: <strong>${escapeHTML(model_display_name)}</strong> | 
        Run ID: ${escapeHTML(run_id)}
      </div>
      
      <div class="metrics-bar">
        <div class="metric">
          <div class="metric-value">${metrics.json_valid_count}/${turns.length}</div>
          <div class="metric-label">Valid Responses</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.avg_latency_ms.toFixed(0)}ms</div>
          <div class="metric-label">Avg Latency</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.artifact_creates}</div>
          <div class="metric-label">Artifacts Created</div>
        </div>
        <div class="metric">
          <div class="metric-value">${metrics.artifact_updates}</div>
          <div class="metric-label">Artifact Updates</div>
        </div>
      </div>
    </header>
    
    <div class="conversation">
      ${turnsHTML}
    </div>
    
    ${Object.keys(artifacts).length > 0 ? `
      <div class="artifacts-final">
        <h2>📦 Final Artifacts</h2>
        ${artifactsSummaryHTML}
      </div>
    ` : ''}
  </div>
</body>
</html>
  `;
}

function generateNotesHTML(notes) {
  return `
    <details class="notes-section">
      <summary>🧠 Internal Notes (hidden from user)</summary>
      <div class="notes-content">
        ${notes.observations ? `<div><strong>Observations:</strong> ${escapeHTML(notes.observations)}</div>` : ''}
        ${notes.context_updates ? `<div><strong>Context Updates:</strong> ${escapeHTML(notes.context_updates)}</div>` : ''}
        ${notes.reasoning ? `<div><strong>Reasoning:</strong> ${escapeHTML(notes.reasoning)}</div>` : ''}
      </div>
    </details>
  `;
}

function generateArtifactHTML(turn) {
  const action = turn.model_response?.artifact_action;
  if (!action || action.action === 'none') return '';
  
  const actionLabel = action.action === 'create' ? 'CREATED' : 'UPDATED';
  
  let diffHTML = '';
  if (turn.artifact_diff && turn.artifact_diff.changes) {
    diffHTML = `
      <div class="diff-section">
        <h5>Changes</h5>
        ${turn.artifact_diff.changes.map(c => `
          <div class="diff-change">
            <span class="diff-key">${c.key}:</span> 
            ${c.before !== undefined ? `<del>${JSON.stringify(c.before)}</del> → ` : ''}
            <ins>${JSON.stringify(c.after)}</ins>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Handle potentially undefined data
  const dataDisplay = action.data ? JSON.stringify(action.data, null, 2) : 
    (turn.model_response_raw?.artifact?.data ? JSON.stringify(turn.model_response_raw.artifact.data, null, 2) : 'No data captured');
  
  return `
    <div class="artifact-section">
      <div class="artifact-header">
        <span class="artifact-badge">${actionLabel}</span>
        <span class="artifact-type">${action.artifact_type || 'unknown'} • ${action.artifact_id || 'auto'}</span>
      </div>
      <div class="artifact-data">
        <pre>${dataDisplay}</pre>
      </div>
      ${diffHTML}
    </div>
  `;
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// MAIN
// =============================================================================

function generateVisualization(runDir) {
  const resultsPath = path.join(runDir, 'results.json');
  
  if (!fs.existsSync(resultsPath)) {
    console.error(`Results not found: ${resultsPath}`);
    return null;
  }
  
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const html = generateHTML(results);
  
  // Ensure visualizations dir exists
  fs.mkdirSync(VISUALIZATIONS_DIR, { recursive: true });
  
  const outputPath = path.join(VISUALIZATIONS_DIR, `${results.run_id}.html`);
  fs.writeFileSync(outputPath, html);
  
  console.log(`Generated: ${outputPath}`);
  return outputPath;
}

async function main() {
  const args = process.argv.slice(2);
  
  let runDir = null;
  let generateAll = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' && args[i + 1]) {
      runDir = args[++i];
    } else if (args[i] === '--all') {
      generateAll = true;
    } else if (args[i] === '--help') {
      console.log(`
BubbleVoice Benchmark Visualizer

Usage:
  node visualizer.js --run <path>   Generate HTML for a specific run
  node visualizer.js --all          Generate HTML for all runs in results/

Output goes to visualizations/ folder.
      `);
      return;
    }
  }
  
  if (generateAll) {
    const runs = fs.readdirSync(RESULTS_DIR).filter(f => {
      const stat = fs.statSync(path.join(RESULTS_DIR, f));
      return stat.isDirectory();
    });
    
    console.log(`Generating visualizations for ${runs.length} runs...`);
    
    for (const run of runs) {
      generateVisualization(path.join(RESULTS_DIR, run));
    }
    
  } else if (runDir) {
    generateVisualization(runDir);
    
  } else {
    console.log('Please specify --run <path> or --all. Run with --help for usage.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
