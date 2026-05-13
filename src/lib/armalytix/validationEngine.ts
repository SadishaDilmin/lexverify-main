/**
 * Real-Case Validation Engine
 *
 * Pure-function module for building validation packs, comparing
 * system outputs against reviewer benchmarks, and capturing
 * structured feedback.
 *
 * No DB calls. No side-effects.
 */

import type { ExceptionItem, ExceptionType } from './exceptionEngine';
import type { FundingChainSummary, SourceReconciliation } from './reconciliationEngine';
import type { DraftEnquiry, EnquiryCategory } from './enquiryGenerator';
import type { GovernanceOutput, ClassifiedIssue } from './reviewerPolicyEngine';
import type { ReviewerSummary, AcceptedItem, UnresolvedItem } from './reviewerOutputBuilder';
import type { DecisionSupportOutput } from './decisionSupportEngine';
import type { FullAnalysisResult } from './contradictionDetector';

// ── Feedback types ───────────────────────────────────────────────

export const FEEDBACK_TYPES = [
  'should_have_raised',
  'should_not_have_raised',
  'enquiry_correct',
  'enquiry_too_weak',
  'enquiry_too_aggressive',
  'evidence_request_missing',
  'evidence_request_unnecessary',
  'blocker_correct',
  'should_not_be_blocker',
  'hybrid_handling_correct',
  'hybrid_handling_incorrect',
  'output_useful',
  'output_not_useful',
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  should_have_raised: 'Should have raised this issue',
  should_not_have_raised: 'Should not have raised this issue',
  enquiry_correct: 'Enquiry was correct',
  enquiry_too_weak: 'Enquiry was too weak',
  enquiry_too_aggressive: 'Enquiry was too aggressive',
  evidence_request_missing: 'Evidence request missing',
  evidence_request_unnecessary: 'Evidence request unnecessary',
  blocker_correct: 'Issue correctly treated as blocker',
  should_not_be_blocker: 'Issue should not have been blocker',
  hybrid_handling_correct: 'Hybrid handling was correct',
  hybrid_handling_incorrect: 'Hybrid handling was incorrect',
  output_useful: 'Overall output was useful',
  output_not_useful: 'Overall output was not useful',
};

// ── Pathway types ────────────────────────────────────────────────

export type ValidationPathway = 'armalytix' | 'hybrid' | 'non_armalytix';

export const PATHWAY_LABELS: Record<ValidationPathway, string> = {
  armalytix: 'Armalytix-led',
  hybrid: 'Mixed evidence (hybrid)',
  non_armalytix: 'Non-Armalytix',
};

// ── Validation run metadata ──────────────────────────────────────

export interface ValidationRunMetadata {
  caseId: string;
  caseReference: string;
  pathway: ValidationPathway;
  runDate: string;
  dataSourcesUsed: string[];
  isValidationMode: boolean;
}

// ── Funding overview ─────────────────────────────────────────────

export interface ValidationFundingOverview {
  amountToProve: number;
  totalEvidenced: number;
  totalPartiallySupported: number;
  totalUnsupported: number;
  shortfallAmount: number;
  excessAmount: number;
  hasShortfall: boolean;
  hasExcess: boolean;
  overallConfidence: string;
  sourceCount: number;
  fundingChainSummary: string;
}

export function buildFundingOverview(
  fundingChain: FundingChainSummary,
  reconciliations: SourceReconciliation[]
): ValidationFundingOverview {
  const partiallySupported = reconciliations
    .filter((r) => r.reconciliationStatus === 'partially_reconciled')
    .reduce((sum, r) => sum + r.supportedAmount, 0);

  const unsupported = reconciliations
    .filter(
      (r) =>
        r.reconciliationStatus === 'unreconciled' ||
        r.reconciliationStatus === 'contradicted'
    )
    .reduce((sum, r) => sum + r.declaredAmount, 0);

  const summaryParts: string[] = [];
  if (fundingChain.totalEvidencedFunds > 0)
    summaryParts.push(
      `£${fundingChain.totalEvidencedFunds.toLocaleString()} evidenced`
    );
  if (fundingChain.totalDeclaredNotEvidenced > 0)
    summaryParts.push(
      `£${fundingChain.totalDeclaredNotEvidenced.toLocaleString()} declared but not evidenced`
    );
  if (fundingChain.totalUnexplainedIncoming > 0)
    summaryParts.push(
      `£${fundingChain.totalUnexplainedIncoming.toLocaleString()} unexplained incoming`
    );

  return {
    amountToProve: fundingChain.amountToProve,
    totalEvidenced: fundingChain.totalEvidencedFunds,
    totalPartiallySupported: partiallySupported,
    totalUnsupported: unsupported,
    shortfallAmount: fundingChain.shortfallAmount,
    excessAmount: fundingChain.excessAmount,
    hasShortfall: fundingChain.hasShortfall,
    hasExcess: fundingChain.hasExcess,
    overallConfidence: fundingChain.overallConfidence,
    sourceCount: reconciliations.length,
    fundingChainSummary:
      summaryParts.length > 0
        ? summaryParts.join(' | ')
        : 'No funding data available',
  };
}

