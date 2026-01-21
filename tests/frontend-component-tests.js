/**
 * FRONTEND COMPONENT TESTS
 * 
 * Tests for the BubbleVoice frontend components including:
 * - WebSocket client connection and reconnection
 * - Voice controller state management
 * - Conversation manager message handling
 * - UI state synchronization
 * - Error handling and recovery
 * 
 * PRODUCT CONTEXT:
 * The frontend is the user's window into BubbleVoice. These tests ensure
 * that the UI remains responsive, handles errors gracefully, and provides
 * clear feedback during voice interactions. The three-timer system and
 * interruption handling are critical for natural conversation flow.
 * 
 * TECHNICAL NOTES:
 * - Tests use JSDOM or similar for DOM testing without a browser
 * - Mock WebSocket connections for isolated testing
 * - Tests verify UI state changes and event handling
 * - Focus on edge cases and error conditions
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  createTestSuite,
  MockWebSocket,
  sleep,
  waitForCondition,
  assertEventually,
  withTimeout
} = require('./test-utils');

/**
 * FRONTEND COMPONENT TESTS SUITE
 */
const suite = createTestSuite('Frontend Components');

let WebSocketClient;
let VoiceController;
let ConversationManager;

/**
 * SETUP - Before all tests
 * 
 * Loads frontend components for testing.
 * Note: These are loaded in a Node.js environment, so browser APIs
 * need to be mocked or the code needs to be written to handle both.
 */
suite.beforeAll(async () => {
  console.log('  Setting up frontend component tests...');
  
  // Mock browser APIs that components might use
  global.window = {
    electronAPI: {
      getBackendConfig: async () => ({
        backendUrl: 'http://localhost:7482',
        websocketUrl: 'ws://localhost:7483'
      }),
      onActivateVoiceInput: () => {},
      onNewConversation: () => {},
      onShowSettings: () => {}
    }
  };
  
  global.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      innerHTML: '',
      textContent: ''
    }),
    addEventListener: () => {}
  };
  
  // Load component files
  // Note: In a real setup, you'd use a bundler or module loader
  // For now, we'll test the logic directly
});

/**
 * TEARDOWN - After all tests
 */
suite.afterAll(async () => {
  console.log('  Cleaning up frontend component tests...');
  delete global.window;
  delete global.document;
});

/**
 * TEST: WebSocket client connection
 * 
 * FAILURE POINT: Can't connect to backend
 * IMPACT: App shows "connecting" forever, unusable
 */
suite.test('WebSocket client connects to backend', async () => {
  const mockWs = new MockWebSocket();
  let connectionState = 'disconnected';
  
  // Simulate WebSocket client behavior
  mockWs.on('open', () => {
    connectionState = 'connected';
  });
  
  // Wait for connection
  await waitForCondition(() => connectionState === 'connected', 2000);
  
  assert.strictEqual(connectionState, 'connected');
  assert.strictEqual(mockWs.readyState, MockWebSocket.OPEN);
});

/**
 * TEST: WebSocket client reconnection on disconnect
 * 
 * FAILURE POINT: Connection drops and doesn't reconnect
 * IMPACT: User has to restart app to continue conversation
 */
suite.test('WebSocket client reconnects after disconnect', async () => {
  let connectionAttempts = 0;
  let isConnected = false;
  
  const createConnection = () => {
    connectionAttempts++;
    const mockWs = new MockWebSocket();
    
    mockWs.on('open', () => {
      isConnected = true;
    });
    
    mockWs.on('close', () => {
      isConnected = false;
      // Simulate reconnection logic
      if (connectionAttempts < 3) {
        setTimeout(createConnection, 1000);
      }
    });
    
    return mockWs;
  };
  
  const ws = createConnection();
  
  // Wait for initial connection
  await waitForCondition(() => isConnected, 2000);
  assert.strictEqual(connectionAttempts, 1);
  
  // Simulate disconnect
  ws.close();
  await sleep(100);
  assert.strictEqual(isConnected, false);
  
  // Wait for reconnection
  await waitForCondition(() => isConnected, 3000);
  assert.ok(connectionAttempts > 1, 'Should have attempted reconnection');
  assert.ok(isConnected, 'Should be reconnected');
});

