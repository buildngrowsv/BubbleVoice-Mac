#!/usr/bin/env node

/**
 * CONVERSATION SIDEBAR TEST RUNNER
 * 
 * Runs the conversation sidebar tests in a JSDOM environment
 * with the necessary frontend components loaded.
 * 
 * WHY THIS EXISTS:
 * The conversation sidebar tests need a DOM environment and
 * the actual ChatSidebar class from the frontend.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Set up JSDOM environment
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>Conversation Sidebar Tests</title>
    </head>
    <body>
      <div id="test-container"></div>
    </body>
  </html>
`, {
  url: 'http://localhost',
  runScripts: 'dangerously',
  resources: 'usable'
});

// Set up global environment
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Audio = function() {
  return {
    addEventListener: function() {},
    play: function() { return Promise.resolve(); },
    pause: function() {},
    load: function() {}
  };
};

console.log('[Test Runner] Setting up test environment...\n');

// Load the ChatSidebar component
const chatSidebarPath = path.join(__dirname, '../src/frontend/components/chat-sidebar.js');
const chatSidebarCode = fs.readFileSync(chatSidebarPath, 'utf8');

// Execute the ChatSidebar code in the global scope
const script = new dom.window.Function(chatSidebarCode);
script.call(dom.window);

// Make ChatSidebar available globally
global.ChatSidebar = dom.window.ChatSidebar;

console.log('[Test Runner] ChatSidebar loaded:', typeof global.ChatSidebar);
console.log('[Test Runner] Starting tests...\n');

// Now run the tests
let testsPassed = 0;
let testsFailed = 0;
let currentSuite = '';

/**
 * MOCK DESCRIBE/IT FUNCTIONS
 * 
 * Simple test framework implementation for running our tests.
 */
global.describe = function(suiteName, suiteFunc) {
  currentSuite = suiteName;
  console.log(`\n${suiteName}`);
  console.log('='.repeat(60));
  
  try {
    suiteFunc.call(this);
  } catch (error) {
    console.error(`  ✗ Suite error: ${error.message}`);
    testsFailed++;
  }
};

global.it = function(testName, testFunc) {
  try {
    if (testFunc.length > 0) {
      // Test uses done callback
      return new Promise((resolve) => {
        const done = () => {
          console.log(`  ✓ ${testName}`);
          testsPassed++;
          resolve();
        };
        testFunc(done);
      });
    } else {
      // Synchronous test
      testFunc();
      console.log(`  ✓ ${testName}`);
      testsPassed++;
    }
  } catch (error) {
    console.log(`  ✗ ${testName}`);
    console.log(`    Error: ${error.message}`);
    if (error.stack) {
      console.log(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
    }
    testsFailed++;
  }
};

global.beforeEach = function(setupFunc) {
  try {
    setupFunc();
  } catch (error) {
    console.error(`  Setup error: ${error.message}`);
  }
};

global.afterEach = function(teardownFunc) {
  try {
    teardownFunc();
  } catch (error) {
    console.error(`  Teardown error: ${error.message}`);
  }
};

// Extend this to handle timeouts
global.describe.timeout = function(ms) {
  return this;
};

// Load and run the test file
const testFilePath = path.join(__dirname, 'conversation-sidebar-tests.js');
const testCode = fs.readFileSync(testFilePath, 'utf8');

// Remove the require statements from the test code since we're providing them
const cleanedTestCode = testCode
  .replace(/const assert = require\('assert'\);/, '')
  .replace(/if \(typeof module.*\n.*\n.*\n.*\n\}/, ''); // Remove module.exports

// Execute the test code
try {
  eval(cleanedTestCode);
} catch (error) {
  console.error('Error loading test file:', error);
  process.exit(1);
}

// Wait a bit for async tests to complete
setTimeout(() => {
  console.log('\n' + '='.repeat(60));
  console.log(`\nTest Results:`);
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log(`  Total:  ${testsPassed + testsFailed}`);
  
  if (testsFailed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}, 1000);
