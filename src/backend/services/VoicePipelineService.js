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
 * THREE-TIMER SYSTEM (ported from Accountability app):
 * - Timer 1 (0.5s): Start LLM processing (cached, not visible)
 * - Timer 2 (1.5s): Start TTS generation (uses cached LLM result)
 * - Timer 3 (2.0s): Start audio playback
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
const LLMService = require('./LLMService');
const ConversationService = require('./ConversationService');

class VoicePipelineService extends EventEmitter {
  constructor(server) {
    super();
    
    // Reference to backend server
    // Used to send messages to frontend via WebSocket
    this.server = server;
    
    // LLM service for generating AI responses
    // Initialized when first needed
    this.llmService = new LLMService();
    
    // Conversation service for managing conversation history
    // Initialized when first needed
    this.conversationService = new ConversationService();

    // Active voice sessions
    // Maps session ID to session state
    this.sessions = new Map();

    // Path to Swift helper process
    // TODO: Build and bundle Swift helper
    this.swiftHelperPath = path.join(__dirname, '../../../swift-helper/BubbleVoiceSpeech');

    // Timer configuration (in milliseconds)
    // These values are from the Accountability app's battle-tested system
    this.timerConfig = {
      llmStart: 500,    // 0.5s - Start LLM processing
      ttsStart: 1500,   // 1.5s - Start TTS generation
      playbackStart: 2000  // 2.0s - Start audio playback
    };
    
    // CRITICAL: Track playback state for interruption detection
    // This mirrors the Accountability app's isSpeaking flag
    // We need to know if the AI is currently speaking so we can detect interruptions
    this.isAISpeaking = false;
  }

