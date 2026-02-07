/**
 * BUBBLEVOICE MAC - VOICE CONTROLLER
 * 
 * Manages voice input and output (speech recognition and TTS).
 * Coordinates with the backend for actual processing.
 * 
 * RESPONSIBILITIES:
 * - Trigger voice input start/stop
 * - Display real-time transcription
 * - Handle audio playback for AI responses
 * - Manage voice visualization
 * 
 * ARCHITECTURE NOTE:
 * The actual speech recognition happens on the backend using
 * Apple's native SpeechAnalyzer API (macOS 26+). This frontend controller
 * just manages the UI state and communicates with the backend.
 * 
 * WHY BACKEND PROCESSING:
 * - Apple's speech APIs require native code (Swift/Objective-C)
 * - Better performance with native processing
 * - Centralized audio pipeline management
 * - Easier to implement three-timer system on backend
 * 
 * PRODUCT CONTEXT:
 * Voice is the primary input method. It needs to feel instant,
 * natural, and reliable. Users should see their words appear
 * in real-time as they speak.
 */

class VoiceController {
  constructor(app) {
    // Reference to main app
    // Used to access WebSocket and update UI state
    this.app = app;

    // Audio playback
    // HTML5 Audio element for playing AI responses (if needed)
    this.audioElement = new Audio();
    this.audioElement.addEventListener('ended', () => this.onAudioEnded());
    this.audioElement.addEventListener('error', (e) => this.onAudioError(e));

    // Voice state
    this.isListening = false;
    this.isPlaying = false;

    // Available TTS voices cache
    // Populated by handleVoicesList in websocket-client.js when backend responds
    // WHY: Prevents redundant get_voices requests and allows immediate access
    this.availableVoices = [];

    console.log('[VoiceController] Initialized with native backend voice');
  }

  /**
   * START LISTENING
   * 
   * Begins voice input capture.
   * Sends command to backend to start speech recognition.
   * 
   * FLOW:
   * 1. Frontend sends 'start_listening' command to backend
   * 2. Backend starts Apple SpeechAnalyzer (via Swift helper)
   * 3. Backend streams transcription back to frontend
   * 4. Frontend displays transcription in real-time
   */
  async startListening() {
    if (this.isListening) {
      console.warn('[VoiceController] Already listening');
      return;
    }

    console.log('[VoiceController] Starting voice input via backend');
    this.isListening = true;

    // CRITICAL: Clear the input field when starting new voice session
    // WHY: Without this, transcriptions from previous sessions accumulate
    // BECAUSE: The Swift helper maintains its own transcription buffer that
    // doesn't reset between sessions, so we need to clear the UI
    const inputField = this.app.elements.inputField;
    if (inputField) {
      inputField.textContent = '';
      inputField.style.opacity = '1.0';
    }

    try {
      // Send command to backend to start native speech recognition
      // CRITICAL FIX (2026-02-06): Include the user's selected model and voice settings
      //
      // WHY: Previously, only { language, continuous } was sent. The voice pipeline's
      // Timer 1 calls llmService.generateResponse(conversation, session.settings, callbacks)
      // where session.settings is exactly what we send here. Without 'model', the LLM
      // defaults to gemini-2.5-flash regardless of what the user selected in settings.
      //
      // BECAUSE: User selected a specific model but voice responses used the default.
      // Also, voiceSpeed was missing so TTS always played at 1.0x speed.
      //
      // FIX: Merge the user's app settings (model, voiceSpeed, voice) with the
      // voice-specific settings (language, continuous).
      const appSettings = this.app.state.settings || {};
      await this.app.websocketClient.sendMessage({
        type: 'start_voice_input',
        settings: {
          language: 'en-US',
          continuous: true,
          model: appSettings.model || 'gemini-2.5-flash',
          voiceSpeed: appSettings.voiceSpeed || 1.0,
          voice: appSettings.voice || null
        }
      });
    } catch (error) {
      console.error('[VoiceController] Error starting voice input:', error);
      this.isListening = false;
      throw error;
    }
  }

  /**
   * STOP LISTENING
   * 
   * Stops voice input capture.
   * Sends command to backend to stop speech recognition.
   */
  async stopListening() {
    if (!this.isListening) {
      console.warn('[VoiceController] Not listening');
      return;
    }

    console.log('[VoiceController] Stopping voice input');
    this.isListening = false;

    try {
      // Send command to backend to stop speech recognition
      await this.app.websocketClient.sendMessage({
        type: 'stop_voice_input'
      });
    } catch (error) {
      console.error('[VoiceController] Error stopping voice input:', error);
      throw error;
    }
  }

