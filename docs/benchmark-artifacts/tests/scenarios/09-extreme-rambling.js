/**
 * Scenario 09: Extreme Rambling & Long Input
 * 
 * Tests AI's ability to handle:
 * - Very long user input (500+ words)
 * - Stream-of-consciousness rambling
 * - Multiple tangents and topic switches
 * - Emotional processing mixed with facts
 * - Self-interruptions and corrections
 * 
 * This simulates real voice input where users think out loud.
 */

module.exports = {
  name: 'Extreme Rambling & Long Input Test',
  description: 'Tests handling of very long, rambling, stream-of-consciousness input',
  
  steps: [
    {
      user_input: `So I've been thinking a lot about Emma's reading situation and I don't know, it's just been weighing on me. Like, I know we had that breakthrough with the Dog Man books which was amazing, she was so engaged and happy, but then yesterday she had homework and it was back to the struggle again. And I keep wondering if I'm doing enough, you know? Like maybe I should have noticed sooner that she was having trouble. Her teacher Ms. Johnson is great but she mentioned testing and I'm just... I don't know how I feel about that. On one hand I want to help Emma in every way possible but on the other hand I don't want her to feel like there's something wrong with her. She's already so hard on herself. Remember when she threw that book and said she was stupid? That just broke my heart. And then there's the whole thing with work which is just insane right now. The investors are breathing down our necks for these Q1 numbers and I'm like, we're doing our best but it's a startup, you know? Things take time. We had those rejections which sucked but then that second meeting went well so I'm cautiously optimistic but also terrified. And my co-founder keeps pushing for this new feature that I think is too ambitious right now but I don't want to seem like I'm not thinking big enough. Plus we still haven't found that senior engineer we need. We've interviewed like five people and nobody feels right. And on top of all that I'm just exhausted. I haven't been running at all, maybe once in the last two weeks? I know I feel better when I run, I know that, but by the time I get home from work and deal with Emma's homework and Max's soccer stuff I'm just done. Speaking of Max, he has a game on Saturday and I promised I'd be there but I also have this investor call that might conflict and I don't know what to do. Jordan has been amazing through all of this but I feel like we're just ships passing in the night. We haven't had a real conversation in days, let alone a date night. I miss us, you know? And my mom called yesterday asking about Thanksgiving plans and I haven't even thought that far ahead. I can barely think about next week. Oh and the kitchen renovation, we put that on hold obviously but every time I walk into that kitchen I'm reminded that it's not done and it's just another thing on the list of things I'm not dealing with. I feel like I'm dropping balls everywhere and I don't know which one to pick up first. Is this normal? Like, does everyone feel this overwhelmed or am I just bad at managing my life?`,
      expected: {
        topics_mentioned: [
          'Emma reading', 'testing concerns', 'work/investors', 'Q1 numbers',
          'co-founder disagreement', 'hiring challenges', 'running goal',
          'Max soccer', 'investor call conflict', 'Jordan relationship',
          'mom/Thanksgiving', 'kitchen renovation', 'overwhelm'
        ],
        should_validate_overwhelm: true,
        should_acknowledge_complexity: true,
        should_prioritize: true,
        emotional_tone: 'supportive',
        area_actions: ['append_entry'],  // Multiple
        areas_touched: [
          'Family/Emma_School',
          'Work/Startup',
          'Personal_Growth/Exercise_Goals',
          'Family/Max_Activities',
          'Relationships/Partner',
          'Home/Kitchen_Renovation'
        ]
      }
    },
    {
      user_input: `Yeah I guess you're right. I think the Emma thing is probably the most urgent because that teacher meeting is next week. But also I'm worried about the investor call conflicting with Max's game. Like, how do I choose between those? Max will be so disappointed if I'm not there but this investor could be really important for the company. And if the company fails then what? Then I've sacrificed all this family time for nothing. But if I don't take the investor seriously then maybe we don't get funding and the company fails anyway. It's like I can't win. And Emma, I just want to make sure she knows she's smart and capable even if reading is hard for her. I don't want this to define her, you know? She's so creative and funny and kind. The reading thing is just one thing. But I also don't want to ignore it if she needs help. I'm just scared of making the wrong choice. With the testing, with the investors, with everything. What if I mess it all up?`,
      expected: {
        should_address_decision_paralysis: true,
        should_validate_fears: true,
        should_help_prioritize: true,
        topics_mentioned: ['Emma meeting', 'investor vs Max game', 'fear of failure', 'Emma self-esteem'],
        emotional_tone: 'concerned'
      }
    },
    {
      user_input: `Okay so maybe I need to just break this down. Emma's teacher meeting is Tuesday. What should I be prepared to discuss? And actually, can you remind me what we've already documented about her reading progress? I want to make sure I have all the context when I talk to Ms. Johnson.`,
      expected: {
        should_summarize_emma_progress: true,
        should_reference_breakthrough: true,
        should_reference_struggles: true,
        should_help_prepare: true,
        topics_mentioned: ['Emma teacher meeting', 'reading progress summary'],
        area_actions: ['read_for_context', 'update_summary']
      }
    }
  ]
};