  /**
   * START VOICE INPUT
   * 
   * Starts voice input capture for a session.
   * Spawns Swift helper process for speech recognition.
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
      silenceTimers: {
        llm: null,
        tts: null,
        playback: null
      },
      cachedResponses: {
        llm: null,
        tts: null
      },
      swiftProcess: null,
      // CRITICAL: Track if we're currently in the response pipeline
      // This includes: timers active, LLM processing, TTS generation, or audio playback
      // Used to detect if user speech should trigger an interruption
      isInResponsePipeline: false,
      // Track if TTS is currently playing
      isTTSPlaying: false,
      // Track if we're processing a response (prevents duplicate LLM calls)
      isProcessingResponse: false
    };

    try {
      // Spawn Swift helper process
      const swiftHelperPath = path.join(__dirname, '../../../swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');
      
      console.log(`[VoicePipelineService] Spawning Swift helper: ${swiftHelperPath}`);
      
      session.swiftProcess = spawn(swiftHelperPath);

      // Handle stdout (responses from Swift)
      session.swiftProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            this.handleSwiftResponse(response, session);
          } catch (error) {
            console.error('[VoicePipelineService] Error parsing Swift response:', error, line);
          }
        }
      });

      // Handle stderr (logs from Swift)
      session.swiftProcess.stderr.on('data', (data) => {
        console.log(`[Swift Helper] ${data.toString().trim()}`);
      });

      // Handle process exit
      session.swiftProcess.on('exit', (code, signal) => {
        console.log(`[VoicePipelineService] Swift helper exited: code=${code}, signal=${signal}`);
        session.isListening = false;
      });

      // Wait a moment for Swift helper to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send start_listening command
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

      case 'transcription_update':
        const text = response.data?.text || '';
        const isFinal = response.data?.isFinal || false;
        const swiftIsSpeaking = response.data?.isSpeaking || false;
        
        // Log transcription for debugging
        console.log(`[VoicePipelineService] Transcription: "${text}" (final: ${isFinal}, swiftSpeaking: ${swiftIsSpeaking})`);
        
        // CRITICAL FIX (2026-01-23): Implement Accountability's TIMER-RESET pattern
        // The key insight: Silence is detected by ABSENCE of transcriptions, not by isFinal
        // 
        // Accountability pattern:
        // 1. EVERY transcription (even empty partial) resets the silence timer
        // 2. If no transcriptions come for 0.5s, LLM timer fires
        // 3. This creates natural turn detection based on actual silence
        //
        // This is fundamentally different from waiting for isFinal!
        
        const hasActiveTimers = session.silenceTimers.llm || session.silenceTimers.tts || session.silenceTimers.playback;
        const isInResponsePipeline = session.isInResponsePipeline || session.isTTSPlaying || hasActiveTimers;
        
        // Check for interruption if we're in response pipeline
        if (isInResponsePipeline && text.trim().length > 0) {
          console.log('‼️ [VOICE INTERRUPT] User is speaking while AI is in response pipeline - triggering interruption');
          console.log(`   - Active timers: ${hasActiveTimers}`);
          console.log(`   - In pipeline: ${session.isInResponsePipeline}`);
          console.log(`   - TTS playing: ${session.isTTSPlaying}`);
          
          // Trigger interruption - this will clear timers and cached responses
          this.handleSpeechDetected(session);
        }
        
        // Send transcription to frontend
        if (session.transcriptionCallback) {
          session.transcriptionCallback(response.data);
        }
        
        // CRITICAL FIX (2026-01-23): Simple timer-reset pattern from Accountability AI
        //
        // LESSON LEARNED: Don't overthink it! Accountability AI simply resets the
        // timer on EVERY transcription update. The timer only fires when updates
        // STOP coming for 0.5 seconds. This naturally handles:
        // - New speech: Updates keep coming → Timer keeps resetting
        // - Silence: Updates stop → Timer fires after 0.5s
        // - Refinements: Still updates → Timer resets (doesn't matter!)
        //
        // WHY THIS WORKS:
        // Apple's SFSpeechRecognizer sends updates continuously while user speaks.
        // When user stops, updates stop. Timer fires 0.5s after last update.
        // Simple, reliable, proven in Accountability AI.
        //
        // PREVIOUS ATTEMPTS FAILED BECAUSE:
        // - Tried to detect "significant" text growth → Too complex, broke
        // - Tried to filter refinements → Impossible to distinguish reliably
        // - Tried to be "smart" → Made it worse
        //
        // THE ACCOUNTABILITY AI WAY:
        // Just reset the timer on every update. Let the timer do its job.
        // If updates stop (user silent), timer fires. If updates continue (user
        // speaking or Apple refining), timer resets. Perfect.
        //
        // PRODUCT CONTEXT: User speaks → Updates come → Timer resets continuously.
        // User stops → Updates stop → Timer fires after 0.5s → LLM processes.
        if (!isInResponsePipeline && text.trim().length > 0) {
          // Update the latest transcription
          session.latestTranscription = text;
          
          // Reset the timer on EVERY update (Accountability AI pattern)
          // The timer will only fire if updates stop for 0.5s
          this.resetSilenceTimer(session);
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
        
        // CRITICAL FIX (2026-01-23): Reset the transcription state after AI finishes speaking
        // WHY: After the AI finishes, we need to be ready for the next user utterance
        // BECAUSE: Without this, the next transcription will include text from before
        // the AI started speaking, causing accumulation
        // 
        // PRODUCT CONTEXT: When AI finishes speaking, we're ready for a fresh user turn.
        // Clear the transcription so the next utterance starts clean.
        session.latestTranscription = '';
        session.currentTranscription = '';
        session.textAtLastTimerReset = '';
        session.isProcessingResponse = false;
        
        // CRITICAL: Tell Swift helper to reset the recognition session
        // This ensures the next transcription starts completely fresh
        // without any accumulated text from previous utterances
        this.sendSwiftCommand(session, {
          type: 'reset_recognition',
          data: null
        });
        
        console.log('[VoicePipelineService] Transcription state reset and Swift recognition restarted after TTS ended');
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

    // Clear all timers
    this.clearAllTimers(session);

    // Send stop command to Swift helper
    if (session.swiftProcess) {
      this.sendSwiftCommand(session, {
        type: 'stop_listening',
        data: null
      });

      // Give it a moment to stop gracefully
      await new Promise(resolve => setTimeout(resolve, 100));

      // Kill the process
      if (session.swiftProcess && !session.swiftProcess.killed) {
        session.swiftProcess.kill();
      }
    }

    // Remove session
    this.sessions.delete(session.id);
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
   * If no transcriptions come for 0.5s, the LLM timer fires.
   * 
   * This creates natural turn detection based on actual silence in the audio stream.
   * 
   * @param {Object} session - Voice session
   */
  resetSilenceTimer(session) {
    console.log(`[VoicePipelineService] Resetting silence timer for ${session.id}`);
    
    // Clear any existing timers (like Accountability's timerManager.invalidateTimer())
    this.clearAllTimers(session);
    
    // Start the timer cascade
    // These timers will fire if no new transcriptions come in
    this.startTimerCascade(session);
  }

