# Review Workflow

> **AI Reader Notes**: Wave 6 review workflow with typed dispositions.

## Trigger
- AI output triggers review need (quality fail, safety concern, degraded validation)
- `shouldCreateReviewItem()` evaluates review reasons

## Review Status Lifecycle

```
PENDING_REVIEW → IN_REVIEW → REVIEW_COMPLETED
                            → CLOSED_NO_ACTION
              → REVIEW_SUPERSEDED (newer run)
              → CLOSED_REPLACED_BY_NEWER_RUN
```

## Review Dispositions

| Disposition | Output Usable | Automation Blocked | Creates Tasks |
|---|---|---|---|
| `APPROVED_AS_IS` | ✅ | ❌ | ❌ |
| `APPROVED_WITH_NOTES` | ✅ | ❌ | ❌ |
| `REQUIRES_REGENERATION` | ❌ | ✅ | ✅ |
| `REQUIRES_FURTHER_EVIDENCE` | ❌ | ✅ | ✅ |
| `REQUIRES_MLRO_ESCALATION` | ❌ | ✅ | ✅ |
| `REQUIRES_LENDER_CONSIDERATION` | ❌ | ✅ | ✅ |
| `REJECTED_UNSAFE_TO_USE` | ❌ | ✅ | ❌ |
| `DUPLICATE_OR_SUPERSEDED` | ❌ | ❌ | ❌ |

## Review Queue

- DB table: `review_queue`
- UI: `OversightQueue` page
- Items auto-created from observability events
- Items auto-superseded when newer run completes

## Observability Events
Structured events emitted during analysis:
- `review_item_created`
- `quality_judge_fail`
- `safety_judge_fail`
- `validation_state_degraded`
- `external_adverse_signal`
- `document_quality_concern`
- etc.

Persisted to: `observability_events` table

## Audit Trail
- All review actions logged to `review_audit_trail`
- Includes: reviewer ID, disposition, notes, timestamp
- Linked to case reference and AI run ID

## Status: CURRENT, STABLE
