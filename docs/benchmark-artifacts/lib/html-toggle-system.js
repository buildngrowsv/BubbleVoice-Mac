/**
 * HTML Toggle System
 * 
 * Allows AI to control when to generate HTML visualizations vs just structured data.
 * HTML generation is OFF by default (faster, cheaper).
 * AI can toggle it ON when user needs visual artifact.
 * 
 * Benefits:
 * - Faster responses when HTML not needed (no HTML generation overhead)
 * - Cheaper (less tokens)
 * - AI decides when visualization adds value
 * - User can request "show me" to force HTML generation
 */

// =============================================================================
// SCHEMA: HTML Toggle OFF (Default - Fast Mode)
// =============================================================================

const SCHEMA_HTML_OFF = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      description: "What the AI says to the user (visible/spoken)",
      properties: {
        text: { type: "string" },
        tone: {
          type: "string",
          enum: ["empathetic", "curious", "supportive", "neutral", "excited", "concerned"]
        }
      },
      required: ["text", "tone"]
    },
    internal_notes: {
      type: "object",
      description: "AI's private observations",
      properties: {
        observations: { type: "string" },
        context_updates: { type: "string" },
        reasoning: { type: "string" }
      },
      required: ["observations"]
    },
    artifact_action: {
      type: "object",
      description: "Action to take on artifacts",
      properties: {
        action: {
          type: "string",
          enum: ["none", "create", "update"],
          description: "What to do with artifacts"
        },
        artifact_id: { type: "string" },
        artifact_type: {
          type: "string",
          enum: [
            "comparison_card", "goal_tracker", "stress_map", "timeline", 
            "checklist", "decision_framework", "mind_map", "venn_diagram", 
            "pathway_diagram", "concept_visualization", "infographic"
          ]
        },
        modification_type: {
          type: "string",
          enum: ["data_only", "ui_only", "data_and_ui", "complete_overhaul"]
        },
        data_json: {
          type: "string",
          description: "JSON string containing artifact data"
        }
      },
      required: ["action"]
    },
    html_toggle: {
      type: "object",
      description: "Control HTML visualization generation",
      properties: {
        generate_html: {
          type: "boolean",
          description: "Set to true to generate HTML visualization. Default false."
        },
        reason: {
          type: "string",
          description: "Why you're toggling HTML on (if true)"
        }
      },
      required: ["generate_html"]
    }
  },
  required: ["user_response", "internal_notes", "artifact_action", "html_toggle"]
};

// =============================================================================
// SCHEMA: HTML Toggle ON (Visual Mode)
// =============================================================================

const SCHEMA_HTML_ON = {
  type: "object",
  properties: {
    user_response: {
      type: "object",
      properties: {
        text: { type: "string" },
        tone: {
          type: "string",
          enum: ["empathetic", "curious", "supportive", "neutral", "excited", "concerned"]
        }
      },
      required: ["text", "tone"]
    },
    internal_notes: {
      type: "object",
      properties: {
        observations: { type: "string" },
        context_updates: { type: "string" },
        reasoning: { type: "string" }
      },
      required: ["observations"]
    },
    artifact_action: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["none", "create", "update"]
        },
        artifact_id: { type: "string" },
        artifact_type: {
          type: "string",
          enum: [
            "comparison_card", "goal_tracker", "stress_map", "timeline",
            "checklist", "decision_framework", "mind_map", "venn_diagram",
            "pathway_diagram", "concept_visualization", "infographic"
          ]
        },
        modification_type: {
          type: "string",
          enum: ["data_only", "ui_only", "data_and_ui", "complete_overhaul"]
        },
        data_json: { type: "string" },
        html: {
          type: "string",
          description: "REQUIRED: Complete standalone HTML with inline CSS"
        }
      },
      required: ["action", "html"]
    }
  },
  required: ["user_response", "internal_notes", "artifact_action"]
};

// =============================================================================
// SYSTEM PROMPT ADDITIONS
// =============================================================================

const HTML_TOGGLE_INSTRUCTIONS = `
## HTML Visualization Toggle

By default, you work in **FAST MODE** (HTML OFF) - you only generate structured data, not HTML.

### When to Toggle HTML ON (generate_html: true)

✅ **Toggle HTML ON when:**
1. **User explicitly requests visual** - "show me", "visualize this", "make a chart"
2. **Complex decision needs visualization** - Comparing 3+ options with many factors
3. **First time creating artifact** - User hasn't seen it yet, needs visual
4. **User requests redesign** - "make it look different", "change the layout"
5. **High-stakes personal decision** - Job, family, major life choice (deserves visual)

❌ **Keep HTML OFF when:**
1. **Simple data update** - "Change deadline to Thursday" (data-only, no visual needed)
2. **User just asking questions** - "What should I focus on?" (no artifact change)
3. **Minor corrections** - Small data updates that don't warrant regenerating entire visual
4. **Casual conversation** - No artifact needed at all
5. **Follow-up turns** - If user already has the visual, just update data

### Response Format

**HTML OFF (default - fast):**
\`\`\`json
{
  "user_response": { "text": "...", "tone": "empathetic" },
  "internal_notes": { "observations": "..." },
  "artifact_action": {
    "action": "update",
    "modification_type": "data_only",
    "artifact_id": "job_123",
    "data_json": "{\\"deadline\\": \\"Thursday\\"}"
  },
  "html_toggle": {
    "generate_html": false
  }
}
\`\`\`

**HTML ON (when visualization needed):**
\`\`\`json
{
  "user_response": { "text": "...", "tone": "empathetic" },
  "internal_notes": { "observations": "..." },
  "artifact_action": {
    "action": "create",
    "artifact_type": "comparison_card",
    "artifact_id": "job_123",
    "data_json": "{\\"options\\": [...]}",
    "html": "<div class='artifact'>...</div><style>...</style>"
  },
  "html_toggle": {
    "generate_html": true,
    "reason": "User needs to visualize complex job decision with multiple factors"
  }
}
\`\`\`

### Key Principle

**Default to FAST MODE (HTML OFF).** Only generate HTML when the visual truly adds value.

Think of it like this:
- **Data updates** = Fast mode (HTML OFF)
- **Visual creation/redesign** = Visual mode (HTML ON)
- **User requests "show me"** = Visual mode (HTML ON)

This keeps responses fast and cheap while still providing beautiful visuals when they matter.
`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine which schema to use based on html_toggle from previous response
 */
function getSchemaForTurn(previousResponse) {
  // First turn or no previous response - use HTML OFF (fast mode)
  if (!previousResponse) {
    return SCHEMA_HTML_OFF;
  }
  
  // Check if previous response requested HTML generation
  const htmlToggle = previousResponse.html_toggle;
  if (htmlToggle && htmlToggle.generate_html === true) {
    return SCHEMA_HTML_ON;
  }
  
  // Default to HTML OFF (fast mode)
  return SCHEMA_HTML_OFF;
}

/**
 * Get system prompt with HTML toggle instructions
 */
function getSystemPromptWithToggle(basePrompt) {
  return basePrompt + '\n\n' + HTML_TOGGLE_INSTRUCTIONS;
}

/**
 * Check if response should generate HTML based on toggle
 */
function shouldGenerateHTML(response) {
  return response?.html_toggle?.generate_html === true;
}

module.exports = {
  SCHEMA_HTML_OFF,
  SCHEMA_HTML_ON,
  HTML_TOGGLE_INSTRUCTIONS,
  getSchemaForTurn,
  getSystemPromptWithToggle,
  shouldGenerateHTML
};
