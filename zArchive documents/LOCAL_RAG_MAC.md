# Local RAG on Mac - Implementation Guide

**Created:** 2026-01-15  
**Purpose:** Detailed implementation guide for fully local RAG (Retrieval-Augmented Generation) on macOS with MLX.

---

## 📋 Executive Summary

Mac's generous memory (16-128GB) enables **serious local RAG** that rivals cloud solutions:

| Capability | Mac (16GB+) | iPhone (8GB) |
|------------|-------------|--------------|
| Vector index size | 1M+ vectors | ~100k vectors |
| Embedding model | 768-1024 dim | 384-512 dim |
| Context window | 32-128k tokens | 4-8k tokens |
| Embedding speed | <5ms/chunk | ~15ms/chunk |
| Search speed (100k) | <10ms | ~50ms |

**Recommended Stack:** MLX embeddings + ObjectBox HNSW + Local Llama 3

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Mac Local RAG Architecture                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Query: "What did I say about the project deadline?"                    │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │                    MLX Embedding Service                        │         │
│  │                    (all-MiniLM-L6 / gte-small)                 │         │
│  │                    768-dim vectors, <5ms                       │         │
│  └────────────────────────────────────────────────────────────────┘         │
│       │                                                                      │
│       │  Query Vector [0.123, -0.456, 0.789, ...]                           │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │                    ObjectBox Vector Store                       │         │
│  │                    HNSW Index (~10ms for 1M vectors)           │         │
│  │                                                                 │         │
│  │    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │         │
│  │    │ Conversation │  │   Profile    │  │   Summary    │        │         │
│  │    │   Chunks     │  │   Facts      │  │   Chunks     │        │         │
│  │    └──────────────┘  └──────────────┘  └──────────────┘        │         │
│  │                                                                 │         │
│  └────────────────────────────────────────────────────────────────┘         │
│       │                                                                      │
│       │  Top-K Similar Chunks                                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │                    Context Builder                              │         │
│  │                                                                 │         │
│  │    Recent (last 5 msgs) + Semantic (top 5) + Profile (top 3)   │         │
│  │                                                                 │         │
│  └────────────────────────────────────────────────────────────────┘         │
│       │                                                                      │
│       │  Augmented Prompt                                                   │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │                    Local LLM (MLX)                              │         │
│  │                    Llama 3.2 3B / Mistral 7B                   │         │
│  │                    ~30-50 tok/s on M3 Pro                      │         │
│  └────────────────────────────────────────────────────────────────┘         │
│       │                                                                      │
│       ▼                                                                      │
│  Response with retrieved context awareness                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation

### 1. MLX Embedding Service

```swift
import MLX
import MLXEmbedders
import Foundation

/// MLX-based embedding service for local semantic search
/// Uses sentence-transformers models converted to MLX format
/// Runs entirely on Apple Silicon GPU/Neural Engine
/// 
/// Performance (M3 Pro):
/// - Single embedding: ~3-5ms
/// - Batch of 10: ~15-20ms
/// - Memory: ~200MB for model
///
/// Date: 2026-01-15
class MLXEmbeddingService {
    
    // MARK: - Properties
    
    /// The loaded MLX embedding model
    /// Uses all-MiniLM-L6-v2 by default (384 dimensions, good quality/speed balance)
    /// Can swap to gte-small or all-mpnet-base-v2 for higher quality
    private var model: TextEmbedder?
    
    /// Embedding dimension (depends on model)
    /// - all-MiniLM-L6-v2: 384
    /// - gte-small: 384
    /// - all-mpnet-base-v2: 768
    private(set) var embeddingDimension: Int = 384
    
    /// Whether the model is loaded and ready
    var isReady: Bool { model != nil }
    
    // MARK: - Initialization
    
    /// Load the embedding model from Hugging Face
    /// This should be called once at app startup
    /// Model is cached locally after first download
    func setup() async throws {
        print("🔧 Loading MLX embedding model...")
        
        // MLX-community hosts pre-converted models
        // These are optimized for Apple Silicon
        let modelId = "mlx-community/all-MiniLM-L6-v2"
        
        model = try await TextEmbedder.load(from: modelId)
        embeddingDimension = 384  // MiniLM dimension
        
        print("✅ Embedding model loaded (dimension: \(embeddingDimension))")
    }
    
    // MARK: - Embedding Generation
    
    /// Generate embedding for a single text
    /// Returns nil if model not loaded or text is empty
    func embed(_ text: String) async -> [Float]? {
        guard let model = model, !text.isEmpty else { return nil }
        
        do {
            let embedding = try await model.encode(text)
            return embedding.asArray()
        } catch {
            print("❌ Embedding error: \(error)")
            return nil
        }
    }
    
    /// Batch embedding for multiple texts
    /// More efficient than calling embed() in a loop
    /// Uses MLX's batch processing for GPU efficiency
    func embedBatch(_ texts: [String]) async -> [[Float]]? {
        guard let model = model, !texts.isEmpty else { return nil }
        
        do {
            // Filter empty strings
            let validTexts = texts.filter { !$0.isEmpty }
            
            // MLX handles batching internally
            let embeddings = try await model.encodeBatch(validTexts)
            return embeddings.map { $0.asArray() }
        } catch {
            print("❌ Batch embedding error: \(error)")
            return nil
        }
    }
    
    // MARK: - Similarity
    
    /// Cosine similarity between two vectors
    /// Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
    func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count else { return 0 }
        
        let dotProduct = zip(a, b).map(*).reduce(0, +)
        let normA = sqrt(a.map { $0 * $0 }.reduce(0, +))
        let normB = sqrt(b.map { $0 * $0 }.reduce(0, +))
        
        guard normA > 0 && normB > 0 else { return 0 }
        return dotProduct / (normA * normB)
    }
}
```