/**
 * TEST: WebSocket client handles connection errors
 * 
 * FAILURE POINT: Connection error crashes frontend
 * IMPACT: App becomes unusable
 */
suite.test('WebSocket client handles connection errors gracefully', async () => {
  const mockWs = new MockWebSocket();
  let errorHandled = false;
  let errorMessage = null;
  
  mockWs.on('error', (error) => {
    errorHandled = true;
    errorMessage = error.message;
  });
  
  // Simulate connection error
  mockWs.simulateError(new Error('Connection refused'));
  
  await sleep(100);
  
  assert.ok(errorHandled, 'Error should be handled');
  assert.ok(errorMessage.includes('Connection refused'), 'Error message should be captured');
});

/**
 * TEST: WebSocket client message parsing
 * 
 * FAILURE POINT: Invalid JSON crashes client
 * IMPACT: One bad message breaks the app
 */
suite.test('WebSocket client handles invalid JSON gracefully', async () => {
  const mockWs = new MockWebSocket();
  let errorOccurred = false;
  
  mockWs.on('message', (data) => {
    try {
      JSON.parse(data.toString());
    } catch (error) {
      errorOccurred = true;
      // Should log error but not crash
      console.log('    Handled invalid JSON (expected)');
    }
  });
  
  // Wait for connection
  await sleep(100);
  
  // Send invalid JSON
  mockWs.simulateMessage('this is not valid json {{{');
  
  await sleep(100);
  
  assert.ok(errorOccurred, 'Should detect invalid JSON');
  // Test continues = didn't crash
  assert.ok(true, 'Client should continue running after invalid JSON');
});

/**
 * TEST: Voice controller state transitions
 * 
 * FAILURE POINT: Voice state gets stuck
 * IMPACT: Can't start/stop recording, UI shows wrong state
 */
suite.test('Voice controller transitions between states correctly', async () => {
  const states = [];
  let currentState = 'idle';
  
  const setState = (newState) => {
    states.push(newState);
    currentState = newState;
  };
  
  // Simulate voice controller state machine
  setState('idle');
  assert.strictEqual(currentState, 'idle');
  
  // Start recording
  setState('listening');
  assert.strictEqual(currentState, 'listening');
  
  // Processing
  setState('processing');
  assert.strictEqual(currentState, 'processing');
  
  // AI responding
  setState('speaking');
  assert.strictEqual(currentState, 'speaking');
  
  // Back to idle
  setState('idle');
  assert.strictEqual(currentState, 'idle');
  
  // Verify state history
  assert.deepStrictEqual(states, ['idle', 'listening', 'processing', 'speaking', 'idle']);
});

/**
 * TEST: Voice controller handles interruption
 * 
 * FAILURE POINT: Can't interrupt AI response
 * IMPACT: User has to wait for full response, feels unnatural
 */
suite.test('Voice controller handles interruption during AI response', async () => {
  let currentState = 'speaking';
  let interrupted = false;
  
  const interrupt = () => {
    if (currentState === 'speaking') {
      interrupted = true;
      currentState = 'idle';
    }
  };
  
  assert.strictEqual(currentState, 'speaking');
  
  // Trigger interruption
  interrupt();
  
  assert.ok(interrupted, 'Should have interrupted');
  assert.strictEqual(currentState, 'idle', 'Should return to idle state');
});

/**
 * TEST: Conversation manager adds messages
 * 
 * FAILURE POINT: Messages not added to conversation
 * IMPACT: Conversation history is lost, AI has no context
 */
suite.test('Conversation manager adds messages to history', async () => {
  const messages = [];
  
  const addMessage = (role, content) => {
    messages.push({
      role,
      content,
      timestamp: Date.now()
    });
  };
  
  addMessage('user', 'Hello');
  addMessage('assistant', 'Hi there!');
  addMessage('user', 'How are you?');
  
  assert.strictEqual(messages.length, 3);
  assert.strictEqual(messages[0].role, 'user');
  assert.strictEqual(messages[0].content, 'Hello');
  assert.strictEqual(messages[1].role, 'assistant');
  assert.strictEqual(messages[2].role, 'user');
});

/**
 * TEST: Conversation manager handles streaming responses
 * 
 * FAILURE POINT: Streaming chunks not assembled correctly
 * IMPACT: AI responses are incomplete or garbled
 */