  /**
   * HANDLE TRANSCRIPTION UPDATE
   * 
   * Called when backend sends partial or final transcription.
   * Updates the input field with the transcribed text.
   * 
   * WHY THIS APPROACH:
   * We need to update a contenteditable div while the user might be focused on it.
   * Direct innerHTML manipulation can cause DOMExceptions when the selection is active.
   * Instead, we check if the content actually changed before updating, and we use
   * textContent for safety.
   * 
   * BECAUSE:
   * Previous implementation caused frequent DOMException errors on every transcription
   * update because it was modifying innerHTML while the div had focus/selection.
   * 
   * @param {Object} data - Transcription data from backend
   * @param {string} data.text - Transcribed text
   * @param {boolean} data.isFinal - Whether this is final transcription
   */
  /**
   * HANDLE TRANSCRIPTION
   *
   * Processes transcription updates from the backend and updates the input field.
   *
   * VOLATILE vs FINAL RESULTS (2026-02-07 — based on SpeechAnalyzer research):
   * Apple's SpeechAnalyzer with .volatileResults reporting option sends two types:
   *
   * 1) VOLATILE (isFinal=false): Rough, real-time guesses that update progressively
   *    as the user speaks. These may change as the model gets more context.
   *    Example: "The qu" → "The quick" → "The quick brown" → "The quick brown fox"
   *
   * 2) FINAL (isFinal=true): Committed text segments at sentence boundaries
   *    (periods, question marks, extended pauses). These are immutable.
   *
   * VISUAL TREATMENT:
   * - Volatile: 0.65 opacity with a subtle CSS transition for smooth updates.
   *   Lower opacity signals to the user "I'm still listening, this may change."
   * - Final: Full 1.0 opacity with a brief transition to "lock in" the text.
   *   This gives a polished feeling when the sentence is committed.
   *
   * WHY THIS MATTERS FOR PRODUCT:
   * The progressive word-by-word display powered by volatile results is what
   * makes BubbleVoice feel responsive and "alive" — the user sees their words
   * appearing in real-time, which builds trust that the system is listening.
   * Research confirmed SpeechAnalyzer delivers these updates every ~200-500ms
   * with excellent accuracy even in the volatile/partial state.
   */
  handleTranscription(data) {
    console.log('[VoiceController] Transcription:', data.text, 'Final:', data.isFinal);

    const inputField = this.app.elements.inputField;
    
    // Get current text content (without HTML)
    // FIX (2026-01-28): Use innerText instead of textContent to properly handle line breaks
    const currentText = inputField.innerText || '';
    
    // Only update if text actually changed
    // This prevents unnecessary DOM manipulation and DOMExceptions
    if (currentText !== data.text) {
      try {
        // Use textContent instead of innerHTML to avoid DOMExceptions
        // This is safer when the element has focus
        inputField.textContent = data.text;
        
        // VOLATILE vs FINAL VISUAL TREATMENT (2026-02-07):
        // Based on SpeechAnalyzer research, volatile results should be
        // visually distinct from finalized text. We use opacity + a smooth
        // CSS transition to create a polished "locking in" effect.
        //
        // The transition is set via CSS, but we ensure it's applied here
        // for cases where styles might be overridden.
        inputField.style.transition = 'opacity 0.15s ease-out';
        
        if (!data.isFinal) {
          // Volatile/partial: lower opacity signals "still listening"
          inputField.style.opacity = '0.65';
        } else {
          // Final: full opacity signals "committed text"
          inputField.style.opacity = '1.0';
        }
      } catch (error) {
        // Silently catch DOMExceptions that might still occur
        // The transcription will update on the next cycle
        console.debug('[VoiceController] DOM update skipped (element busy):', error.name);
      }
    }

    // Update send button state
    this.app.updateSendButtonState();

    // Keep cursor at end
    this.moveCursorToEnd(inputField);
  }

  /**
   * ESCAPE HTML
   * 
   * Escapes HTML characters to prevent XSS.
   * 
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * MOVE CURSOR TO END
   * 
   * Moves the cursor to the end of the contenteditable field.
   * Ensures user can see the latest transcribed text.
   * 
   * @param {HTMLElement} element - Contenteditable element
   */
  moveCursorToEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();
    
