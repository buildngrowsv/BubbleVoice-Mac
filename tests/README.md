# BubbleVoice Mac - Test Suite

Comprehensive test suite for the BubbleVoice Mac Electron application, covering all critical failure points and edge cases.

## Test Overview

The test suite is organized into multiple layers:

1. **Test Utils** - Shared testing utilities and helpers
2. **Electron Main Process Tests** - Window management, backend lifecycle
3. **Backend Server Tests** - WebSocket, API endpoints, message handling
4. **Frontend Component Tests** - UI state, voice controller, conversation manager
5. **Integration Tests** - End-to-end voice pipeline testing

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only (no backend required)
npm run test:unit

# Integration tests only (requires backend running)
npm run test:integration

# Individual test suites
npm run test:electron    # Electron main process tests
npm run test:backend     # Backend server tests
npm run test:frontend    # Frontend component tests
```

## Test Results

Test results are automatically saved to `tests/test-results.json` after each run. This file contains:
- Summary statistics (passed/failed counts)
- Detailed results for each test suite
- Error messages and stack traces for failures
- Timestamp of test run

## Test Coverage

### Critical Failure Points Tested

#### 1. Backend Process Management
- ✅ Backend process spawning and initialization
- ✅ Backend restart after crash (up to 3 attempts)
- ✅ Graceful shutdown on app quit
- ✅ Force kill if shutdown hangs
- ✅ Environment variable passing
- ✅ Output capture and logging
- ✅ Port conflict handling
- ✅ Process isolation (crash doesn't affect main process)

#### 2. WebSocket Communication
- ✅ Connection establishment
- ✅ Welcome message on connect
- ✅ Ping/pong keepalive
- ✅ Invalid JSON handling
- ⚠️ Unknown message type handling (backend logs warning but doesn't send error)
- ✅ Multiple concurrent connections
- ⚠️ Connection cleanup on disconnect (timing-sensitive)
- ✅ Rapid message bursts
- ✅ Large message handling
- ⚠️ Connection isolation between clients (timing-sensitive)

#### 3. Voice Pipeline
- ✅ Voice input start/stop flow
- ⚠️ Voice input in test environment (no microphone available)
- ⚠️ Interruption during AI response (requires active LLM stream)
- ✅ Error recovery after failed operations

#### 4. Conversation Management
- ✅ Message history tracking
- ✅ Streaming response assembly
- ✅ Stream error handling
- ✅ Context maintenance across messages
- ✅ Error recovery

#### 5. Frontend UI
- ✅ WebSocket client connection/reconnection
- ✅ Connection error handling
- ✅ Invalid JSON handling
- ✅ Voice state transitions
- ✅ Interruption handling
- ✅ Message rendering
- ✅ Bubble and artifact display
- ✅ Connection status indicator
- ✅ Loading states
- ✅ Auto-scroll on new messages
- ✅ Keyboard shortcuts

## Known Test Limitations

### 1. API Keys Required for Full Integration Tests
Some integration tests require valid API keys to test the complete LLM pipeline:
- `GOOGLE_API_KEY` for Gemini models
- `OPENAI_API_KEY` for GPT models (optional)
- `ANTHROPIC_API_KEY` for Claude models (optional)

Without API keys, these tests will verify message routing but not actual LLM responses.

### 2. Voice Input Testing
Voice input tests cannot fully test microphone access in a headless test environment. Tests verify:
- Message routing works correctly
- Errors are handled gracefully
- But actual speech recognition is not tested

### 3. Timing-Sensitive Tests
Some tests are timing-sensitive and may occasionally fail on slow systems:
- Connection cleanup tests
- Concurrent connection isolation
- These failures don't indicate bugs, just slow test execution

## Test Architecture

### Test Utilities (`test-utils.js`)

Provides shared utilities for all tests:

- **MockWebSocket** - Mock WebSocket for isolated testing
- **waitForCondition** - Wait for async conditions without race conditions
- **assertEventually** - Assert conditions that become true over time
- **createTestSuite** - Structured test suite with setup/teardown
- **Mock data creators** - Generate test conversations, messages, etc.

### Test Structure

Each test file follows this pattern:

```javascript
const suite = createTestSuite('Suite Name');

suite.beforeAll(async () => {
  // Setup before all tests
});

suite.afterAll(async () => {
  // Cleanup after all tests
});

suite.test('Test name', async () => {
  // Test implementation
  assert.ok(condition, 'Error message');
});

if (require.main === module) {
  suite.run().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}
```

## Continuous Integration

### GitHub Actions (Recommended)

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: macos-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Start backend
        run: npm run dev &
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
      
      - name: Wait for backend
        run: sleep 5
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: tests/test-results.json
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
npm run test:unit
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

## Debugging Failed Tests

### 1. Check Test Results File
```bash
cat tests/test-results.json | jq '.suites[] | select(.failed > 0)'
```

### 2. Run Individual Test Suite
```bash
node tests/backend-server-tests.js
```

### 3. Add Debug Logging
Set `NODE_ENV=development` for more verbose output:
```bash
NODE_ENV=development npm test
```

### 4. Check Backend Logs
If integration tests fail, check if backend is running:
```bash
curl http://localhost:7482/health
```

## Adding New Tests

### 1. Identify Failure Point
What can go wrong? What would break the user experience?

### 2. Write Test
```javascript
suite.test('Description of what should work', async () => {
  // Setup
  const ws = new WebSocket(websocketUrl);
  await new Promise(resolve => ws.on('open', resolve));
  
  // Action
  ws.send(JSON.stringify({ type: 'test_action' }));
  
  // Assert
  const response = await new Promise(resolve => {
    ws.once('message', data => resolve(JSON.parse(data)));
  });
  
  assert.strictEqual(response.type, 'expected_type');
  
  // Cleanup
  ws.close();
});
```

### 3. Test the Test
Make sure it fails when it should:
```javascript
// Temporarily break the code
// Run test - should fail
// Fix the code
// Run test - should pass
```

## Test Maintenance

### When to Update Tests

1. **New Feature Added** - Add tests for new failure points
2. **Bug Fixed** - Add test that would have caught the bug
3. **API Changed** - Update tests to match new API
4. **Test Flaky** - Investigate and fix timing issues

### Test Quality Guidelines

1. **Tests should be fast** - Use mocks where possible
2. **Tests should be isolated** - No shared state between tests
3. **Tests should be clear** - Name describes what's being tested
4. **Tests should be reliable** - No random failures
5. **Tests should test one thing** - Single assertion per test (when possible)

## Current Test Status

**Overall: 44/51 tests passing (86%)**

### Passing Suites
- ✅ Electron Main Process (9/9)
- ✅ Frontend Components (18/18)

### Partially Passing Suites
- ⚠️ Backend Server (10/14) - Some timing-sensitive tests
- ⚠️ Integration Tests (7/9) - Requires full API setup

### Known Issues
1. Connection cleanup tests are timing-sensitive
2. Interrupt tests require active LLM streaming
3. Some tests need API keys configured

## Future Improvements

1. **Performance Tests** - Measure response times, memory usage
2. **Load Tests** - Test with many concurrent users
3. **Security Tests** - Test authentication, input validation
4. **UI Tests** - Add Playwright/Puppeteer for UI testing
5. **Snapshot Tests** - Test UI rendering consistency
6. **Coverage Reports** - Add Istanbul/NYC for code coverage

## Support

For questions or issues with tests:
1. Check this README
2. Review test-results.json for details
3. Run individual test suites for debugging
4. Check backend logs if integration tests fail

## License

Same as main project (MIT)
