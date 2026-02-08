/**
 * IN-APP STT DIAGNOSTIC TEST
 * 
 * This script tests the SpeechAnalyzer directly within the running app
 * to see if transcriptions work when launched from Electron vs standalone.
 * 
 * Run this from the backend server after app starts.
 */

const { spawn } = require('child_process');
const path = require('path');

class STTDiagnosticTest {
    constructor() {
        this.helperBin = path.join(__dirname, '../../swift-helper/BubbleVoiceSpeech/.build/debug/BubbleVoiceSpeech');
        this.transcriptionCount = 0;
        this.vadCount = 0;
        this.startTime = null;
    }
    
    async run() {
        console.log('\n' + '='.repeat(60));
        console.log('🧪 IN-APP STT DIAGNOSTIC TEST');
        console.log('='.repeat(60));
        console.log('');
        console.log('This will test if SpeechAnalyzer produces transcriptions');
        console.log('when run from within the Electron app.');
        console.log('');
        
        return new Promise((resolve, reject) => {
            // Spawn helper process
            console.log('Starting Swift helper...');
            const helper = spawn(this.helperBin, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stderrBuffer = '';
            
            // Monitor stdout for transcriptions
            helper.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (!line.trim()) return;
                    
                    try {
                        const msg = JSON.parse(line);
                        
                        if (msg.type === 'transcription_update') {
                            this.transcriptionCount++;
                            console.log(`✅ TRANSCRIPTION #${this.transcriptionCount}: "${msg.data.text}" (final: ${msg.data.isFinal})`);
                        } else if (msg.type === 'vad_speech_active') {
                            this.vadCount++;
                            if (this.vadCount % 10 === 0) {
                                console.log(`   VAD heartbeat count: ${this.vadCount}`);
                            }
                        } else if (msg.type === 'ready') {
                            console.log('✅ Helper ready');
                        } else if (msg.type === 'listening_active') {
                            console.log('✅ Listening active');
                            this.startTime = Date.now();
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                });
            });
            
            // Monitor stderr for logs
            helper.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (line.includes('ERROR') || line.includes('FAIL') || line.includes('✅') || line.includes('🎤')) {
                        console.log(`[Helper] ${line}`);
                    }
                });
            });
            
            helper.on('error', (err) => {
                console.error('❌ Helper process error:', err);
                reject(err);
            });
            
            helper.on('close', (code) => {
                console.log('');
                console.log('='.repeat(60));
                console.log('🧪 TEST RESULTS');
                console.log('='.repeat(60));
                console.log('');
                console.log(`Transcriptions received: ${this.transcriptionCount}`);
                console.log(`VAD heartbeats received: ${this.vadCount}`);
                console.log('');
                
                if (this.transcriptionCount > 0) {
                    console.log('✅ SUCCESS: SpeechAnalyzer is producing transcriptions!');
                } else if (this.vadCount > 0) {
                    console.log('❌ FAILURE: VAD working but NO transcriptions produced');
                    console.log('   This means audio is flowing but SpeechAnalyzer is broken.');
                } else {
                    console.log('❌ FAILURE: No VAD heartbeats - audio pipeline not working');
                }
                
                console.log('');
                console.log('='.repeat(60));
                console.log('');
                
                resolve({
                    transcriptionCount: this.transcriptionCount,
                    vadCount: this.vadCount,
                    success: this.transcriptionCount > 0
                });
            });
            
            // Wait for helper to be ready
            setTimeout(() => {
                console.log('Sending start_listening command...');
                helper.stdin.write(JSON.stringify({type: 'start_listening', data: null}) + '\n');
                
                // Wait for initialization
                setTimeout(() => {
                    console.log('');
                    console.log('🎤 MICROPHONE IS LISTENING FOR 15 SECONDS');
                    console.log('🎤 SPEAK INTO YOUR MICROPHONE NOW!');
                    console.log('🎤 Say: "Hello world this is a test"');
                    console.log('');
                    
                    // Monitor for 15 seconds
                    let countdown = 15;
                    const countdownInterval = setInterval(() => {
                        countdown--;
                        if (countdown % 3 === 0 && countdown > 0) {
                            console.log(`⏱️  ${countdown} seconds remaining...`);
                        }
                    }, 1000);
                    
                    // Stop after 15 seconds
                    setTimeout(() => {
                        clearInterval(countdownInterval);
                        console.log('');
                        console.log('Stopping...');
                        helper.stdin.write(JSON.stringify({type: 'stop_listening', data: null}) + '\n');
                        
                        // Give it time to stop, then kill
                        setTimeout(() => {
                            helper.kill();
                        }, 2000);
                    }, 15000);
                }, 2000);
            }, 1000);
        });
    }
}

// Export for use in backend
module.exports = STTDiagnosticTest;

// Allow running standalone
if (require.main === module) {
    const test = new STTDiagnosticTest();
    test.run().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
}
