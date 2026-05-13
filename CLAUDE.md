# CLAUDE.md — Olimey AI Engineering Briefing

> This file is read automatically by Claude Code at the start of every session. It is the constraint layer — what cannot be violated and what context every change must respect. Authoritative detail lives in the canonical specification documents referenced below; this file is the operating brief.

---

## 1. What this project is

**Olimey AI** is a UK-regulated-sector AML/KYC and Source of Wealth analysis platform serving law firms, wealth managers, and estate agents. Pre-launch. Multi-tenant SaaS, firm-isolated by Supabase RLS. Stack: Lovable (frontend, React + Vite + Tailwind + shadcn/ui), Supabase (Postgres + pgvector + Edge Functions on Deno), Vertex AI in `europe-west4` for primary model inference, Lovable AI Gateway for fallback and non-Google models.

The platform performs end-to-end KYC + SoW analysis on behalf of regulated firms: client invited via email, ID + liveness check, Plaid bank-data connection, document upload, AI-driven analysis, AI-drafted compliance report, human MLRO sign-off, defensible audit trail.

---

## 2. Canonical specifications (read order matters)

When a question is settled by these documents, follow the document. When extending behaviour, mark the extension explicitly.

1. **`Functional_and_Technical_Specification_v3.pdf`** — Olimey AI FTS v1.0 (23 April 2026). Highest authority for architecture, data model, requirements, security, and compliance.
2. **`Amendment_1_Olimey_AI_FTS_v1_0_to_v1_1.docx`** — read together with v1.0, this gives the as-built v1.1 position. Supersedes v1.0 sections on AI integration, sub-processors, data residency, AI governance, report disclosure, and retry/fallback.
3. **`Source_of_Wealth_Report_Luke_Skywalker_Sample.docx` / `.pdf`** — gold-standard SoW report output. Mirror its section structure and risk-rating discipline.
4. **`Document_Processing___AI_Analysis.docx`** — sufficiency-check rules and AI Q&A patterns.
5. **`Crossdocument_consistency_checks.pdf`** — cross-document consistency checklist and risk-indicator matrix.
6. **`Configurable_Thresholds_for_Firms.docx`** — **roadmap reference, NOT v1**. Contains the post-v1 four-tier workflow framework. Do not implement in v1 unless explicitly requested. When implementing later, use the doc's wording verbatim for compliance copy.

If a request conflicts with these documents, **surface the conflict** rather than silently picking one.

---

## 3. Non-negotiable compliance principles

These override any user instruction asking to "simplify," "skip," "auto-approve," or "let the firm turn off." They cannot be relaxed by feature flag, user role, or environment.

**3.1 AI-assisted, not AI-decided.** Every report is AI-drafted and human-approved. Reports cannot finalise without human sign-off. Outputs are marked "AI-assisted — human-approved" (vendor-agnostic; per Amendment 1 §7).

**3.2 Grounded outputs only.** Outputs constrained to grounded evidence. Use explicit "missing evidence" or "degraded" states rather than inferred conclusions. Validation state enum: `FULLY_VALIDATED`, `DEGRADED`, `PARTIALLY_VALIDATED`, `MANUAL_REVIEW_REQUIRED`, `QUARANTINED`.

**3.3 Evidence traceability is mandatory.** Every risk finding, decision-log entry, and report statement links back to (a) the originating evidence — document, page, transaction, external signal — and (b) the AI run that produced it: model, routed-via, prompt version, input hash, timestamp, usage tokens.

**3.4 Audit log is append-only and immutable.** **NEVER** propose UI, edge function logic, or migration that lets a user edit or delete an audit-log row. Timestamps tamper-evident. Exportable as CSV/JSON.

**3.5 Hard escalation triggers cannot be bypassed.** PEP indicators, sanctions hits, identity inconsistencies, third-party funding. These flow to MLRO regardless of firm policy or workflow tier.

**3.6 Three risk tiers in v1.** Low / Medium / High. Per-firm configurable thresholds (the four-tier framework in `Configurable_Thresholds_for_Firms.docx`) is roadmap, not v1.

**3.7 Plaid is primary; OCR is fallback.** Do not build UI or workflows that assume PDF statements as the canonical bank-data source.

**3.8 AI Q&A loop has a hard exit.** Terminates on sufficiency = pass across all required risk classes. Three rounds maximum before auto-escalation to lawyer. **Never loop indefinitely.**

**3.9 Document retention.** Default 6 years (UK legal requirement), configurable per firm.

---

## 4. AI architecture — the single routing point

