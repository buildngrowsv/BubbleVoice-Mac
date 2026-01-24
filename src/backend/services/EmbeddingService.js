/**
 * EMBEDDING SERVICE
 * 
 * Purpose:
 * Generates text embeddings locally using Transformers.js for semantic search.
 * Enables vector similarity search across conversations and life areas.
 * 
 * Technology:
 * - Transformers.js (Hugging Face's WebAssembly-based library)
 * - Model: Xenova/all-MiniLM-L6-v2 (384 dimensions, optimized for sentences)
 * - Runs locally (no API calls, no internet required)
 * - Fast enough for real-time use (<100ms per embedding)
 * 
 * Why Local Embeddings:
 * - Privacy: User data never leaves device
 * - Cost: No API fees
 * - Speed: No network latency
 * - Offline: Works without internet
 * 
 * Chunking Strategy:
 * - Chunk by entry (not arbitrary tokens)
 * - Preserves semantic boundaries
 * - Each entry = 1 chunk with metadata
 * 
 * Created: 2026-01-24
 * Part of: Artifacts & User Data Management System
 */

const { pipeline } = require('@xenova/transformers');

/**
 * EmbeddingService Class
 * 
 * Manages text embedding generation for semantic search.
 */
class EmbeddingService {
    /**
     * Constructor
     * 
     * @param {string} modelName - Embedding model name (default: Xenova/all-MiniLM-L6-v2)
     * 
     * Why all-MiniLM-L6-v2:
     * - Optimized for sentence similarity
     * - 384 dimensions (good balance of speed vs quality)
     * - Max 256 tokens per input
     * - Fast inference (<100ms)
     * - Well-tested and reliable
     */
    constructor(modelName = 'Xenova/all-MiniLM-L6-v2') {
        this.modelName = modelName;
        this.embedder = null;
        this.isInitialized = false;
        this.embeddingDimension = 384; // all-MiniLM-L6-v2 dimension
        
        console.log(`[EmbeddingService] Initialized with model: ${modelName}`);
    }

