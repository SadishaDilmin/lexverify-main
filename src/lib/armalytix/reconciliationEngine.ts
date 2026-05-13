/**
 * Source-of-Funds Reconciliation Engine — Layer 2
 *
 * Per-source reconciliation + matter-level funding chain summary.
 * Pure functions — no DB calls.
 */

import type { MatchCandidate } from './transactionMatcher';
import type { ClassifiedTransaction } from './transactionClassifier';

// ── Input stubs ──────────────────────────────────────────────────

interface FundSourceInput {
  id: string;
  case_id: string;
  source_category?: string | null;
  declared_amount?: number | null;
  date_received?: string | null;
  employer_name?: string | null;
  verification_status?: string | null;
  outside_uk?: boolean | null;
  income_explains_savings?: boolean | null;
  years_to_accumulate?: number | null;
}

interface ManualBalanceInput {
  id: string;
  case_id: string;
  amount?: number | null;
  evidence_status?: string | null;
  counted_toward_proof?: boolean | null;
  attachment_name?: string | null;
}

interface EvidenceInput {
  id: string;
  ref_table: string;
  ref_id: string;
  verification_status?: string | null;
}

interface IncomeVerificationInput {
  id: string;
  avg_salary_credit?: number | null;
  salary_matched_to_bank?: boolean | null;
  net_pay_on_payslip?: number | null;
}

interface PartyInput {
  id: string;
  case_id: string;
  role?: string | null;
  full_name?: string | null;
  contribution_amount?: number | null;
}

interface ReportHeaderInput {
  mortgage_amount?: number | null;
  mortgage_lender?: string | null;
  mortgage_offer_in_place?: boolean | null;
  amount_to_prove?: number | null;
  purchase_price?: number | null;
  total_balance_available?: number | null;
  excess_shortfall?: number | null;
}

// ── Output types ─────────────────────────────────────────────────

export type ReconciliationConfidence = 'high' | 'medium' | 'low' | 'none';
export type ReconciliationStatus =
  | 'fully_reconciled'
  | 'partially_reconciled'
  | 'unreconciled'
  | 'contradicted'
  | 'pending_review';

export interface SourceReconciliation {
  fundSourceId: string;
  sourceCategory: string;
  declaredAmount: number;
  supportedAmount: number;
  unsupportedAmount: number;
  unexplainedAmount: number;
  confidenceOfMatch: ReconciliationConfidence;
  reconciliationStatus: ReconciliationStatus;
  linkedTransactionsCount: number;
  linkedBalancesCount: number;
  linkedEvidenceCount: number;
  mismatchReasons: string[];
  requiresReviewerAttention: boolean;
  suggestedActions: string[];
  /** True if circular movement detected for this source */
  circularMovementDetected: boolean;
  /** True if timing of evidence does not align with declared date */
  timingMismatch: boolean;
}

export type FundingConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface FundingChainSummary {
  amountToProve: number;
  totalEvidencedFunds: number;
  totalDeclaredNotEvidenced: number;
  totalUnexplainedIncoming: number;
  supportedManualBalances: number;
  unsupportedManualBalances: number;
  coBuyerEvidenced: number;
  coBuyerUnproven: number;
  giftsEvidenced: number;
  giftsUnproven: number;
  hasShortfall: boolean;
  shortfallAmount: number;
  hasExcess: boolean;
  excessAmount: number;
  excessExplained: boolean;
  overallConfidence: FundingConfidence;
  sourceReconciliations: SourceReconciliation[];
  /** From report header — positive = excess, negative = shortfall, null = not available */
  reportHeaderExcessShortfall: number | null;
}

// ── Reconciliation inputs ────────────────────────────────────────

export interface ReconciliationInputs {
  fundSources: FundSourceInput[];
  matchedCandidates: MatchCandidate[];
  classifiedTransactions: ClassifiedTransaction[];
  manualBalances: ManualBalanceInput[];
  evidenceItems: EvidenceInput[];
  incomeVerifications: IncomeVerificationInput[];
  parties: PartyInput[];
  reportHeader: ReportHeaderInput | null;
}

