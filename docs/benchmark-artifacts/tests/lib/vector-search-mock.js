/**
 * vector-search-mock.js
 * 
 * Mock vector search for testing purposes.
 * Uses keyword matching instead of actual embeddings.
 * 
 * In production, this would be replaced with:
 * - MLX local embeddings
 * - Vector database (ObjectBox, SQLite with vector extension)
 * - Proper semantic similarity
 * 
 * This mock allows us to test the architecture without the embedding setup.
 */

const { KNOWLEDGE_BASE } = require('./knowledge-base-manager');

// =============================================================================
// KEYWORD INDEX
// =============================================================================

/**
 * Build keyword index from knowledge base.
 * Maps keywords to relevant areas/entries.
 */
const KEYWORD_INDEX = {
  // Emma/reading related
  'emma': ['Family/Emma_School'],
  'reading': ['Family/Emma_School'],
  'comprehension': ['Family/Emma_School'],
  'book': ['Family/Emma_School'],
  'graphic novel': ['Family/Emma_School'],
  'dog man': ['Family/Emma_School'],
  'teacher': ['Family/Emma_School'],
  'school': ['Family/Emma_School'],
  'homework': ['Family/Emma_School'],
  'learning': ['Family/Emma_School'],
  'testing': ['Family/Emma_School'],
  'dyslexia': ['Family/Emma_School'],
  'stupid': ['Family/Emma_School'],
  
  // Max/soccer related
  'max': ['Family/Max_Activities'],
  'soccer': ['Family/Max_Activities'],
  'practice': ['Family/Max_Activities'],
  'game': ['Family/Max_Activities'],
  'goal': ['Family/Max_Activities', 'Personal_Growth/Exercise_Goals'],
  'score': ['Family/Max_Activities'],
  
  // Work/startup related
  'startup': ['Work/Startup'],
  'work': ['Work/Startup'],
  'investor': ['Work/Startup'],
  'fundraising': ['Work/Startup'],
  'funding': ['Work/Startup'],
  'hiring': ['Work/Startup'],
  'engineer': ['Work/Startup'],
  'team': ['Work/Startup'],
  'product': ['Work/Startup'],
  'rejection': ['Work/Startup'],
  'founder': ['Work/Startup'],
  
  // Exercise related
  'exercise': ['Personal_Growth/Exercise_Goals'],
  'running': ['Personal_Growth/Exercise_Goals'],
  'run': ['Personal_Growth/Exercise_Goals'],
  'fitness': ['Personal_Growth/Exercise_Goals'],
  'tired': ['Personal_Growth/Exercise_Goals'],
  'exhausted': ['Personal_Growth/Exercise_Goals', 'Work/Startup'],
  
  // Mental health related
  'therapy': ['Personal_Growth/Mental_Health'],
  'therapist': ['Personal_Growth/Mental_Health'],
  'mental': ['Personal_Growth/Mental_Health'],
  'stress': ['Personal_Growth/Mental_Health', 'Work/Startup'],
  'burnout': ['Personal_Growth/Mental_Health'],
  'guilt': ['Personal_Growth/Mental_Health', 'Family/Emma_School'],
  'dr. chen': ['Personal_Growth/Mental_Health'],
  
  // Home related
  'kitchen': ['Home/Kitchen_Renovation'],
  'renovation': ['Home/Kitchen_Renovation'],
  'contractor': ['Home/Kitchen_Renovation'],
  'house': ['Home/Kitchen_Renovation'],
  
  // Relationships related
  'partner': ['Relationships/Partner'],
  'jordan': ['Relationships/Partner'],
  'date': ['Relationships/Partner'],
  'relationship': ['Relationships/Partner'],
  'marriage': ['Relationships/Partner'],
  'spouse': ['Relationships/Partner'],
  
  // Emotional keywords
  'worried': ['Family/Emma_School', 'Work/Startup'],
  'anxious': ['Family/Emma_School', 'Personal_Growth/Mental_Health'],
  'frustrated': ['Family/Emma_School', 'Work/Startup'],
  'proud': ['Family/Max_Activities'],
  'hopeful': ['Family/Emma_School', 'Work/Startup'],
  'overwhelmed': ['Work/Startup', 'Personal_Growth/Mental_Health'],
  'guilty': ['Family/Emma_School', 'Personal_Growth/Mental_Health']
};