### 2. ObjectBox Vector Store

```swift
import ObjectBox
import Foundation

// MARK: - Entity Definition

/// Memory chunk stored with vector embedding
/// Each chunk represents a piece of conversation, profile fact, or summary
/// HNSW index enables millisecond nearest-neighbor search
///
/// objectbox: entity
class MemoryChunk: Entity, Identifiable {
    
    /// ObjectBox ID (auto-generated)
    var id: Id = 0
    
    /// The actual text content of this memory
    var content: String = ""
    
    /// Source type: "conversation", "profile", "summary", "reminder"
    var source: String = ""
    
    /// Role for conversation chunks: "user", "assistant"
    var role: String = ""
    
    /// When this memory was created
    var timestamp: Date = Date()
    
    /// Optional conversation ID for grouping
    var conversationId: String = ""
    
    /// JSON metadata (flexible storage for additional info)
    var metadata: String = ""
    
    /// Vector embedding for semantic search
    /// Dimension must match embedding model (384 for MiniLM, 768 for mpnet)
    /// objectbox:hnswIndex: dimensions=384
    var embedding: [Float]? = nil
    
    /// Convenience initializer
    convenience init(content: String, source: String, role: String = "", conversationId: String = "") {
        self.init()
        self.content = content
        self.source = source
        self.role = role
        self.conversationId = conversationId
        self.timestamp = Date()
    }
}

// MARK: - Vector Store

/// ObjectBox-based vector store with HNSW indexing
/// Provides semantic search over conversation memories
///
/// Performance (1M vectors on M3 Pro):
/// - Insert: <1ms per vector
/// - Search: ~10ms for top-10
/// - Memory: ~400MB for 1M 384-dim vectors
///
/// Date: 2026-01-15
class VectorStore {
    
    // MARK: - Properties
    
    private let store: Store
    private let box: Box<MemoryChunk>
    
    // MARK: - Initialization
    
    init() throws {
        // Initialize ObjectBox store
        // Data stored in app's Application Support directory
        let directory = try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("BubbleVoice/VectorStore")
        
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        
        store = try Store(directoryPath: directory.path)
        box = store.box(for: MemoryChunk.self)
        
        print("✅ VectorStore initialized at \(directory.path)")
    }
    
    // MARK: - CRUD Operations
    
    /// Store a new memory chunk
    /// Embedding should already be computed
    @discardableResult
    func store(_ chunk: MemoryChunk) throws -> Id {
        return try box.put(chunk)
    }
    
    /// Store multiple chunks at once (more efficient)
    @discardableResult
    func storeBatch(_ chunks: [MemoryChunk]) throws -> [Id] {
        return try box.putAndReturnIDs(chunks)
    }
    
    /// Get chunk by ID
    func get(id: Id) -> MemoryChunk? {
        return try? box.get(id)
    }
    
    /// Delete chunk by ID
    func delete(id: Id) throws {
        try box.remove(id)
    }
    
    // MARK: - Vector Search
    
    /// Find chunks most similar to the query vector
    /// Uses HNSW index for fast approximate nearest neighbor search
    ///
    /// - Parameters:
    ///   - queryVector: The embedding vector to search for
    ///   - limit: Maximum number of results
    ///   - minSimilarity: Minimum cosine similarity threshold (optional)
    ///   - excludeIds: IDs to exclude from results (e.g., already in context)
    func searchSimilar(
        queryVector: [Float],
        limit: Int = 10,
        minSimilarity: Float? = nil,
        excludeIds: Set<Id> = []
    ) -> [MemoryChunk] {
        do {
            // ObjectBox HNSW query
            let query = try box.query()
                .nearest(property: MemoryChunk.embedding, to: queryVector, maxCount: UInt64(limit + excludeIds.count))
                .build()
            
            var results = try query.find()
            
            // Filter excluded IDs
            if !excludeIds.isEmpty {
                results = results.filter { !excludeIds.contains($0.id) }
            }
            
            // Filter by similarity threshold if specified
            if let minSim = minSimilarity {
                results = results.filter { chunk in
                    guard let embedding = chunk.embedding else { return false }
                    let similarity = cosineSimilarity(queryVector, embedding)
                    return similarity >= minSim
                }
            }
            
            return Array(results.prefix(limit))
        } catch {
            print("❌ Search error: \(error)")
            return []
        }
    }
    
    /// Get recent chunks by source type
    func getRecent(source: String? = nil, limit: Int = 10) -> [MemoryChunk] {
        do {
            var queryBuilder = box.query()
            
            if let source = source {
                queryBuilder = queryBuilder.where(MemoryChunk.source == source)
            }
            
            let query = try queryBuilder
                .ordered(by: MemoryChunk.timestamp, flags: .descending)
                .build()
            
            return try query.find(limit: UInt64(limit))
        } catch {
            print("❌ Recent query error: \(error)")
            return []
        }
    }
    
    /// Get chunks from a specific conversation
    func getConversation(id: String, limit: Int = 100) -> [MemoryChunk] {
        do {
            let query = try box.query()
                .where(MemoryChunk.conversationId == id)
                .ordered(by: MemoryChunk.timestamp, flags: .ascending)
                .build()
            
            return try query.find(limit: UInt64(limit))
        } catch {
            print("❌ Conversation query error: \(error)")
            return []
        }
    }
    
    // MARK: - Statistics
    
    /// Total number of chunks stored
    var count: Int {
        return (try? box.count()) ?? 0
    }
    
    /// Storage size estimate
    var estimatedSizeBytes: Int {
        // Rough estimate: ~2KB per chunk with 384-dim embedding
        return count * 2000
    }
    
    // MARK: - Maintenance
    
    /// Remove old chunks to manage storage
    /// Keeps summaries and profile facts, prunes old conversation chunks
    func pruneOldChunks(olderThan days: Int, keepCount: Int = 10000) throws {
        let cutoffDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        
        let query = try box.query()
            .where(MemoryChunk.timestamp < cutoffDate)
            .where(MemoryChunk.source == "conversation")  // Only prune conversations
            .ordered(by: MemoryChunk.timestamp, flags: .ascending)
            .build()
        
        let oldChunks = try query.find()
        
        // Keep the most recent `keepCount` even if old
        let toDelete = oldChunks.dropLast(keepCount)
        
        if !toDelete.isEmpty {
            try box.remove(Array(toDelete))
            print("🧹 Pruned \(toDelete.count) old chunks")
        }
    }
    
    // MARK: - Helpers
    
    private func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count else { return 0 }
        let dot = zip(a, b).map(*).reduce(0, +)
        let normA = sqrt(a.map { $0 * $0 }.reduce(0, +))
        let normB = sqrt(b.map { $0 * $0 }.reduce(0, +))
        return normA > 0 && normB > 0 ? dot / (normA * normB) : 0
    }
}
```

