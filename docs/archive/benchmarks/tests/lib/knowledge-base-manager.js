/**
 * knowledge-base-manager.js
 * 
 * Manages a pre-populated knowledge base for testing.
 * This represents a user who has been using BubbleVoice for several weeks
 * with conversations about various life areas.
 * 
 * The knowledge base includes:
 * - Family: Emma (7yo, reading struggles), Max (10yo, soccer)
 * - Work: Startup (fundraising, hiring, product)
 * - Personal Growth: Exercise (running goal), Mental health (stress)
 * - Home: Kitchen renovation
 * - Relationships: Partner (date nights)
 * 
 * This allows us to test:
 * - Recall from existing knowledge
 * - Adding to existing areas
 * - Cross-area references
 * - Vector search accuracy
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'knowledge-base');
const LIFE_AREAS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'life_areas');
const CONVERSATIONS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'conversations');

// =============================================================================
// KNOWLEDGE BASE CONTENT
// =============================================================================

/**
 * Pre-defined life areas content representing a user's accumulated knowledge.
 * Each area has entries spanning several weeks to simulate real usage.
 */
const KNOWLEDGE_BASE = {
  
  // =========================================================================
  // FAMILY - Emma (7yo, reading struggles)
  // =========================================================================
  
  'Family/Emma_School': {
    summary: {
      area_name: "Emma's School",
      created: '2026-01-05',
      status: 'Active - Needs Attention',
      current_situation: `Emma (7yo, 2nd grade) has been struggling with reading comprehension for about 2 weeks now. She can decode words fine but doesn't retain what she reads. Teacher (Ms. Johnson) noticed and scheduled a meeting. Major breakthrough came when we tried graphic novels - she read Dog Man for 20 minutes straight! This suggests visual learning style might be key. User is worried about testing for learning differences but also wants to help.`,
      timeline_highlights: [
        { date: '2026-01-19', event: 'Dog Man graphic novel breakthrough - 20min reading' },
        { date: '2026-01-17', event: 'Parent-teacher conference scheduled for testing discussion' },
        { date: '2026-01-15', event: 'Emma asked to read extra chapter (first time!)' },
        { date: '2026-01-12', event: 'Frustration meltdown - threw book, said "I\'m stupid"' },
        { date: '2026-01-10', event: 'Teacher email about reading concerns' },
        { date: '2026-01-05', event: 'First noticed Emma struggling with homework' }
      ],
      ai_notes: `User feels guilty about not noticing sooner. Very protective of Emma's self-esteem. Resistant to "labeling" but wants to help. The graphic novel breakthrough is significant - should encourage this direction. Watch for: follow-up after teacher meeting, Emma's emotional state.`
    },
    documents: {
      'reading_comprehension.md': [
        {
          timestamp: '2026-01-19 10:15:00',
          context: 'Breakthrough moment discussion',
          content: 'Emma had breakthrough with Dog Man graphic novel. Read for 20 minutes straight without complaining or getting frustrated. She laughed at the jokes and could retell the story afterward. This is huge progress.',
          user_quote: 'She read for like 20 minutes straight without complaining!',
          ai_observation: 'Visual learning style hypothesis strengthening. Graphic novels provide visual anchors that help comprehension.',
          sentiment: 'hopeful'
        },
        {
          timestamp: '2026-01-17 14:30:00',
          context: 'Post parent-teacher conference',
          content: 'Teacher (Ms. Johnson) recommended educational testing for learning differences. User is conflicted - wants to help but worried about labeling Emma.',
          user_quote: 'What if we test her and she feels like she\'s broken?',
          ai_observation: 'User needs reassurance that testing is information-gathering, not labeling. Frame as "learning how Emma\'s brain works best".',
          sentiment: 'anxious'
        },
        {
          timestamp: '2026-01-15 20:00:00',
          context: 'Evening bedtime reading',
          content: 'Emma asked to read "just one more chapter" of Ivy & Bean. First time she\'s initiated extra reading. User was emotional.',
          user_quote: 'I almost cried. She never asks to read more.',
          ai_observation: 'Positive reinforcement working. Book choice matters - friendship drama more engaging than generic stories.',
          sentiment: 'joyful'
        },
        {
          timestamp: '2026-01-12 16:45:00',
          context: 'After-school homework meltdown',
          content: 'Emma had meltdown during reading homework. Threw her book and said "I\'m stupid." Homework took 2 hours instead of 20 minutes.',
          user_quote: 'She threw her book and said I\'m stupid. It broke my heart.',
          ai_observation: 'Self-esteem is being affected. Need to address emotional component alongside reading skills.',
          sentiment: 'heartbroken'
        },
        {
          timestamp: '2026-01-10 09:30:00',
          context: 'Morning discussion after teacher email',
          content: 'Teacher Ms. Johnson emailed about concerns with Emma\'s reading comprehension. She can decode words but struggles to remember or explain what she read.',
          user_quote: 'I thought she was doing fine. How did I miss this?',
          ai_observation: 'User\'s initial reaction is guilt. This is common - reading issues often aren\'t obvious until 2nd grade when comprehension demands increase.',
          sentiment: 'guilty'
        }
      ],
      'strategies_tried.md': [
        {
          timestamp: '2026-01-18 19:00:00',
          context: 'Reflecting on what works',
          content: 'Strategies that seem to help: 1) Reading together vs alone, 2) Graphic novels with pictures, 3) Praising effort not results, 4) Taking breaks when frustrated.',
          user_quote: 'The graphic novels seem to be the key. Maybe we pushed chapter books too hard.',
          ai_observation: 'User gaining insight into Emma\'s learning style. Visual supports + lower pressure = better engagement.',
          sentiment: 'thoughtful'
        }
      ]
    }
  },
  
  // =========================================================================
  // FAMILY - Max (10yo, soccer)
  // =========================================================================
  
  'Family/Max_Activities': {
    summary: {
      area_name: "Max's Activities",
      created: '2026-01-08',
      status: 'Active',
      current_situation: `Max (10yo) is in his spring soccer season. He's a midfielder and really enjoying it. Practice is Tuesdays and Thursdays, games on Saturdays. User is proud of his teamwork but struggling to balance both kids' schedules.`,
      timeline_highlights: [
        { date: '2026-01-18', event: 'Max scored first goal of the season!' },
        { date: '2026-01-15', event: 'Schedule conflict with Emma\'s tutor' },
        { date: '2026-01-08', event: 'Spring soccer season started' }
      ],
      ai_notes: `Max is the "easier" kid right now - doing well, self-sufficient. User sometimes feels guilty for not giving him as much attention as Emma. Soccer is his thing and he's thriving.`
    },
    documents: {
      'soccer_season.md': [
        {
          timestamp: '2026-01-18 20:00:00',
          context: 'After Saturday game',
          content: 'Max scored his first goal of the season! He was so proud. The whole team celebrated.',
          user_quote: 'He was beaming. I love seeing him so happy.',
          ai_observation: 'Max\'s win provides positive family moment amid Emma stress. Important to celebrate these.',
          sentiment: 'proud'
        },
        {
          timestamp: '2026-01-15 18:00:00',
          context: 'Schedule discussion',
          content: 'Max has practice same time as Emma\'s tutoring. Trying to figure out logistics.',
          user_quote: 'I can\'t be in two places at once.',
          ai_observation: 'Schedule stress adding to overall overwhelm. May need to involve partner more or find carpool.',
          sentiment: 'stressed'
        }
      ]
    }
  },
  
  // =========================================================================
  // WORK - Startup
  // =========================================================================
  
  'Work/Startup': {
    summary: {
      area_name: 'Startup',
      created: '2026-01-02',
      status: 'Active - High Stress',
      current_situation: `User is founder/CEO of an early-stage startup. Currently in fundraising mode - pitched 8 investors, 2 interested. Need to hire a senior engineer but struggling to find good candidates. Product development is behind schedule. User feels torn between work demands and family time (especially with Emma's struggles).`,
      timeline_highlights: [
        { date: '2026-01-18', event: 'Second investor meeting went well' },
        { date: '2026-01-15', event: 'Rejected by 3 investors same day' },
        { date: '2026-01-12', event: 'First investor showed interest' },
        { date: '2026-01-08', event: 'Posted senior engineer job listing' },
        { date: '2026-01-02', event: 'Started fundraising push' }
      ],
      ai_notes: `User is burning out. Startup stress + Emma stress = overwhelmed. Feels guilty about time away from kids. Partner is supportive but user still feels like they're failing at both work and parenting. Need to help them see they're doing their best.`
    },
    documents: {
      'fundraising.md': [
        {
          timestamp: '2026-01-18 11:00:00',
          context: 'After investor meeting',
          content: 'Second investor meeting went well! They want to see our Q1 numbers before committing but seemed genuinely interested.',
          user_quote: 'I think they actually got what we\'re building.',
          ai_observation: 'Positive momentum after tough week of rejections. User needs wins right now.',
          sentiment: 'hopeful'
        },
        {
          timestamp: '2026-01-15 17:00:00',
          context: 'End of tough day',
          content: 'Got rejected by 3 investors today. One said our market is too small, one wanted more traction, one just ghosted.',
          user_quote: 'Maybe I\'m not cut out for this.',
          ai_observation: 'User is questioning themselves. This is normal founder experience but combined with home stress, it\'s hitting hard.',
          sentiment: 'defeated'
        }
      ],
      'team_hiring.md': [
        {
          timestamp: '2026-01-16 14:00:00',
          context: 'Hiring frustration',
          content: 'Interviewed 5 senior engineer candidates. None felt right. Either too expensive or not senior enough or bad culture fit.',
          user_quote: 'Where are all the good engineers?',
          ai_observation: 'Hiring is another stressor. User may need to adjust expectations or compensation.',
          sentiment: 'frustrated'
        }
      ]
    }
  },
  
  // =========================================================================
  // PERSONAL GROWTH - Exercise
  // =========================================================================
  
  'Personal_Growth/Exercise_Goals': {
    summary: {
      area_name: 'Exercise Goals',
      created: '2026-01-03',
      status: 'Active - Struggling',
      current_situation: `User set goal to run 3x per week. Has been struggling with consistency - averaging about 1x per week. Main barriers: too tired after work, kids' schedules, lack of motivation. Did have one good week mid-January.`,
      timeline_highlights: [
        { date: '2026-01-16', event: 'Ran 3x this week! (first time hitting goal)' },
        { date: '2026-01-10', event: 'Skipped entire week' },
        { date: '2026-01-03', event: 'Set 3x/week running goal' }
      ],
      ai_notes: `Exercise is user's self-care but keeps getting deprioritized. They know it helps their mental health but struggle to make time. The week they hit their goal, they felt noticeably better. Should encourage without adding to their guilt.`
    },
    documents: {
      'running.md': [
        {
          timestamp: '2026-01-16 07:30:00',
          context: 'Morning after good running week',
          content: 'Actually ran 3 times this week! Feel so much better. More energy, sleeping better, handling stress better.',
          user_quote: 'Why do I always forget how good this makes me feel?',
          ai_observation: 'Clear evidence that exercise helps user\'s overall wellbeing. Pattern: when they run, everything else feels more manageable.',
          sentiment: 'energized'
        },
        {
          timestamp: '2026-01-10 21:00:00',
          context: 'End of week reflection',
          content: 'Didn\'t run at all this week. Too tired after work, then Emma\'s homework takes forever, by the time kids are in bed I just want to collapse.',
          user_quote: 'I keep failing at this goal.',
          ai_observation: 'Self-criticism not helping. Need to reframe as "busy week" not "failure". Perhaps morning runs would work better than evening.',
          sentiment: 'disappointed'
        }
      ]
    }
  },
  
  // =========================================================================
  // PERSONAL GROWTH - Mental Health
  // =========================================================================
  
  'Personal_Growth/Mental_Health': {
    summary: {
      area_name: 'Mental Health',
      created: '2026-01-08',
      status: 'Active',
      current_situation: `User is seeing a therapist (Dr. Chen) every other week. Main topics: work-life balance, parenting guilt, burnout prevention. Therapy is helping but user feels like they should be "further along" by now.`,
      timeline_highlights: [
        { date: '2026-01-17', event: 'Therapy session - discussed Emma guilt' },
        { date: '2026-01-08', event: 'Started tracking mental health in BubbleVoice' }
      ],
      ai_notes: `User is self-aware about mental health but still hard on themselves. Therapy is valuable - they process things there and sometimes bring insights here. Dr. Chen sounds like a good fit. User's main pattern: taking on too much, feeling guilty about everything, not asking for help.`
    },
    documents: {
      'therapy_notes.md': [
        {
          timestamp: '2026-01-17 16:00:00',
          context: 'After therapy session',
          content: 'Talked about guilt around Emma with Dr. Chen. She said guilt is "borrowed suffering" - I\'m punishing myself for something that\'s not my fault. Reading issues are common and catching it in 2nd grade is actually early.',
          user_quote: 'Dr. Chen said I\'m being too hard on myself. I know she\'s right but it\'s hard to believe.',
          ai_observation: 'Good insight from therapy. User intellectually understands but emotionally still carries guilt. Consistent message from multiple sources (therapist, me) may help.',
          sentiment: 'reflective'
        }
      ]
    }
  },
  
  // =========================================================================
  // HOME - Renovation
  // =========================================================================
  
  'Home/Kitchen_Renovation': {
    summary: {
      area_name: 'Kitchen Renovation',
      created: '2026-01-06',
      status: 'On Hold',
      current_situation: `User was planning kitchen renovation but put it on hold due to startup fundraising uncertainty and Emma's situation taking priority. Contractor (Mike) is understanding but user feels bad about delaying.`,
      timeline_highlights: [
        { date: '2026-01-14', event: 'Decided to postpone renovation' },
        { date: '2026-01-06', event: 'Got contractor quote ($45K)' }
      ],
      ai_notes: `Kitchen reno is a "nice to have" that got bumped by higher priorities. User made a reasonable decision but still feels guilty (pattern: guilt about everything). This can wait.`
    },
    documents: {
      'planning.md': [
        {
          timestamp: '2026-01-14 12:00:00',
          context: 'Decision to postpone',
          content: 'Decided to put kitchen on hold until we know about fundraising. Too much uncertainty to commit to $45K right now. Mike (contractor) was understanding.',
          user_quote: 'I hate delaying things but it\'s the right call.',
          ai_observation: 'Good prioritization. User can make clear decisions when needed, despite guilt.',
          sentiment: 'resigned'
        }
      ]
    }
  },
  
  // =========================================================================
  // RELATIONSHIPS - Partner
  // =========================================================================
  
  'Relationships/Partner': {
    summary: {
      area_name: 'Partner',
      created: '2026-01-04',
      status: 'Active',
      current_situation: `User's partner (Jordan) is supportive but they haven't had quality time together in weeks. Last date night was 3 weeks ago. Both are exhausted from work and kids. User knows the relationship needs attention but keeps deprioritizing it.`,
      timeline_highlights: [
        { date: '2026-01-18', event: 'Quick dinner together (kids at grandparents)' },
        { date: '2026-01-04', event: 'Talked about needing more date nights' }
      ],
      ai_notes: `Jordan sounds like a great partner - supportive, patient. User appreciates them but feels guilty about not being more present. The relationship is stable but user is aware it needs nurturing. Even small moments of connection help.`
    },
    documents: {
      'quality_time.md': [
        {
          timestamp: '2026-01-18 21:00:00',
          context: 'Evening reflection',
          content: 'Kids were at grandparents for a few hours. Jordan and I actually sat down for dinner together. We talked about real stuff, not just logistics. It was really nice.',
          user_quote: 'I forgot how much I like just talking to Jordan.',
          ai_observation: 'Small moments of connection matter. User and Jordan are solid - just need to protect time together.',
          sentiment: 'connected'
        },
        {
          timestamp: '2026-01-04 22:00:00',
          context: 'Late night conversation',
          content: 'Jordan and I talked about how we\'ve been ships passing in the night. Agreed we need to prioritize date nights but neither of us has bandwidth to plan them.',
          user_quote: 'We both know we need this but we\'re too tired to do anything about it.',
          ai_observation: 'Both partners are aware of the issue. Low-effort connection ideas might help (movie at home, order in, etc).',
          sentiment: 'tired'
        }
      ]
    }
  }
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Initialize the knowledge base by creating all directories and files.
 * This sets up a realistic user's accumulated knowledge for testing.
 */
function initializeKnowledgeBase() {
  console.log('📚 Initializing knowledge base...');
  
  // Create base directories
  if (!fs.existsSync(KNOWLEDGE_BASE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_BASE_DIR, { recursive: true });
  }
  if (!fs.existsSync(LIFE_AREAS_DIR)) {
    fs.mkdirSync(LIFE_AREAS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  }
  
  // Create life areas structure
  for (const [areaPath, areaData] of Object.entries(KNOWLEDGE_BASE)) {
    createArea(areaPath, areaData);
  }
  
  // Create areas index
  createAreasIndex();
  
  console.log('✅ Knowledge base initialized!\n');
  return KNOWLEDGE_BASE_DIR;
}

/**
 * Create a life area with its summary and documents.
 */
function createArea(areaPath, areaData) {
  const fullPath = path.join(LIFE_AREAS_DIR, areaPath);
  
  // Create directory
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  
  // Create _AREA_SUMMARY.md
  const summaryContent = generateAreaSummary(areaData.summary);
  fs.writeFileSync(path.join(fullPath, '_AREA_SUMMARY.md'), summaryContent, 'utf8');
  
  // Create documents with entries
  for (const [docName, entries] of Object.entries(areaData.documents)) {
    const docContent = generateDocument(docName, areaPath, entries);
    fs.writeFileSync(path.join(fullPath, docName), docContent, 'utf8');
  }
  
  console.log(`   Created: ${areaPath} (${Object.keys(areaData.documents).length} documents)`);
}

/**
 * Generate area summary markdown.
 */
function generateAreaSummary(summary) {
  let content = `# ${summary.area_name} - Area Summary\n\n`;
  content += `**Created**: ${summary.created}\n`;
  content += `**Last Updated**: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n`;
  content += `**Status**: ${summary.status}\n\n`;
  content += `---\n\n`;
  content += `## Current Situation\n\n${summary.current_situation}\n\n`;
  content += `---\n\n`;
  content += `## Timeline Highlights\n\n`;
  for (const h of summary.timeline_highlights) {
    content += `- **${h.date}**: ${h.event}\n`;
  }
  content += `\n---\n\n`;
  content += `## AI Notes\n\n${summary.ai_notes}\n`;
  return content;
}

/**
 * Generate document with entries (newest first).
 */
function generateDocument(docName, areaPath, entries) {
  const title = docName.replace('.md', '').replace(/_/g, ' ');
  let content = `# ${title}\n\n`;
  content += `**Area**: ${areaPath}\n`;
  content += `**Document Type**: Time-Ordered Log\n`;
  content += `**Entries**: ${entries.length}\n\n`;
  content += `---\n\n`;
  content += `## Summary (AI-Maintained)\n\n`;
  content += `${entries.length} entries tracking ${title.toLowerCase()}.\n\n`;
  content += `---\n\n`;
  content += `## Entries (Newest First)\n\n`;
  
  // Add entries (already in newest-first order in data)
  for (const entry of entries) {
    content += `### ${entry.timestamp}\n`;
    content += `**Conversation Context**: ${entry.context}\n\n`;
    content += `${entry.content}\n\n`;
    if (entry.user_quote) {
      content += `**User Quote**: "${entry.user_quote}"\n\n`;
    }
    if (entry.ai_observation) {
      content += `**AI Observation**: ${entry.ai_observation}\n\n`;
    }
    content += `**Sentiment**: ${entry.sentiment}\n\n`;
    content += `---\n\n`;
  }
  
  return content;
}

/**
 * Create areas index file.
 */
function createAreasIndex() {
  const areas = Object.keys(KNOWLEDGE_BASE);
  let content = `# Life Areas Index\n\n`;
  content += `**Last Updated**: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}\n\n`;
  content += `## Active Areas (${areas.length})\n\n`;
  
  for (const areaPath of areas) {
    const data = KNOWLEDGE_BASE[areaPath];
    content += `### ${data.summary.area_name}\n`;
    content += `- **Path**: \`${areaPath}\`\n`;
    content += `- **Status**: ${data.summary.status}\n`;
    content += `- **Documents**: ${Object.keys(data.documents).length}\n\n`;
  }
  
  fs.writeFileSync(path.join(LIFE_AREAS_DIR, '_AREAS_INDEX.md'), content, 'utf8');
}

/**
 * Reset knowledge base to initial state.
 * 
 * IMPORTANT: This preserves the conversations folder to maintain conversation history
 * across test runs. Only life areas are reset.
 */
function resetKnowledgeBase() {
  console.log('🔄 Resetting knowledge base...');
  
  // Only remove life_areas folder, preserve conversations
  if (fs.existsSync(LIFE_AREAS_DIR)) {
    fs.rmSync(LIFE_AREAS_DIR, { recursive: true });
  }
  
  // Reinitialize
  initializeKnowledgeBase();
}

/**
 * Get the knowledge base data (for use in tests).
 */
function getKnowledgeBase() {
  return KNOWLEDGE_BASE;
}

/**
 * Generate areas tree string for prompt injection.
 */
function generateAreasTree() {
  let tree = '';
  
  for (const [areaPath, areaData] of Object.entries(KNOWLEDGE_BASE)) {
    const parts = areaPath.split('/');
    const indent = '  '.repeat(parts.length - 1);
    const name = parts[parts.length - 1];
    const docCount = Object.keys(areaData.documents).length;
    const status = areaData.summary.status;
    
    tree += `${indent}- ${name}/ (${docCount} documents, ${status})\n`;
    
    // List documents
    for (const docName of Object.keys(areaData.documents)) {
      const entryCount = areaData.documents[docName].length;
      tree += `${indent}  - ${docName} (${entryCount} entries)\n`;
    }
  }
  
  return tree;
}

// =============================================================================
// EXPORTS
// =============================================================================

function getKnowledgeBasePath() {
  return LIFE_AREAS_DIR;
}

module.exports = {
  initializeKnowledgeBase,
  resetKnowledgeBase,
  getKnowledgeBase,
  getKnowledgeBasePath,
  generateAreasTree,
  KNOWLEDGE_BASE_DIR,
  LIFE_AREAS_DIR,
  CONVERSATIONS_DIR,
  KNOWLEDGE_BASE
};
