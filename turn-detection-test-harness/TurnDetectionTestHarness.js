#!/usr/bin/env node

/**
 * TURN DETECTION TEST HARNESS
 * 
 * A terminal-based test tool that exercises the EXACT same voice pipeline logic
 * as BubbleVoice-Mac's VoicePipelineService.js, but replaces the LLM API call
 * with a simple echo via the macOS `say` command.
 * 
 * WHAT THIS DOES:
 * 1. Spawns the same Swift helper (BubbleVoiceSpeech) that the main app uses
 * 2. Listens to your microphone via the same SpeechAnalyzer pipeline
 * 3. Uses the SAME timer cascade system (1.2s → 2.2s → 3.2s) for turn detection
 * 4. Uses the SAME VAD-aware gating to prevent premature sends
 * 5. Uses the SAME interruption detection logic
 * 6. Uses the SAME echo suppression logic
 * 7. Instead of calling an LLM, speaks back: "Turn N - [what you said]"
 * 
 * HOW TO USE:
 *   cd BubbleVoice-Mac/turn-detection-test-harness
 *   node TurnDetectionTestHarness.js
 * 
 * Then just speak naturally. After 1.2s of silence (+ adaptive delay),
 * it will repeat what you said with a turn number.
 * 
 * To test interruption: start speaking while the AI is talking back.
 * The AI should stop immediately and start listening to your new turn.
 * 
 * Press Ctrl+C to exit.
 * 
 * PRODUCT CONTEXT:
 * This harness was built to validate the turn detection and interruption
 * system in isolation, without requiring the full Electron app, backend
 * server, or LLM API keys. It lets you verify:
 *   - Natural turn-taking feels right (not too fast, not too slow)
 *   - Interruptions work reliably
 *   - Echo suppression prevents false interruptions
 *   - Long utterances don't get cut off prematurely
 *   - Short utterances ("yes", "no") are handled gracefully
 * 
 * ARCHITECTURE:
 * This is a FAITHFUL PORT of VoicePipelineService.js with:
 *   - All WebSocket/frontend code removed
 *   - LLM call replaced with `say` command echo
 *   - Console output for real-time visibility
 *   - Same session state management
 *   - Same timer configuration and logic
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');

// ============================================================
// CONFIGURATION
// Mirrored from VoicePipelineService.js timerConfig
// ============================================================

/**
 * TIMER CONFIGURATION
 * 
 * These values are identical to VoicePipelineService.js (lines 113-117).
 * 
 * The three-timer cascade pattern from Accountability app:
 *   - llmStart:      Start "LLM" processing (our echo) after silence
 *   - ttsStart:      Start TTS generation  
 *   - playbackStart: Start audio playback
 * 
 * HISTORY:
 * Originally 4.5s/5.5s/6.5s to compensate for SpeechAnalyzer cold-start.
 * Reduced to 1.2s/2.2s/3.2s after lightweight input rotation fix (2026-02-08).
 */
const TIMER_CONFIG = {
  llmStart: 1200,      // 1.2s - Start "LLM" (echo) after silence
  ttsStart: 2200,      // 2.2s - Start TTS generation
  playbackStart: 3200  // 3.2s - Start audio playback
};

/**
 * VAD CONFIGURATION
 * 
 * These are the same thresholds as VoicePipelineService.js (lines 1315-1335).
 * The VAD check prevents premature sends during SpeechAnalyzer processing gaps.
 */
const VAD_CHECK_INTERVAL_MS = 200;
const VAD_SILENCE_THRESHOLD_MS = 1500;  // 1.5s no heartbeat = user stopped
const VAD_MAX_WAIT_MS = 45000;          // Safety valve: 45s max wait

/**
 * CONFIRMATION WINDOW CONFIG
 * 
 * For short utterances, we add an extra confirmation check to make sure
 * the user actually stopped speaking (not just a brief pause).
 * Same as VoicePipelineService.js lines 1298-1299.
 */
const CONFIRM_WINDOW_MS = 800;
const MIN_UTTERANCE_MS = 1800;

// ============================================================
// TERMINAL UI HELPERS
// ============================================================

