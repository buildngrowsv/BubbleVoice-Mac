/**
 * BUBBLEVOICE MAC - WEB SPEECH SERVICE
 * 
 * Implements STT and TTS using the browser's Web Speech API.
 * This is a working implementation that doesn't require native code.
 * 
 * ARCHITECTURE DECISION:
 * Using Web Speech API as an immediate working solution.
 * This provides real voice input/output without needing Swift helpers.
 * 
 * PROS:
 * - Works immediately (no native code needed)
 * - Real-time transcription
 * - Multiple voice options
 * - Free (no API costs)
 * 
 * CONS:
 * - Requires internet connection for STT
 * - Less control than native APIs
 * - Browser-dependent quality
 * 
 * PRODUCT CONTEXT:
 * This gets voice working NOW so users can test the full experience.
 * Can be replaced with native Swift implementation later for better
 * quality and offline support.
 * 
 * TECHNICAL NOTES:
 * - Uses SpeechRecognition API for STT
 * - Uses SpeechSynthesis API for TTS
 * - Handles browser compatibility
 * - Manages microphone permissions
 */

class WebSpeechService {
  constructor() {
    // Check browser support
    // Most modern browsers support these APIs
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isSupported = this.checkSupport();

    // Recognition state
    this.isListening = false;
    this.currentTranscript = '';
    
    // Callbacks
    this.onTranscriptCallback = null;
    this.onFinalTranscriptCallback = null;
    this.onErrorCallback = null;

    // TTS state
    this.currentUtterance = null;
    this.isSpeaking = false;

    // Audio devices
    this.audioDevices = {
      microphones: [],
      speakers: []
    };

    // Initialize
    if (this.isSupported) {
      this.initializeRecognition();
      this.loadAudioDevices();
    }
  }

  /**
   * CHECK SUPPORT
   * 
   * Checks if browser supports Web Speech API.
   * 
   * @returns {boolean} True if supported
   */
  checkSupport() {
    const hasRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const hasSynthesis = 'speechSynthesis' in window;

    if (!hasRecognition) {
      console.warn('[WebSpeechService] SpeechRecognition not supported');
    }

    if (!hasSynthesis) {
      console.warn('[WebSpeechService] SpeechSynthesis not supported');
    }

    return hasRecognition && hasSynthesis;
  }

  /**
   * INITIALIZE RECOGNITION
   * 
   * Sets up the SpeechRecognition instance with optimal settings.
   */
  initializeRecognition() {
    // Get the SpeechRecognition constructor (with webkit prefix for Safari)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('[WebSpeechService] SpeechRecognition not available');
      return;
    }

    this.recognition = new SpeechRecognition();

    // Configure recognition
    // continuous: Keep listening even after user pauses
    // interimResults: Get partial results in real-time
    // maxAlternatives: Number of alternative transcriptions to consider
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = 'en-US';

    // Event handlers
    this.recognition.onstart = () => {
      console.log('[WebSpeechService] Recognition started');
      this.isListening = true;
      this.currentTranscript = '';
    };

    this.recognition.onresult = (event) => {
      this.handleRecognitionResult(event);
    };

    this.recognition.onerror = (event) => {
      console.error('[WebSpeechService] Recognition error:', event.error);
      
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }

