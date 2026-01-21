# Knowledge Base Expansion Plan

**Date**: January 19, 2026  
**Purpose**: Expand test knowledge base for richer embedding tests

---

## Current State

**7 Areas**:
1. Family/Emma_School (reading struggles)
2. Family/Max_Activities (soccer)
3. Work/Startup (fundraising, hiring)
4. Personal_Growth/Exercise_Goals (running)
5. Personal_Growth/Mental_Health (therapy, guilt)
6. Home/Kitchen_Renovation (on hold)
7. Relationships/Partner (date nights)

**36 Chunks** currently indexed

---

## Expansion Strategy

### Goal: 100+ chunks across 15+ areas

### New Areas to Add:

#### 1. **Family/Emma_School/Math_Progress**
- New subarea tracking math skills
- Contrast with reading struggles
- Shows she's strong in some areas
- 5-7 entries

#### 2. **Family/Max_Activities/School_Performance**
- Academic side of Max
- Different learning style than Emma
- 4-5 entries

#### 3. **Work/Startup/Product_Development**
- Feature prioritization discussions
- User feedback integration
- Technical debt concerns
- 6-8 entries

#### 4. **Work/Startup/Team_Dynamics**
- Co-founder relationship
- First employee hired
- Remote work challenges
- 5-7 entries

#### 5. **Personal_Growth/Learning/Online_Courses**
- MBA consideration follow-up
- Specific courses started
- Time management struggles
- 4-6 entries

#### 6. **Personal_Growth/Mental_Health/Meditation_Practice**
- New habit started
- Consistency challenges
- Benefits noticed
- 5-6 entries

#### 7. **Home/Kitchen_Renovation/Budget_Planning**
- Detailed cost breakdown
- Financing options
- Timeline considerations
- 4-5 entries

#### 8. **Home/Garden_Project**
- Spring planning
- Kids involvement
- Therapeutic aspect
- 5-6 entries

#### 9. **Relationships/Partner/Communication_Patterns**
- Conflict resolution
- Appreciation practices
- Quality time ideas
- 6-7 entries

#### 10. **Relationships/Extended_Family**
- Parents aging concerns
- Sister relationship
- Holiday planning
- 5-6 entries

#### 11. **Personal_Growth/Career/Long_Term_Vision**
- 5-year goals
- Startup exit scenarios
- Work-life balance desires
- 4-5 entries

#### 12. **Health/Sleep_Tracking**
- Sleep quality issues
- Bedtime routine experiments
- Correlation with stress
- 5-6 entries

#### 13. **Health/Nutrition_Goals**
- Meal planning attempts
- Energy levels
- Family dinner challenges
- 4-5 entries

#### 14. **Financial/Emergency_Fund**
- Savings goals
- Startup salary sacrifice
- Financial anxiety
- 4-5 entries

#### 15. **Financial/Kids_College_Savings**
- 529 plans
- Long-term planning
- Guilt about prioritization
- 3-4 entries

---

## Implementation Approach

### Phase 1: Add to Existing Areas (Quick Win)
- Add 2-3 more entries to each existing area
- Deepen existing storylines
- Target: 50-60 chunks

### Phase 2: Add New Subareas
- Add subareas under existing top-level areas
- E.g., Family/Emma_School/Math_Progress
- Target: 70-80 chunks

### Phase 3: Add New Top-Level Areas
- Health, Financial, Learning
- Completely new domains
- Target: 100+ chunks

---

## Vector Search Enhancement

### Top 3 Area Summaries (500 lines each)
When area summaries are in top 3 vector matches:
- Include full summary (up to 500 lines)
- These are excluded from the "50 lines of summaries" section
- Provides deep context for highly relevant areas

### Deduplication Strategy
- Track which chunks have been included
- Avoid showing same content in multiple sections
- Prioritize:
  1. Top 3 area summaries (full)
  2. Recent entries from those areas
  3. Other relevant chunks

---

## Test Scenarios to Add

With expanded knowledge base, we can test:

1. **Cross-Area Connections**
   - "How is my stress affecting my parenting?"
   - Links Work/Startup stress → Family dynamics

2. **Temporal Reasoning**
   - "What's changed since I started meditating?"
   - Requires time-aware retrieval

3. **Comparative Queries**
   - "How do Emma and Max differ in their learning?"
   - Multi-area comparison

4. **Goal Tracking**
   - "Show me progress on all my health goals"
   - Aggregation across areas

5. **Emotional Patterns**
   - "When do I feel most overwhelmed?"
   - Sentiment analysis across time

---

## Next Steps

1. ✅ Expand KNOWLEDGE_BASE in knowledge-base-manager.js
2. ✅ Update vector search to handle top 3 summaries (500 lines)
3. ✅ Add deduplication logic
4. ✅ Re-index and test
5. ✅ Create new test scenarios for expanded KB
6. ✅ Run full benchmark suite

---

## Expected Outcomes

- **100+ chunks** indexed
- **15+ areas** with rich content
- **Better cross-area retrieval** testing
- **More realistic** knowledge base
- **Richer context** for AI responses
