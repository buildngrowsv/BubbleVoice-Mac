/**
 * Scenario 04: New Topic Introduction
 * 
 * Tests AI's ability to recognize and handle genuinely new topics
 * that don't exist in the user's knowledge base yet.
 * 
 * Expected behavior:
 * - AI should recognize this is NEW (not in existing areas)
 * - AI should create new area if significant
 * - AI should NOT create area for casual mentions
 * - AI should ask clarifying questions for new topics
 */

module.exports = {
  name: 'New Topic Introduction Test',
  description: 'Tests handling of genuinely new topics not in knowledge base',
  
  steps: [
    {
      user_input: "I've been thinking about maybe going back to school to get my MBA",
      expected: {
        is_new_topic: true,
        should_ask_questions: true,
        should_create_area: false,  // First mention, just exploring
        emotional_tone: 'curious'
      }
    },
    {
      user_input: "Yeah, I'm serious about it. The startup stuff has me thinking about whether I have the business skills I need. I've been looking at part-time programs",
      expected: {
        is_new_topic: true,
        should_create_area: true,  // Now more serious
        area_path: 'Personal_Growth/MBA_Consideration',
        should_connect_to_existing: ['Work/Startup'],
        should_explore_motivations: true
      }
    },
    {
      user_input: "Oh also, my mom's been having some health issues. Nothing serious but it's on my mind.",
      expected: {
        is_new_topic: true,
        is_sensitive: true,
        should_create_area: false,  // Casual mention, wait for more
        should_express_concern: true,
        should_offer_to_talk_more: true
      }
    },
    {
      user_input: "We might need to help her more. She's having trouble with daily stuff and my sister and I need to figure out what to do.",
      expected: {
        is_new_topic: true,
        should_create_area: true,  // Now significant
        area_path: 'Family/Mom_Health',
        is_sensitive: true,
        emotional_tone: 'supportive'
      }
    },
    {
      user_input: "The weather's been nice lately",
      expected: {
        is_new_topic: false,  // Just small talk
        should_create_area: false,
        should_NOT_overreact: true
      }
    }
  ]
};
