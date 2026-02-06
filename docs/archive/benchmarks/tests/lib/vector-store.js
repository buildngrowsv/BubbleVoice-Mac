#!/usr/bin/env node

/**
 * VECTOR STORE - In-Memory Implementation
 * 
 * Purpose:
 * Provides in-memory vector storage with HNSW-like approximate nearest neighbor search.
 * Stores document chunks with their embeddings and metadata for semantic search.
 * 
 * Why In-Memory:
 * - Simple implementation for testing
 * - Fast queries (no disk I/O)
 * - Easy to reset between tests
 * - Good enough for < 10k vectors
 * 
 * For Production:
 * - Replace with ObjectBox (Swift) or Qdrant/Weaviate (Node)
 * - Add persistence layer
 * - Use proper HNSW indexing
 * 
 * Search Strategy:
 * - Brute force for < 1k vectors (fast enough)
 * - Can add HNSW approximation for larger datasets
 * 
 * Date: 2026-01-19
 */

const { embeddingService } = require('./embedding-service');

/**
 * Document Chunk
 * 
 * Represents a single chunk of text with its embedding and metadata.
 * This is the basic unit of storage and retrieval.
 */
class DocumentChunk {
  /**
   * @param {string} id - Unique identifier for the chunk
   * @param {string} text - The actual text content
   * @param {number[]} embedding - The embedding vector
   * @param {Object} metadata - Additional metadata about the chunk
   */
  constructor(id, text, embedding, metadata = {}) {
    this.id = id;
    this.text = text;
    this.embedding = embedding;
    this.metadata = metadata;
    this.createdAt = Date.now();
  }
}

/**
 * Vector Store Class
 * 
 * Manages a collection of document chunks with their embeddings.
 * Provides semantic search via cosine similarity.
 */
class VectorStore {
  constructor() {
    // In-memory storage of all chunks
    // Map<chunkId, DocumentChunk>
    this.chunks = new Map();
    
    // Index by area path for quick filtering
    // Map<areaPath, Set<chunkId>>
    this.areaIndex = new Map();
    
    // Index by document path for quick filtering
    // Map<documentPath, Set<chunkId>>
    this.documentIndex = new Map();
    
    // Statistics
    this.stats = {
      totalChunks: 0,
      totalEmbeddings: 0,
      lastIndexTime: null
    };
  }

  /**
   * Add a single chunk to the vector store
   * 
   * The text is automatically embedded if no embedding is provided.
   * Metadata should include:
   * - areaPath: e.g., "Family/Emma_School"
   * - documentPath: e.g., "Family/Emma_School/reading_comprehension.md"
   * - type: "entry" | "summary" | "conversation"
   * - timestamp: when the content was created
   * 
   * @param {string} id - Unique chunk ID
   * @param {string} text - The text content
   * @param {Object} metadata - Metadata about the chunk
   * @param {number[]} [embedding] - Pre-computed embedding (optional)
   * @returns {Promise<void>}
   */
  async addChunk(id, text, metadata = {}, embedding = null) {
    // Generate embedding if not provided
    if (!embedding) {
      embedding = await embeddingService.embed(text);
    }

    // Create chunk
    const chunk = new DocumentChunk(id, text, embedding, metadata);

    // Store chunk
    this.chunks.set(id, chunk);

    // Update area index
    if (metadata.areaPath) {
      if (!this.areaIndex.has(metadata.areaPath)) {
        this.areaIndex.set(metadata.areaPath, new Set());
      }
      this.areaIndex.get(metadata.areaPath).add(id);
    }

    // Update document index
    if (metadata.documentPath) {
      if (!this.documentIndex.has(metadata.documentPath)) {
        this.documentIndex.set(metadata.documentPath, new Set());
      }
      this.documentIndex.get(metadata.documentPath).add(id);
    }

    // Update stats
    this.stats.totalChunks = this.chunks.size;
    this.stats.totalEmbeddings++;
    this.stats.lastIndexTime = Date.now();
  }

