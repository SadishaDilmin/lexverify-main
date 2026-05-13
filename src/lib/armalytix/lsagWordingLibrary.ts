/**
 * LSAG/CLC-calibrated wording library.
 *
 * Pure constant. Provides "snap-to" templates used as:
 *  - a fallback floor when LLM output deviates or confidence is low
 *  - golden references in regression / benchmark tests
 *
 * Phrasing is calibrated for proportional, non-prosecutorial AML wording
 * appropriate for UK conveyancing matters under MLR 2017 / LSAG 2025.
 *
 * NOTE: This does NOT replace LLM-generated drafts. It provides a stable,
 * defensible baseline for specific check states.
 */

import type { ExceptionType } from './exceptionEngine';

// ── Categorisation (LSAG A–E mental model) ───────────────────────

export type LsagCategory =
  | 'A_purchasers_and_beneficial_ownership'
  | 'B_gift_and_third_party_funding'
  | 'C_employment_income_savings'
  | 'D_accounts_and_flow_of_funds'
  | 'E_declarations_behaviour_timing';

export type LsagState = 'identified' | 'clarified' | 'unresolved';
export type LsagSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface LsagWordingKey {
  category: LsagCategory;
  state: LsagState;
  severity?: LsagSeverity;
}

export interface LsagWordingEntry {
  /** Internal file-note phrasing for the matter file */
  fileNote: string;
  /** External, client-facing enquiry phrasing */
  clientEnquiry?: string;
}

// ── A → E mapping for existing exception types ───────────────────

export const EXCEPTION_TO_LSAG_CATEGORY: Record<ExceptionType, LsagCategory> = {
  // A — Purchasers and beneficial ownership
  cobuyer_contribution_unevidenced: 'A_purchasers_and_beneficial_ownership',
  name_identity_inconsistency: 'A_purchasers_and_beneficial_ownership',
  purchaser_count_contradiction: 'A_purchasers_and_beneficial_ownership',
  // B — Gifts and third-party funding
  gift_incomplete_evidence: 'B_gift_and_third_party_funding',
  gift_declared_vs_denied: 'B_gift_and_third_party_funding',
  repeated_third_party_credits: 'B_gift_and_third_party_funding',
  undeclared_incoming_credit: 'B_gift_and_third_party_funding',
  // C — Employment / income / savings
  salary_savings_unsupported: 'C_employment_income_savings',
  unexplained_large_incoming: 'C_employment_income_savings',
  // D — Accounts and flow of funds
  cash_deposit_unexplained: 'D_accounts_and_flow_of_funds',
  manual_balance_unevidenced: 'D_accounts_and_flow_of_funds',
  funding_shortfall: 'D_accounts_and_flow_of_funds',
  excess_funds_unexplained: 'D_accounts_and_flow_of_funds',
  source_timing_mismatch: 'D_accounts_and_flow_of_funds',
  transfer_chain_unclear: 'D_accounts_and_flow_of_funds',
  circular_movement_suspected: 'D_accounts_and_flow_of_funds',
  overseas_insufficiently_explained: 'D_accounts_and_flow_of_funds',
  possible_undeclared_loan: 'D_accounts_and_flow_of_funds',
  investment_crypto_activity: 'D_accounts_and_flow_of_funds',
  significant_gambling_activity: 'D_accounts_and_flow_of_funds',
  // E — Declarations / behaviour / timing
  amount_mismatch_declaration_vs_evidence: 'E_declarations_behaviour_timing',
  transaction_inconsistent_with_source: 'E_declarations_behaviour_timing',
  mortgage_funding_contradiction: 'E_declarations_behaviour_timing',
  late_disclosure_after_challenge: 'E_declarations_behaviour_timing',
  // C — Lifestyle / income proportionality
  lifestyle_inconsistent_with_income: 'C_employment_income_savings',
  // C — Employment status contradiction (Batch C)
  employment_status_contradiction: 'C_employment_income_savings',
};

export const LSAG_CATEGORY_LABELS: Record<LsagCategory, string> = {
  A_purchasers_and_beneficial_ownership: 'A — Purchasers & Beneficial Ownership',
  B_gift_and_third_party_funding: 'B — Gift & Third-Party Funding',
  C_employment_income_savings: 'C — Employment, Income & Savings Narrative',
  D_accounts_and_flow_of_funds: 'D — Bank Accounts & Flow of Funds',
  E_declarations_behaviour_timing: 'E — Declarations, Behaviour & Timing',
};

// ── Wording library (LSAG/CLC calibrated) ────────────────────────

export const LSAG_WORDING: Record<
  LsagCategory,
  Partial<Record<LsagState, LsagWordingEntry>>
