/**
 * Decision Support Engine
 *
 * Produces structured decision-support outputs from reviewer summary,
 * funding chain, exceptions ledger and draft enquiries.
 *
 * Decision-support ONLY — does not auto-approve, auto-clear, or auto-reject.
 *
 * Pure functions — no DB calls.
 */

import type { DraftEnquiry } from './enquiryGenerator';
import type { ReviewerSummary } from './reviewerOutputBuilder';
import type { FundingChainSummary } from './reconciliationEngine';
import type { ExceptionsLedger } from './exceptionEngine';
import {
  buildGovernanceOutput,
  buildSignOffDecisionSupport,
  type GovernanceOutput,
  type SignOffDecisionSupport,
  type ReviewerOverrideRecord,
} from './reviewerPolicyEngine';

// ── Types ────────────────────────────────────────────────────────

export type ReviewStatus =
  | 'not_started'
  | 'in_progress'
  | 'enquiries_pending'
  | 'pending_reviewer'
  | 'clearance_possible'
  | 'blocked';

export type FundsPositionStatus =
  | 'fully_evidenced'
  | 'substantially_evidenced'
  | 'partially_evidenced'
  | 'insufficiently_evidenced'
  | 'contradicted';

export interface ClearanceBlocker {
  reason: string;
  severity: string;
  linkedRef: string;
}

export interface SourceSummaryItem {
  category: string;
  amount: number;
  status: string;
}

export interface EvidenceGap {
  gapType: string;
  description: string;
  amount: number | null;
}

export interface DecisionSupportOutput {
  overallReviewStatus: ReviewStatus;
  fundsPositionStatus: FundsPositionStatus;
  keyUnresolvedIssuesCount: number;
  highSeverityIssuesCount: number;
  mandatoryEnquiriesCount: number;
  discretionaryEnquiriesCount: number;
  reviewerAttentionRequired: boolean;
  potentialClearanceBlockers: ClearanceBlocker[];
  supportedSourcesSummary: SourceSummaryItem[];
  unsupportedSourcesSummary: SourceSummaryItem[];
  unexplainedFundsSummary: { totalAmount: number; transactionCount: number };
  evidenceGapSummary: EvidenceGap[];
  /** Placeholder: future final narrative summary */
  caseSummaryHook: null;
  /** Placeholder: future auto-clearance logic */
  approvalDecisionHook: null;
  /** Policy-driven governance output */
  governance: GovernanceOutput;
  /** Sign-off decision support */
  signOff: SignOffDecisionSupport;
}

// ── Derive review status ─────────────────────────────────────────

function deriveReviewStatus(
  governance: GovernanceOutput,
  mandatoryCount: number,
  unresolvedCount: number,
  fundsPosition: FundsPositionStatus
): ReviewStatus {
  if (governance.blockerStatus === 'blocked') return 'blocked';
  if (mandatoryCount > 0) return 'enquiries_pending';
  if (unresolvedCount > 0) return 'pending_reviewer';
  if (fundsPosition === 'fully_evidenced' || fundsPosition === 'substantially_evidenced') {
    return 'clearance_possible';
  }
  return 'pending_reviewer';
}

// ── Derive funds position ────────────────────────────────────────

function deriveFundsPosition(fundingChain: FundingChainSummary): FundsPositionStatus {
  const { amountToProve, totalEvidencedFunds, totalDeclaredNotEvidenced } = fundingChain;

  // Check for contradictions
  const hasContradiction = fundingChain.sourceReconciliations.some(
    (r) => r.reconciliationStatus === 'contradicted'
  );
  if (hasContradiction) return 'contradicted';

  if (amountToProve <= 0) return 'insufficiently_evidenced';

  const ratio = totalEvidencedFunds / amountToProve;
  if (ratio >= 0.95 && totalDeclaredNotEvidenced === 0) return 'fully_evidenced';
  if (ratio >= 0.8) return 'substantially_evidenced';
  if (ratio >= 0.4) return 'partially_evidenced';
  return 'insufficiently_evidenced';
}

// ── Build clearance blockers (from governance) ───────────────────

function buildClearanceBlockersFromGovernance(governance: GovernanceOutput): ClearanceBlocker[] {
  return governance.classifiedIssues
    .filter((i) => i.isBlocker)
    .map((i) => ({
      reason: i.blockerReason ?? i.exception.rationale,
      severity: i.exception.severity,
      linkedRef: `${i.exception.exceptionType}::${i.exception.linkedRefTable}::${i.exception.linkedRefId}`,
    }));
}

// ── Build evidence gaps ──────────────────────────────────────────

