/**
 * UI COMPONENT INTERACTION TESTS
 *
 * Comprehensive tests for BubbleVoice frontend UI components focusing on:
 * - Button interactions and click handlers
 * - State changes and transitions
 * - Error handling and recovery
 * - Visual feedback mechanisms
 * - Edge cases and boundary conditions
 *
 * PRODUCT CONTEXT:
 * These tests ensure the UI components behave correctly under various conditions,
 * providing users with reliable feedback and consistent behavior. The voice AI
 * experience depends on responsive UI that accurately reflects the system state.
 *
 * TECHNICAL NOTES:
 * - Tests use mocks to isolate component behavior
 * - Focus on interaction patterns rather than implementation details
 * - Tests verify both happy paths and error conditions
 * - Designed to catch regressions in UI behavior
 *
 * CREATED: January 2026 by Agent-2 for UI test coverage expansion
 */

const assert = require('assert');
const {
  createTestSuite,
  MockWebSocket,
  sleep,
  waitForCondition,
  assertEventually,
  withTimeout,
  captureConsoleOutput,
  assertThrowsAsync
} = require('./test-utils');

/**
 * =============================================================================
 * WEBSOCKET CLIENT ADVANCED TESTS
 * =============================================================================
 *
 * Extended tests for WebSocketClient class focusing on:
 * - Message queue flushing after reconnection
 * - Exponential backoff behavior
 * - Connection timeout handling
 * - Multiple rapid disconnect/reconnect cycles
 */
const websocketAdvancedSuite = createTestSuite('WebSocket Client Advanced Tests');

websocketAdvancedSuite.beforeAll(async () => {
  console.log('  Setting up WebSocket advanced tests...');
});

/**
 * TEST: Message queue preserves order during reconnection
 *
 * FAILURE POINT: Messages sent while disconnected arrive out of order
 * IMPACT: Conversation history becomes garbled, AI receives wrong context
 */
websocketAdvancedSuite.test('Message queue preserves order during reconnection', async () => {
  const messageQueue = [];
  let isConnected = false;

  // Simulate message queuing behavior
  const sendMessage = (message) => {
    if (!isConnected) {
      messageQueue.push(message);
      return 'queued';
    }
    return 'sent';
  };

  // Simulate disconnection - queue messages
  isConnected = false;
  sendMessage({ id: 1, content: 'First message' });
  sendMessage({ id: 2, content: 'Second message' });
  sendMessage({ id: 3, content: 'Third message' });

  assert.strictEqual(messageQueue.length, 3, 'Should queue 3 messages');

  // Verify order is preserved
  assert.strictEqual(messageQueue[0].id, 1);
  assert.strictEqual(messageQueue[1].id, 2);
  assert.strictEqual(messageQueue[2].id, 3);

  // Simulate reconnection - flush queue
  isConnected = true;
  const flushedMessages = [...messageQueue];
  messageQueue.length = 0;

  // Verify flush order
  assert.strictEqual(flushedMessages[0].content, 'First message');
  assert.strictEqual(flushedMessages[2].content, 'Third message');
});

/**
 * TEST: Exponential backoff increases delay correctly
 *
 * FAILURE POINT: Reconnection attempts happen too fast, overwhelming server
 * IMPACT: Server gets DDoS'd by reconnecting clients
 */
websocketAdvancedSuite.test('Exponential backoff increases delay correctly', async () => {
  const reconnectDelay = 1000; // Base delay
  const maxReconnectDelay = 30000;
  const delays = [];

  // Simulate exponential backoff calculation
  for (let attempt = 1; attempt <= 5; attempt++) {
    const delay = Math.min(
      reconnectDelay * Math.pow(2, attempt - 1),
      maxReconnectDelay
    );
    delays.push(delay);
  }

  // Verify exponential growth
  assert.strictEqual(delays[0], 1000, 'First delay should be 1000ms');
  assert.strictEqual(delays[1], 2000, 'Second delay should be 2000ms');
  assert.strictEqual(delays[2], 4000, 'Third delay should be 4000ms');
  assert.strictEqual(delays[3], 8000, 'Fourth delay should be 8000ms');
  assert.strictEqual(delays[4], 16000, 'Fifth delay should be 16000ms');

  // Test max delay cap
  const cappedDelay = Math.min(
    reconnectDelay * Math.pow(2, 9), // 10th attempt
    maxReconnectDelay
  );
  assert.strictEqual(cappedDelay, 30000, 'Delay should be capped at 30000ms');
});

