/**
 * QA Evaluator — Compares FullAnalysisResult against QATestCase expected outputs
 *
 * Computes precision, recall, duplicate rates, false negatives/positives.
 */

import type { FullAnalysisResult } from '../contradictionDetector';
import type {
  QATestCase,
  QAEvaluation,
  QAScores,
  FalseNegativeItem,
  FalsePositiveItem,
  DuplicateGroup,
  OverEscalation,
  UnderEscalation,
} from './qaTypes';

/**
 * Evaluate a single test case against actual pipeline results.
 */
export function evaluateTestCase(
  fixture: QATestCase,
  result: FullAnalysisResult
): QAEvaluation {
  const { expected } = fixture;

  // ── Issue recall: expected exception types that appeared ─────
  const actualExceptionTypes = new Set(result.exceptions.map((e) => e.exceptionType));
  const expectedHits = expected.exceptionTypes.filter((t) => actualExceptionTypes.has(t));
  const issueRecall =
    expected.exceptionTypes.length > 0
      ? expectedHits.length / expected.exceptionTypes.length
      : 1;

  // ── Issue precision: exceptions not in absentExceptionTypes ──
  const absentSet = new Set(expected.absentExceptionTypes);
  const relevantExceptions = result.exceptions.filter(
    (e) => !absentSet.has(e.exceptionType)
  );
  const issuePrecision =
    result.exceptions.length > 0
      ? relevantExceptions.length / result.exceptions.length
      : 1;

  // ── Enquiry recall ──────────────────────────────────────────
  const actualEnquiryCategories = new Set(
    result.draftEnquiries.map((e) => e.enquiryCategory)
  );
  const mandatoryHits = expected.mandatoryEnquiryCategories.filter((c) =>
    actualEnquiryCategories.has(c)
  );
  const totalExpectedEnquiries =
    expected.mandatoryEnquiryCategories.length +
    expected.discretionaryEnquiryCategories.length;
  const discretionaryHits = expected.discretionaryEnquiryCategories.filter((c) =>
    actualEnquiryCategories.has(c)
  );
  const enquiryRecall =
    totalExpectedEnquiries > 0
      ? (mandatoryHits.length + discretionaryHits.length) / totalExpectedEnquiries
      : 1;

  // ── Enquiry precision ───────────────────────────────────────
  const noEnquirySet = new Set(expected.noEnquiryCategories);
  const badEnquiries = result.draftEnquiries.filter((e) =>
    noEnquirySet.has(e.enquiryCategory)
  );
  const enquiryPrecision =
    result.draftEnquiries.length > 0
      ? (result.draftEnquiries.length - badEnquiries.length) /
        result.draftEnquiries.length
      : 1;

  // ── Duplicate enquiry rate ──────────────────────────────────
  const mergeGroups = new Map<string, typeof result.draftEnquiries>();
  for (const eq of result.draftEnquiries) {
    const key = eq.mergeGroupKey;
    if (!mergeGroups.has(key)) mergeGroups.set(key, []);
    mergeGroups.get(key)!.push(eq);
  }
  const duplicateGroups: DuplicateGroup[] = [];
  let totalDuplicates = 0;
  for (const [key, group] of mergeGroups) {
    if (group.length > 1) {
      totalDuplicates += group.length - 1;
      duplicateGroups.push({
        mergeGroupKey: key,
        enquiryCount: group.length,
        categories: group.map((g) => g.enquiryCategory),
      });
    }
  }
  const duplicateEnquiryRate =
    result.draftEnquiries.length > 0
      ? totalDuplicates / result.draftEnquiries.length
      : 0;

  // ── Unsupported conclusion rate ─────────────────────────────
  const reconciledSources = result.sourceReconciliations.filter(
    (r) => r.reconciliationStatus === 'fully_reconciled'
  );
  const expectedExceptionSourceIds = new Set(
    expected.supportedSources.map((s) => s.sourceId)
  );
  const wronglyReconciled = reconciledSources.filter(
    (r) =>
      !expectedExceptionSourceIds.has(r.fundSourceId) &&
      expected.exceptionTypes.some(
        (et) =>
          et === 'amount_mismatch_declaration_vs_evidence' ||
          et === 'source_timing_mismatch'
      )
  );
  const unsupportedConclusionRate =
    reconciledSources.length > 0
      ? wronglyReconciled.length / reconciledSources.length
      : 0;

  // ── Unresolved visibility ───────────────────────────────────
  const unresolvedCount = result.reviewerSummary.unresolvedCount;
  const expectedUnresolved = expected.exceptionTypes.length;
  const unresolvedVisibility =
    expectedUnresolved > 0
      ? Math.min(1, unresolvedCount / expectedUnresolved)
      : 1;

  // ── Pathway correctness ─────────────────────────────────────
  const hasArmalytixData = fixture.inputs.reportHeader !== null;
  const hasNonArmalytix =
    fixture.inputs.manualBalances.length > 0 ||
    fixture.inputs.fundSources.some((fs) => fs.outside_uk);
  let inferredPathway: 'armalytix' | 'standard' | 'hybrid';
  if (hasArmalytixData && hasNonArmalytix) inferredPathway = 'hybrid';
  else if (hasArmalytixData) inferredPathway = 'armalytix';
  else inferredPathway = 'standard';
  const pathwayCorrect = inferredPathway === fixture.expectedPathway;

  // ── False negatives ─────────────────────────────────────────
  const falseNegatives: FalseNegativeItem[] = expected.exceptionTypes
    .filter((t) => !actualExceptionTypes.has(t))
    .map((t) => ({
      expectedExceptionType: t,
      fixtureId: fixture.id,
      notes: `Expected exception "${t}" was not raised by the pipeline.`,
    }));

  // ── False positives ─────────────────────────────────────────
  const falsePositives: FalsePositiveItem[] = result.exceptions
    .filter((e) => absentSet.has(e.exceptionType))
    .map((e) => ({
      raisedExceptionType: e.exceptionType,
      fixtureId: fixture.id,
      notes: `Exception "${e.exceptionType}" was raised but expected to be absent.`,
    }));

  // ── Over/under escalations ──────────────────────────────────
  const overEscalations: OverEscalation[] = [];
  const underEscalations: UnderEscalation[] = [];

  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 };
  for (const exc of result.exceptions) {
    if (absentSet.has(exc.exceptionType)) {
      overEscalations.push({
        exceptionType: exc.exceptionType,
        raisedSeverity: exc.severity,
        reasoning: `Should not have been raised at all.`,
      });
    }
  }

  const scores: QAScores = {
    issueRecall,
    issuePrecision,
    enquiryRecall,
    enquiryPrecision,
    duplicateEnquiryRate,
    unsupportedConclusionRate,
    unresolvedVisibility,
    pathwayCorrect,
  };

  return {
    fixtureId: fixture.id,
    scores,
    falseNegatives,
    falsePositives,
    duplicateEnquiries: duplicateGroups,
    overEscalations,
    underEscalations,
  };
}

/**
 * Check if a QA evaluation passes minimum thresholds.
 */
export function evaluationPasses(
  evaluation: QAEvaluation,
  thresholds = {
    minIssueRecall: 0.8,
    minIssuePrecision: 0.7,
    minEnquiryRecall: 0.75,
    maxDuplicateRate: 0.2,
  }
): boolean {
  const { scores } = evaluation;
  return (
    scores.issueRecall >= thresholds.minIssueRecall &&
    scores.issuePrecision >= thresholds.minIssuePrecision &&
    scores.enquiryRecall >= thresholds.minEnquiryRecall &&
    scores.duplicateEnquiryRate <= thresholds.maxDuplicateRate &&
    scores.pathwayCorrect
  );
}
