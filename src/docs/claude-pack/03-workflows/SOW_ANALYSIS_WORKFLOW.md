# Source of Wealth Analysis Workflow

> **AI Reader Notes**: This is the most complex and critical workflow. Read carefully.

## Trigger
User fills SoW form (`SoWFormUI`) and clicks submit. Orchestrated by `useSoWSubmit` hook.

## Inputs
- Case ID, client name, purchase price, funding source, additional context
- Attached files (or files already in case folder)
- User session (JWT for auth)

## Pre-Submission Steps

1. **Credit check** → `estimateSoWCredits()` calculates cost
2. **Atomic credit deduction** → `deduct_credits_atomic` RPC (row-locked)
3. **Document pre-processing** → `preProcessDocuments()`
   - For each file: extract text via `ingest-file-to-text`
   - Track extraction stats (chars, method, quality)
4. **Domain splitting** → `mapDocsToDomains()`
   - Documents grouped into domains: identity, income, savings, mortgage, gift, investment, etc.
   - If < `MIN_DOCS_FOR_DOMAIN_SPLIT` documents or < `SINGLE_PASS_CHAR_THRESHOLD` chars: single-pass
5. **Chunk sizing** → `chunkDocumentsBySize()`
   - Splits domains into chunks respecting `MAX_AGENT_CHAT_MESSAGE_CHARS`

## Analysis Steps

6. **Context resolution** → `resolve-sow-context` edge function
   - Assembles case data, party info, Armalytix data
   - Builds assessment context with bounded character limits
7. **Knowledge retrieval** → `search-knowledge` edge function
   - Semantic search for relevant compliance guidance
   - Filtered by agent ID, tenure type
8. **Per-chunk analysis** → `sow-chunk-worker` or direct `agent-chat` call
   - System prompt: `WEALTH_VERIFY_PROMPT` (2490 lines)
   - Includes: case context, document text, knowledge base chunks, firm policy rules
   - Streaming SSE response
9. **Judge pipeline** (per-chunk or on consolidated output):
   - **Safety judge** → checks for harmful/non-compliant content
   - **Quality judge** → scores output quality, identifies defects
   - **Relevance gate** → filters irrelevant content
10. **Deterministic post-processing** → `deterministicPostProcessing.ts`
    - LSAG 15-point checklist extraction + enforcement
    - Section injection (missing required sections)
    - Co-purchaser/gift guardrail enforcement
    - Live-to-zero savings guardrail enforcement
    - Overreach guard (12 rules to soften dangerous assertions)
    - Authority label correction
    - Armalytix re-request suppression
    - Visible body enforcement
11. **Wave 2–13 enrichment pipeline**:
    - Evidence extraction → `buildStructuredEvidenceReport()`
    - Material findings → `extractMaterialFindings()`
    - Decision log → `extractDecisionLogEntries()`
    - Wave 4: Compliance policy → `runWave4Pipeline()`
    - Wave 5: Policy governance → `loadFirmPolicyFromDb()`
    - Wave 7: External intelligence → `buildExternalProfile()`
    - Wave 8: Task generation → `generateTasksFromDisposition()`
    - Wave 9: Document intelligence enrichment
    - Wave 10: Financial extraction → `extractTxns()`, `detectFinancialPatterns()`
    - Wave 11: Narrative grounding → `enrichFindings()`
    - Wave 12: Report plan → `assembleReportPlan()`
    - Wave 13: Calibration observability → `calibrationObservabilityEvents()`
12. **Operational output** → `generateOperationalOutput()`
    - Missing evidence roadmap
    - Readiness state
    - Task generation
    - Delta review (if previous run exists)

## Post-Analysis

13. **Persist to DB** → `ai_reports` table
    - `chunk_output_raw`: raw chunk output
    - `finalisation_status`: 'pending_consolidation' or 'completed'
14. **Background consolidation** → `sow-finalise` (if multi-chunk)
    - Merges chunk outputs into: `internal_report`, `client_report`, `draft_email`
15. **Evidence map persistence** → `evidence_references` table
16. **Review queue** → creates review items if needed
17. **Task persistence** → `follow_up_tasks` table
18. **Observability events** → `observability_events` table
19. **Audit log** → `audit_log` table

## Outputs
- Internal compliance report (markdown)
- Client-facing summary
- Draft enquiry letter
- LSAG checklist
- Decision log
- Risk rating
- Evidence map
- Missing evidence roadmap
- Follow-up tasks
- Review queue items (if quality/safety issues)
- Observability events

## Failure Points
- Credit deduction failure → blocked, credits refunded
- Document extraction failure → degraded analysis with caveats
- AI model timeout → retry with backoff
- Judge safety fail → output quarantined, review required
- Consolidation timeout → stuck in pending state (see recovery)

## Status: CURRENT, STABLE (consolidation path in recovery)
