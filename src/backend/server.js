/**
 * BUBBLEVOICE MAC - BACKEND SERVER
 * 
 * Node.js backend server that handles:
 * - Voice pipeline (speech recognition, LLM, TTS)
 * - WebSocket communication with frontend
 * - LLM API orchestration
 * - Conversation state management
 * - Three-timer turn detection system
 * - Interruption handling
 * 
 * ARCHITECTURE DECISIONS:
 * - Express for HTTP endpoints (health check, file serving)
 * - WebSocket (ws library) for real-time communication
 * - Modular design with separate services for each concern
 * - Event-driven architecture for voice pipeline
 * 
 * PRODUCT CONTEXT:
 * This backend is the brain of BubbleVoice. It coordinates all the
 * complex voice AI interactions while keeping the frontend simple
 * and responsive. The three-timer system (ported from Accountability)
 * enables natural conversation flow without awkward pauses.
 * 
 * TECHNICAL NOTES:
 * - Runs on port 7482 (HTTP) and 7483 (WebSocket)
 * - Uses environment variables for API keys
 * - Implements graceful shutdown
 * - Handles multiple concurrent conversations
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Import services
// These will be created in separate files for modularity
const ConversationService = require('./services/ConversationService');
const LLMService = require('./services/LLMService');
const VoicePipelineService = require('./services/VoicePipelineService');
const BubbleGeneratorService = require('./services/BubbleGeneratorService');

// Configuration
const PORT = process.env.PORT || 7482;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 7483;
const isDev = process.env.NODE_ENV === 'development';

/**
 * BACKEND SERVER CLASS
 * 
 * Main server class that orchestrates all backend services.
 */
class BackendServer {
  constructor() {
    // Express app for HTTP endpoints
    this.app = express();
    this.httpServer = null;

    // WebSocket server for real-time communication
    this.wss = null;

    // Services
    // Each service handles a specific domain of functionality
    this.conversationService = new ConversationService();
    this.llmService = new LLMService();
    this.voicePipelineService = new VoicePipelineService(this);
    this.bubbleGeneratorService = new BubbleGeneratorService();

    // Active connections
    // Maps WebSocket connections to conversation sessions
    this.connections = new Map();

    // Shutdown flag
    this.isShuttingDown = false;
  }

  /**
   * INITIALIZE SERVER
   * 
   * Sets up Express app, WebSocket server, and starts listening.
   */
  async init() {
    console.log('[Backend] Initializing BubbleVoice backend...');

    try {
      // Setup Express middleware
      this.setupExpress();

      // Setup HTTP server
      this.httpServer = http.createServer(this.app);

      // Setup WebSocket server
      this.setupWebSocket();

      // Start listening
      await this.startListening();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      console.log('[Backend] BubbleVoice backend initialized successfully');
    } catch (error) {
      console.error('[Backend] Initialization error:', error);
      process.exit(1);
    }
  }