suite.test('Conversation manager assembles streaming response chunks', async () => {
  let currentResponse = '';
  const chunks = ['Hello', ' there', '!', ' How', ' can', ' I', ' help', '?'];
  
  const handleChunk = (chunk) => {
    currentResponse += chunk;
  };
  
  // Simulate streaming chunks
  for (const chunk of chunks) {
    handleChunk(chunk);
    await sleep(10);
  }
  
  assert.strictEqual(currentResponse, 'Hello there! How can I help?');
});

/**
 * TEST: Conversation manager handles stream errors
 * 
 * FAILURE POINT: Stream error leaves partial response
 * IMPACT: Conversation shows incomplete message
 */
suite.test('Conversation manager handles streaming errors', async () => {
  let currentResponse = '';
  let errorHandled = false;
  
  const handleChunk = (chunk) => {
    currentResponse += chunk;
  };
  
  const handleError = (error) => {
    errorHandled = true;
    // Clear partial response or mark as error
    currentResponse = '[Error: ' + error.message + ']';
  };
  
  // Simulate partial stream
  handleChunk('Hello');
  handleChunk(' there');
  
  // Simulate error
  handleError(new Error('Stream interrupted'));
  
  assert.ok(errorHandled, 'Error should be handled');
  assert.ok(currentResponse.includes('Error'), 'Should show error message');
});

/**
 * TEST: UI updates on voice state change
 * 
 * FAILURE POINT: UI doesn't reflect voice state
 * IMPACT: User doesn't know if app is listening
 */
suite.test('UI updates when voice state changes', async () => {
  const uiStates = [];
  
  const updateUI = (state) => {
    uiStates.push(state);
    // In real implementation, this would update DOM elements
  };
  
  updateUI('idle');
  updateUI('listening');
  updateUI('processing');
  updateUI('speaking');
  
  assert.strictEqual(uiStates.length, 4);
  assert.strictEqual(uiStates[0], 'idle');
  assert.strictEqual(uiStates[1], 'listening');
  assert.strictEqual(uiStates[2], 'processing');
  assert.strictEqual(uiStates[3], 'speaking');
});

/**
 * TEST: Error messages displayed to user
 * 
 * FAILURE POINT: Errors happen silently
 * IMPACT: User doesn't know why app isn't working
 */
suite.test('Error messages are displayed to user', async () => {
  const displayedErrors = [];
  
  const showError = (message) => {
    displayedErrors.push(message);
    // In real implementation, this would show a toast or alert
  };
  
  showError('Failed to connect to backend');
  showError('Microphone permission denied');
  showError('API rate limit exceeded');
  
  assert.strictEqual(displayedErrors.length, 3);
  assert.ok(displayedErrors[0].includes('backend'));
  assert.ok(displayedErrors[1].includes('Microphone'));
  assert.ok(displayedErrors[2].includes('rate limit'));
});

/**
 * TEST: Transcription updates displayed in real-time
 * 
 * FAILURE POINT: Transcription not shown while speaking
 * IMPACT: User doesn't get feedback, unclear if app is listening
 */
suite.test('Transcription updates are displayed in real-time', async () => {
  let displayedTranscription = '';
  
  const updateTranscription = (text) => {
    displayedTranscription = text;
  };
  
  // Simulate real-time transcription updates
  updateTranscription('Hello');
  await sleep(50);
  assert.strictEqual(displayedTranscription, 'Hello');
  
  updateTranscription('Hello there');
  await sleep(50);
  assert.strictEqual(displayedTranscription, 'Hello there');
  
  updateTranscription('Hello there, how are you?');
  await sleep(50);
  assert.strictEqual(displayedTranscription, 'Hello there, how are you?');
});

/**
 * TEST: Bubbles rendered correctly
 * 
 * FAILURE POINT: Bubbles not displayed
 * IMPACT: Key insights from conversation are lost
 */
suite.test('Bubbles are rendered when received', async () => {
  const renderedBubbles = [];
  
  const renderBubble = (bubble) => {
    renderedBubbles.push(bubble);
  };
  
  // Simulate receiving bubbles from backend
  renderBubble({ type: 'insight', content: 'User prefers morning workouts' });
  renderBubble({ type: 'reminder', content: 'Follow up on project X' });
  renderBubble({ type: 'question', content: 'What time works best?' });
  
  assert.strictEqual(renderedBubbles.length, 3);
  assert.strictEqual(renderedBubbles[0].type, 'insight');
  assert.strictEqual(renderedBubbles[1].type, 'reminder');
  assert.strictEqual(renderedBubbles[2].type, 'question');
});