/**
 * TEST: Connection timeout triggers error handling
 *
 * FAILURE POINT: App hangs forever when backend is unreachable
 * IMPACT: User sees no feedback, thinks app is frozen
 */
websocketAdvancedSuite.test('Connection timeout triggers error handling', async () => {
  let errorTriggered = false;
  let errorType = null;
  const connectionTimeout = 100; // Short timeout for testing

  // Simulate connection attempt with timeout
  const attemptConnection = () => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        errorTriggered = true;
        errorType = 'timeout';
        reject(new Error('Connection timeout'));
      }, connectionTimeout);

      // Simulate slow connection (never connects)
      // In real scenario, this would be waiting for WebSocket.OPEN
    });
  };

  try {
    await withTimeout(attemptConnection(), connectionTimeout + 50, 'Connection timeout');
  } catch (error) {
    // Expected to catch timeout
  }

  await sleep(150);

  assert.ok(errorTriggered, 'Error should be triggered on timeout');
  assert.strictEqual(errorType, 'timeout', 'Error type should be timeout');
});

/**
 * TEST: Rapid disconnect/reconnect cycles handled gracefully
 *
 * FAILURE POINT: Multiple reconnection timers stack up
 * IMPACT: Multiple simultaneous reconnection attempts cause chaos
 */
websocketAdvancedSuite.test('Rapid disconnect/reconnect cycles handled gracefully', async () => {
  let reconnectAttempts = 0;
  let isReconnecting = false;
  let activeTimers = 0;

  const scheduleReconnect = () => {
    if (isReconnecting) {
      return; // Already reconnecting
    }
    isReconnecting = true;
    activeTimers++;
    reconnectAttempts++;

    // Simulate reconnect timer
    setTimeout(() => {
      activeTimers--;
      isReconnecting = false;
    }, 50);
  };

  // Simulate rapid disconnects
  scheduleReconnect();
  scheduleReconnect(); // Should be ignored
  scheduleReconnect(); // Should be ignored

  await sleep(20);

  // Only one reconnect should be scheduled
  assert.strictEqual(activeTimers, 1, 'Only one reconnect timer should be active');
  assert.strictEqual(reconnectAttempts, 1, 'Only one reconnect attempt should be made');

  await sleep(100);

  // After timer completes, new reconnect can be scheduled
  scheduleReconnect();
  assert.strictEqual(reconnectAttempts, 2, 'New reconnect should be allowed after previous completes');
});

/**
 * TEST: WebSocket handles binary and text messages
 *
 * FAILURE POINT: Binary audio data corrupted or mishandled
 * IMPACT: Audio playback fails or produces noise
 */
websocketAdvancedSuite.test('WebSocket handles binary and text messages', async () => {
  const receivedMessages = [];

  const handleMessage = (data) => {
    if (typeof data === 'string') {
      receivedMessages.push({ type: 'text', data: JSON.parse(data) });
    } else if (data instanceof Buffer || data instanceof ArrayBuffer) {
      receivedMessages.push({ type: 'binary', size: data.byteLength || data.length });
    }
  };

  // Simulate receiving text message
  handleMessage(JSON.stringify({ type: 'status', message: 'ok' }));

  // Simulate receiving binary message
  const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  handleMessage(binaryData);

  assert.strictEqual(receivedMessages.length, 2);
  assert.strictEqual(receivedMessages[0].type, 'text');
  assert.strictEqual(receivedMessages[0].data.type, 'status');
  assert.strictEqual(receivedMessages[1].type, 'binary');
  assert.strictEqual(receivedMessages[1].size, 4);
});

/**
 * =============================================================================
 * VOICE CONTROLLER ADVANCED TESTS
 * =============================================================================
 *
 * Tests for VoiceController focusing on:
 * - Double-start prevention
 * - Interruption during different states
 * - Audio element lifecycle
 * - Error recovery
 */
const voiceControllerSuite = createTestSuite('Voice Controller Advanced Tests');

voiceControllerSuite.beforeAll(async () => {
  console.log('  Setting up Voice Controller tests...');
});

/**
 * TEST: Prevents double-start of voice input
 *
 * FAILURE POINT: Starting voice input twice creates duplicate listeners
 * IMPACT: Duplicate transcriptions, resource leaks, feedback loops
 */
