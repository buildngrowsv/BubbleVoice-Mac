/**
 * VECTOR STORE SERVICE
 * 
 * Purpose:
 * Stores and searches text embeddings for semantic search.
 * Implements hybrid search combining vector similarity, keyword matching,
 * recency boosting, and area boosting.
 * 
 * Storage:
 * - SQLite with vector extension (or custom implementation)
 * - Embeddings stored as JSON blobs
 * - Metadata for filtering and boosting
 * 
 * Search Strategy:
 * - Vector similarity (semantic matching)
 * - Keyword search (exact matches)
 * - Recency boost (recent entries weighted higher)
 * - Area boost (current conversation area weighted higher)
 * 
 * Why Hybrid Search:
 * - Vector alone misses exact matches
 * - Keyword alone misses semantic similarity
 * - Recency ensures fresh context
 * - Area boost maintains conversation focus
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * VectorStoreService Class
 * 
 * Manages embedding storage and hybrid search.
 */
class VectorStoreService {
    /**
     * Constructor
     * 
     * @param {DatabaseService} databaseService - Database service instance
     * @param {EmbeddingService} embeddingService - Embedding service instance
     * 
     * Why we pass EmbeddingService:
     * - Compute query embeddings on the fly
     * - Consistent embedding generation
     * - Easy to swap embedding models
     */
    constructor(databaseService, embeddingService) {
        this.db = databaseService;
        this.embeddingService = embeddingService;
        
        console.log('[VectorStoreService] Initialized');
    }

