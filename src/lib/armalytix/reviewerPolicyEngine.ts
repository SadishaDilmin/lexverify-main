/**
 * Reviewer Policy, Issue Severity & Sign-Off Governance Engine
 *
 * Centralised policy matrix determining treatment classification,
 * blocker logic, reviewer override controls and sign-off decision support.
 *
 * Sits between the exception engine and the decision-support engine.
 * Pure functions — no DB calls. No auto-approve or auto-reject.
 */

import type { ExceptionItem, ExceptionType, EXCEPTION_TYPES } from './exceptionEngine';
import type { FundingChainSummary, SourceReconciliation } from './reconciliationEngine';
import type { DraftEnquiry } from './enquiryGenerator';
import type { FundsPositionStatus } from './decisionSupportEngine';

// ── Treatment types ──────────────────────────────────────────────

export type IssueTreatment =
  | 'mandatory_enquiry'
  | 'discretionary_enquiry'
  | 'note_only'
  | 'blocker_pending_evidence'
  | 'blocker_pending_explanation'
  | 'non_blocking_unresolved'
  | 'accepted_subject_to_confirmation'
  | 'resolved'
  | 'overridden_by_reviewer';

// ── Policy rule definition ───────────────────────────────────────

export interface IssuePolicyRule {
  defaultTreatment: IssueTreatment;
  blockerWhenSeverity: ('critical' | 'high')[];
  mandatoryWhenSeverity: ('critical' | 'high')[];
  mandatoryWhenProportionAbove: number | null;
  mandatoryWhenAmountAbove: number | null;
  discretionaryWhenSeverity: ('medium' | 'low')[];
  noteOnlyWhenSeverity: ('low')[];
  affectsAmountToProve: boolean;
  requiresReviewerConfirmation: boolean;
  canBeOverridden: boolean;
  overrideRequiresReason: boolean;
  fundsCategoryRelevance: string[];
}

// ── Human-readable issue type labels ─────────────────────────────

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  unexplained_large_incoming: 'Unexplained large incoming credit',
  undeclared_incoming_credit: 'Undeclared incoming credit',
  repeated_third_party_credits: 'Repeated third-party credits',
  cash_deposit_unexplained: 'Unexplained cash deposit',
  salary_savings_unsupported: 'Salary savings unsupported',
  cobuyer_contribution_unevidenced: 'Co-buyer contribution not evidenced',
  gift_incomplete_evidence: 'Gift evidence incomplete',
  manual_balance_unevidenced: 'Manual balance not evidenced',
  funding_shortfall: 'Funding shortfall',
  excess_funds_unexplained: 'Excess funds unexplained',
  amount_mismatch_declaration_vs_evidence: 'Amount mismatch between declaration and evidence',
  source_timing_mismatch: 'Source timing mismatch',
  transaction_inconsistent_with_source: 'Transaction inconsistent with declared source',
  possible_undeclared_loan: 'Possible undeclared loan',
  investment_crypto_activity: 'Investment or cryptocurrency activity',
  significant_gambling_activity: 'Significant gambling activity',
  transfer_chain_unclear: 'Unclear transfer chain',
  circular_movement_suspected: 'Suspected circular movement',
  overseas_insufficiently_explained: 'Overseas funds insufficiently explained',
  mortgage_funding_contradiction: 'Mortgage funding contradiction',
  name_identity_inconsistency: 'Name or identity inconsistency',
  lifestyle_inconsistent_with_income: 'Lifestyle inconsistent with declared income',
  late_disclosure_after_challenge: 'Late disclosure after challenge',
  purchaser_count_contradiction: 'Declared purchaser list inconsistent with mortgage / contribution signals',
  gift_declared_vs_denied: 'Gift denied on case form but funding evidence indicates otherwise',
  employment_status_contradiction: 'Declared employment status inconsistent with evidence',
};

// ── Policy matrix ────────────────────────────────────────────────

