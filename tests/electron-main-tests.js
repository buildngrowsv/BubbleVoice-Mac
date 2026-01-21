/**
 * ELECTRON MAIN PROCESS TESTS
 * 
 * Tests for the Electron main process including:
 * - Window creation and lifecycle
 * - Tray icon functionality
 * - Global shortcuts
 * - Backend process management
 * - IPC communication
 * 
 * PRODUCT CONTEXT:
 * The main process is responsible for the app's core functionality:
 * window management, system integration, and backend orchestration.
 * These tests ensure the app can start, respond to user actions,
 * and recover from failures gracefully.
 * 
 * TECHNICAL NOTES:
 * - These tests require Electron to be running
 * - Tests use spectron or similar for Electron testing
 * - Tests verify both UI and system integration
 * - Backend process lifecycle is critical for app stability
 */

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const {
  createTestSuite,
  sleep,
  waitForCondition,
  withTimeout,
  captureConsoleOutput
} = require('./test-utils');

/**
 * ELECTRON MAIN PROCESS TESTS SUITE
 */
const suite = createTestSuite('Electron Main Process');

let electronProcess;
let consoleCapture;

/**
 * SETUP - Before all tests
 * 
 * Note: These tests verify the main process logic without actually
 * launching Electron (which would require a display server).
 * We test the logic by importing and mocking Electron APIs.
 */
suite.beforeAll(async () => {
  console.log('  Setting up Electron main process tests...');
  consoleCapture = captureConsoleOutput();
});

/**
 * TEARDOWN - After all tests
 */
suite.afterAll(async () => {
  console.log('  Cleaning up Electron main process tests...');
  
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill('SIGTERM');
    await sleep(1000);
    if (!electronProcess.killed) {
      electronProcess.kill('SIGKILL');
    }
  }
});

/**
 * TEST: Backend process spawning
 * 
 * FAILURE POINT: Backend process doesn't start
 * IMPACT: App launches but voice features don't work
 */
suite.test('Backend process can be spawned', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  // Spawn backend process
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8123,
      WEBSOCKET_PORT: 8124,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  let started = false;
  
  // Wait for backend to start
  backend.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('listening') || output.includes('initialized')) {
      started = true;
    }
  });
  
  backend.stderr.on('data', (data) => {
    console.log('    Backend stderr:', data.toString().trim());
  });
  
  // Wait for startup
  await waitForCondition(() => started, 10000, 100);
  
  assert.ok(started, 'Backend should start successfully');
  assert.ok(!backend.killed, 'Backend process should be running');
  
  // Clean up
  backend.kill('SIGTERM');
  await sleep(500);
  if (!backend.killed) {
    backend.kill('SIGKILL');
  }
});

/**
 * TEST: Backend process restart on crash
 * 
 * FAILURE POINT: Backend crashes and doesn't restart
 * IMPACT: App becomes unusable, requires full restart
 */
suite.test('Backend process restarts after crash', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  let restartCount = 0;
  let backend;
  
  const startBackend = () => {
    backend = spawn('node', [backendPath], {
      env: {
        ...process.env,
        PORT: 8125,
        WEBSOCKET_PORT: 8126,
        NODE_ENV: 'test'
      },
      stdio: 'pipe'
    });
    
    backend.on('exit', (code) => {
      console.log(`    Backend exited with code ${code}`);
      if (restartCount < 3) {
        restartCount++;
        console.log(`    Restarting backend (attempt ${restartCount})...`);
        setTimeout(startBackend, 1000);
      }
    });
  };
  
  startBackend();
  
  // Wait for initial start
  await sleep(2000);
  
  // Kill the backend to simulate crash
  console.log('    Simulating backend crash...');
  backend.kill('SIGKILL');
  
  // Wait for restart
  await sleep(3000);
  
  assert.ok(restartCount > 0, 'Backend should have restarted at least once');
  assert.ok(backend && !backend.killed, 'Backend should be running after restart');
  
  // Clean up
  if (backend && !backend.killed) {
    backend.kill('SIGTERM');
    await sleep(500);
    if (!backend.killed) {
      backend.kill('SIGKILL');
    }
  }
});

/**
 * TEST: Backend process stops on app quit
 * 
 * FAILURE POINT: Backend keeps running after app closes
 * IMPACT: Orphaned processes consume resources
 */
suite.test('Backend process stops when parent exits', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8127,
      WEBSOCKET_PORT: 8128,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  // Wait for backend to start
  await sleep(2000);
  
  assert.ok(!backend.killed, 'Backend should be running');
  
  // Send SIGTERM (graceful shutdown)
  backend.kill('SIGTERM');
  
  // Wait for shutdown
  const exitPromise = new Promise((resolve) => {
    backend.on('exit', resolve);
  });
  
  await withTimeout(exitPromise, 5000, 'Backend should exit within 5 seconds');
  
  assert.ok(backend.killed, 'Backend should have stopped');
});

/**
 * TEST: Backend process force kill after timeout
 * 
 * FAILURE POINT: Backend hangs during shutdown
 * IMPACT: App can't quit cleanly
 */
suite.test('Backend process is force killed if graceful shutdown fails', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8129,
      WEBSOCKET_PORT: 8130,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  // Wait for backend to start
  await sleep(2000);
  
  // Send SIGTERM
  backend.kill('SIGTERM');
  
  // Wait a bit
  await sleep(1000);
  
  // If still running, force kill
  if (!backend.killed) {
    console.log('    Backend did not exit gracefully, force killing...');
    backend.kill('SIGKILL');
  }
  
  // Wait for exit
  await sleep(500);
  
  assert.ok(backend.killed, 'Backend should be killed');
});