    /**
     * Initialize Vector Store
     * 
     * Creates embeddings table in database.
     */
    async initialize() {
        try {
            // Create embeddings table
            this.db.db.exec(`
                CREATE TABLE IF NOT EXISTS embeddings (
                    chunk_id TEXT PRIMARY KEY,
                    area_path TEXT,
                    document TEXT,
                    timestamp DATETIME,
                    entry_type TEXT,
                    sentiment TEXT,
                    content TEXT NOT NULL,
                    user_quote TEXT,
                    ai_observation TEXT,
                    embedding TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Create indexes for fast filtering
            this.db.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_embeddings_area 
                ON embeddings(area_path);
                
                CREATE INDEX IF NOT EXISTS idx_embeddings_timestamp 
                ON embeddings(timestamp DESC);
                
                CREATE INDEX IF NOT EXISTS idx_embeddings_sentiment 
                ON embeddings(sentiment);
            `);
            
            console.log('[VectorStoreService] ✅ Vector store initialized');
        } catch (error) {
            console.error('[VectorStoreService] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Store Embedding
     * 
     * Stores a single embedding with metadata.
     * 
     * @param {string} chunkId - Unique chunk ID
     * @param {Array<number>} embedding - Embedding vector
     * @param {object} metadata - Chunk metadata
     * @returns {boolean} Success
     */
    async storeEmbedding(chunkId, embedding, metadata) {
        try {
            const stmt = this.db.db.prepare(`
                INSERT OR REPLACE INTO embeddings (
                    chunk_id, area_path, document, timestamp, entry_type,
                    sentiment, content, user_quote, ai_observation, embedding
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                chunkId,
                metadata.area_path || null,
                metadata.document || null,
                metadata.timestamp || null,
                metadata.entry_type || null,
                metadata.sentiment || null,
                metadata.content || '',
                metadata.user_quote || null,
                metadata.ai_observation || null,
                JSON.stringify(embedding)
            );

            return true;
        } catch (error) {
            console.error('[VectorStoreService] Failed to store embedding:', error);
            throw error;
        }
    }

    /**
     * Store Embeddings (Batch)
     * 
     * Stores multiple embeddings efficiently.
     * 
     * @param {Array<object>} chunks - Array of chunks with embeddings
     * @returns {number} Number stored
     */
    async storeEmbeddings(chunks) {
        try {
            const stmt = this.db.db.prepare(`
                INSERT OR REPLACE INTO embeddings (
                    chunk_id, area_path, document, timestamp, entry_type,
                    sentiment, content, user_quote, ai_observation, embedding
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const transaction = this.db.db.transaction((chunks) => {
                for (const chunk of chunks) {
                    stmt.run(
                        chunk.chunk_id,
                        chunk.area_path || null,
                        chunk.document || null,
                        chunk.timestamp || null,
                        chunk.entry_type || null,
                        chunk.sentiment || null,
                        chunk.content || '',
                        chunk.user_quote || null,
                        chunk.ai_observation || null,
                        JSON.stringify(chunk.embedding)
                    );
                }
            });

            transaction(chunks);

            console.log(`[VectorStoreService] ✅ Stored ${chunks.length} embeddings`);
            return chunks.length;
        } catch (error) {
            console.error('[VectorStoreService] Failed to store embeddings:', error);
            throw error;
        }
    }

    /**
     * Vector Search
     * 
     * Finds similar chunks using cosine similarity.
     * 
     * @param {Array<number>} queryEmbedding - Query embedding vector
     * @param {number} topK - Number of results to return
     * @param {object} filters - Optional filters (area_path, sentiment, etc.)
     * @returns {Array<object>} Array of results with scores
     */
    async vectorSearch(queryEmbedding, topK = 10, filters = {}) {
        try {
            const startTime = Date.now();
            
            // Build WHERE clause from filters
            const whereClauses = [];
            const params = [];
            
            if (filters.area_path) {
                whereClauses.push('area_path = ?');
                params.push(filters.area_path);
            }
            
            if (filters.sentiment) {
                whereClauses.push('sentiment = ?');
                params.push(filters.sentiment);
            }
            
            if (filters.entry_type) {
                whereClauses.push('entry_type = ?');
                params.push(filters.entry_type);
            }
            
            const whereClause = whereClauses.length > 0 
                ? 'WHERE ' + whereClauses.join(' AND ')
                : '';
            
            // Get all embeddings (with filters)
            const stmt = this.db.db.prepare(`
                SELECT * FROM embeddings ${whereClause}
            `);
            
            const rows = stmt.all(...params);
            
            // Compute cosine similarity for each
            const results = rows.map(row => {
                const embedding = JSON.parse(row.embedding);
                const score = this.embeddingService.cosineSimilarity(queryEmbedding, embedding);
                
                return {
                    chunk_id: row.chunk_id,
                    area_path: row.area_path,
                    document: row.document,
                    timestamp: row.timestamp,
                    entry_type: row.entry_type,
                    sentiment: row.sentiment,
                    content: row.content,
                    user_quote: row.user_quote,
                    ai_observation: row.ai_observation,
                    score: score,
                    match_type: 'vector'
                };
            });
            
            // Sort by score and return top K
            results.sort((a, b) => b.score - a.score);
            const topResults = results.slice(0, topK);
            
            const duration = Date.now() - startTime;
            console.log(`[VectorStoreService] Vector search: ${topResults.length} results in ${duration}ms`);
            
            return topResults;
        } catch (error) {
            console.error('[VectorStoreService] Vector search failed:', error);
            throw error;
        }
    }

    /**
     * Keyword Search
     * 
     * Finds chunks containing specific keywords.
     * 
     * @param {string} keywords - Keywords to search for
     * @param {number} topK - Number of results
     * @param {object} filters - Optional filters
     * @returns {Array<object>} Array of results
     */
    async keywordSearch(keywords, topK = 10, filters = {}) {
        try {
            const whereClauses = [`(content LIKE ? OR user_quote LIKE ? OR ai_observation LIKE ?)`];
            const params = [`%${keywords}%`, `%${keywords}%`, `%${keywords}%`];
            
            if (filters.area_path) {
                whereClauses.push('area_path = ?');
                params.push(filters.area_path);
            }
            
            if (filters.sentiment) {
                whereClauses.push('sentiment = ?');
                params.push(filters.sentiment);
            }
            
            const whereClause = 'WHERE ' + whereClauses.join(' AND ');
            
            const stmt = this.db.db.prepare(`
                SELECT * FROM embeddings 
                ${whereClause}
                ORDER BY timestamp DESC
                LIMIT ?
            `);
            
            params.push(topK);
            const rows = stmt.all(...params);
            
            const results = rows.map(row => ({
                chunk_id: row.chunk_id,
                area_path: row.area_path,
                document: row.document,
                timestamp: row.timestamp,
                entry_type: row.entry_type,
                sentiment: row.sentiment,
                content: row.content,
                user_quote: row.user_quote,
                ai_observation: row.ai_observation,
                score: 1.0, // Keyword match gets perfect score
                match_type: 'keyword'
            }));
            
            console.log(`[VectorStoreService] Keyword search: ${results.length} results`);
            return results;
        } catch (error) {
            console.error('[VectorStoreService] Keyword search failed:', error);
            throw error;
        }
    }

    /**
     * Hybrid Search
     * 
     * Combines vector search and keyword search with configurable weights.
     * 
     * @param {string} queryText - Query text
     * @param {object} config - Search configuration
     * @returns {Array<object>} Merged and ranked results
     * 
     * Config:
     * - vectorWeight: Weight for vector similarity (default: 0.7)
     * - keywordWeight: Weight for keyword matches (default: 0.3)
     * - topK: Number of results (default: 10)
     * - filters: Area/sentiment filters
     */
    async hybridSearch(queryText, config = {}) {
        try {
            const {
                vectorWeight = 0.7,
                keywordWeight = 0.3,
                topK = 10,
                filters = {}
            } = config;
            
            const startTime = Date.now();
            
            // Generate query embedding
            const queryEmbedding = await this.embeddingService.generateEmbedding(queryText);
            
            // Run both searches in parallel
            const [vectorResults, keywordResults] = await Promise.all([
                this.vectorSearch(queryEmbedding, topK * 2, filters),
                this.keywordSearch(queryText, topK * 2, filters)
            ]);
            
            // Merge results with weights
            const merged = this.mergeResults(
                vectorResults,
                keywordResults,
                vectorWeight,
                keywordWeight
            );
            
            // Sort by weighted score and return top K
            merged.sort((a, b) => b.weighted_score - a.weighted_score);
            const topResults = merged.slice(0, topK);
            
            const duration = Date.now() - startTime;
            console.log(`[VectorStoreService] Hybrid search: ${topResults.length} results in ${duration}ms`);
            
            return topResults;
        } catch (error) {
            console.error('[VectorStoreService] Hybrid search failed:', error);
            throw error;
        }
    }

    /**
     * Merge Results
     * 
     * Merges vector and keyword results, deduplicates, and applies weights.
     * 
     * @param {Array} vectorResults - Vector search results
     * @param {Array} keywordResults - Keyword search results
     * @param {number} vectorWeight - Vector weight
     * @param {number} keywordWeight - Keyword weight
     * @returns {Array} Merged results
     */
    mergeResults(vectorResults, keywordResults, vectorWeight, keywordWeight) {
        const resultsMap = new Map();
        
        // Add vector results
        vectorResults.forEach(result => {
            resultsMap.set(result.chunk_id, {
                ...result,
                vector_score: result.score,
                keyword_score: 0,
                weighted_score: result.score * vectorWeight
            });
        });
        
        // Merge keyword results
        keywordResults.forEach(result => {
            if (resultsMap.has(result.chunk_id)) {
                // Already exists from vector search
                const existing = resultsMap.get(result.chunk_id);
                existing.keyword_score = result.score;
                existing.weighted_score = (existing.vector_score * vectorWeight) + (result.score * keywordWeight);
                existing.match_type = 'hybrid';
            } else {
                // New result from keyword search only
                resultsMap.set(result.chunk_id, {
                    ...result,
                    vector_score: 0,
                    keyword_score: result.score,
                    weighted_score: result.score * keywordWeight
                });
            }
        });
        
        return Array.from(resultsMap.values());
    }

    /**
     * Apply Recency Boost
     * 
     * Boosts scores for recent entries using exponential decay.
     * 
     * @param {Array} results - Search results
     * @param {number} decayFactor - Decay rate (default: 0.05)
     * @returns {Array} Results with recency boost applied
     * 
     * Formula: boosted_score = base_score * e^(-age_days * decayFactor)
     * 
     * Examples:
     * - 1 day old: boost = 0.95 (5% decay)
     * - 7 days old: boost = 0.70 (30% decay)
     * - 30 days old: boost = 0.22 (78% decay)
     */
    applyRecencyBoost(results, decayFactor = 0.05) {
        const now = new Date();
        
        return results.map(result => {
            if (!result.timestamp) {
                return result;
            }
            
            const entryDate = new Date(result.timestamp);
            const ageDays = (now - entryDate) / (1000 * 60 * 60 * 24);
            
            // Exponential decay
            const recencyMultiplier = Math.exp(-ageDays * decayFactor);
            
            return {
                ...result,
                recency_multiplier: recencyMultiplier,
                boosted_score: result.weighted_score * recencyMultiplier
            };
        });
    }

    /**
     * Apply Area Boost
     * 
     * Boosts scores for entries from current conversation area.
     * 
     * @param {Array} results - Search results
     * @param {string} currentAreaPath - Current area path
     * @param {number} boostFactor - Boost multiplier (default: 1.5)
     * @returns {Array} Results with area boost applied
     * 
     * Why area boost:
     * - Keeps conversation focused on current topic
     * - Prevents context switching
     * - User expects continuity within area
     */
    applyAreaBoost(results, currentAreaPath, boostFactor = 1.5) {
        if (!currentAreaPath) {
            return results;
        }
        
        return results.map(result => {
            const isCurrentArea = result.area_path === currentAreaPath;
            const multiplier = isCurrentArea ? boostFactor : 1.0;
            
            return {
                ...result,
                area_multiplier: multiplier,
                final_score: (result.boosted_score || result.weighted_score) * multiplier
            };
        });
    }

    /**
     * Delete Embedding
     * 
     * Deletes a single embedding.
     * 
     * @param {string} chunkId - Chunk ID
     * @returns {boolean} Success
     */
    async deleteEmbedding(chunkId) {
        try {
            const stmt = this.db.db.prepare(`
                DELETE FROM embeddings WHERE chunk_id = ?
            `);

            const result = stmt.run(chunkId);
            return result.changes > 0;
        } catch (error) {
            console.error('[VectorStoreService] Failed to delete embedding:', error);
            throw error;
        }
    }

    /**
     * Delete by Area
     * 
     * Deletes all embeddings for an area.
     * 
     * @param {string} areaPath - Area path
     * @returns {number} Number deleted
     */
    async deleteByArea(areaPath) {
        try {
            const stmt = this.db.db.prepare(`
                DELETE FROM embeddings WHERE area_path = ?
            `);

            const result = stmt.run(areaPath);
            
            console.log(`[VectorStoreService] Deleted ${result.changes} embeddings for ${areaPath}`);
            return result.changes;
        } catch (error) {
            console.error('[VectorStoreService] Failed to delete by area:', error);
            throw error;
        }
    }

    /**
     * Get Embedding Count
     * 
     * Returns total number of stored embeddings.
     * 
     * @returns {number} Count
     */
    getEmbeddingCount() {
        try {
            const stmt = this.db.db.prepare(`
                SELECT COUNT(*) as count FROM embeddings
            `);

            const result = stmt.get();
            return result.count;
        } catch (error) {
            console.error('[VectorStoreService] Failed to get count:', error);
            return 0;
        }
    }
}

module.exports = VectorStoreService;
