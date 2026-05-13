# Test Strategy

> **AI Reader Notes**: Testing is primarily regression-focused via Vitest.

## Test Types

| Type | Location | Count | Coverage |
|---|---|---|---|
| Regression tests | `src/tests/regression/` | 60+ files | Wave 1–13 behaviour, guardrails, auth, state |
| Unit tests | `src/components/__tests__/`, `src/lib/__tests__/`, `src/pages/__tests__/` | Various | Component and utility tests |
| Integration tests | Limited | Few | Mostly regression-level |
| End-to-end browser tests | None | 0 | KNOWN GAP |

## Regression Suite Coverage

| Suite | File | Coverage |
|---|---|---|
| Fortress Auth | `fortress-auth.test.ts` | Admin route protection (22+ routes) |
| Integrity Guard | `integrity-guard.test.ts` | Stale save, doc versioning, optimistic locking |
| Observer Effect | `observer-effect.test.ts` | Read-only session enforcement |
| Wave 1 Judge | `wave1-judge-outcome-model.test.ts` | Judge outcome state model |
| Wave 2 Evidence | `wave2-evidence-engine.test.ts` | Evidence engine |
| Wave 3 Operational | `wave3-operational-engine.test.ts` | Operational engine |
| Wave 4 Compliance | `wave4-compliance-policy.test.ts` | Compliance policy |
| Wave 5 Governance | `wave5-policy-governance.test.ts` | Policy governance |
| Wave 6 Review | `wave6-review-engine.test.ts` | Review engine |
| Wave 7 External | `wave7-external-intelligence.test.ts` | External intelligence |
| Wave 8 Tasks | `wave8-task-lifecycle.test.ts` | Task lifecycle |
| Wave 9 DocIntel | `wave9-document-intelligence.test.ts` | Document intelligence |
| Wave 10 Financial | `wave10-transaction-extraction.test.ts` | Transaction extraction |
| Wave 11 Narrative | `wave11-narrative-grounding.test.ts` | Narrative grounding |
| Wave 12 Report Plan | `wave12-grounded-report-plan.test.ts` | Grounded report plan |
| Wave 13 Calibration | `wave13-calibration-benchmarking.test.ts` | Calibration engine |
| Live Output | Multiple `live-output-*.test.ts` | Production output quality |
| Co-purchaser/Gift | `gift-vs-copurchaser.test.ts` | Classification guardrails |
| LSAG | `lsag-*.test.ts` | LSAG checklist consistency |

## Running Tests

```bash
npm run test          # All tests
npm run test:watch    # Watch mode
npx vitest run src/tests/regression/  # Regression only
```

## Known Weak Spots
- No browser/E2E tests
- Integration tests limited to DB-read patterns
- Large document set scenarios not well tested
- Consolidation timeout scenarios hard to test in unit tests