/**
 * COLORED CONSOLE OUTPUT
 * 
 * We use ANSI color codes to make the terminal output easy to scan.
 * Each category of event gets a distinct color so you can visually
 * track the pipeline flow at a glance.
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bright: '\x1b[1m'
};

function logTranscription(text, isFinal) {
  const prefix = isFinal ? `${COLORS.green}[FINAL]` : `${COLORS.cyan}[PARTIAL]`;
  console.log(`${prefix} ${text}${COLORS.reset}`);
}

function logTimer(message) {
  console.log(`${COLORS.yellow}[TIMER] ${message}${COLORS.reset}`);
}

function logInterrupt(message) {
  console.log(`${COLORS.red}${COLORS.bright}[INTERRUPT] ${message}${COLORS.reset}`);
}

function logTTS(message) {
  console.log(`${COLORS.magenta}[TTS] ${message}${COLORS.reset}`);
}

function logSystem(message) {
  console.log(`${COLORS.dim}[SYSTEM] ${message}${COLORS.reset}`);
}

function logVAD(message) {
  // VAD is very noisy, so we use dim text
  // Uncomment the line below if you want to see VAD heartbeats:
  // console.log(`${COLORS.dim}[VAD] ${message}${COLORS.reset}`);
}

function logTurn(turnNumber, text) {
  console.log('');
  console.log(`${COLORS.bright}${COLORS.blue}╔══════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║  TURN ${turnNumber}                                             ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}╚══════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`${COLORS.bright}  You said: "${text}"${COLORS.reset}`);
  console.log(`${COLORS.bright}  AI reply: "Turn ${turnNumber} - ${text}"${COLORS.reset}`);
  console.log('');
}

// ============================================================
// SESSION STATE
// 
// This mirrors the session object from VoicePipelineService.js
// (lines 560-643). Same fields, same purpose.
// ============================================================

/**
 * CREATE FRESH SESSION STATE
 * 
 * Returns a new session object with all the same fields as
 * VoicePipelineService.js's startVoiceInput(). This is the
 * single source of truth for the pipeline's runtime state.
 * 
 * WHY IT'S A FUNCTION:
 * We need to create fresh sessions when the harness starts and
 * potentially reset state during testing. Having it as a function
 * ensures we don't accidentally share mutable state.
 */
function createSession() {
  return {
    id: 'test-harness-session',
    isListening: true,
    
    // Transcription state (volatile-aware, same as VoicePipelineService)
    currentTranscription: '',
    latestTranscription: '',
    textAtLastTimerReset: '',
    finalizedText: '',
    currentVolatile: '',
    
    // VAD tracking
    lastVadHeartbeatAt: 0,
    
    // Cascade epoch — incremented on every timer reset to detect stale callbacks
    cascadeEpoch: 0,
    
    // Timer handles
    silenceTimers: {
      llm: null,
      tts: null,
      playback: null,
      confirm: null
    },
    
    // Cached responses (in real app: LLM + TTS audio; here: just the echo text)
    cachedResponses: {
      llm: null,
      tts: null
    },
    
    // Pipeline state flags
    isInResponsePipeline: false,
    isTTSPlaying: false,
    isProcessingResponse: false,
    isCancelled: false,
    
    // Turn tracking
    firstTranscriptionAt: 0,
    lastTranscriptionAt: 0,
    awaitingSilenceConfirmation: false,
    
    // Echo suppression
    lastSpokenText: '',
    lastSpokenAt: 0,
    
    // Timer coalescing debounce handle
    _timerCoalesceTimeout: null,
    
    // Turn counter (unique to test harness — the real app doesn't count turns)
    turnNumber: 0
  };
}

// ============================================================
// CORE PIPELINE LOGIC
// 
// These functions are FAITHFUL PORTS from VoicePipelineService.js.
// Comments reference the original line numbers for traceability.
// ============================================================

/**
 * MERGE TRANSCRIPTION TEXT — VOLATILE-AWARE
 * 
 * Port of VoicePipelineService.js:196-216.
 * Handles the volatile vs final result distinction from SpeechAnalyzer.
 * 
 * SpeechAnalyzer sends results as individual segments:
 *   - Volatile results REPLACE each other (progressive guesses)
 *   - Final results ACCUMULATE (committed segments)
 * 
 * Display = finalizedText + currentVolatile
 */