export const ISSUE_POLICY_MATRIX: Record<ExceptionType, IssuePolicyRule> = {
  unexplained_large_incoming: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 5000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['unknown', 'third_party'],
  },
  undeclared_incoming_credit: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['unknown'],
  },
  repeated_third_party_credits: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 5000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['third_party'],
  },
  cash_deposit_unexplained: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 500,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['cash'],
  },
  salary_savings_unsupported: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.15,
    mandatoryWhenAmountAbove: 10000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['salary', 'savings'],
  },
  cobuyer_contribution_unevidenced: {
    defaultTreatment: 'blocker_pending_evidence',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['co_buyer'],
  },
  gift_incomplete_evidence: {
    defaultTreatment: 'blocker_pending_evidence',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['gift'],
  },
  manual_balance_unevidenced: {
    defaultTreatment: 'blocker_pending_evidence',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 2000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['manual_balance'],
  },
  funding_shortfall: {
    defaultTreatment: 'blocker_pending_evidence',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 2000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  excess_funds_unexplained: {
    defaultTreatment: 'discretionary_enquiry',
    blockerWhenSeverity: [],
    mandatoryWhenSeverity: ['critical'],
    mandatoryWhenProportionAbove: 0.5,
    mandatoryWhenAmountAbove: 50000,
    discretionaryWhenSeverity: ['medium', 'low'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: false,
    canBeOverridden: true,
    overrideRequiresReason: false,
    fundsCategoryRelevance: [],
  },
  amount_mismatch_declaration_vs_evidence: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 5000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  source_timing_mismatch: {
    defaultTreatment: 'discretionary_enquiry',
    blockerWhenSeverity: [],
    mandatoryWhenSeverity: ['critical'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: false,
    canBeOverridden: true,
    overrideRequiresReason: false,
    fundsCategoryRelevance: [],
  },
  transaction_inconsistent_with_source: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 5000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  possible_undeclared_loan: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['loan'],
  },
  investment_crypto_activity: {
    defaultTreatment: 'discretionary_enquiry',
    blockerWhenSeverity: [],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.15,
    mandatoryWhenAmountAbove: 10000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['investment', 'crypto'],
  },
  significant_gambling_activity: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 500,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['gambling'],
  },
  transfer_chain_unclear: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 5000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  circular_movement_suspected: {
    defaultTreatment: 'blocker_pending_explanation',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  overseas_insufficiently_explained: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.05,
    mandatoryWhenAmountAbove: 1000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: [],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['overseas'],
  },
  mortgage_funding_contradiction: {
    defaultTreatment: 'blocker_pending_explanation',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['mortgage'],
  },
  name_identity_inconsistency: {
    defaultTreatment: 'blocker_pending_explanation',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['identity'],
  },
  // A7 — Lifestyle vs declared income proportionality
  lifestyle_inconsistent_with_income: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: 0.1,
    mandatoryWhenAmountAbove: 10000,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['salary', 'savings'],
  },
  // A12 — Disclosure timing
  late_disclosure_after_challenge: {
    defaultTreatment: 'discretionary_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium', 'low'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: [],
  },
  // A1 — Purchaser count / co-borrower contradiction
  purchaser_count_contradiction: {
    defaultTreatment: 'blocker_pending_explanation',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['identity', 'co_buyer'],
  },
  // B3 — Gift declared vs denied (PIF says no gift but Armalytix evidence shows gift-shaped funds)
  gift_declared_vs_denied: {
    defaultTreatment: 'blocker_pending_explanation',
    blockerWhenSeverity: ['critical', 'high'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: true,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['gift', 'third_party'],
  },
  // C5 — Employment status contradiction (declared salary but evidence indicates self-employment)
  employment_status_contradiction: {
    defaultTreatment: 'mandatory_enquiry',
    blockerWhenSeverity: ['critical'],
    mandatoryWhenSeverity: ['critical', 'high'],
    mandatoryWhenProportionAbove: null,
    mandatoryWhenAmountAbove: null,
    discretionaryWhenSeverity: ['medium'],
    noteOnlyWhenSeverity: ['low'],
    affectsAmountToProve: false,
    requiresReviewerConfirmation: true,
    canBeOverridden: true,
    overrideRequiresReason: true,
    fundsCategoryRelevance: ['salary', 'self_employment', 'dividends'],
  },
};

// ── Treatment context ────────────────────────────────────────────

export interface TreatmentContext {
  amountToProve: number;
  issueAmount: number | null;
  proportion: number;
  hasLinkedEvidence: boolean;
  isSourceReconciled: boolean;
  isFullyReconciled: boolean;
  overrides: ReviewerOverrideRecord[];
}

