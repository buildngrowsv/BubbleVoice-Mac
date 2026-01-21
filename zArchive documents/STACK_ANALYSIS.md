# Bubble Voice Mac - Stack Analysis & Recommendation

**Created:** 2026-01-16  
**Purpose:** Comprehensive analysis of technology stack options for Bubble Voice Mac.

---

## 📋 Decision Criteria

| Criteria | Weight | Notes |
|----------|--------|-------|
| **AI Familiarity** | ⭐⭐⭐⭐⭐ | What I can help you build fastest/best |
| **UI/Animation Quality** | ⭐⭐⭐⭐⭐ | Novel interactions, smooth animations |
| **Local Voice Models** | ⭐⭐⭐⭐⭐ | TTS/STT running on-device |
| **Menu Bar + Desktop** | ⭐⭐⭐⭐ | Both form factors supported |
| **Platform Agnostic** | ⭐⭐⭐ | Future cross-platform potential |
| **Not App Store** | ⭐⭐⭐ | More flexibility (private APIs, etc.) |

---

## 🏆 Stack Comparison Matrix

| Stack | AI Familiarity | UI Quality | Local ML | Menu Bar | Cross-Platform | Final Score |
|-------|---------------|------------|----------|----------|----------------|-------------|
| **SwiftUI + AppKit** | 9/10 | 9/10 | 10/10 | 10/10 | 2/10 | **40/50** |
| **Tauri + React** | 9/10 | 8/10 | 7/10 | 8/10 | 9/10 | **41/50** |
| **Electron + React** | 9/10 | 8/10 | 5/10 | 7/10 | 10/10 | **39/50** |
| **Flutter** | 6/10 | 8/10 | 4/10 | 5/10 | 9/10 | **32/50** |
| **Tauri + Svelte** | 8/10 | 8/10 | 7/10 | 8/10 | 9/10 | **40/50** |

---

## 🔍 Deep Dive: Top 3 Options

### Option 1: Native Swift (SwiftUI + AppKit)

**Best For:** Maximum Mac integration, local ML, Siri voices

```
┌─────────────────────────────────────────────────────────────────┐
│                    Native Swift Stack                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  SwiftUI    │  │   AppKit    │  │  Metal/CA   │              │
│  │  (UI)       │  │  (Menu Bar) │  │  (Graphics) │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────┐              │
│  │              Core Services Layer               │              │
│  │                                                │              │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │              │
│  │  │ MLX      │  │ AVAudio  │  │ Speech   │    │              │
│  │  │ (LLM/RAG)│  │ Engine   │  │ Framework│    │              │
│  │  └──────────┘  └──────────┘  └──────────┘    │              │
│  │                                                │              │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │              │
│  │  │NSSpeech  │  │ ObjectBox│  │ Process  │    │              │
│  │  │Synth     │  │ (Vector) │  │ (say cmd)│    │              │
│  │  └──────────┘  └──────────┘  └──────────┘    │              │
│  └───────────────────────────────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ **Best local ML** - MLX Swift is native, optimized, fast
- ✅ **Siri voices** via NSSpeechSynthesizer (184 voices available!)
- ✅ **`say` command** - trivial to shell out to it
- ✅ **Menu bar native** - NSStatusItem just works
- ✅ **Liquid Glass UI** - macOS 16 native support
- ✅ **Smallest footprint** - ~5MB app size
- ✅ **I'm very familiar** with SwiftUI/AppKit

**Cons:**
- ❌ Mac-only (no future iOS/Windows without rewrite)
- ❌ Some SwiftUI limitations for novel animations
- ❌ Steeper learning curve if you're web-focused

**TTS Options:**
```swift
// Option 1: NSSpeechSynthesizer (Siri-like voices)
let synth = NSSpeechSynthesizer(voice: NSSpeechSynthesizer.VoiceName("com.apple.speech.synthesis.voice.samantha"))
synth.startSpeaking("Hello!")

// Option 2: Shell to `say` command
Process.launchedProcess(launchPath: "/usr/bin/say", arguments: ["-v", "Samantha", "Hello!"])