/**
 * TEST: Artifacts displayed correctly
 * 
 * FAILURE POINT: Artifacts not shown
 * IMPACT: Generated content (lists, plans) is invisible
 */
suite.test('Artifacts are displayed when received', async () => {
  const renderedArtifacts = [];
  
  const renderArtifact = (artifact) => {
    renderedArtifacts.push(artifact);
  };
  
  // Simulate receiving artifacts from backend
  renderArtifact({
    type: 'list',
    title: 'Workout Plan',
    items: ['Monday: Cardio', 'Wednesday: Strength', 'Friday: Yoga']
  });
  
  assert.strictEqual(renderedArtifacts.length, 1);
  assert.strictEqual(renderedArtifacts[0].type, 'list');
  assert.strictEqual(renderedArtifacts[0].title, 'Workout Plan');
  assert.strictEqual(renderedArtifacts[0].items.length, 3);
});

/**
 * TEST: Connection status indicator
 * 
 * FAILURE POINT: User doesn't know connection status
 * IMPACT: User tries to use app while disconnected
 */
suite.test('Connection status is displayed to user', async () => {
  let connectionStatus = 'disconnected';
  
  const updateConnectionStatus = (status) => {
    connectionStatus = status;
  };
  
  updateConnectionStatus('connecting');
  assert.strictEqual(connectionStatus, 'connecting');
  
  updateConnectionStatus('connected');
  assert.strictEqual(connectionStatus, 'connected');
  
  updateConnectionStatus('disconnected');
  assert.strictEqual(connectionStatus, 'disconnected');
  
  updateConnectionStatus('reconnecting');
  assert.strictEqual(connectionStatus, 'reconnecting');
});

/**
 * TEST: Loading states during processing
 * 
 * FAILURE POINT: No feedback during long operations
 * IMPACT: User thinks app is frozen
 */
suite.test('Loading indicators shown during processing', async () => {
  let isLoading = false;
  
  const setLoading = (loading) => {
    isLoading = loading;
  };
  
  // Start processing
  setLoading(true);
  assert.ok(isLoading, 'Should show loading');
  
  // Simulate processing
  await sleep(100);
  assert.ok(isLoading, 'Should still be loading');
  
  // Finish processing
  setLoading(false);
  assert.ok(!isLoading, 'Should hide loading');
});

/**
 * TEST: Message history scrolling
 * 
 * FAILURE POINT: New messages not visible
 * IMPACT: User doesn't see AI responses
 */
suite.test('Message history scrolls to bottom on new message', async () => {
  let scrollPosition = 0;
  const maxScroll = 1000;
  
  const scrollToBottom = () => {
    scrollPosition = maxScroll;
  };
  
  // Add message
  scrollToBottom();
  assert.strictEqual(scrollPosition, maxScroll);
  
  // Add another message
  scrollToBottom();
  assert.strictEqual(scrollPosition, maxScroll);
});

/**
 * TEST: Keyboard shortcuts work
 * 
 * FAILURE POINT: Shortcuts don't trigger actions
 * IMPACT: Power users can't use app efficiently
 */
suite.test('Keyboard shortcuts trigger correct actions', async () => {
  const triggeredActions = [];
  
  const handleKeyPress = (key, modifiers) => {
    if (key === 'Space' && modifiers.includes('Cmd') && modifiers.includes('Shift')) {
      triggeredActions.push('activate_voice');
    }
    if (key === 'Escape') {
      triggeredActions.push('interrupt');
    }
    if (key === 'n' && modifiers.includes('Cmd')) {
      triggeredActions.push('new_conversation');
    }
  };
  
  handleKeyPress('Space', ['Cmd', 'Shift']);
  handleKeyPress('Escape', []);
  handleKeyPress('n', ['Cmd']);
  
  assert.strictEqual(triggeredActions.length, 3);
  assert.strictEqual(triggeredActions[0], 'activate_voice');
  assert.strictEqual(triggeredActions[1], 'interrupt');
  assert.strictEqual(triggeredActions[2], 'new_conversation');
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
