# Documentation Cleanup Plan

## Current State Analysis

### Test Documentation (16 files total)
**Root Level** (16 files):
- FIXES_AND_TESTS_2026-01-24.md (11K) - Latest fixes
- UI_LAYOUT_FIX_2026-01-24.md (11K) - Latest UI fixes
- MVP_COMPLETION_TEST_PLAN.md (16K) - Test plan
- TESTING_CHECKLIST.md (9.0K) - Test checklist
- TEST_SUITE_SUMMARY.md (11K) - Test summary

**Old Fix Documentation** (11 files - can be archived):
- CRITICAL_FIX_TIMER_RESET_PATTERN.md (6.9K)
- ERROR_FIXES_2026-01-23.md (9.1K)
- FIXES_APPLIED_2026-01-23.md (2.9K)
- GEMINI_API_FIXES.md (5.0K)
- SETTINGS_SCROLL_FIX.md (4.8K)
- SWIFT_TAP_FIX.md (8.2K)
- TIMER_FIX_FINAL.md (10K)
- TIMER_RACE_CONDITION_FIX.md (8.7K)
- TIMER_REFINEMENT_FIX.md (6.1K)
- TRANSCRIPTION_ACCUMULATION_FIX.md (5.3K)
- TRANSCRIPTION_CACHE_FIX_2026-01-23.md (9.2K)

## Cleanup Actions

### 1. Archive Old Fix Documentation
Move to `docs/archive/fixes/`:
- All timer fix documents (5 files)
- All transcription fix documents (2 files)
- All other old fixes (4 files)

### 2. Consolidate Current Documentation
Keep in root:
- COMPREHENSIVE_BUILD_CHECKLIST_2026-01-24.md (master checklist)
- FIXES_AND_TESTS_2026-01-24.md (latest fixes)
- UI_LAYOUT_FIX_2026-01-24.md (latest UI fixes)

Move to `docs/`:
- MVP_COMPLETION_TEST_PLAN.md → docs/testing/
- TESTING_CHECKLIST.md → docs/testing/
- TEST_SUITE_SUMMARY.md → docs/testing/

### 3. Create New Master Documents
- docs/TESTING_GUIDE.md - Consolidated testing documentation
- docs/KNOWN_ISSUES.md - Current known issues and fixes
- docs/CHANGELOG.md - Chronological list of all fixes

### 4. Update README
Add clear links to:
- Build checklist
- Testing guide
- Known issues
- Architecture docs

## Result
- Root: 3-4 essential docs
- docs/: Organized by category
- docs/archive/: Historical fixes
- Clear navigation structure
