#!/usr/bin/env node
/**
 * TEST RUNNER FOR BUBBLEVOICE MAC
 * 
 * Runs all test suites and generates a comprehensive report.
 * Tests are run in order: unit tests first, then integration tests.
 * 
 * USAGE:
 * - npm test                    # Run all tests
 * - node tests/run-all-tests.js # Direct execution
 * - npm run test:unit           # Unit tests only
 * - npm run test:integration    # Integration tests only
 * 
 * PRODUCT CONTEXT:
 * This test runner ensures all critical failure points are tested
 * before deployment. It provides clear feedback on what's working
 * and what needs attention.
 * 
 * TECHNICAL NOTES:
 * - Tests run sequentially to avoid resource conflicts
 * - Integration tests require backend to be running
 * - Exit code 0 = all passed, 1 = failures detected
 * - Detailed report saved to tests/test-results.json
 */

const fs = require('fs');
const path = require('path');

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Print colored output
 */
function print(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Print test header
 */
function printHeader(title) {
  console.log('\n');
  print('═'.repeat(70), 'cyan');
  print(`  ${title}`, 'bright');
  print('═'.repeat(70), 'cyan');
  console.log('');
}

/**
 * Print test summary
 */
function printSummary(results) {
  console.log('\n');
  print('═'.repeat(70), 'cyan');
  print('  TEST SUMMARY', 'bright');
  print('═'.repeat(70), 'cyan');
  console.log('');
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSuites = 0;
  
  for (const suite of results.suites) {
    totalSuites++;
    totalPassed += suite.passed;
    totalFailed += suite.failed;
    
    const status = suite.failed === 0 ? '✓' : '✗';
    const statusColor = suite.failed === 0 ? 'green' : 'red';
    
    print(`  ${status} ${suite.name}`, statusColor);
    print(`    Passed: ${suite.passed}, Failed: ${suite.failed}`, 'reset');
    
    if (suite.failed > 0 && suite.errors.length > 0) {
      print(`    Failures:`, 'red');
      suite.errors.forEach(error => {
        print(`      - ${error.test}: ${error.error.message}`, 'red');
      });
    }
  }
  
  console.log('');
  print('─'.repeat(70), 'cyan');
  
  const overallStatus = totalFailed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';
  const overallColor = totalFailed === 0 ? 'green' : 'red';
  
  print(`  ${overallStatus}`, overallColor);
  print(`  Total: ${totalPassed + totalFailed} tests in ${totalSuites} suites`, 'bright');
  print(`  Passed: ${totalPassed}`, 'green');
  if (totalFailed > 0) {
    print(`  Failed: ${totalFailed}`, 'red');
  }
  
  print('═'.repeat(70), 'cyan');
  console.log('');
  
  return totalFailed === 0;
}

/**
 * Save test results to file
 */
function saveResults(results) {
  const resultsPath = path.join(__dirname, 'test-results.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalSuites: results.suites.length,
      totalTests: results.suites.reduce((sum, s) => sum + s.passed + s.failed, 0),
      totalPassed: results.suites.reduce((sum, s) => sum + s.passed, 0),
      totalFailed: results.suites.reduce((sum, s) => sum + s.failed, 0),
      success: results.suites.every(s => s.failed === 0)
    },
    suites: results.suites
  };
  
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));
  print(`\nTest results saved to: ${resultsPath}`, 'cyan');
}

/**
 * Check if backend is running (for integration tests)
 */
async function checkBackend() {
  try {
    const response = await fetch('http://localhost:7482/health');
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  printHeader('BUBBLEVOICE MAC - TEST SUITE');
  
  const results = {
    suites: [],
    startTime: Date.now()
  };
  
  // Define test suites to run
  // NOTE: test-utils.js is a utility module, not a test suite.
  // It doesn't export a run() function, so we skip it here.
  // It provides helper functions used by other test files.
  const testSuites = [
    {
      name: 'Electron Main Process',
      file: './electron-main-tests.js',
      type: 'unit',
      skip: false
    },
    {
      name: 'Backend Server',
      file: './backend-server-tests.js',
      type: 'unit',
      skip: false
    },
    {
      name: 'Frontend Components',
      file: './frontend-component-tests.js',
      type: 'unit',
      skip: false
    },
    {
      name: 'Hybrid UI Tests',
      file: './ui-hybrid-tests.js',
      type: 'ui',
      skip: false
    },
    {
      name: 'Integration Tests',
      file: './integration-tests.js',
      type: 'integration',
      skip: false
    }
  ];
  
  // Check if we should run only specific test types
  const args = process.argv.slice(2);
  const onlyUnit = args.includes('--unit');
  const onlyIntegration = args.includes('--integration');
  const onlyUI = args.includes('--ui');
  
  // Check if backend is running for integration tests
  let backendRunning = false;
  if (!onlyUnit) {
    print('Checking if backend is running...', 'yellow');
    backendRunning = await checkBackend();
    if (backendRunning) {
      print('✓ Backend is running', 'green');
    } else {
      print('✗ Backend is not running', 'red');
      print('  Integration tests will be skipped', 'yellow');
      print('  Start backend with: npm run dev', 'yellow');
    }
  }
  
  // Run each test suite
  for (const suiteConfig of testSuites) {
    // Skip based on flags
    if (onlyUnit && suiteConfig.type !== 'unit') continue;
    if (onlyIntegration && suiteConfig.type !== 'integration') continue;
    if (onlyUI && suiteConfig.type !== 'ui') continue;
    
    // Skip integration tests if backend not running
    if (suiteConfig.type === 'integration' && !backendRunning) {
      print(`\nSkipping ${suiteConfig.name} (backend not running)`, 'yellow');
      continue;
    }
    
    if (suiteConfig.skip) {
      print(`\nSkipping ${suiteConfig.name}`, 'yellow');
      continue;
    }
    
    try {
      print(`\nRunning ${suiteConfig.name}...`, 'cyan');
      
      const suitePath = path.join(__dirname, suiteConfig.file);
      const suite = require(suitePath);
      
      const result = await suite.run();
      results.suites.push({
        name: suiteConfig.name,
        type: suiteConfig.type,
        passed: result.passed,
        failed: result.failed,
        errors: result.errors
      });
      
    } catch (error) {
      print(`\nError running ${suiteConfig.name}:`, 'red');
      print(`  ${error.message}`, 'red');
      
      results.suites.push({
        name: suiteConfig.name,
        type: suiteConfig.type,
        passed: 0,
        failed: 1,
        errors: [{ test: 'suite execution', error: { message: error.message } }]
      });
    }
  }
  
  // Calculate total time
  const totalTime = ((Date.now() - results.startTime) / 1000).toFixed(2);
  print(`\nTotal test time: ${totalTime}s`, 'cyan');
  
  // Print summary
  const success = printSummary(results);
  
  // Save results
  saveResults(results);
  
  // Exit with appropriate code
  process.exit(success ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  print('\nUnhandled error in test runner:', 'red');
  print(error.stack || error.message, 'red');
  process.exit(1);
});

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    print('\nFatal error:', 'red');
    print(error.stack || error.message, 'red');
    process.exit(1);
  });
}

module.exports = { runAllTests };
