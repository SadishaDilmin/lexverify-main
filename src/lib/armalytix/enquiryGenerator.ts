/**
 * Enquiry Generation Engine
 *
 * Converts structured exceptions, reconciliation gaps and unmatched items
 * into draft enquiries with templates, deduplication, merging and prioritisation.
 *
 * Pure functions — no DB calls.
 */

import type { ExceptionItem, ExceptionType, ExceptionsLedger } from './exceptionEngine';
import type { SourceReconciliation, FundingChainSummary } from './reconciliationEngine';

// ── Enquiry types ────────────────────────────────────────────────

export const ENQUIRY_CATEGORIES = [
  'unexplained_incoming_credit',
  'large_incoming_unmatched',
  'repeated_third_party_credits',
  'cobuyer_contribution_unevidenced',
  'gift_incomplete_evidence',
  'salary_savings_unsupported',
  'manual_balance_unevidenced',
  'funding_shortfall',
  'excess_funds_unexplained',
  'transfer_chain_unclear',
  'possible_undeclared_loan',
  'investment_crypto_clarification',
  'gambling_activity_relevant',
  'overseas_source_clarification',
  'contradiction_narrative_vs_evidence',
  'missing_document',
  'government_bonus_evidence',
  'sale_proceeds_evidence',
  'source_timing_mismatch',
  'name_identity_mismatch',
  // A7 / A12 additions
  'lifestyle_inconsistent_with_income',
  'late_disclosure_after_challenge',
  // A1 — Purchaser count contradiction
  'purchaser_count_contradiction',
  // B3 — Gift declared vs denied
  'gift_declared_vs_denied',
  // C5 — Employment status contradiction
  'employment_status_contradiction',
] as const;

export type EnquiryCategory = (typeof ENQUIRY_CATEGORIES)[number];

export type EnquiryStatus = 'draft' | 'approved' | 'sent' | 'responded' | 'resolved' | 'suppressed';
export type EnquiryPriority = 'critical' | 'high' | 'medium' | 'low';
export type EnquiryMandatory = 'mandatory' | 'discretionary';
export type EnquiryType = 'missing_explanation' | 'missing_evidence' | 'contradiction' | 'partial_support' | 'reviewer_followup';

export interface DraftEnquiry {
  id: string;
  enquiryCategory: EnquiryCategory;
  enquiryType: EnquiryType;
  linkedExceptionType: ExceptionType;
  linkedExceptionRef: string;
  linkedSourceId: string | null;
  linkedTransactionIds: string[];
  linkedBalanceId: string | null;
  linkedEvidenceId: string | null;
  priority: EnquiryPriority;
  mandatory: EnquiryMandatory;
  severityBasis: string;
  whyEnquiryNeeded: string;
  userFacingEnquiryText: string;
  internalGuidanceNote: string;
  suggestedEvidenceTypes: string[];
  suggestedResolutionPath: string;
  status: EnquiryStatus;
  reviewerEdited: boolean;
  reviewerNotes: string | null;
  canMergeWith: string | null;
  mergeGroupKey: string;
  amountInvolved: number | null;
  proportionOfFunds: number | null;
}

// ── DB-ready mapping ─────────────────────────────────────────────

export interface DraftEnquiryInsert {
  case_id: string;
  armalytix_report_id: string;
  enquiry_category: string;
  enquiry_type: string;
  linked_exception_type: string;
  linked_exception_ref: string;
  linked_source_id: string | null;
  linked_transaction_ids: string[];
  priority: string;
  mandatory: string;
  severity_basis: string;
  why_enquiry_needed: string;
  user_facing_text: string;
  internal_guidance: string;
  suggested_evidence_types: string[];
  suggested_resolution: string;
  status: string;
  reviewer_edited: boolean;
  reviewer_notes: string | null;
  merge_group_key: string;
  amount_involved: number | null;
  proportion_of_funds: number | null;
}

export function toDraftEnquiryInsert(
  enquiry: DraftEnquiry,
  caseId: string,
  reportId: string
): DraftEnquiryInsert {
  return {
    case_id: caseId,
    armalytix_report_id: reportId,
    enquiry_category: enquiry.enquiryCategory,
    enquiry_type: enquiry.enquiryType,
    linked_exception_type: enquiry.linkedExceptionType,
    linked_exception_ref: enquiry.linkedExceptionRef,
    linked_source_id: enquiry.linkedSourceId,
    linked_transaction_ids: enquiry.linkedTransactionIds,
    priority: enquiry.priority,
    mandatory: enquiry.mandatory,
    severity_basis: enquiry.severityBasis,
    why_enquiry_needed: enquiry.whyEnquiryNeeded,
    user_facing_text: enquiry.userFacingEnquiryText,
    internal_guidance: enquiry.internalGuidanceNote,
    suggested_evidence_types: enquiry.suggestedEvidenceTypes,
    suggested_resolution: enquiry.suggestedResolutionPath,
    status: enquiry.status,
    reviewer_edited: enquiry.reviewerEdited,
    reviewer_notes: enquiry.reviewerNotes,
    merge_group_key: enquiry.mergeGroupKey,
    amount_involved: enquiry.amountInvolved,
    proportion_of_funds: enquiry.proportionOfFunds,
  };
}

// ── UUID stub (no crypto dependency) ─────────────────────────────