function mergeTranscriptionText(session, incomingText, isFinal) {
  const incoming = (incomingText || '').trim();
  if (!incoming) return ((session.finalizedText || '') + ' ' + (session.currentVolatile || '')).trim();

  if (isFinal) {
    // FINALIZED: Append to permanent finalized text, clear volatile
    const prevFinalized = (session.finalizedText || '').trim();
    session.finalizedText = prevFinalized ? `${prevFinalized} ${incoming}` : incoming;
    session.currentVolatile = '';
    return session.finalizedText.trim();
  } else {
    // VOLATILE: Replace entire volatile buffer (progressive guess)
    session.currentVolatile = incoming;
    const finalized = (session.finalizedText || '').trim();
    return finalized ? `${finalized} ${incoming}` : incoming;
  }
}

/**
 * NORMALIZE TEXT FOR ECHO COMPARISON
 * 
 * Port of VoicePipelineService.js:229-236.
 * Strips punctuation and collapses whitespace for fuzzy matching.
 */
function normalizeTextForEchoComparison(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * IS LIKELY ECHO FRAGMENT
 * 
 * Port of VoicePipelineService.js:261-281.
 * Detects if a short transcription fragment matches the AI's spoken text.
 */
function isLikelyEchoFragment(incomingText, lastSpokenText) {
  const incomingNormalized = normalizeTextForEchoComparison(incomingText);
  const spokenNormalized = normalizeTextForEchoComparison(lastSpokenText);

  if (!incomingNormalized || !spokenNormalized) return false;

  const isShortFragment = incomingNormalized.length <= 18;
  const isPrefixFragment = spokenNormalized.startsWith(incomingNormalized);
  const incomingWordCount = incomingNormalized.split(' ').filter(Boolean).length;
  const isShortWordCount = incomingWordCount <= 5;

  if (!isShortFragment && !(isPrefixFragment && isShortWordCount)) {
    return false;
  }

  return spokenNormalized.includes(incomingNormalized);
}

/**
 * SHOULD IGNORE ECHO TRANSCRIPTION
 * 
 * Port of VoicePipelineService.js:303-344.
 * Full echo suppression check with aggressive containment check.
 */
function shouldIgnoreEchoTranscription(session, incomingText, swiftIsSpeaking) {
  if (!swiftIsSpeaking) return false;

  const trimmed = (incomingText || '').trim();
  if (!trimmed) return true;

  const timeSinceSpoken = Date.now() - (session.lastSpokenAt || 0);
  if (timeSinceSpoken > 15000) return false;

  const lastSpoken = session.lastSpokenText || '';

  if (isLikelyEchoFragment(trimmed, lastSpoken)) {
    logSystem(`Echo suppressed (fragment match): "${trimmed.substring(0, 50)}"`);
    return true;
  }

  // Aggressive echo check: full containment in AI's spoken text
  const incomingNormalized = normalizeTextForEchoComparison(trimmed);
  const spokenNormalized = normalizeTextForEchoComparison(lastSpoken);
  if (incomingNormalized && spokenNormalized && spokenNormalized.includes(incomingNormalized)) {
    logSystem(`Echo suppressed (contained in AI response): "${trimmed.substring(0, 50)}"`);
    return true;
  }

  return false;
}

/**
 * CLEAR ALL TIMERS
 * 
 * Port of VoicePipelineService.js:1738-1765.
 * Clears all silence detection timers and the coalescing debounce.
 */
function clearAllTimers(session) {
  if (session.silenceTimers.llm) {
    clearTimeout(session.silenceTimers.llm);
    session.silenceTimers.llm = null;
  }
  if (session.silenceTimers.tts) {
    clearTimeout(session.silenceTimers.tts);
    session.silenceTimers.tts = null;
  }
  if (session.silenceTimers.playback) {
    clearTimeout(session.silenceTimers.playback);
    session.silenceTimers.playback = null;
  }
  if (session.silenceTimers.confirm) {
    clearTimeout(session.silenceTimers.confirm);
    session.silenceTimers.confirm = null;
  }
  if (session._timerCoalesceTimeout) {
    clearTimeout(session._timerCoalesceTimeout);
    session._timerCoalesceTimeout = null;
  }
}

/**
 * HANDLE SPEECH DETECTED (INTERRUPTION)
 * 
 * Port of VoicePipelineService.js:1645-1729.
 * Called when the user speaks while the AI is in the response pipeline.
 * Stops everything and resets for the user's new turn.
 */
function handleSpeechDetected(session, swiftProcess) {
  logInterrupt(`User is speaking while AI is in response pipeline — triggering interruption`);
  logInterrupt(`  Pipeline: ${session.isInResponsePipeline}, TTS: ${session.isTTSPlaying}`);

  // Stop all timers immediately
  clearAllTimers(session);

  // Clear cached responses
  session.cachedResponses.llm = null;
  session.cachedResponses.tts = null;

  // Reset pipeline state
  session.isInResponsePipeline = false;
  session.isProcessingResponse = false;

  // Reset transcription baseline
  session.textAtLastTimerReset = '';
  session.finalizedText = '';
  session.currentVolatile = '';
  session.firstTranscriptionAt = 0;
  session.lastTranscriptionAt = 0;
  session.awaitingSilenceConfirmation = false;

  // Stop TTS playback
  if (session.isTTSPlaying) {
    logInterrupt('Stopping TTS playback due to interruption');
    stopSpeaking(swiftProcess);
    session.isTTSPlaying = false;
  }

  // Tell Swift to cancel old audio and reset recognition
  sendSwiftCommand(swiftProcess, { type: 'cancel_old_audio', data: null });
  sendSwiftCommand(swiftProcess, { type: 'reset_recognition', data: null });
  logInterrupt('Sent cancel_old_audio + reset_recognition to Swift');
}

/**
 * STOP SPEAKING
 * 
 * Port of VoicePipelineService.js:1775-1784.
 * Sends stop_speaking command to Swift helper.
 */
function stopSpeaking(swiftProcess) {
  sendSwiftCommand(swiftProcess, { type: 'stop_speaking', data: null });
}

/**
 * SEND SWIFT COMMAND
 * 
 * Port of VoicePipelineService.js:682-695.
 * Sends a JSON command to the Swift helper via stdin.
 */
function sendSwiftCommand(swiftProcess, command) {
  if (!swiftProcess || !swiftProcess.stdin.writable) {
    logSystem('ERROR: Swift process not available');
    return;
  }
  try {
    const json = JSON.stringify(command) + '\n';
    swiftProcess.stdin.write(json);
    // Only log non-noisy commands
    if (command.type !== 'cancel_old_audio') {
      logSystem(`Sent command to Swift: ${command.type}`);
    }
  } catch (error) {
    logSystem(`ERROR sending Swift command: ${error.message}`);
  }
}

/**
 * GENERATE TTS — ECHO VERSION
 * 
 * Port of VoicePipelineService.js:1953-1984.
 * Instead of sending to Swift's speak command (which uses `say`),
 * we use the same mechanism but with our echo text.
 * 
 * The Swift helper's speak() function uses `/usr/bin/say` and sends
 * speech_started / speech_ended events, which we use for interruption detection.
 */
function generateEchoTTS(session, swiftProcess, turnNumber, userText) {
  const echoText = `Turn ${turnNumber}. ${userText}`;
  
  logTTS(`Speaking: "${echoText}"`);
  
  // Store for echo suppression (same as VoicePipelineService.js:1966-1967)
  session.lastSpokenText = echoText;
  session.lastSpokenAt = Date.now();

  // Send speak command to Swift helper (same as VoicePipelineService.js:1973-1980)
  // Uses default voice and 200 wpm rate
  sendSwiftCommand(swiftProcess, {
    type: 'speak',
    data: {
      text: echoText,
      voice: null,   // System default voice
      rate: 200      // 200 words per minute (default)
    }
  });
}

/**
 * START TIMER CASCADE
 * 
 * Port of VoicePipelineService.js:1268-1631.
 * This is the HEART of the turn detection system.
 * 
 * The three-timer cascade:
 *   Timer 1 (1.2s + adaptive): Start "LLM" processing (our echo)
 *   Timer 2 (2.2s + adaptive): TTS generation checkpoint
 *   Timer 3 (3.2s + adaptive): Start audio playback
 * 
 * Each timer fires only if silence has persisted since the cascade started.
 * The cascade epoch mechanism prevents stale timers from executing.
 * 
 * DIFFERENCE FROM ORIGINAL:
 * Instead of calling LLMService.generateResponse(), we immediately cache
 * the echo text. The Timer 3 logic then speaks it via Swift's `say` command.
 */
function startTimerCascade(session, swiftProcess) {
  logTimer(`Starting timer cascade (epoch: ${session.cascadeEpoch})`);

  // ADAPTIVE SILENCE BUFFER (same as VoicePipelineService.js:1284-1291)
  const currentText = (session.latestTranscription || '').trim();
  const wordCount = currentText.length > 0 ? currentText.split(/\s+/).length : 0;
  let adaptiveDelayMs = 0;
  if (wordCount <= 3) {
    adaptiveDelayMs = 600;
  } else if (wordCount <= 6) {
    adaptiveDelayMs = 300;
  }

  const llmDelay = TIMER_CONFIG.llmStart + adaptiveDelayMs;
  const ttsDelay = TIMER_CONFIG.ttsStart + adaptiveDelayMs;
  const playbackDelay = TIMER_CONFIG.playbackStart + adaptiveDelayMs;
  const ttsDelayFromLlm = Math.max(0, ttsDelay - llmDelay);
  const playbackDelayFromLlm = Math.max(0, playbackDelay - llmDelay);

  logTimer(`  Delays: LLM=${llmDelay}ms, TTS=${ttsDelay}ms, Playback=${playbackDelay}ms (adaptive=${adaptiveDelayMs}ms, words=${wordCount})`);

  /**
   * RUN "LLM" PROCESSING — ECHO VERSION
   * 
   * In the real app, this calls LLMService.generateResponse().
   * Here, we immediately cache the echo text.
   */
  const runEchoProcessing = async () => {
    session.isInResponsePipeline = true;

    if (session.isProcessingResponse) {
      logTimer('Already processing response, skipping');
      return;
    }

    session.isProcessingResponse = true;

    // Timer 2: TTS checkpoint (mostly informational in our case)
    session.silenceTimers.tts = setTimeout(() => {
      logTimer('Timer 2 (TTS checkpoint) fired');
      if (!session.isInResponsePipeline) {
        logTimer('Timer 2 cancelled by interruption');
      }
    }, ttsDelayFromLlm);

    // Timer 3: Playback — this is where we actually speak
    session.silenceTimers.playback = setTimeout(async () => {
      logTimer('Timer 3 (Playback) fired');
      if (session.isCancelled) {
        logTimer('Timer 3 aborted — session cancelled');
        return;
      }

      // Poll for cached response (same pattern as VoicePipelineService.js:1367-1373)
      const maxWaitTime = 10000;
      const pollInterval = 200;
      const startTime = Date.now();

      while (!session.cachedResponses.llm && (Date.now() - startTime) < maxWaitTime) {
        if (session.isCancelled) {
          logTimer('Timer 3 aborted during polling — session cancelled');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      if (session.cachedResponses.llm) {
        const responseText = session.cachedResponses.llm.text;
        const turnNum = session.cachedResponses.llm.turnNumber;
        const userText = session.cachedResponses.llm.userText;
        
        // Display the turn in the terminal
        logTurn(turnNum, userText);

        // Reset recognition before speaking (same as VoicePipelineService.js:1397-1401)
        sendSwiftCommand(swiftProcess, { type: 'reset_recognition', data: null });

        // Start TTS playback
        session.isTTSPlaying = true;
        generateEchoTTS(session, swiftProcess, turnNum, userText);
      } else {
        logTimer('Timer 3 timed out waiting for cached response');
      }
    }, playbackDelayFromLlm);

    // THE "LLM" CALL — instantly cache the echo text
    // In the real app, this is an async LLM call that takes 1-5 seconds.
    // Here it's instant, which is actually more realistic for testing turn
    // detection because the response is always ready when Timer 3 fires.
    const userText = (session.latestTranscription || '').trim();
    session.turnNumber = (session.turnNumber || 0) + 1;
    
    session.cachedResponses.llm = {
      text: `Turn ${session.turnNumber} - ${userText}`,
      turnNumber: session.turnNumber,
      userText: userText
    };

    logTimer(`"LLM" response cached: "Turn ${session.turnNumber} - ${userText.substring(0, 50)}..."`);
  };

  // Capture cascade epoch for stale detection
  const thisCascadeEpoch = session.cascadeEpoch || 0;

  // TIMER 1: LLM start (same logic as VoicePipelineService.js:1532-1630)
  session.silenceTimers.llm = setTimeout(async () => {
    // EPOCH CHECK
    if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
      logTimer(`Timer 1 stale — epoch changed (${thisCascadeEpoch} → ${session.cascadeEpoch}), aborting`);
      return;
    }

    logTimer(`Timer 1 (LLM) fired — ${llmDelay}ms of silence detected!`);

    if (session.isCancelled) {
      logTimer('Timer 1 aborted — session cancelled');
      return;
    }

    // VAD-AWARE GATE (same as VoicePipelineService.js:1548-1581)
    const vadWaitStart = Date.now();
    while (true) {
      // Epoch check in VAD loop
      if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
        logTimer(`Timer 1 aborted during VAD wait — epoch changed`);
        return;
      }

      const timeSinceVad = Date.now() - (session.lastVadHeartbeatAt || 0);
      if (timeSinceVad > VAD_SILENCE_THRESHOLD_MS) {
        break; // VAD confirms silence
      }
      if (Date.now() - vadWaitStart > VAD_MAX_WAIT_MS) {
        logTimer('VAD wait exceeded safety limit — proceeding');
        break;
      }
      if (session.isCancelled) {
        logTimer('Timer 1 aborted during VAD wait — session cancelled');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, VAD_CHECK_INTERVAL_MS));
    }
    
    const vadWaitElapsed = Date.now() - vadWaitStart;
    if (vadWaitElapsed > 100) {
      logTimer(`VAD confirmed silence after ${vadWaitElapsed}ms additional wait`);
    }

    // Final epoch check after VAD wait
    if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
      logTimer('Timer 1 aborted after VAD wait — epoch changed');
      return;
    }

    // SILENCE CONFIRMATION for short utterances (same as VoicePipelineService.js:1590-1630)
    const now = Date.now();
    const latestText = (session.latestTranscription || '').trim();
    const wordCountNow = latestText.length > 0 ? latestText.split(/\s+/).length : 0;
    const timeSinceFirst = session.firstTranscriptionAt ? (now - session.firstTranscriptionAt) : 0;
    const shouldConfirmSilence = wordCountNow <= 6 || (timeSinceFirst > 0 && timeSinceFirst < MIN_UTTERANCE_MS);

    if (shouldConfirmSilence && !session.awaitingSilenceConfirmation) {
      session.awaitingSilenceConfirmation = true;
      logTimer(`Short utterance (${wordCountNow} words) — waiting ${CONFIRM_WINDOW_MS}ms for silence confirmation`);

      // Clear Timer 2 and Timer 3 during confirmation
      if (session.silenceTimers.tts) { clearTimeout(session.silenceTimers.tts); session.silenceTimers.tts = null; }
      if (session.silenceTimers.playback) { clearTimeout(session.silenceTimers.playback); session.silenceTimers.playback = null; }
      if (session.silenceTimers.confirm) { clearTimeout(session.silenceTimers.confirm); session.silenceTimers.confirm = null; }

      session.silenceTimers.confirm = setTimeout(() => {
        if (session.isCancelled) return;
        const confirmNow = Date.now();
        const timeSinceLast = confirmNow - (session.lastTranscriptionAt || 0);
        const timeSinceFirstConfirm = session.firstTranscriptionAt ? (confirmNow - session.firstTranscriptionAt) : 0;
        if (timeSinceLast < CONFIRM_WINDOW_MS || (timeSinceFirstConfirm > 0 && timeSinceFirstConfirm < MIN_UTTERANCE_MS)) {
          logTimer('Silence confirmation failed — user resumed speaking');
          session.awaitingSilenceConfirmation = false;
          return;
        }
        session.awaitingSilenceConfirmation = false;
        logTimer('Silence confirmed — proceeding with echo');
        runEchoProcessing();
      }, CONFIRM_WINDOW_MS);
      return;
    }

    runEchoProcessing();
  }, llmDelay);
}

