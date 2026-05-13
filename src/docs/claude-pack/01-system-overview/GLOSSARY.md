# Glossary

> **AI Reader Notes**: Canonical definitions. If a term appears elsewhere with a different meaning, this file is authoritative.

| Term | Definition |
|---|---|
| **AML** | Anti-Money Laundering |
| **Armalytix** | Third-party open-banking report provider used for automated balance/transaction verification |
| **Calibration Signal** | A structured recommendation to adjust policy thresholds, generated from patterns in human-review disagreements |
| **Case** | A property transaction under AML review, identified by a case reference |
| **Chunk Worker** | Edge function (`sow-chunk-worker`) that processes a subset of documents for a single domain batch |
| **Client Portal** | Token-authenticated page where clients can view their case status |
| **CMS** | Case Management System — external integration (currently Hoowla) |
| **Consolidation** | The process of combining multi-chunk analysis outputs into final reports |
| **Conveyancer** | Licensed legal professional handling property transactions |
| **Decision Log** | Structured table of compliance decisions with evidence anchors and rationale |
| **Delta Review** | Comparison between two consecutive AI runs on the same case |
| **Disposition** | The human reviewer's formal decision on a review item |
| **Domain Split** | Dividing documents into analysis domains (identity, income, savings, etc.) for parallel processing |
| **Edge Function** | Deno-based serverless function deployed on Supabase |
| **Evidence Anchor** | An atomic reference to a specific location in a source document |
| **Evidence Precision** | How specifically evidence can be localised (document/page/section/transaction/snippet level) |
| **Finalisation** | Background process that consolidates chunk outputs into final reports |
| **Finding** | A material compliance observation extracted from analysis |
| **Firm Policy** | Per-firm configurable compliance thresholds and rules |
| **FP / FN** | False Positive / False Negative |
| **Grounded Finding** | A material finding enriched with evidence attachments and wording tier |
| **Hoowla** | External CMS integration partner for UK conveyancing |
| **Judge** | Post-generation AI model that evaluates output quality/safety |
| **Knowledge Base** | Curated compliance reference documents used for RAG retrieval |
| **LSAG** | Legal Sector Affinity Group — produces AML guidance for legal sector |
| **MLRO** | Money Laundering Reporting Officer |
| **Narrative Grounding** | Process of ensuring narrative wording matches evidence strength |
| **Observability Event** | Structured event emitted during analysis for monitoring/debugging |
| **Overreach Guard** | Deterministic rule that softens dangerous or overconfident AI assertions |
| **Policy Fingerprint** | SHA-like hash of the effective policy config for traceability |
| **Quarantined** | Validation state where output is blocked from normal use due to safety/quality failure |
| **RAG** | Retrieval-Augmented Generation — injecting relevant knowledge into AI prompts |
| **Readiness State** | Assessment of whether a case file is ready for exchange/completion |
| **Report Plan** | Pre-generation structured bundle defining what each critical section should contain |
| **Review Queue** | Human oversight queue for outputs requiring intervention |
| **RLS** | Row-Level Security — database-level access control |
| **Roadmap** | Missing Evidence Roadmap — list of evidence gaps with remediation guidance |
| **SoF** | Source of Funds — where the money for this transaction came from |
| **SoW** | Source of Wealth — how the person accumulated their wealth |
| **Support Strength** | How strongly evidence supports a finding (direct/corroborating/inferred/partial/weak) |
| **Task** | A follow-up action generated from analysis (e.g., "request gift letter") |
| **Validation State** | Composite assessment of output quality (FULLY_VALIDATED / DEGRADED / QUARANTINED etc.) |
| **Vertex AI** | Google Cloud AI platform used for EU-resident model hosting |
| **Wave** | A development phase in the Olimey AI roadmap |
| **Wording Tier** | Assertiveness level matched to evidence strength (FIRM/SUPPORTED/CAUTIOUS/WEAK/LIMITATION) |