// ── Reviewer benchmark ───────────────────────────────────────────

export interface BenchmarkIssue {
  issueType: string;
  severity: string;
  notes?: string;
}

export interface BenchmarkEnquiry {
  category: string;
  mandatory: 'mandatory' | 'discretionary';
  notes?: string;
}

export interface ReviewerBenchmark {
  expectedIssues: BenchmarkIssue[];
  expectedEnquiries: BenchmarkEnquiry[];
  expectedBlockers: string[];
  adequatelySupported: string[];
  notes: string;
}

export function emptyBenchmark(): ReviewerBenchmark {
  return {
    expectedIssues: [],
    expectedEnquiries: [],
    expectedBlockers: [],
    adequatelySupported: [],
    notes: '',
  };
}

// ── Comparison result ────────────────────────────────────────────

export interface ComparisonMatch {
  type: string;
  label: string;
  humanExpected: boolean;
  systemRaised: boolean;
}

export interface TreatmentMismatch {
  issueType: string;
  humanExpected: string;
  systemActual: string;
}

export interface ValidationComparison {
  issueMatches: ComparisonMatch[];
  issueMisses: ComparisonMatch[];
  issueOverCalls: ComparisonMatch[];
  enquiryMatches: ComparisonMatch[];
  enquiryMisses: ComparisonMatch[];
  enquiryOverCalls: ComparisonMatch[];
  treatmentMismatches: TreatmentMismatch[];
  blockerMatches: string[];
  blockerMisses: string[];
  blockerOverCalls: string[];
  matchRate: number;
  missRate: number;
  overCallRate: number;
}