// =============================================================================
// SIMPLE VECTOR SEARCH (For Simple Runner)
// =============================================================================

/**
 * Simple keyword-based search on current input only.
 * Returns formatted context string.
 * 
 * @param {string} query - Current user input
 * @returns {string} - Formatted context for prompt
 */
function simpleVectorSearch(query) {
  const queryLower = query.toLowerCase();
  const matchedAreas = new Set();
  
  // Find matching areas
  for (const [keyword, areas] of Object.entries(KEYWORD_INDEX)) {
    if (queryLower.includes(keyword)) {
      areas.forEach(a => matchedAreas.add(a));
    }
  }
  
  if (matchedAreas.size === 0) {
    return 'No directly relevant past conversations found.';
  }
  
  // Build context from matched areas
  let context = '';
  const areasArray = Array.from(matchedAreas).slice(0, 3); // Top 3 areas
  
  for (const areaPath of areasArray) {
    const areaData = KNOWLEDGE_BASE[areaPath];
    if (!areaData) continue;
    
    context += `\n[${areaPath}]\n`;
    context += `Status: ${areaData.summary.status}\n`;
    context += `Summary: ${areaData.summary.current_situation.substring(0, 200)}...\n`;
    
    // Get most recent entry
    const firstDoc = Object.keys(areaData.documents)[0];
    if (firstDoc && areaData.documents[firstDoc].length > 0) {
      const recentEntry = areaData.documents[firstDoc][0];
      context += `Recent: ${recentEntry.content.substring(0, 150)}...\n`;
    }
  }
  
  return context;
}

// =============================================================================
// MULTI-QUERY VECTOR SEARCH (For Full Runner)
// =============================================================================

/**
 * Multi-query search with weighted scoring.
 * 
 * Query 1: Last 2 user responses (weight: 3x)
 * Query 2: All user inputs (weight: 1.5x)
 * Query 3: Full conversation (weight: 0.5x)
 * 
 * @param {Array} messages - Full conversation history
 * @returns {Object} - Structured search results
 */
function multiQueryVectorSearch(messages) {
  // Extract queries
  const userMessages = messages.filter(m => m.role === 'user');
  const recentUser = userMessages.slice(-2).map(m => m.content).join(' ');
  const allUser = userMessages.map(m => m.content).join(' ');
  const fullConv = messages.map(m => m.content).join(' ');
  
  // Run searches
  const results1 = keywordSearch(recentUser, 3.0);
  const results2 = keywordSearch(allUser, 1.5);
  const results3 = keywordSearch(fullConv, 0.5);
  
  // Merge and deduplicate
  const merged = mergeResults([results1, results2, results3]);
  
  return {
    areas: merged.areas.slice(0, 5),
    chunks: merged.chunks.slice(0, 10),
    files: merged.files.slice(0, 10)
  };
}

/**
 * Keyword-based search with scoring.
 */
function keywordSearch(text, weight) {
  const textLower = text.toLowerCase();
  const areaScores = {};
  
  // Score areas by keyword matches
  for (const [keyword, areas] of Object.entries(KEYWORD_INDEX)) {
    if (textLower.includes(keyword)) {
      for (const area of areas) {
        areaScores[area] = (areaScores[area] || 0) + weight;
      }
    }
  }
  
  // Convert to sorted array
  const sortedAreas = Object.entries(areaScores)
    .sort((a, b) => b[1] - a[1])
    .map(([area, score]) => ({ area, score }));
  
  // Build chunks from top areas
  const chunks = [];
  for (const { area, score } of sortedAreas.slice(0, 5)) {
    const areaData = KNOWLEDGE_BASE[area];
    if (!areaData) continue;
    
    // Add summary as chunk
    chunks.push({
      area,
      type: 'summary',
      content: areaData.summary.current_situation,
      score
    });
    
    // Add recent entries as chunks
    for (const [docName, entries] of Object.entries(areaData.documents)) {
      for (const entry of entries.slice(0, 2)) {
        chunks.push({
          area,
          document: docName,
          type: 'entry',
          timestamp: entry.timestamp,
          content: entry.content,
          user_quote: entry.user_quote,
          sentiment: entry.sentiment,
          score: score * 0.8 // Slightly lower than summary
        });
      }
    }
  }
  
  // Build files list
  const files = [];
  for (const { area, score } of sortedAreas) {
    const areaData = KNOWLEDGE_BASE[area];
    if (!areaData) continue;
    
    files.push({
      path: `${area}/_AREA_SUMMARY.md`,
      type: 'MD',
      description: `Summary of ${areaData.summary.area_name}`,
      score
    });
    
    for (const docName of Object.keys(areaData.documents)) {
      files.push({
        path: `${area}/${docName}`,
        type: 'MD',
        description: `Entries for ${docName.replace('.md', '').replace(/_/g, ' ')}`,
        score: score * 0.9
      });
    }
  }
  
  return { areas: sortedAreas, chunks, files };
}

