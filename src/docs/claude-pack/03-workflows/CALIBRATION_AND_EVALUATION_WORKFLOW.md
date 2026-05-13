# Calibration and Evaluation Workflow

> **AI Reader Notes**: Wave 13 calibration engine + Wave 14 governance persistence.

## Trigger
- Admin creates benchmark evaluation against reviewed case
- Human reviewer records structured disagreements
- System auto-generates calibration signals from patterns

## Steps

1. **Benchmark Case Setup** → `benchmark_cases` table
   - Upload reference documents to `benchmark-documents` bucket
   - Define ground truth outputs in `benchmark_outputs`

2. **AI Run on Benchmark Case** → `benchmark-worker` / `benchmark-compare`
   - Runs Olimey AI against benchmark documents
   - Compares AI output against human reference

3. **Comparison** → `benchmark_comparisons` + `benchmark_comparison_items`
   - Per-item: risk class, mismatch category, system vs reference position
   - Mismatch categories: false_positive, false_negative, severity_error, etc.

4. **Structured Evaluation** → `benchmark_evaluations` + `benchmark_evaluation_items`
   - Per-risk-class assessment
   - Precision/recall scores
   - Evidence grounding score
   - Explanation quality score

5. **Structured Disagreement** → `structured_disagreements`
   - 18 disagreement types (finding_should_not_exist, severity_overstated, etc.)
   - Linked to specific findings/objects
   - Human vs system position
   - Whether it should influence calibration

6. **Calibration Signal Generation** → `calibrationBenchmarking.ts`
   - `generateCalibrationSignals()` analyses disagreement patterns
   - Produces threshold adjustment recommendations
   - Targets: MLRO threshold, lender trigger, overreach level, etc.

7. **Governance Review** → `calibration_governance_decisions`
   - Human reviews signal: accept / reject / defer
   - If accepted → `calibration_policy_links` records the change

8. **Policy Update** → `firm_policies`
   - Threshold adjusted
   - Version incremented
   - Change logged to `firm_policy_history`

## Status: CURRENT, STABLE
