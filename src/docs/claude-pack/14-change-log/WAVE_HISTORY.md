# Wave History

> **AI Reader Notes**: Chronological development history.

| Wave | Focus | Status | Key Files |
|---|---|---|---|
| 1 | Validation honesty, judge outcome model | ✅ DEPLOYED | `judgeOutcomes.ts` |
| 2 | Evidence-native architecture, traceability | ✅ DEPLOYED | `evidenceEngine.ts` |
| 3 | Operational outputs, readiness, delta review | ✅ DEPLOYED | `operationalEngine.ts` |
| 4 | High-risk funding/lender/MLRO logic | ✅ DEPLOYED | `compliancePolicy.ts` |
| 5 | Firm-policy governance, calibration | ✅ DEPLOYED | `policyGovernance.ts` |
| 6 | Human review workflow, observability | ✅ DEPLOYED | `reviewEngine.ts` |
| 7 | External intelligence, profile enrichment | ✅ DEPLOYED (partial) | `externalIntelligence.ts` |
| 8 | Task lifecycle, action-loop completion | ✅ DEPLOYED | `taskLifecycleEngine.ts` |
| 9 | Document intelligence, source-data quality | ✅ DEPLOYED | `documentIntelligence.ts` |
| Stabilisation | Module split, deployment fix | ✅ DEPLOYED | All `_shared/` modules |
| 10 | Financial extraction, transaction reasoning | ✅ DEPLOYED | `transactionExtraction.ts` |
| 11 | Narrative grounding, wording proportionality | ✅ DEPLOYED | `narrativeGrounding.ts` |
| 12 | Two-pass grounded generation | ✅ DEPLOYED | `groundedReportPlan.ts` |
| 13 | Calibration & benchmarking | ✅ DEPLOYED | `calibrationBenchmarking.ts` |
| 14+ | Governance persistence, operations read models | ✅ DEPLOYED | DB views, operations-read function |

| 15.1 | Pre-AI Sufficiency Gate | ✅ DEPLOYED | `financialReconciliation.ts`, `pre-sow-checks/`, `SufficiencyConfirmationModal.tsx`, `src/types/sufficiency.ts` |

## Wave 15.1 — Pre-AI Sufficiency Gate

| Field | Value |
|---|---|
| **Wave** | 15.1 |
| **Name** | Pre-AI Sufficiency Gate |
| **Dates** | 29–30 April 2026 |
| **Owner** | Appan Pathmanathan |
| **PRs** | #17 (implementation), #18 (closeout — tests, docs, verification) |
| **Status** | Shipped to production |

**Deliverables:**
- `supabase/functions/_shared/financialReconciliation.ts` — pure deterministic arithmetic (`computeFundingSufficiency`); all amounts in pence; no I/O; no AI calls
- `supabase/functions/pre-sow-checks/index.ts` — JWT-authenticated edge function; calls arithmetic function; writes `observability_events` (insert-only); returns `SufficiencyResult`
- `src/types/sufficiency.ts` — shared frontend types (`SufficiencyResult`, `SufficiencyAcknowledgement`, `SufficiencyStatus`)
- `src/components/sow/SufficiencyConfirmationModal.tsx` — shortfall requires written rationale + acknowledgement checkbox; overstatement informational only
- `src/hooks/useSoWSubmit.ts` — gate wired before credit check and AI call; sufficiency context threaded into all three `resolve-sow-context` call sites
- `supabase/functions/resolve-sow-context/index.ts` — accepts `sufficiencyResult` + `sufficiencyAcknowledgement`; injects `[ARITHMETIC CONTEXT — ESTABLISHED FACT]` block
- Vitest unit tests for `computeFundingSufficiency` (11 describe blocks, 25 cases) — `src/lib/__tests__/financialReconciliation.test.ts`
- Orientation updates: EDGE_FUNCTION_MAP, COMPONENT_MAP, WAVE_HISTORY, COMPLIANCE_FINDINGS

**Deferred to Wave 15.2/15.3:**
- Bank-statement reconciliation (opening/closing balance check)
- Payslip reconciliation
- E2E regression fixtures via `benchmark_cases` / `run-regression-test` (gate fires in React hook layer, outside regression harness scope)
- Formal `breakdown[]` line-items field on `SufficiencyResult`

## Current Stable Baseline
Wave 15.1 shipped. Wave 13 + stabilisation refactor + operations read models remain the foundation. Consolidation path under controlled repair.