      // Auto-restart on certain errors
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        // Don't restart, let user try again
        this.isListening = false;
      }
    };

    this.recognition.onend = () => {
      console.log('[WebSpeechService] Recognition ended');
      
      // Auto-restart if we're supposed to be listening
      // This handles the case where recognition stops automatically
      if (this.isListening) {
        console.log('[WebSpeechService] Auto-restarting recognition');
        setTimeout(() => {
          if (this.isListening) {
            try {
              this.recognition.start();
            } catch (error) {
              console.error('[WebSpeechService] Error restarting:', error);
              this.isListening = false;
            }
          }
        }, 100);
      }
    };
  }

  /**
   * HANDLE RECOGNITION RESULT
   * 
   * Processes speech recognition results.
   * Sends both interim (partial) and final transcripts.
   * 
   * @param {SpeechRecognitionEvent} event - Recognition event
   */
  handleRecognitionResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    // Send interim transcript (real-time display)
    if (interimTranscript && this.onTranscriptCallback) {
      this.onTranscriptCallback({
        text: this.currentTranscript + interimTranscript,
        isFinal: false
      });
    }

    // Send final transcript
    if (finalTranscript) {
      this.currentTranscript += finalTranscript;
      
      if (this.onFinalTranscriptCallback) {
        this.onFinalTranscriptCallback({
          text: this.currentTranscript.trim(),
          isFinal: true
        });
      }

      if (this.onTranscriptCallback) {
        this.onTranscriptCallback({
          text: this.currentTranscript.trim(),
          isFinal: true
        });
      }
    }
  }

  /**
   * START LISTENING
   * 
   * Starts speech recognition.
   * Requests microphone permission if needed.
   * 
   * @param {Object} callbacks - Callback functions
   * @param {Function} callbacks.onTranscript - Called with transcription updates
   * @param {Function} callbacks.onFinalTranscript - Called with final transcription
   * @param {Function} callbacks.onError - Called on errors
   * @returns {Promise<void>}
   */
  async startListening(callbacks = {}) {
    if (!this.isSupported) {
      throw new Error('Web Speech API not supported in this browser');
    }

    if (this.isListening) {
      console.warn('[WebSpeechService] Already listening');
      return;
    }

    // Set callbacks
    this.onTranscriptCallback = callbacks.onTranscript;
    this.onFinalTranscriptCallback = callbacks.onFinalTranscript;
    this.onErrorCallback = callbacks.onError;

    // Reset transcript
    this.currentTranscript = '';

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());

      // Start recognition
      this.recognition.start();
      console.log('[WebSpeechService] Started listening');
    } catch (error) {
      console.error('[WebSpeechService] Error starting recognition:', error);
      
      if (this.onErrorCallback) {
        this.onErrorCallback(error.message);
      }
      
      throw error;
    }
  }

  /**
   * STOP LISTENING
   * 
   * Stops speech recognition.
   */
  stopListening() {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;

    if (this.recognition) {
      this.recognition.stop();
    }

    console.log('[WebSpeechService] Stopped listening');
  }

  /**
   * SPEAK
   * 
   * Converts text to speech using Web Speech API.
   * 
   * @param {string} text - Text to speak
   * @param {Object} options - Speech options
   * @param {number} options.rate - Speech rate (0.1 to 10, default 1)
   * @param {number} options.pitch - Speech pitch (0 to 2, default 1)
   * @param {number} options.volume - Speech volume (0 to 1, default 1)
   * @param {string} options.voice - Voice name (optional)
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    if (!this.isSupported) {
      throw new Error('Web Speech API not supported in this browser');
    }

    // Stop any current speech
    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Configure utterance
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;
      utterance.lang = 'en-US';

      // Set voice if specified
      if (options.voice) {
        const voices = this.synthesis.getVoices();
        const selectedVoice = voices.find(v => v.name === options.voice);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      // Event handlers
      utterance.onstart = () => {
        console.log('[WebSpeechService] Started speaking');
        this.isSpeaking = true;
        this.currentUtterance = utterance;
      };

      utterance.onend = () => {
        console.log('[WebSpeechService] Finished speaking');
        this.isSpeaking = false;
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('[WebSpeechService] Speech error:', event.error);
        this.isSpeaking = false;
        this.currentUtterance = null;
        reject(new Error(event.error));
      };

      // Speak
      this.synthesis.speak(utterance);
    });
  }

  /**
   * STOP SPEAKING
   * 
   * Stops current speech output.
   */
  stopSpeaking() {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }

    this.isSpeaking = false;
    this.currentUtterance = null;
    console.log('[WebSpeechService] Stopped speaking');
  }

  /**
   * GET AVAILABLE VOICES
   * 
   * Returns list of available TTS voices.
   * 
   * @returns {Array} Array of voice objects
   */
  getAvailableVoices() {
    if (!this.isSupported) {
      return [];
    }

    const voices = this.synthesis.getVoices();
    
    // Filter for English voices and format
    return voices
      .filter(voice => voice.lang.startsWith('en'))
      .map(voice => ({
        name: voice.name,
        lang: voice.lang,
        isDefault: voice.default,
        isLocal: voice.localService
      }));
  }

  /**
   * LOAD AUDIO DEVICES
   * 
   * Loads available microphones and speakers.
   * Requires microphone permission.
   */
  async loadAudioDevices() {
    try {
      // Request permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // Get devices
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.audioDevices.microphones = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          id: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.substr(0, 5)}`,
          isDefault: device.deviceId === 'default'
        }));

      this.audioDevices.speakers = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          id: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.substr(0, 5)}`,
          isDefault: device.deviceId === 'default'
        }));

      console.log('[WebSpeechService] Loaded audio devices:', this.audioDevices);
    } catch (error) {
      console.error('[WebSpeechService] Error loading audio devices:', error);
    }
  }

  /**
   * GET MICROPHONES
   * 
   * Returns list of available microphones.
   * 
   * @returns {Array} Array of microphone objects
   */
  getMicrophones() {
    return this.audioDevices.microphones;
  }

  /**
   * GET SPEAKERS
   * 
   * Returns list of available speakers.
   * 
   * @returns {Array} Array of speaker objects
   */
  getSpeakers() {
    return this.audioDevices.speakers;
  }

  /**
   * SET MICROPHONE
   * 
   * Sets the active microphone device.
   * Note: Web Speech API doesn't support device selection directly.
   * This is stored for future use with MediaDevices API.
   * 
   * @param {string} deviceId - Device ID
   */
  setMicrophone(deviceId) {
    console.log('[WebSpeechService] Set microphone:', deviceId);
    // Store for future use
    this.selectedMicrophone = deviceId;
  }

  /**
   * SET SPEAKER
   * 
   * Sets the active speaker device.
   * Note: Web Speech API doesn't support device selection.
   * This would require using HTMLAudioElement.setSinkId() for TTS.
   * 
   * @param {string} deviceId - Device ID
   */
  setSpeaker(deviceId) {
    console.log('[WebSpeechService] Set speaker:', deviceId);
    // Store for future use
    this.selectedSpeaker = deviceId;
  }
}

// Export for use in other modules
window.WebSpeechService = WebSpeechService;

console.log('[WebSpeechService] WebSpeechService class loaded');
