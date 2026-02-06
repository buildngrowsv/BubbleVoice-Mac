#!/usr/bin/env node

/**
 * VECTOR SEARCH - Real Embedding-Based Implementation
 * 
 * Purpose:
 * Real vector search implementation using embeddings for semantic similarity.
 * Replaces the keyword-based mock with actual semantic search.
 * 
 * How it works:
 * 1. Load knowledge base documents
 * 2. Chunk documents into smaller pieces
 * 3. Generate embeddings for each chunk
 * 4. Store in vector store
 * 5. Search using cosine similarity
 * 
 * Performance:
 * - First load: ~10-30s (downloads embedding model)
 * - Subsequent loads: <1s (model cached)
 * - Search: ~50-200ms (depends on corpus size)
 * 
 * Date: 2026-01-19
 */

const { VectorStore } = require('./vector-store');
const { ChunkingService } = require('./chunking-service');
const { embeddingService } = require('./embedding-service');
const { KNOWLEDGE_BASE } = require('./knowledge-base-manager');
const fs = require('fs').promises;
const path = require('path');

// =============================================================================
// VECTOR SEARCH SERVICE
// =============================================================================

/**
 * Vector Search Service
 * 
 * Manages the vector store and provides search functionality.
 * Singleton pattern ensures knowledge base is indexed only once.
 */
class VectorSearchService {
  constructor() {
    this.vectorStore = new VectorStore();
    this.chunkingService = new ChunkingService();
    this.isIndexed = false;
    this.indexPromise = null;
  }

  /**
   * Index the knowledge base
   * 
   * This must be called before searching.
   * Chunks all documents and generates embeddings.
   * 
   * @param {string} knowledgeBasePath - Path to knowledge base
   * @returns {Promise<void>}
   */
  async indexKnowledgeBase(knowledgeBasePath) {
    if (this.isIndexed) {
      return;
    }

    if (this.indexPromise) {
      return this.indexPromise;
    }

    this.indexPromise = this._performIndexing(knowledgeBasePath);
    await this.indexPromise;
    this.isIndexed = true;
    this.indexPromise = null;
  }

  /**
   * Internal indexing implementation
   * @private
   */
  async _performIndexing(knowledgeBasePath) {
    console.log('\n🔧 Initializing vector search with real embeddings...');
    const startTime = Date.now();

    try {
      // Ensure embedding model is loaded
      await embeddingService.load();

      // Read and chunk all documents
      const chunks = await this._chunkKnowledgeBase(knowledgeBasePath);

      if (chunks.length === 0) {
        console.log('⚠️  No chunks generated from knowledge base');
        return;
      }

      // Index all chunks (generates embeddings in batch)
      await this.vectorStore.addChunksBatch(chunks);

      const duration = Date.now() - startTime;
      const stats = this.vectorStore.getStats();
      
      console.log(`✅ Vector search indexed in ${(duration / 1000).toFixed(1)}s`);
      console.log(`   📊 ${stats.totalChunks} chunks across ${stats.areas} areas`);
    } catch (error) {
      console.error(`❌ Failed to index knowledge base: ${error.message}`);
      throw error;
    }
  }