### 3. RAG Retriever

```swift
import Foundation

/// RAG retriever that combines multiple retrieval strategies
/// Merges recent context, semantic search, and profile facts
///
/// Strategy:
/// 1. Always include last N messages from current conversation (recency)
/// 2. Semantic search across all memories for relevance
/// 3. Include user profile facts for personalization
///
/// Date: 2026-01-15
class RAGRetriever {
    
    // MARK: - Properties
    
    private let vectorStore: VectorStore
    private let embeddingService: MLXEmbeddingService
    
    // MARK: - Configuration
    
    /// Number of recent messages to always include
    var recentMessageCount = 5
    
    /// Number of semantic matches to retrieve
    var semanticMatchCount = 5
    
    /// Number of profile facts to include
    var profileFactCount = 3
    
    /// Minimum similarity for semantic matches (0-1)
    var minSimilarity: Float = 0.3
    
    // MARK: - Initialization
    
    init(vectorStore: VectorStore, embeddingService: MLXEmbeddingService) {
        self.vectorStore = vectorStore
        self.embeddingService = embeddingService
    }
    
    // MARK: - Retrieval
    
    /// Retrieved context for RAG
    struct RetrievalContext {
        let recentMessages: [MemoryChunk]
        let semanticMatches: [MemoryChunk]
        let profileFacts: [MemoryChunk]
        let queryEmbedding: [Float]
        
        /// Total number of chunks retrieved
        var totalChunks: Int {
            recentMessages.count + semanticMatches.count + profileFacts.count
        }
        
        /// Estimated token count (rough: ~1.3 tokens per word)
        var estimatedTokens: Int {
            let text = (recentMessages + semanticMatches + profileFacts)
                .map { $0.content }
                .joined(separator: " ")
            let words = text.split(separator: " ").count
            return Int(Double(words) * 1.3)
        }
    }
    
    /// Retrieve context for a query
    /// Combines recent, semantic, and profile retrieval strategies
    func retrieve(query: String, conversationId: String? = nil) async -> RetrievalContext? {
        // 1. Embed the query
        guard let queryVector = await embeddingService.embed(query) else {
            print("❌ Failed to embed query")
            return nil
        }
        
        // 2. Get recent messages from current conversation
        var recentMessages: [MemoryChunk] = []
        if let convId = conversationId {
            let conversation = vectorStore.getConversation(id: convId, limit: recentMessageCount * 2)
            recentMessages = Array(conversation.suffix(recentMessageCount))
        }
        
        // 3. Semantic search (exclude recent to avoid duplicates)
        let recentIds = Set(recentMessages.map { $0.id })
        let semanticMatches = vectorStore.searchSimilar(
            queryVector: queryVector,
            limit: semanticMatchCount,
            minSimilarity: minSimilarity,
            excludeIds: recentIds
        )
        
        // 4. Get profile facts
        let profileFacts = vectorStore.searchSimilar(
            queryVector: queryVector,
            limit: profileFactCount,
            minSimilarity: 0.2,  // Lower threshold for profile
            excludeIds: recentIds
        ).filter { $0.source == "profile" }
        
        return RetrievalContext(
            recentMessages: recentMessages,
            semanticMatches: semanticMatches,
            profileFacts: profileFacts,
            queryEmbedding: queryVector
        )
    }
    
    /// Build prompt context string from retrieval results
    /// Formats chunks into a structured context block for the LLM
    func buildPromptContext(_ context: RetrievalContext) -> String {
        var parts: [String] = []
        
        // Profile facts (highest priority - always at top)
        if !context.profileFacts.isEmpty {
            let facts = context.profileFacts
                .map { "• \($0.content)" }
                .joined(separator: "\n")
            parts.append("## About the User\n\(facts)")
        }
        
        // Relevant memories from past conversations
        if !context.semanticMatches.isEmpty {
            let memories = context.semanticMatches
                .map { chunk in
                    let date = formatDate(chunk.timestamp)
                    return "[\(date)] \(chunk.content)"
                }
                .joined(separator: "\n")
            parts.append("## Relevant Past Conversations\n\(memories)")
        }
        
        // Recent context from current conversation
        if !context.recentMessages.isEmpty {
            let recent = context.recentMessages
                .map { "[\($0.role.capitalized)]: \($0.content)" }
                .joined(separator: "\n")
            parts.append("## Current Conversation\n\(recent)")
        }
        
        return parts.joined(separator: "\n\n")
    }
    
    // MARK: - Helpers
    
    private func formatDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
```

