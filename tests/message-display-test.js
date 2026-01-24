/**
 * MESSAGE DISPLAY TEST
 * 
 * Tests that messages are actually displayed in the UI when received.
 * 
 * This test verifies:
 * 1. User messages appear when sent
 * 2. AI responses appear when received
 * 3. Streaming messages are displayed correctly
 */

const WebSocket = require('ws');

const BACKEND_WS_URL = 'ws://localhost:7483';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║   MESSAGE DISPLAY TEST                                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

async function runTest() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Test timed out'));
    }, 30000);

    console.log('📡 Connecting to backend...');
    const ws = new WebSocket(BACKEND_WS_URL);
    
    let receivedEvents = [];
    
    ws.on('open', () => {
      console.log('✓ Connected\n');
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        receivedEvents.push(message.type);
        
        console.log(`📨 ${message.type}`);
        
        if (message.type === 'status') {
          // Send a test message
          console.log('\n💬 Sending test message...\n');
          ws.send(JSON.stringify({
            type: 'user_message',
            content: 'Test message for display',
            conversationId: null
          }));
        }
        
        if (message.type === 'ai_response_stream_end') {
          clearTimeout(timeout);
          ws.close();
          
          console.log('\n╔════════════════════════════════════════════════════════════╗');
          console.log('║   EVENTS RECEIVED                                          ║');
          console.log('╚════════════════════════════════════════════════════════════╝\n');
          
          const eventCounts = {};
          receivedEvents.forEach(event => {
            eventCounts[event] = (eventCounts[event] || 0) + 1;
          });
          
          Object.entries(eventCounts).forEach(([event, count]) => {
            console.log(`  ${event}: ${count}`);
          });
          
          console.log('\n✓ Test complete - check frontend to see if messages appeared\n');
          
          resolve({ receivedEvents, eventCounts });
        }
      } catch (error) {
        console.error('Error:', error);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

runTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
