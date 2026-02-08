/**
 * BUBBLEVOICE MAC - VOICE PIPELINE SERVICE
 * 
 * Manages the voice input/output pipeline.
 * Coordinates speech recognition, turn detection, and TTS.
 * 
 * RESPONSIBILITIES:
 * - Start/stop voice input capture
 * - Manage speech recognition (Apple Speech APIs via child process)
 * - Implement three-timer turn detection system
 * - Handle interruption
 * - Generate TTS audio
 * 
 * ARCHITECTURE DECISION:
 * Apple's speech APIs require native code (Swift/Objective-C).
 * This service spawns a Swift helper process to handle native APIs,
 * then communicates via IPC (stdin/stdout).
 * 
 * THREE-TIMER SYSTEM (ported from Accountability app, tuned 2026-02-07):
 * - Timer 1 (1.2s): Start LLM processing (cached, not visible)
 * - Timer 2 (2.2s): Start TTS generation (uses cached LLM result)
 * - Timer 3 (3.2s): Start audio playback
 * 
 * This creates a buffered pipeline that feels instant while allowing
 * natural pauses in conversation without premature cutoffs.
 * 
 * PRODUCT CONTEXT:
 * Natural conversation requires sophisticated turn detection.
 * Users pause to think, but we don't want to interrupt them.
 * The three-timer system solves this by buffering responses
 * while still feeling responsive.
 * 
 * TECHNICAL NOTES:
 * - Uses child_process to spawn Swift helper
 * - Communicates via JSON over stdin/stdout
 * - Implements timer-based turn detection
 * - Handles interruption by clearing timers and cache
 */

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

class VoicePipelineService extends EventEmitter {
  constructor(server) {
    super();
    
    // Reference to backend server
    // Used to send messages to frontend via WebSocket
    this.server = server;
    
    // ARCHITECTURE FIX (2026-02-06): Use server's shared service instances
    // instead of creating separate ones.
    //
    // WHY: Previously, VoicePipelineService created its own `new LLMService()`
    // and `new ConversationService()`. These were DIFFERENT instances from the
    // ones in BackendServer, causing:
    // - Voice-created conversations invisible to text path (different ConversationService)
    // - API key updates from settings not affecting voice pipeline (different LLMService)
    // - Model selection changes not applying to voice (different LLMService)
    //
    // BECAUSE: The server's LLMService gets API key updates via handleUpdateApiKeys(),
    // and the server's ConversationService holds all conversations. If voice has its
    // own instances, they never see these updates.
    //
    // FIX: Accept server's services via the server reference. Fall back to creating
    // new instances only if server doesn't have them (backward compatibility for tests).
    this.llmService = server?.llmService || null;
    this.conversationService = server?.conversationService || null;

    // Active voice sessions
    // Maps session ID to session state
    this.sessions = new Map();

    // Path to Swift helper process
    // TODO: Build and bundle Swift helper
    this.swiftHelperPath = path.join(__dirname, '../../../swift-helper/BubbleVoiceSpeech');

    // Timer configuration (in milliseconds)
    //
    // ============================================================
    // 2026-02-08 CRITICAL UPDATE — REDUCED FROM 4.5s TO 1.2s
    // ============================================================
    //
    // PREVIOUS VALUES (4.5s/5.5s/6.5s): Were inflated because of a
    // bug in main.swift where every reset_recognition call destroyed
    // and rebuilt the entire SpeechAnalyzer pipeline from scratch.
    // The neural model cold-start took ~2-4 seconds, creating gaps
    // where no transcription updates arrived — the "chunk batch"
    // effect. The 4.5s timer was tuned to span these cold-start gaps.
    //
    // ROOT CAUSE FIX (2026-02-08): main.swift now uses "lightweight
    // input rotation" — finalize(through:) + start(inputSequence:)
    // instead of finalizeAndFinishThroughEndOfInput(). The analyzer,
    // transcriber, audio engine, and tap ALL stay alive. Resets take
    // ~50ms instead of ~2-4 seconds. Volatile results now stream
    // word-by-word in real-time (~200-500ms between updates), just
    // like SFSpeechRecognizer did in Accountability v6.
    //
    // NEW VALUES: Brought back close to Accountability v6 timings
    // (which used 0.5s/1.5s/2.0s). We use slightly higher values
    // because SpeechAnalyzer's first volatile result can take up to
    // ~1 second even with a warm model, and we want a small buffer.
    //
    // The three-timer cascade pattern from Accountability is:
    //   - llmStart:      Start LLM processing (silence threshold)
    //   - ttsStart:      Start TTS generation (if LLM result ready)
    //   - playbackStart: Start audio playback (if TTS result ready)
    //
    // With the local `say` command for TTS (no network latency),
    // the TTS and playback timers can be tighter than Accountability's
    // cloud Deepgram values.
    this.timerConfig = {
      llmStart: 1200,      // 1.2s - Start LLM processing after silence
      ttsStart: 2200,      // 2.2s - Start TTS generation
      playbackStart: 3200  // 3.2s - Start audio playback
    };
    
    // CRITICAL: Track playback state for interruption detection
    // This mirrors the Accountability app's isSpeaking flag
    // We need to know if the AI is currently speaking so we can detect interruptions
    this.isAISpeaking = false;
    
    // SINGLETON SWIFT HELPER (2026-02-06):
    // Keep the Swift helper process alive between voice sessions to eliminate
    // the ~3-5 second spawn + initialization delay on each mic click.
    //
    // WHY: Native Mac dictation (double-tap Command) starts instantly because
    // the speech engine is always warm. Our previous approach spawned a new
    // process each time the user clicked the mic button, adding:
    //   1. Process spawn overhead (~1-2s)
    //   2. Artificial 500ms wait for initialization
    //   3. Audio engine setup time
    //
    // BECAUSE: The user reported "when I press the microphone it takes like
    // 5 seconds for it to start actually transcribing with no visual feedback."
    //
    // FIX: Spawn the Swift helper ONCE (lazily on first use) and keep it alive.
    // start_voice_input just sends a start_listening command (near-instant).
    // stop_voice_input sends stop_listening but does NOT kill the process.
    // Process is only killed on server shutdown or crash recovery.
    this.sharedSwiftProcess = null;
    this.swiftProcessReady = false;
    this.swiftProcessReadyPromise = null;
    this.swiftProcessReadyResolve = null;
    
    // Pre-warm the Swift helper on construction so it's ready before user clicks mic
    this._ensureSwiftHelper().catch(err => {
      console.error('[VoicePipelineService] Failed to pre-warm Swift helper:', err);
    });
  }

  /**
   * MERGE TRANSCRIPTION TEXT — VOLATILE-AWARE (2026-02-07)
   *
   * Normalizes speech recognition updates into a single growing utterance,
   * properly handling the volatile vs final result distinction from SpeechAnalyzer.
   *
   * BUG FIX (2026-02-07):
   * E2E testing revealed that the old merge function caused garbled text like:
   *   "Hello, I am testing. Can Can you Can you tell Can you tell me..."
   * 
   * ROOT CAUSE:
   * SpeechAnalyzer sends results as individual segments, not cumulative text.
   * Within a segment, volatile results are PROGRESSIVE — each one REPLACES
   * the previous volatile text:
   *   "Can" → "Can you" → "Can you tell" → "Can you tell me"
   * 
   * The old function treated each volatile update as a "new segment" and APPENDED
   * because incoming.startsWith(current) was false (current included finalized text
   * from previous segments).
   *
   * FIX:
   * Use a separate `finalizedText` field on the session that accumulates only
   * finalized (isFinal=true) segments. Volatile results REPLACE each other —
   * they don't accumulate. The displayed/sent text is: finalizedText + latestVolatile.
   *
   * WHY THIS APPROACH:
   * SpeechAnalyzer's results are structured as:
   *   1. Volatile: "The" → "The quick" → "The quick brown" (each replaces previous)
   *   2. Final: "The quick brown fox." (committed, immutable)
   *   3. Volatile: "jumped" → "jumped over" (new segment, replaces previous volatile)
   *   4. Final: "jumped over the lazy dog." (committed)
   *
   * Our display: finalizedText + currentVolatile
   *   After step 1: "" + "The quick brown" = "The quick brown"
   *   After step 2: "The quick brown fox." + "" = "The quick brown fox."
   *   After step 3: "The quick brown fox." + "jumped over" = "The quick brown fox. jumped over"
   *   After step 4: "The quick brown fox. jumped over the lazy dog." + "" = full text
   *
   * @param {Object} session - The voice session (we now read session.finalizedText)
   * @param {string} incomingText - The latest transcription text from SpeechAnalyzer
   * @param {boolean} isFinal - Whether this result is finalized
   * @returns {string} The full merged transcription text
   */
  mergeTranscriptionText(session, incomingText, isFinal) {
    const incoming = (incomingText || '').trim();
    if (!incoming) return ((session.finalizedText || '') + ' ' + (session.currentVolatile || '')).trim();

    
    if (isFinal) {
      // FINALIZED: Append to the permanent finalized text.
      // Clear the volatile buffer since this segment is now committed.
      const prevFinalized = (session.finalizedText || '').trim();
      session.finalizedText = prevFinalized ? `${prevFinalized} ${incoming}` : incoming;
      session.currentVolatile = '';
      return session.finalizedText.trim();
    } else {
      // VOLATILE: Replace the current volatile text entirely.
      // The incoming text is the SpeechAnalyzer's latest progressive guess
      // for the current segment — it already includes all previous volatiles.
      session.currentVolatile = incoming;
      const finalized = (session.finalizedText || '').trim();
      return finalized ? `${finalized} ${incoming}` : incoming;
    }
  }