// ── Helpers ──────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86_400_000;
}

function deriveConfidence(ratio: number): ReconciliationConfidence {
  if (ratio >= 0.95) return 'high';
  if (ratio >= 0.6) return 'medium';
  if (ratio > 0) return 'low';
  return 'none';
}

function deriveStatus(
  ratio: number,
  contradicted: boolean,
  hasEvidence: boolean
): ReconciliationStatus {
  if (contradicted) return 'contradicted';
  if (ratio >= 0.95) return 'fully_reconciled';
  if (ratio >= 0.3) return 'partially_reconciled';
  if (!hasEvidence) return 'unreconciled';
  return 'pending_review';
}

// ── Circular movement detection ──────────────────────────────────

function detectCircular(
  txs: ClassifiedTransaction[],
  caseId: string
): Set<string> {
  const circularIds = new Set<string>();
  const incoming = txs.filter((t) => t.case_id === caseId && t.direction === 'incoming');
  const outgoing = txs.filter((t) => t.case_id === caseId && t.direction !== 'incoming');

  for (const inc of incoming) {
    if (!inc.amount || inc.amount < 500) continue;
    for (const out of outgoing) {
      if (!out.amount) continue;
      const amtDiff = Math.abs(inc.amount - out.amount);
      if (amtDiff > inc.amount * 0.05) continue; // within 5%
      if (inc.tx_date && out.tx_date && daysBetween(inc.tx_date, out.tx_date) <= 7) {
        circularIds.add(inc.id);
        circularIds.add(out.id);
      }
    }
  }
  return circularIds;
}

// ── Per-source reconciliation ────────────────────────────────────