// Option 3: AVSpeechSynthesizer (cross-platform)
let utterance = AVSpeechUtterance(string: "Hello!")
utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
synthesizer.speak(utterance)
```

---

### Option 2: Tauri + React/TypeScript

**Best For:** Cross-platform future, web tech UI, decent local ML

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tauri + React Stack                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 React Frontend (WebView)                 │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │ Framer   │  │ Tailwind │  │  shadcn  │              │    │
│  │  │ Motion   │  │          │  │   /ui    │              │    │
│  │  └──────────┘  └──────────┘  └──────────┘              │    │
│  │                                                          │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │ invoke()                           │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │                  Rust Backend (Tauri Core)               │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │ Candle   │  │ NSWindow │  │ Command  │              │    │
│  │  │ (LLM)    │  │ (FFI)    │  │ (say)    │              │    │
│  │  └──────────┘  └──────────┘  └──────────┘              │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │    │
│  │  │ qdrant   │  │ whisper  │  │ cpal     │              │    │
│  │  │ (vector) │  │ (STT)    │  │ (audio)  │              │    │
│  │  └──────────┘  └──────────┘  └──────────┘              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ **Excellent UI** - Framer Motion, GSAP, Lottie
- ✅ **Small binary** - ~10-50MB vs Electron's 150MB
- ✅ **I'm very familiar** with React/TypeScript
- ✅ **Cross-platform ready** - Windows/Linux later
- ✅ **Rust backend** - can call `say` via Command

**Cons:**
- ❌ **Local ML harder** - Rust ML ecosystem less mature than MLX
- ❌ **Menu bar requires** native bridge (more complex)
- ❌ **No direct MLX** - have to use Candle or ONNX
- ❌ **Two languages** - Rust + TypeScript

**TTS Options:**
```rust
// Rust backend - shell to macOS say command
use std::process::Command;

