# Task Lifecycle Workflow

> **AI Reader Notes**: Wave 8 task lifecycle with dedup and supersession.

## Trigger
- Analysis completion (follow-up tasks from findings)
- Review disposition (disposition-driven tasks)
- External intelligence (discrepancy-driven tasks)
- Document quality issues (remediation tasks)

## Task Status Machine

```
open → in_progress → resolved (terminal)
     → blocked → resolved
     → superseded (terminal, newer run)
     → closed_no_action (terminal)
     → cancelled (terminal)
     → duplicate (terminal)
```

Terminal statuses: `resolved`, `superseded`, `closed_no_action`, `cancelled`, `duplicate`

## Task Types (by origin)

| Origin | Examples |
|---|---|
| Finding-driven | "Request gift letter", "Clarify third-party contribution" |
| Review-driven | "Regenerate with additional evidence", "MLRO escalation" |
| External-driven | "Investigate Companies House discrepancy" |
| Document quality | "Re-upload degraded bank statement" |
| Financial extraction | "Verify unreconciled large credits" |

## Deduplication

- `processTaskBatch()` checks existing open tasks for same case
- Matching criteria: task category + target entity + case ID
- Duplicate tasks get `duplicate` status
- Superseded tasks (from older runs) get `superseded` status

## DB Tables

| Table | Purpose |
|---|---|
| `follow_up_tasks` | Active tasks |
| `task_status_history` | Status change audit trail |

## Status: CURRENT, STABLE
