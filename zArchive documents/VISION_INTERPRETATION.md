# Bubble Voice - Vision Interpretation & Architecture

**Created:** 2026-01-16  
**Updated:** 2026-01-16 (Voice commands, JSON→Native UI correction)  
**Purpose:** Deep analysis and interpretation of the Bubble Voice product vision, synthesizing all concepts into a coherent architecture.

---

## 📋 Vision Summary

Bubble Voice is a **voice-native AI companion** that:

1. **Generates multiple asset types** during conversation (text, native UI components, images)
2. **Surfaces "afterthought bubbles"** - real-time micro-prompts while you speak
3. **Creates persistent artifacts** - JSON data rendered by native UI components (not HTML)
4. **Provides an editable speech input** - see your words as you speak, edit in flight
5. **Maintains context** through sophisticated summarization and vector retrieval
6. **Voice-controlled** via wake words and commands ("hey Turtle", "hey Rabbit")

---

## 🎙️ Voice Commands & Wake Words

### Why "Turtle" and "Rabbit"?

Based on testing, these words have **high STT accuracy** with Apple's speech recognition:
- "Turtle" - distinct consonants, rarely misheard
- "Rabbit" - clear phonetics, high confidence
- "Bubble" - on-brand but test accuracy first

### Command Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              VOICE COMMAND SYSTEM                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   WAKE WORDS (Always Listening Mode)                                                        │
│   ──────────────────────────────────                                                        │
│                                                                                              │
│   "Hey Turtle" / "Hey Rabbit"  →  Activates listening mode                                  │
│                                                                                              │
│   Once activated, these COMMANDS work:                                                       │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  COMMAND              │  ACTION                                                      │   │
│   ├───────────────────────┼─────────────────────────────────────────────────────────────┤   │
│   │  "Stop" / "Nevermind" │  Cancel current action, stop listening                      │   │
│   │  "Pause"              │  Pause conversation, keep context                            │   │
│   │  "Interrupt"          │  Stop AI from speaking                                       │   │
│   │  "Start over"         │  Reset current artifact/conversation                        │   │
│   │  "Go back"            │  Revert last change                                          │   │
│   │  "Show [artifact]"    │  Bring artifact into view                                   │   │
│   │  "Save that"          │  Save current bubble/response to notes                      │   │
│   │  "Remind me"          │  Schedule a callback reminder                                │   │
│   │  "Read it back"       │  TTS reads last response                                    │   │
│   │  "Louder" / "Softer"  │  Adjust TTS volume                                          │   │
│   │  "Faster" / "Slower"  │  Adjust TTS speed                                           │   │
│   └───────────────────────┴─────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│   IMPLEMENTATION                                                                             │
│   ──────────────────                                                                        │
│                                                                                              │
│   // Continuous lightweight STT for wake word detection                                     │
│   class WakeWordDetector {                                                                  │
│       let wakeWords = ["hey turtle", "hey rabbit", "hey bubble"]                           │
│       let commands = ["stop", "pause", "interrupt", "start over", ...]                     │
│                                                                                              │
│       func processTranscription(_ text: String) {                                           │
│           let lowered = text.lowercased()                                                   │
│                                                                                              │
│           // Check for wake word                                                            │
│           if wakeWords.contains(where: { lowered.contains($0) }) {                         │
│               activateListening()                                                           │
│               return                                                                        │
│           }                                                                                  │
│                                                                                              │
│           // If active, check for commands                                                  │
│           if isListening {                                                                  │
│               for command in commands {                                                     │
│                   if lowered.hasPrefix(command) {                                          │
│                       executeCommand(command, context: lowered)                            │
│                       return                                                                │
│                   }                                                                         │
│               }                                                                             │
│               // No command matched - treat as conversation input                           │
│               processAsConversation(text)                                                   │
│           }                                                                                  │
│       }                                                                                      │
│   }                                                                                          │
│                                                                                              │
│   MENU BAR INTEGRATION                                                                       │
│   ────────────────────                                                                      │
│                                                                                              │
│   Menu bar icon shows state:                                                                 │
│   🔇 Idle (gray) - not listening                                                            │
│   👂 Listening (green pulse) - wake word detected                                           │
│   🎙️ Active (blue) - in conversation                                                        │
│   🔔 Reminder (orange) - scheduled callback pending                                         │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Core Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              BUBBLE VOICE ARCHITECTURE                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           LEFT PANEL: CHAT LIST                                      │   │
│   │                                                                                      │   │
│   │   📅 Today                                                                          │   │
│   │   ├── Morning Check-in ⚡                                                           │   │
│   │   └── Project Planning                                                              │   │
│   │   📅 Yesterday                                                                      │   │
│   │   └── Fitness Goals Review                                                          │   │
│   │                                                                                      │   │
│   │   🔔 Scheduled:                                                                      │   │
│   │   └── Evening Reflection (6:30 PM)                                                  │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│   ┌──────────────────────────────────────────────────────┬──────────────────────────────┐   │
│   │                  CENTER: ARTIFACT VIEWER              │    RIGHT: VOICE INTERFACE    │   │
│   │                                                       │                              │   │
│   │   ┌─────────────────────────────────────────────┐    │    ┌────────────────────┐    │   │
│   │   │                                             │    │    │   TRANSCRIPT       │    │   │
│   │   │   [Generated HTML Component]                │    │    │                    │    │   │
│   │   │                                             │    │    │   🧑 You:          │    │   │
│   │   │   - Progress Chart                          │    │    │   "I've been       │    │   │
│   │   │   - Data Table                              │    │    │   thinking about..." │   │   │
│   │   │   - Interactive Elements                    │    │    │                    │    │   │
│   │   │                                             │    │    │   🤖 Bubble:       │    │   │
│   │   │   [AI-Generated Image]                      │    │    │   "That sounds..." │    │   │
│   │   │                                             │    │    │                    │    │   │
│   │   └─────────────────────────────────────────────┘    │    └────────────────────┘    │   │
│   │                                                       │                              │   │
│   │   Artifacts: [Chart] [Image] [Table] [Notes]         │    ┌────────────────────┐    │   │
│   │              ↑ click to switch view                  │    │   BUBBLES          │    │   │
│   │                                                       │    │                    │    │   │
│   └───────────────────────────────────────────────────────│    │   💭 "deadlines?"  │    │   │
│                                                           │    │   💭 "team sync?"  │    │   │
│                                                           │    │   💭 "blockers?"   │    │   │
│                                                           │    │   💭 "next steps?" │    │   │
│                                                           │    │                    │    │   │
│                                                           │    └────────────────────┘    │   │
│                                                           │                              │   │
│                                                           │    ┌────────────────────┐    │   │
│                                                           │    │ EDITABLE INPUT     │    │   │
│                                                           │    │                    │    │   │
│                                                           │    │ "I think we should │    │   │
│                                                           │    │  prioritize the█"  │    │   │
│                                                           │    │  ↑ edit in flight  │    │   │
│                                                           │    │                    │    │   │
│                                                           │    │  [🎙️ Speaking...]   │    │   │
│                                                           │    └────────────────────┘    │   │
│                                                           │                              │   │
│                                                           └──────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🫧 The "Bubbles" System