/**
 * RESET SILENCE TIMER
 * 
 * Port of VoicePipelineService.js:1217-1250.
 * Called on EVERY transcription update. This is the KEY to turn detection.
 * 
 * Implements timer coalescing (50ms debounce) to handle burst updates.
 */
function resetSilenceTimer(session, swiftProcess) {
  session.lastTranscriptionAt = Date.now();
  if (!session.firstTranscriptionAt) {
    session.firstTranscriptionAt = session.lastTranscriptionAt;
  }
  session.awaitingSilenceConfirmation = false;

  // Increment cascade epoch to invalidate any stale timer callbacks
  session.cascadeEpoch = (session.cascadeEpoch || 0) + 1;

  // Clear existing timers
  clearAllTimers(session);

  // Debounced timer cascade start (50ms coalescing window)
  if (session._timerCoalesceTimeout) {
    clearTimeout(session._timerCoalesceTimeout);
  }
  session._timerCoalesceTimeout = setTimeout(() => {
    session._timerCoalesceTimeout = null;
    logTimer(`Starting timer cascade (coalesced, epoch: ${session.cascadeEpoch})`);
    startTimerCascade(session, swiftProcess);
  }, 50);
}

// ============================================================
// SWIFT RESPONSE HANDLER
// 
// Port of VoicePipelineService.js:715-1117.
// Processes all messages from the Swift helper.
// ============================================================

