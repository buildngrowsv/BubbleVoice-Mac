/**
 * TEST UTILITIES FOR BUBBLEVOICE MAC
 * 
 * Shared utilities and helpers for testing the Electron app.
 * Provides common functionality like WebSocket mocking, timeout helpers,
 * and assertion utilities.
 * 
 * PRODUCT CONTEXT:
 * These utilities are designed to test the sophisticated voice AI pipeline
 * including the three-timer system, interruption handling, and real-time
 * WebSocket communication that makes BubbleVoice feel responsive and natural.
 * 
 * TECHNICAL NOTES:
 * - Uses native Node.js assert module (no external dependencies)
 * - Provides WebSocket mock for testing without real connections
 * - Includes timing utilities for testing async operations
 * - Helper functions for common test patterns
 */

const assert = require('assert');
const { EventEmitter } = require('events');

/**
 * MOCK WEBSOCKET
 * 
 * A mock WebSocket implementation for testing without real network connections.
 * Implements the same interface as the ws library's WebSocket class.
 * 
 * WHY THIS EXISTS:
 * Testing real WebSocket connections is slow and unreliable. This mock
 * allows us to test WebSocket logic in isolation, quickly and deterministically.
 * 
 * TECHNICAL DETAILS:
 * - Extends EventEmitter to support event-based API
 * - Tracks all sent messages for assertion
 * - Simulates connection states (CONNECTING, OPEN, CLOSING, CLOSED)
 * - Allows controlled message injection for testing receive logic
 */
class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = MockWebSocket.CONNECTING;
    this.sentMessages = [];
    this.isAlive = true;
    
    // Simulate connection opening after a tick
    setImmediate(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    });
  }

  /**
   * Send a message through the mock WebSocket.
   * Stores the message for later assertion.
   * 
   * @param {string|Buffer} data - Data to send
   */
  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  /**
   * Simulate receiving a message from the server.
   * Used in tests to trigger message handlers.
   * 
   * @param {string|Buffer} data - Data to receive
   */
  simulateMessage(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.emit('message', data);
  }

  /**
   * Close the WebSocket connection.
   * 
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  close(code, reason) {
    this.readyState = MockWebSocket.CLOSING;
    setImmediate(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', code, reason);
    });
  }

  /**
   * Simulate a WebSocket error.
   * Used in tests to verify error handling.
   * 
   * @param {Error} error - Error to emit
   */
  simulateError(error) {
    this.emit('error', error);
  }

  /**
   * Ping the connection (keepalive).
   */
  ping() {
    // In mock, just emit pong immediately
    setImmediate(() => this.emit('pong'));
  }

  /**
   * Terminate the connection immediately.
   */
  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', 1006, 'Connection terminated');
  }

  /**
   * Get all messages sent through this WebSocket.
   * Useful for assertions in tests.
   * 
   * @returns {Array} Array of sent messages
   */
  getSentMessages() {
    return this.sentMessages;
  }

  /**
   * Get the last message sent through this WebSocket.
   * 
   * @returns {string|Buffer|null} Last sent message or null
   */
  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1] || null;
  }

  /**
   * Clear all sent messages.
   * Useful for resetting state between test assertions.
   */
  clearSentMessages() {
    this.sentMessages = [];
  }
}

// WebSocket ready states (matching ws library constants)
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

/**
 * WAIT FOR CONDITION
 * 
 * Waits for a condition to become true, checking at intervals.
 * Useful for testing async operations without hardcoded delays.
 * 
 * WHY THIS EXISTS:
 * Many operations in BubbleVoice are asynchronous (voice pipeline,
 * LLM responses, WebSocket messages). This utility allows tests to
 * wait for specific conditions without race conditions or flaky timing.
 * 
 * @param {Function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>} Resolves when condition is true, rejects on timeout
 */
async function waitForCondition(condition, timeout = 5000, interval = 50) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * SLEEP
 * 
 * Async sleep utility.
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ASSERT EVENTUALLY
 * 
 * Asserts that a condition becomes true within a timeout.
 * Combines waitForCondition with assertion.
 * 
 * @param {Function} condition - Condition to check
 * @param {string} message - Error message if condition not met
 * @param {number} timeout - Timeout in milliseconds
 */
async function assertEventually(condition, message, timeout = 5000) {
  try {
    await waitForCondition(condition, timeout);
  } catch (error) {
    throw new Error(message || 'Condition not met');
  }
}

/**
 * ASSERT WEBSOCKET MESSAGE
 * 
 * Asserts that a WebSocket sent a message matching criteria.
 * 
 * @param {MockWebSocket} ws - Mock WebSocket instance
 * @param {Object} criteria - Criteria to match (type, data fields, etc.)
 * @param {string} message - Error message if not found
 */
function assertWebSocketMessage(ws, criteria, message) {
  const messages = ws.getSentMessages().map(msg => {
    try {
      return JSON.parse(msg);
    } catch {
      return msg;
    }
  });

  const found = messages.some(msg => {
    if (criteria.type && msg.type !== criteria.type) {
      return false;
    }
    if (criteria.data) {
      for (const key in criteria.data) {
        if (msg.data?.[key] !== criteria.data[key]) {
          return false;
        }
      }
    }
    return true;
  });

  assert.ok(found, message || `WebSocket message matching ${JSON.stringify(criteria)} not found`);
}

/**
 * CREATE MOCK LLM RESPONSE
 * 
 * Creates a mock LLM streaming response for testing.
 * Simulates the streaming behavior of real LLM APIs.
 * 
 * @param {string} text - Full response text
 * @param {number} chunkSize - Size of each chunk
 * @param {number} delayMs - Delay between chunks
 * @returns {AsyncGenerator} Async generator yielding chunks
 */