### What Are Bubbles?

Bubbles are **AI-generated afterthoughts** - short prompts (≤7 words) that surface while the user or AI is speaking. They represent:

- Questions the AI thinks might be relevant
- Topics adjacent to what's being discussed  
- Prompts to explore deeper
- Reminders of related past conversations

### Bubble Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              BUBBLE GENERATION SYSTEM                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   User speaks: "I've been struggling with the project timeline..."                          │
│                              │                                                               │
│                              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                    PARALLEL PROCESSING (Lightweight Agent)                           │   │
│   │                                                                                      │   │
│   │   Main Agent:                         Bubble Agent (Separate):                       │   │
│   │   - Full response generation          - Fast, cheap model (Gemini Flash)            │   │
│   │   - Context retrieval                 - Structured output: array of 7-word strings  │   │
│   │   - TTS synthesis                     - Low latency priority                        │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                               │
│                              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           BUBBLE OUTPUT (JSON)                                       │   │
│   │                                                                                      │   │
│   │   {                                                                                  │   │
│   │     "bubbles": [                                                                     │   │
│   │       { "text": "What's the main blocker?", "type": "question" },                   │   │
│   │       { "text": "Team capacity issues?", "type": "probe" },                         │   │
│   │       { "text": "Similar to last quarter", "type": "memory" },                      │   │
│   │       { "text": "Deadline flexibility?", "type": "question" }                       │   │
│   │     ]                                                                                │   │
│   │   }                                                                                  │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                              │                                                               │
│                              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         UI DISPLAY OPTIONS                                           │   │
│   │                                                                                      │   │
│   │   Mode A: Floating Bubbles          Mode B: Horizontal Scroll Row                   │   │
│   │   ┌─────────────────────────┐       ┌─────────────────────────────────────────────┐ │   │
│   │   │     💭 "blockers?"      │       │ [deadlines?] [team sync?] [blockers?] [...] │ │   │
│   │   │  💭 "team"      💭 "?"  │       │ ← scroll →                                   │ │   │
│   │   │       💭 "deadline"     │       └─────────────────────────────────────────────┘ │   │
│   │   └─────────────────────────┘                                                        │   │
│   │                                                                                      │   │
│   │   User taps bubble → Saved to context + potentially triggers deeper exploration     │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Bubble Schema

