#!/usr/bin/env node

/**
 * Measure actual prompt size sent to AI
 * 
 * This script runs a test turn and measures:
 * - System prompt size
 * - Conversation history size
 * - Total tokens (approximate)
 */

const { generateAreasTree } = require('./lib/knowledge-base-manager');
const { vectorSearchService } = require('./lib/vector-search-real');

// Approximate token counter (rough estimate: 1 token ≈ 4 characters)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// Read the FULL_SYSTEM_PROMPT
const fs = require('fs');
const fullRunnerContent = fs.readFileSync('./lib/full-runner.js', 'utf-8');
const promptMatch = fullRunnerContent.match(/const FULL_SYSTEM_PROMPT = `([\s\S]*?)`;\s*\/\/ ==============/);
if (!promptMatch) {
  console.error('Could not extract FULL_SYSTEM_PROMPT');
  process.exit(1);
}

const FULL_SYSTEM_PROMPT = promptMatch[1];

async function measurePrompt() {
  console.log('📏 PROMPT SIZE MEASUREMENT\n');
  console.log('═'.repeat(60));
  
  // 1. Base system prompt (without replacements)
  const basePromptSize = FULL_SYSTEM_PROMPT.length;
  const basePromptTokens = estimateTokens(FULL_SYSTEM_PROMPT);
  
  console.log('\n1️⃣  BASE SYSTEM PROMPT');
  console.log(`   Characters: ${basePromptSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${basePromptTokens.toLocaleString()}`);
  
  // 2. Areas tree
  const areasTree = generateAreasTree();
  const areasTreeSize = areasTree.length;
  const areasTreeTokens = estimateTokens(areasTree);
  
  console.log('\n2️⃣  AREAS TREE');
  console.log(`   Characters: ${areasTreeSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${areasTreeTokens.toLocaleString()}`);
  
  // 3. AI Notes (simulate 3 turns)
  const sampleNotes = `Turn 3 (2026-01-20T00:10:00.000Z):
User is feeling overwhelmed by multiple competing priorities: Max's game, Emma's teacher meeting, startup Q1 numbers, lack of exercise.
Emotional State: overwhelmed
Key Context: Multiple urgent demands across family and work
Watch For: Signs of burnout, need for prioritization help

---

Turn 2 (2026-01-20T00:08:00.000Z):
User wants to discuss Emma's reading progress but also asked about kitchen renovation.
Emotional State: scattered
Key Context: Topic switching indicates mental overload
Watch For: Difficulty focusing on one topic

---

Turn 1 (2026-01-20T00:05:00.000Z):
User mentioned Emma had good day with reading but is exhausted from work and investor stress.
Emotional State: exhausted
Key Context: Work-life balance strain
Watch For: Burnout indicators
`;
  
  const aiNotesSize = sampleNotes.length;
  const aiNotesTokens = estimateTokens(sampleNotes);
  
  console.log('\n3️⃣  AI NOTES (3 turns)');
  console.log(`   Characters: ${aiNotesSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${aiNotesTokens.toLocaleString()}`);
  
  // 4. Vector search results (simulate)
  const sampleVectorResults = {
    recentEntries: `[Family/Emma_School/reading_comprehension.md]
Emma had breakthrough with Dog Man graphic novel. Read for 20 minutes straight.

[Work/Startup/fundraising.md]
Second investor meeting went well! They want to see Q1 numbers.

[Personal_Growth/Exercise_Goals/running.md]
Actually ran 3 times this week! Feel so much better.
`.repeat(3), // Simulate multiple entries
    
    summaries: `─── Area Summary: Family/Emma_School ───
Emma is in 2nd grade, struggling with reading comprehension. Recent breakthrough with graphic novels.

─── Area Summary: Work/Startup ───
Fundraising in progress. Had rejections but second meeting went well.
`.repeat(2),
    
    chunks: `[Family/Emma_School/reading_comprehension.md]
Teacher Ms. Johnson recommended educational testing for learning differences.

[Personal_Growth/Mental_Health/therapy_notes.md]
Dr. Chen described guilt as "borrowed suffering".
`.repeat(5),
    
    files: `- Family/Emma_School/reading_comprehension.md (Score: 0.92)
- Work/Startup/fundraising.md (Score: 0.88)
- Personal_Growth/Exercise_Goals/running.md (Score: 0.85)
`.repeat(3)
  };
  
  const vectorText = Object.values(sampleVectorResults).join('');
  const vectorSize = vectorText.length;
  const vectorTokens = estimateTokens(vectorText);
  
  console.log('\n4️⃣  VECTOR SEARCH RESULTS');
  console.log(`   Characters: ${vectorSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${vectorTokens.toLocaleString()}`);
  
  // 5. Conversation history (simulate 3 turns)
  const sampleConversation = [
    { role: 'user', content: 'So Emma had a good day today with reading but I\'m exhausted from work and the investor stuff is stressing me out and I really should go for a run but I\'m too tired and Jordan and I haven\'t had a date night in forever' },
    { role: 'assistant', content: 'It sounds like you\'re juggling a lot right now – that\'s completely understandable. Emma\'s reading progress is wonderful news, but it\'s tough when work stress and other personal goals feel overwhelming. Let\'s take a moment to sort through everything.' },
    { role: 'user', content: 'Yeah let\'s talk about Emma actually, but also quick question - did we ever figure out what to do about the kitchen?' },
    { role: 'assistant', content: 'Absolutely, let\'s focus on Emma for a bit. And yes, regarding the kitchen, we decided to put it on hold for now due to the startup\'s fundraising uncertainty.' },
    { role: 'user', content: 'I don\'t even know where to start honestly, everything is just a lot right now. Max has a game Saturday, Emma has her teacher meeting next week, the startup needs those Q1 numbers, and I haven\'t exercised in like two weeks' }
  ];
  
  const conversationText = sampleConversation.map(m => m.content).join('\n');
  const conversationSize = conversationText.length;
  const conversationTokens = estimateTokens(conversationText);
  
  console.log('\n5️⃣  CONVERSATION HISTORY (3 turns)');
  console.log(`   Characters: ${conversationSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${conversationTokens.toLocaleString()}`);
  
  // 6. Total
  const totalSize = basePromptSize + areasTreeSize + aiNotesSize + vectorSize + conversationSize;
  const totalTokens = basePromptTokens + areasTreeTokens + aiNotesTokens + vectorTokens + conversationTokens;
  
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 TOTAL PROMPT SIZE');
  console.log(`   Characters: ${totalSize.toLocaleString()}`);
  console.log(`   Est. Tokens: ${totalTokens.toLocaleString()}`);
  
  // 7. Breakdown
  console.log('\n📈 BREAKDOWN BY PERCENTAGE');
  console.log(`   Base Prompt:     ${Math.round(basePromptTokens / totalTokens * 100)}%`);
  console.log(`   Areas Tree:      ${Math.round(areasTreeTokens / totalTokens * 100)}%`);
  console.log(`   AI Notes:        ${Math.round(aiNotesTokens / totalTokens * 100)}%`);
  console.log(`   Vector Results:  ${Math.round(vectorTokens / totalTokens * 100)}%`);
  console.log(`   Conversation:    ${Math.round(conversationTokens / totalTokens * 100)}%`);
  
  // 8. Context window usage
  console.log('\n🎯 CONTEXT WINDOW USAGE');
  console.log(`   Gemini 2.5 Flash-Lite: 1M tokens`);
  console.log(`   Prompt usage: ${totalTokens.toLocaleString()} tokens (${(totalTokens / 1000000 * 100).toFixed(2)}%)`);
  console.log(`   Remaining: ${(1000000 - totalTokens).toLocaleString()} tokens`);
  
  // 9. Response budget
  const maxOutputTokens = 8192; // Current setting
  console.log('\n📤 RESPONSE BUDGET');
  console.log(`   Max output tokens: ${maxOutputTokens.toLocaleString()}`);
  console.log(`   Total budget: ${(totalTokens + maxOutputTokens).toLocaleString()} tokens`);
  console.log(`   Context usage: ${((totalTokens + maxOutputTokens) / 1000000 * 100).toFixed(2)}%`);
  
  console.log('\n' + '═'.repeat(60));
}

measurePrompt().catch(console.error);