// ── Classified issue ─────────────────────────────────────────────

export interface ClassifiedIssue {
  exception: ExceptionItem;
  treatment: IssueTreatment;
  isBlocker: boolean;
  blockerReason: string | null;
  enquiryRequirement: 'mandatory' | 'discretionary' | 'none';
  reviewerOverrideRequired: boolean;
  policyBasis: string;
}

// ── Treatment classification ─────────────────────────────────────

function parseSeverityLevel(sev: string): number {
  const map: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return map[sev] ?? 3;
}

export function classifyIssueTreatment(
  exception: ExceptionItem,
  policy: IssuePolicyRule,
  context: TreatmentContext
): ClassifiedIssue {
  const sev = exception.severity;

  // Check if an active override exists
  const activeOverride = context.overrides.find(
    (o) => o.issueRef === `${exception.exceptionType}::${exception.linkedRefTable}::${exception.linkedRefId}`
  );
  if (activeOverride) {
    return {
      exception,
      treatment: activeOverride.newTreatment,
      isBlocker: activeOverride.newTreatment === 'blocker_pending_evidence' ||
                 activeOverride.newTreatment === 'blocker_pending_explanation',
      blockerReason: null,
      enquiryRequirement: activeOverride.newTreatment === 'mandatory_enquiry' ? 'mandatory'
        : activeOverride.newTreatment === 'discretionary_enquiry' ? 'discretionary' : 'none',
      reviewerOverrideRequired: false,
      policyBasis: `Reviewer override applied: ${activeOverride.decision} — "${activeOverride.reason}"`,
    };
  }

  // If evidence exists and source is reconciled, downgrade to confirmation
  if (context.hasLinkedEvidence && context.isSourceReconciled) {
    return {
      exception,
      treatment: 'accepted_subject_to_confirmation',
      isBlocker: false,
      blockerReason: null,
      enquiryRequirement: 'none',
      reviewerOverrideRequired: policy.requiresReviewerConfirmation,
      policyBasis: 'Issue has linked evidence and source is reconciled — accepted subject to reviewer confirmation.',
    };
  }

  // Check blocker status
  const isBlockerSeverity = (policy.blockerWhenSeverity as string[]).includes(sev);
  const isBlockerByDefault = policy.defaultTreatment === 'blocker_pending_evidence' ||
                              policy.defaultTreatment === 'blocker_pending_explanation';

  // Check mandatory thresholds
  const isMandatorySeverity = (policy.mandatoryWhenSeverity as string[]).includes(sev);
  const isMandatoryByProportion = policy.mandatoryWhenProportionAbove !== null &&
    context.proportion > policy.mandatoryWhenProportionAbove;
  const isMandatoryByAmount = policy.mandatoryWhenAmountAbove !== null &&
    context.issueAmount !== null && context.issueAmount >= policy.mandatoryWhenAmountAbove;
  const isMandatory = isMandatorySeverity || isMandatoryByProportion || isMandatoryByAmount;

  // Check discretionary
  const isDiscretionary = (policy.discretionaryWhenSeverity as string[]).includes(sev);
  const isNoteOnly = (policy.noteOnlyWhenSeverity as string[]).includes(sev);

  // Derive treatment
  let treatment: IssueTreatment;
  let isBlocker = false;
  let blockerReason: string | null = null;
  const basisParts: string[] = [];

  if (isBlockerSeverity || (isBlockerByDefault && parseSeverityLevel(sev) <= 1)) {
    // Blocker
    isBlocker = true;
    treatment = policy.defaultTreatment === 'blocker_pending_explanation'
      ? 'blocker_pending_explanation'
      : 'blocker_pending_evidence';
    blockerReason = `${ISSUE_TYPE_LABELS[exception.exceptionType] ?? exception.exceptionType} (${sev} severity) — must be resolved before source of funds sign-off.`;
    basisParts.push(`Severity level (${sev}) triggers blocking treatment under policy`);
    if (isBlockerByDefault) basisParts.push(`Default treatment is ${policy.defaultTreatment}`);
  } else if (isMandatory) {
    treatment = 'mandatory_enquiry';
    if (isMandatorySeverity) basisParts.push(`Severity level (${sev}) requires mandatory enquiry under policy`);
    if (isMandatoryByProportion) basisParts.push(`Proportion of funds (${(context.proportion * 100).toFixed(1)}%) exceeds the ${(policy.mandatoryWhenProportionAbove! * 100).toFixed(0)}% policy threshold`);
    if (isMandatoryByAmount) basisParts.push(`Amount (£${context.issueAmount?.toLocaleString()}) exceeds the £${policy.mandatoryWhenAmountAbove?.toLocaleString()} policy threshold`);
  } else if (isDiscretionary) {
    treatment = 'discretionary_enquiry';
    basisParts.push(`Severity level (${sev}) is treated as discretionary under policy`);
  } else if (isNoteOnly) {
    treatment = 'note_only';
    basisParts.push(`Severity level (${sev}) is treated as note-only under policy`);
  } else {
    treatment = 'non_blocking_unresolved';
    basisParts.push(`No specific policy threshold met — classified as non-blocking unresolved`);
  }

  // Derive enquiry requirement
  let enquiryRequirement: 'mandatory' | 'discretionary' | 'none';
  if (treatment === 'mandatory_enquiry' || treatment === 'blocker_pending_evidence' || treatment === 'blocker_pending_explanation') {
    enquiryRequirement = 'mandatory';
  } else if (treatment === 'discretionary_enquiry') {
    enquiryRequirement = 'discretionary';
  } else {
    enquiryRequirement = 'none';
  }

  return {
    exception,
    treatment,
    isBlocker,
    blockerReason,
    enquiryRequirement,
    reviewerOverrideRequired: isBlocker || policy.requiresReviewerConfirmation,
    policyBasis: basisParts.join('; ') + '.',
  };
}

