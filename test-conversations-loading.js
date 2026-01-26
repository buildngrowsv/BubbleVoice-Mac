/**
 * TEST: CONVERSATIONS LOADING
 * 
 * Purpose:
 * Test that conversations load properly without infinite loading state.
 * 
 * What we're testing:
 * 1. Conversations sidebar appears
 * 2. Loading state disappears after data loads
 * 3. Either shows "No conversations yet" or list of conversations
 * 4. No infinite loading spinner
 * 
 * Technical approach:
 * - Use Puppeteer to launch app
 * - Wait for sidebar to appear
 * - Check that loading state resolves
 * - Take screenshots for verification
 * 
 * Created: 2026-01-25
 * Part of: Conversations Loading Bug Fix
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function testConversationsLoading() {
    console.log('\n=== TESTING CONVERSATIONS LOADING ===\n');
    
    let browser;
    try {
        // Launch browser
        console.log('[Test] Launching browser...');
        browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
            defaultViewport: {
                width: 1400,
                height: 900
            }
        });
        
        const page = await browser.newPage();
        
        // Enable console logging from the page
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[ChatHistorySidebar]') || 
                text.includes('[Main]') || 
                text.includes('conversation')) {
                console.log('[Page Console]', text);
            }
        });
        
        // Listen for errors
        page.on('pageerror', error => {
            console.error('[Page Error]', error.message);
        });
        
        // Navigate to app (assuming it's running on default port)
        console.log('[Test] Navigating to app...');
        await page.goto('http://localhost:3842', { 
            waitUntil: 'networkidle0',
            timeout: 10000 
        });
        
        console.log('[Test] Page loaded');
        
        // Wait for sidebar to appear
        console.log('[Test] Waiting for conversations sidebar...');
        await page.waitForSelector('.chat-history-sidebar', { timeout: 5000 });
        console.log('[Test] ✅ Sidebar found');
        
        // Take initial screenshot
        await page.screenshot({ 
            path: path.join(__dirname, 'test-screenshots', 'conversations-initial.png'),
            fullPage: true 
        });
        console.log('[Test] Screenshot saved: conversations-initial.png');
        
        // Check if loading state exists
        const hasLoadingState = await page.$('.loading-state');
        console.log(`[Test] Loading state present: ${!!hasLoadingState}`);
        
        if (hasLoadingState) {
            console.log('[Test] Waiting for loading state to disappear...');
            
            // Wait up to 5 seconds for loading to complete
            try {
                await page.waitForFunction(
                    () => {
                        const loadingEl = document.querySelector('.loading-state');
                        return !loadingEl || loadingEl.style.display === 'none' || !loadingEl.offsetParent;
                    },
                    { timeout: 5000 }
                );
                console.log('[Test] ✅ Loading state disappeared');
            } catch (error) {
                console.error('[Test] ❌ FAILED: Loading state did not disappear within 5 seconds');
                
                // Take screenshot of stuck loading
                await page.screenshot({ 
                    path: path.join(__dirname, 'test-screenshots', 'conversations-stuck-loading.png'),
                    fullPage: true 
                });
                console.log('[Test] Screenshot saved: conversations-stuck-loading.png');
                
                // Get the HTML of the sidebar to debug
                const sidebarHTML = await page.$eval('.chat-history-sidebar', el => el.innerHTML);
                console.log('[Test] Sidebar HTML:', sidebarHTML.substring(0, 500));
                
                throw error;
            }
        }
        
        // Wait a moment for content to render
        await page.waitForTimeout(1000);
        
        // Check what's displayed
        const hasEmptyState = await page.$('.empty-state');
        const hasConversationItems = await page.$$('.conversation-item');
        
        console.log(`[Test] Empty state present: ${!!hasEmptyState}`);
        console.log(`[Test] Conversation items count: ${hasConversationItems.length}`);
        
        if (hasEmptyState) {
            const emptyText = await page.$eval('.empty-state', el => el.textContent);
            console.log(`[Test] Empty state text: "${emptyText.trim()}"`);
        }
        
        if (hasConversationItems.length > 0) {
            console.log('[Test] ✅ Conversations loaded successfully');
            
            // Get details of first conversation
            const firstConv = await page.$eval('.conversation-item', el => ({
                title: el.querySelector('.conversation-title')?.textContent,
                preview: el.querySelector('.conversation-preview')?.textContent,
                time: el.querySelector('.conversation-time')?.textContent
            }));
            
            console.log('[Test] First conversation:', firstConv);
        } else if (hasEmptyState) {
            console.log('[Test] ✅ Empty state displayed correctly (no conversations)');
        } else {
            console.log('[Test] ⚠️  Neither conversations nor empty state found');
        }
        
        // Take final screenshot
        await page.screenshot({ 
            path: path.join(__dirname, 'test-screenshots', 'conversations-final.png'),
            fullPage: true 
        });
        console.log('[Test] Screenshot saved: conversations-final.png');
        
        console.log('\n[Test] ✅ TEST PASSED: Conversations loaded without infinite loading\n');
        
    } catch (error) {
        console.error('\n[Test] ❌ TEST FAILED:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Create screenshots directory
const screenshotsDir = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Run test
testConversationsLoading();