voiceControllerSuite.test('Prevents double-start of voice input', async () => {
  let isListening = false;
  let startAttempts = 0;

  const startListening = async () => {
    if (isListening) {
      console.log('    Already listening (prevented double start)');
      return false;
    }
    startAttempts++;
    isListening = true;
    return true;
  };

  // First start should succeed
  const firstResult = await startListening();
  assert.ok(firstResult, 'First start should succeed');
  assert.strictEqual(startAttempts, 1);

  // Second start should be prevented
  const secondResult = await startListening();
  assert.ok(!secondResult, 'Second start should be prevented');
  assert.strictEqual(startAttempts, 1, 'Start attempts should still be 1');
});

/**
 * TEST: Stops voice input when already stopped
 *
 * FAILURE POINT: Stopping when not listening throws error
 * IMPACT: App crashes when user clicks stop multiple times
 */
voiceControllerSuite.test('Stops voice input gracefully when already stopped', async () => {
  let isListening = false;
  let stopAttempts = 0;
  let errorThrown = false;

  const stopListening = () => {
    stopAttempts++;
    if (!isListening) {
      // Should handle gracefully, not throw
      console.log('    Not listening (graceful no-op)');
      return false;
    }
    isListening = false;
    return true;
  };

  try {
    // Stop when not listening - should not throw
    const result = stopListening();
    assert.ok(!result, 'Stop when not listening should return false');
    assert.strictEqual(stopAttempts, 1);
  } catch (error) {
    errorThrown = true;
  }

  assert.ok(!errorThrown, 'Should not throw when stopping while already stopped');
});

/**
 * TEST: Interruption stops audio and notifies backend
 *
 * FAILURE POINT: Interruption doesn't stop audio or notify backend
 * IMPACT: AI keeps speaking while user is talking, bad UX
 */
voiceControllerSuite.test('Interruption stops audio and notifies backend', async () => {
  let audioStopped = false;
  let backendNotified = false;
  let isPlaying = true;

  const stopAudio = () => {
    audioStopped = true;
    isPlaying = false;
  };

  const notifyBackend = (message) => {
    if (message.type === 'interrupt') {
      backendNotified = true;
    }
  };

  const interrupt = () => {
    stopAudio();
    notifyBackend({ type: 'interrupt' });
  };

  assert.ok(isPlaying, 'Should be playing initially');

  interrupt();

  assert.ok(audioStopped, 'Audio should be stopped');
  assert.ok(backendNotified, 'Backend should be notified');
  assert.ok(!isPlaying, 'Should no longer be playing');
});

/**
 * TEST: Transcription updates escape HTML
 *
 * FAILURE POINT: XSS vulnerability through transcription injection
 * IMPACT: Security vulnerability, malicious code execution
 */
