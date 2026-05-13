/**
 * sufficiency.ts
 *
 * Frontend mirror of the SufficiencyResult type produced by
 * supabase/functions/_shared/financialReconciliation.ts
 *
 * Keep in sync with the edge-function type. All amounts in pence.
 */

export type SufficiencyStatus = "sufficient" | "shortfall" | "overstatement";

export interface SufficiencyResult {
  /** Total buyer-funded requirement (purchase_price + stamp_duty + legal_fees − mortgage) */
  funds_required: number;
  /** Sum of all declared contributions (purchaser + giftor) */
  declared_total: number;
  /** Positive gap when declared_total < funds_required, else 0 */
  shortfall: number;
  /** Positive excess when declared_total > funds_required, else 0 */
  overstatement: number;
  /** Deterministic status label */
  status: SufficiencyStatus;
}

export interface SufficiencyAcknowledgement {
  /**
   * ISO timestamp when the solicitor confirmed the gate.
   * Set in the hook immediately before credit deduction.
   */
  acknowledgedAt: string;
  /**
   * For shortfall: the solicitor's written rationale.
   * For overstatement: empty string.
   */
  rationale: string;
}
