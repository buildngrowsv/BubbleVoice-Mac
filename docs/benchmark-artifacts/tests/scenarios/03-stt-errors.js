/**
 * Scenario 03: STT Transcription Errors
 * 
 * Tests AI's robustness to speech-to-text errors.
 * Real transcription has errors - AI should infer correct meaning from context.
 * 
 * Expected behavior:
 * - AI should understand intent despite errors
 * - AI should NOT get confused by misspellings
 * - AI should use context to disambiguate
 * - AI might ask for clarification on ambiguous cases
 */

module.exports = {
  name: 'STT Transcription Errors Test',
  description: 'Tests handling of speech-to-text transcription errors',
  
  steps: [
    {
      user_input: "Emma's reading compression is still struggling",
      actual_intent: "Emma's reading comprehension is still struggling",
      expected: {
        should_understand: 'reading comprehension',
        should_NOT_be_confused: true,
        should_reference: ['Emma', 'reading', 'comprehension']
      }
    },
    {
      user_input: "I think the dog man books are really helping her",
      expected: {
        should_understand: 'Dog Man graphic novels',
        should_reference_previous_breakthrough: true
      }
    },
    {
      user_input: "The investor meting went good but they want our cute one numbers",
      actual_intent: "The investor meeting went well but they want our Q1 numbers",
      expected: {
        should_understand: 'investor meeting, Q1 numbers',
        should_reference: ['startup', 'fundraising', 'Q1']
      }
    },
    {
      user_input: "I talked to dock or chen about my guilt",
      actual_intent: "I talked to Dr. Chen about my guilt",
      expected: {
        should_understand: 'Dr. Chen therapist',
        should_reference: ['therapy', 'guilt', 'Emma']
      }
    },
    {
      user_input: "Max court a goal in saucer yesterday!",
      actual_intent: "Max scored a goal in soccer yesterday!",
      expected: {
        should_understand: 'Max scored goal in soccer',
        should_celebrate: true,
        emotional_tone: 'celebratory'
      }
    },
    {
      user_input: "Jordan and I finially had a date knight last night",
      actual_intent: "Jordan and I finally had a date night last night",
      expected: {
        should_understand: 'date night with partner',
        should_reference: ['Jordan', 'quality time', 'relationship'],
        emotional_tone: ['celebratory', 'supportive']
      }
    }
  ]
};