// ── Governance output ────────────────────────────────────────────

export interface GovernanceOutput {
  blockerStatus: 'blocked' | 'conditional' | 'clear';
  blockerReasonList: string[];
  mandatoryEnquiryReasonList: string[];
  discretionaryFollowupReasonList: string[];
  unresolvedNonblockingReasonList: string[];
  reviewerOverrideRequired: boolean;
  classifiedIssues: ClassifiedIssue[];
}

function buildTreatmentContext(
  exception: ExceptionItem,
  fundingChain: FundingChainSummary,
  reconciliations: SourceReconciliation[],
  overrides: ReviewerOverrideRecord[]
): TreatmentContext {
  const amountToProve = fundingChain.amountToProve || 1;
  const issueAmountStr = exception.quantitativeBasis?.match(/£([\d,.]+)/)?.[1];
  const issueAmount = issueAmountStr ? parseFloat(issueAmountStr.replace(/,/g, '')) : null;
  const proportion = issueAmount !== null ? issueAmount / amountToProve : 0;

  // Find linked reconciliation
  const linkedRecon = reconciliations.find((r) => r.fundSourceId === exception.linkedRefId);
  const hasLinkedEvidence = linkedRecon ? linkedRecon.linkedEvidenceCount > 0 : false;
  const isSourceReconciled = linkedRecon
    ? linkedRecon.reconciliationStatus === 'fully_reconciled' || linkedRecon.reconciliationStatus === 'partially_reconciled'
    : false;
  const isFullyReconciled = fundingChain.sourceReconciliations.every(
    (r) => r.reconciliationStatus === 'fully_reconciled'
  );

  return {
    amountToProve,
    issueAmount,
    proportion,
    hasLinkedEvidence,
    isSourceReconciled,
    isFullyReconciled,
    overrides,
  };
}