  /**
   * START TIMER CASCADE
   * 
   * Starts the three-timer cascade for turn detection.
   * This is called after clearing existing timers in resetSilenceTimer.
   * 
   * TIMER CASCADE:
   * 1. 0.5s: Start LLM processing (cached, user doesn't see this yet)
   * 2. 1.5s: Start TTS generation (uses cached LLM result)
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
    // We only set it when the LLM timer actually fires (after 0.5s of silence)
    // This prevents false interruption detection while user is still speaking

    // Timer 1: Start LLM processing (0.5s)
    // This happens in the background, user doesn't see anything yet
    session.silenceTimers.llm = setTimeout(async () => {
      console.log(`[VoicePipelineService] Timer 1 (LLM) fired for ${session.id} - 0.5s of actual silence detected!`);
      
      // CRITICAL: NOW we enter the response pipeline
      // This is when we've detected 0.5s of actual silence
      session.isInResponsePipeline = true;
      
      // Check if already processing (prevent duplicate calls)
      if (session.isProcessingResponse) {
        console.log('[VoicePipelineService] Already processing response, skipping LLM');
        return;
      }
      
      session.isProcessingResponse = true;
      
      // Start LLM processing
      // Cache the result but don't show it yet
      try {
        console.log(`[VoicePipelineService] Processing transcription: "${session.latestTranscription}"`);
        
        // Get or create conversation for this session
        let conversation = session.conversation;
        if (!conversation) {
          conversation = await this.conversationService.createConversation();
          session.conversation = conversation;
          
          // CRITICAL FIX: Notify frontend about new conversation
          // WHY: The sidebar needs to know about voice-created conversations
          // BECAUSE: Without this event, conversations are "invisible" in the UI
          // HISTORY: Bug discovered 2026-01-24 via comprehensive testing
          this.sendConversationCreatedToFrontend(session, conversation);
        }
        
        // Add user message to conversation history
        await this.conversationService.addMessage(conversation.id, {
          role: 'user',
          content: session.latestTranscription,
          timestamp: Date.now()
        });
        
        // Generate AI response using LLM service
        // This will stream the response, but we'll collect it all for caching
        let fullResponse = '';
        let bubbles = [];
        let artifact = null;
        
        await this.llmService.generateResponse(
          conversation,
          session.settings || {},
          {
            onChunk: (chunk) => {
              // Accumulate chunks for caching
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
        
        // Cache the complete response
        session.cachedResponses.llm = {
          text: fullResponse,
          bubbles: bubbles,
          artifact: artifact
        };
        
        console.log(`[VoicePipelineService] LLM response cached: "${fullResponse.substring(0, 50)}..."`);
        
      } catch (error) {
        console.error('[VoicePipelineService] Error in LLM processing:', error);
        
        // Fallback to a simple error response
        session.cachedResponses.llm = {
          text: "I'm having trouble processing that right now. Could you try again?",
          bubbles: ['try again?', 'tell me more'],
          artifact: null
        };
        
        session.isProcessingResponse = false;
      }
    }, this.timerConfig.llmStart);

    // Timer 2: Start TTS generation (1.5s)
    // Uses the cached LLM result from Timer 1
    // 
    // WHY THIS TIMER:
    // We pre-generate TTS before playback so it's ready when Timer 3 fires.
    // This reduces the perceived latency - by the time the user sees the response,
    // the audio is already generated and ready to play.
    // 
    // TECHNICAL NOTE:
    // We don't actually need to cache TTS audio because the Swift helper
    // generates and plays it in one step. This timer is mainly for consistency
    // with the three-timer pattern and could be used for pre-generation in the future.
    session.silenceTimers.tts = setTimeout(async () => {
      console.log(`[VoicePipelineService] Timer 2 (TTS) fired for ${session.id}`);
      
      // Check if we were interrupted before timer fired
      if (!session.isInResponsePipeline) {
        console.log('[VoicePipelineService] Timer 2 cancelled by interruption');
        return;
      }
      
      // TTS generation happens in Timer 3 when we call generateTTS()
      // This timer is kept for consistency with the three-timer pattern
      // and for potential future pre-generation optimization
      console.log('[VoicePipelineService] TTS will be generated in Timer 3 (playback)');
      
    }, this.timerConfig.ttsStart);

    // Timer 3: Start audio playback (2.0s)
    // Uses the cached LLM result from Timer 1
    // 
    // CRITICAL FIX: Timer 3 may fire before LLM response is ready (race condition)
    // WHY: LLM generation can take 2-5 seconds, but Timer 3 fires at 2.0s
    // SOLUTION: Poll for LLM response with timeout, don't just check once
    session.silenceTimers.playback = setTimeout(async () => {
      console.log(`[VoicePipelineService] Timer 3 (Playback) fired for ${session.id}`);
      
      // Check if we were interrupted before timer fired
      if (!session.isInResponsePipeline) {
        console.log('[VoicePipelineService] Timer 3 cancelled by interruption');
        return;
      }
      
      // Wait for LLM response to be ready (with timeout)
      // Poll every 100ms for up to 5 seconds
      const maxWaitTime = 5000; // 5 seconds max
      const pollInterval = 100; // Check every 100ms
      const startTime = Date.now();
      
      while (!session.cachedResponses.llm && (Date.now() - startTime) < maxWaitTime) {
        // Check if interrupted while waiting
        if (!session.isInResponsePipeline) {
          console.log('[VoicePipelineService] Interrupted while waiting for LLM response');
          return;
        }
        
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      // Start playback
      // This is when the user actually sees/hears the response
      if (session.cachedResponses.llm) {
        console.log('[VoicePipelineService] Sending messages to frontend');
        
        // FIRST: Send the user's message as a sent bubble
        // This shows what the user said after 2s of silence
        this.sendUserMessageToFrontend(session, session.latestTranscription);
        
        // THEN: Send the AI response as a response bubble
        // The server will handle sending it to the correct client
        this.sendResponseToFrontend(session, session.cachedResponses.llm);
        
        // Mark TTS as playing
        session.isTTSPlaying = true;
        
        // Generate and play TTS
        this.generateTTS(session.cachedResponses.llm.text, session.settings, session);
      } else {
        console.error('[VoicePipelineService] Timer 3 timed out waiting for LLM response');
        // Send user message anyway so they see something
        this.sendUserMessageToFrontend(session, session.latestTranscription);
      }
    }, this.timerConfig.playbackStart);
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
    
    // CRITICAL: Stop any ongoing TTS playback
    // This is the actual interruption - stop the AI from speaking
    if (session.isTTSPlaying) {
      console.log('[VoicePipelineService] Stopping TTS playback due to interruption');
      this.stopSpeaking(session);
      session.isTTSPlaying = false;
    }
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

    // Stop any ongoing TTS playback
    await this.stopSpeaking(session);
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