### 4. Memory Indexer

```swift
import Foundation

/// Indexes conversations and extracts memories for RAG
/// Handles chunking, embedding, and storage of conversation content
///
/// Indexing Strategy:
/// 1. Index individual messages for fine-grained retrieval
/// 2. Index conversation summaries for broader context
/// 3. Extract and index profile facts from analysis
///
/// Date: 2026-01-15
class MemoryIndexer {
    
    // MARK: - Properties
    
    private let vectorStore: VectorStore
    private let embeddingService: MLXEmbeddingService
    
    /// Minimum content length to index (skip very short messages)
    var minContentLength = 20
    
    /// Maximum chunk size for long content (in characters)
    var maxChunkSize = 500
    
    // MARK: - Initialization
    
    init(vectorStore: VectorStore, embeddingService: MLXEmbeddingService) {
        self.vectorStore = vectorStore
        self.embeddingService = embeddingService
    }
    
    // MARK: - Conversation Indexing
    
    /// Index a complete conversation after it ends
    /// Creates memory chunks for each message and the summary
    func indexConversation(
        messages: [(role: String, content: String)],
        summary: String,
        conversationId: String
    ) async {
        print("📝 Indexing conversation \(conversationId) with \(messages.count) messages")
        
        var chunks: [MemoryChunk] = []
        var textsToEmbed: [String] = []
        
        // 1. Create chunks for messages worth indexing
        for message in messages {
            guard message.content.count >= minContentLength else { continue }
            
            let chunk = MemoryChunk(
                content: message.content,
                source: "conversation",
                role: message.role,
                conversationId: conversationId
            )
            chunks.append(chunk)
            textsToEmbed.append(message.content)
        }
        
        // 2. Create chunk for summary
        if !summary.isEmpty {
            let summaryChunk = MemoryChunk(
                content: summary,
                source: "summary",
                conversationId: conversationId
            )
            chunks.append(summaryChunk)
            textsToEmbed.append(summary)
        }
        
        // 3. Batch embed all texts
        guard let embeddings = await embeddingService.embedBatch(textsToEmbed) else {
            print("❌ Failed to embed conversation")
            return
        }
        
        // 4. Assign embeddings to chunks
        for (index, embedding) in embeddings.enumerated() {
            if index < chunks.count {
                chunks[index].embedding = embedding
            }
        }
        
        // 5. Store all chunks
        do {
            try vectorStore.storeBatch(chunks)
            print("✅ Indexed \(chunks.count) memory chunks")
        } catch {
            print("❌ Failed to store chunks: \(error)")
        }
    }
    
    // MARK: - Profile Indexing
    
    /// Index user profile facts for retrieval
    /// Chunks the profile into sentence-level facts
    func indexProfile(_ profileText: String) async {
        guard !profileText.isEmpty else { return }
        
        print("📝 Indexing user profile")
        
        // Split into sentences/facts
        let sentences = profileText.components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.count >= minContentLength }
        
        guard !sentences.isEmpty else { return }
        
        // Remove old profile chunks first
        let oldProfile = vectorStore.getRecent(source: "profile", limit: 1000)
        for chunk in oldProfile {
            try? vectorStore.delete(id: chunk.id)
        }
        
        // Create new profile chunks
        var chunks: [MemoryChunk] = []
        for sentence in sentences {
            let chunk = MemoryChunk(
                content: sentence,
                source: "profile"
            )
            chunks.append(chunk)
        }
        
        // Embed all
        guard let embeddings = await embeddingService.embedBatch(sentences) else {
            print("❌ Failed to embed profile")
            return
        }
        
        for (index, embedding) in embeddings.enumerated() {
            if index < chunks.count {
                chunks[index].embedding = embedding
            }
        }
        
        // Store
        do {
            try vectorStore.storeBatch(chunks)
            print("✅ Indexed \(chunks.count) profile facts")
        } catch {
            print("❌ Failed to store profile: \(error)")
        }
    }
    
    // MARK: - Incremental Indexing
    
    /// Index a single message in real-time (during conversation)
    /// Useful for immediate retrieval during long conversations
    func indexMessage(content: String, role: String, conversationId: String) async {
        guard content.count >= minContentLength else { return }
        
        guard let embedding = await embeddingService.embed(content) else {
            return
        }
        
        let chunk = MemoryChunk(
            content: content,
            source: "conversation",
            role: role,
            conversationId: conversationId
        )
        chunk.embedding = embedding
        
        do {
            try vectorStore.store(chunk)
        } catch {
            print("❌ Failed to index message: \(error)")
        }
    }
}
```