export function buildValidationComparison(
  benchmark: ReviewerBenchmark,
  actualExceptions: ExceptionItem[],
  actualEnquiries: DraftEnquiry[],
  governance: GovernanceOutput
): ValidationComparison {
  const actualIssueTypes = new Set(actualExceptions.map((e) => e.exceptionType));
  const expectedIssueTypes = new Set(benchmark.expectedIssues.map((i) => i.issueType));

  // Issue comparison
  const issueMatches: ComparisonMatch[] = [];
  const issueMisses: ComparisonMatch[] = [];
  const issueOverCalls: ComparisonMatch[] = [];

  for (const expected of benchmark.expectedIssues) {
    const match: ComparisonMatch = {
      type: expected.issueType,
      label: expected.issueType,
      humanExpected: true,
      systemRaised: actualIssueTypes.has(expected.issueType as ExceptionType),
    };
    if (match.systemRaised) {
      issueMatches.push(match);
    } else {
      issueMisses.push(match);
    }
  }

  for (const actual of actualExceptions) {
    if (!expectedIssueTypes.has(actual.exceptionType)) {
      issueOverCalls.push({
        type: actual.exceptionType,
        label: actual.rationale.substring(0, 100),
        humanExpected: false,
        systemRaised: true,
      });
    }
  }

  // Enquiry comparison
  const actualEnquiryCategories = new Set(actualEnquiries.map((e) => e.enquiryCategory));
  const expectedEnquiryCategories = new Set(
    benchmark.expectedEnquiries.map((e) => e.category)
  );

  const enquiryMatches: ComparisonMatch[] = [];
  const enquiryMisses: ComparisonMatch[] = [];
  const enquiryOverCalls: ComparisonMatch[] = [];

  for (const expected of benchmark.expectedEnquiries) {
    const raised = actualEnquiryCategories.has(expected.category as EnquiryCategory);
    const match: ComparisonMatch = {
      type: expected.category,
      label: expected.category,
      humanExpected: true,
      systemRaised: raised,
    };
    if (raised) {
      enquiryMatches.push(match);
    } else {
      enquiryMisses.push(match);
    }
  }

  for (const actual of actualEnquiries) {
    if (!expectedEnquiryCategories.has(actual.enquiryCategory)) {
      enquiryOverCalls.push({
        type: actual.enquiryCategory,
        label: actual.userFacingEnquiryText.substring(0, 100),
        humanExpected: false,
        systemRaised: true,
      });
    }
  }

  // Treatment mismatches
  const treatmentMismatches: TreatmentMismatch[] = [];
  for (const expected of benchmark.expectedEnquiries) {
    const actual = actualEnquiries.find(
      (e) => e.enquiryCategory === expected.category
    );
    if (actual && actual.mandatory !== expected.mandatory) {
      treatmentMismatches.push({
        issueType: expected.category,
        humanExpected: expected.mandatory,
        systemActual: actual.mandatory,
      });
    }
  }

  // Blocker comparison
  const actualBlockerTypes = new Set(
    governance.classifiedIssues
      .filter((i) => i.isBlocker)
      .map((i) => i.exception.exceptionType)
  );
  const expectedBlockerSet = new Set(benchmark.expectedBlockers);

  const blockerMatches = benchmark.expectedBlockers.filter((b) =>
    actualBlockerTypes.has(b as ExceptionType)
  );
  const blockerMisses = benchmark.expectedBlockers.filter(
    (b) => !actualBlockerTypes.has(b as ExceptionType)
  );
  const blockerOverCalls = [...actualBlockerTypes].filter(
    (b) => !expectedBlockerSet.has(b)
  );

  // Rates
  const totalExpected =
    benchmark.expectedIssues.length + benchmark.expectedEnquiries.length;
  const totalMatches = issueMatches.length + enquiryMatches.length;
  const totalMisses = issueMisses.length + enquiryMisses.length;
  const totalOverCalls = issueOverCalls.length + enquiryOverCalls.length;
  const denominator = Math.max(totalExpected, 1);

  return {
    issueMatches,
    issueMisses,
    issueOverCalls,
    enquiryMatches,
    enquiryMisses,
    enquiryOverCalls,
    treatmentMismatches,
    blockerMatches,
    blockerMisses,
    blockerOverCalls,
    matchRate: totalMatches / denominator,
    missRate: totalMisses / denominator,
    overCallRate:
      totalOverCalls / Math.max(totalMatches + totalOverCalls, 1),
  };
}

// ── Pathway validation checks ────────────────────────────────────

export interface PathwayCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export function buildPathwayChecks(
  pathway: ValidationPathway,
  result: FullAnalysisResult
): PathwayCheck[] {
  const checks: PathwayCheck[] = [];

  if (pathway === 'armalytix' || pathway === 'hybrid') {
    const hasTxs = result.classifiedTransactions.length > 0;
    checks.push({
      check: 'Structured Armalytix outputs used',
      passed: hasTxs,
      detail: hasTxs
        ? `${result.classifiedTransactions.length} transactions classified`
        : 'No structured transactions found — pipeline may not have Armalytix data',
    });

    const hasRecon = result.sourceReconciliations.length > 0;
    checks.push({
      check: 'Declaration vs evidence distinguished',
      passed: hasRecon,
      detail: hasRecon
        ? `${result.sourceReconciliations.length} sources reconciled with verification status tracking`
        : 'No source reconciliations produced',
    });

    const hasUnmatched = result.matchResult.unmatched.length > 0;
    const hasExceptions = result.exceptions.length > 0;
    checks.push({
      check: 'Transaction-level issues surfaced',
      passed: hasUnmatched || hasExceptions,
      detail: `${result.matchResult.unmatched.length} unmatched transactions, ${result.exceptions.length} exceptions raised`,
    });
  }

  if (pathway === 'hybrid') {
    const reconCategories = new Set(
      result.sourceReconciliations.map((r) => r.sourceCategory)
    );
    const hasMultipleSources = reconCategories.size >= 2;
    checks.push({
      check: 'Multiple evidence sources combined',
      passed: hasMultipleSources,
      detail: hasMultipleSources
        ? `Sources: ${[...reconCategories].join(', ')}`
        : 'Only one source category detected — may not be truly hybrid',
    });

    checks.push({
      check: 'Coherent whole-case funding chain',
      passed: result.fundingChain.amountToProve > 0,
      detail: `Amount to prove: £${result.fundingChain.amountToProve.toLocaleString()}, total evidenced: £${result.fundingChain.totalEvidencedFunds.toLocaleString()}`,
    });
  }

  if (pathway === 'non_armalytix') {
    const hasNoTxs = result.classifiedTransactions.length === 0;
    checks.push({
      check: 'No reliance on Armalytix assumptions',
      passed: hasNoTxs,
      detail: hasNoTxs
        ? 'Correctly operating without Armalytix transaction data'
        : `${result.classifiedTransactions.length} transactions found — unexpected for non-Armalytix pathway`,
    });

    checks.push({
      check: 'Evidence-based review performed',
      passed: result.exceptions.length > 0 || result.sourceReconciliations.length > 0,
      detail: `${result.exceptions.length} exceptions, ${result.sourceReconciliations.length} reconciliations`,
    });
  }

  // Universal checks
  checks.push({
    check: 'Enquiry generation produced outputs',
    passed: result.draftEnquiries.length > 0,
    detail: `${result.draftEnquiries.length} draft enquiries generated`,
  });

  checks.push({
    check: 'Governance output produced',
    passed: result.decisionSupport.governance.classifiedIssues.length >= 0,
    detail: `Blocker status: ${result.decisionSupport.governance.blockerStatus}, ${result.decisionSupport.governance.classifiedIssues.length} classified issues`,
  });

  return checks;
}