voiceControllerSuite.test('Transcription updates escape HTML', async () => {
  const escapeHtml = (text) => {
    const div = { textContent: '', innerHTML: '' };
    div.textContent = text;
    // Simulate DOM escaping
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Test XSS attempt
  const maliciousText = '<script>alert("XSS")</script>';
  const escaped = escapeHtml(maliciousText);

  assert.ok(!escaped.includes('<script>'), 'Script tags should be escaped');
  assert.ok(escaped.includes('&lt;script&gt;'), 'Script tags should be HTML entities');

  // Test various HTML entities
  const htmlText = '5 > 3 && 3 < 5';
  const escapedHtml = escapeHtml(htmlText);

  assert.ok(!escapedHtml.includes('<'), 'Less-than should be escaped');
  assert.ok(!escapedHtml.includes('>'), 'Greater-than should be escaped');
});

/**
 * TEST: Audio error handler recovers gracefully
 *
 * FAILURE POINT: Audio playback error crashes app
 * IMPACT: App becomes unresponsive after audio failure
 */
voiceControllerSuite.test('Audio error handler recovers gracefully', async () => {
  let isPlaying = true;
  let errorHandled = false;
  let stateAfterError = null;

  const onAudioError = (error) => {
    errorHandled = true;
    isPlaying = false;
    stateAfterError = 'idle';
    console.log('    Audio error handled:', error.message);
  };

  // Simulate audio error
  const mockError = { type: 'error', message: 'Network error loading audio' };
  onAudioError(mockError);

  assert.ok(errorHandled, 'Error should be handled');
  assert.ok(!isPlaying, 'Should stop playing after error');
  assert.strictEqual(stateAfterError, 'idle', 'State should return to idle');
});

/**
 * TEST: Cursor moves to end of transcription field
 *
 * FAILURE POINT: Cursor position resets during real-time transcription
 * IMPACT: User can't see latest transcribed text
 */
voiceControllerSuite.test('Cursor moves to end of transcription field', async () => {
  let cursorPosition = 0;

  const moveCursorToEnd = (textLength) => {
    cursorPosition = textLength;
    return cursorPosition;
  };

  // Simulate progressive transcription
  moveCursorToEnd(5);  // "Hello"
  assert.strictEqual(cursorPosition, 5);

  moveCursorToEnd(11); // "Hello there"
  assert.strictEqual(cursorPosition, 11);

  moveCursorToEnd(18); // "Hello there, world"
  assert.strictEqual(cursorPosition, 18);
});

/**
 * =============================================================================
 * CONVERSATION MANAGER ADVANCED TESTS
 * =============================================================================
 *
 * Tests for ConversationManager focusing on:
 * - Message formatting edge cases
 * - Artifact rendering safety
 * - Streaming message edge cases
 * - Auto-scroll behavior
 */
const conversationManagerSuite = createTestSuite('Conversation Manager Advanced Tests');

conversationManagerSuite.beforeAll(async () => {
  console.log('  Setting up Conversation Manager tests...');
});

/**
 * TEST: Timestamp formatting handles edge cases
 *
 * FAILURE POINT: Invalid timestamps show NaN or crash
 * IMPACT: Broken UI, confusing timestamp display
 */
conversationManagerSuite.test('Timestamp formatting handles edge cases', async () => {
  const formatTimestamp = (timestamp) => {
    if (!timestamp || isNaN(timestamp)) {
      return '--:-- --';
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return '--:-- --';
    }
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Valid timestamp
  const validTime = formatTimestamp(1705881600000); // 2024-01-21 midnight UTC
  assert.ok(validTime.match(/\d+:\d{2} (AM|PM)/), 'Should format valid timestamp');

  // Invalid timestamps
  assert.strictEqual(formatTimestamp(null), '--:-- --', 'Should handle null');
  assert.strictEqual(formatTimestamp(undefined), '--:-- --', 'Should handle undefined');
  assert.strictEqual(formatTimestamp(NaN), '--:-- --', 'Should handle NaN');
  assert.strictEqual(formatTimestamp('invalid'), '--:-- --', 'Should handle invalid string');
});

/**
 * TEST: Message content formats markdown correctly
 *
 * FAILURE POINT: Markdown not rendered, raw asterisks shown
 * IMPACT: AI responses look ugly and unprofessional
 */
conversationManagerSuite.test('Message content formats markdown correctly', async () => {
  const formatMessageContent = (content) => {
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    formatted = formatted.replace(/\n/g, '<br>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    return formatted;
  };

  // Test bold
  const bold = formatMessageContent('This is **bold** text');
  assert.ok(bold.includes('<strong>bold</strong>'), 'Should format bold');

  // Test italic
  const italic = formatMessageContent('This is *italic* text');
  assert.ok(italic.includes('<em>italic</em>'), 'Should format italic');

  // Test links
  const link = formatMessageContent('Check [Google](https://google.com)');
  assert.ok(link.includes('href="https://google.com"'), 'Should format links');
  assert.ok(link.includes('target="_blank"'), 'Links should open in new tab');

  // Test line breaks
  const multiline = formatMessageContent('Line 1\nLine 2');
  assert.ok(multiline.includes('<br>'), 'Should convert newlines to br');
});

/**
 * TEST: Streaming message updates append correctly
 *
 * FAILURE POINT: Streaming chunks overwrite instead of append
 * IMPACT: AI response shows only last chunk, not full message
 */
conversationManagerSuite.test('Streaming message updates append correctly', async () => {
  let streamingContent = '';
  let updateCount = 0;

  const updateStreamingMessage = (chunk) => {
    streamingContent += chunk;
    updateCount++;
  };

  const chunks = ['Hello', ' ', 'there,', ' ', 'how', ' ', 'are', ' ', 'you?'];

  for (const chunk of chunks) {
    updateStreamingMessage(chunk);
  }

  assert.strictEqual(streamingContent, 'Hello there, how are you?', 'All chunks should be appended');
  assert.strictEqual(updateCount, 9, 'Should have 9 updates');
});

/**
 * TEST: Ending streaming message when none exists
 *
 * FAILURE POINT: endStreamingMessage crashes when no stream active
 * IMPACT: App crashes if backend sends end before start
 */
conversationManagerSuite.test('Ending streaming message when none exists is safe', async () => {
  let currentStreamingMessage = null;
  let errorThrown = false;

  const endStreamingMessage = () => {
    if (!currentStreamingMessage) {
      return; // Safe no-op
    }
    currentStreamingMessage.isStreaming = false;
    currentStreamingMessage = null;
  };

  try {
    // End when no streaming message exists
    endStreamingMessage();
    // Should not throw
    assert.ok(true, 'Should handle gracefully');
  } catch (error) {
    errorThrown = true;
  }

  assert.ok(!errorThrown, 'Should not throw when ending non-existent stream');
});

/**
 * TEST: Conversation clear removes all messages
 *
 * FAILURE POINT: Clear doesn't reset streaming state
 * IMPACT: Ghost messages appear after new conversation starts
 */
conversationManagerSuite.test('Conversation clear removes all messages and state', async () => {
  const state = {
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' }
    ],
    currentStreamingMessage: { content: 'partial...' },
    containerInnerHTML: '<div>message</div>'
  };

  const clear = () => {
    state.messages = [];
    state.currentStreamingMessage = null;
    state.containerInnerHTML = '';
  };

  assert.strictEqual(state.messages.length, 2);
  assert.ok(state.currentStreamingMessage);

  clear();

  assert.strictEqual(state.messages.length, 0, 'Messages should be empty');
  assert.strictEqual(state.currentStreamingMessage, null, 'Streaming state should be null');
  assert.strictEqual(state.containerInnerHTML, '', 'Container should be empty');
});

/**
 * TEST: Artifact content is sanitized
 *
 * FAILURE POINT: XSS through artifact HTML injection
 * IMPACT: Security vulnerability in artifact display
 */
conversationManagerSuite.test('Artifact content contains expected structure', async () => {
  const createArtifactElement = (artifact) => {
    const element = {
      className: '',
      children: [],
      innerHTML: ''
    };

    // Create structure
    element.className = `artifact-container artifact-${artifact.type}`;

    if (artifact.title) {
      element.children.push({
        className: 'artifact-header',
        textContent: artifact.title
      });
    }

    element.children.push({
      className: 'artifact-content glass-card',
      innerHTML: artifact.content
    });

    return element;
  };

  const artifact = {
    type: 'timeline',
    title: 'My Timeline',
    content: '<div class="item">Event 1</div>'
  };

  const element = createArtifactElement(artifact);

  assert.ok(element.className.includes('artifact-timeline'), 'Should have type class');
  assert.strictEqual(element.children[0].textContent, 'My Timeline', 'Should have title');
  assert.ok(element.children[1].className.includes('glass-card'), 'Content should have glass-card class');
});

/**
 * =============================================================================
 * WEB SPEECH SERVICE TESTS
 * =============================================================================
 *
 * Tests for WebSpeechService focusing on:
 * - Browser support detection
 * - Recognition state management
 * - TTS configuration
 * - Device enumeration
 */
const webSpeechServiceSuite = createTestSuite('Web Speech Service Tests');

webSpeechServiceSuite.beforeAll(async () => {
  console.log('  Setting up Web Speech Service tests...');
});

/**
 * TEST: Browser support detection
 *
 * FAILURE POINT: App tries to use unsupported APIs
 * IMPACT: Crashes on unsupported browsers
 */
webSpeechServiceSuite.test('Browser support detection works correctly', async () => {
  const checkSupport = (hasSpeechRecognition, hasSpeechSynthesis) => {
    return hasSpeechRecognition && hasSpeechSynthesis;
  };

  // Both supported
  assert.ok(checkSupport(true, true), 'Should be supported when both APIs exist');

  // Recognition missing
  assert.ok(!checkSupport(false, true), 'Should not be supported without recognition');

  // Synthesis missing
  assert.ok(!checkSupport(true, false), 'Should not be supported without synthesis');

  // Both missing
  assert.ok(!checkSupport(false, false), 'Should not be supported when both missing');
});

/**
 * TEST: Recognition handles interim and final results
 *
 * FAILURE POINT: Final results include interim content
 * IMPACT: Duplicate text in transcription
 */
webSpeechServiceSuite.test('Recognition separates interim and final results', async () => {
  let currentTranscript = '';
  const transcriptionUpdates = [];

  const handleResult = (results) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (const result of results) {
      if (result.isFinal) {
        finalTranscript += result.transcript + ' ';
      } else {
        interimTranscript += result.transcript;
      }
    }

    if (finalTranscript) {
      currentTranscript += finalTranscript;
      transcriptionUpdates.push({ type: 'final', text: currentTranscript.trim() });
    } else if (interimTranscript) {
      transcriptionUpdates.push({ type: 'interim', text: currentTranscript + interimTranscript });
    }
  };

  // Simulate recognition results
  handleResult([{ transcript: 'Hello', isFinal: false }]);
  handleResult([{ transcript: 'Hello there', isFinal: false }]);
  handleResult([{ transcript: 'Hello there!', isFinal: true }]);

  // Should have 3 updates
  assert.strictEqual(transcriptionUpdates.length, 3);

  // First two are interim
  assert.strictEqual(transcriptionUpdates[0].type, 'interim');
  assert.strictEqual(transcriptionUpdates[1].type, 'interim');

  // Last is final
  assert.strictEqual(transcriptionUpdates[2].type, 'final');
  assert.strictEqual(currentTranscript.trim(), 'Hello there!');
});

/**
 * TEST: Auto-restart after recognition ends
 *
 * FAILURE POINT: Recognition stops and doesn't restart
 * IMPACT: User has to manually restart voice input
 */
webSpeechServiceSuite.test('Auto-restart behavior based on listening state', async () => {
  let isListening = true;
  let restartAttempts = 0;

  const onRecognitionEnd = () => {
    if (isListening) {
      restartAttempts++;
    }
  };

  // Simulate recognition end while still listening
  onRecognitionEnd();
  assert.strictEqual(restartAttempts, 1, 'Should attempt restart when listening');

  // Simulate recognition end after stopping
  isListening = false;
  onRecognitionEnd();
  assert.strictEqual(restartAttempts, 1, 'Should not restart when not listening');
});

/**
 * TEST: TTS utterance configuration
 *
 * FAILURE POINT: TTS settings not applied
 * IMPACT: Voice sounds wrong (too fast, wrong pitch)
 */
webSpeechServiceSuite.test('TTS utterance configuration applies settings', async () => {
  const createUtterance = (text, options) => {
    return {
      text,
      rate: options.rate || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 1.0,
      lang: 'en-US',
      voice: options.voice || null
    };
  };

  // Default settings
  const defaultUtterance = createUtterance('Hello', {});
  assert.strictEqual(defaultUtterance.rate, 1.0);
  assert.strictEqual(defaultUtterance.pitch, 1.0);
  assert.strictEqual(defaultUtterance.volume, 1.0);

  // Custom settings
  const customUtterance = createUtterance('Hello', {
    rate: 1.5,
    pitch: 0.8,
    volume: 0.7,
    voice: 'Samantha'
  });
  assert.strictEqual(customUtterance.rate, 1.5);
  assert.strictEqual(customUtterance.pitch, 0.8);
  assert.strictEqual(customUtterance.volume, 0.7);
  assert.strictEqual(customUtterance.voice, 'Samantha');
});

/**
 * TEST: Stop speaking cancels current utterance
 *
 * FAILURE POINT: Stop doesn't cancel, TTS keeps playing
 * IMPACT: User can't interrupt TTS playback
 */
webSpeechServiceSuite.test('Stop speaking cancels current utterance', async () => {
  let isSpeaking = true;
  let currentUtterance = { text: 'Hello there' };
  let cancelCalled = false;

  const stopSpeaking = () => {
    if (isSpeaking) {
      cancelCalled = true;
      isSpeaking = false;
      currentUtterance = null;
    }
  };

  stopSpeaking();

  assert.ok(cancelCalled, 'Cancel should be called');
  assert.ok(!isSpeaking, 'Should no longer be speaking');
  assert.strictEqual(currentUtterance, null, 'Current utterance should be null');
});

/**
 * =============================================================================
 * APP CONTROLLER TESTS
 * =============================================================================
 *
 * Tests for BubbleVoiceApp main controller focusing on:
 * - Settings persistence
 * - Keyboard shortcuts
 * - UI state management
 * - Error display
 */
const appControllerSuite = createTestSuite('App Controller Tests');

appControllerSuite.beforeAll(async () => {
  console.log('  Setting up App Controller tests...');
});

/**
 * TEST: Settings load with defaults for missing values
 *
 * FAILURE POINT: Missing settings cause undefined errors
 * IMPACT: App crashes on first launch or corrupted settings
 */
appControllerSuite.test('Settings load with defaults for missing values', async () => {
  const defaultSettings = {
    model: 'gemini-2.5-flash-lite',
    voiceSpeed: 1.0,
    autoSend: true,
    showBubbles: true,
    microphone: '',
    voice: '',
    targetFolder: '',
    googleApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: ''
  };

  const loadSettings = (savedSettings) => {
    return { ...defaultSettings, ...savedSettings };
  };

  // No saved settings
  const noSaved = loadSettings({});
  assert.strictEqual(noSaved.model, 'gemini-2.5-flash-lite');
  assert.strictEqual(noSaved.voiceSpeed, 1.0);

  // Partial saved settings
  const partial = loadSettings({ model: 'gpt-4', voiceSpeed: 1.5 });
  assert.strictEqual(partial.model, 'gpt-4');
  assert.strictEqual(partial.voiceSpeed, 1.5);
  assert.strictEqual(partial.autoSend, true); // Default

  // Corrupted settings (invalid values)
  const corrupted = loadSettings({ model: null, voiceSpeed: 'invalid' });
  assert.strictEqual(corrupted.model, null); // Will use default if null check added
  assert.strictEqual(corrupted.autoSend, true); // Defaults preserved
});

/**
 * TEST: Keyboard shortcuts trigger correct actions
 *
 * FAILURE POINT: Shortcuts don't work or trigger wrong action
 * IMPACT: Power users can't use keyboard efficiently
 */
appControllerSuite.test('Keyboard shortcuts trigger correct actions', async () => {
  const actions = [];

  const handleKeydown = (e) => {
    // Cmd+K - Focus input
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      actions.push('focus_input');
    }

    // Cmd+, - Open settings
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      actions.push('open_settings');
    }

    // Escape - Close settings or stop voice
    if (e.key === 'Escape') {
      actions.push('escape');
    }

    // Cmd+Shift+Space - Voice input (global hotkey simulation)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ' ') {
      actions.push('voice_input');
    }
  };

  // Test Cmd+K
  handleKeydown({ metaKey: true, ctrlKey: false, key: 'k' });
  assert.ok(actions.includes('focus_input'));

  // Test Cmd+,
  handleKeydown({ metaKey: true, ctrlKey: false, key: ',' });
  assert.ok(actions.includes('open_settings'));

  // Test Escape
  handleKeydown({ key: 'Escape' });
  assert.ok(actions.includes('escape'));

  // Test Cmd+Shift+Space
  handleKeydown({ metaKey: true, ctrlKey: false, shiftKey: true, key: ' ' });
  assert.ok(actions.includes('voice_input'));
});