  /**
   * Chunk the knowledge base
   * @private
   */
  async _chunkKnowledgeBase(knowledgeBasePath) {
    const chunks = [];

    // Try to read from disk first
    try {
      const areas = await fs.readdir(knowledgeBasePath);

      // Recursively process all directories and files
      async function processDirectory(dirPath, relativePath = '') {
        const entries = await fs.readdir(dirPath);
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          const stat = await fs.stat(fullPath);
          
          if (stat.isDirectory()) {
            // Recurse into subdirectory
            await processDirectory(fullPath, relativePath ? `${relativePath}/${entry}` : entry);
          } else if (entry.endsWith('.md')) {
            // Process markdown file
            const content = await fs.readFile(fullPath, 'utf-8');
            const areaPath = relativePath || entry.replace('.md', '');
            
            // Determine chunking strategy
            let fileChunks;
            if (entry === '_AREA_SUMMARY.md') {
              fileChunks = this.chunkingService.chunkSummary(
                areaPath,
                content,
                { areaPath }
              );
            } else {
              fileChunks = this.chunkingService.chunkDocument(
                `${areaPath}/${entry}`,
                content,
                { areaPath, documentPath: `${areaPath}/${entry}` }
              );
            }

            chunks.push(...fileChunks);
          }
        }
      }
      
      await processDirectory(knowledgeBasePath);
    } catch (error) {
      // Failed to read from disk, use in-memory knowledge base
      console.log(`   Using in-memory knowledge base (disk read failed: ${error.message})`);
      
      // Get in-memory knowledge base
      const kb = KNOWLEDGE_BASE;
      
      for (const [areaPath, areaData] of Object.entries(kb)) {
        for (const [docName, docData] of Object.entries(areaData)) {
          let content = '';
          
          // Handle different document structures
          if (docName === 'summary') {
            // Summary is an object with fields
            content = `# ${docData.area_name || areaPath}\n\n`;
            if (docData.current_situation) content += `${docData.current_situation}\n\n`;
            if (docData.ai_notes) content += `AI Notes: ${docData.ai_notes}\n\n`;
            if (docData.timeline_highlights) {
              content += '## Timeline:\n';
              docData.timeline_highlights.forEach(h => {
                content += `- ${h.date}: ${h.event}\n`;
              });
            }
          } else if (docName === 'documents') {
            // Documents is an object of document name -> entries array
            for (const [fileName, entries] of Object.entries(docData)) {
              if (Array.isArray(entries)) {
                const entryTexts = entries.map(entry => {
                  let text = '';
                  if (entry.timestamp) text += `**${entry.timestamp}**\n\n`;
                  if (entry.context) text += `${entry.context}\n\n`;
                  if (entry.content) text += `${entry.content}\n`;
                  if (entry.user_quote) text += `\nUser: "${entry.user_quote}"\n`;
                  if (entry.ai_observation) text += `\nAI: ${entry.ai_observation}\n`;
                  if (entry.sentiment) text += `\n*Sentiment: ${entry.sentiment}*\n`;
                  return text;
                }).join('\n---\n\n');
                
                // Chunk this document
                const fileChunks = this.chunkingService.chunkDocument(
                  `${areaPath}/${fileName}`,
                  entryTexts,
                  { areaPath, documentPath: `${areaPath}/${fileName}` }
                );
                chunks.push(...fileChunks);
              }
            }
            continue; // Skip the outer chunking since we handled it above
          } else if (Array.isArray(docData)) {
            // Array of entries
            content = docData.map(entry => {
              let text = '';
              if (entry.timestamp) text += `**${entry.timestamp}**\n\n`;
              if (entry.context) text += `${entry.context}\n\n`;
              if (entry.content) text += `${entry.content}\n`;
              if (entry.sentiment) text += `\n*Sentiment: ${entry.sentiment}*\n`;
              return text;
            }).join('\n---\n\n');
          }

          // Chunk the document (if not already handled)
          if (content && docName !== 'documents') {
            const fileChunks = this.chunkingService.chunkDocument(
              `${areaPath}/${docName}`,
              content,
              { areaPath, documentPath: `${areaPath}/${docName}` }
            );
            chunks.push(...fileChunks);
          }
        }
      }
    }

    return chunks;
  }

  /**
   * Search for similar content
   * 
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Search results
   */
  async search(query, options = {}) {
    if (!this.isIndexed) {
      throw new Error('Knowledge base not indexed. Call indexKnowledgeBase() first.');
    }

    return await this.vectorStore.search(query, options);
  }

  /**
   * Multi-query search (3 parallel queries with different weights)
   * 
   * @param {Array} messages - Conversation messages
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Organized search results
   */
  async multiQuerySearch(messages, options = {}) {
    if (!this.isIndexed) {
      throw new Error('Knowledge base not indexed. Call indexKnowledgeBase() first.');
    }

    return await this.vectorStore.multiQuerySearch(messages, options);
  }

  /**
   * Clear the vector store
   */
  clear() {
    this.vectorStore.clear();
    this.isIndexed = false;
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.vectorStore.getStats();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

const vectorSearchService = new VectorSearchService();

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Vector search function (compatible with existing mock API)
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Search results
 */
async function vectorSearch(query, options = {}) {
  const { topK = 10 } = options;
  
  const result = await vectorSearchService.search(query, { topK });
  
  // Format results to match mock API
  return result.results.map(r => ({
    areaPath: r.chunk.metadata.areaPath,
    documentPath: r.chunk.metadata.documentPath,
    text: r.chunk.text,
    score: r.score,
    metadata: r.chunk.metadata
  }));
}

module.exports = {
  vectorSearch,
  vectorSearchService,
  VectorSearchService
};