```typescript
interface BubbleOutput {
  bubbles: Bubble[];
}

interface Bubble {
  text: string;          // Max 7 words
  type: 'question' | 'probe' | 'memory' | 'suggestion' | 'action';
  confidence: number;    // 0-1, for filtering
  vectorContext?: string; // Optional: what memory triggered this
}

// System prompt for bubble agent
const BUBBLE_SYSTEM_PROMPT = `
You generate conversational afterthoughts as short bubbles (≤7 words each).

Given the current conversation context, generate 3-5 bubbles that:
- Ask relevant follow-up questions
- Probe deeper into mentioned topics
- Reference related past conversations (if context provided)
- Suggest potential actions or next steps

Keep each bubble conversational, not formal. Like thoughts that bubble up naturally.

Output JSON with array of bubbles. Each bubble max 7 words.
`;
```

---

## ✏️ Editable Speech Input

### The Novel Text Input UX

Unlike typical voice assistants, users see their speech appear as text in an **editable text field** and can modify it in real-time:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           EDITABLE SPEECH INPUT                                              │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   User speaks: "I think we should prioritize the backend work first"                        │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                                      │   │
│   │   "I think we should prioritize the backend█ work first"                            │   │
│   │                                           ↑                                          │   │
│   │                          Speech appends here (at front of buffer)                    │   │
│   │                                                                                      │   │
│   │   Meanwhile, user can:                                                               │   │
│   │   - Click anywhere to place cursor                                                   │   │
│   │   - Edit/delete previous words                                                       │   │
│   │   - Incoming speech continues at "front" of buffer                                   │   │
│   │                                                                                      │   │
│   │   ┌────────────────────────────────────────────────────────────────────────┐        │   │
│   │   │  Spoken Buffer (appending) │█│ Cursor │ Previously Spoken (editable) │        │   │
│   │   └────────────────────────────────────────────────────────────────────────┘        │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│   Benefits:                                                                                  │
│   ✅ Correct speech recognition errors in real-time                                          │
│   ✅ Refine your thought before sending                                                      │
│   ✅ Add text via keyboard while speaking continues                                          │
│   ✅ Natural hybrid of voice + text input                                                    │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```swift
class EditableSpeechInputManager: ObservableObject {
    @Published var fullText: String = ""
    @Published var cursorPosition: Int = 0
    @Published var speechInsertPoint: Int = 0  // Where new speech goes
    
    /// Called when speech recognition provides new text
    func appendSpeech(_ newText: String) {
        // Insert at speech insert point, not cursor
        let insertIndex = fullText.index(fullText.startIndex, offsetBy: speechInsertPoint)
        fullText.insert(contentsOf: newText, at: insertIndex)
        speechInsertPoint += newText.count
        
        // Don't move user's cursor if they're editing elsewhere
        if cursorPosition >= speechInsertPoint - newText.count {
            cursorPosition += newText.count
        }
    }
    
    /// Called when user types/edits manually
    func userEdit(at range: Range<Int>, replacement: String) {
        let startIndex = fullText.index(fullText.startIndex, offsetBy: range.lowerBound)
        let endIndex = fullText.index(fullText.startIndex, offsetBy: range.upperBound)
        fullText.replaceSubrange(startIndex..<endIndex, with: replacement)
        
        // Adjust speech insert point if editing before it
        let delta = replacement.count - (range.upperBound - range.lowerBound)
        if range.lowerBound < speechInsertPoint {
            speechInsertPoint = max(range.lowerBound, speechInsertPoint + delta)
        }
    }
}
```

### Optional: Beautification Pass

For short inputs, run a quick LLM pass to clean up:

```typescript
const beautifyPrompt = `
Fix grammar, punctuation, and clarity. Keep meaning identical.
Do not add or change ideas. Just clean up speech-to-text artifacts.
If input is clear, return unchanged.

Input: "${rawSpeechText}"
`;

// Only beautify if under ~50 words to stay fast
if (wordCount(rawSpeechText) < 50) {
  const beautified = await llm.generate(beautifyPrompt, { maxTokens: 100 });
  // Show diff to user for approval, or auto-apply with undo
}
```