let _counter = 0;
function makeId(): string {
  _counter += 1;
  return `enq-${Date.now()}-${_counter}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Template context ─────────────────────────────────────────────

interface TemplateContext {
  amount?: number | null;
  date?: string | null;
  description?: string | null;
  sourceCategory?: string | null;
  partyName?: string | null;
  shortfallAmount?: number | null;
  excessAmount?: number | null;
  count?: number | null;
}

interface EnquiryTemplate {
  defaultUserText: (ctx: TemplateContext) => string;
  internalRationale: (ctx: TemplateContext) => string;
  suggestedEvidence: string[];
  defaultPriority: EnquiryPriority;
  isMandatory: boolean;
  suggestedResolution: string;
  enquiryType: EnquiryType;
}

// ── Exception → Enquiry category map ─────────────────────────────

const EXCEPTION_TO_ENQUIRY: Record<ExceptionType, EnquiryCategory> = {
  undeclared_incoming_credit: 'unexplained_incoming_credit',
  unexplained_large_incoming: 'large_incoming_unmatched',
  repeated_third_party_credits: 'repeated_third_party_credits',
  cash_deposit_unexplained: 'unexplained_incoming_credit',
  salary_savings_unsupported: 'salary_savings_unsupported',
  cobuyer_contribution_unevidenced: 'cobuyer_contribution_unevidenced',
  gift_incomplete_evidence: 'gift_incomplete_evidence',
  manual_balance_unevidenced: 'manual_balance_unevidenced',
  funding_shortfall: 'funding_shortfall',
  excess_funds_unexplained: 'excess_funds_unexplained',
  amount_mismatch_declaration_vs_evidence: 'contradiction_narrative_vs_evidence',
  source_timing_mismatch: 'source_timing_mismatch',
  transaction_inconsistent_with_source: 'contradiction_narrative_vs_evidence',
  possible_undeclared_loan: 'possible_undeclared_loan',
  investment_crypto_activity: 'investment_crypto_clarification',
  significant_gambling_activity: 'gambling_activity_relevant',
  transfer_chain_unclear: 'transfer_chain_unclear',
  circular_movement_suspected: 'transfer_chain_unclear',
  overseas_insufficiently_explained: 'overseas_source_clarification',
  mortgage_funding_contradiction: 'contradiction_narrative_vs_evidence',
  name_identity_inconsistency: 'name_identity_mismatch',
  lifestyle_inconsistent_with_income: 'lifestyle_inconsistent_with_income',
  late_disclosure_after_challenge: 'late_disclosure_after_challenge',
  purchaser_count_contradiction: 'purchaser_count_contradiction',
  gift_declared_vs_denied: 'gift_declared_vs_denied',
  employment_status_contradiction: 'employment_status_contradiction',
};

// ── Templates ────────────────────────────────────────────────────

const TEMPLATES: Record<EnquiryCategory, EnquiryTemplate> = {
  unexplained_incoming_credit: {
    defaultUserText: (ctx) =>
      `An incoming credit of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'an undisclosed amount'}${ctx.date ? ` on ${ctx.date}` : ''}${ctx.description ? ` ("${ctx.description}")` : ''} has not been attributed to any declared source of funds. We require:\n1.1 A full explanation of the origin and purpose of this payment.\n1.2 Supporting evidence, such as the sender's bank statement or a contract evidencing the underlying transaction.`,
    internalRationale: (ctx) =>
      `Incoming credit of £${ctx.amount ?? 0} has no corresponding declared source. Compliance significance: may represent undisclosed third-party funding or an undeclared loan, affecting the integrity of the source-of-funds position.`,
    suggestedEvidence: ['Sender\'s bank statement showing the outgoing payment', 'Written explanation of the origin of funds', 'Contract or agreement evidencing the transaction'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Attribute to an existing declared source with supporting evidence, or declare a new source and provide documentation.',
    enquiryType: 'missing_explanation',
  },
  large_incoming_unmatched: {
    defaultUserText: (ctx) =>
      `An incoming credit of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a significant amount'}${ctx.date ? ` received on ${ctx.date}` : ''} has not been attributed to any declared source of funds. Given the materiality of this amount, we require:\n1.1 A full explanation of the origin and purpose of this payment.\n1.2 Supporting evidence such as the sender's bank statement or a contract evidencing the underlying transaction.`,
    internalRationale: (ctx) =>
      `Large one-off incoming credit of £${ctx.amount ?? 0} exceeds materiality threshold and is unattributed. Compliance significance: material unexplained credits must be resolved before sign-off.`,
    suggestedEvidence: ['Sender\'s bank statement confirming the outgoing payment', 'Contract, sale agreement, or invoice evidencing the transaction', 'Written confirmation from the sender of the purpose of the payment'],
    defaultPriority: 'critical',
    isMandatory: true,
    suggestedResolution: 'Obtain a complete audit trail from sender to receipt, including the sender\'s bank statement and written explanation.',
    enquiryType: 'missing_explanation',
  },
  repeated_third_party_credits: {
    defaultUserText: (ctx) =>
      `${ctx.count ?? 'Multiple'} recurring credits from what appears to be a third party have been identified, totalling ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a material amount'}. We require:\n1.1 Confirmation of the identity of the sender.\n1.2 An explanation of the nature and purpose of these payments.\n1.3 Any supporting documentation, such as an agreement, contract, or letter from the sender.`,
    internalRationale: (ctx) =>
      `${ctx.count ?? 0} repeated third-party credits totalling £${ctx.amount ?? 0} without declared source attribution. Compliance significance: repeated unexplained third-party credits may indicate undisclosed loans or financial arrangements.`,
    suggestedEvidence: ['Written confirmation of the sender\'s identity', 'Explanation of the nature of the payments', 'Supporting agreement, contract, or letter from the sender'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Identify the sender, confirm the purpose of payments, and link to a declared source with supporting evidence.',
    enquiryType: 'missing_explanation',
  },
  cobuyer_contribution_unevidenced: {
    defaultUserText: (ctx) =>
      `A co-buyer contribution of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'}${ctx.partyName ? ` from ${ctx.partyName}` : ''} has been declared but supporting evidence for the origin of these funds has not been provided. To satisfy regulatory and lender requirements, the following are needed:\n1.1 The co-buyer's bank statements covering the most recent three to six months.\n1.2 A source-of-funds explanation for the co-buyer's contribution.\n1.3 If the contribution is a gift, a signed gift letter confirming it is non-repayable.`,
    internalRationale: (ctx) =>
      `Co-buyer contribution of £${ctx.amount ?? 0} declared without independent verification. Compliance significance: co-buyer funds must be independently evidenced to the same standard as primary buyer funds.`,
    suggestedEvidence: ['Co-buyer\'s bank statements (three to six months)', 'Co-buyer\'s written source-of-funds explanation', 'Gift letter if applicable, confirming the contribution is non-repayable'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain and review the co-buyer\'s bank statements and source-of-funds documentation.',
    enquiryType: 'missing_evidence',
  },
  gift_incomplete_evidence: {
    defaultUserText: (ctx) =>
      `A gift of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'} has been declared towards this purchase. To satisfy regulatory and lender requirements, the following items are needed:\n1.1 A signed gift letter confirming the gift is non-repayable and that no interest in the property is retained by the donor.\n1.2 The donor's bank statement showing available funds and the corresponding outgoing payment.\n1.3 Confirmation of the relationship between the donor and the recipient.`,
    internalRationale: (ctx) =>
      `Gift of £${ctx.amount ?? 0} declared without a complete evidence package. Compliance significance: incomplete gift evidence fails both AML regulatory requirements and standard lender conditions.`,
    suggestedEvidence: ['Signed gift letter confirming non-repayable nature and no retained interest', 'Donor\'s bank statement showing available funds and the outgoing payment', 'Proof of relationship between donor and recipient', 'Donor\'s source of wealth explanation if the gift exceeds £10,000'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain and review the complete gift evidence package: gift letter, donor bank statement, and proof of relationship.',
    enquiryType: 'missing_evidence',
  },
  salary_savings_unsupported: {
    defaultUserText: (ctx) =>
      `Savings of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'} are stated to have been accumulated from salary. However, the salary credit pattern and accumulation period do not fully support this level of savings. We would be grateful if you could provide:\n1.1 Historical bank statements or savings account records demonstrating how these savings were built up.\n1.2 Payslips or employment contract confirming the salary level relied upon.`,
    internalRationale: (ctx) =>
      `Salary savings claim of £${ctx.amount ?? 0} exceeds plausible accumulation based on the observed income pattern. Compliance significance: savings claims must be consistent with evidenced income levels and timelines.`,
    suggestedEvidence: ['Historical bank statements showing gradual savings accumulation', 'Savings account statements covering the relevant period', 'Payslips or employment contract confirming salary level'],
    defaultPriority: 'high',
    isMandatory: false,
    suggestedResolution: 'Obtain savings history demonstrating gradual accumulation consistent with the declared income level.',
    enquiryType: 'partial_support',
  },
  manual_balance_unevidenced: {
    defaultUserText: (ctx) =>
      `A manually entered balance of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'} is being relied upon as part of the proof of funds but has not been independently verified. We require:\n1.1 A current bank statement or certified screenshot confirming this balance.\n1.2 The statement must show the account holder name, balance, and date.`,
    internalRationale: (ctx) =>
      `Manual balance of £${ctx.amount ?? 0} is counted toward proof of funds without independent verification. Compliance significance: manually entered balances are inherently unverified and must be corroborated with bank evidence.`,
    suggestedEvidence: ['Current bank statement confirming the balance and account holder', 'Certified screenshot of online banking showing balance and date', 'Banker\'s letter confirming the balance'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain a verified bank statement or certified screenshot confirming the balance.',
    enquiryType: 'missing_evidence',
  },
  funding_shortfall: {
    defaultUserText: (ctx) =>
      `Based on our analysis, there is a funding shortfall of ${ctx.shortfallAmount != null ? `£${ctx.shortfallAmount.toLocaleString()}` : 'a material amount'} between the amount required to complete this purchase and the evidenced funds available. We require:\n1.1 Confirmation of how you intend to bridge this shortfall.\n1.2 Evidence of any additional funds not yet disclosed.`,
    internalRationale: (ctx) =>
      `Funding shortfall of £${ctx.shortfallAmount ?? 0} identified. Compliance significance: the amount to prove cannot be satisfied by current evidenced funds, which blocks a clean source-of-funds conclusion.`,
    suggestedEvidence: ['Additional bank statements showing available funds', 'Evidence of a further funding source not yet declared', 'Updated mortgage offer if the shortfall relates to lending'],
    defaultPriority: 'critical',
    isMandatory: true,
    suggestedResolution: 'Identify and evidence additional funding sufficient to close the shortfall.',
    enquiryType: 'missing_explanation',
  },
  excess_funds_unexplained: {
    defaultUserText: (ctx) =>
      `For completeness, the evidenced funds exceed the amount required for this purchase by approximately ${ctx.excessAmount != null ? `£${ctx.excessAmount.toLocaleString()}` : 'a material amount'}. No action is required at this stage, but we would appreciate brief confirmation of the intended use or retention of the surplus.`,
    internalRationale: (ctx) =>
      `Excess funds of £${ctx.excessAmount ?? 0} above amount to prove. Compliance significance: while excess funds are not inherently problematic, the source of the excess should be understood for completeness.`,
    suggestedEvidence: ['Brief written explanation of the intended use of excess funds'],
    defaultPriority: 'low',
    isMandatory: false,
    suggestedResolution: 'Note the explanation of excess funds for the file.',
    enquiryType: 'reviewer_followup',
  },
  transfer_chain_unclear: {
    defaultUserText: (ctx) =>
      `Fund movements between accounts have made the audit trail unclear${ctx.amount != null ? `, involving approximately £${ctx.amount.toLocaleString()}` : ''}. We require:\n1.1 A clear explanation of the transfer chain, including the original source, any intermediate accounts, and the final destination.\n1.2 Bank statements for all accounts involved in these movements.`,
    internalRationale: (ctx) =>
      `Transfer chain or circular movement detected. Compliance significance: funds moving between accounts without a clear origin may obscure the true source and must be fully traced.`,
    suggestedEvidence: ['Bank statements for all accounts involved in the transfer chain', 'Written explanation of the purpose of each transfer'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Map the complete transfer chain from the original source to the final account with bank statements for each step.',
    enquiryType: 'missing_explanation',
  },
  possible_undeclared_loan: {
    defaultUserText: (ctx) =>
      `An incoming credit of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a material amount'}${ctx.date ? ` on ${ctx.date}` : ''} appears to be loan-related but no loan has been declared as a source of funds. We require:\n1.1 If this is a loan, the loan agreement and confirmation that the funds are being used toward this purchase.\n1.2 If this is not a loan, a written explanation of the nature and origin of this credit.`,
    internalRationale: (ctx) =>
      `Possible undeclared loan of £${ctx.amount ?? 0}. Compliance significance: if loan proceeds are being relied upon for the purchase, the loan must be disclosed and may affect lender requirements.`,
    suggestedEvidence: ['Loan agreement', 'Confirmation of loan purpose and intended use', 'Repayment schedule', 'Or: written explanation if not a loan'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Confirm whether the credit represents a loan. If so, declare it and provide the loan agreement.',
    enquiryType: 'missing_explanation',
  },
  investment_crypto_clarification: {
    defaultUserText: (ctx) =>
      `Investment or cryptocurrency-related activity totalling ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a material amount'} has been identified in the account data. For completeness, if any proceeds from investments or cryptocurrency sales are being relied upon for this purchase, we would be grateful if you could provide:\n1.1 Platform or brokerage statements showing the holding and sale.\n1.2 Evidence of the original investment source.\n1.3 Withdrawal confirmations showing the transfer to the account relied upon.`,
    internalRationale: (ctx) =>
      `Investment or cryptocurrency activity of £${ctx.amount ?? 0} detected. Compliance significance: if proceeds are relied upon as part of the source of funds, a full audit trail from original investment to withdrawal is required.`,
    suggestedEvidence: ['Investment platform or brokerage statements', 'Trading history showing purchase and sale', 'Evidence of the original investment source', 'Withdrawal confirmations to the bank account relied upon'],
    defaultPriority: 'medium',
    isMandatory: false,
    suggestedResolution: 'Determine whether investment proceeds are relied upon. If so, obtain platform statements and evidence of the original source.',
    enquiryType: 'reviewer_followup',
  },
  gambling_activity_relevant: {
    defaultUserText: (ctx) =>
      `Gambling-related transactions totalling ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a material amount'} have been identified in the account data. We require:\n1.1 Confirmation of whether any gambling winnings are being relied upon as part of the funds for this purchase.\n1.2 If so, evidence of the winnings and their deposit into the account relied upon.`,
    internalRationale: (ctx) =>
      `Gambling activity of £${ctx.amount ?? 0} detected. Compliance significance: gambling-related funds carry elevated AML risk and must be assessed for their impact on the relied-upon funds position.`,
    suggestedEvidence: ['Gambling platform withdrawal records and statements', 'Written confirmation of whether winnings form part of the relied-upon funds'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Assess whether gambling proceeds form part of the relied-upon funds and obtain platform evidence if so.',
    enquiryType: 'missing_explanation',
  },
  overseas_source_clarification: {
    defaultUserText: (ctx) =>
      `An overseas or international transfer of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'a material amount'}${ctx.date ? ` on ${ctx.date}` : ''} has been identified. We require:\n1.1 The originating country, institution, and currency.\n1.2 The purpose of this transfer.\n1.3 Supporting evidence such as the foreign bank statement or transfer receipt.`,
    internalRationale: (ctx) =>
      `Overseas incoming of £${ctx.amount ?? 0} not linked to a declared source. Compliance significance: international transfers may trigger enhanced due diligence requirements.`,
    suggestedEvidence: ['Foreign bank statement showing the outgoing transfer', 'Transfer receipt or SWIFT confirmation', 'Written explanation of the purpose of the transfer', 'Currency conversion details if applicable'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain full details of the overseas transfer including origin, purpose, and supporting bank evidence.',
    enquiryType: 'missing_explanation',
  },
  contradiction_narrative_vs_evidence: {
    defaultUserText: (ctx) =>
      `A discrepancy has been identified between the declared source-of-funds narrative and the supporting evidence. Specifically, ${ctx.description ?? 'the declared information does not align with the bank data or documentation provided'}. We require:\n1.1 Clarification of the discrepancy.\n1.2 Updated evidence or an amended declaration to resolve the inconsistency.`,
    internalRationale: (ctx) =>
      `Contradiction between declared narrative and evidence. Compliance significance: unresolved contradictions undermine the reliability of the source-of-funds position. ${ctx.description ?? ''}`,
    suggestedEvidence: ['Updated declaration addressing the discrepancy', 'Corrected or additional documentation', 'Written explanation resolving the inconsistency'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Resolve the contradiction with an updated declaration or corrected evidence.',
    enquiryType: 'contradiction',
  },
  missing_document: {
    defaultUserText: (ctx) =>
      `A document referred to in the report${ctx.description ? ` ("${ctx.description}")` : ''} does not appear to have been provided. For completeness, we would be grateful if you could upload the referenced document to support the declared source of funds.`,
    internalRationale: (ctx) =>
      `Referenced document not found in the case file. Compliance significance: the evidence chain is incomplete without this document.`,
    suggestedEvidence: ['The referenced document as described in the report'],
    defaultPriority: 'medium',
    isMandatory: false,
    suggestedResolution: 'Upload the missing document to complete the evidence chain.',
    enquiryType: 'missing_evidence',
  },
  government_bonus_evidence: {
    defaultUserText: (ctx) =>
      `A government bonus, LISA bonus, or Help to Buy payment of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'} is being relied upon. For completeness, we would be grateful if you could provide:\n1.1 A LISA or ISA statement confirming the bonus entitlement.\n1.2 Help to Buy confirmation letter or equivalent, if applicable.`,
    internalRationale: (ctx) =>
      `Government bonus or LISA/ISA of £${ctx.amount ?? 0} declared without confirmation of receipt or application. Compliance significance: bonus entitlements must be evidenced to confirm they are available for completion.`,
    suggestedEvidence: ['LISA or ISA statement confirming bonus entitlement', 'Help to Buy confirmation letter', 'Government bonus receipt or application confirmation'],
    defaultPriority: 'medium',
    isMandatory: false,
    suggestedResolution: 'Obtain the LISA statement, Help to Buy confirmation, or equivalent bonus receipt.',
    enquiryType: 'missing_evidence',
  },
  sale_proceeds_evidence: {
    defaultUserText: (ctx) =>
      `Sale proceeds of ${ctx.amount != null ? `£${ctx.amount.toLocaleString()}` : 'the declared amount'} are being relied upon as a source of funds. We require:\n1.1 The completion statement or solicitor's final account showing the net proceeds.\n1.2 A bank statement showing receipt of the net sale proceeds into the account relied upon.`,
    internalRationale: (ctx) =>
      `Sale proceeds of £${ctx.amount ?? 0} declared without sufficient supporting evidence. Compliance significance: sale proceeds must be verified against a completion statement and bank receipt to confirm both amount and attribution.`,
    suggestedEvidence: ['Completion statement or solicitor\'s final account', 'Bank statement showing receipt of net sale proceeds'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain the completion statement and bank statement showing receipt of net proceeds.',
    enquiryType: 'missing_evidence',
  },
  source_timing_mismatch: {
    defaultUserText: (ctx) =>
      `The declared receipt date for a source of funds${ctx.sourceCategory ? ` ("${ctx.sourceCategory}")` : ''} does not align with the dates of the linked transactions in the bank data. For completeness, we would be grateful if you could:\n1.1 Confirm when the funds were actually received.\n1.2 Provide a bank statement covering the relevant period.`,
    internalRationale: (ctx) =>
      `Timing mismatch between declared receipt date and bank transaction dates for source "${ctx.sourceCategory ?? 'unknown'}". Compliance significance: date discrepancies may indicate that declared and actual funding events are different.`,
    suggestedEvidence: ['Bank statement covering the relevant period', 'Written confirmation of the actual receipt date'],
    defaultPriority: 'medium',
    isMandatory: false,
    suggestedResolution: 'Clarify the actual receipt date and provide a supporting bank statement.',
    enquiryType: 'contradiction',
  },
  name_identity_mismatch: {
    defaultUserText: (ctx) =>
      `An inconsistency has been identified in the names associated with the source of funds. ${ctx.description ?? 'The name on the payslip, bank account, or declared employer does not match the expected details.'} We require:\n1.1 Confirmation of the correct details.\n1.2 Evidence to resolve the discrepancy, such as a bank statement header showing the account holder name, photo ID, or employer confirmation.`,
    internalRationale: (ctx) =>
      `Name or identity mismatch affecting attribution of funds. Compliance significance: identity discrepancies may mean funds cannot be attributed to the declared party. ${ctx.description ?? ''}`,
    suggestedEvidence: ['Photo ID confirming the correct name', 'Bank statement header showing the account holder name', 'Payslip confirming the employer and employee name', 'Employer confirmation letter if applicable'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Confirm the correct identity and provide matching documentation to resolve the discrepancy.',
    enquiryType: 'contradiction',
  },
  lifestyle_inconsistent_with_income: {
    defaultUserText: (ctx) =>
      `The deposit relied upon for this purchase${ctx.amount != null ? ` (£${ctx.amount.toLocaleString()})` : ''} is materially larger than the savings that could plausibly be accumulated from the declared income${ctx.description ? ` over the period considered` : ''}. To support a proportionate source-of-wealth conclusion, we would be grateful if you could provide:\n1.1 An explanation of how the deposit has been built up.\n1.2 Evidence of any additional sources of wealth (for example inheritance, sale proceeds, gifts, or prior savings) that contribute to the deposit.`,
    internalRationale: (ctx) =>
      `Deposit reliance exceeds plausible savings capacity from declared income. Compliance significance: lifestyle vs declared wealth proportionality is a recognised AML consideration under LSAG and must be addressed where the gap is material. ${ctx.description ?? ''}`,
    suggestedEvidence: ['Written explanation of how the deposit was accumulated', 'Historical bank or savings statements showing accumulation', 'Evidence of additional wealth sources (inheritance, sale proceeds, gifts, prior savings)'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Obtain an explanation and supporting evidence for the additional wealth required to justify the deposit relative to declared income.',
    enquiryType: 'partial_support',
  },
  late_disclosure_after_challenge: {
    defaultUserText: (ctx) =>
      `We note that the explanation${ctx.description ? ` regarding "${ctx.description}"` : ''} was provided after the issue had been raised through compliance review, rather than at the outset. To complete the file, we would be grateful if you could:\n1.1 Confirm whether any further information has not yet been disclosed that may be relevant.\n1.2 Provide any supporting documentation that has not yet been shared.`,
    internalRationale: (ctx) =>
      `Material information was disclosed only after challenge during compliance review. Compliance significance: the timing of explanations is a recognised AML consideration and is recorded for the file when assessing overall reliability. ${ctx.description ?? ''}`,
    suggestedEvidence: ['Confirmation that no further material information remains undisclosed', 'Any supporting documentation not yet provided'],
    defaultPriority: 'medium',
    isMandatory: false,
    suggestedResolution: 'Note the timing for the file and request confirmation that the disclosure is now complete.',
    enquiryType: 'reviewer_followup',
  },
  purchaser_count_contradiction: {
    defaultUserText: (ctx) =>
      `Our review has identified a difference between the purchasing parties recorded on the matter file and the parties indicated in the source-of-funds and mortgage information. ${ctx.description ?? ''}\n1.1 Please confirm the full list of intended purchasers for this transaction.\n1.2 Please confirm whether any additional party will be a co-borrower under the mortgage offer or will be contributing funds to the purchase.\n1.3 If the purchaser list has changed, please provide identification and source-of-funds evidence for any party not previously notified.`,
    internalRationale: (ctx) =>
      `Declared purchaser list does not reconcile with mortgage / contribution signals in the structured data. ${ctx.description ?? ''} Compliance significance: an undeclared additional purchaser, beneficial owner or co-borrower may indicate undisclosed third-party funding or beneficial ownership and must be resolved before completion.`,
    suggestedEvidence: ['Updated list of intended purchasers', 'Mortgage offer header confirming all named borrowers', 'Identification documents for any additional purchaser', 'Source-of-funds evidence for any additional purchaser'],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution: 'Confirm the purchaser list and reconcile against mortgage offer and contribution data; obtain ID and SoF for any newly disclosed party.',
    enquiryType: 'contradiction',
  },
  gift_declared_vs_denied: {
    defaultUserText: (ctx) =>
      `The information provided on the case form indicates that no gift has been received towards this purchase. ` +
      `However, the funding evidence appears to include credits that are consistent with a gift${ctx.amount != null ? ` (cited transactions totalling £${ctx.amount.toLocaleString()})` : ''}. ` +
      `To reconcile the position, we would be grateful if you could:\n` +
      `1.1 Confirm whether any part of the funds being relied upon is a gift.\n` +
      `1.2 If yes, please provide a signed gift letter, the donor's bank statement showing the outgoing payment, and confirmation of the relationship between donor and recipient.\n` +
      `1.3 If no, please briefly explain the origin of the cited credits so that we can update the file.`,
    internalRationale: (ctx) =>
      `Case form records gift_declared = false but the structured funding evidence shows incoming credits classified as a gift or whose narratives match gift-related terms. ` +
      `Compliance significance: a denied-but-evidenced gift is a material declaration vs evidence contradiction under LSAG B and must be resolved before a clean source-of-funds conclusion can be reached. ` +
      `${ctx.description ?? ''}`,
    suggestedEvidence: [
      'Written confirmation of whether any funds being relied upon are a gift',
      'Signed gift letter confirming non-repayable nature and no retained interest',
      'Donor\'s bank statement showing the outgoing payment',
      'Proof of relationship between donor and recipient',
      'Or: written explanation of the cited credits if not a gift',
    ],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution:
      'Reconcile the declared position with the funding evidence: either obtain the standard gift evidence package or obtain a written explanation of the cited credits.',
    enquiryType: 'contradiction',
  },
  employment_status_contradiction: {
    defaultUserText: (ctx) =>
      `Our review has identified a potential inconsistency between the employment position declared on the matter file and the supporting evidence. ${ctx.description ?? ''}\n` +
      `1.1 Please confirm your current employment status (employed, self-employed, company director, or a combination).\n` +
      `1.2 If you are self-employed or operate through a limited company, please provide an accountant's letter, your most recent SA302 or tax year overview, and dividend vouchers where applicable.\n` +
      `1.3 If you are PAYE-employed, please provide your three most recent payslips and confirm the bank account into which salary is paid.`,
    internalRationale: (ctx) =>
      `Declared salary income does not reconcile with the supporting evidence (either declared self-employment / dividend markers also present, or no PAYE-pattern credit observed on the bank data). ` +
      `Compliance significance: employment-status uncertainty under LSAG C affects the reliability of the income narrative used to support the source-of-wealth conclusion. ${ctx.description ?? ''}`,
    suggestedEvidence: [
      'Written confirmation of current employment status',
      'Three most recent payslips (if PAYE-employed)',
      'Accountant\'s letter, SA302 or tax year overview (if self-employed or director)',
      'Dividend vouchers (if income includes company distributions)',
    ],
    defaultPriority: 'high',
    isMandatory: true,
    suggestedResolution:
      'Confirm employment status and obtain the corresponding evidence (payslips for PAYE, accountant\'s letter / SA302 / dividend vouchers for self-employment or director income).',
    enquiryType: 'contradiction',
  },
};

// ── Build context from exception ─────────────────────────────────

function buildTemplateContext(exception: ExceptionItem): TemplateContext {
  // Extract amounts from quantitativeBasis where possible
  let amount: number | null = null;
  if (exception.quantitativeBasis) {
    const match = exception.quantitativeBasis.match(/£([\d,]+(?:\.\d+)?)/);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
    }
  }

  // Extract date from rationale
  let date: string | null = null;
  const dateMatch = exception.rationale.match(/\d{4}-\d{2}-\d{2}/);
  if (dateMatch) date = dateMatch[0];

  return {
    amount,
    date,
    description: exception.rationale,
    sourceCategory: null,
    partyName: null,
    shortfallAmount: amount,
    excessAmount: amount,
  };
}

// ── Enquiry from exception ───────────────────────────────────────

function exceptionToEnquiry(
  exception: ExceptionItem,
  fundingChain: FundingChainSummary | null
): DraftEnquiry | null {
  if (!exception.canTriggerEnquiry) return null;

  const category = EXCEPTION_TO_ENQUIRY[exception.exceptionType];
  if (!category) return null;

  const template = TEMPLATES[category];
  const ctx = buildTemplateContext(exception);

  // Enrich context for funding chain exceptions
  if (exception.exceptionType === 'funding_shortfall' && fundingChain) {
    ctx.shortfallAmount = fundingChain.shortfallAmount;
  }
  if (exception.exceptionType === 'excess_funds_unexplained' && fundingChain) {
    ctx.excessAmount = fundingChain.excessAmount;
  }

  const mergeGroupKey = `${exception.exceptionType}::${exception.linkedRefId || 'global'}`;
  const amountToProve = fundingChain?.amountToProve ?? 0;
  const proportionOfFunds = ctx.amount && amountToProve > 0
    ? ctx.amount / amountToProve
    : null;

  return {
    id: makeId(),
    enquiryCategory: category,
    enquiryType: template.enquiryType,
    linkedExceptionType: exception.exceptionType,
    linkedExceptionRef: `${exception.exceptionType}::${exception.linkedRefTable}::${exception.linkedRefId}`,
    linkedSourceId: exception.linkedRefTable === 'sow_fund_sources' ? exception.linkedRefId : null,
    linkedTransactionIds: exception.linkedRefTable === 'sow_transactions' ? [exception.linkedRefId] : [],
    linkedBalanceId: exception.linkedRefTable === 'sow_manual_balances' ? exception.linkedRefId : null,
    linkedEvidenceId: null,
    priority: template.defaultPriority,
    mandatory: template.isMandatory ? 'mandatory' : 'discretionary',
    severityBasis: `Exception severity: ${exception.severity}`,
    whyEnquiryNeeded: template.internalRationale(ctx),
    userFacingEnquiryText: template.defaultUserText(ctx),
    internalGuidanceNote: exception.rationale,
    suggestedEvidenceTypes: [...template.suggestedEvidence],
    suggestedResolutionPath: template.suggestedResolution,
    status: 'draft',
    reviewerEdited: false,
    reviewerNotes: null,
    canMergeWith: null,
    mergeGroupKey,
    amountInvolved: ctx.amount,
    proportionOfFunds,
  };
}

// ── Quality controls ─────────────────────────────────────────────

export function deduplicateEnquiries(enquiries: DraftEnquiry[]): DraftEnquiry[] {
  const seen = new Set<string>();
  return enquiries.filter((e) => {
    const key = `${e.mergeGroupKey}::${e.enquiryCategory}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeCompatibleEnquiries(enquiries: DraftEnquiry[]): DraftEnquiry[] {
  const groups = new Map<string, DraftEnquiry[]>();

  for (const e of enquiries) {
    const existing = groups.get(e.mergeGroupKey);
    if (existing) {
      existing.push(e);
    } else {
      groups.set(e.mergeGroupKey, [e]);
    }
  }

  const merged: DraftEnquiry[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // Only merge if same category — otherwise keep separate
    const categories = new Set(group.map((e) => e.enquiryCategory));
    if (categories.size > 1) {
      // Different categories targeting same source — keep separate for clarity
      merged.push(...group);
      continue;
    }

    // Merge: take highest priority, combine text, combine evidence
    const sorted = group.sort((a, b) => {
      const p = { critical: 0, high: 1, medium: 2, low: 3 };
      return p[a.priority] - p[b.priority];
    });
    const primary = { ...sorted[0] };

    // Combine transaction IDs
    const allTxIds = new Set<string>();
    for (const e of group) {
      for (const id of e.linkedTransactionIds) allTxIds.add(id);
    }
    primary.linkedTransactionIds = Array.from(allTxIds);

    // Combine evidence types
    const allEvidence = new Set<string>();
    for (const e of group) {
      for (const ev of e.suggestedEvidenceTypes) allEvidence.add(ev);
    }
    primary.suggestedEvidenceTypes = Array.from(allEvidence);

    // Sum amounts
    const totalAmount = group.reduce((s, e) => s + (e.amountInvolved ?? 0), 0);
    if (totalAmount > 0) primary.amountInvolved = totalAmount;

    // If any is mandatory, the merged one is mandatory
    if (group.some((e) => e.mandatory === 'mandatory')) {
      primary.mandatory = 'mandatory';
    }

    merged.push(primary);
  }

  return merged;
}

export function filterAlreadyResolved(
  enquiries: DraftEnquiry[],
  resolvedExceptionRefs: Set<string>
): DraftEnquiry[] {
  return enquiries.filter((e) => !resolvedExceptionRefs.has(e.linkedExceptionRef));
}

export function filterAlreadyEvidenced(
  enquiries: DraftEnquiry[],
  acceptedEvidenceIds: Set<string>
): DraftEnquiry[] {
  return enquiries.filter((e) => {
    if (e.linkedEvidenceId && acceptedEvidenceIds.has(e.linkedEvidenceId)) return false;
    return true;
  });
}

export function escalateWording(enquiry: DraftEnquiry, isBlocker: boolean): DraftEnquiry {
  if (!isBlocker) return enquiry;

  const escalated = { ...enquiry };
  escalated.userFacingEnquiryText =
    escalated.userFacingEnquiryText +
    `\n\nThis matter must be resolved before the source of funds position can be concluded.`;
  escalated.internalGuidanceNote =
    `[BLOCKER] ${escalated.internalGuidanceNote}`;
  return escalated;
}

// ── Prioritisation ───────────────────────────────────────────────

const SEVERITY_SCORES: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const HIGH_RISK_CATEGORIES: Set<EnquiryCategory> = new Set([
  'cobuyer_contribution_unevidenced',
  'gift_incomplete_evidence',
  'possible_undeclared_loan',
  'overseas_source_clarification',
  'gambling_activity_relevant',
  'repeated_third_party_credits',
  'transfer_chain_unclear',
]);

const MANDATORY_HIGH_RISK: Set<EnquiryCategory> = new Set([
  'cobuyer_contribution_unevidenced',
  'gift_incomplete_evidence',
  'possible_undeclared_loan',
  'overseas_source_clarification',
  'gambling_activity_relevant',
]);

export function prioritiseEnquiries(
  enquiries: DraftEnquiry[],
  fundingChain: FundingChainSummary | null
): DraftEnquiry[] {
  const amountToProve = fundingChain?.amountToProve ?? 0;

  return enquiries.map((enquiry) => {
    let score = SEVERITY_SCORES[enquiry.priority] ?? 1;

    // Proportion of funds
    if (enquiry.proportionOfFunds != null) {
      if (enquiry.proportionOfFunds > 0.2) score += 3;
      else if (enquiry.proportionOfFunds > 0.1) score += 2;
      else if (enquiry.proportionOfFunds > 0.05) score += 1;
    }

    // Contradiction strength
    if (enquiry.enquiryType === 'contradiction') score += 2;

    // Affects amount-to-prove
    if (
      enquiry.enquiryCategory === 'funding_shortfall' ||
      enquiry.enquiryCategory === 'manual_balance_unevidenced'
    ) {
      score += 2;
    }

    // High-risk category
    if (HIGH_RISK_CATEGORIES.has(enquiry.enquiryCategory)) score += 1;

    // Blocking
    if (enquiry.enquiryCategory === 'funding_shortfall') score += 2;

    // Map score to priority
    let priority: EnquiryPriority;
    if (score >= 8) priority = 'critical';
    else if (score >= 5) priority = 'high';
    else if (score >= 3) priority = 'medium';
    else priority = 'low';

    // Mandatory override
    let mandatory: EnquiryMandatory = enquiry.mandatory;
    if (
      (priority === 'critical' || priority === 'high') &&
      MANDATORY_HIGH_RISK.has(enquiry.enquiryCategory)
    ) {
      mandatory = 'mandatory';
    }

    return { ...enquiry, priority, mandatory };
  }).sort((a, b) => {
    const p = { critical: 0, high: 1, medium: 2, low: 3 };
    return p[a.priority] - p[b.priority];
  });
}

// ── Main orchestrator ────────────────────────────────────────────

export interface EnquiryGenerationInputs {
  exceptions: ExceptionItem[];
  reconciliations: SourceReconciliation[];
  fundingChain: FundingChainSummary;
  unmatchedTxIds: string[];
  resolvedExceptionRefs?: Set<string>;
  acceptedEvidenceIds?: Set<string>;
}

export function generateDraftEnquiries(inputs: EnquiryGenerationInputs): DraftEnquiry[] {
  // Convert exceptions to draft enquiries
  let enquiries: DraftEnquiry[] = [];
  for (const exception of inputs.exceptions) {
    const enquiry = exceptionToEnquiry(exception, inputs.fundingChain);
    if (enquiry) enquiries.push(enquiry);
  }

  // Quality controls
  enquiries = deduplicateEnquiries(enquiries);
  enquiries = mergeCompatibleEnquiries(enquiries);

  if (inputs.resolvedExceptionRefs) {
    enquiries = filterAlreadyResolved(enquiries, inputs.resolvedExceptionRefs);
  }
  if (inputs.acceptedEvidenceIds) {
    enquiries = filterAlreadyEvidenced(enquiries, inputs.acceptedEvidenceIds);
  }

  // Prioritise
  enquiries = prioritiseEnquiries(enquiries, inputs.fundingChain);

  // Escalate wording for blockers
  const blockerCategories: Set<EnquiryCategory> = new Set(['funding_shortfall']);
  enquiries = enquiries.map((e) =>
    escalateWording(e, blockerCategories.has(e.enquiryCategory) || e.priority === 'critical')
  );

  return enquiries;
}