async function* createMockLLMResponse(text, chunkSize = 10, delayMs = 10) {
  for (let i = 0; i < text.length; i += chunkSize) {
    await sleep(delayMs);
    yield text.slice(i, i + chunkSize);
  }
}

/**
 * MOCK CONVERSATION DATA
 * 
 * Creates mock conversation data for testing.
 * 
 * @param {Object} overrides - Fields to override
 * @returns {Object} Mock conversation object
 */
function createMockConversation(overrides = {}) {
  return {
    id: `conv_${Date.now()}`,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
    ...overrides
  };
}

/**
 * MOCK USER MESSAGE
 * 
 * Creates a mock user message for testing.
 * 
 * @param {string} content - Message content
 * @param {Object} overrides - Fields to override
 * @returns {Object} Mock message object
 */
function createMockUserMessage(content, overrides = {}) {
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
    ...overrides
  };
}

/**
 * MOCK AI MESSAGE
 * 
 * Creates a mock AI message for testing.
 * 
 * @param {string} content - Message content
 * @param {Object} overrides - Fields to override
 * @returns {Object} Mock message object
 */
function createMockAIMessage(content, overrides = {}) {
  return {
    role: 'assistant',
    content,
    timestamp: Date.now(),
    ...overrides
  };
}

/**
 * CAPTURE CONSOLE OUTPUT
 * 
 * Captures console output during test execution.
 * Useful for verifying logging behavior.
 * 
 * @returns {Object} Object with start() and stop() methods
 */
function captureConsoleOutput() {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;

  return {
    start() {
      console.log = (...args) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };
      console.error = (...args) => {
        errors.push(args.join(' '));
        originalError(...args);
      };
    },
    stop() {
      console.log = originalLog;
      console.error = originalError;
    },
    getLogs() {
      return logs;
    },
    getErrors() {
      return errors;
    },
    clear() {
      logs.length = 0;
      errors.length = 0;
    }
  };
}

/**
 * WITH TIMEOUT
 * 
 * Wraps a promise with a timeout.
 * Useful for ensuring tests don't hang indefinitely.
 * 
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} message - Error message on timeout
 * @returns {Promise} Promise that rejects on timeout
 */
function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(message)), timeoutMs)
    )
  ]);
}

/**
 * ASSERT THROWS ASYNC
 * 
 * Asserts that an async function throws an error.
 * 
 * @param {Function} fn - Async function to test
 * @param {RegExp|string} errorMatch - Expected error message or pattern
 * @param {string} message - Assertion message
 */
async function assertThrowsAsync(fn, errorMatch, message) {
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }

  assert.ok(error, message || 'Expected function to throw');
  
  if (errorMatch) {
    if (typeof errorMatch === 'string') {
      assert.ok(
        error.message.includes(errorMatch),
        `Expected error message to include "${errorMatch}", got "${error.message}"`
      );
    } else if (errorMatch instanceof RegExp) {
      assert.ok(
        errorMatch.test(error.message),
        `Expected error message to match ${errorMatch}, got "${error.message}"`
      );
    }
  }
}

/**
 * CREATE TEST SUITE
 * 
 * Creates a test suite with setup/teardown and test tracking.
 * Provides a structured way to organize tests.
 * 
 * @param {string} name - Suite name
 * @returns {Object} Test suite object
 */
function createTestSuite(name) {
  const tests = [];
  let beforeEachFn = null;
  let afterEachFn = null;
  let beforeAllFn = null;
  let afterAllFn = null;

  return {
    name,
    
    beforeAll(fn) {
      beforeAllFn = fn;
    },
    
    afterAll(fn) {
      afterAllFn = fn;
    },
    
    beforeEach(fn) {
      beforeEachFn = fn;
    },
    
    afterEach(fn) {
      afterEachFn = fn;
    },
    
    test(testName, fn) {
      tests.push({ name: testName, fn });
    },
    
    async run() {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running test suite: ${name}`);
      console.log('='.repeat(60));
      
      const results = {
        passed: 0,
        failed: 0,
        errors: []
      };
      
      try {
        if (beforeAllFn) {
          await beforeAllFn();
        }
        
        for (const test of tests) {
          try {
            if (beforeEachFn) {
              await beforeEachFn();
            }
            
            console.log(`\n  ▶ ${test.name}`);
            await withTimeout(test.fn(), 30000, `Test "${test.name}" timed out after 30s`);
            console.log(`  ✓ ${test.name}`);
            results.passed++;
            
            if (afterEachFn) {
              await afterEachFn();
            }
          } catch (error) {
            console.error(`  ✗ ${test.name}`);
            console.error(`    Error: ${error.message}`);
            if (error.stack) {
              console.error(`    ${error.stack.split('\n').slice(1, 4).join('\n    ')}`);
            }
            results.failed++;
            results.errors.push({ test: test.name, error });
          }
        }
        
        if (afterAllFn) {
          await afterAllFn();
        }
      } catch (error) {
        console.error(`\n  Suite setup/teardown error: ${error.message}`);
        results.errors.push({ test: 'suite setup/teardown', error });
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
      console.log('='.repeat(60));
      
      return results;
    }
  };
}

module.exports = {
  MockWebSocket,
  waitForCondition,
  sleep,
  assertEventually,
  assertWebSocketMessage,
  createMockLLMResponse,
  createMockConversation,
  createMockUserMessage,
  createMockAIMessage,
  captureConsoleOutput,
  withTimeout,
  assertThrowsAsync,
  createTestSuite
};
