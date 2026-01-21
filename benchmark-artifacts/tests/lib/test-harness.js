#!/usr/bin/env node

/**
 * test-harness.js
 * 
 * Main test runner that:
 * 1. Initializes shared knowledge base
 * 2. Runs scenarios through SIMPLE and FULL approaches
 * 3. Compares results
 * 4. Generates comparison report
 * 
 * Usage:
 *   node test-harness.js --scenario=01-basic-recall
 *   node test-harness.js --scenario=all
 *   node test-harness.js --approach=simple --scenario=01-basic-recall
 *   node test-harness.js --approach=full --scenario=all
 */

const fs = require('fs');
const path = require('path');
const { initializeKnowledgeBase, resetKnowledgeBase, getKnowledgeBasePath } = require('./knowledge-base-manager');
const { vectorSearchService } = require('./vector-search-real');
const { runSimple } = require('./simple-runner');
const { runFull, resetAiNotes } = require('./full-runner');

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCENARIOS_DIR = path.join(__dirname, '..', 'scenarios');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// =============================================================================
// LOAD SCENARIOS
// =============================================================================

function loadScenario(scenarioName) {
  const scenarioPath = path.join(SCENARIOS_DIR, `${scenarioName}.js`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${scenarioPath}`);
  }
  return require(scenarioPath);
}

function loadAllScenarios() {
  const files = fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.js'));
  return files.map(f => f.replace('.js', ''));
}

// =============================================================================
// RUN TESTS
// =============================================================================

async function runTest(scenarioName, approach) {
  console.log(`\n${'▓'.repeat(70)}`);
  console.log(`RUNNING: ${scenarioName} (${approach.toUpperCase()})`);
  console.log(`${'▓'.repeat(70)}`);
  
  const scenario = loadScenario(scenarioName);
  
  let results;
  if (approach === 'simple') {
    results = await runSimple(scenario);
  } else if (approach === 'full') {
    resetAiNotes(); // Fresh notes for each test
    results = await runFull(scenario);
  } else {
    throw new Error(`Unknown approach: ${approach}`);
  }
  
  return results;
}

async function runComparison(scenarioName) {
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`COMPARISON TEST: ${scenarioName}`);
  console.log(`Running both SIMPLE and FULL approaches...`);
  console.log(`${'█'.repeat(70)}`);
  
  // Reset knowledge base for fair comparison
  resetKnowledgeBase();
  
  // Run SIMPLE
  const simpleResults = await runTest(scenarioName, 'simple');
  
  // Reset knowledge base again
  resetKnowledgeBase();
  
  // Run FULL
  const fullResults = await runTest(scenarioName, 'full');
  
  // Compare
  const comparison = compareResults(simpleResults, fullResults);
  
  return {
    scenario: scenarioName,
    simple: simpleResults,
    full: fullResults,
    comparison
  };
}

// =============================================================================
// COMPARE RESULTS
// =============================================================================

function compareResults(simple, full) {
  return {
    latency: {
      simple_avg_ms: simple.metrics.avg_latency_ms,
      full_avg_ms: full.metrics.avg_latency_ms,
      difference_ms: full.metrics.avg_latency_ms - simple.metrics.avg_latency_ms,
      winner: simple.metrics.avg_latency_ms < full.metrics.avg_latency_ms ? 'SIMPLE' : 'FULL'
    },
    success_rate: {
      simple: `${simple.metrics.successful_turns}/${simple.metrics.total_turns}`,
      full: `${full.metrics.successful_turns}/${full.metrics.total_turns}`,
      winner: simple.metrics.successful_turns >= full.metrics.successful_turns ? 'TIE/SIMPLE' : 'FULL'
    },
    area_actions: {
      simple: simple.metrics.area_actions_taken,
      full: full.metrics.area_actions_taken,
      comment: full.metrics.area_actions_taken > simple.metrics.area_actions_taken 
        ? 'FULL took more actions (possibly more thorough)'
        : 'SIMPLE took same/more actions'
    },
    artifacts: {
      simple: simple.metrics.artifacts_generated,
      full: full.metrics.artifacts_generated
    },
    ai_notes: {
      simple: 'N/A (not supported)',
      full: full.metrics.ai_notes_generated || 0
    },
    vector_time: {
      simple_ms: simple.metrics.vector_search_time_ms,
      full_ms: full.metrics.vector_search_time_ms,
      comment: 'FULL uses multi-query (3x searches)'
    }
  };
}

// =============================================================================
// GENERATE REPORT
// =============================================================================

function generateReport(allResults) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(RESULTS_DIR, `test_run_${timestamp}`);
  fs.mkdirSync(reportDir, { recursive: true });
  
  // Save raw results
  fs.writeFileSync(
    path.join(reportDir, 'raw_results.json'),
    JSON.stringify(allResults, null, 2),
    'utf8'
  );
  
  // Generate markdown report
  let md = `# Test Results Report\n\n`;
  md += `**Generated**: ${new Date().toISOString()}\n\n`;
  md += `---\n\n`;
  
  // Summary table
  md += `## Summary\n\n`;
  md += `| Scenario | Simple Latency | Full Latency | Simple Success | Full Success | Notes |\n`;
  md += `|----------|----------------|--------------|----------------|--------------|-------|\n`;
  
  for (const result of allResults) {
    if (result.comparison) {
      md += `| ${result.scenario} `;
      md += `| ${result.comparison.latency.simple_avg_ms}ms `;
      md += `| ${result.comparison.latency.full_avg_ms}ms `;
      md += `| ${result.comparison.success_rate.simple} `;
      md += `| ${result.comparison.success_rate.full} `;
      md += `| ${result.comparison.ai_notes.full} AI notes |\n`;
    } else {
      md += `| ${result.scenario_name} `;
      md += `| ${result.approach === 'simple' ? result.metrics.avg_latency_ms + 'ms' : 'N/A'} `;
      md += `| ${result.approach === 'full' ? result.metrics.avg_latency_ms + 'ms' : 'N/A'} `;
      md += `| ${result.metrics.successful_turns}/${result.metrics.total_turns} `;
      md += `| - |\n`;
    }
  }
  
  md += `\n---\n\n`;
  
  // Detailed results per scenario
  md += `## Detailed Results\n\n`;
  
  for (const result of allResults) {
    if (result.comparison) {
      md += `### ${result.scenario}\n\n`;
      md += `#### Comparison\n\n`;
      md += `| Metric | SIMPLE | FULL | Winner |\n`;
      md += `|--------|--------|------|--------|\n`;
      md += `| Avg Latency | ${result.comparison.latency.simple_avg_ms}ms | ${result.comparison.latency.full_avg_ms}ms | ${result.comparison.latency.winner} |\n`;
      md += `| Success Rate | ${result.comparison.success_rate.simple} | ${result.comparison.success_rate.full} | ${result.comparison.success_rate.winner} |\n`;
      md += `| Area Actions | ${result.comparison.area_actions.simple} | ${result.comparison.area_actions.full} | - |\n`;
      md += `| Artifacts | ${result.comparison.artifacts.simple} | ${result.comparison.artifacts.full} | - |\n`;
      md += `| AI Notes | ${result.comparison.ai_notes.simple} | ${result.comparison.ai_notes.full} | FULL only |\n`;
      md += `\n`;
      
      // Turn-by-turn comparison
      md += `#### Turn-by-Turn\n\n`;
      const maxTurns = Math.max(result.simple.turns.length, result.full.turns.length);
      for (let i = 0; i < maxTurns; i++) {
        const simpleTurn = result.simple.turns[i];
        const fullTurn = result.full.turns[i];
        
        md += `**Turn ${i + 1}**: ${simpleTurn?.user_input || fullTurn?.user_input}\n\n`;
        md += `- SIMPLE: ${simpleTurn?.response?.user_response?.spoken_text?.substring(0, 100) || 'N/A'}...\n`;
        md += `- FULL: ${fullTurn?.response?.user_response?.spoken_text?.substring(0, 100) || 'N/A'}...\n`;
        if (fullTurn?.ai_notes?.content) {
          md += `- AI Notes: ${fullTurn.ai_notes.content.substring(0, 80)}...\n`;
        }
        md += `\n`;
      }
      md += `---\n\n`;
    }
  }
  
  // Write report
  fs.writeFileSync(path.join(reportDir, 'REPORT.md'), md, 'utf8');
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`REPORT GENERATED: ${reportDir}/REPORT.md`);
  console.log(`${'═'.repeat(70)}\n`);
  
  return reportDir;
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const scenarioArg = args.find(a => a.startsWith('--scenario='));
  const approachArg = args.find(a => a.startsWith('--approach='));
  
  const scenarioName = scenarioArg ? scenarioArg.split('=')[1] : 'all';
  const approach = approachArg ? approachArg.split('=')[1] : 'both';
  
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`BUBBLE VOICE TEST HARNESS`);
  console.log(`${'█'.repeat(70)}`);
  console.log(`Scenario: ${scenarioName}`);
  console.log(`Approach: ${approach}`);
  console.log(`${'─'.repeat(70)}\n`);
  
  // Initialize knowledge base
  console.log('📚 Initializing knowledge base...');
  initializeKnowledgeBase();
  
  // Initialize vector search with real embeddings
  console.log('🔧 Initializing vector search with embeddings...');
  const knowledgeBasePath = getKnowledgeBasePath();
  await vectorSearchService.indexKnowledgeBase(knowledgeBasePath);
  console.log('✅ Vector search ready!\n');
  
  // Create results directory
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  
  const allResults = [];
  
  // Determine which scenarios to run
  const scenarios = scenarioName === 'all' 
    ? loadAllScenarios() 
    : [scenarioName];
  
  // Run tests
  for (const scenario of scenarios) {
    try {
      if (approach === 'both') {
        const result = await runComparison(scenario);
        allResults.push(result);
      } else {
        resetKnowledgeBase();
        const result = await runTest(scenario, approach);
        allResults.push(result);
      }
    } catch (error) {
      console.error(`\n❌ Error running ${scenario}:`, error.message);
      allResults.push({
        scenario,
        error: error.message
      });
    }
  }
  
  // Generate report
  const reportDir = generateReport(allResults);
  
  // Print summary
  console.log('\n📊 TEST SUMMARY\n');
  for (const result of allResults) {
    if (result.error) {
      console.log(`❌ ${result.scenario}: ERROR - ${result.error}`);
    } else if (result.comparison) {
      console.log(`✅ ${result.scenario}:`);
      console.log(`   SIMPLE: ${result.comparison.latency.simple_avg_ms}ms avg, ${result.comparison.success_rate.simple} success`);
      console.log(`   FULL: ${result.comparison.latency.full_avg_ms}ms avg, ${result.comparison.success_rate.full} success, ${result.comparison.ai_notes.full} notes`);
    } else {
      console.log(`✅ ${result.scenario_name} (${result.approach}): ${result.metrics.avg_latency_ms}ms avg, ${result.metrics.successful_turns}/${result.metrics.total_turns} success`);
    }
  }
  
  console.log(`\n📁 Full results: ${reportDir}\n`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runTest,
  runComparison,
  generateReport
};
