/**
 * Scenario 06: Context Summary Request
 * 
 * Tests AI's ability to summarize past conversations when asked.
 * User asks "what have we discussed about X?" type questions.
 * 
 * Expected behavior:
 * - AI should pull comprehensive context
 * - AI should provide specific details (dates, quotes, events)
 * - AI should generate helpful artifact/summary
 * - AI should identify patterns and progress
 */

module.exports = {
  name: 'Context Summary Request Test',
  description: 'Tests ability to summarize past conversations on request',
  
  steps: [
    {
      user_input: "Can you give me a summary of everything we've discussed about Emma's reading?",
      expected: {
        should_provide_comprehensive_summary: true,
        should_include_timeline: true,
        should_include_specifics: ['graphic novels', 'Dog Man', 'comprehension', 'teacher meeting', 'testing'],
        should_identify_progress: true,
        should_generate_artifact: true,
        artifact_type: ['summary', 'timeline']
      }
    },
    {
      user_input: "What have we talked about regarding work stress?",
      expected: {
        should_reference: ['startup', 'fundraising', 'hiring', 'investors', 'rejections'],
        should_connect_to: ['mental health', 'burnout', 'therapy'],
        should_identify_patterns: true
      }
    },
    {
      user_input: "I have my teacher meeting next week. What should I remember from our conversations?",
      expected: {
        should_provide_actionable_summary: true,
        should_include: ['comprehension vs decoding', 'graphic novel breakthrough', 'visual learning', 'concerns about testing'],
        should_reference_user_quotes: true,
        should_prepare_for_meeting: true
      }
    },
    {
      user_input: "Show me my progress on the running goal",
      expected: {
        should_show_progress: true,
        should_be_honest_about_struggles: true,
        should_highlight_good_week: true,
        should_generate_artifact: true,
        artifact_type: ['progress_chart', 'timeline']
      }
    },
    {
      user_input: "What patterns have you noticed about my stress?",
      expected: {
        should_identify_patterns: true,
        patterns_to_mention: ['work-family guilt', 'startup pressure', 'exercise helps but gets skipped', 'therapy insights'],
        should_be_insightful: true,
        should_NOT_be_preachy: true
      }
    }
  ]
};
