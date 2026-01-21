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

class VoicePipelineService extends EventEmitter {
  constructor(server) {
    super();
    
    // Reference to backend server
    // Used to send messages to frontend via WebSocket
    this.server = server;

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
      silenceTimers: {
        llm: null,
        tts: null,
        playback: null
      },
      cachedResponses: {
        llm: null,
        tts: null
      },
      swiftProcess: null
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
        // Log transcription for debugging
        console.log(`[VoicePipelineService] Transcription: "${response.data?.text}" (final: ${response.data?.isFinal})`);
        
        if (session.transcriptionCallback) {
          session.transcriptionCallback(response.data);
        }
        
        // Detect silence for turn detection
        if (response.data.isFinal) {
          this.handleSilenceDetected(session);
        }
        break;

      case 'speech_started':
        console.log('[VoicePipelineService] TTS started');
        break;

      case 'speech_ended':
        console.log('[VoicePipelineService] TTS ended');
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
   * HANDLE SILENCE DETECTED
   * 
   * Called when silence is detected in the audio stream.
   * Starts the three-timer cascade for turn detection.
   * 
   * This is the core of the sophisticated turn detection system.
   * Instead of immediately responding, we wait progressively longer
   * at each stage, allowing natural pauses while still feeling responsive.
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
  handleSilenceDetected(session) {
    console.log(`[VoicePipelineService] Silence detected for ${session.id}`);

    // Clear any existing timers
    this.clearAllTimers(session);

    // Timer 1: Start LLM processing (0.5s)
    // This happens in the background, user doesn't see anything yet
    session.silenceTimers.llm = setTimeout(async () => {
      console.log(`[VoicePipelineService] Timer 1 (LLM) fired for ${session.id}`);
      
      // Start LLM processing
      // Cache the result but don't show it yet
      try {
        // TODO: Actually call LLM service
        // For now, just cache a mock response
        session.cachedResponses.llm = {
          text: 'This is a cached LLM response',
          bubbles: ['follow up?', 'tell me more', 'what else?'],
          artifact: null
        };
      } catch (error) {
        console.error('[VoicePipelineService] Error in LLM processing:', error);
      }
    }, this.timerConfig.llmStart);

    // Timer 2: Start TTS generation (1.5s)
    // Uses the cached LLM result from Timer 1
    session.silenceTimers.tts = setTimeout(async () => {
      console.log(`[VoicePipelineService] Timer 2 (TTS) fired for ${session.id}`);
      
      // Generate TTS from cached LLM response
      if (session.cachedResponses.llm) {
        try {
          // TODO: Actually call TTS service
          // For now, just cache a mock audio URL
          session.cachedResponses.tts = {
            audioUrl: 'mock://audio.mp3'
          };
        } catch (error) {
          console.error('[VoicePipelineService] Error in TTS generation:', error);
        }
      }
    }, this.timerConfig.ttsStart);

    // Timer 3: Start audio playback (2.0s)
    // Uses the cached TTS result from Timer 2
    session.silenceTimers.playback = setTimeout(() => {
      console.log(`[VoicePipelineService] Timer 3 (Playback) fired for ${session.id}`);
      
      // Start playback
      // This is when the user actually hears the response
      if (session.cachedResponses.llm && session.cachedResponses.tts) {
        // Send response to frontend
        // TODO: Send via WebSocket through server
        console.log('[VoicePipelineService] Would send response to frontend here');
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
    console.log(`[VoicePipelineService] Speech detected for ${session.id}`);

    // Clear all timers
    this.clearAllTimers(session);

    // Clear cached responses
    session.cachedResponses.llm = null;
    session.cachedResponses.tts = null;
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