---

## 🎨 Artifact Generation: JSON → Native UI Components

### Why NOT HTML?

You raised an excellent point: **if the LLM outputs JSON, why render HTML?**

Native UI components are better because:
- ✅ **No hallucination risk** for layout/styling - LLM only touches data
- ✅ **Consistent look and feel** - matches your app's design system
- ✅ **Better performance** - native components, not WebView
- ✅ **Easier persistence** - just save/load JSON
- ✅ **Type-safe** - schema validation catches errors
- ✅ **Your existing stack** - SwiftUI/React components you already know

### Architecture: Bounded Component Types

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                     JSON → NATIVE UI ARCHITECTURE                                            │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   LLM outputs JSON with type discriminator → Native component renders deterministically     │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         COMPONENT TYPE REGISTRY                                      │   │
│   │                                                                                      │   │
│   │   type: "progress_chart"                                                             │   │
│   │   ┌─────────────────────────────────────────────────────────────────────────────┐   │   │
│   │   │  {                                       SwiftUI:                            │   │   │
│   │   │    "type": "progress_chart",             ProgressChartView(data: data)       │   │   │
│   │   │    "title": "Fitness Goals",                                                 │   │   │
│   │   │    "progress": 0.75,                     React:                              │   │   │
│   │   │    "goal": "Run 5k by March",            <ProgressChart {...data} />         │   │   │
│   │   │    "milestones": [...]                                                       │   │   │
│   │   │  }                                                                           │   │   │
│   │   └─────────────────────────────────────────────────────────────────────────────┘   │   │
│   │                                                                                      │   │
│   │   type: "data_table"                                                                 │   │
│   │   ┌─────────────────────────────────────────────────────────────────────────────┐   │   │
│   │   │  {                                       SwiftUI:                            │   │   │
│   │   │    "type": "data_table",                 DataTableView(data: data)           │   │   │
│   │   │    "title": "Weekly Schedule",                                               │   │   │
│   │   │    "columns": ["Day", "Task", "Status"], React:                              │   │   │
│   │   │    "rows": [...]                         <DataTable {...data} />             │   │   │
│   │   │  }                                                                           │   │   │
│   │   └─────────────────────────────────────────────────────────────────────────────┘   │   │
│   │                                                                                      │   │
│   │   type: "comparison_card"                                                            │   │
│   │   ┌─────────────────────────────────────────────────────────────────────────────┐   │   │
│   │   │  {                                       SwiftUI:                            │   │   │
│   │   │    "type": "comparison_card",            ComparisonCardView(data: data)      │   │   │
│   │   │    "title": "Pros vs Cons",                                                  │   │   │
│   │   │    "pros": [...],                        React:                              │   │   │
│   │   │    "cons": [...]                         <ComparisonCard {...data} />        │   │   │
│   │   │  }                                                                           │   │   │
│   │   └─────────────────────────────────────────────────────────────────────────────┘   │   │
│   │                                                                                      │   │
│   │   type: "timeline"                                                                   │   │
│   │   type: "checklist"                                                                  │   │
│   │   type: "metric_card"                                                                │   │
│   │   type: "summary_card"                                                               │   │
│   │   type: "reminder_list"                                                              │   │
│   │   type: "image_with_caption"   ← For AI-generated images                            │   │
│   │                                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### TypeScript/Swift Schema Definitions

```typescript
// Discriminated union for all artifact types
type Artifact = 
  | ProgressChartArtifact
  | DataTableArtifact
  | ComparisonCardArtifact
  | TimelineArtifact
  | ChecklistArtifact
  | MetricCardArtifact
  | ImageArtifact;

interface ProgressChartArtifact {
  type: "progress_chart";
  title: string;
  progress: number;        // 0-1
  goal: string;
  milestones?: { label: string; completed: boolean }[];
  color?: string;          // Optional theming
}

interface DataTableArtifact {
  type: "data_table";
  title: string;
  columns: string[];
  rows: Record<string, string | number>[];
  sortable?: boolean;
  highlightRow?: number;
}

interface ComparisonCardArtifact {
  type: "comparison_card";
  title: string;
  pros: { text: string; weight?: number }[];
  cons: { text: string; weight?: number }[];
}

interface ImageArtifact {
  type: "image_with_caption";
  imageUrl: string;        // Generated image URL
  caption: string;
  generationPrompt: string; // For regeneration
}

// LLM structured output schema
const ARTIFACT_SCHEMA = {
  type: "object",
  properties: {
    artifact: {
      oneOf: [
        { $ref: "#/definitions/progress_chart" },
        { $ref: "#/definitions/data_table" },
        { $ref: "#/definitions/comparison_card" },
        // ... other types
      ]
    }
  },
  definitions: {
    progress_chart: {
      type: "object",
      properties: {
        type: { const: "progress_chart" },
        title: { type: "string" },
        progress: { type: "number", minimum: 0, maximum: 1 },
        goal: { type: "string" },
        milestones: { type: "array", items: { /* ... */ } }
      },
      required: ["type", "title", "progress", "goal"]
    },
    // ... other definitions
  }
};
```

