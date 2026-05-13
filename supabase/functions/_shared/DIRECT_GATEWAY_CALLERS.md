# Direct Gateway / Vertex Caller Backlog

**Last audited**: 2026-04-25
**Audit method**: `rg -n 'ai\.gateway\.lovable\.dev|aiplatform\.googleapis\.com' supabase/functions/`

This file tracks every edge function under `supabase/functions/` that calls the Lovable AI Gateway URL or a Vertex AI URL via raw `fetch()`, bypassing `_shared/aiGateway.ts` / `_shared/vertexClient.ts` / `_shared/vertexAnthropicClient.ts`.

Each entry records:
- File and line number of the direct call
- Whether the call processes **full case data** (regulated client material), **partial case data** (a derived artefact such as a single judge candidate output, an extracted field set, or a classification stub), or **no case data** (knowledge-base, telemetry, support-chat, synthetic generation)
- Migration scope: **in-scope** (must move onto `aiGateway`), **out-of-scope** (judge / RAG / no-case-data utility kept on Lovable Gateway by policy), or **authorised exception** (documented Vertex direct-call exception per Amendment 1 v1.1 §3.2)

The four primary SoW reasoner sites (agent-chat main stream, agent-chat MIME-fallback retry, `regenerateWithImprovements`, `cleanUpFindings`, sow-chunk-worker) **are no longer in this list** — they were migrated onto `aiGateway.chatStream()` on 2026-04-25.

---

## Authorised exceptions (Amendment 1 v1.1 §3.2)

These functions are permitted to call the Lovable Gateway directly. They are documented exceptions to the routing-layer rule because of historical multimodal-payload constraints, tool-calling format requirements, or scope (single-document extraction, never full-case reasoning).

| Function | Line(s) | Data scope | Notes |
|---|---|---|---|
| `extract-doc-summaries/index.ts` | 228, 507 | Partial case data (single document at a time; no cross-doc reasoning) | Authorised exception. Multimodal PDF/image extraction; payload shape predates `aiGateway.chat()` multimodal support. Header comment at line 11 references the EU residency posture. |
| `extract-armalytix/index.ts` | (none — already migrated) | — | Previously listed as authorised exception; now routes through `aiGateway.chat()` with tool calling. Kept here as a reference: the exception slot remains available if a future regression forces a direct call. |

---

## In-scope (migration backlog — direct callers that should move onto `aiGateway`)

These are SoW-adjacent or case-data-touching call sites that should eventually be migrated onto `aiGateway.chat()` / `aiGateway.chatStream()` so they benefit from Vertex EU residency, automatic provenance logging, and the Anthropic/Vertex routing layer. None of these are blocking the Opus rollout — they were already on the Lovable Gateway before the SoW migration and continue to be.

| Function | Line(s) | Data scope | Migration priority | Notes |
|---|---|---|---|---|
| `enquiry-reply-prescan/index.ts` | 207 | Full case data (client reply email body matched against case enquiries) | High | Touches client-facing email content; should move onto Vertex EU path. |
| `sow-section-rerun/index.ts` | 187 | Full case data (re-runs a single SoW section against full case context) | High | Direct cousin of the migrated SoW pipeline; should be migrated alongside the next chunk-worker change. |
| `sow-section-validator/index.ts` | 175 | Partial case data (validates one SoW section finding) | Medium | Validator output, not primary reasoning. |
| `sow-finding-resolution/index.ts` | 119 | Partial case data (drafts resolution wording for a single finding) | Medium | Per-finding draft; not full-report. |
| `agent-query/index.ts` | 290, 338 | Full case data (case Q&A) | Medium | Two call sites; one is reasoning, one is follow-up. |
| `ai-case-search/index.ts` | 77 | Full case data (semantic search over a case workspace) | Medium | |
| `extract-case-fields/index.ts` | 186 | Full case data (extracts structured fields from case documents) | Medium | |
| `extract-form-from-docs/index.ts` | 341, 422 | Full case data (extraction + judge) | Medium | Judge call at 422 is partial-data; extraction at 341 is full. |
| `ingest-replies/index.ts` | 279, 415, 756 | Full case data (matches inbound replies to enquiries) | Medium | Three sites; 756 is the matcher, 279/415 are pre-screen and follow-up. |
| `benchmark-compare/index.ts` | 53 | Full case data (compares case output against benchmark) | Low | Admin/QA tooling, not user-facing. |
| `rename-document/index.ts` | 196, 276 | Partial case data (filename + first-page text only; line 276 is judge) | Low | Filename suggestion + judge; no full document content. |
| `regulatory-audit-worker/index.ts` | 108 | No case data (embeddings against regulatory KB) | Low | Embeddings endpoint, not chat. |
| `embed-knowledge/index.ts` | 515 | No case data (knowledge-base ingest) | Low | KB workload, not case data. |
| `detect-title-defects/index.ts` | 18 (helper) | Full case data (title-defect analyser, used downstream by other workers) | Low | Helper `callAI` wraps the gateway; multiple call sites use this helper at 333/485/566/603. Migration would mean refactoring the shared helper to delegate to `aiGateway.chat()`. |