/**
 * HANDLE SWIFT RESPONSE
 * 
 * Routes messages from the Swift helper to the appropriate handler.
 * The key message types are:
 *   - transcription_update: User speech text (partial or final)
 *   - vad_speech_active: User is still speaking (heartbeat)
 *   - speech_started: TTS playback began
 *   - speech_ended: TTS playback finished
 *   - speech_energy_silence: Speech followed by silence (VAD)
 */
function handleSwiftResponse(response, session, swiftProcess) {
  switch (response.type) {
    case 'ready':
      logSystem('Swift helper is ready');
      break;

    case 'listening_active':
      logSystem('Swift helper confirmed listening is active — speak now!');
      console.log('');
      console.log(`${COLORS.bright}${COLORS.green}🎤 LISTENING — Speak naturally. Press Ctrl+C to exit.${COLORS.reset}`);
      console.log('');
      break;

    case 'transcription_update': {
      const text = response.data?.text || '';
      const isFinal = response.data?.isFinal || false;
      const swiftIsSpeaking = response.data?.isSpeaking || false;

      // Turn tracking
      session.lastTranscriptionAt = Date.now();
      if (!session.firstTranscriptionAt) {
        session.firstTranscriptionAt = session.lastTranscriptionAt;
      }
      session.awaitingSilenceConfirmation = false;

      // Log transcription
      logTranscription(text, isFinal);

      // Echo suppression check (same as VoicePipelineService.js:797-800)
      if (shouldIgnoreEchoTranscription(session, text, swiftIsSpeaking)) {
        logSystem('Ignoring likely echo transcription while AI is speaking');
        return;
      }

      // INTERRUPTION DETECTION (same as VoicePipelineService.js:841-852)
      const wasInResponsePipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
      if (wasInResponsePipeline && text.trim().length > 0) {
        handleSpeechDetected(session, swiftProcess);
      }

      // Merge transcription text (volatile-aware)
      const mergedTranscription = mergeTranscriptionText(session, text, isFinal);
      session.currentTranscription = mergedTranscription;
      if (mergedTranscription.trim().length > 0) {
        session.latestTranscription = mergedTranscription;
      }

      // Timer-reset pattern (same as VoicePipelineService.js:899-920)
      const isCurrentlyInPipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
      if (!isCurrentlyInPipeline) {
        const hasMeaningfulText = mergedTranscription.trim().length > 0;
        const hasExistingTranscription = (session.latestTranscription || '').trim().length > 0;
        if (hasMeaningfulText || hasExistingTranscription) {
          resetSilenceTimer(session, swiftProcess);
        }
      }
      break;
    }

    case 'vad_speech_active':
      session.lastVadHeartbeatAt = Date.now();
      logVAD('Heartbeat received');
      break;

    case 'speech_energy_silence': {
      logSystem('Speech energy then silence detected by Swift VAD');
      const currentText = (session.latestTranscription || '').trim();
      const hasText = currentText.length > 0;
      const isIdle = !session.isInResponsePipeline && !session.isTTSPlaying && !session.isProcessingResponse;

      if (hasText && isIdle) {
        logSystem(`Have text "${currentText}" but no active timers — starting timer cascade`);
        resetSilenceTimer(session, swiftProcess);
      } else if (!hasText && isIdle) {
        logSystem('No transcription text despite speech energy — short utterance likely swallowed');
        console.log(`${COLORS.yellow}  💡 Tip: Try speaking a full sentence — very short words may not be captured${COLORS.reset}`);
      }
      break;
    }

    case 'speech_started':
      logTTS('TTS started playing');
      session.isTTSPlaying = true;
      break;

    case 'speech_ended':
      logTTS('TTS finished playing');
      session.isTTSPlaying = false;
      session.isInResponsePipeline = false;

      // Reset transcription state for next turn (same as VoicePipelineService.js:943-964)
      session.latestTranscription = '';
      session.currentTranscription = '';
      session.textAtLastTimerReset = '';
      session.finalizedText = '';
      session.currentVolatile = '';
      session.isProcessingResponse = false;
      session.firstTranscriptionAt = 0;
      session.lastTranscriptionAt = 0;
      session.awaitingSilenceConfirmation = false;

      // Reset recognition for clean next turn
      sendSwiftCommand(swiftProcess, { type: 'reset_recognition', data: null });
      logSystem('Transcription state reset — ready for next turn');
      console.log(`${COLORS.green}🎤 Listening for next turn...${COLORS.reset}`);
      console.log('');
      break;

    case 'recognition_restarted':
      logSystem(`Swift recognition restarted: reason=${response.data?.reason}`);
      break;

    case 'error':
      logSystem(`Swift error: ${response.data?.message}`);
      break;

    default:
      // Ignore unknown types silently
      break;
  }
}