```swift
// Swift equivalent with Codable
enum Artifact: Codable {
    case progressChart(ProgressChartData)
    case dataTable(DataTableData)
    case comparisonCard(ComparisonCardData)
    case timeline(TimelineData)
    case checklist(ChecklistData)
    case image(ImageData)
    
    // Custom decoding based on "type" field
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        
        switch type {
        case "progress_chart":
            self = .progressChart(try ProgressChartData(from: decoder))
        case "data_table":
            self = .dataTable(try DataTableData(from: decoder))
        // ... etc
        default:
            throw DecodingError.dataCorrupted(...)
        }
    }
}

struct ProgressChartData: Codable {
    let title: String
    let progress: Double
    let goal: String
    let milestones: [Milestone]?
}

// SwiftUI view that renders any artifact
struct ArtifactView: View {
    let artifact: Artifact
    
    var body: some View {
        switch artifact {
        case .progressChart(let data):
            ProgressChartView(data: data)
        case .dataTable(let data):
            DataTableView(data: data)
        case .comparisonCard(let data):
            ComparisonCardView(data: data)
        // ... etc
        }
    }
}
```

### Update Strategy: JSON Patches

Since we're working with JSON, updates are **surgical and safe**:

```typescript
interface ArtifactUpdate {
  artifactId: string;
  operation: "set" | "append" | "remove" | "replace";
  path: string;           // JSON path like "milestones[2].completed"
  value?: any;            // New value for set/append/replace
}

// LLM outputs updates, not full artifacts
const UPDATE_SCHEMA = {
  type: "object",
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          artifactId: { type: "string" },
          operation: { enum: ["set", "append", "remove", "replace"] },
          path: { type: "string" },
          value: {}
        }
      }
    }
  }
};

// Example: User says "Mark the first milestone as complete"
// LLM outputs:
{
  "updates": [
    {
      "artifactId": "fitness_progress_001",
      "operation": "set",
      "path": "milestones[0].completed",
      "value": true
    }
  ]
}

// Apply with JSON patch library (safe, reversible)
import jsonpatch from 'fast-json-patch';

function applyUpdates(artifact: Artifact, updates: ArtifactUpdate[]): Artifact {
  const patches = updates.map(u => ({
    op: u.operation === 'set' ? 'replace' : u.operation,
    path: '/' + u.path.replace(/\./g, '/').replace(/\[(\d+)\]/g, '/$1'),
    value: u.value
  }));
  
  return jsonpatch.applyPatch(artifact, patches).newDocument;
}
```

### Graceful Failure & Revert

```typescript
interface ArtifactVersion {
  id: string;
  data: Artifact;         // Just JSON - small, fast to save
  timestamp: Date;
  changeDescription: string;
}

class ArtifactManager {
  private versions: Map<string, ArtifactVersion[]> = new Map();
  
  async applyUpdate(artifactId: string, updates: ArtifactUpdate[]): Promise<Artifact> {
    const current = this.getCurrent(artifactId);
    
    // Save checkpoint before update
    this.checkpoint(artifactId, "Before: " + updates.map(u => u.path).join(", "));
    
    try {
      // Apply JSON patches
      const updated = applyUpdates(current, updates);
      
      // Validate against schema
      if (!this.validateArtifact(updated)) {
        throw new Error("Invalid artifact after update");
      }
      
      return this.saveCurrent(artifactId, updated);
      
    } catch (error) {
      // Revert to checkpoint
      return this.revert(artifactId);
    }
  }
  
  revert(artifactId: string): Artifact {
    const versions = this.versions.get(artifactId) || [];
    if (versions.length > 1) {
      versions.pop(); // Remove failed version
      return versions[versions.length - 1].data;
    }
    return this.getCurrent(artifactId);
  }
  
  // User says "start over"
  async recreate(artifactId: string, instruction: string): Promise<Artifact> {
    // Clear history, generate fresh
    this.versions.delete(artifactId);
    const newArtifact = await this.generateFromScratch(instruction);
    return this.saveCurrent(artifactId, newArtifact);
  }
}
```