---

## Out-of-scope (judges, RAG, support, synthetic generation, telemetry)

These call sites are intentionally retained on the Lovable Gateway. They either (a) judge a candidate output rather than process full case data, (b) operate on knowledge-base / support / synthetic content with no case linkage, or (c) are admin/diagnostic tooling.

| Function | Line(s) | Data scope | Reason out-of-scope |
|---|---|---|---|
| `agent-chat/index.ts` | 4841 | Partial (judge candidate output) | `judgeOutput` — safety judge against a single candidate response. |
| `agent-chat/index.ts` | 4963 | Partial (judge candidate output) | `judgeAgentQuality` — quality judge. |
| `agent-chat/index.ts` | 5109 | Partial (judge candidate output) | `judgeFindingsRelevance` — relevance gate. |
| `agent-chat/index.ts` | 5385 | No case data (RAG embedding query string only) | RAG embedding fetch for knowledge-chunk retrieval. |
| `classify-aml-docs/index.ts` | 198, 543, 963 | Partial (per-document classification; judges) | Document classification + name/judge. Per-doc, not full-case. |
| `classify-knowledge-docs/index.ts` | 236, 393 | No case data (KB document classification) | Knowledge-base ingest workflow. |
| `ingest-file-to-text/index.ts` | 66, 98, 154, 250, 347 | No case data (text extraction + embeddings during ingest) | Document text extraction utility. |
| `search-knowledge-base/index.ts` | 26 | No case data (KB embedding search) | KB query embedding. |
| `support-chat/index.ts` | 200 | No case data (in-app help chat) | Support chatbot; no case context. |
| `verify-prompt-deploy/index.ts` | 35 | No case data (prompt smoke test) | Admin/diagnostic. |
| `generate-synthetic-case/index.ts` | 51 | No case data (synthesises fake case for testing) | Admin/test tooling. |
| `sync-hoowla/index.ts` | 988 | Partial (parses memo PDFs from Hoowla sync) | Hoowla integration; per-memo, not full case reasoning. |

---

## Notes for future work

- **No new direct callers**: any new edge function under `supabase/functions/` that needs an AI call must use `aiGateway.chat()` or `aiGateway.chatStream()`. Direct `fetch` to `ai.gateway.lovable.dev` or `*-aiplatform.googleapis.com` requires explicit sign-off and an entry added to this file.
- **Anthropic models cannot use the Lovable Gateway**: see `src/docs/claude-pack/02-architecture/AI_ROUTING_AND_MODEL_USAGE.md` § "Critical: No Anthropic Gateway Fallback". Any new caller that wants `anthropic/*` must route through `aiGateway` so the Vertex Anthropic path is taken.
- **Re-audit cadence**: re-run the `rg` command at the top of this file after every edge-function change that touches AI calls. Update this table in the same PR.