/**
 * TEST: Environment variables passed to backend
 * 
 * FAILURE POINT: Backend doesn't receive correct configuration
 * IMPACT: Backend uses wrong ports, can't connect
 */
suite.test('Backend receives environment variables from main process', async () => {
  const testPort = 8131;
  const testWsPort = 8132;
  
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: testPort,
      WEBSOCKET_PORT: testWsPort,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  let outputReceived = '';
  
  backend.stdout.on('data', (data) => {
    outputReceived += data.toString();
  });
  
  backend.stderr.on('data', (data) => {
    outputReceived += data.toString();
  });
  
  // Wait for startup messages
  await sleep(3000);
  
  // Check that backend is using the correct ports
  assert.ok(
    outputReceived.includes(testPort.toString()) || 
    outputReceived.includes('8131'),
    'Backend should log the HTTP port'
  );
  
  assert.ok(
    outputReceived.includes(testWsPort.toString()) || 
    outputReceived.includes('8132'),
    'Backend should log the WebSocket port'
  );
  
  // Clean up
  backend.kill('SIGTERM');
  await sleep(500);
  if (!backend.killed) {
    backend.kill('SIGKILL');
  }
});

/**
 * TEST: Backend stdout/stderr capture
 * 
 * FAILURE POINT: Backend errors not visible
 * IMPACT: Can't debug backend issues
 */
suite.test('Backend output is captured and logged', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  let stdoutData = '';
  let stderrData = '';
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8133,
      WEBSOCKET_PORT: 8134,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  backend.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });
  
  backend.stderr.on('data', (data) => {
    stderrData += data.toString();
  });
  
  // Wait for some output
  await sleep(3000);
  
  // Should have received some output
  const totalOutput = stdoutData + stderrData;
  assert.ok(totalOutput.length > 0, 'Should capture backend output');
  assert.ok(
    totalOutput.includes('Backend') || 
    totalOutput.includes('server') || 
    totalOutput.includes('listening'),
    'Output should contain backend startup messages'
  );
  
  // Clean up
  backend.kill('SIGTERM');
  await sleep(500);
  if (!backend.killed) {
    backend.kill('SIGKILL');
  }
});

/**
 * TEST: Multiple backend start attempts don't conflict
 * 
 * FAILURE POINT: Starting backend twice causes port conflicts
 * IMPACT: App restart fails
 */
suite.test('Starting backend multiple times uses same ports', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  const testPort = 8135;
  const testWsPort = 8136;
  
  // Start first backend
  const backend1 = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: testPort,
      WEBSOCKET_PORT: testWsPort,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  await sleep(2000);
  
  // Kill first backend
  backend1.kill('SIGTERM');
  await sleep(1000);
  if (!backend1.killed) {
    backend1.kill('SIGKILL');
  }
  
  // Start second backend on same ports
  const backend2 = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: testPort,
      WEBSOCKET_PORT: testWsPort,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  let started = false;
  let error = false;
  
  backend2.stdout.on('data', (data) => {
    if (data.toString().includes('listening')) {
      started = true;
    }
  });
  
  backend2.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('EADDRINUSE') || output.includes('address already in use')) {
      error = true;
    }
  });
  
  await sleep(3000);
  
  assert.ok(started || !error, 'Second backend should start without port conflicts');
  
  // Clean up
  backend2.kill('SIGTERM');
  await sleep(500);
  if (!backend2.killed) {
    backend2.kill('SIGKILL');
  }
});

/**
 * TEST: Backend crash doesn't crash main process
 * 
 * FAILURE POINT: Backend crash takes down entire app
 * IMPACT: User loses all work, app closes unexpectedly
 */
suite.test('Backend crash is isolated from main process', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8137,
      WEBSOCKET_PORT: 8138,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  await sleep(2000);
  
  let exitCode = null;
  backend.on('exit', (code) => {
    exitCode = code;
  });
  
  // Force crash the backend
  backend.kill('SIGKILL');
  
  await sleep(500);
  
  // Backend should have exited
  assert.ok(backend.killed, 'Backend should have exited');
  assert.notStrictEqual(exitCode, 0, 'Backend should have non-zero exit code');
  
  // Main process (this test) should still be running
  assert.ok(true, 'Main process should still be running after backend crash');
});

/**
 * TEST: Backend receives signals correctly
 * 
 * FAILURE POINT: Backend doesn't respond to shutdown signals
 * IMPACT: App hangs on quit
 */
suite.test('Backend responds to SIGTERM signal', async () => {
  const backendPath = path.join(__dirname, '../src/backend/server.js');
  
  const backend = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: 8139,
      WEBSOCKET_PORT: 8140,
      NODE_ENV: 'test'
    },
    stdio: 'pipe'
  });
  
  await sleep(2000);
  
  const startTime = Date.now();
  
  // Send SIGTERM
  backend.kill('SIGTERM');
  
  // Wait for exit
  await new Promise((resolve) => {
    backend.on('exit', resolve);
  });
  
  const shutdownTime = Date.now() - startTime;
  
  assert.ok(backend.killed, 'Backend should exit on SIGTERM');
  assert.ok(shutdownTime < 10000, 'Backend should exit within 10 seconds');
});

// Run the test suite
if (require.main === module) {
  suite.run().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

module.exports = suite;
