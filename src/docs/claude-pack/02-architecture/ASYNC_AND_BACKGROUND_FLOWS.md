# Async and Background Flows

> **AI Reader Notes**: Understanding sync vs async is critical for debugging finalisation issues.

## Synchronous Flows

| Flow | Entry Point | Timeout |
|---|---|---|
| Document upload + classification | Client → Storage → `classify-aml-docs` | Standard edge function timeout |
| Text extraction | Client → `ingest-file-to-text` | Standard |
| Knowledge search | Client → `search-knowledge` | Standard |
| Review actions | Client → `review-actions` | Standard |
| CMS sync | Client → `sync-hoowla` | Standard |

## Streaming Flows

| Flow | Entry Point | Mechanism |
|---|---|---|
| Main SoW analysis | Client → `agent-chat` | Server-Sent Events (SSE) |
| Chunk worker | `agent-chat` → `sow-chunk-worker` | Internal call, SSE response |

## Background / Async Flows

| Flow | Entry Point | Mechanism | Status |
|---|---|---|---|
| Consolidation | `agent-chat` → `sow-finalise` | `EdgeRuntime.waitUntil` | IN RECOVERY |
| Benchmark batch | Client → `benchmark-worker` | Batch job processing | CURRENT |

## Consolidation Architecture (Target)

```
agent-chat completes chunk processing
    → Creates ai_reports row: finalisation_status = 'pending_consolidation'
    → Stores chunk_output_raw
    → Returns 202 Accepted to client
    → Triggers sow-finalise via waitUntil

sow-finalise (background):
    → Sets finalisation_status = 'finalisation_running'
    → Calls AI model for consolidation (180K char cap, 900s timeout)
    → Stale Guard: verifies aiReportId + checks for newer reports
    → On success: writes internal_report, client_report, draft_email
    → Sets finalisation_status = 'completed'

Client (polling):
    → Polls ai_reports.finalisation_status every 3 seconds
    → Transitions UI state on 'completed'
```

## Failure Modes

| Failure | Effect | Recovery |
|---|---|---|
| Consolidation timeout | `finalisation_status` stays `finalisation_running` | Manual re-trigger or rebuild |
| Stale Guard reject | Prevents overwrite of newer run | Automatic — no action needed |
| Edge function crash | `finalisation_status` stays `pending_consolidation` | Manual re-trigger |
| Context exceeded | Consolidation fails with truncation | Reduce document set or increase limit |