#[tauri::command]
fn speak(text: String, voice: String) -> Result<(), String> {
    Command::new("say")
        .args(["-v", &voice, &text])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Or use coqui-tts/piper via FFI for custom voices
```

---

### Option 3: Hybrid - SwiftUI Shell + Web View

**Best For:** Best of both worlds - native ML + web UI flexibility

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hybrid Swift + WebView                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Native Swift Shell (AppKit)                   │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                │  │
│  │  │ NSStatus │  │ NSWindow │  │ MLX      │                │  │
│  │  │ Item     │  │          │  │ Services │                │  │
│  │  └──────────┘  └──────────┘  └──────────┘                │  │
│  │                                                            │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │ WKWebView                            │
│  ┌────────────────────────┴──────────────────────────────────┐  │
│  │                React UI (Embedded WebView)                 │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                │  │
│  │  │ Framer   │  │ Custom   │  │ Canvas   │                │  │
│  │  │ Motion   │  │ Shaders  │  │ API      │  │                │  │
│  │  └──────────┘  └──────────┘  └──────────┘                │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Bridge: window.webkit.messageHandlers.native.postMessage()      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ **MLX for local ML** - native Swift performance
- ✅ **Web UI for animations** - Framer Motion, Three.js, etc.
- ✅ **Native menu bar** - AppKit just works
- ✅ **Siri voices** - NSSpeechSynthesizer accessible
- ✅ **Best of both** worlds

**Cons:**
- ❌ **More complex architecture** - two communication layers
- ❌ **Debugging harder** - cross-boundary issues
- ❌ **Not truly cross-platform** - Swift shell is Mac-only

---

## 🎤 TTS Deep Dive: Siri Voices

Your Mac has **184 voices** available via `say`:

```bash
# List all voices
say -v '?'

# High-quality voices for English
say -v "Samantha" "Hello, I am Samantha"     # US Female (most natural)
say -v "Daniel" "Hello, I am Daniel"          # UK Male
say -v "Karen" "Hello, I am Karen"            # AU Female
say -v "Alex" "Hello, I am Alex"              # US Male (classic)

# Novelty voices (fun but not for production)
say -v "Bubbles" "Hello!"                     # Underwater effect
say -v "Bells" "Hello!"                       # Musical
say -v "Cellos" "Hello!"                      # Deep cello

# Download more voices: System Settings → Accessibility → Spoken Content
```

**Quality Ranking (English):**
1. **Samantha (Enhanced)** - Most natural, Siri-like
2. **Daniel (Enhanced)** - British, very clear
3. **Karen (Enhanced)** - Australian, pleasant
4. **Alex** - Classic Mac voice, good but older

**Using in Code (Any Stack):**
```bash
# Basic usage
say -v Samantha "Your text here"

# Save to file (for caching)
say -v Samantha -o output.aiff "Your text here"

# Control rate (words per minute)
say -v Samantha -r 180 "Faster speech"

# With SSML-like prosody via command substitution
say -v Samantha "[[rate 150]] Slower. [[rate 250]] Faster!"
```

---

## 🧠 Local ML Deep Dive

### LLM Options by Stack

| Stack | LLM Solution | Speed (M3 Pro) | Setup Difficulty |
|-------|--------------|----------------|------------------|
| Swift | **MLX Swift** | 45 tok/s (7B) | ⭐⭐ Easy |
| Tauri/Rust | Candle | 35 tok/s (7B) | ⭐⭐⭐ Medium |
| Tauri/Rust | llama.cpp (FFI) | 40 tok/s (7B) | ⭐⭐⭐⭐ Complex |
| Electron | llama.cpp (NAPI) | 35 tok/s (7B) | ⭐⭐⭐ Medium |
| Any | Ollama (subprocess) | 40 tok/s (7B) | ⭐ Very Easy |

**Simplest Option (Any Stack):** Run Ollama as subprocess
```bash
# Install once
brew install ollama

# From your app, call:
curl http://localhost:11434/api/generate -d '{"model":"llama3.2:3b","prompt":"Hello"}'
```

### Embedding/RAG Options

| Stack | Solution | Vectors/sec | Index Support |
|-------|----------|-------------|---------------|
| Swift | MLX + ObjectBox | ~1000 | HNSW |
| Tauri | Candle + qdrant | ~800 | HNSW |
| Any | sqlite-vss | ~500 | IVF |

---

## 🎨 UI/Animation Deep Dive

### Animation Capability Ranking

| Stack | Micro-interactions | Page Transitions | Novel Effects | GPU Shaders |
|-------|-------------------|------------------|---------------|-------------|
| **React + Framer Motion** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **SwiftUI** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **React + GSAP** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Flutter** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

**For Novel Voice UI:**
- **Waveform visualizations**: React + Canvas/WebGL or SwiftUI + Metal
- **Voice bubble animations**: Framer Motion or SwiftUI springs
- **Ambient effects**: Three.js (web) or Metal shaders (native)
- **Liquid morphing**: Lottie (web) or CAShapeLayer (native)

---

## 🎯 My Recommendation

### **Primary: Tauri + React + Ollama Sidecar**

**Why:**
1. **I'm highly proficient** with React/TypeScript
2. **Best UI animation ecosystem** (Framer Motion + GSAP + Lottie)
3. **Reasonable local ML** via Ollama subprocess
4. **Cross-platform ready** for later
5. **Small app size** (~30-50MB)
6. **`say` command works** from Rust backend

```
┌─────────────────────────────────────────────────────────────────┐
│                  Recommended Stack                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Frontend: React 19 + Vite + TypeScript                          │
│            Framer Motion (animations)                            │
│            Tailwind CSS (styling)                                │
│            shadcn/ui (components)                                │
│                                                                  │
│  Backend:  Tauri v2 (Rust core)                                  │
│            tray-icon crate (menu bar)                            │
│            Command::new("say") for TTS                           │
│            cpal for audio input                                  │
│                                                                  │
│  ML:       Ollama (sidecar/subprocess)                           │
│            - Llama 3.2 3B for conversation                       │
│            - nomic-embed for vectors                             │
│            OR Candle (embedded) for tighter integration          │
│                                                                  │
│  Storage:  sqlite-vss for vectors                                │
│            tauri-plugin-sql for persistence                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### **Alternative: Native Swift (If Mac-Only Forever)**

If you're **100% committed to Mac only** and want the **best ML performance**:

- SwiftUI for UI
- MLX for LLM + embeddings
- NSSpeechSynthesizer for Siri voices
- ObjectBox for vector storage
- NSStatusItem for menu bar

---

## 📊 Decision Matrix Summary

| Question | Tauri | Swift |
|----------|-------|-------|
| Will you ever want Windows/Linux? | ✅ Yes | ❌ Rebuild |
| Is absolute ML performance critical? | ⚠️ Good | ✅ Best |
| Do you want web animation libraries? | ✅ Yes | ❌ Limited |
| Do you want Siri voices easily? | ✅ `say` cmd | ✅ Native |
| Can I (AI) help you most effectively? | ✅ Very | ✅ Very |
| Menu bar + desktop window? | ✅ Yes | ✅ Yes |
| Smallest app size? | ⚠️ 30MB | ✅ 5MB |

---

## 🚀 Quick Start Commands

### If Tauri:
```bash
# Create project
npm create tauri-app@latest -- --template vanilla-ts
cd bubble-voice-mac
npm install

# Add React + deps
npm install react react-dom framer-motion @tauri-apps/api
npm install -D @types/react @types/react-dom

# Add menu bar support
cargo add tray-icon

# Run
npm run tauri dev
```

### If Swift:
```bash
# Create in Xcode:
# File → New → Project → macOS → App
# Name: BubbleVoiceMac
# Interface: SwiftUI

# Add packages:
# https://github.com/ml-explore/mlx-swift
# https://github.com/objectbox/objectbox-swift
```

---

## 💾 Data Storage: Local vs Cloud

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Data Storage Architecture                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Conversation → Embedding → Vector + Metadata                          │
│                                       │                                      │
│               ┌───────────────────────┴───────────────────────┐              │
│               │                                               │              │
│               ▼                                               ▼              │
│   ┌───────────────────────┐               ┌───────────────────────┐          │
│   │      LOCAL FIRST      │               │     CLOUD SYNC        │          │
│   │                       │               │                       │          │
│   │  • Privacy default    │  ←── sync ──► │  • Multi-device       │          │
│   │  • Offline capable    │               │  • Backup             │          │
│   │  • No latency         │               │  • Sharing (optional) │          │
│   │  • Free (no API cost) │               │  • Scale beyond local │          │
│   │                       │               │                       │          │
│   └───────────────────────┘               └───────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Local Storage Options (Primary)

| Solution | Best For | Stack Compatibility | Vector Support | Speed |
|----------|----------|---------------------|----------------|-------|
| **ObjectBox** | Swift apps | Swift native | ✅ HNSW index | ⭐⭐⭐⭐⭐ |
| **sqlite-vss** | Any stack | Universal | ✅ IVF index | ⭐⭐⭐⭐ |
| **LanceDB** | ML-heavy apps | Python/Rust | ✅ Built-in | ⭐⭐⭐⭐ |
| **Chroma** | RAG prototyping | Python/REST | ✅ HNSW | ⭐⭐⭐ |
| **Qdrant (local)** | Production local | Rust/REST | ✅ HNSW | ⭐⭐⭐⭐⭐ |

#### sqlite-vss (Recommended for Tauri)

```rust
// Rust/Tauri - sqlite with vector search extension
use rusqlite::{Connection, params};

fn setup_vector_db() -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open("bubble_voice.db")?;
    
    // Load vector search extension
    unsafe { conn.load_extension("vector0", None)?; }
    unsafe { conn.load_extension("vss0", None)?; }
    
    // Create tables
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            created_at TEXT,
            summary TEXT
        );
        
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            role TEXT,
            content TEXT,
            timestamp TEXT,
            embedding BLOB,  -- 384-dim float32 vector
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );
        
        CREATE VIRTUAL TABLE IF NOT EXISTS message_vectors USING vss0(
            embedding(384)  -- dimension matches your embedding model
        );
    "#)?;
    
    Ok(conn)
}

// Search similar messages
fn search_similar(conn: &Connection, query_vec: &[f32], limit: usize) -> Vec<String> {
    let mut stmt = conn.prepare(r#"
        SELECT m.content, v.distance
        FROM message_vectors v
        JOIN messages m ON v.rowid = m.rowid
        WHERE vss_search(v.embedding, ?)
        LIMIT ?
    "#).unwrap();
    
    // ... execute and return results
}
```

#### ObjectBox (Recommended for Swift)

```swift
// Swift - ObjectBox with HNSW vector index
import ObjectBox

/// objectbox: entity
class MemoryChunk: Entity {
    var id: Id = 0
    var content: String = ""
    var role: String = ""
    var timestamp: Date = Date()
    var conversationId: String = ""
    
    /// objectbox:hnswIndex: dimensions=384, distanceType="Cosine"
    var embedding: [Float]? = nil
}

// Vector search
func searchSimilar(query: [Float], limit: Int = 10) -> [MemoryChunk] {
    let box = store.box(for: MemoryChunk.self)
    let results = try! box.query()
        .nearest(property: MemoryChunk.embedding, to: query, maxCount: UInt64(limit))
        .build()
        .find()
    return results
}
```

---

### Cloud Hosting Options (Optional Sync/Backup)

| Service | Type | Vector Search | Price (1M vectors) | Best For |
|---------|------|---------------|-------------------|----------|
| **Convex** | BaaS + Vectors | ✅ Native | ~$25-50/mo | Real-time sync, full backend |
| **Supabase** | Postgres + pgvector | ✅ pgvector | ~$25-100/mo | SQL familiarity, auth included |
| **Pinecone** | Vector-only | ✅ Native | ~$70-200/mo | Pure vector workloads at scale |
| **Qdrant Cloud** | Vector + metadata | ✅ HNSW | ~$50-150/mo | High performance, self-host option |
| **Weaviate Cloud** | Vector + hybrid | ✅ HNSW | ~$50-200/mo | Hybrid search (text + vector) |
| **Turso** | SQLite edge | ✅ via extensions | ~$20/mo | SQLite in cloud, global edge |
| **Firebase** | NoSQL | ❌ (use extension) | Pay-per-use | Auth, real-time, ecosystem |

#### Convex (Recommended for Real-Time Sync)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    userId: v.string(),
    createdAt: v.number(),
    summary: v.optional(v.string()),
    localId: v.string(),  // For local-first sync
  }).index("by_user", ["userId"]),
  
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.string(),
    content: v.string(),
    timestamp: v.number(),
    embedding: v.array(v.float64()),  // 384-dim vector
  })
  .index("by_conversation", ["conversationId"])
  .vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 384,
    filterFields: ["conversationId"],
  }),
});