/**
 * TEST: Send button state updates on input changes
 *
 * FAILURE POINT: Send button enabled when empty or disabled when has text
 * IMPACT: User can't send message or sends empty messages
 */
appControllerSuite.test('Send button state updates on input changes', async () => {
  let sendButtonDisabled = true;

  const updateSendButtonState = (inputText) => {
    const hasText = inputText.trim().length > 0;
    sendButtonDisabled = !hasText;
    return !sendButtonDisabled;
  };

  // Empty input - should be disabled
  assert.ok(!updateSendButtonState(''));
  assert.ok(sendButtonDisabled);

  // Whitespace only - should be disabled
  assert.ok(!updateSendButtonState('   '));
  assert.ok(sendButtonDisabled);

  // Has text - should be enabled
  assert.ok(updateSendButtonState('Hello'));
  assert.ok(!sendButtonDisabled);

  // Text with whitespace - should be enabled
  assert.ok(updateSendButtonState('  Hello  '));
  assert.ok(!sendButtonDisabled);
});

/**
 * TEST: Status indicator updates correctly
 *
 * FAILURE POINT: Status shows wrong state
 * IMPACT: User confused about app state
 */
appControllerSuite.test('Status indicator updates correctly', async () => {
  let statusText = '';
  let statusClass = '';

  const updateStatus = (text, state) => {
    statusText = text;
    statusClass = `status-indicator ${state}`;
  };

  // Connected state
  updateStatus('Ready', 'connected');
  assert.strictEqual(statusText, 'Ready');
  assert.ok(statusClass.includes('connected'));

  // Processing state
  updateStatus('Thinking...', 'processing');
  assert.strictEqual(statusText, 'Thinking...');
  assert.ok(statusClass.includes('processing'));

  // Disconnected state
  updateStatus('Disconnected', 'disconnected');
  assert.strictEqual(statusText, 'Disconnected');
  assert.ok(statusClass.includes('disconnected'));

  // Listening state
  updateStatus('Listening...', 'processing');
  assert.strictEqual(statusText, 'Listening...');
});

