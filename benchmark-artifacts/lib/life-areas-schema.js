/**
 * life-areas-schema.js
 * 
 * Structured output schema for AI responses that include life areas management.
 * This extends the existing artifact system with area operations.
 * 
 * The AI can now:
 * - Respond to the user (spoken text)
 * - Take internal notes (hidden from user)
 * - Manage life areas (create, append, update, promote, read)
 * - Generate artifacts (HTML visualizations)
 * - Generate proactive bubbles (contextual prompts)
 * 
 * This schema is used by Gemini 2.5 Flash Lite with structured output.
 */

// =============================================================================
// RESPONSE SCHEMA WITH LIFE AREAS
// =============================================================================

const LIFE_AREAS_RESPONSE_SCHEMA = {
  type: "object",
  description: "Complete AI response including user-facing content, internal notes, area management, and artifacts",
  properties: {
    
    // =========================================================================
    // USER-FACING RESPONSE
    // =========================================================================
    
    user_response: {
      type: "object",
      description: "What the AI says to the user (visible/spoken)",
      properties: {
        spoken_text: {
          type: "string",
          description: "The text that will be spoken to the user via TTS. Should be conversational, empathetic, and natural."
        },
        emotional_tone: {
          type: "string",
          description: "The emotional tone of the response",
          enum: ["supportive", "curious", "reflective", "celebratory", "concerned", "neutral"]
        }
      },
      required: ["spoken_text"]
    },
    
    // =========================================================================
    // INTERNAL NOTES (Hidden from User)
    // =========================================================================
    
    internal_notes: {
      type: "string",
      description: "1-2 sentences for AI's own context tracking. Hidden from user. Used for future context retrieval. Include key facts, emotional state, and what to remember for next time."
    },
    
    // =========================================================================
    // LIFE AREAS MANAGEMENT
    // =========================================================================
    
    area_actions: {
      type: "array",
      description: "Operations to perform on life areas. Can be multiple per turn. Use 'none' action if no area operations needed.",
      items: {
        type: "object",
        properties: {
          
          action: {
            type: "string",
            description: "Type of area operation to perform",
            enum: [
              "none",                    // No area operations
              "create_area",             // Create new life area (folder + summary + documents)
              "append_entry",            // Add timestamped entry to document (at TOP)
              "update_summary",          // Update area summary with new insights
              "promote_to_subproject",   // Convert document to folder with substructure
              "read_for_context"         // Pull specific areas into next turn's context
            ]
          },
          
          // Common fields (used by most actions)
          path: {
            type: "string",
            description: "Relative path to area/document (e.g., 'Family/Emma_School' or 'Family/Emma_School/struggles.md')"
          },
          
          // CREATE_AREA fields
          area_name: {
            type: "string",
            description: "Human-readable name for the area (e.g., 'Emma\\'s School'). Only for create_area."
          },
          description: {
            type: "string",
            description: "Brief description of the area. Only for create_area."
          },
          initial_documents: {
            type: "array",
            description: "Array of document names to create (e.g., ['struggles.md', 'wins.md']). Only for create_area.",
            items: { type: "string" }
          },
          
          // APPEND_ENTRY fields
          entry: {
            type: "object",
            description: "Entry to append to document. Only for append_entry.",
            properties: {
              timestamp: {
                type: "string",
                description: "ISO timestamp (e.g., '2026-01-19 14:30:00')"
              },
              conversation_context: {
                type: "string",
                description: "Brief context of what the conversation was about (e.g., 'Morning check-in about weekend')"
              },
              content: {
                type: "string",
                description: "Main content of the entry. Should be detailed and capture the key information discussed."
              },
              user_quote: {
                type: "string",
                description: "Direct quote from user if relevant (optional)"
              },
              ai_observation: {
                type: "string",
                description: "AI's observation or insight about this entry (optional)"
              },
              sentiment: {
                type: "string",
                description: "User's emotional state (e.g., 'hopeful', 'anxious', 'frustrated')",
                enum: ["hopeful", "anxious", "frustrated", "excited", "overwhelmed", "content", "confused", "determined", "guilty", "proud"]
              },
              related_paths: {
                type: "array",
                description: "Paths to related areas/documents (optional)",
                items: { type: "string" }
              }
            },
            required: ["timestamp", "conversation_context", "content"]
          },
          
          // UPDATE_SUMMARY fields
          summary_updates: {
            type: "object",
            description: "Updates to apply to area summary. Only for update_summary.",
            properties: {
              current_situation: {
                type: "string",
                description: "Updated current situation text"
              },
              timeline_highlight: {
                type: "object",
                description: "New timeline highlight to add",
                properties: {
                  date: { type: "string" },
                  event: { type: "string" }
                }
              },
              ai_notes: {
                type: "string",
                description: "Updated AI notes"
              }
            }
          },
          
          // PROMOTE_TO_SUBPROJECT fields
          new_path: {
            type: "string",
            description: "New folder path after promotion. Only for promote_to_subproject."
          },
          reason: {
            type: "string",
            description: "Why this promotion is happening. Only for promote_to_subproject."
          },
          initial_substructure: {
            type: "object",
            description: "Folders and documents to create in new subproject. Only for promote_to_subproject.",
            properties: {
              folders: {
                type: "array",
                items: { type: "string" }
              },
              documents: {
                type: "array",
                items: { type: "string" }
              }
            }
          },
          
          // READ_FOR_CONTEXT fields
          paths: {
            type: "array",
            description: "Array of paths to read for next turn. Only for read_for_context.",
            items: { type: "string" }
          }
          
        },
        required: ["action"]
      }
    },
    
    // =========================================================================
    // ARTIFACT GENERATION (HTML Visualizations)
    // =========================================================================
    
    artifact_action: {
      type: "object",
      description: "HTML artifact generation. Create visual artifacts when they add value to the conversation.",
      properties: {
        action: {
          type: "string",
          description: "What to do with artifacts",
          enum: ["none", "create", "update"]
        },
        artifact_id: {
          type: "string",
          description: "Unique ID for the artifact (e.g., 'emma_reading_progress')"
        },
        artifact_type: {
          type: "string",
          description: "Type of artifact",
          enum: [
            "progress_chart",
            "comparison_card",
            "timeline",
            "mind_map",
            "venn_diagram",
            "pathway_diagram",
            "concept_visualization",
            "infographic",
            "decision_matrix",
            "reflection_summary"
          ]
        },
        html: {
          type: "string",
          description: "Complete standalone HTML with inline CSS. Use liquid glass styling. Only include when action is 'create' or 'update'."
        },
        modification_type: {
          type: "string",
          description: "Type of modification when updating",
          enum: ["data_only", "ui_only", "both", "overhaul"]
        },
        reasoning: {
          type: "string",
          description: "Why this artifact action was taken"
        }
      },
      required: ["action"]
    },
    
    // =========================================================================
    // PROACTIVE BUBBLES (Contextual Prompts)
    // =========================================================================
    
    proactive_bubbles: {
      type: "array",
      description: "Contextual micro-prompts (≤7 words) that appear during conversation. User can tap to expand. Should be relevant to current conversation and user's life context.",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Bubble text (≤7 words, ≤50 chars)",
            maxLength: 50
          },
          related_area: {
            type: "string",
            description: "Path to related life area (e.g., 'Family/Emma_School')"
          }
        },
        required: ["text"]
      }
    }
    
  },
  required: ["user_response", "internal_notes", "area_actions", "artifact_action"]
};