---

## 📊 Performance Expectations

### Mac Hardware Comparison

| Operation | M1 | M2 Pro | M3 Pro | M4 Pro |
|-----------|-----|--------|--------|--------|
| Single embed (384d) | ~8ms | ~5ms | ~4ms | ~3ms |
| Batch 10 embeds | ~40ms | ~25ms | ~18ms | ~12ms |
| HNSW search (100k) | ~15ms | ~12ms | ~10ms | ~8ms |
| HNSW search (1M) | ~25ms | ~18ms | ~12ms | ~10ms |

### Memory Usage

| Component | Memory |
|-----------|--------|
| MLX embedding model (MiniLM) | ~200 MB |
| ObjectBox + 100k vectors | ~100 MB |
| ObjectBox + 1M vectors | ~800 MB |
| Total (typical use) | ~500 MB |

### Storage

| Content | Size |
|---------|------|
| 1 conversation (avg 20 msgs) | ~50 KB |
| 1 year daily use (~365 convos) | ~20 MB |
| 5 years heavy use | ~100 MB |

---

## 🚀 Quick Setup

### Package.swift Dependencies

```swift
dependencies: [
    // MLX Swift for embeddings
    .package(url: "https://github.com/ml-explore/mlx-swift.git", from: "0.20.0"),
    
    // ObjectBox for vector storage
    .package(url: "https://github.com/objectbox/objectbox-swift.git", from: "4.0.0"),
]
```