    /**
     * Initialize Embedding Model
     * 
     * Loads the model into memory. This takes a few seconds on first run
     * as the model is downloaded and cached.
     * 
     * @returns {Promise<void>}
     * 
     * Why lazy initialization:
     * - Model download takes time (~50MB)
     * - Only load if embeddings are actually needed
     * - Allows app to start faster
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('[EmbeddingService] Already initialized');
            return;
        }

        try {
            console.log('[EmbeddingService] Loading embedding model...');
            console.log('[EmbeddingService] (First run may take 30-60s to download model)');
            
            const startTime = Date.now();
            
            // Create feature extraction pipeline
            // pooling: 'mean' - Average all token embeddings
            // normalize: true - L2 normalization for cosine similarity
            this.embedder = await pipeline('feature-extraction', this.modelName);
            
            const loadTime = Date.now() - startTime;
            
            this.isInitialized = true;
            console.log(`[EmbeddingService] ✅ Model loaded in ${loadTime}ms`);
        } catch (error) {
            console.error('[EmbeddingService] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Generate Embedding
     * 
     * Generates embedding vector for a single text.
     * 
     * @param {string} text - Text to embed
     * @returns {Promise<Array<number>>} Embedding vector (384 dimensions)
     * 
     * Performance:
     * - First call: ~100-200ms (model warmup)
     * - Subsequent calls: ~20-50ms
     * - Batch calls: ~10-20ms per text
     */
    async generateEmbedding(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const startTime = Date.now();
            
            // Generate embedding with mean pooling and normalization
            const output = await this.embedder(text, {
                pooling: 'mean',
                normalize: true
            });
            
            const embedding = Array.from(output.data);
            
            const duration = Date.now() - startTime;
            console.log(`[EmbeddingService] Generated embedding in ${duration}ms (${embedding.length} dims)`);
            
            return embedding;
        } catch (error) {
            console.error('[EmbeddingService] Failed to generate embedding:', error);
            throw error;
        }
    }

    /**
     * Generate Batch Embeddings
     * 
     * Generates embeddings for multiple texts efficiently.
     * Much faster than calling generateEmbedding() in a loop.
     * 
     * @param {Array<string>} texts - Array of texts to embed
     * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
     * 
     * Performance:
     * - ~10-20ms per text in batch (vs 20-50ms individually)
     * - Batch of 10: ~100-200ms total
     * - Batch of 100: ~1-2 seconds total
     */
    async generateBatchEmbeddings(texts) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            const startTime = Date.now();
            
            // Generate embeddings in batch
            const output = await this.embedder(texts, {
                pooling: 'mean',
                normalize: true
            });
            
            // Convert to array of arrays
            let embeddings;
            if (texts.length === 1) {
                // Single text returns flat array
                embeddings = [Array.from(output.data)];
            } else {
                // Multiple texts return 2D array
                embeddings = Array.from(output.data).map((_, i) => {
                    const start = i * this.embeddingDimension;
                    const end = start + this.embeddingDimension;
                    return Array.from(output.data).slice(start, end);
                });
            }
            
            const duration = Date.now() - startTime;
            const avgTime = duration / texts.length;
            
            console.log(`[EmbeddingService] Generated ${texts.length} embeddings in ${duration}ms (${avgTime.toFixed(1)}ms avg)`);
            
            return embeddings;
        } catch (error) {
            console.error('[EmbeddingService] Failed to generate batch embeddings:', error);
            throw error;
        }
    }

    /**
     * Get Embedding Dimension
     * 
     * @returns {number} Embedding vector dimension
     */
    getEmbeddingDimension() {
        return this.embeddingDimension;
    }

    /**
     * Chunk by Entry
     * 
     * Chunks a document by entries (not arbitrary tokens).
     * Each entry becomes one chunk with metadata.
     * 
     * @param {string} documentContent - Full document content
     * @param {string} areaPath - Area path
     * @param {string} documentName - Document name
     * @returns {Array<object>} Array of chunks with metadata
     * 
     * Why chunk by entry:
     * - Entries are semantic units (complete thoughts)
     * - Preserves conversation context
     * - Metadata stays with content
     * - Better search results than arbitrary token chunks
     */
    chunkByEntry(documentContent, areaPath, documentName) {
        const chunks = [];
        
        // Match entry sections: ### YYYY-MM-DD HH:MM:SS
        const entryRegex = /### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[Z]?)\n\*\*Conversation Context\*\*: (.*?)\n\n([\s\S]*?)(?=\n### |\n---\n|$)/g;
        
        let match;
        while ((match = entryRegex.exec(documentContent)) !== null) {
            const timestamp = match[1];
            const context = match[2];
            const content = match[3].trim();
            
            // Extract metadata from content
            const userQuoteMatch = content.match(/\*\*User Quote\*\*: "(.*?)"/);
            const aiObsMatch = content.match(/\*\*AI Observation\*\*: (.*?)(?:\n|$)/);
            const sentimentMatch = content.match(/\*\*Sentiment\*\*: (.*?)(?:\n|$)/);
            
            // Extract main content (before metadata)
            const mainContent = content.split(/\*\*User Quote\*\*:|$\*\*AI Observation\*\*:|$\*\*Sentiment\*\*:/)[0].trim();
            
            chunks.push({
                chunk_id: `${areaPath.replace(/\//g, '_')}_${documentName.replace('.md', '')}_${timestamp.replace(/[:\s]/g, '_')}`,
                area_path: areaPath,
                document: documentName,
                timestamp: timestamp,
                entry_type: 'time_ordered_log',
                conversation_context: context,
                content: mainContent,
                user_quote: userQuoteMatch ? userQuoteMatch[1] : null,
                ai_observation: aiObsMatch ? aiObsMatch[1].trim() : null,
                sentiment: sentimentMatch ? sentimentMatch[1].trim() : null,
                // Full text for embedding (includes all parts)
                full_text: `${context}\n\n${mainContent}${userQuoteMatch ? '\n' + userQuoteMatch[1] : ''}${aiObsMatch ? '\n' + aiObsMatch[1] : ''}`
            });
        }
        
        return chunks;
    }

    /**
     * Chunk by Paragraph
     * 
     * Chunks text by paragraphs with token limit.
     * Used for documents without entry structure.
     * 
     * @param {string} text - Text to chunk
     * @param {number} maxTokens - Max tokens per chunk (default: 200)
     * @returns {Array<string>} Array of text chunks
     * 
     * Why paragraph boundaries:
     * - Preserves semantic units
     * - No mid-sentence cuts
     * - Better search results
     */
    chunkByParagraph(text, maxTokens = 200) {
        const paragraphs = text.split(/\n\n+/);
        const chunks = [];
        let currentChunk = '';
        let currentTokens = 0;
        
        for (const para of paragraphs) {
            // Rough token estimate: 4 chars per token
            const paraTokens = Math.ceil(para.length / 4);
            
            if (currentTokens + paraTokens > maxTokens && currentChunk) {
                // Current chunk is full, start new chunk
                chunks.push(currentChunk.trim());
                currentChunk = para;
                currentTokens = paraTokens;
            } else {
                // Add to current chunk
                currentChunk += (currentChunk ? '\n\n' : '') + para;
                currentTokens += paraTokens;
            }
        }
        
        // Add final chunk
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }

    /**
     * Compute Cosine Similarity
     * 
     * Computes cosine similarity between two embedding vectors.
     * Returns value between -1 and 1 (higher = more similar).
     * 
     * @param {Array<number>} vecA - First embedding vector
     * @param {Array<number>} vecB - Second embedding vector
     * @returns {number} Similarity score (0-1)
     */
    cosineSimilarity(vecA, vecB) {
        if (vecA.length !== vecB.length) {
            throw new Error('Vectors must have same dimension');
        }
        
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
        
        return dotProduct / (magnitudeA * magnitudeB);
    }
}

module.exports = EmbeddingService;