export function buildGovernanceOutput(
  exceptions: ExceptionItem[],
  fundingChain: FundingChainSummary,
  _enquiries: DraftEnquiry[],
  reconciliations: SourceReconciliation[],
  overrides: ReviewerOverrideRecord[] = []
): GovernanceOutput {
  const classifiedIssues: ClassifiedIssue[] = [];

  for (const exception of exceptions) {
    const policy = ISSUE_POLICY_MATRIX[exception.exceptionType];
    if (!policy) continue;
    const context = buildTreatmentContext(exception, fundingChain, reconciliations, overrides);
    classifiedIssues.push(classifyIssueTreatment(exception, policy, context));
  }

  const blockers = classifiedIssues.filter((i) => i.isBlocker);
  const mandatoryItems = classifiedIssues.filter((i) => i.enquiryRequirement === 'mandatory' && !i.isBlocker);
  const discretionaryItems = classifiedIssues.filter((i) => i.enquiryRequirement === 'discretionary');
  const unresolvedNonblocking = classifiedIssues.filter(
    (i) => i.treatment === 'non_blocking_unresolved' || i.treatment === 'accepted_subject_to_confirmation'
  );

  let blockerStatus: 'blocked' | 'conditional' | 'clear';
  if (blockers.length > 0) {
    blockerStatus = 'blocked';
  } else if (mandatoryItems.length > 0) {
    blockerStatus = 'conditional';
  } else {
    blockerStatus = 'clear';
  }

  return {
    blockerStatus,
    blockerReasonList: blockers.map((b) => b.blockerReason ?? b.exception.rationale),
    mandatoryEnquiryReasonList: mandatoryItems.map((m) => m.exception.rationale),
    discretionaryFollowupReasonList: discretionaryItems.map((d) => d.exception.rationale),
    unresolvedNonblockingReasonList: unresolvedNonblocking.map((u) => u.exception.rationale),
    reviewerOverrideRequired: classifiedIssues.some((i) => i.reviewerOverrideRequired),
    classifiedIssues,
  };
}

// ── Reviewer override / resolution controls ──────────────────────

export type ReviewerDecision =
  | 'accept_resolved'
  | 'keep_enquiry'
  | 'suppress_enquiry'
  | 'downgrade_severity'
  | 'upgrade_severity'
  | 'mark_non_blocking'
  | 'override_blocker'
  | 'escalate_enhanced_review';

export interface ReviewerOverrideRecord {
  issueRef: string;
  exceptionType: ExceptionType;
  decision: ReviewerDecision;
  previousTreatment: IssueTreatment;
  newTreatment: IssueTreatment;
  reason: string;
  reviewerName: string | null;
  reviewerSraId: string | null;
  timestamp: string;
  linkedEnquiryId: string | null;
  linkedEvidenceIds: string[];
}

/** Map a reviewer decision to the resulting treatment */
const DECISION_TREATMENT_MAP: Record<ReviewerDecision, IssueTreatment> = {
  accept_resolved: 'resolved',
  keep_enquiry: 'mandatory_enquiry',
  suppress_enquiry: 'note_only',
  downgrade_severity: 'discretionary_enquiry',
  upgrade_severity: 'mandatory_enquiry',
  mark_non_blocking: 'non_blocking_unresolved',
  override_blocker: 'accepted_subject_to_confirmation',
  escalate_enhanced_review: 'blocker_pending_explanation',
};

export function resolveNewTreatment(decision: ReviewerDecision): IssueTreatment {
  return DECISION_TREATMENT_MAP[decision];
}

export function deriveAvailableDecisions(issue: ClassifiedIssue): ReviewerDecision[] {
  const policy = ISSUE_POLICY_MATRIX[issue.exception.exceptionType];
  const decisions: ReviewerDecision[] = [];

  // Always available
  decisions.push('keep_enquiry');
  decisions.push('escalate_enhanced_review');

  if (policy?.canBeOverridden) {
    decisions.push('accept_resolved');
    decisions.push('suppress_enquiry');
    decisions.push('downgrade_severity');
    decisions.push('upgrade_severity');
    decisions.push('mark_non_blocking');
  }

  if (issue.isBlocker && policy?.canBeOverridden) {
    decisions.push('override_blocker');
  }

  return decisions;
}

// ── Sign-off decision support ────────────────────────────────────

export type SignOffPosition =
  | 'adequately_explained'
  | 'partly_explained_followup_needed'
  | 'not_adequately_explained'
  | 'blocked_pending_evidence'
  | 'blocked_pending_explanation'
  | 'enhanced_review_recommended'
  | 'conditional_progression';

export interface SignOffDecisionSupport {
  position: SignOffPosition;
  positionBasis: string;
  blockerCount: number;
  mandatoryEnquiryCount: number;
  discretionaryFollowupCount: number;
  unresolvedNonblockingCount: number;
  overrideCount: number;
  canProgressConditionally: boolean;
  conditionalProgressionReasons: string[];
  reviewerAttentionItems: ClassifiedIssue[];
}

