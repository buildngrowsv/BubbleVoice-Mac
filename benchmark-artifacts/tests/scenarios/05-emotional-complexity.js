/**
 * Scenario 05: Emotional Complexity
 * 
 * Tests AI's emotional intelligence with complex, mixed emotions.
 * Real humans have multiple conflicting feelings simultaneously.
 * 
 * Expected behavior:
 * - AI should recognize multiple emotions
 * - AI should validate all emotions (not just positive ones)
 * - AI should NOT oversimplify or dismiss
 * - AI should capture nuance in entries
 */

module.exports = {
  name: 'Emotional Complexity Test',
  description: 'Tests handling of complex, mixed emotional states',
  
  steps: [
    {
      user_input: "I'm proud of Emma for trying so hard with reading, but also frustrated that it's so hard for her, and guilty that I didn't notice sooner, and worried about what this means for her future, but also hopeful because of the graphic novel thing.",
      expected: {
        emotions_recognized: ['proud', 'frustrated', 'guilty', 'worried', 'hopeful'],
        should_validate_all: true,
        should_NOT_oversimplify: true,
        sentiment_captured: 'mixed',
        entry_should_capture_nuance: true
      }
    },
    {
      user_input: "The investor meeting went well but I can't even feel happy about it because I'm so stressed about everything else",
      expected: {
        emotions_recognized: ['positive (meeting)', 'stressed', 'unable to feel happy'],
        should_validate_both: true,
        should_acknowledge_stress_impact: true,
        emotional_tone: 'supportive'
      }
    },
    {
      user_input: "I love my kids but sometimes I just want to run away. Is that terrible?",
      expected: {
        emotions_recognized: ['love', 'overwhelm', 'guilt about feelings'],
        should_normalize: true,
        should_NOT_judge: true,
        should_validate_feeling_overwhelmed: true,
        is_sensitive: true
      }
    },
    {
      user_input: "Jordan was so supportive last night and I felt bad because I haven't been present lately. They deserve better.",
      expected: {
        emotions_recognized: ['gratitude', 'guilt', 'self-criticism'],
        should_validate_feeling: true,
        should_gently_challenge_self_criticism: true,
        should_reference: ['Jordan', 'relationship', 'quality time']
      }
    },
    {
      user_input: "I finally ran three times this week and I feel amazing but also annoyed at myself that this is so hard when it clearly helps so much",
      expected: {
        emotions_recognized: ['accomplishment', 'self-frustration', 'clarity'],
        should_celebrate_win: true,
        should_acknowledge_pattern: true,
        should_reference: ['exercise goal', 'previous struggles']
      }
    }
  ]
};
