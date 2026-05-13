# Architecture Overview

> **AI Reader Notes**: This is the primary architecture document. Read this to understand how the system fits together.

## High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                 FRONTEND (React/Vite)            │
│  Pages → Components → Hooks → Supabase Client   │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS / WebSocket
┌──────────────────────▼──────────────────────────┐
│              SUPABASE PLATFORM                   │
│  ┌─────────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Edge Funcs   │  │ Postgres  │  │ Storage   │  │
│  │ (Deno)       │  │ + RLS     │  │ (S3-like) │  │
│  └──────┬──────┘  └───────────┘  └───────────┘  │
│         │                                        │
│  ┌──────▼──────┐  ┌───────────┐  ┌───────────┐  │
│  │ Auth        │  │ Realtime  │  │ Vault      │  │
│  └─────────────┘  └───────────┘  └───────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              AI MODEL LAYER                      │
│  ┌─────────────────┐  ┌─────────────────────┐   │
│  │ Vertex AI        │  │ Lovable AI Gateway  │   │
│  │ (Google models)  │  │ (OpenAI + fallback) │   │
│  │ europe-west4     │  │                     │   │
│  └─────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────┘
```

## Frontend Architecture

- **Framework**: React 18 with TypeScript 5
- **Bundler**: Vite 5
- **Styling**: Tailwind CSS v3 + shadcn/ui components
- **Routing**: react-router-dom v6, lazy-loaded pages
- **State**: React Query for server state, React context for auth
- **Route protection**: `ProtectedRoute` (auth check) and `AdminRoute` (role check via `has_role()`)

### Key Frontend Directories

| Directory | Purpose |
|---|---|
| `src/pages/` | 60+ page components (lazy-loaded) |
| `src/components/` | Shared UI components, organized by domain |
| `src/hooks/` | Custom hooks (auth, credits, sync, submission, etc.) |
| `src/contexts/` | `AuthContext` — session, profile, role management |
| `src/routes/` | `AppRoutes.tsx` — all route definitions |
| `src/lib/` | Utility libraries, PDF/DOCX export, classification |
| `src/config/` | Agent configuration (`agents.ts`) |
| `src/types/` | Shared TypeScript types |
| `src/integrations/supabase/` | Auto-generated Supabase client + types |

## Backend Architecture (Edge Functions)

All backend logic runs as Supabase Edge Functions (Deno runtime).

### Critical Path Functions

| Function | Purpose | Sync/Async |
|---|---|---|
| `agent-chat` | Main Olimey AI orchestration (3815 lines) | Streaming SSE |
| `sow-chunk-worker` | Per-domain document batch processing | Sync (called by agent-chat) |
| `sow-finalise` | Background consolidation of chunk outputs | Background (waitUntil) |
| `sow-section-validator` | Post-generation section validation | Sync |
| `resolve-sow-context` | Context resolution for SoW analysis | Sync |

### Shared Modules (`supabase/functions/_shared/`)

| Module | Wave | Purpose | Lines |
|---|---|---|---|
| `aiGateway.ts` | - | Hybrid AI routing (Vertex + Lovable Gateway) | 336 |
| `wealthVerifyPrompt.ts` | 1+ | System prompt (2490 lines) | 2490 |
| `deterministicPostProcessing.ts` | 1+ | LSAG enforcement, guardrails, section injection | 2872 |
| `inputGuardrails.ts` | 1+ | Prompt injection detection, sanitisation | 218 |
| `judgeOrchestration.ts` | 1+ | Safety/quality/relevance judges | 454 |
| `judgeOutcomes.ts` | 1 | Validation state model, operational rules | 596 |
| `evidenceEngine.ts` | 2 | Evidence references, LSAG parsing, findings | 1357 |
| `operationalEngine.ts` | 3 | Roadmaps, readiness, delta review | 912 |
| `compliancePolicy.ts` | 4 | Firm policy, overreach guards, funding detection | 943 |
| `policyGovernance.ts` | 5 | DB-backed policy loading, versioning | 332 |
| `reviewEngine.ts` | 6 | Review workflow, dispositions, observability | 781 |
| `externalIntelligence.ts` | 7 | External profile enrichment | 699 |
| `taskLifecycleEngine.ts` | 8 | Follow-up task generation, dedup | 495 |
| `documentIntelligence.ts` | 9 | Document quality, entity extraction | 864 |
| `transactionExtraction.ts` | 10 | Row-level financial extraction | 1317 |
| `narrativeGrounding.ts` | 11 | Finding-evidence linkage, wording tiers | 632 |
| `groundedReportPlan.ts` | 12 | Two-pass report planning | 670 |
| `calibrationBenchmarking.ts` | 13 | Evaluation, disagreement, calibration signals | 712 |

### Supporting Functions

| Function | Purpose |
|---|---|
| `classify-aml-docs` | AI document classification |
| `ingest-file-to-text` | Document text extraction |
| `extract-armalytix` | Armalytix report parsing |
| `smart-ocr-routing` | OCR escalation routing |
| `search-knowledge` | Semantic knowledge search |
| `search-knowledge-base` | Knowledge base semantic search |
| `embed-knowledge` | Generate embeddings for knowledge chunks |
| `review-actions` | Review disposition actions |
| `companies-house-lookup` | Companies House API |
| `fca-register-check` | FCA Register API |
| `ofsi-sanctions-check` | OFSI sanctions screening |
| `fatf-jurisdiction-check` | FATF country risk check |
| `sync-hoowla` | Hoowla CMS sync |
| `generate-agent-context` | Pre-analysis context generation |
| `benchmark-compare` | Benchmark comparison |
| `benchmark-analyze-patterns` | Failure pattern analysis |
| `benchmark-worker` | Benchmark job processing |

## AI Model Routing

The `aiGateway.ts` module routes AI calls based on payload characteristics:

| Condition | Route | Region |
|---|---|---|
| Google model + no streaming + no tools | Vertex AI | europe-west4 (EU) |
| Everything else | Lovable AI Gateway | Default |
| Vertex failure | Automatic fallback to Lovable Gateway | Default |

### Model Mapping (Vertex)

| Gateway Name | Vertex Model |
|---|---|
| `google/gemini-2.5-pro` | `gemini-2.5-pro-preview-06-05` |
| `google/gemini-2.5-flash` | `gemini-2.5-flash-preview-05-20` |
| `google/gemini-2.5-flash-lite` | `gemini-2.5-flash-lite-preview-06-17` |

## Data Flow

```
Document Upload → Storage (case-documents bucket)
    → ingest-file-to-text (extraction)
    → classify-aml-docs (classification)
    → doc_classification_cache / document_intelligence tables

SoW Analysis Request → agent-chat
    → resolve-sow-context (context assembly)
    → search-knowledge (RAG retrieval)
    → Domain split → sow-chunk-worker (per-domain batches)
    → Judge pipeline (safety → quality → relevance)
    → Deterministic post-processing
    → Wave 4-13 enrichment pipeline
    → ai_reports table (chunk_output_raw)
    → sow-finalise (background consolidation)
    → ai_reports table (internal_report, client_report, draft_email)
    → Review queue + tasks + observability events
```

## Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `case-documents` | No | Client-uploaded documents per case |
| `draft-review-documents` | No | LEGACY — draft review documents |
| `enquiry-replies` | No | Client enquiry reply documents |
| `exchange-guard-documents` | No | LEGACY — exchange guard documents |
| `benchmark-documents` | No | Benchmark case documents |
| `article-audio` | Yes | Article TTS audio files |