function buildEvidenceGaps(
  fundingChain: FundingChainSummary,
  exceptionsLedger: ExceptionsLedger
): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];

  if (fundingChain.totalDeclaredNotEvidenced > 0) {
    gaps.push({
      gapType: 'declared_not_evidenced',
      description: 'Declared sources without sufficient supporting evidence',
      amount: fundingChain.totalDeclaredNotEvidenced,
    });
  }

  if (fundingChain.unsupportedManualBalances > 0) {
    gaps.push({
      gapType: 'manual_balance_unevidenced',
      description: 'Manual balances relied upon but not verified',
      amount: fundingChain.unsupportedManualBalances,
    });
  }

  if (fundingChain.giftsUnproven > 0) {
    gaps.push({
      gapType: 'gift_evidence_incomplete',
      description: 'Gift declarations without complete evidence package',
      amount: fundingChain.giftsUnproven,
    });
  }

  if (fundingChain.coBuyerUnproven > 0) {
    gaps.push({
      gapType: 'cobuyer_evidence_missing',
      description: 'Co-buyer contributions without source of funds evidence',
      amount: fundingChain.coBuyerUnproven,
    });
  }

  if (fundingChain.totalUnexplainedIncoming > 0) {
    gaps.push({
      gapType: 'unexplained_incoming',
      description: 'Incoming credits not linked to any declared source',
      amount: fundingChain.totalUnexplainedIncoming,
    });
  }

  // Count specific exception types for additional gaps
  const salaryGaps = exceptionsLedger.high.filter(
    (e) => e.exceptionType === 'salary_savings_unsupported'
  );
  if (salaryGaps.length > 0) {
    gaps.push({
      gapType: 'salary_accumulation_unsupported',
      description: 'Salary savings claims not supported by income pattern',
      amount: null,
    });
  }

  return gaps;
}

// ── Source summaries ─────────────────────────────────────────────

function buildSourceSummaries(fundingChain: FundingChainSummary): {
  supported: SourceSummaryItem[];
  unsupported: SourceSummaryItem[];
} {
  const supported: SourceSummaryItem[] = [];
  const unsupported: SourceSummaryItem[] = [];

  for (const r of fundingChain.sourceReconciliations) {
    if (r.supportedAmount > 0) {
      supported.push({
        category: r.sourceCategory,
        amount: r.supportedAmount,
        status: r.reconciliationStatus,
      });
    }
    if (r.unsupportedAmount > 0) {
      unsupported.push({
        category: r.sourceCategory,
        amount: r.unsupportedAmount,
        status: r.mismatchReasons[0] ?? 'Insufficient evidence',
      });
    }
  }

  return { supported, unsupported };
}

// ── Flatten all exceptions from ledger ───────────────────────────

function flattenLedger(ledger: ExceptionsLedger) {
  return [...ledger.critical, ...ledger.high, ...ledger.medium, ...ledger.low];
}

// ── Main builder ─────────────────────────────────────────────────

export function buildDecisionSupport(
  reviewerSummary: ReviewerSummary,
  fundingChain: FundingChainSummary,
  exceptionsLedger: ExceptionsLedger,
  draftEnquiries: DraftEnquiry[],
  overrides: ReviewerOverrideRecord[] = []
): DecisionSupportOutput {
  const fundsPositionStatus = deriveFundsPosition(fundingChain);

  // Build governance output from policy engine
  const allExceptions = flattenLedger(exceptionsLedger);
  const governance = buildGovernanceOutput(
    allExceptions,
    fundingChain,
    draftEnquiries,
    fundingChain.sourceReconciliations,
    overrides
  );

  // Build sign-off decision support
  const signOff = buildSignOffDecisionSupport(governance, fundsPositionStatus, fundingChain);

  // Derive blockers from governance (policy-driven)
  const blockers = buildClearanceBlockersFromGovernance(governance);

  const mandatoryEnquiries = draftEnquiries.filter((e) => e.mandatory === 'mandatory');
  const discretionaryEnquiries = draftEnquiries.filter((e) => e.mandatory === 'discretionary');

  const highSeverityCount = exceptionsLedger.critical.length + exceptionsLedger.high.length;

  const overallReviewStatus = deriveReviewStatus(
    governance,
    mandatoryEnquiries.length,
    reviewerSummary.unresolvedCount,
    fundsPositionStatus
  );

  const { supported, unsupported } = buildSourceSummaries(fundingChain);
  const evidenceGaps = buildEvidenceGaps(fundingChain, exceptionsLedger);

  // Count unmatched incoming transactions from unresolved items
  const unmatchedIncoming = reviewerSummary.unresolved.filter(
    (u) => u.issueType === 'unmatched_transaction' || u.issueType === 'undeclared_incoming_credit'
  );

  return {
    overallReviewStatus,
    fundsPositionStatus,
    keyUnresolvedIssuesCount: reviewerSummary.unresolvedCount,
    highSeverityIssuesCount: highSeverityCount,
    mandatoryEnquiriesCount: mandatoryEnquiries.length,
    discretionaryEnquiriesCount: discretionaryEnquiries.length,
    reviewerAttentionRequired:
      overallReviewStatus === 'blocked' ||
      overallReviewStatus === 'enquiries_pending' ||
      overallReviewStatus === 'pending_reviewer',
    potentialClearanceBlockers: blockers,
    supportedSourcesSummary: supported,
    unsupportedSourcesSummary: unsupported,
    unexplainedFundsSummary: {
      totalAmount: fundingChain.totalUnexplainedIncoming,
      transactionCount: unmatchedIncoming.length,
    },
    evidenceGapSummary: evidenceGaps,
    caseSummaryHook: null,
    approvalDecisionHook: null,
    governance,
    signOff,
  };
}