export function buildSignOffDecisionSupport(
  governance: GovernanceOutput,
  fundsPosition: FundsPositionStatus,
  fundingChain: FundingChainSummary
): SignOffDecisionSupport {
  const blockerCount = governance.blockerReasonList.length;
  const mandatoryCount = governance.mandatoryEnquiryReasonList.length;
  const discretionaryCount = governance.discretionaryFollowupReasonList.length;
  const unresolvedCount = governance.unresolvedNonblockingReasonList.length;
  const overrideCount = governance.classifiedIssues.filter(
    (i) => i.treatment === 'overridden_by_reviewer' || i.treatment === 'resolved'
  ).length;

  const hasEscalation = governance.classifiedIssues.some(
    (i) => i.treatment === 'blocker_pending_explanation'
  );

  // Determine sign-off position
  let position: SignOffPosition;
  const basisParts: string[] = [];

  if (hasEscalation) {
    position = 'enhanced_review_recommended';
    basisParts.push('One or more issues have been escalated for enhanced review');
  } else if (blockerCount > 0) {
    // Distinguish evidence vs explanation blockers
    const evidenceBlockers = governance.classifiedIssues.filter(
      (i) => i.treatment === 'blocker_pending_evidence'
    );
    const explanationBlockers = governance.classifiedIssues.filter(
      (i) => i.treatment === 'blocker_pending_explanation'
    );
    if (evidenceBlockers.length > 0 && explanationBlockers.length === 0) {
      position = 'blocked_pending_evidence';
      basisParts.push(`${evidenceBlockers.length} outstanding issue(s) require supporting evidence before sign-off`);
    } else if (explanationBlockers.length > 0) {
      position = 'blocked_pending_explanation';
      basisParts.push(`${explanationBlockers.length} outstanding issue(s) require explanation before sign-off`);
    } else {
      position = 'blocked_pending_evidence';
      basisParts.push(`${blockerCount} blocking issue(s) must be resolved before sign-off`);
    }
  } else if (fundsPosition === 'insufficiently_evidenced' || fundsPosition === 'contradicted') {
    position = 'not_adequately_explained';
    basisParts.push(`The funds position is currently assessed as ${fundsPosition === 'contradicted' ? 'contradicted by evidence' : 'insufficiently evidenced'}`);
  } else if (mandatoryCount > 0) {
    position = 'conditional_progression';
    basisParts.push(`${mandatoryCount} mandatory enquir${mandatoryCount === 1 ? 'y remains' : 'ies remain'} outstanding`);
  } else if (fundsPosition === 'partially_evidenced' || discretionaryCount > 0 || unresolvedCount > 0) {
    position = 'partly_explained_followup_needed';
    if (fundsPosition === 'partially_evidenced') basisParts.push('Funds are only partially evidenced');
    if (discretionaryCount > 0) basisParts.push(`${discretionaryCount} discretionary follow-up item(s) identified`);
    if (unresolvedCount > 0) basisParts.push(`${unresolvedCount} non-blocking item(s) remain unresolved`);
  } else {
    position = 'adequately_explained';
    basisParts.push('All issues resolved or below threshold; the source of funds position is adequate');
  }

  // Conditional progression check
  const canProgressConditionally = position === 'conditional_progression' && blockerCount === 0;
  const conditionalProgressionReasons = canProgressConditionally
    ? governance.mandatoryEnquiryReasonList.map((r) => `Outstanding enquiry: ${r.length > 140 ? r.substring(0, 137) + '…' : r}`)
    : [];

  // Attention items: blockers + mandatory + any requiring override
  const reviewerAttentionItems = governance.classifiedIssues.filter(
    (i) => i.isBlocker || i.enquiryRequirement === 'mandatory' || i.reviewerOverrideRequired
  );

  return {
    position,
    positionBasis: basisParts.join('; ') + '.',
    blockerCount,
    mandatoryEnquiryCount: mandatoryCount,
    discretionaryFollowupCount: discretionaryCount,
    unresolvedNonblockingCount: unresolvedCount,
    overrideCount,
    canProgressConditionally,
    conditionalProgressionReasons,
    reviewerAttentionItems,
  };
}