    if (element.childNodes.length > 0) {
      const lastNode = element.childNodes[element.childNodes.length - 1];
      const offset = lastNode.textContent ? lastNode.textContent.length : 0;
      
      range.setStart(lastNode, offset);
      range.collapse(true);
      
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /**
   * PLAY AUDIO
   * 
   * Plays AI response audio (TTS).
   * TTS is handled by the backend Swift helper using macOS `say` command.
   * 
   * @param {string} audioUrl - URL to audio file or 'swift' if backend handles it
   * @param {string} text - Text to speak (sent to backend)
   */
  async playAudio(audioUrl, text) {
    if (this.isPlaying) {
      console.log('[VoiceController] Stopping current audio');
      this.stopAudio();
    }

    this.isPlaying = true;

    try {
      if (audioUrl === 'swift' || !audioUrl) {
        // Backend Swift helper is handling TTS
        // Just mark as playing, backend will send speech_ended event
        console.log('[VoiceController] TTS handled by backend Swift helper');
        // Will be set to false when backend sends speech_ended
      } else if (audioUrl && audioUrl !== 'mock://tts-audio.mp3') {
        // Play from URL (if we ever use URL-based TTS)
        console.log('[VoiceController] Playing audio from URL:', audioUrl);
        this.audioElement.src = audioUrl;
        await this.audioElement.play();
      } else {
        console.log('[VoiceController] No TTS needed');
        this.isPlaying = false;
      }
    } catch (error) {
      console.error('[VoiceController] Error playing audio:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * STOP AUDIO
   * 
   * Stops currently playing audio.
   * Used for interruption handling.
   */
  stopAudio() {
    if (!this.isPlaying) {
      return;
    }

    console.log('[VoiceController] Stopping audio');
    
    // Stop HTML5 audio
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    
    // Tell backend to stop TTS
    this.app.websocketClient.sendMessage({
      type: 'stop_speaking'
    });
    
    this.isPlaying = false;
  }

  /**
   * AUDIO ENDED HANDLER
   * 
   * Called when audio playback completes naturally.
   */
  onAudioEnded() {
    console.log('[VoiceController] Audio playback ended');
    this.isPlaying = false;
  }

  /**
   * AUDIO ERROR HANDLER
   * 
   * Called when audio playback encounters an error.
   */
  onAudioError(error) {
    console.error('[VoiceController] Audio playback error:', error);
    this.isPlaying = false;
  }

  /**
   * INTERRUPT
   * 
   * Interrupts current audio playback and stops listening.
   * Used when user starts speaking while AI is responding.
   * 
   * PRODUCT CONTEXT:
   * Natural conversation requires interruption support.
   * Users should be able to stop the AI mid-response by speaking.
   */
  interrupt() {
    console.log('[VoiceController] Interrupting');

    // Stop audio playback
    this.stopAudio();

    // Notify backend of interruption
    this.app.websocketClient.sendMessage({
      type: 'interrupt'
    });
  }

  /**
   * GET AVAILABLE VOICES
   *
   * Returns list of available TTS voices from backend.
   * Uses cached voices if available, otherwise requests from backend.
   *
   * TECHNICAL NOTES:
   * - The availableVoices array is populated by handleVoicesList in websocket-client.js
   * - On first call (before websocket connects), this queues a request
   * - Subsequent calls return the cached voices immediately
   *
   * WHY CACHING:
   * Prevents redundant get_voices messages on every call.
   * The voice list rarely changes during a session.
   *
   * @returns {Array} Array of voice objects
   */
  getAvailableVoices() {
    // Return cached voices if we have them
    if (this.availableVoices && this.availableVoices.length > 0) {
      return this.availableVoices;
    }

    // Request voices from backend if websocket is connected
    // The response will populate this.availableVoices via handleVoicesList
    if (this.app.websocketClient && this.app.websocketClient.isConnected) {
      this.app.websocketClient.sendMessage({
        type: 'get_voices'
      });
    }

    // Return empty for now, will be populated when backend responds
    return [];
  }

  /**
   * GET MICROPHONES
   * 
   * Returns list of available microphones.
   * For native implementation, this is handled by system.
   * 
   * @returns {Array} Array of microphone objects
   */
  getMicrophones() {
    // Native implementation uses system default
    return [{ id: 'default', label: 'System Default Microphone', isDefault: true }];
  }

  /**
   * GET SPEAKERS
   * 
   * Returns list of available speakers.
   * For native implementation, this is handled by system.
   * 
   * @returns {Array} Array of speaker objects
   */
  getSpeakers() {
    // Native implementation uses system default
    return [{ id: 'default', label: 'System Default Speaker', isDefault: true }];
  }

  /**
   * SET MICROPHONE
   * 
   * Sets the active microphone device.
   * For native implementation, use system preferences.
   * 
   * @param {string} deviceId - Device ID
   */
  setMicrophone(deviceId) {
    console.log('[VoiceController] Microphone selection:', deviceId);
    // Native implementation uses system default
  }

  /**
   * SET SPEAKER
   * 
   * Sets the active speaker device.
   * For native implementation, use system preferences.
   * 
   * @param {string} deviceId - Device ID
   */
  setSpeaker(deviceId) {
    console.log('[VoiceController] Speaker selection:', deviceId);
    // Native implementation uses system default
  }
}

console.log('[VoiceController] VoiceController class loaded');