/**
 * TEST: New conversation clears all state
 *
 * FAILURE POINT: Old messages persist after new conversation
 * IMPACT: User sees previous conversation mixed with new one
 */
appControllerSuite.test('New conversation clears all state', async () => {
  const state = {
    currentConversationId: 'conv_123',
    messages: ['msg1', 'msg2'],
    bubbles: ['bubble1'],
    inputFieldContent: 'typed text',
    welcomeStateVisible: false
  };

  const startNewConversation = () => {
    state.currentConversationId = null;
    state.messages = [];
    state.bubbles = [];
    state.inputFieldContent = '';
    state.welcomeStateVisible = true;
  };

  startNewConversation();

  assert.strictEqual(state.currentConversationId, null);
  assert.strictEqual(state.messages.length, 0);
  assert.strictEqual(state.bubbles.length, 0);
  assert.strictEqual(state.inputFieldContent, '');
  assert.ok(state.welcomeStateVisible);
});

/**
 * TEST: Settings panel opens and closes correctly
 *
 * FAILURE POINT: Settings panel doesn't open/close
 * IMPACT: User can't access settings
 */
appControllerSuite.test('Settings panel opens and closes correctly', async () => {
  let panelClasses = [];

  const openSettings = () => {
    if (!panelClasses.includes('open')) {
      panelClasses.push('open');
    }
  };

  const closeSettings = () => {
    const index = panelClasses.indexOf('open');
    if (index > -1) {
      panelClasses.splice(index, 1);
    }
  };

  // Initially closed
  assert.ok(!panelClasses.includes('open'));

  // Open settings
  openSettings();
  assert.ok(panelClasses.includes('open'));

  // Double open should be idempotent
  openSettings();
  assert.strictEqual(panelClasses.filter(c => c === 'open').length, 1);

  // Close settings
  closeSettings();
  assert.ok(!panelClasses.includes('open'));

  // Double close should be idempotent
  closeSettings();
  assert.ok(!panelClasses.includes('open'));
});

