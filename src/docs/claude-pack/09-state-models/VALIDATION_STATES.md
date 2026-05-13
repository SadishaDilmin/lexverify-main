# Validation States

> **AI Reader Notes**: Core state model for output quality assessment.

## Validation Status Enum

| State | Meaning | Allowed Actions |
|---|---|---|
| `FULLY_VALIDATED` | All judges passed | Full use: internal review, client export, integration sync |
| `DEGRADED` | Some judges partial/degraded | Internal review only; client export with caveats |
| `PARTIALLY_VALIDATED` | Some judges not run | Internal review only |
| `MANUAL_REVIEW_REQUIRED` | High-severity quality fail | Blocked: requires human review before any use |
| `QUARANTINED` | Safety fail / timeout / error | Blocked: requires explicit human intervention |

## Operational Rules

| State | Internal Review | Client Export | Integration Sync | Auto Downstream |
|---|---|---|---|---|
| FULLY_VALIDATED | ✅ | ✅ | ✅ | ✅ |
| DEGRADED | ✅ | ⚠️ with caveats | ❌ | ❌ |
| PARTIALLY_VALIDATED | ✅ | ❌ | ❌ | ❌ |
| MANUAL_REVIEW_REQUIRED | ✅ | ❌ | ❌ | ❌ |
| QUARANTINED | ❌ (review only) | ❌ | ❌ | ❌ |

## Critical Rules
- Safety judge TIMEOUT → QUARANTINED (not pass)
- Safety judge ERROR → QUARANTINED (not pass)  
- Quality judge TIMEOUT → DEGRADED (not pass)
- SKIPPED_BY_POLICY → tracked, not treated as pass
- NOT_RUN → tracked, not treated as pass
