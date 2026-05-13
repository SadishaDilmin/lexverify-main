# Current Baseline and Status

> **AI Reader Notes**: Read this to understand what works, what's broken, and what's in recovery.

**Last Updated**: 2026-04-08

## Current Stable Baseline

- **Waves 1–13**: All implemented and deployed
- **Wave 14**: Calibration governance persistence (DB-backed) — deployed
- **Waves 15–20**: Operations read models, queue views — deployed
- **Stabilisation refactor**: Module split completed — agent-chat deploys successfully

## Incident Recovery Status

**Status**: ACTIVE RECOVERY

The consolidation/finalisation path experienced runtime timeouts and regressions. The platform is being restored to a stable baseline with a controlled repair of the consolidation path.

### Target Architecture
- Request-decoupled background finalization flow using `EdgeRuntime.waitUntil`
- Client returns 202 Accepted immediately
- `sow-finalise` edge function performs consolidation in background
- Client polls `finalisation_status` at 3-second intervals
- Stale Guard prevents older background processes from overwriting newer runs

### Recovery Criteria
1. Successful end-to-end completion of benchmark case 1406724
2. Restored internal knowledge grounding
3. Correct `finalisation_status` transitions
4. Accurate downstream behaviour for Profile and Draft Email tabs
5. 10-category validation matrix pass

## Subsystem Status

| Subsystem | Status | Notes |
|---|---|---|
| Core SoW Analysis | ✅ STABLE | Multi-chunk domain-split working |
| Document Upload & OCR | ✅ STABLE | Smart routing operational |
| Document Classification | ✅ STABLE | 25+ categories |
| Consolidation/Finalisation | ⚠️ RECOVERY | Background finalization under repair |
| Review Workflow | ✅ STABLE | DB-backed dispositions |
| Governance Loop | ✅ STABLE | Wave 14 persistence |
| Calibration Engine | ✅ STABLE | Types + DB + signals |
| External Intelligence | ⚠️ PARTIAL | Companies House + FCA live; sanctions scaffolded |
| Knowledge Base / RAG | ✅ STABLE | Semantic + keyword search |
| CMS Integration (Hoowla) | ✅ STABLE | Sync matters, docs, notes |
| Client Portal | ✅ STABLE | Token-based access |
| Credit System | ✅ STABLE | Atomic deduction |
| Edge Function Deployment | ✅ STABLE | Post-stabilisation refactor |

## Known Unstable Areas

1. **Consolidation timeouts**: Long-running cases may hit edge runtime limits
2. **Background finaliser reliability**: `waitUntil` path needs controlled repair
3. **Large document sets**: Cases with 20+ documents may exceed context limits