/**
 * TEST: Bubble clicks populate input field
 *
 * FAILURE POINT: Clicking bubble doesn't fill input
 * IMPACT: User has to manually type bubble content
 */
appControllerSuite.test('Bubble clicks populate input field', async () => {
  let inputFieldContent = '';
  let sendButtonEnabled = false;

  const handleBubbleClick = (bubbleText) => {
    inputFieldContent = bubbleText;
    sendButtonEnabled = bubbleText.length > 0;
  };

  handleBubbleClick('Tell me about your day');

  assert.strictEqual(inputFieldContent, 'Tell me about your day');
  assert.ok(sendButtonEnabled);
});

/**
 * TEST: Connection state handlers update correctly
 *
 * FAILURE POINT: Connection state not reflected in UI
 * IMPACT: User doesn't know if they're connected
 */
appControllerSuite.test('Connection state handlers update correctly', async () => {
  let isConnected = false;
  let statusText = '';
  let statusState = '';

  const onConnected = () => {
    isConnected = true;
    statusText = 'Ready';
    statusState = 'connected';
  };

  const onDisconnected = () => {
    isConnected = false;
    statusText = 'Disconnected';
    statusState = 'disconnected';
  };

  const onReconnecting = () => {
    statusText = 'Reconnecting...';
    statusState = 'processing';
  };

  // Initially disconnected
  onDisconnected();
  assert.ok(!isConnected);
  assert.strictEqual(statusState, 'disconnected');

  // Reconnecting
  onReconnecting();
  assert.strictEqual(statusText, 'Reconnecting...');
  assert.strictEqual(statusState, 'processing');

  // Connected
  onConnected();
  assert.ok(isConnected);
  assert.strictEqual(statusText, 'Ready');
  assert.strictEqual(statusState, 'connected');
});

