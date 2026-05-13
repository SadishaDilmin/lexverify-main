/**
 * Reviewer Output Builder
 *
 * Builds reviewer-facing structured summaries: accepted items,
 * unresolved items, action queue, and exceptions ledger view.
 *
 * Pure functions — no DB calls.
 */

import type { DraftEnquiry } from './enquiryGenerator';
import type { ExceptionItem, ExceptionsLedger } from './exceptionEngine';
import type { SourceReconciliation, FundingChainSummary } from './reconciliationEngine';
import type { ClassifiedTransaction } from './transactionClassifier';

// ── Types ────────────────────────────────────────────────────────

export interface AcceptedItem {
  refTable: string;
  refId: string;
  label: string;
  amount: number | null;
  basis: string;
  confidenceOfMatch: string;
  linkedEvidenceCount: number;
}

export interface UnresolvedItem {
  refTable: string;
  refId: string;
  label: string;
  amount: number | null;
  issueType: string;
  severity: string;
  linkedEnquiryId: string | null;
}

export type ReviewerAction =
  | 'confirm'
  | 'reject'
  | 'edit_enquiry'
  | 'suppress_enquiry'
  | 'mark_resolved'
  | 'request_evidence'
  | 'escalate';

export interface ReviewerActionItem {
  issueRef: string;
  availableActions: ReviewerAction[];
  currentStatus: string;
  suggestedAction: ReviewerAction;
}

export interface ReviewerSummary {
  accepted: AcceptedItem[];
  unresolved: UnresolvedItem[];
  draftEnquiries: DraftEnquiry[];
  actionQueue: ReviewerActionItem[];
  acceptedCount: number;
  unresolvedCount: number;
  enquiryCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatSourceCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bCo /i, 'Co-');
}

// ── Accepted items ───────────────────────────────────────────────

export function buildAcceptedItems(
  reconciliations: SourceReconciliation[],
  fundingChain: FundingChainSummary
): AcceptedItem[] {
  const accepted: AcceptedItem[] = [];

  for (const r of reconciliations) {
    if (
      (r.reconciliationStatus === 'fully_reconciled' || r.reconciliationStatus === 'partially_reconciled') &&
      r.confidenceOfMatch !== 'none' &&
      r.confidenceOfMatch !== 'low'
    ) {
      accepted.push({
        refTable: 'sow_fund_sources',
        refId: r.fundSourceId,
        label: `${formatSourceCategory(r.sourceCategory)}: £${r.supportedAmount.toLocaleString()} verified against £${r.declaredAmount.toLocaleString()} declared`,
        amount: r.supportedAmount,
        basis: r.reconciliationStatus === 'fully_reconciled'
          ? `Fully reconciled — ${r.linkedTransactionsCount} matching transaction(s), ${r.linkedEvidenceCount} evidence item(s)`
          : `Partially reconciled — ${r.linkedTransactionsCount} transaction(s) matched, ${r.linkedEvidenceCount} evidence item(s) linked`,
        confidenceOfMatch: r.confidenceOfMatch,
        linkedEvidenceCount: r.linkedEvidenceCount,
      });
    }
  }

  return accepted;
}

// ── Unresolved items ─────────────────────────────────────────────

