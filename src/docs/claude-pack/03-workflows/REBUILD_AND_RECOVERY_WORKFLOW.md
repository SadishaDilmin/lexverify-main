# Rebuild and Recovery Workflow

> **AI Reader Notes**: Operational recovery procedures.

## When Recovery Is Needed

1. Consolidation stuck in `finalisation_running` or `pending_consolidation`
2. Stale/corrupt `ai_reports` data
3. Missing downstream artefacts (tasks, review items, observability events)

## Recovery Options

### Option 1: Re-run Analysis
- User can re-submit the SoW form
- New run supersedes previous
- Old review items auto-closed
- Old tasks auto-superseded
- New credit deduction required

### Option 2: Operations Read Model Recovery
- `operations-read` edge function provides recovery endpoints:
  - `/case-consistency` — checks case data consistency
  - `/governance-consistency` — checks governance data consistency
  - `/rebuild-precheck` — validates rebuild is safe
  - `/rebuild-execute` — re-generates downstream artefacts from existing AI output
  - `/case-recovery-summary` — summarises recovery status

### Option 3: Manual DB Intervention
- Update `finalisation_status` directly
- Re-trigger `sow-finalise` manually
- Requires admin/super_admin access

## Stale Guard Protection

The background finaliser includes a Stale Guard that:
1. Verifies the `aiReportId` matches expected
2. Checks `created_at` for newer reports
3. Refuses to overwrite if a newer run exists

This prevents older background processes from corrupting newer data.

## Status: CURRENT — recovery endpoints deployed
