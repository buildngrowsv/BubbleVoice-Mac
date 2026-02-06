#!/usr/bin/env node

/**
 * CHUNKING SERVICE - Document and Conversation Chunking
 * 
 * Purpose:
 * Splits documents and conversations into chunks suitable for embedding and retrieval.
 * Implements intelligent chunking strategies that preserve context and meaning.
 * 
 * Chunking Strategies:
 * 1. Document Chunking: Split by paragraphs/sections with overlap
 * 2. Conversation Chunking: Split by turns or semantic boundaries
 * 3. Summary Chunking: Treat summaries as single chunks
 * 
 * Why Chunking Matters:
 * - Embedding models have token limits (~512 tokens typically)
 * - Smaller chunks = more precise retrieval
 * - Overlap = preserve context across boundaries
 * - Metadata = enable filtering and ranking
 * 
 * Date: 2026-01-19
 */

const crypto = require('crypto');

/**
 * Chunking Service Class
 * 
 * Provides methods to chunk different types of content for vector search.
 */
class ChunkingService {
  constructor() {
    // Default chunking parameters
    this.config = {
      // Maximum chunk size in characters (roughly ~128 tokens)
      maxChunkSize: 500,
      
      // Overlap between chunks to preserve context
      overlapSize: 50,
      
      // Minimum chunk size (discard smaller chunks)
      minChunkSize: 50,
      
      // For conversation chunking: turns per chunk
      turnsPerChunk: 3
    };
  }

  /**
   * Generate a unique chunk ID
   * 
   * @param {string} source - Source identifier (e.g., file path)
   * @param {number} index - Chunk index
   * @returns {string} - Unique chunk ID
   */
  generateChunkId(source, index) {
    const hash = crypto.createHash('md5')
      .update(`${source}-${index}-${Date.now()}`)
      .digest('hex')
      .substring(0, 8);
    return `chunk_${hash}`;
  }

  /**
   * Chunk a document by paragraphs with overlap
   * 
   * This is the primary chunking method for life area documents.
   * Splits on paragraph boundaries and adds overlap for context.
   * 
   * Example:
   * Input: "Para 1\n\nPara 2\n\nPara 3"
   * Output: [
   *   { text: "Para 1\n\nPara 2", ... },
   *   { text: "Para 2\n\nPara 3", ... }  // Note overlap
   * ]
   * 
   * @param {string} documentPath - Path to the document
   * @param {string} content - The document content
   * @param {Object} baseMetadata - Base metadata to include in all chunks
   * @returns {Array<{id: string, text: string, metadata: Object}>}
   */
  chunkDocument(documentPath, content, baseMetadata = {}) {
    const chunks = [];
    
    // Split by double newline (paragraphs)
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    if (paragraphs.length === 0) {
      return chunks;
    }

    // If document is small, treat as single chunk
    if (content.length <= this.config.maxChunkSize) {
      chunks.push({
        id: this.generateChunkId(documentPath, 0),
        text: content.trim(),
        metadata: {
          ...baseMetadata,
          documentPath,
          type: 'document',
          chunkIndex: 0,
          totalChunks: 1,
          timestamp: Date.now()
        }
      });
      return chunks;
    }

    // Build chunks with overlap
    let currentChunk = '';
    let chunkIndex = 0;
    let previousParagraph = '';

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      // Add overlap from previous paragraph
      const withOverlap = previousParagraph 
        ? this._getOverlap(previousParagraph) + '\n\n' + paragraph
        : paragraph;

      // Check if adding this paragraph exceeds max size
      if (currentChunk && (currentChunk + '\n\n' + withOverlap).length > this.config.maxChunkSize) {
        // Save current chunk
        if (currentChunk.length >= this.config.minChunkSize) {
          chunks.push({
            id: this.generateChunkId(documentPath, chunkIndex),
            text: currentChunk.trim(),
            metadata: {
              ...baseMetadata,
              documentPath,
              type: 'document',
              chunkIndex,
              timestamp: Date.now()
            }
          });
          chunkIndex++;
        }
        
        // Start new chunk with overlap
        currentChunk = withOverlap;
      } else {
        // Add to current chunk
        currentChunk = currentChunk 
          ? currentChunk + '\n\n' + paragraph
          : withOverlap;
      }

      previousParagraph = paragraph;
    }

    // Add final chunk
    if (currentChunk.length >= this.config.minChunkSize) {
      chunks.push({
        id: this.generateChunkId(documentPath, chunkIndex),
        text: currentChunk.trim(),
        metadata: {
          ...baseMetadata,
          documentPath,
          type: 'document',
          chunkIndex,
          timestamp: Date.now()
        }
      });
    }

    // Update total chunks count
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Chunk a conversation by turns
   * 
   * Groups conversation turns into chunks for better context.
   * Each chunk contains N turns (user + AI pairs).
   * 
   * @param {string} conversationId - Conversation identifier
   * @param {Array<{role: string, content: string, timestamp: number}>} messages - Conversation messages
   * @param {Object} baseMetadata - Base metadata
   * @returns {Array<{id: string, text: string, metadata: Object}>}
   */
  chunkConversation(conversationId, messages, baseMetadata = {}) {
    const chunks = [];
    const turnsPerChunk = this.config.turnsPerChunk;

    for (let i = 0; i < messages.length; i += turnsPerChunk) {
      const turnMessages = messages.slice(i, i + turnsPerChunk);
      
      // Format as readable text
      const text = turnMessages.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'AI';
        return `${role}: ${msg.content}`;
      }).join('\n\n');

