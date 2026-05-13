/**
 * financialReconciliation.ts
 *
 * Pure deterministic arithmetic for Wave 15.1 Pre-AI Sufficiency Gate.
 * No I/O, no AI calls, no external dependencies.
 * All monetary amounts in PENCE (integer). Never pass floats.
 *
 * Constraint: no bank-statement or payslip reconciliation (Phase 15.2/15.3).
 * No per-firm thresholds — all comparisons are binary vs. declared figures.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SufficiencyInput {
  /** Purchase price in pence */
  purchase_price: number;
  /** Stamp Duty Land Tax in pence (0 if not applicable / FTB relief etc.) */
  stamp_duty: number;
  /** Legal fees in pence */
  legal_fees: number;
  /** Mortgage amount in pence (0 if cash purchase) */
  mortgage_amount: number;
  /**
   * Amounts from each purchaser's own declared funds (savings, equity etc.)
   * in pence. May be empty for cash-gifted purchases.
   */
  purchaser_contributions: number[];
  /**
   * Amounts from each gift donor in pence.
   * May be empty if no gifts declared.
   */
  giftor_amounts: number[];
}

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

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * computeFundingSufficiency
 *
 * Returns a SufficiencyResult from the supplied figures. All inputs and all
 * returned amounts are in pence (integer). Caller is responsible for
 * converting from user-facing GBP strings before calling this function.
 *
 * Formula:
 *   funds_required  = purchase_price + stamp_duty + legal_fees − mortgage_amount
 *   declared_total  = Σ purchaser_contributions + Σ giftor_amounts
 *   shortfall       = max(0, funds_required − declared_total)
 *   overstatement   = max(0, declared_total − funds_required)
 *   status          = shortfall > 0 ? "shortfall"
 *                   : overstatement > 0 ? "overstatement"
 *                   : "sufficient"
 */
export function computeFundingSufficiency(input: SufficiencyInput): SufficiencyResult {
  const {
    purchase_price,
    stamp_duty,
    legal_fees,
    mortgage_amount,
    purchaser_contributions,
    giftor_amounts,
  } = input;

  // All arithmetic in integer pence — no floating-point risk.
  const funds_required = purchase_price + stamp_duty + legal_fees - mortgage_amount;

  const purchaser_total = purchaser_contributions.reduce((sum, v) => sum + v, 0);
  const giftor_total = giftor_amounts.reduce((sum, v) => sum + v, 0);
  const declared_total = purchaser_total + giftor_total;

  const shortfall = Math.max(0, funds_required - declared_total);
  const overstatement = Math.max(0, declared_total - funds_required);

  const status: SufficiencyStatus =
    shortfall > 0 ? "shortfall" : overstatement > 0 ? "overstatement" : "sufficient";

  return {
    funds_required,
    declared_total,
    shortfall,
    overstatement,
    status,
  };
}