---

## 🧠 Context Management: Preventing Degradation

### The Problem

Research shows:
- **26% creativity loss** when forcing structured output
- **Context rot** - performance degrades with more tokens
- **Hallucinations increase** with complex multi-task prompts

### Solution: Separation of Concerns

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                       CONTEXT MANAGEMENT ARCHITECTURE                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   Instead of one overloaded agent, use specialized agents:                                  │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                         AGENT ORCHESTRATOR                                           │   │
│   │                                                                                      │   │
│   │   Receives: User message + RAG context + conversation history                        │   │
│   │   Routes to appropriate sub-agents in parallel                                       │   │
│   │                                                                                      │   │
│   └────────────────────────────────┬────────────────────────────────────────────────────┘   │
│                                    │                                                         │
│         ┌──────────────────────────┼──────────────────────────────────────┐                 │
│         │                          │                                      │                 │
│         ▼                          ▼                                      ▼                 │
│   ┌───────────────┐     ┌───────────────────┐              ┌───────────────────────────┐   │
│   │ CONVERSATION  │     │  BUBBLE AGENT     │              │     ARTIFACT AGENT        │   │
│   │    AGENT      │     │                   │              │                           │   │
│   │               │     │  Model: Flash     │              │  Model: Sonnet/GPT-4o     │   │
│   │ Model: Best   │     │  Task: Generate   │              │  Task: HTML patch/update  │   │
│   │ Task: Response│     │  afterthought     │              │  Separate context         │   │
│   │ + TTS text    │     │  bubbles (7 words)│              │  Has templates            │   │
│   │               │     │                   │              │                           │   │
│   └───────┬───────┘     └─────────┬─────────┘              └─────────────┬─────────────┘   │
│           │                       │                                      │                  │
│           ▼                       ▼                                      ▼                  │
│   ┌───────────────┐     ┌───────────────────┐              ┌───────────────────────────┐   │
│   │  Voice + Text │     │  Bubble Display   │              │  Artifact Viewer          │   │
│   │    Output     │     │  (tap to save)    │              │  (versioned, revertable)  │   │
│   └───────────────┘     └───────────────────┘              └───────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Summarization Strategy

```typescript
interface ConversationEntry {
  id: string;
  messages: Message[];
  summary?: string;           // Compressed version
  artifacts: ArtifactRef[];   // References to generated HTML/images
  bubblesSaved: Bubble[];     // Bubbles user tapped
  vectorChunks: string[];     // IDs of indexed chunks
}

class ContextManager {
  // Maximum tokens before summarization kicks in
  static MAX_CONTEXT_TOKENS = 8000;
  static SUMMARY_THRESHOLD = 6000;
  
  async prepareContext(conversation: ConversationEntry): Promise<string> {
    const tokenCount = this.countTokens(conversation.messages);
    
    if (tokenCount > this.SUMMARY_THRESHOLD) {
      // Summarize older messages, keep recent ones
      const summarized = await this.summarizeOlder(conversation.messages);
      return this.formatContext(summarized);
    }
    
    return this.formatContext(conversation.messages);
  }
  
  async summarizeOlder(messages: Message[]): Promise<Message[]> {
    // Keep last 10 messages intact
    const recentMessages = messages.slice(-10);
    const olderMessages = messages.slice(0, -10);
    
    // Summarize older messages
    const summary = await this.generateSummary(olderMessages);
    
    // Return summary + recent as context
    return [
      { role: 'system', content: `Previous conversation summary: ${summary}` },
      ...recentMessages
    ];
  }
  
  // Artifacts are NOT summarized - they're referenced
  // Instead, we keep artifact IDs and can load them on demand
  formatArtifactReferences(artifacts: ArtifactRef[]): string {
    return artifacts.map(a => 
      `[Artifact: ${a.type} - "${a.title}" - ID:${a.id}]`
    ).join('\n');
  }
}
```

---

## 🔍 Vector Retrieval: Smart Context Injection