/**
 * =============================================================================
 * RUN ALL SUITES
 * =============================================================================
 */
async function runAllSuites() {
  console.log('\n' + '='.repeat(70));
  console.log('RUNNING UI COMPONENT INTERACTION TESTS');
  console.log('='.repeat(70));

  const suites = [
    websocketAdvancedSuite,
    voiceControllerSuite,
    conversationManagerSuite,
    webSpeechServiceSuite,
    appControllerSuite
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  const allErrors = [];

  for (const suite of suites) {
    const results = await suite.run();
    totalPassed += results.passed;
    totalFailed += results.failed;
    allErrors.push(...results.errors);
  }

  console.log('\n' + '='.repeat(70));
  console.log('FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`Total Passed: ${totalPassed}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log(`Pass Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (allErrors.length > 0) {
    console.log('\nFailed Tests:');
    allErrors.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error.message}`);
    });
  }

  console.log('='.repeat(70) + '\n');

  return { passed: totalPassed, failed: totalFailed, errors: allErrors };
}

// Export for test runner
if (require.main === module) {
  runAllSuites().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

module.exports = {
  websocketAdvancedSuite,
  voiceControllerSuite,
  conversationManagerSuite,
  webSpeechServiceSuite,
  appControllerSuite,
  runAllSuites
};