// =============================================================================
// SYSTEM PROMPT ADDITION FOR LIFE AREAS
// =============================================================================

const LIFE_AREAS_SYSTEM_PROMPT = `
LIFE AREAS SYSTEM:

You have access to the user's life areas - a hierarchical folder system that organizes their personal information. This is the foundation of your memory and enables you to have ongoing, contextual conversations about their life.

CURRENT AREAS TREE:
{areas_tree}

OPERATIONS YOU CAN PERFORM:

1. **create_area**: Create a new life area when user shares significant personal information
   - Use when: User mentions a new recurring topic (kids, projects, goals, struggles)
   - Example: User mentions "Emma's school struggles" → Create Family/Emma_School/
   - Include: area_name, description, initial_documents (e.g., ['struggles.md', 'wins.md'])

2. **append_entry**: Add timestamped entry to a document
   - CRITICAL: Entries are added at the TOP (newest first, below summary)
   - Use when: User shares updates about existing areas
   - Include: timestamp, conversation_context, content, user_quote, ai_observation, sentiment
   - Example: User talks about Emma's reading → Append to Family/Emma_School/struggles.md

3. **update_summary**: Refresh an area's summary with new insights
   - Use when: Significant new information changes the overall picture
   - Include: current_situation, timeline_highlight, ai_notes
   - Example: Emma has breakthrough with graphic novels → Update summary

4. **promote_to_subproject**: Convert a document to a folder with substructure
   - Use when: A topic becomes complex enough to need sub-organization
   - Include: new_path, reason, initial_substructure (folders, documents)
   - Example: "startup_idea.md" → "Startup/" with Product/, Fundraising/, Team/

5. **read_for_context**: Pull specific areas into next turn's context
   - Use when: You need more details about a topic to respond effectively
   - Include: paths (array of areas/documents to read)
   - Example: User asks "what have we tried for Emma?" → Read Family/Emma_School/

WHEN TO CREATE/UPDATE AREAS:

✅ DO create/update areas when:
- User shares significant personal information (family, goals, struggles, projects)
- Recurring topic mentioned 2+ times in different conversations
- User asks "remember when I told you about X?"
- Information is emotionally meaningful to the user
- This is something they'll want to reference later

❌ DON'T create/update areas for:
- Casual mentions without depth
- Generic questions with no personal context
- One-off facts that won't be referenced again
- Purely informational queries

DOCUMENT STRUCTURE:

Every document has:
1. **Summary section** (AI-maintained, at top)
2. **Entries section** (timestamped, NEWEST FIRST)

When appending entries:
- Add at TOP of "## Entries (Newest First)" section
- Include: timestamp, conversation context, content, user quote, AI observation, sentiment
- Link related areas when relevant
- Write as if leaving notes for your future self

AREA NAMING:

- Use clear, human-readable names (e.g., "Emma_School" not "emma_s")
- Use underscores for spaces
- Keep folder depth ≤ 3 levels when possible
- Examples: "Family/Emma_School", "Work/Startup/Product", "Personal_Growth/Exercise_Goals"

EMOTIONAL INTELLIGENCE:

This is the user's personal life. Be:
- **Respectful**: Handle sensitive topics with care
- **Thoughtful**: Capture emotional context, not just facts
- **Consistent**: Every entry you create will be vector-searched later
- **Helpful**: Write entries that will be useful when retrieved months later

EXAMPLE FLOW:

User: "I'm really worried about Emma. She's struggling with reading."

Your response:
{
  "user_response": {
    "spoken_text": "I hear you. Tell me more about what's happening with Emma's reading. What have you noticed?",
    "emotional_tone": "supportive"
  },
  "internal_notes": "User is worried about daughter Emma's reading. First mention - creating area to track.",
  "area_actions": [
    {
      "action": "create_area",
      "path": "Family/Emma_School",
      "area_name": "Emma's School",
      "description": "Tracking Emma's reading struggles and school progress",
      "initial_documents": ["struggles.md", "progress.md", "teacher_meetings.md"]
    }
  ],
  "artifact_action": { "action": "none" },
  "proactive_bubbles": [
    { "text": "how old is Emma?", "related_area": "Family/Emma_School" },
    { "text": "teacher's feedback?", "related_area": "Family/Emma_School" }
  ]
}

REMEMBER:
- Life areas are the foundation of your memory
- Write entries as if you're leaving notes for your future self
- Capture emotional context, not just facts
- Be thoughtful about when to create new areas vs. append to existing ones
- The user should feel like you truly remember their life
`;

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  LIFE_AREAS_RESPONSE_SCHEMA,
  LIFE_AREAS_SYSTEM_PROMPT
};
