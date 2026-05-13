# Compliance Findings

> Append-only log of audit findings. Never edit or delete existing entries.
> Format per CLAUDE.md §9: date · finding · evidence · severity · proposed remediation · status.
> Each entry is preceded by a horizontal rule and has a unique sequential ID.

---

## CF-001 — Deterministic Coverage Gaps in SoW Pre-Submission Analysis

| Field | Value |
|---|---|
| **Date** | 30 April 2026 |
| **Finding** | At the time of Wave 15 scoping, the SoW submission pipeline had no deterministic pre-AI check to confirm that declared purchaser and giftor contributions arithmetically cover the buyer-funded requirement (purchase price + SDLT + legal fees − mortgage). The AI was being asked to infer this gap from unstructured form data, creating a risk of inconsistent or hallucinated arithmetic in the Funding Analysis section of reports. Four specific gaps were identified: (1) source-to-funds arithmetic, (2) bank-statement opening/closing balance reconciliation, (3) payslip-to-contribution reconciliation, (4) PDF metadata/timestamp verification. |
| **Evidence** | No file path — absence of deterministic gate prior to Wave 15.1 commit `1150713f`. Gap confirmed by review of `src/hooks/useSoWSubmit.ts` pre-PR-#17: no invocation of arithmetic validation before `resolve-sow-context` or the AI call. |
| **Severity** | Medium — AI arithmetic errors are non-systematic (vary by model run) and were partially mitigated by RUNTIME OUTPUT SAFETY OVERRIDES in `resolve-sow-context`; however, shortfall/overstatement cases could be missed or mischaracterised without an established-fact anchor. |
| **Proposed remediation** | Phase 15.1: deterministic arithmetic gate (source-to-funds). Phase 15.2: bank-statement opening/closing balance. Phase 15.3: payslip-to-contribution and PDF metadata. |
| **Status** | **Partially closed.** Gap (1) (source-to-funds arithmetic) closed by Wave 15.1 (PR #17 + closeout PR #18). Gaps (2), (3), (4) remain open — scheduled for Phases 15.2 and 15.3 in v1.1. |

**Resolution note (30 April 2026):** Partially closed by Wave 15.1 (PR #17 + closeout PR #18). Three of four identified gaps remain (bank-statement reconciliation, payslip reconciliation, PDF metadata) — scheduled for Phases 15.2 and 15.3 in v1.1.

---

## CF-002 — Formal `breakdown[]` Field Absent from SufficiencyResult

| Field | Value |
|---|---|
| **Date** | 30 April 2026 |
| **Finding** | The Wave 15 scoping document §13 required a `breakdown` array of line items (add/subtract rows with human-readable labels) on `SufficiencyResult`, to be displayed in the confirmation modal and logged in the observability event metadata. The Wave 15.1 implementation (`financialReconciliation.ts`) does not include this field — the modal and observability events show the computed totals but not the per-component breakdown. |
| **Evidence** | `supabase/functions/_shared/financialReconciliation.ts` — `SufficiencyResult` interface (lines 39–50). No `breakdown` property present. Scoping requirement at Wave-15-Scoping.txt §13, Step 3 test case "Breakdown shape". |
| **Severity** | Medium — the modal renders the net shortfall figure without decomposition into its components (purchase price, SDLT, legal fees, mortgage, per-person contributions). A solicitor acknowledging a shortfall cannot verify in the UI that the arithmetic is correct for their specific transaction. This reduces auditability of the acknowledgement and weakens the evidential value of the audit trail entry. |
| **Proposed remediation** | Add `breakdown: SufficiencyBreakdownLine[]` to `SufficiencyResult` in Wave 15.1.1. Each line: `{ label: string; amount_pence: number; type: "add" \| "subtract" \| "contribution" \| "gift" }`. Render as a collapsible table in the modal beneath the headline shortfall figure. |
| **Status** | **In-flight — Wave 15.1.1.** Scheduled for the next PR before launch. Cannot be addressed in the current closeout PR — `financialReconciliation.ts` is a PR-#17 file and the interface change requires a coordinated update to `pre-sow-checks`, `src/types/sufficiency.ts`, and the modal. |
