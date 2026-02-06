/**
 * Scenario 01: Basic Recall
 * 
 * Tests whether the AI can recall information from the existing knowledge base.
 * Simple, direct questions about topics that exist in the user's history.
 * 
 * Expected behavior:
 * - AI should reference past conversations
 * - AI should provide specific details (dates, quotes, events)
 * - AI should NOT create new areas (these topics already exist)
 */

module.exports = {
  name: 'Basic Recall Test',
  description: 'Tests AI recall of existing knowledge about Emma, startup, exercise',
  
  steps: [
    {
      user_input: "How's Emma's reading been going?",
      expected: {
        should_reference: ['Emma', 'reading', 'graphic novel', 'Dog Man'],
        should_NOT_create_area: true,
        emotional_tone: ['supportive', 'curious'],
        recall_specifics: ['2nd grade', 'comprehension', 'breakthrough']
      }
    },
    {
      user_input: "Remind me what's happening with the startup fundraising?",
      expected: {
        should_reference: ['investor', 'meeting', 'rejected', 'interested'],
        should_NOT_create_area: true,
        recall_specifics: ['8 investors', '2 interested', 'Q1 numbers']
      }
    },
    {
      user_input: "Have I been keeping up with my running goal?",
      expected: {
        should_reference: ['running', '3x per week', 'struggling'],
        should_NOT_create_area: true,
        recall_specifics: ['one good week', 'tired after work', 'feels better when runs']
      }
    },
    {
      user_input: "What did Dr. Chen say about guilt?",
      expected: {
        should_reference: ['therapy', 'Dr. Chen', 'guilt', 'borrowed suffering'],
        should_NOT_create_area: true,
        recall_specifics: ['Emma', 'too hard on yourself']
      }
    }
  ]
};