      chunks.push({
        id: this.generateChunkId(conversationId, Math.floor(i / turnsPerChunk)),
        text,
        metadata: {
          ...baseMetadata,
          conversationId,
          type: 'conversation',
          turnStart: i,
          turnEnd: Math.min(i + turnsPerChunk, messages.length),
          timestamp: turnMessages[turnMessages.length - 1].timestamp || Date.now()
        }
      });
    }

    return chunks;
  }

  /**
   * Chunk a summary (treat as single chunk)
   * 
   * Summaries are typically concise and should not be split.
   * 
   * @param {string} areaPath - Area path
   * @param {string} summary - Summary content
   * @param {Object} baseMetadata - Base metadata
   * @returns {Array<{id: string, text: string, metadata: Object}>}
   */
  chunkSummary(areaPath, summary, baseMetadata = {}) {
    if (!summary || summary.trim().length < this.config.minChunkSize) {
      return [];
    }

    return [{
      id: this.generateChunkId(areaPath + '/summary', 0),
      text: summary.trim(),
      metadata: {
        ...baseMetadata,
        areaPath,
        type: 'summary',
        timestamp: Date.now()
      }
    }];
  }

  /**
   * Chunk an entry (newest-first document)
   * 
   * For documents where newest entries are at the top,
   * we want to chunk in reverse order so recent content
   * has higher priority.
   * 
   * @param {string} documentPath - Document path
   * @param {string} content - Document content
   * @param {Object} baseMetadata - Base metadata
   * @returns {Array<{id: string, text: string, metadata: Object}>}
   */
  chunkNewestFirstDocument(documentPath, content, baseMetadata = {}) {
    // Extract entries (assuming they're separated by "---" or timestamps)
    const entries = this._extractEntries(content);
    
    if (entries.length === 0) {
      return this.chunkDocument(documentPath, content, baseMetadata);
    }

    const chunks = [];
    
    // Chunk each entry separately
    entries.forEach((entry, index) => {
      const entryChunks = this.chunkDocument(
        `${documentPath}#entry${index}`,
        entry.content,
        {
          ...baseMetadata,
          entryIndex: index,
          entryTimestamp: entry.timestamp,
          // Recent entries get higher priority
          recencyBoost: 1.0 / (index + 1)
        }
      );
      chunks.push(...entryChunks);
    });

    return chunks;
  }

  /**
   * Extract entries from a newest-first document
   * 
   * Looks for common separators like "---", "##", or timestamps.
   * 
   * @private
   * @param {string} content - Document content
   * @returns {Array<{content: string, timestamp: number}>}
   */
  _extractEntries(content) {
    const entries = [];
    
    // Split by common separators
    const sections = content.split(/\n---+\n|\n## /);
    
    for (const section of sections) {
      const trimmed = section.trim();
      if (trimmed.length < this.config.minChunkSize) continue;
      
      // Try to extract timestamp
      const timestampMatch = trimmed.match(/\d{4}-\d{2}-\d{2}|\d{10,13}/);
      const timestamp = timestampMatch 
        ? new Date(timestampMatch[0]).getTime() 
        : Date.now();
      
      entries.push({
        content: trimmed,
        timestamp
      });
    }

    return entries;
  }

  /**
   * Get overlap text from end of previous chunk
   * 
   * @private
   * @param {string} text - Previous text
   * @returns {string} - Overlap text
   */
  _getOverlap(text) {
    if (text.length <= this.config.overlapSize) {
      return text;
    }
    
    // Get last N characters, but try to break at word boundary
    const overlap = text.slice(-this.config.overlapSize);
    const firstSpace = overlap.indexOf(' ');
    
    if (firstSpace > 0 && firstSpace < overlap.length - 10) {
      return overlap.slice(firstSpace + 1);
    }
    
    return overlap;
  }

  /**
   * Chunk entire knowledge base
   * 
   * Processes all areas, documents, and summaries in the knowledge base.
   * Returns all chunks ready for embedding and indexing.
   * 
   * @param {string} knowledgeBasePath - Path to knowledge base
   * @returns {Promise<Array<{id: string, text: string, metadata: Object}>>}
   */
  async chunkKnowledgeBase(knowledgeBasePath) {
    const fs = require('fs').promises;
    const path = require('path');
    const chunks = [];

    console.log(`📚 Chunking knowledge base: ${knowledgeBasePath}`);

    // Read all areas
    const areas = await fs.readdir(knowledgeBasePath);

    for (const area of areas) {
      const areaPath = path.join(knowledgeBasePath, area);
      const stat = await fs.stat(areaPath);
      
      if (!stat.isDirectory()) continue;

      // Read all documents in area
      const files = await fs.readdir(areaPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(areaPath, file);
        const content = await fs.readFile(filePath, 'utf-8');

        // Determine chunking strategy based on file name
        let fileChunks;
        if (file === '_AREA_SUMMARY.md') {
          fileChunks = this.chunkSummary(area, content, { areaPath: area });
        } else {
          fileChunks = this.chunkDocument(
            `${area}/${file}`,
            content,
            { areaPath: area }
          );
        }

        chunks.push(...fileChunks);
      }
    }

    console.log(`✅ Generated ${chunks.length} chunks from knowledge base`);
    return chunks;
  }
}

module.exports = {
  ChunkingService
};