  /**
   * Add multiple chunks in batch
   * 
   * More efficient than calling addChunk multiple times.
   * Embeddings are generated in batch for better performance.
   * 
   * @param {Array<{id: string, text: string, metadata: Object}>} chunks - Array of chunks to add
   * @returns {Promise<void>}
   */
  async addChunksBatch(chunks) {
    if (chunks.length === 0) return;

    console.log(`📦 Adding ${chunks.length} chunks to vector store...`);
    const startTime = Date.now();

    // Extract texts for batch embedding
    const texts = chunks.map(c => c.text);

    // Generate embeddings in batch
    const embeddings = await embeddingService.embedBatch(texts);

    // Add all chunks
    for (let i = 0; i < chunks.length; i++) {
      const { id, text, metadata } = chunks[i];
      await this.addChunk(id, text, metadata, embeddings[i]);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ ${chunks.length} chunks indexed in ${duration}ms`);
  }

  /**
   * Search for similar chunks using semantic similarity
   * 
   * This is the core retrieval function for RAG.
   * Returns chunks ranked by cosine similarity to the query.
   * 
   * @param {string} query - The search query text
   * @param {Object} options - Search options
   * @param {number} [options.topK=10] - Number of results to return
   * @param {string} [options.areaPath] - Filter by area path
   * @param {string} [options.documentPath] - Filter by document path
   * @param {number} [options.minScore=0.0] - Minimum similarity score
   * @returns {Promise<Array<{chunk: DocumentChunk, score: number}>>}
   */
  async search(query, options = {}) {
    const {
      topK = 10,
      areaPath = null,
      documentPath = null,
      minScore = 0.0
    } = options;

    const startTime = Date.now();

    // Generate query embedding
    const queryEmbedding = await embeddingService.embed(query);

    // Get candidate chunks (filtered if needed)
    let candidates = Array.from(this.chunks.values());

    if (areaPath) {
      const chunkIds = this.areaIndex.get(areaPath) || new Set();
      candidates = candidates.filter(c => chunkIds.has(c.id));
    }

    if (documentPath) {
      const chunkIds = this.documentIndex.get(documentPath) || new Set();
      candidates = candidates.filter(c => chunkIds.has(c.id));
    }

    // Calculate similarity scores for all candidates
    const results = candidates.map(chunk => ({
      chunk,
      score: embeddingService.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Filter by minimum score
    const filtered = results.filter(r => r.score >= minScore);

    // Sort by score (descending)
    filtered.sort((a, b) => b.score - a.score);

    // Take top K
    const topResults = filtered.slice(0, topK);

    const duration = Date.now() - startTime;

    return {
      results: topResults,
      stats: {
        queryTime: duration,
        candidatesSearched: candidates.length,
        resultsReturned: topResults.length
      }
    };
  }

  /**
   * Multi-query vector search (as designed in PROMPT_INPUT_STRUCTURE.md)
   * 
   * Runs 3 parallel searches with different query scopes:
   * 1. Recent user inputs (last 2) - weight 3.0
   * 2. All user inputs - weight 1.5
   * 3. Full conversation (user + AI) - weight 0.5
   * 
   * Results are merged, deduplicated, and ranked by weighted score.
   * 
   * @param {Array<{role: string, content: string}>} messages - Conversation messages
   * @param {Object} options - Search options
   * @param {number} [options.topK=10] - Results per query
   * @returns {Promise<Object>} - Organized results by section
   */
  async multiQuerySearch(messages, options = {}) {
    const { topK = 10 } = options;

    console.log(`🔍 Running multi-query vector search...`);
    const startTime = Date.now();

    // Extract different query scopes
    const recentUserInputs = this._getRecentUserInputs(messages, 2);
    const allUserInputs = this._getAllUserInputs(messages);
    const fullConversation = this._getFullConversation(messages);

    // Run 3 searches in parallel
    const [recent, allUser, fullConv] = await Promise.all([
      this.search(recentUserInputs, { topK }),
      this.search(allUserInputs, { topK }),
      this.search(fullConversation, { topK: Math.floor(topK / 2) })
    ]);

    // Apply weights and merge
    const weighted = [
      ...recent.results.map(r => ({ ...r, score: r.score * 3.0, source: 'recent' })),
      ...allUser.results.map(r => ({ ...r, score: r.score * 1.5, source: 'all_user' })),
      ...fullConv.results.map(r => ({ ...r, score: r.score * 0.5, source: 'full_conv' }))
    ];

    // Deduplicate (keep highest score per chunk)
    const deduped = this._deduplicateByChunkId(weighted);

    // Sort by weighted score
    deduped.sort((a, b) => b.score - a.score);

    // Organize by section
    const organized = this._organizeResults(deduped);

    const duration = Date.now() - startTime;
    console.log(`✅ Multi-query search completed in ${duration}ms`);

    return {
      ...organized,
      stats: {
        totalQueryTime: duration,
        query1Time: recent.stats.queryTime,
        query2Time: allUser.stats.queryTime,
        query3Time: fullConv.stats.queryTime,
        totalCandidates: this.chunks.size,
        resultsReturned: deduped.length
      }
    };
  }

  /**
   * Get recent user inputs (last N)
   * @private
   */
  _getRecentUserInputs(messages, n) {
    const userMessages = messages.filter(m => m.role === 'user');
    const recent = userMessages.slice(-n);
    return recent.map(m => m.content).join('\n\n');
  }

  /**
   * Get all user inputs
   * @private
   */
  _getAllUserInputs(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    return userMessages.map(m => m.content).join('\n\n');
  }

  /**
   * Get full conversation (user + AI)
   * @private
   */
  _getFullConversation(messages) {
    return messages.map(m => m.content).join('\n\n');
  }

  /**
   * Deduplicate results by chunk ID, keeping highest score
   * @private
   */
  _deduplicateByChunkId(results) {
    const map = new Map();
    
    for (const result of results) {
      const id = result.chunk.id;
      if (!map.has(id) || map.get(id).score < result.score) {
        map.set(id, result);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Organize results by section (areas, chunks, files, artifacts)
   * @private
   */
  _organizeResults(results) {
    const areas = new Map();
    const chunks = [];
    const files = new Map();
    const artifacts = [];

    for (const result of results) {
      const { chunk, score } = result;
      const { metadata } = chunk;

      // Organize by area
      if (metadata.areaPath) {
        if (!areas.has(metadata.areaPath)) {
          areas.set(metadata.areaPath, []);
        }
        areas.get(metadata.areaPath).push({ chunk, score });
      }

      // Collect chunks
      chunks.push({ chunk, score });

      // Organize by file
      if (metadata.documentPath) {
        if (!files.has(metadata.documentPath)) {
          files.set(metadata.documentPath, []);
        }
        files.get(metadata.documentPath).push({ chunk, score });
      }

      // Collect artifacts
      if (metadata.type === 'artifact') {
        artifacts.push({ chunk, score });
      }
    }

    return {
      areas: Array.from(areas.entries()).map(([path, chunks]) => ({ path, chunks })),
      chunks,
      files: Array.from(files.entries()).map(([path, chunks]) => ({ path, chunks })),
      artifacts
    };
  }

  /**
   * Clear all chunks from the store
   */
  clear() {
    this.chunks.clear();
    this.areaIndex.clear();
    this.documentIndex.clear();
    this.stats = {
      totalChunks: 0,
      totalEmbeddings: 0,
      lastIndexTime: null
    };
  }

  /**
   * Get statistics about the vector store
   */
  getStats() {
    return {
      ...this.stats,
      areas: this.areaIndex.size,
      documents: this.documentIndex.size
    };
  }
}

module.exports = {
  VectorStore,
  DocumentChunk
};