/**
 * Merge multiple search results with deduplication.
 */
function mergeResults(resultSets) {
  const areaMap = new Map();
  const chunkMap = new Map();
  const fileMap = new Map();
  
  for (const results of resultSets) {
    // Merge areas
    for (const item of results.areas) {
      const existing = areaMap.get(item.area);
      if (!existing || item.score > existing.score) {
        areaMap.set(item.area, item);
      }
    }
    
    // Merge chunks
    for (const item of results.chunks) {
      const key = `${item.area}:${item.type}:${item.timestamp || 'summary'}`;
      const existing = chunkMap.get(key);
      if (!existing || item.score > existing.score) {
        chunkMap.set(key, item);
      }
    }
    
    // Merge files
    for (const item of results.files) {
      const existing = fileMap.get(item.path);
      if (!existing || item.score > existing.score) {
        fileMap.set(item.path, item);
      }
    }
  }
  
  return {
    areas: Array.from(areaMap.values()).sort((a, b) => b.score - a.score),
    chunks: Array.from(chunkMap.values()).sort((a, b) => b.score - a.score),
    files: Array.from(fileMap.values()).sort((a, b) => b.score - a.score)
  };
}

/**
 * Format vector results for prompt injection.
 */
function formatVectorResults(results) {
  let recentEntries = '';
  let summaries = '';
  let chunks = '';
  let files = '';
  
  // Format recent entries
  const entryChunks = results.chunks.filter(c => c.type === 'entry').slice(0, 5);
  if (entryChunks.length > 0) {
    for (const chunk of entryChunks) {
      recentEntries += `[${chunk.area}/${chunk.document}] ${chunk.timestamp}\n`;
      recentEntries += `${chunk.content}\n`;
      if (chunk.user_quote) recentEntries += `User said: "${chunk.user_quote}"\n`;
      recentEntries += `Sentiment: ${chunk.sentiment}\n\n`;
    }
  } else {
    recentEntries = 'No recent entries matched.';
  }
  
  // Format summaries
  const summaryChunks = results.chunks.filter(c => c.type === 'summary').slice(0, 3);
  if (summaryChunks.length > 0) {
    for (const chunk of summaryChunks) {
      summaries += `[${chunk.area}]\n${chunk.content}\n\n`;
    }
  } else {
    summaries = 'No area summaries matched.';
  }
  
  // Format all chunks
  if (results.chunks.length > 0) {
    for (const chunk of results.chunks.slice(0, 8)) {
      chunks += `[Score: ${chunk.score.toFixed(1)}] ${chunk.area}`;
      if (chunk.document) chunks += `/${chunk.document}`;
      chunks += `\n${chunk.content.substring(0, 150)}...\n\n`;
    }
  } else {
    chunks = 'No semantic matches found.';
  }
  
  // Format files
  if (results.files.length > 0) {
    for (const file of results.files.slice(0, 8)) {
      files += `[${file.type}] ${file.path}\n`;
      files += `    ${file.description}\n`;
    }
  } else {
    files = 'No relevant files found.';
  }
  
  return { recentEntries, summaries, chunks, files };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  simpleVectorSearch,
  multiQueryVectorSearch,
  formatVectorResults,
  KEYWORD_INDEX
};
