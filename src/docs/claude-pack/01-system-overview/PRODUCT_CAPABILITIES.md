# Product Capabilities

> **AI Reader Notes**: Detailed capability list. Status: CURRENT = live in production, PARTIAL = partially implemented, SCAFFOLDED = types/interfaces exist but not live, DEPRECATED = no longer active.

## Document Processing

| Capability | Status | Details |
|---|---|---|
| PDF text extraction | CURRENT | Native text layer extraction |
| OCR for scanned documents | CURRENT | Smart routing: native → OCR → vision escalation |
| Image document processing | CURRENT | Multimodal vision model for photos/screenshots |
| Document classification (AI) | CURRENT | 25+ categories mapped to case folders |
| Post-upload auto-classification | CURRENT | Runs after upload, suggests folder placement |
| Existing file reclassification | CURRENT | Bulk reclassification of already-uploaded files |
| Duplicate document detection | CURRENT | Content-hash based dedup |
| Document versioning | CURRENT | Version tracking per document |
| Extraction confidence tracking | CURRENT | Per-document quality/confidence metadata |
| Entity extraction from documents | CURRENT | Person, company, bank, jurisdiction, account, employer |
| Entity linking across documents | CURRENT | Exact/partial/heuristic cross-document linking |

## Analysis

| Capability | Status | Details |
|---|---|---|
| Source of Wealth / Funds analysis | CURRENT | Multi-chunk domain-split AI analysis |
| LSAG 15-point checklist | CURRENT | Deterministic extraction + enforcement |
| Material findings extraction | CURRENT | 15+ finding categories |
| Decision log generation | CURRENT | Structured entries with evidence anchors |
| Risk rating (green/amber/red) | CURRENT | Composite risk assessment |
| Funding structure detection | CURRENT | 10 high-risk patterns (structure-first) |
| Co-purchaser vs gift classification | CURRENT | Deterministic guardrail enforcement |
| Live-to-zero savings analysis | CURRENT | Mandatory check before concluding savings disproved |
| Row-level transaction extraction | CURRENT | Bank statement line-item extraction |
| Financial pattern detection | CURRENT | Salary, internal transfers, large credits, recurring |
| Statement coverage analysis | CURRENT | Date-range coverage assessment |
| Narrative grounding | CURRENT | Wording proportionality matched to evidence strength |
| Two-pass grounded generation | CURRENT | Pass 1: plan from evidence; Pass 2: render prose |

## Compliance Outputs

| Output | Status |
|---|---|
| Internal compliance report (markdown) | CURRENT |
| Client-facing summary | CURRENT |
| Draft enquiry letter | CURRENT |
| Evidence map (hidden structured block) | CURRENT |
| Missing evidence roadmap | CURRENT |
| Completion readiness assessment | CURRENT |

## Governance & Review

| Capability | Status |
|---|---|
| Review queue with typed dispositions | CURRENT |
| Review audit trail | CURRENT |
| Observability events | CURRENT |
| Firm policy governance (per-firm overrides) | CURRENT |
| Policy versioning and fingerprinting | CURRENT |
| Calibration signals from review patterns | CURRENT |
| Benchmark evaluation harness | CURRENT |
| Structured disagreement capture | CURRENT |
| False positive / false negative analysis | CURRENT |

## Integrations

| Integration | Status |
|---|---|
| Hoowla CMS (matters, docs, notes, messages) | CURRENT |
| Armalytix open-banking reports | CURRENT |
| Companies House lookup | CURRENT |
| FCA Register check | CURRENT |
| OFSI Sanctions list check | CURRENT |
| FATF jurisdiction check | CURRENT |
| Knowledge base (semantic + keyword search) | CURRENT |
| Stripe payments | CURRENT |
| Resend email | CURRENT |

## User-Facing Features

| Feature | Status |
|---|---|
| Dashboard with case list | CURRENT |
| Case workspace with tabbed views | CURRENT |
| Document upload with drag-and-drop | CURRENT |
| File browser with folder structure | CURRENT |
| Credit purchase and tracking | CURRENT |
| Settings page | CURRENT |
| Oversight / review queue page | CURRENT |
| Client portal (token-based) | CURRENT |
| Glossary | CURRENT |
| Insights / articles | CURRENT |
| SDLT calculator | CURRENT |
| Profitability calculator | CURRENT |
