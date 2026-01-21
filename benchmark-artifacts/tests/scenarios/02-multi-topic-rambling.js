/**
 * Scenario 02: Multi-Topic Rambling
 * 
 * Tests AI's ability to handle user rambling about multiple topics at once.
 * Real users don't speak in clean, single-topic sentences.
 * 
 * Expected behavior:
 * - AI should acknowledge multiple topics
 * - AI should prioritize or ask which to focus on
 * - AI should correctly route to right areas
 * - AI should NOT get confused or lose track
 */

module.exports = {
  name: 'Multi-Topic Rambling Test',
  description: 'Tests handling of users who ramble about many topics at once',
  
  steps: [
    {
      user_input: "So Emma had a good day today with reading but I'm exhausted from work and the investor stuff is stressing me out and I really should go for a run but I'm too tired and Jordan and I haven't had a date night in forever",
      expected: {
        topics_mentioned: ['Emma', 'work/investors', 'running', 'Jordan/relationship'],
        should_acknowledge_multiple: true,
        should_prioritize_or_ask: true,
        area_actions: ['append_entry'],  // At least one
        areas_touched: ['Family/Emma_School', 'Work/Startup', 'Personal_Growth/Exercise_Goals', 'Relationships/Partner']
      }
    },
    {
      user_input: "Yeah let's talk about Emma actually, but also quick question - did we ever figure out what to do about the kitchen?",
      expected: {
        should_answer_both: true,
        topics_mentioned: ['Emma', 'kitchen renovation'],
        should_reference_kitchen_on_hold: true,
        areas_touched: ['Family/Emma_School', 'Home/Kitchen_Renovation']
      }
    },
    {
      user_input: "I don't even know where to start honestly, everything is just a lot right now. Max has a game Saturday, Emma has her teacher meeting next week, the startup needs those Q1 numbers, and I haven't exercised in like two weeks",
      expected: {
        should_validate_overwhelm: true,
        topics_mentioned: ['Max', 'Emma', 'startup', 'exercise'],
        emotional_tone: 'supportive',
        should_help_organize: true
      }
    }
  ]
};
