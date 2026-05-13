# Operations Runbook

> **AI Reader Notes**: How to investigate and resolve common operational issues.

## Investigating Stuck Finalisation

1. Check `ai_reports` for the case: `SELECT finalisation_status, created_at FROM ai_reports WHERE case_id = '...' ORDER BY created_at DESC LIMIT 5`
2. If `finalisation_running` for > 15 minutes → likely timed out
3. Options: re-submit SoW form (new run) or manually set `finalisation_status = 'failed'`

## Investigating Missing Reports

1. Check `ai_reports` exists for the case
2. Check `finalisation_status` — may be stuck in `pending_consolidation`
3. Check `chunk_output_raw` — if populated, consolidation failed
4. Check edge function logs for errors

## Investigating Review Queue Items

1. Query `review_queue WHERE case_id = '...'`
2. Check `review_reasons` JSONB field for why review was triggered
3. Check `observability_events` for the AI run

## Investigating Credit Issues

1. `SELECT balance FROM user_credits WHERE user_id = '...'`
2. `SELECT * FROM credit_transactions WHERE user_id = '...' ORDER BY created_at DESC`
3. Check for failed deduction (should be atomic via `deduct_credits_atomic`)

## Edge Function Monitoring

- Function logs available via Supabase dashboard (admin access)
- Key log prefixes: `[injection-guard]`, `[sow-post-process]`, `[judge-*]`
- Rate limiting logged at `[rate-limit]`

## Recovery Endpoints (operations-read function)

- `POST /case-consistency` — check case data integrity
- `POST /rebuild-precheck` — validate rebuild safety
- `POST /rebuild-execute` — regenerate downstream artefacts
- `POST /case-recovery-summary` — recovery status overview
