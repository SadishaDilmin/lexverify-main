# Governance Workflow

> **AI Reader Notes**: Wave 5 + Wave 13/14 governance and calibration loop.

## Trigger
- Calibration signals generated from review disagreement patterns
- Policy change requests from admin

## Governance Lifecycle

```
Benchmark evaluation → Structured disagreements → Calibration signals
    → Governance review → Accepted / Rejected / Deferred
    → Policy change (if accepted) → Policy version increment
```

## Calibration Signal Status Machine

```
open → under_review → accepted → implemented
                    → rejected
                    → deferred → open (re-open)
```

## DB Tables

| Table | Purpose |
|---|---|
| `calibration_signals` | Threshold adjustment recommendations |
| `calibration_governance_decisions` | Human review decisions |
| `calibration_policy_links` | Links signal → policy change |
| `firm_policies` | Per-firm policy configuration |
| `firm_policy_history` | Append-only policy version history |

## Views

| View | Purpose |
|---|---|
| `governance_queue_view` | Queue of signals pending review |
| `governance_decision_history` | Decision audit trail |
| `calibration_signal_overview` | Signal summary with linked decisions |
| `policy_change_traceability` | End-to-end: signal → decision → policy change |
| `policy_change_audit_trail` | Full audit trail |

## Policy Governance (Wave 5)

- Firm policies stored as JSONB in `firm_policies`
- Deterministic merge: firm overrides onto `DEFAULT_FIRM_POLICY`
- Every run tagged with: policy version, source, fingerprint
- Changes logged via `log_firm_policy_change()` trigger → `firm_policy_history`

## Status: CURRENT, STABLE
