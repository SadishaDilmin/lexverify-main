# System Overview

> **AI Reader Notes**: This describes what Olimey AI is and how it works at the highest level. For architecture details see `02-architecture/`. For workflows see `03-workflows/`.

## Product Purpose

Olimey AI is a compliance automation platform for UK conveyancing firms. It helps Compliance Officers, fee earners, and MLROs conduct anti-money-laundering (AML) assessments on residential property purchases by:

1. Ingesting financial documents (bank statements, payslips, mortgage offers, gift letters, Armalytix reports)
2. Classifying and extracting structured data from those documents
3. Running a structured Source of Wealth / Source of Funds analysis via the Olimey AI
4. Producing auditable compliance outputs (internal reports, client summaries, draft enquiries, LSAG checklists, decision logs)
5. Supporting human review, governance, and calibration workflows

## Regulatory Context

- **Money Laundering Regulations 2017** (UK)
- **Proceeds of Crime Act 2002**
- **LSAG Guidance 2025** (Legal Sector Affinity Group)
- **SRA/CLC professional rules**
- Buyer-side only — seller-side is explicitly out of scope

## Major Capabilities

| Capability | Status |
|---|---|
| Document upload, OCR, and classification | CURRENT |
| AI-powered source-of-wealth analysis | CURRENT |
| LSAG 15-point compliance checklist | CURRENT |
| Internal risk report generation | CURRENT |
| Client-facing summary generation | CURRENT |
| Draft enquiry letter generation | CURRENT |
| Decision log with audit trail | CURRENT |
| Missing evidence roadmap | CURRENT |
| Follow-up task generation | CURRENT |
| Human review queue with typed dispositions | CURRENT |
| Firm policy governance (per-firm thresholds) | CURRENT |
| Knowledge base with RAG (semantic + keyword) | CURRENT |
| External intelligence (Companies House, FCA) | CURRENT |
| Armalytix open-banking report ingestion | CURRENT |
| Hoowla CMS integration | CURRENT |
| Benchmark/calibration against human reviews | CURRENT |
| Client portal (token-based) | CURRENT |
| Credit-based usage metering | CURRENT |
| Enquiry tracking and reply ingestion | CURRENT |
| Case-level correspondence sync | CURRENT |
| Background consolidation (multi-chunk) | CURRENT (incident recovery) |

## Technology Stack

- **Frontend**: React 18, Vite 5, TypeScript 5, Tailwind CSS v3, shadcn/ui
- **Backend**: Supabase (Postgres, Edge Functions via Deno, Storage, Auth, Realtime)
- **AI Models**: Routed via hybrid AI Gateway (Vertex AI for Google models, Lovable Gateway for OpenAI)
- **Primary Analysis Model**: google/gemini-2.5-pro
- **Judge/Support Models**: google/gemini-2.5-flash, google/gemini-2.5-flash-lite
- **OCR**: Smart OCR routing (native text → standard OCR → vision model escalation)
- **Deployment**: Edge functions auto-deployed; frontend via Lovable

## Environment

- Production Supabase project (EU region)
- Vertex AI in europe-west4 for Google model routing
- All data processing EU-resident where possible