### Two-Tier Retrieval

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          VECTOR RETRIEVAL STRATEGY                                           │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│   TIER 1: Automatic (Every Prompt)                                                          │
│   ────────────────────────────────                                                          │
│   - Small, fixed context injection                                                           │
│   - 3-5 most relevant chunks                                                                │
│   - Fast embedding + search (<50ms)                                                          │
│   - Always included in prompt                                                                │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  User: "How's my fitness progress?"                                                  │   │
│   │                                                                                      │   │
│   │  Auto-injected context (3 chunks):                                                   │   │
│   │  - [2 days ago] "Completed 5k run, feeling strong"                                  │   │
│   │  - [1 week ago] "Set goal: run 5k by end of month"                                  │   │
│   │  - [Profile] "User prioritizes cardio over strength training"                       │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
│   TIER 2: Tool Call (On Demand)                                                             │
│   ────────────────────────────                                                              │
│   - Triggered when agent needs more context                                                  │
│   - Larger retrieval (10-20 chunks)                                                          │
│   - Different query strategies                                                               │
│   - Agent explicitly requests via function call                                              │
│                                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  Agent thinks: "User mentioned 'that conversation last week' - need to retrieve"    │   │
│   │                                                                                      │   │
│   │  Tool call:                                                                          │   │
│   │  {                                                                                   │   │
│   │    "function": "retrieve_context",                                                   │   │
│   │    "arguments": {                                                                    │   │
│   │      "query": "conversation last week about project",                               │   │
│   │      "timeRange": "7d",                                                              │   │
│   │      "limit": 15,                                                                    │   │
│   │      "includeArtifacts": true                                                        │   │
│   │    }                                                                                 │   │
│   │  }                                                                                   │   │
│   │                                                                                      │   │
│   │  Returns: Expanded context with full conversation excerpts                          │   │
│   └─────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                              │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🖼️ Image Generation Strategy

### When to Generate Images

```typescript
interface ImageDecision {
  shouldGenerate: boolean;
  prompt?: string;
  timing: 'immediate' | 'background' | 'skip';
  reason: string;
}

// System prompt for deciding image generation
const IMAGE_DECISION_PROMPT = `
Decide if an image would enhance this conversation moment.

Generate images when:
- User describes something visual (places, scenes, objects)
- Celebrating an achievement (show celebration imagery)
- Explaining abstract concepts (visualize for clarity)
- User explicitly requests visualization

Skip images when:
- Pure factual Q&A
- Technical discussions
- User seems to want quick response
- Already generated image recently in this conversation

Output: { shouldGenerate, prompt (if yes), timing, reason }
`;
```

### Cost-Conscious Implementation

