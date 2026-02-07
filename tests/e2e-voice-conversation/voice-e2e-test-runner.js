/**
 * BUBBLEVOICE E2E VOICE CONVERSATION TEST RUNNER
 * 
 * PURPOSE:
 * End-to-end testing of the complete voice conversation pipeline:
 *   Say command → Microphone → SpeechAnalyzer → Backend → LLM → TTS → Speaker
 * 
 * HOW IT WORKS:
 * 1. Connects to the running BubbleVoice app via WebSocket (port 7483)
 * 2. Sends start_voice_input to begin recording
 * 3. Uses macOS `say` command to speak test phrases into the mic
 * 4. Monitors WebSocket messages for transcription_update, user_message, ai_response
 * 5. Logs every event with timestamps for analysis
 * 6. Verifies end-to-end flow: STT → LLM → TTS → back to listening
 * 
 * PREREQUISITES:
 * - BubbleVoice app running (npm run dev)
 * - Gemini API key configured in the app
 * - System volume high enough for `say` to be picked up by mic
 * - Mac speakers and mic active (NOT headphones with sidetone)
 * 
 * USAGE:
 *   node voice-e2e-test-runner.js [scenario]
 *   node voice-e2e-test-runner.js all
 *   node voice-e2e-test-runner.js basic_roundtrip
 * 
 * PRODUCT CONTEXT:
 * This test suite exists because the user reported persistent bugs in the voice
 * pipeline — choppy transcription, premature sends, dead turns after interruptions.
 * We need to systematically verify each component and log evidence for debugging.
 * 
 * CREATED: 2026-02-07 by AI after comprehensive SpeechAnalyzer audit
 */

const WebSocket = require('ws');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================