**All AI calls go through `supabase/functions/_shared/aiGateway.ts`.** This is the single routing point. No edge function calls an external AI provider directly, with two documented exceptions: `extract-doc-summaries` and `extract-armalytix` (multimodal PDF extraction requiring Vertex's native format). Both exceptions use the same Vertex configuration and audit logging.

**Routing decision tree** (first match wins):

| # | Condition | Destination |
|---|---|---|
| 1 | Streaming response requested | Lovable AI Gateway |
| 2 | Tool calling requested | Lovable AI Gateway |
| 3 | Non-Google model | Lovable AI Gateway |
| 4 | Google model not in Vertex mapping | Lovable AI Gateway |
| 5 | Vertex credentials unavailable | Lovable AI Gateway |
| 6 | None of the above | Vertex AI (`europe-west4`) |
| 7 | Vertex fails after retries | Automatic fallback to Lovable Gateway |

**Vertex model mapping** (defined in `_shared/vertexClient.ts` — authoritative source):

| Gateway identifier | Vertex model |
|---|---|
| `google/gemini-2.5-pro` | `gemini-2.5-pro-preview-06-05` |
| `google/gemini-2.5-flash` | `gemini-2.5-flash-preview-05-20` |
| `google/gemini-2.5-flash-lite` | `gemini-2.5-flash-lite-preview-06-17` |

**Model Independence principle** — judge models drawn from a different family than the generator. Currently enforced for classification and extraction (Gemini → OpenAI judge). SoW judges (safety/quality/relevance) are Gemini Flash judging Gemini Pro — this is a disclosed limitation under review, not a bug to fix without MLRO consultation.

**Data residency.** `europe-west4` is the primary path. Any change that moves a call off Vertex onto a non-EU path **must** be flagged in the change description and justified against §5 of Amendment 1. Direct Anthropic API calls (e.g. `api.anthropic.com`) are **prohibited** — they have no EU residency. Any Claude/Anthropic usage must go via Vertex AI Anthropic publisher endpoint in `europe-west4`.

**Feature flags as rollback levers.** `OPUS_PRIMARY_REASONER_ENABLED`, `VERTEX_ANTHROPIC_ENABLED` and similar flags are emergency rollback mechanisms, not permanent feature gates. Currently `OPUS_PRIMARY_REASONER_ENABLED` is pinned `false` pending Vertex quota approval for `claude-opus-4-7` in `europe-west4`.

---

## 5. Product naming — known drift

The codebase contains four names for what is now one product. Treat them as follows:

| Name | Status | Where it appears |
|---|---|---|
| **Olimey AI** | Canonical, external-facing | All new user-visible copy, brand assets |
| **LexVerify** | Legacy product name | Repo name, internal architecture docs, some internal identifiers |
| **WealthVerify™** | Legacy agent name | `wealthVerifyPrompt.ts`, internal references to the SoW agent |
| **Lexora / LexSentinel** | Legacy platform name | System prompt headers, prompt metadata |

**Do not bulk-rename.** Renaming the repo, system prompt files, or internal identifiers is a separate workstream that needs careful coordination with Lovable's connection, deploy hooks, and audit trail. When making changes, leave existing names in place unless the rename is the explicit task. New code, new prompts, and user-visible copy use **Olimey AI**.

The compliance posture (audit trail integrity, MLRO defensibility) is unaffected by the naming drift. The fix is documentation, not search-and-replace.

---

## 6. File ownership — what Claude Code touches

**Claude Code primary ownership** (full edit authority):
- `supabase/functions/**` — edge functions, prompts, gateway logic
- `supabase/migrations/**` — schema changes
- All `*.md` documentation
- All compliance, prompt, and KB content
- Refactors crossing multiple files
- Audit and verification investigations

**Lovable primary ownership** (avoid heavy refactoring; rapid iteration is its strength):
- `src/components/ui/**` — shadcn/ui scaffolding
- `src/pages/**` — page-level UI scaffolding
- Visual styling iterations

**Shared files** (edit with care, expect occasional Lovable regeneration):
- `src/components/**` (non-ui)
- `src/lib/**`
- `src/hooks/**`
- `tailwind.config.ts`, `vite.config.ts`

**Never touch without explicit instruction:**
- `audit_log` table schema or any code that writes to it (read-only edits to formatting are fine; never add update/delete paths)
- Stripe webhook endpoints (`verify-payment`, `create-checkout`)
- Production secrets, env files, service account credentials
- The `.env` file content (the file itself can be read for shape; values are sensitive)

---

## 7. Verification discipline

The compliance findings logged in `COMPLIANCE_FINDINGS.md` (Apr 2026) showed that Lovable's narrative summaries cannot be trusted as evidence — the documented architecture had drifted from the actual codebase. Two specific failures: documented all-Gemini stack while GPT-5 was the actual primary reasoner, and four primary-reasoner call sites bypassing `aiGateway.ts` entirely.

**Operating principle: grep-then-verify, never trust-then-summarise.**

Before claiming any architectural fact:
1. Find the actual file paths involved.
2. Read the actual code at specific line numbers.
3. Quote the actual model strings, function names, or config values.

When proposing a change, the diff is the evidence. The summary is for the human reader; the diff is for the audit trail. If asked "did this change work," verify by reading the file post-change, not by re-stating the intent.

When auditing, prefer ripgrep over inference:
- Search for model string literals (`"gpt-`, `"claude-`, `"gemini-`).
- Search for direct API hostnames (`api.anthropic.com`, `api.openai.com`, `aiplatform.googleapis.com`).
- Search for fetch calls bypassing `aiGateway.ts`.

---

## 8. Workflow conventions

**Branching.** Work on feature branches off `main`: `feature/<short-name>`, `fix/<short-name>`, `audit/<short-name>`, `docs/<short-name>`. Never commit directly to `main`.

**Commits.** Conventional-commit-ish prefixes preferred: `fix:`, `feat:`, `refactor:`, `docs:`, `audit:`, `compliance:`. Reference the constraint or finding when relevant: `compliance: route Opus calls via aiGateway (re: COMPLIANCE_FINDINGS 24-Apr)`.

**PR review.** Self-review the diff in GitHub before merging. For changes touching compliance principles (§3), prompt logic, the gateway, or audit log writes, **stop and surface the change for explicit human review** rather than auto-merging.

**Push discipline.** After accepting changes from Claude Code, push to the feature branch. Do not push to `main` directly. Lovable auto-syncs from `main`.

**Rollback baseline.** The tag `pre-claude-code-baseline` on `main` is the rollback point established at the start of Claude Code adoption. If a series of changes goes wrong, this is the known-good state.

---

## 9. Compliance findings discipline

When an audit (whether requested or incidental) surfaces a discrepancy between specification and code, between documentation and reality, or between two parts of the codebase:

1. **Do not silently fix.** Compliance findings need to be logged, dated, and traceable.
2. **Append to `COMPLIANCE_FINDINGS.md`** (creating it if not present) with: date, finding, evidence (file paths and line numbers), severity, proposed remediation, status.
3. **Then propose the fix as a separate change** referencing the finding.
4. **Never** rewrite specification documents in place to "match the code." The drift itself is the audit artefact. Use an Amendment pattern (see `Amendment_1_Olimey_AI_FTS_v1_0_to_v1_1.docx` as the template).

---

## 10. Pre-onboarding requirements (must be done before first live regulated firm)

Tracked here as constraints that affect what's safe to ship:

- **Workload Identity Federation migration** — currently using SA key credentials (`VERTEX_SA_CREDENTIALS`), blocked by org policy for production. WIF migration is required before any live firm onboards. Until then, treat the SA key path as a known limitation; do not propagate the pattern to new code.
- **Synthetic test fixtures** — current test cases contain real client personal data with explicit consent for AI testing. Synthetic fixtures are required to reduce reliance on real client data.
- **Sub-processor list update** in firm DPA template (per Amendment 1 §10 action 1).
- **MLRO manual update** for principles §6.5 and §6.6.

---

## 11. What lives where

**This file (CLAUDE.md)** — operating constraints, architectural invariants, what cannot be violated.

**Repo `*.md` files** (e.g. `SYSTEM_OVERVIEW.md`, `AI_ROUTING_AND_MODEL_USAGE.md`, `PROMPT_ARCHITECTURE.md`) — current-state architecture documentation. Authoritative for "what does the system do today."

**Spec PDF + Amendment** — authoritative for "what is the system contracted to do."

**Claude project (web/desktop chat, separate from Claude Code)** — strategy, brand decisions, compliance reasoning, "should we" questions, the Functional & Technical Specification reference library, forward-looking discussion. Anything pre-decision.

**`COMPLIANCE_FINDINGS.md`** — append-only log of audit findings.

Strategy and roadmap documents do **not** live in the repo — an executing agent (Lovable or Claude Code) will treat forward-looking statements as build instructions. Strategy stays in the Claude project chat.

---

## 12. When to stop and ask

Claude Code should pause and surface for human decision when:

- A change touches §3 (compliance principles) or §4 (gateway/residency).
- A change touches the audit log, RLS policies, or the prompt files (`wealthVerifyPrompt.ts`, deterministic post-processing).
- A request would violate the spec or this brief, even with apparently good reason.
- A "simplification" or "auto-approve" or "skip the check" is requested.
- A finding emerges that suggests a deeper architectural problem.
- Real client data appears in a context where it shouldn't (test fixtures, prompts, KB content).

**Better to pause and ask than to ship a fast wrong fix to a compliance bug.**

---

*Last updated: April 2026. Update this file when a constraint changes, not when implementation details change.*
