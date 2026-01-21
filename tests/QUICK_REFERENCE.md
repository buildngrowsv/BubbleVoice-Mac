# BubbleVoice Tests - Quick Reference

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run only unit tests (fast, no backend needed)
npm run test:unit

# Run only integration tests (requires backend running)
npm run test:integration
```

## Common Commands

```bash
# Individual test suites
npm run test:electron    # Electron main process
npm run test:backend     # Backend server
npm run test:frontend    # Frontend components

# Start backend for integration tests
npm run dev

# Check if backend is running
curl http://localhost:7482/health
```

## Test Results

After running tests, check:
```bash
# View summary
cat tests/test-results.json | jq '.summary'

# View failed tests only
cat tests/test-results.json | jq '.suites[] | select(.failed > 0)'
```

## Troubleshooting

### Tests Timeout
- **Cause**: Backend not running or slow system
- **Fix**: Start backend with `npm run dev`, increase timeout in tests

### Connection Errors
- **Cause**: Port conflicts or backend crashed
- **Fix**: Kill processes on ports 7482/7483, restart backend

### API Errors in Integration Tests
- **Cause**: Missing API keys
- **Fix**: Set `GOOGLE_API_KEY` environment variable

### Canvas Installation Fails
- **Cause**: Missing system dependencies
- **Fix** (Mac): `brew install pkg-config cairo pango libpng jpeg giflib librsvg`

## Test File Structure

```
tests/
├── test-utils.js              # Shared utilities
├── electron-main-tests.js     # Electron process tests
├── backend-server-tests.js    # Backend API tests
├── frontend-component-tests.js # UI component tests
├── integration-tests.js       # End-to-end tests
├── run-all-tests.js          # Test runner
├── test-results.json         # Latest results
├── README.md                 # Full documentation
└── QUICK_REFERENCE.md        # This file
```

## Key Test Utilities

```javascript
// Wait for condition
await waitForCondition(() => someCondition, timeout);

// Sleep
await sleep(milliseconds);

// Mock WebSocket
const ws = new MockWebSocket();
ws.simulateMessage(data);

// Assert eventually
await assertEventually(() => condition, 'error message');

// Create test suite
const suite = createTestSuite('Name');
suite.test('test name', async () => { ... });
```

## Adding a New Test

```javascript
suite.test('Feature works correctly', async () => {
  // 1. Setup
  const ws = new WebSocket(websocketUrl);
  await new Promise(resolve => ws.on('open', resolve));
  
  // 2. Action
  ws.send(JSON.stringify({ type: 'action' }));
  
  // 3. Assert
  const response = await new Promise(resolve => {
    ws.once('message', data => resolve(JSON.parse(data)));
  });
  assert.strictEqual(response.type, 'expected');
  
  // 4. Cleanup
  ws.close();
});
```

## Current Status (Last Run)

- **Total Tests**: 51
- **Passing**: 44 (86%)
- **Failing**: 7 (14%)

### Passing
- ✅ Electron Main Process: 9/9
- ✅ Frontend Components: 18/18

### Needs Work
- ⚠️ Backend Server: 10/14 (timing issues)
- ⚠️ Integration Tests: 7/9 (needs API keys)

## Common Failure Points Tested

1. **Backend Crashes** - Auto-restart, graceful shutdown
2. **Network Issues** - Reconnection, timeout handling
3. **Invalid Input** - Malformed JSON, unknown messages
4. **Concurrent Users** - Connection isolation, state management
5. **Voice Pipeline** - Start/stop, interruption, errors
6. **UI State** - Voice states, loading indicators, errors
7. **Message Flow** - Streaming, context, history

## Performance Expectations

- Unit tests: < 30 seconds
- Integration tests: < 3 minutes
- Full test suite: < 3 minutes

## CI/CD Integration

Add to GitHub Actions:
```yaml
- name: Run tests
  run: npm test
  env:
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
```

## Getting Help

1. Read `tests/README.md` for full documentation
2. Check `tests/test-results.json` for error details
3. Run individual test files for debugging
4. Check backend logs if integration tests fail