const WEBSOCKET_URL = 'ws://localhost:7483';
const LOG_DIR = path.join(__dirname, 'logs');
const DOCS_DIR = path.join(__dirname, 'docs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

// ============================================================
// LOGGING INFRASTRUCTURE
// ============================================================

/**
 * TestLogger: Writes timestamped logs to both console and file.
 * Each test run gets its own log file so we can review later
 * without overloading context.
 */
class TestLogger {
  constructor(testName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(LOG_DIR, `${testName}_${timestamp}.log`);
    this.testName = testName;
    this.startTime = Date.now();
    this.events = [];
    
    // Write header
    this._write(`=== E2E Voice Test: ${testName} ===`);
    this._write(`Started: ${new Date().toISOString()}`);
    this._write(`WebSocket: ${WEBSOCKET_URL}`);
    this._write('---');
  }
  
  log(message) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const line = `[${elapsed}s] ${message}`;
    console.log(`[${this.testName}] ${line}`);
    this._write(line);
  }
  
  event(type, data) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const entry = { elapsed: parseFloat(elapsed), type, data, wallTime: Date.now() };
    this.events.push(entry);
    
    // Log to file with full data
    const dataStr = typeof data === 'object' ? JSON.stringify(data).substring(0, 300) : String(data);
    this.log(`EVENT: ${type} | ${dataStr}`);
  }
  
  error(message) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const line = `[${elapsed}s] ERROR: ${message}`;
    console.error(`[${this.testName}] ${line}`);
    this._write(line);
  }
  
  summary(results) {
    this._write('\n=== TEST SUMMARY ===');
    for (const [key, value] of Object.entries(results)) {
      this._write(`  ${key}: ${value}`);
    }
    this._write(`Total events logged: ${this.events.length}`);
    this._write(`Duration: ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
    this._write('=== END ===');
  }
  
  _write(line) {
    fs.appendFileSync(this.logFile, line + '\n');
  }
  
  getLogPath() { return this.logFile; }
  getEvents() { return this.events; }
}


// ============================================================
// WEBSOCKET CLIENT WRAPPER
// ============================================================

/**
 * BubbleVoiceWSClient: Connects to the running BubbleVoice app
 * and provides helpers for sending commands and waiting for specific events.
 * 
 * WHY NOT USE THE APP's OWN WebSocket CLIENT:
 * We need a standalone test harness that runs OUTSIDE the Electron renderer.
 * This connects directly to the backend WebSocket server on port 7483.
 */
class BubbleVoiceWSClient {
  constructor(logger) {
    this.logger = logger;
    this.ws = null;
    this.messageHandlers = [];
    this.allMessages = [];
    this.connected = false;
  }
  
  /**
   * Connect to the WebSocket server.
   * Returns a promise that resolves when connected and ready.
   */
  connect() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout (10s) — is the app running?'));
      }, 10000);
      
      this.ws = new WebSocket(WEBSOCKET_URL);
      
      this.ws.on('open', () => {
        this.connected = true;
        clearTimeout(timeout);
        this.logger.log('WebSocket connected to BubbleVoice backend');
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.allMessages.push({ time: Date.now(), ...msg });
          this.logger.event(`ws:${msg.type}`, msg.data || {});
          
          // Notify all registered handlers
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch (e) {
          this.logger.error(`Failed to parse WS message: ${e.message}`);
        }
      });
      
      this.ws.on('error', (err) => {
        this.logger.error(`WebSocket error: ${err.message}`);
        clearTimeout(timeout);
        reject(err);
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        this.logger.log('WebSocket closed');
      });
    });
  }
  
  /**
   * Send a JSON message to the backend.
   */
  send(message) {
    if (!this.connected) throw new Error('WebSocket not connected');
    this.logger.log(`SEND: ${JSON.stringify(message).substring(0, 200)}`);
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * Wait for a specific message type to arrive.
   * Returns the first matching message within the timeout.
   * 
   * @param {string} type - Message type to wait for
   * @param {number} timeoutMs - Max wait time
   * @param {Function} filter - Optional additional filter on message data
   */
  waitForMessage(type, timeoutMs = 30000, filter = null) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove handler
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        reject(new Error(`Timeout waiting for '${type}' after ${timeoutMs}ms`));
      }, timeoutMs);
      
      const handler = (msg) => {
        if (msg.type === type) {
          if (filter && !filter(msg)) return; // filter didn't match, keep waiting
          clearTimeout(timeout);
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          resolve(msg);
        }
      };
      
      this.messageHandlers.push(handler);
    });
  }
  
  /**
   * Collect all messages of a given type for a duration.
   * Useful for gathering all transcription_updates during speech.
   * 
   * @param {string} type - Message type to collect
   * @param {number} durationMs - How long to collect
   */
  collectMessages(type, durationMs) {
    return new Promise((resolve) => {
      const collected = [];
      const handler = (msg) => {
        if (msg.type === type) {
          collected.push(msg);
        }
      };
      this.messageHandlers.push(handler);
      
      setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        resolve(collected);
      }, durationMs);
    });
  }
  
  /**
   * Wait for the full AI response cycle to complete:
   * transcription_update → user_message → ai_response
   * 
   * NOTE (2026-02-07): speech_started / speech_ended are NOT forwarded via WebSocket
   * to external clients — they are handled internally by VoicePipelineService.
   * So we detect cycle completion from ai_response + a short delay for TTS to start.
   * 
   * Returns all collected messages from the cycle.
   */
  waitForFullCycle(timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        resolve({
          completed: !!aiResp,  // If we got ai_response, it's "mostly" complete even if timed out
          transcriptions,
          userMessage: userMsg,
          aiResponse: aiResp,
          speechEvents,
          timedOut: true
        });
      }, timeoutMs);
      
      const transcriptions = [];
      let userMsg = null;
      let aiResp = null;
      const speechEvents = [];
      
      const handler = (msg) => {
        if (msg.type === 'transcription_update') {
          transcriptions.push(msg);
        } else if (msg.type === 'user_message') {
          userMsg = msg;
        } else if (msg.type === 'ai_response') {
          aiResp = msg;
          // ai_response means the LLM cycle is done.
          // Wait a bit for TTS to play and system to stabilize.
          clearTimeout(timeout);
          this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
          setTimeout(() => {
            resolve({
              completed: true,
              transcriptions,
              userMessage: userMsg,
              aiResponse: aiResp,
              speechEvents,
              timedOut: false
            });
          }, 2000); // 2s for TTS + reset_recognition + new listen
        } else if (msg.type === 'speech_not_captured') {
          speechEvents.push(msg);
        }
      };
      
      this.messageHandlers.push(handler);
    });
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
  
  getAllMessages() { return this.allMessages; }
}


// ============================================================
// SAY COMMAND HELPER
// ============================================================

/**
 * Speak text using macOS `say` command.
 * This outputs audio through the system speaker, which the mic picks up.
 * 
 * WHY NOT USE AN AUDIO FILE:
 * `say` generates speech in real-time with natural timing, which is more
 * realistic than playing a pre-recorded file. It tests the full audio path.
 * 
 * IMPORTANT: System volume must be set so the mic can hear the speaker.
 * The user confirmed this works from previous testing sessions.
 */
function sayCommand(text, rate = 200) {
  return new Promise((resolve, reject) => {
    const child = exec(`say -r ${rate} "${text.replace(/"/g, '\\"')}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Speak text and wait for it to complete, with a delay after.
 * The delay gives the STT pipeline time to process the audio.
 */