### Initialize at App Startup

```swift
class RAGService {
    static let shared = RAGService()
    
    private(set) var embeddingService: MLXEmbeddingService!
    private(set) var vectorStore: VectorStore!
    private(set) var retriever: RAGRetriever!
    private(set) var indexer: MemoryIndexer!
    
    func setup() async throws {
        // 1. Initialize embedding service
        embeddingService = MLXEmbeddingService()
        try await embeddingService.setup()
        
        // 2. Initialize vector store
        vectorStore = try VectorStore()
        
        // 3. Create retriever and indexer
        retriever = RAGRetriever(vectorStore: vectorStore, embeddingService: embeddingService)
        indexer = MemoryIndexer(vectorStore: vectorStore, embeddingService: embeddingService)
        
        print("✅ RAG service ready (\(vectorStore.count) memories indexed)")
    }
}
```

### Usage in Conversation

```swift
// During conversation - retrieve context for LLM
func generateResponse(userMessage: String, conversationId: String) async -> String {
    let rag = RAGService.shared
    
    // 1. Retrieve relevant context
    guard let context = await rag.retriever.retrieve(
        query: userMessage,
        conversationId: conversationId
    ) else {
        // Fallback: no RAG context
        return await generateWithLLM(prompt: userMessage, context: nil)
    }
    
    // 2. Build context string
    let contextString = rag.retriever.buildPromptContext(context)
    
    // 3. Generate with context
    let systemPrompt = """
    You are a helpful voice assistant. Use the following context to inform your response:
    
    \(contextString)
    
    Respond naturally and conversationally. If the context is relevant, use it. 
    If not, respond based on the current message.
    """
    
    return await generateWithLLM(prompt: userMessage, systemPrompt: systemPrompt)
}

// After conversation ends - index for future retrieval
func endConversation(messages: [(role: String, content: String)], summary: String, id: String) async {
    await RAGService.shared.indexer.indexConversation(
        messages: messages,
        summary: summary,
        conversationId: id
    )
}
```

---

## 📝 Notes

- **MLX embeddings are fast** on Apple Silicon - no need for cloud embeddings
- **ObjectBox HNSW** handles 1M+ vectors with <20ms search time
- **Start simple** with NLEmbedding, upgrade to MLX when needed
- **Profile facts** are the most valuable context - keep them fresh
- **Summaries** provide better retrieval than raw messages for broad queries
- **Prune old conversations** periodically to manage storage