  /**
   * NORMALIZE TEXT FOR ECHO COMPARISON
   *
   * We compare short transcription fragments against the AI's spoken text
   * to detect microphone echo. This normalization strips punctuation and
   * collapses whitespace so small fragments ("it", "it looks") match even
   * if the recognizer inserts or removes punctuation.
   *
   * @param {string} text - Raw text to normalize
   * @returns {string} Normalized text (lowercase, whitespace-collapsed)
   */
  normalizeTextForEchoComparison(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[\u2018\u2019']/g, '') // normalize apostrophes
      .replace(/[^a-z0-9\s]/g, ' ') // remove punctuation but keep alphanumerics
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * DETECT LIKELY ECHO FRAGMENT
   *
   * This is a heuristic that tries to answer: "Is this transcription
   * probably the AI's TTS being picked up by the mic?"
   *
   * We only classify as echo if:
   * - The AI is actively speaking, AND
   * - The fragment is SHORT or looks like a PREFIX of the spoken text, AND
   * - The fragment is contained in (or aligned with) the AI's spoken text.
   *
   * IMPORTANT REFINEMENT (2026-02-07):
   * We saw echo fragments like "It looks like" — longer than 1-2 words —
   * still causing interruptions. We now treat short PREFIX matches as echo,
   * because TTS bleed often captures the first few words of the AI reply.
   *
   * If the fragment is longer or clearly not part of the AI's speech,
   * we treat it as a real user interruption.
   *
   * @param {string} incomingText - Current transcription fragment
   * @param {string} lastSpokenText - Last TTS text sent to Swift
   * @returns {boolean} True if likely echo
   */
  isLikelyEchoFragment(incomingText, lastSpokenText) {
    const incomingNormalized = this.normalizeTextForEchoComparison(incomingText);
    const spokenNormalized = this.normalizeTextForEchoComparison(lastSpokenText);

    if (!incomingNormalized || !spokenNormalized) return false;

    // Short fragments are the most likely echo candidates.
    const isShortFragment = incomingNormalized.length <= 18;
    const isPrefixFragment = spokenNormalized.startsWith(incomingNormalized);

    // Count words for a more human-aligned cutoff.
    const incomingWordCount = incomingNormalized.split(' ').filter(Boolean).length;
    const isShortWordCount = incomingWordCount <= 5;

    // Only treat as echo if it's short OR a short prefix.
    if (!isShortFragment && !(isPrefixFragment && isShortWordCount)) {
      return false;
    }

    return spokenNormalized.includes(incomingNormalized);
  }

  /**
   * SHOULD IGNORE ECHO TRANSCRIPTION
   *
   * Decides whether to ignore a transcription update because it is likely
   * the AI's voice being picked up by the microphone.
   *
   * WHY THIS MATTERS:
   * Echo transcriptions were triggering the interruption logic and restarting
   * the timer cascade mid-response. That creates a "choppy" feel and causes
   * tiny user messages like "It" to appear while the AI is speaking.
   *
   * BECAUSE:
   * The macOS `say` TTS can leak into the mic if the user has open speakers
   * or a sensitive microphone. We need a defensive, heuristic filter.
   *
   * @param {Object} session - Voice session state
   * @param {string} incomingText - Transcription update text
   * @param {boolean} swiftIsSpeaking - Whether Swift reports TTS is speaking
   * @returns {boolean} True if we should ignore this update
   */
  shouldIgnoreEchoTranscription(session, incomingText, swiftIsSpeaking) {
    if (!swiftIsSpeaking) return false;

    const trimmed = (incomingText || '').trim();
    if (!trimmed) return true;

    const timeSinceSpoken = Date.now() - (session.lastSpokenAt || 0);

    // Only apply echo suppression shortly after we started speaking.
    // We extend the window a bit because "say" playback can lag on longer
    // responses, and the mic can keep picking up the tail end.
    if (timeSinceSpoken > 15000) return false;

    const lastSpoken = session.lastSpokenText || '';

    // If this fragment is clearly part of the AI's spoken text, ignore it.
    if (this.isLikelyEchoFragment(trimmed, lastSpoken)) {
      return true;
    }
    
    // AGGRESSIVE ECHO CHECK (2026-02-07):
    // E2E testing showed that even longer fragments (6+ words) can be echo when
    // the AI is actively speaking. The old check only caught fragments up to 5 words,
    // but TTS bleed can generate 10+ word fragments that pass the short check.
    //
    // FIX: If the AI is actively speaking (swiftIsSpeaking=true) AND the normalized
    // transcription text is fully contained in the AI's last spoken text, treat it
    // as echo regardless of length. A real user interruption would include words
    // NOT in the AI's response.
    //
    // EDGE CASE: If the user repeats part of the AI's response, this could
    // suppress a legitimate interruption. But this is extremely rare in practice
    // and far less damaging than the false interruption + crash cascade.
    const incomingNormalized = this.normalizeTextForEchoComparison(trimmed);
    const spokenNormalized = this.normalizeTextForEchoComparison(lastSpoken);
    if (incomingNormalized && spokenNormalized && spokenNormalized.includes(incomingNormalized)) {
      console.log(`[VoicePipelineService] 🔇 Echo (contained in AI response): "${trimmed.substring(0, 50)}"`);
      return true;
    }

    return false;
  }

  /**
   * SCHEDULE FRONTEND TRANSCRIPTION UPDATE
   *
   * Debounces transcription updates to the UI to avoid "choppy" flicker.
   * We still process every update for timer logic, but only emit to the
   * frontend at a controlled cadence.
   *
   * DESIGN CHOICE:
   * - Send immediately if `isFinal` or if we've waited too long.
   * - Otherwise, delay slightly to coalesce rapid partial updates.
   *
   * @param {Object} session - Voice session state
   * @param {string} text - Merged transcription text
   * @param {boolean} isFinal - Whether this is a final update
   */
  scheduleFrontendTranscriptionUpdate(session, text, isFinal) {
    if (!session || !session.transcriptionCallback) return;

    const now = Date.now();
    const lastSentAt = session.lastFrontendTranscriptionSentAt || 0;
    const timeSinceLast = now - lastSentAt;

    // If text hasn't changed and it's not final, don't spam the UI.
    if (!isFinal && text === session.lastFrontendTranscriptionText) {
      return;
    }

    // Store pending update so the timer can flush the latest.
    session.pendingFrontendTranscriptionText = text;
    session.pendingFrontendTranscriptionIsFinal = isFinal;

    const minIntervalMs = 260;
    const maxWaitMs = 650;

    const shouldSendImmediately = isFinal || timeSinceLast >= maxWaitMs;

    if (shouldSendImmediately) {
      if (session.pendingFrontendTranscriptionTimer) {
        clearTimeout(session.pendingFrontendTranscriptionTimer);
        session.pendingFrontendTranscriptionTimer = null;
      }

      session.transcriptionCallback({
        text: session.pendingFrontendTranscriptionText,
        isFinal: session.pendingFrontendTranscriptionIsFinal
      });

      session.lastFrontendTranscriptionText = session.pendingFrontendTranscriptionText;
      session.lastFrontendTranscriptionSentAt = Date.now();
      return;
    }

    if (session.pendingFrontendTranscriptionTimer) {
      return;
    }

    const delay = Math.max(40, minIntervalMs - timeSinceLast);
    session.pendingFrontendTranscriptionTimer = setTimeout(() => {
      session.pendingFrontendTranscriptionTimer = null;

      session.transcriptionCallback({
        text: session.pendingFrontendTranscriptionText,
        isFinal: session.pendingFrontendTranscriptionIsFinal
      });

      session.lastFrontendTranscriptionText = session.pendingFrontendTranscriptionText;
      session.lastFrontendTranscriptionSentAt = Date.now();
    }, delay);
  }

  /**
   * ENSURE SWIFT HELPER (SINGLETON)
   * 
   * Spawns the Swift helper process if not already running.
   * Returns immediately if the process is alive and ready.
   * 
   * WHY: Eliminates the 3-5 second spawn delay on each mic click.
   * The Swift helper stays alive between voice sessions, so subsequent
   * start_listening commands execute near-instantly (~10ms).
   * 
   * CALLED BY: constructor (pre-warm), startVoiceInput (ensure alive)
   * 
   * @returns {Promise<void>} Resolves when Swift helper is ready
   */
  async _ensureSwiftHelper() {
    // If already alive and ready, return immediately
    if (this.sharedSwiftProcess && !this.sharedSwiftProcess.killed && this.swiftProcessReady) {
      return;
    }
    
    // If a spawn is already in progress, wait for it
    if (this.swiftProcessReadyPromise) {
      console.log('[VoicePipelineService] Swift helper spawn already in progress — waiting...');
      return this.swiftProcessReadyPromise;
    }
    
    const swiftHelperPath = path.join(__dirname, '../../../swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');
    console.log(`[VoicePipelineService] Spawning singleton Swift helper: ${swiftHelperPath}`);
    
    this.swiftProcessReady = false;
    
    // Create a promise that resolves when the Swift helper sends "ready"
    this.swiftProcessReadyPromise = new Promise((resolve, reject) => {
      this.swiftProcessReadyResolve = resolve;
      
      try {
        this.sharedSwiftProcess = spawn(swiftHelperPath);
        
        // Handle stdout (responses from Swift)
        // Route to the active session if one exists
        this.sharedSwiftProcess.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const response = JSON.parse(line);
              
              // Check for "ready" signal from Swift helper
              if (response.type === 'ready') {
                console.log('[VoicePipelineService] ✅ Swift helper ready (singleton)');
                this.swiftProcessReady = true;
                if (this.swiftProcessReadyResolve) {
                  this.swiftProcessReadyResolve();
                  this.swiftProcessReadyResolve = null;
                }
              }
              
              // Route to active session if one exists
              const activeSession = this._getActiveSession();
              if (activeSession) {
                this.handleSwiftResponse(response, activeSession);
              }
            } catch (error) {
              console.error('[VoicePipelineService] Error parsing Swift response:', error, line);
            }
          }
        });
        
        // Handle stderr (logs from Swift)
        this.sharedSwiftProcess.stderr.on('data', (data) => {
          console.log(`[Swift Helper] ${data.toString().trim()}`);
        });
        
        // Handle unexpected process exit — mark as needing respawn
        this.sharedSwiftProcess.on('exit', (code, signal) => {
          console.log(`[VoicePipelineService] Swift helper exited unexpectedly: code=${code}, signal=${signal}`);
          this.sharedSwiftProcess = null;
          this.swiftProcessReady = false;
          this.swiftProcessReadyPromise = null;
          
          // Mark any active session as not listening since the process died
          for (const [, session] of this.sessions) {
            session.isListening = false;
          }
        });
        
        // Timeout: if ready signal doesn't come within 5s, resolve anyway
        // (the old code waited 500ms blindly, this is more robust)
        setTimeout(() => {
          if (!this.swiftProcessReady) {
            console.warn('[VoicePipelineService] Swift helper did not send ready within 5s — proceeding anyway');
            this.swiftProcessReady = true;
            if (this.swiftProcessReadyResolve) {
              this.swiftProcessReadyResolve();
              this.swiftProcessReadyResolve = null;
            }
          }
        }, 5000);
        
      } catch (error) {
        this.swiftProcessReadyPromise = null;
        reject(error);
      }
    });
    
    return this.swiftProcessReadyPromise;
  }
  
  /**
   * GET ACTIVE SESSION
   * 
   * Returns the currently active voice session (there's only ever one in this Electron app).
   * Used by the singleton Swift helper to route responses to the right session.
   * 
   * @returns {Object|null} Active session or null
   */
  _getActiveSession() {
    for (const [, session] of this.sessions) {
      if (session.isListening) return session;
    }
    // Return any session (even if not "listening") for TTS/pipeline events
    for (const [, session] of this.sessions) {
      return session;
    }
    return null;
  }

  /**
   * START VOICE INPUT
   * 
   * Starts voice input capture for a session.
   * Uses the singleton Swift helper (already warmed up) for near-instant startup.
   * 
   * PERFORMANCE (2026-02-06):
   * Previously: spawn process (~1-2s) + 500ms wait + audio init = ~3-5s
   * Now: send start_listening command to warm process = ~10ms
   * 
   * @param {string} sessionId - Session ID
   * @param {Object} settings - Voice settings
   * @param {Function} transcriptionCallback - Called with transcription updates
   * @returns {Promise<Object>} Voice session object
   */
  async startVoiceInput(sessionId, settings, transcriptionCallback) {
    console.log(`[VoicePipelineService] Starting voice input for ${sessionId}`);

    // Create session state
    const session = {
      id: sessionId,
      settings,
      transcriptionCallback,
      isListening: true,
      currentTranscription: '',
      latestTranscription: '',  // Store latest transcription for timer reset pattern
      textAtLastTimerReset: '',  // Store text at the time we last started/reset the timer
                                 // Used to compare growth since last reset (not since last update)
      
      // VOLATILE-AWARE TEXT TRACKING (2026-02-07):
      // SpeechAnalyzer sends two types of results:
      //   - Volatile (isFinal=false): progressive guesses that REPLACE each other
      //   - Final (isFinal=true): committed segments that ACCUMULATE
      // These fields track them separately so mergeTranscriptionText can
      // properly handle both without garbling the text.
      finalizedText: '',        // Accumulated finalized segments (immutable once set)
      currentVolatile: '',      // Latest volatile text (replaced on each volatile update)
      lastVadHeartbeatAt: 0,    // Timestamp of last VAD heartbeat from Swift (speech energy detected)
      
      // CASCADE EPOCH (2026-02-07):
      // Each time resetSilenceTimer is called, this increments. The timer cascade's
      // async function checks this before proceeding. If the epoch changed (meaning
      // a newer transcription arrived and reset the cascade), the old cascade aborts.
      // This prevents "zombie" timer callbacks from processing stale text after
      // a transcription update resets the cascade.
      cascadeEpoch: 0,
      silenceTimers: {
        llm: null,
        tts: null,
        playback: null,
        confirm: null
      },
      cachedResponses: {
        llm: null,
        tts: null
      },
      swiftProcess: null,  // Legacy field — now uses this.sharedSwiftProcess
      // CRITICAL: Track if we're currently in the response pipeline
      // This includes: timers active, LLM processing, TTS generation, or audio playback
      // Used to detect if user speech should trigger an interruption
      isInResponsePipeline: false,
      // Track if TTS is currently playing
      isTTSPlaying: false,
      // Track if we're processing a response (prevents duplicate LLM calls)
      isProcessingResponse: false,
      // CANCELLATION FLAG (2026-02-06): Set to true when voice is stopped.
      // Timer 3's polling loop checks this to abort early, preventing
      // stale LLM calls and duplicate messages after the user stops voice.
      isCancelled: false,
      // FRONTEND TRANSCRIPTION SMOOTHING (2026-02-07):
      // We don't want to spam the frontend with every single partial result.
      // The STT can update every ~100ms (sometimes faster), which makes the
      // UI feel jittery and "choppy". We debounce outgoing updates so the
      // UI sees a smoother, more legible stream of text.
      //
      // IMPORTANT: This does NOT change the backend's timer logic. We still
      // use EVERY transcription update to reset the silence timers. This is
      // purely a presentation smoothing layer for the UI.
      lastFrontendTranscriptionText: '',
      lastFrontendTranscriptionSentAt: 0,
      pendingFrontendTranscriptionText: '',
      pendingFrontendTranscriptionIsFinal: false,
      pendingFrontendTranscriptionTimer: null,
      // TURN BOUNDARY TRACKING (2026-02-07):
      // We track when we first heard speech in the current utterance and
      // when we last received any transcription update. This lets us
      // enforce minimum utterance duration and a two-step silence check
      // before sending a message.
      firstTranscriptionAt: 0,
      lastTranscriptionAt: 0,
      awaitingSilenceConfirmation: false,
      // ECHO SUPPRESSION (2026-02-07):
      // When the AI speaks, the microphone can pick up TTS audio.
      // That echo can be misclassified as user speech and triggers
      // interruption + new timer cascades, which creates "choppy" turns.
      //
      // We store the last TTS text + timestamp so we can ignore tiny
      // echo fragments that match the AI's spoken words.
      lastSpokenText: '',
      lastSpokenAt: 0
    };

    try {
      // Ensure singleton Swift helper is alive (pre-warmed in constructor, so usually instant)
      const ensureStart = Date.now();
      await this._ensureSwiftHelper();
      const ensureElapsed = Date.now() - ensureStart;
      
      if (ensureElapsed > 100) {
        console.log(`[VoicePipelineService] Swift helper ensure took ${ensureElapsed}ms (cold start)`);
      }
      
      // Point session's swiftProcess at the shared singleton
      // This keeps backward compatibility with sendSwiftCommand which checks session.swiftProcess
      session.swiftProcess = this.sharedSwiftProcess;

      // Send start_listening command — NO spawn delay, NO 500ms wait!
      this.sendSwiftCommand(session, {
        type: 'start_listening',
        data: null
      });

      this.sessions.set(sessionId, session);

      return session;
    } catch (error) {
      console.error('[VoicePipelineService] Error starting Swift helper:', error);
      throw error;
    }
  }

  /**
   * SEND SWIFT COMMAND
   * 
   * Sends a JSON command to the Swift helper process.
   * 
   * @param {Object} session - Voice session
   * @param {Object} command - Command object
   */
  sendSwiftCommand(session, command) {
    if (!session.swiftProcess || !session.swiftProcess.stdin.writable) {
      console.error('[VoicePipelineService] Swift process not available');
      return;
    }

    try {
      const json = JSON.stringify(command) + '\n';
      session.swiftProcess.stdin.write(json);
      console.log(`[VoicePipelineService] Sent command to Swift: ${command.type}`);
    } catch (error) {
      console.error('[VoicePipelineService] Error sending Swift command:', error);
    }
  }

  /**
   * HANDLE SWIFT RESPONSE
   * 
   * Processes responses from the Swift helper.
   * 
   * CRITICAL CHANGE (2026-01-21):
   * This now implements the Accountability app's interruption detection logic.
   * Every transcription update is checked to see if it should trigger an interruption.
   * 
   * INTERRUPTION DETECTION LOGIC (from Accountability CallManager.swift:575-639):
   * 1. Check if we're in the response pipeline (timers active, TTS playing, etc.)
   * 2. If yes, and we get a transcription (even partial), it's an interruption
   * 3. Stop everything: timers, TTS, cached responses
   * 4. Let the user continue speaking
   * 
   * @param {Object} response - Response from Swift
   * @param {Object} session - Voice session
   */
  handleSwiftResponse(response, session) {
    console.log(`[VoicePipelineService] Swift response: ${response.type}`);

    switch (response.type) {
      case 'ready':
        console.log('[VoicePipelineService] Swift helper is ready');
        break;
      
      case 'listening_active':
        // VISUAL FEEDBACK (2026-02-06): Swift helper confirmed audio engine is
        // running and recognition is active. Forward to frontend so the mic
        // button can show a "listening" animation immediately.
        console.log('[VoicePipelineService] ✅ Swift helper confirmed listening is active');
        if (this.server && this.server.connections) {
          for (const [ws, connectionState] of this.server.connections) {
            if (connectionState.id === session.id) {
              this.server.sendMessage(ws, {
                type: 'listening_active',
                data: { status: 'listening' }
              });
              break;
            }
          }
        }
        break;

      case 'transcription_update':
        const text = response.data?.text || '';
        const isFinal = response.data?.isFinal || false;
        const swiftIsSpeaking = response.data?.isSpeaking || false;
        
        // AUDIO TIMESTAMPS (2026-02-07):
        // The Swift helper now sends audioStartTime and audioEndTime with each
        // transcription, representing when in the audio stream the speech occurred.
        // These are in seconds relative to the start of the listening session.
        // A value of -1 means "not available" (e.g., no audioTimeRange attribute).
        //
        // WHY THIS MATTERS:
        // Previously, we measured silence using Date.now() (wall-clock time of
        // when the IPC message arrived). This has ~50-200ms of jitter from:
        //   - Audio buffer processing delay
        //   - AVAudioConverter overhead
        //   - IPC serialization (JSON encode -> stdout -> read -> parse)
        //   - Node.js event loop scheduling
        //
        // Audio timestamps are computed from the actual audio stream position,
        // which is more accurate and consistent. We use them to:
        //   1) Track the actual audio time of the last spoken word
        //   2) Correlate with TTS playback timing for better echo suppression
        //   3) Potentially improve silence detection precision in the future
        const audioStartTime = response.data?.audioStartTime ?? -1;
        const audioEndTime = response.data?.audioEndTime ?? -1;
        
        // TURN TRACKING (2026-02-07):
        // Record when we last received any transcription update, and
        // set the start time for the current utterance if this is the
        // first update after silence.
        session.lastTranscriptionAt = Date.now();
        if (!session.firstTranscriptionAt) {
          session.firstTranscriptionAt = session.lastTranscriptionAt;
        }
        session.awaitingSilenceConfirmation = false;
        
        // AUDIO TIMELINE TRACKING (2026-02-07):
        // Store the audio-stream-relative timestamps alongside the wall-clock
        // timestamps. These are used by the echo suppression and can be used
        // in the future for more precise silence detection.
        if (audioEndTime > 0) {
          session.lastAudioEndTime = audioEndTime;
          if (!session.firstAudioStartTime || session.firstAudioStartTime < 0) {
            session.firstAudioStartTime = audioStartTime;
          }
        }
        
        // Log transcription for debugging (now includes audio timestamps)
        const audioInfo = audioEndTime > 0 ? `, audio: ${audioStartTime.toFixed(2)}-${audioEndTime.toFixed(2)}s` : '';
        console.log(`[VoicePipelineService] Transcription: "${text}" (final: ${isFinal}, swiftSpeaking: ${swiftIsSpeaking}${audioInfo})`);

        // ECHO SUPPRESSION CHECK (2026-02-07):
        // If the AI is speaking and this looks like a short echo fragment,
        // ignore it entirely so we don't trigger interruptions or timer resets.
        // This keeps the conversation flow smooth and prevents "choppy" turns.
        if (this.shouldIgnoreEchoTranscription(session, text, swiftIsSpeaking)) {
          console.log('[VoicePipelineService] 🔇 Ignoring likely echo transcription while AI is speaking');
          return;
        }
        
        // CRITICAL FIX (2026-01-23): Implement Accountability's TIMER-RESET pattern
        // The key insight: Silence is detected by ABSENCE of transcriptions, not by isFinal
        // 
        // Accountability pattern:
        // 1. EVERY transcription (even empty partial) resets the silence timer
        // 2. If no transcriptions come for 1.2s, LLM timer fires (configurable)
        // 3. This creates natural turn detection based on actual silence
        //
        // This is fundamentally different from waiting for isFinal!
        
        // INTERRUPTION DETECTION (2026-02-07, ROOT CAUSE FIX):
        //
        // We check if the AI is ACTIVELY responding (LLM processing, TTS playing, or
        // Swift speaking). If so, new transcription = user interruption.
        //
        // CRITICAL BUG FIX (2026-02-07):
        // Previously, this check ALSO included `hasActiveTimersBefore` — whether the
        // silence detection timers were running. This was WRONG because:
        //
        //   1) User says "Hello" → first transcription → starts 4.5s LLM timer
        //   2) 3 seconds later, SpeechAnalyzer emits "Hello, I am" (next chunk)
        //   3) LLM timer is still pending (has 1.5s left) → hasActiveTimersBefore = true
        //   4) wasInResponsePipeline = true → FALSE INTERRUPTION!
        //   5) handleSpeechDetected resets everything, sends reset_recognition to Swift
        //   6) Swift tears down recognition, loses all buffered audio
        //   7) Only first sentence gets sent to LLM → premature send bug
        //
        // ROOT CAUSE: Silence timers being active means "we're WAITING to detect a
        // turn boundary" — NOT "the AI is responding." The timer cascade is a
        // DETECTION mechanism, not a response-in-progress indicator.
        //
        // Genuine response-in-progress indicators are:
        //   - session.isInResponsePipeline: Set when LLM timer actually fires (runLlmProcessing)
        //   - session.isTTSPlaying: Set when TTS audio starts playing
        //   - swiftIsSpeaking: Real-time flag from Swift helper that TTS process is active
        //
        // FIX: Only check actual response-in-progress flags, NOT pending silence timers.
        // This eliminates the false interruption that was the root cause of Bug 5
        // (premature send for long utterances).
        const wasInResponsePipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
        
        // Check for interruption if we're in response pipeline
        if (wasInResponsePipeline && text.trim().length > 0) {
          console.log('‼️ [VOICE INTERRUPT] User is speaking while AI is in response pipeline - triggering interruption');
          console.log(`   - In pipeline: ${session.isInResponsePipeline}`);
          console.log(`   - TTS playing: ${session.isTTSPlaying}`);
          console.log(`   - Swift speaking: ${swiftIsSpeaking}`);
          
          // Trigger interruption - this will clear timers and cached responses
          this.handleSpeechDetected(session);
        }
        
        // VOLATILE-AWARE MERGE (2026-02-07):
        // Pass the session and isFinal flag so the merge function can properly
        // distinguish volatile results (which replace each other) from final
        // results (which accumulate). See mergeTranscriptionText for full docs.
        const mergedTranscription = this.mergeTranscriptionText(
          session,
          text,
          isFinal
        );
        session.currentTranscription = mergedTranscription;

        // Keep latestTranscription aligned with the merged full utterance.
        if (mergedTranscription.trim().length > 0) {
          session.latestTranscription = mergedTranscription;
        }

        // Send transcription to frontend (debounced for smoother UI)
        this.scheduleFrontendTranscriptionUpdate(
          session,
          mergedTranscription,
          isFinal
        );
        
        // RE-EVALUATE pipeline state AFTER interruption handler may have cleared it.
        //
        // CRITICAL BUG FIX (2026-02-07):
        // Previously included `hasActiveTimersAfter` — whether silence timers were
        // still running. This prevented resetSilenceTimer from being called during
        // normal speech! Here's why that was wrong:
        //
        //   1) User says "Hello" → resetSilenceTimer → starts 4.5s LLM timer
        //   2) User says "Hello, I am" (3s later) → timer still pending
        //   3) hasActiveTimersAfter = true → isCurrentlyInPipeline = true
        //   4) resetSilenceTimer is SKIPPED → timer is NOT reset
        //   5) Timer fires 1.5s later with partial text "Hello" instead of
        //      waiting 4.5s after "Hello, I am" for the complete utterance
        //
        // The timer-reset pattern (from Accountability AI) REQUIRES that every
        // transcription update resets the timer. The timer should fire 4.5s after
        // the LAST transcription, not 4.5s after the FIRST one.
        //
        // FIX: Only check actual pipeline activity flags (LLM processing, TTS playing,
        // Swift speaking). When the AI is genuinely responding, we DON'T want to
        // start new timer cascades. But when the user is speaking (and silence timers
        // are the only "active" thing), we MUST reset timers on every transcription.
        const isCurrentlyInPipeline = session.isInResponsePipeline || session.isTTSPlaying || swiftIsSpeaking;
        
        // TIMER-RESET PATTERN (from Accountability AI):
        // Reset the timer on EVERY transcription update. Timer only fires when
        // updates STOP coming for 1.2s (llmStart config). This naturally handles:
        // - New speech: Updates keep coming → Timer keeps resetting
        // - Silence: Updates stop → Timer fires after 1.2s (+adaptive delay)
        // - Refinements: Still updates → Timer resets (doesn't matter!)
        // - Post-interruption: Pipeline was just cleared → Timer starts immediately
        //
        // SpeechAnalyzer sends updates in bursts (Finding #2 from testing).
        // Timer coalescing (50ms debounce) collapses burst resets into one cascade.
        // When user stops, updates stop. Timer fires 1.2s after last burst.
        if (!isCurrentlyInPipeline) {
          const hasMeaningfulText = mergedTranscription.trim().length > 0;
          const hasExistingTranscription = (session.latestTranscription || '').trim().length > 0;
          if (hasMeaningfulText || hasExistingTranscription) {
            // Reset the timer on EVERY update (Accountability AI pattern)
            // The timer will only fire if updates stop for 1.2s (+ adaptive delay)
            this.resetSilenceTimer(session);
          }
        }
        break;

      case 'speech_started':
        console.log('[VoicePipelineService] TTS started');
        session.isTTSPlaying = true;
        break;

      case 'speech_ended':
        console.log('[VoicePipelineService] TTS ended');
        session.isTTSPlaying = false;
        session.isInResponsePipeline = false;
        
        // RESET TRANSCRIPTION STATE AFTER AI FINISHES SPEAKING (2026-01-23, updated 2026-02-07):
        //
        // WHY: After the AI finishes, we need a clean slate for the next user turn.
        // BECAUSE: SpeechAnalyzer accumulates text across a session (Finding #1 from
        // turn detection testing). Without a reset, the next transcription will include
        // leftover text from the previous utterance (e.g., "Thank you I want to order pizza"
        // instead of just "I want to order pizza").
        //
        // PRODUCT CONTEXT: This is the conversational turn boundary. The AI just
        // finished its response, now we listen fresh for the user's next utterance.
        session.latestTranscription = '';
        session.currentTranscription = '';
        session.textAtLastTimerReset = '';
        session.finalizedText = '';
        session.currentVolatile = '';
        session.isProcessingResponse = false;
        session.firstTranscriptionAt = 0;
        session.lastTranscriptionAt = 0;
        session.awaitingSilenceConfirmation = false;
        
        // CRITICAL: Tell Swift helper to reset the recognition session.
        // This destroys the current SpeechAnalyzer instance and creates a fresh one.
        // Validated by turn detection testing (Finding #1): SpeechAnalyzer accumulates
        // all transcription text within a session, so we MUST reset between turns.
        // The reset does: stopListeningAsync() → startListeningInternal() in Swift,
        // which properly awaits analyzer finalization before starting clean.
        this.sendSwiftCommand(session, {
          type: 'reset_recognition',
          data: null
        });
        
        console.log('[VoicePipelineService] Transcription state reset and Swift recognition restarted after TTS ended');
        break;
      
      // SINGLE-WORD FLUSH HANDLER (2026-02-07):
      //
      // The Swift helper sends this when it detects speech energy followed by
      // sustained silence (~2.1 seconds). This addresses Finding #11 from our
      // turn detection testing: single-word utterances like "yes", "no", "ok"
      // RELIABLY produce ZERO transcription results because SpeechAnalyzer
      // processes audio in ~4-second chunks. A 0.3-second word doesn't provide
      // enough signal for the analyzer to commit to a transcription.
      //
      // HOW THIS HELPS:
      // Without this, the user says "yes" and nothing happens:
      //   - No transcription_update arrives → no timer cascade starts
      //   - No visual feedback in the input field
      //   - Turn hangs indefinitely until they speak more
      //
      // With this, when Swift detects "speech then silence":
      //   - If we already have transcription text → start the timer cascade now
      //     (the analyzer DID emit something, we just need to fire the response)
      //   - If we have NO transcription text → the analyzer swallowed the word.
      //     We notify the frontend so the user gets feedback ("I didn't catch that")
      //     and reset to listen again.
      //
      // PRODUCT IMPACT: Users can say "yes" and get a response instead of silence.
      // VAD HEARTBEAT HANDLER (2026-02-07):
      // Swift sends "vad_speech_active" every ~300ms while the microphone
      // picks up speech-level audio energy. This tells us the user is STILL
      // speaking, even if the SpeechAnalyzer hasn't emitted new transcription
      // updates (due to its 4-second processing window).
      //
      // WHY THIS IS CRITICAL:
      // E2E testing showed that long utterances (7 sentences, ~20 seconds)
      // get cut off after the first sentence. The 1.2s silence timer fires
      // during the SpeechAnalyzer's processing gap (between 4-second chunks)
      // because no transcription_updates arrive during the gap.
      //
      // FIX: Track lastVadHeartbeatAt. In the timer cascade, check if
      // a heartbeat arrived recently — if so, delay the timer.
      case 'vad_speech_active':
        session.lastVadHeartbeatAt = Date.now();
        // Don't log every heartbeat (too noisy), just track timing
        break;
      
      case 'speech_energy_silence':
        // REMOVED (2026-02-08): This event is no longer sent by Swift helper.
        // With .fastResults enabled, short utterances produce volatile results
        // immediately (200-500ms), so we don't need special "speech then silence"
        // detection or the single-word flush mechanism.
        console.log('[VoicePipelineService] ⚠️ Received deprecated speech_energy_silence event (should not happen)');
        break;

      case 'recognition_restarted':
        // INFORMATIONAL: The Swift helper proactively restarted recognition.
        // This happens when:
        //   - Session aged out (ran for >30s, accuracy degradation prevention)
        //   - Hang detected (no results for >5s, recovery from silent failure)
        //
        // WHY WE LOG THIS:
        // This helps diagnose performance issues. If we see frequent restarts
        // due to hang detection, it may indicate a microphone or audio issue.
        // If we see restarts due to session aging, that's normal and expected.
        //
        // WE DO NOT NEED TO DO ANYTHING:
        // The Swift helper handles the restart internally. The transcription
        // state on the backend side doesn't need to change because the Swift
        // restart gives us a fresh recognition session that starts accumulating
        // new text from scratch (which is what we want).
        console.log(`[VoicePipelineService] 🔄 Swift recognition restarted: reason=${response.data?.reason}, restartCount=${response.data?.restartCount}`);
        if (response.data?.reason === 'hang_detected') {
          console.warn(`[VoicePipelineService] ⚠️ Recognition hang detected and recovered (${response.data?.timeSinceLastResult?.toFixed(1)}s without results)`);
        }
        break;

      case 'voices_list':
        console.log('[VoicePipelineService] Received voices list:', response.data.voices.length);
        break;

      case 'error':
        console.error('[VoicePipelineService] Swift error:', response.data.message);
        break;

      default:
        console.warn('[VoicePipelineService] Unknown Swift response type:', response.type);
    }
  }

  /**
   * STOP VOICE INPUT
   * 
   * Stops voice input capture for a session.
   * 
   * @param {Object} session - Voice session object
   * @returns {Promise<void>}
   */
  async stopVoiceInput(session) {
    console.log(`[VoicePipelineService] Stopping voice input for ${session.id}`);

    session.isListening = false;
    
    // CANCELLATION FLAG (2026-02-06): Signal any in-flight timer callbacks
    // (especially Timer 3's polling loop) to abort early.
    // WHY: Timer 3's setTimeout callback may have already fired and entered
    // its async polling loop. clearTimeout can't stop it. This flag does.
    session.isCancelled = true;
    
    // Also reset pipeline state so nothing thinks we're still processing
    session.isInResponsePipeline = false;
    session.isTTSPlaying = false;
    session.isProcessingResponse = false;

    // Clear all timers
    this.clearAllTimers(session);

    // Clear any pending frontend transcription updates
    if (session.pendingFrontendTranscriptionTimer) {
      clearTimeout(session.pendingFrontendTranscriptionTimer);
      session.pendingFrontendTranscriptionTimer = null;
    }
    session.pendingFrontendTranscriptionText = '';
    session.pendingFrontendTranscriptionIsFinal = false;
    session.firstTranscriptionAt = 0;
    session.lastTranscriptionAt = 0;
    session.awaitingSilenceConfirmation = false;

    // Send stop command to Swift helper — but DON'T kill the process!
    // SINGLETON PATTERN (2026-02-06): The Swift helper stays alive for instant
    // re-use next time. Only send stop_listening to pause recognition.
    if (session.swiftProcess) {
      this.sendSwiftCommand(session, {
        type: 'stop_listening',
        data: null
      });
    }

    // Remove session
    this.sessions.delete(session.id);
  }
  
  /**
   * SHUTDOWN (CLEANUP)
   * 
   * Kills the singleton Swift helper process. Called on server shutdown.
   * This is the ONLY place the Swift process gets killed (except crash recovery).
   */
  shutdown() {
    console.log('[VoicePipelineService] Shutting down — killing Swift helper');
    if (this.sharedSwiftProcess && !this.sharedSwiftProcess.killed) {
      this.sharedSwiftProcess.kill();
      this.sharedSwiftProcess = null;
    }
    this.swiftProcessReady = false;
    this.swiftProcessReadyPromise = null;
  }

  /**
   * RESET SILENCE TIMER
   * 
   * Called on EVERY transcription update (like Accountability's resetSilenceTimer).
   * This is the KEY to natural turn detection!
   * 
   * CRITICAL INSIGHT:
   * Silence is detected by ABSENCE of transcriptions, not by isFinal flag.
   * Every time we get a transcription, we reset the timer.
   * If no transcriptions come for 1.2s, the LLM timer fires.
   * 
   * This creates natural turn detection based on actual silence in the audio stream.
   * 
   * TIMER COALESCING (2026-02-07):
   * Testing revealed (Finding #2) that SpeechAnalyzer sends results in BURSTS —
   * 10+ updates arriving within 1-2ms. Each call to resetSilenceTimer was:
   *   1) Clearing all timers (clearAllTimers)
   *   2) Creating 3 new timers (startTimerCascade)
   * That's 30+ timer create/destroy cycles per burst, all redundant.
   *
   * FIX: Debounce the actual timer cascade creation with a short 50ms window.
   * This collapses an entire burst into a single timer cascade start, which:
   *   - Reduces overhead (30x fewer timer operations per burst)
   *   - Ensures the timer window starts AFTER the last update in the burst
   *     (more accurate silence detection)
   *   - Still responds instantly to isolated updates (50ms is imperceptible)
   * 
   * @param {Object} session - Voice session
   */
  resetSilenceTimer(session) {
    // Update timing markers for this utterance (always, no debounce)
    session.lastTranscriptionAt = Date.now();
    if (!session.firstTranscriptionAt) {
      session.firstTranscriptionAt = session.lastTranscriptionAt;
    }
    session.awaitingSilenceConfirmation = false;
    
    // CASCADE EPOCH INCREMENT (2026-02-07):
    // Every time the silence timer is reset (new transcription arrived),
    // increment the epoch. Any in-flight timer callback (including those
    // in the VAD wait loop) will see the epoch changed and abort.
    session.cascadeEpoch = (session.cascadeEpoch || 0) + 1;
    
    // Clear any existing silence timers (like Accountability's timerManager.invalidateTimer())
    this.clearAllTimers(session);
    
    // DEBOUNCE TIMER CASCADE (2026-02-07):
    // Instead of immediately starting the cascade (which gets thrashed by burst updates),
    // schedule it with a 50ms delay. If another transcription arrives within 50ms,
    // the previous schedule is cancelled and a new one starts.
    // 50ms is chosen because:
    //   - Burst updates arrive in <5ms, so 50ms collapses the entire burst
    //   - 50ms is imperceptible to the user (no added latency to turn detection)
    //   - The actual silence thresholds are 1200-3200ms, so 50ms is negligible
    if (session._timerCoalesceTimeout) {
      clearTimeout(session._timerCoalesceTimeout);
    }
    session._timerCoalesceTimeout = setTimeout(() => {
      session._timerCoalesceTimeout = null;
      console.log(`[VoicePipelineService] Starting timer cascade for ${session.id} (coalesced)`);
      this.startTimerCascade(session);
    }, 50);
  }

  /**
   * START TIMER CASCADE
   * 
   * Starts the three-timer cascade for turn detection.
   * This is called after clearing existing timers in resetSilenceTimer.
   * 
   * TIMER CASCADE:
   * 1. 1.2s: Start LLM processing (cached, user doesn't see this yet)
   * 2. 2.2s: Start TTS generation (uses cached LLM result)
   * 3. 2.0s: Start audio playback (uses cached TTS result)
   * 
   * If user speaks again before any timer fires, all timers are cleared
   * and cached responses are discarded. This enables natural interruption.
   * 
   * @param {Object} session - Voice session
   */
  startTimerCascade(session) {
    console.log(`[VoicePipelineService] Starting timer cascade for ${session.id}`);
    
    // CRITICAL: Do NOT set isInResponsePipeline here!
    // We only set it when the LLM timer actually fires (after 1.2s+ of silence)
    // This prevents false interruption detection while user is still speaking

    // ADAPTIVE SILENCE BUFFER (2026-02-07):
    // If the user only spoke a few words, we wait a little longer before
    // triggering the LLM. This reduces "premature send" when the recognizer
    // briefly pauses mid-sentence (no partial updates for a moment).
    //
    // WHY: Users reported messages sending before they finished speaking.
    // BECAUSE: SpeechAnalyzer processes audio in ~4-second chunks (Finding #10)
    // and results arrive in bursts (Finding #2), creating gaps >1s mid-utterance
    // that our timers could misinterpret as silence.
    const currentText = (session.latestTranscription || '').trim();
    const wordCount = currentText.length > 0 ? currentText.split(/\s+/).length : 0;
    let adaptiveDelayMs = 0;
    if (wordCount <= 3) {
      adaptiveDelayMs = 600;
    } else if (wordCount <= 6) {
      adaptiveDelayMs = 300;
    }

    const llmDelay = this.timerConfig.llmStart + adaptiveDelayMs;
    const ttsDelay = this.timerConfig.ttsStart + adaptiveDelayMs;
    const playbackDelay = this.timerConfig.playbackStart + adaptiveDelayMs;
    const ttsDelayFromLlm = Math.max(0, ttsDelay - llmDelay);
    const playbackDelayFromLlm = Math.max(0, playbackDelay - llmDelay);
    const confirmWindowMs = 800;
    const minUtteranceMs = 1800;
    
    // VAD-AWARE TIMER GATE (2026-02-07):
    // Before starting the LLM timer, check if the user is still speaking
    // according to the Swift VAD. If heartbeats arrived within the last 500ms,
    // the user is still speaking — delay the timer cascade.
    //
    // WHY: SpeechAnalyzer has 4-second processing windows. During these windows,
    // no transcription_update messages arrive, but the user IS still speaking.
    // Without this check, the 1.2s timer fires during the processing gap and
    // sends an incomplete message (Bug 5: "First I woke up early" instead of
    // the full 7-sentence utterance).
    //
    // HOW: Poll session.lastVadHeartbeatAt every 200ms. If a heartbeat arrived
    // within the last 600ms, the user is still speaking — reschedule the cascade.
    // Maximum wait: 30 seconds (safety valve against stuck state).
    const vadCheckIntervalMs = 200;
    // TUNED (2026-02-07): Must be long enough to cover sentence-boundary pauses
    // in natural speech. The macOS `say` command produces pauses of 1-2 seconds
    // between sentences. The SpeechAnalyzer has 4-second processing windows that
    // create gaps > 3 seconds in transcription updates.
    //
    // This threshold should be: longer than the longest natural pause between
    // sentences in continuous speech, but shorter than the user's actual "I'm done
    // talking" silence.
    //
    // 2026-02-08 UPDATE: Reduced from 3000ms to 1500ms.
    // With the lightweight input rotation fix, SpeechAnalyzer no longer
    // has ~4-second cold-start gaps between turns. Volatile results stream
    // in real-time (~200-500ms between updates). The VAD heartbeat still
    // provides a safety net, but the threshold can be much tighter.
    //
    // 1500ms covers natural sentence pauses (1-2s) without adding excessive
    // delay. Total worst-case: 1.2s (timer) + 1.5s (VAD) = 2.7s before AI
    // starts thinking — much better than the previous 4.2s.
    const vadSilenceThresholdMs = 1500;  // Consider VAD silent after 1.5s with no heartbeat
    const vadMaxWaitMs = 45000;          // Safety: never wait more than 45s

    const runLlmProcessing = async () => {
      session.isInResponsePipeline = true;

      if (session.isProcessingResponse) {
        console.log('[VoicePipelineService] Already processing response, skipping LLM');
        return;
      }

      session.isProcessingResponse = true;

      session.silenceTimers.tts = setTimeout(async () => {
        console.log(`[VoicePipelineService] Timer 2 (TTS) fired for ${session.id}`);
        if (!session.isInResponsePipeline) {
          console.log('[VoicePipelineService] Timer 2 cancelled by interruption');
          return;
        }
        console.log('[VoicePipelineService] TTS will be generated in Timer 3 (playback)');
      }, ttsDelayFromLlm);

      session.silenceTimers.playback = setTimeout(async () => {
        console.log(`[VoicePipelineService] Timer 3 (Playback) fired for ${session.id}`);
        if (session.isCancelled) {
          console.log('[VoicePipelineService] ⛔ Timer 3 aborted at entry — session was cancelled');
          return;
        }

        const maxWaitTime = 10000;
        const pollInterval = 200;
        const startTime = Date.now();

        while (!session.cachedResponses.llm && (Date.now() - startTime) < maxWaitTime) {
          if (session.isCancelled) {
            console.log('[VoicePipelineService] ⛔ Timer 3 aborted during polling — session was cancelled');
            return;
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        if (session.cachedResponses.llm) {
          const responseText = (session.cachedResponses.llm.text || '').trim();
          console.log('[VoicePipelineService] Sending messages to frontend');
          this.sendUserMessageToFrontend(session, session.latestTranscription);

          if (responseText.length > 0) {
            this.sendResponseToFrontend(session, session.cachedResponses.llm);
          } else {
            console.warn('[VoicePipelineService] ⚠️ LLM returned empty text — not sending blank AI response');
            if (this.server && this.server.connections) {
              for (const [ws, connectionState] of this.server.connections) {
                if (connectionState.id === session.id) {
                  this.server.sendMessage(ws, {
                    type: 'error',
                    data: { message: 'AI response was empty. Please try again.' }
                  });
                  break;
                }
              }
            }
          }

          this.sendSwiftCommand(session, {
            type: 'reset_recognition',
            data: null
          });
          console.log('[VoicePipelineService] Sent reset_recognition at turn completion (before TTS playback)');

          if (responseText.length > 0) {
            session.isTTSPlaying = true;
            this.generateTTS(responseText, session.settings, session);
          } else {
            console.log('[VoicePipelineService] Skipping TTS for empty response — resetting pipeline immediately');
            session.isTTSPlaying = false;
            session.isInResponsePipeline = false;
            session.latestTranscription = '';
            session.currentTranscription = '';
            session.textAtLastTimerReset = '';
            session.finalizedText = '';
            session.currentVolatile = '';
            session.isProcessingResponse = false;
            session.firstTranscriptionAt = 0;
            session.lastTranscriptionAt = 0;
            session.awaitingSilenceConfirmation = false;
          }
        } else {
          console.error('[VoicePipelineService] Timer 3 timed out waiting for LLM response');
          this.sendUserMessageToFrontend(session, session.latestTranscription);
          if (session.sendToFrontend) {
            session.sendToFrontend({
              type: 'error',
              data: { message: 'AI response timed out. Please try again.' }
            });
          }
        }
      }, playbackDelayFromLlm);

      try {
        console.log(`[VoicePipelineService] Processing transcription: "${session.latestTranscription}"`);

        if (!this.llmService) {
          const UnifiedLLMService = require('./UnifiedLLMService');
          this.llmService = new UnifiedLLMService();
          console.warn('[VoicePipelineService] Created fallback UnifiedLLMService (not using server shared instance)');
        }
        if (!this.conversationService) {
          const ConversationService = require('./ConversationService');
          this.conversationService = new ConversationService();
          console.warn('[VoicePipelineService] Created fallback ConversationService (not using server shared instance)');
        }

        let conversation = session.conversation;
        if (!conversation) {
          conversation = await this.conversationService.createConversation();
          session.conversation = conversation;
          this.sendConversationCreatedToFrontend(session, conversation);
        }

        await this.conversationService.addMessage(conversation.id, {
          role: 'user',
          content: session.latestTranscription,
          timestamp: Date.now()
        });

        let fullResponse = '';
        let bubbles = [];
        let artifact = null;
        
        // RETRY LOGIC FOR EMPTY RESPONSES (2026-02-07):
        // E2E testing showed Gemini sometimes returns empty responses,
        // especially on short prompts or when rate-limited. Retrying
        // once with a brief delay often succeeds.
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          fullResponse = '';
          bubbles = [];
          artifact = null;
          
          await this.llmService.generateResponse(
            conversation,
            session.settings || {},
            {
              onChunk: (chunk) => {
                fullResponse += chunk;
              },
              onBubbles: (generatedBubbles) => {
                bubbles = generatedBubbles;
              },
              onArtifact: (generatedArtifact) => {
                artifact = generatedArtifact;
              }
            }
          );
          
          if (fullResponse.trim().length > 0) {
            break; // Got a response, stop retrying
          }
          
          if (attempt < maxRetries) {
            console.warn(`[VoicePipelineService] ⚠️ LLM returned empty response (attempt ${attempt}/${maxRetries}), retrying in 500ms...`);
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            console.warn(`[VoicePipelineService] ⚠️ LLM returned empty response after ${maxRetries} attempts`);
          }
        }

        session.cachedResponses.llm = {
          text: fullResponse,
          bubbles: bubbles,
          artifact: artifact
        };

        console.log(`[VoicePipelineService] LLM response cached: "${fullResponse.substring(0, 50)}..."`);

        await this.conversationService.addMessage(conversation.id, {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now()
        });

        console.log(`[VoicePipelineService] AI response saved to conversation history`);
      } catch (error) {
        console.error('[VoicePipelineService] Error in LLM processing:', error);

        session.cachedResponses.llm = {
          text: "I'm having trouble processing that right now. Could you try again?",
          bubbles: ['try again?', 'tell me more'],
          artifact: null
        };

        session.isProcessingResponse = false;
      }
    };

    // Capture the cascade epoch to detect if this timer was superseded by a newer cascade
    const thisCascadeEpoch = session.cascadeEpoch || 0;
    
    session.silenceTimers.llm = setTimeout(async () => {
      // EPOCH CHECK (2026-02-07): If a newer transcription arrived and reset the
      // cascade, this timer's epoch will be stale. Abort to prevent processing
      // stale/incomplete text. This is the key fix for Bug 5.
      if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
        console.log(`[VoicePipelineService] ⛔ Timer 1 stale — epoch changed (${thisCascadeEpoch} → ${session.cascadeEpoch}), aborting`);
        return;
      }
      
      console.log(`[VoicePipelineService] Timer 1 (LLM) fired for ${session.id} - ${llmDelay}ms of silence detected (adaptive=${adaptiveDelayMs}ms)!`);

      if (session.isCancelled) {
        console.log('[VoicePipelineService] ⛔ Timer 1 aborted — session was cancelled');
        return;
      }
      
      // VAD-AWARE GATE (2026-02-07):
      // Before processing, check if the user is still speaking according to Swift VAD.
      // If VAD heartbeats arrived recently, the user hasn't stopped — delay until they do.
      //
      // This is the critical fix for Bug 5 (premature send of long utterances).
      // The SpeechAnalyzer has 4-second processing windows. Between chunks,
      // no transcription_update messages arrive for >1.2s, causing the timer
      // to fire. But the Swift VAD still detects speech energy. By waiting for
      // VAD silence, we ensure we only process when the user truly stopped.
      const vadWaitStart = Date.now();
      while (true) {
        // EPOCH CHECK in VAD loop: new transcription may have arrived
        if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
          console.log(`[VoicePipelineService] ⛔ Timer 1 aborted during VAD wait — epoch changed (${thisCascadeEpoch} → ${session.cascadeEpoch})`);
          return;
        }
        
        const timeSinceVad = Date.now() - (session.lastVadHeartbeatAt || 0);
        if (timeSinceVad > vadSilenceThresholdMs) {
          // VAD confirms silence — user has stopped speaking
          break;
        }
        if (Date.now() - vadWaitStart > vadMaxWaitMs) {
          console.log('[VoicePipelineService] ⚠️ VAD wait exceeded safety limit — proceeding anyway');
          break;
        }
        if (session.isCancelled) {
          console.log('[VoicePipelineService] ⛔ Timer 1 aborted during VAD wait — session was cancelled');
          return;
        }
        // User still speaking — wait and check again
        await new Promise(resolve => setTimeout(resolve, vadCheckIntervalMs));
      }
      console.log(`[VoicePipelineService] VAD confirmed silence after ${Date.now() - vadWaitStart}ms wait`);
      
      // FINAL EPOCH CHECK (2026-02-07): After the VAD wait (which can take seconds),
      // check again if a newer cascade has taken over.
      if ((session.cascadeEpoch || 0) !== thisCascadeEpoch) {
        console.log(`[VoicePipelineService] ⛔ Timer 1 aborted after VAD wait — epoch changed during wait (${thisCascadeEpoch} → ${session.cascadeEpoch})`);
        return;
      }

      const now = Date.now();
      const latestText = (session.latestTranscription || '').trim();
      const wordCountNow = latestText.length > 0 ? latestText.split(/\s+/).length : 0;
      const timeSinceFirst = session.firstTranscriptionAt ? (now - session.firstTranscriptionAt) : 0;
      const shouldConfirmSilence = wordCountNow <= 6 || (timeSinceFirst > 0 && timeSinceFirst < minUtteranceMs);

      if (shouldConfirmSilence && !session.awaitingSilenceConfirmation) {
        session.awaitingSilenceConfirmation = true;

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

        session.silenceTimers.confirm = setTimeout(() => {
          if (session.isCancelled) {
            return;
          }
          const confirmNow = Date.now();
          const timeSinceLast = confirmNow - (session.lastTranscriptionAt || 0);
          const timeSinceFirstConfirm = session.firstTranscriptionAt ? (confirmNow - session.firstTranscriptionAt) : 0;
          if (timeSinceLast < confirmWindowMs || (timeSinceFirstConfirm > 0 && timeSinceFirstConfirm < minUtteranceMs)) {
            session.awaitingSilenceConfirmation = false;
            return;
          }
          session.awaitingSilenceConfirmation = false;
          runLlmProcessing();
        }, confirmWindowMs);
        return;
      }

      runLlmProcessing();
    }, llmDelay);
  }

  /**
   * HANDLE SPEECH DETECTED
   * 
   * Called when speech is detected after silence.
   * Clears all timers and cached responses (interruption).
   * 
   * This is the interruption mechanism. If the user starts speaking
   * again before playback starts, we cancel everything and let them
   * continue speaking.
   * 
   * @param {Object} session - Voice session
   */
  handleSpeechDetected(session) {
    console.log(`[VoicePipelineService] Speech detected (interruption) for ${session.id}`);

    // CRITICAL: Stop all timers immediately
    // This prevents any pending operations from executing
    this.clearAllTimers(session);

    // CRITICAL: Clear all cached responses
    // This ensures we don't play stale audio if user interrupted
    session.cachedResponses.llm = null;
    session.cachedResponses.tts = null;
    
    // CRITICAL: Mark that we're no longer in the response pipeline
    // This allows new turn detection to start when user finishes speaking
    session.isInResponsePipeline = false;
    
    // CRITICAL: Reset processing state (like Accountability's isProcessingResponse = false)
    session.isProcessingResponse = false;

    // CRITICAL: Reset the timer baseline text so the next transcription
    // after interruption will be treated as a "first transcription" and
    // will start a new timer immediately (since timerIsRunning will be false
    // after clearAllTimers above)
    session.textAtLastTimerReset = '';
    session.finalizedText = '';
    session.currentVolatile = '';
    session.firstTranscriptionAt = 0;
    session.lastTranscriptionAt = 0;
    session.awaitingSilenceConfirmation = false;
    
    // CRITICAL: Stop any ongoing TTS playback
    // This is the actual interruption - stop the AI from speaking
    if (session.isTTSPlaying) {
      console.log('[VoicePipelineService] Stopping TTS playback due to interruption');
      this.stopSpeaking(session);
      session.isTTSPlaying = false;
    }
    
    // INTERRUPTION OPTIMIZATION (2026-02-08, added based on Apple docs review):
    //
    // STEP 1: Cancel old audio processing BEFORE resetting.
    // Apple's cancelAnalysis(before:) tells the SpeechAnalyzer to stop processing
    // audio that predates the current timestamp. During an interruption, any audio
    // from before the user started speaking is just AI echo or stale context —
    // we don't need to wait for it to finalize.
    //
    // This frees up the Neural Engine immediately to focus on the user's new speech,
    // making interruptions feel faster and more responsive.
    //
    // From Apple docs: "Stops analyzing audio predating the given time."
    //
    // DECIDED BY AI (2026-02-08): Direct application of Apple docs API that we
    // were not previously using. Low risk (non-fatal if it fails), high impact
    // on interruption responsiveness.
    this.sendSwiftCommand(session, {
      type: 'cancel_old_audio',
      data: null
    });
    console.log('[VoicePipelineService] Sent cancel_old_audio to Swift — freeing analyzer for new speech');
    
    // STEP 2 (2026-02-06, updated 2026-02-07): Reset recognition on interruption
    //
    // WHY: SpeechAnalyzer accumulates all transcription text within a session
    // (Finding #1 from turn detection testing). When the user interrupts, we
    // need a clean session so the interrupting speech doesn't get merged with
    // the pre-interruption text.
    //
    // WHAT THIS DOES: Triggers the lightweight input rotation in main.swift —
    // finalize(through:) + start(inputSequence:) — which keeps the analyzer
    // warm and just swaps the input stream. Takes ~50ms instead of ~2-4 seconds.
    //
    // TIMING: We send cancel_old_audio first (above) to immediately free the
    // Neural Engine, then reset to get a clean transcription slate. The cancel
    // and reset happen in rapid succession via IPC.
    //
    // PRODUCT CONTEXT: If a user interrupts mid-AI-response with "wait, actually..."
    // we want "wait, actually" to be captured with maximum accuracy. The cancel
    // ensures old audio isn't clogging the pipeline, and the reset gives us a
    // clean transcription slate.
    this.sendSwiftCommand(session, {
      type: 'reset_recognition',
      data: null
    });
    console.log('[VoicePipelineService] Sent reset_recognition to Swift after interruption');
  }

  /**
   * CLEAR ALL TIMERS
   * 
   * Clears all silence detection timers for a session.
   * 
   * @param {Object} session - Voice session
   */
  clearAllTimers(session) {
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
    
    // TIMER COALESCING (2026-02-07): Also clear the debounce timeout
    // that batches burst updates before starting the timer cascade.
    if (session._timerCoalesceTimeout) {
      clearTimeout(session._timerCoalesceTimeout);
      session._timerCoalesceTimeout = null;
    }
  }

  /**
   * STOP SPEAKING
   * 
   * Stops current TTS playback.
   * 
   * @param {Object} session - Voice session
   * @returns {Promise<void>}
   */
  async stopSpeaking(session) {
    console.log(`[VoicePipelineService] Stop speaking for ${session.id}`);

    if (session.swiftProcess) {
      this.sendSwiftCommand(session, {
        type: 'stop_speaking',
        data: null
      });
    }
  }

  /**
   * INTERRUPT
   * 
   * Handles user interruption of AI response.
   * Stops playback and clears cached responses.
   * 
   * @param {Object} session - Voice session
   * @returns {Promise<void>}
   */
  async interrupt(session) {
    console.log(`[VoicePipelineService] Interrupt for ${session.id}`);

    // Clear all timers
    this.clearAllTimers(session);

    // Clear cached responses
    session.cachedResponses.llm = null;
    session.cachedResponses.tts = null;

    // Reset pipeline state so new speech is accepted immediately
    session.isInResponsePipeline = false;
    session.isProcessingResponse = false;
    session.isTTSPlaying = false;
    session.latestTranscription = '';
    session.currentTranscription = '';
    session.textAtLastTimerReset = '';
    session.finalizedText = '';
    session.currentVolatile = '';
    session.firstTranscriptionAt = 0;
    session.lastTranscriptionAt = 0;
    session.awaitingSilenceConfirmation = false;

    // Stop any ongoing TTS playback
    await this.stopSpeaking(session);

    // Ensure recognition restarts after a manual interrupt
    this.sendSwiftCommand(session, {
      type: 'reset_recognition',
      data: null
    });
  }

  /**
   * SEND CONVERSATION CREATED TO FRONTEND
   * 
   * Notifies the frontend that a new conversation has been created.
   * This allows the sidebar to display the conversation immediately.
   * 
   * WHY THIS EXISTS:
   * When a conversation is auto-created during voice input, the frontend
   * needs to be notified so the sidebar can update. Without this, voice-created
   * conversations are "invisible" in the UI.
   * 
   * TECHNICAL NOTE:
   * This mirrors the same event sent by handleCreateConversation in server.js
   * when the user manually creates a conversation via the "New Chat" button.
   * 
   * HISTORY:
   * Added 2026-01-24 to fix bug where voice-created conversations didn't
   * appear in the sidebar. Bug was discovered through comprehensive testing.
   * 
   * @param {Object} session - Voice session
   * @param {Object} conversation - Newly created conversation
   */
  sendConversationCreatedToFrontend(session, conversation) {
    console.log(`[VoicePipelineService] Sending conversation_created to frontend for ${session.id}`);
    
    // Find the WebSocket connection for this session
    if (this.server && this.server.connections) {
      for (const [ws, connectionState] of this.server.connections) {
        if (connectionState.id === session.id) {
          this.server.sendMessage(ws, {
            type: 'conversation_created',
            data: {
              conversation: {
                id: conversation.id,
                title: conversation.metadata.title || 'New Conversation',
                createdAt: conversation.metadata.createdAt,
                updatedAt: conversation.metadata.updatedAt,
                messages: conversation.messages,
                lastMessage: ''
              }
            }
          });
          return;
        }
      }
    }
    
    console.warn(`[VoicePipelineService] Could not find WebSocket connection for session ${session.id}`);
  }

  /**
   * SEND USER MESSAGE TO FRONTEND
   * 
   * Sends the user's transcribed message to the frontend as a sent bubble.
   * This is called when the 2s timer fires, showing what the user said.
   * 
   * @param {Object} session - Voice session
   * @param {string} text - User's transcribed text
   */
  sendUserMessageToFrontend(session, text) {
    console.log(`[VoicePipelineService] Sending user message to frontend for ${session.id}`);
    
    // Find the WebSocket connection for this session
    if (this.server && this.server.connections) {
      for (const [ws, connectionState] of this.server.connections) {
        if (connectionState.id === session.id) {
          this.server.sendMessage(ws, {
            type: 'user_message',
            data: {
              text: text,
              timestamp: Date.now()
            }
          });
          return;
        }
      }
    }
    
    console.warn(`[VoicePipelineService] Could not find WebSocket connection for session ${session.id}`);
  }

  /**
   * SEND RESPONSE TO FRONTEND
   * 
   * Sends the AI response to the frontend via WebSocket as a response bubble.
   * 
   * @param {Object} session - Voice session
   * @param {Object} response - Response object with text, bubbles, artifact
   */
  sendResponseToFrontend(session, response) {
    console.log(`[VoicePipelineService] Sending AI response to frontend for ${session.id}`);
    
    // Find the WebSocket connection for this session
    // The server maintains the connections map
    if (this.server && this.server.connections) {
      for (const [ws, connectionState] of this.server.connections) {
        if (connectionState.id === session.id) {
          this.server.sendMessage(ws, {
            type: 'ai_response',
            data: {
              text: response.text,
              bubbles: response.bubbles || [],
              artifact: response.artifact || null,
              timestamp: Date.now()
            }
          });
          return;
        }
      }
    }
    
    console.warn(`[VoicePipelineService] Could not find WebSocket connection for session ${session.id}`);
  }

  /**
   * GENERATE TTS
   * 
   * Generates TTS audio for text using Swift helper.
   * Uses macOS `say` command via Swift helper.
   * 
   * @param {string} text - Text to synthesize
   * @param {Object} settings - TTS settings
   * @param {Object} session - Voice session (optional)
   * @returns {Promise<string>} Audio file URL or 'swift' to indicate Swift is handling it
   */
  async generateTTS(text, settings, session) {
    console.log('[VoicePipelineService] Generating TTS via Swift helper');

    if (!session || !session.swiftProcess) {
      console.warn('[VoicePipelineService] No Swift session for TTS, using fallback');
      return null;
    }

    // ECHO SUPPRESSION CONTEXT (2026-02-07):
    // Store the exact text we're about to speak so we can detect
    // short echo fragments that show up in transcription while
    // the AI is talking. This lets us ignore mic bleed without
    // breaking real user interruptions.
    session.lastSpokenText = text || '';
    session.lastSpokenAt = Date.now();

    // Calculate rate from voice speed (default 200 wpm)
    const rate = Math.round((settings?.voiceSpeed || 1.0) * 200);

    // Send speak command to Swift helper
    this.sendSwiftCommand(session, {
      type: 'speak',
      data: {
        text: text,
        voice: settings?.voice || null,
        rate: rate
      }
    });

    // Return indicator that Swift is handling TTS
    return 'swift';
  }
}

module.exports = VoicePipelineService;