// ── Feedback item ────────────────────────────────────────────────

export interface FeedbackItem {
  id: string;
  targetRef: string;
  targetType: 'issue' | 'enquiry' | 'blocker' | 'overall';
  feedbackType: FeedbackType;
  notes: string;
}

// ── Full validation pack ─────────────────────────────────────────

export interface ValidationPack {
  metadata: ValidationRunMetadata;
  fundingOverview: ValidationFundingOverview;
  supportedItems: AcceptedItem[];
  unresolvedItems: UnresolvedItem[];
  draftEnquiries: DraftEnquiry[];
  governanceOutput: GovernanceOutput;
  signOffSupport: DecisionSupportOutput['signOff'];
  pathwayChecks: PathwayCheck[];
  benchmark: ReviewerBenchmark | null;
  comparison: ValidationComparison | null;
  feedbackItems: FeedbackItem[];
  overallUseful: boolean | null;
}

export function buildValidationPack(
  metadata: ValidationRunMetadata,
  result: FullAnalysisResult,
  benchmark?: ReviewerBenchmark,
  feedbackItems?: FeedbackItem[],
  overallUseful?: boolean | null
): ValidationPack {
  const fundingOverview = buildFundingOverview(
    result.fundingChain,
    result.sourceReconciliations
  );

  const pathwayChecks = buildPathwayChecks(metadata.pathway, result);

  let comparison: ValidationComparison | null = null;
  if (benchmark && benchmark.expectedIssues.length > 0) {
    comparison = buildValidationComparison(
      benchmark,
      result.exceptions,
      result.draftEnquiries,
      result.decisionSupport.governance
    );
  }

  return {
    metadata,
    fundingOverview,
    supportedItems: result.reviewerSummary.accepted,
    unresolvedItems: result.reviewerSummary.unresolved,
    draftEnquiries: result.draftEnquiries,
    governanceOutput: result.decisionSupport.governance,
    signOffSupport: result.decisionSupport.signOff,
    pathwayChecks,
    benchmark: benchmark ?? null,
    comparison,
    feedbackItems: feedbackItems ?? [],
    overallUseful: overallUseful ?? null,
  };
}

// ── Detect data sources ──────────────────────────────────────────

export function detectDataSources(result: FullAnalysisResult): string[] {
  const sources: string[] = [];
  if (result.classifiedTransactions.length > 0) sources.push('Armalytix / Open Banking');
  if (result.sourceReconciliations.some((r) => r.linkedBalancesCount > 0))
    sources.push('Manual balances');
  if (result.sourceReconciliations.some((r) => r.linkedEvidenceCount > 0))
    sources.push('Evidence documents');
  if (result.fundingChain.giftsEvidenced > 0 || result.fundingChain.giftsUnproven > 0)
    sources.push('Gift declarations');
  if (result.fundingChain.coBuyerEvidenced > 0 || result.fundingChain.coBuyerUnproven > 0)
    sources.push('Co-buyer contributions');
  if (sources.length === 0) sources.push('Case metadata only');
  return sources;
}
