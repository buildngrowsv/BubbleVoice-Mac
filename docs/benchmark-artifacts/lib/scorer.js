/**
 * scorer.js
 * 
 * Evaluates AI model performance on artifact intelligence tests.
 * Scores based on:
 * - Proactive creation (creates when helpful, not when not)
 * - Restraint (doesn't over-create)
 * - Modification precision (data-only, UI-only, both, overhaul)
 * - Preservation (leaves alone when appropriate)
 * - Timeliness (right moment in conversation)
 * 
 * Created: January 19, 2026
 */

/**
 * Score a single turn based on expected behavior
 * 
 * @param {Object} turn - The turn result from runner
 * @param {Object} expected - Expected behavior from scenario
 * @returns {Object} - Score breakdown with points and reasoning
 */
function scoreTurn(turn, expected) {
  const score = {
    points: 0,
    max_points: 0,
    breakdown: {},
    passed: false
  };

  if (!expected || !expected.expected_behavior) {
    return score;
  }

  const actual = turn.model_response?.artifact_action;
  const expectedBehavior = expected.expected_behavior;
  
  // Test Type: restraint (should NOT create artifact)
  if (expected.test_type === 'restraint' || expected.test_type === 'casual_no_artifact' || expected.test_type === 'no_change_needed' || expected.test_type === 'preservation') {
    score.max_points = 20;
    
    if (!actual || actual.action === 'none') {
      score.points = 20;
      score.breakdown.restraint = '✅ Correctly did NOT create/modify artifact';
      score.passed = true;
    } else {
      score.points = 0;
      score.breakdown.restraint = `❌ Should NOT have created artifact (got: ${actual.action})`;
      score.passed = false;
    }
  }
  
  // Test Type: proactive_creation (should CREATE without being asked)
  else if (expected.test_type === 'proactive_creation' || expected.test_type === 'complex_warrants_artifact') {
    score.max_points = 25;
    
    if (actual && actual.action === 'create') {
      score.points = 25;
      score.breakdown.proactive_creation = '✅ Proactively created artifact for complex problem';
      score.passed = true;
      
      // Bonus: Check artifact type appropriateness
      if (expectedBehavior.artifact_type && actual.artifact_type) {
        const expectedTypes = expectedBehavior.artifact_type.split('_or_');
        if (expectedTypes.some(t => actual.artifact_type.includes(t))) {
          score.breakdown.artifact_type = `✅ Appropriate type: ${actual.artifact_type}`;
        } else {
          score.breakdown.artifact_type = `⚠️ Type mismatch (expected: ${expectedBehavior.artifact_type}, got: ${actual.artifact_type})`;
        }
      }
    } else {
      score.points = 0;
      score.breakdown.proactive_creation = `❌ Should have proactively created artifact (got: ${actual?.action || 'none'})`;
      score.passed = false;
    }
  }
  
  // Test Type: data_only_update
  else if (expected.test_type === 'data_only_update' || expected.test_type === 'minor_data_addition') {
    score.max_points = 15;
    
    if (actual && actual.action === 'update') {
      if (actual.modification_type === 'data_only') {
        score.points = 15;
        score.breakdown.data_only = '✅ Correctly updated ONLY data, preserved UI';
        score.passed = true;
      } else if (actual.modification_type === 'data_and_ui') {
        score.points = 5;
        score.breakdown.data_only = '⚠️ Updated data but also changed UI (should be data-only)';
        score.passed = false;
      } else {
        score.points = 10;
        score.breakdown.data_only = `⚠️ Updated but didn't specify modification_type (got: ${actual.modification_type})`;
        score.passed = false;
      }
    } else {
      score.points = 0;
      score.breakdown.data_only = `❌ Should have updated data (got: ${actual?.action || 'none'})`;
      score.passed = false;
    }
  }
  
  // Test Type: ui_only_update
  else if (expected.test_type === 'ui_only_update') {
    score.max_points = 15;
    
    if (actual && actual.action === 'update') {
      if (actual.modification_type === 'ui_only') {
        score.points = 15;
        score.breakdown.ui_only = '✅ Correctly updated ONLY UI, preserved data';
        score.passed = true;
      } else if (actual.modification_type === 'data_and_ui') {
        score.points = 5;
        score.breakdown.ui_only = '⚠️ Updated UI but also changed data (should be UI-only)';
        score.passed = false;
      } else {
        score.points = 10;
        score.breakdown.ui_only = `⚠️ Updated but didn't specify modification_type (got: ${actual.modification_type})`;
        score.passed = false;
      }
    } else {
      score.points = 0;
      score.breakdown.ui_only = `❌ Should have updated UI (got: ${actual?.action || 'none'})`;
      score.passed = false;
    }
  }
  
  // Test Type: combined_update or major_context_shift
  else if (expected.test_type === 'combined_update' || expected.test_type === 'major_context_shift') {
    score.max_points = 10;
    
    if (actual && actual.action === 'update') {
      if (actual.modification_type === 'data_and_ui') {
        score.points = 10;
        score.breakdown.combined = '✅ Correctly updated both data and UI';
        score.passed = true;
      } else if (actual.modification_type === 'data_only' || actual.modification_type === 'ui_only') {
        score.points = 5;
        score.breakdown.combined = `⚠️ Updated but only changed ${actual.modification_type} (should be both)`;
        score.passed = false;
      } else {
        score.points = 7;
        score.breakdown.combined = `⚠️ Updated but didn't specify modification_type`;
        score.passed = false;
      }
    } else {
      score.points = 0;
      score.breakdown.combined = `❌ Should have updated both data and UI (got: ${actual?.action || 'none'})`;
      score.passed = false;
    }
  }
  
  // Test Type: complete_overhaul
  else if (expected.test_type === 'complete_overhaul') {
    score.max_points = 10;
    
    if (actual && actual.action === 'update') {
      if (actual.modification_type === 'complete_overhaul') {
        score.points = 10;
        score.breakdown.overhaul = '✅ Correctly performed complete overhaul';
        score.passed = true;
      } else {
        score.points = 5;
        score.breakdown.overhaul = `⚠️ Updated but not as complete overhaul (got: ${actual.modification_type})`;
        score.passed = false;
      }
    } else {
      score.points = 0;
      score.breakdown.overhaul = `❌ Should have performed complete overhaul (got: ${actual?.action || 'none'})`;
      score.passed = false;
    }
  }
  
  return score;
}