> = {
  A_purchasers_and_beneficial_ownership: {
    identified: {
      fileNote:
        'An inconsistency has been identified between the instruction documents and third-party verification regarding the purchasing parties. Clarification has been requested to confirm the true purchasing structure and beneficial ownership.',
      clientEnquiry:
        'We note a difference between the information provided in the instruction documents and the source-of-wealth information obtained regarding the purchasing parties. Please confirm which position is correct and provide any supporting documents.',
    },
    clarified: {
      fileNote:
        'The discrepancy regarding the purchasing parties has been clarified and supported by evidence. The purchasing structure is now considered consistent for the purposes of this matter.',
    },
    unresolved: {
      fileNote:
        'The inconsistency regarding the purchasing parties remains unresolved and indicates potential undisclosed beneficial ownership. This has been recorded as a heightened AML consideration for supervisory review.',
    },
  },
  B_gift_and_third_party_funding: {
    identified: {
      fileNote:
        'Cross-document review has identified third-party funding that was not initially declared. Clarification and supporting evidence have been requested to assess whether the funds constitute a gift, a loan, or a co-purchaser contribution.',
      clientEnquiry:
        'Our review indicates that some of the funds may have been provided by a third party. Please confirm whether any part of the purchase funds is a gift and, if so, provide a signed gift letter and supporting evidence.',
    },
    clarified: {
      fileNote:
        'Following enquiry, the nature of the third-party funds has been confirmed and supporting documentation has been provided. The position is now considered consistent.',
    },
    unresolved: {
      fileNote:
        'The nature and origin of the third-party funds remain unclear despite enquiry. This has been recorded for supervisory review before the matter can be progressed to completion.',
    },
  },
  C_employment_income_savings: {
    identified: {
      fileNote:
        'Employment, income, or savings information provided by the client differs across the documents reviewed. Clarification has been requested to confirm the current position and the basis for the declared accumulation of funds.',
      clientEnquiry:
        'Please confirm your current employment status and income source, as the information provided differs across the documents reviewed. Supporting evidence such as payslips or an accountant\'s letter would assist us.',
    },
    clarified: {
      fileNote:
        'The client has provided a satisfactory explanation and supporting evidence. The employment, income, and savings narrative is now considered consistent.',
    },
    unresolved: {
      fileNote:
        'Employment or income information remains inconsistent across documents, which limits the assurance that can be placed on the client\'s stated source of wealth.',
    },
  },
  D_accounts_and_flow_of_funds: {
    identified: {
      fileNote:
        'The flow, ownership, or jurisdiction of the funds intended for this transaction does not fully align with the structure described by the client. This was identified during cross-document consistency review and clarification has been requested.',
      clientEnquiry:
        'Please confirm the ownership of the account(s) holding the purchase funds, your relationship to any other named account holders, and the originating jurisdiction where applicable.',
    },
    clarified: {
      fileNote:
        'The account ownership, transfer chain, and jurisdictional position have been clarified with supporting evidence. The flow of funds is now consistent with the declared transaction structure.',
    },
    unresolved: {
      fileNote:
        'The flow, ownership, or jurisdictional position of the funds remains unresolved. Enhanced due diligence has been applied and the matter remains under supervisory review.',
    },
  },
  E_declarations_behaviour_timing: {
    identified: {
      fileNote:
        'A discrepancy has been identified between the client\'s declarations and the supporting evidence reviewed. Clarification has been requested.',
      clientEnquiry:
        'We have identified a difference between the information you have provided and the supporting evidence reviewed. Please clarify the position and provide any further evidence required.',
    },
    clarified: {
      fileNote:
        'The discrepancy between the declarations and the supporting evidence has been clarified. The position is now considered consistent.',
    },
    unresolved: {
      fileNote:
        'The client\'s explanation was only provided following identification during compliance review, or remains unsupported. This timing and behaviour have been recorded when assessing overall AML risk.',
    },
  },
};

// ── Lookup ───────────────────────────────────────────────────────

export function getLsagWording(key: LsagWordingKey): LsagWordingEntry | null {
  const byCategory = LSAG_WORDING[key.category];
  if (!byCategory) return null;
  return byCategory[key.state] ?? null;
}

/**
 * Snap-to floor: returns the calibrated phrasing for a given exception
 * type and state if available. Used by draftingRefinement when LLM
 * confidence is low or output deviates from accepted phrasing.
 */
export function getWordingFloorForException(
  exceptionType: ExceptionType,
  state: LsagState
): LsagWordingEntry | null {
  const category = EXCEPTION_TO_LSAG_CATEGORY[exceptionType];
  if (!category) return null;
  return getLsagWording({ category, state });
}