// convex/messages.ts - Vector search
import { action } from "./_generated/server";
import { v } from "convex/values";

export const searchSimilar = action({
  args: {
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.vectorSearch("messages", "by_embedding", {
      vector: args.queryEmbedding,
      limit: args.limit ?? 10,
    });
    
    // Load full documents
    const messages = await Promise.all(
      results.map(r => ctx.runQuery(internal.messages.getById, { id: r._id }))
    );
    
    return messages;
  },
});
```

#### Supabase (Recommended for SQL + Auth)

```typescript
// Supabase with pgvector
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Schema (run in SQL editor)
/*
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  embedding VECTOR(384)
);

CREATE INDEX ON messages 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
*/

// Search similar
async function searchSimilar(queryEmbedding: number[], limit = 10) {
  const { data, error } = await supabase.rpc('match_messages', {
    query_embedding: queryEmbedding,
    match_count: limit,
  });
  return data;
}
```

---

### Hybrid Architecture: Local-First with Cloud Sync

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Local-First Sync Architecture                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Mac App (Primary)                            │    │
│  │                                                                      │    │
│  │    ┌──────────────────────────────────────────────────────────┐     │    │
│  │    │                 Local SQLite + sqlite-vss                 │     │    │
│  │    │                                                           │     │    │
│  │    │  • All conversations stored locally                       │     │    │
│  │    │  • Vector embeddings computed locally (MLX/Ollama)        │     │    │
│  │    │  • Search happens locally first (fastest)                 │     │    │
│  │    │  • Works fully offline                                    │     │    │
│  │    │                                                           │     │    │
│  │    └────────────────────────┬─────────────────────────────────┘     │    │
│  │                             │                                        │    │
│  │                     sync_queue table                                 │    │
│  │                     (pending uploads)                                │    │
│  │                             │                                        │    │
│  └─────────────────────────────┼───────────────────────────────────────┘    │
│                                │                                             │
│                    ┌───────────┴───────────┐                                │
│                    │     Sync Service      │                                │
│                    │   (when online)       │                                │
│                    └───────────┬───────────┘                                │
│                                │                                             │
│  ┌─────────────────────────────┴───────────────────────────────────────┐    │
│  │                         Cloud Backend                                │    │
│  │                                                                      │    │
│  │    Option A: Convex          Option B: Supabase      Option C: Own  │    │
│  │    ┌──────────────┐          ┌──────────────┐        ┌──────────┐   │    │
│  │    │ Real-time DB │          │ Postgres +   │        │ VPS +    │   │    │
│  │    │ Vector index │          │ pgvector     │        │ Qdrant   │   │    │
│  │    │ Auth built-in│          │ Auth built-in│        │ Custom   │   │    │
│  │    └──────────────┘          └──────────────┘        └──────────┘   │    │
│  │                                                                      │    │
│  │    Benefits:                                                         │    │
│  │    • Backup (never lose data)                                       │    │
│  │    • Multi-device sync (future: iPhone, iPad)                       │    │
│  │    • Larger context search (beyond local storage)                   │    │
│  │    • Optional: Share/export conversations                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Sync Strategy: CRDTs or Last-Write-Wins

```typescript
// Simple sync queue approach
interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  localTimestamp: number;
  synced: boolean;
}

