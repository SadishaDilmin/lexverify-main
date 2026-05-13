# Finalisation Workflow

> **AI Reader Notes**: This is the workflow currently under incident recovery.

## Trigger
Completion of multi-chunk SoW analysis in `agent-chat`.

## Architecture

### Single-Pass (Small Cases)
- < `SINGLE_PASS_CHAR_THRESHOLD` characters total
- All documents processed in one AI call
- Output written directly to `ai_reports`
- `finalisation_status` = 'completed' immediately

### Multi-Chunk (Standard Cases)
1. `agent-chat` completes all chunk workers
2. Raw outputs stored in `ai_reports.chunk_output_raw`
3. `finalisation_status` set to 'pending_consolidation'
4. `sow-finalise` triggered via `EdgeRuntime.waitUntil`
5. Client receives 202 Accepted, begins polling

### sow-finalise Process
1. Sets `finalisation_status` = 'finalisation_running'
2. **Stale Guard**: verifies `aiReportId` + checks no newer report exists
3. Assembles consolidation prompt with chunk outputs (180K char cap)
4. Calls AI model (google/gemini-2.5-pro, 900s timeout)
5. Parses consolidated output into: internal_report, client_report, draft_email
6. Writes to `ai_reports` table
7. Sets `finalisation_status` = 'completed'

### Client Polling
- `useSoWSubmit` polls `ai_reports.finalisation_status` every 3 seconds
- UI transitions on state change

## State Transitions

```
pending_consolidation → finalisation_running → completed
                                             → failed
                                             → timeout
```

## Failure Modes

| Failure | State Left In | Recovery |
|---|---|---|
| Edge function timeout | `finalisation_running` | Manual re-trigger |
| Context cancelled | `pending_consolidation` | Manual re-trigger |
| Stale guard reject | No change | Automatic (newer run wins) |
| AI model error | `failed` | Retry via UI |
| Character overflow | `failed` | Reduce document set |

## Status: CURRENT but IN INCIDENT RECOVERY
- Background waitUntil path is architecturally correct
- Operational reliability needs repair
- Polling fallback is active on client side