export function reconcileSource(
  fs: FundSourceInput,
  matchedTxs: MatchCandidate[],
  allTxs: ClassifiedTransaction[],
  manualBalances: ManualBalanceInput[],
  evidenceItems: EvidenceInput[],
  incomeVerification: IncomeVerificationInput | null,
  circularTxIds: Set<string>
): SourceReconciliation {
  const declared = fs.declared_amount ?? 0;
  const mismatchReasons: string[] = [];
  const suggestedActions: string[] = [];

  // Sum matched transaction amounts
  let txSupported = 0;
  let txCount = 0;
  for (const mc of matchedTxs) {
    if (mc.fundSourceId !== fs.id) continue;
    const tx = allTxs.find((t) => t.id === mc.transactionId);
    if (tx?.amount) {
      txSupported += tx.amount;
      txCount += 1;
    }
  }

  // Linked manual balances with evidence
  let balanceSupported = 0;
  let balanceCount = 0;
  for (const mb of manualBalances) {
    if (mb.case_id !== fs.case_id) continue;
    if (mb.counted_toward_proof && mb.evidence_status !== 'unverified' && mb.attachment_name) {
      balanceSupported += mb.amount ?? 0;
      balanceCount += 1;
    }
  }

  // Evidence items linked to this source
  const evidenceCount = evidenceItems.filter(
    (e) => e.ref_table === 'sow_fund_sources' && e.ref_id === fs.id
  ).length;

  const supportedAmount = txSupported + balanceSupported;
  const unsupportedAmount = Math.max(0, declared - supportedAmount);
  const ratio = declared > 0 ? supportedAmount / declared : 0;

  // Timing check
  let timingMismatch = false;
  if (fs.date_received) {
    const linkedTxDates = matchedTxs
      .filter((mc) => mc.fundSourceId === fs.id)
      .map((mc) => allTxs.find((t) => t.id === mc.transactionId)?.tx_date)
      .filter(Boolean) as string[];

    if (linkedTxDates.length > 0) {
      const anyClose = linkedTxDates.some((d) => daysBetween(d, fs.date_received!) <= 14);
      if (!anyClose) {
        timingMismatch = true;
        mismatchReasons.push(`Declared receipt date ${fs.date_received} but closest linked tx is >14 days away.`);
      }
    }
  }

  // Circular movement
  const circularDetected = matchedTxs.some(
    (mc) => mc.fundSourceId === fs.id && circularTxIds.has(mc.transactionId)
  );
  if (circularDetected) {
    mismatchReasons.push('Possible circular movement detected among linked transactions.');
    suggestedActions.push('ENQUIRY: Investigate potential circular fund movement.');
  }

  // Salary-specific checks
  const isSalary = fs.source_category?.toLowerCase().includes('salary');
  if (isSalary && incomeVerification) {
    if (incomeVerification.salary_matched_to_bank === false) {
      mismatchReasons.push('Salary not matched to bank credits.');
    }
    if (fs.income_explains_savings && incomeVerification.avg_salary_credit && declared > 0) {
      const years = fs.years_to_accumulate ?? 1;
      const maxPlausible = incomeVerification.avg_salary_credit * 12 * Number(years) * 0.5;
      if (declared > maxPlausible && maxPlausible > 0) {
        mismatchReasons.push(`Salary accumulation implausible: £${declared} declared vs ~£${maxPlausible.toFixed(0)} max plausible.`);
        suggestedActions.push('ENQUIRY: Request detailed savings history and explanation of accumulation.');
      }
    }
  }

  // Amount mismatch
  if (declared > 0 && unsupportedAmount > declared * 0.1) {
    mismatchReasons.push(`£${unsupportedAmount.toFixed(2)} unsupported of £${declared} declared.`);
    suggestedActions.push('ENQUIRY: Request further evidence for unsupported portion.');
  }

  const hasEvidence = evidenceCount > 0 || txCount > 0 || balanceCount > 0;
  const contradicted = fs.verification_status === 'contradicted' || circularDetected;

  return {
    fundSourceId: fs.id,
    sourceCategory: fs.source_category ?? 'unknown',
    declaredAmount: declared,
    supportedAmount,
    unsupportedAmount,
    unexplainedAmount: 0, // set at matter level for undeclared incoming
    confidenceOfMatch: deriveConfidence(ratio),
    reconciliationStatus: deriveStatus(ratio, contradicted, hasEvidence),
    linkedTransactionsCount: txCount,
    linkedBalancesCount: balanceCount,
    linkedEvidenceCount: evidenceCount,
    mismatchReasons,
    requiresReviewerAttention: unsupportedAmount > 0 || circularDetected || timingMismatch || mismatchReasons.length > 0,
    suggestedActions,
    circularMovementDetected: circularDetected,
    timingMismatch,
  };
}

// ── Reconcile all sources ────────────────────────────────────────

export function reconcileAllSources(inputs: ReconciliationInputs): SourceReconciliation[] {
  const circularTxIds = detectCircular(
    inputs.classifiedTransactions,
    inputs.fundSources[0]?.case_id ?? ''
  );

  return inputs.fundSources.map((fs) => {
    const iv = inputs.incomeVerifications[0] ?? null;
    return reconcileSource(
      fs,
      inputs.matchedCandidates,
      inputs.classifiedTransactions,
      inputs.manualBalances,
      inputs.evidenceItems,
      iv,
      circularTxIds
    );
  });
}

// ── Funding chain summary ────────────────────────────────────────