async function speakAndWait(text, logger, postDelayMs = 500, rate = 200) {
  logger.log(`SPEAKING: "${text}" (rate: ${rate})`);
  await sayCommand(text, rate);
  logger.log(`DONE SPEAKING, waiting ${postDelayMs}ms for pipeline...`);
  await sleep(postDelayMs);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
// TEST SCENARIOS
// ============================================================

/**
 * SCENARIO 1: BASIC ROUND-TRIP
 * 
 * The simplest possible test: say one sentence, verify it gets
 * transcribed, sent to LLM, and a response comes back.
 * 
 * VALIDATES:
 * - WebSocket connectivity
 * - start_voice_input command works
 * - SpeechAnalyzer transcribes spoken audio
 * - Timer cascade fires and sends to LLM
 * - LLM generates a response
 * - Response is sent back to frontend
 * - stop_voice_input cleans up
 */
async function testBasicRoundtrip() {
  const logger = new TestLogger('basic_roundtrip');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    // Start voice input
    logger.log('Sending start_voice_input...');
    client.send({
      type: 'start_voice_input',
      settings: {
        language: 'en-US',
        continuous: true,
        model: 'gemini-2.5-flash'
      }
    });
    
    // Wait for listening to be active
    logger.log('Waiting for listening_active...');
    try {
      await client.waitForMessage('listening_active', 15000);
      logger.log('Listening is active!');
    } catch (e) {
      logger.log('Did not receive listening_active (may already be listening). Proceeding...');
    }
    
    // Give audio engine a moment to stabilize
    await sleep(2000);
    
    // Start collecting the full response cycle
    const cyclePromise = client.waitForFullCycle(60000);
    
    // Speak a test sentence
    await speakAndWait(
      "Hello, I am testing the voice pipeline. Can you tell me what two plus two equals?",
      logger,
      1000, // post-delay: let silence timers trigger
      180   // slower rate for clarity
    );
    
    // Wait for the full cycle
    logger.log('Waiting for full cycle (transcription → LLM → response)...');
    const result = await cyclePromise;
    
    // Analyze results
    const transcriptionTexts = result.transcriptions
      .map(t => t.data?.text || '')
      .filter(t => t.length > 0);
    
    logger.summary({
      'Test': 'basic_roundtrip',
      'Status': result.completed ? 'PASS' : (result.timedOut ? 'TIMEOUT' : 'FAIL'),
      'Transcriptions received': result.transcriptions.length,
      'Last transcription': transcriptionTexts[transcriptionTexts.length - 1] || '(none)',
      'User message sent': result.userMessage ? 'YES' : 'NO',
      'User message text': result.userMessage?.data?.text || '(none)',
      'AI response received': result.aiResponse ? 'YES' : 'NO',
      'AI response text': (result.aiResponse?.data?.text || '(none)').substring(0, 200),
      'Speech events': result.speechEvents.map(e => e.type).join(', ') || '(none)',
      'Timed out': result.timedOut ? 'YES' : 'NO'
    });
    
    // Stop voice input
    logger.log('Stopping voice input...');
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    return { pass: result.completed && !!result.aiResponse, logger };
    
  } catch (err) {
    logger.error(`Test failed with exception: ${err.message}`);
    logger.summary({ 'Status': 'ERROR', 'Error': err.message });
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


/**
 * SCENARIO 2: MULTI-TURN CONVERSATION
 * 
 * Tests 3 consecutive conversation turns to verify:
 * - Session resets between turns (Finding #1: accumulation)
 * - Each turn gets a fresh transcription
 * - LLM maintains conversation context
 * - No text bleed between turns
 */
async function testMultiTurnConversation() {
  const logger = new TestLogger('multi_turn_conversation');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    // Start voice input
    client.send({
      type: 'start_voice_input',
      settings: { language: 'en-US', continuous: true, model: 'gemini-2.5-flash' }
    });
    
    try { await client.waitForMessage('listening_active', 15000); } catch(e) {}
    await sleep(2000);
    
    const turns = [
      { text: "My name is Alexander. Please remember that.", expectedContains: null },
      { text: "What is the capital of France?", expectedContains: "paris" },
      { text: "Do you remember my name? What is it?", expectedContains: "alexander" }
    ];
    
    const turnResults = [];
    
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      logger.log(`\n--- TURN ${i + 1}/${turns.length} ---`);
      logger.log(`Speaking: "${turn.text}"`);
      
      const cyclePromise = client.waitForFullCycle(60000);
      await speakAndWait(turn.text, logger, 1000, 175);
      
      logger.log(`Waiting for full cycle on turn ${i + 1}...`);
      const result = await cyclePromise;
      
      const aiText = result.aiResponse?.data?.text || '';
      const passed = result.completed && result.aiResponse;
      const contextCheck = turn.expectedContains 
        ? aiText.toLowerCase().includes(turn.expectedContains)
        : true;
      
      turnResults.push({
        turn: i + 1,
        spoke: turn.text,
        transcribed: result.userMessage?.data?.text || '(none)',
        aiResponse: aiText.substring(0, 200),
        completed: result.completed,
        contextCorrect: contextCheck,
        transcriptionCount: result.transcriptions.length
      });
      
      logger.log(`Turn ${i + 1}: completed=${result.completed}, AI="${aiText.substring(0, 100)}"`);
      
      // Wait for TTS to finish and system to reset before next turn
      // The speech_ended event should trigger a reset_recognition
      if (i < turns.length - 1) {
        logger.log('Waiting for system to reset before next turn...');
        await sleep(3000);
      }
    }
    
    logger.summary({
      'Test': 'multi_turn_conversation',
      'Turns completed': turnResults.filter(r => r.completed).length + '/' + turns.length,
      'Context maintained': turnResults.filter(r => r.contextCorrect).length + '/' + turns.length,
      ...turnResults.reduce((acc, r) => {
        acc[`Turn ${r.turn} transcribed`] = r.transcribed;
        acc[`Turn ${r.turn} AI response`] = r.aiResponse;
        acc[`Turn ${r.turn} context check`] = r.contextCorrect ? 'PASS' : 'FAIL';
        return acc;
      }, {})
    });
    
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    const allPassed = turnResults.every(r => r.completed && r.contextCorrect);
    return { pass: allPassed, logger, turnResults };
    
  } catch (err) {
    logger.error(`Test failed: ${err.message}`);
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


/**
 * SCENARIO 3: INTERRUPTION TEST
 * 
 * Tests what happens when the user speaks while the AI is responding.
 * 
 * Flow:
 * 1. Ask a question that generates a long AI response
 * 2. While the AI is speaking (TTS), start speaking again
 * 3. Verify the AI stops, and the new utterance is processed
 * 
 * VALIDATES:
 * - TTS stops on interruption
 * - Timer cascade resets correctly
 * - New transcription starts clean (no bleed from AI's TTS)
 * - Pipeline doesn't go dead after interruption
 */
async function testInterruption() {
  const logger = new TestLogger('interruption');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    client.send({
      type: 'start_voice_input',
      settings: { language: 'en-US', continuous: true, model: 'gemini-2.5-flash' }
    });
    
    try { await client.waitForMessage('listening_active', 15000); } catch(e) {}
    await sleep(2000);
    
    // TURN 1: Ask a question that will generate a long response
    logger.log('--- TURN 1: Ask for long response ---');
    const cycle1Promise = client.waitForFullCycle(60000);
    await speakAndWait(
      "Tell me a very detailed story about a wizard who discovers a magical library. Make it at least five sentences long.",
      logger, 1000, 175
    );
    
    const cycle1 = await cycle1Promise;
    logger.log(`Turn 1 complete: AI response length = ${(cycle1.aiResponse?.data?.text || '').length} chars`);
    
    // Wait for TTS to START playing (speech_started)
    logger.log('Waiting for AI to start speaking via TTS...');
    
    // The AI should start speaking. Give it a moment to begin TTS
    await sleep(2000);
    
    // NOW INTERRUPT: Speak while the AI is talking
    logger.log('--- INTERRUPTION: Speaking while AI talks ---');
    const cycle2Promise = client.waitForFullCycle(60000);
    
    // Speak the interruption — this should trigger handleSpeechDetected
    await speakAndWait(
      "Stop! I want to change the topic. What is the weather like on Mars?",
      logger, 1000, 190
    );
    
    logger.log('Waiting for interrupted cycle result...');
    const cycle2 = await cycle2Promise;
    
    const interruptionWorked = cycle2.completed && cycle2.aiResponse;
    const noBleed = !(cycle2.userMessage?.data?.text || '').toLowerCase().includes('wizard');
    
    logger.summary({
      'Test': 'interruption',
      'Turn 1 completed': cycle1.completed ? 'YES' : 'NO',
      'Turn 1 AI length': (cycle1.aiResponse?.data?.text || '').length + ' chars',
      'Interruption response received': cycle2.completed ? 'YES' : 'NO',
      'Interruption text': (cycle2.userMessage?.data?.text || '(none)').substring(0, 200),
      'Interruption AI response': (cycle2.aiResponse?.data?.text || '(none)').substring(0, 200),
      'No text bleed from turn 1': noBleed ? 'PASS' : 'FAIL',
      'Interruption worked': interruptionWorked ? 'PASS' : 'FAIL'
    });
    
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    return { pass: interruptionWorked, logger };
    
  } catch (err) {
    logger.error(`Test failed: ${err.message}`);
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


/**
 * SCENARIO 4: SHORT UTTERANCE TEST
 * 
 * Tests the single-word flush mechanism (Finding #11).
 * Says very short phrases and checks if they get through.
 * 
 * VALIDATES:
 * - "Yes" / "No" / "OK" get transcribed (or speech_not_captured fires)
 * - Timer cascade handles short utterances
 * - UI feedback works for swallowed utterances
 */
async function testShortUtterances() {
  const logger = new TestLogger('short_utterances');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    client.send({
      type: 'start_voice_input',
      settings: { language: 'en-US', continuous: true, model: 'gemini-2.5-flash' }
    });
    
    try { await client.waitForMessage('listening_active', 15000); } catch(e) {}
    await sleep(2000);
    
    // First give context so short answers make sense
    logger.log('--- SETUP: Ask a yes/no question ---');
    const setupPromise = client.waitForFullCycle(60000);
    await speakAndWait(
      "I'm going to test short responses. Ask me a yes or no question.",
      logger, 1000, 175
    );
    const setupResult = await setupPromise;
    logger.log(`Setup complete: AI asked: "${(setupResult.aiResponse?.data?.text || '').substring(0, 100)}"`);
    
    // Wait for TTS to finish
    await sleep(5000);
    
    const shortPhrases = [
      { text: "Yes", expectTranscription: false },     // Very short - may be swallowed
      { text: "No I don't think so", expectTranscription: true },  // Longer - should work
      { text: "OK sure thing", expectTranscription: true },        // Medium - borderline
    ];
    
    const phraseResults = [];
    
    for (let i = 0; i < shortPhrases.length; i++) {
      const phrase = shortPhrases[i];
      logger.log(`\n--- SHORT PHRASE ${i + 1}: "${phrase.text}" ---`);
      
      // Collect all messages for 15 seconds after speaking
      const collectedTranscriptions = [];
      const collectedSpeechEvents = [];
      let gotUserMessage = false;
      let gotAiResponse = false;
      
      const handler = (msg) => {
        if (msg.type === 'transcription_update') collectedTranscriptions.push(msg);
        if (msg.type === 'user_message') gotUserMessage = true;
        if (msg.type === 'ai_response') gotAiResponse = true;
        if (msg.type === 'speech_not_captured') collectedSpeechEvents.push(msg);
        if (msg.type === 'speech_energy_silence') collectedSpeechEvents.push(msg);
      };
      client.messageHandlers.push(handler);
      
      await speakAndWait(phrase.text, logger, 500, 200);
      
      // Wait long enough for the timer cascade + LLM + TTS cycle
      await sleep(15000);
      
      client.messageHandlers = client.messageHandlers.filter(h => h !== handler);
      
      const hadTranscription = collectedTranscriptions.length > 0;
      const lastTranscription = collectedTranscriptions[collectedTranscriptions.length - 1]?.data?.text || '(none)';
      
      phraseResults.push({
        phrase: phrase.text,
        transcriptions: collectedTranscriptions.length,
        lastTranscription,
        gotUserMessage,
        gotAiResponse,
        speechNotCaptured: collectedSpeechEvents.filter(e => e.type === 'speech_not_captured').length > 0,
        hadTranscription
      });
      
      logger.log(`Phrase "${phrase.text}": ${collectedTranscriptions.length} transcriptions, userMsg=${gotUserMessage}, aiResp=${gotAiResponse}`);
      
      // Wait between phrases for system to stabilize
      await sleep(3000);
    }
    
    logger.summary({
      'Test': 'short_utterances',
      ...phraseResults.reduce((acc, r, i) => {
        acc[`Phrase ${i + 1} ("${r.phrase}")`] = `transcriptions=${r.transcriptions}, userMsg=${r.gotUserMessage}, aiResp=${r.gotAiResponse}, speechNotCaptured=${r.speechNotCaptured}`;
        return acc;
      }, {})
    });
    
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    // At least the longer phrases should work
    const longerPhrasesWorked = phraseResults.slice(1).every(r => r.hadTranscription);
    return { pass: longerPhrasesWorked, logger, phraseResults };
    
  } catch (err) {
    logger.error(`Test failed: ${err.message}`);
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


/**
 * SCENARIO 5: RAPID-FIRE TURNS
 * 
 * Tests quick back-and-forth exchanges to stress the pipeline.
 * Each exchange: speak → get AI response → speak again immediately.
 * 
 * VALIDATES:
 * - Pipeline resets correctly between rapid turns
 * - No text accumulation across turns (Finding #1)
 * - Timer cascade handles rapid fire without deadlocking
 */
async function testRapidFireTurns() {
  const logger = new TestLogger('rapid_fire_turns');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    client.send({
      type: 'start_voice_input',
      settings: { language: 'en-US', continuous: true, model: 'gemini-2.5-flash' }
    });
    
    try { await client.waitForMessage('listening_active', 15000); } catch(e) {}
    await sleep(2000);
    
    const quickPrompts = [
      "What is five times three?",
      "What color is the sky?",
      "Name a fruit that is red.",
      "How many legs does a cat have?"
    ];
    
    const turnResults = [];
    
    for (let i = 0; i < quickPrompts.length; i++) {
      logger.log(`\n--- RAPID TURN ${i + 1}: "${quickPrompts[i]}" ---`);
      
      const cyclePromise = client.waitForFullCycle(45000);
      await speakAndWait(quickPrompts[i], logger, 800, 200);
      
      const result = await cyclePromise;
      
      turnResults.push({
        turn: i + 1,
        prompt: quickPrompts[i],
        transcribed: result.userMessage?.data?.text || '(none)',
        aiResponse: (result.aiResponse?.data?.text || '(none)').substring(0, 150),
        completed: result.completed,
        timedOut: result.timedOut,
        transcriptionCount: result.transcriptions.length
      });
      
      logger.log(`Turn ${i + 1}: completed=${result.completed}, response="${(result.aiResponse?.data?.text || '').substring(0, 80)}"`);
      
      // Minimal wait between turns — stress test the reset mechanism
      await sleep(2000);
    }
    
    logger.summary({
      'Test': 'rapid_fire_turns',
      'Turns completed': turnResults.filter(r => r.completed).length + '/' + quickPrompts.length,
      ...turnResults.reduce((acc, r) => {
        acc[`Turn ${r.turn}`] = `"${r.prompt}" → completed=${r.completed}, transcribed="${r.transcribed}"`;
        return acc;
      }, {})
    });
    
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    return { 
      pass: turnResults.filter(r => r.completed).length >= 3, // at least 3/4 should work
      logger, 
      turnResults 
    };
    
  } catch (err) {
    logger.error(`Test failed: ${err.message}`);
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


/**
 * SCENARIO 6: LONG UTTERANCE TEST
 * 
 * Tests a long multi-sentence utterance to verify:
 * - SpeechAnalyzer handles long-form speech (its intended use case)
 * - Timer cascade doesn't fire prematurely
 * - Adaptive delay works (longer speech = less premature send risk)
 * - Full text is captured without truncation
 */
async function testLongUtterance() {
  const logger = new TestLogger('long_utterance');
  const client = new BubbleVoiceWSClient(logger);
  
  try {
    await client.connect();
    
    client.send({
      type: 'start_voice_input',
      settings: { language: 'en-US', continuous: true, model: 'gemini-2.5-flash' }
    });
    
    try { await client.waitForMessage('listening_active', 15000); } catch(e) {}
    await sleep(2000);
    
    const longText = "I want to tell you about my day today. " +
      "First I woke up early and made coffee. " +
      "Then I went for a walk in the park near my house. " +
      "The weather was beautiful with clear blue skies. " +
      "After that I came home and worked on a coding project. " +
      "I had lunch at noon, a sandwich and some soup. " +
      "In the afternoon I read a book about artificial intelligence.";
    
    const wordCount = longText.split(/\s+/).length;
    logger.log(`Long utterance: ${wordCount} words`);
    
    const cyclePromise = client.waitForFullCycle(90000);
    
    // Speak at normal rate — this will take ~20 seconds
    await speakAndWait(longText, logger, 2000, 160);
    
    const result = await cyclePromise;
    
    const transcribedText = result.userMessage?.data?.text || '';
    const transcribedWordCount = transcribedText.split(/\s+/).length;
    
    // Check that most words were captured (allowing for minor STT differences)
    const wordCaptureRatio = transcribedWordCount / wordCount;
    
    logger.summary({
      'Test': 'long_utterance',
      'Status': result.completed ? 'PASS' : 'FAIL',
      'Words spoken': wordCount,
      'Words transcribed': transcribedWordCount,
      'Capture ratio': (wordCaptureRatio * 100).toFixed(0) + '%',
      'Transcribed text': transcribedText.substring(0, 300),
      'AI response': (result.aiResponse?.data?.text || '(none)').substring(0, 200),
      'Transcription updates': result.transcriptions.length,
      'Premature send': wordCaptureRatio < 0.5 ? 'YES (BUG!)' : 'NO'
    });
    
    client.send({ type: 'stop_voice_input' });
    await sleep(1000);
    
    return { 
      pass: result.completed && wordCaptureRatio > 0.5,
      logger 
    };
    
  } catch (err) {
    logger.error(`Test failed: ${err.message}`);
    return { pass: false, logger };
  } finally {
    client.disconnect();
  }
}


// ============================================================
// TEST RUNNER
// ============================================================

const SCENARIOS = {
  basic_roundtrip: testBasicRoundtrip,
  multi_turn: testMultiTurnConversation,
  interruption: testInterruption,
  short_utterances: testShortUtterances,
  rapid_fire: testRapidFireTurns,
  long_utterance: testLongUtterance,
};

async function runAll() {
  console.log('\n=== BubbleVoice E2E Voice Conversation Test Suite ===\n');
  console.log(`Scenarios: ${Object.keys(SCENARIOS).join(', ')}\n`);
  
  const results = {};
  const summaryLines = [];
  
  for (const [name, testFn] of Object.entries(SCENARIOS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RUNNING: ${name}`);
    console.log('='.repeat(60));
    
    try {
      const result = await testFn();
      results[name] = result;
      const status = result.pass ? 'PASS' : 'FAIL';
      summaryLines.push(`${status}: ${name} (log: ${result.logger.getLogPath()})`);
      console.log(`\n>>> ${name}: ${status} <<<\n`);
    } catch (err) {
      results[name] = { pass: false, error: err.message };
      summaryLines.push(`ERROR: ${name} — ${err.message}`);
      console.log(`\n>>> ${name}: ERROR — ${err.message} <<<\n`);
    }
    
    // Brief pause between scenarios
    await sleep(3000);
  }
  
  // Write overall summary
  const summaryFile = path.join(DOCS_DIR, `test-run-summary_${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  const summaryContent = [
    '# E2E Voice Conversation Test Results',
    '',
    `**Date**: ${new Date().toISOString()}`,
    `**WebSocket**: ${WEBSOCKET_URL}`,
    '',
    '## Results',
    '',
    ...summaryLines.map(l => `- ${l}`),
    '',
    `## Pass Rate: ${Object.values(results).filter(r => r.pass).length}/${Object.keys(results).length}`,
    '',
    '## Log Files',
    '',
    ...Object.entries(results).map(([name, r]) => 
      `- **${name}**: ${r.logger ? path.basename(r.logger.getLogPath()) : 'N/A'}`
    ),
    ''
  ].join('\n');
  
  fs.writeFileSync(summaryFile, summaryContent);
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  summaryLines.forEach(l => console.log(`  ${l}`));
  console.log(`\nSummary written to: ${summaryFile}`);
  console.log('='.repeat(60));
}

async function runSingle(scenarioName) {
  if (!SCENARIOS[scenarioName]) {
    console.error(`Unknown scenario: ${scenarioName}`);
    console.log(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`\n=== Running: ${scenarioName} ===\n`);
  const result = await SCENARIOS[scenarioName]();
  console.log(`\n>>> ${scenarioName}: ${result.pass ? 'PASS' : 'FAIL'} <<<`);
  console.log(`Log: ${result.logger.getLogPath()}`);
}

// Main entry
const arg = process.argv[2] || 'all';
if (arg === 'all') {
  runAll().catch(console.error);
} else {
  runSingle(arg).catch(console.error);
}
