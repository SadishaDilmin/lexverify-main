# Explainability Workflow

> **AI Reader Notes**: How provenance and explainability data flows through the system.

## Evidence Trail

Each analysis run produces:

1. **Evidence Map** → hidden `<!-- EVIDENCE_MAP [...] -->` block in output
   - Parsed and persisted to `evidence_references` table
   - Links report items to source documents with page/section/snippet
2. **Material Findings** → `<!-- MATERIAL_FINDINGS [...] -->` block
   - Structured findings with evidence anchors
   - Confidence and evidence status
3. **Decision Log** → extracted structured entries
   - Each entry linked to evidence anchors
   - Rationale included
4. **Policy Trace** → `policy_governance` metadata
   - Policy version, source, fingerprint
   - Overrides applied
5. **Validation Trace** → `validation_traces` table
   - Judge outcomes, scores, defect reports
   - Composite validation status
6. **Observability Events** → `observability_events` table
   - Timestamped events during analysis
   - Severity-classified

## Provenance Chain

```
Source Document → Evidence Anchor → Material Finding → Decision Log Entry
    → Report Narrative → Review Item → Disposition → Task
```

Each link is traceable via structured IDs and anchors.

## Status: CURRENT, STABLE
