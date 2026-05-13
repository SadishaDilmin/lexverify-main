# Olimey AI — Master Documentation Index

> **AI Reader Notes**: This is the root document. Start here. It maps the entire documentation pack. All cross-references use relative paths from this folder structure.

**Last Updated**: 2026-04-08  
**Documentation Version**: 1.0.0  
**Baseline**: Current production codebase (Wave 13 complete)  
**Baseline Status**: STABLE with known incident recovery in progress (consolidation path)

---

## What Is Olimey AI?

Olimey AI is a UK legal-tech compliance platform for conveyancing firms. It provides a single AI agent — **Olimey AI** — that reviews source-of-wealth documentation (bank statements, Armalytix open-banking reports, gift letters, mortgage offers, payslips) and generates structured AML compliance outputs for residential property transactions in England and Wales.

### Core Outputs
- Internal risk reports with evidence citations
- Client-facing summaries
- Draft enquiry letters
- LSAG 15-point compliance checklists
- Decision logs with audit trails
- AML risk ratings (green/amber/red)
- Missing evidence roadmaps
- Follow-up task generation

---

## Major Subsystems

| Subsystem | Wave(s) | Description | Doc Location |
|---|---|---|---|
| **Validation Honesty** | 1 | Judge outcome model, validation states, operational rules | `09-state-models/VALIDATION_STATES.md` |
| **Evidence Engine** | 2 | Structured evidence references, precision model, LSAG parsing | `02-architecture/COMPONENT_MAP.md` |
| **Operational Engine** | 3 | Roadmaps, delta review, readiness, workflow tasks | `03-workflows/SOW_ANALYSIS_WORKFLOW.md` |
| **Compliance Policy** | 4 | Overreach guards, funding structure detection, lender/MLRO logic | `08-business-rules/LENDER_AND_MLRO_RULES.md` |
| **Policy Governance** | 5 | DB-backed per-firm policy, versioned overrides, fingerprinting | `08-business-rules/POLICY_DRIVEN_THRESHOLDS.md` |
| **Review Workflow** | 6 | Review queue, dispositions, observability events | `03-workflows/REVIEW_WORKFLOW.md` |
| **External Intelligence** | 7 | Companies House, FCA, sanctions, adverse media | `02-architecture/COMPONENT_MAP.md` |
| **Task Lifecycle** | 8 | Follow-up tasks with dedup, carry-forward, supersession | `03-workflows/TASK_LIFECYCLE_WORKFLOW.md` |
| **Document Intelligence** | 9 | Extraction confidence, entity extraction, source quality | `03-workflows/DOCUMENT_UPLOAD_WORKFLOW.md` |
| **Financial Extraction** | 10 | Row-level transaction extraction, coverage analysis | `02-architecture/COMPONENT_MAP.md` |
| **Narrative Grounding** | 11 | Finding-to-evidence linkage, wording proportionality | `06-prompts-and-ai-behaviour/GUARDRAILS_AND_POSTPROCESSING.md` |
| **Grounded Report Plan** | 12 | Two-pass generation, structured pre-planning | `06-prompts-and-ai-behaviour/FINALISATION_AND_CONSOLIDATION_PROMPTS.md` |
| **Calibration & Benchmarking** | 13 | Human-review comparison, disagreement taxonomy, FP/FN analysis | `03-workflows/CALIBRATION_AND_EVALUATION_WORKFLOW.md` |

---

## Main Workflows

1. **Document Upload & Classification** → `03-workflows/DOCUMENT_UPLOAD_WORKFLOW.md`
2. **Source of Wealth Analysis** → `03-workflows/SOW_ANALYSIS_WORKFLOW.md`
3. **Finalisation / Consolidation** → `03-workflows/FINALISATION_WORKFLOW.md`
4. **Human Review** → `03-workflows/REVIEW_WORKFLOW.md`
5. **Governance & Calibration** → `03-workflows/GOVERNANCE_WORKFLOW.md`
6. **Task Lifecycle** → `03-workflows/TASK_LIFECYCLE_WORKFLOW.md`

---

## Most Important Files for a New AI Reader

1. **This file** — `00-index/MASTER_INDEX.md`
2. **System Overview** — `01-system-overview/SYSTEM_OVERVIEW.md`
3. **Architecture Overview** — `02-architecture/ARCHITECTURE_OVERVIEW.md`
4. **SoW Analysis Workflow** — `03-workflows/SOW_ANALYSIS_WORKFLOW.md`
5. **Business Rules Overview** — `08-business-rules/BUSINESS_RULES_OVERVIEW.md`
6. **Prompt Architecture** — `06-prompts-and-ai-behaviour/PROMPT_ARCHITECTURE.md`
7. **State Models** — `09-state-models/VALIDATION_STATES.md`
8. **Known Issues** — `12-known-issues-and-limitations/KNOWN_ISSUES.md`
9. **DB Schema** — `04-data-models/DB_SCHEMA_OVERVIEW.md`
10. **Machine-readable manifest** — `13-machine-readable-json/master_manifest.json`

---

## Glossary (Quick Reference)

| Term | Meaning |
|---|---|
| **Olimey AI** | The platform brand |
| **Olimey AI** | The single AI agent (source-of-wealth analysis) |
| **LSAG** | Legal Sector Affinity Group — AML guidance body |
| **SoW** | Source of Wealth |
| **SoF** | Source of Funds |
| **MLRO** | Money Laundering Reporting Officer |
| **Armalytix** | Open-banking report provider |
| **Hoowla** | Case management system (CMS) integration partner |
| **Conveyancer** | The solicitor/licensed conveyancer handling the property transaction |
| **RLS** | Row-Level Security (Supabase/Postgres) |
| **Judge** | Post-generation AI quality/safety gate |
| **Overreach Guard** | Deterministic rules that soften dangerous AI assertions |
| **Readiness State** | Whether a case file is ready for completion |
| **Delta Review** | Comparison between consecutive AI runs on same case |
| **Firm Policy** | Per-firm configurable compliance thresholds |
| **Calibration Signal** | Recommendation to adjust thresholds based on review outcomes |

---

## Current Platform Status

- **Core SoW analysis**: STABLE, deployed, production-ready
- **Consolidation/Finalisation**: IN INCIDENT RECOVERY — background finalization (waitUntil) path is the target architecture; polling-based client-side fallback is active
- **Review workflow**: STABLE (DB-backed, typed dispositions)
- **Governance loop**: STABLE (Wave 14 persistence layer deployed)
- **Benchmark/calibration engine**: STABLE (Wave 13 types + Wave 14 DB persistence)
- **External intelligence**: PARTIAL (Companies House + FCA live; sanctions/adverse media scaffolded)
- **Knowledge base / RAG**: STABLE (semantic + keyword search)
- **Client portal**: STABLE (token-based access)
- **CMS integration (Hoowla)**: STABLE (sync matters, docs, notes, messages)