```typescript
class ImageGenerationManager {
  private imagesThisConversation = 0;
  private maxImagesPerConversation = 3;  // Cost control
  
  async maybeGenerateImage(context: string): Promise<string | null> {
    // Budget check
    if (this.imagesThisConversation >= this.maxImagesPerConversation) {
      return null;
    }
    
    // Decision LLM (cheap model)
    const decision = await this.decideImage(context);
    
    if (!decision.shouldGenerate) {
      return null;
    }
    
    // Generate in background (don't block voice)
    if (decision.timing === 'background') {
      this.generateInBackground(decision.prompt!);
      return null;  // Image will appear when ready
    }
    
    // Immediate generation
    this.imagesThisConversation++;
    return await this.generateImage(decision.prompt!);
  }
  
  private async generateImage(prompt: string): Promise<string> {
    // Use FLUX.1 Kontext for cheapest option ($0.015)
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${API_KEY}` },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-schnell',
        input: { prompt, aspect_ratio: '16:9' }
      })
    });
    
    // Poll for result (~2 seconds)
    return await this.pollForResult(response);
  }
}
```

---

## 📊 Token Budget & Testing Scenarios

### Recommended Token Allocations

| Component | Token Budget | Notes |
|-----------|-------------|-------|
| **System prompt** | ~500 | Core instructions, persona |
| **RAG context (auto)** | ~1000 | 3-5 chunks auto-injected |
| **Conversation history** | ~3000 | Recent messages |
| **Summarized history** | ~1000 | Compressed older context |
| **Artifact references** | ~200 | IDs + descriptions |
| **User message** | ~500 | Current input |
| **Buffer** | ~800 | Safety margin |
| **TOTAL INPUT** | ~7000 | |
| **Output (response)** | ~1000 | Voice text |
| **Output (bubbles)** | ~100 | 5 bubbles × 7 words |
| **Output (artifact patch)** | ~500 | Patch instructions |

### Test Scenarios to Build

```typescript
const testScenarios = [
  {
    name: "Simple greeting",
    input: "Hey, how are you?",
    expectedArtifacts: [],
    expectedBubbles: ["What's on your mind?", "How's your day going?"],
    expectedImage: false,
  },
  {
    name: "Progress check with chart",
    input: "Show me my fitness progress this week",
    context: { fitnessData: [...] },
    expectedArtifacts: ["html_chart"],
    expectedBubbles: ["Goals on track?", "Any setbacks?", "Next milestone?"],
    expectedImage: false,
  },
  {
    name: "Celebration moment",
    input: "I finally finished the marathon!",
    expectedArtifacts: ["html_card"],
    expectedBubbles: ["What was hardest?", "What's next?", "How do you feel?"],
    expectedImage: true,  // Celebration imagery
    imagePromptContains: "celebration",
  },
  {
    name: "Deep discussion with artifact update",
    input: "Actually, change the deadline to next Friday",
    existingArtifact: "project_timeline.html",
    expectedArtifacts: ["html_patch"],  // Update, not regenerate
    expectedBubbles: ["Any dependencies?", "Team notified?"],
  },
  {
    name: "Long conversation context handling",
    conversationLength: 50,  // 50 messages
    input: "What did I say about the budget last week?",
    expectedBehavior: "summarization + vector retrieval",
  },
];
```

---

## 🎯 Development Discovery Plan

### Phase 1: Baseline Performance (Week 1)

1. **Structured output reliability**
   - Test JSON schema compliance across models
   - Measure failure rate at different context lengths
   - Identify "breaking point" for each model

2. **HTML generation quality**
   - Full regeneration vs patch approach
   - Measure unwanted changes (hallucination wipes)
   - Test revert/recovery mechanisms

3. **Bubble generation**
   - Quality of 7-word outputs
   - Relevance to conversation
   - Latency impact on UX

### Phase 2: Integration Testing (Week 2)

1. **End-to-end flows**
   - Voice → Transcription → LLM → TTS → Playback
   - Parallel bubble generation
   - Artifact creation/update

2. **Context degradation**
   - Performance at 4K, 8K, 16K tokens
   - Summarization effectiveness
   - Vector retrieval accuracy

3. **User interaction patterns**
   - Editable input UX testing
   - Bubble interaction patterns
   - Artifact navigation

### Phase 3: Optimization (Week 3)

1. **Model routing**
   - Which model for which task
   - Cost vs quality tradeoffs
   - Latency optimization

2. **Caching strategies**
   - Common bubble patterns
   - Artifact template caching
   - Embedding cache

3. **Failure handling**
   - Graceful degradation
   - Revert mechanisms
   - User feedback loops

---

## 📝 Key Decisions Needed

| Question | Options | Recommendation |
|----------|---------|----------------|
| **Artifact rendering?** | HTML, JSON → Native UI | **JSON → Native UI** (safer, faster, your stack) |
| **Wake word?** | "Hey Turtle", "Hey Rabbit", "Hey Bubble" | **Test all three** for STT accuracy |
| **Bubble display mode?** | Floating, Horizontal scroll, Toggle | **Horizontal scroll** (less intrusive) |
| **Editable input?** | Yes, No, Optional | **Yes** (differentiator) |
| **Image generation?** | Always, On demand, Budget-limited | **Budget-limited** (3/convo) |
| **Artifact updates?** | Full regen, JSON patch | **JSON patch** (surgical, reversible) |
| **Multi-agent or single?** | One agent, Specialized agents | **Specialized** (better quality) |

---

## 📝 Summary

Bubble Voice is a sophisticated voice-native AI with:

1. **Voice Commands** - "Hey Turtle/Rabbit" wake word + command vocabulary
2. **Bubbles** - Real-time afterthought prompts (≤7 words)
3. **Editable Speech** - See and edit your words as you speak
4. **Persistent Artifacts** - JSON data rendered by native UI components
5. **Smart Context** - Two-tier vector retrieval + summarization
6. **Parallel Generation** - Voice, bubbles, artifacts, images together
7. **Graceful Failure** - JSON patch revert, not full regeneration

### Why JSON → Native UI (Not HTML)

| HTML Approach | JSON → Native UI |
|--------------|------------------|
| ❌ LLM can hallucinate layout | ✅ LLM only touches data |
| ❌ WebView overhead | ✅ Native performance |
| ❌ Inconsistent styling | ✅ Your design system |
| ❌ Complex persistence | ✅ Just save JSON |
| ❌ Learning new stack | ✅ SwiftUI/React you know |

The key insight is **separation of concerns**: 
- **LLM** → outputs structured JSON data
- **Native UI** → renders it deterministically
- **Different agents** for different tasks (conversation, bubbles, artifacts)

This prevents context degradation, eliminates layout hallucination, and lets you use your existing UI stack.