  /**
   * SETUP EXPRESS
   * 
   * Configures Express middleware and routes.
   */
  setupExpress() {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS (for development)
    if (isDev) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();
      });
    }

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });

    // API info endpoint
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'BubbleVoice Backend',
        version: '0.1.0',
        capabilities: [
          'voice_input',
          'llm_inference',
          'tts_output',
          'bubble_generation',
          'artifact_generation',
          'conversation_memory'
        ]
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('[Backend] Express error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: isDev ? err.message : undefined
      });
    });
  }

  /**
   * SETUP WEBSOCKET
   * 
   * Configures WebSocket server for real-time communication.
   */
  setupWebSocket() {
    this.wss = new WebSocket.Server({ 
      port: WEBSOCKET_PORT,
      perMessageDeflate: false // Disable compression for lower latency
    });

    this.wss.on('connection', (ws, req) => {
      this.handleNewConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('[Backend] WebSocket server error:', error);
    });

    console.log(`[Backend] WebSocket server listening on port ${WEBSOCKET_PORT}`);
  }

  /**
   * HANDLE NEW CONNECTION
   * 
   * Called when a new WebSocket connection is established.
   * Sets up connection state and event handlers.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {IncomingMessage} req - HTTP request that initiated the connection
   */
  handleNewConnection(ws, req) {
    const clientId = this.generateClientId();
    console.log(`[Backend] New connection: ${clientId} from ${req.socket.remoteAddress}`);

    // Create connection state
    const connectionState = {
      id: clientId,
      ws,
      conversationId: null,
      voiceSession: null,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.connections.set(ws, connectionState);

    // Send welcome message
    this.sendMessage(ws, {
      type: 'status',
      data: {
        message: 'Connected to BubbleVoice backend',
        clientId
      }
    });

    // Setup event handlers
    ws.on('message', (data) => {
      this.handleMessage(ws, data, connectionState);
    });

    ws.on('close', () => {
      this.handleDisconnection(ws, connectionState);
    });

    ws.on('error', (error) => {
      console.error(`[Backend] WebSocket error for ${clientId}:`, error);
    });

    // Setup ping/pong for keepalive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  }

  /**
   * HANDLE MESSAGE
   * 
   * Routes incoming WebSocket messages to appropriate handlers.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer|String} data - Message data
   * @param {Object} connectionState - Connection state object
   */
  async handleMessage(ws, data, connectionState) {
    try {
      const message = JSON.parse(data.toString());
      connectionState.lastActivity = Date.now();

      console.log(`[Backend] Message from ${connectionState.id}:`, message.type);

      // Route to appropriate handler
      switch (message.type) {
        case 'start_voice_input':
          await this.handleStartVoiceInput(ws, message, connectionState);
          break;

        case 'stop_voice_input':
          await this.handleStopVoiceInput(ws, message, connectionState);
          break;

        case 'stop_speaking':
          await this.handleStopSpeaking(ws, message, connectionState);
          break;

        case 'get_voices':
          await this.handleGetVoices(ws, message, connectionState);
          break;

        case 'user_message':
          await this.handleUserMessage(ws, message, connectionState);
          break;

        case 'interrupt':
          await this.handleInterrupt(ws, message, connectionState);
          break;

        case 'ping':
          this.sendMessage(ws, { type: 'pong', data: { timestamp: Date.now() } });
          break;

        default:
          console.warn(`[Backend] Unknown message type: ${message.type}`);
          this.sendMessage(ws, {
            type: 'error',
            data: { message: `Unknown message type: ${message.type}` }
          });
      }
    } catch (error) {
      console.error('[Backend] Error handling message:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Error processing message', error: error.message }
      });
    }
  }

  /**
   * HANDLE START VOICE INPUT
   * 
   * Starts voice input capture for the connection.
   * Initializes speech recognition and begins listening.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleStartVoiceInput(ws, message, connectionState) {
    console.log(`[Backend] Starting voice input for ${connectionState.id}`);

    try {
      // Start voice pipeline
      const voiceSession = await this.voicePipelineService.startVoiceInput(
        connectionState.id,
        message.settings || {},
        (transcription) => {
          // Callback for transcription updates
          this.sendMessage(ws, {
            type: 'transcription_update',
            data: transcription
          });
        }
      );

      connectionState.voiceSession = voiceSession;

      this.sendMessage(ws, {
        type: 'status',
        data: { message: 'Voice input started' }
      });
    } catch (error) {
      console.error('[Backend] Error starting voice input:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to start voice input', error: error.message }
      });
    }
  }

  /**
   * HANDLE STOP VOICE INPUT
   * 
   * Stops voice input capture for the connection.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleStopVoiceInput(ws, message, connectionState) {
    console.log(`[Backend] Stopping voice input for ${connectionState.id}`);

    try {
      if (connectionState.voiceSession) {
        await this.voicePipelineService.stopVoiceInput(connectionState.voiceSession);
        connectionState.voiceSession = null;
      }

      this.sendMessage(ws, {
        type: 'status',
        data: { message: 'Voice input stopped' }
      });
    } catch (error) {
      console.error('[Backend] Error stopping voice input:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to stop voice input', error: error.message }
      });
    }
  }

  /**
   * HANDLE USER MESSAGE
   * 
   * Processes a user message and generates AI response.
   * Implements the full conversation pipeline:
   * 1. Add message to conversation history
   * 2. Generate AI response with LLM
   * 3. Generate bubbles in parallel
   * 4. Generate TTS audio
   * 5. Send response to frontend
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleUserMessage(ws, message, connectionState) {
    console.log(`[Backend] Processing user message for ${connectionState.id}`);

    try {
      const { content, conversationId, settings } = message;

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await this.conversationService.getConversation(conversationId);
      } else {
        conversation = await this.conversationService.createConversation();
        connectionState.conversationId = conversation.id;
      }

      // Add user message to conversation
      await this.conversationService.addMessage(conversation.id, {
        role: 'user',
        content,
        timestamp: Date.now()
      });

      // Generate AI response (streaming)
      this.sendMessage(ws, {
        type: 'ai_response_stream_start',
        data: {}
      });

      let fullResponse = '';
      let bubbles = [];
      let artifact = null;

      // Stream LLM response
      await this.llmService.generateResponse(
        conversation,
        settings,
        {
          onChunk: (chunk) => {
            fullResponse += chunk;
            this.sendMessage(ws, {
              type: 'ai_response_stream_chunk',
              data: { content: chunk }
            });
          },
          onBubbles: (generatedBubbles) => {
            bubbles = generatedBubbles;
          },
          onArtifact: (generatedArtifact) => {
            artifact = generatedArtifact;
          }
        }
      );

      // Add AI response to conversation
      await this.conversationService.addMessage(conversation.id, {
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      });

      // Generate TTS audio (if enabled)
      let audioUrl = null;
      // TODO: Implement TTS generation
      // audioUrl = await this.voicePipelineService.generateTTS(fullResponse, settings);

      // Send final response
      this.sendMessage(ws, {
        type: 'ai_response_stream_end',
        data: {
          bubbles,
          artifact,
          audioUrl
        }
      });

    } catch (error) {
      console.error('[Backend] Error processing user message:', error);
      this.sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to process message', error: error.message }
      });
    }
  }

  /**
   * HANDLE STOP SPEAKING
   * 
   * Stops current TTS playback.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleStopSpeaking(ws, message, connectionState) {
    console.log(`[Backend] Stop speaking from ${connectionState.id}`);

    try {
      if (connectionState.voiceSession) {
        await this.voicePipelineService.stopSpeaking(connectionState.voiceSession);
      }

      this.sendMessage(ws, {
        type: 'status',
        data: { message: 'Speech stopped' }
      });
    } catch (error) {
      console.error('[Backend] Error stopping speech:', error);
    }
  }

  /**
   * HANDLE GET VOICES
   * 
   * Gets list of available TTS voices from Swift helper.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleGetVoices(ws, message, connectionState) {
    console.log(`[Backend] Get voices from ${connectionState.id}`);

    try {
      // TODO: Get voices from Swift helper
      // For now, send empty list
      this.sendMessage(ws, {
        type: 'voices_list',
        data: { voices: [] }
      });
    } catch (error) {
      console.error('[Backend] Error getting voices:', error);
    }
  }

  /**
   * HANDLE INTERRUPT
   * 
   * Handles user interruption of AI response.
   * Stops TTS playback and clears any cached responses.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object
   * @param {Object} connectionState - Connection state
   */
  async handleInterrupt(ws, message, connectionState) {
    console.log(`[Backend] Interrupt from ${connectionState.id}`);

    try {
      // Stop any ongoing TTS
      if (connectionState.voiceSession) {
        await this.voicePipelineService.interrupt(connectionState.voiceSession);
      }

      this.sendMessage(ws, {
        type: 'status',
        data: { message: 'Interrupted' }
      });
    } catch (error) {
      console.error('[Backend] Error handling interrupt:', error);
    }
  }

  /**
   * HANDLE DISCONNECTION
   * 
   * Cleans up when a client disconnects.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} connectionState - Connection state
   */
  handleDisconnection(ws, connectionState) {
    console.log(`[Backend] Disconnection: ${connectionState.id}`);

    // Cleanup voice session
    if (connectionState.voiceSession) {
      this.voicePipelineService.stopVoiceInput(connectionState.voiceSession)
        .catch(err => console.error('[Backend] Error cleaning up voice session:', err));
    }

    // Remove from connections map
    this.connections.delete(ws);
  }

  /**
   * SEND MESSAGE
   * 
   * Sends a message to a WebSocket client.
   * 
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message object to send
   */
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * START LISTENING
   * 
   * Starts the HTTP server.
   */
  async startListening() {
    return new Promise((resolve) => {
      this.httpServer.listen(PORT, () => {
        console.log(`[Backend] HTTP server listening on port ${PORT}`);
        resolve();
      });
    });
  }

  /**
   * SETUP GRACEFUL SHUTDOWN
   * 
   * Handles graceful shutdown on SIGTERM/SIGINT.
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        return;
      }

      console.log(`[Backend] Received ${signal}, shutting down gracefully...`);
      this.isShuttingDown = true;

      // Close WebSocket connections
      for (const [ws, state] of this.connections) {
        this.sendMessage(ws, {
          type: 'status',
          data: { message: 'Server shutting down' }
        });
        ws.close(1001, 'Server shutdown');
      }

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[Backend] Server closed');
          process.exit(0);
        });
      }

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('[Backend] Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * GENERATE CLIENT ID
   * 
   * Generates a unique client ID for a connection.
   * 
   * @returns {string} Client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * START KEEPALIVE PING
   * 
   * Starts a keepalive ping interval to detect dead connections.
   */
  startKeepalivePing() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          console.log('[Backend] Terminating dead connection');
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Ping every 30 seconds
  }
}

// Only auto-start if this file is run directly (not imported for testing)
if (require.main === module) {
  // Create and start server
  const server = new BackendServer();
  server.init().catch((error) => {
    console.error('[Backend] Fatal error:', error);
    process.exit(1);
  });

  // Start keepalive ping
  server.startKeepalivePing();
}

module.exports = BackendServer;