export function buildUnresolvedItems(
  exceptions: ExceptionItem[],
  reconciliations: SourceReconciliation[],
  unmatchedTxIds: string[],
  classifiedTxs: ClassifiedTransaction[],
  draftEnquiries: DraftEnquiry[]
): UnresolvedItem[] {
  const unresolved: UnresolvedItem[] = [];

  // From exceptions
  for (const e of exceptions) {
    const linkedEnquiry = draftEnquiries.find(
      (enq) => enq.linkedExceptionRef === `${e.exceptionType}::${e.linkedRefTable}::${e.linkedRefId}`
    );

    unresolved.push({
      refTable: e.linkedRefTable,
      refId: e.linkedRefId,
      label: e.rationale,
      amount: e.quantitativeBasis
        ? parseFloat((e.quantitativeBasis.match(/£([\d,]+(?:\.\d+)?)/) ?? [])[1]?.replace(/,/g, '') ?? '0') || null
        : null,
      issueType: e.exceptionType,
      severity: e.severity,
      linkedEnquiryId: linkedEnquiry?.id ?? null,
    });
  }

  // Unmatched incoming transactions not already covered by exceptions
  const exceptionTxIds = new Set(
    exceptions
      .filter((e) => e.linkedRefTable === 'sow_transactions')
      .map((e) => e.linkedRefId)
  );

  for (const txId of unmatchedTxIds) {
    if (exceptionTxIds.has(txId)) continue;
    const tx = classifiedTxs.find((t) => t.id === txId);
    if (!tx || tx.direction !== 'incoming' || (tx.amount ?? 0) < 500) continue;

    unresolved.push({
      refTable: 'sow_transactions',
      refId: txId,
      label: `Incoming credit of £${(tx.amount ?? 0).toLocaleString()} on ${tx.tx_date ?? 'date unknown'} — not attributed to a declared source`,
      amount: tx.amount ?? null,
      issueType: 'unmatched_transaction',
      severity: (tx.amount ?? 0) >= 5000 ? 'high' : 'medium',
      linkedEnquiryId: null,
    });
  }

  // Unreconciled sources not already covered by exceptions
  const exceptionSourceIds = new Set(
    exceptions
      .filter((e) => e.linkedRefTable === 'sow_fund_sources')
      .map((e) => e.linkedRefId)
  );

  for (const r of reconciliations) {
    if (r.reconciliationStatus === 'unreconciled' && !exceptionSourceIds.has(r.fundSourceId)) {
      unresolved.push({
        refTable: 'sow_fund_sources',
        refId: r.fundSourceId,
        label: `Declared source "${formatSourceCategory(r.sourceCategory)}" (£${r.declaredAmount.toLocaleString()}) — no supporting bank transactions identified`,
        amount: r.declaredAmount,
        issueType: 'unreconciled_source',
        severity: 'high',
        linkedEnquiryId: null,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return unresolved.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));
}

// ── Action queue ─────────────────────────────────────────────────

export function buildActionQueue(
  exceptions: ExceptionItem[],
  enquiries: DraftEnquiry[]
): ReviewerActionItem[] {
  const actions: ReviewerActionItem[] = [];

  for (const e of exceptions) {
    const issueRef = `${e.exceptionType}::${e.linkedRefTable}::${e.linkedRefId}`;
    const hasEnquiry = enquiries.some((enq) => enq.linkedExceptionRef === issueRef);

    const availableActions: ReviewerAction[] = ['mark_resolved', 'escalate'];
    let suggestedAction: ReviewerAction = 'confirm';

    if (hasEnquiry) {
      availableActions.push('edit_enquiry', 'suppress_enquiry', 'confirm');
      suggestedAction = e.reviewerConfirmationRequired ? 'confirm' : 'edit_enquiry';
    } else {
      availableActions.push('request_evidence', 'confirm');
      suggestedAction = 'request_evidence';
    }

    if (e.severity === 'critical' || e.severity === 'high') {
      availableActions.push('reject');
    }

    actions.push({
      issueRef,
      availableActions: [...new Set(availableActions)],
      currentStatus: hasEnquiry ? 'enquiry_drafted' : 'pending_review',
      suggestedAction,
    });
  }

  return actions;
}

// ── Main builder ─────────────────────────────────────────────────

export interface ReviewerSummaryInputs {
  reconciliations: SourceReconciliation[];
  fundingChain: FundingChainSummary;
  exceptions: ExceptionItem[];
  unmatchedTxIds: string[];
  classifiedTransactions: ClassifiedTransaction[];
  draftEnquiries: DraftEnquiry[];
}

export function buildReviewerSummary(inputs: ReviewerSummaryInputs): ReviewerSummary {
  const accepted = buildAcceptedItems(inputs.reconciliations, inputs.fundingChain);
  const unresolved = buildUnresolvedItems(
    inputs.exceptions,
    inputs.reconciliations,
    inputs.unmatchedTxIds,
    inputs.classifiedTransactions,
    inputs.draftEnquiries
  );
  const actionQueue = buildActionQueue(inputs.exceptions, inputs.draftEnquiries);

  return {
    accepted,
    unresolved,
    draftEnquiries: inputs.draftEnquiries,
    actionQueue,
    acceptedCount: accepted.length,
    unresolvedCount: unresolved.length,
    enquiryCount: inputs.draftEnquiries.length,
  };
}