/**
 * Score an entire scenario run
 * 
 * @param {Object} result - Full result from runner
 * @param {Object} scenario - Original scenario with expected behaviors
 * @returns {Object} - Overall score with breakdown
 */
function scoreScenario(result, scenario) {
  const scores = {
    total_points: 0,
    max_points: 0,
    percentage: 0,
    turn_scores: [],
    summary: {}
  };

  // Score each turn
  scenario.turns.forEach((expectedTurn, idx) => {
    const actualTurn = result.turns[idx];
    if (!actualTurn) return;
    
    const turnScore = scoreTurn(actualTurn, expectedTurn);
    scores.turn_scores.push({
      turn_id: expectedTurn.turn_id,
      test_type: expectedTurn.test_type,
      ...turnScore
    });
    
    scores.total_points += turnScore.points;
    scores.max_points += turnScore.max_points;
  });

  // Calculate percentage
  scores.percentage = scores.max_points > 0 
    ? Math.round((scores.total_points / scores.max_points) * 100)
    : 0;

  // Summary by test type
  const testTypes = {
    restraint: { passed: 0, total: 0 },
    proactive_creation: { passed: 0, total: 0 },
    data_only: { passed: 0, total: 0 },
    ui_only: { passed: 0, total: 0 },
    combined: { passed: 0, total: 0 },
    overhaul: { passed: 0, total: 0 }
  };

  scores.turn_scores.forEach(ts => {
    const type = ts.test_type;
    if (type && type.includes('restraint') || type === 'casual_no_artifact' || type === 'no_change_needed' || type === 'preservation') {
      testTypes.restraint.total++;
      if (ts.passed) testTypes.restraint.passed++;
    } else if (type && (type === 'proactive_creation' || type === 'complex_warrants_artifact')) {
      testTypes.proactive_creation.total++;
      if (ts.passed) testTypes.proactive_creation.passed++;
    } else if (type && (type === 'data_only_update' || type === 'minor_data_addition')) {
      testTypes.data_only.total++;
      if (ts.passed) testTypes.data_only.passed++;
    } else if (type && type === 'ui_only_update') {
      testTypes.ui_only.total++;
      if (ts.passed) testTypes.ui_only.passed++;
    } else if (type && (type === 'combined_update' || type === 'major_context_shift')) {
      testTypes.combined.total++;
      if (ts.passed) testTypes.combined.passed++;
    } else if (type && type === 'complete_overhaul') {
      testTypes.overhaul.total++;
      if (ts.passed) testTypes.overhaul.passed++;
    }
  });

  scores.summary = testTypes;

  return scores;
}

/**
 * Generate a human-readable report
 */
function generateReport(modelId, scenario, result, scores) {
  const lines = [];
  
  lines.push('═'.repeat(80));
  lines.push(`ARTIFACT INTELLIGENCE TEST REPORT`);
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Model: ${modelId}`);
  lines.push(`Scenario: ${scenario.scenario_id}`);
  lines.push(`Overall Score: ${scores.total_points}/${scores.max_points} (${scores.percentage}%)`);
  lines.push('');
  
  // Summary by capability
  lines.push('CAPABILITY BREAKDOWN:');
  lines.push('─'.repeat(80));
  
  Object.entries(scores.summary).forEach(([capability, stats]) => {
    if (stats.total > 0) {
      const pct = Math.round((stats.passed / stats.total) * 100);
      const status = pct === 100 ? '✅' : pct >= 50 ? '⚠️' : '❌';
      lines.push(`${status} ${capability.toUpperCase().padEnd(25)} ${stats.passed}/${stats.total} (${pct}%)`);
    }
  });
  
  lines.push('');
  lines.push('TURN-BY-TURN ANALYSIS:');
  lines.push('─'.repeat(80));
  
  scores.turn_scores.forEach((ts, idx) => {
    const turn = scenario.turns[idx];
    lines.push('');
    lines.push(`Turn ${ts.turn_id}: ${turn.test_type}`);
    lines.push(`  User: "${turn.user_says.substring(0, 60)}${turn.user_says.length > 60 ? '...' : ''}"`);
    lines.push(`  Score: ${ts.points}/${ts.max_points} ${ts.passed ? '✅' : '❌'}`);
    Object.entries(ts.breakdown).forEach(([key, msg]) => {
      lines.push(`    ${msg}`);
    });
  });
  
  lines.push('');
  lines.push('═'.repeat(80));
  
  return lines.join('\n');
}

module.exports = {
  scoreTurn,
  scoreScenario,
  generateReport
};
