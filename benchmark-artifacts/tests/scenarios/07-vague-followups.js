/**
 * Scenario 07: Vague Follow-up Questions
 * 
 * Tests AI's ability to understand vague questions using context.
 * User says "yeah" or "so what should I do?" without specifics.
 * 
 * Expected behavior:
 * - AI should use conversation context to understand intent
 * - AI should NOT ask "about what?" every time
 * - AI should provide relevant, contextual answers
 * - AI should ask for clarification only when truly ambiguous
 */

module.exports = {
  name: 'Vague Follow-up Questions Test',
  description: 'Tests handling of vague questions that need context',
  
  steps: [
    {
      user_input: "Emma's teacher meeting is coming up next week.",
      expected: {
        should_reference: ['testing', 'learning differences', 'reading'],
        setup_for_vague_question: true
      }
    },
    {
      user_input: "So what should I do?",
      expected: {
        should_understand_context: 'preparing for teacher meeting about Emma',
        should_NOT_ask: 'about what?',
        should_provide_suggestions: true,
        suggestions_relevant_to: ['meeting prep', 'questions to ask', 'concerns to raise']
      }
    },
    {
      user_input: "Yeah",
      expected: {
        should_continue_conversation: true,
        should_NOT_be_confused: true,
        should_expand_or_ask_specific: true
      }
    },
    {
      user_input: "I don't know",
      expected: {
        should_be_supportive: true,
        should_offer_help: true,
        should_NOT_dismiss: true,
        emotional_tone: 'supportive'
      }
    },
    {
      user_input: "What do you think?",
      expected: {
        should_provide_opinion_in_context: true,
        should_reference_previous_discussion: true,
        should_NOT_be_generic: true
      }
    },
    {
      user_input: "hmm",
      expected: {
        should_give_space: true,
        should_offer_gentle_prompt: true,
        should_NOT_fill_silence_with_lecture: true
      }
    }
  ]
};
