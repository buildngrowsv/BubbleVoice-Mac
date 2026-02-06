#!/usr/bin/env node

/**
 * EMBEDDING SERVICE - Node.js Implementation
 * 
 * Purpose:
 * Provides text embedding generation using Transformer models running in Node.js.
 * Uses @xenova/transformers which runs models via ONNX Runtime with CPU/GPU acceleration.
 * 
 * Model Selection:
 * - all-MiniLM-L6-v2: 384 dimensions, fast, good quality (DEFAULT)
 * - gte-small: 384 dimensions, slightly better quality
 * - bge-small-en-v1.5: 384 dimensions, optimized for retrieval
 * 
 * Performance (M3 Pro):
 * - Single embedding: ~20-50ms (first run downloads model)
 * - Batch of 10: ~100-200ms
 * - Model size: ~80MB (cached locally after first download)
 * 
 * Why Node.js instead of MLX Swift:
 * - Easier integration with existing test framework
 * - Cross-platform (can run on any machine)
 * - Simpler dependency management
 * - Good enough performance for testing
 * 
 * Date: 2026-01-19
 */

const { pipeline, env } = require('@xenova/transformers');

// CONFIGURATION
// Disable remote model loading after first download (optional)
// env.allowRemoteModels = false;

// Cache directory for models (default: ~/.cache/huggingface)
// env.cacheDir = './models';

/**
 * Embedding Service Class
 * 
 * Handles loading the embedding model and generating embeddings for text.
 * Singleton pattern ensures model is loaded only once.
 */
class EmbeddingService {
  constructor() {
    // The embedding pipeline (lazy-loaded on first use)
    this.pipeline = null;
    
    // Model configuration
    // Using all-MiniLM-L6-v2 by default (384 dimensions)
    // This is a good balance of speed and quality for semantic search
    this.modelName = 'Xenova/all-MiniLM-L6-v2';
    
    // Embedding dimension (depends on model)
    this.dimension = 384;
    
    // Whether the model is currently loading
    this.isLoading = false;
    
    // Promise that resolves when model is loaded (for concurrent requests)
    this.loadPromise = null;
  }

  /**
   * Load the embedding model
   * 
   * This is called automatically on first embedding request.
   * Subsequent calls return immediately if model is already loaded.
   * 
   * The model is downloaded from Hugging Face and cached locally.
   * First load takes ~10-30 seconds depending on network speed.
   * Subsequent loads are instant (model is cached).
   * 
   * @returns {Promise<void>}
   */
  async load() {
    // If already loaded, return immediately
    if (this.pipeline) {
      return;
    }

    // If currently loading, wait for that to complete
    if (this.isLoading) {
      return this.loadPromise;
    }

    // Start loading
    this.isLoading = true;
    this.loadPromise = this._loadModel();

    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
      this.loadPromise = null;
    }
  }

  /**
   * Internal method to load the model
   * 
   * @private
   * @returns {Promise<void>}
   */
  async _loadModel() {
    console.log(`🔧 Loading embedding model: ${this.modelName}...`);
    const startTime = Date.now();

    try {
      // Create feature extraction pipeline
      // This automatically downloads the model if not cached
      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        // Normalize embeddings (important for cosine similarity)
        normalize: true,
        // Use pooling to get sentence-level embeddings
        pooling: 'mean'
      });

      const loadTime = Date.now() - startTime;
      console.log(`✅ Embedding model loaded in ${loadTime}ms (dimension: ${this.dimension})`);
    } catch (error) {
      console.error(`❌ Failed to load embedding model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   * 
   * The model is automatically loaded on first call.
   * Returns a normalized vector suitable for cosine similarity.
   * 
   * @param {string} text - The text to embed
   * @returns {Promise<number[]>} - The embedding vector (384 dimensions)
   */
  async embed(text) {
    // Validate input
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string');
    }

    // Ensure model is loaded
    await this.load();

    try {
      // Generate embedding
      const startTime = Date.now();
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: true
      });

      // Extract the embedding array
      // Output is a tensor, we need to convert to plain array
      const embedding = Array.from(output.data);
      
      const embedTime = Date.now() - startTime;
      
      // Log performance for first few embeddings
      if (embedTime > 100) {
        console.log(`   ⏱️  Embedding generated in ${embedTime}ms`);
      }

      return embedding;
    } catch (error) {
      console.error(`❌ Embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * 
   * More efficient than calling embed() multiple times.
   * Uses batching internally for better performance.
   * 
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Array of embedding vectors
   */
  async embedBatch(texts) {
    // Validate input
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    // Ensure model is loaded
    await this.load();

    try {
      const startTime = Date.now();
      
      // Process in batch
      const output = await this.pipeline(texts, {
        pooling: 'mean',
        normalize: true
      });

      // Convert tensor to array of arrays
      const embeddings = [];
      const numTexts = texts.length;
      
      for (let i = 0; i < numTexts; i++) {
        const start = i * this.dimension;
        const end = start + this.dimension;
        embeddings.push(Array.from(output.data.slice(start, end)));
      }

      const embedTime = Date.now() - startTime;
      console.log(`   ⏱️  ${numTexts} embeddings generated in ${embedTime}ms (${Math.round(embedTime / numTexts)}ms each)`);

      return embeddings;
    } catch (error) {
      console.error(`❌ Batch embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * 
   * Returns a value between -1 and 1:
   * - 1.0 = identical
   * - 0.0 = orthogonal (no similarity)
   * - -1.0 = opposite
   * 
   * For normalized vectors (which we use), this is just the dot product.
   * 
   * @param {number[]} embedding1 - First embedding vector
   * @param {number[]} embedding2 - Second embedding vector
   * @returns {number} - Cosine similarity score
   */
  cosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    // For normalized vectors, cosine similarity = dot product
    let dotProduct = 0;
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
    }

    return dotProduct;
  }

  /**
   * Get the embedding dimension
   * 
   * @returns {number} - The dimension of embeddings (384 for all-MiniLM-L6-v2)
   */
  getDimension() {
    return this.dimension;
  }
}

// Export singleton instance
// This ensures the model is loaded only once across the entire application
const embeddingService = new EmbeddingService();

module.exports = {
  embeddingService,
  EmbeddingService
};
