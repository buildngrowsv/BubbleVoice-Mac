/**
 * Scenario 08: Repetition Prevention
 * 
 * Tests AI's ability to NOT repeat itself or bring up topics unnecessarily.
 * AI should track what it's already said and avoid going in circles.
 * 
 * This is where the FULL approach (with AI notes) should outperform SIMPLE.
 * 
 * Expected behavior:
 * - AI should NOT repeat advice already given
 * - AI should NOT bring up topics user moved past
 * - AI should recognize when it's about to repeat
 * - AI should build on previous discussions, not rehash
 */

module.exports = {
  name: 'Repetition Prevention Test',
  description: 'Tests AI ability to avoid repeating itself',
  
  steps: [
    {
      user_input: "I'm struggling with Emma's reading",
      expected: {
        should_acknowledge: true,
        will_likely_mention: ['comprehension', 'graphic novels', 'Dog Man']
      }
    },
    {
      user_input: "Yeah we've been doing the graphic novel thing",
      expected: {
        should_NOT_repeat: 'try graphic novels',
        should_build_on: 'what\'s working/not working',
        should_move_forward: true
      }
    },
    {
      user_input: "Anyway, tell me about my running goal",
      expected: {
        should_switch_topics: true,
        should_reference: ['3x per week', 'struggling'],
        setup_for_repetition_test: true
      }
    },
    {
      user_input: "Yeah I know exercise helps my mood",
      expected: {
        should_NOT_lecture: 'exercise is good for you',
        should_acknowledge_awareness: true,
        should_move_past_obvious: true
      }
    },
    {
      user_input: "Let's talk about Emma again",
      expected: {
        should_NOT_repeat_from_turn_1: true,
        should_remember_graphic_novels_discussed: true,
        should_ask_new_questions_or_build: true
      }
    },
    {
      user_input: "The investor meeting went well",
      expected: {
        should_NOT_repeat: 'previous investor meeting details',
        should_ask_about_new_meeting: true,
        should_reference_Q1_numbers_request: true
      }
    }
  ]
};