// ============================================================
// MAIN — SPAWN SWIFT HELPER AND START LISTENING
// ============================================================

async function main() {
  console.log('');
  console.log(`${COLORS.bright}${COLORS.blue}╔══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║  TURN DETECTION TEST HARNESS                                ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║                                                              ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║  Same pipeline as BubbleVoice-Mac:                           ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║    • SpeechAnalyzer (macOS 26+) for STT                      ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║    • 3-timer cascade (1.2s / 2.2s / 3.2s)                    ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║    • VAD-aware gating, echo suppression                      ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║    • Interruption detection                                  ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║                                                              ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║  Instead of LLM: echoes "Turn N - [what you said]"           ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}║  Press Ctrl+C to exit.                                       ║${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}╚══════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log('');

  // Path to the pre-built Swift helper (same binary as the main app uses)
  const swiftHelperPath = path.join(__dirname, '../swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');

  logSystem(`Spawning Swift helper: ${swiftHelperPath}`);

  // Spawn Swift helper process
  const swiftProcess = spawn(swiftHelperPath);

  // Create session state
  const session = createSession();

  // Handle stdout (JSON responses from Swift)
  swiftProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        handleSwiftResponse(response, session, swiftProcess);
      } catch (error) {
        // Some lines may be partial JSON (buffer splitting) — ignore silently
      }
    }
  });

  // Handle stderr (debug logs from Swift)
  swiftProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    // Only show important Swift logs, filter noise
    if (msg.includes('ERROR') || msg.includes('WARN') || msg.includes('Pre-warm')) {
      logSystem(`[Swift] ${msg}`);
    }
  });

  // Handle Swift process exit
  swiftProcess.on('exit', (code, signal) => {
    logSystem(`Swift helper exited: code=${code}, signal=${signal}`);
    process.exit(code || 0);
  });

  // Wait for Swift helper to send "ready" (timeout 10s)
  await new Promise((resolve) => {
    let ready = false;

    const checkReady = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          if (response.type === 'ready') {
            ready = true;
            resolve();
          }
        } catch (_) {}
      }
    };

    // Temporarily add a listener for the ready signal
    swiftProcess.stdout.on('data', checkReady);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!ready) {
        logSystem('Swift helper did not send ready within 10s — proceeding anyway');
        resolve();
      }
    }, 10000);
  });

  // Send start_listening command
  sendSwiftCommand(swiftProcess, { type: 'start_listening', data: null });

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', () => {
    console.log('');
    logSystem('Shutting down...');
    sendSwiftCommand(swiftProcess, { type: 'stop_listening', data: null });
    
    // Give Swift helper a moment to clean up
    setTimeout(() => {
      swiftProcess.kill();
      
      // Print summary
      console.log('');
      console.log(`${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════${COLORS.reset}`);
      console.log(`${COLORS.bright}  Session Summary: ${session.turnNumber} turns completed${COLORS.reset}`);
      console.log(`${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════${COLORS.reset}`);
      console.log('');
      
      process.exit(0);
    }, 500);
  });

  // Keep the process alive
  // The event loop stays active because of the Swift child process
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