// On message create (local)
async function createMessage(msg: Message) {
  // 1. Write to local DB immediately
  await localDb.messages.insert(msg);
  
  // 2. Add to sync queue
  await localDb.syncQueue.insert({
    id: crypto.randomUUID(),
    operation: 'create',
    table: 'messages',
    data: msg,
    localTimestamp: Date.now(),
    synced: false,
  });
  
  // 3. Trigger background sync (if online)
  syncService.triggerSync();
}

// Background sync worker
async function syncToCloud() {
  const pending = await localDb.syncQueue
    .where('synced', false)
    .orderBy('localTimestamp')
    .toArray();
  
  for (const item of pending) {
    try {
      await cloudApi.sync(item);
      await localDb.syncQueue.update(item.id, { synced: true });
    } catch (e) {
      // Will retry on next sync
      console.log('Sync failed, will retry:', e);
    }
  }
}
```

---

### Cost Comparison (Monthly, 1M vectors, moderate usage)

| Approach | Storage Cost | Compute Cost | Total | Notes |
|----------|-------------|--------------|-------|-------|
| **Local only** | $0 | $0 | **$0** | Mac storage is free |
| **Local + Convex** | ~$25 | ~$25 | **~$50** | Great DX, real-time |
| **Local + Supabase** | ~$25 | ~$25 | **~$50** | SQL, auth included |
| **Local + Turso** | ~$10 | ~$10 | **~$20** | SQLite everywhere |
| **Local + Pinecone** | ~$70 | ~$30 | **~$100** | Best for vector-only |
| **Local + self-hosted** | ~$10 (VPS) | included | **~$10** | Most work, most control |

---

### Recommendation by Use Case

| Use Case | Local Storage | Cloud Sync | Why |
|----------|--------------|------------|-----|
| **Single Mac, privacy-focused** | sqlite-vss | None | Simplest, free, private |
| **Single Mac, wants backup** | sqlite-vss | Turso | SQLite everywhere, cheap |
| **Multi-device future** | sqlite-vss | Convex | Real-time sync, vectors |
| **Already using Supabase** | sqlite-vss | Supabase | Consistent stack |
| **Enterprise/scale** | Qdrant local | Qdrant Cloud | Best performance |

---

## 📝 Notes

- **Ollama sidecar** is the easiest path to local LLM regardless of stack
- **`say` command** works from any stack - it's just a shell call
- **Framer Motion** is the gold standard for React animations
- **MLX is faster** but Rust/Candle is catching up
- **Menu bar** is straightforward in both Tauri and Swift
- **Not being on App Store** means you can use `Process()` freely for `say`, Ollama, etc.
- **Local-first** is the right default - cloud is optional backup/sync
- **Convex** is my top pick if you want cloud - real-time + vectors + great DX
- **Supabase** if you prefer SQL and want auth out of the box
- **sqlite-vss** keeps everything portable and works offline forever

**My personal bias:** I can write excellent React + Framer Motion code very quickly. SwiftUI is also strong, but the web animation ecosystem is more mature for novel effects.
