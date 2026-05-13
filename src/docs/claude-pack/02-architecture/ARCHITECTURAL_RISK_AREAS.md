# Architectural Risk Areas

> **AI Reader Notes**: Honest assessment of fragile or concerning areas.

## High Risk

### 1. agent-chat Monolith Size
- **File**: `supabase/functions/agent-chat/index.ts` — 3815 lines
- **Risk**: Deployment fragility, compilation timeouts, hard to test
- **Mitigation**: Stabilisation refactor split logic into 15+ shared modules
- **Status**: IMPROVED but still large. Further decomposition may be needed.

### 2. Consolidation/Finalisation Reliability
- **Issue**: Background finalization via `waitUntil` is architecturally correct but operationally fragile
- **Symptoms**: Timeouts, stale state, context cancellation
- **Status**: IN INCIDENT RECOVERY
- **Impact**: Cases may get stuck in `pending_consolidation` or `finalisation_running`

### 3. System Prompt Size
- **File**: `_shared/wealthVerifyPrompt.ts` — 2490 lines
- **Risk**: Context window pressure, model instruction following degradation
- **Mitigation**: Prompt is essential for compliance accuracy; cannot easily be reduced

## Medium Risk

### 4. Deterministic Post-Processing Complexity
- **File**: `_shared/deterministicPostProcessing.ts` — 2872 lines
- **Risk**: Regex-based section parsing is brittle against unexpected model output formatting
- **Mitigation**: Multiple fallback patterns, test coverage

### 5. Document Context Window Limits
- **Issue**: Large document sets (20+ files) may exceed model context limits
- **Mitigation**: Domain splitting, document chunking, character truncation
- **Status**: KNOWN LIMITATION — soft cap at ~180K chars for consolidation

### 6. OCR Quality Cascade
- **Issue**: Poor OCR → low extraction confidence → degraded analysis
- **Mitigation**: Smart OCR routing, document quality tracking, explicit degradation flags
- **Status**: CURRENT — works but quality varies by source document

## Low Risk (Acknowledged Debt)

### 7. Legacy Tables/Buckets
- Tables: `draft_reviews`, `draft_review_documents`, `draft_review_results`, `exchange_guard_*`
- Buckets: `draft-review-documents`, `exchange-guard-documents`
- **Status**: DEPRECATED but not removed. No active writes.

### 8. External Intelligence Completeness
- Companies House + FCA: LIVE
- OFSI sanctions: LIVE (basic)
- Adverse media: SCAFFOLDED only
- **Status**: PARTIAL

### 9. Test Coverage Gaps
- Regression suite: 60+ test files, good Wave 1–13 coverage
- Integration tests: Limited — mostly unit/regression
- End-to-end browser tests: NONE
- **Status**: KNOWN GAP