export function buildFundingChain(
  inputs: ReconciliationInputs,
  reconciliations: SourceReconciliation[]
): FundingChainSummary {
  const rh = inputs.reportHeader;
  const amountToProve = rh?.amount_to_prove ?? 0;

  let totalEvidenced = 0;
  let totalDeclaredNotEvidenced = 0;

  for (const r of reconciliations) {
    totalEvidenced += r.supportedAmount;
    totalDeclaredNotEvidenced += r.unsupportedAmount;
  }

  // Undeclared incoming (unmatched transactions)
  const unmatchedIncoming = inputs.classifiedTransactions.filter(
    (tx) =>
      tx.direction === 'incoming' &&
      !tx.linked_fund_source_id &&
      tx.explanation_status !== 'mapped' &&
      tx.explanation_status !== 'not_relevant' &&
      (tx.amount ?? 0) >= 1000
  );
  const totalUnexplainedIncoming = unmatchedIncoming.reduce((s, tx) => s + (tx.amount ?? 0), 0);

  // Manual balances
  let supportedManual = 0;
  let unsupportedManual = 0;
  for (const mb of inputs.manualBalances) {
    const amt = mb.amount ?? 0;
    if (mb.counted_toward_proof) {
      if (mb.evidence_status !== 'unverified' && mb.attachment_name) {
        supportedManual += amt;
      } else {
        unsupportedManual += amt;
      }
    }
  }

  // Co-buyer & gift analysis
  let coBuyerEvidenced = 0;
  let coBuyerUnproven = 0;
  let giftsEvidenced = 0;
  let giftsUnproven = 0;

  for (const r of reconciliations) {
    const cat = r.sourceCategory.toLowerCase();
    if (cat.includes('co-buyer') || cat.includes('co_buyer') || cat.includes('joint')) {
      if (r.reconciliationStatus === 'fully_reconciled' || r.reconciliationStatus === 'partially_reconciled') {
        coBuyerEvidenced += r.supportedAmount;
      }
      coBuyerUnproven += r.unsupportedAmount;
    }
    if (cat.includes('gift')) {
      if (r.reconciliationStatus === 'fully_reconciled' || r.reconciliationStatus === 'partially_reconciled') {
        giftsEvidenced += r.supportedAmount;
      }
      giftsUnproven += r.unsupportedAmount;
    }
  }

  // Party-declared co-buyer contributions not in fund sources
  for (const party of inputs.parties) {
    if (party.role === 'co_buyer' && party.contribution_amount && party.contribution_amount > 0) {
      const hasMatchingSource = reconciliations.some(
        (r) => r.sourceCategory.toLowerCase().includes('co') && r.declaredAmount === party.contribution_amount
      );
      if (!hasMatchingSource) {
        coBuyerUnproven += party.contribution_amount;
      }
    }
  }

  // Factor in report header total_balance_available as secondary evidence
  const reportBalance = rh?.total_balance_available ?? 0;
  const totalAvailable = Math.max(totalEvidenced + supportedManual,
    reportBalance > 0 ? reportBalance : 0);
  const shortfallAmount = Math.max(0, amountToProve - totalAvailable);
  const excessAmount = Math.max(0, totalAvailable - amountToProve);

  // Determine if excess is explained
  const excessExplained = excessAmount > 0 && totalDeclaredNotEvidenced === 0 && totalUnexplainedIncoming === 0;

  // Overall confidence
  let overallConfidence: FundingConfidence = 'insufficient';
  if (amountToProve > 0) {
    const ratio = totalAvailable / amountToProve;
    if (ratio >= 0.95 && totalDeclaredNotEvidenced === 0) overallConfidence = 'high';
    else if (ratio >= 0.7) overallConfidence = 'medium';
    else if (ratio >= 0.3) overallConfidence = 'low';
  }

  return {
    amountToProve,
    totalEvidencedFunds: totalEvidenced,
    totalDeclaredNotEvidenced: totalDeclaredNotEvidenced,
    totalUnexplainedIncoming,
    supportedManualBalances: supportedManual,
    unsupportedManualBalances: unsupportedManual,
    coBuyerEvidenced,
    coBuyerUnproven,
    giftsEvidenced,
    giftsUnproven,
    hasShortfall: shortfallAmount > 0,
    shortfallAmount,
    hasExcess: excessAmount > 0,
    excessAmount,
    excessExplained,
    overallConfidence,
    sourceReconciliations: reconciliations,
    reportHeaderExcessShortfall: rh?.excess_shortfall ?? null,
  };
}
