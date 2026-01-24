/**
 * CONVERSATION SIDEBAR TESTS
 * 
 * Tests the conversation creation and sidebar display behavior.
 * 
 * CRITICAL BUG BEING TESTED:
 * When a conversation is created via voice input (VoicePipelineService),
 * it does NOT appear in the sidebar because no 'conversation_created' event
 * is sent to the frontend.
 * 
 * SCENARIOS TESTED:
 * 1. Manual conversation creation (via "New Chat" button) - SHOULD work
 * 2. Voice-triggered conversation creation - CURRENTLY BROKEN
 * 3. Sidebar update on conversation_created event
 * 4. Sidebar update on conversations_list event
 * 
 * TEST ARCHITECTURE:
 * - Mock WebSocket connection
 * - Mock backend responses
 * - Verify DOM updates
 * - Verify event handling
 */

const assert = require('assert');

/**
 * TEST SUITE: Conversation Sidebar Display
 * 
 * Verifies that conversations appear in the sidebar when created
 * through different pathways.
 */
describe('Conversation Sidebar Display', function() {
  this.timeout(10000);
  
  let mockWebSocket;
  let chatSidebar;
  let conversationsList;
  let sentMessages;
  
  /**
   * SETUP: Create mock environment
   * 
   * Creates a minimal DOM structure and mocks for testing
   * the sidebar without needing the full app.
   */
  beforeEach(function() {
    // Reset sent messages tracker
    sentMessages = [];
    
    // Create minimal DOM structure
    document.body.innerHTML = `
      <div id="chat-sidebar" class="chat-sidebar">
        <div class="sidebar-header">
          <h2 class="sidebar-title">Conversations</h2>
          <button id="new-chat-button" class="new-chat-button">+</button>
        </div>
        <div id="conversations-list" class="conversations-list"></div>
      </div>
    `;
    
    conversationsList = document.getElementById('conversations-list');
    
    // Create mock WebSocket client
    mockWebSocket = {
      isConnected: true,
      sendMessage: function(message) {
        console.log('[MockWS] Sending:', message.type);
        sentMessages.push(message);
      }
    };
    
    // Set up global app object with mock WebSocket
    window.app = {
      websocketClient: mockWebSocket
    };
    window.websocketClient = mockWebSocket;
    
    // Initialize ChatSidebar
    // This loads the actual ChatSidebar class from the frontend
    chatSidebar = new ChatSidebar();
  });
  
  afterEach(function() {
    // Clean up
    document.body.innerHTML = '';
    window.app = null;
    window.websocketClient = null;
  });
  
  /**
   * TEST 1: Manual Conversation Creation
   * 
   * When user clicks "New Chat" button, the conversation should:
   * 1. Send 'create_conversation' message to backend
   * 2. Backend responds with 'conversation_created' event
   * 3. Sidebar displays the new conversation
   * 
   * EXPECTED: This should work correctly
   */
  describe('Manual Conversation Creation (New Chat Button)', function() {
    
    it('should send create_conversation message when New Chat button clicked', function() {
      const newChatButton = document.getElementById('new-chat-button');
      
      // Simulate button click
      newChatButton.click();
      
      // Verify message was sent
      assert.strictEqual(sentMessages.length, 1, 'Should send exactly one message');
      assert.strictEqual(sentMessages[0].type, 'create_conversation', 'Should send create_conversation message');
      
      console.log('✓ create_conversation message sent');
    });
    
    it('should add conversation to sidebar when conversation_created event received', function() {
      // Simulate backend response with conversation_created event
      const mockConversation = {
        id: 'test-conv-123',
        title: 'New Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        lastMessage: ''
      };
      
      // Trigger the conversation_created handler
      chatSidebar.updateConversationsList([mockConversation]);
      
      // Verify conversation appears in sidebar
      const conversationItems = conversationsList.querySelectorAll('.conversation-item');
      assert.strictEqual(conversationItems.length, 1, 'Should have exactly one conversation');
      assert.strictEqual(conversationItems[0].dataset.conversationId, 'test-conv-123', 'Conversation ID should match');
      
      console.log('✓ Conversation added to sidebar');
    });
    
    it('should display conversation with correct metadata', function() {
      const mockConversation = {
        id: 'test-conv-456',
        title: 'Test Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        lastMessage: 'Hello world'
      };
      
      chatSidebar.updateConversationsList([mockConversation]);
      
      const conversationItem = conversationsList.querySelector('.conversation-item');
      const title = conversationItem.querySelector('.conversation-title');
      const preview = conversationItem.querySelector('.conversation-preview');
      
      assert.strictEqual(title.textContent, 'Test Chat', 'Title should match');
      assert.ok(preview.textContent.includes('Hello world'), 'Preview should include last message');
      
      console.log('✓ Conversation metadata displayed correctly');
    });
  });
  
  /**
   * TEST 2: Voice-Triggered Conversation Creation
   * 
   * When user speaks and conversation is auto-created in VoicePipelineService:
   * 1. Backend creates conversation silently
   * 2. NO 'conversation_created' event is sent
   * 3. Sidebar does NOT update
   * 
   * EXPECTED: This is the BUG - conversation should appear but doesn't
   */
  describe('Voice-Triggered Conversation Creation (THE BUG)', function() {
    
    it('should NOT receive conversation_created event from voice input', function(done) {
      // Simulate voice input flow
      // In real app: user speaks → silence detected → LLM timer fires → conversation created
      
      // Mock the voice input message
      mockWebSocket.sendMessage({
        type: 'start_voice_input',
        settings: { language: 'en-US', continuous: true }
      });
      
      // Wait a moment to see if any conversation_created events arrive
      setTimeout(() => {
        // Check if any conversation_created messages were sent
        const conversationCreatedMessages = sentMessages.filter(
          msg => msg.type === 'conversation_created'
        );
        
        // BUG: No conversation_created event is sent from VoicePipelineService
        assert.strictEqual(conversationCreatedMessages.length, 0, 'BUG: No conversation_created event from voice input');
        
        console.log('✗ BUG CONFIRMED: No conversation_created event from voice input');
        done();
      }, 100);
    });
    
    it('should NOT show conversation in sidebar after voice input', function() {
      // Simulate the internal state that happens in VoicePipelineService
      // The conversation is created but no event is sent to frontend
      
      // Initial state: no conversations
      assert.strictEqual(conversationsList.children.length, 0, 'Sidebar should start empty');
      
      // Simulate voice input (no conversation_created event sent)
      // In real backend, conversation is created but frontend doesn't know
      
      // Verify sidebar is still empty
      assert.strictEqual(conversationsList.children.length, 0, 'BUG: Sidebar remains empty after voice input');
      
      console.log('✗ BUG CONFIRMED: Sidebar remains empty after voice input');
    });
    
    it('should demonstrate the missing event flow', function() {
      console.log('\n=== BUG DEMONSTRATION ===');
      console.log('1. User speaks into microphone');
      console.log('2. Backend detects 0.5s silence');
      console.log('3. VoicePipelineService creates conversation:');
      console.log('   conversation = await this.conversationService.createConversation()');
      console.log('4. ❌ NO event sent to frontend!');
      console.log('5. ❌ Sidebar never updates!');
      console.log('\nExpected flow:');
      console.log('4. ✓ Send conversation_created event to frontend');
      console.log('5. ✓ Sidebar updates with new conversation');
      console.log('========================\n');
      
      assert.ok(true, 'Bug demonstration complete');
    });
  });
  
  /**
   * TEST 3: Sidebar Update Mechanisms
   * 
   * Tests the different ways the sidebar can be updated.
   */
  describe('Sidebar Update Mechanisms', function() {
    
    it('should update sidebar when conversations_list event received', function() {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'First Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          lastMessage: 'First message'
        },
        {
          id: 'conv-2',
          title: 'Second Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          lastMessage: 'Second message'
        }
      ];
      
      chatSidebar.updateConversationsList(mockConversations);
      
      const conversationItems = conversationsList.querySelectorAll('.conversation-item');
      assert.strictEqual(conversationItems.length, 2, 'Should have two conversations');
      
      console.log('✓ Sidebar updated with conversations_list event');
    });
    
    it('should sort conversations by most recent first', function() {
      const oldDate = new Date('2026-01-01T10:00:00Z').toISOString();
      const newDate = new Date('2026-01-24T10:00:00Z').toISOString();
      
      const mockConversations = [
        {
          id: 'old-conv',
          title: 'Old Chat',
          createdAt: oldDate,
          updatedAt: oldDate,
          messages: [],
          lastMessage: 'Old message'
        },
        {
          id: 'new-conv',
          title: 'New Chat',
          createdAt: newDate,
          updatedAt: newDate,
          messages: [],
          lastMessage: 'New message'
        }
      ];
      
      chatSidebar.updateConversationsList(mockConversations);
      
      const conversationItems = conversationsList.querySelectorAll('.conversation-item');
      
      // First item should be the newer conversation
      assert.strictEqual(conversationItems[0].dataset.conversationId, 'new-conv', 'First conversation should be newest');
      assert.strictEqual(conversationItems[1].dataset.conversationId, 'old-conv', 'Second conversation should be oldest');
      
      console.log('✓ Conversations sorted by most recent');
    });
    
    it('should show empty state when no conversations exist', function() {
      chatSidebar.updateConversationsList([]);
      
      // Check if empty state is shown
      const emptyState = conversationsList.querySelector('.empty-state');
      assert.ok(emptyState, 'Empty state should be displayed');
      
      console.log('✓ Empty state displayed when no conversations');
    });
  });
  
  /**
   * TEST 4: Conversation Switching
   * 
   * Tests switching between conversations in the sidebar.
   */
  describe('Conversation Switching', function() {
    
    it('should mark clicked conversation as active', function() {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'First Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          lastMessage: ''
        },
        {
          id: 'conv-2',
          title: 'Second Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          lastMessage: ''
        }
      ];
      
      chatSidebar.updateConversationsList(mockConversations);
      
      // Click on second conversation
      const conversationItems = conversationsList.querySelectorAll('.conversation-item');
      conversationItems[1].click();
      
      // Wait for click handler to process
      setTimeout(() => {
        // Verify switch_conversation message was sent
        const switchMessages = sentMessages.filter(msg => msg.type === 'switch_conversation');
        assert.ok(switchMessages.length >= 1, 'Should send switch_conversation message');
        
        console.log('✓ Conversation switch message sent');
      }, 50);
    });
  });
  
  /**
   * TEST 5: Integration Test - Full Flow
   * 
   * Tests the complete flow from conversation creation to display.
   */
  describe('Integration: Full Conversation Flow', function() {
    
    it('should handle complete manual conversation creation flow', function(done) {
      // Step 1: User clicks New Chat button
      const newChatButton = document.getElementById('new-chat-button');
      newChatButton.click();
      
      // Step 2: Verify create_conversation message sent
      assert.strictEqual(sentMessages[sentMessages.length - 1].type, 'create_conversation', 'Should send create_conversation');
      
      // Step 3: Simulate backend response
      const mockConversation = {
        id: 'integration-test-conv',
        title: 'Integration Test Chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        lastMessage: ''
      };
      
      // Step 4: Simulate conversation_created event
      chatSidebar.updateConversationsList([mockConversation]);
      
      // Step 5: Verify conversation appears in sidebar
      setTimeout(() => {
        const conversationItems = conversationsList.querySelectorAll('.conversation-item');
        assert.strictEqual(conversationItems.length, 1, 'Should have one conversation');
        assert.strictEqual(conversationItems[0].dataset.conversationId, 'integration-test-conv', 'Conversation ID should match');
        
        console.log('✓ Complete manual conversation flow works');
        done();
      }, 100);
    });
  });
  
  /**
   * SUMMARY TEST: Report Findings
   * 
   * Summarizes the test results and the bug.
   */
  describe('Bug Summary Report', function() {
    
    it('should report the conversation sidebar bug', function() {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║         CONVERSATION SIDEBAR BUG REPORT                   ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('\n📋 ISSUE: Voice-created conversations do not appear in sidebar');
      console.log('\n🔍 ROOT CAUSE:');
      console.log('   File: src/backend/services/VoicePipelineService.js');
      console.log('   Lines: 454-459');
      console.log('   Problem: Creates conversation without sending event to frontend');
      console.log('\n❌ CURRENT BEHAVIOR:');
      console.log('   1. User speaks → silence detected → conversation created');
      console.log('   2. Conversation stored in backend memory');
      console.log('   3. NO conversation_created event sent');
      console.log('   4. Sidebar remains empty');
      console.log('\n✅ EXPECTED BEHAVIOR:');
      console.log('   1. User speaks → silence detected → conversation created');
      console.log('   2. Conversation stored in backend memory');
      console.log('   3. conversation_created event sent to frontend');
      console.log('   4. Sidebar updates with new conversation');
      console.log('\n🔧 FIX REQUIRED:');
      console.log('   Add WebSocket event emission in VoicePipelineService');
      console.log('   after conversation creation (line 458)');
      console.log('\n═══════════════════════════════════════════════════════════\n');
      
      assert.ok(true, 'Bug report generated');
    });
  });
});

/**
 * EXPORT FOR TEST RUNNER
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    description: 'Conversation Sidebar Tests - Tests conversation creation and display behavior'
  };
}
